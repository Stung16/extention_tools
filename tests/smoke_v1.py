"""Kiểm tra nhanh API v1 (app khách), cửa quản trị và thứ tự ưu tiên, với worker thật.

Cách chạy (API phải đang chạy, nên dùng thư mục dữ liệu tạm để không lẫn dữ liệu thật):
    cd worker
    .venv\\Scripts\\python.exe ..\\tests\\smoke_v1.py

Script tự bật worker main (WORKER_PROFILE=main) ở giữa chừng để kiểm tra thứ tự ưu tiên,
và tự tắt khi xong. Cấu hình qua biến môi trường: API_URL, ADMIN_KEY, WORKER_KEY.
"""
import io
import os
import subprocess
import sys
import time
from pathlib import Path

import requests
from PIL import Image

sys.stdout.reconfigure(encoding="utf-8")

API = os.environ.get("API_URL", "http://localhost:5100").rstrip("/")
ADMIN = {"X-Admin-Key": os.environ.get("ADMIN_KEY", "dev-admin-key")}
WORKER_KEY = os.environ.get("WORKER_KEY", "dev-worker-key")
WORKER_DIR = Path(__file__).resolve().parent.parent / "worker"
ok_all = True


def check(name, cond, detail=""):
    global ok_all
    ok_all &= bool(cond)
    print(("OK  " if cond else "SAI ") + name + (f"  [{detail}]" if detail != "" else ""))


def png(color, size=(400, 300)):
    b = io.BytesIO()
    Image.new("RGB", size, color).save(b, "PNG")
    return b.getvalue()


def bearer(key):
    return {"Authorization": f"Bearer {key}"}


def upload(key, name, data, declared=None):
    """Xin chỗ tải lên rồi PUT nội dung. Trả về (upload_id, mã HTTP của lần PUT)."""
    r = requests.post(f"{API}/v1/uploads", headers=bearer(key), json={"fileName": name, "size": declared or len(data)})
    r.raise_for_status()
    u = r.json()
    put = requests.put(u["uploadUrl"], data=data)
    return u["id"], put.status_code, u["uploadUrl"]


def wait_batch(key, batch_id, timeout=180):
    t = time.time()
    while time.time() - t < timeout:
        b = requests.get(f"{API}/v1/batches/{batch_id}", headers=bearer(key)).json()
        if b["finished"]:
            return b
        time.sleep(1)
    raise TimeoutError(batch_id)


for _ in range(30):
    try:
        requests.get(f"{API}/api/job-types", timeout=2)
        break
    except requests.RequestException:
        time.sleep(1)

# ---------- Cửa quản trị ----------
check("Quản trị: không có mã -> 401", requests.get(f"{API}/api/admin/overview").status_code == 401)
check("Quản trị: dùng mã worker -> 401",
      requests.get(f"{API}/api/admin/overview", headers={"X-Admin-Key": WORKER_KEY}).status_code == 401)
a = requests.post(f"{API}/api/admin/clients", headers=ADMIN, json={"name": "App thử A"}).json()
b = requests.post(f"{API}/api/admin/clients", headers=ADMIN, json={"name": "App thử B"}).json()
check("Tạo 2 app khách, khoá bắt đầu bằng ccf_", a["key"].startswith("ccf_") and b["key"].startswith("ccf_"))
A, B = a["key"], b["key"]

# ---------- Xác thực v1 ----------
check("v1: không có khoá -> 401", requests.get(f"{API}/v1/job-types").status_code == 401)
check("v1: khoá sai -> 401", requests.get(f"{API}/v1/job-types", headers=bearer("ccf_sai")).status_code == 401)
types = requests.get(f"{API}/v1/job-types", headers=bearer(A)).json()
check("v1: danh mục công cụ có compress-image", any(t["type"] == "compress-image" for t in types))

# ---------- Tải lên ----------
data = png((200, 40, 40))
_, code, _ = upload(A, "sai-dung-luong.png", data, declared=len(data) + 10)
check("Tải lên sai dung lượng đã khai -> 400", code == 400, code)
uid, code, url = upload(A, "anh-1.png", data)
check("Tải lên đúng -> 200", code == 200, code)
check("Tải lên lần 2 vào cùng chỗ -> 409", requests.put(url, data=data).status_code == 409)
tampered = url.replace("exp=", "exp=9")
check("Sửa thời hạn trong link -> 403", requests.put(tampered, data=data).status_code == 403)
ids = [uid] + [upload(A, f"anh-{i}.png", png((40, 40 * i, 200)))[0] for i in (2, 3)]
txt_id, _, _ = upload(A, "ghi-chu.txt", b"khong phai anh")

# ---------- Tạo lô ----------
r = requests.post(f"{API}/v1/batches", headers=bearer(A), json={"type": "compress-image", "uploadIds": [txt_id]})
check("Lô với file sai đuôi -> 400", r.status_code == 400, r.json().get("error"))
r = requests.post(f"{API}/v1/batches", headers=bearer(A),
                  json={"type": "compress-image", "uploadIds": ids, "options": {"level": "khong-co"}})
check("Lô với tuỳ chọn sai -> 400", r.status_code == 400, r.json().get("error"))
r1 = requests.post(f"{API}/v1/batches", headers={**bearer(A), "Idempotency-Key": "lo-thu-1"},
                   json={"type": "compress-image", "uploadIds": ids, "externalId": "don-123"})
r2 = requests.post(f"{API}/v1/batches", headers={**bearer(A), "Idempotency-Key": "lo-thu-1"},
                   json={"type": "compress-image", "uploadIds": ids})
