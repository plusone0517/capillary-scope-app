// @vitest-environment jsdom
// レポートの標準の並びと、数えた位置の重ね表示のテスト（実際に描画して確かめる）。
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ObservationRecord } from "./api";
import { UNCONFIRMED_CONSENT } from "./consent";
import { CountedImage } from "./CountedImage";
import type { DensityMeasurement } from "./densityCount";
import { ReportBody } from "./ReportView";

afterEach(cleanup);

const measurement: DensityMeasurement = {
  method: "manual_tap",
  points: [
    { x: 0.3, y: 0.3 },
    { x: 0.5, y: 0.32 },
    { x: 0.7, y: 0.35 },
  ],
  line: { start: { x: 0.25, y: 0.2 }, end: { x: 0.75, y: 0.25 } },
  umPerPx: 1.25,
  calibrationSource: "auto_scale",
  imageWidthPx: 1600,
  imageHeightPx: 900,
  lengthMm: 1,
  count: 3,
  densityPerMm: 3,
};

function obs(over: Partial<ObservationRecord> = {}): ObservationRecord {
  return {
    id: "o-2",
    patientId: "p-1",
    reportId: null,
    receiveToken: null,
    subjectName: "確認 太郎",
    subjectId: null,
    observedAt: "2026-11-28T01:30:00.000Z",
    finger: "left_ring",
    roomTempC: 23,
    restMinutes: 15,
    restrictionsOk: true,
    densityPerMm: 3,
    flow: "good",
    color: "bright_red",
    flagGiant: false,
    flagHemorrhage: false,
    flagLoss: false,
    flagRamified: false,
    patterns: ["normal", "tortuous"],
    changeVsPrev: null,
    adviceMemo: "湯船につかる日を増やしてみましょう。",
    referralGiven: false,
    summary: "今回の観察のまとめです。",
    summaryNote: null,
    nextNote: "次回は3か月後を目安にします。",
    status: "draft",
    finalizedAt: null,
    images: [{ id: "img-1", url: "blob:one", isPrimary: true }],
    video: null,
    calibrationUmPerPx: null,
    flowSpeedPxPerSec: null,
    flowSpeedMmPerSec: null,
    flowSpeedMethod: null,
    trialName: null,
    trialGroup: null,
    interventions: [],
    consent: { ...UNCONFIRMED_CONSENT },
    densityMeasurement: measurement,
    customer: null,
    ...over,
  } as ObservationRecord;
}

const headings = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());

describe("レポートの標準の並び", () => {
  it("項目がそろっているときは、決まった順に並ぶ", () => {
    const prev = obs({ id: "o-1", observedAt: "2026-08-28T01:30:00.000Z", densityPerMm: 4, densityMeasurement: null });
    render(
      <ReportBody
        obs={obs()}
        prev={prev}
        history={[
          { id: "o-1", observedAt: prev.observedAt, value: 4 },
          { id: "o-2", observedAt: "2026-11-28T01:30:00.000Z", value: 3 },
        ]}
      />,
    );
    expect(headings()).toEqual([
      "今回の観察画像",
      "計測値と所見",
      "本数の推移",
      "前回との比較（ビフォアアフター）",
      "一致した形",
      "所見のまとめ",
      "アドバイス",
      "次回について",
      "撮影の条件",
    ]);
  });

  it("記録の無い項目だけを省き、残りの順は変えない", () => {
    render(<ReportBody obs={obs({ adviceMemo: null, nextNote: null })} history={[{ id: "o-2", observedAt: "2026-11-28T01:30:00.000Z", value: 3 }]} />);
    expect(headings()).toEqual([
      "今回の観察画像",
      "計測値と所見",
      "一致した形",
      "所見のまとめ",
      "撮影の条件",
    ]);
  });

  it("本数は大きく出し、数えた本数・範囲・前回との差（事実だけ）を添える", () => {
    const prev = obs({ id: "o-1", observedAt: "2026-08-28T01:30:00.000Z", densityPerMm: 4, densityMeasurement: null });
    render(<ReportBody obs={obs()} prev={prev} />);
    const card = screen.getAllByText("本数（1mmあたり）")[0].closest("div")!;
    expect(card.textContent).toContain("3 本/mm");
    expect(card.textContent).toContain("数えた本数 3本／範囲 1.00 mm");
    expect(card.textContent).toContain("前回 4 本/mm（−1 本）");
    // 良し悪しを言う言葉は出さない。
    expect(document.body.textContent).not.toMatch(/改善|悪化|良くな|悪くな/);
  });

  it("本数の記録が無い回は「記録なし」と出し、数えた位置の説明は出さない", () => {
    render(<ReportBody obs={obs({ densityPerMm: null, densityMeasurement: null })} />);
    const card = screen.getByText("本数（1mmあたり）").closest("div")!;
    expect(card.textContent).toContain("記録なし");
    expect(screen.queryByText(/番号の点/)).toBeNull();
  });

  it("手で書き換えた本数と数えた記録が食い違うときは、数えた位置を出さない", () => {
    render(<ReportBody obs={obs({ densityPerMm: 8 })} />);
    expect(screen.queryByText(/番号の点/)).toBeNull();
    expect(screen.queryByText(/数えた本数/)).toBeNull();
  });

  it("形は「No.番号 正式名称」で出す", () => {
    render(<ReportBody obs={obs()} />);
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(names[0]).toMatch(/^No\.1 正常$/);
    expect(names[1]).toMatch(/^No\.\d+ 蛇行$/);
  });

  it("臨床フラグがあるときは、受診案内が先頭に出る", () => {
    render(<ReportBody obs={obs({ flagHemorrhage: true })} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("医療機関への受診をおすすめします");
    const first = screen.getAllByRole("heading", { level: 2 })[0];
    expect(alert.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("撮影の条件に、目盛りの合わせ方を出す", () => {
    render(<ReportBody obs={obs()} />);
    expect(screen.getByText("自動で読み取り（1.25 μm/px）")).toBeTruthy();
  });
});

describe("数えた位置の重ね表示", () => {
  function load(img: HTMLElement, w: number, h: number) {
    Object.defineProperty(img, "naturalWidth", { value: w, configurable: true });
    Object.defineProperty(img, "naturalHeight", { value: h, configurable: true });
    fireEvent.load(img);
  }

  it("数えたときと同じ形の画像には、点と範囲を重ねる", () => {
    render(<CountedImage src="blob:one" alt="代表の観察画像" measurement={measurement} />);
    load(screen.getByAltText("代表の観察画像"), 800, 450);
    const overlay = screen.getByRole("img", { name: /数えた位置（3本）/ });
    expect(overlay.querySelectorAll("circle")).toHaveLength(3);
    expect(overlay.getAttribute("viewBox")).toBe("0 0 1600 900");
  });

  it("縦横の比が違う画像（別の画像）には重ねない", () => {
    render(<CountedImage src="blob:one" alt="代表の観察画像" measurement={measurement} />);
    load(screen.getByAltText("代表の観察画像"), 800, 600);
    expect(screen.queryByRole("img", { name: /数えた位置/ })).toBeNull();
  });

  it("数えた記録が無ければ、画像だけを出す", () => {
    render(<CountedImage src="blob:one" alt="代表の観察画像" measurement={null} />);
    load(screen.getByAltText("代表の観察画像"), 800, 450);
    expect(screen.queryByRole("img", { name: /数えた位置/ })).toBeNull();
  });
});
