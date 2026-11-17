// Dòng báo lỗi / báo thành công. Không có nội dung thì không hiện gì.

export function ErrorText({ children }) {
  return children ? <p className="error-text">{children}</p> : null;
}

export function OkText({ children }) {
  return children ? <p className="ok-text">{children}</p> : null;
}
