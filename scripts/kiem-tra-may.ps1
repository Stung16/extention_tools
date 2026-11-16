# Kiểm tra máy đã cài đủ để chạy Công Cụ File chưa (máy RTX hoặc máy phát triển).
# Chạy ở thư mục dự án:
#   powershell -ExecutionPolicy Bypass -File scripts\kiem-tra-may.ps1
# Script chỉ ĐỌC, không cài hay sửa gì. Xem hướng dẫn cài ở docs\cai-dat-may-rtx.md.

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent
$script:missing = 0
$script:warnings = 0

function Ok($name, $detail) { Write-Host ("  [OK]    {0}  {1}" -f $name, $detail) -ForegroundColor Green }
function Missing($name, $hint) { $script:missing++; Write-Host ("  [THIẾU] {0}  -> {1}" -f $name, $hint) -ForegroundColor Red }
function Warn($name, $hint) { $script:warnings++; Write-Host ("  [CHÚ Ý] {0}  -> {1}" -f $name, $hint) -ForegroundColor Yellow }
function Section($title) { Write-Host ""; Write-Host $title -ForegroundColor Cyan }
function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function FirstLine($text) { if ($text) { return (($text | Out-String).Trim() -split "`r?`n")[0] } return "" }

# Tìm chương trình giống worker\handlers\photo.py: biến môi trường, PATH, rồi thư mục cài chuẩn.
function Find-Program($envName, $cmdName, $patterns) {
    $configured = [Environment]::GetEnvironmentVariable($envName)
    if ($configured) { if (Test-Path $configured) { return $configured } else { return $null } }
    $cmd = Get-Command $cmdName -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    foreach ($p in $patterns) {
        $found = Get-ChildItem $p -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    return $null
}

Write-Host "Kiểm tra máy cho Công Cụ File ($root)" -ForegroundColor White

# ---------------------------------------------------------------------------
Section "1. Phần mềm"

if (Has 'nvidia-smi') {
    $gpu = FirstLine (& nvidia-smi --query-gpu=driver_version,name --format=csv,noheader 2>$null)
    $driver = ($gpu -split ',')[0].Trim()
    $major = 0; [void][int]::TryParse(($driver -split '\.')[0], [ref]$major)
    if ($major -ge 570) { Ok "Driver NVIDIA" $gpu } else { Missing "Driver NVIDIA $driver" "cần bản 570 trở lên (CUDA 12.8 cho RTX 50)" }
} else { Warn "Driver NVIDIA" "không thấy nvidia-smi: máy không có GPU NVIDIA thì worker AI chạy CPU (chậm)" }

if (Has 'git') { Ok "Git" (FirstLine (& git --version)) } else { Missing "Git" "cài Git" }

if (Has 'docker') {
    $server = FirstLine (& docker info --format '{{.ServerVersion}}' 2>$null)
    if ($server) { Ok "Docker" "đang chạy, bản $server" } else { Missing "Docker" "đã cài nhưng chưa chạy: mở Docker Desktop" }
} else { Missing "Docker Desktop" "cài Docker Desktop (bật WSL 2)" }

if (Has 'dotnet') {
    $sdks = (& dotnet --list-sdks 2>$null) | Out-String
    if ($sdks -match '(^|\n)10\.') { Ok ".NET SDK 10" (FirstLine ($sdks -split "`n" | Where-Object { $_ -match '^10\.' })) }
    else { Missing ".NET SDK 10" "cài .NET SDK 10 (đang có: $((FirstLine $sdks)))" }
} else { Missing ".NET SDK 10" "cài .NET SDK 10" }

if (Has 'python') {
    $pv = FirstLine (& python --version 2>&1)
    if ($pv -match '3\.12') { Ok "Python 3.12" $pv } else { Warn "Python" "đang là '$pv', dự án đã thử với 3.12" }
} else { Missing "Python 3.12" "cài Python 3.12, tick 'Add python.exe to PATH'" }

if (Has 'node') {
    $nv = FirstLine (& node --version)
    if ($nv -match '^v22\.') { Ok "Node.js 22" $nv } else { Warn "Node.js" "đang là $nv, dự án đã thử với 22" }
} else { Missing "Node.js 22" "cài Node.js 22 (chỉ cần khi build trang web)" }

if (Has 'ffmpeg') { Ok "FFmpeg" (FirstLine (& ffmpeg -hide_banner -version 2>$null)) } else { Missing "FFmpeg" "winget install Gyan.FFmpeg, rồi mở lại terminal" }

if (Has 'cargo') { Ok "Rust" (FirstLine (& cargo --version)) } else { Missing "Rust" "cài từ https://rustup.rs (cần cho app giám sát)" }

$rt = Find-Program 'RAWTHERAPEE_CLI' 'rawtherapee-cli' @('C:\Program Files\RawTherapee\*\rawtherapee-cli.exe', 'C:\Program Files\RawTherapee\rawtherapee-cli.exe')
if ($rt) {
    $rtProfile = Join-Path (Split-Path $rt -Parent) 'profiles\Auto-Matched Curve - ISO Low.pp3'
    if (Test-Path $rtProfile) { Ok "RawTherapee" $rt } else { Warn "RawTherapee" "có $rt nhưng không thấy profile 'Auto-Matched Curve - ISO Low.pp3' (worker photo cần)" }
} else { Missing "RawTherapee" "cài bản Windows từ rawtherapee.com (hoặc đặt biến RAWTHERAPEE_CLI)" }

$et = Find-Program 'EXIFTOOL' 'exiftool' @('C:\Tools\exiftool\exiftool.exe', 'C:\Tools\exiftool*\exiftool.exe')
if ($et) { Ok "ExifTool" ("{0} (bản {1})" -f $et, (FirstLine (& $et -ver 2>$null))) }
else { Missing "ExifTool" "tải từ exiftool.org, đổi tên thành exiftool.exe, để ở C:\Tools\exiftool\ (hoặc đặt biến EXIFTOOL)" }

# ---------------------------------------------------------------------------
Section "2. Cấu hình (.env, các file không có trên Git)"

$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
    $envText = Get-Content $envFile -Raw
    $defaults = @{ 'WORKER_KEY' = 'dev-worker-key'; 'ADMIN_KEY' = 'dev-admin-key'; 'STORAGE_SIGNING_KEY' = 'dev-storage-signing-key-chi-dung-khi-chay-thu' }
    foreach ($k in $defaults.Keys) {
        $m = [regex]::Match($envText, "(?m)^\s*$k\s*=\s*(.*)$")
        if (-not $m.Success) { Missing ".env: $k" "thêm dòng $k=... (xem .env.example)" }
        elseif ($m.Groups[1].Value.Trim() -eq $defaults[$k]) { Warn ".env: $k" "vẫn là mã mặc định, đổi trước khi mở ra internet" }
        else { Ok ".env: $k" "đã đặt" }
    }
    if ($envText -match '(?m)^\s*COMPOSE_PROFILES\s*=\s*ai') { Ok ".env: COMPOSE_PROFILES=ai" "phần AI sẽ bật khi docker compose up" }
    else { Warn ".env: COMPOSE_PROFILES" "chưa bật profile ai (bỏ dấu # ở dòng COMPOSE_PROFILES=ai nếu chạy AI bằng Docker)" }
} else { Missing ".env" "copy .env.example .env rồi sửa các mã bí mật" }

