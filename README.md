# local-tools

Các công cụ xử lý file chạy trên máy local bằng Docker.

## Cần cài trước

- Git
- Docker Desktop (bật "Use the WSL 2 based engine")
- Máy có card NVIDIA: driver NVIDIA mới nhất, cài trên Windows

## Chạy trên một máy mới

```
git clone <địa chỉ repo của bạn>
cd local-tools
docker compose up -d
```

Kiểm tra:

- Stirling-PDF: mở http://localhost:8080
- Gotenberg: mở http://localhost:3000/health

## Cập nhật khi có thay đổi

```
git pull
docker compose up -d
```

## Dừng tất cả

```
docker compose down
```
