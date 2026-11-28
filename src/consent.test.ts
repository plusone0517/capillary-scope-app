import { describe, expect, it } from "vitest";
import {
  UNCONFIRMED_CONSENT,
  canShowOutside,
  canUseAsCase,
  consentSummaryLabel,
  isResearchCandidate,
  normalizeConsent,
  sameConsent,
} from "./consent";

describe("normalizeConsent", () => {
  it("旧データ（同意の記録なし）は未確認として扱う", () => {
    expect(normalizeConsent(undefined)).toEqual(UNCONFIRMED_CONSENT);
    expect(normalizeConsent(null)).toEqual(UNCONFIRMED_CONSENT);
    expect(normalizeConsent("granted")).toEqual(UNCONFIRMED_CONSENT);
  });
  it("不正な値は同意ありに倒さない", () => {
    const c = normalizeConsent({ caseUse: true, futureResearch: "yes" });
    expect(c.caseUse).toBe("unconfirmed");
    expect(c.futureResearch).toBe("unconfirmed");
  });
  it("事例の同意がなければ範囲は持たない", () => {
    expect(normalizeConsent({ caseUse: "declined", caseScope: "anonymous" }).caseScope).toBeNull();
    expect(normalizeConsent({ caseUse: "unconfirmed", caseScope: "anonymous" }).caseScope).toBeNull();
  });
  it("事例の同意があり範囲が未指定なら、狭い方（施設内のみ）にする", () => {
    expect(normalizeConsent({ caseUse: "granted" }).caseScope).toBe("internal");
    expect(normalizeConsent({ caseUse: "granted", caseScope: "public" }).caseScope).toBe("internal");
  });
});

describe("使ってよい範囲の判定", () => {
  it("未確認のデータは事例にも研究候補にも使わない", () => {
    expect(canUseAsCase(UNCONFIRMED_CONSENT)).toBe(false);
    expect(canShowOutside(UNCONFIRMED_CONSENT)).toBe(false);
    expect(isResearchCandidate(UNCONFIRMED_CONSENT)).toBe(false);
  });
  it("施設内のみの同意では、施設の外には出せない", () => {
    const c = normalizeConsent({ caseUse: "granted", caseScope: "internal" });
    expect(canUseAsCase(c)).toBe(true);
    expect(canShowOutside(c)).toBe(false);
  });
  it("事例の同意と研究の同意は別々に判定する", () => {
    const caseOnly = normalizeConsent({ caseUse: "granted", caseScope: "anonymous", futureResearch: "declined" });
    expect(canShowOutside(caseOnly)).toBe(true);
    expect(isResearchCandidate(caseOnly)).toBe(false);
    const researchOnly = normalizeConsent({ caseUse: "declined", futureResearch: "granted" });
    expect(canUseAsCase(researchOnly)).toBe(false);
    expect(isResearchCandidate(researchOnly)).toBe(true);
  });
});

describe("表示と比較", () => {
  it("スタッフ向けの1行表示", () => {
    expect(
      consentSummaryLabel(normalizeConsent({ caseUse: "granted", caseScope: "anonymous", futureResearch: "granted" })),
    ).toBe("事例紹介：同意あり（お名前を外して施設外でも紹介可）／将来の研究利用：同意あり");
    expect(consentSummaryLabel(UNCONFIRMED_CONSENT)).toBe("事例紹介：未確認／将来の研究利用：未確認");
  });
  it("sameConsent は3項目すべてを見る", () => {
    const a = normalizeConsent({ caseUse: "granted", caseScope: "internal", futureResearch: "granted" });
    expect(sameConsent(a, { ...a })).toBe(true);
    expect(sameConsent(a, { ...a, caseScope: "anonymous" })).toBe(false);
  });
});
