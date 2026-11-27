// 試用版（Space）の各コンポーネントは "./patterns" から定義を import する。
// 本番では src/data/capillary-patterns.ts が正のため、ここで再 export して
//  import パスだけを合わせる。内容は capillary-patterns.ts を正とする。
export * from "./data/capillary-patterns";

import { capillaryClinicalFlagKeys } from "./data/capillary-patterns";

/** 臨床フラグ4項目のキー（capillaryClinicalFlagKeys と対応）。 */
export type ClinicalFlagKey = (typeof capillaryClinicalFlagKeys)[number];
