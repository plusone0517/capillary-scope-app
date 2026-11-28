// データ層（本番）：試用版（Space）の server actions と同じ呼び出し形を、
// Firestore + Storage + Cloud Functions で実装する互換レイヤー。
// 各コンポーネントはこの `api` を import して使う（試用版の api.ts の置き換え）。
//
// データの持ち方（正は src/types/models.ts）:
// - patients/{patientId}      対象者。観察の subjectName / subjectId はここから引く。
// - observations/{id}         観察。画像・動画の実体は Storage、参照は MediaRef。
// - reports/{reportId}        確定レポート。確定時に作成し、受け取りQRは
//                             Functions の issueClaimToken で発行する。
// - Storage パスは storage.rules の定義どおり
//   capillary/{patientId}/{observationId}/images|videos/{fileName}。
//
// 試用版との差分（データモデルの都合で吸収した点）:
// - 室温・安静時間が未入力の回は conditions に null を入れる（未記録を
//   数値で偽らないため。models.ts の型は number だが、実データでは
//   「記録なし」を表す必要があるため、この2項目だけ null を許容する）。
// - 所見のまとめ（summary）は原則として表示時に所見から組み立てる
//   （models.ts の Report の方針「表示内容は観察データから都度組み立てる」）。
//   ただしスタッフが手直しした文（AIの下書きを直した場合を含む）は
//   observations.summaryNote に保存し、表示時はそちらを優先する。
//   次回について（nextNote）は標準文を表示時に組み立てる。
// - 動画の長さ（durationSec）は MediaRef に項目がないため保存しない（null を返す）。
// - 血流速度の校正値と px/秒は FlowVelocity.note に機械可読な形で保持する
//   （note = "pxPerSec=<値>;umPerPx=<値>"）。表示用の値は value/unit が正。
// - 試験の種別・タイミング・群は、画面側コード（試用版 trial.ts）と
//   models.ts のコードの間でこのレイヤーが相互変換する。
// - 受け取りトークンはサーバーにハッシュしか残らないため、発行した
//   その端末の sessionStorage にだけ保持し、QR の再表示に使う。

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit as fsLimit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore";
import {
  deleteObject,
  getBlob,
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions, storage } from "./firebase";
import {
  findDuplicate,
  matchesCustomer,
  normalizeMemberNumber,
  validateCustomerInput,
  type CustomerInput,
  type CustomerRecord,
} from "./customer";
import {
  CONSENT_FORM_VERSION,
  UNCONFIRMED_CONSENT,
  normalizeConsent,
  sameConsent,
  type ConsentState,
} from "./consent";
import type {
  AuditAction,
  GasType,
  Intervention,
  InterventionTiming,
  InterventionType,
  MediaRef,
  Observation,
  Patient,
  Report,
  StudyInfo,
} from "./types/models";
import {
  capillaryChangeLabels,
  capillaryClinicalFlagLabels,
  capillaryColorLabels,
  capillaryFingerLabels,
  capillaryFlowLabels,
  capillaryPatternByCode,
  type ClinicalFlagKey,
} from "./patterns";

/* ================= 画面側の型（試用版 observationOut と同じ形） ================= */

export type InterventionRecord = {
  id: number;
  category: string;
  gasType: string | null;
  detail: string;
  timing: string;
};

export type ObservationImageRecord = {
  /** Storage パスをそのまま識別子として使う。 */
  id: string;
  url: string;
  isPrimary: boolean;
};

export type ObservationVideoRecord = {
  url: string;
  mimeType: string;
  /** Storage パス（動画から静止画を切り出すときなどに、実体を読み直すために使う）。 */
  storagePath: string;
  /** MediaRef に長さの項目がないため、保存済み動画では常に null。 */
  durationSec: number | null;
};

export type ObservationRecord = {
  id: string;
  patientId: string;
  /** 確定レポートのID（未確定は null）。受け取りQRはこのIDとトークンで作る。 */
  reportId: string | null;
  /** 発行済み受け取りトークン（この端末で発行した場合のみ。再読み込みで消える）。 */
  receiveToken: string | null;
  subjectName: string;
  subjectId: string | null;
  observedAt: string;
  finger: string;
  roomTempC: number | null;
  restMinutes: number | null;
  restrictionsOk: boolean;
  densityPerMm: number | null;
  flow: string | null;
  color: string | null;
  flagGiant: boolean;
  flagHemorrhage: boolean;
  flagLoss: boolean;
  flagRamified: boolean;
  patterns: string[];
  changeVsPrev: string | null;
  adviceMemo: string | null;
  referralGiven: boolean;
  /**
   * レポートに表示する「所見のまとめ」。スタッフが手直しした保存値
   * （summaryNote）があればそれ、なければ表示時に所見から組み立てる。
   */
  summary: string | null;
  /** スタッフが手直しした「所見のまとめ」の保存値。未保存は null。 */
  summaryNote: string | null;
  /** 表示時に組み立てる標準文。 */
  nextNote: string | null;
  status: string;
  finalizedAt: string | null;
  images: ObservationImageRecord[];
  video: ObservationVideoRecord | null;
  calibrationUmPerPx: number | null;
  flowSpeedPxPerSec: number | null;
  flowSpeedMmPerSec: number | null;
  flowSpeedMethod: string | null;
  trialName: string | null;
  trialGroup: string | null;
  interventions: InterventionRecord[];
  /** 同意の記録（旧データは未確認）。 */
  consent: ConsentState;
  /** この観察の顧客（会員番号・生年月日など）。顧客が読めない場合は null。 */
  customer: CustomerRecord | null;
};

export type ObservationListItem = {
  id: string;
  /** 顧客ID（patients のドキュメントID）。 */
  patientId: string;
  /** ルーツマイルの会員番号（未登録は null）。 */
  memberNumber: string | null;
  subjectName: string;
  subjectId: string | null;
  observedAt: string;
  finger: string;
  status: string;
  hasClinicalFlag: boolean;
  patternCount: number;
  /** 一覧カードの要約表示用（保存済みの値をそのまま渡す読み取り専用の射影）。 */
  densityPerMm: number | null;
  /** 一覧カードの要約表示用（パターンコードの配列）。 */
  patternCodes: string[];
  primaryImageUrl: string | null;
  hasVideo: boolean;
  flowSpeedMmPerSec: number | null;
  trialName: string | null;
};

export type TrialExportRow = {
  id: string;
  observedAt: string;
  subjectName: string;
  subjectId: string | null;
  trialGroup: string | null;
  finger: string;
  densityPerMm: number | null;
  flowSpeedMmPerSec: number | null;
  flow: string | null;
  color: string | null;
  patterns: string[];
  hasClinicalFlag: boolean;
  interventions: {
    category: string;
    gasType: string | null;
    detail: string;
    timing: string;
  }[];
  /** 同意の記録（旧データは未確認）。データを使ってよい範囲の確認用。 */
  consent: ConsentState;
};

