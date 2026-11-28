import { describe, expect, it } from "vitest";
import { firstToLatest, layoutTrend, niceStep } from "./trend";

const box = { left: 50, right: 650, top: 20, bottom: 220 };

describe("経過グラフの配置", () => {
  it("記録のない回は除き、古い順に並べる", () => {
    const l = layoutTrend(
      [
        { id: "c", observedAt: "2026-11-28T10:00:00Z", value: 9 },
        { id: "a", observedAt: "2026-05-28T10:00:00Z", value: 7.5 },
        { id: "b", observedAt: "2026-08-28T10:00:00Z", value: null },
      ],
      box,
    );
    expect(l.points.map((p) => p.id)).toEqual(["a", "c"]);
    expect(l.points[0].x).toBe(50);
    expect(l.points[1].x).toBe(650);
  });
  it("値が大きいほど上（yが小さい）に置き、範囲の中に収める", () => {
    const l = layoutTrend(
      [
        { id: "a", observedAt: "2026-05-01T00:00:00Z", value: 6 },
        { id: "b", observedAt: "2026-08-01T00:00:00Z", value: 9 },
      ],
      box,
    );
    expect(l.points[1].y).toBeLessThan(l.points[0].y);
    for (const p of l.points) {
      expect(p.y).toBeGreaterThanOrEqual(box.top);
      expect(p.y).toBeLessThanOrEqual(box.bottom);
    }
    expect(l.yMin).toBeLessThanOrEqual(6);
    expect(l.yMax).toBeGreaterThanOrEqual(9);
  });
  it("横の位置は日付の間隔に比例する", () => {
    const l = layoutTrend(
      [
        { id: "a", observedAt: "2026-01-01T00:00:00Z", value: 8 },
        { id: "b", observedAt: "2026-01-11T00:00:00Z", value: 8 },
        { id: "c", observedAt: "2026-02-10T00:00:00Z", value: 8 },
      ],
      box,
    );
    const gap1 = l.points[1].x - l.points[0].x;
    const gap2 = l.points[2].x - l.points[1].x;
    expect(gap2 / gap1).toBeCloseTo(3, 5);
  });
  it("1回だけなら中央に置く。0回なら空", () => {
    const one = layoutTrend([{ id: "a", observedAt: "2026-01-01T00:00:00Z", value: 8 }], box);
    expect(one.points[0].x).toBe(350);
    expect(layoutTrend([], box).points).toEqual([]);
  });
  it("目盛りは 1・2・5 の倍数", () => {
    expect(niceStep(2)).toBe(0.5);
    expect(niceStep(4)).toBe(1);
    expect(niceStep(9)).toBe(2);
    expect(niceStep(40)).toBe(10);
  });
});

describe("初回と最新", () => {
  it("差を小数1桁で返す", () => {
    expect(
      firstToLatest([
        { id: "b", observedAt: "2026-11-28T00:00:00Z", value: 9 },
        { id: "a", observedAt: "2026-05-28T00:00:00Z", value: 7.5 },
      ]),
    ).toEqual({ first: 7.5, latest: 9, diff: 1.5 });
  });
  it("記録が2回未満なら null", () => {
    expect(firstToLatest([{ id: "a", observedAt: "2026-05-28T00:00:00Z", value: 7 }])).toBeNull();
  });
});
