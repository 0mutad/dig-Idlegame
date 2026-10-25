/* Deskavation - ゲームデータ定義
 * 地層・収集物・強化項目のテーブル。バランス調整はこのファイルだけ触れば済むようにしている。 */

const RARITY = {
  common:    { label: '並',   color: '#b9c2cc', weight: 100, value: 25 },
  rare:      { label: 'レア', color: '#4fc3f7', weight: 30,  value: 120 },
  epic:      { label: '希少', color: '#ba68c8', weight: 6,   value: 700 },
  legendary: { label: '伝説', color: '#ffb300', weight: 1,   value: 5000 },
};

/* from: この地層が始まる深度(m)。配列は浅い順。 */
const STRATA = [
  {
    name: '表土', from: 0,
    top: '#7a5330', bottom: '#5e3f24', speck: '#8d6440',
    items: [
      { id: 'pebble',   name: '石ころ',       icon: '🪨', rarity: 'common' },
      { id: 'can',      name: '空き缶',       icon: '🥫', rarity: 'common' },
      { id: 'root',     name: '太い根',       icon: '🌱', rarity: 'common' },
      { id: 'shard',    name: '土器のかけら', icon: '🏺', rarity: 'rare' },
      { id: 'coin',     name: '古銭',         icon: '🪙', rarity: 'rare' },
      { id: 'key',      name: '誰かの家の鍵', icon: '🔑', rarity: 'epic' },
    ],
  },
  {
    name: '粘土層', from: 300,
    top: '#6d5338', bottom: '#4f3b27', speck: '#86684a',
    items: [
      { id: 'clay',     name: '粘土塊',       icon: '🧱', rarity: 'common' },
      { id: 'worm',     name: 'ミミズの化石', icon: '🪱', rarity: 'common' },
      { id: 'quartz',   name: '水晶の芽',     icon: '💠', rarity: 'rare' },
      { id: 'haniwa',   name: '埴輪',         icon: '🗿', rarity: 'epic' },
      { id: 'jar',      name: '封印された壺', icon: '⚱️', rarity: 'legendary' },
    ],
  },
  {
    name: '石灰岩', from: 800,
    top: '#8a877a', bottom: '#6b685d', speck: '#a3a092',
    items: [
      { id: 'calcite',  name: '方解石',       icon: '🔷', rarity: 'common' },
      { id: 'stalac',   name: '鍾乳石',       icon: '🧊', rarity: 'common' },
      { id: 'ammonite', name: 'アンモナイト', icon: '🐚', rarity: 'rare' },
      { id: 'trilo',    name: '三葉虫',       icon: '🦐', rarity: 'rare' },
      { id: 'coral',    name: '太古のサンゴ', icon: '🪸', rarity: 'epic' },
    ],
  },
  {
    name: '化石層', from: 2000,
    top: '#5d6a58', bottom: '#404b3d', speck: '#76856f',
    items: [
      { id: 'tooth',    name: '歯の化石',     icon: '🦷', rarity: 'common' },
      { id: 'bone',     name: '恐竜の骨',     icon: '🦴', rarity: 'rare' },
      { id: 'amber',    name: '虫入り琥珀',   icon: '🟡', rarity: 'rare' },
      { id: 'feather',  name: '始祖鳥の羽',   icon: '🪶', rarity: 'epic' },
      { id: 'skeleton', name: '完全骨格',     icon: '🦖', rarity: 'legendary' },
    ],
  },
  {
    name: '玄武岩', from: 4500,
    top: '#4b4654', bottom: '#332f3c', speck: '#625c6e',
    items: [
      { id: 'obsidian', name: '黒曜石',       icon: '⬛', rarity: 'common' },
      { id: 'pyrite',   name: '黄鉄鉱',       icon: '🟨', rarity: 'common' },
      { id: 'gold',     name: '金塊',         icon: '🥇', rarity: 'rare' },
      { id: 'garnet',   name: 'ガーネット',   icon: '🔴', rarity: 'rare' },
      { id: 'diamond',  name: 'ダイヤモンド', icon: '💎', rarity: 'epic' },
    ],
  },
  {
    name: '深成岩', from: 9000,
    top: '#3b3752', bottom: '#272340', speck: '#514b74',
    items: [
      { id: 'platinum', name: '白金',         icon: '⚪', rarity: 'common' },
      { id: 'water',    name: '地下湖の水',   icon: '💧', rarity: 'common' },
      { id: 'emerald',  name: 'エメラルド',   icon: '💚', rarity: 'rare' },
      { id: 'alloy',    name: '未知の金属',   icon: '🔩', rarity: 'epic' },
      { id: 'ruin',     name: '遺跡の欠片',   icon: '🏛️', rarity: 'legendary' },
    ],
  },
  {
    name: '未知領域', from: 15000,
    top: '#2b2144', bottom: '#17122b', speck: '#463a6b',
    items: [
      { id: 'glowore',  name: '光る鉱石',     icon: '✨', rarity: 'common' },
      { id: 'meteor',   name: '隕石片',       icon: '☄️', rarity: 'rare' },
      { id: 'eye',      name: '生きている石', icon: '👁️', rarity: 'epic' },
      { id: 'magma',    name: 'マントルの雫', icon: '🔥', rarity: 'epic' },
      { id: 'usb',      name: '誰かのUSB',    icon: '💾', rarity: 'legendary' },
    ],
  },
];

