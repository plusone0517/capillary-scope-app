// ビフォアアフター比較画面：同じ対象者の2件の観察を、左＝ビフォア（古い方）、
// 右＝アフター（新しい方）で固定して並べる。代表画像と動画、その下に数値の
// 比較表（密度と血流速度は差分を大きく表示）。撮影条件が違う場合は注意を出す。
// 数値の変化は事実の表示に留め、良し悪しの判定文は書かない。

import { useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { formatDateTime, isDummySubject } from "./ReportView";
import {
  colorLabel,
  conditionWarnings,
  fingerLabel,
  flagTextOf,
  flowLabel,
  formatDensity,
  formatSigned,
  formatSpeed,
  patternDiff,
  primaryImageOf,
  type Observation,
} from "./compare";
import {
  interventionLine,
  interventionTimingLabels,
  interventionsBetween,
} from "./trial";

function MediaSide({
  obs,
  label,
  videoRef,
}: {
  obs: Observation;
  label: string;
  videoRef: RefObject<HTMLVideoElement>;
}) {
  const img = primaryImageOf(obs);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--accent)] px-3 py-0.5 text-base font-bold text-white">
          {label}
        </span>
        <span className="text-base text-[var(--dim)]">{formatDateTime(obs.observedAt)}</span>
      </p>
      {img ? (
        <img
          src={img.url}
          alt={`${label}の代表画像`}
          className="aspect-[4/3] w-full rounded-[var(--radius)] border border-[var(--border)] object-cover"
        />
      ) : (
        <span className="flex aspect-[4/3] w-full items-center justify-center rounded-[var(--radius)] bg-[var(--paper)] text-base text-[var(--dim)]">
          画像なし
        </span>
      )}
      {obs.video ? (
        <video
          ref={videoRef}
          src={obs.video.url}
          controls
          playsInline
          aria-label={`${label}の観察動画`}
          className="aspect-video w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)]"
        />
      ) : (
        <p className="text-base text-[var(--dim)]">動画は登録されていません。</p>
      )}
    </div>
  );
}

function DiffCard({
  title,
  beforeText,
  afterText,
  diffText,
}: {
  title: string;
  beforeText: string;
  afterText: string;
  diffText: string | null;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
      <p className="text-base font-bold text-[var(--dim)]">{title}</p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-2xl font-bold tracking-wide text-[var(--heading)]">
        <span>{beforeText}</span>
        <span aria-hidden="true">→</span>
        <span>{afterText}</span>
        {diffText && (
          <span className="text-xl text-[var(--accent-strong)]">（{diffText}）</span>
        )}
      </p>
    </div>
  );
}

function PatternChips({ title, names }: { title: string; names: string[] }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-base font-bold text-[var(--text)]">{title}</p>
      {names.length > 0 ? (
        <p className="flex flex-wrap gap-2">
          {names.map((name) => (
            <span
              key={name}
              className="rounded-full border border-[var(--border)] bg-[var(--paper)] px-3 py-0.5 text-base text-[var(--text)]"
            >
              {name}
            </span>
          ))}
        </p>
      ) : (
        <p className="text-base text-[var(--dim)]">なし</p>
      )}
    </div>
  );
}

