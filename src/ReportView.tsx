// レポート表示：観察画像・撮影と所見・一致した形のカード・まとめ・
// アドバイス・次回についてを、正本サンプルSVGの構成で表示する。
// 臨床フラグがある場合は受診案内を先頭に目立たせる。
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
type ClinicalFlagKey,
} from "./patterns";
import { PatternDiagram } from "./PatternDiagram";
import { LogoMark } from "./Logo";
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
export function isDummySubject(subjectName: string): boolean {
  return subjectName.includes("（ダミー）");
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
}: {
  obs: Observation;
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
      label: "密度",
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
    const shapeParts: string[] = [];
    if (prevPd.added.length > 0)
      shapeParts.push(`新たに見られた形：${prevPd.added.join("、")}`);
    if (prevPd.removed.length > 0)
      shapeParts.push(`前回のみ見られた形：${prevPd.removed.join("、")}`);
    // 両回ともパターン未選択なら「同じ形」ではなく「記録なし」とする
    // （一致した形の欄の「選択されたパターンはありません」と矛盾させない）。
    const bothNoPatterns = prev.patterns.length === 0 && obs.patterns.length === 0;
    compareRows.push({
      label: "形の変化",
      value:
        shapeParts.length > 0
          ? shapeParts.join("／")
          : bothNoPatterns
            ? "形の記録がありません"
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

  const findings: { label: string; value: string }[] = [
    { label: "撮影した指", value: capillaryFingerLabels[obs.finger] ?? obs.finger },
  ];
  if (obs.roomTempC != null) findings.push({ label: "室温", value: `${obs.roomTempC}℃` });
  if (obs.restMinutes != null)
    findings.push({ label: "安静時間", value: `${obs.restMinutes}分` });
  findings.push({
    label: "撮影前の制限の確認",
    value: obs.restrictionsOk ? "確認済み" : "未確認",
  });
  if (obs.densityPerMm != null)
    findings.push({ label: "密度", value: `${obs.densityPerMm} 本/mm` });
  if (obs.flow) findings.push({ label: "流れの印象", value: capillaryFlowLabels[obs.flow] ?? obs.flow });
  if (obs.color)
    findings.push({ label: "色の印象", value: capillaryColorLabels[obs.color] ?? obs.color });
  if (obs.changeVsPrev)
    findings.push({
      label: "前回比較",
      value: capillaryChangeLabels[obs.changeVsPrev] ?? obs.changeVsPrev,
    });
  if (obs.flowSpeedPxPerSec != null)
    findings.push({
      label: "血流速度（試作・参考値）",
      value:
        obs.flowSpeedMmPerSec != null
          ? `${obs.flowSpeedMmPerSec.toFixed(2)} mm/秒`
          : `${obs.flowSpeedPxPerSec.toFixed(1)} ピクセル/秒（校正値なし）`,
    });
  if (obs.calibrationUmPerPx != null)
    findings.push({
      label: "校正値",
      value: `${obs.calibrationUmPerPx} μm/px`,
    });
  if (trialMode && obs.trialName)
    findings.push({ label: "試験名", value: obs.trialName });
  if (trialMode && obs.trialGroup)
    findings.push({ label: "群", value: obs.trialGroup });

  return (
    <div id="report-print" className="bg-[var(--surface)]">
      <div className="bg-[var(--paper)] px-5 py-4 sm:px-7">
        <div className="flex items-start gap-3">
          <LogoMark size={46} className="mt-1 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="r-title">毛細血管観察レポート</h1>
            <p className="r-meta mt-1">
              観察日：{formatDateTime(obs.observedAt)}　対象：{obs.subjectName}
              {obs.subjectId ? `（ID：${obs.subjectId}）` : ""}
            </p>
          </div>
          <p className="r-src shrink-0 pt-2 text-right">
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
            <img
              src={primary.url}
              alt="代表の観察画像"
              className="w-full rounded-[var(--radius)] object-cover"
            />
            {others.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

        <h2 className="r-sec">撮影と所見</h2>
        <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {findings.map((f) => (
            <div key={f.label} className="flex items-baseline gap-2">
              <dt className="r-small shrink-0 font-bold">{f.label}：</dt>
              <dd
                className={
                  f.label === "密度" || f.label.startsWith("血流速度")
                    ? "r-num"
                    : "r-small"
                }
              >
                {f.value}
              </dd>
            </div>
          ))}
        </dl>
        {flags.length > 0 ? (
          <p className="r-small mt-2 font-bold text-[var(--alert)]">
            臨床フラグ：{flags.map((f) => capillaryClinicalFlagLabels[f]).join("、")}
          </p>
        ) : (
          <p className="r-small mt-2">臨床フラグ：なし</p>
        )}

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
                      className="aspect-[4/3] w-full rounded-[var(--radius)] object-cover"
                    />
                  ) : (
                    <span className="flex aspect-[4/3] w-full items-center justify-center rounded-[var(--radius)] bg-[var(--paper)] text-sm text-[var(--dim)]">
                      画像なし
                    </span>
                  )}
                  <figcaption className="r-small">
                    {side.label}：{formatDateTime(side.o.observedAt)}
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
                同じ指（{fingerLabel(obs.finger)}）同士の比較です。撮影条件もそろっています。
              </p>
            )}
            <dl className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {compareRows.map((row) => (
                <div key={row.label} className="flex items-baseline gap-2">
                  <dt className="r-small shrink-0 font-bold">{row.label}：</dt>
                  <dd
                    className={
                      row.label === "密度" || row.label.startsWith("血流速度")
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
                  className="rounded-[var(--radius)] border border-[var(--border)]"
                >
                  <h3 className="bg-[var(--accent)] px-4 py-2 text-lg font-bold text-white">
                    {pattern.name}
                  </h3>
                  <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row">
                    <PatternDiagram
                      code={code}
                      title={`${pattern.name}の模式図`}
                      className="h-28 w-full shrink-0 rounded border border-[var(--border)] sm:w-52"
                    />
                    <div className="flex flex-col gap-1">
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

        {qrDataUrl && (
          <div className="mt-8 flex items-center gap-4 border-t border-[var(--border)] pt-4">
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
        onClick={() => window.print()}
        className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg font-medium text-[var(--text)]"
      >
        レポートと一緒に印刷する
      </button>
    </section>
  );
}
