// 動画から、いちばん鮮明な場面を静止画として切り出して代表画像にする（一般検査・研究用で共用）。
//
// - 動画だけがあって静止画が無いときは、自動で切り出す（動画ごとに1回だけ。
//   切り出した静止画を消しても、同じ動画から自動で作り直すことはしない）。
// - 先に静止画を撮っていたとき・切り出した画像を消したときは、ボタンから切り出せる（pick）。
//   切り出した画像が代表画像になる。同じ画像を二重に足さないよう、切り出した画像が
//   一覧にある間はボタンを出さない。
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  captureSharpestFramesFromVideoUrl,
  type CapturedImage,
  type CapturedVideo,
} from "./camera";
import { MAX_IMAGES } from "./CapturePanel";

export type VideoStill = {
  /** 画面に出す一言（無ければ null）。 */
  note: string | null;
  busy: boolean;
  /** ボタンから切り出せる状態か（動画があり、その動画から切り出した画像が一覧に無い）。 */
  canPick: boolean;
  pick: () => void;
};

export function useVideoStill({
  video,
  images,
  setImages,
  setPrimaryIndex,
  failureHint,
}: {
  video: CapturedVideo | null;
  images: CapturedImage[];
  setImages: Dispatch<SetStateAction<CapturedImage[]>>;
  setPrimaryIndex: (index: number) => void;
  /** 切り出せなかったときに添える一言（モードごとに違う）。 */
  failureHint: string;
}): VideoStill {
  const derivedFor = useRef<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // この動画から切り出して一覧に足した画像（一覧に残っている間は、ボタンを出さない）。
  const [added, setAdded] = useState<{ videoUrl: string; imageUrl: string } | null>(null);

  const describe = (sampled: number): string =>
    sampled > 1
      ? `動画の${sampled}か所を見比べて、いちばん鮮明な場面を代表画像にしました。`
      : "動画から静止画を切り出して代表画像にしました。";

  useEffect(() => {
    if (!video || images.length > 0) return;
    if (derivedFor.current === video.previewUrl) return;
    derivedFor.current = video.previewUrl;
    let cancelled = false;
    setBusy(true);
    setNote("動画から、いちばん鮮明な場面を探しています…");
    void captureSharpestFramesFromVideoUrl(video.previewUrl, 1)
      .then(({ frames, sampled }) => {
        if (cancelled) return;
        const frame = frames[0];
        if (!frame) throw new Error("no frame");
        setImages((current) => (current.length > 0 ? current : [frame.image]));
        setPrimaryIndex(0);
        setAdded({ videoUrl: video.previewUrl, imageUrl: frame.image.previewUrl });
        setNote(describe(sampled));
      })
      .catch(() => {
        if (!cancelled) setNote(`動画からの静止画の切り出しができませんでした。${failureHint}`);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      setBusy(false);
    };
    // setImages・setPrimaryIndex・failureHint は呼び出し側で毎回作られるため依存に入れない。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, images.length]);

  const pick = () => {
    if (!video || busy) return;
    if (images.length >= MAX_IMAGES) {
      setNote(`画像は最大${MAX_IMAGES}枚までです。1枚削除してから、もう一度押してください。`);
      return;
    }
    setBusy(true);
    setNote("動画から、いちばん鮮明な場面を探しています…");
    const url = video.previewUrl;
    void captureSharpestFramesFromVideoUrl(url, 1)
      .then(({ frames, sampled }) => {
        const frame = frames[0];
        if (!frame) throw new Error("no frame");
        const at = images.length;
        setImages((current) => [...current, frame.image].slice(0, MAX_IMAGES));
        setPrimaryIndex(Math.min(at, MAX_IMAGES - 1));
        setAdded({ videoUrl: url, imageUrl: frame.image.previewUrl });
        setNote(describe(sampled));
      })
      .catch(() => setNote(`動画からの静止画の切り出しができませんでした。${failureHint}`))
      .finally(() => setBusy(false));
  };

  const alreadyAdded =
    added != null &&
    video != null &&
    added.videoUrl === video.previewUrl &&
    images.some((img) => img.previewUrl === added.imageUrl);
  return { note, busy, canPick: Boolean(video) && !busy && !alreadyAdded, pick };
}

/** 切り出しの一言と、切り出しのボタン（撮影の操作のすぐ下に置く）。 */
export function VideoStillNote({ still, className = "" }: { still: VideoStill; className?: string }) {
  if (!still.note && !still.canPick) return null;
  return (
    <div
      className={`flex flex-col gap-2 rounded-[var(--radius)] bg-[var(--paper)] p-3 text-base leading-relaxed text-[var(--text)] ${className}`}
    >
      {still.note && (
        <p role="status" aria-live="polite">
          {still.note}
        </p>
      )}
      {still.canPick && (
        <button
          type="button"
          onClick={still.pick}
          className="min-h-11 self-start rounded-[var(--radius)] border-2 border-[var(--accent)] bg-[var(--surface)] px-4 text-base font-bold text-[var(--accent-strong)] disabled:opacity-40"
        >
          動画からいちばん鮮明な場面を切り出す
        </button>
      )}
    </div>
  );
}
