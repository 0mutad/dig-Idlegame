/* バランス検証シミュレータ
 * game.js と同じ式で「強化を買いながら一定時間プレイしたら、どう推移するか」を出す。
 *
 *   node tools/balance-sim.js                 アクティブ／放置をそれぞれ120分
 *   node tools/balance-sim.js --minutes 60    時間を変える
 *   node tools/balance-sim.js --base 2.5      収集物の価値の伸び（depthMult の底）を差し替えて比較
 *
 * game.js との違い（意図的な単純化）:
 *   - 0.5秒刻みで進める
 *   - 鉱脈の間隔のばらつき（±25%）は平均値で代用する
 *   - 収集物は抽選せず、期待値で加算する
 *   - 強化は「いま買える中で一番安いもの」から即座に買う
 *
 * 下の定数は game.js と揃えること。 */

const loadData = require('./load-data');
const { RARITY, STRATA, UPGRADES, depthMult, stratumAt } = loadData();

const HIT_DUR = 4.5;
const RESULT_DUR = 2.0;
const AUTO_CAP = 0.7;
const FIRST_VEIN = 20;
const DT = 0.5;

function parseArgs(argv) {
  const out = { minutes: 120, base: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--minutes') out.minutes = Number(argv[++i]);
    else if (argv[i] === '--base') out.base = Number(argv[++i]);
  }
  return out;
}

/* depthMult の底だけを差し替えた版。比較用。 */
function multWithBase(base) {
  return (depth) => {
    const st = stratumAt(depth);
    const i = STRATA.indexOf(st);
    const next = STRATA[i + 1];
    const span = (next ? next.from : st.from + 8000) - st.from;
    return Math.pow(base, i + (depth - st.from) / span);
  };
}

function expectedValue(stratum, quality, bitLv) {
  const bonus = quality * 0.35 + bitLv * 0.06;
  const boost = { common: 1, rare: 1 + bonus * 2, epic: 1 + bonus * 3.5, legendary: 1 + bonus * 5 };
  let total = 0;
  let ev = 0;
  for (const it of stratum.items) {
    const w = RARITY[it.rarity].weight * boost[it.rarity];
    total += w;
    ev += w * RARITY[it.rarity].value;
  }
  return ev / total;
}

function run({ active, minutes, mult }) {
  const up = { speed: 0, click: 0, bit: 0, sonar: 0, battery: 0 };
  let depth = 0;
  let money = 0;
  let timer = FIRST_VEIN;
  let pause = 0;
  let earned = 0;
  let lastEarned = 0;
  let veins = 0;
  let firstBuy = null;
  const reached = {};
  const veinsIn = {};   // 地層ごとの鉱脈数 = その地層の収集物を引けるチャンスの数
  const rows = [];

  for (let t = 0; t < minutes * 60; t += DT) {
    if (pause > 0) {
      pause -= DT;   // 連打〜結果表示の間は掘削が止まる
    } else {
      depth += (1 + up.speed * 0.6) * DT;
      timer -= DT;
      if (timer <= 0) {
        const auto = Math.min(AUTO_CAP, (0.045 + up.battery * 0.015) * HIT_DUR);
        const q = active ? 1 : auto;
        const st = stratumAt(depth);
        const gain = expectedValue(st, q, up.bit) * mult(depth) * (0.25 + q * 1.5);
        money += gain;
        earned += gain;
        veins += 1;
        veinsIn[st.name] = (veinsIn[st.name] || 0) + 1;
        pause = HIT_DUR + RESULT_DUR;
        timer = Math.max(45, 150 - up.sonar * 5);
      }
    }

    for (const s of STRATA) if (depth >= s.from && reached[s.name] === undefined) reached[s.name] = t;

    for (;;) {
      let best = null;
      for (const u of UPGRADES) {
        if (up[u.id] >= u.max) continue;
        const c = u.cost(up[u.id]);
        if (c <= money && (!best || c < best.c)) best = { u, c };
      }
      if (!best) break;
      money -= best.c;
      up[best.u.id] += 1;
      if (firstBuy === null) firstBuy = t;
    }

    const sec = t + DT;
    if (sec % 600 === 0) {
      rows.push({
        min: sec / 60,
        depth: Math.round(depth),
        stratum: stratumAt(depth).name,
        money: Math.round(money),
        perMin: Math.round((earned - lastEarned) / 10),
        veins,
        lv: [up.speed, up.click, up.bit, up.sonar, up.battery].join('/'),
      });
      lastEarned = earned;
    }
  }
  return { rows, reached, firstBuy, veinsIn };
}

function fmt(n) {
  if (n >= 1e8) return (n / 1e8).toFixed(2) + '億';
  if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
  return n.toLocaleString('ja-JP');
}

function mmss(t) {
  if (t === undefined) return '未到達';
  const m = Math.floor(t / 60);
  const s = Math.round(t % 60);
  return m + '分' + String(s).padStart(2, '0') + '秒';
}

function print(title, res) {
  console.log('\n### ' + title + '\n');
  console.log('| 経過 | 深度 | 地層 | 所持G | 分あたり収入 | 鉱脈数 | Lv（出力/槌/ビット/ソナー/電池） |');
  console.log('|---:|---:|---|---:|---:|---:|---|');
  for (const r of res.rows) {
    console.log(`| ${r.min}分 | ${r.depth.toLocaleString()}m | ${r.stratum} | ${fmt(r.money)} | ${fmt(r.perMin)} | ${r.veins} | ${r.lv} |`);
  }
  console.log('\n最初の強化: ' + mmss(res.firstBuy));
  console.log('\n| 地層 | 到達時間 | 地層内の鉱脈数 | 収集物の種類 |');
  console.log('|---|---:|---:|---:|');
  for (const s of STRATA) {
    console.log(`| ${s.name}（${s.from.toLocaleString()}m〜） | ${mmss(res.reached[s.name])} | ${res.veinsIn[s.name] || 0} | ${s.items.length} |`);
  }
}

const args = parseArgs(process.argv.slice(2));
const mult = args.base ? multWithBase(args.base) : depthMult;
const label = args.base ? `底=${args.base}（比較用）` : '現行値';

print(`アクティブ（毎回ゲージ満タン）／${label}／${args.minutes}分`, run({ active: true, minutes: args.minutes, mult }));
print(`完全放置（クリックなし）／${label}／${args.minutes}分`, run({ active: false, minutes: args.minutes, mult }));
