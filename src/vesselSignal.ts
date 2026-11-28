// 画像から「血管らしさ」の信号を取り出す共通の下ごしらえ。
// 先端の自動提案（tipDetect.ts）と画質の目安（imageQuality.ts）の両方が使う。
//
// 考え方：血管（赤〜紫）は、まわりの皮ふに比べて緑の光を強く吸収する。
// そこで「赤と青の平均 − 緑」を明るさで割った値を信号にする。
// - 明るさで割るので、画像全体が暗い・明るいに左右されにくい。
// - 黒い毛・ごみ・目盛りの線は色みが無いので拾わない。
// - 白い反射も色みが無いので拾わない（縁の色にじみは、反射のまわりごと除く）。
import type { RgbaImage } from "./scaleDetect";

/** 反射とみなす明るさ（R・G・B のいちばん大きい値）。 */
export const GLARE_LEVEL = 235;

/** 縮小して扱う作業用の画像。 */
export type WorkImage = {
  width: number;
  height: number;
  /** 作業用の1ピクセルが、元の画像の何ピクセルにあたるか（元 ÷ 作業用）。 */
  scale: number;
  /** 明るさ（R・G・B の平均、0〜255）。 */
  luma: Float32Array;
  /** 血管らしさの信号（明るさで割った値 ×100）。 */
  signal: Float32Array;
  /** 反射の画素（1 = 反射）。 */
  glare: Uint8Array;
};

/**
 * 元の画像を、幅 targetWidth まで面積平均で縮小して信号を作る。
 * 元の幅がそれ以下なら縮小しない。
 */
export function toWorkImage(img: RgbaImage, targetWidth: number): WorkImage {
  const W0 = img.width;
  const H0 = img.height;
  const width = Math.max(1, Math.min(W0, Math.round(targetWidth)));
  const height = Math.max(1, Math.round((H0 * width) / W0));
  const n = width * height;
  const luma = new Float32Array(n);
  const signal = new Float32Array(n);
  const glare = new Uint8Array(n);
  const d = img.data;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor((y * H0) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * H0) / height));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor((x * W0) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * W0) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      let c = 0;
      for (let yy = y0; yy < y1 && yy < H0; yy++) {
        let p = (yy * W0 + x0) * 4;
        for (let xx = x0; xx < x1 && xx < W0; xx++, p += 4) {
          r += d[p];
          g += d[p + 1];
          b += d[p + 2];
          c++;
        }
      }
      if (c === 0) continue;
      r /= c;
      g /= c;
      b /= c;
      const i = y * width + x;
      const l = (r + g + b) / 3;
      luma[i] = l;
      signal[i] = (((r + b) / 2 - g) / Math.max(40, l)) * 100;
      if (Math.max(r, g, b) > GLARE_LEVEL) glare[i] = 1;
    }
  }
  return { width, height, scale: W0 / width, luma, signal, glare };
}

/**
 * 四角い窓（半径 radius）の中の合計を、全画素について求める（積分画像を使うので速い）。
 * 画像の端では窓を画像の中だけに切り詰める。
 */
export function boxSum(
  src: ArrayLike<number>,
  width: number,
  height: number,
  radius: number,
): Float64Array {
  const W1 = width + 1;
  const integral = new Float64Array(W1 * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += src[y * width + x];
      integral[(y + 1) * W1 + x + 1] = integral[y * W1 + x + 1] + row;
    }
  }
  const out = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      out[y * width + x] =
        integral[y1 * W1 + x1] - integral[y0 * W1 + x1] - integral[y1 * W1 + x0] + integral[y0 * W1 + x0];
    }
  }
  return out;
}

/** 反射のまわり（半径 radius）まで含めた「使わない画素」の印（1 = 使わない）。 */
export function dilateGlare(work: WorkImage, radius: number): Uint8Array {
  const sums = boxSum(work.glare, work.width, work.height, radius);
  const out = new Uint8Array(sums.length);
  for (let i = 0; i < sums.length; i++) if (sums[i] > 0) out[i] = 1;
  return out;
}

/**
 * まわり（半径 radius の窓、使わない画素は除く）の平均との差。
 * 血管はまわりより信号が高いので、正の値になる。使わない画素は 0。
 */
export function localContrast(
  work: WorkImage,
  excluded: Uint8Array,
  radius: number,
  smoothRadius: number,
): Float32Array {
  const { width, height, signal } = work;
  const n = width * height;
  const valid = new Float32Array(n);
  const masked = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (!excluded[i]) {
      valid[i] = 1;
      masked[i] = signal[i];
    }
  }
  const bgNum = boxSum(masked, width, height, radius);
  const bgDen = boxSum(valid, width, height, radius);
  const smNum = smoothRadius > 0 ? boxSum(masked, width, height, smoothRadius) : null;
  const smDen = smoothRadius > 0 ? boxSum(valid, width, height, smoothRadius) : null;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (excluded[i]) continue;
    const bg = bgDen[i] > 0 ? bgNum[i] / bgDen[i] : 0;
    const here = smNum && smDen ? smNum[i] / Math.max(1, smDen[i]) : signal[i];
    out[i] = here - bg;
  }
  return out;
}

/** 百分位数（0〜100）。値が無ければ 0。 */
export function percentile(values: Float32Array, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Float32Array.from(values).sort();
  const pos = (Math.max(0, Math.min(100, p)) / 100) * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
