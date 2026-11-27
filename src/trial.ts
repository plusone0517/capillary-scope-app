// 試験モード：実施内容（何を実施したか）の選択肢と表示用ラベル。
// 実施内容は事実の記録として表示するだけで、変化との因果を
// アプリ側で断定する文はここでは作らない。

export const interventionCategories = [
  { code: "gas", label: "ガス吸入" },
  { code: "supplement", label: "サプリ・食品" },
  { code: "exercise", label: "運動" },
  { code: "heat", label: "温熱" },
  { code: "other", label: "その他" },
] as const;

export const gasTypes = [
  { code: "radon", label: "ラドン" },
  { code: "hydrogen", label: "水素" },
  { code: "hydrogen_oxygen", label: "水素・酸素混合" },
] as const;

export const interventionTimings = [
  { code: "before_obs", label: "この観察の前" },
  { code: "after_obs", label: "この観察の後" },
  { code: "between_visits", label: "2回の観察の期間中" },
] as const;

export const interventionCategoryLabels: Record<string, string> = Object.fromEntries(
  interventionCategories.map((c) => [c.code, c.label]),
);
export const gasTypeLabels: Record<string, string> = Object.fromEntries(
  gasTypes.map((g) => [g.code, g.label]),
);
export const interventionTimingLabels: Record<string, string> = Object.fromEntries(
  interventionTimings.map((t) => [t.code, t.label]),
);

export type InterventionLike = {
  category: string;
  gasType: string | null;
  detail: string;
  timing: string;
};

/** 実施内容1件の見出し（例：「ガス吸入（水素）」）。 */
export function interventionTitle(iv: InterventionLike): string {
  const category = interventionCategoryLabels[iv.category] ?? iv.category;
  if (iv.category === "gas" && iv.gasType) {
    return `${category}（${gasTypeLabels[iv.gasType] ?? iv.gasType}）`;
  }
  return category;
}

/** 実施内容1件を1行で表す（例：「ガス吸入（水素）：30分 × 週2回」）。 */
export function interventionLine(iv: InterventionLike): string {
  const title = interventionTitle(iv);
  return iv.detail.trim() ? `${title}：${iv.detail.trim()}` : title;
}

export type TimedIntervention = {
  iv: InterventionLike;
  /** どちらの観察に記録されたか（"before" = ビフォア側、"after" = アフター側）。 */
  side: "before" | "after";
};

/**
 * ビフォアとアフターの「間に実施したこと」を時系列順に集める。
 * - ビフォア側の観察に「この観察の後」と記録されたもの
 * - アフター側の観察に「2回の観察の期間中」「この観察の前」と記録されたもの
 * （アフター側の「この観察の前」は、直前の観察より後に実施されたものとして扱う）
 */
export function interventionsBetween(
  before: { interventions: InterventionLike[] },
  after: { interventions: InterventionLike[] },
): TimedIntervention[] {
  const items: TimedIntervention[] = [];
  for (const iv of before.interventions) {
    if (iv.timing === "after_obs" || iv.timing === "between_visits") {
      items.push({ iv, side: "before" });
    }
  }
  for (const iv of after.interventions) {
    if (iv.timing === "between_visits" || iv.timing === "before_obs") {
      items.push({ iv, side: "after" });
    }
  }
  return items;
}
