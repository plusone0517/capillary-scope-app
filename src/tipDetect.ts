// ループの先端の位置を、画像から自動で提案する。
//
// ねらい：本数を数えるとき、人が1つずつ押す代わりに、候補を先に置いておく。
// 人は確かめて、違うところだけ直す。提案はあくまで候補で、記録するのは人が確かめた結果。
//
// 前提：先端が画像の上を向いていること（爪の側が上、指の付け根の側が下）。
//
// 方法：
//  1. 血管らしさの信号（vesselSignal.ts）から、まわりより赤みの強い画素を拾う。
//  2. つながった画素をひとまとまりにし、小さすぎるもの・短すぎるものを除く。
//  3. まとまりごとに、上の端のとがったところを先端の候補にする。
//  4. いちばん外側の列（遠位列）だけを残す。
//     - 真上に別の血管があるものは、2列目以降なので除く。
//     - 両隣の先端となす角が 90° に満たない（両隣より深く引っ込んでいる）ものを除く。
//       遠位列の数え方として文献で使われている基準に合わせている。
//     - 列全体の並びから大きく下に外れたものを除く。
//
// 確かめた範囲（2026-11-28）：実機の画像1枚（幅1063。開発時の目視で遠位列9本）で、
// 7本を正しく拾い、誤った提案は0だった。拾わなかった2本は、隣とつながって写っているものと、
// 90°の基準で境目になるもの。同じ画像に明るさ・ぼかし・彩度・縮小・拡大・圧縮・左右反転を
// 加えた12通りでも、7〜8本・誤り0だった。
// 確かめた実機の画像はこの1枚だけなので、精度はまだ分かっていない。
// 人が確かめた位置（densityMeasurement.points）と提案（densityMeasurement.proposal）の
// 両方を記録に残してあるので、記録が集まったら比べて精度を出す。
import type { RgbaImage } from "./scaleDetect";
import { dilateGlare, localContrast, toWorkImage } from "./vesselSignal";

/** 提案の方法の版。方法を変えたら上げる（記録に残し、後で精度を比べられるようにする）。 */
export const TIP_DETECT_VERSION = "tips-2026-11-28a";

export type TipPoint = { x: number; y: number };

export type TipDetection = {
  /** 遠位列の先端の候補（元の画像のピクセル、左から順）。 */
  tips: TipPoint[];
  /** 先端の列の並び（y = slope × x + intercept、元の画像のピクセル）。候補が無ければ null。 */
  row: { slope: number; intercept: number } | null;
};

const WORK_WIDTH = 800; // 作業用の幅（これより大きい画像は縮小する）
const GLARE_MARGIN = 0.006; // 反射のまわりをどこまで除くか（幅に対する比）
const BACKGROUND_RADIUS = 0.05; // まわりの平均をとる窓の半径（幅に対する比）
const THRESHOLD_FLOOR = 3.5; // 血管とみなす信号の下限
const THRESHOLD_SIGMA = 1.2; // 平均 + これ×標準偏差 を超えたら血管とみなす
const MIN_AREA = 0.00025; // まとまりの最小の面積（幅×幅に対する比）
const MIN_HEIGHT = 0.035; // まとまりの最小の高さ（幅に対する比）
const TIP_SEPARATION = 0.022; // 同じまとまりの中で、先端どうしの最小の間隔（幅に対する比）
const TIP_PROMINENCE = 0.012; // 先端どうしの間に必要なくぼみの深さ（幅に対する比）
const ABOVE_BAND = 0.008; // 真上を調べる帯の半分の幅（幅に対する比）
const TOP_MARGIN = 0.012; // 画像の上の端で切れているものを除く範囲（高さに対する比）
const ROW_OUTLIER = 0.1; // 列の並びからどれだけ下に外れたら除くか（幅に対する比）
const MIN_TIPS = 4; // これより少ないときは「読み取れなかった」とする（まばらな誤検出を出さない）

type Candidate = { x: number; y: number };

