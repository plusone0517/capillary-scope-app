// 一般検査モードの「新しい観察」画面。
//
// 一般検査は、入力を対象者の名前だけに絞り、撮影 → AI解析 → 28種の結果 →
// レポートを最小の操作で進めるための画面。室温・安静時間などの撮影条件、
// 流れ／色の印象、臨床フラグの手入力、まとめ欄といった細かい入力は
// 研究用モード（従来のフォーム）でのみ扱う。
//
// AI解析は主役として大きく置く：動画があれば等間隔に最大4フレームを
// 切り出し、静止画も加えて（合計最大5枚）1枚ずつ解析し、結果を集約する
// （src/aiAnalysis.ts）。集約結果は所見のパターン選択の下書きとして入り、
// スタッフは外す／足すことができるが、基本はAIの結果で進む。

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, describeFirebaseError, type AiPatternCandidate } from "./api";
import {
  CaptureControls,
  CaptureIntro,
  CaptureMediaDisplay,
  useCapturePanel,
} from "./CapturePanel";
import { AnnotatedImage, type AnnotationItem } from "./AnnotatedImage";
import { PatternDiagram } from "./PatternDiagram";
import {
  captureFrameFromVideoUrl,
  captureFramesFromVideoUrl,
  type CapturedImage,
  type CapturedVideo,
} from "./camera";
import {
  aggregateCandidates,
  MAX_DRAFT_PATTERNS,
  type AggregatedCandidate,
  type AnalyzedImageInput,
} from "./aiAnalysis";
import { capillaryPatternByCode, capillaryPatterns } from "./patterns";

/** この画面から遷移できる行き先だけに絞った遷移関数。 */
type SimpleGo = (
  v: { kind: "list" } | { kind: "report"; id: string },
) => void;

/** パターンの番号（定義順の 1〜28）。「No.」表示に使う。 */
const patternNumberByCode: Record<string, number> = Object.fromEntries(
  capillaryPatterns.map((p, i) => [p.code, i + 1]),
);

const confidenceLabels: Record<AiPatternCandidate["confidence"], string> = {
  high: "高",
  medium: "中",
  low: "低",
};

/** AI解析で対象にする画像の総数の上限（動画フレーム最大4＋静止画）。 */
const MAX_ANALYZE_IMAGES = 5;
/** 動画から切り出すフレーム数の上限。 */
const MAX_VIDEO_FRAMES = 4;

/**
 * 選択されたパターンから臨床フラグを立てる対応表。
 * 一般検査では臨床フラグの手入力欄を出さないため、AI（またはスタッフ）が
 * 選んだ形に対応するフラグを保存時に自動で立てる。
 * tissue_proliferation は臨床フラグ「分枝」に対応する形として定義されている。
 */
function flagsFromPatterns(patterns: string[]) {
  return {
    flagGiant: patterns.includes("giant"),
    flagHemorrhage: patterns.includes("hemorrhage"),
    flagLoss: patterns.includes("capillary_loss"),
    flagRamified:
      patterns.includes("branching_neo") ||
      patterns.includes("tissue_proliferation"),
  };
}

