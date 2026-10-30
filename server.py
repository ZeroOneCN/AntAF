#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""蚂蚁阿福体重秤 Web 服务（AntAF）。

浏览器无法直接连接 BLE 设备，因此由本服务负责：
1. 使用 bleak 扫描附近的 BLE 广播，发现并连接体重秤；
2. 解析秤推送的重量 / 阻抗帧，按 BIA 公式估算身体成分；
3. 维护成员档案与测量记录，通过 WebSocket 实时推送到网页；
4. 提供静态页面（iPad 大屏仪表盘）与调试用的 JSON 状态接口。
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import socket
import time
from pathlib import Path
from typing import Any

from aiohttp import WSMsgType, web
from bleak import BleakScanner
from bleak.backends.device import BLEDevice
from bleak.backends.scanner import AdvertisementData

from weight.records import WeightStore
from weight.scale_reader import ScaleReader

BASE_DIR = Path(__file__).resolve().parent
# 前端静态资源目录
WEB_DIR = BASE_DIR / "weight" / "web"
# 成员档案与测量记录的默认持久化路径
WEIGHT_STORE_PATH = BASE_DIR / "weight" / "weight_store.json"

# 超过该秒数未再收到广播的设备会从列表移除
STALE_SECONDS = 120
# 访问令牌 Cookie 名称
TOKEN_COOKIE = "antaf_token"


