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
DEFAULT_MERCHANT_ID = "merchant-demo"
DEFAULT_RIDER_ID = "rider-1"
STATUS_FLOW = ["待接单", "已接单", "配送中", "已完成"]
MERCHANT_STATUS_FLOW = ["待接单", "备货中", "待骑手取货", "已交付"]


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
  openid TEXT UNIQUE,
  session_key TEXT,
  phone TEXT NOT NULL,
  nickname TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  member_level TEXT NOT NULL DEFAULT '普通会员',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  detail TEXT NOT NULL,
  contact TEXT NOT NULL,
  phone TEXT NOT NULL,
  tag TEXT NOT NULL DEFAULT '',
  distance_km REAL NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS merchants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '营业中',
  rating REAL NOT NULL DEFAULT 4.9,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL,
  item TEXT NOT NULL,
  merchant_id TEXT,
  merchant_name TEXT NOT NULL DEFAULT '',
  merchant_status TEXT NOT NULL DEFAULT '',
  merchant_note TEXT NOT NULL DEFAULT '',
  buy_items TEXT NOT NULL DEFAULT '',
  buy_budget REAL NOT NULL DEFAULT 0,
  purchase_address_id TEXT,
  purchase_name TEXT NOT NULL DEFAULT '',
  purchase_detail TEXT NOT NULL DEFAULT '',
  purchase_contact TEXT NOT NULL DEFAULT '',
  purchase_phone TEXT NOT NULL DEFAULT '',
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
  service_fee REAL NOT NULL DEFAULT 0,
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
  FOREIGN KEY (merchant_id) REFERENCES merchants(id),
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
        migrate_schema(conn)
        seed_db(conn)


