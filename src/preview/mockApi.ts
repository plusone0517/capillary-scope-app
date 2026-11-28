// 確認用プレビュー専用のデータ層スタブ（メモリ上のサンプルデータ）。
// 本番ビルドには含まれない。ログインや Firebase なしで全画面を開き、
// 見た目と流れを確かめるために使う（npm run preview:ui）。
// サンプルの対象者・画像はすべて架空のもの。
import type { api as RealApi, ObservationRecord, ObservationListItem, ImageInput } from "../api";
import { normalizeConsent, UNCONFIRMED_CONSENT } from "../consent";
import {
  findDuplicate,
  matchesCustomer,
  normalizeMemberNumber,
  validateCustomerInput,
  type CustomerInput,
  type CustomerRecord,
} from "../customer";

export type * from "../api";

export function describeFirebaseError(e: unknown): string {
  return e instanceof Error ? e.message : "処理に失敗しました。";
}

/** 架空の毛細血管画像（SVG）。variant で本数と形を変える。 */
function sampleImage(variant: number): string {
  const loops = 9 + (variant % 4);
  const wavy = variant % 2 === 1;
  let paths = "";
  for (let i = 0; i < loops; i++) {
    const x = 60 + (i * 680) / loops + ((i * 37 + variant * 13) % 17);
    const h = 150 + ((i * 53 + variant * 29) % 90);
    const w = 16 + ((i * 7 + variant) % 8);
    const top = 330 - h;
    const bend = wavy && i % 3 === 0 ? 14 : 0;
    paths += `<path d="M${x} 360 C ${x + bend} ${top + h * 0.6}, ${x - bend} ${top + h * 0.3}, ${x} ${top + 12} Q ${x + w / 2} ${top - 8} ${x + w} ${top + 12} C ${x + w + bend} ${top + h * 0.3}, ${x + w - bend} ${top + h * 0.6}, ${x + w} 360" fill="none" stroke="#b0405a" stroke-width="5" stroke-linecap="round" opacity="0.8"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9c6d6"/><stop offset="1" stop-color="#b9a9c9"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/>${paths}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

let seq = 100;
const nextId = () => `obs-${++seq}`;
const daysAgo = (d: number, h = 10) => {
  const t = new Date();
  t.setDate(t.getDate() - d);
  t.setHours(h, 30, 0, 0);
  return t.toISOString();
};

/** 架空の顧客。山田 花子さんは同姓同名が2人いる（区別の確認用）。 */
const customers: CustomerRecord[] = [
  { id: "p-1", displayName: "山田 花子", nameKana: "やまだ はなこ", birthDate: "1975-04-12", sex: "female", memberNumber: "RM-10000001", localCode: null, note: null },
  { id: "p-2", displayName: "佐藤 一郎", nameKana: "さとう いちろう", birthDate: "1968-09-03", sex: "male", memberNumber: null, localCode: "A-0012", note: null },
  { id: "p-3", displayName: "鈴木 美咲", nameKana: "すずき みさき", birthDate: "1982-01-25", sex: "female", memberNumber: "RM-10000003", localCode: null, note: null },
  { id: "p-4", displayName: "山田 花子", nameKana: "やまだ はなこ", birthDate: "1990-07-30", sex: "female", memberNumber: "RM-10000004", localCode: null, note: null },
];
const customerOf = (patientId: string) => customers.find((c) => c.id === patientId) ?? null;

function record(over: Partial<ObservationRecord> & { id: string }): ObservationRecord {
  const base = recordBase(over);
  const c = customerOf(base.patientId);
  return {
    ...base,
    subjectName: c?.displayName ?? base.subjectName,
    subjectId: c?.localCode ?? base.subjectId,
    customer: c,
  };
}

function recordBase(over: Partial<ObservationRecord> & { id: string }): ObservationRecord {
  return {
    patientId: "p-1",
    reportId: null,
    receiveToken: null,
    subjectName: "山田 花子",
    subjectId: null,
    observedAt: daysAgo(0),
    finger: "left_ring",
    roomTempC: null,
    restMinutes: null,
    restrictionsOk: false,
    densityPerMm: null,
    flow: null,
    color: null,
    flagGiant: false,
    flagHemorrhage: false,
    flagLoss: false,
    flagRamified: false,
    patterns: [],
    changeVsPrev: null,
    adviceMemo: null,
    referralGiven: false,
    summary: "今回の観察では、左手・薬指の毛細血管を確認しました。",
    summaryNote: null,
    nextNote: "次回は3か月後を目安に、同じ指・同じ条件で観察し、変化を比べます。",
    status: "draft",
    finalizedAt: null,
    images: [{ id: `${over.id}/img-1`, url: sampleImage(seq), isPrimary: true }],
    video: null,
    calibrationUmPerPx: null,
    flowSpeedPxPerSec: null,
    flowSpeedMmPerSec: null,
    flowSpeedMethod: null,
    trialName: null,
    trialGroup: null,
    interventions: [],
    consent: { ...UNCONFIRMED_CONSENT },
    densityMeasurement: null,
    customer: null,
    ...over,
  };
}

const store: ObservationRecord[] = [
  record({
    id: "obs-4",
    observedAt: daysAgo(0),
    roomTempC: 23,
    restMinutes: 15,
    restrictionsOk: true,
    densityPerMm: 8.5,
    flow: "good",
    color: "bright_red",
    patterns: ["normal", "tortuous"],
    status: "finalized",
    reportId: "rep-4",
    finalizedAt: daysAgo(0),
    images: [
      { id: "obs-4/img-1", url: sampleImage(3), isPrimary: true },
      { id: "obs-4/img-2", url: sampleImage(4), isPrimary: false },
    ],
    consent: normalizeConsent({ caseUse: "granted", caseScope: "anonymous", futureResearch: "granted" }),
  }),
  record({
    id: "obs-3",
    observedAt: daysAgo(92),
    roomTempC: 23,
    restMinutes: 15,
    restrictionsOk: true,
    densityPerMm: 7.5,
    flow: "slow",
    color: "dark_red",
    patterns: ["tortuous", "dilated_loop"],
    status: "finalized",
    reportId: "rep-3",
    finalizedAt: daysAgo(92),
    images: [{ id: "obs-3/img-1", url: sampleImage(1), isPrimary: true }],
    consent: normalizeConsent({ caseUse: "granted", caseScope: "internal", futureResearch: "unconfirmed" }),
  }),
  record({
    id: "obs-6",
    observedAt: daysAgo(185),
    roomTempC: 23,
    restMinutes: 15,
    restrictionsOk: true,
    densityPerMm: 7,
    patterns: ["tortuous"],
    status: "finalized",
    reportId: "rep-6",
    finalizedAt: daysAgo(185),
    images: [{ id: "obs-6/img-1", url: sampleImage(6), isPrimary: true }],
  }),
  record({
    id: "obs-5",
    observedAt: daysAgo(280),
    densityPerMm: 6.5,
    patterns: ["tortuous", "dilated_loop"],
    status: "finalized",
    reportId: "rep-5",
    finalizedAt: daysAgo(280),
    images: [{ id: "obs-5/img-1", url: sampleImage(7), isPrimary: true }],
  }),
  record({
    id: "obs-2",
    patientId: "p-2",
    subjectName: "佐藤 一郎",
    subjectId: "A-0012",
    observedAt: daysAgo(3),
    patterns: ["normal"],
    images: [{ id: "obs-2/img-1", url: sampleImage(2), isPrimary: true }],
  }),
  record({
    id: "obs-1",
    patientId: "p-3",
    subjectName: "鈴木 美咲",
    observedAt: daysAgo(10),
    densityPerMm: 6,
    patterns: ["capillary_loss", "hemorrhage"],
    flagLoss: true,
    flagHemorrhage: true,
    status: "finalized",
    reportId: "rep-1",
    finalizedAt: daysAgo(10),
    images: [{ id: "obs-1/img-1", url: sampleImage(5), isPrimary: true }],
  }),
];

const find = (id: string) => {
  const o = store.find((x) => x.id === id);
  if (!o) throw new Error("観察が見つかりません");
  return o;
};
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const hasFlag = (o: ObservationRecord) =>
  o.flagGiant || o.flagHemorrhage || o.flagLoss || o.flagRamified;
const toItem = (o: ObservationRecord): ObservationListItem => ({
  id: o.id,
  patientId: o.patientId,
  memberNumber: customerOf(o.patientId)?.memberNumber ?? null,
  subjectName: o.subjectName,
  subjectId: o.subjectId,
  observedAt: o.observedAt,
  finger: o.finger,
  status: o.status,
  hasClinicalFlag: hasFlag(o),
  patternCount: o.patterns.length,
  densityPerMm: o.densityPerMm,
  patternCodes: o.patterns,
  primaryImageUrl: (o.images.find((i) => i.isPrimary) ?? o.images[0])?.url ?? null,
  hasVideo: Boolean(o.video),
  flowSpeedMmPerSec: o.flowSpeedMmPerSec,
  trialName: o.trialName,
});
function assertSavable(input: CustomerInput, ignoreId?: string) {
  const invalid = validateCustomerInput(input);
  if (invalid) throw new Error(invalid);
  const dup = findDuplicate(input, customers, ignoreId);
  if (dup?.kind === "memberNumber")
    throw new Error(`この会員番号は「${dup.customer.displayName}」さんで登録済みです。一覧から選んでください。`);
  if (dup?.kind === "nameAndBirth")
    throw new Error(`同じお名前・生年月日の方（${dup.customer.displayName}さん）が登録済みです。一覧から選んでください。`);
}
const fromInput = (id: string, input: CustomerInput): CustomerRecord => ({
  id,
  displayName: input.displayName.trim(),
  nameKana: input.nameKana?.trim() || null,
  birthDate: input.birthDate || null,
  sex: input.sex ?? null,
  memberNumber: normalizeMemberNumber(input.memberNumber),
  localCode: input.localCode?.trim() || null,
  note: input.note?.trim() || null,
});

export const api: typeof RealApi = {
  async listObservations(args) {
    await wait();
    const search = args.search?.trim() ?? "";
    const rows = [...store]
      .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
      .filter((o) => {
        const c = customerOf(o.patientId);
        return !search || (c ? matchesCustomer(c, search) : o.subjectName.includes(search));
      });
    return { observations: rows.slice(0, args.limit ?? 100).map(toItem) };
  },
  async listCustomers(args) {
    await wait();
    return {
      customers: customers
        .filter((c) => matchesCustomer(c, args.search ?? ""))
        .sort((x, y) => (x.nameKana ?? x.displayName).localeCompare(y.nameKana ?? y.displayName, "ja")),
    };
  },
  async getCustomer(args) {
    await wait();
    return {
      customer: customerOf(args.id),
      observations: store
        .filter((o) => o.patientId === args.id)
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
        .map(toItem),
    };
  },
  async createCustomer(args) {
    await wait(300);
    assertSavable(args);
    const id = `p-${Date.now()}`;
    customers.push(fromInput(id, args));
    return { id };
  },
  async updateCustomer(args) {
    await wait(300);
    assertSavable(args, args.id);
    const i = customers.findIndex((c) => c.id === args.id);
    if (i >= 0) customers[i] = fromInput(args.id, args);
    for (const o of store.filter((x) => x.patientId === args.id)) {
      o.customer = customers[i];
      o.subjectName = customers[i].displayName;
      o.subjectId = customers[i].localCode;
    }
    return { ok: true };
  },
  async getObservation(args) {
    await wait();
    return { observation: store.find((o) => o.id === args.id) ?? null };
  },
  async getSubjectHistory(args) {
    await wait();
    const me = store.find((o) => o.id === args.id);
    if (!me) return { observations: [] };
    return {
      observations: store
        .filter((o) => o.patientId === me.patientId)
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt))
        .map((o) => ({ id: o.id, observedAt: o.observedAt, status: o.status })),
    };
  },
  async createObservation(args) {
    await wait(400);
    const id = nextId();
    store.push(
      record({
        id,
        patientId: args.customerId ?? `p-${id}`,
        subjectName: args.subjectName,
        subjectId: args.subjectId ?? null,
        observedAt: args.observedAt,
        finger: args.finger,
        roomTempC: args.roomTempC ?? null,
        restMinutes: args.restMinutes ?? null,
        restrictionsOk: args.restrictionsOk,
        densityPerMm: args.densityPerMm ?? null,
        densityMeasurement: args.densityMeasurement ?? null,
        flow: args.flow ?? null,
        color: args.color ?? null,
        flagGiant: args.flagGiant,
        flagHemorrhage: args.flagHemorrhage,
        flagLoss: args.flagLoss,
        flagRamified: args.flagRamified,
        patterns: args.patterns,
        adviceMemo: args.adviceMemo ?? null,
        summaryNote: args.summaryNote ?? null,
        summary: args.summaryNote ?? "今回の観察では、左手・薬指の毛細血管を確認しました。",
        referralGiven: args.referralGiven,
        images:
          args.images.length > 0
            ? args.images.map((img, i) => ({
                id: `${id}/img-${i}`,
                url: `data:${img.mimeType};base64,${img.dataBase64}`,
                isPrimary: i === (args.primaryIndex ?? 0),
              }))
            : [],
        consent: normalizeConsent(args.consent),
      }),
    );
    return { id };
  },
  async updateObservation(args) {
    await wait(300);
    const o = find(args.id);
    Object.assign(o, {
      subjectName: args.subjectName,
      subjectId: args.subjectId ?? null,
      observedAt: args.observedAt,
      finger: args.finger,
      roomTempC: args.roomTempC ?? null,
      restMinutes: args.restMinutes ?? null,
      restrictionsOk: args.restrictionsOk,
      densityPerMm: args.densityPerMm ?? null,
      flow: args.flow ?? null,
      color: args.color ?? null,
      flagGiant: args.flagGiant,
      flagHemorrhage: args.flagHemorrhage,
      flagLoss: args.flagLoss,
      flagRamified: args.flagRamified,
      patterns: args.patterns,
      adviceMemo: args.adviceMemo ?? null,
      summaryNote: args.summaryNote ?? null,
      referralGiven: args.referralGiven,
    });
    if (args.consent) o.consent = normalizeConsent(args.consent);
    if (args.densityMeasurement !== undefined) o.densityMeasurement = args.densityMeasurement;
    return { ok: true };
  },
  async addImage(args) {
    const o = find(args.observationId);
    const imageId = `${o.id}/img-${Date.now()}`;
    o.images.push({
      id: imageId,
      url: `data:${args.image.mimeType};base64,${args.image.dataBase64}`,
      isPrimary: Boolean(args.makePrimary) || o.images.length === 0,
    });
    return { imageId };
  },
  async removeImage(args) {
    for (const o of store) o.images = o.images.filter((i) => i.id !== args.imageId);
    return { ok: true };
  },
  async setPrimaryImage(args) {
    const o = find(args.observationId);
    o.images = o.images.map((i) => ({ ...i, isPrimary: i.id === args.imageId }));
    return { ok: true };
  },
  async setVideo() {
    return { ok: true };
  },
  async removeVideo(args) {
    find(args.observationId).video = null;
    return { ok: true };
  },
  async saveFlowMeasurement(args) {
    const o = find(args.id);
    o.flowSpeedPxPerSec = args.speedPxPerSec;
    o.flowSpeedMmPerSec = args.speedMmPerSec;
    o.calibrationUmPerPx = args.calibrationUmPerPx;
    o.flowSpeedMethod = args.method;
    return { ok: true };
  },
  async clearFlowMeasurement(args) {
    const o = find(args.id);
    o.flowSpeedPxPerSec = null;
    o.flowSpeedMmPerSec = null;
    return { ok: true };
  },
  async finalizeObservation(args) {
    await wait(300);
    const o = find(args.id);
    o.status = "finalized";
    o.reportId = `rep-${o.id}`;
    o.finalizedAt = new Date().toISOString();
    o.receiveToken = "preview-token";
    return { receiveToken: o.receiveToken, claimError: null };
  },
  async deleteObservation(args) {
    const i = store.findIndex((o) => o.id === args.id);
    if (i >= 0) store.splice(i, 1);
    return { ok: true };
  },
  async listTrialNames() {
    return { trialNames: [] };
  },
  async exportTrialData() {
    return { observations: [] };
  },
  async analyzeImagePatterns() {
    await wait(900);
    return {
      configured: true,
      candidates: [
        { code: "normal", confidence: "high", reason: "まっすぐなヘアピン型がそろって並んでいます。", location: { x: 35, y: 45 } },
        { code: "tortuous", confidence: "medium", reason: "中央付近にゆるやかにうねるループがあります。", location: { x: 62, y: 50 } },
      ],
    };
  },
  async draftReportText() {
    await wait(700);
    return {
      configured: true,
      summary: "今回の観察では、左手・薬指の毛細血管を確認しました。まっすぐなヘアピン型がそろって並んでいます。",
      advice: "体を冷やさないようにし、同じ条件で次回も観察していきましょう。",
    };
  },
  async fetchStoredImageInput(): Promise<ImageInput> {
    return { dataBase64: "", mimeType: "image/png" };
  },
  async fetchStoredBlob() {
    return new Blob();
  },
};
