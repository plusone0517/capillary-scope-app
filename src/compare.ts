// ビフォアアフター比較の共通ロジック。
// 比較画面（CompareView）とレポート内の「前回との比較」欄（ReportView）で共用する。
// 数値の変化は事実の表示に留め、良し悪しの判定文はここでは作らない。

import type { ObservationRecord } from "./api";
import {
  capillaryClinicalFlagLabels,
  capillaryColorLabels,
  capillaryFingerLabels,
  capillaryFlowLabels,
  capillaryPatternByCode,
} from "./patterns";

export type Observation = ObservationRecord;

export function primaryImageOf(obs: Observation) {
  return obs.images.find((i) => i.isPrimary) ?? obs.images[0] ?? null;
}

export function flagLabelsOf(obs: Observation): string[] {
  const labels: string[] = [];
  if (obs.flagGiant) labels.push(capillaryClinicalFlagLabels["giant"] ?? "巨大毛細血管あり");
  if (obs.flagHemorrhage) labels.push(capillaryClinicalFlagLabels["hemorrhage"] ?? "微小出血あり");
  if (obs.flagLoss) labels.push(capillaryClinicalFlagLabels["loss"] ?? "脱落・無血管野あり");
  if (obs.flagRamified) labels.push(capillaryClinicalFlagLabels["ramified"] ?? "分枝あり");
  return labels;
}

export function flagTextOf(obs: Observation): string {
  const labels = flagLabelsOf(obs);
  return labels.length > 0 ? labels.join("、") : "なし";
}

export function fingerLabel(code: string): string {
  return capillaryFingerLabels[code] ?? code;
}

export function flowLabel(code: string | null): string {
  return code ? (capillaryFlowLabels[code] ?? code) : "記録なし";
}

export function colorLabel(code: string | null): string {
  return code ? (capillaryColorLabels[code] ?? code) : "記録なし";
}

export function formatDensity(v: number | null): string {
  return v == null ? "記録なし" : `${v} 本/mm`;
}

export function formatSpeed(obs: Observation): string {
  if (obs.flowSpeedMmPerSec != null)
    return `${obs.flowSpeedMmPerSec.toFixed(2)} mm/秒`;
  if (obs.flowSpeedPxPerSec != null)
    return `${obs.flowSpeedPxPerSec.toFixed(1)} ピクセル/秒（校正値なし）`;
  return "記録なし";
}

function trimNum(v: number, digits: number): string {
  const s = v.toFixed(digits);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** 差分を符号つきで返す（例: +2 / −0.17 / 0）。 */
export function formatSigned(value: number, digits: number): string {
  const rounded = Number(value.toFixed(digits));
  const body = trimNum(Math.abs(rounded), digits);
  if (rounded > 0) return `+${body}`;
  if (rounded < 0) return `−${body}`;
  return "0";
}

export type PatternDiff = {
  /** アフターで新たに見られた形の名前 */
  added: string[];
  /** ビフォアのみで見られた形の名前 */
  removed: string[];
  /** 両方で見られた形の名前 */
  kept: string[];
};

export function patternDiff(before: Observation, after: Observation): PatternDiff {
  const names = (codes: string[]) =>
    codes.map((c) => capillaryPatternByCode[c]?.name ?? c);
  return {
    added: names(after.patterns.filter((c) => !before.patterns.includes(c))),
    removed: names(before.patterns.filter((c) => !after.patterns.includes(c))),
    kept: names(after.patterns.filter((c) => before.patterns.includes(c))),
  };
}

/**
 * 形の比較ができる状態かどうか。
 * - both: 両回とも形の記録があり、増減を比べられる。
 * - before_missing: 前回に形の記録がない（今回の形は「新たに見られた形」ではない）。
 * - after_missing: 今回に形の記録がない。
 * - none: 両回とも形の記録がない。
 * 記録のない回との差を「変化」として表示しないために使う。
 */
export type PatternBaseline = "both" | "before_missing" | "after_missing" | "none";

export function patternBaseline(before: Observation, after: Observation): PatternBaseline {
  const hasBefore = before.patterns.length > 0;
  const hasAfter = after.patterns.length > 0;
  if (hasBefore && hasAfter) return "both";
  if (hasAfter) return "before_missing";
  if (hasBefore) return "after_missing";
  return "none";
}

/** 形の名前の一覧（比較できない回の表示用）。 */
export function patternNamesOf(obs: Observation): string[] {
  return obs.patterns.map((c) => capillaryPatternByCode[c]?.name ?? c);
}

/**
 * 撮影条件のうち、照合できなかった項目の名前。
 * conditionWarnings は「記録がある項目同士の違い」だけを返すため、
 * それが空でも条件がそろっているとは限らない。ここが空のときに限り
 * 「撮影条件がそろっている」と表示してよい。
 */
export function unverifiedConditions(before: Observation, after: Observation): string[] {
  const items: string[] = [];
  if (before.roomTempC == null || after.roomTempC == null) items.push("室温");
  if (before.restMinutes == null || after.restMinutes == null) items.push("安静時間");
  if (!before.restrictionsOk || !after.restrictionsOk) items.push("撮影前の制限の確認");
  return items;
}

/** 条件の照合結果を1文にする（違いがない場合の表示用）。 */
export function conditionSummaryText(before: Observation, after: Observation): string {
  const sameFinger = before.finger === after.finger;
  const head = sameFinger
    ? `同じ指（${fingerLabel(after.finger)}）同士の比較です。`
    : "";
  const unverified = unverifiedConditions(before, after);
  if (unverified.length === 0)
    return sameFinger ? `${head}撮影条件もそろっています。` : "撮影条件はそろっています。";
  return `${head}${unverified.join("・")}は記録がそろっていないため、撮影条件の照合は行っていません。`;
}

/**
 * 撮影条件の違いの一覧（未記録の項目は判定しない）。
 * 空でも「そろっている」とは限らない。表示文は conditionSummaryText を使うこと。
 * 撮影の型のルール：条件が違う回の数値は単純比較できない。
 */
export function conditionWarnings(before: Observation, after: Observation): string[] {
  const warnings: string[] = [];
  if (before.finger !== after.finger)
    warnings.push(
      `撮影した指が異なります（ビフォア：${fingerLabel(before.finger)}／アフター：${fingerLabel(after.finger)}）`,
    );
  if (
    before.roomTempC != null &&
    after.roomTempC != null &&
    before.roomTempC !== after.roomTempC
  )
    warnings.push(
      `室温が異なります（ビフォア：${before.roomTempC}℃／アフター：${after.roomTempC}℃）`,
    );
  if (
    before.restMinutes != null &&
    after.restMinutes != null &&
    before.restMinutes !== after.restMinutes
  )
    warnings.push(
      `安静時間が異なります（ビフォア：${before.restMinutes}分／アフター：${after.restMinutes}分）`,
    );
  if (before.restrictionsOk !== after.restrictionsOk)
    warnings.push("撮影前の制限の確認の状態が異なります");
  return warnings;
}
