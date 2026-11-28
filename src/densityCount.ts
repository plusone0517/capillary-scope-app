// 本数（密度）を「目盛り合わせ → 1mm の範囲 → 先端を数える」で記録するための計算。
//
// 経時比較の主軸は密度（本/mm）。数え方を全員でそろえるため、
// 「先端の列に沿った一定の長さの中にあるループの先端の数」を数える。
// 数えた点の位置も保存する（あとで自動計測の正解データとして使えるようにする）。
//
// 座標はすべて「元の画像のピクセル」。保存時は画像の幅・高さで割った 0〜1 の比にする。

export type Point = { x: number; y: number };

/** 保存する計測の記録（観察1件に1つ）。 */
export type DensityMeasurement = {
  method: "manual_tap";
  /** 数えた先端の位置（画像に対する 0〜1 の比）。 */
  points: Point[];
  /** 数えた範囲（線分）の両端（0〜1 の比）。 */
  line: { start: Point; end: Point };
  /** 目盛り合わせの値（元の画像の1ピクセルあたりの長さ μm）。 */
  umPerPx: number;
  /**
   * 目盛り合わせの出どころ。
   * - auto_scale: その画像に写っている目盛りを自動で読み取った（最も確か）。
   * - manual: その画像の上で人がなぞって合わせた。
   * - saved: その画像には目盛りが無く、前に合わせた値を使った（倍率が同じという前提）。
   * 旧い記録には無い。
   */
  calibrationSource?: CalibrationSource;
  /** 計測した画像の元の大きさ（ピクセル）。 */
  imageWidthPx: number;
  imageHeightPx: number;
  /** 数えた範囲の長さ（mm）。 */
  lengthMm: number;
  /** 数えた本数。 */
  count: number;
  /** 密度（本/mm、小数1桁）。 */
  densityPerMm: number;
};

export type CalibrationSource = "auto_scale" | "manual" | "saved";