class ScaleHub:
    """维护体重秤连接状态、测量记录与 WebSocket 客户端集合。"""

    def __init__(
        self,
        scale_enabled: bool = True,
        scale_match: str = "AFU",
        scale_height: int = 173,
        scale_age: int = 25,
        scale_sex: str = "male",
        weight_store: str | Path = WEIGHT_STORE_PATH,
    ) -> None:
        """初始化集线器。

        Args:
            scale_enabled: 是否启用体重秤读取。
            scale_match: 体重秤的设备名前缀，用于从扫描结果中筛选。
            scale_height: 首个成员的身高（厘米），用于触发阻抗测量与体成分估算。
            scale_age: 首个成员的年龄（岁）。
            scale_sex: 首个成员的性别，male 或 female。
            weight_store: 测量记录与成员档案的持久化文件路径。
        """
        self.store = WeightStore(
            path=weight_store,
            default_height_cm=scale_height,
            default_age=scale_age,
            default_sex=scale_sex,
        )
        profile = self.store.active_profile()
        self.scale = (
            ScaleReader(
                on_event=self._on_scale_event,
                name_prefix=scale_match,
                height_cm=profile["height_cm"],
                age=profile["age"],
                is_male=profile["sex"] == "male",
            )
            if scale_enabled
            else None
        )
        # 扫描到的设备：地址 -> {address, name, rssi, first_seen, last_seen}
        self.devices: dict[str, dict[str, Any]] = {}
        self.clients: set[web.WebSocketResponse] = set()
        self.scanner: BleakScanner | None = None
        self.scanning = False
        self.scan_error: str | None = None
        self._scan_lock = asyncio.Lock()
        self._events: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=512)
        self._tasks: list[asyncio.Task[Any]] = []

    async def start(self) -> None:
        """启动后台任务、体重秤读取与 BLE 扫描。"""
        self._tasks = [
            asyncio.create_task(self._pump()),
            asyncio.create_task(self._ticker()),
        ]
        if self.scale is not None:
            await self.scale.start()
        await self.start_scan()

    async def stop(self) -> None:
        """停止扫描并结束后台任务。"""
        await self.stop_scan()
        if self.scale is not None:
            await self.scale.stop()
        for task in self._tasks:
            task.cancel()
        for task in self._tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass
        self._tasks.clear()

    async def start_scan(self) -> None:
        """开始 BLE 主动扫描；失败时记录错误并推送给页面。"""
        async with self._scan_lock:
            if self.scanning:
                return
            try:
                scanner = BleakScanner(
                    detection_callback=self._on_advertisement,
                    scanning_mode="active",
                )
                await scanner.start()
            except Exception as exc:  # 蓝牙适配器不可用等
                logging.exception("启动 BLE 扫描失败")
                self.scanning = False
                self.scan_error = (
                    f"蓝牙扫描启动失败：{exc}。请确认电脑蓝牙已开启，"
                    "并在系统设置中允许应用访问蓝牙。"
                )
            else:
                self.scanner = scanner
                self.scanning = True
                self.scan_error = None
                logging.info("BLE 扫描已启动")
            self._put(self._status_event())

    async def stop_scan(self) -> None:
        """停止 BLE 扫描。"""
        async with self._scan_lock:
            scanner, self.scanner = self.scanner, None
            self.scanning = False
            if scanner is not None:
                try:
                    await scanner.stop()
                except Exception:
                    logging.warning("停止 BLE 扫描时出现异常", exc_info=True)
                else:
                    logging.info("BLE 扫描已停止")
            self._put(self._status_event())

    def _on_scale_event(self, event: dict[str, Any]) -> None:
        """体重秤测量回调：写入记录并推送页面。

        Args:
            event: 秤读取器解析出的测量事件。
        """
        before = self.store.version
        record = self.store.add_measurement(event)
        self._put({"type": "weight", **event})
        if record is not None and self.store.version != before:
            self._put_weight_state()

    def _put_weight_state(self) -> None:
        """把成员档案与记录快照放入推送队列。"""
        self._put({"type": "weight_state", **self.store.state()})

    def _notice(self, text: str, level: str = "warn") -> None:
        """向页面推送一条提示。

        Args:
            text: 提示内容。
            level: 提示级别，info / ok / warn / err。
        """
        self._put({"type": "notice", "level": level, "text": text})

    def _sync_scale_profile(self) -> None:
        """把当前生效成员的资料下发给秤（阻抗测量需要资料包）。"""
        if self.scale is None:
            return
        profile = self.store.active_profile()
        self.scale.set_profile(profile["height_cm"], profile["age"], profile["sex"])

    def assign_record(self, record_id: str, user_id: str | None) -> dict[str, Any] | None:
        """把一条测量记录归属到成员，并同步秤资料与页面状态。

        Args:
            record_id: 记录 ID。
            user_id: 成员 ID；None 表示取消归属。

        Returns:
            更新后的记录；记录或成员不存在时返回 None。
        """
        record = self.store.assign(record_id, user_id)
        if record is None:
            self._notice("记录或成员不存在，归属失败")
            return None
        self._sync_scale_profile()
        self._put_weight_state()
        return record

    def snapshot(self, include_store: bool = False) -> dict[str, Any]:
        """生成当前的状态快照。

        Args:
            include_store: 是否附带成员档案与测量记录（/api/status 调试用）。

        Returns:
            可直接序列化为 JSON 的字典。
        """
        now = time.time()
        items = [
            {
                "address": rec["address"],
                "name": rec["name"],
                "rssi": rec["rssi"],
                "ageMs": int((now - rec["last_seen"]) * 1000),
                "firstSeen": round(rec["first_seen"] * 1000),
            }
            for rec in self.devices.values()
        ]
        items.sort(key=lambda item: -item["rssi"])
        result: dict[str, Any] = {
            "type": "devices",
            "ts": round(now * 1000),
            "scanning": self.scanning,
            "error": self.scan_error,
            "weight": self.scale.last if self.scale is not None else None,
            "scale": {
                "enabled": self.scale is not None,
                "connected": bool(self.scale is not None and self.scale.connected),
                "error": self.scale.error if self.scale is not None else None,
                "profile": (
                    dict(self.scale.profile) if self.scale is not None else None
                ),
            },
            "devices": items,
        }
        if include_store:
            result["weightStore"] = self.store.state()
        return result

    def _status_event(self) -> dict[str, Any]:
        """构建扫描状态事件。

        Returns:
            状态事件字典。
        """
        return {
            "type": "status",
            "scanning": self.scanning,
            "error": self.scan_error,
            "ts": round(time.time() * 1000),
        }

    def _put(self, event: dict[str, Any]) -> None:
        """将事件放入发送队列；队列满时丢弃最旧事件。

        Args:
            event: 待发送的事件。
        """
        try:
            self._events.put_nowait(event)
        except asyncio.QueueFull:
            try:
                self._events.get_nowait()
            except asyncio.QueueEmpty:
                pass
            self._events.put_nowait(event)

    async def _pump(self) -> None:
        """持续从队列取出事件并广播给所有客户端。"""
        while True:
            event = await self._events.get()
            await self._broadcast(event)

    async def _ticker(self) -> None:
        """每秒推送一次状态快照，并清理长时间未出现的设备。"""
        while True:
            await asyncio.sleep(1.0)
            self._prune()
            self._put(self.snapshot())

    async def _broadcast(self, event: dict[str, Any]) -> None:
        """向所有 WebSocket 客户端发送事件。

        Args:
            event: 事件字典。
        """
        if not self.clients:
            return
        text = json.dumps(event, ensure_ascii=False)
        stale: list[web.WebSocketResponse] = []
        for ws in list(self.clients):
            try:
                await ws.send_str(text)
            except Exception:
                stale.append(ws)
        for ws in stale:
            self.clients.discard(ws)

    def _prune(self) -> None:
        """移除超过 STALE_SECONDS 未再出现广播的设备。"""
        now = time.time()
        expired = [
            address
            for address, rec in self.devices.items()
            if now - rec["last_seen"] > STALE_SECONDS
        ]
        for address in expired:
            self.devices.pop(address, None)

    def _on_advertisement(self, device: BLEDevice, adv: AdvertisementData) -> None:
        """bleak 扫描回调，登记设备并把候选报给秤读取器。

        Args:
            device: 被发现的 BLE 设备。
            adv: 该设备的广播数据。
        """
        try:
            self._ingest(device, adv)
        except Exception:
            logging.exception("处理广播数据时出现异常")

    def _ingest(self, device: BLEDevice, adv: AdvertisementData) -> None:
        """合并一次广播到设备记录。

        体重秤平时休眠、不主动广播，因此这里只负责把扫描到的设备名与
        信号强度报给读取器，由读取器决定连接哪一个。

        Args:
            device: 被发现的 BLE 设备。
            adv: 该设备的广播数据。
        """
        now = time.time()
        address = device.address
        name = (adv.local_name or getattr(device, "name", None) or "").strip()
        rec = self.devices.get(address)
        if rec is None:
            rec = {
                "address": address,
                "name": name,
                "rssi": adv.rssi,
                "first_seen": now,
                "last_seen": now,
            }
            self.devices[address] = rec
        rec["rssi"] = adv.rssi
        rec["last_seen"] = now
        if name:
            rec["name"] = name

        if self.scale is not None and name:
            self.scale.note_device(address, name, adv.rssi)


