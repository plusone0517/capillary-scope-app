import { describe, expect, it } from "vitest";
import { detectLoopTips } from "./tipDetect";
import { assessImageQuality, frameScore, issuesOf, pickBestIndexes } from "./imageQuality";
import { boxSum, percentile, toWorkImage } from "./vesselSignal";
import type { RgbaImage } from "./scaleDetect";

/** 皮ふ色の地に、赤紫の血管（上がまるい縦の帯）を描いた合成画像を作る。 */
function scene(
  width: number,
  height: number,
  loops: { x: number; top: number; bottom: number; halfWidth?: number }[],
  extra?: (set: (x: number, y: number, rgb: [number, number, number]) => void) => void,
  blur = 0,
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  const set = (x: number, y: number, [r, g, b]: [number, number, number]) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (Math.round(y) * width + Math.round(x)) * 4;
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) set(x, y, [140, 150, 165]);
  for (const l of loops) {
    const hw = l.halfWidth ?? 7;
    for (let y = l.top; y <= l.bottom; y++) {
      for (let dx = -hw; dx <= hw; dx++) {
        // 上の端をまるくする。
        if (y - l.top < hw && dx * dx + (y - l.top - hw) ** 2 > hw * hw) continue;
        set(l.x + dx, y, [125, 70, 130]);
      }
    }
  }
  extra?.(set);
  const img: RgbaImage = { data, width, height };
  return blur > 0 ? blurred(img, blur) : img;
}

