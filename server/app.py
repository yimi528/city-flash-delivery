#!/usr/bin/env python3
"""Local backend MVP for the city flash delivery mini program.

The server intentionally uses only Python standard-library modules so it can run
without installing packages. Data is persisted in SQLite.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import sqlite3
import time
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT_DIR = Path(__file__).resolve().parent
DB_PATH = Path(os.environ.get("CITY_FLASH_DB", ROOT_DIR / "data" / "dev.db"))
DEFAULT_USER_ID = "demo-user"
STATUS_FLOW = ["待接单", "已接单", "配送中", "已完成"]


def now_iso() -> str:
    return datetime.now().replace(microsecond=0).isoformat(sep=" ")


def parse_float(value, default=0.0) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, (int, float)):
        return float(value)
    match = re.search(r"-?\d+(?:\.\d+)?", str(value))
    return float(match.group(0)) if match else default


def weight_label(weight: float) -> str:
    if weight <= 1:
        return "≤1公斤"
    if weight < 10:
        return f"{int(weight) if weight.is_integer() else weight:g}公斤"
    return f"{int(weight) if weight.is_integer() else weight:g}公斤以上"


def order_id() -> str:
    return "S" + datetime.now().strftime("%Y%m%d%H%M%S") + f"{random.randint(1000, 9999)}"


def dict_from_row(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row else None


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  nickname TEXT NOT NULL,
  member_level TEXT NOT NULL DEFAULT '普通会员',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  detail TEXT NOT NULL,
  contact TEXT NOT NULL,
  phone TEXT NOT NULL,
  distance_km REAL NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS vehicle_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  capacity TEXT NOT NULL,
  max_weight_kg REAL NOT NULL,
  base_fee REAL NOT NULL,
  distance_rate REAL NOT NULL,
  weight_rate REAL NOT NULL,
  vehicle_fee REAL NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS riders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle_type_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'online',
  created_at TEXT NOT NULL,
  FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  item TEXT NOT NULL,
  pickup_address_id TEXT,
  pickup_name TEXT NOT NULL,
  pickup_detail TEXT NOT NULL,
  pickup_contact TEXT NOT NULL,
  pickup_phone TEXT NOT NULL,
  dropoff_address_id TEXT,
  dropoff_name TEXT NOT NULL,
  dropoff_detail TEXT NOT NULL,
  dropoff_contact TEXT NOT NULL,
  dropoff_phone TEXT NOT NULL,
  distance_km REAL NOT NULL,
  weight_kg REAL NOT NULL,
  weight_label TEXT NOT NULL,
  vehicle_type_id TEXT,
  vehicle_name TEXT,
  vehicle_fee REAL NOT NULL DEFAULT 0,
  base_fee REAL NOT NULL,
  distance_fee REAL NOT NULL,
  weight_fee REAL NOT NULL,
  urgent_fee REAL NOT NULL DEFAULT 0,
  discount_fee REAL NOT NULL DEFAULT 0,
  total_fee REAL NOT NULL,
  status TEXT NOT NULL,
  status_index INTEGER NOT NULL,
  eta TEXT NOT NULL,
  rider_id TEXT,
  rider_name TEXT,
  remark TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id),
  FOREIGN KEY (rider_id) REFERENCES riders(id)
);

CREATE TABLE IF NOT EXISTS order_status_logs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  amount REAL NOT NULL,
  min_spend REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unused',
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
"""


def init_db() -> None:
    with connect() as conn:
        conn.executescript(SCHEMA)
        seed_db(conn)


