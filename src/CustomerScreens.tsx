// 顧客の一覧と、顧客1人の画面（基本情報＋これまでの観察）。
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, describeFirebaseError, type ObservationListItem } from "./api";
import { CustomerForm } from "./CustomerForm";
import { customerSexLabels, customerSubLabel, ageOn, type CustomerRecord } from "./customer";
import { capillaryFingerLabels, capillaryPatternByCode } from "./patterns";
import { formatDateTime } from "./ReportView";
import { LoadingState } from "./States";
import { TrendChart } from "./TrendChart";

function ErrorState({ message }: { message: string }) {
  return (
    <p role="alert" className="text-lg text-[var(--alert)]">
      {message}
    </p>
  );
}

type Go = (
  v:
    | { kind: "customers" }
    | { kind: "customer"; id: string }
    | { kind: "new"; customerId?: string }
    | { kind: "report"; id: string }
    | { kind: "compare"; beforeId: string; afterId: string },
) => void;

const cardClass =
  "rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-card)]";
const primaryButton =
  "min-h-12 rounded-[var(--radius)] bg-[var(--accent)] px-5 text-base font-bold text-white";
const secondaryButton =
  "min-h-12 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-5 text-base text-[var(--text)]";

/* ================= 顧客一覧 ================= */

export function CustomerListScreen({ go }: { go: Go }) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [registering, setRegistering] = useState(false);
  // 顧客の名前は、探したときだけ出す（画面をお客様と一緒に見ることがあるため、
  // 開いただけで他の方の名前が並ばないようにする）。全員を見たいときはボタンで出す。
  const [showAll, setShowAll] = useState(false);
  const listing = search.trim() !== "" || showAll;
  const list = useQuery({
    queryKey: ["customers", search],
    queryFn: () => api.listCustomers({ search }),
    enabled: listing,
  });
  const create = useMutation({
    mutationFn: (v: Parameters<typeof api.createCustomer>[0]) => api.createCustomer(v),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      go({ kind: "customer", id: res.id });
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--heading)]">顧客</h1>
        {!registering && (
          <button type="button" className={primaryButton} onClick={() => setRegistering(true)}>
            顧客を登録する
          </button>
        )}
      </div>

      {registering && (
        <section aria-label="顧客の登録" className={`${cardClass} p-5`}>
          <h2 className="mb-4 text-xl font-bold text-[var(--text)]">新しい顧客の登録</h2>
          <CustomerForm
            initialQuery={input}
            submitLabel="登録する"
            busy={create.isPending}
            error={create.error ? describeFirebaseError(create.error) : null}
            onSubmit={(v) => create.mutate(v)}
            onCancel={() => {
              create.reset();
              setRegistering(false);
            }}
          />
        </section>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(input.trim());
        }}
      >
        <input
          aria-label="顧客を探す"
          type="search"
          className="min-h-12 w-full rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-lg text-[var(--text)]"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="会員番号・お名前・ふりがなで検索"
        />
        <button type="submit" className={`${primaryButton} shrink-0`}>
          検索
        </button>
      </form>

      {!listing && (
        <div className={`${cardClass} flex flex-col gap-3 p-5`}>
          <p className="text-lg leading-relaxed text-[var(--text)]">
            会員番号・お名前・ふりがなで検索すると、該当する方だけを表示します。
          </p>
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="min-h-11 self-start rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base text-[var(--text)]"
          >
            全員を表示する
          </button>
        </div>
      )}
      {listing && list.isLoading && <LoadingState label="顧客を読み込み中…" />}
      {listing && list.error && <ErrorState message={describeFirebaseError(list.error)} />}
      {listing && list.data && list.data.customers.length === 0 && (
        <p className={`${cardClass} p-5 text-lg text-[var(--dim)]`}>
          {search ? "該当する顧客が見つかりません。" : "まだ顧客が登録されていません。"}
        </p>
      )}
      {listing && list.data && list.data.customers.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-base text-[var(--dim)]">{list.data.customers.length}人</p>
            <button
              type="button"
              onClick={() => {
                setShowAll(false);
                setSearch("");
                setInput("");
              }}
              className="min-h-11 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--surface)] px-4 text-base text-[var(--text)]"
            >
              表示を閉じる
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {list.data.customers.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => go({ kind: "customer", id: c.id })}
                  aria-label={`${c.displayName}（${customerSubLabel(c) || "補足なし"}）の画面を開く`}
                  className={`${cardClass} flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 p-4 text-left hover:bg-[var(--paper)]`}
                >
                  <span className="text-xl font-bold text-[var(--text)]">{c.displayName}</span>
                  {c.nameKana && <span className="text-base text-[var(--dim)]">{c.nameKana}</span>}
                  <span className="text-base text-[var(--text)]">
                    {customerSubLabel(c) || "会員番号・生年月日の登録なし"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ================= 顧客1人の画面 ================= */

function patternNames(codes: string[]): string {
  return codes
    .map((c) => capillaryPatternByCode[c]?.name)
    .filter((n): n is string => Boolean(n))
    .join("、");
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-48 shrink-0 text-base font-bold text-[var(--dim)]">{label}</dt>
      <dd className="text-lg text-[var(--text)]">{value}</dd>
    </div>
  );
}

function CustomerInfo({ customer }: { customer: CustomerRecord }) {
  const age = ageOn(customer.birthDate);
  return (
    <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
      <InfoRow label="ふりがな" value={customer.nameKana ?? "未登録"} />
      <InfoRow label="ルーツマイル会員番号" value={customer.memberNumber ?? "未登録"} />
      <InfoRow
        label="生年月日"
        value={
          customer.birthDate
            ? `${customer.birthDate.replace(/-/g, "/")}${age != null ? `（${age}歳）` : ""}`
            : "未登録"
        }
      />
      <InfoRow label="性別" value={customer.sex ? customerSexLabels[customer.sex] : "未登録"} />
      <InfoRow label="施設内番号" value={customer.localCode ?? "未登録"} />
    </dl>
  );
}

function HistoryRow({
  obs,
  onOpen,
  selected,
  onToggleCompare,
  compareDisabled,
}: {
  obs: ObservationListItem;
  onOpen: () => void;
  selected: boolean;
  onToggleCompare: () => void;
  /** すでに2件選んでいて、これ以上選べない。 */
  compareDisabled: boolean;
}) {
  const names = patternNames(obs.patternCodes);
  return (
    <li className={`${cardClass} flex overflow-hidden ${selected ? "border-2 border-[var(--accent)]" : ""}`}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${formatDateTime(obs.observedAt)} のレポートを開く`}
        className="flex min-w-0 flex-1 items-center gap-4 p-3 text-left hover:bg-[var(--paper)]"
      >
        {obs.primaryImageUrl ? (
          <img src={obs.primaryImageUrl} alt="" className="h-16 w-20 shrink-0 rounded object-cover" />
        ) : (
          <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded bg-[var(--paper)] text-sm text-[var(--dim)]">
            画像なし
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-lg font-bold text-[var(--text)]">
            {formatDateTime(obs.observedAt)}
          </span>
          <span className="text-base text-[var(--dim)]">
            {capillaryFingerLabels[obs.finger] ?? obs.finger}
            {names && `／形：${names}`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-base text-[var(--text)]">
            {obs.densityPerMm != null ? (
              <>
                <span className="text-2xl font-bold text-[var(--heading)]">{obs.densityPerMm}</span> 本/mm
              </>
            ) : (
              <span className="text-[var(--dim)]">本数の記録なし</span>
            )}
          </span>
          <span
            className={`rounded-full px-3 py-0.5 text-sm font-bold ${
              obs.status === "finalized"
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--paper)] text-[var(--text)]"
            }`}
          >
            {obs.status === "finalized" ? "確定済み" : "下書き"}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleCompare}
        disabled={compareDisabled && !selected}
        aria-pressed={selected}
        aria-label={`${formatDateTime(obs.observedAt)} を比較に選ぶ`}
        className={`w-24 shrink-0 border-l border-[var(--border)] text-base font-bold disabled:text-[var(--dim)] ${
          selected ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--accent-strong)]"
        }`}
      >
        {selected ? "選択中" : "比べる"}
      </button>
    </li>
  );
}

export function CustomerDetailScreen({ id, go }: { id: string; go: Go }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const detail = useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.getCustomer({ id }),
  });
  const update = useMutation({
    mutationFn: (v: Parameters<typeof api.createCustomer>[0]) => api.updateCustomer({ ...v, id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customer", id] });
      void queryClient.invalidateQueries({ queryKey: ["customers"] });
      void queryClient.invalidateQueries({ queryKey: ["observations"] });
      setEditing(false);
    },
  });

  if (detail.isLoading) return <LoadingState label="顧客を読み込み中…" />;
  if (detail.error) return <ErrorState message={describeFirebaseError(detail.error)} />;
  const customer = detail.data?.customer;
  if (!customer)
    return (
      <div className="flex flex-col gap-4">
        <ErrorState message="この顧客は見つかりませんでした。" />
        <button type="button" className={`${secondaryButton} self-start`} onClick={() => go({ kind: "customers" })}>
          顧客の一覧に戻る
        </button>
      </div>
    );
  const observations = detail.data?.observations ?? [];
  // 観察は新しい順に並んでいる。比較は古い方をビフォアにする。
  const compare = (a: ObservationListItem, b: ObservationListItem) => {
    const [before, after] = a.observedAt <= b.observedAt ? [a, b] : [b, a];
    go({ kind: "compare", beforeId: before.id, afterId: after.id });
  };
  const latest = observations[0];
  const previous = observations[1];
  const first = observations[observations.length - 1];
  const pickedObs = picked
    .map((pid) => observations.find((o) => o.id === pid))
    .filter((o): o is ObservationListItem => Boolean(o));
  const togglePick = (oid: string) =>
    setPicked((cur) => (cur.includes(oid) ? cur.filter((x) => x !== oid) : cur.length < 2 ? [...cur, oid] : cur));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondaryButton} onClick={() => go({ kind: "customers" })}>
          顧客の一覧に戻る
        </button>
      </div>

      <section aria-label="基本情報" className={`${cardClass} flex flex-col gap-4 p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[var(--heading)]">{customer.displayName} 様</h1>
          {!editing && (
            <button type="button" className={secondaryButton} onClick={() => setEditing(true)}>
              基本情報を編集
            </button>
          )}
        </div>
        {editing ? (
          <CustomerForm
            initial={customer}
            submitLabel="保存する"
            busy={update.isPending}
            error={update.error ? describeFirebaseError(update.error) : null}
            onSubmit={(v) => update.mutate(v)}
            onCancel={() => {
              update.reset();
              setEditing(false);
            }}
          />
        ) : (
          <CustomerInfo customer={customer} />
        )}
      </section>

      <section aria-label="本数の推移" className={`${cardClass} flex flex-col gap-3 p-5`}>
        <h2 className="text-xl font-bold text-[var(--heading)]">本数の推移</h2>
        <TrendChart
          rows={observations.map((o) => ({ id: o.id, observedAt: o.observedAt, value: o.densityPerMm }))}
          onOpen={(oid) => go({ kind: "report", id: oid })}
        />
      </section>

      <section aria-label="これまでの観察" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-[var(--heading)]">
            これまでの観察（{observations.length}回）
          </h2>
          <button
            type="button"
            className={primaryButton}
            onClick={() => go({ kind: "new", customerId: customer.id })}
          >
            この方の新しい観察
          </button>
        </div>
        {observations.length >= 2 && (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] bg-[var(--paper)] p-3">
            <span className="text-base font-bold text-[var(--text)]">ビフォーアフター</span>
            <button type="button" className={secondaryButton} onClick={() => compare(previous, latest)}>
              前回と最新
            </button>
            {observations.length >= 3 && (
              <button type="button" className={secondaryButton} onClick={() => compare(first, latest)}>
                初回と最新
              </button>
            )}
            <button
              type="button"
              className={primaryButton}
              disabled={pickedObs.length !== 2}
              onClick={() => pickedObs.length === 2 && compare(pickedObs[0], pickedObs[1])}
              style={pickedObs.length !== 2 ? { opacity: 0.5 } : undefined}
            >
              選んだ2回を比べる（{pickedObs.length}/2）
            </button>
          </div>
        )}
        {observations.length === 0 ? (
          <p className={`${cardClass} p-5 text-lg text-[var(--dim)]`}>まだ観察の記録がありません。</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {observations.map((obs) => (
              <HistoryRow
                key={obs.id}
                obs={obs}
                onOpen={() => go({ kind: "report", id: obs.id })}
                selected={picked.includes(obs.id)}
                onToggleCompare={() => togglePick(obs.id)}
                compareDisabled={picked.length >= 2}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
