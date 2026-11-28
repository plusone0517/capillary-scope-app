import { describe, expect, it } from "vitest";
import { detectScaleBar, loadScaleLabelMm, saveScaleLabelMm, type RgbaImage } from "./scaleDetect";

/** 薄い紫の背景の画像を作り、描画関数で線などを足す。 */
function image(w: number, h: number, draw: (set: (x: number, y: number, v: number) => void) => void): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = 205;
    data[i * 4 + 1] = 190;
    data[i * 4 + 2] = 215;
    data[i * 4 + 3] = 255;
  }
  draw((x, y, v) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v;
  });
  return { data, width: w, height: h };
}

describe("目盛りの自動検出", () => {
  it("細い黒の横線を、両端の位置まで見つける", () => {
    const img = image(800, 450, (set) => {
      for (let x = 217; x <= 583; x++) for (const y of [50, 51]) set(x, y, 10);
    });
    const bar = detectScaleBar(img);
    expect(bar).not.toBeNull();
    expect(bar!.start.x).toBe(217);
    expect(bar!.end.x).toBe(583);
    expect(bar!.lengthPx).toBe(366);
    expect(bar!.start.y).toBeCloseTo(50.5, 5);
  });
  it("圧縮で少し途切れた線もつなぐ", () => {
    const img = image(800, 450, (set) => {
      for (let x = 200; x <= 600; x++) if (x % 37 !== 0) set(x, 60, 20);
    });
    expect(detectScaleBar(img)?.lengthPx).toBe(400);
  });
  it("目盛りの無い画像では何も返さない", () => {
    expect(detectScaleBar(image(800, 450, () => {}))).toBeNull();
  });
  it("毛細血管のような縦の線・短い線は目盛りにしない", () => {
    const img = image(800, 450, (set) => {
      for (let i = 0; i < 9; i++) for (let y = 150; y < 400; y++) for (let dx = 0; dx < 6; dx++) set(100 + i * 70 + dx, y, 60);
      for (let x = 300; x < 360; x++) set(x, 30, 10); // 短い横線（幅の15%未満）
    });
    expect(detectScaleBar(img)).toBeNull();
  });
  it("太い黒い帯（枠や影）は目盛りにしない", () => {
    const img = image(800, 450, (set) => {
      for (let x = 100; x < 700; x++) for (let y = 200; y < 230; y++) set(x, y, 10);
    });
    expect(detectScaleBar(img)).toBeNull();
  });
  it("薄い灰色の線（黒くない線）は目盛りにしない", () => {
    const img = image(800, 450, (set) => {
      for (let x = 100; x < 700; x++) set(x, 60, 150);
    });
    expect(detectScaleBar(img)).toBeNull();
  });
});

describe("目盛りの表示の長さ", () => {
  it("既定は 1 mm。直した値は覚える", () => {
    const m = new Map<string, string>();
    const s = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) } as unknown as Storage;
    expect(loadScaleLabelMm(s)).toBe(1);
    saveScaleLabelMm(0.5, s);
    expect(loadScaleLabelMm(s)).toBe(0.5);
    saveScaleLabelMm(-1, s);
    expect(loadScaleLabelMm(s)).toBe(0.5);
  });
});
