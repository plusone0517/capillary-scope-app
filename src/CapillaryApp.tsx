// 毛細血管 分析アプリ：院内スタッフ向けの観察・レポートツール。
// 画面は「一覧」「新しい観察」「レポート」「編集」の4つ。
// 対応環境は Windows PC（Chrome/Edge）と iPad（Safari）。

import { useEffect, useRef, useState } from "react";
import { CustomerDetailScreen, CustomerListScreen } from "./CustomerScreens";
import { usePreselectedCustomer } from "./CustomerPicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  describeFirebaseError,
  type CreateObservationArgs,
  type UpdateObservationArgs,
} from "./api";
import { useAuth } from "./auth/AuthGate";
import {
  CaptureControls,
  CaptureIntro,
  CaptureMediaDisplay,
  useCapturePanel,
} from "./CapturePanel";
import { CompareScreen } from "./CompareView";
import { FlowMeasure } from "./FlowMeasure";
import { SimpleNewScreen } from "./SimpleExam";
import { TrialDataScreen } from "./TrialData";
import { FindingsForm, emptyFindings, type FindingsState } from "./FindingsForm";
import {
ReceiveQr,
ReportBody,
formatDateTime,
isDummySubject,
useQrDataUrl,
} from "./ReportView";
import {
captureFrameFromVideoUrl,
fileToCaptured,
fileToCapturedVideo,
type CapturedImage,
type CapturedVideo,
} from "./camera";
import { LoadingState } from "./States";
import { LogoMark } from "./Logo";
import {
capillaryChangeLabels,
capillaryClinicalFlagLabels,
capillaryColorLabels,
capillaryFingerLabels,
capillaryFlowLabels,
capillaryPatternByCode,
type ClinicalFlagKey,
} from "./patterns";

type View =
  | { kind: "list" }
  | { kind: "customers" }
  | { kind: "customer"; id: string }
  | { kind: "new"; customerId?: string }
  | { kind: "report"; id: string }
  | { kind: "edit"; id: string }
  | { kind: "measure"; id: string }
  | { kind: "trialData" }
  | { kind: "compare"; beforeId: string; afterId: string };

/**
 * アプリ全体のモード。
 * - simple（一般検査）：入力は名前だけ。撮影 → AI解析 → 28種の結果 →
 *   レポートを最小の操作で進める。
 * - research（研究用）：室温・安静時間などの撮影条件、所見の詳細入力、
 *   試験データ・CSV など、従来の詳細な機能をすべて使う。
 * 旧「試験モード」はこの2モード制に置き換えた（ONだった端末は研究用へ移行）。
 */
export type AppMode = "simple" | "research";

const MODE_KEY = "capillary-app:mode";
/** 旧・試験モードの設定キー（移行の読み取り専用）。 */
const LEGACY_TRIAL_MODE_KEY = "capillary-app:trial-mode";

function loadMode(): AppMode {
  try {
    const saved = window.localStorage.getItem(MODE_KEY);
    if (saved === "simple" || saved === "research") return saved;
    // 移行：旧・試験モードが ON だった端末は研究用モードにする。
    if (window.localStorage.getItem(LEGACY_TRIAL_MODE_KEY) === "on") {
      return "research";
    }
  } catch {
    // 読めない場合は既定の一般検査にする。
  }
  return "simple";
}