export function detectLoopTips(img: RgbaImage): TipDetection {
  const none: TipDetection = { tips: [], row: null };
  if (img.width < 100 || img.height < 60) return none;
  const work = toWorkImage(img, WORK_WIDTH);
  const { width: W, height: H } = work;
  const n = W * H;

  const excluded = dilateGlare(work, Math.max(2, Math.round(W * GLARE_MARGIN)));
  const contrast = localContrast(work, excluded, Math.round(W * BACKGROUND_RADIUS), 1);

  // しきい値：使える画素の平均と標準偏差から決める（下限つき）。
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    if (excluded[i]) continue;
    sum += contrast[i];
    sumSq += contrast[i] * contrast[i];
    count++;
  }
  if (count < n * 0.2) return none; // ほとんどが反射で、読み取れない
  const mean = sum / count;
  const std = Math.sqrt(Math.max(0, sumSq / count - mean * mean));
  const threshold = Math.max(THRESHOLD_FLOOR, mean + THRESHOLD_SIGMA * std);

  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (!excluded[i] && contrast[i] > threshold) mask[i] = 1;

  // つながった画素をまとめる（8方向）。条件を満たすまとまりだけ残す。
  const minArea = W * W * MIN_AREA;
  const minHeight = W * MIN_HEIGHT;
  const separation = Math.max(3, Math.round(W * TIP_SEPARATION));
  const prominence = Math.max(3, Math.round(W * TIP_PROMINENCE));
  const seen = new Uint8Array(n);
  const kept = new Uint8Array(n);
  const stack = new Int32Array(n);
  const rawTips: Candidate[] = [];
  for (let start = 0; start < n; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const pixels: number[] = [];
    let minX = W;
    let maxX = -1;
    let minY = H;
    let maxY = -1;
    while (top > 0) {
      const i = stack[--top];
      pixels.push(i);
      const y = (i / W) | 0;
      const x = i - y * W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          const j = yy * W + xx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack[top++] = j;
          }
        }
      }
    }
    if (pixels.length < minArea || maxY - minY + 1 < minHeight) continue;
    for (const i of pixels) kept[i] = 1;

    // 列ごとの「いちばん上の画素」の並びから、とがったところを先端にする。
    const span = maxX - minX + 1;
    const topOf = new Int32Array(span).fill(H);
    for (const i of pixels) {
      const y = (i / W) | 0;
      const x = i - y * W - minX;
      if (y < topOf[x]) topOf[x] = y;
    }
    const order = Array.from({ length: span }, (_, i) => i).sort((a, b) => topOf[a] - topOf[b]);
    const chosen: number[] = [];
    for (const i of order) {
      let ok = true;
      for (const j of chosen) {
        if (Math.abs(i - j) < separation) {
          ok = false;
          break;
        }
        // 既に選んだ先端との間に、十分なくぼみがあること。
        let deepest = 0;
        for (let k = Math.min(i, j); k <= Math.max(i, j); k++) {
          if (topOf[k] > deepest) deepest = topOf[k];
        }
        if (deepest - topOf[i] < prominence) {
          ok = false;
          break;
        }
      }
      if (ok) chosen.push(i);
    }
    for (const i of chosen) rawTips.push({ x: i + minX, y: topOf[i] });
  }

  // 遠位列の絞り込み①：真上に別の血管が無いこと。画像の上の端で切れていないこと。
  const half = Math.max(2, Math.round(W * ABOVE_BAND));
  const topMargin = Math.max(2, Math.round(H * TOP_MARGIN));
  let candidates: Candidate[] = [];
  for (const t of rawTips) {
    if (t.y < topMargin) continue;
    let blocked = false;
    const x0 = Math.max(0, t.x - half);
    const x1 = Math.min(W - 1, t.x + half);
    for (let y = 0; y < t.y - 2 && !blocked; y++) {
      for (let x = x0; x <= x1; x++) {
        if (kept[y * W + x]) {
          blocked = true;
          break;
        }
      }
    }
    if (!blocked) candidates.push(t);
  }
  candidates.sort((a, b) => a.x - b.x);

  // 遠位列の絞り込み②：両隣より深く、両隣となす角が 90° に満たないものを、角の小さい順に除く。
  for (;;) {
    if (candidates.length < 3) break;
    let worst = -1;
    let worstAngle = 90;
    for (let i = 1; i < candidates.length - 1; i++) {
      const c = candidates[i];
      const l = candidates[i - 1];
      const r = candidates[i + 1];
      if (!(c.y > l.y && c.y > r.y)) continue;
      const angle = angleAt(c, l, r);
      if (angle < worstAngle) {
        worstAngle = angle;
        worst = i;
      }
    }
    if (worst < 0) break;
    candidates.splice(worst, 1);
  }

  // 遠位列の絞り込み③：列の並び（外れ値に強い直線）から大きく下に外れたものを除く。
  let row = fitRow(candidates, W);
  if (row && candidates.length >= 4) {
    const fitted = row;
    candidates = candidates.filter(
      (t) => t.y - (fitted.slope * t.x + fitted.intercept) <= W * ROW_OUTLIER,
    );
    row = fitRow(candidates, W) ?? row;
  }

  if (candidates.length < MIN_TIPS || !row) return none;
  const s = work.scale;
  return {
    tips: candidates.map((t) => ({ x: (t.x + 0.5) * s, y: (t.y + 0.5) * s })),
    row: { slope: row.slope, intercept: (row.intercept + 0.5) * s },
  };
}

/** c を頂点にして、l と r がなす角（度）。 */
function angleAt(c: Candidate, l: Candidate, r: Candidate): number {
  const ax = l.x - c.x;
  const ay = l.y - c.y;
  const bx = r.x - c.x;
  const by = r.y - c.y;
  const d = Math.hypot(ax, ay) * Math.hypot(bx, by);
  if (d === 0) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / d))) * 180) / Math.PI;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 先端の並びに直線をあてる（傾きは2点ずつの傾きの中央値。外れ値に強い）。 */
function fitRow(points: Candidate[], width: number): { slope: number; intercept: number } | null {
  if (points.length === 0) return null;
  const slopes: number[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[j].x - points[i].x;
      if (dx >= width * 0.05) slopes.push((points[j].y - points[i].y) / dx);
    }
  }
  const slope = slopes.length > 0 ? median(slopes) : 0;
  const intercept = median(points.map((p) => p.y - slope * p.x));
  return { slope, intercept };
}
