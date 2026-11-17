import { Route, Routes } from "react-router-dom";
import { JobTypesProvider } from "@/catalog/JobTypesContext";
import HomePage from "@/pages/HomePage";
import ToolPage from "@/pages/ToolPage";
import Layout from "./Layout";

// Định tuyến: "/" trang chủ, "/:slug" trang công cụ (slug không có thì ToolPage hiện "Không tìm thấy trang").
export default function App() {
  return (
    <JobTypesProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path=":slug" element={<ToolPage />} />
        </Route>
      </Routes>
    </JobTypesProvider>
  );
}
