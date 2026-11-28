import { describe, expect, it } from "vitest";
import {
  buildMeasurement,
  defaultLine,
  densityPerMm,
  distancePx,
  isWithinRange,
  lineAlongRow,
  loadCalibration,
  mmToPx,
  moveLine,
  nearestPointIndex,
  normalizeMeasurement,
  positionAlong,
  pxToMm,
  saveCalibration,
  umPerPxFromLine,
} from "./densityCount";

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe("目盛り合わせ", () => {
  it("1mm の目盛りを 730 ピクセルでなぞると、1ピクセルは約1.37μm", () => {
    // 実画像（幅1600ピクセル）の目盛りがこの比率だった。
    const v = umPerPxFromLine({ x: 435, y: 100 }, { x: 1165, y: 100 }, 1);
    expect(v).toBeCloseTo(1000 / 730, 5);
  });
  it("短すぎる線・不正な長さは受け付けない", () => {
    expect(umPerPxFromLine({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)).toBeNull();
    expect(umPerPxFromLine({ x: 0, y: 0 }, { x: 500, y: 0 }, 0)).toBeNull();
    expect(umPerPxFromLine({ x: 0, y: 0 }, { x: 500, y: 0 }, Number.NaN)).toBeNull();
  });
  it("斜めになぞっても長さで計算する", () => {
    expect(distancePx({ x: 0, y: 0 }, { x: 300, y: 400 })).toBe(500);
    expect(umPerPxFromLine({ x: 0, y: 0 }, { x: 300, y: 400 }, 1)).toBe(2);
  });
  it("画像の幅ごとに覚え、別の幅には使わない", () => {
    const s = memoryStorage();
    expect(loadCalibration(1600, s)).toBeNull();
    saveCalibration(1600, 1.37, s);
    expect(loadCalibration(1600, s)).toBe(1.37);
    expect(loadCalibration(1280, s)).toBeNull();
    saveCalibration(1280, 1.71, s);
    expect(loadCalibration(1600, s)).toBe(1.37);
  });
});

describe("数える範囲", () => {
  it("標準は 1mm の水平な線", () => {
    const umPerPx = 1000 / 730;
    const line = defaultLine(1600, 900, umPerPx);
    expect(distancePx(line.start, line.end)).toBeCloseTo(730, 5);
    expect(line.start.y).toBe(line.end.y);
  });
  it("画像の幅が 1mm に満たないときは、画像の幅の9割を使う", () => {
    const line = defaultLine(600, 400, 2); // 幅 1.2mm → 1mm = 500px は収まる
    expect(distancePx(line.start, line.end)).toBe(500);
    const narrow = defaultLine(400, 300, 2); // 幅 0.8mm
    expect(distancePx(narrow.start, narrow.end)).toBe(360);
  });
  it("線は画像の外に出ない", () => {
    const line = { start: { x: 100, y: 50 }, end: { x: 600, y: 50 } };
    const moved = moveLine(line, 5000, -5000, 1000, 800);
    expect(moved.end.x).toBe(1000);
    expect(moved.start.x).toBe(500);
    expect(moved.start.y).toBe(0);
  });
});

describe("密度", () => {
  it("本数 ÷ 長さ（mm）を小数1桁で出す", () => {
    expect(densityPerMm(9, 1)).toBe(9);
    expect(densityPerMm(7, 0.8)).toBe(8.8);
    expect(densityPerMm(0, 1)).toBe(0);
    expect(densityPerMm(5, 0)).toBeNull();
  });
  it("近くの点だけを消す対象にする", () => {
    const pts = [{ x: 100, y: 100 }, { x: 300, y: 100 }];
    expect(nearestPointIndex(pts, { x: 105, y: 98 }, 20)).toBe(0);
    expect(nearestPointIndex(pts, { x: 200, y: 100 }, 20)).toBe(-1);
  });
  it("保存する記録は位置を 0〜1 の比にし、読み込みで検査できる", () => {
    const umPerPx = 1000 / 730;
    const line = defaultLine(1600, 900, umPerPx);
    const points = Array.from({ length: 9 }, (_, i) => ({ x: 450 + i * 80, y: 380 }));
    const m = buildMeasurement({ points, line, umPerPx, imageWidthPx: 1600, imageHeightPx: 900 });
    expect(m).not.toBeNull();
    expect(m!.count).toBe(9);
    expect(m!.lengthMm).toBe(1);
    expect(m!.densityPerMm).toBe(9);
    expect(m!.points[0].x).toBeCloseTo(450 / 1600, 6);
    expect(normalizeMeasurement(JSON.parse(JSON.stringify(m)))).toEqual(m);
    expect(normalizeMeasurement({ method: "manual_tap" })).toBeNull();
    expect(normalizeMeasurement(null)).toBeNull();
  });
  it("mm とピクセルの換算は往復で一致する", () => {
    expect(mmToPx(1, 2)).toBe(500);
  });
});

describe("先端の列に沿って範囲を置く", () => {
  const um = 1000 / 734; // 実画像（幅1600）の目盛りの比率

  it("列が水平なら、画像の中央に 1mm の水平な線を、先端より上にずらして置く", () => {
    const line = lineAlongRow({ slope: 0, intercept: 300 }, 1600, 900, um, 32);
    expect(line.start.y).toBeCloseTo(268, 5);
    expect(line.end.y).toBeCloseTo(268, 5);
    expect((line.start.x + line.end.x) / 2).toBeCloseTo(800, 5);
    expect(pxToMm(distancePx(line.start, line.end), um)).toBeCloseTo(1, 5);
  });

  it("列が傾いていても、線の長さは 1mm のまま（横幅ではなく、列に沿った長さ）", () => {
    const line = lineAlongRow({ slope: 0.25, intercept: 100 }, 1600, 900, um, 32);
    expect(pxToMm(distancePx(line.start, line.end), um)).toBeCloseTo(1, 5);
    expect((line.end.y - line.start.y) / (line.end.x - line.start.x)).toBeCloseTo(0.25, 5);
    expect((line.start.x + line.end.x) / 2).toBeCloseTo(800, 5);
  });

  it("画像が 1mm より狭いときは、横幅の9割に収める", () => {
    const line = lineAlongRow({ slope: 0, intercept: 200 }, 600, 400, um, 10);
    expect(line.end.x - line.start.x).toBeCloseTo(540, 5);
  });

  it("線は画像の上下にはみ出さない", () => {
    const top = lineAlongRow({ slope: 0.3, intercept: -50 }, 1600, 900, um, 32);
    expect(Math.min(top.start.y, top.end.y)).toBeGreaterThanOrEqual(0);
    const bottom = lineAlongRow({ slope: 0.3, intercept: 700 }, 1600, 900, um, 32);
    expect(Math.max(bottom.start.y, bottom.end.y)).toBeLessThanOrEqual(900);
  });

  it("範囲の中かどうかは、線に垂直に下ろした位置で決める", () => {
    const line = { start: { x: 100, y: 100 }, end: { x: 500, y: 100 } };
    expect(positionAlong({ x: 300, y: 400 }, line)).toBeCloseTo(0.5, 5);
    expect(isWithinRange({ x: 100, y: 250 }, line)).toBe(true);
    expect(isWithinRange({ x: 500, y: 250 }, line)).toBe(true);
    expect(isWithinRange({ x: 99, y: 100 }, line)).toBe(false);
    expect(isWithinRange({ x: 501, y: 100 }, line)).toBe(false);
    // 傾いた線では、端の境目も傾く。
    const tilted = { start: { x: 0, y: 0 }, end: { x: 400, y: 400 } };
    expect(isWithinRange({ x: 0, y: 10 }, tilted)).toBe(true);
    expect(isWithinRange({ x: 10, y: -20 }, tilted)).toBe(false);
    expect(positionAlong({ x: 5, y: 5 }, { start: { x: 1, y: 1 }, end: { x: 1, y: 1 } })).toBeNull();
  });
});

describe("自動の候補を記録に残す", () => {
  const base = {
    points: [{ x: 400, y: 300 }],
    line: { start: { x: 100, y: 200 }, end: { x: 834, y: 200 } },
    umPerPx: 1000 / 734,
    imageWidthPx: 1600,
    imageHeightPx: 900,
  };

  it("候補は 0〜1 の比にして、人が確かめた位置とは別に残す", () => {
    const m = buildMeasurement({
      ...base,
      proposal: { version: "tips-test", points: [{ x: 400, y: 300 }, { x: 800, y: 450 }] },
      imageQuality: { version: "q", sharpness: 10, vesselContrast: 12, brightness: 130, glarePct: 0.5 },
    })!;
    expect(m.method).toBe("manual_tap");
    expect(m.count).toBe(1);
    expect(m.proposal).toEqual({
      version: "tips-test",
      points: [{ x: 0.25, y: 300 / 900 }, { x: 0.5, y: 0.5 }],
    });
    expect(m.imageQuality?.sharpness).toBe(10);
    // 読み込みの検査を通り、候補も残る。
    expect(normalizeMeasurement(JSON.parse(JSON.stringify(m)))?.proposal?.points).toHaveLength(2);
  });

  it("候補を出していない記録には、候補の欄を作らない", () => {
    const m = buildMeasurement(base)!;
    expect("proposal" in m).toBe(false);
    expect("imageQuality" in m).toBe(false);
  });

  it("前の記録の候補は、出し直さない限り引き継ぐ", () => {
    const stored = { version: "tips-old", points: [{ x: 0.1, y: 0.2 }] };
    expect(buildMeasurement({ ...base, proposalStored: stored })!.proposal).toEqual(stored);
    const fresh = buildMeasurement({
      ...base,
      proposalStored: stored,
      proposal: { version: "tips-new", points: [{ x: 160, y: 90 }] },
    })!;
    expect(fresh.proposal).toEqual({ version: "tips-new", points: [{ x: 0.1, y: 0.1 }] });
  });
});
