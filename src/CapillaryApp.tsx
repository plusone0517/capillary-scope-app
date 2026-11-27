// 毛細血管 分析アプリ：院内スタッフ向けの観察・レポートツール。
// 画面は「一覧」「新しい観察」「レポート」「編集」の4つ。
// 対応環境は Windows PC（Chrome/Edge）と iPad（Safari）。

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type CreateObservationArgs,
  type UpdateObservationArgs,
} from "./api";
import { CapturePanel } from "./CapturePanel";
import { CompareScreen } from "./CompareView";
import { FlowMeasure } from "./FlowMeasure";
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
fileToCaptured,
fileToCapturedVideo,
type CapturedImage,
type CapturedVideo,
} from "./camera";
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
  | { kind: "new" }
  | { kind: "report"; id: string }
  | { kind: "edit"; id: string }
  | { kind: "measure"; id: string }
  | { kind: "trialData" }
  | { kind: "compare"; beforeId: string; afterId: string };

const TRIAL_MODE_KEY = "capillary-app:trial-mode";

function loadTrialMode(): boolean {
  try {
    return window.localStorage.getItem(TRIAL_MODE_KEY) === "on";
  } catch {
    return false;
  }
}

/** 試験モードの ON/OFF 切り替え。ON のときだけ試験用の入力・表示が出る。 */
function TrialModeToggle({
  trialMode,
  onChange,
}: {
  trialMode: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={trialMode}
      aria-label="試験モード"
      onClick={() => onChange(!trialMode)}
      className={`flex min-h-14 items-center gap-3 rounded-full border-2 px-4 text-lg font-bold ${
        trialMode
          ? "border-[var(--accent)] bg-[var(--accent)] text-white"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full ${
          trialMode ? "bg-white/30" : "bg-[var(--paper)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${
            trialMode ? "right-0.5" : "left-0.5"
          }`}
        />
      </span>
      試験モード：{trialMode ? "ON" : "OFF"}
    </button>
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
    subjectName: f.subjectName.trim(),
    subjectId: f.subjectId.trim() ? f.subjectId.trim() : undefined,
    observedAt: new Date(f.observedAtLocal).toISOString(),
    finger: f.finger as CreateArgs["finger"],
    roomTempC: num(f.roomTempC),
    restMinutes: num(f.restMinutes),
    restrictionsOk: f.restrictionsOk,
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

/* ================= 一覧 ================= */

function ListScreen({
  go,
  trialMode,
  onTrialModeChange,
}: {
  go: (v: View) => void;
  trialMode: boolean;
  onTrialModeChange: (next: boolean) => void;
}) {
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
        <h1 className="text-2xl font-bold text-[var(--text)]">観察レポート一覧</h1>
        <div className="flex flex-wrap items-center gap-3">
          <TrialModeToggle trialMode={trialMode} onChange={onTrialModeChange} />
          <button
            type="button"
            onClick={() => go({ kind: "new" })}
            className="min-h-14 rounded-[var(--radius)] bg-[var(--accent)] px-6 text-xl font-bold text-white"
          >
            新しい観察をはじめる
          </button>
        </div>
      </div>

      {trialMode && (
        <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base leading-relaxed text-[var(--text)]">
            試験モードがONです。観察の入力・編集で試験名・群・実施内容を記録でき、ビフォアアフターでは「この間に実施したこと」が表示されます。
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

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmittedSearch(search.trim());
        }}
      >
        <input
          aria-label="対象者名またはIDで検索"
          className="min-h-14 flex-1 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-lg text-[var(--text)]"
          placeholder="対象者名・IDで検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button
          type="submit"
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg font-medium text-[var(--text)]"
        >
          検索
        </button>
      </form>

      <p className="text-base text-[var(--dim)]">
        各レポートの「比べる」を2件押すと、ビフォアアフターで比較できます（同じ対象者の2件）。
      </p>

      {selectedObs.length > 0 && (
        <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
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

      {list.isPending && <p className="text-lg text-[var(--dim)]">読み込んでいます…</p>}
      {list.error && (
        <p role="alert" className="text-lg text-[var(--alert)]">
          一覧の読み込みに失敗しました。もう一度お試しください。
        </p>
      )}
      {list.data && list.data.observations.length === 0 && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-lg text-[var(--text)]">
            {submittedSearch
              ? "条件に合う観察レポートはありません。"
              : "まだ観察レポートがありません。「新しい観察をはじめる」から最初の観察を記録してください。"}
          </p>
        </div>
      )}
      {list.data && list.data.observations.length > 0 && (
        <ul className="flex flex-col gap-3">
          {list.data.observations.map((obs) => (
            <li
              key={obs.id}
              className="flex overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]"
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
                    {obs.subjectId && (
                      <span className="ml-2 text-base font-normal text-[var(--dim)]">
                        ID：{obs.subjectId}
                      </span>
                    )}
                  </span>
                  <span className="text-base text-[var(--dim)]">
                    {formatDateTime(obs.observedAt)}／
                    {capillaryFingerLabels[obs.finger] ?? obs.finger}／形のパターン
                    {obs.patternCount}件
                  </span>
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
                    {trialMode && obs.trialName && (
                      <span className="rounded-full bg-[var(--paper)] px-3 py-0.5 text-sm font-bold text-[var(--text)]">
                        試験：{obs.trialName}
                      </span>
                    )}
                    {obs.flowSpeedMmPerSec != null && (
                      <span className="rounded-full bg-[var(--paper)] px-3 py-0.5 text-sm font-bold text-[var(--text)]">
                        血流速度 {obs.flowSpeedMmPerSec.toFixed(2)} mm/秒（参考値）
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

function NewScreen({ go, trialMode }: { go: (v: View) => void; trialMode: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FindingsState>(() => emptyFindings(nowLocalInput()));
  const [images, setImages] = useState<CapturedImage[]>([]);
  const [primaryIndex, setPrimaryIndex] = useState(0);
  const [video, setVideo] = useState<CapturedVideo | null>(null);
  const [error, setError] = useState<string | null>(null);

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
              dataBase64: video.dataBase64,
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
      setError(
        e instanceof Error
          ? `保存できませんでした：${e.message}`
          : "保存できませんでした。もう一度お試しください。",
      );
    },
  });

  const handleSave = () => {
    if (!form.subjectName.trim()) {
      setError("対象者名を入力してください。");
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
        <h1 className="text-2xl font-bold text-[var(--text)]">新しい観察</h1>
        <button
          type="button"
          onClick={() => go({ kind: "list" })}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          一覧に戻る
        </button>
      </div>

      <CapturePanel
        images={images}
        primaryIndex={primaryIndex}
        onChange={(next, nextPrimary) => {
          setImages(next);
          setPrimaryIndex(nextPrimary);
        }}
        video={video}
        onVideoChange={setVideo}
      />

      <FindingsForm
        value={form}
        onChange={setForm}
        autoSummary={buildAutoSummary(form)}
        trialMode={trialMode}
      />

      {error && (
        <p role="alert" className="text-lg font-medium text-[var(--alert)]">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={create.isPending}
        onClick={handleSave}
        className="min-h-16 rounded-[var(--radius)] bg-[var(--accent)] px-6 text-xl font-bold text-white disabled:opacity-40"
      >
        {create.isPending ? "保存しています…" : "保存してレポートを見る"}
      </button>
    </div>
  );
}

/* ================= レポート ================= */

function ReportScreen({
  id,
  go,
  trialMode,
}: {
  id: string;
  go: (v: View) => void;
  trialMode: boolean;
}) {
  const queryClient = useQueryClient();
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
    onError: (e) =>
      setActionError(e instanceof Error ? e.message : "確定に失敗しました"),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteObservation({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["observations"] });
      go({ kind: "list" });
    },
    onError: (e) =>
      setActionError(e instanceof Error ? e.message : "削除に失敗しました"),
  });

  if (detail.isPending)
    return <p className="text-lg text-[var(--dim)]">読み込んでいます…</p>;
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
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          印刷する（A4）
        </button>
        {obs.status !== "finalized" && (
          <button
            type="button"
            disabled={finalize.isPending}
            onClick={() => finalize.mutate()}
            className="min-h-14 rounded-[var(--radius)] bg-[var(--accent)] px-5 text-lg font-bold text-white disabled:opacity-40"
          >
            {finalize.isPending ? "確定しています…" : "レポートを確定する"}
          </button>
        )}
        {obs.status === "finalized" && (
          <span className="rounded-full bg-[var(--accent)] px-4 py-2 text-base font-bold text-white">
            確定済み
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

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] shadow-sm">
        <ReportBody
          obs={obs}
          prev={prevObs}
          qrDataUrl={obs.status === "finalized" ? qrDataUrl : null}
          trialMode={trialMode}
        />
      </div>

      {obs.status === "finalized" && obs.receiveToken && obs.reportId && (
        <ReceiveQr id={obs.reportId} token={obs.receiveToken} qrDataUrl={qrDataUrl} />
      )}

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
    </div>
  );
}

/* ================= 編集 ================= */

function EditScreen({
  id,
  go,
  trialMode,
}: {
  id: string;
  go: (v: View) => void;
  trialMode: boolean;
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
        subjectName: obs.subjectName,
        subjectId: obs.subjectId ?? "",
        observedAtLocal: isoToLocalInput(obs.observedAt),
        finger: obs.finger,
        roomTempC: obs.roomTempC != null ? String(obs.roomTempC) : "",
        restMinutes: obs.restMinutes != null ? String(obs.restMinutes) : "",
        restrictionsOk: obs.restrictionsOk,
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
        summary: obs.summary ?? "",
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
    onError: (e) =>
      setError(e instanceof Error ? `保存できませんでした：${e.message}` : "保存できませんでした"),
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
    onError: (e) =>
      setError(e instanceof Error ? e.message : "画像の追加に失敗しました"),
  });

  const removeImage = useMutation({
    mutationFn: (imageId: string) => api.removeImage({ imageId }),
    onSuccess: refresh,
    onError: (e) =>
      setError(e instanceof Error ? e.message : "画像の削除に失敗しました"),
  });

  const setPrimary = useMutation({
    mutationFn: (imageId: string) =>
      api.setPrimaryImage({ observationId: id, imageId }),
    onSuccess: refresh,
    onError: (e) =>
      setError(e instanceof Error ? e.message : "代表画像の変更に失敗しました"),
  });

  const videoFileRef = useRef<HTMLInputElement | null>(null);
  const replaceVideo = useMutation({
    mutationFn: async (file: File) => {
      const captured = await fileToCapturedVideo(file);
      return api.setVideo({
        observationId: id,
        video: {
          dataBase64: captured.dataBase64,
          mimeType: captured.mimeType,
          durationSec: captured.durationSec ?? undefined,
        },
      });
    },
    onSuccess: refresh,
    onError: (e) =>
      setError(e instanceof Error ? e.message : "動画の設定に失敗しました"),
  });

  const removeVideo = useMutation({
    mutationFn: () => api.removeVideo({ observationId: id }),
    onSuccess: refresh,
    onError: (e) =>
      setError(e instanceof Error ? e.message : "動画の削除に失敗しました"),
  });

  if (detail.isPending || !form)
    return <p className="text-lg text-[var(--dim)]">読み込んでいます…</p>;
  if (detail.error || !obs)
    return (
      <p role="alert" className="text-lg text-[var(--alert)]">
        レポートを読み込めませんでした。
      </p>
    );

  const handleSave = () => {
    if (!form.subjectName.trim()) {
      setError("対象者名を入力してください。");
      return;
    }
    setError(null);
    update.mutate(form);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--text)]">レポートを編集</h1>
        <button
          type="button"
          onClick={() => go({ kind: "report", id })}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          レポートに戻る
        </button>
      </div>

      <section aria-label="登録済みの画像" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-[var(--text)]">登録済みの画像（{obs.images.length}枚）</h2>
        {obs.images.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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
        {obs.images.length < 5 && (
          <>
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
          </>
        )}
      </section>

      <section aria-label="登録済みの動画" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-[var(--text)]">登録済みの動画</h2>
        {obs.video ? (
          <>
            <video
              src={obs.video.url}
              controls
              playsInline
              aria-label="登録済みの観察動画"
              className="aspect-video w-full rounded-[var(--radius)] border border-[var(--border)] bg-black"
            />
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
          <>
            <p className="text-lg text-[var(--dim)]">動画は登録されていません。</p>
            <button
              type="button"
              disabled={replaceVideo.isPending}
              onClick={() => videoFileRef.current?.click()}
              className="min-h-14 self-start rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)] disabled:opacity-40"
            >
              {replaceVideo.isPending ? "設定しています…" : "動画ファイルを追加する"}
            </button>
          </>
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
      </section>

      <FindingsForm
        value={form}
        onChange={setForm}
        autoSummary={buildAutoSummary(form)}
        trialMode={trialMode}
      />

      {error && (
        <p role="alert" className="text-lg font-medium text-[var(--alert)]">
          {error}
        </p>
      )}
      <button
        type="button"
        disabled={update.isPending}
        onClick={handleSave}
        className="min-h-16 rounded-[var(--radius)] bg-[var(--accent)] px-6 text-xl font-bold text-white disabled:opacity-40"
      >
        {update.isPending ? "保存しています…" : "変更を保存する"}
      </button>
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

  if (detail.isPending)
    return <p className="text-lg text-[var(--dim)]">読み込んでいます…</p>;
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
  const [trialMode, setTrialMode] = useState<boolean>(() => loadTrialMode());
  const go = (v: View) => {
    setView(v);
    window.scrollTo({ top: 0 });
  };
  const changeTrialMode = (next: boolean) => {
    setTrialMode(next);
    try {
      window.localStorage.setItem(TRIAL_MODE_KEY, next ? "on" : "off");
    } catch {
      // 保存できなくても、この画面を開いている間は切り替えが効く。
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6">
        {view.kind === "list" && (
          <ListScreen go={go} trialMode={trialMode} onTrialModeChange={changeTrialMode} />
        )}
        {view.kind === "new" && <NewScreen go={go} trialMode={trialMode} />}
        {view.kind === "report" && (
          <ReportScreen id={view.id} go={go} trialMode={trialMode} />
        )}
        {view.kind === "edit" && <EditScreen id={view.id} go={go} trialMode={trialMode} />}
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
            trialMode={trialMode}
          />
        )}
      </main>
    </div>
  );
}