async def index_handler(request: web.Request) -> web.FileResponse:
    """返回仪表盘页面。

    Args:
        request: HTTP 请求。

    Returns:
        首页文件响应。
    """
    return web.FileResponse(WEB_DIR / "index.html")


async def status_handler(request: web.Request) -> web.Response:
    """返回当前状态的 JSON 快照，便于调试。

    Args:
        request: HTTP 请求。

    Returns:
        JSON 响应。
    """
    hub: ScaleHub = request.app["hub"]
    return web.json_response(hub.snapshot(include_store=True))


def _parse_user_fields(data: dict[str, Any]) -> dict[str, Any] | None:
    """校验成员资料字段。

    Args:
        data: WebSocket 指令内容。

    Returns:
        规范化后的成员字段；校验失败时返回 None。
    """
    try:
        height = int(data.get("height_cm", 0))
        age = int(data.get("age", 0))
    except (TypeError, ValueError):
        return None
    name = str(data.get("name", "")).strip()[:12]
    if not name or not 100 <= height <= 230 or not 10 <= age <= 100:
        return None
    sex = "female" if str(data.get("sex", "male")).lower() == "female" else "male"
    return {"name": name, "height_cm": height, "age": age, "sex": sex}


async def websocket_handler(request: web.Request) -> web.WebSocketResponse:
    """处理 WebSocket 连接，推送测量与档案事件。

    Args:
        request: WebSocket 升级请求。

    Returns:
        已关闭的 WebSocket 响应。
    """
    hub: ScaleHub = request.app["hub"]
    ws = web.WebSocketResponse(heartbeat=30)
    await ws.prepare(request)
    hub.clients.add(ws)
    try:
        await ws.send_str(json.dumps(hub.snapshot(), ensure_ascii=False))
        await ws.send_str(
            json.dumps(
                {"type": "weight_state", **hub.store.state()}, ensure_ascii=False
            )
        )
        async for msg in ws:
            if msg.type != WSMsgType.TEXT:
                continue
            try:
                data = json.loads(msg.data)
            except json.JSONDecodeError:
                continue
            action = data.get("type")
            if action == "start_scan":
                await hub.start_scan()
            elif action == "stop_scan":
                await hub.stop_scan()
            elif action == "add_user":
                fields = _parse_user_fields(data)
                if fields is None:
                    hub._notice(
                        "成员资料无效：姓名必填，身高 100–230 cm，年龄 10–100 岁"
                    )
                    continue
                hub.store.add_user(**fields)
                hub._put_weight_state()
                hub._notice("成员已新增", "ok")
            elif action == "update_user":
                user_id = str(data.get("id") or "")
                fields = _parse_user_fields(data)
                if not user_id or fields is None:
                    hub._notice("成员资料无效，请检查姓名、身高与年龄")
                    continue
                if hub.store.update_user(user_id, **fields) is None:
                    hub._notice("成员不存在，更新失败")
                    continue
                hub._sync_scale_profile()
                hub._put_weight_state()
                hub._notice("成员资料已更新，名下记录体成分已重算", "ok")
            elif action == "delete_user":
                user_id = str(data.get("id") or "")
                ok, reason = hub.store.delete_user(user_id)
                if not ok:
                    hub._notice(reason)
                    continue
                hub._sync_scale_profile()
                hub._put_weight_state()
                hub._notice("成员已删除", "ok")
            elif action == "assign_record":
                hub.assign_record(
                    str(data.get("record_id") or ""),
                    str(data.get("user_id") or "") or None,
                )
            elif action == "delete_record":
                record_id = str(data.get("record_id") or "")
                if hub.store.delete_record(record_id):
                    hub._put_weight_state()
                    hub._notice("记录已删除", "ok")
                else:
                    hub._notice("记录不存在，删除失败")
            elif action == "ping":
                await ws.send_str(
                    json.dumps(
                        {"type": "pong", "ts": round(time.time() * 1000)},
                        ensure_ascii=False,
                    )
                )
    finally:
        hub.clients.discard(ws)
    return ws


