// 読み込み中の共通表示。画面が真っ白にならないよう、
// ロゴと製品名、スピナーを出して「動いている」ことを示す。
import { LogoMark } from "./Logo";

export function LoadingState({
  label = "読み込んでいます…",
  compact = false,
}: {
  label?: string;
  /** 一覧の中など、行の中で使う小さい表示にする。 */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <p
        className="flex items-center gap-3 text-lg text-[var(--dim)]"
        role="status"
        aria-live="polite"
      >
        <span className="loading-spinner loading-spinner-sm" aria-hidden="true" />
        {label}
      </p>
    );
  }
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 py-16 text-center"
      role="status"
      aria-live="polite"
    >
      <LogoMark size={56} />
      <p className="text-lg font-bold tracking-wide text-[var(--heading)]">
        毛細血管 観察・記録システム
      </p>
      <span className="loading-spinner" aria-hidden="true" />
      <p className="text-base text-[var(--dim)]">{label}</p>
    </div>
  );
}