def seed_db(conn: sqlite3.Connection) -> None:
    created_at = now_iso()
    conn.execute(
        "INSERT OR IGNORE INTO users(id, phone, nickname, member_level, created_at) VALUES (?, ?, ?, ?, ?)",
        (DEFAULT_USER_ID, "138****4581", "微信用户", "青铜会员", created_at),
    )

    addresses = [
        ("a1", DEFAULT_USER_ID, "恒生一品苑", "东侨经济技术开发区福宁北路 6 号", "陈先生", "13809574581", 0.3),
        ("a2", DEFAULT_USER_ID, "宁德万达广场", "天湖东路 1 号 2 号门", "林女士", "13600001234", 2.4),
        ("a3", DEFAULT_USER_ID, "宁德市医院", "蕉城区蕉城北路 7 号住院部", "周先生", "13900005678", 3.1),
        ("a4", DEFAULT_USER_ID, "华润便利店", "福宁北路与梦龙路交叉口", "门店前台", "0593-0000000", 0.8),
    ]
    conn.executemany(
        """
        INSERT OR IGNORE INTO addresses(id, user_id, name, detail, contact, phone, distance_km, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [row + (created_at,) for row in addresses],
    )

    vehicle_types = [
        ("ebike", "电动车空间", "电动车", "56cm × 44cm × 38cm", 10, 10, 3.0, 1.8, 0, "适合文件、小箱、鲜花、轻便日用品", 1),
        ("car", "汽车空间", "汽车", "1.4m × 1.3m × 0.8m", 50, 18, 4.2, 1.8, 15, "适合行李箱、小家具、多件包裹", 1),
    ]
    conn.executemany(
        """
        INSERT OR IGNORE INTO vehicle_types
        (id, name, short_name, capacity, max_weight_kg, base_fee, distance_rate, weight_rate, vehicle_fee, description, enabled)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        vehicle_types,
    )

    riders = [
        ("rider-1", "王师傅", "13900001111", "ebike", "online", created_at),
        ("rider-2", "张师傅", "13900002222", "car", "online", created_at),
    ]
    conn.executemany(
        "INSERT OR IGNORE INTO riders(id, name, phone, vehicle_type_id, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        riders,
    )

    coupons = [
        ("coupon-1", DEFAULT_USER_ID, "新人首单立减", 9, 10, "unused", "2026-12-31"),
        ("coupon-2", DEFAULT_USER_ID, "送货车型券", 6, 30, "unused", "2026-12-31"),
    ]
    conn.executemany(
        "INSERT OR IGNORE INTO coupons(id, user_id, title, amount, min_spend, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        coupons,
    )


def get_vehicle(conn: sqlite3.Connection, vehicle_id: str | None) -> dict:
    row = conn.execute(
        "SELECT * FROM vehicle_types WHERE id = ? AND enabled = 1",
        (vehicle_id or "ebike",),
    ).fetchone()
    if not row:
        row = conn.execute("SELECT * FROM vehicle_types WHERE id = 'ebike'").fetchone()
    return dict_from_row(row)


def estimate_price(conn: sqlite3.Connection, payload: dict) -> dict:
    service = payload.get("service") or "帮送"
    distance = parse_float(payload.get("distanceKm", payload.get("distance")), 2.6)
    weight = parse_float(payload.get("weightKg", payload.get("weight")), 1)
    is_cargo = service == "送货"

    if is_cargo:
        vehicle = get_vehicle(conn, payload.get("vehicleId") or payload.get("vehicle_type_id"))
        base = float(vehicle["base_fee"])
        distance_rate = float(vehicle["distance_rate"])
        weight_rate = float(vehicle["weight_rate"])
        vehicle_fee = float(vehicle["vehicle_fee"])
        vehicle_name = vehicle["name"]
    else:
        vehicle = None
        base = 8.0
        distance_rate = 2.4
        weight_rate = 1.2
        vehicle_fee = 0.0
        vehicle_name = "电动车空间"

    distance_fee = max(distance - 1, 0) * distance_rate
    weight_fee = max(weight - 1, 0) * weight_rate
    urgent_fee = 5.0 if service == "1对1急送" else 0.0
    discount = parse_float(payload.get("discount"), 3.0)
    total = max(base + distance_fee + weight_fee + urgent_fee + vehicle_fee - discount, 6.9)

    return {
        "distance": round(distance, 1),
        "weight": round(weight, 1),
        "base": round(base, 1),
        "distanceFee": round(distance_fee, 1),
        "weightFee": round(weight_fee, 1),
        "urgentFee": round(urgent_fee, 1),
        "vehicleFee": round(vehicle_fee, 1),
        "discount": round(discount, 1),
        "total": round(total, 1),
        "vehicleId": vehicle["id"] if vehicle else "ebike",
        "vehicleName": vehicle_name,
    }


def get_address(conn: sqlite3.Connection, address_id: str | None) -> dict | None:
    if not address_id:
        return None
    return dict_from_row(conn.execute("SELECT * FROM addresses WHERE id = ?", (address_id,)).fetchone())


