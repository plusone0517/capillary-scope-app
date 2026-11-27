// 製品ロゴマーク。毛細血管のループ（ヘアピン状に折り返す1本の血管）を
// 細い線2本で表したもの。外側のループが血管の輪郭（ネイビー #0D3B4C）、
// 内側の細いループが血の流れ（ティール #12808A）。
// 色はテーマの基調2色のみを使い、画面・印刷のどちらでも同じ形で出す。
export function LogoMark({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M15 43 V21 a9 9 0 0 1 18 0 V43"
        stroke="#0D3B4C"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M22 43 V22.5 a2 2 0 0 1 4 0 V43"
        stroke="#12808A"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
