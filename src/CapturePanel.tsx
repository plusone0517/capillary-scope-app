// 撮影パネル：スコープ（USBカメラ）のライブプレビュー、静止画撮影、
// 画像ファイル取り込み、撮影済み画像の管理（最大5枚・代表画像の指定）。
//
// 対応環境は Windows PC（Chrome/Edge）と iPad（Safari）。
// 撮影は video要素 + canvas のみ。デバイス一覧は許可取得後に読み直す
// （Safariは許可前にラベルが返らないため）。
//
// 構成：状態と操作ロジックは useCapturePanel フックに集約し、表示は
// CaptureIntro（見出しと注意）／CaptureMediaDisplay（映像・画像の表示面）／
// CaptureControls（操作部）の3部品に分ける。
// 観察入力画面では、横幅の広い画面（lg以上）で「左＝操作・フォーム（カラム内
// スクロール）、右＝画像画面（全面）」の分割レイアウトに組み替えられるよう、
// メディア表示部はレスポンシブに切り替わる（lg未満は従来どおり上部sticky固定）。

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
blobToCapturedVideo,
captureFromVideo,
computeZoomRect,
cropFromZoomRect,
detectCameraSupport,
detectRecorderSupport,
fileToCaptured,
fileToCapturedVideo,
isIPad,
pickRecorderMimeType,
type CaptureOptions,
type CapturedImage,
type CapturedVideo,
} from "./camera";

const MAX_IMAGES = 5;
const MAX_RECORD_SEC = 20;

/** 手動で選んだカメラを次回も使うため、deviceId を保存するキー。 */
const CAMERA_STORAGE_KEY = "capillary-scope-camera-device-id";

/** 選んだ解像度プリセットを次回も使うため保存するキー。 */
const RESOLUTION_STORAGE_KEY = "capillary-scope-camera-resolution";

/** 選べる解像度のプリセット。「最大」はカメラの上限まで要求する。 */
const RESOLUTION_PRESETS = [
  { key: "max", label: "最大（カメラの上限）", width: 3840, height: 2160 },
  { key: "1920x1080", label: "1920 × 1080", width: 1920, height: 1080 },
  { key: "1280x720", label: "1280 × 720", width: 1280, height: 720 },
  { key: "640x480", label: "640 × 480", width: 640, height: 480 },
] as const;

type ResolutionKey = (typeof RESOLUTION_PRESETS)[number]["key"];

function readSavedResolution(): ResolutionKey {
  try {
    const saved = localStorage.getItem(RESOLUTION_STORAGE_KEY);
    return RESOLUTION_PRESETS.some((p) => p.key === saved)
      ? (saved as ResolutionKey)
      : "max";
  } catch {
    return "max";
  }
}

function saveResolution(key: ResolutionKey): void {
  try {
    localStorage.setItem(RESOLUTION_STORAGE_KEY, key);
  } catch {
    // 保存できなくても撮影は続けられるため、そのまま進める。
  }
}

/**
 * getCapabilities() のうち、このアプリで使う項目だけを切り出した型。
 * brightness / zoom はブラウザの型定義に無い環境があるため独自に持つ。
 */
type TrackCaps = {
  width?: { min?: number; max?: number };
  height?: { min?: number; max?: number };
  brightness?: { min: number; max: number; step?: number };
  zoom?: { min: number; max: number; step?: number };
};

function readTrackCaps(track: MediaStreamTrack): TrackCaps {
  try {
    if (typeof track.getCapabilities !== "function") return {};
    return track.getCapabilities() as TrackCaps;
  } catch {
    return {};
  }
}

