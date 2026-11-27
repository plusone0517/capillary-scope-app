// 撮影パネル：スコープ（USBカメラ）のライブプレビュー、静止画撮影、
// 画像ファイル取り込み、撮影済み画像の管理（最大5枚・代表画像の指定）。
//
// 対応環境は Windows PC（Chrome/Edge）と iPad（Safari）。
// 撮影は video要素 + canvas のみ。デバイス一覧は許可取得後に読み直す
// （Safariは許可前にラベルが返らないため）。

import { useCallback, useEffect, useRef, useState } from "react";
import {
blobToCapturedVideo,
captureFromVideo,
detectCameraSupport,
detectRecorderSupport,
fileToCaptured,
fileToCapturedVideo,
isIPad,
pickRecorderMimeType,
type CapturedImage,
type CapturedVideo,
} from "./camera";

const MAX_IMAGES = 5;
const MAX_RECORD_SEC = 20;

type Props = {
  images: CapturedImage[];
  primaryIndex: number;
  onChange: (images: CapturedImage[], primaryIndex: number) => void;
  video: CapturedVideo | null;
  onVideoChange: (video: CapturedVideo | null) => void;
};

export function CapturePanel({
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
  const [deviceId, setDeviceId] = useState<string>("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordElapsed, setRecordElapsed] = useState(0);

  const stopStream = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      discardRecordingRef.current = true;
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
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

  const startStream = useCallback(
    async (targetDeviceId: string) => {
      setCameraError(null);
      try {
        const constraints: MediaStreamConstraints = {
          video: targetDeviceId
            ? { deviceId: { exact: targetDeviceId } }
            : { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCameraOn(true);
        // 許可が取れたあとに一覧を読み直すと、カメラ名（ラベル）が出る。
        const all = await navigator.mediaDevices.enumerateDevices();
        const cams = all.filter((d) => d.kind === "videoinput");
        setDevices(cams);
        const active = stream.getVideoTracks()[0]?.getSettings().deviceId;
        if (active) setDeviceId(active);
      } catch {
        setCameraError(
          "カメラを起動できませんでした。スコープが接続されているか、ブラウザのカメラ許可がオンになっているか確認してください。",
        );
        setCameraOn(false);
      }
    },
    [],
  );

  // 初回マウント時にデバイス一覧（許可前は名前なし）を取得する。
  useEffect(() => {
    if (support.kind !== "ok") return;
    let cancelled = false;
    navigator.mediaDevices
      .enumerateDevices()
      .then((all) => {
        if (cancelled) return;
        setDevices(all.filter((d) => d.kind === "videoinput"));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (recordTimerRef.current != null) {
        window.clearInterval(recordTimerRef.current);
        recordTimerRef.current = null;
      }
      stopStream();
    };
  }, [support.kind, stopStream]);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || images.length >= MAX_IMAGES) return;
    setBusy(true);
    try {
      const captured = await captureFromVideo(video);
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

  return (
    <>
      <div className="flex flex-col gap-4">
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

      {/* 固定エリア：ライブプレビューと撮影済み画像は画面上部に貼り付けて常に見えるようにする。
          高さは抑え、下の入力項目のスクロールを邪魔しない大きさにする。 */}
      {(support.kind === "ok" || images.length > 0) && (
        <div className="sticky top-0 z-30 -mx-4 flex flex-col gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-2 shadow-[0_8px_16px_-12px_rgba(0,0,0,0.4)] sm:-mx-6 sm:px-6">
          {support.kind === "ok" && (
            <div className="relative overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                aria-label="スコープのライブプレビュー"
                className="h-44 w-full object-contain sm:h-60"
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
            <div>
              <p className="mb-1 text-base font-medium text-[var(--text)]">
                撮影・取り込み済みの画像（{images.length}枚）―
                画像を押すと代表画像になります
              </p>
              <ul className="flex gap-2 overflow-x-auto pb-1">
                {images.map((img, i) => (
                  <li
                    key={img.previewUrl}
                    className="flex w-24 shrink-0 flex-col gap-1"
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
        </div>
      )}

      <section aria-label="撮影の操作" className="flex flex-col gap-4">
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
                  if (cameraOn) void startStream(e.target.value);
                }}
              >
                <option value="">自動（既定のカメラ）</option>
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

          <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4">
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
        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-[var(--text)]">
            取り込み済みの動画
            {video.durationSec != null && `（約${video.durationSec.toFixed(0)}秒）`}
          </p>
          <video
            src={video.previewUrl}
            controls
            playsInline
            aria-label="取り込み済みの観察動画"
            className="aspect-video w-full rounded-[var(--radius)] border border-[var(--border)] bg-black"
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
    </>
  );
}
