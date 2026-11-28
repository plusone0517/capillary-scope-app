// 顧客ごとの経過グラフ（本数の推移）の計算。
// 数値の変化は事実の表示に留め、良し悪しの判定はしない（compare.ts と同じ方針）。

export type TrendInput = { id: string; observedAt: string; value: number | null };
export type TrendPoint = { id: string; observedAt: string; value: number; x: number; y: number };

export type TrendLayout = {
  points: TrendPoint[];
  yTicks: { value: number; y: number }[];
  yMin: number;
  yMax: number;
};

/** 目盛りの間隔（1・2・5 の倍数で、目盛りが多くなりすぎないもの）。 */
export function niceStep(range: number, maxTicks = 5): number {
  const raw = range / Math.max(1, maxTicks);
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow;
  return 10 * pow;
}

/**
 * グラフ上の位置を決める。記録のある回だけを古い順に並べる。
 * 横は日付に比例（間隔の違いが見える）、縦は値に比例。
 */
export function layoutTrend(
  input: TrendInput[],
  box: { left: number; right: number; top: number; bottom: number },
): TrendLayout {
  const rows = input
    .filter((r): r is TrendInput & { value: number } => r.value != null && Number.isFinite(r.value))
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (rows.length === 0) return { points: [], yTicks: [], yMin: 0, yMax: 0 };

  const values = rows.map((r) => r.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // 変化が小さくても線が平らに潰れすぎないよう、最低でも上下1ずつの幅を取る。
  const step = niceStep(Math.max(hi - lo, 2));
  const yMin = Math.max(0, Math.floor((lo - step * 0.5) / step) * step);
  const yMax = Math.ceil((hi + step * 0.5) / step) * step;

  const times = rows.map((r) => new Date(r.observedAt).getTime());
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const xOf = (t: number) =>
    t1 === t0 ? (box.left + box.right) / 2 : box.left + ((t - t0) / (t1 - t0)) * (box.right - box.left);
  const yOf = (v: number) => box.bottom - ((v - yMin) / (yMax - yMin)) * (box.bottom - box.top);

  const yTicks: { value: number; y: number }[] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) {
    const value = Math.round(v * 100) / 100;
    yTicks.push({ value, y: yOf(value) });
  }
  return {
    points: rows.map((r, i) => ({ ...r, x: xOf(times[i]), y: yOf(r.value) })),
    yTicks,
    yMin,
    yMax,
  };
}

/** 初回と最新の差（事実の表示用）。記録が2回未満なら null。 */
export function firstToLatest(input: TrendInput[]): { first: number; latest: number; diff: number } | null {
  const rows = input
    .filter((r): r is TrendInput & { value: number } => r.value != null)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  if (rows.length < 2) return null;
  const first = rows[0].value;
  const latest = rows[rows.length - 1].value;
  return { first, latest, diff: Math.round((latest - first) * 10) / 10 };
}
