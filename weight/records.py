#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""体重测量记录与成员档案存储。

体重秤只有一个用户槽位，也无法回传「这次是谁称的」，因此历史记录与
归属关系必须由本地维护。本模块负责：

- 每次稳定称重建档（同一称重会话的重复稳定帧合并为一条记录）；
- 成员档案（姓名、身高、年龄、性别、配色）的增删改；
- 手动把记录归属到某个成员，并按该成员资料重新估算体成分；
- 以 JSON 文件持久化，服务重启后记录不丢失。
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

from .body_composition import calculate

# 保留的最大记录条数
MAX_RECORDS = 200
# 下发给页面的记录条数
STATE_RECORDS = 40
# 同一称重会话的合并时间窗口（毫秒）
SESSION_GAP_MS = 90_000
# 同一会话内视为同一重量的克数容差
SAME_WEIGHT_GRAMS = 20
# 成员配色，按创建顺序循环取用
PALETTE = (
    "#00e5c0",
    "#38bdf8",
    "#a78bfa",
    "#f59e0b",
    "#f472b6",
    "#84cc16",
    "#fb7185",
    "#22d3ee",
)


def _normalize_sex(sex: Any) -> str:
    """把性别入参归一化为 male / female。

    Args:
        sex: 任意性别表示。

    Returns:
        规范化的性別字符串。
    """
    return "female" if str(sex).lower() == "female" else "male"


