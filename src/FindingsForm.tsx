// 所見入力フォーム（撮影の型どおりの項目）。
// 新規作成と編集で共用する。値の保持は親コンポーネント側。

import { useEffect, useState } from "react";
import {
capillaryChangeOptions,
capillaryClinicalFlagLabels,
capillaryColorImpressions,
capillaryFingers,
capillaryFlowImpressions,
capillaryPatternByCode,
capillaryPatterns,
type ClinicalFlagKey,
} from "./patterns";
import { PatternDiagram } from "./PatternDiagram";
import {
  gasTypes,
  interventionCategories,
  interventionTimings,
} from "./trial";

export type InterventionDraft = {
  category: string;
  gasType: string;
  detail: string;
  timing: string;
};

export function emptyIntervention(): InterventionDraft {
  return { category: "gas", gasType: "hydrogen", detail: "", timing: "between_visits" };
}

export type FindingsState = {
  subjectName: string;
  subjectId: string;
  observedAtLocal: string;
  finger: string;
  roomTempC: string;
  restMinutes: string;
  restrictionsOk: boolean;
  densityPerMm: string;
  flow: string;
  color: string;
  flags: Record<ClinicalFlagKey, boolean>;
  patterns: string[];
  changeVsPrev: string;
  summary: string;
  adviceMemo: string;
  nextNote: string;
  referralGiven: boolean;
  // 試験モード用（試験モードONのときだけ入力欄が出る）
  trialName: string;
  trialGroup: string;
  interventions: InterventionDraft[];
};

export function emptyFindings(observedAtLocal: string): FindingsState {
  return {
    subjectName: "",
    subjectId: "",
    observedAtLocal,
    finger: "left_ring",
    roomTempC: "",
    restMinutes: "",
    restrictionsOk: false,
    densityPerMm: "",
    flow: "",
    color: "",
    flags: { giant: false, hemorrhage: false, loss: false, ramified: false },
    patterns: [],
    changeVsPrev: "",
    summary: "",
    adviceMemo: "",
    nextNote: "",
    referralGiven: false,
    trialName: "",
    trialGroup: "",
    interventions: [],
  };
}

