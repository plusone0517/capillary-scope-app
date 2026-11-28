// 撮った画像の画質の目安を、撮影のすぐそばに出す。
// 読み取りにくい画像のときだけ、撮り直しの案内を出す（保存や解析は止めない）。
// 測り方は imageQuality.ts。
import { useEffect, useState } from "react";
import { assessImageQuality, qualityAdvice, type ImageQuality } from "./imageQuality";
import { readImagePixels } from "./scaleDetect";

/** 画像のURLから画質の目安を出す。読めない画像（保存済みの画像など）は null。 */
export function useImageQuality(imageUrl: string | null): ImageQuality | null {
  const [quality, setQuality] = useState<ImageQuality | null>(null);
  useEffect(() => {
    setQuality(null);
    if (!imageUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const pixels = readImagePixels(img);
      setQuality(pixels ? assessImageQuality(pixels) : null);
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);
  return quality;
}

export function ImageQualityHint({
  imageUrl,
  className = "",
}: {
  /** 確かめる画像（代表画像）。 */
  imageUrl: string | null;
  className?: string;
}) {
  const quality = useImageQuality(imageUrl);
  if (!quality || quality.issues.length === 0) return null;
  return (
    <div
      role="status"
      aria-label="画質の目安"
      className={`rounded-[var(--radius)] border border-[var(--border)] bg-[var(--paper)] px-4 py-3 text-base leading-relaxed text-[var(--text)] ${className}`}
    >
      <p className="font-bold text-[var(--heading)]">代表画像の画質の目安</p>
      {qualityAdvice(quality.issues).map((text) => (
        <p key={text}>{text}</p>
      ))}
      <p className="text-[var(--dim)]">このまま進めることもできます。</p>
    </div>
  );
}
