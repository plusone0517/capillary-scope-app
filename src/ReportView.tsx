// レポート表示。どの回・どの人のレポートでも、項目と並びを同じにする（標準の並び）：
//   受診案内（該当するときだけ、先頭）→ ①今回の観察画像（数えた位置つき）→ ②計測値と所見
//   → ③本数の推移 → ④前回との比較 → ⑤一致した形 → ⑥所見のまとめ → ⑦アドバイス
//   → ⑧次回について → ⑨撮影の条件
// 記録の無い項目は、その項目だけを出さない（並びは変えない）。①②⑤⑨は必ず出す。
// 数値の変化は事実の表示に留め、良し悪しの判定文は出さない。
// 印刷時は #report-print だけがA4レイアウトで出る（theme.css の @media print）。

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { ObservationRecord } from "./api";
import {
capillaryChangeLabels,
capillaryClinicalFlagLabels,
capillaryColorLabels,
capillaryFingerLabels,
capillaryFlowLabels,
capillaryPatternByCode,
patternNumberByCode,
type ClinicalFlagKey,
} from "./patterns";
import { CountedImage } from "./CountedImage";
import { TrendChart } from "./TrendChart";
import type { TrendInput } from "./trend";
import { PatternDiagram } from "./PatternDiagram";
import { LogoMark } from "./Logo";
import {
colorLabel,
conditionSummaryText,
conditionWarnings,
fingerLabel,
flagTextOf,
flowLabel,
formatDensity,
formatSigned,
formatSpeed,
patternBaseline,
patternDiff,
patternNamesOf,
primaryImageOf,
} from "./compare";
import {
interventionLine,
interventionTimingLabels,
interventionsBetween,
} from "./trial";

export type ObservationDetail = ObservationRecord | null;
type Observation = ObservationRecord;

const DISCLAIMER =
  "このレポートは観察の記録と生活アドバイスです。診断は症状と検査を合わせて医療機関で行います。";

/** 種データのダミーレポートかどうか（対象者名に「（ダミー）」を含む）。 */
/**
 * レポートを印刷する。文字の大きさは2通り：
 * - large（既定）：お渡し用。文字を大きくして読みやすくする（複数ページになる）。
 * - compact：控え用。文字を小さくして枚数を少なくする。
 * 切り替えは html の data-print 属性で行い、大きさそのものは theme.css の @media print にある。
 */
export function printReport(size: "large" | "compact" = "large"): void {
  document.documentElement.dataset.print = size;
  window.print();
}

/** 本数（密度）の、レポートでの呼び方。 */
const DENSITY_LABEL = "本数（1mmあたり）";

const CALIBRATION_LABELS: Record<string, string> = {
  auto_scale: "自動で読み取り",
  manual: "画像の上で合わせた値",
  saved: "前に合わせた値",
};

export function isDummySubject(subjectName: string): boolean {
  return subjectName.includes("（ダミー）");
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 日付だけ（比較の図の説明など、短く出したいところ用）。 */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function activeFlags(obs: Observation): ClinicalFlagKey[] {
  const flags: ClinicalFlagKey[] = [];
  if (obs.flagGiant) flags.push("giant");
  if (obs.flagHemorrhage) flags.push("hemorrhage");
  if (obs.flagLoss) flags.push("loss");
  if (obs.flagRamified) flags.push("ramified");
  return flags;
}

export function useQrDataUrl(id: string, token: string | null): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!token) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    const payload = JSON.stringify({ app: "capillary-report", v: 1, id, token });
    QRCode.toDataURL(payload, { width: 480, margin: 2 })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, token]);
  return dataUrl;
}

