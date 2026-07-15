#!/usr/bin/env python3

import json
import os
import secrets
import socket
import subprocess
import threading
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent.parent
RUNTIME = ROOT / ".runtime"
LOG_FILE = RUNTIME / "control-panel-dev.log"
TOKEN_FILE = RUNTIME / "control-token"
HOST = "127.0.0.1"
PORT = 18765
TOKEN = secrets.token_urlsafe(24)
PROCESS = None
LOCK = threading.Lock()

HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>同城速送 · 本地启停控制台</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif; background:#f2eee6; color:#17231f; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; background:radial-gradient(circle at 80% 0,#f9d8c9 0,transparent 34%),#f2eee6; }
    main { width:min(760px,100%); }
    .brand { display:flex; gap:14px; align-items:center; margin-bottom:22px; }
    .logo { width:52px; height:52px; display:grid; place-items:center; border-radius:16px; color:white; background:#d94b2b; font-size:26px; font-weight:800; box-shadow:0 10px 24px #d94b2b35; }
    h1 { margin:0; font-size:28px; } p { margin:5px 0 0; color:#68726d; }
    .card { background:#fffdf9; border:1px solid #ded8cd; border-radius:22px; padding:24px; box-shadow:0 20px 55px #453a2d18; }
    .status { display:flex; justify-content:space-between; gap:18px; align-items:center; padding-bottom:20px; border-bottom:1px solid #e8e2d8; }
    .signal { display:flex; align-items:center; gap:10px; font-weight:700; }
    .dot { width:11px; height:11px; border-radius:50%; background:#9aa19e; box-shadow:0 0 0 5px #9aa19e20; }
    .dot.running { background:#218a62; box-shadow:0 0 0 5px #218a6220; }
    .dot.partial { background:#d99022; box-shadow:0 0 0 5px #d9902220; }
    .links { font-size:13px; text-align:right; line-height:1.7; } a { color:#bd3f24; }
    .actions { display:grid; grid-template-columns:1fr 1fr; gap:14px; padding:22px 0; }
    button { min-height:58px; border-radius:15px; border:0; font-size:17px; font-weight:750; cursor:pointer; transition:transform .12s ease,opacity .12s ease; }
    button:active { transform:scale(.985); } button:disabled { opacity:.55; cursor:wait; }
    .start { color:white; background:linear-gradient(135deg,#e05230,#bd341e); box-shadow:0 10px 24px #ca3e2730; }
    .stop { color:#9f301e; background:#fae7df; border:1px solid #edc9bb; }
    .message { min-height:24px; color:#66706b; font-size:14px; }
    .logs { margin-top:10px; background:#13201c; color:#dce9e3; border-radius:16px; padding:16px; min-height:220px; max-height:360px; overflow:auto; white-space:pre-wrap; font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace; }
    @media (max-width:580px) { .status { align-items:flex-start; flex-direction:column; } .links { text-align:left; } .actions { grid-template-columns:1fr; } }
  </style>
</head>
<body>
<main>
  <div class="brand"><div class="logo">速</div><div><h1>本地启停控制台</h1><p>同城速送开发环境</p></div></div>
  <section class="card">
    <div class="status">
      <div class="signal"><span id="dot" class="dot"></span><span id="status">正在检查服务…</span></div>
      <div class="links"><a href="http://127.0.0.1:5173" target="_blank">打开运营后台</a><br><a href="http://127.0.0.1:3000/api/docs" target="_blank">打开 API 文档</a></div>
    </div>
    <div class="actions"><button id="start" class="start">一键启动</button><button id="stop" class="stop">一键停机</button></div>
    <div id="message" class="message">启动会自动运行前端、后端、PostgreSQL 和 Redis。</div>
    <pre id="logs" class="logs">等待操作…</pre>
  </section>
</main>
<script>
const token = new URLSearchParams(location.search).get('token') || '';
const $ = (id) => document.getElementById(id);
async function call(path, options={}) {
  const response = await fetch(path, {...options, headers:{...(options.headers||{}),'X-Control-Token':token}});
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || '操作失败');
  return payload;
}
async function refresh() {
  try {
    const data = await call('/api/status');
    const all = data.api && data.web;
    $('dot').className = 'dot ' + (all ? 'running' : (data.api || data.web ? 'partial' : ''));
    $('status').textContent = all ? '前后端运行中' : (data.api || data.web ? '服务正在启动或部分运行' : '服务已停止');
    $('logs').textContent = data.logs || '暂无启动日志。';
    $('logs').scrollTop = $('logs').scrollHeight;
  } catch (error) { $('message').textContent = error.message; }
}
async function operate(action) {
  $('start').disabled = $('stop').disabled = true;
  $('message').textContent = action === 'start' ? '正在启动，请稍候…' : '正在安全停机…';
  try { const data = await call('/api/' + action,{method:'POST'}); $('message').textContent = data.message; }
  catch (error) { $('message').textContent = error.message; }
  finally { $('start').disabled = $('stop').disabled = false; await refresh(); }
}
$('start').onclick = () => operate('start');
$('stop').onclick = () => operate('stop');
refresh(); setInterval(refresh,2000);
</script>
</body>
</html>"""


def reachable(url):
    try:
        with urllib.request.urlopen(url, timeout=0.7) as response:
            return response.status < 500
    except Exception:
        return False


def tail_log(limit=24000):
    try:
        data = LOG_FILE.read_bytes()
        return data[-limit:].decode("utf-8", errors="replace")
    except FileNotFoundError:
        return ""


def port_in_use():
    with socket.socket() as sock:
        return sock.connect_ex((HOST, PORT)) == 0


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def authorized(self):
        return self.headers.get("X-Control-Token", "") == TOKEN

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/":
            if parse_qs(parsed.query).get("token", [""])[0] != TOKEN:
                self.send_error(403)
                return
            body = HTML.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/api/status" and self.authorized():
            self.send_json(200, {"api": reachable("http://127.0.0.1:3000/api/health"), "web": reachable("http://127.0.0.1:5173"), "logs": tail_log()})
            return
        self.send_json(403, {"message": "控制台访问令牌无效"})

    def do_POST(self):
        global PROCESS
        if not self.authorized():
            self.send_json(403, {"message": "控制台访问令牌无效"})
            return
        if self.path == "/api/start":
            with LOCK:
                if reachable("http://127.0.0.1:3000/api/health") and reachable("http://127.0.0.1:5173"):
                    self.send_json(200, {"message": "前后端已经在运行，无需重复启动。"})
                    return
                LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
                log = LOG_FILE.open("wb")
                env = {**os.environ, "OPEN_BROWSER": "0"}
                PROCESS = subprocess.Popen(["bash", str(ROOT / "scripts/dev.sh")], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
                log.close()
            self.send_json(202, {"message": "启动命令已执行，通常需要 10–30 秒。"})
            return
        if self.path == "/api/stop":
            result = subprocess.run(["bash", str(ROOT / "scripts/stop-dev.sh")], cwd=ROOT, capture_output=True, text=True)
            self.send_json(200 if result.returncode == 0 else 500, {"message": "全部本地服务已停止。" if result.returncode == 0 else (result.stderr or result.stdout or "停机失败")})
            return
        self.send_json(404, {"message": "未知操作"})


def main():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    if port_in_use() and TOKEN_FILE.exists():
        existing = TOKEN_FILE.read_text().strip()
        if os.environ.get("CONTROL_PANEL_NO_BROWSER") != "1":
            webbrowser.open(f"http://{HOST}:{PORT}/?token={existing}")
        return
    TOKEN_FILE.write_text(TOKEN)
    os.chmod(TOKEN_FILE, 0o600)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    if os.environ.get("CONTROL_PANEL_NO_BROWSER") != "1":
        webbrowser.open(f"http://{HOST}:{PORT}/?token={TOKEN}")
    print(f"同城速送控制台已打开：http://{HOST}:{PORT}")
    print("保持此窗口开启；按 Ctrl+C 可关闭控制台（不会自动停止业务服务）。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        TOKEN_FILE.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
