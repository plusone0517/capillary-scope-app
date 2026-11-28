import { describe, expect, it } from "vitest";
import {
  ageOn,
  customerSubLabel,
  findDuplicate,
  isValidBirthDate,
  isValidMemberNumber,
  matchesCustomer,
  normalizeMemberNumber,
  validateCustomerInput,
  type CustomerRecord,
} from "./customer";

const today = new Date(2026, 10, 28); // 2026-11-28

function customer(over: Partial<CustomerRecord>): CustomerRecord {
  return {
    id: "c1",
    displayName: "山田 花子",
    nameKana: "やまだ はなこ",
    birthDate: "1975-04-12",
    sex: "female",
    memberNumber: "RM-12345678",
    localCode: null,
    note: null,
    ...over,
  };
}

describe("会員番号", () => {
  it("全角・小文字・空白・全角ハイフンをそろえる", () => {
    expect(normalizeMemberNumber(" ｒｍ－１２３４５６７８ ")).toBe("RM-12345678");
    expect(normalizeMemberNumber("rm-12345678")).toBe("RM-12345678");
    expect(normalizeMemberNumber("")).toBeNull();
    expect(normalizeMemberNumber(undefined)).toBeNull();
  });
  it("ルーツマイルと同じ形式（英大文字・数字・ハイフンの3〜32文字）だけを通す", () => {
    expect(isValidMemberNumber("RM-12345678")).toBe(true);
    expect(isValidMemberNumber("AB")).toBe(false);
    expect(isValidMemberNumber("RM_123")).toBe(false);
    expect(isValidMemberNumber("A".repeat(33))).toBe(false);
  });
});

describe("生年月日と年齢", () => {
  it("存在しない日付・未来の日付は通さない", () => {
    expect(isValidBirthDate("1975-04-12", today)).toBe(true);
    expect(isValidBirthDate("1975-02-30", today)).toBe(false);
    expect(isValidBirthDate("2027-01-01", today)).toBe(false);
    expect(isValidBirthDate("1975/04/12", today)).toBe(false);
  });
  it("誕生日の前後で満年齢が変わる", () => {
    expect(ageOn("1975-11-28", today)).toBe(51);
    expect(ageOn("1975-11-29", today)).toBe(50);
    expect(ageOn(null, today)).toBeNull();
  });
});

describe("検索", () => {
  const c = customer({});
  it("会員番号は表記ゆれがあっても引ける", () => {
    expect(matchesCustomer(c, "rm-1234")).toBe(true);
    expect(matchesCustomer(c, "ＲＭ－１２３４５６７８")).toBe(true);
    expect(matchesCustomer(c, "RM-9999")).toBe(false);
  });
  it("氏名・ふりがな（カタカナでも）・空白の有無で引ける", () => {
    expect(matchesCustomer(c, "山田花子")).toBe(true);
    expect(matchesCustomer(c, "ヤマダ")).toBe(true);
    expect(matchesCustomer(c, "はなこ")).toBe(true);
    expect(matchesCustomer(c, "佐藤")).toBe(false);
  });
  it("空の検索語は全件", () => {
    expect(matchesCustomer(c, "  ")).toBe(true);
  });
});

describe("登録時の確認", () => {
  it("名前だけでは登録できない（同姓同名を区別できないため）", () => {
    expect(validateCustomerInput({ displayName: "山田 花子" }, today)).toContain("会員番号か生年月日");
    expect(validateCustomerInput({ displayName: "山田 花子", birthDate: "1975-04-12" }, today)).toBeNull();
    expect(validateCustomerInput({ displayName: "山田 花子", memberNumber: "rm-12345678" }, today)).toBeNull();
    expect(validateCustomerInput({ displayName: " ", memberNumber: "RM-1" }, today)).toContain("お名前");
  });
  it("同じ会員番号は重複として止める", () => {
    const dup = findDuplicate({ displayName: "別の名前", memberNumber: "ｒｍ-12345678" }, [customer({})]);
    expect(dup?.kind).toBe("memberNumber");
  });
  it("同姓同名でも生年月日が違えば別人として登録できる", () => {
    const existing = [customer({ memberNumber: null })];
    expect(findDuplicate({ displayName: "山田 花子", birthDate: "1980-01-01" }, existing)).toBeNull();
    expect(findDuplicate({ displayName: "山田花子", birthDate: "1975-04-12" }, existing)?.kind).toBe("nameAndBirth");
  });
  it("自分自身の編集は重複にしない", () => {
    expect(findDuplicate({ displayName: "山田 花子", memberNumber: "RM-12345678" }, [customer({})], "c1")).toBeNull();
  });
});

describe("表示", () => {
  it("会員番号・年齢・性別を1行にまとめる", () => {
    expect(customerSubLabel(customer({}), today)).toBe("会員番号 RM-12345678／51歳／女性");
    expect(customerSubLabel(customer({ memberNumber: null, birthDate: null, sex: null }), today)).toBe("");
  });
});
