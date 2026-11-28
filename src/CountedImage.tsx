// 観察画像の上に、本数を数えた位置（番号つきの点）と数えた範囲（線）を重ねて出す。
// レポートと印刷で使う。数えた記録が無いとき・画像の形が記録と合わないときは、画像だけを出す。
import { useState } from "react";
import type { DensityMeasurement } from "./densityCount";

export function CountedImage({
  src,
  alt,
  measurement,
}: {
  src: string;
  alt: string;
  /** 数えた記録（この画像で数えたもの）。無ければ画像だけ。 */
  measurement: DensityMeasurement | null;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // 記録は「数えたときの代表画像」に対する位置。縦横の比が違う画像には重ねない。
  const fits =
    measurement != null &&
    natural != null &&
    Math.abs(natural.w / natural.h - measurement.imageWidthPx / measurement.imageHeightPx) <
      0.02 * (natural.w / natural.h);
  const w = measurement?.imageWidthPx ?? 1;
  const h = measurement?.imageHeightPx ?? 1;
  const unit = w / 400;
  const px = (p: { x: number; y: number }) => ({ x: p.x * w, y: p.y * h });
  const line = measurement ? { start: px(measurement.line.start), end: px(measurement.line.end) } : null;
  const len = line ? Math.hypot(line.end.x - line.start.x, line.end.y - line.start.y) || 1 : 1;
  const tick = line
    ? { x: -(line.end.y - line.start.y) / len, y: (line.end.x - line.start.x) / len }
    : { x: 0, y: 1 };
  const ratio = natural ? natural.w / natural.h : measurement ? w / h : null;

  return (
    <figure
      className="r-figure relative mx-auto w-full overflow-hidden rounded-[var(--radius)]"
      style={
        ratio
          ? ({ aspectRatio: String(ratio), "--fig-ratio": String(ratio) } as React.CSSProperties)
          : undefined
      }
    >
      <img
        src={src}
        alt={alt}
        onLoad={(e) =>
          setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
        className="block h-full w-full"
      />
      {fits && measurement && line && (
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`数えた位置（${measurement.count}本）と数えた範囲`}
        >
          <line
            x1={line.start.x}
            y1={line.start.y}
            x2={line.end.x}
            y2={line.end.y}
            stroke="rgba(0,0,0,0.55)"
            strokeWidth={unit * 2.2}
            strokeLinecap="round"
          />
          <line
            x1={line.start.x}
            y1={line.start.y}
            x2={line.end.x}
            y2={line.end.y}
            stroke="#ffffff"
            strokeWidth={unit * 1.1}
            strokeLinecap="round"
          />
          {[line.start, line.end].map((p, i) => (
            <line
              key={i}
              x1={p.x - tick.x * unit * 7}
              y1={p.y - tick.y * unit * 7}
              x2={p.x + tick.x * unit * 7}
              y2={p.y + tick.y * unit * 7}
              stroke="#ffffff"
              strokeWidth={unit * 1.1}
            />
          ))}
          {measurement.points.map(px).map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={unit * 3.4}
                fill="rgba(29,95,168,0.9)"
                stroke="#ffffff"
                strokeWidth={unit * 0.8}
              />
              <text
                x={p.x}
                y={p.y + unit * 1.4}
                textAnchor="middle"
                fontSize={unit * 3.8}
                fontWeight="bold"
                fill="#ffffff"
              >
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
      )}
    </figure>
  );
}
