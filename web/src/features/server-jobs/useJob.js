import { useCallback, useEffect, useRef, useState } from "react";
import { createJob, getJob } from "@/api/jobsApi";
import { errorOf, phaseOf, POLL_MS, RETRY_MS } from "./jobProgress";

// Theo dõi một job trên máy chủ: tải file lên -> chờ -> xử lý -> xong/lỗi.
//   const { state, start, reset } = useJob();
//   start(formData)   gửi yêu cầu (form tạo bằng buildJobForm)
//   state             { phase, progress?, id?, job?, waited?, error? } (phase: xem jobProgress.js)
export default function useJob() {
  const [state, setState] = useState({ phase: "idle" });
  const alive = useRef(true); // false khi người dùng rời trang: dừng hỏi trạng thái
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
      setState({ phase: "error", error: e.message });
      return;
    }

    const startedAt = Date.now();
    const check = async () => {
      if (!alive.current) return;
      let job;
      try {
        job = await getJob(id);
      } catch {
        timer.current = setTimeout(check, RETRY_MS);
        return;
      }
      if (!alive.current) return;
      const phase = phaseOf(job);
      if (phase === "done") return setState({ phase, id, job });
      if (phase === "error") return setState({ phase, error: errorOf(job) });
      setState({ phase, id, job, waited: (Date.now() - startedAt) / 1000 });
      timer.current = setTimeout(check, POLL_MS);
    };
    check();
  }, []);

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    setState({ phase: "idle" });
  }, []);

  return { state, start, reset };
}
