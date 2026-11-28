// 観察の対象になる顧客を選ぶ欄（一般検査・研究用で共用）。
// 氏名の手入力ではなく、登録済みの顧客から選ぶ（または新しく登録する）ことで、
// 同姓同名の別人が1人の記録に混ざらないようにする。
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeFirebaseError } from "./api";
import { CustomerForm } from "./CustomerForm";
import { customerSubLabel, type CustomerRecord } from "./customer";

export function CustomerPicker({
  value,
  onChange,
  className = "",
}: {
  value: CustomerRecord | null;
  onChange: (next: CustomerRecord | null) => void;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [registering, setRegistering] = useState(false);
  // 顧客の名前は、文字を入れて探したときだけ出す（開いただけで他の方の名前が並ばないように）。
  const searching = search.trim() !== "";
  const list = useQuery({
    queryKey: ["customers", search],
    queryFn: () => api.listCustomers({ search }),
    enabled: !value && searching,
  });
  const create = useMutation({
    mutationFn: async (input: Parameters<typeof api.createCustomer>[0]) => {
      const { id } = await api.createCustomer(input);
      const { customer } = await api.getCustomer({ id });
      return customer;
    },
    onSuccess: (customer) => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      setRegistering(false);
      setSearch("");
      if (customer) onChange(customer);
    },
  });

  if (value) {
    const sub = customerSubLabel(value);
    return (
      <section aria-label="顧客" className={`flex flex-col gap-2 ${className}`}>
        <h2 className="text-base font-medium text-[var(--text)]">顧客</h2>
        <div className="flex items-center gap-3 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--accent-bg)] p-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-xl font-bold text-[var(--text)]">
              {value.displayName} 様
            </span>
            {sub && <span className="text-base text-[var(--dim)]">{sub}</span>}
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="min-h-11 shrink-0 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base text-[var(--text)]"
          >
            変更
          </button>
        </div>
      </section>
    );
  }

  const results = searching ? (list.data?.customers ?? []) : [];
  const shown = results.slice(0, 6);

  return (
    <section aria-label="顧客" className={`flex flex-col gap-2 ${className}`}>
      <label className="flex flex-col gap-1 text-base font-medium text-[var(--text)]">
        顧客を選ぶ（必須）
        <input
          aria-label="顧客を探す"
          type="search"
          className="min-h-14 w-full rounded-[var(--radius)] border-2 border-[var(--border-strong)] bg-[var(--surface)] px-4 text-xl text-[var(--text)]"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setRegistering(false);
          }}
          placeholder="会員番号・お名前・ふりがな"
          autoComplete="off"
        />
      </label>
      {!registering && (
        <>
          {!searching && (
            <p className="text-base text-[var(--dim)]">
              文字を入れると、該当する方が出ます。
            </p>
          )}
          {searching && list.isLoading && (
            <p className="text-base text-[var(--dim)]">探しています…</p>
          )}
          {shown.length > 0 && (
            <ul className="flex flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
              {shown.map((c) => (
                <li key={c.id} className="border-b border-[var(--border)] last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onChange(c)}
                    aria-label={`${c.displayName}（${customerSubLabel(c) || "補足なし"}）を選ぶ`}
                    className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-[var(--paper)]"
                  >
                    <span className="text-lg font-bold text-[var(--text)]">{c.displayName}</span>
                    <span className="text-base text-[var(--dim)]">
                      {customerSubLabel(c) || "会員番号・生年月日の登録なし"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {results.length > shown.length && (
            <p className="text-base text-[var(--dim)]">
              ほかに{results.length - shown.length}人います。文字を足して絞り込んでください。
            </p>
          )}
          {searching && list.data && results.length === 0 && (
            <p className="text-base text-[var(--dim)]">該当する顧客が見つかりません。</p>
          )}
          <button
            type="button"
            onClick={() => setRegistering(true)}
            className="min-h-12 self-start rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-4 text-base font-bold text-[var(--accent-strong)]"
          >
            新しい顧客を登録する
          </button>
        </>
      )}
      {registering && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
          <h3 className="mb-3 text-lg font-bold text-[var(--text)]">新しい顧客の登録</h3>
          <CustomerForm
            initialQuery={search}
            submitLabel="登録して選ぶ"
            busy={create.isPending}
            error={create.error ? describeFirebaseError(create.error) : null}
            onSubmit={(input) => create.mutate(input)}
            onCancel={() => {
              create.reset();
              setRegistering(false);
            }}
          />
        </div>
      )}
    </section>
  );
}

/**
 * 顧客の画面などから「この方の新しい観察」で来たときに、その顧客を最初から選んだ状態にする。
 * 読み込めたら一度だけ onLoaded を呼ぶ。
 */
export function usePreselectedCustomer(
  customerId: string | undefined,
  onLoaded: (customer: CustomerRecord) => void,
): void {
  const done = useRef(false);
  const preset = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => api.getCustomer({ id: customerId as string }),
    enabled: Boolean(customerId),
  });
  const customer = preset.data?.customer ?? null;
  useEffect(() => {
    if (customer && !done.current) {
      done.current = true;
      onLoaded(customer);
    }
    // onLoaded は呼び出し側で毎回作られるため依存に入れない（一度だけ呼ぶ）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer]);
}