def ensure_column(conn: sqlite3.Connection, table: str, name: str, ddl: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if name not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def migrate_schema(conn: sqlite3.Connection) -> None:
    # SQLite CREATE TABLE IF NOT EXISTS will not add columns for existing dev DBs.
    ensure_column(conn, "users", "openid", "openid TEXT")
    ensure_column(conn, "users", "session_key", "session_key TEXT")
    ensure_column(conn, "users", "avatar_url", "avatar_url TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "users", "updated_at", "updated_at TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "addresses", "tag", "tag TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "addresses", "is_default", "is_default INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "addresses", "is_deleted", "is_deleted INTEGER NOT NULL DEFAULT 0")
    ensure_column(conn, "addresses", "updated_at", "updated_at TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "orders", "merchant_id", "merchant_id TEXT")
    ensure_column(conn, "orders", "merchant_name", "merchant_name TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "orders", "merchant_status", "merchant_status TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "orders", "merchant_note", "merchant_note TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "orders", "buy_items", "buy_items TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "orders", "buy_budget", "buy_budget REAL NOT NULL DEFAULT 0")
    ensure_column(conn, "orders", "purchase_address_id", "purchase_address_id TEXT")
    ensure_column(conn, "orders", "purchase_name", "purchase_name TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "orders", "purchase_detail", "purchase_detail TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "orders", "purchase_contact", "purchase_contact TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "orders", "purchase_phone", "purchase_phone TEXT NOT NULL DEFAULT ''")
    ensure_column(conn, "orders", "service_fee", "service_fee REAL NOT NULL DEFAULT 0")
    now = now_iso()
    conn.execute(
        """
        INSERT OR IGNORE INTO merchants(id, name, category, phone, address, status, rating, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (DEFAULT_MERCHANT_ID, "阿嬷手作宁德万达店", "咖啡奶茶", "0593-8888888", "宁德万达广场 2 号门", "营业中", 4.9, now, now),
    )
    conn.execute("UPDATE users SET updated_at = ? WHERE updated_at = ''", (now,))
    conn.execute("UPDATE addresses SET updated_at = ? WHERE updated_at = ''", (now,))
    conn.execute("UPDATE orders SET service_fee = total_fee WHERE service_fee = 0")
    conn.execute(
        """
        UPDATE orders
        SET merchant_id = ?, merchant_name = ?, merchant_status = ?
        WHERE service = '帮买' AND (merchant_id IS NULL OR merchant_id = '')
        """,
        (DEFAULT_MERCHANT_ID, "阿嬷手作宁德万达店", "待接单"),
    )


def seed_db(conn: sqlite3.Connection) -> None:
    created_at = now_iso()
    conn.execute(
        """
        INSERT OR IGNORE INTO users(id, openid, session_key, phone, nickname, avatar_url, member_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (DEFAULT_USER_ID, "mock-openid-demo-user", "mock-session-demo", "138****4581", "微信用户", "", "青铜会员", created_at, created_at),
    )

    addresses = [
        ("a1", DEFAULT_USER_ID, "恒生一品苑", "东侨经济技术开发区福宁北路 6 号", "陈先生", "13809574581", "家", 0.3, 1),
        ("a2", DEFAULT_USER_ID, "宁德万达广场", "天湖东路 1 号 2 号门", "林女士", "13600001234", "商圈", 2.4, 0),
        ("a3", DEFAULT_USER_ID, "宁德市医院", "蕉城区蕉城北路 7 号住院部", "周先生", "13900005678", "医院", 3.1, 0),
        ("a4", DEFAULT_USER_ID, "华润便利店", "福宁北路与梦龙路交叉口", "门店前台", "0593-0000000", "门店", 0.8, 0),
    ]
    conn.executemany(
        """
        INSERT OR IGNORE INTO addresses(id, user_id, name, detail, contact, phone, tag, distance_km, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [row + (created_at, created_at) for row in addresses],
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

    merchants = [
        (DEFAULT_MERCHANT_ID, "阿嬷手作宁德万达店", "咖啡奶茶", "0593-8888888", "宁德万达广场 2 号门", "营业中", 4.9, created_at, created_at),
        ("merchant-pharmacy", "同城好药蕉城店", "药品保健", "0593-6666666", "蕉城区蕉城北路 7 号", "营业中", 4.8, created_at, created_at),
    ]
    conn.executemany(
        """
        INSERT OR IGNORE INTO merchants(id, name, category, phone, address, status, rating, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        merchants,
    )

    coupons = [
        ("coupon-1", DEFAULT_USER_ID, "新人首单立减", 9, 10, "unused", "2026-12-31"),
        ("coupon-2", DEFAULT_USER_ID, "送货车型券", 6, 30, "unused", "2026-12-31"),
    ]
    conn.executemany(
        "INSERT OR IGNORE INTO coupons(id, user_id, title, amount, min_spend, status, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        coupons,
    )


def format_user(row: sqlite3.Row) -> dict:
    user = dict(row)
    return {
        "id": user["id"],
        "openid": user.get("openid") if hasattr(user, "get") else user["openid"],
        "phone": user["phone"],
        "nickname": user["nickname"],
        "avatarUrl": user["avatar_url"],
        "memberLevel": user["member_level"],
        "createdAt": user["created_at"],
    }


def format_address(row: sqlite3.Row) -> dict:
    address = dict(row)
    return {
        "id": address["id"],
        "userId": address["user_id"],
        "name": address["name"],
        "detail": address["detail"],
        "contact": address["contact"],
        "phone": address["phone"],
        "tag": address["tag"],
        "distance": f"{address['distance_km']:g}km",
        "distanceKm": address["distance_km"],
        "isDefault": bool(address["is_default"]),
    }


def format_merchant(row: sqlite3.Row) -> dict:
    merchant = dict(row)
    return {
        "id": merchant["id"],
        "name": merchant["name"],
        "category": merchant["category"],
        "phone": merchant["phone"],
        "address": merchant["address"],
        "status": merchant["status"],
        "rating": merchant["rating"],
    }


def format_rider(row: sqlite3.Row) -> dict:
    rider = dict(row)
    vehicle_name = rider.get("vehicle_name") or ("汽车" if rider["vehicle_type_id"] == "car" else "电动车")
    return {
        "id": rider["id"],
        "name": rider["name"],
        "phone": rider["phone"],
        "vehicleId": rider["vehicle_type_id"],
        "vehicleName": vehicle_name,
        "status": "接单中" if rider["status"] == "online" else "休息中",
        "rating": 4.9,
    }


def login_or_create_user(conn: sqlite3.Connection, payload: dict) -> dict:
    code = (payload.get("code") or "").strip()
    user_info = payload.get("userInfo") if isinstance(payload.get("userInfo"), dict) else {}
    openid = payload.get("openid") or ("mock-openid-" + code[-12:] if code else "mock-openid-demo-user")
    user_id = DEFAULT_USER_ID if openid == "mock-openid-demo-user" else "user-" + uuid.uuid5(uuid.NAMESPACE_URL, openid).hex[:16]
    now = now_iso()
    nickname = user_info.get("nickName") or user_info.get("nickname") or payload.get("nickname") or "微信用户"
    avatar_url = user_info.get("avatarUrl") or payload.get("avatarUrl") or ""
    phone = payload.get("phone") or ("138****4581" if user_id == DEFAULT_USER_ID else "未绑定")
    session_key = "mock-session-" + uuid.uuid4().hex[:16]

    conn.execute(
        """
        INSERT INTO users(id, openid, session_key, phone, nickname, avatar_url, member_level, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          openid = excluded.openid,
          session_key = excluded.session_key,
          phone = excluded.phone,
          nickname = excluded.nickname,
          avatar_url = excluded.avatar_url,
          updated_at = excluded.updated_at
        """,
        (user_id, openid, session_key, phone, nickname, avatar_url, "青铜会员", now, now),
    )
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return format_user(row)


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
    is_buy = service == "帮买"

    if is_cargo:
        vehicle = get_vehicle(conn, payload.get("vehicleId") or payload.get("vehicle_type_id"))
        base = float(vehicle["base_fee"])
        distance_rate = float(vehicle["distance_rate"])
        weight_rate = float(vehicle["weight_rate"])
        vehicle_fee = float(vehicle["vehicle_fee"])
        vehicle_name = vehicle["name"]
    elif is_buy:
        vehicle = get_vehicle(conn, "ebike")
        base = 9.0
        distance_rate = 2.8
        weight_rate = 0.0
        vehicle_fee = 0.0
        vehicle_name = "骑手代买"
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
    discount = parse_float(payload.get("discount"), 4.0 if is_buy else 3.0)
    budget = parse_float(payload.get("budget", payload.get("buyBudget")), 0.0) if is_buy else 0.0
    service_fee = max(base + distance_fee + weight_fee + urgent_fee + vehicle_fee - discount, 6.9)
    total = service_fee + budget

    return {
        "distance": round(distance, 1),
        "weight": round(weight, 1),
        "base": round(base, 1),
        "distanceFee": round(distance_fee, 1),
        "weightFee": round(weight_fee, 1),
        "urgentFee": round(urgent_fee, 1),
        "vehicleFee": round(vehicle_fee, 1),
        "discount": round(discount, 1),
        "budget": round(budget, 1),
        "serviceFee": round(service_fee, 1),
        "total": round(total, 1),
        "vehicleId": vehicle["id"] if vehicle else "ebike",
        "vehicleName": vehicle_name,
    }


def get_address(conn: sqlite3.Connection, address_id: str | None) -> dict | None:
    if not address_id:
        return None
    return dict_from_row(conn.execute("SELECT * FROM addresses WHERE id = ? AND is_deleted = 0", (address_id,)).fetchone())


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
        "merchantId": order["merchant_id"] or "",
        "merchantName": order["merchant_name"],
        "merchantStatus": order["merchant_status"],
        "merchantNote": order["merchant_note"],
        "pickupName": order["pickup_name"],
        "pickupDetail": order["pickup_detail"],
        "dropoffName": order["dropoff_name"],
        "dropoffDetail": order["dropoff_detail"],
        "item": order["item"],
        "buyItems": order["buy_items"],
        "budget": round(float(order["buy_budget"]), 1),
        "purchaseAddressName": order["purchase_name"] or order["pickup_name"],
        "purchaseAddressDetail": order["purchase_detail"] or order["pickup_detail"],
        "vehicleName": order["vehicle_name"] or "电动车空间",
        "weightLabel": order["weight_label"],
        "serviceFee": round(float(order["service_fee"]), 1),
        "fee": round(float(order["total_fee"]), 1),
        "distance": round(float(order["distance_km"]), 1),
        "eta": order["eta"],
        "riderId": order["rider_id"] or "",
        "rider": order["rider_name"] or "等待骑手接单",
        "createTime": format_created_at(order["created_at"]),
        "remark": order["remark"],
    }


def create_order(conn: sqlite3.Connection, payload: dict) -> dict:
    user_id = payload.get("userId") or DEFAULT_USER_ID
    service = payload.get("service") or "帮送"
    is_buy = service == "帮买"
    purchase = normalize_address(conn, payload, "purchase") if is_buy else None
    pickup = purchase if is_buy and purchase else normalize_address(conn, payload, "pickup")
    dropoff = normalize_address(conn, payload, "dropoff")
    cargo_options = payload.get("cargoOptions") if isinstance(payload.get("cargoOptions"), dict) else {}
    vehicle_id = payload.get("vehicleId") or cargo_options.get("vehicleId") or "ebike"
    distance = parse_float(payload.get("distanceKm") or payload.get("distance") or dropoff.get("distanceKm"), 2.6)
    weight = parse_float(payload.get("weightKg") or payload.get("weight") or cargo_options.get("weight"), 1)
    item = payload.get("item") or cargo_options.get("categoryName") or "文件/小件"
    buy_items = payload.get("buyItems") or payload.get("buy_items") or (item if is_buy else "")
    buy_budget = parse_float(payload.get("budget", payload.get("buyBudget")), 0.0) if is_buy else 0.0

    estimate = estimate_price(
        conn,
        {
            "service": service,
            "distanceKm": distance,
            "weightKg": weight,
            "vehicleId": vehicle_id,
            "budget": buy_budget,
        },
    )
    created_at = now_iso()
    oid = order_id()
    eta_minutes = max(10, int(distance * (8 if vehicle_id == "car" else 7)))
    eta = f"约 {eta_minutes} 分钟"
    label = "" if is_buy else (cargo_options.get("weightLabel") or weight_label(weight))
    merchant = conn.execute("SELECT * FROM merchants WHERE id = ?", (DEFAULT_MERCHANT_ID,)).fetchone() if is_buy else None
    merchant_id = merchant["id"] if merchant else None
    merchant_name = merchant["name"] if merchant else ""
    merchant_status = "待接单" if is_buy else ""

    conn.execute(
        """
        INSERT INTO orders(
          id, user_id, service, item, merchant_id, merchant_name, merchant_status, merchant_note,
          buy_items, buy_budget,
          purchase_address_id, purchase_name, purchase_detail, purchase_contact, purchase_phone,
          pickup_address_id, pickup_name, pickup_detail, pickup_contact, pickup_phone,
          dropoff_address_id, dropoff_name, dropoff_detail, dropoff_contact, dropoff_phone,
          distance_km, weight_kg, weight_label,
          vehicle_type_id, vehicle_name, vehicle_fee,
          base_fee, distance_fee, weight_fee, urgent_fee, discount_fee, service_fee, total_fee,
          status, status_index, eta, rider_id, rider_name, remark, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            oid,
            user_id,
            service,
            item,
            merchant_id,
            merchant_name,
            merchant_status,
            "",
            buy_items,
            buy_budget,
            pickup.get("id") if is_buy else None,
            pickup["name"] if is_buy else "",
            pickup["detail"] if is_buy else "",
            pickup["contact"] if is_buy else "",
            pickup["phone"] if is_buy else "",
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
            estimate["serviceFee"],
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


def list_merchant_orders(conn: sqlite3.Connection, merchant_id: str, status: str = "") -> list[dict]:
    if status:
        rows = conn.execute(
            """
            SELECT * FROM orders
            WHERE merchant_id = ? AND merchant_status = ?
            ORDER BY created_at DESC
            """,
            (merchant_id, status),
        ).fetchall()
    else:
        rows = conn.execute(
            """
            SELECT * FROM orders
            WHERE merchant_id = ?
            ORDER BY
              CASE merchant_status
                WHEN '待接单' THEN 1
                WHEN '备货中' THEN 2
                WHEN '待骑手取货' THEN 3
                WHEN '已交付' THEN 4
                ELSE 9
              END,
              created_at DESC
            """,
            (merchant_id,),
        ).fetchall()
    return [format_order(row) for row in rows]


def merchant_dashboard(conn: sqlite3.Connection, merchant_id: str) -> dict | None:
    merchant = conn.execute("SELECT * FROM merchants WHERE id = ?", (merchant_id,)).fetchone()
    if not merchant:
        return None
    orders = list_merchant_orders(conn, merchant_id)
    pending = sum(1 for item in orders if item["merchantStatus"] == "待接单")
    preparing = sum(1 for item in orders if item["merchantStatus"] == "备货中")
    ready = sum(1 for item in orders if item["merchantStatus"] == "待骑手取货")
    completed = sum(1 for item in orders if item["merchantStatus"] == "已交付")
    revenue = sum(float(item.get("budget") or item.get("fee") or 0) for item in orders)
    return {
        "store": format_merchant(merchant),
        "stats": {
            "todayOrders": len(orders),
            "pending": pending,
            "preparing": preparing,
            "ready": ready,
            "completed": completed,
            "revenue": round(revenue, 1),
            "avgPrepare": "8分钟" if preparing or ready else "6分钟",
        },
        "orders": orders,
    }


def rider_phase(order: dict) -> str:
    if order["status"] == "已完成":
        return "已完成"
    if order["status"] == "配送中":
        return "配送中"
    if order["status"] == "已接单" and order.get("riderId"):
        return "待取货"
    if order["service"] == "帮买" and order["merchantStatus"] == "待骑手取货" and not order.get("riderId"):
        return "可接单"
    if order["status"] == "待接单" and not order.get("riderId") and order["service"] != "帮买":
        return "可接单"
    if order["status"] == "已接单":
        return "待取货"
    return order["status"]


def list_rider_orders(conn: sqlite3.Connection, rider_id: str, status: str = "") -> list[dict]:
    rows = conn.execute(
        """
        SELECT * FROM orders
        WHERE status <> '已取消'
          AND (
            (service <> '帮买' AND status = '待接单' AND (rider_id IS NULL OR rider_id = ''))
            OR (service = '帮买' AND merchant_status = '待骑手取货' AND (rider_id IS NULL OR rider_id = ''))
            OR (rider_id = ? AND status IN ('已接单', '配送中', '已完成'))
          )
        ORDER BY
          CASE status
            WHEN '待接单' THEN 1
            WHEN '已接单' THEN 2
            WHEN '配送中' THEN 3
            WHEN '已完成' THEN 4
            ELSE 9
          END,
          created_at DESC
        """,
        (rider_id,),
    ).fetchall()
    orders = [format_order(row) for row in rows]
    if status:
        orders = [order for order in orders if rider_phase(order) == status]
    return orders


def rider_dashboard(conn: sqlite3.Connection, rider_id: str) -> dict | None:
    rider = conn.execute(
        """
        SELECT riders.*, vehicle_types.short_name AS vehicle_name
        FROM riders
        LEFT JOIN vehicle_types ON vehicle_types.id = riders.vehicle_type_id
        WHERE riders.id = ?
        """,
        (rider_id,),
    ).fetchone()
    if not rider:
        return None
    orders = list_rider_orders(conn, rider_id)
    phases = [rider_phase(order) for order in orders]
    completed_orders = [order for order in orders if rider_phase(order) == "已完成"]
    return {
        "rider": format_rider(rider),
        "stats": {
            "available": phases.count("可接单"),
            "pickup": phases.count("待取货"),
            "delivering": phases.count("配送中"),
            "completed": phases.count("已完成"),
            "todayIncome": round(sum(float(order.get("serviceFee") or order.get("fee") or 0) for order in completed_orders), 1),
        },
        "orders": orders,
    }


def update_rider_order_status(conn: sqlite3.Connection, oid: str, payload: dict) -> dict | None:
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (oid,)).fetchone()
    if not row:
        return None

    rider_id = payload.get("riderId") or DEFAULT_RIDER_ID
    rider = conn.execute("SELECT * FROM riders WHERE id = ?", (rider_id,)).fetchone()
    if not rider:
        return None

    order = dict(row)
    action = payload.get("action") or "accept"
    if action not in ("accept", "pickup", "complete"):
        if order["status"] == "待接单":
            action = "accept"
        elif order["status"] == "已接单":
            action = "pickup"
        else:
            action = "complete"

    status = order["status"]
    status_index = int(order["status_index"])
    merchant_status = order["merchant_status"]
    eta = order["eta"]
    note = payload.get("note") or ""

    if action == "accept":
        status = "已接单"
        status_index = 1
        eta = "约 16 分钟"
        note = note or f"{rider['name']}接单"
    elif action == "pickup":
        status = "配送中"
        status_index = 2
        eta = "约 9 分钟"
        note = note or f"{rider['name']}已取货"
        if order["service"] == "帮买":
            merchant_status = "已交付"
    elif action == "complete":
        status = "已完成"
        status_index = 3
        eta = "已送达"
        note = note or f"{rider['name']}确认送达"
        if order["service"] == "帮买":
            merchant_status = "已交付"

    updated_at = now_iso()
    conn.execute(
        """
        UPDATE orders
        SET status = ?, status_index = ?, merchant_status = ?, eta = ?,
            rider_id = ?, rider_name = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, status_index, merchant_status, eta, rider["id"], rider["name"], updated_at, oid),
    )
    conn.execute(
        "INSERT INTO order_status_logs(id, order_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), oid, status, note, updated_at),
    )
    return format_order(conn.execute("SELECT * FROM orders WHERE id = ?", (oid,)).fetchone())


def update_merchant_order_status(conn: sqlite3.Connection, oid: str, payload: dict) -> dict | None:
    row = conn.execute("SELECT * FROM orders WHERE id = ?", (oid,)).fetchone()
    if not row:
        return None
    order = dict(row)
    status = payload.get("status") or order["merchant_status"] or "待接单"
    if status not in MERCHANT_STATUS_FLOW:
        current = order["merchant_status"] or "待接单"
        index = MERCHANT_STATUS_FLOW.index(current) if current in MERCHANT_STATUS_FLOW else 0
        status = MERCHANT_STATUS_FLOW[min(index + 1, len(MERCHANT_STATUS_FLOW) - 1)]

    user_status = order["status"]
    user_status_index = int(order["status_index"])
    eta = order["eta"]
    if status == "备货中":
        user_status = "已接单"
        user_status_index = 1
        eta = "商家备货中"
    elif status == "待骑手取货":
        user_status = "已接单"
        user_status_index = 1
        eta = "等待骑手取货"
    elif status == "已交付":
        user_status = "配送中"
        user_status_index = 2
        eta = "约 9 分钟"

    updated_at = now_iso()
    conn.execute(
        """
        UPDATE orders
        SET merchant_status = ?, merchant_note = ?, status = ?, status_index = ?, eta = ?, updated_at = ?
        WHERE id = ?
        """,
        (status, payload.get("note") or "", user_status, user_status_index, eta, updated_at, oid),
    )
    conn.execute(
        "INSERT INTO order_status_logs(id, order_id, status, note, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), oid, user_status, payload.get("note") or f"商家状态：{status}", updated_at),
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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
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

    def do_PUT(self) -> None:
        try:
            self.handle_put()
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

    def do_DELETE(self) -> None:
        try:
            self.handle_delete()
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

            match = re.fullmatch(r"/api/users/([^/]+)", path)
            if match:
                row = conn.execute("SELECT * FROM users WHERE id = ?", (match.group(1),)).fetchone()
                if not row:
                    self.send_error_json(404, "User not found")
                    return
                self.send_json(200, format_user(row))
                return

            if path == "/api/addresses":
                user_id = query.get("userId", [DEFAULT_USER_ID])[0]
                rows = conn.execute(
                    "SELECT * FROM addresses WHERE user_id = ? AND is_deleted = 0 ORDER BY is_default DESC, updated_at DESC, id",
                    (user_id,),
                ).fetchall()
                self.send_json(200, [format_address(row) for row in rows])
                return

            match = re.fullmatch(r"/api/addresses/([^/]+)", path)
            if match:
                row = conn.execute("SELECT * FROM addresses WHERE id = ? AND is_deleted = 0", (match.group(1),)).fetchone()
                if not row:
                    self.send_error_json(404, "Address not found")
                    return
                self.send_json(200, format_address(row))
                return

            if path == "/api/coupons":
                user_id = query.get("userId", [DEFAULT_USER_ID])[0]
                rows = conn.execute("SELECT * FROM coupons WHERE user_id = ? ORDER BY expires_at", (user_id,)).fetchall()
                self.send_json(200, [dict(row) for row in rows])
                return

            if path == "/api/merchant/dashboard":
                merchant_id = query.get("merchantId", [DEFAULT_MERCHANT_ID])[0]
                dashboard = merchant_dashboard(conn, merchant_id)
                if not dashboard:
                    self.send_error_json(404, "Merchant not found")
                    return
                self.send_json(200, dashboard)
                return

            if path == "/api/merchant/orders":
                merchant_id = query.get("merchantId", [DEFAULT_MERCHANT_ID])[0]
                status = query.get("status", [""])[0]
                self.send_json(200, list_merchant_orders(conn, merchant_id, status))
                return

            if path == "/api/rider/dashboard":
                rider_id = query.get("riderId", [DEFAULT_RIDER_ID])[0]
                dashboard = rider_dashboard(conn, rider_id)
                if not dashboard:
                    self.send_error_json(404, "Rider not found")
                    return
                self.send_json(200, dashboard)
                return

            if path == "/api/rider/orders":
                rider_id = query.get("riderId", [DEFAULT_RIDER_ID])[0]
                status = query.get("status", [""])[0]
                self.send_json(200, list_rider_orders(conn, rider_id, status))
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
            if path == "/api/auth/wechat-login":
                user = login_or_create_user(conn, payload)
                self.send_json(200, {"token": "mock-token-" + user["id"], "user": user})
                return

            if path == "/api/pricing/estimate":
                self.send_json(200, estimate_price(conn, payload))
                return

            if path == "/api/addresses":
                user_id = payload.get("userId") or DEFAULT_USER_ID
                aid = payload.get("id") or "addr-" + uuid.uuid4().hex[:10]
                is_default = 1 if payload.get("isDefault") else 0
                now = now_iso()
                if is_default:
                    conn.execute("UPDATE addresses SET is_default = 0 WHERE user_id = ?", (user_id,))
                conn.execute(
                    """
                    INSERT INTO addresses(id, user_id, name, detail, contact, phone, tag, distance_km, is_default, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        aid,
                        user_id,
                        payload.get("name") or "临时地址",
                        payload.get("detail") or "未填写详细地址",
                        payload.get("contact") or "微信用户",
                        payload.get("phone") or "13800000000",
                        payload.get("tag") or "",
                        parse_float(payload.get("distanceKm") or payload.get("distance"), 1),
                        is_default,
                        now,
                        now,
                    ),
                )
                row = conn.execute("SELECT * FROM addresses WHERE id = ?", (aid,)).fetchone()
                self.send_json(201, format_address(row))
                return

            if path == "/api/orders":
                self.send_json(201, create_order(conn, payload))
                return

            match = re.fullmatch(r"/api/rider/orders/([^/]+)/accept", path)
            if match:
                payload["action"] = "accept"
                order = update_rider_order_status(conn, match.group(1), payload)
                if not order:
                    self.send_error_json(404, "Order or rider not found")
                    return
                self.send_json(200, order)
                return

        self.send_error_json(404, "Not found")

    def handle_put(self) -> None:
        path, _ = self.parsed()
        payload = self.read_json()
        match = re.fullmatch(r"/api/addresses/([^/]+)", path)
        if not match:
            self.send_error_json(404, "Not found")
            return

        aid = match.group(1)
        with connect() as conn:
            row = conn.execute("SELECT * FROM addresses WHERE id = ? AND is_deleted = 0", (aid,)).fetchone()
            if not row:
                self.send_error_json(404, "Address not found")
                return
            current = dict(row)
            user_id = payload.get("userId") or current["user_id"]
            is_default = 1 if payload.get("isDefault") else 0
            now = now_iso()
            if is_default:
                conn.execute("UPDATE addresses SET is_default = 0 WHERE user_id = ? AND id <> ?", (user_id, aid))
            conn.execute(
                """
                UPDATE addresses
                SET name = ?, detail = ?, contact = ?, phone = ?, tag = ?, distance_km = ?, is_default = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    payload.get("name") or current["name"],
                    payload.get("detail") or current["detail"],
                    payload.get("contact") or current["contact"],
                    payload.get("phone") or current["phone"],
                    payload.get("tag") if payload.get("tag") is not None else current["tag"],
                    parse_float(payload.get("distanceKm") or payload.get("distance"), current["distance_km"]),
                    is_default,
                    now,
                    aid,
                ),
            )
            updated = conn.execute("SELECT * FROM addresses WHERE id = ?", (aid,)).fetchone()
            self.send_json(200, format_address(updated))

    def handle_patch(self) -> None:
        path, _ = self.parsed()
        payload = self.read_json()
        merchant_match = re.fullmatch(r"/api/merchant/orders/([^/]+)/status", path)
        if merchant_match:
            with connect() as conn:
                order = update_merchant_order_status(conn, merchant_match.group(1), payload)
                if not order:
                    self.send_error_json(404, "Order not found")
                    return
                self.send_json(200, order)
                return

        rider_match = re.fullmatch(r"/api/rider/orders/([^/]+)/status", path)
        if rider_match:
            with connect() as conn:
                order = update_rider_order_status(conn, rider_match.group(1), payload)
                if not order:
                    self.send_error_json(404, "Order or rider not found")
                    return
                self.send_json(200, order)
                return

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

    def handle_delete(self) -> None:
        path, _ = self.parsed()
        match = re.fullmatch(r"/api/addresses/([^/]+)", path)
        if not match:
            self.send_error_json(404, "Not found")
            return
        with connect() as conn:
            row = conn.execute("SELECT * FROM addresses WHERE id = ? AND is_deleted = 0", (match.group(1),)).fetchone()
            if not row:
                self.send_error_json(404, "Address not found")
                return
            conn.execute(
                "UPDATE addresses SET is_deleted = 1, is_default = 0, updated_at = ? WHERE id = ?",
                (now_iso(), match.group(1)),
            )
            self.send_json(200, {"ok": True, "id": match.group(1)})


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