$vie = Join-Path $root 'data\stirling\tessdata\vie.traineddata'
if (Test-Path $vie) { Ok "OCR tiếng Việt" "có vie.traineddata" } else { Missing "OCR tiếng Việt" "làm mục 4 trong docs\cai-dat-may-rtx.md" }

foreach ($db in @('data\api\jobs.db', 'api\data\jobs.db')) {
    $p = Join-Path $root $db
    if (Test-Path $p) { Warn "Database $db" "nếu tạo từ bản cũ (trước 17/11/2026) và API báo lỗi cột, hãy xoá file này" }
}

# ---------------------------------------------------------------------------
Section "3. Chạy tay (bỏ qua mục này nếu chạy tất cả bằng Docker)"

if (Test-Path (Join-Path $root 'api\wwwroot\index.html')) { Ok "Trang web đã build" "api\wwwroot" }
else { Warn "Trang web chưa build" "cd web; npm install; npm run build (Docker tự build)" }

$venv = Join-Path $root 'worker\.venv\Scripts\python.exe'
if (Test-Path $venv) {
    $r = & $venv -c "import requests, PIL, pillow_heif, ezdxf; print('ok')" 2>$null
    if ($r -eq 'ok') { Ok "worker\.venv" "đủ thư viện cho worker main và photo" } else { Missing "worker\.venv" "thiếu thư viện: .venv\Scripts\pip install -r requirements.txt" }
} else { Warn "worker\.venv" "chưa tạo (cd worker; python -m venv .venv; .venv\Scripts\pip install -r requirements.txt)" }

$venvAi = Join-Path $root 'worker\.venv-ai\Scripts\python.exe'
if (Test-Path $venvAi) {
    $r = FirstLine (& $venvAi -c "import torch, faster_whisper; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else '')" 2>$null)
    if ($r -match ' True ') { Ok "worker\.venv-ai" "PyTorch thấy GPU: $r" }
    elseif ($r) { Warn "worker\.venv-ai" "PyTorch KHÔNG thấy GPU ($r): cài lại torch bản cu128" }
    else { Missing "worker\.venv-ai" "thiếu thư viện AI: xem mục 3 trong docs\cai-dat-may-rtx.md" }
} else { Warn "worker\.venv-ai" "chưa tạo (chỉ cần khi chạy worker AI bằng tay)" }

# ---------------------------------------------------------------------------
Section "4. Đang chạy"

if (Has 'docker') {
    $running = @(& docker ps --format '{{.Names}}' 2>$null)
    foreach ($c in @('stirling-pdf', 'gotenberg', 'ollama', 'api', 'worker', 'worker-photo', 'worker-ai')) {
        if ($running -contains $c) { Ok "Container $c" "đang chạy" } else { Write-Host ("  [ ]     Container {0}  chưa chạy" -f $c) -ForegroundColor DarkGray }
    }
}

try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:5100/api/job-types' -UseBasicParsing -TimeoutSec 3
    Ok "API http://localhost:5100" "trả lời HTTP $($resp.StatusCode)"
} catch { Write-Host "  [ ]     API http://localhost:5100  chưa chạy" -ForegroundColor DarkGray }

if (Test-Path (Join-Path $root 'monitor\target\release\monitor.exe')) { Ok "App giám sát" "monitor\target\release\monitor.exe" }
else { Warn "App giám sát chưa build" "cd monitor; cargo run --release" }

# ---------------------------------------------------------------------------
Write-Host ""
if ($script:missing -eq 0) {
    Write-Host ("Đủ phần bắt buộc. Có {0} mục cần chú ý (màu vàng)." -f $script:warnings) -ForegroundColor Green
} else {
    Write-Host ("Còn thiếu {0} mục (màu đỏ), {1} mục cần chú ý. Xem docs\cai-dat-may-rtx.md." -f $script:missing, $script:warnings) -ForegroundColor Red
}
