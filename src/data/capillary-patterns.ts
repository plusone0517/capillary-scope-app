// 毛細血管観察の形パターン定義（28種）。
//
// 移植元: ルーツマイル側ローカル実装
//   ~/workspace/roots-mile-dev/capillary/packages/core/capillary-patterns.ts
// 最初の20種の名前・特徴は、参照パターン図
// `capillary-patterns-chart-2026-11-27.svg`（2026-11-27作成）を正本として
// 転記したもの。末尾の8種は爪郭カピラロスコピーの標準的な形態分類から
// 文献ベースで追加した（2026-11-27）。パターンは断定ではなく
// 「最も近い形」として記録する（撮影と記録の型 4節）。
//
// 説明文は2026-11-27に4部構成（形の特徴／原因／重なりやすい症状／
// 未病の見方）へ書き直した。症状は診断ではなく観察の範囲の表現に留め、
// 臨床フラグのパターンの「未病の見方」は受診案内の方向で書く。
//
// アドバイス文面はユーザー確認待ちのため、ここには含めない。
// 文面が決まったら別定義として追加する。

export type CapillaryPattern = {
  /** パターン28種に対応する英語スラッグ。Firestore の patterns[] に保存する値。 */
  code: string;
  name: string;
  /** 形の特徴（パターン図の説明文）。 */
  feature: string;
  /** 原因（なぜその形になるかを、原因として書き切った説明）。 */
  why: string;
  /** 重なりやすい症状（診断ではなく、観察の範囲で一緒に見られやすい訴え）。 */
  symptoms: string;
  /**
   * 未病の見方（病気と診断される前の段階として、形をどう読むか）。
   * 臨床フラグのパターンは未病の範囲を超えるため、受診案内の方向で書く。
   */
  mibyo: string;
  /**
   * 臨床フラグ（巨大・微小出血・脱落・分枝）に対応するパターンか。
   * パターン図の注記「巨大毛細血管・微小出血・脱落・分枝は、全身性強皮症の
   * 所見として臨床の診断補助に使われています」に基づく。
   */
  clinical: boolean;
};