function blurred(img: RgbaImage, radius: number): RgbaImage {
  const { width, height } = img;
  const out = new Uint8ClampedArray(img.data.length);
  for (let c = 0; c < 3; c++) {
    const plane = new Float32Array(width * height);
    for (let i = 0; i < plane.length; i++) plane[i] = img.data[i * 4 + c];
    const ones = new Float32Array(width * height).fill(1);
    const sums = boxSum(plane, width, height, radius);
    const counts = boxSum(ones, width, height, radius);
    for (let i = 0; i < plane.length; i++) out[i * 4 + c] = sums[i] / counts[i];
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { data: out, width, height };
}

const xs = (tips: { x: number }[]) => tips.map((t) => Math.round(t.x));

describe("先端の自動提案", () => {
  const row = [100, 200, 300, 400, 500, 600, 700].map((x) => ({ x, top: 120, bottom: 300 }));

  it("1列に並んだ血管の先端を、左から順にすべて提案する", () => {
    const d = detectLoopTips(scene(800, 450, row));
    expect(d.tips).toHaveLength(7);
    d.tips.forEach((t, i) => {
      expect(Math.abs(t.x - row[i].x)).toBeLessThanOrEqual(8);
      expect(Math.abs(t.y - 120)).toBeLessThanOrEqual(8);
    });
    expect(Math.abs(d.row!.slope)).toBeLessThan(0.02);
  });

  it("2列目の血管（1列目の真下にあるもの）は提案しない", () => {
    const second = [150, 350, 550].map((x) => ({ x: x - 50, top: 330, bottom: 440 }));
    const d = detectLoopTips(scene(800, 450, [...row, ...second]));
    expect(d.tips).toHaveLength(7);
    expect(d.tips.every((t) => t.y < 200)).toBe(true);
  });

  it("真上に別の血管がある先端は、列の端にあっても提案しない", () => {
    // 右端の血管を短くし、そのすぐ下に別の血管の先端を置く（端なので角度の基準は当たらない）。
    const short = { x: 700, top: 120, bottom: 180 };
    const below = { x: 702, top: 195, bottom: 320 };
    const d = detectLoopTips(scene(800, 450, [...row.slice(0, 6), short, below]));
    expect(d.tips).toHaveLength(7);
    expect(d.tips.every((t) => t.y < 160)).toBe(true);
  });

  it("両隣より深く引っ込んだ先端（両隣となす角が90°未満）は遠位列に入れない", () => {
    // 250 の位置に、両隣（200・300）より 70 ピクセル深い先端を置く（なす角は約71°）。
    const deep = { x: 250, top: 190, bottom: 400 };
    const d = detectLoopTips(scene(800, 450, [...row, deep]));
    expect(xs(d.tips).some((x) => Math.abs(x - 250) < 12)).toBe(false);
    expect(d.tips).toHaveLength(7);
  });

  it("列の並びから大きく下に外れた先端は、列の端にあっても提案しない", () => {
    const far = { x: 760, top: 300, bottom: 430 };
    const d = detectLoopTips(scene(800, 450, [...row, far]));
    expect(xs(d.tips).some((x) => Math.abs(x - 760) < 12)).toBe(false);
    expect(d.tips).toHaveLength(7);
  });

  it("両隣より少し低いだけの先端（なす角が90°以上）は遠位列に入れる", () => {
    const shallow = { x: 250, top: 140, bottom: 300 };
    const d = detectLoopTips(scene(800, 450, [...row, shallow]));
    expect(xs(d.tips).some((x) => Math.abs(x - 250) < 12)).toBe(true);
    expect(d.tips).toHaveLength(8);
  });

  it("傾いた列でも、列の傾きを返す", () => {
    const tilted = row.map((l) => ({ ...l, top: 80 + l.x * 0.2, bottom: 300 + l.x * 0.2 }));
    const d = detectLoopTips(scene(800, 520, tilted));
    expect(d.tips).toHaveLength(7);
    expect(d.row!.slope).toBeGreaterThan(0.15);
    expect(d.row!.slope).toBeLessThan(0.25);
  });

  it("黒い毛・白い反射・目盛りの黒い線は、先端として提案しない", () => {
    const d = detectLoopTips(
      scene(800, 450, row, (set) => {
        for (let t = 0; t < 160; t++) {
          // 斜めの黒い毛
          for (let k = 0; k < 4; k++) set(420 + t, 30 + t * 0.4 + k, [30, 40, 55]);
        }
        for (let y = 60; y < 90; y++) for (let x = 240; x < 275; x++) set(x, y, [255, 255, 255]);
        for (let x = 200; x < 560; x++) for (let k = 0; k < 2; k++) set(x, 40 + k, [10, 10, 10]);
      }),
    );
    expect(d.tips).toHaveLength(7);
    expect(d.tips.every((t) => Math.abs(t.y - 120) <= 8)).toBe(true);
  });

  it("画像の大きさが変わっても、同じ先端を同じ位置（比）で提案する", () => {
    const big = row.map((l) => ({ x: l.x * 2, top: l.top * 2, bottom: l.bottom * 2, halfWidth: 14 }));
    const d = detectLoopTips(scene(1600, 900, big));
    expect(d.tips).toHaveLength(7);
    d.tips.forEach((t, i) => expect(Math.abs(t.x - big[i].x)).toBeLessThanOrEqual(16));
  });

  it("血管がほとんど写っていない画像では、提案しない", () => {
    expect(detectLoopTips(scene(800, 450, [])).tips).toHaveLength(0);
    expect(detectLoopTips(scene(800, 450, row.slice(0, 2))).tips).toHaveLength(0);
  });

  it("上の端で切れている血管は、先端として提案しない", () => {
    const cut = { x: 750, top: 0, bottom: 300 };
    const d = detectLoopTips(scene(800, 450, [...row.slice(0, 6), cut]));
    expect(xs(d.tips).some((x) => Math.abs(x - 750) < 12)).toBe(false);
  });
});

describe("画質の目安", () => {
  const row = [100, 200, 300, 400, 500, 600, 700].map((x) => ({ x, top: 120, bottom: 300 }));

  it("鮮明な画像には案内を出さない", () => {
    const q = assessImageQuality(scene(800, 450, row))!;
    expect(q.issues).toEqual([]);
    expect(q.glarePct).toBe(0);
  });

  it("ぼけるほどピントの値が下がり、強くぼけた画像にはピントの案内を出す", () => {
    const sharp = assessImageQuality(scene(800, 450, row))!;
    const soft = assessImageQuality(scene(800, 450, row, undefined, 6))!;
    const softer = assessImageQuality(scene(800, 450, row, undefined, 14))!;
    expect(soft.sharpness).toBeLessThan(sharp.sharpness);
    expect(softer.sharpness).toBeLessThan(soft.sharpness);
    expect(softer.issues).toContain("soft");
  });

  it("画像全体を暗くしても、ピントと写りの値はほとんど変わらない", () => {
    const base = scene(800, 450, row);
    const dark: RgbaImage = { ...base, data: base.data.map((v, i) => (i % 4 === 3 ? v : v * 0.7)) };
    const a = assessImageQuality(base)!;
    const b = assessImageQuality(dark)!;
    expect(Math.abs(a.sharpness - b.sharpness) / a.sharpness).toBeLessThan(0.15);
    expect(Math.abs(a.vesselContrast - b.vesselContrast) / a.vesselContrast).toBeLessThan(0.15);
  });

  it("値から案内を決める：暗い・明るい・反射・ピント・写りの淡さ", () => {
    const ok = { sharpness: 11, vesselContrast: 12, brightness: 130, glarePct: 0.5 };
    expect(issuesOf(ok)).toEqual([]);
    expect(issuesOf({ ...ok, brightness: 50 })).toEqual(["dark"]);
    expect(issuesOf({ ...ok, brightness: 230 })).toEqual(["bright"]);
    expect(issuesOf({ ...ok, glarePct: 9 })).toEqual(["glare"]);
    expect(issuesOf({ ...ok, sharpness: 5 })).toEqual(["soft"]);
    expect(issuesOf({ ...ok, vesselContrast: 6 })).toEqual(["faint"]);
    // ぼけているときは、写りの淡さを重ねて言わない。
    expect(issuesOf({ ...ok, sharpness: 5, vesselContrast: 6 })).toEqual(["soft"]);
  });

  it("白い反射の面積を％で出す", () => {
    const q = assessImageQuality(
      scene(800, 450, row, (set) => {
        for (let y = 0; y < 90; y++) for (let x = 0; x < 400; x++) set(x, y, [255, 255, 255]);
      }),
    )!;
    expect(q.glarePct).toBeGreaterThan(9);
    expect(q.glarePct).toBeLessThan(11);
    expect(q.issues).toContain("glare");
  });
});

describe("下ごしらえ", () => {
  it("縮小しても明るさの平均は変わらない", () => {
    const img = scene(800, 450, []);
    const w = toWorkImage(img, 400);
    expect(w.width).toBe(400);
    expect(w.height).toBe(225);
    expect(w.scale).toBe(2);
    expect(Math.abs(w.luma[1000] - (140 + 150 + 165) / 3)).toBeLessThan(0.01);
  });

  it("百分位数を出す", () => {
    const v = Float32Array.from({ length: 101 }, (_, i) => i);
    expect(percentile(v, 0)).toBe(0);
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 99)).toBe(99);
    expect(percentile(new Float32Array(0), 50)).toBe(0);
  });
});

