/* 地層ごとの収集物の出現確率を出す。
 *
 *   node tools/drop-rates.js                       代表的な3パターン（放置／手動満タン／手動満タン＋ビットLv10）
 *   node tools/drop-rates.js --quality 1 --bit 5   条件を指定
 *
 * quality はゲージの到達率（0〜1）、bit は特殊ビットのレベル。式は game.js の pickItem と同じ。 */

const loadData = require('./load-data');
const { RARITY, STRATA } = loadData();

function rates(stratum, quality, bitLv) {
  const bonus = quality * 0.35 + bitLv * 0.06;
  const boost = { common: 1, rare: 1 + bonus * 2, epic: 1 + bonus * 3.5, legendary: 1 + bonus * 5 };
  const ws = stratum.items.map((it) => RARITY[it.rarity].weight * boost[it.rarity]);
  const total = ws.reduce((a, b) => a + b, 0);
  return stratum.items.map((it, i) => ({ it, p: ws[i] / total }));
}

function print(title, quality, bitLv) {
  console.log(`\n### ${title}（ゲージ ${quality.toFixed(2)}・ビットLv${bitLv}）\n`);
  console.log('| 地層 | 並 | レア | 希少 | 伝説 | 一番出にくいもの |');
  console.log('|---|---:|---:|---:|---:|---|');
  for (const s of STRATA) {
    const rs = rates(s, quality, bitLv);
    const by = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (const r of rs) by[r.it.rarity] += r.p;
    const rarest = rs.reduce((a, b) => (b.p < a.p ? b : a));
    const pct = (v) => (v ? (v * 100).toFixed(1) + '%' : '—');
    const expect = Math.round(1 / rarest.p);
    console.log(`| ${s.name} | ${pct(by.common)} | ${pct(by.rare)} | ${pct(by.epic)} | ${pct(by.legendary)} | ${rarest.it.name} ${(rarest.p * 100).toFixed(2)}%（約${expect}回に1回） |`);
  }
}

const argv = process.argv.slice(2);
const qi = argv.indexOf('--quality');
const bi = argv.indexOf('--bit');

if (qi >= 0 || bi >= 0) {
  const q = qi >= 0 ? Number(argv[qi + 1]) : 1;
  const b = bi >= 0 ? Number(argv[bi + 1]) : 0;
  print('指定条件', q, b);
} else {
  print('完全放置', 0.045 * 4.5, 0);
  print('手動で満タン', 1, 0);
  print('手動で満タン＋ビット強化', 1, 10);
}