export const capillaryPatterns: CapillaryPattern[] = [
  {
    code: "normal",
    name: "正常",
    feature: "真っ直ぐ伸びたヘアピン状の毛細血管が規則正しく並ぶ。太さ・長さ・間隔がそろった状態。",
    why: "内皮・基底膜・周細胞がそろい、血圧と流量が安定していることが土台となり、ループの太さと長さが均一に保たれる。",
    symptoms: "冷えやむくみなどの訴えとは重なりにくい。",
    mibyo: "未病の段階でも形が保たれている状態で、今の生活リズムを続ける目安になる。",
    clinical: false,
  },
  {
    code: "vessel_hardening",
    name: "血管の硬化",
    feature: "ループが太くなり、くねりが出る。",
    why: "血管の壁に脂質がたまって厚く硬くなり、内腔が狭まることが原因。流れの抵抗が上がり、弾力を失った部分から太くなり、くねりが出る。",
    symptoms: "肩こり、頭痛、腰の重さと重なりやすい。",
    mibyo: "血管の壁の老化が末梢に現れ始めた段階で、食事と運動の立て直しで経過を比べやすい範囲。",
    clinical: false,
  },
  {
    code: "microcirculation_onset",
    name: "微小循環障害の始まり",
    feature: "ループの上部が細くなり始めているが、血流は通っている。『瘀血』の始まりとされる形。",
    why: "末梢まで届く血の勢いが落ち、最も遠いループの先端まで圧が届きにくくなることが原因。血液の粘りも加わり、先端から細く見えるようになる。",
    symptoms: "冷え、肩こり、肌のくすみと重なりやすい。",
    mibyo: "末梢循環の弱さが先端に現れ始めた段階で、生活の立て直しで戻りやすい範囲として経過を見る。",
    clinical: false,
  },
  {
    code: "allergy_prone",
    name: "アレルギー体質",
    feature: "先端部分だけが見え、他はほとんど見えない。",
    why: "アレルギー反応でヒスタミンが出て血管の透過性が上がり、爪郭部が浮腫んで濁ることが原因。血管が組織に隠れ、先端だけが見える。",
    symptoms: "目や皮膚のかゆみ、鼻の症状など、アレルギー症状と重なりやすい。",
    mibyo: "アレルギー反応の出やすさが爪郭部の見え方に現れ始めた段階で、季節や環境の変化と合わせて経過を見る目安になる。",
    clinical: false,
  },
  {
    code: "liver_decline",
    name: "肝臓機能の低下",
    feature: "ループが短く、低い弧を描く。",
    why: "肝臓は血漿タンパクを作り血液の性状を保つ場所で、その働きが落ちると末梢の血の勢いが弱まることが原因。ループが伸びきらず、短く低くなる。",
    symptoms: "疲れやすさ、体のだるさ、食欲の低下と重なりやすい。",
    mibyo: "肝臓への負担の蓄積が末梢の血の勢いに現れ始めた段階で、飲酒や食事の見直しで経過を比べる目安になる。",
    clinical: false,
  },
  {
    code: "sugar_excess",
    name: "糖分の摂り過ぎ",
    feature: "広がった血管が多く見られる。",
    why: "高血糖で血が粘り、糖化で基底膜が厚くなって内腔が狭まることが原因。流れを保とうと手前の血管が圧で広がる。",
    symptoms: "食後の眠気、のどの渇き、疲れやすさと重なりやすい。",
    mibyo: "糖の代謝への負担が血管に現れ始めた段階で、食事の内容と順序の見直しで経過を比べやすい範囲。",
    clinical: false,
  },
  {
    code: "lipid_excess",
    name: "脂質の摂り過ぎ",
    feature: "血管が横に広がり、開いた状態。",
    why: "脂質の多い血は粘りが強く、壁にも脂質がついて内腔が狭まることが原因。行き場のない血で血管が横に広がり、開いて見える。",
    symptoms: "自覚症状は乏しいことが多く、健診での中性脂肪・コレステロールの高さと重なりやすい。",
    mibyo: "脂質の代謝への負担が血管の広がりに現れ始めた段階で、食事の立て直しで経過を比べる目安になる。",
    clinical: false,
  },
  {
    code: "cardiac_decline",
    name: "心臓機能の低下",
    feature: "横に走る毛細血管が見られる状態。",
    why: "心臓が血を戻す力が弱いと静脈側に血が滞ることが原因。末梢の圧が上がり、迂回路となる横の血管が拡張して目立つようになる。",
    symptoms: "動悸、息切れ、疲れやすさと重なりやすい。",
    mibyo: "血を送り戻す力の弱さが末梢に現れ始めた段階として記録し、経過の変化を比べていく目安になる。",
    clinical: false,
  },
  {
    code: "hormone_imbalance",
    name: "ホルモンバランスの崩れ",
    feature: "血管から赤血球がにじみ出て見える。",
    why: "ホルモンは血管壁の透過性や収縮を調整しており、そのバランスが崩れて壁のすき間が開くことが原因。赤血球がすり抜けて、にじんで見える。",
    symptoms: "むくみ、冷えやのぼせ、気分の変動と重なりやすい。",
    mibyo: "ホルモンの調整の乱れが血管壁に現れ始めた段階で、睡眠と生活リズムの立て直しで経過を見る目安になる。",
    clinical: false,
  },
  {
    code: "tissue_proliferation",
    name: "組織の異常増殖",
    feature: "枝分かれして増えた、木の枝状の形。",
    why: "炎症や増殖した組織は酸素を大量に必要とし、血管を増やす信号（VEGF）を出すことが原因。既存の血管から芽が出て枝分かれする。",
    symptoms: "指先のこわばり、皮膚のつっぱり感と重なりやすい。",
    mibyo: "この形は未病として経過を見る段階を超えた所見のため、医療機関で確認を受ける段階です。",
    clinical: true, // 臨床フラグ「分枝」に対応する形。
  },
  {
    code: "deformity",
    name: "変形の様々な種類",
    feature: "ループがねじれ、形が崩れた状態。",
    why: "老化や酸化ストレスで壁の弾性線維が傷むことが原因。均一に伸び縮みできなくなり、血圧に押されて弱い部分からねじれる。",
    symptoms: "疲れやすさ、睡眠不足など、生活の乱れが続く時期と重なりやすい。",
    mibyo: "血管壁の弾力の衰えが形に現れ始めた段階で、生活リズムの立て直しで経過を比べる目安になる。",
    clinical: false,
  },
  {
    code: "giant",
    name: "巨大毛細血管",
    feature: "ループ全体が異常に太い形（直径50μm以上）。全身性強皮症の早期サイン。",
    why: "免疫の異常で内皮が傷み、壁が薄く弱くなることが原因。内側からの血圧に耐えられず、風船のように膨らんで巨大なループになる。",
    symptoms: "指先の冷えや色の変化、皮膚のこわばりと重なりやすい。",
    mibyo: "この形は未病として経過を見る段階を超えた所見のため、医療機関で確認を受ける段階です。",
    clinical: true,
  },
  {
    code: "hemorrhage",
    name: "微小出血",
    feature: "ループの周囲に茶色い点状の出血。強皮症パターンの初期から活動期に見られる。",
    why: "傷んで弱くなった壁に小さな裂け目ができ、赤血球が外へ漏れることが原因。漏れた赤血球が分解され、色素が茶色い点で残る。",
    symptoms: "寒さで指先が白く変わるような色の変化と重なりやすい。",
    mibyo: "この形は未病として経過を見る段階を超えた所見のため、医療機関で確認を受ける段階です。",
    clinical: true,
  },
  {
    code: "capillary_loss",
    name: "脱落・ゴースト血管",
    feature: "ループが消えて本数が減り、空白ができる。強皮症の進行期の所見でもある。",
    why: "内皮の傷みが進み、血が通わなくなったループが、使われない血管として退縮していくことが原因。空白の範囲が広がる。",
    symptoms: "指先の冷え、しびれ、皮膚のこわばりと重なりやすい。",
    mibyo: "この形は未病として経過を見る段階を超えた所見のため、医療機関で確認を受ける段階です。",
    clinical: true,
  },
  {
    code: "tortuous",
    name: "蛇行",
    feature: "ループが大きくうねる形。糖尿病や高血圧で報告されるが、健康な人にも出る非特異的変化。",
    why: "高い血圧が続くと血管は長さ方向に伸びていくことが原因。皮膚の中で収まりきらず、余った長さがうねりになる。",
    symptoms: "肩こり、頭の重さと重なりやすい。",
    mibyo: "血圧の負担が血管の長さに現れ始めた段階で、生活の立て直しと合わせて経過を比べる目安になる。",
    clinical: false,
  },
  {
    code: "congestion",
    name: "うっ血・血流停滞",
    feature: "ループが太く暗く、密集する。",
    why: "静脈側の戻りが悪いと、毛細血管に血がたまり込んで押し広げられることが原因。たまった血は酸素が少なく、暗く太く見える。",
    symptoms: "冷え、むくみ、肩こりと重なりやすい。",
    mibyo: "血の戻りの弱さが、たまりとして末梢に現れ始めた段階で、体を温め動かす生活で経過を比べやすい範囲。",
    clinical: false,
  },
  {
    code: "renal_decline",
    name: "腎機能の低下",
    feature: "ループが細くまばらで、色も薄い。",
    why: "腎臓は赤血球作りを指示するホルモンを出しており、その働きが落ちると貧血で色が薄くなることが原因。尿毒素や高血圧で内皮も傷み、密度が下がる。",
    symptoms: "むくみ、疲れやすさ、息切れと重なりやすい。",
    mibyo: "腎臓の働きの弱さが末梢の密度と色に現れ始めた段階として記録し、経過の変化を比べていく目安になる。",
    clinical: false,
  },
  {
    code: "autoimmune_lupus",
    name: "自己免疫の異常（ループス型）",
    feature: "ループが長く伸び、強く蛇行する。全身性エリテマトーデスなど膠原病で見られる形。",
    why: "免疫が自分の血管を攻撃して内皮が傷むことが原因。炎症が続くと血管が伸びて蛇行し、出血や脱落が混ざることもある。",
    symptoms: "関節のこわばり、発疹、疲れやすさと重なりやすい。",
    mibyo: "免疫のバランスの乱れが末梢の血管に現れ始めた段階として記録し、経過を丁寧に比べていく目安になる。",
    clinical: false,
  },
  {
    code: "inflammation",
    name: "炎症が強いとき",
    feature: "ループが広がり、周囲がにじんで見える。体の中で炎症が起きているときの反応。",
    why: "体の中で炎症が起きると、免疫細胞を集めるために血管が広がり、透過性が上がって血漿が漏れることが原因。周囲がにじんで見える。",
    symptoms: "発熱、痛み、腫れなど、炎症が起きている部位の症状と重なりやすい。",
    mibyo: "炎症への反応が末梢の血管に現れている段階で、炎症が落ち着くにつれて形も戻っていく経過を比べる目安になる。",
    clinical: false,
  },
  {
    code: "anemia",
    name: "貧血・血の薄さ",
    feature: "ループが淡く細く見える。流れる血液そのものの色が薄い状態。",
    why: "赤血球が減ると、毛細血管の中を流れる血の色が薄くなることが原因。腎機能の低下や鉄不足が背景にあることが多い。",
    symptoms: "顔色の悪さ、めまい、動悸や息切れ、疲れやすさと重なりやすい。",
    mibyo: "血の量と質の弱さが色に現れ始めた段階で、食事の立て直しで経過を比べる目安になる。",
    clinical: false,
  },
  {
    code: "crossing",
    name: "交差型",
    feature: "隣り合うループ同士が途中で交わり、X字にクロスして見える形。爪郭カピラロスコピーで数えられる基本の形のひとつ。",
    why: "ループが長さ方向に伸びると、限られた皮膚の幅の中で隣のループと重なり合うことが原因。伸びた血管同士が交わる位置で支え合い、交差として見える。",
    symptoms: "特定の訴えとは結びつきにくく、血管の伸びが進む時期に見られやすい。",
    mibyo: "血管が長さ方向に伸び始めた変化が形に現れた段階として記録し、並びの変化を比べる目安になる。",
    clinical: false,
  },
  {
    code: "dilated_loop",
    name: "拡張型",
    feature: "ループ全体が均一に太くなった形。一部だけが膨らむ巨大毛細血管とは違い、ループの幅がそろって広い。",
    why: "血管の緊張がゆるむと、内側からの圧でループ全体が押し広げられることが原因。壁そのものは保たれているため、膨らみ方が均一になる。",
    symptoms: "むくみ、手足のほてりと重なりやすい。",
    mibyo: "血管の緊張のゆるみが太さに現れ始めた段階で、生活の立て直しで経過を比べやすい範囲。",
    clinical: false,
  },
  {
    code: "corkscrew",
    name: "コルクスクリュー型",
    feature: "ループが細かくらせん状にねじれた形。コルク抜きのように、短い間隔で巻きながら伸びる。",
    why: "血管が長さ方向に伸びる一方で、周囲の組織にまっすぐ進む余地が少ないことが原因。行き場のない長さが小さならせんとして巻き、ねじれになる。",
    symptoms: "血圧の高さが続く時期と重なりやすい。",
    mibyo: "血管の伸びとねじれが形に現れ始めた段階として記録し、経過の変化を比べる目安になる。",
    clinical: false,
  },
  {
    code: "glomerular",
    name: "糸球体様",
    feature: "短い茎の先に、血管がぐるぐると巻いた塊が乗った形。糸玉のように見える。",
    why: "先端の小さな範囲で血管が何度も折れ曲がりながら伸びることが原因。巻き込まれた部分同士が重なり合い、塊状の渦として見える。",
    symptoms: "特定の訴えとは結びつきにくく、局所の変化として見られやすい。",
    mibyo: "先端の血管の伸び方が形に現れた段階として記録し、範囲の広がりを比べる目安になる。",
    clinical: false,
  },
  {
    code: "comma",
    name: "コンマ型",
    feature: "短いループが「、」のように軽く曲がったフック状の形。高さが低く、そろって並ぶことが多い。",
    why: "末梢まで届く血の勢いが穏やかで、ループが伸びきる前に向きを変えて戻ることが原因。短く曲がった形になる。",
    symptoms: "手足の冷え、むくみ、疲れやすさと重なりやすい。",
    mibyo: "末梢循環の弱さが形に現れ始めた段階で、生活の立て直しで戻りやすい範囲として経過を見る。",
    clinical: false,
  },
  {
    code: "branching_neo",
    name: "分岐・新生血管型",
    feature: "1本のループの途中から枝が出て、樹の枝のように分かれる形。枝分かれが増えると目立つ。",
    why: "血が届きにくい場所ができると、周囲の組織が血管を増やす信号を出すことが原因。既存のループから新しい枝が芽のように伸び、分岐になる。",
    symptoms: "指先の冷え、こわばりと重なりやすい。",
    mibyo: "この形は未病として経過を見る段階を超えた所見のため、医療機関で確認を受ける段階です。",
    clinical: true, // 臨床フラグ「分枝」に対応する形。
  },
  {
    code: "disarray",
    name: "配列の乱れ型",
    feature: "ループの高さ・向き・間隔がばらばらで、並びの規則性が失われた形。視野全体の整い具合で見比べる。",
    why: "血管の伸び方や傷み方が場所ごとに違うと、ループの育ち方がそろわなくなることが原因。その差が向きや間隔の乱れとして現れる。",
    symptoms: "特定の訴えとは結びつきにくく、視野全体の変化として見られやすい。",
    mibyo: "場所ごとの血管の変化の差が並びに現れ始めた段階として記録し、整い具合の変化を比べる目安になる。",
    clinical: false,
  },
  {
    code: "elongated",
    name: "伸長型",
    feature: "ループが通常より縦に長く伸びた形。太さは目立たず、長さ（高さ）がそろって目立つ。",
    why: "血管が長さ方向に伸びる状態が続くことが原因。壁の太さは保たれたまま、長さだけが増えた形になる。",
    symptoms: "特定の訴えとは結びつきにくいことが多い。",
    mibyo: "血管の伸びが長さに現れ始めた段階として記録し、高さの変化を比べる目安になる。",
    clinical: false,
  },
];

