// Nhóm nút tròn chọn một trong nhiều (mức nén, cách tách trang...).
//   options  [{ value, label }]
export default function ChoiceGroup({ legend, name, options, value, onChange, first = false }) {
  return (
    <fieldset className={"option" + (first ? " first" : "")}>
      <legend>{legend}</legend>
      <div className="choices">
        {options.map((o) => (
          <label key={o.value} className={"choice" + (value === o.value ? " checked" : "")}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
