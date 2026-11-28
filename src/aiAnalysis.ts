// AI解析の集約（一般検査モード用）。
//
// 一般検査では、動画から切り出した複数フレーム＋静止画を1枚ずつ
// analyzeImagePatterns にかけ、結果をここで集約する。狙いは、
// 1フレームだけの偶然やスタッフの主観に結果が寄らないようにし、
// 「誰が検査しても同じ回答」に近づけること。
//
// 集約ルール：
// - パターン（コード）ごとに、出現したフレーム数（hitFrames）を数える。
// - 代表の出現は、確からしさが最も高いもの（同点なら先に現れたもの）とし、
//   理由文・場所（location）・対象画像はその出現のものを採用する。
// - 並び順は hitFrames の多い順 → 確からしさの高い順 → 代表出現の早い順。
// - 所見の下書きに入れるのは上位 MAX_DRAFT_PATTERNS 件まで。

import type { AiPatternCandidate } from "./api";

/** 解析対象にした画像1枚（切り出しフレームまたは撮影した静止画）。 */
export type AnalyzedImageInput = {
  /** 表示用URL（注釈表示の元画像にも使う）。 */
  previewUrl: string;
  dataBase64: string;
  mimeType: "image/jpeg" | "image/png";
};

/** 集約後の候補1件。 */
export type AggregatedCandidate = {
  /** 28種の正規コード。 */
  code: string;
  /** 何枚の画像でこのパターンが出たか。 */
  hitFrames: number;
  /** 解析した画像の総数。 */
  totalFrames: number;
  /** 出現の中で最も高い確からしさ。 */
  bestConfidence: AiPatternCandidate["confidence"];
  /** 代表の出現の理由文。 */
  reason: string;
  /** 代表の出現の場所（特定できなかった場合は null）。 */
  location: { x: number; y: number } | null;
  /** 代表の出現があった画像の表示用URL（注釈表示の対象を決めるのに使う）。 */
  sourcePreviewUrl: string;
};

const confidenceRank: Record<AiPatternCandidate["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/** 所見の下書きとして自動で入れる候補の上限（1枚あたりの候補上限4件に合わせる）。 */
export const MAX_DRAFT_PATTERNS = 4;

/**
 * 画像ごとの候補一覧を集約する。
 * perImage は解析した順（動画フレーム→静止画の順）で渡すこと。
 */
export function aggregateCandidates(
  perImage: { previewUrl: string; candidates: AiPatternCandidate[] }[],
): AggregatedCandidate[] {
  type Acc = AggregatedCandidate & { firstSeenOrder: number };
  const byCode = new Map<string, Acc>();
  let order = 0;
  for (const image of perImage) {
    // 同じ画像の中で同じコードが重複して返ることはない前提だが、
    // hitFrames の二重数えを防ぐため画像内では1回だけ数える。
    const seenInImage = new Set<string>();
    for (const candidate of image.candidates) {
      order += 1;
      if (seenInImage.has(candidate.code)) continue;
      seenInImage.add(candidate.code);
      const existing = byCode.get(candidate.code);
      if (!existing) {
        byCode.set(candidate.code, {
          code: candidate.code,
          hitFrames: 1,
          totalFrames: perImage.length,
          bestConfidence: candidate.confidence,
          reason: candidate.reason,
          location: candidate.location ?? null,
          sourcePreviewUrl: image.previewUrl,
          firstSeenOrder: order,
        });
        continue;
      }
      existing.hitFrames += 1;
      // 確からしさが高い出現を代表にする（同点なら先の出現のまま）。
      if (
        confidenceRank[candidate.confidence] >
        confidenceRank[existing.bestConfidence]
      ) {
        existing.bestConfidence = candidate.confidence;
        existing.reason = candidate.reason;
        existing.location = candidate.location ?? null;
        existing.sourcePreviewUrl = image.previewUrl;
      }
    }
  }
  return [...byCode.values()]
    .sort(
      (a, b) =>
        b.hitFrames - a.hitFrames ||
        confidenceRank[b.bestConfidence] - confidenceRank[a.bestConfidence] ||
        a.firstSeenOrder - b.firstSeenOrder,
    )
    .map(({ firstSeenOrder: _ignored, ...rest }) => rest);
}