export function CompareScreen({
  beforeId,
  afterId,
  onBackToList,
  onOpenReport,
  trialMode = false,
}: {
  beforeId: string;
  afterId: string;
  onBackToList: () => void;
  onOpenReport: (id: string) => void;
  /** 試験モードONのときだけ「この間に実施したこと」を表示する。 */
  trialMode?: boolean;
}) {
  const qBefore = useQuery({
    queryKey: ["observation", beforeId],
    queryFn: () => api.getObservation({ id: beforeId }),
  });
  const qAfter = useQuery({
    queryKey: ["observation", afterId],
    queryFn: () => api.getObservation({ id: afterId }),
  });
  const beforeVideoRef = useRef<HTMLVideoElement | null>(null);
  const afterVideoRef = useRef<HTMLVideoElement | null>(null);

  const o1 = qBefore.data?.observation ?? null;
  const o2 = qAfter.data?.observation ?? null;

  if (qBefore.isPending || qAfter.isPending)
    return <p className="text-lg text-[var(--dim)]">読み込んでいます…</p>;
  if (qBefore.error || qAfter.error || !o1 || !o2)
    return (
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-lg text-[var(--alert)]">
          比較する観察を読み込めませんでした。
        </p>
        <button
          type="button"
          onClick={onBackToList}
          className="min-h-14 self-start rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          一覧に戻る
        </button>
      </div>
    );

  // 左＝古い方（ビフォア）、右＝新しい方（アフター）で固定する。
  const [before, after] =
    o1.observedAt <= o2.observedAt ? [o1, o2] : [o2, o1];

  const warnings = conditionWarnings(before, after);
  const sameFinger = before.finger === after.finger;
  const pd = patternDiff(before, after);
  const bothVideos = Boolean(before.video && after.video);
  const betweenItems = trialMode ? interventionsBetween(before, after) : [];
  const trialName = after.trialName ?? before.trialName;
  const trialGroup = after.trialGroup ?? before.trialGroup;

  const densityDiff =
    before.densityPerMm != null && after.densityPerMm != null
      ? `${formatSigned(after.densityPerMm - before.densityPerMm, 1)} 本`
      : null;
  const speedDiff =
    before.flowSpeedMmPerSec != null && after.flowSpeedMmPerSec != null
      ? `${formatSigned(after.flowSpeedMmPerSec - before.flowSpeedMmPerSec, 2)} mm/秒`
      : null;

  const rows: { label: string; before: string; after: string }[] = [
    { label: "観察日", before: formatDateTime(before.observedAt), after: formatDateTime(after.observedAt) },
    { label: "撮影した指", before: fingerLabel(before.finger), after: fingerLabel(after.finger) },
    {
      label: "室温",
      before: before.roomTempC != null ? `${before.roomTempC}℃` : "記録なし",
      after: after.roomTempC != null ? `${after.roomTempC}℃` : "記録なし",
    },
    {
      label: "安静時間",
      before: before.restMinutes != null ? `${before.restMinutes}分` : "記録なし",
      after: after.restMinutes != null ? `${after.restMinutes}分` : "記録なし",
    },
    { label: "密度", before: formatDensity(before.densityPerMm), after: formatDensity(after.densityPerMm) },
    { label: "血流速度（試作・参考値）", before: formatSpeed(before), after: formatSpeed(after) },
    { label: "流れの印象", before: flowLabel(before.flow), after: flowLabel(after.flow) },
    { label: "色の印象", before: colorLabel(before.color), after: colorLabel(after.color) },
    {
      label: "形のパターン",
      before:
        before.patterns.length > 0
          ? [...pd.removed, ...pd.kept].join("、")
          : "なし",
      after:
        after.patterns.length > 0
          ? [...pd.kept, ...pd.added].join("、")
          : "なし",
    },
    { label: "臨床フラグ", before: flagTextOf(before), after: flagTextOf(after) },
  ];

  const playBoth = () => {
    for (const v of [beforeVideoRef.current, afterVideoRef.current]) {
      if (v) {
        v.currentTime = 0;
        void v.play().catch(() => {});
      }
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBackToList}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          一覧に戻る
        </button>
        <button
          type="button"
          onClick={() => onOpenReport(after.id)}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          アフターのレポートを見る
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-wide text-[var(--heading)]">ビフォアアフター比較</h1>
        <p className="mt-1 text-lg text-[var(--text)]">
          対象：{after.subjectName}
          {after.subjectId && (
            <span className="ml-2 text-base text-[var(--dim)]">ID：{after.subjectId}</span>
          )}
          {isDummySubject(after.subjectName) && (
            <span className="ml-2 rounded-full border border-[var(--accent)] bg-[var(--surface)] px-3 py-0.5 text-sm font-bold text-[var(--accent-strong)]">
              ダミー
            </span>
          )}
        </p>
      </div>

      {warnings.length > 0 ? (
        <div
          role="alert"
          className="rounded-[var(--radius)] border-2 border-[var(--alert)] bg-[var(--alert-bg)] p-4"
        >
          <p className="text-lg font-bold text-[var(--alert)]">
            撮影条件が異なるため、数値の単純比較はできません
          </p>
          <ul className="mt-1 list-disc pl-5">
            {warnings.map((w) => (
              <li key={w} className="text-base text-[var(--text)]">
                {w}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] text-lg text-[var(--text)]">
          {sameFinger
            ? `同じ指（${fingerLabel(after.finger)}）同士の比較です。撮影条件もそろっています。`
            : "撮影条件はそろっています。"}
        </p>
      )}

      {bothVideos && (
        <button
          type="button"
          onClick={playBoth}
          className="min-h-14 self-start rounded-[var(--radius)] bg-[var(--accent)] px-6 text-lg font-bold text-white"
        >
          両方の動画を同時に再生する
        </button>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <MediaSide obs={before} label="ビフォア（前回）" videoRef={beforeVideoRef} />
        <MediaSide obs={after} label="アフター（今回）" videoRef={afterVideoRef} />
      </div>

      {trialMode && (
        <section
          aria-label="この間に実施したこと"
          className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]"
        >
          <h2 className="text-xl font-bold text-[var(--text)]">この間に実施したこと</h2>
          {(trialName || trialGroup) && (
            <p className="text-base text-[var(--dim)]">
              {trialName && <>試験名：{trialName}</>}
              {trialName && trialGroup && "　"}
              {trialGroup && <>群：{trialGroup}</>}
            </p>
          )}
          {betweenItems.length > 0 ? (
            <ol className="flex flex-col gap-2">
              {betweenItems.map((item, i) => (
                <li key={i} className="flex flex-col gap-0.5">
                  <span className="text-lg text-[var(--text)]">
                    {interventionLine(item.iv)}
                  </span>
                  <span className="text-base text-[var(--dim)]">
                    タイミング：
                    {interventionTimingLabels[item.iv.timing] ?? item.iv.timing}
                    （{item.side === "before" ? "ビフォア" : "アフター"}の観察に記録）
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-base text-[var(--dim)]">
              この2回の観察の間に実施したことの記録はありません。
            </p>
          )}
          <p className="text-base text-[var(--dim)]">
            実施内容は記録として表示しています。数値の変化との関係は、この記録だけでは判断できません。
          </p>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <DiffCard
          title="密度"
          beforeText={formatDensity(before.densityPerMm)}
          afterText={formatDensity(after.densityPerMm)}
          diffText={densityDiff}
        />
        <DiffCard
          title="血流速度（試作・参考値）"
          beforeText={formatSpeed(before)}
          afterText={formatSpeed(after)}
          diffText={speedDiff}
        />
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[var(--paper)]">
              <th scope="col" className="px-3 py-2 text-left text-base font-bold text-[var(--text)]">
                項目
              </th>
              <th scope="col" className="px-3 py-2 text-left text-base font-bold text-[var(--text)]">
                ビフォア
              </th>
              <th scope="col" className="px-3 py-2 text-left text-base font-bold text-[var(--text)]">
                アフター
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-[var(--border)]">
                <th
                  scope="row"
                  className="px-3 py-2 text-left align-top text-base font-bold text-[var(--text)]"
                >
                  {row.label}
                </th>
                <td className="px-3 py-2 align-top text-base text-[var(--text)]">{row.before}</td>
                <td className="px-3 py-2 align-top text-base text-[var(--text)]">{row.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-label="形のパターンの変化" className="flex flex-col gap-3">
        <h2 className="text-xl font-bold text-[var(--text)]">形のパターンの変化</h2>
        <PatternChips title="アフターで新たに見られた形" names={pd.added} />
        <PatternChips title="ビフォアのみで見られた形" names={pd.removed} />
        <PatternChips title="両方で見られた形" names={pd.kept} />
      </section>
    </div>
  );
}