export const capillaryPatternCodes: string[] = capillaryPatterns.map(pattern => pattern.code);

export const capillaryPatternByCode: Record<string, CapillaryPattern> =
  Object.fromEntries(capillaryPatterns.map(pattern => [pattern.code, pattern]));

export function isCapillaryPatternCode(value: unknown): value is string {
  return typeof value === "string" && value in capillaryPatternByCode;
}

/** 撮影する指。標準は利き手と逆の薬指（撮影と記録の型 1節）。値は Firestore の finger に保存する。 */
export const capillaryFingers = [
  { code: "left_thumb", label: "左手・親指" },
  { code: "left_index", label: "左手・人差し指" },
  { code: "left_middle", label: "左手・中指" },
  { code: "left_ring", label: "左手・薬指" },
  { code: "left_little", label: "左手・小指" },
  { code: "right_thumb", label: "右手・親指" },
  { code: "right_index", label: "右手・人差し指" },
  { code: "right_middle", label: "右手・中指" },
  { code: "right_ring", label: "右手・薬指" },
  { code: "right_little", label: "右手・小指" },
] as const;
export const capillaryFingerCodes: string[] = capillaryFingers.map(finger => finger.code);
export const capillaryFingerLabels: Record<string, string> =
  Object.fromEntries(capillaryFingers.map(finger => [finger.code, finger.label]));