describe("動画の場面を比べる", () => {
  const q = { sharpness: 10, vesselContrast: 12, brightness: 130, glarePct: 0.5, issues: [] };

  it("鮮明な場面ほど点数が高い", () => {
    expect(frameScore(q)).toBeGreaterThan(frameScore({ ...q, sharpness: 6 }));
    expect(frameScore(null)).toBe(0);
  });

  it("血管がほとんど写っていない場面・反射の多い場面・暗すぎる場面は点数を下げる", () => {
    expect(frameScore({ ...q, vesselContrast: 3 })).toBeLessThan(frameScore(q) * 0.5);
    expect(frameScore({ ...q, glarePct: 10 })).toBeLessThan(frameScore(q) * 0.7);
    expect(frameScore({ ...q, brightness: 40 })).toBeLessThan(frameScore(q));
  });

  it("点数の高い場面を、時間の順に返す", () => {
    expect(pickBestIndexes([1, 5, 2, 9, 3], 1)).toEqual([3]);
    expect(pickBestIndexes([1, 5, 2, 9, 3, 0, 8], 3)).toEqual([1, 3, 6]);
  });

  it("となり合う場面は避けて選び、足りなければとなりも使う", () => {
    // 9 と 8 はとなり合うので、3枚目までは間をあける。
    expect(pickBestIndexes([1, 9, 8, 2, 7, 1], 2)).toEqual([1, 4]);
    expect(pickBestIndexes([9, 8, 7], 3)).toEqual([0, 1, 2]);
    expect(pickBestIndexes([4, 4, 4, 4], 2)).toEqual([0, 2]);
    expect(pickBestIndexes([], 2)).toEqual([]);
  });
});
