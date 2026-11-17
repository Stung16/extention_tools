import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchJobTypes } from "@/api/jobsApi";
import { isToolReady } from "./queries";

// Hỏi API một lần khi mở trang: những loại job nào đang hỗ trợ. Mọi component lấy kết quả bằng useJobTypes(),
// không phải truyền props qua nhiều tầng.
const JobTypesContext = createContext({ jobTypes: {}, loaded: false, isReady: (tool) => Boolean(tool.client) });

export function JobTypesProvider({ children }) {
  const [jobTypes, setJobTypes] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchJobTypes().then((types) => {
      if (!alive) return;
      setJobTypes(types);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const isReady = useCallback((tool) => isToolReady(tool, jobTypes), [jobTypes]);
  const value = useMemo(() => ({ jobTypes, loaded, isReady }), [jobTypes, loaded, isReady]);
  return <JobTypesContext.Provider value={value}>{children}</JobTypesContext.Provider>;
}

// { jobTypes, loaded, isReady(tool) }
export function useJobTypes() {
  return useContext(JobTypesContext);
}
