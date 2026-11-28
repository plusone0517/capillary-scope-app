// カメラ撮影と画像取り込みのヘルパー。
//
// 撮影は video要素 + canvas のキャプチャのみを使う（Safariでも動く方式）。
// ImageCapture など Chrome専用APIには依存しない。

export type CapturedImage = {
  dataBase64: string;
  mimeType: "image/jpeg" | "image/png";
  previewUrl: string;
};

const MAX_DIM = 1600;

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

async function canvasToCaptured(
  canvas: HTMLCanvasElement,
): Promise<CapturedImage> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("画像の撮影に失敗しました");
  const dataBase64 = await blobToBase64(blob);
  return {
    dataBase64,
    mimeType: "image/jpeg",
    previewUrl: URL.createObjectURL(blob),
  };
}

/** ライブプレビュー中の video から静止画を1枚撮る。 */
export async function captureFromVideo(
  video: HTMLVideoElement,
): Promise<CapturedImage> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error("カメラの映像がまだ準備できていません");
  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx2d = canvas.getContext("2d");
  if (!ctx2d) throw new Error("画像の撮影に失敗しました");
  ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToCaptured(canvas);
}

/** 画像ファイルを読み込み、長辺1600pxまでに縮小して JPEG 化する。 */
export async function fileToCaptured(file: File): Promise<CapturedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("画像ファイルを読み込めませんでした"));
      el.src = url;
    });
    const scale = Math.min(
      1,
      MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) throw new Error("画像の読み込みに失敗しました");
    ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToCaptured(canvas);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ================= 動画 ================= */

export type CapturedVideo = {
  /**
   * 動画の実体（Blob のまま保持する）。保存時は base64 化せずそのまま
   * アップロードするため、長い動画でもメモリを圧迫しない。
   */
  blob: Blob;
  mimeType: "video/webm" | "video/mp4";
  previewUrl: string;
  durationSec: number | null;
};

/** MediaRecorder が使えるか（iPad Safari では使えない環境がある）。 */
export function detectRecorderSupport(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
}

/** この環境で録画に使える MIME タイプを選ぶ（webm優先、なければmp4）。 */
export function pickRecorderMimeType(): "video/webm" | "video/mp4" | null {
  if (!detectRecorderSupport()) return null;
  if (MediaRecorder.isTypeSupported("video/webm")) return "video/webm";
  if (MediaRecorder.isTypeSupported("video/mp4")) return "video/mp4";
  return null;
}

/** 録画・取り込みした動画 Blob を保存用データに変換する。 */
export async function blobToCapturedVideo(
  blob: Blob,
  durationSec: number | null,
): Promise<CapturedVideo> {
  const mimeType = blob.type.includes("mp4") ? "video/mp4" : "video/webm";
  return {
    blob,
    mimeType,
    previewUrl: URL.createObjectURL(blob),
    durationSec,
  };
}

/** 動画ファイルを取り込む（専用ソフトで撮った動画など）。 */
export async function fileToCapturedVideo(file: File): Promise<CapturedVideo> {
  const mimeType = file.type.includes("mp4") ? "video/mp4" : "video/webm";
  const previewUrl = URL.createObjectURL(file);
  const durationSec = await new Promise<number | null>((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () =>
      resolve(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => resolve(null);
    el.src = previewUrl;
  });
  return { blob: file, mimeType, previewUrl, durationSec };
}

/**
 * 動画（Blob URL など）から静止画を1枚切り出す。
 * 動画だけの観察でも AI候補・自動計測が使えるよう、代表画像の材料にする。
 * 切り出し位置は長さの25%地点（長さが取れない形式では先頭フレーム）。
 * 対象は同一オリジンで読める URL（Blob URL）に限る。
 */
export async function captureFrameFromVideoUrl(
  src: string,
): Promise<CapturedImage> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error("動画を読み込めませんでした"));
    });
    const duration = video.duration;
    const target =
      Number.isFinite(duration) && duration > 0
        ? Math.min(duration * 0.25, Math.max(0, duration - 0.05))
        : 0;
    if (target > 0) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          video.removeEventListener("seeked", finish);
          resolve();
        };
        video.addEventListener("seeked", finish);
        video.currentTime = target;
        window.setTimeout(finish, 1500);
      });
    } else {
      // 先頭フレームが描画されるまで少し待つ。
      await new Promise<void>((resolve) => {
        if (video.readyState >= 2) {
          resolve();
          return;
        }
        video.onloadeddata = () => resolve();
        window.setTimeout(resolve, 1500);
      });
    }
    return await captureFromVideo(video);
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

export type CameraSupport =
  | { kind: "ok" }
  | { kind: "iphone" }
  | { kind: "unsupported" };

/** 端末がカメラ撮影に対応しているかを判定する。iPhoneは対象外として明示する。 */
export function detectCameraSupport(): CameraSupport {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return { kind: "iphone" };
  if (
    typeof navigator.mediaDevices === "undefined" ||
    typeof navigator.mediaDevices.getUserMedia !== "function"
  ) {
    return { kind: "unsupported" };
  }
  return { kind: "ok" };
}

export function isIPad(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13以降は Mac と同じ UA を返すため、タッチ点数でも判定する。
  return /iPad/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}