def normalize_address(conn: sqlite3.Connection, payload: dict, prefix: str) -> dict:
    address_id = payload.get(f"{prefix}AddressId") or payload.get(f"{prefix}_address_id")
    address = get_address(conn, address_id)
    incoming = payload.get(prefix) if isinstance(payload.get(prefix), dict) else {}
    if address:
        return {
            "id": address["id"],
            "name": address["name"],
            "detail": address["detail"],
            "contact": address["contact"],
            "phone": address["phone"],
            "distanceKm": address["distance_km"],
        }
    return {
        "id": incoming.get("id") or address_id,
        "name": incoming.get("name") or payload.get(f"{prefix}Name") or "临时地址",
        "detail": incoming.get("detail") or payload.get(f"{prefix}Detail") or "未填写详细地址",
        "contact": incoming.get("contact") or payload.get(f"{prefix}Contact") or "微信用户",
        "phone": incoming.get("phone") or payload.get(f"{prefix}Phone") or "13800000000",
        "distanceKm": parse_float(incoming.get("distance") or incoming.get("distanceKm"), 2.6),
    }


def format_created_at(value: str) -> str:
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        return value
    today = datetime.now().date()
    if dt.date() == today:
        return "今天 " + dt.strftime("%H:%M")
    return dt.strftime("%Y-%m-%d %H:%M")


def format_order(row: sqlite3.Row) -> dict:
    order = dict(row)
    return {
        "id": order["id"],
        "status": order["status"],
        "statusIndex": order["status_index"],
        "service": order["service"],
        "pickupName": order["pickup_name"],
        "pickupDetail": order["pickup_detail"],
        "dropoffName": order["dropoff_name"],
        "dropoffDetail": order["dropoff_detail"],
        "item": order["item"],
        "vehicleName": order["vehicle_name"] or "电动车空间",
        "weightLabel": order["weight_label"],
        "fee": round(float(order["total_fee"]), 1),
        "distance": round(float(order["distance_km"]), 1),
        "eta": order["eta"],
        "rider": order["rider_name"] or "等待骑手接单",
        "createTime": format_created_at(order["created_at"]),
        "remark": order["remark"],
    }


