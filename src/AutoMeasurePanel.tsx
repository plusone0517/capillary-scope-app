// 自動計測（試作・参考値）のパネル。所見の密度欄の近くに置く。
// 代表画像から画像処理で密度・ループ幅・蛇行の目安を推定し、抽出の
// 重ね表示と見比べて確認できたときだけ、密度欄へ反映できる。
// 計測結果そのものは保存しない（反映先は既存の密度入力欄のみ）。

import { useEffect, useState } from "react";
import {
  analyzeCapillaryImage,
  type AutoMeasureResult,
} from "./autoMeasure";

type Props = {
  /** 解析対象の代表画像のURL。画像がまだ無い場合は null。 */
  imageUrl: string | null;
  /** 保存済みの較正値（μm/px）。編集画面で計測済みの場合に渡る。 */
  savedCalibrationUmPerPx?: number | null;
  /** 密度欄へ反映する（値は「本/mm」の文字列）。 */
  onApplyDensity: (value: string) => void;
};

type Phase =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done"; result: AutoMeasureResult }
  | { kind: "failed"; message: string };

export function AutoMeasurePanel({
  imageUrl,
  savedCalibrationUmPerPx = null,
  onApplyDensity,
}: Props) {
  const [calibration, setCalibration] = useState(
    savedCalibrationUmPerPx != null ? String(savedCalibrationUmPerPx) : "",
  );
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [showOverlay, setShowOverlay] = useState(true);
  const [appliedNote, setAppliedNote] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);

  // 保存済みの較正値が後から届いた場合（編集画面の読み込み後）に反映する。
  useEffect(() => {
    if (savedCalibrationUmPerPx != null) {
      setCalibration(String(savedCalibrationUmPerPx));
    }
  }, [savedCalibrationUmPerPx]);

  // 対象画像が変わったら、前回の結果は破棄する。
  useEffect(() => {
    setPhase({ kind: "idle" });
    setAppliedNote(null);
    setOriginalUrl(null);
    setOverlayUrl(null);
  }, [imageUrl]);

  const calibNum = (() => {
    const t = calibration.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const run = async () => {
    if (!imageUrl || phase.kind === "running") return;
    setPhase({ kind: "running" });
    setAppliedNote(null);
    const outcome = await analyzeCapillaryImage(imageUrl, calibNum);
    if (!outcome.ok) {
      setPhase({ kind: "failed", message: outcome.message });
      return;
    }
    setOriginalUrl(outcome.result.originalCanvas.toDataURL("image/jpeg", 0.85));
    setOverlayUrl(outcome.result.overlayCanvas.toDataURL("image/jpeg", 0.85));
    setShowOverlay(true);
    setPhase({ kind: "done", result: outcome.result });
  };

  const result = phase.kind === "done" ? phase.result : null;

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
      <h3 className="text-lg font-bold text-[var(--heading)]">
        自動計測（試作・参考値）
      </h3>
      <p className="text-base leading-relaxed text-[var(--text)]">
        代表画像から、画像処理で密度・ループの太さ・蛇行の目安を推定します。計算はこの端末の中で行い、画像を外部に送ることはありません。抽出結果の重ね表示と元の画像を見比べて、合っている場合だけお使いください。
      </p>

      {imageUrl == null ? (
        <p className="text-base text-[var(--dim)]">
          代表画像を撮影するか取り込むと、その画像で自動計測ができます。
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-base font-medium text-[var(--text)]">
            較正値：1ピクセルあたりの長さ（μm/px・任意）
            <input
              aria-label="自動計測の較正値（μm/px）"
              inputMode="decimal"
              className="min-h-14 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-lg text-[var(--text)]"
              value={calibration}
              onChange={(e) => setCalibration(e.target.value)}
              placeholder="例：1.25（目盛りで較正した値）"
            />
          </label>
          <p className="text-base text-[var(--dim)]">
            較正値が未入力の場合は、ループの本数とピクセル単位の幅までを表示し、本/mmへの換算は出しません。較正値を入れて計測し直すと、本/mmで表示できます。
          </p>
          <button
            type="button"
            disabled={phase.kind === "running"}
            onClick={() => void run()}
            className="min-h-14 self-start rounded-[var(--radius)] bg-[var(--accent)] px-6 text-lg font-bold text-white disabled:opacity-40"
          >
            {phase.kind === "running"
              ? "計測しています…"
              : result
                ? "もう一度計測する"
                : "自動計測する"}
          </button>
        </>
      )}

      {phase.kind === "failed" && (
        <p role="alert" className="text-lg font-medium text-[var(--alert)]">
          {phase.message}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <dl className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="text-base font-medium text-[var(--dim)]">ループの本数</dt>
              <dd className="text-2xl font-bold text-[var(--heading)]">
                {result.loopCount} 本
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="text-base font-medium text-[var(--dim)]">密度（推定）</dt>
              <dd className="text-2xl font-bold text-[var(--heading)]">
                {result.densityPerMm != null
                  ? `${result.densityPerMm.toFixed(1)} 本/mm`
                  : "較正すると mm 換算できます"}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="text-base font-medium text-[var(--dim)]">ループの太さ（平均）</dt>
              <dd className="text-2xl font-bold text-[var(--heading)]">
                {result.loopWidthUm != null
                  ? `${result.loopWidthUm.toFixed(0)} μm`
                  : `${result.loopWidthPx.toFixed(0)} ピクセル`}
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-3">
              <dt className="text-base font-medium text-[var(--dim)]">蛇行の目安</dt>
              <dd className="text-2xl font-bold text-[var(--heading)]">
                {result.tortuosity != null
                  ? result.tortuosity.toFixed(2)
                  : "測れませんでした"}
              </dd>
              {result.tortuosity != null && (
                <span className="text-base text-[var(--dim)]">
                  （1.0に近いほどまっすぐな形です）
                </span>
              )}
            </div>
          </dl>

          {(originalUrl || overlayUrl) && (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={showOverlay}
                  onClick={() => setShowOverlay(true)}
                  className={`min-h-11 rounded-full px-4 text-base font-medium ${
                    showOverlay
                      ? "bg-[var(--accent)] font-bold text-white"
                      : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  }`}
                >
                  抽出を重ねて表示
                </button>
                <button
                  type="button"
                  aria-pressed={!showOverlay}
                  onClick={() => setShowOverlay(false)}
                  className={`min-h-11 rounded-full px-4 text-base font-medium ${
                    !showOverlay
                      ? "bg-[var(--accent)] font-bold text-white"
                      : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
                  }`}
                >
                  元の画像
                </button>
              </div>
              <img
                src={(showOverlay ? overlayUrl : originalUrl) ?? undefined}
                alt={
                  showOverlay
                    ? "抽出された血管を重ねた確認用画像"
                    : "解析に使った元の画像"
                }
                className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)]"
              />
              <p className="text-base text-[var(--dim)]">
                重ね表示では、抽出した血管が青緑色、数えた位置が黄色の線と点で示されます。実際の血管と重なりが合っているか確認してください。
              </p>
            </div>
          )}

          {result.densityPerMm != null && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => {
                  onApplyDensity(result.densityPerMm?.toFixed(1) ?? "");
                  setAppliedNote(
                    "上の密度欄に反映しました。数値は密度欄でそのまま手直しできます。",
                  );
                }}
                className="min-h-14 self-start rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)]"
              >
                この密度を密度欄に反映する
              </button>
              {appliedNote && (
                <p className="text-base font-medium text-[var(--accent-strong)]">
                  {appliedNote}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
