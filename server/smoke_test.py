#!/usr/bin/env python3
"""Smoke tests for the local backend MVP."""

from __future__ import annotations

import json
import os
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

os.environ["CITY_FLASH_QUIET"] = "1"
os.environ["CITY_FLASH_DB"] = os.path.join(tempfile.mkdtemp(prefix="city-flash-"), "test.db")

import app  # noqa: E402  pylint: disable=wrong-import-position


def request(method: str, url: str, body: dict | None = None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else None


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def main():
    app.init_db()
    try:
        server = ThreadingHTTPServer(("127.0.0.1", 0), app.ApiHandler)
    except PermissionError:
        run_direct_smoke()
        return
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}/api"

    try:
        status, health = request("GET", f"{base}/health")
        assert_true(status == 200 and health["status"] == "ok", "health endpoint failed")

        status, login = request("POST", f"{base}/auth/wechat-login", {"code": "smoke-code", "userInfo": {"nickName": "烟测用户"}})
        assert_true(status == 200 and login["user"]["nickname"] == "烟测用户", f"login failed: {login}")

        status, vehicles = request("GET", f"{base}/vehicle-types")
        assert_true(status == 200 and len(vehicles) >= 2, "vehicle-types endpoint failed")

        status, estimate = request(
            "POST",
            f"{base}/pricing/estimate",
            {"service": "送货", "distanceKm": 2.4, "weightKg": 15, "vehicleId": "car"},
        )
        assert_true(status == 200 and estimate["total"] == 61.1, f"unexpected estimate: {estimate}")

        status, addresses = request("GET", f"{base}/addresses?userId=demo-user")
        assert_true(status == 200 and len(addresses) >= 2, "addresses endpoint failed")

        status, created_address = request(
            "POST",
            f"{base}/addresses",
            {
                "userId": "demo-user",
                "name": "烟测地址",
                "detail": "测试路 88 号",
                "contact": "测试员",
                "phone": "13500001111",
                "tag": "测试",
                "distanceKm": 1.6,
            },
        )
        assert_true(status == 201 and created_address["tag"] == "测试", f"create address failed: {created_address}")
        status, updated_address = request("PUT", f"{base}/addresses/{created_address['id']}", {"name": "烟测地址2", "isDefault": True})
        assert_true(status == 200 and updated_address["name"] == "烟测地址2" and updated_address["isDefault"], "update address failed")
        status, deleted_address = request("DELETE", f"{base}/addresses/{created_address['id']}")
        assert_true(status == 200 and deleted_address["ok"], "delete address failed")

        status, order = request(
            "POST",
            f"{base}/orders",
            {
                "userId": "demo-user",
                "service": "送货",
                "item": "家具家纺",
                "pickupAddressId": addresses[0]["id"],
                "dropoffAddressId": addresses[1]["id"],
                "weightKg": 15,
                "vehicleId": "car",
                "remark": "后端烟测订单",
            },
        )
        assert_true(status == 201 and order["vehicleName"] == "汽车空间", f"create order failed: {order}")

        status, fetched = request("GET", f"{base}/orders/{order['id']}")
        assert_true(status == 200 and fetched["id"] == order["id"], "get order failed")

        status, updated = request("PATCH", f"{base}/orders/{order['id']}/status", {"action": "next"})
        assert_true(status == 200 and updated["status"] == "已接单", f"status update failed: {updated}")

        status, orders = request("GET", f"{base}/orders?userId=demo-user")
        assert_true(status == 200 and any(item["id"] == order["id"] for item in orders), "list orders failed")

        print(json.dumps({"ok": True, "base": base, "order": updated}, ensure_ascii=False, indent=2))
    finally:
        server.shutdown()
        server.server_close()
        time.sleep(0.05)


def run_direct_smoke():
    with app.connect() as conn:
        login = app.login_or_create_user(conn, {"code": "direct-code", "userInfo": {"nickName": "直测用户"}})
        assert_true(login["nickname"] == "直测用户", f"login failed: {login}")
        estimate = app.estimate_price(conn, {"service": "送货", "distanceKm": 2.4, "weightKg": 15, "vehicleId": "car"})
        assert_true(estimate["total"] == 61.1, f"unexpected estimate: {estimate}")
        addresses = conn.execute("SELECT * FROM addresses ORDER BY id").fetchall()
        assert_true(len(addresses) >= 2, "seed addresses missing")
        order = app.create_order(
            conn,
            {
                "userId": "demo-user",
                "service": "送货",
                "item": "家具家纺",
                "pickupAddressId": addresses[0]["id"],
                "dropoffAddressId": addresses[1]["id"],
                "weightKg": 15,
                "vehicleId": "car",
                "remark": "direct smoke test",
            },
        )
        assert_true(order["vehicleName"] == "汽车空间" and order["fee"] == 61.1, f"create order failed: {order}")
        updated = app.update_order_status(conn, order["id"], {"action": "next"})
        assert_true(updated["status"] == "已接单", f"status update failed: {updated}")
        print(json.dumps({"ok": True, "mode": "direct", "order": updated}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
