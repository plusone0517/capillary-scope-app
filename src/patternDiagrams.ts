// パターン模式図の描画データ。
//
// 正本チャート `capillary-patterns-chart-2026-11-27.svg` の各カードの
// ループ描画（線と点）をそのまま抽出し、共通の viewBox（264×96）に
// 正規化したもの。形・色・線の太さの比率は正本のまま変えていない。

export type DiagramPath = {
  d: string;
  stroke: string;
  width: number;
  opacity?: number;
};

export type DiagramCircle = {
  cx: number;
  cy: number;
  r: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
};

export type PatternDiagramData = {
  paths: DiagramPath[];
  circles: DiagramCircle[];
};

export const DIAGRAM_VIEWBOX = "0 0 264 96";

export const patternDiagrams: Record<string, PatternDiagramData> = {
  "normal": {
    paths: [
      {
        d: "M 6.6 90.0 C 6.6 6.0 25.3 6.0 25.3 90.0",
        stroke: "#c1272d",
        width: 3.32,
        opacity: 1.0
      },
      {
        d: "M 53.0 90.0 C 53.0 6.0 71.8 6.0 71.8 90.0",
        stroke: "#c1272d",
        width: 3.32,
        opacity: 1.0
      },
      {
        d: "M 99.4 90.0 C 99.4 6.0 118.2 6.0 118.2 90.0",
        stroke: "#c1272d",
        width: 3.32,
        opacity: 1.0
      },
      {
        d: "M 145.8 90.0 C 145.8 6.0 164.6 6.0 164.6 90.0",
        stroke: "#c1272d",
        width: 3.32,
        opacity: 1.0
      },
      {
        d: "M 192.2 90.0 C 192.2 6.0 211.0 6.0 211.0 90.0",
        stroke: "#c1272d",
        width: 3.32,
        opacity: 1.0
      },
      {
        d: "M 238.7 90.0 C 238.7 6.0 257.4 6.0 257.4 90.0",
        stroke: "#c1272d",
        width: 3.32,
        opacity: 1.0
      }
    ],
    circles: []
  },
  "vessel_hardening": {
    paths: [
      {
        d: "M 14.8 90.0 C 14.8 6.0 46.3 6.0 46.3 90.0",
        stroke: "#c1272d",
        width: 6.42,
        opacity: 1.0
      },
      {
        d: "M 82.4 90.0 C 82.4 6.0 113.9 6.0 113.9 90.0",
        stroke: "#c1272d",
        width: 6.42,
        opacity: 1.0
      },
      {
        d: "M 150.1 90.0 C 150.1 6.0 181.6 6.0 181.6 90.0",
        stroke: "#c1272d",
        width: 6.42,
        opacity: 1.0
      },
      {
        d: "M 217.8 90.0 C 217.8 6.0 249.2 6.0 249.2 90.0",
        stroke: "#c1272d",
        width: 6.42,
        opacity: 1.0
      }
    ],
    circles: []
  },
  "microcirculation_onset": {
    paths: [
      {
        d: "M 13.7 90.0 C 13.7 48.0 19.3 10.4 25.9 6.0 C 32.5 10.4 38.1 48.0 38.1 90.0",
        stroke: "#c1272d",
        width: 3.32
      },
      {
        d: "M 66.8 90.0 C 66.8 48.0 72.3 10.4 78.9 6.0 C 85.6 10.4 91.1 48.0 91.1 90.0",
        stroke: "#c1272d",
        width: 3.32
      },
      {
        d: "M 119.8 90.0 C 119.8 48.0 125.4 10.4 132.0 6.0 C 138.6 10.4 144.2 48.0 144.2 90.0",
        stroke: "#c1272d",
        width: 3.32
      },
      {
        d: "M 172.9 90.0 C 172.9 48.0 178.4 10.4 185.1 6.0 C 191.7 10.4 197.2 48.0 197.2 90.0",
        stroke: "#c1272d",
        width: 3.32
      },
      {
        d: "M 225.9 90.0 C 225.9 48.0 231.5 10.4 238.1 6.0 C 244.7 10.4 250.3 48.0 250.3 90.0",
        stroke: "#c1272d",
        width: 3.32
      }
    ],
    circles: []
  },
  "allergy_prone": {
    paths: [
      {
        d: "M 6.0 57.4 C 6.0 38.6 23.6 38.6 23.6 57.4",
        stroke: "#c1272d",
        width: 2.93,
        opacity: 0.75
      },
      {
        d: "M 52.9 57.4 C 52.9 38.6 70.5 38.6 70.5 57.4",
        stroke: "#c1272d",
        width: 2.93,
        opacity: 0.75
      },
      {
        d: "M 99.8 57.4 C 99.8 38.6 117.3 38.6 117.3 57.4",
        stroke: "#c1272d",
        width: 2.93,
        opacity: 0.75
      },
      {
        d: "M 146.7 57.4 C 146.7 38.6 164.2 38.6 164.2 57.4",
        stroke: "#c1272d",
        width: 2.93,
        opacity: 0.75
      },
      {
        d: "M 193.5 57.4 C 193.5 38.6 211.1 38.6 211.1 57.4",
        stroke: "#c1272d",
        width: 2.93,
        opacity: 0.75
      },
      {
        d: "M 240.4 57.4 C 240.4 38.6 258.0 38.6 258.0 57.4",
        stroke: "#c1272d",
        width: 2.93,
        opacity: 0.75
      }
    ],
    circles: []
  },
  "liver_decline": {
    paths: [
      {
        d: "M 6.0 63.0 C 6.0 33.0 68.4 33.0 68.4 63.0",
        stroke: "#c1272d",
        width: 4.05,
        opacity: 1.0
      },
      {
        d: "M 100.8 63.0 C 100.8 33.0 163.2 33.0 163.2 63.0",
        stroke: "#c1272d",
        width: 4.05,
        opacity: 1.0
      },
      {
        d: "M 195.6 63.0 C 195.6 33.0 258.0 33.0 258.0 63.0",
        stroke: "#c1272d",
        width: 4.05,
        opacity: 1.0
      }
    ],
    circles: []
  },
  "sugar_excess": {
    paths: [
      {
        d: "M 7.1 90.0 C 7.1 6.0 51.3 6.0 51.3 90.0",
        stroke: "#c1272d",
        width: 4.42,
        opacity: 1.0
      },
      {
        d: "M 75.6 90.0 C 75.6 6.0 119.8 6.0 119.8 90.0",
        stroke: "#c1272d",
        width: 4.42,
        opacity: 1.0
      },
      {
        d: "M 144.2 90.0 C 144.2 6.0 188.4 6.0 188.4 90.0",
        stroke: "#c1272d",
        width: 4.42,
        opacity: 1.0
      },
      {
        d: "M 212.7 90.0 C 212.7 6.0 256.9 6.0 256.9 90.0",
        stroke: "#c1272d",
        width: 4.42,
        opacity: 1.0
      }
    ],
    circles: []
  },
  "lipid_excess": {
    paths: [
      {
        d: "M 28.1 90.0 C 28.1 6.0 92.2 14.8 105.5 90.0",
        stroke: "#c1272d",
        width: 4.42
      },
      {
        d: "M 158.5 90.0 C 158.5 6.0 222.6 14.8 235.9 90.0",
        stroke: "#c1272d",
        width: 4.42
      }
    ],
    circles: []
  },
  "cardiac_decline": {
    paths: [
      {
        d: "M 28.0 79.0 C 28.0 17.0 50.0 17.0 50.0 79.0",
        stroke: "#c1272d",
        width: 3.0,
        opacity: 1.0
      },
      {
        d: "M 90.0 79.0 C 90.0 17.0 112.0 17.0 112.0 79.0",
        stroke: "#c1272d",
        width: 3.0,
        opacity: 1.0
      },
      {
        d: "M 152.0 79.0 C 152.0 17.0 174.0 17.0 174.0 79.0",
        stroke: "#c1272d",
        width: 3.0,
        opacity: 1.0
      },
      {
        d: "M 214.0 79.0 C 214.0 17.0 236.0 17.0 236.0 79.0",
        stroke: "#c1272d",
        width: 3.0,
        opacity: 1.0
      },
      {
        d: "M 6.0 37.0 C 74.0 25.0 154.0 49.0 258.0 37.0",
        stroke: "#c1272d",
        width: 3.0
      },
      {
        d: "M 6.0 61.0 C 74.0 49.0 154.0 73.0 258.0 61.0",
        stroke: "#c1272d",
        width: 3.0
      }
    ],
    circles: []
  },
  "hormone_imbalance": {
    paths: [
      {
        d: "M 19.6 90.0 C 19.6 12.7 40.0 12.7 40.0 90.0",
        stroke: "#c1272d",
        width: 3.05,
        opacity: 1.0
      },
      {
        d: "M 70.5 90.0 C 70.5 12.7 90.8 12.7 90.8 90.0",
        stroke: "#c1272d",
        width: 3.05,
        opacity: 1.0
      },
      {
        d: "M 121.3 90.0 C 121.3 12.7 141.7 12.7 141.7 90.0",
        stroke: "#c1272d",
        width: 3.05,
        opacity: 1.0
      },
      {
        d: "M 172.2 90.0 C 172.2 12.7 192.5 12.7 192.5 90.0",
        stroke: "#c1272d",
        width: 3.05,
        opacity: 1.0
      },
      {
        d: "M 223.0 90.0 C 223.0 12.7 243.4 12.7 243.4 90.0",
        stroke: "#c1272d",
        width: 3.05,
        opacity: 1.0
      }
    ],
    circles: [
      {
        cx: 31.8,
        cy: 15.8,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 36.9,
        cy: 48.3,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 14.5,
        cy: 10.7,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 46.1,
        cy: 12.7,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 85.7,
        cy: 44.2,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 65.4,
        cy: 39.2,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 75.6,
        cy: 8.6,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 67.4,
        cy: 34.1,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 139.6,
        cy: 10.7,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 128.4,
        cy: 11.7,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 140.6,
        cy: 9.7,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 120.3,
        cy: 20.8,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 167.1,
        cy: 43.2,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 189.5,
        cy: 9.7,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 178.3,
        cy: 8.6,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 172.2,
        cy: 24.9,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 241.3,
        cy: 15.8,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 249.5,
        cy: 13.7,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 234.2,
        cy: 42.2,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      },
      {
        cx: 226.1,
        cy: 12.7,
        r: 2.6,
        fill: "#c1272d",
        opacity: 0.65
      }
    ]
  },
  "tissue_proliferation": {
    paths: [
      {
        d: "M 38.8 90.0 L 38.8 30.1",
        stroke: "#c1272d",
        width: 3.6
      },
      {
        d: "M 38.8 30.1 Q 30.0 8.5 24.1 16.0",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 38.8 30.1 Q 35.3 8.5 33.0 11.6",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 38.8 30.1 Q 41.8 8.5 43.8 11.4",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 38.8 30.1 Q 47.3 8.5 52.9 15.5",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 132.3 90.0 L 132.3 30.1",
        stroke: "#c1272d",
        width: 3.6
      },
      {
        d: "M 132.3 30.1 Q 123.5 8.5 117.6 16.0",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 132.3 30.1 Q 128.9 8.5 126.5 11.6",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 132.3 30.1 Q 135.3 8.5 137.3 11.4",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 132.3 30.1 Q 140.8 8.5 146.4 15.5",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 225.9 90.0 L 225.9 30.1",
        stroke: "#c1272d",
        width: 3.6
      },
      {
        d: "M 225.9 30.1 Q 217.0 8.5 211.1 16.0",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 225.9 30.1 Q 222.4 8.5 220.0 11.6",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 225.9 30.1 Q 228.8 8.5 230.8 11.4",
        stroke: "#c1272d",
        width: 2.88
      },
      {
        d: "M 225.9 30.1 Q 234.3 8.5 239.9 15.5",
        stroke: "#c1272d",
        width: 2.88
      }
    ],
    circles: [
      {
        cx: 24.1,
        cy: 16.0,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 33.0,
        cy: 11.6,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 43.8,
        cy: 11.4,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 52.9,
        cy: 15.5,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 117.6,
        cy: 16.0,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 126.5,
        cy: 11.6,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 137.3,
        cy: 11.4,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 146.4,
        cy: 15.5,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 211.1,
        cy: 16.0,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 220.0,
        cy: 11.6,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 230.8,
        cy: 11.4,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      },
      {
        cx: 239.9,
        cy: 15.5,
        r: 5.4,
        fill: "none",
        stroke: "#c1272d",
        strokeWidth: 2.64
      }
    ]
  },
  "deformity": {
    paths: [
      {
        d: "M 6.0 78.0 C 6.0 22.8 34.8 18.0 20.4 39.6 C 8.4 56.4 32.4 61.2 32.4 78.0",
        stroke: "#c1272d",
        width: 3.6
      },
      {
        d: "M 80.4 78.0 C 80.4 22.8 109.2 18.0 94.8 39.6 C 82.8 56.4 106.8 61.2 106.8 78.0",
        stroke: "#c1272d",
        width: 3.6
      },
      {
        d: "M 154.8 78.0 C 154.8 22.8 183.6 18.0 169.2 39.6 C 157.2 56.4 181.2 61.2 181.2 78.0",
        stroke: "#c1272d",
        width: 3.6
      },
      {
        d: "M 229.2 78.0 C 229.2 22.8 258.0 18.0 243.6 39.6 C 231.6 56.4 255.6 61.2 255.6 78.0",
        stroke: "#c1272d",
        width: 3.6
      }
    ],
    circles: []
  },
  "giant": {
    paths: [
      {
        d: "M 23.2 90.0 C 23.2 6.0 77.1 6.0 77.1 90.0",
        stroke: "#c1272d",
        width: 6.46,
        opacity: 1.0
      },
      {
        d: "M 105.1 90.0 C 105.1 6.0 158.9 6.0 158.9 90.0",
        stroke: "#c1272d",
        width: 6.46,
        opacity: 1.0
      },
      {
        d: "M 186.9 90.0 C 186.9 6.0 240.8 6.0 240.8 90.0",
        stroke: "#c1272d",
        width: 6.46,
        opacity: 1.0
      }
    ],
    circles: []
  },
  "hemorrhage": {
    paths: [
      {
        d: "M 17.7 90.0 C 17.7 14.4 38.6 14.4 38.6 90.0",
        stroke: "#c1272d",
        width: 3.48,
        opacity: 1.0
      },
      {
        d: "M 69.4 90.0 C 69.4 14.4 90.2 14.4 90.2 90.0",
        stroke: "#c1272d",
        width: 3.48,
        opacity: 1.0
      },
      {
        d: "M 121.1 90.0 C 121.1 14.4 141.9 14.4 141.9 90.0",
        stroke: "#c1272d",
        width: 3.48,
        opacity: 1.0
      },
      {
        d: "M 172.8 90.0 C 172.8 14.4 193.6 14.4 193.6 90.0",
        stroke: "#c1272d",
        width: 3.48,
        opacity: 1.0
      },
      {
        d: "M 224.4 90.0 C 224.4 14.4 245.3 14.4 245.3 90.0",
        stroke: "#c1272d",
        width: 3.48,
        opacity: 1.0
      }
    ],
    circles: [
      {
        cx: 27.6,
        cy: 10.5,
        r: 4.5,
        fill: "#7a4a21"
      },
      {
        cx: 36.6,
        cy: 21.4,
        r: 3.0,
        fill: "#96622c"
      },
      {
        cx: 79.3,
        cy: 10.5,
        r: 4.5,
        fill: "#7a4a21"
      },
      {
        cx: 88.3,
        cy: 21.4,
        r: 3.0,
        fill: "#96622c"
      },
      {
        cx: 131.0,
        cy: 10.5,
        r: 4.5,
        fill: "#7a4a21"
      },
      {
        cx: 140.0,
        cy: 21.4,
        r: 3.0,
        fill: "#96622c"
      },
      {
        cx: 182.7,
        cy: 10.5,
        r: 4.5,
        fill: "#7a4a21"
      },
      {
        cx: 191.6,
        cy: 21.4,
        r: 3.0,
        fill: "#96622c"
      },
      {
        cx: 234.4,
        cy: 10.5,
        r: 4.5,
        fill: "#7a4a21"
      },
      {
        cx: 243.3,
        cy: 21.4,
        r: 3.0,
        fill: "#96622c"
      }
    ]
  },
  "capillary_loss": {
    paths: [
      {
        d: "M 9.9 90.0 C 9.9 6.0 30.9 6.0 30.9 90.0",
        stroke: "#c1272d",
        width: 3.32,
        opacity: 1.0
      },
      {
        d: "M 71.8 90.0 C 71.8 6.0 92.8 6.0 92.8 90.0",
        stroke: "#c1272d",
        width: 3.32,
        opacity: 1.0
      },
      {
        d: "M 146.9 90.0 C 146.9 6.0 167.9 6.0 167.9 90.0",
        stroke: "#d3a49e",
        width: 3.32,
        opacity: 0.85
      },
      {
        d: "M 233.1 90.0 C 233.1 6.0 254.1 6.0 254.1 90.0",
        stroke: "#c1272d",
        width: 3.32,
        opacity: 1.0
      }
    ],
    circles: []
  },
  "tortuous": {
    paths: [
      {
        d: "M 27.6 90.0 C 15.4 50.2 41.9 39.2 29.8 21.5 C 20.9 10.4 40.8 6.0 45.2 19.3 C 49.7 32.5 38.6 72.3 47.4 90.0",
        stroke: "#c1272d",
        width: 3.32
      },
      {
        d: "M 93.9 90.0 C 81.7 50.2 108.2 39.2 96.1 21.5 C 87.2 10.4 107.1 6.0 111.6 19.3 C 116.0 32.5 104.9 72.3 113.8 90.0",
        stroke: "#c1272d",
        width: 3.32
      },
      {
        d: "M 160.2 90.0 C 148.0 50.2 174.6 39.2 162.4 21.5 C 153.6 10.4 173.4 6.0 177.9 19.3 C 182.3 32.5 171.2 72.3 180.1 90.0",
        stroke: "#c1272d",
        width: 3.32
      },
      {
        d: "M 226.5 90.0 C 214.3 50.2 240.9 39.2 228.7 21.5 C 219.9 10.4 239.8 6.0 244.2 19.3 C 248.6 32.5 237.6 72.3 246.4 90.0",
        stroke: "#c1272d",
        width: 3.32
      }
    ],
    circles: []
  },
  "congestion": {
    paths: [
      {
        d: "M 6.0 84.3 C 6.0 11.7 29.9 11.7 29.9 84.3",
        stroke: "#8e1f24",
        width: 5.19,
        opacity: 1.0
      },
      {
        d: "M 51.6 84.3 C 51.6 11.7 75.5 11.7 75.5 84.3",
        stroke: "#8e1f24",
        width: 5.19,
        opacity: 1.0
      },
      {
        d: "M 97.3 84.3 C 97.3 11.7 121.1 11.7 121.1 84.3",
        stroke: "#8e1f24",
        width: 5.19,
        opacity: 1.0
      },
      {
        d: "M 142.9 84.3 C 142.9 11.7 166.7 11.7 166.7 84.3",
        stroke: "#8e1f24",
        width: 5.19,
        opacity: 1.0
      },
      {
        d: "M 188.5 84.3 C 188.5 11.7 212.4 11.7 212.4 84.3",
        stroke: "#8e1f24",
        width: 5.19,
        opacity: 1.0
      },
      {
        d: "M 234.1 84.3 C 234.1 11.7 258.0 11.7 258.0 84.3",
        stroke: "#8e1f24",
        width: 5.19,
        opacity: 1.0
      }
    ],
    circles: []
  },
  "renal_decline": {
    paths: [
      {
        d: "M 6.0 86.4 C 6.0 9.6 25.2 9.6 25.2 86.4",
        stroke: "#d98a80",
        width: 3.0
      },
      {
        d: "M 73.2 86.4 C 68.4 19.2 92.4 14.4 85.2 86.4",
        stroke: "#d98a80",
        width: 3.0
      },
      {
        d: "M 166.8 86.4 C 166.8 16.8 186.0 16.8 186.0 86.4",
        stroke: "#d98a80",
        width: 3.0
      },
      {
        d: "M 241.2 86.4 C 236.4 24.0 258.0 19.2 253.2 86.4",
        stroke: "#d98a80",
        width: 3.0
      }
    ],
    circles: []
  },
  "autoimmune_lupus": {
    paths: [
      {
        d: "M 50.1 90.0 C 41.7 27.0 66.9 8.1 58.5 39.6 C 52.2 62.7 69.0 73.2 64.8 90.0",
        stroke: "#c1272d",
        width: 3.15
      },
      {
        d: "M 125.7 90.0 C 119.4 22.8 146.7 6.0 136.2 41.7 C 129.9 64.8 144.6 75.3 140.4 90.0",
        stroke: "#c1272d",
        width: 3.15
      },
      {
        d: "M 201.3 90.0 C 195.0 29.1 220.2 10.2 211.8 41.7 C 205.5 64.8 222.3 75.3 216.0 90.0",
        stroke: "#c1272d",
        width: 3.15
      }
    ],
    circles: [
      {
        cx: 102.6,
        cy: 27.0,
        r: 3.7,
        fill: "#7a4a21"
      },
      {
        cx: 181.3,
        cy: 52.2,
        r: 3.2,
        fill: "#96622c"
      }
    ]
  },
  "inflammation": {
    paths: [
      {
        d: "M 23.8 90.0 C 23.8 11.1 54.4 11.1 54.4 90.0",
        stroke: "#c1272d",
        width: 5.73
      },
      {
        d: "M 115.5 90.0 C 115.5 6.0 148.5 6.0 148.5 90.0",
        stroke: "#c1272d",
        width: 5.73
      },
      {
        d: "M 209.6 90.0 C 209.6 13.6 240.2 13.6 240.2 90.0",
        stroke: "#c1272d",
        width: 5.73
      }
    ],
    circles: [
      {
        cx: 84.9,
        cy: 26.4,
        r: 3.8,
        fill: "#c1272d",
        opacity: 0.4
      },
      {
        cx: 176.5,
        cy: 54.4,
        r: 4.3,
        fill: "#c1272d",
        opacity: 0.4
      },
      {
        cx: 34.0,
        cy: 64.5,
        r: 3.3,
        fill: "#c1272d",
        opacity: 0.4
      },
      {
        cx: 227.5,
        cy: 21.3,
        r: 3.3,
        fill: "#c1272d",
        opacity: 0.4
      },
      {
        cx: 133.3,
        cy: 74.7,
        r: 3.6,
        fill: "#c1272d",
        opacity: 0.4
      },
      {
        cx: 67.1,
        cy: 82.4,
        r: 3.1,
        fill: "#c1272d",
        opacity: 0.4
      }
    ]
  },
  "anemia": {
    paths: [
      {
        d: "M 6.0 82.1 C 6.0 13.9 21.9 13.9 21.9 82.1",
        stroke: "#e3b3ac",
        width: 2.27
      },
      {
        d: "M 65.0 82.1 C 65.0 13.9 80.9 13.9 80.9 82.1",
        stroke: "#e3b3ac",
        width: 2.27
      },
      {
        d: "M 124.1 82.1 C 124.1 13.9 139.9 13.9 139.9 82.1",
        stroke: "#e3b3ac",
        width: 2.27
      },
      {
        d: "M 183.1 82.1 C 183.1 13.9 199.0 13.9 199.0 82.1",
        stroke: "#e3b3ac",
        width: 2.27
      },
      {
        d: "M 242.1 82.1 C 242.1 13.9 258.0 13.9 258.0 82.1",
        stroke: "#e3b3ac",
        width: 2.27
      }
    ],
    circles: []
  }
};
