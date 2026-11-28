// 「本数を数える」の入口と結果表示（一般検査・研究用で共用）。
// 押すと全画面の計測画面（DensityCounter）が開く。
import { useEffect, useRef, useState } from "react";
import { DensityCounter } from "./DensityCounter";
import type { DensityMeasurement } from "./densityCount";

export function DensityCountField({
  imageUrl,
  value,
  onChange,
  onClear,
}: {
  /** 数える対象の画像（代表画像）。無ければボタンを押せない。 */
  imageUrl: string | null;
  value: DensityMeasurement | null;
  onChange: (m: DensityMeasurement) => void;
  /** 代表画像が変わって記録が使えなくなったときに呼ぶ（記録を消す）。 */
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  // 数えたあとで代表画像が変わったら、その記録は別の画像のものなので使わない。
  const countedFor = useRef<string | null>(null);
  const stale = Boolean(value && countedFor.current && countedFor.current !== imageUrl);
  useEffect(() => {
    if (!value) countedFor.current = null;
  }, [value]);
  useEffect(() => {
    // 別の画像で数えた本数を、今の画像の本数として保存しない。
    if (stale) onClear();
    // onClear は呼び出し側で毎回作られるため依存に入れない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!imageUrl}
          onClick={() => setOpen(true)}
          className="min-h-12 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)] disabled:border-[var(--border)] disabled:text-[var(--dim)]"
        >
          {value ? "数え直す" : "画像の上で本数を数える"}
        </button>
        {value && !stale && (
          <p className="text-base text-[var(--text)]" aria-live="polite">
            <span className="text-2xl font-bold text-[var(--heading)]">{value.densityPerMm}</span> 本/mm
            <span className="ml-2 text-[var(--dim)]">
              （{value.count}本／{value.lengthMm.toFixed(2)}mm）
            </span>
          </p>
        )}
      </div>
      {!imageUrl && (
        <p className="text-base text-[var(--dim)]">画像を撮影または取り込むと数えられます。</p>
      )}
      {stale && (
        <p className="text-base font-medium text-[var(--alert)]">
          代表画像が変わりました。今の画像で数え直してください。
        </p>
      )}
      {open && imageUrl && (
        <DensityCounter
          imageUrl={imageUrl}
          initial={stale ? null : value}
          onClose={() => setOpen(false)}
          onDone={(m) => {
            countedFor.current = imageUrl;
            onChange(m);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
