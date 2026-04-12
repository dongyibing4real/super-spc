import type { ChangeEvent, MouseEvent as ReactMouseEvent } from "react";

interface ChipSelectProps {
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  options: [string, string][];
  current: string;
  resetKey?: string;
}

export function ChipSelect({ onChange, options, current, resetKey }: ChipSelectProps) {
  return (
    <select
      key={resetKey || current}
      className="chip-select"
      onClick={(e: ReactMouseEvent) => e.stopPropagation()}
      onChange={onChange}
      defaultValue={current}
    >
      {options.map(([val, label]: [string, string]) => (
        <option key={val} value={val}>{label}</option>
      ))}
    </select>
  );
}

interface ChipGroupSelectProps {
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  groups: [string, [string, string][]][];
  current: string;
  disabledSet?: Set<string>;
  resetKey?: string;
}

export function ChipGroupSelect({ onChange, groups, current, disabledSet = new Set(), resetKey }: ChipGroupSelectProps) {
  return (
    <select
      key={resetKey || current}
      className="chip-select"
      onClick={(e: ReactMouseEvent) => e.stopPropagation()}
      onChange={onChange}
      defaultValue={current}
    >
      {groups.map(([group, items]: [string, [string, string][]]) => (
        <optgroup key={group} label={group}>
          {items.map(([val, label]: [string, string]) => (
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