/** 一般検査／研究用の切り替え。ナビに置く。 */
function ModeToggle({
  mode,
  onChange,
}: {
  mode: AppMode;
  onChange: (next: AppMode) => void;
}) {
  const options: { value: AppMode; label: string }[] = [
    { value: "simple", label: "一般検査" },
    { value: "research", label: "研究用" },
  ];
  return (
    <div
      role="group"
      aria-label="モード切替"
      className="flex shrink-0 items-center rounded-full border-2 border-[var(--border)] bg-[var(--surface)] p-0.5"
    >
      {options.map((opt) => {
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`min-h-11 whitespace-nowrap rounded-full px-3 text-sm font-bold sm:px-4 sm:text-base ${
              active
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--dim)] hover:bg-[var(--paper)]"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/* ================= 共通ナビ・ステップ表示 ================= */

/**
 * 全画面共通のナビ（画面上部に追随）。主要メニューと現在地、
 * モード（一般検査／研究用）の切り替えをここに集約する。
 */
function AppNav({
  view,
  go,
  mode,
  onModeChange,
  wide,
}: {
  view: View;
  go: (v: View) => void;
  mode: AppMode;
  onModeChange: (next: AppMode) => void;
  wide: boolean;
}) {
  const itemClass = (active: boolean) =>
    `min-h-11 shrink-0 whitespace-nowrap rounded-full px-3 text-sm font-bold sm:px-4 sm:text-base ${
      active
        ? "bg-[var(--accent)] text-white"
        : "text-[var(--text)] hover:bg-[var(--paper)]"
    }`;
  return (
    <div className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--surface)]/95 shadow-[0_1px_8px_rgba(11,37,69,0.08)] backdrop-blur">
      <div
        className={`mx-auto flex h-14 w-full items-center gap-2 overflow-x-auto px-3 sm:px-6 ${
          wide ? "max-w-[1680px]" : "max-w-6xl"
        }`}
      >
        <nav aria-label="主要メニュー" className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            aria-current={view.kind === "list" ? "page" : undefined}
            onClick={() => go({ kind: "list" })}
            className={itemClass(view.kind === "list")}
          >
            一覧
          </button>
          <button
            type="button"
            aria-current={
              view.kind === "customers" || view.kind === "customer" ? "page" : undefined
            }
            onClick={() => go({ kind: "customers" })}
            className={itemClass(view.kind === "customers" || view.kind === "customer")}
          >
            顧客
          </button>
          <button
            type="button"
            aria-current={view.kind === "new" ? "page" : undefined}
            onClick={() => go({ kind: "new" })}
            className={itemClass(view.kind === "new")}
          >
            新しい観察
          </button>
        </nav>
        <div className="ml-auto shrink-0">
          <ModeToggle mode={mode} onChange={onModeChange} />
        </div>
      </div>
    </div>
  );
}

/** 観察の入力フロー（新しい観察・編集）のステップ定義。 */
const OBS_STEPS = [
  { label: "撮影", targetId: "obs-step-capture" },
  { label: "所見", targetId: "obs-step-findings" },
  { label: "確認・レポート", targetId: "obs-step-confirm" },
] as const;

/**
 * スクロール位置に応じて、今いるステップを返す。
 * 各セクションが画面中央の帯に入ったかどうかで判定する。
 */
function useActiveStep(targetIds: string[]): number {
  const [active, setActive] = useState(0);
  const key = targetIds.join("|");
  useEffect(() => {
    const ids = key.split("|");
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = elements.indexOf(entry.target as HTMLElement);
          if (idx >= 0) setActive(idx);
        }
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: 0 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);
  return active;
}

/**
 * 入力フローのステップ表示（画面上部に追随）。
 * 押すとそのセクションへスクロール移動する。
 */
function StepNav() {
  const active = useActiveStep(OBS_STEPS.map((s) => s.targetId));
  return (
    <nav
      aria-label="入力の進み具合"
      className="sticky top-14 z-40 -mx-4 border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 shadow-[0_8px_16px_-12px_rgba(11,37,69,0.35)] backdrop-blur sm:-mx-6 sm:px-6"
    >
      <ol className="flex h-[52px] items-center gap-1 overflow-x-auto sm:gap-2">
        {OBS_STEPS.map((step, i) => {
          const isActive = i === active;
          const isDone = i < active;
          return (
            <li key={step.targetId} className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button
                type="button"
                aria-current={isActive ? "step" : undefined}
                onClick={() =>
                  document
                    .getElementById(step.targetId)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-3 text-base font-bold sm:px-4 sm:text-lg ${
                  isActive
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--dim)] hover:bg-[var(--paper)]"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    isActive
                      ? "bg-white text-[var(--accent-strong)]"
                      : isDone
                        ? "bg-[var(--accent)] text-white"
                        : "border-2 border-[var(--border-strong)] text-[var(--dim)]"
                  }`}
                >
                  {isDone ? "✓" : i + 1}
                </span>
                {step.label}
              </button>
              {i < OBS_STEPS.length - 1 && (
                <span aria-hidden className="text-[var(--dim)]">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

type CreateArgs = CreateObservationArgs;
type UpdateArgs = UpdateObservationArgs;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function nowLocalInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return nowLocalInput();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildAutoSummary(f: FindingsState): string {
  const parts: string[] = [];
  parts.push(
    `今回の観察では、${capillaryFingerLabels[f.finger] ?? "指"}の毛細血管を確認しました。`,
  );
  if (f.densityPerMm.trim())
    parts.push(`密度は1mmあたり${f.densityPerMm.trim()}本でした。`);
  if (f.flow) parts.push(`流れの印象は「${capillaryFlowLabels[f.flow] ?? f.flow}」でした。`);
  if (f.color)
    parts.push(`色の印象は「${capillaryColorLabels[f.color] ?? f.color}」でした。`);
  const names = f.patterns
    .map((code) => capillaryPatternByCode[code]?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length > 0)
    parts.push(`形は「${names.join("」「")}」に近いものが見られました。`);
  if (f.changeVsPrev)
    parts.push(
      `前回との比較では「${capillaryChangeLabels[f.changeVsPrev] ?? f.changeVsPrev}」です。`,
    );
  const flagNames = (Object.keys(f.flags) as ClinicalFlagKey[])
    .filter((k) => f.flags[k])
    .map((k) => capillaryClinicalFlagLabels[k]);
  if (flagNames.length > 0)
    parts.push(
      `${flagNames.join("、")}が確認されたため、医療機関への受診をおすすめします。`,
    );
  return parts.join("");
}

function findingsToPayload(f: FindingsState) {
  const num = (s: string) => {
    const t = s.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    customerId: f.customer?.id,
    subjectName: f.subjectName.trim(),
    subjectId: f.subjectId.trim() ? f.subjectId.trim() : undefined,
    observedAt: new Date(f.observedAtLocal).toISOString(),
    finger: f.finger as CreateArgs["finger"],
    roomTempC: num(f.roomTempC),
    restMinutes: num(f.restMinutes),
    restrictionsOk: f.restrictionsOk,
    consent: f.consent,
    densityPerMm: num(f.densityPerMm),
    flow: f.flow ? (f.flow as NonNullable<CreateArgs["flow"]>) : undefined,
    color: f.color ? (f.color as NonNullable<CreateArgs["color"]>) : undefined,
    flagGiant: f.flags.giant,
    flagHemorrhage: f.flags.hemorrhage,
    flagLoss: f.flags.loss,
    flagRamified: f.flags.ramified,
    patterns: f.patterns as CreateArgs["patterns"],
    changeVsPrev: f.changeVsPrev
      ? (f.changeVsPrev as NonNullable<CreateArgs["changeVsPrev"]>)
      : undefined,
    adviceMemo: f.adviceMemo.trim() ? f.adviceMemo : undefined,
    summaryNote: f.summary.trim() ? f.summary : undefined,
    referralGiven: f.referralGiven,
    trialName: f.trialName.trim() ? f.trialName.trim() : undefined,
    trialGroup: f.trialGroup.trim() ? f.trialGroup.trim() : undefined,
    interventions: f.interventions.map((iv) => ({
      category: iv.category as NonNullable<CreateArgs["interventions"]>[number]["category"],
      gasType:
        iv.category === "gas"
          ? (iv.gasType as NonNullable<CreateArgs["interventions"]>[number]["gasType"])
          : undefined,
      detail: iv.detail,
      timing: iv.timing as NonNullable<CreateArgs["interventions"]>[number]["timing"],
    })),
  };
}

/** AI下書き（試作）へ渡す所見。フォームの現在値から組み立てる。 */
function draftArgsFromForm(f: FindingsState) {
  const t = f.densityPerMm.trim();
  const n = t ? Number(t) : NaN;
  return {
    finger: f.finger,
    densityPerMm: Number.isFinite(n) ? n : null,
    flow: f.flow ? f.flow : null,
    color: f.color ? f.color : null,
    patterns: f.patterns,
    flagGiant: f.flags.giant,
    flagHemorrhage: f.flags.hemorrhage,
    flagLoss: f.flags.loss,
    flagRamified: f.flags.ramified,
    changeVsPrev: f.changeVsPrev ? f.changeVsPrev : null,
  };
}

/* ================= 一覧 ================= */

/** 一覧カードに出す形のパターンの要約（先頭3件＋ほかN件）。 */
function patternSummary(codes: string[]): string | null {
  const names = codes
    .map((c) => capillaryPatternByCode[c]?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length === 0) return null;
  return names.length <= 3
    ? names.join("、")
    : `${names.slice(0, 3).join("、")} ほか${names.length - 3}件`;
}

function ListScreen({
  go,
  mode,
}: {
  go: (v: View) => void;
  mode: AppMode;
}) {
  // 試験データ・CSVなどの研究寄りの導線は、研究用モードでのみ出す。
  const research = mode === "research";
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectNote, setSelectNote] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["observations", submittedSearch],
    queryFn: () =>
      api.listObservations({
        search: submittedSearch ? submittedSearch : undefined,
        limit: 100,
      }),
  });

  const selectedObs = (list.data?.observations ?? []).filter((o) =>
    selectedIds.includes(o.id),
  );
  const [selA, selB] = selectedObs;
  const sameSubject =
    selA != null &&
    selB != null &&
    selA.subjectName === selB.subjectName &&
    (selA.subjectId ?? null) === (selB.subjectId ?? null);

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
      setSelectNote(null);
      return;
    }
    if (selectedIds.length >= 2) {
      setSelectNote(
        "比べられるのは2件までです。選択中のものを外してから選び直してください。",
      );
      return;
    }
    setSelectedIds([...selectedIds, id]);
    setSelectNote(null);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-wide text-[var(--heading)]">観察レポート一覧</h1>
        <button
          type="button"
          onClick={() => go({ kind: "new" })}
          className="min-h-16 rounded-[var(--radius)] bg-[var(--accent)] px-7 text-xl font-bold text-white shadow-[var(--shadow-card)]"
        >
          新しい観察をはじめる
        </button>
      </div>

      {research && (
        <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base leading-relaxed text-[var(--text)]">
            研究用モードです。観察の入力・編集で試験名・群・実施内容を記録でき、ビフォアアフターでは「この間に実施したこと」が表示されます。
          </p>
          <button
            type="button"
            onClick={() => go({ kind: "trialData" })}
            className="min-h-14 shrink-0 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)]"
          >
            試験データ（CSV書き出し）
          </button>
        </div>
      )}

      <div className="sticky top-14 z-30 -mx-4 bg-[var(--bg)]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <form
          className="flex gap-2"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedSearch(search.trim());
          }}
        >
          <input
            aria-label="対象者名またはIDで検索"
            className="min-h-16 flex-1 rounded-[var(--radius)] border-2 border-[var(--border-strong)] bg-[var(--surface)] px-4 text-xl text-[var(--text)] shadow-[var(--shadow-card)]"
            placeholder="対象者名・IDで検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            type="submit"
            className="min-h-16 rounded-[var(--radius)] bg-[var(--accent)] px-6 text-xl font-bold text-white"
          >
            検索
          </button>
        </form>
      </div>

      <p className="text-base text-[var(--dim)]">
        各レポートの「比べる」を2件押すと、ビフォアアフターで比較できます（同じ対象者の2件）。
      </p>

      {selectedObs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
          <p className="text-lg text-[var(--text)]">
            比較に選択中：{selectedObs.length}件
            {selectedObs.map((o) => (
              <span key={o.id} className="block text-base text-[var(--dim)]">
                {o.subjectName}（{formatDateTime(o.observedAt)}）
              </span>
            ))}
          </p>
          {selectNote && (
            <p role="alert" className="text-base font-medium text-[var(--alert)]">
              {selectNote}
            </p>
          )}
          {selectedObs.length === 2 && !sameSubject && (
            <p role="alert" className="text-base font-medium text-[var(--alert)]">
              別の対象者が選ばれています。同じ対象者の観察を2件選んでください。
            </p>
          )}
          {selectedObs.length === 2 && sameSubject && selA && selB && (
            <button
              type="button"
              onClick={() => {
                const [b, a] =
                  selA.observedAt <= selB.observedAt ? [selA, selB] : [selB, selA];
                go({ kind: "compare", beforeId: b.id, afterId: a.id });
              }}
              className="min-h-14 self-start rounded-[var(--radius)] bg-[var(--accent)] px-6 text-lg font-bold text-white"
            >
              ビフォアアフターで比べる
            </button>
          )}
        </div>
      )}

      {list.isPending && <LoadingState />}
      {list.error && (
        <p role="alert" className="text-lg text-[var(--alert)]">
          一覧の読み込みに失敗しました。もう一度お試しください。
        </p>
      )}
      {list.data && list.data.observations.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center shadow-[var(--shadow-card)]">
          <LogoMark size={56} />
          <p className="max-w-xl text-xl leading-relaxed text-[var(--text)]">
            {submittedSearch
              ? "条件に合う観察レポートはありません。"
              : "まだ観察レポートがありません。「新しい観察をはじめる」から最初の観察を記録してください。"}
          </p>
          {!submittedSearch && (
            <button
              type="button"
              onClick={() => go({ kind: "new" })}
              className="min-h-16 rounded-[var(--radius)] bg-[var(--accent)] px-7 text-xl font-bold text-white"
            >
              新しい観察をはじめる
            </button>
          )}
        </div>
      )}
      {list.data && list.data.observations.length > 0 && (
        <ul className="flex flex-col gap-3">
          {list.data.observations.map((obs) => (
            <li
              key={obs.id}
              className="flex overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]"
            >
              <button
                type="button"
                onClick={() => go({ kind: "report", id: obs.id })}
                className="flex min-w-0 flex-1 items-center gap-4 p-4 text-left"
                aria-label={`${obs.subjectName} のレポートを開く`}
              >
                {obs.primaryImageUrl ? (
                  <img
                    src={obs.primaryImageUrl}
                    alt=""
                    className="h-20 w-24 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="flex h-20 w-24 shrink-0 items-center justify-center rounded bg-[var(--paper)] text-sm text-[var(--dim)]">
                    画像なし
                  </span>
                )}
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-xl font-bold text-[var(--text)]">
                    {obs.subjectName}
                    {obs.memberNumber && (
                      <span className="ml-2 text-base font-normal text-[var(--dim)]">
                        会員番号 {obs.memberNumber}
                      </span>
                    )}
                    {obs.subjectId && (
                      <span className="ml-2 text-base font-normal text-[var(--dim)]">
                        施設内番号 {obs.subjectId}
                      </span>
                    )}
                  </span>
                  <span className="text-base text-[var(--dim)]">
                    {formatDateTime(obs.observedAt)}／
                    {capillaryFingerLabels[obs.finger] ?? obs.finger}
                  </span>
                  {(obs.densityPerMm != null || patternSummary(obs.patternCodes)) && (
                    <span className="text-base leading-relaxed text-[var(--text)]">
                      {obs.densityPerMm != null && (
                        <>
                          密度{" "}
                          <span className="text-[22px] font-bold leading-none text-[var(--heading)]">
                            {obs.densityPerMm}
                          </span>{" "}
                          本/mm
                        </>
                      )}
                      {obs.densityPerMm != null && patternSummary(obs.patternCodes) && "／"}
                      {patternSummary(obs.patternCodes) && (
                        <>形：{patternSummary(obs.patternCodes)}</>
                      )}
                    </span>
                  )}
                  <span className="flex flex-wrap gap-2">
                    {isDummySubject(obs.subjectName) && (
                      <span className="rounded-full border border-[var(--accent)] bg-[var(--surface)] px-3 py-0.5 text-sm font-bold text-[var(--accent-strong)]">
                        ダミー
                      </span>
                    )}
                    <span
                      className={`rounded-full px-3 py-0.5 text-sm font-bold ${
                        obs.status === "finalized"
                          ? "bg-[var(--accent)] text-white"
                          : "bg-[var(--paper)] text-[var(--text)]"
                      }`}
                    >
                      {obs.status === "finalized" ? "確定済み" : "下書き"}
                    </span>
                    {obs.hasClinicalFlag && (
                      <span className="rounded-full bg-[var(--alert-bg)] px-3 py-0.5 text-sm font-bold text-[var(--alert)]">
                        臨床フラグあり
                      </span>
                    )}
                    {obs.hasVideo && (
                      <span className="rounded-full bg-[var(--paper)] px-3 py-0.5 text-sm font-bold text-[var(--text)]">
                        動画あり
                      </span>
                    )}
                    {research && obs.trialName && (
                      <span className="rounded-full bg-[var(--paper)] px-3 py-0.5 text-sm font-bold text-[var(--text)]">
                        試験：{obs.trialName}
                      </span>
                    )}
                    {obs.flowSpeedMmPerSec != null && (
                      <span className="rounded-full bg-[var(--paper)] px-3 py-0.5 text-base font-bold text-[var(--text)]">
                        血流速度{" "}
                        <span className="text-lg text-[var(--heading)]">
                          {obs.flowSpeedMmPerSec.toFixed(2)}
                        </span>{" "}
                        mm/秒（参考値）
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-pressed={selectedIds.includes(obs.id)}
                aria-label={`${obs.subjectName}（${formatDateTime(obs.observedAt)}）を比較に選ぶ`}
                onClick={() => toggleSelect(obs.id)}
                className={`shrink-0 border-l border-[var(--border)] px-3 text-base font-bold ${
                  selectedIds.includes(obs.id)
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--accent-strong)]"
                }`}
              >
                {selectedIds.includes(obs.id) ? "選択中" : "比べる"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================= 新しい観察 ================= */

/** 研究用モードの「新しい観察」。従来の詳細フォームをそのまま使う。 */
function NewScreen({
  go,
  customerId,
}: {
  go: (v: View) => void;
  customerId?: string;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FindingsState>(() => emptyFindings(nowLocalInput()));
  usePreselectedCustomer(customerId, (customer) =>
    setForm((f) => ({
      ...f,
      customer,
      subjectName: customer.displayName,
      subjectId: customer.localCode ?? "",
    })),
  );
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
  // 切り出して代表画像にする（AI候補・自動計測は静止画が対象のため）。
  // 切り出しは動画ごとに1回だけ。切り出した静止画を削除しても、
  // 同じ動画から自動で作り直すことはしない。
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
        setFrameNote(
          "動画から静止画を切り出して代表画像にしました。AI候補と自動計測は、この静止画を対象に使えます。",
        );
      })
      .catch(() => {
        if (!cancelled) {
          setFrameNote(
            "動画からの静止画の切り出しができませんでした。AI候補・自動計測を使う場合は、静止画も撮影してください。",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [video, images.length]);

  const create = useMutation({
    mutationFn: async () => {
      const payload = findingsToPayload(form);
      return api.createObservation({
        ...payload,
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
    if (!form.customer) {
      setError("顧客を選んでください。");
      return;
    }
    if (!form.observedAtLocal || Number.isNaN(new Date(form.observedAtLocal).getTime())) {
      setError("観察日時を入力してください。");
      return;
    }
    setError(null);
    create.mutate();
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-wide text-[var(--heading)]">新しい観察</h1>
        <button
          type="button"
          onClick={() => go({ kind: "list" })}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          一覧に戻る
        </button>
      </div>

      <StepNav />

      {/* lg以上：左＝操作・所見フォーム（カラム内スクロール）、右＝画像画面（全面）。
          lg未満：ラッパーを display:contents にして従来どおりの縦積み
          （見出し→メディア上部固定→操作→フォーム）に戻す。 */}
      <div className="flex flex-col gap-8 lg:grid lg:h-[calc(100dvh-21.75rem)] lg:min-h-[400px] lg:grid-cols-[minmax(400px,470px)_minmax(0,1fr)] lg:gap-6">
        <div className="contents lg:order-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-8 lg:overflow-y-auto lg:pr-1">
          <CaptureIntro
            support={cap.support}
            id="obs-step-capture"
            className="order-1 scroll-mt-32 lg:scroll-mt-4"
          />
          <CaptureControls cap={cap} className="order-3" />
          {frameNote && (
            <p className="order-3 rounded-[var(--radius)] bg-[var(--paper)] p-3 text-base leading-relaxed text-[var(--text)]">
              {frameNote}
            </p>
          )}
          <div id="obs-step-findings" className="order-4 scroll-mt-32 lg:scroll-mt-4">
            <FindingsForm
              value={form}
              onChange={setForm}
              autoSummary={buildAutoSummary(form)}
              trialMode={true}
              measureImageUrl={
                (images[primaryIndex] ?? images[0])?.previewUrl ?? null
              }
              aiImageAvailable={images.length > 0}
              aiImageUrl={
                (images[primaryIndex] ?? images[0])?.previewUrl ?? null
              }
              onAskAi={async () => {
                // 対象は編集中のドラフトの主画像1枚。画像だけを送る。
                const img = images[primaryIndex] ?? images[0];
                if (!img) throw new Error("画像がありません。");
                return api.analyzeImagePatterns({
                  image: { dataBase64: img.dataBase64, mimeType: img.mimeType },
                });
              }}
              onDraftReport={async () =>
                api.draftReportText(draftArgsFromForm(form))
              }
            />
          </div>
          {error && (
            <p role="alert" className="order-5 text-lg font-medium text-[var(--alert)]">
              {error}
            </p>
          )}
          <div className="sticky bottom-0 z-20 order-6 -mx-4 border-t border-[var(--border)] bg-[var(--bg)]/95 px-4 py-3 shadow-[0_-8px_16px_-12px_rgba(11,37,69,0.35)] backdrop-blur max-lg:shrink-0 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:pb-1">
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
        <div className="contents lg:order-2 lg:block lg:min-h-0">
          <CaptureMediaDisplay cap={cap} className="order-2 lg:h-full" />
        </div>
      </div>
    </div>
  );
}

/* ================= レポート ================= */

function ReportScreen({
  id,
  go,
  mode,
}: {
  id: string;
  go: (v: View) => void;
  mode: AppMode;
}) {
  const queryClient = useQueryClient();
  const authState = useAuth();
  // 観察の削除は Firestore ルールで管理者（admin）のみ許可されているため、
  // ボタンも管理者にだけ出す（一般スタッフでは必ず失敗する操作を出さない）。
  const isAdmin =
    authState.status === "ready" && authState.staff.role === "admin";
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const detail = useQuery({
    queryKey: ["observation", id],
    queryFn: () => api.getObservation({ id }),
  });
  const obs = detail.data?.observation ?? null;
  const qrDataUrl = useQrDataUrl(obs?.reportId ?? "", obs?.receiveToken ?? null);

  // 同じ対象者の履歴から直前の観察を探す（ビフォアアフター比較用）。
  const history = useQuery({
    queryKey: ["subjectHistory", id],
    queryFn: () => api.getSubjectHistory({ id }),
  });
  let prevId: string | null = null;
  if (obs && history.data) {
    const t = new Date(obs.observedAt).getTime();
    for (const entry of history.data.observations) {
      const et = new Date(entry.observedAt).getTime();
      if (et < t || (et === t && entry.id < id)) prevId = entry.id;
    }
  }
  const prevDetail = useQuery({
    queryKey: ["observation", prevId ?? ""],
    queryFn: () => api.getObservation({ id: prevId ?? "" }),
    enabled: prevId != null,
  });
  const prevObs = prevDetail.data?.observation ?? null;

  const [claimNote, setClaimNote] = useState<string | null>(null);
  const finalize = useMutation({
    mutationFn: () => api.finalizeObservation({ id }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["observation", id] });
      void queryClient.invalidateQueries({ queryKey: ["observations"] });
      setClaimNote(
        res.claimError
          ? `受け取りQRの発行はできませんでした（${res.claimError}）。レポートの確定は完了しています。`
          : null,
      );
    },
    onError: (e) => setActionError(describeFirebaseError(e)),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteObservation({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["observations"] });
      go({ kind: "list" });
    },
    onError: (e) => setActionError(describeFirebaseError(e)),
  });

  if (detail.isPending) return <LoadingState />;
  if (detail.error || !obs)
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-lg text-[var(--alert)]">
          レポートを読み込めませんでした。
        </p>
        <button
          type="button"
          onClick={() => go({ kind: "list" })}
          className="min-h-14 self-start rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          一覧に戻る
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="no-print flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => go({ kind: "list" })}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          一覧に戻る
        </button>
        <button
          type="button"
          onClick={() => go({ kind: "edit", id })}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          編集する
        </button>
        {prevId != null && (
          <button
            type="button"
            onClick={() => go({ kind: "compare", beforeId: prevId, afterId: id })}
            className="min-h-14 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)]"
          >
            前回と比べる（ビフォアアフター）
          </button>
        )}
        {obs.video && (
          <button
            type="button"
            onClick={() => go({ kind: "measure", id })}
            className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
          >
            血流速度を測る（試作）
          </button>
        )}
        {obs.status !== "finalized" && (
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
          >
            印刷する（A4）
          </button>
        )}
        {/* 主要アクションは1つだけを右端に大きく置く。
            未確定なら「確定」、確定済みなら「印刷」が主要になる。 */}
        {obs.status !== "finalized" ? (
          <button
            type="button"
            disabled={finalize.isPending}
            onClick={() => finalize.mutate()}
            className="ml-auto min-h-16 rounded-[var(--radius)] bg-[var(--accent)] px-7 text-xl font-bold text-white disabled:opacity-40"
          >
            {finalize.isPending ? "確定しています…" : "レポートを確定する"}
          </button>
        ) : (
          <span className="ml-auto flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-[var(--accent)] px-4 py-2 text-base font-bold text-white">
              確定済み
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-16 rounded-[var(--radius)] bg-[var(--accent)] px-7 text-xl font-bold text-white"
            >
              印刷する（A4）
            </button>
          </span>
        )}
      </div>

      {actionError && (
        <p role="alert" className="no-print text-lg font-medium text-[var(--alert)]">
          {actionError}
        </p>
      )}

      {claimNote && (
        <p className="no-print text-base text-[var(--dim)]">{claimNote}</p>
      )}

      {/* 確定済みでも受け取りトークンが手元に無い場合（発行に失敗した、
          別の端末で開いた等）は、ここから発行し直せる。
          finalizeObservation は確定済みでも再発行だけを行う。 */}
      {obs.status === "finalized" && !obs.receiveToken && (
        <div className="no-print flex flex-wrap items-center gap-3">
          <p className="text-base text-[var(--dim)]">
            受け取りQRコードはまだ発行されていません。
          </p>
          <button
            type="button"
            disabled={finalize.isPending}
            onClick={() => finalize.mutate()}
            className="min-h-14 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)] disabled:opacity-40"
          >
            {finalize.isPending ? "発行しています…" : "受け取りQRを発行する"}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] shadow-sm">
        <ReportBody
          obs={obs}
          prev={prevObs}
          qrDataUrl={obs.status === "finalized" ? qrDataUrl : null}
          trialMode={mode === "research"}
        />
      </div>

      {obs.status === "finalized" && obs.receiveToken && obs.reportId && (
        <ReceiveQr id={obs.reportId} token={obs.receiveToken} qrDataUrl={qrDataUrl} />
      )}

      {isAdmin && (
      <div className="no-print flex flex-col gap-3 border-t border-[var(--border)] pt-4">
        {confirmDelete ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-lg font-medium text-[var(--alert)]">
              この観察レポートと画像をすべて削除します。よろしいですか？
            </p>
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              className="min-h-14 rounded-[var(--radius)] bg-[var(--alert)] px-5 text-lg font-bold text-white disabled:opacity-40"
            >
              削除する
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
            >
              やめる
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-14 self-start rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--alert)]"
          >
            このレポートを削除する
          </button>
        )}
      </div>
      )}
    </div>
  );
}

/* ================= 編集 ================= */

function EditScreen({
  id,
  go,
  mode,
}: {
  id: string;
  go: (v: View) => void;
  mode: AppMode;
}) {
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ["observation", id],
    queryFn: () => api.getObservation({ id }),
  });
  const obs = detail.data?.observation ?? null;
  const [form, setForm] = useState<FindingsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initializedFor = useRef<string | null>(null);
  const addFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (obs && initializedFor.current !== obs.id) {
      initializedFor.current = obs.id;
      setForm({
        customer: obs.customer,
        subjectName: obs.subjectName,
        subjectId: obs.subjectId ?? "",
        observedAtLocal: isoToLocalInput(obs.observedAt),
        finger: obs.finger,
        roomTempC: obs.roomTempC != null ? String(obs.roomTempC) : "",
        restMinutes: obs.restMinutes != null ? String(obs.restMinutes) : "",
        restrictionsOk: obs.restrictionsOk,
        consent: obs.consent,
        densityPerMm: obs.densityPerMm != null ? String(obs.densityPerMm) : "",
        flow: obs.flow ?? "",
        color: obs.color ?? "",
        flags: {
          giant: obs.flagGiant,
          hemorrhage: obs.flagHemorrhage,
          loss: obs.flagLoss,
          ramified: obs.flagRamified,
        },
        patterns: obs.patterns,
        changeVsPrev: obs.changeVsPrev ?? "",
        // まとめ欄には手直し済みの保存値だけを入れる（自動組立の文は
        // フォーム側でプレビュー表示し、欄が空ならそちらが使われる）。
        summary: obs.summaryNote ?? "",
        adviceMemo: obs.adviceMemo ?? "",
        nextNote: obs.nextNote ?? "",
        referralGiven: obs.referralGiven,
        trialName: obs.trialName ?? "",
        trialGroup: obs.trialGroup ?? "",
        interventions: obs.interventions.map((iv) => ({
          category: iv.category,
          gasType: iv.gasType ?? "hydrogen",
          detail: iv.detail,
          timing: iv.timing,
        })),
      });
    }
  }, [obs]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["observation", id] });
    void queryClient.invalidateQueries({ queryKey: ["observations"] });
  };

  const update = useMutation({
    mutationFn: async (f: FindingsState) => {
      const payload = findingsToPayload(f);
      const args: UpdateArgs = {
        id,
        ...payload,
        // 校正値は計測画面で管理するため、編集では既存値をそのまま保持する。
        calibrationUmPerPx:
          detail.data?.observation?.calibrationUmPerPx ?? undefined,
      };
      return api.updateObservation(args);
    },
    onSuccess: () => {
      refresh();
      go({ kind: "report", id });
    },
    onError: (e) => setError(`保存できませんでした：${describeFirebaseError(e)}`),
  });

  const addImage = useMutation({
    mutationFn: async (file: File) => {
      const captured = await fileToCaptured(file);
      return api.addImage({
        observationId: id,
        image: { dataBase64: captured.dataBase64, mimeType: captured.mimeType },
        makePrimary: false,
      });
    },
    onSuccess: refresh,
    onError: (e) => setError(describeFirebaseError(e)),
  });

  const removeImage = useMutation({
    mutationFn: (imageId: string) =>
      api.removeImage({ imageId, observationId: id }),
    onSuccess: refresh,
    onError: (e) => setError(describeFirebaseError(e)),
  });

  const setPrimary = useMutation({
    mutationFn: (imageId: string) =>
      api.setPrimaryImage({ observationId: id, imageId }),
    onSuccess: refresh,
    onError: (e) => setError(describeFirebaseError(e)),
  });

  const videoFileRef = useRef<HTMLInputElement | null>(null);
  const replaceVideo = useMutation({
    mutationFn: async (file: File) => {
      const captured = await fileToCapturedVideo(file);
      return api.setVideo({
        observationId: id,
        video: {
          blob: captured.blob,
          mimeType: captured.mimeType,
          durationSec: captured.durationSec ?? undefined,
        },
      });
    },
    onSuccess: refresh,
    onError: (e) => setError(describeFirebaseError(e)),
  });

  const removeVideo = useMutation({
    mutationFn: () => api.removeVideo({ observationId: id }),
    onSuccess: refresh,
    onError: (e) => setError(describeFirebaseError(e)),
  });

  // 保存済みの動画から静止画を切り出して画像として追加する。
  // 動画だけの観察でも AI候補・自動計測（静止画が対象）を使えるようにするため。
  const extractStill = useMutation({
    mutationFn: async () => {
      const current = detail.data?.observation;
      if (!current?.video) throw new Error("動画が登録されていません");
      const blob = await api.fetchStoredBlob(current.video.storagePath);
      const url = URL.createObjectURL(blob);
      try {
        const frame = await captureFrameFromVideoUrl(url);
        try {
          return await api.addImage({
            observationId: id,
            image: { dataBase64: frame.dataBase64, mimeType: frame.mimeType },
            makePrimary: current.images.length === 0,
          });
        } finally {
          URL.revokeObjectURL(frame.previewUrl);
        }
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    onSuccess: refresh,
    onError: (e) => setError(describeFirebaseError(e)),
  });

  if (detail.isPending || !form) return <LoadingState />;
  if (detail.error || !obs)
    return (
      <p role="alert" className="text-lg text-[var(--alert)]">
        レポートを読み込めませんでした。
      </p>
    );

  const handleSave = () => {
    if (!form.customer) {
      setError("顧客を選んでください。");
      return;
    }
    if (!form.observedAtLocal || Number.isNaN(new Date(form.observedAtLocal).getTime())) {
      setError("観察日時を入力してください。");
      return;
    }
    setError(null);
    update.mutate(form);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-wide text-[var(--heading)]">レポートを編集</h1>
        <button
          type="button"
          onClick={() => go({ kind: "report", id })}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          レポートに戻る
        </button>
      </div>

      <StepNav />

      {/* lg以上：左＝操作・所見フォーム（カラム内スクロール）、右＝画像・動画の表示面。
          lg未満：ラッパーを display:contents にして従来どおりの縦積みに戻す。 */}
      <div className="flex flex-col gap-8 lg:grid lg:h-[calc(100dvh-21.75rem)] lg:min-h-[400px] lg:grid-cols-[minmax(400px,470px)_minmax(0,1fr)] lg:gap-6">
        <div className="contents lg:order-1 lg:flex lg:min-h-0 lg:flex-col lg:gap-8 lg:overflow-y-auto lg:pr-1">
          {obs.images.length < 5 && (
            <div className="order-2 flex flex-col gap-3">
              <button
                type="button"
                disabled={addImage.isPending}
                onClick={() => addFileRef.current?.click()}
                className="min-h-14 self-start rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)] disabled:opacity-40"
              >
                {addImage.isPending ? "追加しています…" : "画像ファイルを追加する"}
              </button>
              <input
                ref={addFileRef}
                type="file"
                accept="image/*"
                aria-label="画像ファイルを追加する"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) addImage.mutate(file);
                  e.target.value = "";
                }}
              />
            </div>
          )}

          <div className="order-4 flex flex-col gap-3">
            {obs.video ? (
              <>
                <p className="text-base text-[var(--dim)]">
                  動画を差し替えると、保存済みの血流速度の計測結果は消えます。新しい動画で測り直してください。計測はレポート画面の「血流速度を測る（試作）」から行います。
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={replaceVideo.isPending}
                    onClick={() => videoFileRef.current?.click()}
                    className="min-h-14 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)] disabled:opacity-40"
                  >
                    {replaceVideo.isPending ? "設定しています…" : "動画ファイルで差し替える"}
                  </button>
                  <button
                    type="button"
                    disabled={removeVideo.isPending}
                    onClick={() => removeVideo.mutate()}
                    className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--alert)] disabled:opacity-40"
                  >
                    動画を削除する（計測結果も消えます）
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                disabled={replaceVideo.isPending}
                onClick={() => videoFileRef.current?.click()}
                className="min-h-14 self-start rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)] disabled:opacity-40"
              >
                {replaceVideo.isPending ? "設定しています…" : "動画ファイルを追加する"}
              </button>
            )}
            <input
              ref={videoFileRef}
              type="file"
              accept="video/webm,video/mp4"
              aria-label="動画ファイルを設定する"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) replaceVideo.mutate(file);
                e.target.value = "";
              }}
            />
          </div>

          <div id="obs-step-findings" className="order-5 scroll-mt-32 lg:scroll-mt-4">
            <FindingsForm
              value={form}
              onChange={setForm}
              autoSummary={buildAutoSummary(form)}
              trialMode={mode === "research"}
              measureImageUrl={
                (obs.images.find((img) => img.isPrimary) ?? obs.images[0])
                  ?.url ?? null
              }
              calibrationUmPerPx={obs.calibrationUmPerPx}
              aiImageAvailable={obs.images.length > 0}
              aiImageUrl={
                (obs.images.find((img) => img.isPrimary) ?? obs.images[0])
                  ?.url ?? null
              }
              onAskAi={async () => {
                // 対象は保存済みの主画像1枚（id = Storage パス）。
                // Storage から読み出して base64 化し、画像だけを送る。
                const primary =
                  obs.images.find((img) => img.isPrimary) ?? obs.images[0];
                if (!primary) throw new Error("画像がありません。");
                const image = await api.fetchStoredImageInput(primary.id);
                return api.analyzeImagePatterns({ image });
              }}
              onDraftReport={async () =>
                api.draftReportText(draftArgsFromForm(form))
              }
            />
          </div>

          {error && (
            <p role="alert" className="order-6 text-lg font-medium text-[var(--alert)]">
              {error}
            </p>
          )}
          <div className="sticky bottom-0 z-20 order-7 -mx-4 border-t border-[var(--border)] bg-[var(--bg)]/95 px-4 py-3 shadow-[0_-8px_16px_-12px_rgba(11,37,69,0.35)] backdrop-blur sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0 lg:pb-1">
            <button
              type="button"
              disabled={update.isPending}
              onClick={handleSave}
              className="min-h-16 w-full rounded-[var(--radius)] bg-[var(--accent)] px-6 text-xl font-bold text-white disabled:opacity-40"
            >
              {update.isPending ? "保存しています…" : "変更を保存する"}
            </button>
          </div>
        </div>

        <div className="contents lg:order-2 lg:flex lg:min-h-0 lg:flex-col lg:gap-8 lg:overflow-y-auto">
          <section
            id="obs-step-capture"
            aria-label="登録済みの画像"
            className="order-1 flex scroll-mt-32 flex-col gap-3 lg:scroll-mt-4"
          >
            <h2 className="text-xl font-bold text-[var(--text)]">登録済みの画像（{obs.images.length}枚）</h2>
            {obs.images.length > 0 ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                {obs.images.map((img, i) => (
                  <li
                    key={img.id}
                    className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2"
                  >
                    <img
                      src={img.url}
                      alt={`観察画像 ${i + 1}`}
                      className="aspect-[4/3] w-full rounded object-cover"
                    />
                    {img.isPrimary ? (
                      <span className="text-center text-base font-bold text-[var(--accent-strong)]">
                        代表画像
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPrimary.mutate(img.id)}
                        className="min-h-11 rounded border border-[var(--border)] px-2 text-base text-[var(--text)]"
                      >
                        代表にする
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage.mutate(img.id)}
                      aria-label={`画像 ${i + 1} を削除`}
                      className="min-h-11 rounded border border-[var(--border)] px-2 text-base text-[var(--alert)]"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-lg text-[var(--dim)]">画像は登録されていません。</p>
            )}
          </section>

          <section aria-label="登録済みの動画" className="order-3 flex flex-col gap-3">
            <h2 className="text-xl font-bold text-[var(--text)]">登録済みの動画</h2>
            {obs.video ? (
              <>
                <video
                  src={obs.video.url}
                  controls
                  playsInline
                  aria-label="登録済みの観察動画"
                  className="aspect-video w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)]"
                />
                {obs.images.length < 5 && (
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      disabled={extractStill.isPending}
                      onClick={() => extractStill.mutate()}
                      className="min-h-14 self-start rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)] disabled:opacity-40"
                    >
                      {extractStill.isPending
                        ? "切り出しています…"
                        : "動画から静止画を切り出して画像に追加する"}
                    </button>
                    <p className="text-base text-[var(--dim)]">
                      AI候補と自動計測は静止画が対象です。静止画が無い観察では、動画から切り出した1枚を代表画像として追加できます。
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-lg text-[var(--dim)]">動画は登録されていません。</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ================= 血流速度の計測 ================= */

function MeasureScreen({ id, go }: { id: string; go: (v: View) => void }) {
  const detail = useQuery({
    queryKey: ["observation", id],
    queryFn: () => api.getObservation({ id }),
  });
  const obs = detail.data?.observation ?? null;

  if (detail.isPending) return <LoadingState />;
  if (detail.error || !obs || !obs.video)
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-lg text-[var(--alert)]">
          計測に使う動画が登録されていません。
        </p>
        <button
          type="button"
          onClick={() => go({ kind: "report", id })}
          className="min-h-14 self-start rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          レポートに戻る
        </button>
      </div>
    );

  return (
    <FlowMeasure
      observationId={id}
      videoUrl={obs.video.url}
      videoStoragePath={obs.video.storagePath}
      initialCalibrationUmPerPx={obs.calibrationUmPerPx}
      savedResult={
        obs.flowSpeedPxPerSec != null
          ? {
              pxPerSec: obs.flowSpeedPxPerSec,
              mmPerSec: obs.flowSpeedMmPerSec,
              method: obs.flowSpeedMethod ?? "auto",
            }
          : null
      }
      onClose={() => go({ kind: "report", id })}
    />
  );
}

/* ================= 本体 ================= */

export function CapillaryApp() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [mode, setMode] = useState<AppMode>(() => loadMode());
  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };
  const changeMode = (next: AppMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // 保存できなくても、この画面を開いている間は切り替えが効く。
    }
  };

  // 観察の入力・編集画面は分割レイアウトで画像を大きく見せるため幅を広げる。
  // 一般検査の新しい観察も2カラム化したので同じく広げる。
  // それ以外の画面の幅は従来どおり。
  const wideView = view.kind === "edit" || view.kind === "new";

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppNav
        view={view}
        go={go}
        mode={mode}
        onModeChange={changeMode}
        wide={wideView}
      />
      <main
        className={`mx-auto w-full px-4 pb-10 pt-4 sm:px-6 ${wideView ? "max-w-[1680px]" : "max-w-6xl"}`}
      >
        {view.kind === "list" && <ListScreen go={go} mode={mode} />}
        {view.kind === "new" &&
          (mode === "simple" ? (
            <SimpleNewScreen go={go} customerId={view.customerId} />
          ) : (
            <NewScreen go={go} customerId={view.customerId} />
          ))}
        {view.kind === "customers" && <CustomerListScreen go={go} />}
        {view.kind === "customer" && <CustomerDetailScreen id={view.id} go={go} />}
        {view.kind === "report" && (
          <ReportScreen id={view.id} go={go} mode={mode} />
        )}
        {view.kind === "edit" && (
          <EditScreen id={view.id} go={go} mode={mode} />
        )}
        {view.kind === "measure" && <MeasureScreen id={view.id} go={go} />}
        {view.kind === "trialData" && (
          <TrialDataScreen onBack={() => go({ kind: "list" })} />
        )}
        {view.kind === "compare" && (
          <CompareScreen
            beforeId={view.beforeId}
            afterId={view.afterId}
            onBackToList={() => go({ kind: "list" })}
            onOpenReport={(rid) => go({ kind: "report", id: rid })}
            trialMode={mode === "research"}
          />
        )}
      </main>
    </div>
  );
}
