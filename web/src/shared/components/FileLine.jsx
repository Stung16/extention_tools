// Dòng hiện file đã chọn: tên, thông tin phụ (dung lượng, số trang), nút "Đổi file".
export default function FileLine({ name, detail, onChange }) {
  return (
    <div className="file-line">
      <span>{name}</span>
      <small>{detail}</small>
      <button type="button" className="link" onClick={onChange}>
        Đổi file
      </button>
    </div>
  );
}
