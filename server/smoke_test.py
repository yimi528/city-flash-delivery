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

LOCAL_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

CUSTOMER_HEADERS = {"Authorization": "Bearer mock-token:customer:demo-user", "X-App-Role": "customer"}
MERCHANT_HEADERS = {"Authorization": "Bearer mock-token:merchant:merchant-demo", "X-App-Role": "merchant"}
RIDER_HEADERS = {"Authorization": "Bearer mock-token:rider:rider-1", "X-App-Role": "rider"}
ADMIN_HEADERS = {"Authorization": "Bearer mock-token:admin:platform-admin", "X-App-Role": "admin"}


def request(method: str, url: str, body: dict | None = None, headers: dict | None = None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    try:
        with LOCAL_OPENER.open(req, timeout=5) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8")
        return exc.code, json.loads(raw) if raw else None


def request_text(url: str):
    with LOCAL_OPENER.open(url, timeout=5) as resp:
        return resp.status, resp.read().decode("utf-8")


def assert_true(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def main():
    app.init_db()
    merchant_token = app.make_token(app.ROLE_MERCHANT, "merchant-demo")
    assert_true(app.parse_token("Bearer " + merchant_token)["role"] == "merchant", "mock auth token parse failed")
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
        status, merchant_html = request_text(base.replace("/api", "/merchant/"))
        assert_true(status == 200 and "同城速送运营后台" in merchant_html, "operations web static page failed")

        status, login = request("POST", f"{base}/auth/wechat-login", {"code": "smoke-code", "userInfo": {"nickName": "烟测用户"}})
        assert_true(status == 200 and login["user"]["nickname"] == "烟测用户" and login["role"] == "customer", f"login failed: {login}")
        status, merchant_login = request("POST", f"{base}/auth/merchant-login", {"merchantId": "merchant-demo"})
        assert_true(status == 200 and merchant_login["role"] == "merchant" and merchant_login["merchant"]["id"] == "merchant-demo", f"merchant login failed: {merchant_login}")

        status, vehicles = request("GET", f"{base}/vehicle-types")
        assert_true(status == 200 and {item["id"] for item in vehicles} >= {"ebike", "etrike", "van"}, "vehicle-types endpoint failed")

        status, estimate = request(
            "POST",
            f"{base}/pricing/estimate",
            {"service": "送货", "distanceKm": 2.4, "weightKg": 15, "vehicleId": "van"},
        )
        assert_true(status == 200 and estimate["total"] == 68.2, f"unexpected estimate: {estimate}")
        status, buy_estimate = request(
            "POST",
            f"{base}/pricing/estimate",
            {"service": "帮买", "distanceKm": 2.4, "budget": 50},
        )
        assert_true(status == 200 and buy_estimate["total"] == 58.9 and buy_estimate["serviceFee"] == 8.9, f"unexpected buy estimate: {buy_estimate}")

        status, addresses = request("GET", f"{base}/addresses?userId=demo-user", headers=CUSTOMER_HEADERS)
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
                "latitude": 26.66,
                "longitude": 119.55,
                "city": "宁德市",
                "district": "蕉城区",
                "mapPoiId": "smoke-map-poi",
            },
            headers=CUSTOMER_HEADERS,
        )
        assert_true(status == 201 and created_address["tag"] == "测试" and created_address["mapPoiId"] == "smoke-map-poi", f"create address failed: {created_address}")
        status, updated_address = request("PUT", f"{base}/addresses/{created_address['id']}", {"name": "烟测地址2", "isDefault": True}, headers=CUSTOMER_HEADERS)
        assert_true(status == 200 and updated_address["name"] == "烟测地址2" and updated_address["isDefault"], "update address failed")
        status, deleted_address = request("DELETE", f"{base}/addresses/{created_address['id']}", headers=CUSTOMER_HEADERS)
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
                "vehicleId": "van",
                "remark": "后端烟测订单",
            },
            headers=CUSTOMER_HEADERS,
        )
        assert_true(status == 201 and order["vehicleName"] == "面包车", f"create order failed: {order}")

        status, buy_order = request(
            "POST",
            f"{base}/orders",
            {
                "userId": "demo-user",
                "service": "帮买",
                "item": "咖啡奶茶",
                "buyItems": "帮我买两杯奶茶，一杯少糖一杯正常糖",
                "budget": 50,
                "purchaseAddressId": addresses[-1]["id"],
                "dropoffAddressId": addresses[1]["id"],
                "remark": "帮买烟测订单",
            },
            headers=CUSTOMER_HEADERS,
        )
        assert_true(status == 201 and buy_order["buyItems"].startswith("帮我买") and buy_order["budget"] == 50, f"create buy order failed: {buy_order}")
        assert_true(buy_order["merchantStatus"] == "待接单", f"buy order merchant status missing: {buy_order}")

        status, dashboard = request("GET", f"{base}/merchant/dashboard?merchantId=merchant-demo", headers=MERCHANT_HEADERS)
        assert_true(status == 200 and dashboard["stats"]["pending"] >= 1, f"merchant dashboard failed: {dashboard}")
        status, forbidden_dashboard = request("GET", f"{base}/merchant/dashboard?merchantId=merchant-demo", headers=CUSTOMER_HEADERS)
        assert_true(status == 403, f"customer should not access merchant dashboard: {forbidden_dashboard}")
        status, all_orders = request("GET", f"{base}/merchant/all-orders?merchantId=merchant-demo", headers=MERCHANT_HEADERS)
        all_order_ids = {item["id"] for item in all_orders["orders"]} if status == 200 else set()
        assert_true(status == 200 and {order["id"], buy_order["id"]} <= all_order_ids, f"merchant all orders sync failed: {all_orders}")

        status, operator_accepted = request("PATCH", f"{base}/orders/{order['id']}/status", {"status": "已接单", "note": "运营接单"}, headers=MERCHANT_HEADERS)
        assert_true(status == 200 and operator_accepted["status"] == "已接单", f"operator accept failed: {operator_accepted}")
        status, operator_pickup = request("PATCH", f"{base}/orders/{order['id']}/status", {"status": "取货中", "note": "运营开始取货"}, headers=MERCHANT_HEADERS)
        assert_true(status == 200 and operator_pickup["status"] == "取货中", f"operator pickup failed: {operator_pickup}")
        status, operator_delivering = request("PATCH", f"{base}/orders/{order['id']}/status", {"status": "配送中", "note": "运营开始配送"}, headers=MERCHANT_HEADERS)
        assert_true(status == 200 and operator_delivering["status"] == "配送中", f"operator delivery failed: {operator_delivering}")

        status, merchant_updated = request("PATCH", f"{base}/merchant/orders/{buy_order['id']}/status", {"status": "备货中"}, headers=MERCHANT_HEADERS)
        assert_true(status == 200 and merchant_updated["merchantStatus"] == "备货中" and merchant_updated["status"] == "已接单", f"merchant update failed: {merchant_updated}")
        status, merchant_ready = request("PATCH", f"{base}/merchant/orders/{buy_order['id']}/status", {"status": "待骑手取货"}, headers=MERCHANT_HEADERS)
        assert_true(status == 200 and merchant_ready["merchantStatus"] == "待骑手取货" and merchant_ready["status"] == "已接单", f"merchant ready update failed: {merchant_ready}")

        status, rider_dashboard = request("GET", f"{base}/rider/dashboard?riderId=rider-1", headers=RIDER_HEADERS)
        assert_true(status == 200 and rider_dashboard["stats"]["available"] >= 1, f"rider dashboard failed: {rider_dashboard}")
        status, rider_accepted = request("POST", f"{base}/rider/orders/{buy_order['id']}/accept", {"riderId": "rider-1"}, headers=RIDER_HEADERS)
        assert_true(status == 200 and rider_accepted["status"] == "已接单" and rider_accepted["riderId"] == "rider-1", f"rider accept failed: {rider_accepted}")
        status, rider_picked = request("PATCH", f"{base}/rider/orders/{buy_order['id']}/status", {"riderId": "rider-1", "action": "pickup"}, headers=RIDER_HEADERS)
        assert_true(status == 200 and rider_picked["status"] == "配送中" and rider_picked["merchantStatus"] == "已交付", f"rider pickup failed: {rider_picked}")
        status, rider_completed = request("PATCH", f"{base}/rider/orders/{buy_order['id']}/status", {"riderId": "rider-1", "action": "complete"}, headers=RIDER_HEADERS)
        assert_true(status == 200 and rider_completed["status"] == "已完成" and rider_completed["eta"] == "已送达", f"rider complete failed: {rider_completed}")

        status, fetched = request("GET", f"{base}/orders/{order['id']}", headers=CUSTOMER_HEADERS)
        assert_true(status == 200 and fetched["id"] == order["id"], "get order failed")

        status, forbidden_update = request("PATCH", f"{base}/orders/{order['id']}/status", {"action": "next"}, headers=CUSTOMER_HEADERS)
        assert_true(status == 403, f"customer should not manually update order status: {forbidden_update}")

        status, updated = request("PATCH", f"{base}/orders/{order['id']}/status", {"status": "已完成"}, headers=MERCHANT_HEADERS)
        assert_true(status == 200 and updated["status"] == "已完成", f"operator complete failed: {updated}")

        status, orders = request("GET", f"{base}/orders?userId=demo-user", headers=CUSTOMER_HEADERS)
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
        estimate = app.estimate_price(conn, {"service": "送货", "distanceKm": 2.4, "weightKg": 15, "vehicleId": "van"})
        assert_true(estimate["total"] == 68.2, f"unexpected estimate: {estimate}")
        buy_estimate = app.estimate_price(conn, {"service": "帮买", "distanceKm": 2.4, "budget": 50})
        assert_true(buy_estimate["total"] == 58.9 and buy_estimate["serviceFee"] == 8.9, f"unexpected buy estimate: {buy_estimate}")
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
                "vehicleId": "van",
                "remark": "direct smoke test",
            },
        )
        assert_true(order["vehicleName"] == "面包车" and order["fee"] == 68.2, f"create order failed: {order}")
        buy_order = app.create_order(
            conn,
            {
                "userId": "demo-user",
                "service": "帮买",
                "item": "咖啡奶茶",
                "buyItems": "帮我买两杯奶茶，一杯少糖一杯正常糖",
                "budget": 50,
                "purchaseAddressId": addresses[-1]["id"],
                "dropoffAddressId": addresses[1]["id"],
                "remark": "direct buy smoke test",
            },
        )
        assert_true(buy_order["budget"] == 50 and buy_order["vehicleName"] == "骑手代买", f"create buy order failed: {buy_order}")
        dashboard = app.merchant_dashboard(conn, "merchant-demo")
        assert_true(dashboard and dashboard["stats"]["pending"] >= 1, f"merchant dashboard failed: {dashboard}")
        merchant_updated = app.update_merchant_order_status(conn, buy_order["id"], {"status": "备货中"})
        assert_true(merchant_updated["merchantStatus"] == "备货中" and merchant_updated["status"] == "已接单", f"merchant update failed: {merchant_updated}")
        merchant_ready = app.update_merchant_order_status(conn, buy_order["id"], {"status": "待骑手取货"})
        assert_true(merchant_ready["merchantStatus"] == "待骑手取货" and merchant_ready["status"] == "已接单", f"merchant ready update failed: {merchant_ready}")
        rider_dashboard = app.rider_dashboard(conn, "rider-1")
        assert_true(rider_dashboard and rider_dashboard["stats"]["available"] >= 1, f"rider dashboard failed: {rider_dashboard}")
        rider_accepted = app.update_rider_order_status(conn, buy_order["id"], {"riderId": "rider-1", "action": "accept"})
        assert_true(rider_accepted["status"] == "已接单" and rider_accepted["riderId"] == "rider-1", f"rider accept failed: {rider_accepted}")
        rider_picked = app.update_rider_order_status(conn, buy_order["id"], {"riderId": "rider-1", "action": "pickup"})
        assert_true(rider_picked["status"] == "配送中" and rider_picked["merchantStatus"] == "已交付", f"rider pickup failed: {rider_picked}")
        rider_completed = app.update_rider_order_status(conn, buy_order["id"], {"riderId": "rider-1", "action": "complete"})
        assert_true(rider_completed["status"] == "已完成" and rider_completed["eta"] == "已送达", f"rider complete failed: {rider_completed}")
        updated = app.update_order_status(conn, order["id"], {"action": "next"})
        assert_true(updated["status"] == "已接单", f"status update failed: {updated}")
        print(json.dumps({"ok": True, "mode": "direct", "order": updated}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