batch = r1.json()
check("Tạo lô 3 ảnh -> 201", r1.status_code == 201 and batch["counts"]["total"] == 3, r1.status_code)
check("Gửi lại cùng Idempotency-Key -> cùng lô, không tạo thêm", r2.status_code == 200 and r2.json()["id"] == batch["id"])
check("Lô giữ đúng thứ tự file", [j["uploadId"] for j in batch["jobs"]] == ids)

# ---------- Mỗi app chỉ thấy của mình ----------
check("App B xem lô của app A -> 404",
      requests.get(f"{API}/v1/batches/{batch['id']}", headers=bearer(B)).status_code == 404)
check("App B xem job của app A -> 404",
      requests.get(f"{API}/v1/jobs/{batch['jobs'][0]['id']}", headers=bearer(B)).status_code == 404)
r = requests.post(f"{API}/v1/batches", headers=bearer(B), json={"type": "compress-image", "uploadIds": ids})
check("App B dùng file của app A -> 400", r.status_code == 400)

# ---------- Huỷ lô (khi worker còn tắt nên job còn đang chờ) ----------
c_ids = [upload(A, f"huy-{i}.png", png((i * 50, 120, 60)))[0] for i in (1, 2)]
lot2 = requests.post(f"{API}/v1/batches", headers=bearer(A), json={"type": "compress-image", "uploadIds": c_ids}).json()
r = requests.post(f"{API}/v1/batches/{lot2['id']}/cancel", headers=bearer(A)).json()
check("Huỷ lô 2 job đang chờ", r["cancelled"] == 2 and r["batch"]["finished"], r["cancelled"])

# ---------- Ưu tiên: job lẻ của trang web tạo SAU lô vẫn được làm TRƯỚC ----------
web = requests.post(f"{API}/api/jobs/", data={"type": "compress-image"}, files={"file": ("trang-web.png", png((9, 9, 9)))}).json()

# ---------- Bật worker thật ----------
env = dict(os.environ, API_URL=API, WORKER_KEY=WORKER_KEY, WORKER_PROFILE="main", PYTHONIOENCODING="utf-8")
python = WORKER_DIR / ".venv" / "Scripts" / "python.exe"
if not python.exists():
    python = WORKER_DIR / ".venv" / "bin" / "python"
log = open(Path(os.environ.get("SMOKE_LOG", "smoke_worker.log")), "w", encoding="utf-8")
worker = subprocess.Popen([str(python), "main.py"], cwd=WORKER_DIR, env=env, stdout=log, stderr=subprocess.STDOUT)
try:
    done = wait_batch(A, batch["id"])
    check("Lô xong 3/3", done["counts"]["done"] == 3, done["counts"])
    web_job = requests.get(f"{API}/api/jobs/{web['id']}").json()
    first_batch_end = min(j["updatedAt"] for j in done["jobs"])
    check("Job trang web (tạo sau) xong trước các job trong lô", web_job["updatedAt"] < first_batch_end,
          f"{web_job['updatedAt'][11:23]} < {first_batch_end[11:23]}")

    # ---------- Lấy kết quả ----------
    job0 = done["jobs"][0]
    res = requests.get(f"{API}/v1/jobs/{job0['id']}/result", headers=bearer(A)).json()
    got = requests.get(res["url"])
    img = Image.open(io.BytesIO(got.content))
    check("Tải kết quả qua link tạm: đúng dung lượng, mở được ảnh",
          got.status_code == 200 and len(got.content) == res["size"] and img.size == (400, 300),
          f"{res['fileName']}, {res['size']} byte")
    bad = res["url"].replace("name=", "name=khac-")
    check("Sửa tên file trong link tải -> 403", requests.get(bad).status_code == 403)
    check("Dùng link tải về để tải lên -> 403", requests.put(res["url"], data=b"x").status_code == 403)

    # ---------- Quản trị: nguồn job, thử lại job đã huỷ ----------
    ov = requests.get(f"{API}/api/admin/overview", headers=ADMIN).json()
    sources = {j["source"] for j in ov["recent"]}
    check("Overview ghi đúng nguồn job", {"App thử A", "Trang web"} <= sources, sources)
    check("Overview đếm job đã huỷ", ov["totals"]["cancelled"] == 2, ov["totals"])
    cancelled_job = lot2["jobs"][0]["id"]
    r = requests.post(f"{API}/api/admin/jobs/{cancelled_job}/retry", headers=ADMIN)
    check("Thử lại job đã huỷ -> 200", r.status_code == 200, r.status_code)
    for _ in range(60):
        if requests.get(f"{API}/v1/jobs/{cancelled_job}", headers=bearer(A)).json()["status"] == "Done":
            break
        time.sleep(1)
    check("Job đã huỷ được thử lại và xong",
          requests.get(f"{API}/v1/jobs/{cancelled_job}", headers=bearer(A)).json()["status"] == "Done")
finally:
    worker.kill()

# ---------- Khoá app ----------
requests.post(f"{API}/api/admin/clients/{b['id']}/disable", headers=ADMIN)
check("App B bị khoá -> 401", requests.get(f"{API}/v1/job-types", headers=bearer(B)).status_code == 401)
check("App A vẫn dùng được", requests.get(f"{API}/v1/job-types", headers=bearer(A)).status_code == 200)

print("\nTẤT CẢ ĐÚNG" if ok_all else "\nCÓ CHỖ SAI")
sys.exit(0 if ok_all else 1)
