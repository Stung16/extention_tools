"""Làm nét ảnh bằng AI (Real-ESRGAN): phóng to 2 hoặc 4 lần mà vẫn sắc nét.

Mô hình Real-ESRGAN (giấy phép BSD-3) được nạp bằng thư viện spandrel; file mô hình tự tải lần đầu.
Ảnh được chia thành từng ô nhỏ để xử lý, nhờ vậy ảnh lớn không làm tràn bộ nhớ.
"""

from pathlib import Path

from PIL import Image

from .ai_common import download_once, log, models_dir, torch_device

MODELS = {
    "2": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth",
    "4": "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth",
}
# Giới hạn cạnh dài của ảnh vào, để thời gian xử lý và ảnh kết quả không quá lớn.
MAX_INPUT_SIDE = {"2": 3000, "4": 1500}

_loaded = {}


def _model(scale: str):
    if scale not in _loaded:
        import torch
        from spandrel import ModelLoader

        path = download_once(MODELS[scale], models_dir() / "realesrgan" / Path(MODELS[scale]).name)
        device = torch_device()
        model = ModelLoader().load_from_file(str(path)).eval().to(device)
        if device == "cuda":
            model = model.half()  # số 16-bit trên GPU: nhanh gấp đôi, tốn nửa bộ nhớ
        log.info("Nạp Real-ESRGAN x%s trên %s", scale, device)
        _loaded[scale] = (model, device)
    return _loaded[scale]


def enhance(input_path: Path, work_dir: Path, options: dict) -> Path:
    import numpy as np
    import torch

    scale = options.get("scale", "2")
    from .images import open_image, to_rgb

    image = to_rgb(open_image(input_path))
    if max(image.size) > MAX_INPUT_SIDE[scale]:
        raise ValueError(f"Ảnh quá lớn để phóng {scale} lần: cạnh dài tối đa {MAX_INPUT_SIDE[scale]}px "
                         f"(ảnh của bạn {max(image.size)}px). Hãy chọn gấp 2 lần hoặc dùng ảnh nhỏ hơn.")

    model, device = _model(scale)
    dtype = torch.float16 if device == "cuda" else torch.float32
    x = torch.from_numpy(np.asarray(image)).permute(2, 0, 1).unsqueeze(0).to(device, dtype) / 255.0

    tile, pad = (512 if device == "cuda" else 256), 16
    _, _, h, w = x.shape
    s = int(scale)
    result = torch.zeros((1, 3, h * s, w * s), dtype=dtype, device=device)
    with torch.no_grad():
        for top in range(0, h, tile):
            for left in range(0, w, tile):
                # Lấy ô kèm viền 16px để chỗ nối giữa các ô không bị lộ.
                t0, l0 = max(top - pad, 0), max(left - pad, 0)
                t1, l1 = min(top + tile + pad, h), min(left + tile + pad, w)
                out = model(x[:, :, t0:t1, l0:l1])
                bottom, right = min(top + tile, h), min(left + tile, w)
                result[:, :, top * s:bottom * s, left * s:right * s] = \
                    out[:, :, (top - t0) * s:(bottom - t0) * s, (left - l0) * s:(right - l0) * s]

    array = (result.squeeze(0).permute(1, 2, 0).clamp(0, 1) * 255).round().byte().cpu().numpy()
    big = Image.fromarray(array)

    ext = input_path.suffix.lower()
    if ext == ".png":
        out = work_dir / "output.png"
        big.save(out, "PNG")
    elif ext == ".webp":
        out = work_dir / "output.webp"
        big.save(out, "WEBP", quality=92)
    else:
        out = work_dir / "output.jpg"
        big.save(out, "JPEG", quality=94)
    return out
