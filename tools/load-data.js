/* src/data.js を Node から読み込む。
 * data.js はブラウザで <script> として読むグローバル定義なので、vm で評価して中身を取り出す。
 * こうしておけば、ツールの数値は常にゲーム本体と同じテーブルから計算される。 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

module.exports = function loadData() {
  const file = path.join(__dirname, '..', 'src', 'data.js');
  const src = fs.readFileSync(file, 'utf8') +
    '\n;__out = { RARITY, STRATA, UPGRADES, ALL_ITEMS, stratumAt, depthMult };';
  const ctx = { __out: null };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: file });
  return ctx.__out;
};