def create_order(conn: sqlite3.Connection, payload: dict) -> dict:
    user_id = payload.get("userId") or DEFAULT_USER_ID
    service = payload.get("service") or "帮送"
    pickup = normalize_address(conn, payload, "pickup")
    dropoff = normalize_address(conn, payload, "dropoff")
    cargo_options = payload.get("cargoOptions") if isinstance(payload.get("cargoOptions"), dict) else {}
    vehicle_id = payload.get("vehicleId") or cargo_options.get("vehicleId") or "ebike"
    distance = parse_float(payload.get("distanceKm") or payload.get("distance") or dropoff.get("distanceKm"), 2.6)
    weight = parse_float(payload.get("weightKg") or payload.get("weight") or cargo_options.get("weight"), 1)
    item = payload.get("item") or cargo_options.get("categoryName") or "文件/小件"

    estimate = estimate_price(
        conn,
        {
            "service": service,
            "distanceKm": distance,
            "weightKg": weight,
            "vehicleId": vehicle_id,
        },
    )
    created_at = now_iso()
    oid = order_id()
    eta_minutes = max(10, int(distance * (8 if vehicle_id == "car" else 7)))
    eta = f"约 {eta_minutes} 分钟"
    label = cargo_options.get("weightLabel") or weight_label(weight)

    conn.execute(
        """
        INSERT INTO orders(
          id, user_id, service, item,
          pickup_address_id, pickup_name, pickup_detail, pickup_contact, pickup_phone,
          dropoff_address_id, dropoff_name, dropoff_detail, dropoff_contact, dropoff_phone,
          distance_km, weight_kg, weight_label,
          vehicle_type_id, vehicle_name, vehicle_fee,
          base_fee, distance_fee, weight_fee, urgent_fee, discount_fee, total_fee,
          status, status_index, eta, rider_id, rider_name, remark, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            oid,
            user_id,
            service,
            item,
            pickup.get("id"),
            pickup["name"],
            pickup["detail"],
            pickup["contact"],
            pickup["phone"],
            dropoff.get("id"),
            dropoff["name"],
            dropoff["detail"],
            dropoff["contact"],
            dropoff["phone"],
            estimate["distance"],
            estimate["weight"],
            label,
            estimate["vehicleId"],
            estimate["vehicleName"],
            estimate["vehicleFee"],
            estimate["base"],
            estimate["distanceFee"],
            estimate["weightFee"],
            estimate["urgentFee"],
            estimate["discount"],
            estimate["total"],
            "待接单",
            0,
            eta,
            None,
            None,
            payload.get("remark") or "",
            created_at,
            created_at,
        ),
    )
    conn.execute(
        "INSERT INTO order_status_logs(id, order_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), oid, "待接单", "用户创建订单", created_at),
    )
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (oid,)).fetchone()
    return format_order(row)


def update_order_status(conn: sqlite3.Connection, oid: str, payload: dict) -> dict | None:
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (oid,)).fetchone()
    if not row:
        return None
    order = dict(row)
    if payload.get("action") == "next":
        next_index = min(int(order["status_index"]) + 1, len(STATUS_FLOW) - 1)
        status = STATUS_FLOW[next_index]
    else:
        status = payload.get("status") or order["status"]
        next_index = STATUS_FLOW.index(status) if status in STATUS_FLOW else int(order["status_index"])

    rider_id = order["rider_id"]
    rider_name = order["rider_name"]
    if status == "已接单" and not rider_id:
        preferred_vehicle = order["vehicle_type_id"] or "ebike"
        rider = conn.execute(
            "SELECT * FROM riders WHERE status = 'online' AND vehicle_type_id = ? ORDER BY id LIMIT 1",
            (preferred_vehicle,),
        ).fetchone() or conn.execute("SELECT * FROM riders WHERE status = 'online' ORDER BY id LIMIT 1").fetchone()
        if rider:
            rider_id = rider["id"]
            rider_name = rider["name"]

    eta = order["eta"]
    if status == "已接单":
        eta = "约 16 分钟"
    elif status == "配送中":
        eta = "约 9 分钟"
    elif status == "已完成":
        eta = "已送达"

    updated_at = now_iso()
    conn.execute(
        "UPDATE orders SET status = ?, status_index = ?, eta = ?, rider_id = ?, rider_name = ?, updated_at = ? WHERE id = ?",
        (status, next_index, eta, rider_id, rider_name, updated_at, oid),
    )
    conn.execute(
        "INSERT INTO order_status_logs(id, order_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), oid, status, payload.get("note") or "状态更新", updated_at),
    )
    return format_order(conn.execute("SELECT * FROM orders WHERE id = ?", (oid,)).fetchone())


class ApiHandler(BaseHTTPRequestHandler):
    server_version = "CityFlashBackend/0.1"

    def log_message(self, fmt: str, *args) -> None:
        if os.environ.get("CITY_FLASH_QUIET") != "1":
            super().log_message(fmt, *args)

    def send_json(self, status: int, payload: dict | list) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status: int, message: str) -> None:
        self.send_json(status, {"error": message})

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length") or 0)
        if length == 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw or "{}")

    def do_OPTIONS(self) -> None:
        self.send_json(204, {})

    def do_GET(self) -> None:
        try:
            self.handle_get()
        except Exception as exc:  # pragma: no cover - defensive API boundary
            self.send_error_json(500, str(exc))

    def do_POST(self) -> None:
        try:
            self.handle_post()
        except json.JSONDecodeError:
            self.send_error_json(400, "Invalid JSON body")
        except Exception as exc:  # pragma: no cover - defensive API boundary
            self.send_error_json(500, str(exc))

    def do_PATCH(self) -> None:
        try:
            self.handle_patch()
        except json.JSONDecodeError:
            self.send_error_json(400, "Invalid JSON body")
        except Exception as exc:  # pragma: no cover - defensive API boundary
            self.send_error_json(500, str(exc))

    def parsed(self):
        parsed_url = urlparse(self.path)
        return parsed_url.path, parse_qs(parsed_url.query)

    def handle_get(self) -> None:
        path, query = self.parsed()
        with connect() as conn:
            if path == "/api/health":
                self.send_json(200, {"status": "ok", "db": str(DB_PATH), "time": now_iso()})
                return

            if path == "/api/vehicle-types":
                rows = conn.execute("SELECT * FROM vehicle_types WHERE enabled = 1 ORDER BY vehicle_fee, id").fetchall()
                self.send_json(200, [dict(row) for row in rows])
                return

            if path == "/api/addresses":
                user_id = query.get("userId", [DEFAULT_USER_ID])[0]
                rows = conn.execute("SELECT * FROM addresses WHERE user_id = ? ORDER BY created_at, id", (user_id,)).fetchall()
                self.send_json(
                    200,
                    [
                        {
                            "id": row["id"],
                            "name": row["name"],
                            "detail": row["detail"],
                            "contact": row["contact"],
                            "phone": row["phone"],
                            "distance": f"{row['distance_km']:g}km",
                            "distanceKm": row["distance_km"],
                        }
                        for row in rows
                    ],
                )
                return

            if path == "/api/coupons":
                user_id = query.get("userId", [DEFAULT_USER_ID])[0]
                rows = conn.execute("SELECT * FROM coupons WHERE user_id = ? ORDER BY expires_at", (user_id,)).fetchall()
                self.send_json(200, [dict(row) for row in rows])
                return

            if path == "/api/orders":
                user_id = query.get("userId", [DEFAULT_USER_ID])[0]
                status = query.get("status", [""])[0]
                if status:
                    rows = conn.execute(
                        "SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY created_at DESC",
                        (user_id, status),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC",
                        (user_id,),
                    ).fetchall()
                self.send_json(200, [format_order(row) for row in rows])
                return

            match = re.fullmatch(r"/api/orders/([^/]+)", path)
            if match:
                row = conn.execute("SELECT * FROM orders WHERE id = ?", (match.group(1),)).fetchone()
                if not row:
                    self.send_error_json(404, "Order not found")
                    return
                self.send_json(200, format_order(row))
                return

        self.send_error_json(404, "Not found")

    def handle_post(self) -> None:
        path, _ = self.parsed()
        payload = self.read_json()
        with connect() as conn:
            if path == "/api/pricing/estimate":
                self.send_json(200, estimate_price(conn, payload))
                return

            if path == "/api/addresses":
                user_id = payload.get("userId") or DEFAULT_USER_ID
                aid = payload.get("id") or "addr-" + uuid.uuid4().hex[:10]
                conn.execute(
                    """
                    INSERT INTO addresses(id, user_id, name, detail, contact, phone, distance_km, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        aid,
                        user_id,
                        payload.get("name") or "临时地址",
                        payload.get("detail") or "未填写详细地址",
                        payload.get("contact") or "微信用户",
                        payload.get("phone") or "13800000000",
                        parse_float(payload.get("distanceKm") or payload.get("distance"), 1),
                        now_iso(),
                    ),
                )
                row = conn.execute("SELECT * FROM addresses WHERE id = ?", (aid,)).fetchone()
                self.send_json(201, dict(row))
                return

            if path == "/api/orders":
                self.send_json(201, create_order(conn, payload))
                return

            match = re.fullmatch(r"/api/rider/orders/([^/]+)/accept", path)
            if match:
                rider_id = payload.get("riderId") or "rider-1"
                rider = conn.execute("SELECT * FROM riders WHERE id = ?", (rider_id,)).fetchone()
                if not rider:
                    self.send_error_json(404, "Rider not found")
                    return
                order = update_order_status(
                    conn,
                    match.group(1),
                    {"status": "已接单", "note": f"{rider['name']}接单"},
                )
                if not order:
                    self.send_error_json(404, "Order not found")
                    return
                self.send_json(200, order)
                return

        self.send_error_json(404, "Not found")

    def handle_patch(self) -> None:
        path, _ = self.parsed()
        payload = self.read_json()
        match = re.fullmatch(r"/api/orders/([^/]+)/status", path)
        if not match:
            self.send_error_json(404, "Not found")
            return
        with connect() as conn:
            order = update_order_status(conn, match.group(1), payload)
            if not order:
                self.send_error_json(404, "Order not found")
                return
            self.send_json(200, order)


def run(host: str = "127.0.0.1", port: int = 8000) -> None:
    init_db()
    server = ThreadingHTTPServer((host, port), ApiHandler)
    print(f"City Flash backend running at http://{host}:{port}/api")
    print(f"SQLite database: {DB_PATH}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        server.server_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the city flash delivery backend MVP")
    parser.add_argument("--host", default=os.environ.get("CITY_FLASH_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("CITY_FLASH_PORT", "8000")))
    args = parser.parse_args()
    run(args.host, args.port)


if __name__ == "__main__":
    main()
