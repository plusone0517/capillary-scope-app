// 試験モード：試験データ画面。試験名で絞り込んだ観察を一覧し、
// 数値データと実施内容を CSV で書き出す（解析・症例集積用）。
// CSV は画面表示と同じ値から組み立て、値は事実の記録のまま出す。

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type TrialExportRow } from "./api";
import { formatDateTime } from "./ReportView";
import {
  capillaryColorLabels,
  capillaryFingerLabels,
  capillaryFlowLabels,
  capillaryPatternByCode,
} from "./patterns";
import { interventionLine, interventionTimingLabels } from "./trial";

type ExportRow = TrialExportRow;

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function patternNames(codes: string[]): string {
  return codes.map((c) => capillaryPatternByCode[c]?.name ?? c).join("、");
}

function buildCsv(trialName: string, rows: ExportRow[]): string {
  const header = [
    "観察日",
    "対象者名",
    "対象者ID",
    "試験名",
    "群",
    "撮影した指",
    "密度（本/mm）",
    "血流速度（mm/秒・試作参考値）",
    "流れの印象",
    "色の印象",
    "形のパターン",
    "臨床フラグ",
    "実施内容（タイミング）",
  ];
  const lines = rows.map((row) => {
    const cells = [
      formatDateTime(row.observedAt),
      row.subjectName,
      row.subjectId ?? "",
      trialName,
      row.trialGroup ?? "",
      capillaryFingerLabels[row.finger] ?? row.finger,
      row.densityPerMm != null ? String(row.densityPerMm) : "",
      row.flowSpeedMmPerSec != null ? row.flowSpeedMmPerSec.toFixed(2) : "",
      row.flow ? (capillaryFlowLabels[row.flow] ?? row.flow) : "",
      row.color ? (capillaryColorLabels[row.color] ?? row.color) : "",
      patternNames(row.patterns),
      row.hasClinicalFlag ? "あり" : "なし",
      row.interventions
        .map(
          (iv) =>
            `${interventionLine(iv)}（${interventionTimingLabels[iv.timing] ?? iv.timing}）`,
        )
        .join("／"),
    ];
    return cells.map(csvEscape).join(",");
  });
  // Excel で文字化けしないよう BOM を付ける。
  return "﻿" + [header.map(csvEscape).join(","), ...lines].join("\r\n");
}

function downloadCsv(trialName: string, rows: ExportRow[]) {
  const csv = buildCsv(trialName, rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `試験データ_${trialName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function TrialDataScreen({ onBack }: { onBack: () => void }) {
  const names = useQuery({
    queryKey: ["trialNames"],
    queryFn: () => api.listTrialNames(),
  });
  const trialNames = names.data?.trialNames ?? [];
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!selected && trialNames.length > 0) {
      setSelected(trialNames[0] ?? "");
    }
  }, [trialNames, selected]);

  const data = useQuery({
    queryKey: ["trialExport", selected],
    queryFn: () => api.exportTrialData({ trialName: selected }),
    enabled: selected !== "",
  });
  const rows = data.data?.observations ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg text-[var(--text)]"
        >
          一覧に戻る
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[var(--text)]">試験データ（CSV書き出し）</h1>
        <p className="mt-1 text-base leading-relaxed text-[var(--dim)]">
          試験名で絞り込んだ観察の一覧です。観察日・対象者・密度・血流速度・流れ・色・形のパターン・実施内容をCSVで書き出せます。
        </p>
      </div>

      {names.isPending && <p className="text-lg text-[var(--dim)]">読み込んでいます…</p>}
      {names.error && (
        <p role="alert" className="text-lg text-[var(--alert)]">
          試験名の読み込みに失敗しました。もう一度お試しください。
        </p>
      )}
      {names.data && trialNames.length === 0 && (
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-lg text-[var(--text)]">
            試験名が記録された観察はまだありません。試験モードをONにして観察を記録すると、ここに試験名が出ます。
          </p>
        </div>
      )}

      {trialNames.length > 0 && (
        <>
          <label className="flex flex-col gap-1 text-base font-medium text-[var(--text)]">
            試験名で絞り込む
            <select
              aria-label="試験名で絞り込む"
              className="min-h-14 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-lg text-[var(--text)] sm:max-w-md"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              {trialNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          {data.isPending && selected && (
            <p className="text-lg text-[var(--dim)]">読み込んでいます…</p>
          )}
          {data.error && (
            <p role="alert" className="text-lg text-[var(--alert)]">
              試験データの読み込みに失敗しました。もう一度お試しください。
            </p>
          )}
          {data.data && (
            <>
              <p className="text-lg text-[var(--text)]">
                {selected}：{rows.length}件の観察
              </p>
              <button
                type="button"
                disabled={rows.length === 0}
                onClick={() => downloadCsv(selected, rows)}
                className="min-h-14 self-start rounded-[var(--radius)] bg-[var(--accent)] px-6 text-lg font-bold text-white disabled:opacity-40"
              >
                CSVで書き出す
              </button>
              {rows.length > 0 ? (
                <div className="overflow-x-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)]">
                  <table className="w-full min-w-[720px] border-collapse">
                    <thead>
                      <tr className="bg-[var(--paper)]">
                        {["観察日", "対象者", "群", "密度", "血流速度", "流れ", "色", "実施内容"].map(
                          (h) => (
                            <th
                              key={h}
                              scope="col"
                              className="px-3 py-2 text-left text-base font-bold text-[var(--text)]"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id} className="border-t border-[var(--border)]">
                          <td className="px-3 py-2 align-top text-base whitespace-nowrap text-[var(--text)]">
                            {formatDateTime(row.observedAt)}
                          </td>
                          <td className="px-3 py-2 align-top text-base text-[var(--text)]">
                            {row.subjectName}
                            {row.subjectId && (
                              <span className="block text-sm text-[var(--dim)]">
                                ID：{row.subjectId}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top text-base text-[var(--text)]">
                            {row.trialGroup ?? "―"}
                          </td>
                          <td className="px-3 py-2 align-top text-base whitespace-nowrap text-[var(--text)]">
                            {row.densityPerMm != null ? `${row.densityPerMm} 本/mm` : "記録なし"}
                          </td>
                          <td className="px-3 py-2 align-top text-base whitespace-nowrap text-[var(--text)]">
                            {row.flowSpeedMmPerSec != null
                              ? `${row.flowSpeedMmPerSec.toFixed(2)} mm/秒`
                              : "記録なし"}
                          </td>
                          <td className="px-3 py-2 align-top text-base whitespace-nowrap text-[var(--text)]">
                            {row.flow ? (capillaryFlowLabels[row.flow] ?? row.flow) : "記録なし"}
                          </td>
                          <td className="px-3 py-2 align-top text-base whitespace-nowrap text-[var(--text)]">
                            {row.color
                              ? (capillaryColorLabels[row.color] ?? row.color)
                              : "記録なし"}
                          </td>
                          <td className="px-3 py-2 align-top text-base text-[var(--text)]">
                            {row.interventions.length > 0
                              ? row.interventions.map(interventionLine).join("／")
                              : "なし"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-lg text-[var(--dim)]">
                  この試験名の観察はまだありません。
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
