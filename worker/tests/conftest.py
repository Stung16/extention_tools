"""Dùng chung cho các test: đặt cấu hình, API giả chạy trong máy."""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from congcufile_worker.config import settings


@pytest.fixture
def env(monkeypatch):
    """Đặt biến môi trường cho một test: env(API_URL="...", ...). Cấu hình được đọc lại sau mỗi lần đặt."""

    def set_env(**values: str) -> None:
        for name, value in values.items():
            monkeypatch.setenv(name, value)
        settings.cache_clear()

    settings.cache_clear()
    yield set_env
    settings.cache_clear()


class FakeApi:
    """Máy chủ HTTP giả: trả lời theo kịch bản và ghi lại mọi request nhận được.

    replies[(method, path)] = danh sách (mã HTTP, thân JSON hoặc None); mỗi request lấy một phần tử đầu,
    hết danh sách thì dùng mãi phần tử cuối.
    """

    def __init__(self):
        self.replies: dict[tuple[str, str], list[tuple[int, object]]] = {}
        self.requests: list[tuple[str, str, bytes]] = []
        api = self

        class Handler(BaseHTTPRequestHandler):
            def _reply(self):
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else b""
                path = self.path.split("?")[0]
                api.requests.append((self.command, self.path, body))
                queue = api.replies.get((self.command, path)) or [(404, None)]
                status, payload = queue.pop(0) if len(queue) > 1 else queue[0]
                data = json.dumps(payload).encode() if payload is not None else b""
                self.send_response(status)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            do_GET = do_POST = _reply  # noqa: N815 - tên do http.server quy định

            def log_message(self, *args):
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self._server.server_address[1]}"
        threading.Thread(target=self._server.serve_forever, daemon=True).start()

    def calls(self, method: str, path: str) -> list[bytes]:
        return [body for m, p, body in self.requests if m == method and p.split("?")[0] == path]

    def close(self):
        self._server.shutdown()


@pytest.fixture
def fake_api(env):
    api = FakeApi()
    env(API_URL=api.url, WORKER_KEY="test-key")
    yield api
    api.close()
