// 本数（密度）の推移グラフ。顧客の画面では、点を押すとその回のレポートを開く。
// レポートの中では、押せない図として出し、その回の点を塗りつぶして示す。
import { firstToLatest, layoutTrend, type TrendInput } from "./trend";
import { formatSigned } from "./compare";

const W = 720;
const H = 260;
const BOX = { left: 56, right: 690, top: 34, bottom: 200 };

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function TrendChart({
  rows,
  onOpen,
  highlightId,
  latestLabel = "最新",
  large = false,
}: {
  rows: TrendInput[];
  /** 点を押したときに開く（渡さなければ、押せない図になる）。 */
  onOpen?: (id: string) => void;
  /** 塗りつぶして示す回（レポートでは、そのレポートの回）。 */
  highlightId?: string;
  /** いちばん新しい回の呼び方（レポートでは「今回」）。 */
  latestLabel?: string;
  /** 図の中の文字を大きくする（レポート・印刷用）。 */
  large?: boolean;
}) {
  const k = large ? 1.4 : 1;
  const gap = 84 * k;
  // 点は枠の内側に少し寄せる（最初の点の数値が縦軸の目盛りと重ならないようにする）。
  const layout = layoutTrend(rows, { ...BOX, left: BOX.left + 30, right: BOX.right - 30 });
  const change = firstToLatest(rows);
  if (layout.points.length === 0) {
    return (
      <p className="text-lg text-[var(--dim)]">
        本数の記録がまだありません。観察のときに「本数を数える」で記録すると、ここに推移が出ます。
      </p>
    );
  }
  const path = layout.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  // 日付ラベルが重ならないよう、近すぎる点のラベルは間引く（最初と最後は必ず出す）。
  let lastLabelX = -Infinity;
  const labelled = layout.points.map((p, i) => {
    const isEdge = i === 0 || i === layout.points.length - 1;
    const show = isEdge || p.x - lastLabelX >= gap;
    if (show && !(isEdge && i === layout.points.length - 1 && p.x - lastLabelX < gap && i !== 0))
      lastLabelX = p.x;
    return show;
  });
  if (layout.points.length >= 2) {
    const n = layout.points.length;
    // 最後のラベルと直前のラベルが近い場合は、直前を消して最後を残す。
    for (let i = n - 2; i > 0; i--) {
      if (labelled[i] && layout.points[n - 1].x - layout.points[i].x < gap) labelled[i] = false;
      else break;
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {change && (
        <p className={large ? "r-small" : "text-lg text-[var(--text)]"}>
          初回 <strong>{change.first}</strong> 本/mm → {latestLabel}{" "}
          <strong className={large ? "r-num" : "text-2xl text-[var(--heading)]"}>{change.latest}</strong> 本/mm
          <span className="ml-2 text-[var(--dim)]">（{formatSigned(change.diff, 1)} 本）</span>
        </p>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="本数の推移グラフ"
        className="r-chart h-auto w-full max-w-[820px]"
      >
        <text x={BOX.left - 44} y={large ? 14 : 18} fontSize={13 * k} fill="var(--dim)">
          本/mm
        </text>
        {layout.yTicks.map((t) => (
          <g key={t.value}>
            <line x1={BOX.left} x2={BOX.right} y1={t.y} y2={t.y} stroke="var(--border)" strokeWidth="1" />
            <text x={BOX.left - 10} y={t.y + 5} fontSize={14 * k} textAnchor="end" fill="var(--dim)">
              {t.value}
            </text>
          </g>
        ))}
        {layout.points.length >= 2 && (
          <path d={path} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round" />
        )}
        {layout.points.map((p, i) => (
          <g
            key={p.id}
            {...(onOpen
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": `${shortDate(p.observedAt)} ${p.value}本/mm のレポートを開く`,
                  onClick: () => onOpen(p.id),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") onOpen(p.id);
                  },
                  style: { cursor: "pointer" },
                }
              : {})}
          >
            <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
            <circle
              cx={p.x}
              cy={p.y}
              r={p.id === highlightId ? 9 : 7}
              fill={p.id === highlightId ? "var(--accent)" : "var(--surface)"}
              stroke="var(--accent)"
              strokeWidth="3"
            />
            <text x={p.x} y={p.y - 14} fontSize={16 * k} fontWeight="bold" textAnchor="middle" fill="var(--heading)">
              {p.value}
            </text>
            {labelled[i] && (
              <text
                x={p.x}
                y={BOX.bottom + 26 * k}
                fontSize={13 * k}
                textAnchor={i === 0 && layout.points.length > 1 ? "start" : i === layout.points.length - 1 && layout.points.length > 1 ? "end" : "middle"}
                fill="var(--dim)"
              >
                {shortDate(p.observedAt)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