/* ================= 入力の型（試用版 actions の引数と同じ形） ================= */

export type ImageInput = {
  dataBase64: string;
  mimeType: "image/jpeg" | "image/png";
};

/** AI候補提示（試作）の候補1件。Functions の analyzeImagePatterns の戻り値。 */
export type AiPatternCandidate = {
  /** 28種の正規コード（サーバー側で照合済み）。 */
  code: string;
  confidence: "high" | "medium" | "low";
  /** そう見える理由（画像のどこがどう見えるか）。 */
  reason: string;
  /**
   * その特徴が見える代表点。画像の左上を原点とするパーセント座標
   * （x: 左端0〜右端100、y: 上端0〜下端100）。AIが位置を特定できない
   * 候補では null。旧い応答では欠ける場合があるため任意項目。
   */
  location?: { x: number; y: number } | null;
};

export type AnalyzeImagePatternsResult = {
  /** APIキーが未設定のときは false（エラーではなく未設定として扱う）。 */
  configured: boolean;
  candidates: AiPatternCandidate[];
};

/** AIによるレポート文の下書き（試作）の結果。Functions の draftReportText の戻り値。 */
export type DraftReportTextResult = {
  /** APIキーが未設定のときは false（エラーではなく未設定として扱う）。 */
  configured: boolean;
  /** 所見のまとめの下書き。 */
  summary: string;
  /** アドバイスの下書き。 */
  advice: string;
};

export type VideoInput = {
  /**
   * 動画の実体。Blob があればそのままアップロードする（base64 化しないため、
   * 大きな動画でもメモリを圧迫しない）。dataBase64 は Blob を持てない
   * 経路のための予備で、どちらか一方を指定する。
   */
  blob?: Blob;
  dataBase64?: string;
  mimeType: "video/webm" | "video/mp4";
  durationSec?: number;
};

export type InterventionInput = {
  category: string;
  gasType?: string;
  detail: string;
  timing: string;
};

export type ObservationInput = {
  /**
   * 顧客ID。指定があれば、この顧客の観察として保存する（氏名での突き合わせはしない）。
   * 同姓同名の別人が1人に混ざらないよう、画面からは必ずこれを渡す。
   */
  customerId?: string;
  subjectName: string;
  subjectId?: string;
  observedAt: string;
  finger: string;
  roomTempC?: number;
  restMinutes?: number;
  restrictionsOk: boolean;
  densityPerMm?: number;
  flow?: string;
  color?: string;
  flagGiant: boolean;
  flagHemorrhage: boolean;
  flagLoss: boolean;
  flagRamified: boolean;
  patterns: string[];
  changeVsPrev?: string;
  adviceMemo?: string;
  /** 手直しした「所見のまとめ」。空なら表示時に自動組立する。 */
  summaryNote?: string;
  referralGiven: boolean;
  trialName?: string;
  trialGroup?: string;
  interventions?: InterventionInput[];
  /**
   * 同意の記録。省略した更新では、保存済みの同意に触らない
   * （同意の欄を持たない画面からの更新で「未確認」に戻さないため）。
   */
  consent?: ConsentState;
};

export type CreateObservationArgs = ObservationInput & {
  images: ImageInput[];
  primaryIndex?: number;
  video?: VideoInput;
  calibrationUmPerPx?: number;
};

export type UpdateObservationArgs = ObservationInput & {
  id: string;
  calibrationUmPerPx?: number;
};

/* ================= 試験コードの相互変換（画面 ⇔ models.ts） ================= */

const CATEGORY_TO_TYPE: Record<string, InterventionType> = {
  gas: "gas_inhalation",
  supplement: "supplement_food",
  exercise: "exercise",
  heat: "thermal",
  other: "other",
};
const TYPE_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_TO_TYPE).map(([k, v]) => [v, k]),
);
const TIMING_TO_MODEL: Record<string, InterventionTiming> = {
  before_obs: "before",
  after_obs: "after",
  between_visits: "during_period",
};
const TIMING_FROM_MODEL: Record<string, string> = Object.fromEntries(
  Object.entries(TIMING_TO_MODEL).map(([k, v]) => [v, k]),
);

function buildStudy(input: ObservationInput): StudyInfo | null {
  const studyName = input.trialName?.trim() ?? "";
  const interventions = input.interventions ?? [];
  if (!studyName && interventions.length === 0) return null;
  return {
    studyName,
    group: input.trialGroup?.includes("対照") ? "control" : "intervention",
    interventions: interventions.map((iv) => ({
      type: CATEGORY_TO_TYPE[iv.category] ?? "other",
      gasType:
        iv.category === "gas" ? ((iv.gasType ?? null) as GasType | null) : null,
      detail: iv.detail,
      timing: TIMING_TO_MODEL[iv.timing] ?? "during_period",
    })),
  };
}

function studyToCompat(study: StudyInfo | null): {
  trialName: string | null;
  trialGroup: string | null;
  interventions: InterventionRecord[];
} {
  if (!study) return { trialName: null, trialGroup: null, interventions: [] };
  return {
    trialName: study.studyName ? study.studyName : null,
    trialGroup: study.group === "control" ? "対照群" : "実施群",
    interventions: study.interventions.map((iv: Intervention, i) => ({
      id: i,
      category: TYPE_TO_CATEGORY[iv.type] ?? "other",
      gasType: iv.gasType ?? null,
      detail: iv.detail,
      timing: TIMING_FROM_MODEL[iv.timing] ?? "between_visits",
    })),
  };
}

/* ================= 血流速度（FlowVelocity ⇔ 画面の3値） ================= */

function encodeFlowNote(
  calibrationUmPerPx: number | null,
  pxPerSec: number,
): string {
  return `pxPerSec=${pxPerSec};umPerPx=${calibrationUmPerPx ?? ""}`;
}

function parseFlowNote(note: string | undefined): {
  pxPerSec: number | null;
  umPerPx: number | null;
} {
  if (!note) return { pxPerSec: null, umPerPx: null };
  const get = (key: string): number | null => {
    const m = note.match(new RegExp(`${key}=([0-9.]+)`));
    if (!m || !m[1]) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  };
  return { pxPerSec: get("pxPerSec"), umPerPx: get("umPerPx") };
}