export const capillaryFlowImpressions = [
  { code: "good", label: "良好" },
  { code: "slow", label: "やや遅い" },
  { code: "stagnant", label: "停滞" },
] as const;
export const capillaryFlowCodes: string[] = capillaryFlowImpressions.map(item => item.code);
export const capillaryFlowLabels: Record<string, string> =
  Object.fromEntries(capillaryFlowImpressions.map(item => [item.code, item.label]));

export const capillaryColorImpressions = [
  { code: "bright_red", label: "鮮赤" },
  { code: "dark_red", label: "暗赤" },
  { code: "pale", label: "淡い" },
] as const;
export const capillaryColorCodes: string[] = capillaryColorImpressions.map(item => item.code);
export const capillaryColorLabels: Record<string, string> =
  Object.fromEntries(capillaryColorImpressions.map(item => [item.code, item.label]));

export const capillaryChangeOptions = [
  { code: "improved", label: "改善" },
  { code: "same", label: "不変" },
  { code: "worse", label: "悪化" },
] as const;
export const capillaryChangeCodes: string[] = capillaryChangeOptions.map(item => item.code);
export const capillaryChangeLabels: Record<string, string> =
  Object.fromEntries(capillaryChangeOptions.map(item => [item.code, item.label]));

/** 臨床フラグ4項目（撮影と記録の型 3節）。clinicalFlags のキーと対応する。 */
export const capillaryClinicalFlagLabels: Record<string, string> = {
  giant: "巨大毛細血管あり",
  hemorrhage: "微小出血あり",
  loss: "脱落・無血管野あり",
  ramified: "分枝あり",
};
export const capillaryClinicalFlagKeys = ["giant", "hemorrhage", "loss", "ramified"] as const;