// パターン選択グリッドの現在の列数。
// グリッドのクラス（grid-cols-2 / sm:grid-cols-3 / lg:grid-cols-2）と
// 同じブレークポイントで判定し、説明パネルを差し込む行末を求めるために使う。
function usePatternGridColumns(): number {
  const read = (): number => {
    if (typeof window === "undefined") return 2;
    if (window.matchMedia("(min-width: 1024px)").matches) return 2;
    if (window.matchMedia("(min-width: 640px)").matches) return 3;
    return 2;
  };
  const [columns, setColumns] = useState<number>(read);
  useEffect(() => {
    const update = () => setColumns(read());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return columns;
}

const inputClass =
  "min-h-14 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-lg text-[var(--text)]";
const labelClass = "flex flex-col gap-1 text-base font-medium text-[var(--text)]";

function ChipGroup<T extends string>({
  legend,
  options,
  value,
  onSelect,
}: {
  legend: string;
  options: readonly { code: T; label: string }[];
  value: string;
  onSelect: (code: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-base font-medium text-[var(--text)]">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = value === opt.code;
          return (
            <button
              key={opt.code}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(selected ? "" : opt.code)}
              className={`min-h-14 rounded-full px-5 text-lg font-medium ${
                selected
                  ? "bg-[var(--accent)] font-bold text-white"
                  : "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FindingsForm({
  value,
  onChange,
  autoSummary,
  trialMode = false,
}: {
  value: FindingsState;
  onChange: (next: FindingsState) => void;
  autoSummary: string;
  /** 試験モードONのときだけ、試験情報（試験名・群・実施内容）の入力欄を出す。 */
  trialMode?: boolean;
}) {
  const set = (patch: Partial<FindingsState>) => onChange({ ...value, ...patch });

  const togglePattern = (code: string) => {
    const has = value.patterns.includes(code);
    set({
      patterns: has
        ? value.patterns.filter((c) => c !== code)
        : [...value.patterns, code],
    });
  };

  // 説明パネルを開いているパターン。タイルやチップを押すと、そのタイルの
  // 行のすぐ下にパネルが開く。×で閉じても選択状態は変えない。
  const [openCode, setOpenCode] = useState<string | null>(null);
  const openPattern = openCode ? capillaryPatternByCode[openCode] : undefined;
  const columns = usePatternGridColumns();
  const openIndex = openPattern
    ? capillaryPatterns.findIndex((p) => p.code === openPattern.code)
    : -1;
  // パネルを差し込む位置＝開いたタイルが属する行の末尾のタイルの直後。
  const panelAfterIndex =
    openIndex >= 0
      ? Math.min(
          Math.floor(openIndex / columns) * columns + columns - 1,
          capillaryPatterns.length - 1,
        )
      : -1;

  const handleTile = (code: string) => {
    setOpenCode(code);
    togglePattern(code);
  };

  // チップを押したときは、そのタイルの位置までスクロールしてから説明を開く。
  const openFromChip = (code: string) => {
    setOpenCode(code);
    requestAnimationFrame(() => {
      document
        .getElementById(`pattern-tile-${code}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  // 説明パネル本体。グリッドの中で、開いたタイルの行末の直後に
  // 全幅（col-span-full）で差し込む。×で閉じても選択は変わらない。
  const detailPanel = openPattern ? (
    <div
      key={`pattern-detail-${openPattern.code}`}
      aria-live="polite"
      className="pattern-detail-panel relative col-span-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"
    >
      <button
        type="button"
        aria-label="説明を閉じる"
        onClick={() => setOpenCode(null)}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-2xl leading-none text-[var(--dim)]"
      >
        ×
      </button>
      <div className="flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-2 pr-12 text-xl font-bold text-[var(--text)]">
          {openPattern.name}
          {openPattern.clinical && (
            <span className="rounded-full bg-[var(--alert-bg)] px-2 py-0.5 text-sm font-bold text-[var(--alert)]">
              臨床フラグ対応
            </span>
          )}
          {value.patterns.includes(openPattern.code) && (
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-sm font-bold text-white">
              選択中
            </span>
          )}
        </p>
        <PatternDiagram
          code={openPattern.code}
          title={`${openPattern.name}の模式図`}
          className="h-28 w-full rounded border border-[var(--border)]"
        />
        <p className="text-lg leading-relaxed text-[var(--text)]">
          {openPattern.feature}
        </p>
        <p className="text-lg leading-relaxed text-[var(--accent-strong)]">
          原因：{openPattern.why}
        </p>
        <p className="text-base leading-relaxed text-[var(--dim)]">
          重なりやすい症状：{openPattern.symptoms}
        </p>
        <p className="text-base leading-relaxed text-[var(--dim)]">
          未病の見方：{openPattern.mibyo}
        </p>
      </div>
    </div>
  ) : null;

  const hasAnyFlag = Object.values(value.flags).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="対象者と撮影条件" className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-[var(--text)]">2. 対象者と撮影条件</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            対象者名（必須）
            <input
              aria-label="対象者名"
              className={inputClass}
              value={value.subjectName}
              onChange={(e) => set({ subjectName: e.target.value })}
              placeholder="例：山田 花子"
            />
          </label>
          <label className={labelClass}>
            対象者ID（任意）
            <input
              aria-label="対象者ID"
              className={inputClass}
              value={value.subjectId}
              onChange={(e) => set({ subjectId: e.target.value })}
              placeholder="例：会員番号など"
            />
          </label>
          <label className={labelClass}>
            観察日時
            <input
              aria-label="観察日時"
              type="datetime-local"
              className={inputClass}
              value={value.observedAtLocal}
              onChange={(e) => set({ observedAtLocal: e.target.value })}
            />
          </label>
          <label className={labelClass}>
            撮影した指（標準は左手・薬指）
            <select
              aria-label="撮影した指"
              className={inputClass}
              value={value.finger}
              onChange={(e) => set({ finger: e.target.value })}
            >
              {capillaryFingers.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            室温（℃・任意）
            <input
              aria-label="室温"
              inputMode="decimal"
              className={inputClass}
              value={value.roomTempC}
              onChange={(e) => set({ roomTempC: e.target.value })}
              placeholder="例：24.5"
            />
          </label>
          <label className={labelClass}>
            安静時間（分・任意）
            <input
              aria-label="安静時間"
              inputMode="numeric"
              className={inputClass}
              value={value.restMinutes}
              onChange={(e) => set({ restMinutes: e.target.value })}
              placeholder="例：10"
            />
          </label>
        </div>
        <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-lg text-[var(--text)]">
          <input
            type="checkbox"
            checked={value.restrictionsOk}
            onChange={(e) => set({ restrictionsOk: e.target.checked })}
          />
          撮影前の制限（飲食・喫煙・運動など）を確認した
        </label>
        <p className="rounded-[var(--radius)] bg-[var(--paper)] p-3 text-base leading-relaxed text-[var(--text)]">
          動画を撮る場合は、安静時間をおいて指の状態が落ち着いてから撮影してください。血流速度は室温・安静・飲食などの条件で大きく変わるため、静止画と同じ条件でそろえることが大切です。
        </p>
      </section>

      <section aria-label="所見" className="flex flex-col gap-5">
        <h2 className="text-xl font-bold text-[var(--text)]">3. 所見</h2>
        <label className={labelClass}>
          密度（本数/mm・任意）
          <input
            aria-label="密度"
            inputMode="decimal"
            className={inputClass}
            value={value.densityPerMm}
            onChange={(e) => set({ densityPerMm: e.target.value })}
            placeholder="例：8.5"
          />
        </label>
        <ChipGroup
          legend="流れの印象"
          options={capillaryFlowImpressions}
          value={value.flow}
          onSelect={(code) => set({ flow: code })}
        />
        <ChipGroup
          legend="色の印象"
          options={capillaryColorImpressions}
          value={value.color}
          onSelect={(code) => set({ color: code })}
        />
        <ChipGroup
          legend="前回比較"
          options={capillaryChangeOptions}
          value={value.changeVsPrev}
          onSelect={(code) => set({ changeVsPrev: code })}
        />

        <fieldset className="rounded-[var(--radius)] border-2 border-[var(--alert)] p-4">
          <legend className="px-2 text-lg font-bold text-[var(--alert)]">
            臨床フラグ（必ず4項目すべて確認してください）
          </legend>
          <div className="flex flex-col gap-2">
            {(Object.keys(capillaryClinicalFlagLabels) as ClinicalFlagKey[]).map(
              (key) => (
                <label
                  key={key}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius)] bg-[var(--surface)] px-3 text-lg text-[var(--text)]"
                >
                  <input
                    type="checkbox"
                    checked={value.flags[key]}
                    onChange={(e) =>
                      set({ flags: { ...value.flags, [key]: e.target.checked } })
                    }
                  />
                  {capillaryClinicalFlagLabels[key]}
                </label>
              ),
            )}
          </div>
          {hasAnyFlag && (
            <label className="mt-3 flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius)] bg-[var(--alert-bg)] px-3 text-lg font-medium text-[var(--text)]">
              <input
                type="checkbox"
                checked={value.referralGiven}
                onChange={(e) => set({ referralGiven: e.target.checked })}
              />
              受診案内を行った
            </label>
          )}
        </fieldset>
      </section>

      <section aria-label="形のパターン" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-[var(--text)]">
          4. 形のパターン（実写と見比べて、近いものを複数選択）
        </h2>
        <p className="text-base text-[var(--dim)]">
          選択中：{value.patterns.length}件。パターンは断定ではなく「最も近い形」として記録します。タイルを押すと、その場で説明が開きます。
        </p>

        {value.patterns.length > 0 && (
          <div className="flex flex-wrap gap-2" aria-label="選択中のパターン">
            {value.patterns.map((code) => {
              const p = capillaryPatternByCode[code];
              if (!p) return null;
              return (
                <span
                  key={code}
                  className="flex items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--accent-bg)] py-0.5 pl-2 pr-0.5"
                >
                  <button
                    type="button"
                    onClick={() => openFromChip(code)}
                    className="min-h-11 rounded-full px-2 text-base font-bold text-[var(--accent-strong)]"
                  >
                    {p.name}
                  </button>
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

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
          {capillaryPatterns.flatMap((pattern, index) => {
            const selected = value.patterns.includes(pattern.code);
            const focused = openPattern?.code === pattern.code;
            const tile = (
              <button
                key={pattern.code}
                id={`pattern-tile-${pattern.code}`}
                type="button"
                aria-pressed={selected}
                onClick={() => handleTile(pattern.code)}
                className={`relative flex min-h-14 flex-col gap-2 rounded-[var(--radius)] border-2 p-3 text-left ${
                  selected
                    ? "border-[var(--accent)] bg-[var(--accent-bg)]"
                    : focused
                      ? "border-[var(--border-strong)] bg-[var(--surface)]"
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
                  {pattern.name}
                </span>
              </button>
            );
            // 開いたタイルの行の末尾の直後に、説明パネルを差し込む。
            return detailPanel && index === panelAfterIndex
              ? [tile, detailPanel]
              : [tile];
          })}
        </div>
      </section>

      <section
        id="obs-step-confirm"
        aria-label="まとめとアドバイス"
        className="flex scroll-mt-32 flex-col gap-4 lg:scroll-mt-4"
      >
        <h2 className="text-xl font-bold text-[var(--text)]">5. まとめとアドバイス</h2>
        {/* 本番のデータモデルでは、所見のまとめは保存せず、レポート表示時に
            所見から組み立てる（models.ts の Report の方針）。ここでは
            組み立て結果のプレビューだけを示す。「次回について」も
            レポート側で標準文を表示する。 */}
        <div className="flex flex-col gap-1">
          <p className="text-base font-medium text-[var(--text)]">
            所見のまとめ（レポートに自動で組み立てられます）
          </p>
          <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] px-3 py-3 text-lg leading-relaxed text-[var(--text)]">
            {autoSummary}
          </p>
        </div>
        <label className={labelClass}>
          アドバイスメモ
          <textarea
            aria-label="アドバイスメモ"
            className={`${inputClass} min-h-28 py-3`}
            rows={4}
            value={value.adviceMemo}
            onChange={(e) => set({ adviceMemo: e.target.value })}
          />
        </label>
      </section>

      {trialMode && (
        <section aria-label="試験情報" className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-[var(--text)]">
            6. 試験情報（試験モード）
          </h2>
          <p className="text-base text-[var(--dim)]">
            試験として記録する観察では、試験名と群、この観察の前後・期間中に実施したことを記録します。実施内容は事実の記録です。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              試験名（プロトコル名）
              <input
                aria-label="試験名"
                className={inputClass}
                value={value.trialName}
                onChange={(e) => set({ trialName: e.target.value })}
                placeholder="例：水素吸入の観察記録"
              />
            </label>
            <label className={labelClass}>
              群
              <input
                aria-label="群"
                className={inputClass}
                value={value.trialGroup}
                onChange={(e) => set({ trialGroup: e.target.value })}
                placeholder="例：実施群／対照群"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-base font-medium text-[var(--text)]">
              実施内容（{value.interventions.length}件）
            </p>
            {value.interventions.map((iv, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={labelClass}>
                    種別
                    <select
                      aria-label={`実施内容 ${i + 1} の種別`}
                      className={inputClass}
                      value={iv.category}
                      onChange={(e) =>
                        set({
                          interventions: value.interventions.map((x, j) =>
                            j === i ? { ...x, category: e.target.value } : x,
                          ),
                        })
                      }
                    >
                      {interventionCategories.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {iv.category === "gas" && (
                    <label className={labelClass}>
                      ガスの種類
                      <select
                        aria-label={`実施内容 ${i + 1} のガスの種類`}
                        className={inputClass}
                        value={iv.gasType}
                        onChange={(e) =>
                          set({
                            interventions: value.interventions.map((x, j) =>
                              j === i ? { ...x, gasType: e.target.value } : x,
                            ),
                          })
                        }
                      >
                        {gasTypes.map((g) => (
                          <option key={g.code} value={g.code}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className={labelClass}>
                    実施のタイミング
                    <select
                      aria-label={`実施内容 ${i + 1} のタイミング`}
                      className={inputClass}
                      value={iv.timing}
                      onChange={(e) =>
                        set({
                          interventions: value.interventions.map((x, j) =>
                            j === i ? { ...x, timing: e.target.value } : x,
                          ),
                        })
                      }
                    >
                      {interventionTimings.map((t) => (
                        <option key={t.code} value={t.code}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className={labelClass}>
                  内容の詳細（濃度・時間・製品名など）
                  <input
                    aria-label={`実施内容 ${i + 1} の詳細`}
                    className={inputClass}
                    value={iv.detail}
                    onChange={(e) =>
                      set({
                        interventions: value.interventions.map((x, j) =>
                          j === i ? { ...x, detail: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="例：水素ガス吸入 30分 × 週2回・8週間"
                  />
                </label>
                <button
                  type="button"
                  aria-label={`実施内容 ${i + 1} を削除`}
                  onClick={() =>
                    set({
                      interventions: value.interventions.filter((_, j) => j !== i),
                    })
                  }
                  className="min-h-11 self-start rounded border border-[var(--border)] px-3 text-base text-[var(--alert)]"
                >
                  この実施内容を削除
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                set({ interventions: [...value.interventions, emptyIntervention()] })
              }
              className="min-h-14 self-start rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)]"
            >
              実施内容を追加する
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
