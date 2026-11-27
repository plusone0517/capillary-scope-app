// パターン模式図（SVG線画）。正本チャートから抽出した描画データを
// そのまま描く。選択カードとレポートの「一致した形」カードで共用する。
// 描画色は正本の赤系で、明るい背景の上に置く前提（ダークモードでも同じ見え方）。

import { DIAGRAM_VIEWBOX, patternDiagrams } from "./patternDiagrams";

export function PatternDiagram({
  code,
  title,
  className,
}: {
  code: string;
  /** スクリーンリーダー向けの図の説明（例：「正常の模式図」）。 */
  title?: string;
  className?: string;
}) {
  const diagram = patternDiagrams[code];
  if (!diagram) return null;
  return (
    <svg
      viewBox={DIAGRAM_VIEWBOX}
      role="img"
      aria-label={title}
      className={className}
      style={{ backgroundColor: "#ffffff" }}
    >
      {diagram.paths.map((p, i) => (
        <path
          key={`p${i}`}
          d={p.d}
          fill="none"
          stroke={p.stroke}
          strokeWidth={p.width}
          strokeLinecap="round"
          opacity={p.opacity}
        />
      ))}
      {diagram.circles.map((c, i) => (
        <circle
          key={`c${i}`}
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill={c.fill ?? "none"}
          stroke={c.stroke}
          strokeWidth={c.strokeWidth}
          opacity={c.opacity}
        />
      ))}
    </svg>
  );
}