function flowToCompat(obs: Observation): {
  calibrationUmPerPx: number | null;
  flowSpeedPxPerSec: number | null;
  flowSpeedMmPerSec: number | null;
  flowSpeedMethod: string | null;
} {
  const fv = obs.flowVelocity;
  if (!fv) {
    return {
      calibrationUmPerPx: null,
      flowSpeedPxPerSec: null,
      flowSpeedMmPerSec: null,
      flowSpeedMethod: null,
    };
  }
  const parsed = parseFlowNote(fv.note);
  let px = parsed.pxPerSec;
  let mm: number | null = null;
  if (fv.unit === "mm_per_sec") {
    mm = fv.value;
    if (px == null && parsed.umPerPx != null && parsed.umPerPx > 0) {
      px = (fv.value * 1000) / parsed.umPerPx;
    }
  } else {
    px = fv.value;
    if (parsed.umPerPx != null) mm = (fv.value * parsed.umPerPx) / 1000;
  }
  return {
    calibrationUmPerPx: parsed.umPerPx,
    flowSpeedPxPerSec: px,
    flowSpeedMmPerSec: mm,
    flowSpeedMethod: fv.method,
  };
}

/* ================= 所見のまとめ・次回文（表示時に組み立てる） ================= */

const STANDARD_NEXT_NOTE =
  "次回は3か月後を目安に、同じ指・同じ条件で観察し、変化を比べます。";

function buildSummaryText(r: {
  finger: string;
  densityPerMm: number | null;
  flow: string | null;
  color: string | null;
  patterns: string[];
  changeVsPrev: string | null;
  flagGiant: boolean;
  flagHemorrhage: boolean;
  flagLoss: boolean;
  flagRamified: boolean;
}): string {
  const parts: string[] = [];
  parts.push(
    `今回の観察では、${capillaryFingerLabels[r.finger] ?? "指"}の毛細血管を確認しました。`,
  );
  if (r.densityPerMm != null)
    parts.push(`密度は1mmあたり${r.densityPerMm}本でした。`);
  if (r.flow) parts.push(`流れの印象は「${capillaryFlowLabels[r.flow] ?? r.flow}」でした。`);
  if (r.color)
    parts.push(`色の印象は「${capillaryColorLabels[r.color] ?? r.color}」でした。`);
  const names = r.patterns
    .map((code) => capillaryPatternByCode[code]?.name)
    .filter((n): n is string => Boolean(n));
  if (names.length > 0)
    parts.push(`形は「${names.join("」「")}」に近いものが見られました。`);
  if (r.changeVsPrev)
    parts.push(
      `前回との比較では「${capillaryChangeLabels[r.changeVsPrev] ?? r.changeVsPrev}」です。`,
    );
  const flagNames = (
    [
      ["giant", r.flagGiant],
      ["hemorrhage", r.flagHemorrhage],
      ["loss", r.flagLoss],
      ["ramified", r.flagRamified],
    ] as [ClinicalFlagKey, boolean][]
  )
    .filter(([, on]) => on)
    .map(([k]) => capillaryClinicalFlagLabels[k]);
  if (flagNames.length > 0)
    parts.push(
      `${flagNames.join("、")}が確認されたため、医療機関への受診をおすすめします。`,
    );
  return parts.join("");
}

/* ================= 共通ヘルパー ================= */

/**
 * Firebase のエラーを、スタッフ向けの平易な日本語に置き換える。
 * SDK の英語メッセージ（例：storage/unauthorized の長い文）をそのまま
 * 画面に出さないために、画面側のエラー表示はこの関数を通す。
 * コードが判定できない場合は、元のメッセージをそのまま返す。
 */
export function describeFirebaseError(e: unknown): string {
  const code =
    typeof e === "object" && e !== null && "code" in e
      ? String((e as { code?: unknown }).code ?? "")
      : "";
  switch (code) {
    case "storage/unauthorized":
      return "保存先へのアクセスが許可されませんでした。管理者に、保存先（Storage）の設定を確認するようお伝えください。";
    case "storage/unauthenticated":
      return "ログインの有効期限が切れている可能性があります。一度ログアウトして、ログインし直してください。";
    case "storage/object-not-found":
      return "保存済みのファイルが見つかりませんでした。データが不完全な可能性があります。管理者にお伝えください。";
    case "storage/quota-exceeded":
      return "保存容量の上限に達しています。管理者にお伝えください。";
    case "storage/retry-limit-exceeded":
      return "通信が不安定で、保存を完了できませんでした。ネットワークを確認して、もう一度お試しください。";
    case "storage/canceled":
      return "保存が中断されました。もう一度お試しください。";
    case "permission-denied":
    case "firestore/permission-denied":
      return "この操作を行う権限がありません。スタッフ登録の状態を管理者に確認してください。";
    case "unauthenticated":
      return "ログインが必要です。ログインし直してください。";
    case "unavailable":
    case "firestore/unavailable":
      return "サーバーに接続できませんでした。ネットワークを確認して、もう一度お試しください。";
    case "deadline-exceeded":
      return "処理に時間がかかりすぎました。もう一度お試しください。";
    default:
      break;
  }
  if (e instanceof Error && e.message) return e.message;
  return "処理に失敗しました。もう一度お試しください。";
}

function currentUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("ログインが必要です");
  return uid;
}

async function writeAudit(
  action: AuditAction,
  targetType: "observation" | "report" | "claim" | "patient",
  targetId: string,
  detail?: string,
): Promise<void> {
  try {
    await addDoc(collection(db, "auditLogs"), {
      actorUid: currentUid(),
      action,
      targetType,
      targetId,
      at: serverTimestamp(),
      ...(detail ? { detail } : {}),
    });
  } catch {
    // 監査ログの失敗で本体の操作を止めない。
  }
}

function base64ToBytes(dataBase64: string): Uint8Array {
  const binary = atob(dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("画像の読み込みに失敗しました"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(blob);
  });
}

function newFileToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const patientCache = new Map<string, Patient>();

async function loadPatient(patientId: string): Promise<Patient | null> {
  const cached = patientCache.get(patientId);
  if (cached) return cached;
  const snap = await getDoc(doc(db, "patients", patientId));
  if (!snap.exists()) return null;
  const patient = snap.data() as Patient;
  patientCache.set(patientId, patient);
  return patient;
}

async function loadAllPatients(): Promise<Map<string, Patient>> {
  const snap = await getDocs(collection(db, "patients"));
  const map = new Map<string, Patient>();
  for (const d of snap.docs) {
    const patient = d.data() as Patient;
    map.set(d.id, patient);
    patientCache.set(d.id, patient);
  }
  return map;
}

