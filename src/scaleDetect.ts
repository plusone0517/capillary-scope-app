// 画像に写っている目盛り（スコープが画面に重ねる、細い黒の横線）を自動で見つける。
//
// ねらい：目盛り合わせを人がなぞらなくても済むようにする。目盛りは画像ごとに
// 写っているので、画像ごとに読み取れば、解像度や倍率が変わっても合わせ直しが要らない。
//
// 方法：各行について、上下の少し離れた行のどちらよりも十分に暗く、かつ黒に近い画素を拾い、
// 横につながった最も長い並びを探す。画像の幅の15%以上あり、太さが細いものを目盛りとみなす。
// 実機の画像（幅1600、圧縮あり）で、1mm の目盛りを 735 ピクセルとして検出できることを確認済み。

export type RgbaImage = { data: Uint8ClampedArray | Uint8Array; width: number; height: number };

export type ScaleBar = {
  /** 線の両端（元の画像のピクセル）。 */
  start: { x: number; y: number };
  end: { x: number; y: number };
  lengthPx: number;
};

const NEIGHBOR = 4; // 上下に何行離れた画素と比べるか
const MIN_CONTRAST = 35; // まわりよりどれだけ暗ければ線とみなすか
const MAX_LUMA = 90; // 線そのものの明るさの上限（黒に近いこと）
const MAX_GAP = 3; // 線の途切れをどこまでつなぐか（圧縮で欠けることがある）
const MIN_WIDTH_RATIO = 0.15; // 画像の幅に対する最小の長さ
const MAX_THICKNESS = 8; // これより太い帯は目盛りではない（影や枠など）

function luma(data: RgbaImage["data"], i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

export function detectScaleBar(img: RgbaImage): ScaleBar | null {
  const { data, width: W, height: H } = img;
  if (W < 50 || H < 2 * NEIGHBOR + 1) return null;
  const minLen = Math.max(20, Math.floor(W * MIN_WIDTH_RATIO));

  // 行ごとの最長の並びを求める。
  const rowBest: ({ s: number; e: number } | null)[] = new Array(H).fill(null);
  for (let y = NEIGHBOR; y < H - NEIGHBOR; y++) {
    let x = 0;
    let best: { s: number; e: number } | null = null;
    const isDark = (xx: number): boolean => {
      const here = luma(data, (y * W + xx) * 4);
      if (here >= MAX_LUMA) return false;
      const above = luma(data, ((y - NEIGHBOR) * W + xx) * 4);
      const below = luma(data, ((y + NEIGHBOR) * W + xx) * 4);
      // 上も下も明るいこと（太い帯の縁を細い線と見間違えないため、暗い側に合わせて比べる）。
      return Math.min(above, below) - here > MIN_CONTRAST;
    };
    while (x < W) {
      if (!isDark(x)) {
        x++;
        continue;
      }
      const s = x;
      let e = x;
      let gap = 0;
      x++;
      while (x < W && gap <= MAX_GAP) {
        if (isDark(x)) {
          e = x;
          gap = 0;
        } else {
          gap++;
        }
        x++;
      }
      if (e - s + 1 >= minLen && (!best || e - s > best.e - best.s)) best = { s, e };
    }
    rowBest[y] = best;
  }

  // 最も長い行を選び、同じ位置に重なる上下の行をまとめて太さを確かめる。
  let top = -1;
  for (let y = 0; y < H; y++) {
    const r = rowBest[y];
    if (r && (top < 0 || r.e - r.s > rowBest[top]!.e - rowBest[top]!.s)) top = y;
  }
  if (top < 0) return null;
  const main = rowBest[top]!;
  const overlaps = (r: { s: number; e: number } | null) =>
    r != null && Math.min(r.e, main.e) - Math.max(r.s, main.s) > (main.e - main.s) * 0.6;
  let y0 = top;
  let y1 = top;
  while (y0 - 1 >= 0 && overlaps(rowBest[y0 - 1])) y0--;
  while (y1 + 1 < H && overlaps(rowBest[y1 + 1])) y1++;
  if (y1 - y0 + 1 > MAX_THICKNESS) return null;

  const y = (y0 + y1) / 2;
  return {
    start: { x: main.s, y },
    end: { x: main.e, y },
    lengthPx: main.e - main.s,
  };
}

/* ---------- 目盛りに書かれている長さ（端末ごとに覚える） ---------- */

const LABEL_KEY = "capillary-scope-scale-label-mm";

/**
 * 目盛りの線が表している長さ（mm）。標準のスコープの表示は 1 mm。
 * 表示が違う機種・倍率のときは、数える画面で一度直せば、その端末が覚える。
 */
export function loadScaleLabelMm(storage: Storage | null = safeStorage()): number {
  try {
    const v = Number(storage?.getItem(LABEL_KEY));
    return v > 0 && Number.isFinite(v) ? v : 1;
  } catch {
    return 1;
  }
}

export function saveScaleLabelMm(mm: number, storage: Storage | null = safeStorage()): void {
  try {
    if (mm > 0 && Number.isFinite(mm)) storage?.setItem(LABEL_KEY, String(mm));
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

/** 画像（img 要素）から画素を取り出して目盛りを探す。読めない画像（別ドメイン等）は null。 */
export function detectScaleBarFromImage(img: HTMLImageElement): ScaleBar | null {
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return detectScaleBar(ctx.getImageData(0, 0, w, h));
  } catch {
    // 保存済みの画像は別ドメインから読むため、画素を取り出せないことがある。
    return null;
  }
}
