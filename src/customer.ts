// 顧客（対象者）の識別と表示のルール。
//
// 方針（2026-11-28 ユーザー決定）:
// - ルーツマイルと紐づける。会員番号で顧客のデータを引けるようにする。
// - 氏名だけでは同姓同名を区別できないため、会員番号または生年月日を合わせて持つ。
// - 会員番号はルーツマイル側で変更されうる（管理画面に「会員番号の変更」がある）。
//   そのため会員番号は「引くための鍵」として扱い、このアプリ内の顧客の同一性は
//   顧客ID（patients のドキュメントID）で保つ。ルーツマイルの内部ID（UID）は
//   rootsMemberId に入れる（受け渡しの連携ができた段階で使う）。

export type CustomerSex = "female" | "male" | "other";

export const customerSexLabels: Record<CustomerSex, string> = {
  female: "女性",
  male: "男性",
  other: "その他・無回答",
};

/** 画面で扱う顧客1件。 */
export type CustomerRecord = {
  id: string;
  displayName: string;
  nameKana: string | null;
  /** YYYY-MM-DD。未登録は null。 */
  birthDate: string | null;
  sex: CustomerSex | null;
  /** ルーツマイルの会員番号（例：RM-12345678）。未登録は null。 */
  memberNumber: string | null;
  /** 施設内の番号（カルテ番号など）。従来の「対象者ID」。未登録は null。 */
  localCode: string | null;
  note: string | null;
};

export type CustomerInput = {
  displayName: string;
  nameKana?: string;
  birthDate?: string;
  sex?: CustomerSex;
  memberNumber?: string;
  localCode?: string;
  note?: string;
};

/**
 * 会員番号を照合用の形にそろえる（全角→半角、小文字→大文字、空白除去、
 * 長音・全角ハイフン類→半角ハイフン）。空なら null。
 */
export function normalizeMemberNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw
    .normalize("NFKC")
    .replace(/[‐‑‒–—―ー－]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
  return s ? s : null;
}

/** ルーツマイルの会員番号の形式（半角大文字・数字・ハイフンの3〜32文字）。 */
export function isValidMemberNumber(normalized: string): boolean {
  return /^[A-Z0-9-]{3,32}$/.test(normalized);
}

/** 生年月日（YYYY-MM-DD）として正しく、未来でなく、古すぎないか。 */
export function isValidBirthDate(value: string, today: Date = new Date()): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return false;
  if (date.getTime() > today.getTime()) return false;
  return y >= 1900;
}

/** 指定日時点の満年齢。生年月日が無い・不正なら null。 */
export function ageOn(birthDate: string | null, on: Date = new Date()): number | null {
  if (!birthDate || !isValidBirthDate(birthDate, on)) return null;
  const [y, mo, d] = birthDate.split("-").map(Number);
  let age = on.getFullYear() - y;
  if (on.getMonth() + 1 < mo || (on.getMonth() + 1 === mo && on.getDate() < d)) age -= 1;
  return age;
}

/** 検索用に、ひらがな・カタカナ・全半角・空白の違いを吸収する。 */
export function searchKey(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s　]+/g, "")
    .toLowerCase();
}

/** 氏名・ふりがな・会員番号・施設内番号のいずれかに一致するか。空の検索語は全件一致。 */
export function matchesCustomer(c: CustomerRecord, query: string): boolean {
  const q = searchKey(query);
  if (!q) return true;
  const member = normalizeMemberNumber(query);
  if (member && c.memberNumber && c.memberNumber.includes(member)) return true;
  return [c.displayName, c.nameKana ?? "", c.localCode ?? "", c.memberNumber ?? ""].some((v) =>
    searchKey(v).includes(q),
  );
}

/** 入力の検査。問題があれば日本語のメッセージ、なければ null。 */
export function validateCustomerInput(input: CustomerInput, today: Date = new Date()): string | null {
  if (!input.displayName.trim()) return "お名前を入力してください。";
  const member = normalizeMemberNumber(input.memberNumber);
  if (member && !isValidMemberNumber(member))
    return "会員番号は半角の英大文字・数字・ハイフンで、3〜32文字で入力してください。";
  if (input.birthDate && !isValidBirthDate(input.birthDate, today))
    return "生年月日を正しく入力してください。";
  if (!member && !input.birthDate)
    return "同じお名前の方と区別するため、会員番号か生年月日のどちらかを入力してください。";
  return null;
}

/**
 * 同一人物の可能性がある既存の顧客を探す（登録前の確認用）。
 * - 会員番号が同じ → 同一（重複登録を止める）。
 * - 氏名と生年月日が同じ → 同一の可能性が高い（確認を促す）。
 */
export function findDuplicate(
  input: CustomerInput,
  existing: CustomerRecord[],
  ignoreId?: string,
): { kind: "memberNumber" | "nameAndBirth"; customer: CustomerRecord } | null {
  const member = normalizeMemberNumber(input.memberNumber);
  const name = searchKey(input.displayName);
  for (const c of existing) {
    if (c.id === ignoreId) continue;
    if (member && c.memberNumber === member) return { kind: "memberNumber", customer: c };
  }
  for (const c of existing) {
    if (c.id === ignoreId) continue;
    if (input.birthDate && c.birthDate === input.birthDate && searchKey(c.displayName) === name)
      return { kind: "nameAndBirth", customer: c };
  }
  return null;
}

/** 一覧やピッカーで使う補足の1行（会員番号・年齢・性別）。 */
export function customerSubLabel(c: CustomerRecord, on: Date = new Date()): string {
  const parts: string[] = [];
  if (c.memberNumber) parts.push(`会員番号 ${c.memberNumber}`);
  if (c.localCode) parts.push(`施設内番号 ${c.localCode}`);
  const age = ageOn(c.birthDate, on);
  if (age != null) parts.push(`${age}歳`);
  if (c.sex) parts.push(customerSexLabels[c.sex]);
  return parts.join("／");
}
