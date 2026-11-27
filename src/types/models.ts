// 毛細血管分析アプリ（院内用）のデータモデル。
//
// Firestore コレクション構成:
//   staff/{uid}              スタッフ（Firebase Auth の uid と一致させる）
//   patients/{patientId}     対象者
//   observations/{id}        観察記録（1回の観察 = 1ドキュメント）
//   reports/{reportId}       確定レポート（観察から生成）
//   claims/{claimId}         受け取りQR用クレーム（トークンのハッシュ・期限・使用済み）
//   auditLogs/{logId}        監査ログ（誰が・いつ・何をしたか）
//
// 医療の線引き: このアプリは「観察の記録」を扱う。病名の断定や予測にあたる
// フィールドは持たない。パターンは「最も近い形」として複数選択で記録する。

import type { Timestamp } from "firebase/firestore";

/** スタッフの役割。admin はスタッフ登録の管理と削除ができる。 */
export type StaffRole = "admin" | "staff";

export interface Staff {
  /** Firebase Auth の uid（ドキュメントIDと一致）。 */
  uid: string;
  email: string;
  displayName: string;
  role: StaffRole;
  /** false のスタッフはログインしてもアプリ本体を使えない。 */
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Patient {
  displayName: string;
  /** 院内の対象者ID（カルテ番号など、このアプリ内での識別子）。 */
  patientCode: string;
  /** ルーツマイル会員ID（任意。段階3の自動ひも付け用に予約）。 */
  rootsMemberId?: string | null;
  note?: string;
  createdBy: string; // staff uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 撮影条件（撮影と記録の型 1節）。標準から外れた回は経時比較の対象から外す。 */
export interface ObservationConditions {
  /** 室温（℃）。標準 20〜25。 */
  roomTempC: number;
  /** 室内での安静（順応）時間（分）。標準 15。 */
  restMinutes: number;
  /** 撮影前の制限（カフェイン・喫煙は2時間前まで、激しい運動は当日回避）を守れたか。 */
  restrictionsOk: boolean;
}

/** 臨床フラグ4項目（撮影と記録の型 3節）。1つでもあれば受診案内を出す。 */
export interface ClinicalFlags {
  giant: boolean; // 巨大毛細血管あり
  hemorrhage: boolean; // 微小出血あり
  loss: boolean; // 脱落・無血管野あり
  ramified: boolean; // 分枝あり
}

/** Storage に保存した画像・動画への参照。公開URLは持たない。 */
export interface MediaRef {
  /** Storage パス（capillary/{patientId}/{observationId}/images|videos/{fileName}）。 */
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  /** 代表画像かどうか（画像のみ）。 */
  isPrimary?: boolean;
}

/** 血流速度の参考値（試作計測）。較正がある場合のみ mm/sec を入れる。 */
export interface FlowVelocity {
  /** 計測値。mm/sec（較正あり）または px/sec（較正なし）。 */
  value: number;
  unit: "mm_per_sec" | "px_per_sec";
  /** 計測方法（例: "spatiotemporal" 時空間画像法 / "manual" 手動2点）。 */
  method: string;
  note?: string;
}

/** 試験モード: 実施内容の種別。 */
export type InterventionType =
  | "gas_inhalation" // ガス吸入
  | "supplement_food" // サプリ・食品
  | "exercise" // 運動
  | "thermal" // 温熱
  | "other";

/** 試験モード: ガス吸入のガス種。 */
export type GasType = "radon" | "hydrogen" | "hydrogen_oxygen";

/** 試験モード: 実施のタイミング（この観察との関係）。 */
export type InterventionTiming = "before" | "after" | "during_period";

export interface Intervention {
  type: InterventionType;
  /** type が gas_inhalation のときのみ。 */
  gasType?: GasType | null;
  /** 濃度・時間・製品名などの自由記述。 */
  detail: string;
  timing: InterventionTiming;
}

/** 試験モードの記録。通常の観察では null。 */
export interface StudyInfo {
  /** 試験名（プロトコル名）。 */
  studyName: string;
  /** 群。 */
  group: "intervention" | "control"; // 実施群 / 対照群
  interventions: Intervention[];
}

export type ObservationStatus = "draft" | "finalized";

export interface Observation {
  patientId: string;
  /** 観察日時。 */
  recordedAt: Timestamp;
  /** 撮影した指のコード（capillary-patterns.ts の capillaryFingers）。標準は利き手と逆の薬指。 */
  finger: string;
  conditions: ObservationConditions;
  /** 密度（ループ本数/mm）。数えられない場合は null。経時比較の主軸。 */
  densityPerMm: number | null;
  /** 流れの印象コード（good / slow / stagnant）。 */
  flowImpression: string;
  /** 色の印象コード（bright_red / dark_red / pale）。 */
  colorImpression: string;
  /** 形のパターンのコード（28種から複数選択、1件以上）。 */
  patterns: string[];
  clinicalFlags: ClinicalFlags;
  /** 前回との比較コード（improved / same / worse）。初回は null。 */
  changeVsPrevious: string | null;
  /** 伝えたアドバイスのメモ。 */
  adviceNote: string;
  /** 受診案内を実施したか（臨床フラグがある場合に記録）。 */
  referralGiven: boolean;
  images: MediaRef[];
  videos: MediaRef[];
  /** 血流速度の参考値。未計測は null。 */
  flowVelocity: FlowVelocity | null;
  /** 試験モードの情報。通常観察は null。 */
  study: StudyInfo | null;
  status: ObservationStatus;
  createdBy: string; // staff uid
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** 確定レポート。表示内容は observation のデータから都度組み立てるため、
 *  ここには確定時点の識別情報と受け取りクレームへの参照だけを持つ。 */
export interface Report {
  observationId: string;
  patientId: string;
  finalizedBy: string; // staff uid
  finalizedAt: Timestamp;
  /** 発行済みクレームのID（未発行は null）。 */
  claimId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * 受け取りクレーム（ルーツマイルへの受け渡し用）。
 * QR の中身は「reportId + トークン」だけ。トークンそのものは保存せず、
 * SHA-256 ハッシュだけを保存する。書き込みは Cloud Functions のみ。
 */
export interface Claim {
  reportId: string;
  /** 受け取りトークンの SHA-256 ハッシュ（hex）。 */
  tokenHash: string;
  /** 有効期限（発行時）。目安 90 日（最終決定は未決事項）。 */
  expiresAt: Timestamp;
  /** 取り込み済みの日時。未使用は null。取り込みは1回限り。 */
  usedAt: Timestamp | null;
  /** 取り込んだルーツマイル会員ID。未使用は null。 */
  usedByMemberId: string | null;
  /** 失効させたかどうか（再発行時に旧クレームを失効させる）。 */
  revoked: boolean;
  issuedBy: string; // staff uid
  createdAt: Timestamp;
}

export type AuditAction =
  | "observation.create"
  | "observation.update"
  | "observation.finalize"
  | "report.finalize"
  | "claim.issue"
  | "claim.revoke"
  | "claim.consume";

export interface AuditLog {
  actorUid: string;
  action: AuditAction;
  targetType: "observation" | "report" | "claim" | "patient";
  targetId: string;
  at: Timestamp;
  detail?: string;
}
