// ビフォアアフター比較の表示ルールのテスト。
// 記録のない回との差を「変化」として見せないこと、未記録の撮影条件を
// 「そろっている」と表示しないことを確かめる。
import { describe, expect, it } from "vitest";
import {
  conditionSummaryText,
  conditionWarnings,
  patternBaseline,
  patternNamesOf,
  unverifiedConditions,
  type Observation,
} from "./compare";

function obs(over: Partial<Observation>): Observation {
  return {
    finger: "left_ring",
    roomTempC: null,
    restMinutes: null,
    restrictionsOk: false,
    patterns: [],
    ...over,
  } as Observation;
}

describe("patternBaseline", () => {
  it("前回に形の記録がなければ before_missing（新規扱いにしない）", () => {
    // 2026-11-28 の実レポートと同じ状況：前回は未記録、今回は 正常・蛇行。
    const before = obs({ patterns: [] });
    const after = obs({ patterns: ["normal", "tortuous"] });
    expect(patternBaseline(before, after)).toBe("before_missing");
  });
  it("両回に記録があれば both", () => {
    expect(
      patternBaseline(obs({ patterns: ["normal"] }), obs({ patterns: ["normal"] })),
    ).toBe("both");
  });
  it("今回だけ記録がなければ after_missing、両方なければ none", () => {
    expect(patternBaseline(obs({ patterns: ["normal"] }), obs({}))).toBe("after_missing");
    expect(patternBaseline(obs({}), obs({}))).toBe("none");
  });
  it("形の名前は正式名称で返る", () => {
    expect(patternNamesOf(obs({ patterns: ["normal"] }))).toEqual(["正常"]);
  });
});

describe("撮影条件の照合", () => {
  it("一般検査のように室温・安静時間・制限が未記録なら、そろっているとは表示しない", () => {
    const before = obs({});
    const after = obs({});
    expect(conditionWarnings(before, after)).toEqual([]);
    expect(unverifiedConditions(before, after)).toEqual([
      "室温",
      "安静時間",
      "撮影前の制限の確認",
    ]);
    const text = conditionSummaryText(before, after);
    expect(text).not.toContain("そろっています");
    expect(text).toContain("照合は行っていません");
  });
  it("すべて記録があり一致していれば、そろっていると表示する", () => {
    const full = { roomTempC: 23, restMinutes: 15, restrictionsOk: true };
    const text = conditionSummaryText(obs(full), obs(full));
    expect(unverifiedConditions(obs(full), obs(full))).toEqual([]);
    expect(text).toContain("撮影条件もそろっています");
  });
  it("片方だけ未記録の項目も照合できない項目に入る", () => {
    const a = obs({ roomTempC: 23, restMinutes: 15, restrictionsOk: true });
    const b = obs({ roomTempC: null, restMinutes: 15, restrictionsOk: true });
    expect(unverifiedConditions(a, b)).toEqual(["室温"]);
  });
});
