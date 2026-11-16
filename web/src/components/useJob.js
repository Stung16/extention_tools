import { useCallback, useEffect, useRef, useState } from "react";
import { createJob, getJob } from "../lib/api";

// Theo dõi một job trên máy chủ: tải file lên -> chờ -> xử lý -> xong/lỗi.
// state.phase: "idle" | "uploading" | "waiting" | "processing" | "done" | "error"
export default function useJob() {
  const [state, setState] = useState({ phase: "idle" });
  const alive = useRef(true);
  const timer = useRef(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const start = useCallback(async (formData) => {
    setState({ phase: "uploading", progress: 0 });
    let id;
    try {
      ({ id } = await createJob(formData, (p) => alive.current && setState({ phase: "uploading", progress: p })));
    } catch (e) {
      return setState({ phase: "error", error: e.message });
    }

    const startedAt = Date.now();
    const check = async () => {
      if (!alive.current) return;
      let job;
      try {
        job = await getJob(id);
      } catch {
        timer.current = setTimeout(check, 3000); // mất mạng thoáng qua: thử lại
        return;
      }
      if (!alive.current) return;
      if (job.status === "Done") return setState({ phase: "done", id, job });
      if (job.status === "Failed" || job.status === "Cancelled")
        return setState({ phase: "error", error: job.error || "Không rõ lý do." });
      setState({
        phase: job.status === "Pending" ? "waiting" : "processing",
        id,
        job,
        waited: (Date.now() - startedAt) / 1000,
      });
      timer.current = setTimeout(check, 2000);
    };
    check();
  }, []);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    setState({ phase: "idle" });
  }, []);

  return { state, start, reset };
}