export function distancePx(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * 目盛り合わせ：画像の上でなぞった線の長さ（ピクセル）と、その実際の長さ（mm）から
 * 1ピクセルあたりの長さ（μm）を出す。なぞった線が短すぎる・値が不正なら null。
 */
export function umPerPxFromLine(a: Point, b: Point, realLengthMm: number): number | null {
  const px = distancePx(a, b);
  if (!(realLengthMm > 0) || !Number.isFinite(realLengthMm)) return null;
  // 短すぎる線は誤差が大きいので受け付けない（20ピクセル未満）。
  if (px < 20) return null;
  return (realLengthMm * 1000) / px;
}

/** ピクセルの長さを mm にする。 */
export function pxToMm(px: number, umPerPx: number): number {
  return (px * umPerPx) / 1000;
}

/** 指定した長さ（mm）が画像の上で何ピクセルか。 */
export function mmToPx(mm: number, umPerPx: number): number {
  return (mm * 1000) / umPerPx;
}

/** 密度（本/mm、小数1桁）。長さが 0 以下なら null。 */
export function densityPerMm(count: number, lengthMm: number): number | null {
  if (!(lengthMm > 0)) return null;
  return Math.round((count / lengthMm) * 10) / 10;
}

/**
 * 数える範囲の最初の置き場所。標準は 1mm の水平な線を画像の中央に置く。
 * 画像の幅が 1mm に満たない場合は、画像の幅の 9 割を使う（その長さで割って本/mmにする）。
 */
export function defaultLine(
  imageWidthPx: number,
  imageHeightPx: number,
  umPerPx: number,
  targetMm = 1,
): { start: Point; end: Point } {
  const wanted = mmToPx(targetMm, umPerPx);
  const len = Math.min(wanted, imageWidthPx * 0.9);
  const cx = imageWidthPx / 2;
  const y = imageHeightPx * 0.4;
  return { start: { x: cx - len / 2, y }, end: { x: cx + len / 2, y } };
}

/** 線を画像の中に収めたまま平行移動する。 */
export function moveLine(
  line: { start: Point; end: Point },
  dx: number,
  dy: number,
  imageWidthPx: number,
  imageHeightPx: number,
): { start: Point; end: Point } {
  const minX = Math.min(line.start.x, line.end.x);
  const maxX = Math.max(line.start.x, line.end.x);
  const minY = Math.min(line.start.y, line.end.y);
  const maxY = Math.max(line.start.y, line.end.y);
  const cdx = Math.max(-minX, Math.min(imageWidthPx - maxX, dx));
  const cdy = Math.max(-minY, Math.min(imageHeightPx - maxY, dy));
  return {
    start: { x: line.start.x + cdx, y: line.start.y + cdy },
    end: { x: line.end.x + cdx, y: line.end.y + cdy },
  };
}

/** 近くに既にある点（消す対象）を探す。なければ -1。 */
export function nearestPointIndex(points: Point[], p: Point, radiusPx: number): number {
  let best = -1;
  let bestD = radiusPx;
  points.forEach((q, i) => {
    const d = distancePx(p, q);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

/** 画面で持っている値（ピクセル）から、保存する記録を組み立てる。 */
export function buildMeasurement(args: {
  points: Point[];
  line: { start: Point; end: Point };
  umPerPx: number;
  calibrationSource?: CalibrationSource;
  imageWidthPx: number;
  imageHeightPx: number;
}): DensityMeasurement | null {
  const { points, line, umPerPx, imageWidthPx: w, imageHeightPx: h } = args;
  const lengthMm = pxToMm(distancePx(line.start, line.end), umPerPx);
  const density = densityPerMm(points.length, lengthMm);
  if (density == null || !(w > 0) || !(h > 0)) return null;
  const rel = (p: Point): Point => ({ x: p.x / w, y: p.y / h });
  return {
    method: "manual_tap",
    points: points.map(rel),
    line: { start: rel(line.start), end: rel(line.end) },
    umPerPx,
    ...(args.calibrationSource ? { calibrationSource: args.calibrationSource } : {}),
    imageWidthPx: w,
    imageHeightPx: h,
    lengthMm: Math.round(lengthMm * 1000) / 1000,
    count: points.length,
    densityPerMm: density,
  };
}

/* ---------- 目盛り合わせの保存（端末ごと・画像の幅ごと） ---------- */

const CALIBRATION_KEY = "capillary-scope-calibration";

/**
 * 目盛り合わせは「同じスコープ・同じ倍率・同じ解像度」の間だけ有効。
 * 解像度（画像の幅）が変わると 1ピクセルあたりの長さが変わるため、幅ごとに覚える。
 */
export function loadCalibration(imageWidthPx: number, storage: Storage | null = safeStorage()): number | null {
  try {
    const raw = storage?.getItem(CALIBRATION_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const v = map[String(imageWidthPx)];
    return typeof v === "number" && v > 0 && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveCalibration(
  imageWidthPx: number,
  umPerPx: number,
  storage: Storage | null = safeStorage(),
): void {
  try {
    const raw = storage?.getItem(CALIBRATION_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    map[String(imageWidthPx)] = umPerPx;
    storage?.setItem(CALIBRATION_KEY, JSON.stringify(map));
  } catch {
    // 保存できなくても、この画面を開いている間は使える。
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** 記録の形として正しいかを確かめて返す（保存値の読み込み用）。不正なら null。 */
export function normalizeMeasurement(raw: unknown): DensityMeasurement | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const isPoint = (p: unknown): p is Point =>
    typeof p === "object" && p !== null &&
    typeof (p as Point).x === "number" && typeof (p as Point).y === "number";
  const line = r.line as { start?: unknown; end?: unknown } | undefined;
  if (
    r.method !== "manual_tap" ||
    !Array.isArray(r.points) || !r.points.every(isPoint) ||
    !line || !isPoint(line.start) || !isPoint(line.end) ||
    typeof r.umPerPx !== "number" || typeof r.imageWidthPx !== "number" ||
    typeof r.imageHeightPx !== "number" || typeof r.lengthMm !== "number" ||
    typeof r.count !== "number" || typeof r.densityPerMm !== "number"
  )
    return null;
  return r as unknown as DensityMeasurement;
}