function readTrackSetting(track: MediaStreamTrack, key: string): number | null {
  try {
    const settings = track.getSettings() as Record<string, unknown>;
    const value = settings[key];
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

/** ハードウェア制御（明るさ・ズーム）をトラックへ当てる。失敗しても撮影は続ける。 */
function applyAdvanced(
  track: MediaStreamTrack,
  set: Record<string, number>,
): void {
  try {
    void track
      .applyConstraints({ advanced: [set] } as MediaTrackConstraints)
      .catch(() => undefined);
  } catch {
    // 未対応の環境では何もしない（ソフトウェア側の表示にフォールバックする）。
  }
}

function readSavedDeviceId(): string {
  try {
    return localStorage.getItem(CAMERA_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveDeviceId(id: string): void {
  try {
    if (id) localStorage.setItem(CAMERA_STORAGE_KEY, id);
    else localStorage.removeItem(CAMERA_STORAGE_KEY);
  } catch {
    // 保存できなくても撮影は続けられるため、そのまま進める。
  }
}

/**
 * 列挙したカメラから、スコープらしいものを優先して1台選ぶ。
 * 優先順位：ラベルに「Anyty」（3R Solution のカメラブランド）を含むもの →
 * USB等の外部カメラらしいもの → 先頭。
 * 内蔵カメラがあるPCでもスコープを掴むための自動選択。
 */
function pickPreferredCamera(
  cams: MediaDeviceInfo[],
): MediaDeviceInfo | undefined {
  if (cams.length === 0) return undefined;
  const byLabel = (re: RegExp) => cams.find((c) => re.test(c.label ?? ""));
  return (
    byLabel(/anyty/i) ??
    byLabel(/usb|uvc|scope/i) ??
    cams.find(
      (c) => !/integrated|internal|built-?in|内蔵|facetime/i.test(c.label ?? ""),
    ) ??
    cams[0]
  );
}

/** getUserMedia の失敗理由を、利用者向けの平易な文に分ける。 */
function describeCameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "カメラの許可が必要です。ブラウザのアドレスバー横の設定で、このサイトへのカメラ許可をオンにしてから、もう一度「カメラを開始」を押してください。";
    case "NotReadableError":
    case "AbortError":
      return "カメラが他のソフトで使用中です。そのソフトを閉じてから「カメラを再検出」を押してください。";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "カメラが見つかりません。スコープのUSB接続を確認してから「カメラを再検出」を押してください。";
    default:
      return `カメラを起動できませんでした${name ? `（${name}）` : ""}。スコープの接続と、ブラウザのカメラ許可を確認してください。`;
  }
}

type Props = {
  images: CapturedImage[];
  primaryIndex: number;
  onChange: (images: CapturedImage[], primaryIndex: number) => void;
  video: CapturedVideo | null;
  onVideoChange: (video: CapturedVideo | null) => void;
};

/** 撮影まわりの状態と操作をまとめたフック。表示部品はこれを受け取って描く。 */
export function useCapturePanel({
  images,
  primaryIndex,
  onChange,
  video,
  onVideoChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoFileInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordStartRef = useRef<number>(0);
  const recordTimerRef = useRef<number | null>(null);
  const discardRecordingRef = useRef(false);
  const [support] = useState(detectCameraSupport);
  const [recorderOk] = useState(detectRecorderSupport);
  const [ipad] = useState(isIPad);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  // 前回手動で選んだカメラがあれば、最初からその deviceId を選択状態にする。
  const [deviceId, setDeviceId] = useState<string>(() => readSavedDeviceId());
  const [activeLabel, setActiveLabel] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);
  // ===== カメラ調整（解像度・明るさ・ズーム）=====
  /** プレビュー枠の要素。撮影時のデジタルズーム切り出し計算に使う。 */
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const [resolutionKey, setResolutionKeyState] =
    useState<ResolutionKey>(readSavedResolution);
  // startStream（依存なしで固定）から最新のプリセットを読めるよう ref にも持つ。
  const resolutionKeyRef = useRef(resolutionKey);
  useEffect(() => {
    resolutionKeyRef.current = resolutionKey;
  }, [resolutionKey]);
  /** 起動中トラックの能力（明るさ・ズームのハードウェア制御の有無など）。 */
  const [trackCaps, setTrackCaps] = useState<TrackCaps>({});
  /** 実際に開けた解像度（表示用）。 */
  const [currentSize, setCurrentSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  /** ソフトウェア明るさ補正（%）。ハードウェア制御が無い場合に使う。 */
  const [brightnessPct, setBrightnessPct] = useState(100);
  /** ハードウェア明るさの現在値（capabilities の単位のまま）。 */
  const [hwBrightness, setHwBrightness] = useState<number | null>(null);
  /** ハードウェアズームの現在値（capabilities の単位のまま）。 */
  const [hwZoom, setHwZoom] = useState<number | null>(null);
  /** デジタルズーム倍率（1〜3）。ハードウェアズームが無い場合に使う。 */
  const [digitalZoom, setDigitalZoom] = useState(1);
  /** デジタルズームの表示位置（-1〜1、中心からのずれ）。 */
  const [digitalPan, setDigitalPan] = useState({ x: 0, y: 0 });

  const brightnessRange = trackCaps.brightness;
  const zoomRange = trackCaps.zoom;
  /** 明るさ：ハードウェア制御が使えるか（使えない場合はソフトウェア補正）。 */
  const brightnessMode: "hw" | "sw" = brightnessRange ? "hw" : "sw";
  /** ズーム：ハードウェア制御が使えるか（使えない場合はデジタルズーム）。 */
  const zoomMode: "hw" | "digital" = zoomRange ? "hw" : "digital";

  /** カメラの能力範囲に収まる解像度プリセットだけを候補にする。 */
  const resolutionOptions = RESOLUTION_PRESETS.filter((preset) => {
    if (preset.key === "max") return true;
    const w = trackCaps.width;
    const h = trackCaps.height;
    if (w?.max != null && preset.width > w.max) return false;
    if (w?.min != null && preset.width < w.min) return false;
    if (h?.max != null && preset.height > h.max) return false;
    if (h?.min != null && preset.height < h.min) return false;
    return true;
  });

  const setBrightnessValue = useCallback(
    (value: number) => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (brightnessRange && track) {
        const clamped = Math.min(
          brightnessRange.max,
          Math.max(brightnessRange.min, value),
        );
        setHwBrightness(clamped);
        applyAdvanced(track, { brightness: clamped });
      } else {
        setBrightnessPct(Math.min(150, Math.max(50, value)));
      }
    },
    [brightnessRange],
  );

  const setZoomValue = useCallback(
    (value: number) => {
      const track = streamRef.current?.getVideoTracks()[0];
      if (zoomRange && track) {
        const clamped = Math.min(zoomRange.max, Math.max(zoomRange.min, value));
        setHwZoom(clamped);
        applyAdvanced(track, { zoom: clamped });
      } else {
        const clamped = Math.min(3, Math.max(1, value));
        setDigitalZoom(clamped);
        if (clamped <= 1) setDigitalPan({ x: 0, y: 0 });
      }
    },
    [zoomRange],
  );

  /** ズームと表示位置を初期状態に戻す（明るさはそのまま）。 */
  const resetZoomView = useCallback(() => {
    if (zoomRange) setZoomValue(zoomRange.min);
    else {
      setDigitalZoom(1);
      setDigitalPan({ x: 0, y: 0 });
    }
  }, [zoomRange, setZoomValue]);

  const stopStream = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      discardRecordingRef.current = true;
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActiveLabel("");
    setCameraOn(false);
    setTrackCaps({});
    setCurrentSize(null);
    setHwBrightness(null);
    setHwZoom(null);
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || recording) return;
    const mimeType = pickRecorderMimeType();
    if (!mimeType) {
      setCameraError(
        "このブラウザでは動画の録画が使えません。下の「動画ファイルから取り込む」をお使いください。",
      );
      return;
    }
    setCameraError(null);
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      discardRecordingRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        if (recordTimerRef.current != null) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        setRecording(false);
        const elapsed = (Date.now() - recordStartRef.current) / 1000;
        const discard = discardRecordingRef.current;
        discardRecordingRef.current = false;
        recorderRef.current = null;
        if (discard) return;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        void blobToCapturedVideo(blob, elapsed)
          .then((captured) => onVideoChange(captured))
          .catch(() =>
            setCameraError("動画の保存用データへの変換に失敗しました"),
          );
      };
      recorderRef.current = recorder;
      recordStartRef.current = Date.now();
      setRecordElapsed(0);
      recorder.start(250);
      setRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - recordStartRef.current) / 1000;
        setRecordElapsed(elapsed);
        if (elapsed >= MAX_RECORD_SEC) stopRecording();
      }, 200);
    } catch {
      setCameraError("動画の録画を開始できませんでした");
    }
  }, [recording, onVideoChange, stopRecording]);

  const handleVideoFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setCameraError(null);
    try {
      onVideoChange(await fileToCapturedVideo(file));
    } catch {
      setCameraError("動画ファイルを取り込めませんでした");
    } finally {
      setBusy(false);
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    }
  };

  const removeVideo = () => {
    if (video) URL.revokeObjectURL(video.previewUrl);
    onVideoChange(null);
  };

  const startStream = useCallback(async (targetDeviceId: string) => {
    setCameraError(null);
    // 解像度は ideal のみで要求する（exact で要求すると、対応外のカメラで
    // OverconstrainedError になり起動できないため）。
    const preset =
      RESOLUTION_PRESETS.find((p) => p.key === resolutionKeyRef.current) ??
      RESOLUTION_PRESETS[0];
    const sizeIdeal: MediaTrackConstraints = {
      width: { ideal: preset.width },
      height: { ideal: preset.height },
    };
    const openStream = (video: MediaTrackConstraints) =>
      navigator.mediaDevices.getUserMedia({ video, audio: false });
    try {
      let stream: MediaStream;
      if (targetDeviceId) {
        try {
          stream = await openStream({
            deviceId: { exact: targetDeviceId },
            ...sizeIdeal,
          });
        } catch {
          // 指定したカメラで開けない場合は、条件を落として取り直す。
          stream = await openStream(sizeIdeal);
        }
      } else {
        stream = await openStream(sizeIdeal);
      }
      // 許可が取れたあとに一覧を読み直すと、カメラ名（ラベル）が出る。
      const all = await navigator.mediaDevices
        .enumerateDevices()
        .catch(() => [] as MediaDeviceInfo[]);
      const cams = all.filter((d) => d.kind === "videoinput");
      setDevices(cams);
      // 対象の指定がない、または指定したカメラがもう無い場合は、
      // 保存済みの選択 → スコープらしいカメラの順で自動選択する。
      const targetExists =
        targetDeviceId !== "" &&
        cams.some((c) => c.deviceId === targetDeviceId);
      if (!targetExists) {
        const activeId = stream.getVideoTracks()[0]?.getSettings().deviceId;
        const savedId = readSavedDeviceId();
        const chosen =
          (savedId
            ? cams.find((c) => c.deviceId === savedId)?.deviceId
            : undefined) ?? pickPreferredCamera(cams)?.deviceId;
        if (chosen && chosen !== activeId) {
          try {
            const scoped = await openStream({
              deviceId: { exact: chosen },
              ...sizeIdeal,
            });
            stream.getTracks().forEach((track) => track.stop());
            stream = scoped;
          } catch {
            // 優先カメラで開けなければ、開いている映像のまま続ける。
          }
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraOn(true);
      const track = stream.getVideoTracks()[0];
      const activeId = track?.getSettings().deviceId;
      if (activeId) setDeviceId(activeId);
      setActiveLabel(track?.label ?? "");
      if (track) {
        // 起動できたら能力（明るさ・ズームのハードウェア制御の範囲など）と
        // 実際の解像度を読み、調整バーの初期値にする。
        const caps = readTrackCaps(track);
        setTrackCaps(caps);
        const settings = track.getSettings();
        setCurrentSize(
          settings.width && settings.height
            ? { width: settings.width, height: settings.height }
            : null,
        );
        if (caps.brightness) {
          const current = readTrackSetting(track, "brightness");
          setHwBrightness(
            current ??
              Math.round(((caps.brightness.min + caps.brightness.max) / 2) * 100) /
                100,
          );
        }
        if (caps.zoom) {
          const current = readTrackSetting(track, "zoom");
          setHwZoom(current ?? caps.zoom.min);
        }
      }
    } catch (err) {
      setCameraError(describeCameraError(err));
      setCameraOn(false);
    }
  }, []);

  /** USBの挿し直しなどに、ページ再読み込みなしで列挙と接続をやり直す。 */
  const redetectCamera = useCallback(async () => {
    stopStream();
    await startStream("");
  }, [startStream, stopStream]);

  /** 解像度プリセットの変更：保存し、カメラ起動中なら新しい解像度で開き直す。 */
  const changeResolution = useCallback(
    (key: ResolutionKey) => {
      setResolutionKeyState(key);
      resolutionKeyRef.current = key;
      saveResolution(key);
      if (cameraOn) void startStream(deviceId);
    },
    [cameraOn, deviceId, startStream],
  );

  // 初回マウント時にデバイス一覧（許可前は名前なし）を取得する。
  // USBの抜き挿し（devicechange）でも一覧を読み直す。
  useEffect(() => {
    if (support.kind !== "ok") return;
    let cancelled = false;
    const refreshDevices = () => {
      navigator.mediaDevices
        .enumerateDevices()
        .then((all) => {
          if (cancelled) return;
          setDevices(all.filter((d) => d.kind === "videoinput"));
        })
        .catch(() => undefined);
    };
    refreshDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", refreshDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.(
        "devicechange",
        refreshDevices,
      );
      if (recordTimerRef.current != null) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      stopStream();
    };
  }, [support.kind, stopStream]);

  const handleCapture = async () => {
    const videoEl = videoRef.current;
    if (!videoEl || images.length >= MAX_IMAGES) return;
    setBusy(true);
    try {
      // プレビューの見た目（ソフトウェア明るさ補正・デジタルズームの
      // 切り取り範囲）を撮影画像にもそのまま反映する。
      const options: CaptureOptions = {};
      if (brightnessMode === "sw" && brightnessPct !== 100) {
        options.brightnessPct = brightnessPct;
      }
      if (zoomMode === "digital" && digitalZoom > 1 && videoEl.videoWidth) {
        const vw = videoEl.videoWidth;
        const vh = videoEl.videoHeight;
        const box = previewBoxRef.current;
        const containerW = box?.clientWidth || vw;
        const containerH = box?.clientHeight || vh;
        const rect = computeZoomRect(
          containerW,
          containerH,
          vw,
          vh,
          digitalZoom,
          digitalPan.x,
          digitalPan.y,
        );
        options.sourceRect = cropFromZoomRect(rect, containerW, containerH, vw, vh);
      }
      const captured = await captureFromVideo(videoEl, options);
      const next = [...images, captured];
      onChange(next, images.length === 0 ? 0 : primaryIndex);
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : "撮影に失敗しました");
    } finally {
      setBusy(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setCameraError(null);
    try {
      const next = [...images];
      for (const file of Array.from(files)) {
        if (next.length >= MAX_IMAGES) break;
        if (!file.type.startsWith("image/")) continue;
        next.push(await fileToCaptured(file));
      }
      onChange(next, images.length === 0 && next.length > 0 ? 0 : primaryIndex);
    } catch (e) {
      setCameraError(
        e instanceof Error ? e.message : "画像の取り込みに失敗しました",
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    const removed = images[index];
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    const next = images.filter((_, i) => i !== index);
    let nextPrimary = primaryIndex;
    if (index === primaryIndex) nextPrimary = 0;
    else if (index < primaryIndex) nextPrimary = primaryIndex - 1;
    onChange(next, next.length === 0 ? 0 : nextPrimary);
  };

  return {
    // 親から受けた値
    images,
    primaryIndex,
    onChange,
    video,
    // 内部の状態と参照
    videoRef,
    previewBoxRef,
    fileInputRef,
    videoFileInputRef,
    // カメラ調整（解像度・明るさ・ズーム）
    resolutionKey,
    resolutionOptions,
    changeResolution,
    currentSize,
    brightnessMode,
    brightnessRange,
    brightnessPct,
    hwBrightness,
    setBrightnessValue,
    zoomMode,
    zoomRange,
    hwZoom,
    digitalZoom,
    setZoomValue,
    digitalPan,
    setDigitalPan,
    resetZoomView,
    support,
    recorderOk,
    ipad,
    devices,
    deviceId,
    setDeviceId,
    activeLabel,
    cameraOn,
    cameraError,
    busy,
    recording,
    recordElapsed,
    // 操作
    startStream,
    redetectCamera,
    stopStream,
    startRecording,
    stopRecording,
    handleCapture,
    handleFiles,
    handleVideoFile,
    removeImage,
    removeVideo,
  };
}

export type CapturePanelApi = ReturnType<typeof useCapturePanel>;

/** 見出しと、端末・ブラウザに関する注意。操作カラムの先頭に置く。 */
export function CaptureIntro({
  support,
  className = "",
  id,
}: {
  support: CapturePanelApi["support"];
  className?: string;
  /** ステップ表示からのスクロール先にする場合のアンカーID。 */
  id?: string;
}) {
  return (
    <div id={id} className={`flex flex-col gap-4 ${className}`}>
      <h2 className="text-xl font-bold text-[var(--text)]">1. 撮影・画像と動画の取り込み</h2>

      {support.kind === "iphone" && (
        <div
          role="alert"
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] p-4 text-lg leading-relaxed text-[var(--text)]"
        >
          この端末（iPhone）ではUSBスコープを使えません。院内PCのChrome/Edge、またはiPadで開いてください。下の「画像ファイルから取り込む」はこの端末でも使えます。
        </div>
      )}
      {support.kind === "unsupported" && (
        <div
          role="alert"
          className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] p-4 text-lg leading-relaxed text-[var(--text)]"
        >
          このブラウザではカメラ機能が使えません。院内PCのChrome/Edgeで開くか、下の「画像ファイルから取り込む」をお使いください。
        </div>
      )}
    </div>
  );
}

