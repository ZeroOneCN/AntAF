#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""SQLite 数据层。

替代原来的 JSON 文件存储，提供成员档案与测量记录的持久化。
首次运行时自动从 weight_store.json 迁移数据（如果存在）。
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any

from .body_composition import calculate

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

# 保留的最大记录条数
MAX_RECORDS = 200
# 下发给页面的记录条数
STATE_RECORDS = 40
# 同一称重会话的合并时间窗口（毫秒）
SESSION_GAP_MS = 90_000
# 同一会话内视为同一重量的克数容差
SAME_WEIGHT_GRAMS = 20


def _normalize_sex(sex: Any) -> str:
    return "female" if str(sex).lower() == "female" else "male"


class Database:
    """SQLite 数据层。"""

    def __init__(
        self,
        db_path: str | Path,
        default_height_cm: int = 173,
        default_age: int = 25,
        default_sex: str = "male",
        json_path: str | Path | None = None,
    ) -> None:
        self._path = Path(db_path)
        self._json_path = Path(json_path) if json_path else None
        self.version = 0
        self._conn = sqlite3.connect(str(self._path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._init_tables()
        self._migrate_from_json(default_height_cm, default_age, default_sex)
        self._refit_body_precision()

    def _init_tables(self) -> None:
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                height_cm INTEGER NOT NULL,
                age INTEGER NOT NULL,
                sex TEXT NOT NULL,
                color TEXT NOT NULL,
                created INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY,
                session INTEGER,
                ts INTEGER NOT NULL,
                kg REAL NOT NULL,
                grams INTEGER NOT NULL,
                stable INTEGER NOT NULL,
                impedance REAL,
                impedances TEXT,
                device TEXT,
                address TEXT,
                user_id TEXT,
                user_name TEXT,
                profile TEXT,
                body TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
            CREATE INDEX IF NOT EXISTS idx_records_ts ON records(ts DESC);
            CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id);
            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)
        self._conn.commit()

    def _refit_body_precision(self) -> None:
        row = self._conn.execute(
            "SELECT value FROM meta WHERE key='body_precision'"
        ).fetchone()
        if row and row["value"] == "2":
            return
        rows = self._conn.execute(
            "SELECT * FROM records WHERE user_id IS NOT NULL AND impedance IS NOT NULL"
        ).fetchall()
        for row in rows:
            self._recompute_record(dict(row))
        self._conn.execute(
            "INSERT OR REPLACE INTO meta(key, value) VALUES('body_precision', '2')"
        )
        self._conn.commit()

    def _migrate_from_json(self, height_cm: int, age: int, sex: str) -> None:
        if not self._json_path or not self._json_path.exists():
            if not self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
                self._create_default_user(height_cm, age, sex)
            return
        try:
            data = json.loads(self._json_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logging.warning("读取 JSON 文件失败：%s", self._json_path)
            return
        if data.get("users"):
            for user in data["users"]:
                if not user.get("id"):
                    continue
                self._conn.execute(
                    "INSERT OR IGNORE INTO users VALUES (?,?,?,?,?,?,?)",
                    (user["id"], user["name"], user["height_cm"], user["age"],
                     user["sex"], user["color"], user["created"]),
                )
        if data.get("records"):
            for rec in data["records"]:
                if not rec.get("id"):
                    continue
                self._conn.execute(
                    """INSERT OR IGNORE INTO records
                       (id,session,ts,kg,grams,stable,impedance,impedances,device,address,
                        user_id,user_name,profile,body)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (rec["id"], rec.get("session"), rec["ts"], rec["kg"], rec["grams"],
                     int(rec["stable"]), rec.get("impedance"),
                     json.dumps(rec.get("impedances") or []),
                     rec.get("device", ""), rec.get("address", ""),
                     rec.get("user_id"), rec.get("user_name"),
                     json.dumps(rec["profile"]) if rec.get("profile") else None,
                     json.dumps(rec["body"]) if rec.get("body") else None),
                )
        self.version = int(data.get("version", 0))
        self._conn.commit()
        if not self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]:
            self._create_default_user(height_cm, age, sex)

    def _create_default_user(self, height_cm: int, age: int, sex: str) -> None:
        user = self._build_user("我", height_cm, age, sex)
        self._conn.execute(
            "INSERT INTO users VALUES (?,?,?,?,?,?,?)",
            (user["id"], user["name"], user["height_cm"], user["age"],
             user["sex"], user["color"], user["created"]),
        )
        self._touch()

    def _build_user(self, name: str, height_cm: int, age: int, sex: str) -> dict[str, Any]:
        count = self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        color = PALETTE[count % len(PALETTE)]
        return {
            "id": f"u_{uuid.uuid4().hex[:8]}",
            "name": name,
            "height_cm": int(height_cm),
            "age": int(age),
            "sex": _normalize_sex(sex),
            "color": color,
            "created": round(time.time() * 1000),
        }

    def _touch(self) -> None:
        self.version += 1

    def close(self) -> None:
        self._conn.close()

    # ---------------- 查询 ----------------

    def state(self) -> dict[str, Any]:
        users = [dict(row) for row in self._conn.execute("SELECT * FROM users").fetchall()]
        records = [
            {**dict(row), "impedances": json.loads(row["impedances"]) if row["impedances"] else [],
             "profile": json.loads(row["profile"]) if row["profile"] else None,
             "body": json.loads(row["body"]) if row["body"] else None}
            for row in self._conn.execute(
                "SELECT * FROM records ORDER BY ts DESC LIMIT ?", (STATE_RECORDS,)
            ).fetchall()
        ]
        return {"version": self.version, "users": users, "records": records}

    def get_user(self, user_id: str | None) -> dict[str, Any] | None:
        if not user_id:
            return None
        row = self._conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None

    def get_record(self, record_id: str | None) -> dict[str, Any] | None:
        if not record_id:
            return None
        row = self._conn.execute("SELECT * FROM records WHERE id=?", (record_id,)).fetchone()
        if not row:
            return None
        return {
            **dict(row),
            "impedances": json.loads(row["impedances"]) if row["impedances"] else [],
            "profile": json.loads(row["profile"]) if row["profile"] else None,
            "body": json.loads(row["body"]) if row["body"] else None,
        }

    def active_profile(self) -> dict[str, Any]:
        row = self._conn.execute(
            """SELECT u.height_cm, u.age, u.sex FROM records r
               JOIN users u ON r.user_id = u.id
               ORDER BY r.ts DESC LIMIT 1"""
        ).fetchone()
        if row:
            return {"height_cm": int(row["height_cm"]), "age": int(row["age"]), "sex": row["sex"]}
        row = self._conn.execute("SELECT height_cm, age, sex FROM users LIMIT 1").fetchone()
        if row:
            return {"height_cm": int(row["height_cm"]), "age": int(row["age"]), "sex": row["sex"]}
        return {"height_cm": 173, "age": 25, "sex": "male"}

    # ---------------- 成员档案 ----------------

    def add_user(self, name: str, height_cm: int, age: int, sex: str) -> dict[str, Any]:
        user = self._build_user(name.strip() or "未命名", height_cm, age, sex)
        self._conn.execute(
            "INSERT INTO users VALUES (?,?,?,?,?,?,?)",
            (user["id"], user["name"], user["height_cm"], user["age"],
             user["sex"], user["color"], user["created"]),
        )
        self._touch()
        self._conn.commit()
        return user

    def update_user(self, user_id: str, **fields: Any) -> dict[str, Any] | None:
        user = self.get_user(user_id)
        if user is None:
            return None
        sets = []
        vals = []
        if fields.get("name"):
            sets.append("name=?")
            vals.append(str(fields["name"]).strip() or user["name"])
        if fields.get("height_cm"):
            sets.append("height_cm=?")
            vals.append(int(fields["height_cm"]))
        if fields.get("age"):
            sets.append("age=?")
            vals.append(int(fields["age"]))
        if fields.get("sex"):
            sets.append("sex=?")
            vals.append(_normalize_sex(fields["sex"]))
        if sets:
            vals.append(user_id)
            self._conn.execute(f"UPDATE users SET {','.join(sets)} WHERE id=?", vals)
            self._recompute_records_for_user(user_id)
            self._touch()
            self._conn.commit()
        return self.get_user(user_id)

    def delete_user(self, user_id: str) -> tuple[bool, str]:
        count = self._conn.execute(
            "SELECT COUNT(*) FROM records WHERE user_id=?", (user_id,)
        ).fetchone()[0]
        if count:
            return False, "该成员名下还有测量记录，请先把记录归属到其他成员。"
        self._conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        self._touch()
        self._conn.commit()
        return True, ""

    # ---------------- 记录 ----------------

    def _recompute_record(self, record: dict[str, Any]) -> None:
        user = self.get_user(record.get("user_id"))
        impedance = record.get("impedance")
        if user is None:
            self._conn.execute(
                "UPDATE records SET user_name=?, profile=?, body=? WHERE id=?",
                (None, None, None, record["id"]),
            )
            return
        if not impedance:
            self._conn.execute(
                "UPDATE records SET user_name=?, profile=?, body=? WHERE id=?",
                (user["name"], None, None, record["id"]),
            )
            return
        profile = {"height_cm": int(user["height_cm"]), "age": int(user["age"]), "sex": user["sex"]}
        body = calculate(
            weight_kg=float(record["kg"]),
            impedance_ohm=float(impedance),
            height_cm=float(user["height_cm"]),
            age=int(user["age"]),
            is_male=user["sex"] == "male",
        )
        self._conn.execute(
            "UPDATE records SET user_name=?, profile=?, body=? WHERE id=?",
            (user["name"], json.dumps(profile), json.dumps(body), record["id"]),
        )

    def _recompute_records_for_user(self, user_id: str) -> None:
        rows = self._conn.execute(
            "SELECT * FROM records WHERE user_id=?", (user_id,)
        ).fetchall()
        for row in rows:
            rec = {
                **dict(row),
                "impedances": json.loads(row["impedances"]) if row["impedances"] else [],
                "profile": json.loads(row["profile"]) if row["profile"] else None,
                "body": json.loads(row["body"]) if row["body"] else None,
            }
            self._recompute_record(rec)
        self._conn.commit()

    def add_measurement(self, event: dict[str, Any]) -> dict[str, Any] | None:
        if not event or not event.get("stable"):
            return None
        ts = int(event.get("ts") or round(time.time() * 1000))
        grams = int(event.get("grams") or 0)
        impedance = float(event["impedance"]) if event.get("impedance") else None
        last = self._conn.execute(
            "SELECT * FROM records ORDER BY ts DESC LIMIT 1"
        ).fetchone()
        if last:
            last = {
                **dict(last),
                "impedances": json.loads(last["impedances"]) if last["impedances"] else [],
            }
            same_session = (
                last.get("session") == event.get("session")
                and ts - int(last.get("ts") or 0) <= SESSION_GAP_MS
            )
            if same_session and abs(int(last.get("grams") or 0) - grams) <= SAME_WEIGHT_GRAMS:
                if impedance and not last.get("impedance"):
                    self._conn.execute(
                        """UPDATE records SET impedance=?, impedances=?, ts=? WHERE id=?""",
                        (impedance, json.dumps(event.get("impedances") or []), ts, last["id"]),
                    )
                    self._recompute_record({**last, "impedance": impedance})
                    self._touch()
                    self._conn.commit()
                    return self.get_record(last["id"])
                return self.get_record(last["id"])
        record_id = f"r_{uuid.uuid4().hex[:8]}"
        self._conn.execute(
            """INSERT INTO records
               (id,session,ts,kg,grams,stable,impedance,impedances,device,address,
                user_id,user_name,profile,body)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (record_id, event.get("session"), ts, float(event.get("kg") or 0), grams,
             1, impedance, json.dumps(event.get("impedances") or []),
             event.get("device", ""), event.get("address", ""),
             None, None, None, None),
        )
        self._conn.execute(
            f"DELETE FROM records WHERE id NOT IN (SELECT id FROM records ORDER BY ts DESC LIMIT {MAX_RECORDS})"
        )
        self._touch()
        self._conn.commit()
        return self.get_record(record_id)

    def assign(self, record_id: str, user_id: str | None) -> dict[str, Any] | None:
        record = self.get_record(record_id)
        if record is None:
            return None
        if user_id and self.get_user(user_id) is None:
            return None
        self._conn.execute(
            "UPDATE records SET user_id=? WHERE id=?", (user_id, record_id)
        )
        self._recompute_record({**record, "user_id": user_id})
        self._touch()
        self._conn.commit()
        return self.get_record(record_id)

    def delete_record(self, record_id: str) -> bool:
        cursor = self._conn.execute("DELETE FROM records WHERE id=?", (record_id,))
        self._touch()
        self._conn.commit()
        return cursor.rowcount > 0
