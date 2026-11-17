import { useState } from "react";
import ChoiceGroup from "@/shared/components/ChoiceGroup";
import FileLine from "@/shared/components/FileLine";
import { ErrorText, OkText } from "@/shared/components/Messages";
import PickFilePanel from "@/shared/components/PickFilePanel";
import useTask from "@/shared/hooks/useTask";
import { downloadBlob, readBytes, stemOf } from "@/shared/lib/files";
import { formatSize } from "@/shared/lib/format";
import { loadForEdit } from "./pdfDocument";
import { bundleOutputs, pageGroups, splitPdf } from "./operations/split";

const SPLIT_MODES = [
  { value: "each", label: "Mỗi trang một file" },
  { value: "every", label: "Cứ mỗi N trang một file" },
  { value: "ranges", label: "Theo khoảng trang tự chọn" },
];

// Tách PDF ngay trên trình duyệt: mỗi trang một file, cứ N trang một file, hoặc theo khoảng trang.
// Nhiều file thì gói .zip.
export default function SplitPdf() {
  const [file, setFile] = useState(null); // { file, bytes, pageCount }
  const [mode, setMode] = useState("each");
  const [ranges, setRanges] = useState("");
  const [every, setEvery] = useState("2");
  const [done, setDone] = useState("");
  const { busy, error, setError, run } = useTask();

  async function pick([f]) {
    setError("");
    setDone("");
    try {
      const bytes = await readBytes(f);
      const doc = await loadForEdit(bytes);
      setFile({ file: f, bytes, pageCount: doc.getPageCount() });
    } catch (e) {
      setError(e.message);
    }
  }

  const split = () =>
    run(async () => {
      const groups = pageGroups(mode, file.pageCount, { every, ranges });
      const base = stemOf(file.file.name);
      const outputs = await splitPdf(file.bytes, groups, base);
      const result = await bundleOutputs(outputs, `${base}-da-tach.zip`);
      downloadBlob(result.bytes, result.name, result.type);
      setDone(`Đã tách thành ${outputs.length} file${outputs.length > 1 ? " (gói trong file .zip)" : ""}.`);
    });

  if (!file) return <PickFilePanel onFiles={pick} error={error} />;

  return (
    <div className="panel">
      <FileLine
        name={file.file.name}
        detail={`${file.pageCount} trang · ${formatSize(file.file.size)}`}
        onChange={() => setFile(null)}
      />
      <ChoiceGroup legend="Cách tách" name="split-mode" options={SPLIT_MODES} value={mode} onChange={setMode} />
      {mode === "every" && (
        <div className="option">
          <label className="option-label" htmlFor="every">
            Số trang mỗi file
          </label>
          <input
            id="every"
            className="text-input"
            type="number"
            min="1"
            value={every}
            onChange={(e) => setEvery(e.target.value)}
          />
        </div>
      )}
      {mode === "ranges" && (
        <div className="option">
          <label className="option-label" htmlFor="ranges">
            Các khoảng trang (mỗi khoảng một file)
          </label>
          <input
            id="ranges"
            className="text-input"
            value={ranges}
            placeholder="Ví dụ: 1-3, 4-6, 8"
            onChange={(e) => setRanges(e.target.value)}
          />
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <OkText>{done}</OkText>
      <button className="btn" type="button" disabled={busy} onClick={split}>
        {busy ? "Đang tách..." : "Tách PDF"}
      </button>
    </div>
  );
}