class WeightStore:
    """测量记录与成员档案的本地存储。"""

    def __init__(
        self,
        path: str | Path,
        default_height_cm: int = 173,
        default_age: int = 25,
        default_sex: str = "male",
    ) -> None:
        """初始化存储并读取已有数据。

        Args:
            path: JSON 持久化文件路径。
            default_height_cm: 无数据时首个成员的身高（厘米）。
            default_age: 无数据时首个成员的年龄（岁）。
            default_sex: 无数据时首个成员的性别。
        """
        self._path = Path(path)
        self.version = 0
        self.users: list[dict[str, Any]] = []
        self.records: list[dict[str, Any]] = []
        self._load(default_height_cm, default_age, default_sex)

    # ---------------- 持久化 ----------------

    def _load(self, height_cm: int, age: int, sex: str) -> None:
        """从磁盘读取成员与记录；文件不存在时创建默认成员。

        Args:
            height_cm: 默认成员身高（厘米）。
            age: 默认成员年龄（岁）。
            sex: 默认成员性别。
        """
        if self._path.exists():
            try:
                data = json.loads(self._path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                logging.warning("读取体重记录文件失败：%s", self._path, exc_info=True)
                data = {}
            self.users = [
                user
                for user in data.get("users", [])
                if isinstance(user, dict) and user.get("id")
            ]
            self.records = [
                record
                for record in data.get("records", [])
                if isinstance(record, dict) and record.get("id")
            ]
            self.version = int(data.get("version", 0))
        if not self.users:
            self.users.append(self._build_user("我", height_cm, age, sex))
            self._save()

    def _save(self) -> None:
        """把当前数据原子写入 JSON 文件。"""
        payload = {
            "version": self.version,
            "users": self.users,
            "records": self.records,
        }
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            temp = self._path.with_suffix(self._path.suffix + ".tmp")
            temp.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            os.replace(temp, self._path)
        except OSError:
            logging.warning("保存体重记录文件失败：%s", self._path, exc_info=True)

    def _touch(self) -> None:
        """标记数据变更：递增版本号并落盘。"""
        self.version += 1
        self._save()

    # ---------------- 查询 ----------------

    def state(self) -> dict[str, Any]:
        """生成下发给页面的状态快照。

        Returns:
            含版本号、成员列表与最近记录的可序列化字典。
        """
        return {
            "version": self.version,
            "users": self.users[:],
            "records": self.records[:STATE_RECORDS],
        }

    def get_user(self, user_id: str | None) -> dict[str, Any] | None:
        """按 ID 查找成员。

        Args:
            user_id: 成员 ID。

        Returns:
            成员字典；不存在时返回 None。
        """
        if not user_id:
            return None
        return next((user for user in self.users if user["id"] == user_id), None)

    def get_record(self, record_id: str | None) -> dict[str, Any] | None:
        """按 ID 查找记录。

        Args:
            record_id: 记录 ID。

        Returns:
            记录字典；不存在时返回 None。
        """
        if not record_id:
            return None
        return next((record for record in self.records if record["id"] == record_id), None)

    def active_profile(self) -> dict[str, Any]:
        """取当前应下发给秤的资料。

        优先使用最近一次被归属记录的成员，否则回退到第一个成员；
        该资料只用于让秤使能阻抗测量，体成分仍以归属成员资料本地重算。

        Returns:
            含 height_cm / age / sex 的字典。
        """
        for record in self.records:
            user = self.get_user(record.get("user_id"))
            if user is not None:
                return {
                    "height_cm": int(user["height_cm"]),
                    "age": int(user["age"]),
                    "sex": user["sex"],
                }
        if self.users:
            user = self.users[0]
            return {
                "height_cm": int(user["height_cm"]),
                "age": int(user["age"]),
                "sex": user["sex"],
            }
        return {"height_cm": 173, "age": 25, "sex": "male"}

    # ---------------- 成员档案 ----------------

    def _build_user(
        self, name: str, height_cm: int, age: int, sex: str
    ) -> dict[str, Any]:
        """构造一个成员字典。

        Args:
            name: 成员姓名。
            height_cm: 身高（厘米）。
            age: 年龄（岁）。
            sex: 性别。

        Returns:
            新的成员字典。
        """
        color = PALETTE[len(self.users) % len(PALETTE)]
        return {
            "id": f"u_{uuid.uuid4().hex[:8]}",
            "name": name,
            "height_cm": int(height_cm),
            "age": int(age),
            "sex": _normalize_sex(sex),
            "color": color,
            "created": round(time.time() * 1000),
        }

    def add_user(self, name: str, height_cm: int, age: int, sex: str) -> dict[str, Any]:
        """新增成员。

        Args:
            name: 成员姓名。
            height_cm: 身高（厘米）。
            age: 年龄（岁）。
            sex: 性别。

        Returns:
            新增的成员字典。
        """
        user = self._build_user(name.strip() or "未命名", height_cm, age, sex)
        self.users.append(user)
        self._touch()
        return user

    def update_user(self, user_id: str, **fields: Any) -> dict[str, Any] | None:
        """更新成员资料，并重算其名下记录的体成分。

        Args:
            user_id: 成员 ID。
            **fields: 需要更新的字段（name / height_cm / age / sex）。

        Returns:
            更新后的成员字典；成员不存在时返回 None。
        """
        user = self.get_user(user_id)
        if user is None:
            return None
        if fields.get("name"):
            user["name"] = str(fields["name"]).strip() or user["name"]
        if fields.get("height_cm"):
            user["height_cm"] = int(fields["height_cm"])
        if fields.get("age"):
            user["age"] = int(fields["age"])
        if fields.get("sex"):
            user["sex"] = _normalize_sex(fields["sex"])
        for record in self.records:
            if record.get("user_id") == user_id:
                self._recompute_record(record)
        self._touch()
        return user

    def delete_user(self, user_id: str) -> tuple[bool, str]:
        """删除成员；名下仍有记录时拒绝删除。

        Args:
            user_id: 成员 ID。

        Returns:
            (是否删除成功, 失败原因)。
        """
        if not any(record.get("user_id") == user_id for record in self.records):
            before = len(self.users)
            self.users = [user for user in self.users if user["id"] != user_id]
            if len(self.users) != before:
                self._touch()
                return True, ""
        return False, "该成员名下还有测量记录，请先把记录归属到其他成员。"

    # ---------------- 记录 ----------------

    def _recompute_record(self, record: dict[str, Any]) -> None:
        """按记录当前归属成员的资料重算体成分。

        Args:
            record: 需要就地更新的记录字典。
        """
        user = self.get_user(record.get("user_id"))
        impedance = record.get("impedance")
        if user is None:
            record["user_name"] = None
            record["profile"] = None
            record["body"] = None
            return
        record["user_name"] = user["name"]
        if not impedance:
            record["profile"] = None
            record["body"] = None
            return
        record["profile"] = {
            "height_cm": int(user["height_cm"]),
            "age": int(user["age"]),
            "sex": user["sex"],
        }
        record["body"] = calculate(
            weight_kg=float(record["kg"]),
            impedance_ohm=float(impedance),
            height_cm=float(user["height_cm"]),
            age=int(user["age"]),
            is_male=user["sex"] == "male",
        )

    def add_measurement(self, event: dict[str, Any]) -> dict[str, Any] | None:
        """把一次稳定测量写入记录列表。

        同一称重会话（相同 session 且在时间窗口内、重量基本一致）的重复
        稳定帧会合并到同一条记录；后续到达的阻抗帧会补全该记录的体成分。

        Args:
            event: 秤读取器推送的测量事件。

        Returns:
            对应的记录字典；非稳定测量时返回 None。
        """
        if not event or not event.get("stable"):
            return None
        ts = int(event.get("ts") or round(time.time() * 1000))
        grams = int(event.get("grams") or 0)
        impedance = float(event["impedance"]) if event.get("impedance") else None
        last = self.records[0] if self.records else None
        if last is not None:
            same_session = (
                last.get("session") == event.get("session")
                and ts - int(last.get("ts") or 0) <= SESSION_GAP_MS
            )
            if same_session and abs(int(last.get("grams") or 0) - grams) <= SAME_WEIGHT_GRAMS:
                if impedance and not last.get("impedance"):
                    last["impedance"] = impedance
                    last["impedances"] = list(event.get("impedances") or [])
                    last["ts"] = ts
                    self._recompute_record(last)
                    self._touch()
                return last
        record: dict[str, Any] = {
            "id": f"r_{uuid.uuid4().hex[:8]}",
            "session": event.get("session"),
            "ts": ts,
            "kg": float(event.get("kg") or 0),
            "grams": grams,
            "stable": True,
            "impedance": impedance,
            "impedances": list(event.get("impedances") or []),
            "device": event.get("device") or "",
            "address": event.get("address") or "",
            "user_id": None,
            "user_name": None,
            "profile": None,
            "body": None,
        }
        self.records.insert(0, record)
        del self.records[MAX_RECORDS:]
        self._touch()
        return record

    def assign(self, record_id: str, user_id: str | None) -> dict[str, Any] | None:
        """把记录归属到指定成员（或取消归属）。

        Args:
            record_id: 记录 ID。
            user_id: 成员 ID；传 None 表示取消归属。

        Returns:
            更新后的记录字典；记录或成员不存在时返回 None。
        """
        record = self.get_record(record_id)
        if record is None:
            return None
        if user_id and self.get_user(user_id) is None:
            return None
        record["user_id"] = user_id or None
        self._recompute_record(record)
        self._touch()
        return record

    def delete_record(self, record_id: str) -> bool:
        """删除一条测量记录。

        Args:
            record_id: 记录 ID。

        Returns:
            是否删除成功。
        """
        before = len(self.records)
        self.records = [record for record in self.records if record["id"] != record_id]
        if len(self.records) == before:
            return False
        self._touch()
        return True
