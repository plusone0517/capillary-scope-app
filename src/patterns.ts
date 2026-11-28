// 試用版（Space）の各コンポーネントは "./patterns" から定義を import する。
// 本番では src/data/capillary-patterns.ts が正のため、ここで再 export して
//  import パスだけを合わせる。内容は capillary-patterns.ts を正とする。
export * from "./data/capillary-patterns";

import { capillaryClinicalFlagKeys } from "./data/capillary-patterns";

/** 臨床フラグ4項目のキー（capillaryClinicalFlagKeys と対応）。 */
export type ClinicalFlagKey = (typeof capillaryClinicalFlagKeys)[number];

import { capillaryPatterns as allPatterns } from "./data/capillary-patterns";

/** パターンの番号（定義順の 1〜28）。「No.」表示に使う。 */
export const patternNumberByCode: Record<string, number> = Object.fromEntries(
  allPatterns.map((p, i) => [p.code, i + 1]),
);