function toCustomer(id: string, p: Patient): CustomerRecord {
  return {
    id,
    displayName: p.displayName ?? "",
    nameKana: p.nameKana ? p.nameKana : null,
    birthDate: p.birthDate ? p.birthDate : null,
    sex: p.sex === "female" || p.sex === "male" || p.sex === "other" ? p.sex : null,
    memberNumber: p.memberNumber ? p.memberNumber : null,
    localCode: p.patientCode ? p.patientCode : null,
    note: p.note ? p.note : null,
  };
}

async function loadAllCustomers(): Promise<CustomerRecord[]> {
  const patients = await loadAllPatients();
  return [...patients.entries()].map(([id, p]) => toCustomer(id, p));
}

function customerDocFromInput(input: CustomerInput): DocumentData {
  return {
    displayName: input.displayName.trim(),
    nameKana: input.nameKana?.trim() ? input.nameKana.trim() : null,
    birthDate: input.birthDate ? input.birthDate : null,
    sex: input.sex ?? null,
    memberNumber: normalizeMemberNumber(input.memberNumber),
    patientCode: input.localCode?.trim() ?? "",
    note: input.note?.trim() ?? "",
    updatedAt: serverTimestamp(),
  };
}

/** 入力の検査と重複の確認。問題があれば日本語のメッセージで例外にする。 */
async function assertCustomerSavable(input: CustomerInput, ignoreId?: string): Promise<void> {
  const invalid = validateCustomerInput(input);
  if (invalid) throw new Error(invalid);
  const dup = findDuplicate(input, await loadAllCustomers(), ignoreId);
  if (dup?.kind === "memberNumber")
    throw new Error(
      `この会員番号は「${dup.customer.displayName}」さんで登録済みです。一覧から選んでください。`,
    );
  if (dup?.kind === "nameAndBirth")
    throw new Error(
      `同じお名前・生年月日の方（${dup.customer.displayName}さん）が登録済みです。一覧から選んでください。`,
    );
}

