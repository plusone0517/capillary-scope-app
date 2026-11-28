// 撮った画像の画質の目安（ピント・血管の写り・明るさ・反射）。
//
// ねらい：形と本数を読み取りにくい画像を、その場で撮り直せるようにする。
// 画像の良し悪しを決めつけるものではなく、撮り直しをすすめるための目安。
// 保存や解析を止めることはしない。
//
// 値はどれも、画像の大きさや全体の明るさに左右されにくい作りにしてある。
// - ピント（sharpness）：血管の色の境目の鋭さ。ぼけるほど小さくなる。
// - 血管の写り（vesselContrast）：血管がまわりからどれだけ浮き上がって見えるか。
// しきい値は、実機の画像2枚（鮮明なもの1枚・読み取りにくいもの1枚）と、
// 鮮明な画像をわざとぼかしたものから決めた暫定の値。
// 記録に値を残しておき、画像が集まったら見直す。
import type { RgbaImage } from "./scaleDetect";
import { boxSum, localContrast, percentile, toWorkImage } from "./vesselSignal";

/** 測り方の版。測り方やしきい値を変えたら上げる。 */
export const IMAGE_QUALITY_VERSION = "quality-2026-11-28a";

export type QualityIssue = "soft" | "faint" | "dark" | "bright" | "glare";

export type ImageQuality = {
  /** ピントの目安（大きいほど鮮明）。 */
  sharpness: number;
  /** 血管の写りの目安（大きいほどはっきり）。 */
  vesselContrast: number;
  /** 明るさ（0〜255）。 */
  brightness: number;
  /** 反射の面積（％）。 */
  glarePct: number;
  /** 撮り直しをすすめる理由（無ければ空）。 */
  issues: QualityIssue[];
};

const WORK_WIDTH = 400;
export const QUALITY_LIMITS = {
  sharpnessMin: 7,
  vesselContrastMin: 8.5,
  brightnessMin: 70,
  brightnessMax: 205,
  glarePctMax: 4,
} as const;

const round1 = (v: number): number => Math.round(v * 10) / 10;

export function assessImageQuality(img: RgbaImage): ImageQuality | null {
  if (img.width < 100 || img.height < 60) return null;
  const work = toWorkImage(img, WORK_WIDTH);
  const { width: W, height: H, luma, signal, glare } = work;
  const n = W * H;

  // 反射のまわり3画素は、色にじみがあるので測らない。
  const near = boxSum(glare, W, H, 3);
  const excluded = new Uint8Array(n);
  let glareCount = 0;
  let lumaSum = 0;
  for (let i = 0; i < n; i++) {
    if (near[i] > 0) excluded[i] = 1;
    if (glare[i]) glareCount++;
    lumaSum += luma[i];
  }

  // ピント：信号の、隣どうしの差の大きさ（上位1%の値）。
  const edges: number[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (excluded[i]) continue;
      edges.push(
        Math.abs(signal[i + 1] - signal[i - 1]) + Math.abs(signal[i + W] - signal[i - W]),
      );
    }
  }

  // 血管の写り：まわりの平均との差（上位1%の値）。
  const contrast = localContrast(work, excluded, Math.round(W * 0.05), 0);
  const values: number[] = [];
  for (let i = 0; i < n; i++) if (!excluded[i]) values.push(contrast[i]);

  const quality: ImageQuality = {
    sharpness: round1(percentile(Float32Array.from(edges), 99)),
    vesselContrast: round1(percentile(Float32Array.from(values), 99)),
    brightness: round1(lumaSum / n),
    glarePct: round1((glareCount / n) * 100),
    issues: [],
  };
  quality.issues = issuesOf(quality);
  return quality;
}

/** 値から、撮り直しをすすめる理由を決める。 */
export function issuesOf(q: Omit<ImageQuality, "issues">): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (q.brightness < QUALITY_LIMITS.brightnessMin) issues.push("dark");
  if (q.brightness > QUALITY_LIMITS.brightnessMax) issues.push("bright");
  if (q.glarePct > QUALITY_LIMITS.glarePctMax) issues.push("glare");
  if (q.sharpness < QUALITY_LIMITS.sharpnessMin) issues.push("soft");
  // ぼけていると写りも淡くなるので、ピントの案内が出ているときは重ねて出さない。
  else if (q.vesselContrast < QUALITY_LIMITS.vesselContrastMin) issues.push("faint");
  return issues;
}

const ADVICE: Record<QualityIssue, string> = {
  soft: "ピントが合いきっていないようです。ピントを合わせ直して撮ると、形と本数が読み取りやすくなります。",
  faint:
    "血管の写りが淡い画像です。ピントとオイルの量を確かめて撮り直すと、読み取りやすくなります。",
  dark: "全体が暗めです。明るさを上げて撮ると、読み取りやすくなります。",
  bright: "全体が明るすぎるようです。明るさを下げて撮ると、読み取りやすくなります。",
  glare: "光の反射が多く写っています。オイルを足すか、スコープの当て方を少し変えて撮ると、反射が減ります。",
};

/** 画面に出す案内文（理由ごとに1文）。 */
export function qualityAdvice(issues: QualityIssue[]): string[] {
  return issues.map((i) => ADVICE[i]);
}

/**
 * 動画の場面どうしを比べるための点数（大きいほど、形と本数を読み取りやすい場面）。
 * ピントの値を基本にして、血管がほとんど写っていない場面・反射の多い場面・
 * 暗すぎる／明るすぎる場面は点数を下げる。同じ動画の中で比べるためだけの値。
 */
export function frameScore(q: ImageQuality | null): number {
  if (!q) return 0;
  let score = q.sharpness;
  score *= Math.min(1, q.vesselContrast / QUALITY_LIMITS.vesselContrastMin);
  score *= 1 - Math.min(0.5, q.glarePct / 20);
  if (q.brightness < QUALITY_LIMITS.brightnessMin || q.brightness > QUALITY_LIMITS.brightnessMax) {
    score *= 0.7;
  }
  return score;
}

/**
 * 点数の高い順に count 個を選ぶ（返すのは元の並びでの番号、時間の順）。
 * となり合う場面はほぼ同じ絵なので、できるだけ間をあけて選ぶ。足りなければ、となりも使う。
 */
export function pickBestIndexes(scores: number[], count: number, minGap = 2): number[] {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a] || a - b);
  const chosen: number[] = [];
  for (const i of order) {
    if (chosen.length >= count) break;
    if (chosen.every((j) => Math.abs(i - j) >= minGap)) chosen.push(i);
  }
  for (const i of order) {
    if (chosen.length >= count) break;
    if (!chosen.includes(i)) chosen.push(i);
  }
  return chosen.sort((a, b) => a - b);
}

/** 記録に残す形（値と版だけ）。 */
export type StoredImageQuality = {
  version: string;
  sharpness: number;
  vesselContrast: number;
  brightness: number;
  glarePct: number;
};

export function toStoredQuality(q: ImageQuality): StoredImageQuality {
  return {
    version: IMAGE_QUALITY_VERSION,
    sharpness: q.sharpness,
    vesselContrast: q.vesselContrast,
    brightness: q.brightness,
    glarePct: q.glarePct,
  };
}
