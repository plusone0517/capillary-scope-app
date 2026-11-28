// 同意の記録欄（一般検査・研究用の両方で使う）。
// 判定ルールは consent.ts にあり、ここは入力だけを受け持つ。

import {
  caseScopeLabels,
  consentAnswerLabels,
  normalizeConsent,
  type CaseScope,
  type ConsentAnswer,
  type ConsentState,
} from "./consent";

// styles.css の `input { width: 100%; min-height: 48px; padding: … }` は
// レイヤー外の指定で Tailwind のクラスより強いため、ラジオの大きさは
// インラインスタイルで固定する（指定しないと丸が横に広がる）。
const radioStyle = {
  width: "1.5rem",
  height: "1.5rem",
  minHeight: 0,
  padding: 0,
  flexShrink: 0,
} as const;

const optionClass = (selected: boolean) =>
  `flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-[var(--radius)] border px-4 text-base text-[var(--text)] ${
    selected
      ? "border-2 border-[var(--accent)] bg-[var(--paper)] font-bold"
      : "border-[var(--border)] bg-[var(--surface)]"
  }`;

const ANSWERS: ConsentAnswer[] = ["granted", "declined", "unconfirmed"];
const SCOPES: CaseScope[] = ["internal", "anonymous"];

function AnswerGroup({
  legend,
  name,
  value,
  onChange,
  compact = false,
}: {
  legend: string;
  name: string;
  value: ConsentAnswer;
  onChange: (next: ConsentAnswer) => void;
  compact?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend
        className={`text-base font-medium text-[var(--text)] ${compact ? "mb-1" : "mb-2"}`}
      >
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {ANSWERS.map((answer) => (
          <label
            key={answer}
            className={optionClass(value === answer)}
          >
            <input
              type="radio"
              style={radioStyle}
              name={name}
              checked={value === answer}
              onChange={() => onChange(answer)}
            />
            {consentAnswerLabels[answer]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ConsentFields({
  value,
  onChange,
  idPrefix = "consent",
  className = "",
  compact = false,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  /** 同じ画面に複数置く場合に radio の name が衝突しないようにする。 */
  idPrefix?: string;
  className?: string;
  /** 一般検査用の省スペース表示（説明文を省き、見出しと間隔を詰める）。 */
  compact?: boolean;
}) {
  // 範囲の整合（同意なしなら範囲を持たない等）は normalizeConsent に任せる。
  const set = (patch: Partial<ConsentState>) =>
    onChange(normalizeConsent({ ...value, ...patch }));

  return (
    <section
      aria-label="同意の記録"
      className={`flex flex-col ${compact ? "gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3" : "gap-4"} ${className}`}
    >
      <h2 className={`font-bold text-[var(--text)] ${compact ? "text-base" : "text-xl"}`}>
        同意の記録
      </h2>
      {!compact && (
        <p className="text-base leading-relaxed text-[var(--dim)]">
          同意書でご確認いただいた内容を記録します。未確認のままの記録は、事例の紹介にも研究にも使いません。
        </p>
      )}
      <AnswerGroup
        legend="1. 事例として紹介することへの同意"
        name={`${idPrefix}-case`}
        value={value.caseUse}
        onChange={(caseUse) => set({ caseUse })}
        compact={compact}
      />
      {value.caseUse === "granted" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-base font-medium text-[var(--text)]">紹介してよい範囲</legend>
          <div className="flex flex-wrap gap-2">
            {SCOPES.map((scope) => (
              <label
                key={scope}
                className={optionClass(value.caseScope === scope)}
              >
                <input
                  type="radio"
                  style={radioStyle}
                  name={`${idPrefix}-scope`}
                  checked={value.caseScope === scope}
                  onChange={() => set({ caseScope: scope })}
                />
                {caseScopeLabels[scope]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <AnswerGroup
        legend="2. 将来、研究に利用することへの同意"
        name={`${idPrefix}-research`}
        value={value.futureResearch}
        onChange={(futureResearch) => set({ futureResearch })}
        compact={compact}
      />
    </section>
  );
}
