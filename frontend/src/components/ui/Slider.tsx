"use client";

import { ChangeEvent } from "react";

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
}) {
  const handle = (e: ChangeEvent<HTMLInputElement>) =>
    onChange(parseFloat(e.target.value));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs font-medium text-ink-700">
        <span>{label}</span>
        <span className="font-mono text-ink-500">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={handle}
        className="block h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-200 accent-brand-600"
      />
    </div>
  );
}
