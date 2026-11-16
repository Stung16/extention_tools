import { useCallback, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { loadJobTypes } from "./lib/api";
import Home from "./pages/Home";
import ToolPage from "./pages/ToolPage";

// Định tuyến: "/" trang chủ, "/:slug" trang công cụ.
export default function App() {
  const [jobTypes, setJobTypes] = useState({});

  useEffect(() => {
    loadJobTypes().then(setJobTypes);
  }, []);

  // Công cụ dùng được khi: chạy trên trình duyệt, hoặc API có hỗ trợ loại job của nó.
  const isReady = useCallback((tool) => Boolean(tool.client || (tool.job && jobTypes[tool.job])), [jobTypes]);

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home isReady={isReady} />} />
        <Route path=":slug" element={<ToolPage jobTypes={jobTypes} isReady={isReady} />} />
      </Route>
    </Routes>
  );
}
