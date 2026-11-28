// 同意の記録（ケーススタディ用と、将来の研究利用の2段）。
//
// 方針（2026-11-28 ユーザー決定）:
// - 現在は「事例（ケーススタディ）としての紹介」で運用する。
// - 将来、倫理審査を経て研究に使えるデータとして蓄積していくため、
//   「将来の研究利用」への同意も最初から分けて記録しておく。
// - 同意は観察1件ごとに保存する（その回のデータを何に使ってよいかを、
//   あとから1件ずつ確かめられるようにするため）。
// - 記録がない・あいまいな場合は必ず「未確認」に倒す。未確認のデータは
//   事例紹介にも研究候補にも使わない。

/** 同意書の版。文面を変えたら必ず上げる（どの文面への同意かを追えるようにする）。 */
export const CONSENT_FORM_VERSION = "draft-2026-11-28";

export type ConsentAnswer = "granted" | "declined" | "unconfirmed";

/**
 * 事例として紹介してよい範囲。
 * - internal: 院内（施設内）での説明・共有のみ。
 * - anonymous: 氏名などを外したうえで、施設の外でも紹介してよい。
 */
export type CaseScope = "internal" | "anonymous";

export type ConsentState = {
  /** 1. 事例（ケーススタディ）として紹介することへの同意。 */
  caseUse: ConsentAnswer;
  /** caseUse が granted のときだけ意味を持つ。それ以外は null。 */
  caseScope: CaseScope | null;
  /** 2. 将来、研究に利用することへの同意。 */
  futureResearch: ConsentAnswer;
};

export const UNCONFIRMED_CONSENT: ConsentState = {
  caseUse: "unconfirmed",
  caseScope: null,
  futureResearch: "unconfirmed",
};

export const consentAnswerLabels: Record<ConsentAnswer, string> = {
  granted: "同意あり",
  declined: "同意なし",
  unconfirmed: "未確認",
};

export const caseScopeLabels: Record<CaseScope, string> = {
  internal: "施設内での紹介のみ",
  anonymous: "お名前を外して施設外でも紹介可",
};

function toAnswer(raw: unknown): ConsentAnswer {
  return raw === "granted" || raw === "declined" ? raw : "unconfirmed";
}

/**
 * 保存値・入力値を正規の形にそろえる。
 * - 旧データ（consent なし）や不正な値は「未確認」。
 * - 事例の同意がない場合、範囲は持たない（null）。
 * - 事例の同意があるのに範囲が未指定・不正なら、狭い方（施設内のみ）に倒す。
 */
export function normalizeConsent(raw: unknown): ConsentState {
  if (typeof raw !== "object" || raw === null) return { ...UNCONFIRMED_CONSENT };
  const r = raw as Record<string, unknown>;
  const caseUse = toAnswer(r.caseUse);
  const caseScope: CaseScope | null =
    caseUse !== "granted" ? null : r.caseScope === "anonymous" ? "anonymous" : "internal";
  return { caseUse, caseScope, futureResearch: toAnswer(r.futureResearch) };
}

export function sameConsent(a: ConsentState, b: ConsentState): boolean {
  return (
    a.caseUse === b.caseUse &&
    a.caseScope === b.caseScope &&
    a.futureResearch === b.futureResearch
  );
}

/** 事例として（少なくとも施設内で）紹介してよいか。 */
export function canUseAsCase(c: ConsentState): boolean {
  return c.caseUse === "granted";
}

/** お名前を外したうえで施設の外に出してよいか。 */
export function canShowOutside(c: ConsentState): boolean {
  return c.caseUse === "granted" && c.caseScope === "anonymous";
}

/**
 * 将来の研究利用の候補にできるか。
 * これは「候補」であり、実際に研究に使うには別途、倫理審査などの手続きが要る。
 */
export function isResearchCandidate(c: ConsentState): boolean {
  return c.futureResearch === "granted";
}

/** スタッフ向けの1行表示。 */
export function consentSummaryLabel(c: ConsentState): string {
  const caseText =
    c.caseUse === "granted" && c.caseScope
      ? `事例紹介：同意あり（${caseScopeLabels[c.caseScope]}）`
      : `事例紹介：${consentAnswerLabels[c.caseUse]}`;
  return `${caseText}／将来の研究利用：${consentAnswerLabels[c.futureResearch]}`;
}
