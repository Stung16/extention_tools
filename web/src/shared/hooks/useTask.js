import { useCallback, useState } from "react";

// Chạy một việc tốn thời gian (lưu PDF, gộp file...) và giữ trạng thái "đang chạy" + câu lỗi.
//   const { busy, error, setError, run } = useTask();
//   run(async () => { ... });   // lỗi ném ra trong hàm sẽ hiện thành câu báo lỗi
export default function useTask() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (work) => {
    setBusy(true);
    setError("");
    try {
      return await work();
    } catch (e) {
      setError(e.message || "Có lỗi xảy ra.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
