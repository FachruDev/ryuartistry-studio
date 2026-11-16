"use client";

import { useState } from "react";

type Point = { day: string; value: number };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow >= max)!;
  return step * pow;
}

const format = (v: number, unit: "usd" | "count") =>
  unit === "usd" ? `$${v.toFixed(2)}` : v.toLocaleString("id-ID", { maximumFractionDigits: 0 });

const shortDay = (day: string) => {
  const [, m, d] = day.split("-");
  return `${Number(d)}/${Number(m)}`;
};

/**
 * Single-series column chart: <=24px columns, 4px rounded tops, square baseline, 2px gaps,
 * hairline gridlines, per-column tooltip on hover and keyboard focus, plus a table view.
 */
export function BarChart({ title, data, unit }: { title: string; data: Point[]; unit: "usd" | "count" }) {
  const [active, setActive] = useState<number | null>(null);
  let max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  // Counts need a whole-number midpoint tick (5 would label its middle "3").
  if (unit === "count" && max % 2 !== 0) max += 1;
  const ticks = [max, max / 2, 0];
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <figure className="flex flex-col gap-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-muted">{title}</span>
        <span className="text-sm">
          total <span className="font-semibold">{format(total, unit)}</span>
        </span>
      </figcaption>

      <div className="flex gap-3">
        <div className="flex h-44 flex-col justify-between pb-0 text-right font-mono text-[10px] tabular-nums text-subtle" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 first:translate-y-0 last:translate-y-1/2">
              {format(t, unit)}
            </span>
          ))}
        </div>
        <div className="relative h-44 flex-1">
          {ticks.map((t, i) => (
            <div
              key={t}
              className="absolute inset-x-0 h-px bg-hairline"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              aria-hidden="true"
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]" role="list" aria-label={title} onPointerLeave={() => setActive(null)}>
            {data.map((d, i) => {
              const h = (d.value / max) * 100;
              return (
                <div
                  key={d.day}
                  role="listitem"
                  tabIndex={0}
                  aria-label={`${d.day}: ${format(d.value, unit)}`}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  className="relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
                >
                  <div
                    className={`w-full max-w-[24px] rounded-t-[4px] bg-accent transition-opacity duration-300 ease-fluid ${
                      active === null || active === i ? "opacity-100" : "opacity-40"
                    }`}
                    style={{ height: d.value > 0 ? `max(${h}%, 2px)` : "0px" }}
                  />
                  {active === i && (
                    <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-xl bg-core px-3 py-2 text-left shadow-[var(--ambient)] ring-1 ring-hairline">
                      <p className="text-sm font-semibold">{format(d.value, unit)}</p>
                      <p className="text-xs text-muted">{d.day}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex justify-between pl-12 font-mono text-[10px] text-subtle" aria-hidden="true">
        <span>{data[0] && shortDay(data[0].day)}</span>
        <span>{data.length > 2 && shortDay(data[Math.floor(data.length / 2)].day)}</span>
        <span>{data.at(-1) && shortDay(data.at(-1)!.day)}</span>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted transition-colors hover:text-text">Lihat sebagai tabel</summary>
        <table className="mt-3 w-full text-xs">
          <thead className="text-left text-subtle">
            <tr>
              <th className="py-1 font-medium">Tanggal</th>
              <th className="py-1 text-right font-medium">{title}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day} className="border-t border-hairline">
                <td className="py-1 font-mono">{d.day}</td>
                <td className="py-1 text-right font-mono tabular-nums">{format(d.value, unit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