export function ReportBody({
  obs,
  prev,
  qrDataUrl,
  trialMode = false,
  history,
}: {
  obs: Observation;
  /** 同じ顧客の、この回までの本数の記録（推移グラフ用）。2回分以上あるときだけグラフを出す。 */
  history?: TrendInput[];
  /** 同じ対象者の直前の観察（ビフォアアフター比較欄用）。なければ欄ごと出さない。 */
  prev?: Observation | null;
  qrDataUrl?: string | null;
  /** 研究用モードのときだけ、試験名・群・実施内容を表示する。 */
  trialMode?: boolean;
}) {
  const flags = activeFlags(obs);
  const primary = obs.images.find((i) => i.isPrimary) ?? obs.images[0];
  const others = obs.images.filter((i) => i !== primary);

  // 前回との比較（ビフォアアフター）欄の材料。prev がなければ欄ごと出さない。
  const prevWarnings = prev ? conditionWarnings(prev, obs) : [];
  const prevPd = prev ? patternDiff(prev, obs) : null;
  const prevPrimary = prev ? primaryImageOf(prev) : null;
  const compareRows: { label: string; value: string }[] = [];
  if (prev && prevPd) {
    compareRows.push({
      label: DENSITY_LABEL,
      value:
        prev.densityPerMm != null && obs.densityPerMm != null
          ? `${formatDensity(prev.densityPerMm)} → ${formatDensity(obs.densityPerMm)}（${formatSigned(obs.densityPerMm - prev.densityPerMm, 1)} 本）`
          : `${formatDensity(prev.densityPerMm)} → ${formatDensity(obs.densityPerMm)}`,
    });
    compareRows.push({
      label: "血流速度（試作・参考値）",
      value:
        prev.flowSpeedMmPerSec != null && obs.flowSpeedMmPerSec != null
          ? `${formatSpeed(prev)} → ${formatSpeed(obs)}（${formatSigned(obs.flowSpeedMmPerSec - prev.flowSpeedMmPerSec, 2)} mm/秒）`
          : `${formatSpeed(prev)} → ${formatSpeed(obs)}`,
    });
    compareRows.push({
      label: "流れの印象",
      value: `${flowLabel(prev.flow)} → ${flowLabel(obs.flow)}`,
    });
    compareRows.push({
      label: "色の印象",
      value: `${colorLabel(prev.color)} → ${colorLabel(obs.color)}`,
    });
    // 形の比較は、両回に形の記録があるときだけ増減として表示する。
    // 片方に記録がない回との差を「新たに見られた形」と表示しない。
    const baseline = patternBaseline(prev, obs);
    const shapeParts: string[] = [];
    if (baseline === "both") {
      if (prevPd.added.length > 0)
        shapeParts.push(`新たに見られた形：${prevPd.added.join("、")}`);
      if (prevPd.removed.length > 0)
        shapeParts.push(`前回のみ見られた形：${prevPd.removed.join("、")}`);
    }
    compareRows.push({
      label: "形の変化",
      value:
        baseline === "before_missing"
          ? `今回の形：${patternNamesOf(obs).join("、")}（前回は形の記録がないため、今回を基準として記録しました）`
          : baseline === "after_missing"
            ? `前回の形：${patternNamesOf(prev).join("、")}（今回は形の記録がありません）`
            : baseline === "none"
              ? "形の記録がありません"
              : shapeParts.length > 0
                ? shapeParts.join("／")
                : "前回と同じ形でした",
    });
    compareRows.push({
      label: "臨床フラグ",
      value: `${flagTextOf(prev)} → ${flagTextOf(obs)}`,
    });
    if (trialMode) {
      const between = interventionsBetween(prev, obs);
      compareRows.push({
        label: "この間に実施したこと",
        value:
          between.length > 0
            ? between.map((item) => interventionLine(item.iv)).join("／")
            : "記録なし",
      });
    }
  }

  // ②計測値と所見：数値は大きく、印象は一覧で。
  const measurement =
    obs.densityMeasurement && obs.densityMeasurement.densityPerMm === obs.densityPerMm
      ? obs.densityMeasurement
      : null;
  const impressions: { label: string; value: string }[] = [];
  if (obs.flow)
    impressions.push({ label: "流れの印象", value: capillaryFlowLabels[obs.flow] ?? obs.flow });
  if (obs.color)
    impressions.push({ label: "色の印象", value: capillaryColorLabels[obs.color] ?? obs.color });
  if (obs.changeVsPrev)
    impressions.push({
      label: "前回比較",
      value: capillaryChangeLabels[obs.changeVsPrev] ?? obs.changeVsPrev,
    });

  // ③本数の推移：本数の記録が2回分以上あるときだけ出す。
  const trendRows = (history ?? []).filter((r) => r.value != null);
  const showTrend = trendRows.length >= 2;

  // ⑨撮影の条件：比べるときの前提になる記録。
  const conditions: { label: string; value: string }[] = [
    { label: "撮影した指", value: capillaryFingerLabels[obs.finger] ?? obs.finger },
  ];
  if (obs.roomTempC != null) conditions.push({ label: "室温", value: `${obs.roomTempC}℃` });
  if (obs.restMinutes != null)
    conditions.push({ label: "安静時間", value: `${obs.restMinutes}分` });
  conditions.push({
    label: "撮影前の制限の確認",
    value: obs.restrictionsOk ? "確認済み" : "未確認",
  });
  if (measurement)
    conditions.push({
      label: "目盛り",
      value: `${CALIBRATION_LABELS[measurement.calibrationSource ?? "manual"]}（${measurement.umPerPx.toFixed(2)} μm/px）`,
    });
  else if (obs.calibrationUmPerPx != null)
    conditions.push({ label: "校正値", value: `${obs.calibrationUmPerPx} μm/px` });
  if (trialMode && obs.trialName)
    conditions.push({ label: "試験名", value: obs.trialName });
  if (trialMode && obs.trialGroup)
    conditions.push({ label: "群", value: obs.trialGroup });

  return (
    <div id="report-print" className="bg-[var(--surface)]">
      <div className="bg-[var(--paper)] px-5 py-4 sm:px-7">
        <div className="r-head flex items-start gap-3">
          <LogoMark size={46} className="mt-1 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="r-title">毛細血管観察レポート</h1>
            {/* 項目の途中で折り返さないよう、項目ごとにまとめる。 */}
            <p className="r-meta mt-1 flex flex-wrap gap-x-5">
              <span>観察日：{formatDateTime(obs.observedAt)}</span>
              <span>
                対象：{obs.subjectName} 様{obs.subjectId ? `（ID：${obs.subjectId}）` : ""}
              </span>
              {obs.customer?.memberNumber && <span>会員番号：{obs.customer.memberNumber}</span>}
            </p>
          </div>
          <p className="r-src r-issuer shrink-0 pt-2 text-right">
            毛細血管 観察・記録システム
            <br />
            メディプロ医薬
          </p>
        </div>
        {isDummySubject(obs.subjectName) && (
          <p className="r-src mt-1">
            ※
            これは表示確認用のダミーレポートです。対象者・所見・観察画像はすべて実在しないサンプルで、観察画像は実写ではありません。
          </p>
        )}
      </div>

      <div className="px-5 py-4 sm:px-7">
        {flags.length > 0 && (
          <div
            role="alert"
            className="mb-5 rounded-[var(--radius)] border-2 border-[var(--alert)] bg-[var(--alert-bg)] p-4"
          >
            <p className="text-xl font-bold text-[var(--alert)]">
              医療機関への受診をおすすめします
            </p>
            <p className="r-small mt-1">
              今回の観察で、次の項目が確認されました：
              {flags.map((f) => capillaryClinicalFlagLabels[f]).join("、")}。
              {obs.referralGiven
                ? "受診案内は行いました。"
                : "まだ受診案内を行っていない場合は、このレポートをお渡しする際にあわせてご案内ください。"}
            </p>
          </div>
        )}

        <h2 className="r-sec" style={{ marginTop: 0 }}>
          今回の観察画像
        </h2>
        {primary ? (
          <div className="flex flex-col gap-3">
            <CountedImage src={primary.url} alt="代表の観察画像" measurement={measurement} />
            {measurement && (
              <p className="r-small">
                番号の点：白い線（{measurement.lengthMm.toFixed(2)} mm）の範囲で数えた先端
              </p>
            )}
            {others.length > 0 && (
              <div className="no-print grid grid-cols-2 gap-3 sm:grid-cols-4">
                {others.map((img, i) => (
                  <img
                    key={img.id}
                    src={img.url}
                    alt={`観察画像 ${i + 2}`}
                    className="aspect-[4/3] w-full rounded-[var(--radius)] object-cover"
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="r-body">画像は登録されていません。</p>
        )}

        {obs.video && (
          <div className="no-print">
            <h2 className="r-sec">今回の観察動画</h2>
            <video
              src={obs.video.url}
              controls
              playsInline
              aria-label="観察動画"
              className="aspect-video w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)]"
            />
            {obs.video.durationSec != null && (
              <p className="r-small mt-1">長さ：約{obs.video.durationSec.toFixed(0)}秒</p>
            )}
          </div>
        )}

        <h2 className="r-sec">計測値と所見</h2>
        <div className={`r-keep grid gap-3 ${obs.flowSpeedPxPerSec != null ? "sm:grid-cols-2" : ""}`}>
          <div className="r-card">
            <p className="r-small font-bold">{DENSITY_LABEL}</p>
            {obs.densityPerMm != null ? (
              <p>
                <span className="r-big">{obs.densityPerMm}</span>
                <span className="r-num"> 本/mm</span>
              </p>
            ) : (
              <p className="r-small">記録なし</p>
            )}
            {measurement && (
              <p className="r-small">
                数えた本数 {measurement.count}本／範囲 {measurement.lengthMm.toFixed(2)} mm
              </p>
            )}
            {prev && prev.densityPerMm != null && obs.densityPerMm != null && (
              <p className="r-small">
                前回 {prev.densityPerMm} 本/mm（{formatSigned(obs.densityPerMm - prev.densityPerMm, 1)} 本）
              </p>
            )}
          </div>
          {obs.flowSpeedPxPerSec != null && (
            <div className="r-card">
              <p className="r-small font-bold">血流速度（試作・参考値）</p>
              {obs.flowSpeedMmPerSec != null ? (
                <p>
                  <span className="r-big">{obs.flowSpeedMmPerSec.toFixed(2)}</span>
                  <span className="r-num"> mm/秒</span>
                </p>
              ) : (
                <p>
                  <span className="r-big">{obs.flowSpeedPxPerSec.toFixed(1)}</span>
                  <span className="r-num"> ピクセル/秒</span>
                </p>
              )}
              {prev && prev.flowSpeedMmPerSec != null && obs.flowSpeedMmPerSec != null && (
                <p className="r-small">
                  前回 {prev.flowSpeedMmPerSec.toFixed(2)} mm/秒（
                  {formatSigned(obs.flowSpeedMmPerSec - prev.flowSpeedMmPerSec, 2)} mm/秒）
                </p>
              )}
            </div>
          )}
        </div>
        {impressions.length > 0 && (
          <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {impressions.map((f) => (
              <div key={f.label} className="flex items-baseline gap-2">
                <dt className="r-small shrink-0 font-bold">{f.label}：</dt>
                <dd className="r-small">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {flags.length > 0 ? (
          <p className="r-small mt-2 font-bold text-[var(--alert)]">
            臨床フラグ：{flags.map((f) => capillaryClinicalFlagLabels[f]).join("、")}
          </p>
        ) : (
          <p className="r-small mt-2">臨床フラグ：なし</p>
        )}

        {showTrend && (
          <div className="r-keep">
            <h2 className="r-sec">本数の推移</h2>
            <TrendChart rows={trendRows} highlightId={obs.id} latestLabel="今回" large />
          </div>
        )}

        {prev && (
          <>
            <h2 className="r-sec">前回との比較（ビフォアアフター）</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { o: prev, img: prevPrimary, label: "ビフォア（前回）" },
                { o: obs, img: primary ?? null, label: "アフター（今回）" },
              ].map((side) => (
                <figure key={side.label} className="flex min-w-0 flex-col gap-1">
                  {side.img ? (
                    <img
                      src={side.img.url}
                      alt={`${side.label}の代表画像`}
                      className="r-compare-img aspect-[4/3] w-full rounded-[var(--radius)] object-cover"
                    />
                  ) : (
                    <span className="flex aspect-[4/3] w-full items-center justify-center rounded-[var(--radius)] bg-[var(--paper)] text-sm text-[var(--dim)]">
                      画像なし
                    </span>
                  )}
                  <figcaption className="r-small">
                    {side.label}：{formatDate(side.o.observedAt)}
                  </figcaption>
                </figure>
              ))}
            </div>
            {prevWarnings.length > 0 ? (
              <p className="r-small mt-2 font-bold text-[var(--alert)]">
                撮影条件が前回と異なるため、数値の単純比較はできません。{prevWarnings.join(" ")}
              </p>
            ) : (
              <p className="r-small mt-2">
                {prev ? conditionSummaryText(prev, obs) : null}
              </p>
            )}
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {compareRows.map((row) => (
                <div key={row.label} className="flex items-baseline gap-2">
                  <dt className="r-small shrink-0 font-bold">{row.label}：</dt>
                  <dd
                    className={
                      row.label === DENSITY_LABEL || row.label.startsWith("血流速度")
                        ? "r-num"
                        : "r-small"
                    }
                  >
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </>
        )}

        <h2 className="r-sec">一致した形</h2>
        {obs.patterns.length > 0 ? (
          <div className="flex flex-col gap-3">
            {obs.patterns.map((code) => {
              const pattern = capillaryPatternByCode[code];
              if (!pattern) return null;
              return (
                <article
                  key={code}
                  className="r-keep rounded-[var(--radius)] border border-[var(--border)]"
                >
                  <h3 className="r-pattern bg-[var(--accent)] px-4 py-2 text-lg font-bold text-white">
                    No.{patternNumberByCode[code] ?? "―"} {pattern.name}
                  </h3>
                  <div className="r-pattern-body flex flex-col gap-3 px-4 py-3 sm:flex-row">
                    <PatternDiagram
                      code={code}
                      title={`${pattern.name}の模式図`}
                      className="r-pattern-fig h-28 w-full shrink-0 rounded border border-[var(--border)] sm:w-52"
                    />
                    <div className="r-pattern-text flex flex-col gap-1">
                      <p className="r-small">{pattern.feature}</p>
                      <p className="r-why">原因：{pattern.why}</p>
                      <p className="r-small">重なりやすい症状：{pattern.symptoms}</p>
                      <p className="r-small">未病の見方：{pattern.mibyo}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="r-body">選択されたパターンはありません。</p>
        )}

        {obs.summary && (
          <>
            <h2 className="r-sec">所見のまとめ</h2>
            <p className="r-body whitespace-pre-wrap">{obs.summary}</p>
          </>
        )}

        {obs.adviceMemo && (
          <>
            <h2 className="r-sec">アドバイス</h2>
            <p className="r-body whitespace-pre-wrap">{obs.adviceMemo}</p>
          </>
        )}

        {obs.nextNote && (
          <>
            <h2 className="r-sec">次回について</h2>
            <p className="r-body whitespace-pre-wrap">{obs.nextNote}</p>
          </>
        )}

        <div className="r-keep">
          <h2 className="r-sec">撮影の条件</h2>
          <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {conditions.map((f) => (
              <div key={f.label} className="flex items-baseline gap-2">
                <dt className="r-small shrink-0 font-bold">{f.label}：</dt>
                <dd className="r-small">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {trialMode && obs.interventions.length > 0 && (
          <>
            <h2 className="r-sec">実施内容の記録</h2>
            <ul className="flex flex-col gap-1">
              {obs.interventions.map((iv) => (
                <li key={iv.id} className="r-small">
                  {interventionLine(iv)}（タイミング：
                  {interventionTimingLabels[iv.timing] ?? iv.timing}）
                </li>
              ))}
            </ul>
            <p className="r-small mt-1">
              実施内容は記録として記載しています。変化との関係は、この記録だけでは判断できません。
            </p>
          </>
        )}

        {qrDataUrl && (
          <div className="r-keep mt-8 flex items-center gap-4 border-t border-[var(--border)] pt-4">
            <img
              src={qrDataUrl}
              alt="受け取りQRコード"
              className="h-28 w-28 shrink-0 bg-white"
            />
            <p className="r-small">
              ルーツマイルで読み取ると、このレポートを取り込めます（取り込み機能は今後対応予定）。レポート番号：{obs.reportId ?? obs.id}
            </p>
          </div>
        )}

        <p className="r-src mt-6 border-t border-[var(--border)] pt-3">{DISCLAIMER}</p>
      </div>
    </div>
  );
}

export function ReceiveQr({
  id,
  token,
  qrDataUrl,
}: {
  id: string;
  token: string;
  qrDataUrl: string | null;
}) {
  return (
    <section
      aria-label="受け取りQRコード"
      className="no-print flex flex-col items-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
    >
      <h2 className="text-xl font-bold text-[var(--heading)]">受け取りQRコード</h2>
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt="受け取りQRコード"
          className="h-60 w-60 rounded border border-[var(--border)] bg-white p-1"
        />
      ) : (
        <p className="text-lg text-[var(--dim)]">QRコードを作成しています…</p>
      )}
      <p className="max-w-xl text-center text-base leading-relaxed text-[var(--text)]">
        ルーツマイルでこのQRコードを読み取ると、このレポートを取り込めます（取り込み機能は今後対応予定）。QRコードに入っているのはレポート番号と受け取り用コードだけで、健康データそのものは含まれていません。
      </p>
      <p className="text-base text-[var(--dim)]">
        レポート番号：{id}／受け取りコード：{token}
      </p>
      <button
        type="button"
        onClick={() => printReport("large")}
        className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg font-medium text-[var(--text)]"
      >
        レポートと一緒に印刷する
      </button>
    </section>
  );
}
