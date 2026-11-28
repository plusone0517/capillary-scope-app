// @vitest-environment jsdom
// 同意の記録欄の動作テスト（実際に描画して操作する）。
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { ConsentFields } from "./ConsentFields";
import { UNCONFIRMED_CONSENT, type ConsentState } from "./consent";

afterEach(cleanup);

function Harness({ onState }: { onState: (s: ConsentState) => void }) {
  const [value, setValue] = useState<ConsentState>(UNCONFIRMED_CONSENT);
  return (
    <ConsentFields
      value={value}
      onChange={(next) => {
        setValue(next);
        onState(next);
      }}
    />
  );
}

function group(legend: string): HTMLElement {
  const el = screen.getByText(legend).closest("fieldset");
  if (!el) throw new Error(`fieldset not found: ${legend}`);
  return el as HTMLElement;
}

function pick(legend: string, label: string) {
  const radios = Array.from(group(legend).querySelectorAll("label"));
  const target = radios.find((l) => l.textContent?.trim() === label);
  if (!target) throw new Error(`option not found: ${label}`);
  fireEvent.click(target.querySelector("input") as HTMLInputElement);
}

const CASE = "1. 事例として紹介することへの同意";
const RESEARCH = "2. 将来、研究に利用することへの同意";

describe("ConsentFields", () => {
  it("最初はどちらも未確認で、範囲の欄は出ない", () => {
    render(<Harness onState={() => {}} />);
    const checked = (legend: string) =>
      (group(legend).querySelector("input:checked")?.closest("label")?.textContent ?? "").trim();
    expect(checked(CASE)).toBe("未確認");
    expect(checked(RESEARCH)).toBe("未確認");
    expect(screen.queryByText("紹介してよい範囲")).toBeNull();
  });

  it("事例に同意ありを選ぶと範囲の欄が出て、既定は施設内のみ", () => {
    let last: ConsentState = UNCONFIRMED_CONSENT;
    render(<Harness onState={(s) => (last = s)} />);
    pick(CASE, "同意あり");
    expect(screen.getByText("紹介してよい範囲")).toBeTruthy();
    expect(last).toEqual({ caseUse: "granted", caseScope: "internal", futureResearch: "unconfirmed" });
    pick("紹介してよい範囲", "お名前を外して施設外でも紹介可");
    expect(last.caseScope).toBe("anonymous");
  });

  it("同意なしに戻すと範囲は消え、保存値も null になる", () => {
    let last: ConsentState = UNCONFIRMED_CONSENT;
    render(<Harness onState={(s) => (last = s)} />);
    pick(CASE, "同意あり");
    pick("紹介してよい範囲", "お名前を外して施設外でも紹介可");
    pick(CASE, "同意なし");
    expect(screen.queryByText("紹介してよい範囲")).toBeNull();
    expect(last).toEqual({ caseUse: "declined", caseScope: null, futureResearch: "unconfirmed" });
  });

  it("研究利用の同意は事例の同意と独立して記録される", () => {
    let last: ConsentState = UNCONFIRMED_CONSENT;
    render(<Harness onState={(s) => (last = s)} />);
    pick(RESEARCH, "同意あり");
    expect(last).toEqual({ caseUse: "unconfirmed", caseScope: null, futureResearch: "granted" });
  });
});