export function SimpleNewScreen({ go }: { go: SimpleGo }) {
  const queryClient = useQueryClient();
  const [subjectName, setSubjectName] = useState("");
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const [video, setVideo] = useState<CapturedVideo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cap = useCapturePanel({
    images,
    primaryIndex,
    onChange: (next, nextPrimary) => {
      setImages(next);
      setPrimaryIndex(nextPrimary);
    },
    video,
    onVideoChange: setVideo,
  });

  // 動画だけが添付されていて静止画が無いときは、動画から静止画を1枚
  // 切り出して代表画像にする（研究用モードの新しい観察と同じ扱い）。
  const frameDerivedFor = useRef<string | null>(null);
  const [frameNote, setFrameNote] = useState<string | null>(null);
  useEffect(() => {
    if (!video || images.length > 0) return;
    if (frameDerivedFor.current === video.previewUrl) return;
    frameDerivedFor.current = video.previewUrl;
    let cancelled = false;
    void captureFrameFromVideoUrl(video.previewUrl)
      .then((frame) => {
        if (cancelled) return;
        setImages((current) => (current.length > 0 ? current : [frame]));
        setPrimaryIndex(0);
        setFrameNote("動画から静止画を切り出して代表画像にしました。");
      })
      .catch(() => {
        if (!cancelled) {
          setFrameNote(
            "動画からの静止画の切り出しができませんでした。静止画も撮影すると、レポートに画像が残ります。",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [video, images.length]);

  /* ================= AI解析 ================= */

  const [aiPhase, setAiPhase] = useState<
    "idle" | "working" | "done" | "not-configured" | "error"
  >("idle");
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aggregated, setAggregated] = useState<AggregatedCandidate[]>([]);
  const [selectedPatterns, setSelectedPatterns] = useState<string[]>([]);
  const [gridOpen, setGridOpen] = useState(false);

  const togglePattern = (code: string) => {
    setSelectedPatterns((current) =>
      current.includes(code)
        ? current.filter((c) => c !== code)
        : [...current, code],
    );
  };

  const handleAnalyze = async () => {
    if (aiPhase === "working") return;
    setError(null);
    setAiNote(null);

    // 解析対象の組み立て：動画フレーム（最大4枚）を先に、静止画を続けて、
    // 合計最大5枚まで。
    const targets: AnalyzedImageInput[] = [];
    if (video) {
      try {
        const frames = await captureFramesFromVideoUrl(
          video.previewUrl,
          MAX_VIDEO_FRAMES,
        );
        targets.push(...frames);
      } catch {
        // フレーム切り出しに失敗したら、静止画だけで続ける。
      }
    }
    for (const img of images) {
      if (targets.length >= MAX_ANALYZE_IMAGES) break;
      targets.push({
        previewUrl: img.previewUrl,
        dataBase64: img.dataBase64,
        mimeType: img.mimeType,
      });
    }
    if (targets.length === 0) {
      setAiPhase("error");
      setAiNote(
        "画像も動画もありません。撮影するか、ファイルから取り込んでから解析してください。",
      );
      return;
    }

    setAiPhase("working");
    setAiProgress({ done: 0, total: targets.length });
    const perImage: { previewUrl: string; candidates: AiPatternCandidate[] }[] =
      [];
    let failures = 0;
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      try {
        const res = await api.analyzeImagePatterns({
          image: { dataBase64: target.dataBase64, mimeType: target.mimeType },
        });
        if (!res.configured) {
          setAiPhase("not-configured");
          setAiProgress(null);
          return;
        }
        perImage.push({
          previewUrl: target.previewUrl,
          // サーバー側で正規コードへの照合は済んでいるが、表示側でも守る。
          candidates: res.candidates.filter((c) => capillaryPatternByCode[c.code]),
        });
      } catch {
        failures += 1;
      }
      setAiProgress({ done: i + 1, total: targets.length });
    }
    setAiProgress(null);

    if (perImage.length === 0) {
      setAiPhase("error");
      setAiNote(
        "AI解析ができませんでした。通信状態を確認して、もう一度お試しください。",
      );
      return;
    }

    const result = aggregateCandidates(perImage);
    setAggregated(result);
    // 集約結果の上位を、所見のパターン選択の下書きとして入れる。
    setSelectedPatterns(
      result.slice(0, MAX_DRAFT_PATTERNS).map((c) => c.code),
    );
    if (failures > 0) {
      setAiNote(
        `${targets.length}枚のうち${failures}枚は解析できませんでした。残りの${perImage.length}枚の結果で集約しています。`,
      );
    }
    setAiPhase("done");
  };

  /* ================= 保存 ================= */

  const create = useMutation({
    mutationFn: async () => {
      return api.createObservation({
        subjectName: subjectName.trim(),
        observedAt: new Date().toISOString(),
        // 一般検査では標準の指（左手・薬指）で記録する。
        finger: "left_ring",
        restrictionsOk: false,
        ...flagsFromPatterns(selectedPatterns),
        patterns: selectedPatterns,
        referralGiven: false,
        images: images.map((img) => ({
          dataBase64: img.dataBase64,
          mimeType: img.mimeType,
        })),
        primaryIndex: images.length > 0 ? primaryIndex : undefined,
        video: video
          ? {
              blob: video.blob,
              mimeType: video.mimeType,
              durationSec: video.durationSec ?? undefined,
            }
          : undefined,
      });
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["observations"] });
      go({ kind: "report", id: res.id });
    },
    onError: (e) => {
      setError(`保存できませんでした：${describeFirebaseError(e)}`);
    },
  });

  const handleSave = () => {
    if (!subjectName.trim()) {
      setError("対象者のお名前を入力してください。");
      return;
    }
    setError(null);
    create.mutate();
  };

  /* ================= AI結果の表示用データ ================= */

  // 注釈表示の対象画像：場所（location）つき候補を最も多く含む画像を代表にする。
  const locatedCountByUrl = new Map<string, number>();
  for (const c of aggregated) {
    if (c.location) {
      locatedCountByUrl.set(
        c.sourcePreviewUrl,
        (locatedCountByUrl.get(c.sourcePreviewUrl) ?? 0) + 1,
      );
    }
  }
  let representativeUrl: string | null = null;
  let representativeCount = 0;
  for (const c of aggregated) {
    const n = locatedCountByUrl.get(c.sourcePreviewUrl) ?? 0;
    if (n > representativeCount) {
      representativeCount = n;
      representativeUrl = c.sourcePreviewUrl;
    }
  }
  const onRepresentative = aggregated.filter(
    (c) => c.sourcePreviewUrl === representativeUrl,
  );
  const onOtherImages = aggregated.filter(
    (c) => c.sourcePreviewUrl !== representativeUrl,
  );

  const annotationItems: AnnotationItem[] = onRepresentative.flatMap((c) => {
    const p = capillaryPatternByCode[c.code];
    if (!p) return [];
    const selected = selectedPatterns.includes(c.code);
    return [
      {
        id: `simple-ai-${c.code}`,
        x: c.location?.x ?? null,
        y: c.location?.y ?? null,
        clinical: p.clinical,
        shortLabel: p.name,
        heading: `No.${patternNumberByCode[c.code] ?? "―"} ${p.name}（${c.hitFrames}/${c.totalFrames}枚で検出・確からしさ：${confidenceLabels[c.bestConfidence]}）`,
        comment: c.reason || undefined,
        statusLabel: selected ? "選択中" : undefined,
        hint: "押すと選択／解除できます。",
        selected,
        onPress: () => togglePattern(c.code),
      },
    ];
  });

  const hasClinicalSelected = selectedPatterns.some(
    (code) => capillaryPatternByCode[code]?.clinical,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-wide text-[var(--heading)]">
          新しい観察（一般検査）
        </h1>
        <button
          type="button"
          onClick={() => go({ kind: "list" })}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          一覧に戻る
        </button>
      </div>

      <section aria-label="対象者" className="flex flex-col gap-2">
        <label className="flex flex-col gap-1 text-base font-medium text-[var(--text)]">
          対象者のお名前（必須）
          <input
            aria-label="対象者のお名前"
            className="min-h-16 w-full rounded-[var(--radius)] border-2 border-[var(--border-strong)] bg-[var(--surface)] px-4 text-xl text-[var(--text)]"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
            placeholder="例：山田 花子"
          />
        </label>
        <p className="text-base text-[var(--dim)]">
          日時は自動で記録されます。撮影する指は標準（左手・薬指）として記録します。条件や所見の細かい入力は、研究用モードで行えます。
        </p>
      </section>

      <div className="flex flex-col gap-8">
        <CaptureIntro support={cap.support} />
        <CaptureMediaDisplay cap={cap} />
        <CaptureControls cap={cap} />
        {frameNote && (
          <p className="rounded-[var(--radius)] bg-[var(--paper)] p-3 text-base leading-relaxed text-[var(--text)]">
            {frameNote}
          </p>
        )}
      </div>

      <section aria-label="AI解析" className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-[var(--text)]">2. AI解析</h2>
        <p className="text-base leading-relaxed text-[var(--dim)]">
          動画がある場合は動画から複数のフレームを切り出して解析し、静止画も合わせて結果を集約します。結果は28種の正式名称で示され、そのまま所見の下書きに入ります。
        </p>
        <button
          type="button"
          disabled={
            aiPhase === "working" || (images.length === 0 && !video)
          }
          onClick={() => void handleAnalyze()}
          className="min-h-20 w-full rounded-[var(--radius)] bg-[var(--accent)] px-6 text-2xl font-bold text-white shadow-[var(--shadow-card)] disabled:opacity-40"
        >
          {aiPhase === "working"
            ? aiProgress
              ? `AIが解析しています…（${aiProgress.done}/${aiProgress.total}枚）`
              : "AIが解析しています…"
            : "AI解析をする"}
        </button>
        {images.length === 0 && !video && (
          <p className="text-base text-[var(--dim)]">
            画像も動画もまだないため使えません。撮影するか、ファイルから取り込んでください。
          </p>
        )}
        {aiPhase === "not-configured" && (
          <p className="text-base text-[var(--text)]">
            AI解析はまだ設定されていません。
          </p>
        )}
        {aiPhase === "error" && aiNote && (
          <p role="alert" className="text-base font-medium text-[var(--alert)]">
            {aiNote}
          </p>
        )}
        {aiPhase === "done" && aiNote && (
          <p className="text-base text-[var(--dim)]">{aiNote}</p>
        )}
        {aiPhase === "done" && aggregated.length === 0 && (
          <p className="text-lg text-[var(--text)]">
            AIから候補は提示されませんでした。下の「28種から選び直す」から手で選ぶか、研究用モードで詳しく記録してください。
          </p>
        )}

        {aiPhase === "done" && aggregated.length > 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-base leading-relaxed text-[var(--text)]">
              AIの所見です（{aggregated[0]?.totalFrames ?? 0}
              枚の画像から集約）。上位{MAX_DRAFT_PATTERNS}
              件を下書きとして選択に入れています。外したり足したりできますが、基本はこの結果で進めます。
            </p>
            {representativeUrl && (
              <AnnotatedImage
                imageUrl={representativeUrl}
                imageAlt="AI解析の代表画像（番号マーカーつき）"
                items={annotationItems}
                listLabel="AIの所見（番号つき）"
              />
            )}
            {onOtherImages.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="AIの所見（別の画像で検出）">
                {onOtherImages.map((c) => {
                  const p = capillaryPatternByCode[c.code];
                  if (!p) return null;
                  const selected = selectedPatterns.includes(c.code);
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        aria-pressed={selected}
                        onClick={() => togglePattern(c.code)}
                        className={`flex min-h-14 w-full flex-col gap-1 rounded-[var(--radius)] border-2 p-3 text-left ${
                          selected
                            ? "border-[var(--accent)] bg-[var(--accent-bg)]"
                            : "border-[var(--border-strong)] bg-[var(--surface)]"
                        }`}
                      >
                        <span className="flex flex-wrap items-center gap-2 text-lg font-bold text-[var(--text)]">
                          No.{patternNumberByCode[c.code] ?? "―"} {p.name}
                          <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-sm font-bold text-[var(--accent-strong)]">
                            {c.hitFrames}/{c.totalFrames}枚で検出・確からしさ：
                            {confidenceLabels[c.bestConfidence]}
                          </span>
                          {selected && (
                            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-sm font-bold text-white">
                              選択中
                            </span>
                          )}
                        </span>
                        {c.reason && (
                          <span className="text-base leading-relaxed text-[var(--dim)]">
                            {c.reason}
                          </span>
                        )}
                        <span className="text-sm text-[var(--dim)]">
                          押すと選択／解除できます。
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {/* 選択中のパターンと、手で直すための入口 */}
        <div className="flex flex-col gap-3">
          <p className="text-lg font-bold text-[var(--text)]">
            選択中の形：{selectedPatterns.length}件
          </p>
          {selectedPatterns.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="選択中のパターン">
              {selectedPatterns.map((code) => {
                const p = capillaryPatternByCode[code];
                if (!p) return null;
                return (
                  <span
                    key={code}
                    className="flex items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--accent-bg)] py-0.5 pl-3 pr-0.5"
                  >
                    <span className="text-base font-bold text-[var(--accent-strong)]">
                      No.{patternNumberByCode[code] ?? "―"} {p.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`${p.name}の選択を外す`}
                      onClick={() => togglePattern(code)}
                      className="flex h-11 w-11 items-center justify-center rounded-full text-xl leading-none text-[var(--accent-strong)]"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          {hasClinicalSelected && (
            <p className="rounded-[var(--radius)] bg-[var(--alert-bg)] p-3 text-base leading-relaxed text-[var(--text)]">
              臨床フラグに当たる形が含まれています。レポートでは受診案内の対象として扱われます。
            </p>
          )}
          <button
            type="button"
            aria-expanded={gridOpen}
            onClick={() => setGridOpen((v) => !v)}
            className="min-h-14 self-start rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)]"
          >
            {gridOpen ? "28種の一覧を閉じる" : "28種から選び直す"}
          </button>
          {gridOpen && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {capillaryPatterns.map((pattern) => {
                const selected = selectedPatterns.includes(pattern.code);
                return (
                  <button
                    key={pattern.code}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => togglePattern(pattern.code)}
                    className={`relative flex min-h-14 flex-col gap-2 rounded-[var(--radius)] border-2 p-3 text-left ${
                      selected
                        ? "border-[var(--accent)] bg-[var(--accent-bg)]"
                        : "border-[var(--border)] bg-[var(--surface)]"
                    }`}
                  >
                    {pattern.clinical && (
                      <span
                        aria-hidden
                        title="臨床フラグ対応"
                        className="absolute right-2 top-2 z-10 h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--alert)] shadow"
                      />
                    )}
                    {selected && (
                      <span
                        aria-hidden
                        className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-base font-bold text-white shadow"
                      >
                        ✓
                      </span>
                    )}
                    <PatternDiagram
                      code={pattern.code}
                      title={`${pattern.name}の模式図`}
                      className={`h-24 w-full rounded border ${
                        selected ? "border-[var(--accent)]" : "border-[var(--border)]"
                      }`}
                    />
                    <span className="text-base font-bold leading-snug text-[var(--text)] sm:text-lg">
                      No.{patternNumberByCode[pattern.code] ?? "―"} {pattern.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {error && (
        <p role="alert" className="text-lg font-medium text-[var(--alert)]">
          {error}
        </p>
      )}
      <div className="sticky bottom-0 z-20 -mx-4 border-t border-[var(--border)] bg-[var(--bg)]/95 px-4 py-3 shadow-[0_-8px_16px_-12px_rgba(13,59,76,0.35)] backdrop-blur sm:-mx-6 sm:px-6">
        <button
          type="button"
          disabled={create.isPending}
          onClick={handleSave}
          className="min-h-16 w-full rounded-[var(--radius)] bg-[var(--accent)] px-6 text-xl font-bold text-white disabled:opacity-40"
        >
          {create.isPending ? "保存しています…" : "保存してレポートを作成"}
        </button>
      </div>
    </div>
  );
}
