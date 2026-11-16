# Image chạy API .NET kèm trang web React.
# Build từ thư mục gốc dự án (docker-compose.yml đã cấu hình sẵn):
#   docker compose build api

# Bước 1: đóng gói trang React (thư mục web/) ra wwwroot của project API
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN mkdir -p /src/api/src/CongCuFile.Api/wwwroot && npm run build

# Bước 2: build API .NET (solution nhiều project: chép file .csproj trước để Docker nhớ bước restore)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
WORKDIR /src/api
COPY api/Directory.Build.props api/.editorconfig ./
COPY api/src/CongCuFile.Domain/CongCuFile.Domain.csproj src/CongCuFile.Domain/
COPY api/src/CongCuFile.Application/CongCuFile.Application.csproj src/CongCuFile.Application/
COPY api/src/CongCuFile.Infrastructure/CongCuFile.Infrastructure.csproj src/CongCuFile.Infrastructure/
COPY api/src/CongCuFile.Api/CongCuFile.Api.csproj src/CongCuFile.Api/
RUN dotnet restore src/CongCuFile.Api/CongCuFile.Api.csproj
COPY api/src/ ./src/
RUN dotnet publish src/CongCuFile.Api/CongCuFile.Api.csproj -c Release -o /out --no-restore

# Bước 3: image chạy thật, chỉ chứa phần cần thiết (nhẹ hơn nhiều so với bản có SDK)
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /out ./
COPY --from=web /src/api/src/CongCuFile.Api/wwwroot ./wwwroot
# Database và file tải lên nằm ở /data (gắn ra thư mục data/api của máy, xem docker-compose.yml)
ENV ASPNETCORE_URLS=http://+:8080 \
    DataDir=/data
EXPOSE 8080
ENTRYPOINT ["dotnet", "CongCuFile.Api.dll"]