async function findOrCreatePatient(
  displayName: string,
  patientCode: string,
): Promise<string> {
  const snap = await getDocs(
    query(collection(db, "patients"), where("displayName", "==", displayName)),
  );
  for (const d of snap.docs) {
    const p = d.data() as Patient;
    if ((p.patientCode ?? "") === patientCode) return d.id;
  }
  const ref = await addDoc(collection(db, "patients"), {
    displayName,
    patientCode,
    rootsMemberId: null,
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

async function findReportForObservation(
  observationId: string,
): Promise<{ id: string; report: Report } | null> {
  const snap = await getDocs(
    query(
      collection(db, "reports"),
      where("observationId", "==", observationId),
      fsLimit(1),
    ),
  );
  const first = snap.docs[0];
  if (!first) return null;
  return { id: first.id, report: first.data() as Report };
}

const CLAIM_TOKEN_KEY = (reportId: string) => `capillary-claim-token:${reportId}`;

function cachedClaimToken(reportId: string | null): string | null {
  if (!reportId) return null;
  try {
    return window.sessionStorage.getItem(CLAIM_TOKEN_KEY(reportId));
  } catch {
    return null;
  }
}

/** 画像の所属（removeImage は試用版の形に合わせて画像IDだけで呼ばれる）。 */
const imageOwnerCache = new Map<string, string>();

async function downloadUrl(path: string): Promise<string> {
  return getDownloadURL(storageRef(storage, path));
}

/** Firestore の Observation を画面側の形へ変換する。 */
async function toRecord(
  id: string,
  obs: Observation,
): Promise<ObservationRecord> {
  const patient = await loadPatient(obs.patientId);
  const reportInfo = await findReportForObservation(id);
  const flow = flowToCompat(obs);
  const study = studyToCompat(obs.study ?? null);

  const images: ObservationImageRecord[] = [];
  for (const media of obs.images ?? []) {
    imageOwnerCache.set(media.storagePath, id);
    // 1ファイルだけ URL が取れなくても、レポート全体を開けるようにする
    // （URL が空の画像は表示側で「画像なし」と同じ扱いになる）。
    let url = "";
    try {
      url = await downloadUrl(media.storagePath);
    } catch {
      url = "";
    }
    images.push({
      id: media.storagePath,
      url,
      isPrimary: media.isPrimary ?? false,
    });
  }
  const firstVideo = (obs.videos ?? [])[0];
  let video: ObservationVideoRecord | null = null;
  if (firstVideo) {
    let url = "";
    try {
      url = await downloadUrl(firstVideo.storagePath);
    } catch {
      url = "";
    }
    video = {
      url,
      mimeType: firstVideo.contentType,
      storagePath: firstVideo.storagePath,
      durationSec: null,
    };
  }

  const base = {
    finger: obs.finger,
    densityPerMm: obs.densityPerMm ?? null,
    flow: obs.flowImpression ? obs.flowImpression : null,
    color: obs.colorImpression ? obs.colorImpression : null,
    patterns: obs.patterns ?? [],
    changeVsPrev: obs.changeVsPrevious ?? null,
    flagGiant: obs.clinicalFlags?.giant ?? false,
    flagHemorrhage: obs.clinicalFlags?.hemorrhage ?? false,
    flagLoss: obs.clinicalFlags?.loss ?? false,
    flagRamified: obs.clinicalFlags?.ramified ?? false,
  };

  return {
    id,
    patientId: obs.patientId,
    reportId: reportInfo?.id ?? null,
    receiveToken: cachedClaimToken(reportInfo?.id ?? null),
    subjectName: patient?.displayName ?? "",
    subjectId: patient?.patientCode ? patient.patientCode : null,
    observedAt: obs.recordedAt?.toDate
      ? obs.recordedAt.toDate().toISOString()
      : new Date().toISOString(),
    roomTempC: (obs.conditions?.roomTempC as number | null) ?? null,
    restMinutes: (obs.conditions?.restMinutes as number | null) ?? null,
    restrictionsOk: obs.conditions?.restrictionsOk ?? false,
    adviceMemo: obs.adviceNote ? obs.adviceNote : null,
    referralGiven: obs.referralGiven ?? false,
    // 手直ししたまとめが保存されていればそれを優先し、なければ自動組立。
    summary: obs.summaryNote?.trim()
      ? obs.summaryNote
      : buildSummaryText(base),
    summaryNote: obs.summaryNote?.trim() ? obs.summaryNote : null,
    nextNote: STANDARD_NEXT_NOTE,
    status: obs.status,
    finalizedAt: reportInfo?.report.finalizedAt?.toDate
      ? reportInfo.report.finalizedAt.toDate().toISOString()
      : null,
    images,
    video,
    ...flow,
    ...study,
    ...base,
    consent: normalizeConsent(obs.consent),
    customer: patient ? toCustomer(obs.patientId, patient) : null,
  };
}

/**
 * 保存用の同意データ。記録日時と記録者は、内容を新しく記録するときだけ付ける。
 */
function consentDocFromState(state: ConsentState): DocumentData {
  return {
    ...normalizeConsent(state),
    formVersion: CONSENT_FORM_VERSION,
    recordedAt: serverTimestamp(),
    recordedBy: currentUid(),
  };
}

function observationDataFromInput(
  input: ObservationInput,
  patientId: string,
): DocumentData {
  return {
    patientId,
    recordedAt: Timestamp.fromDate(new Date(input.observedAt)),
    finger: input.finger,
    conditions: {
      // 未入力は null（未記録）。数値で偽らないための意図的な null。
      roomTempC: input.roomTempC ?? null,
      restMinutes: input.restMinutes ?? null,
      restrictionsOk: input.restrictionsOk,
    },
    densityPerMm: input.densityPerMm ?? null,
    flowImpression: input.flow ?? "",
    colorImpression: input.color ?? "",
    patterns: input.patterns,
    clinicalFlags: {
      giant: input.flagGiant,
      hemorrhage: input.flagHemorrhage,
      loss: input.flagLoss,
      ramified: input.flagRamified,
    },
    changeVsPrevious: input.changeVsPrev ?? null,
    adviceNote: input.adviceMemo ?? "",
    summaryNote: input.summaryNote ?? "",
    referralGiven: input.referralGiven,
    study: buildStudy(input),
    updatedAt: serverTimestamp(),
  };
}

async function uploadImage(
  patientId: string,
  observationId: string,
  image: ImageInput,
  index: number,
): Promise<MediaRef> {
  const ext = image.mimeType === "image/png" ? "png" : "jpg";
  const path = `capillary/${patientId}/${observationId}/images/${index}-${newFileToken()}.${ext}`;
  const bytes = base64ToBytes(image.dataBase64);
  await uploadBytes(storageRef(storage, path), bytes, {
    contentType: image.mimeType,
  });
  return { storagePath: path, contentType: image.mimeType, sizeBytes: bytes.length };
}

async function uploadVideo(
  patientId: string,
  observationId: string,
  video: VideoInput,
): Promise<MediaRef> {
  const ext = video.mimeType === "video/mp4" ? "mp4" : "webm";
  const path = `capillary/${patientId}/${observationId}/videos/video-${newFileToken()}.${ext}`;
  // Blob があればそのまま送る（base64 化すると大きな動画でメモリを圧迫する）。
  if (video.blob) {
    await uploadBytes(storageRef(storage, path), video.blob, {
      contentType: video.mimeType,
    });
    return { storagePath: path, contentType: video.mimeType, sizeBytes: video.blob.size };
  }
  if (!video.dataBase64) throw new Error("動画データがありません");
  const bytes = base64ToBytes(video.dataBase64);
  await uploadBytes(storageRef(storage, path), bytes, {
    contentType: video.mimeType,
  });
  return { storagePath: path, contentType: video.mimeType, sizeBytes: bytes.length };
}

async function deleteStorageQuietly(path: string): Promise<void> {
  try {
    await deleteObject(storageRef(storage, path));
  } catch {
    // 既に無い場合などは無視する。
  }
}

async function getObservationDoc(
  id: string,
): Promise<{ ref: ReturnType<typeof doc>; data: Observation }> {
  const ref = doc(db, "observations", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("観察が見つかりません");
  return { ref, data: snap.data() as Observation };
}

/* ================= api 本体 ================= */

/** 一覧用の1件を組み立てる（観察一覧と顧客ごとの履歴で共用）。 */
async function toListItem(
  id: string,
  obs: Observation,
  patient: Patient | null,
): Promise<ObservationListItem> {
  const primary =
    (obs.images ?? []).find((m) => m.isPrimary) ?? (obs.images ?? [])[0];
  let primaryImageUrl: string | null = null;
  if (primary) {
    imageOwnerCache.set(primary.storagePath, id);
    try {
      primaryImageUrl = await downloadUrl(primary.storagePath);
    } catch {
      primaryImageUrl = null;
    }
  }
  const flow = flowToCompat(obs);
  return {
    id,
    patientId: obs.patientId,
    memberNumber: patient?.memberNumber ? patient.memberNumber : null,
    subjectName: patient?.displayName ?? "",
    subjectId: patient?.patientCode ? patient.patientCode : null,
    observedAt: obs.recordedAt?.toDate
      ? obs.recordedAt.toDate().toISOString()
      : new Date().toISOString(),
    finger: obs.finger,
    status: obs.status,
    hasClinicalFlag: Boolean(
      obs.clinicalFlags?.giant ||
        obs.clinicalFlags?.hemorrhage ||
        obs.clinicalFlags?.loss ||
        obs.clinicalFlags?.ramified,
    ),
    patternCount: (obs.patterns ?? []).length,
    densityPerMm: obs.densityPerMm ?? null,
    patternCodes: obs.patterns ?? [],
    primaryImageUrl,
    hasVideo: (obs.videos ?? []).length > 0,
    flowSpeedMmPerSec: flow.flowSpeedMmPerSec,
    trialName: obs.study?.studyName ? obs.study.studyName : null,
  };
}

export const api = {
  async listObservations(args: {
    search?: string;
    limit?: number;
  }): Promise<{ observations: ObservationListItem[] }> {
    const patients = await loadAllPatients();
    const snap = await getDocs(
      query(
        collection(db, "observations"),
        orderBy("recordedAt", "desc"),
        fsLimit(200),
      ),
    );
    const search = args.search?.trim() ?? "";
    const items: ObservationListItem[] = [];
    for (const d of snap.docs) {
      const obs = d.data() as Observation;
      const patient = patients.get(obs.patientId);
      // 氏名・ふりがな・会員番号・施設内番号のいずれでも引けるようにする。
      if (
        search &&
        !(patient && matchesCustomer(toCustomer(obs.patientId, patient), search))
      ) {
        continue;
      }
      items.push(await toListItem(d.id, obs, patient ?? null));
    }
    return { observations: items.slice(0, args.limit ?? 100) };
  },

  /* ---------------- 顧客 ---------------- */

  /** 顧客の一覧（氏名・ふりがな・会員番号・施設内番号で絞り込み）。 */
  async listCustomers(args: { search?: string }): Promise<{ customers: CustomerRecord[] }> {
    const all = await loadAllCustomers();
    const search = args.search?.trim() ?? "";
    const customers = all
      .filter((c) => matchesCustomer(c, search))
      .sort((x, y) =>
        (x.nameKana ?? x.displayName).localeCompare(y.nameKana ?? y.displayName, "ja"),
      );
    return { customers };
  },

  /** 顧客1件と、その人の観察の一覧（新しい順）。 */
  async getCustomer(args: {
    id: string;
  }): Promise<{ customer: CustomerRecord | null; observations: ObservationListItem[] }> {
    const snap = await getDoc(doc(db, "patients", args.id));
    if (!snap.exists()) return { customer: null, observations: [] };
    const patient = snap.data() as Patient;
    patientCache.set(args.id, patient);
    const rows = await getDocs(
      query(collection(db, "observations"), where("patientId", "==", args.id)),
    );
    const observations: ObservationListItem[] = [];
    for (const d of rows.docs) {
      observations.push(await toListItem(d.id, d.data() as Observation, patient));
    }
    observations.sort((x, y) => y.observedAt.localeCompare(x.observedAt));
    return { customer: toCustomer(args.id, patient), observations };
  },

  async createCustomer(args: CustomerInput): Promise<{ id: string }> {
    await assertCustomerSavable(args);
    const ref = await addDoc(collection(db, "patients"), {
      ...customerDocFromInput(args),
      rootsMemberId: null,
      createdBy: currentUid(),
      createdAt: serverTimestamp(),
    });
    patientCache.delete(ref.id);
    return { id: ref.id };
  },

  async updateCustomer(args: CustomerInput & { id: string }): Promise<{ ok: true }> {
    await assertCustomerSavable(args, args.id);
    await updateDoc(doc(db, "patients", args.id), customerDocFromInput(args));
    patientCache.delete(args.id);
    return { ok: true };
  },

  async getObservation(args: {
    id: string;
  }): Promise<{ observation: ObservationRecord | null }> {
    const snap = await getDoc(doc(db, "observations", args.id));
    if (!snap.exists()) return { observation: null };
    return { observation: await toRecord(snap.id, snap.data() as Observation) };
  },

  async getSubjectHistory(args: {
    id: string;
  }): Promise<{ observations: { id: string; observedAt: string; status: string }[] }> {
    const snap = await getDoc(doc(db, "observations", args.id));
    if (!snap.exists()) return { observations: [] };
    const me = snap.data() as Observation;
    const rows = await getDocs(
      query(
        collection(db, "observations"),
        where("patientId", "==", me.patientId),
      ),
    );
    const list = rows.docs.map((d) => {
      const o = d.data() as Observation;
      return {
        id: d.id,
        observedAt: o.recordedAt?.toDate
          ? o.recordedAt.toDate().toISOString()
          : new Date().toISOString(),
        status: o.status,
        time: o.recordedAt?.toMillis ? o.recordedAt.toMillis() : 0,
      };
    });
    list.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    return {
      observations: list.map(({ id, observedAt, status }) => ({
        id,
        observedAt,
        status,
      })),
    };
  },

  async createObservation(
    args: CreateObservationArgs,
  ): Promise<{ id: string }> {
    // 顧客IDがあればその顧客の観察として保存する。氏名での突き合わせは、
    // 顧客IDを渡さない旧経路のためだけに残す。
    const patientId =
      args.customerId ??
      (await findOrCreatePatient(
        args.subjectName.trim(),
        args.subjectId?.trim() ?? "",
      ));
    const obsRef = doc(collection(db, "observations"));
    const primaryIndex = args.primaryIndex ?? 0;
    const images: MediaRef[] = [];
    const videos: MediaRef[] = [];
    try {
      for (const [i, image] of args.images.entries()) {
        const media = await uploadImage(patientId, obsRef.id, image, i);
        images.push({ ...media, isPrimary: i === primaryIndex });
      }
      if (args.video) {
        videos.push(await uploadVideo(patientId, obsRef.id, args.video));
      }
      await setDoc(obsRef, {
        ...observationDataFromInput(args, patientId),
        consent: consentDocFromState(args.consent ?? UNCONFIRMED_CONSENT),
        images,
        videos,
        flowVelocity: null,
        status: "draft",
        createdBy: currentUid(),
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      // 途中で失敗したら、アップロード済みのファイルを片付けてから投げ直す
      // （観察ドキュメントから参照されない孤児ファイルを残さない）。
      for (const media of [...images, ...videos]) {
        await deleteStorageQuietly(media.storagePath);
      }
      throw e;
    }
    await writeAudit("observation.create", "observation", obsRef.id);
    return { id: obsRef.id };
  },

  async updateObservation(args: UpdateObservationArgs): Promise<{ ok: true }> {
    const { ref, data } = await getObservationDoc(args.id);
    let patientId = args.customerId ?? data.patientId;
    const patient = await loadPatient(patientId);
    if (
      !args.customerId &&
      (!patient ||
      patient.displayName !== args.subjectName.trim() ||
      (patient.patientCode ?? "") !== (args.subjectId?.trim() ?? ""))
    ) {
      patientId = await findOrCreatePatient(
        args.subjectName.trim(),
        args.subjectId?.trim() ?? "",
      );
    }
    // 画像・動画・血流速度・状態はこの更新では触らない（試用版と同じ分担）。
    const update = observationDataFromInput(args, patientId);
    // 同意は、欄が渡され、かつ内容が変わったときだけ書き換える
    // （記録日時・記録者・同意書の版を、内容が同じ再保存で上書きしない）。
    if (
      args.consent &&
      !sameConsent(normalizeConsent(args.consent), normalizeConsent(data.consent))
    ) {
      update.consent = consentDocFromState(args.consent);
    }
    await updateDoc(ref, update);
    await writeAudit("observation.update", "observation", args.id);
    return { ok: true };
  },

  async addImage(args: {
    observationId: string;
    image: ImageInput;
    makePrimary?: boolean;
  }): Promise<{ imageId: string }> {
    const { ref, data } = await getObservationDoc(args.observationId);
    const existing = data.images ?? [];
    if (existing.length >= 5) {
      throw new Error("画像は1回の観察で最大5枚までです");
    }
    const media = await uploadImage(
      data.patientId,
      args.observationId,
      args.image,
      existing.length,
    );
    const makePrimary = args.makePrimary || existing.length === 0;
    const next: MediaRef[] = existing.map((m) => ({
      ...m,
      isPrimary: makePrimary ? false : (m.isPrimary ?? false),
    }));
    next.push({ ...media, isPrimary: makePrimary });
    await updateDoc(ref, { images: next, updatedAt: serverTimestamp() });
    imageOwnerCache.set(media.storagePath, args.observationId);
    return { imageId: media.storagePath };
  },

  async removeImage(args: {
    imageId: string;
    /** 分かっている場合は呼び出し側から渡す（キャッシュ依存を避ける）。 */
    observationId?: string;
  }): Promise<{ ok: true }> {
    const observationId = args.observationId ?? imageOwnerCache.get(args.imageId);
    if (!observationId) {
      throw new Error(
        "画像の所属が分かりませんでした。レポートを開き直してからお試しください。",
      );
    }
    const { ref, data } = await getObservationDoc(observationId);
    const target = (data.images ?? []).find(
      (m) => m.storagePath === args.imageId,
    );
    if (!target) return { ok: true };
    let next = (data.images ?? []).filter(
      (m) => m.storagePath !== args.imageId,
    );
    if (target.isPrimary && next.length > 0) {
      next = next.map((m, i) => ({ ...m, isPrimary: i === 0 }));
    }
    // 先にドキュメントを更新してから実体を消す（更新が失敗したときに、
    // ドキュメントが消えたファイルを指したままになるのを避ける）。
    await updateDoc(ref, { images: next, updatedAt: serverTimestamp() });
    await deleteStorageQuietly(target.storagePath);
    imageOwnerCache.delete(args.imageId);
    return { ok: true };
  },

  async setPrimaryImage(args: {
    observationId: string;
    imageId: string;
  }): Promise<{ ok: true }> {
    const { ref, data } = await getObservationDoc(args.observationId);
    const next = (data.images ?? []).map((m) => ({
      ...m,
      isPrimary: m.storagePath === args.imageId,
    }));
    await updateDoc(ref, { images: next, updatedAt: serverTimestamp() });
    return { ok: true };
  },

  async setVideo(args: {
    observationId: string;
    video: VideoInput;
  }): Promise<{ ok: true }> {
    const { ref, data } = await getObservationDoc(args.observationId);
    const oldVideos = data.videos ?? [];
    // 新しい動画を先にアップロードし、ドキュメントを差し替えてから
    // 旧動画の実体を消す（途中で失敗しても旧動画が壊れないようにする）。
    const media = await uploadVideo(
      data.patientId,
      args.observationId,
      args.video,
    );
    try {
      // 動画を差し替えたら、旧動画で測った速度は無効になるため消す（試用版と同じ）。
      await updateDoc(ref, {
        videos: [media],
        flowVelocity: null,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      await deleteStorageQuietly(media.storagePath);
      throw e;
    }
    for (const old of oldVideos) {
      await deleteStorageQuietly(old.storagePath);
    }
    return { ok: true };
  },

  async removeVideo(args: { observationId: string }): Promise<{ ok: true }> {
    const { ref, data } = await getObservationDoc(args.observationId);
    // removeImage と同じく、先にドキュメントを更新してから実体を消す。
    await updateDoc(ref, {
      videos: [],
      flowVelocity: null,
      updatedAt: serverTimestamp(),
    });
    for (const old of data.videos ?? []) {
      await deleteStorageQuietly(old.storagePath);
    }
    return { ok: true };
  },

  async saveFlowMeasurement(args: {
    id: string;
    calibrationUmPerPx: number | null;
    speedPxPerSec: number;
    speedMmPerSec: number | null;
    method: "auto" | "manual";
  }): Promise<{ ok: true }> {
    const { ref } = await getObservationDoc(args.id);
    await updateDoc(ref, {
      flowVelocity: {
        value: args.speedMmPerSec ?? args.speedPxPerSec,
        unit: args.speedMmPerSec != null ? "mm_per_sec" : "px_per_sec",
        method: args.method,
        note: encodeFlowNote(args.calibrationUmPerPx, args.speedPxPerSec),
      },
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  },

  async clearFlowMeasurement(args: { id: string }): Promise<{ ok: true }> {
    const { ref } = await getObservationDoc(args.id);
    await updateDoc(ref, {
      flowVelocity: null,
      updatedAt: serverTimestamp(),
    });
    return { ok: true };
  },

  /**
   * 確定：reports ドキュメントを作成し、観察を finalized にして、
   * Functions の issueClaimToken で受け取りトークンを発行する。
   * Functions が未デプロイ等で発行に失敗しても確定自体は成立させ、
   * claimError に理由を入れて返す（レポート画面は開ける）。
   */
  async finalizeObservation(args: { id: string }): Promise<{
    receiveToken: string | null;
    claimError: string | null;
  }> {
    const { ref, data } = await getObservationDoc(args.id);
    let reportInfo = await findReportForObservation(args.id);
    if (!reportInfo) {
      const reportRef = await addDoc(collection(db, "reports"), {
        observationId: args.id,
        patientId: data.patientId,
        finalizedBy: currentUid(),
        finalizedAt: serverTimestamp(),
        claimId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      reportInfo = { id: reportRef.id, report: {} as Report };
    }
    if (data.status !== "finalized") {
      await updateDoc(ref, {
        status: "finalized",
        updatedAt: serverTimestamp(),
      });
    }
    await writeAudit("report.finalize", "report", reportInfo.id);

    try {
      const issue = httpsCallable<
        { reportId: string },
        { claimId: string; token: string; expiresAt: string }
      >(functions, "issueClaimToken");
      const res = await issue({ reportId: reportInfo.id });
      try {
        window.sessionStorage.setItem(
          CLAIM_TOKEN_KEY(reportInfo.id),
          res.data.token,
        );
      } catch {
        // 保存できなくても、この画面の表示には戻り値のトークンを使う。
      }
      return { receiveToken: res.data.token, claimError: null };
    } catch (e) {
      return {
        receiveToken: cachedClaimToken(reportInfo.id),
        claimError:
          e instanceof Error
            ? e.message
            : "受け取りQRの発行に失敗しました",
      };
    }
  },

  async deleteObservation(args: { id: string }): Promise<{ ok: true }> {
    const { ref, data } = await getObservationDoc(args.id);
    const reportInfo = await findReportForObservation(args.id);
    // 本体のドキュメントを先に消す。権限などで失敗した場合は、
    // レポートやファイルにはまだ触れていない状態で止まる。
    await deleteDoc(ref);
    if (reportInfo) {
      await deleteDoc(doc(db, "reports", reportInfo.id));
    }
    for (const media of [
      ...(data.images ?? []),
      ...(data.videos ?? []),
    ]) {
      await deleteStorageQuietly(media.storagePath);
      imageOwnerCache.delete(media.storagePath);
    }
    // AuditAction に削除の種別がないため、削除の監査ログは書かない。
    return { ok: true };
  },

  async listTrialNames(): Promise<{ trialNames: string[] }> {
    const snap = await getDocs(
      query(
        collection(db, "observations"),
        orderBy("recordedAt", "desc"),
        fsLimit(500),
      ),
    );
    const names = new Set<string>();
    for (const d of snap.docs) {
      const obs = d.data() as Observation;
      const name = obs.study?.studyName?.trim();
      if (name) names.add(name);
    }
    return { trialNames: [...names].sort() };
  },

  async exportTrialData(args: {
    trialName: string;
  }): Promise<{ observations: TrialExportRow[] }> {
    const patients = await loadAllPatients();
    const snap = await getDocs(
      query(
        collection(db, "observations"),
        where("study.studyName", "==", args.trialName),
      ),
    );
    const rows: (TrialExportRow & { time: number })[] = [];
    for (const d of snap.docs) {
      const obs = d.data() as Observation;
      const patient = patients.get(obs.patientId);
      const flow = flowToCompat(obs);
      const study = studyToCompat(obs.study ?? null);
      rows.push({
        id: d.id,
        observedAt: obs.recordedAt?.toDate
          ? obs.recordedAt.toDate().toISOString()
          : new Date().toISOString(),
        subjectName: patient?.displayName ?? "",
        subjectId: patient?.patientCode ? patient.patientCode : null,
        trialGroup: study.trialGroup,
        finger: obs.finger,
        densityPerMm: obs.densityPerMm ?? null,
        flowSpeedMmPerSec: flow.flowSpeedMmPerSec,
        flow: obs.flowImpression ? obs.flowImpression : null,
        color: obs.colorImpression ? obs.colorImpression : null,
        patterns: obs.patterns ?? [],
        hasClinicalFlag: Boolean(
          obs.clinicalFlags?.giant ||
            obs.clinicalFlags?.hemorrhage ||
            obs.clinicalFlags?.loss ||
            obs.clinicalFlags?.ramified,
        ),
        consent: normalizeConsent(obs.consent),
        interventions: study.interventions.map((iv) => ({
          category: iv.category,
          gasType: iv.gasType,
          detail: iv.detail,
          timing: iv.timing,
        })),
        time: obs.recordedAt?.toMillis ? obs.recordedAt.toMillis() : 0,
      });
    }
    rows.sort((a, b) => a.time - b.time);
    return { observations: rows.map(({ time: _time, ...rest }) => rest) };
  },

  /**
   * AIによるパターン候補の提示（試作）。
   * Functions の analyzeImagePatterns に画像だけを送る（氏名・ID 等は送らない）。
   * AI は候補を出すだけで、選択の確定はスタッフが画面で行う。
   * APIキー未設定のときは configured: false が返る（例外にはならない）。
   */
  async analyzeImagePatterns(args: {
    image: ImageInput;
  }): Promise<AnalyzeImagePatternsResult> {
    const fn = httpsCallable<
      { imageBase64: string; mimeType: string },
      AnalyzeImagePatternsResult
    >(functions, "analyzeImagePatterns");
    const res = await fn({
      imageBase64: args.image.dataBase64,
      mimeType: args.image.mimeType,
    });
    return {
      configured: Boolean(res.data?.configured),
      candidates: Array.isArray(res.data?.candidates) ? res.data.candidates : [],
    };
  },

  /**
   * AIによるレポート文の下書き（試作）。
   * Functions の draftReportText に所見の内容だけを送る（氏名・ID 等は送らない）。
   * 画面側はコードで受け取り、この層で表示名とパターンの説明文に変換する。
   * AI は下書きを作るだけで、保存はしない。スタッフが画面で確認・手直し
   * してから、通常の保存操作で summaryNote / adviceMemo として保存する。
   * APIキー未設定のときは configured: false が返る（例外にはならない）。
   */
  async draftReportText(args: {
    finger: string;
    densityPerMm: number | null;
    flow: string | null;
    color: string | null;
    patterns: string[];
    flagGiant: boolean;
    flagHemorrhage: boolean;
    flagLoss: boolean;
    flagRamified: boolean;
    changeVsPrev: string | null;
  }): Promise<DraftReportTextResult> {
    const flagLabels = (
      [
        ["giant", args.flagGiant],
        ["hemorrhage", args.flagHemorrhage],
        ["loss", args.flagLoss],
        ["ramified", args.flagRamified],
      ] as [ClinicalFlagKey, boolean][]
    )
      .filter(([, on]) => on)
      .map(([k]) => capillaryClinicalFlagLabels[k]);
    const fn = httpsCallable<
      {
        fingerLabel: string;
        densityPerMm: number | null;
        flowLabel: string | null;
        colorLabel: string | null;
        patterns: {
          code: string;
          name: string;
          feature: string;
          why: string;
          symptoms: string;
          mibyo: string;
        }[];
        clinicalFlags: string[];
        changeVsPrevLabel: string | null;
      },
      DraftReportTextResult
    >(functions, "draftReportText");
    const res = await fn({
      fingerLabel: capillaryFingerLabels[args.finger] ?? args.finger,
      densityPerMm: args.densityPerMm,
      flowLabel: args.flow
        ? (capillaryFlowLabels[args.flow] ?? args.flow)
        : null,
      colorLabel: args.color
        ? (capillaryColorLabels[args.color] ?? args.color)
        : null,
      patterns: args.patterns.flatMap((code) => {
        const p = capillaryPatternByCode[code];
        if (!p) return [];
        return [
          {
            code: p.code,
            name: p.name,
            feature: p.feature,
            why: p.why,
            symptoms: p.symptoms,
            mibyo: p.mibyo,
          },
        ];
      }),
      clinicalFlags: flagLabels,
      changeVsPrevLabel: args.changeVsPrev
        ? (capillaryChangeLabels[args.changeVsPrev] ?? args.changeVsPrev)
        : null,
    });
    return {
      configured: Boolean(res.data?.configured),
      summary: typeof res.data?.summary === "string" ? res.data.summary : "",
      advice: typeof res.data?.advice === "string" ? res.data.advice : "",
    };
  },

  /**
   * 保存済み画像（Storage）を AI 送信用の base64 に読み出す。
   * 編集画面で「保存済みの主画像」を対象にするために使う。
   */
  async fetchStoredImageInput(storagePath: string): Promise<ImageInput> {
    const blob = await getBlob(storageRef(storage, storagePath));
    const dataBase64 = await blobToBase64(blob);
    return {
      dataBase64,
      mimeType: blob.type === "image/png" ? "image/png" : "image/jpeg",
    };
  },

  /**
   * 保存済みファイル（Storage）の実体を Blob で読み出す。
   * 編集画面で「保存済みの動画から静止画を切り出す」ときに使う
   * （ダウンロードURL経由だと canvas の読み取り制限にかかる場合があるため、
   * 認証つきの SDK 取得で Blob 化してから扱う）。
   */
  async fetchStoredBlob(storagePath: string): Promise<Blob> {
    return getBlob(storageRef(storage, storagePath));
  },
};
