"""Worker: cứ vài giây hỏi API xem có job không, có thì xử lý rồi gửi kết quả lên.

Chạy:  python main.py   (chọn loại worker bằng biến WORKER_PROFILE: main | ai | photo | all)
Cấu hình và cấu trúc code: xem worker/README.md.
"""

from congcufile_worker.app import main

if __name__ == "__main__":
    main()