/* 強化項目。cost(lv) で次のレベルの価格、desc(lv) で現在の効果を返す。 */
const UPGRADES = [
  {
    id: 'speed', name: 'ドリル出力', icon: '⚙️', max: 40,
    cost: (lv) => Math.floor(40 * Math.pow(1.65, lv)),
    desc: (lv) => `掘削速度 ${(1 + lv * 0.6).toFixed(1)} m/s`,
  },
  {
    id: 'click', name: 'ハンマー', icon: '🔨', max: 30,
    cost: (lv) => Math.floor(70 * Math.pow(1.6, lv)),
    desc: (lv) => `クリック1回 +${Math.round((0.11 + lv * 0.025) * 100)}%`,
  },
  {
    id: 'bit', name: '特殊ビット', icon: '🔩', max: 25,
    cost: (lv) => Math.floor(120 * Math.pow(1.75, lv)),
    desc: (lv) => `レア度上昇 +${Math.round(lv * 6)}%`,
  },
  {
    id: 'sonar', name: 'ソナー', icon: '📡', max: 20,
    cost: (lv) => Math.floor(150 * Math.pow(1.7, lv)),
    desc: (lv) => `鉱脈の間隔 ${Math.max(45, 150 - lv * 5)} 秒`,
  },
  {
    id: 'battery', name: 'バッテリー', icon: '🔋', max: 20,
    cost: (lv) => Math.floor(200 * Math.pow(1.7, lv)),
    desc: (lv) => `自動ゲージ ${Math.round((0.045 + lv * 0.015) * 100)}%/秒・放置上限 ${2 + lv}時間`,
  },
];

const ALL_ITEMS = {};
STRATA.forEach((s) => s.items.forEach((it) => { ALL_ITEMS[it.id] = Object.assign({ stratum: s.name }, it); }));

function stratumAt(depth) {
  let found = STRATA[0];
  for (const s of STRATA) if (depth >= s.from) found = s;
  return found;
}

/* 収集物の価値は深度に対して指数的に伸びる（地層を1つ下るごとに2倍）。
 * 強化コストの指数成長と釣り合わせるため、線形な倍率ではなく累乗を使う。
 * 底を2.5以上にすると1時間で強化が打ち止めになることをシミュレータで確認済み。
 * 最終層では t が1を超えて伸び続けるので、頭打ちにならない。 */
function depthMult(depth) {
  const st = stratumAt(depth);
  const i = STRATA.indexOf(st);
  const next = STRATA[i + 1];
  const span = (next ? next.from : st.from + 8000) - st.from;
  return Math.pow(2, i + (depth - st.from) / span);
}