def make_auth_middleware(token: str) -> Any:
    """创建可选的访问令牌中间件。

    Args:
        token: 访问令牌明文。

    Returns:
        可注册到 aiohttp 的中间件函数。
    """

    @web.middleware
    async def auth_middleware(
        request: web.Request, handler: Any
    ) -> web.StreamResponse:
        """校验访问令牌，首次带 token 打开页面时写入 Cookie。"""
        supplied = request.query.get("token") or request.cookies.get(TOKEN_COOKIE)
        if supplied != token:
            raise web.HTTPUnauthorized(
                text="需要访问令牌，请使用 /?token=你的令牌 打开页面"
            )
        response = await handler(request)
        if request.path == "/" and request.query.get("token"):
            response.set_cookie(TOKEN_COOKIE, token, httponly=True, samesite="Lax")
        return response

    return auth_middleware


async def _on_startup(app: web.Application) -> None:
    """应用启动钩子：启动扫描与推送任务。

    Args:
        app: aiohttp 应用。
    """
    await app["hub"].start()


async def _on_shutdown(app: web.Application) -> None:
    """应用关闭钩子：停止扫描并释放资源。

    Args:
        app: aiohttp 应用。
    """
    await app["hub"].stop()


def build_app(hub: ScaleHub, token: str = "") -> web.Application:
    """构建 aiohttp 应用。

    Args:
        hub: 体重秤集线器。
        token: 可选的访问令牌。

    Returns:
        配置完成的应用实例。
    """
    app = web.Application()
    app["hub"] = hub
    app.router.add_get("/", index_handler)
    app.router.add_get("/api/status", status_handler)
    app.router.add_get("/ws", websocket_handler)
    app.router.add_static("/static", WEB_DIR, show_index=False)
    app.on_startup.append(_on_startup)
    app.on_shutdown.append(_on_shutdown)
    if token:
        app.middlewares.append(make_auth_middleware(token))
    return app


def _lan_urls(port: int) -> list[str]:
    """列出本机可访问的服务地址。

    Args:
        port: 监听端口。

    Returns:
        去重后的 URL 列表。
    """
    urls = [f"http://127.0.0.1:{port}"]
    try:
        infos = socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
    except OSError:
        return urls
    for info in infos:
        ip = str(info[4][0])
        if ip.startswith("127.") or ip.startswith("169.254."):
            continue
        url = f"http://{ip}:{port}"
        if url not in urls:
            urls.append(url)
    return urls


def parse_args() -> argparse.Namespace:
    """解析命令行参数。

    Returns:
        解析结果。
    """
    parser = argparse.ArgumentParser(description="蚂蚁阿福体重秤 Web 服务")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址，默认 0.0.0.0")
    parser.add_argument("--port", type=int, default=8765, help="监听端口，默认 8765")
    parser.add_argument(
        "--token",
        default="",
        help="可选的访问令牌；设置后局域网访问需带 ?token=令牌",
    )
    parser.add_argument(
        "--no-scale",
        action="store_true",
        help="禁用体重秤读取（默认启用）",
    )
    parser.add_argument(
        "--scale-match",
        default="AFU",
        help="体重秤的设备名前缀，默认 AFU",
    )
    parser.add_argument(
        "--scale-height",
        type=int,
        default=173,
        help="首个成员的身高（厘米），默认 173",
    )
    parser.add_argument(
        "--scale-age",
        type=int,
        default=25,
        help="首个成员的年龄（岁），默认 25",
    )
    parser.add_argument(
        "--scale-sex",
        choices=("male", "female"),
        default="male",
        help="首个成员的性别，默认 male",
    )
    parser.add_argument(
        "--weight-store",
        default=str(WEIGHT_STORE_PATH),
        help="成员档案与测量记录的持久化文件路径",
    )
    return parser.parse_args()


def main() -> None:
    """程序入口：启动 Web 服务与蓝牙扫描。"""
    args = parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    hub = ScaleHub(
        scale_enabled=not args.no_scale,
        scale_match=args.scale_match,
        scale_height=args.scale_height,
        scale_age=args.scale_age,
        scale_sex=args.scale_sex,
        weight_store=args.weight_store,
    )
    app = build_app(hub, token=args.token)
    logging.info("访问地址：")
    for url in _lan_urls(args.port):
        logging.info("  %s", url)
    if args.token:
        logging.info("已启用访问令牌，请在地址后追加 ?token=%s", args.token)
    web.run_app(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
