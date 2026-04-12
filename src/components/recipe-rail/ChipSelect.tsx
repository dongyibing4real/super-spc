export function ChipSelect({ onChange, options, current, resetKey }) {
  return (
    <select
      key={resetKey || current}
      className="chip-select"
      onClick={(e) => e.stopPropagation()}
      onChange={onChange}
      defaultValue={current}
    >
      {options.map(([val, label]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  );
}

export function ChipGroupSelect({ onChange, groups, current, disabledSet = new Set(), resetKey }) {
  return (
    <select
      key={resetKey || current}
      className="chip-select"
      onClick={(e) => e.stopPropagation()}
      onChange={onChange}
      defaultValue={current}
    >
      {groups.map(([group, items]) => (
        <optgroup key={group} label={group}>
          {items.map(([val, label]) => (
            <option
              key={val}
              value={val}
              disabled={disabledSet.has(val)}
            >
              {label}{disabledSet.has(val) ? " \u2014" : ""}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
