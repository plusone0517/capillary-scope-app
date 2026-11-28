// 顧客の登録・編集フォーム（顧客一覧・顧客の画面・観察時の新規登録で共用）。
import { useState } from "react";
import {
  customerSexLabels,
  validateCustomerInput,
  type CustomerInput,
  type CustomerRecord,
  type CustomerSex,
} from "./customer";

const inputClass =
  "min-h-12 w-full rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-lg text-[var(--text)]";
const labelClass = "flex flex-col gap-1 text-base font-medium text-[var(--text)]";

export function CustomerForm({
  initial,
  initialQuery,
  submitLabel,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  /** 編集のときの現在値。 */
  initial?: CustomerRecord | null;
  /** 新規のとき、検索欄に入っていた文字（会員番号らしければ会員番号欄、そうでなければ名前欄に入れる）。 */
  initialQuery?: string;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (input: CustomerInput) => void;
  onCancel?: () => void;
}) {
  const q = initialQuery?.trim() ?? "";
  const looksLikeNumber = /^[A-Za-z0-9\-－ー]+$/.test(q) && /\d/.test(q);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? (looksLikeNumber ? "" : q));
  const [nameKana, setNameKana] = useState(initial?.nameKana ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [sex, setSex] = useState<CustomerSex | "">(initial?.sex ?? "");
  const [memberNumber, setMemberNumber] = useState(
    initial?.memberNumber ?? (looksLikeNumber ? q : ""),
  );
  const [localCode, setLocalCode] = useState(initial?.localCode ?? "");
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const input: CustomerInput = {
      displayName,
      nameKana: nameKana || undefined,
      birthDate: birthDate || undefined,
      sex: sex || undefined,
      memberNumber: memberNumber || undefined,
      localCode: localCode || undefined,
      note: initial?.note ?? undefined,
    };
    const invalid = validateCustomerInput(input);
    setLocalError(invalid);
    if (!invalid) onSubmit(input);
  };

  const shown = localError ?? error;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          お名前（必須）
          <input
            aria-label="お名前"
            className={inputClass}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例：山田 花子"
          />
        </label>
        <label className={labelClass}>
          ふりがな
          <input
            aria-label="ふりがな"
            className={inputClass}
            value={nameKana}
            onChange={(e) => setNameKana(e.target.value)}
            placeholder="例：やまだ はなこ"
          />
        </label>
        <label className={labelClass}>
          ルーツマイル会員番号
          <input
            aria-label="ルーツマイル会員番号"
            className={inputClass}
            value={memberNumber}
            onChange={(e) => setMemberNumber(e.target.value)}
            placeholder="例：RM-12345678"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className={labelClass}>
          生年月日
          <input
            aria-label="生年月日"
            type="date"
            className={inputClass}
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </label>
        <label className={labelClass}>
          性別
          <select
            aria-label="性別"
            className={inputClass}
            value={sex}
            onChange={(e) => setSex(e.target.value as CustomerSex | "")}
          >
            <option value="">未選択</option>
            {(Object.keys(customerSexLabels) as CustomerSex[]).map((k) => (
              <option key={k} value={k}>
                {customerSexLabels[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          施設内番号（任意）
          <input
            aria-label="施設内番号"
            className={inputClass}
            value={localCode}
            onChange={(e) => setLocalCode(e.target.value)}
            placeholder="例：カルテ番号"
          />
        </label>
      </div>
      <p className="text-base leading-relaxed text-[var(--dim)]">
        同じお名前の方と区別するため、会員番号か生年月日のどちらかは必ず入力してください。
      </p>
      {shown && (
        <p role="alert" className="rounded-[var(--radius)] bg-[var(--alert-bg)] p-3 text-base font-bold text-[var(--alert)]">
          {shown}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy}
          className="min-h-12 rounded-[var(--radius)] bg-[var(--accent)] px-6 text-lg font-bold text-white disabled:opacity-60"
        >
          {busy ? "保存中…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="min-h-12 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-lg text-[var(--text)]"
          >
            やめる
          </button>
        )}
      </div>
    </form>
  );
}