/**
 * メディア表示部：ライブ映像・撮影済み画像・取り込み済み動画の再生。
 * lg未満では従来どおり画面上部に sticky 固定される帯として振る舞い、
 * lg以上では分割レイアウトの右カラム全面（高さいっぱい）に広がる。
 * 取り込み済み動画の再生は lg未満では操作部側（CaptureControls）に出し、
 * lg以上ではこの表示面に出す。
 */
export function CaptureMediaDisplay({
  cap,
  className = "",
}: {
  cap: CapturePanelApi;
  className?: string;
}) {
  const {
    images,
    primaryIndex,
    onChange,
    video,
    videoRef,
    previewBoxRef,
    support,
    cameraOn,
    recording,
    recordElapsed,
    removeImage,
    removeVideo,
    brightnessMode,
    brightnessPct,
    zoomMode,
    digitalZoom,
    digitalPan,
    setDigitalPan,
  } = cap;

  // デジタルズーム表示用：プレビュー枠と映像の実解像度を測る。
  const [boxSize, setBoxSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  useEffect(() => {
    const box = previewBoxRef.current;
    if (!box) return;
    const update = () =>
      setBoxSize({ width: box.clientWidth, height: box.clientHeight });
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [previewBoxRef, support.kind]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const update = () =>
      setNaturalSize({ width: el.videoWidth, height: el.videoHeight });
    update();
    el.addEventListener("loadedmetadata", update);
    el.addEventListener("resize", update);
    return () => {
      el.removeEventListener("loadedmetadata", update);
      el.removeEventListener("resize", update);
    };
  }, [videoRef, cameraOn]);

  const digitalActive =
    zoomMode === "digital" && digitalZoom > 1 && cameraOn;
  const zoomRect =
    digitalActive && boxSize.width > 0 && naturalSize.width > 0
      ? computeZoomRect(
          boxSize.width,
          boxSize.height,
          naturalSize.width,
          naturalSize.height,
          digitalZoom,
          digitalPan.x,
          digitalPan.y,
        )
      : null;

  const handlePanStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!zoomRect) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: digitalPan.x,
      panY: digitalPan.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePanMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId || !zoomRect) return;
    const maxShiftX = (zoomRect.width - boxSize.width) / 2;
    const maxShiftY = (zoomRect.height - boxSize.height) / 2;
    setDigitalPan({
      x:
        maxShiftX > 0
          ? Math.min(
              1,
              Math.max(-1, drag.panX + (e.clientX - drag.startX) / maxShiftX),
            )
          : 0,
      y:
        maxShiftY > 0
          ? Math.min(
              1,
              Math.max(-1, drag.panY + (e.clientY - drag.startY) / maxShiftY),
            )
          : 0,
    });
  };
  const handlePanEnd = () => {
    dragRef.current = null;
  };

  const videoStyle: CSSProperties = {};
  if (brightnessMode === "sw" && brightnessPct !== 100) {
    // ソフトウェア明るさ補正はプレビューにも同じ値を当てる。
    videoStyle.filter = `brightness(${brightnessPct / 100})`;
  }
  if (zoomRect) {
    videoStyle.left = zoomRect.left;
    videoStyle.top = zoomRect.top;
    videoStyle.width = zoomRect.width;
    videoStyle.height = zoomRect.height;
    videoStyle.maxWidth = "none";
    videoStyle.objectFit = "fill";
  }

  if (support.kind !== "ok" && images.length === 0 && !video) return null;

  return (
    <div
      className={`sticky top-[108px] z-30 -mx-4 flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2 shadow-[0_8px_16px_-12px_rgba(0,0,0,0.4)] sm:-mx-6 sm:px-6 lg:static lg:z-auto lg:mx-0 lg:min-h-0 lg:gap-3 lg:border-b-0 lg:bg-transparent lg:px-0 lg:py-0 lg:shadow-none ${className}`}
    >
      {support.kind === "ok" && (
        <div
          ref={previewBoxRef}
          onPointerDown={handlePanStart}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
          className={`relative h-44 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)] sm:h-60 lg:min-h-0 lg:flex-1 ${zoomRect ? "cursor-grab touch-none" : ""}`}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            aria-label="スコープのライブプレビュー"
            style={videoStyle}
            className="absolute inset-0 h-full w-full object-contain"
          />
          {!cameraOn && (
            <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center text-base text-white/75">
              カメラは停止中です（下の「カメラを開始」で映像が出ます）
            </p>
          )}
          {recording && (
            <p
              className="absolute left-2 top-2 rounded bg-[var(--alert)] px-2 py-0.5 text-sm font-bold text-white"
              aria-live="polite"
            >
              ● 録画中 {recordElapsed.toFixed(0)}秒
            </p>
          )}
        </div>
      )}
      {images.length > 0 && (
        <div className="lg:shrink-0">
          <p className="mb-1 text-base font-medium text-[var(--text)]">
            撮影・取り込み済みの画像（{images.length}枚）―
            画像を押すと代表画像になります
          </p>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-wrap lg:overflow-x-visible">
            {images.map((img, i) => (
              <li
                key={img.previewUrl}
                className="flex w-24 shrink-0 flex-col gap-1 lg:w-36"
              >
                <button
                  type="button"
                  onClick={() => onChange(images, i)}
                  aria-label={`画像 ${i + 1} を代表画像にする`}
                  aria-pressed={i === primaryIndex}
                  className="relative block overflow-hidden rounded"
                >
                  <img
                    src={img.previewUrl}
                    alt={`観察画像 ${i + 1}`}
                    className="aspect-[4/3] w-full object-cover"
                  />
                  {i === primaryIndex && (
                    <span className="absolute inset-x-0 bottom-0 bg-[var(--accent)] px-1 py-0.5 text-center text-xs font-bold text-white">
                      代表画像
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  aria-label={`画像 ${i + 1} を削除`}
                  className="min-h-11 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--alert)]"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {video && (
        <div className="hidden flex-col gap-2 lg:flex lg:shrink-0">
          <p className="text-lg font-medium text-[var(--text)]">
            取り込み済みの動画
            {video.durationSec != null && `（約${video.durationSec.toFixed(0)}秒）`}
          </p>
          <video
            src={video.previewUrl}
            controls
            playsInline
            aria-label="取り込み済みの観察動画"
            className="aspect-video w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)] lg:max-h-[30dvh]"
          />
          <button
            type="button"
            onClick={removeVideo}
            aria-label="動画を削除"
            className="min-h-11 self-start rounded border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--alert)]"
          >
            動画を削除する
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 操作部：カメラ選択・開始/停止、撮影ボタン、動画の撮影コントロール、
 * ファイル取り込み、エラー表示。取り込み済み動画の再生ブロックは
 * lg未満でのみここに出す（lg以上は CaptureMediaDisplay 側）。
 */
export function CaptureControls({
  cap,
  className = "",
}: {
  cap: CapturePanelApi;
  className?: string;
}) {
  const {
    images,
    video,
    fileInputRef,
    videoFileInputRef,
    support,
    recorderOk,
    ipad,
    devices,
    deviceId,
    setDeviceId,
    activeLabel,
    cameraOn,
    cameraError,
    busy,
    recording,
    recordElapsed,
    startStream,
    redetectCamera,
    stopStream,
    startRecording,
    stopRecording,
    handleCapture,
    handleFiles,
    handleVideoFile,
    removeVideo,
    resolutionKey,
    resolutionOptions,
    changeResolution,
    currentSize,
    brightnessMode,
    brightnessRange,
    brightnessPct,
    hwBrightness,
    setBrightnessValue,
    zoomMode,
    zoomRange,
    hwZoom,
    digitalZoom,
    setZoomValue,
    resetZoomView,
  } = cap;

  // 調整バーのスライダー表示値（ハードウェア制御と補正で単位が違うため分ける）。
  const brightnessSlider = brightnessRange
    ? {
        min: brightnessRange.min,
        max: brightnessRange.max,
        step: brightnessRange.step ?? (brightnessRange.max - brightnessRange.min) / 100,
        value: hwBrightness ?? brightnessRange.min,
        label: `${Math.round(((hwBrightness ?? brightnessRange.min) * 10)) / 10}`,
      }
    : {
        min: 50,
        max: 150,
        step: 1,
        value: brightnessPct,
        label: `${brightnessPct}%`,
      };
  const zoomSlider = zoomRange
    ? {
        min: zoomRange.min,
        max: zoomRange.max,
        step: zoomRange.step ?? (zoomRange.max - zoomRange.min) / 100,
        value: hwZoom ?? zoomRange.min,
        label: `${Math.round((hwZoom ?? zoomRange.min) * 10) / 10}`,
      }
    : {
        min: 1,
        max: 3,
        step: 0.1,
        value: digitalZoom,
        label: `${digitalZoom.toFixed(1)}倍`,
      };
  /** ソフトウェア補正（明るさ・デジタルズーム）が効いているか。動画には反映されない。 */
  const softwareCorrectionActive =
    (brightnessMode === "sw" && brightnessPct !== 100) ||
    (zoomMode === "digital" && digitalZoom > 1);

  return (
    <section aria-label="撮影の操作" className={`flex flex-col gap-4 ${className}`}>
      {support.kind === "ok" && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1 text-base font-medium text-[var(--text)]">
              カメラ（スコープ）を選ぶ
              <select
                aria-label="カメラ（スコープ）を選ぶ"
                className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-lg text-[var(--text)]"
                value={deviceId}
                onChange={(e) => {
                  setDeviceId(e.target.value);
                  // 手動で選んだカメラは次回も使うため保存する
                  // （「自動」を選んだら保存を消す）。
                  saveDeviceId(e.target.value);
                  if (cameraOn) void startStream(e.target.value);
                }}
              >
                <option value="">自動（スコープを優先して選択）</option>
                {devices.map((d, i) => (
                  <option key={d.deviceId || `cam-${i}`} value={d.deviceId}>
                    {d.label || `カメラ ${i + 1}（名前はカメラ開始後に表示されます）`}
                  </option>
                ))}
              </select>
            </label>
            {cameraOn ? (
              <button
                type="button"
                onClick={stopStream}
                className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-5 text-lg font-medium text-[var(--text)]"
              >
                カメラを止める
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startStream(deviceId)}
                className="min-h-14 rounded-[var(--radius)] bg-[var(--accent)] px-5 text-lg font-bold text-white"
              >
                カメラを開始
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {cameraOn && (
              <p className="text-base text-[var(--text)]" aria-live="polite">
                使用中のカメラ：
                <span className="font-bold">
                  {activeLabel || "名前を取得できませんでした"}
                </span>
              </p>
            )}
            <button
              type="button"
              onClick={() => void redetectCamera()}
              className="min-h-11 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-base font-medium text-[var(--text)]"
            >
              カメラを再検出
            </button>
            {!cameraOn && devices.length === 0 && (
              <p className="text-base font-medium text-[var(--alert)]">
                カメラが見つかりません。スコープのUSB接続を確認してから「カメラを再検出」を押してください。
              </p>
            )}
          </div>

          {cameraOn && (
            <div className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
              <h3 className="text-lg font-bold text-[var(--text)]">
                カメラの調整
              </h3>

              <label className="flex flex-col gap-1 text-base font-medium text-[var(--text)]">
                解像度
                <select
                  aria-label="解像度を選ぶ"
                  disabled={recording}
                  className="min-h-14 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-lg text-[var(--text)] disabled:opacity-40"
                  value={resolutionKey}
                  onChange={(e) =>
                    changeResolution(e.target.value as ResolutionKey)
                  }
                >
                  {resolutionOptions.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                {currentSize && (
                  <span className="text-sm font-normal text-[var(--dim)]">
                    現在の映像：{currentSize.width} × {currentSize.height}
                  </span>
                )}
              </label>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="cap-brightness"
                  className="flex items-center gap-2 text-base font-medium text-[var(--text)]"
                >
                  明るさ
                  <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs font-normal text-[var(--dim)]">
                    {brightnessMode === "hw" ? "カメラ側" : "補正"}
                  </span>
                  <span className="ml-auto text-base font-bold">
                    {brightnessSlider.label}
                  </span>
                </label>
                <input
                  id="cap-brightness"
                  type="range"
                  aria-label="明るさ"
                  className="min-h-11 w-full"
                  style={{ accentColor: "var(--accent)" }}
                  min={brightnessSlider.min}
                  max={brightnessSlider.max}
                  step={brightnessSlider.step}
                  value={brightnessSlider.value}
                  onChange={(e) => setBrightnessValue(Number(e.target.value))}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="cap-zoom"
                  className="flex items-center gap-2 text-base font-medium text-[var(--text)]"
                >
                  ズーム
                  <span className="rounded border border-[var(--border)] px-1.5 py-0.5 text-xs font-normal text-[var(--dim)]">
                    {zoomMode === "hw" ? "カメラ側" : "補正"}
                  </span>
                  <span className="ml-auto text-base font-bold">
                    {zoomSlider.label}
                  </span>
                </label>
                <input
                  id="cap-zoom"
                  type="range"
                  aria-label="ズーム"
                  className="min-h-11 w-full"
                  style={{ accentColor: "var(--accent)" }}
                  min={zoomSlider.min}
                  max={zoomSlider.max}
                  step={zoomSlider.step}
                  value={zoomSlider.value}
                  onChange={(e) => setZoomValue(Number(e.target.value))}
                />
                <div className="flex flex-wrap items-center gap-3">
                  {zoomMode === "digital" && digitalZoom > 1 && (
                    <span className="text-sm text-[var(--dim)]">
                      拡大中は、プレビューをドラッグすると表示位置を動かせます
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={resetZoomView}
                    className="min-h-11 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 text-base font-medium text-[var(--text)]"
                  >
                    ズームを戻す
                  </button>
                </div>
              </div>

              {softwareCorrectionActive && (
                <p className="text-sm leading-relaxed text-[var(--dim)]">
                  明るさ補正とデジタルズームは静止画にのみ反映されます。動画は元の映像のまま録画されます。
                </p>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={!cameraOn || busy || recording || images.length >= MAX_IMAGES}
            onClick={() => void handleCapture()}
            className="min-h-16 rounded-[var(--radius)] bg-[var(--accent)] px-5 text-xl font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {images.length >= MAX_IMAGES
              ? `撮影は最大${MAX_IMAGES}枚までです`
              : `この画面を撮影する（あと${MAX_IMAGES - images.length}枚）`}
          </button>

          <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
            <h3 className="text-lg font-bold text-[var(--text)]">
              動画の撮影（血流速度の計測用・任意）
            </h3>
            <p className="text-base leading-relaxed text-[var(--text)]">
              動画は、安静時間をおいて指が落ち着いてから撮ってください。長さは10〜20秒が目安です（最長{MAX_RECORD_SEC}秒で自動的に止まります）。指が動くと計測が不安定になるため、撮影中は指を固定してください。
            </p>
            {video ? (
              <p className="text-base font-medium text-[var(--accent-strong)]">
                動画は下の「取り込み済みの動画」に添付されています。
              </p>
            ) : recording ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-xl font-bold text-[var(--alert)]" aria-live="polite">
                  ● 録画中 {recordElapsed.toFixed(0)}秒 / {MAX_RECORD_SEC}秒
                </p>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="min-h-14 rounded-[var(--radius)] bg-[var(--alert)] px-5 text-lg font-bold text-white"
                >
                  録画を止める
                </button>
              </div>
            ) : recorderOk ? (
              <button
                type="button"
                disabled={!cameraOn || busy}
                onClick={startRecording}
                className="min-h-14 self-start rounded-[var(--radius)] bg-[var(--accent)] px-5 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {cameraOn ? "動画の録画をはじめる" : "カメラを開始すると録画できます"}
              </button>
            ) : (
              <p className="rounded-[var(--radius)] bg-[var(--paper)] p-3 text-base leading-relaxed text-[var(--text)]">
                このブラウザ（Safariなど）ではブラウザ内での録画が使えないため、スコープの専用ソフトなどで撮った動画を、下の「動画ファイルから取り込む」から添付してください。取り込んだ動画でも同じ計測ができます。
              </p>
            )}
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy || recording || video != null}
          onClick={() => videoFileInputRef.current?.click()}
          className="min-h-14 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)] disabled:opacity-40"
        >
          動画ファイルから取り込む
        </button>
        <p className="text-base text-[var(--dim)]">
          専用ソフトで保存した動画（WebM / MP4）を取り込めます。動画は1回の観察に1本までです。
        </p>
        <input
          ref={videoFileInputRef}
          type="file"
          accept="video/webm,video/mp4"
          aria-label="動画ファイルから取り込む"
          className="hidden"
          onChange={(e) => void handleVideoFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {video && (
        <div className="flex flex-col gap-2 lg:hidden">
          <p className="text-lg font-medium text-[var(--text)]">
            取り込み済みの動画
            {video.durationSec != null && `（約${video.durationSec.toFixed(0)}秒）`}
          </p>
          <video
            src={video.previewUrl}
            controls
            playsInline
            aria-label="取り込み済みの観察動画"
            className="aspect-video w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--video-bg)]"
          />
          <button
            type="button"
            onClick={removeVideo}
            aria-label="動画を削除"
            className="min-h-11 self-start rounded border border-[var(--border)] bg-[var(--surface)] px-4 text-base text-[var(--alert)]"
          >
            動画を削除する
          </button>
        </div>
      )}

      {ipad && support.kind === "ok" && (
        <p className="rounded-[var(--radius)] bg-[var(--paper)] p-4 text-base leading-relaxed text-[var(--text)]">
          iPadでお使いの方へ：USB-C搭載のiPadでは、スコープを接続すると上のカメラ選択に出てきます。iPadOSは新しい版に更新してください。出てこない場合は、下の画像取り込みをお使いください。
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
          className="min-h-14 rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-5 text-lg font-bold text-[var(--accent-strong)] disabled:opacity-40"
        >
          画像ファイルから取り込む
        </button>
        <p className="text-base text-[var(--dim)]">
          スコープの専用ソフトで保存した画像も、ここから取り込めます（最大{MAX_IMAGES}枚まで）。
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          aria-label="画像ファイルから取り込む"
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {cameraError && (
        <p role="alert" className="text-lg font-medium text-[var(--alert)]">
          {cameraError}
        </p>
      )}

      {images.length > 0 && (
        <p className="text-base text-[var(--dim)]">
          撮り直す場合は、画面上部に固定された画像一覧で削除してからもう一度撮影してください。
        </p>
      )}
    </section>
  );
}

/** 従来どおりの縦積み構成（見出し→メディア→操作）。分割レイアウトを使わない場合の入口。 */
export function CapturePanel(props: Props) {
  const cap = useCapturePanel(props);
  return (
    <>
      <CaptureIntro support={cap.support} />
      <CaptureMediaDisplay cap={cap} />
      <CaptureControls cap={cap} />
    </>
  );
}
