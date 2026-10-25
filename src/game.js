/* Deskavation - コアループ
 * 画面右下に常駐して自動で掘り進み、鉱脈に当たった数秒だけプレイヤーが関与する。 */

(() => {
  'use strict';

  const SAVE_KEY = 'deskavation.save.v1';
  const STRIP_H = 190;   // 地中を描くカードの高さ(px)。style.css の --strip-h と揃える
  const PPM = 3;         // 1mあたりのピクセル数
  const DRILL_Y = 66;    // カードの中でのドリル先端の位置
  const HIT_DUR = 4.5;   // 連打チャンスの秒数
  const AUTO_CAP = 0.7;  // 自動ゲージはここで頭打ち。満タンは必ず手動でしか届かない
  const FAIL_LINE = 0.15;
  const RESULT_DUR = 2.0;

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');

  let W = 0;
  const H = STRIP_H;
  let particles = [];
  let flash = 0;
  let shake = 0;
  let lastHudPaint = 0;

  const state = {
    depth: 0,
    money: 0,
    upgrades: { speed: 0, click: 0, bit: 0, sonar: 0, battery: 0 },
    collection: {},        // id -> { count, firstDepth }
    veinTimer: 20,         // 次の鉱脈までの残り秒数（初回だけ短い）
    caught: 0,
    missed: 0,
    paused: false,
    lastSave: Date.now(),
  };

  let mode = 'dig';        // dig | hit | result
  let hit = { t: 0, gauge: 0 };
  let result = null;       // { item, money, quality, t, miss }

  /* ---------- 派生値 ---------- */
  const lv = (id) => state.upgrades[id] || 0;
  const digSpeed = () => 1 + lv('speed') * 0.6;
  const clickPower = () => 0.11 + lv('click') * 0.025;
  const rareBonus = () => lv('bit') * 0.06;
  // 鉱脈の間隔は「距離」ではなく「時間」で決める。
  // 距離にすると掘削速度を上げるほど中断が増えてしまい、常駐ツールとして邪魔になる。
  const veinInterval = () => Math.max(45, 150 - lv('sonar') * 5);
  // 放置でも最低限は回収できるよう、ゲージは自動でも溜まる（減衰はさせない）
  const assist = () => 0.045 + lv('battery') * 0.015;
  const offlineCapH = () => 2 + lv('battery');

  /* ---------- ユーティリティ ---------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function formatNum(n) {
    n = Math.floor(n);
    if (n >= 1e8) return (n / 1e8).toFixed(2) + '億';
    if (n >= 1e4) return (n / 1e4).toFixed(1) + '万';
    return n.toLocaleString('ja-JP');
  }

  function hash(x, y) {
    let h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  }

  function mix(c1, c2, t) {
    const p = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    const a = p(c1);
    const b = p(c2);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  /* ---------- セーブ / ロード ---------- */
  function save() {
    state.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* 保存できなくても続行 */ }
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      Object.assign(state, s);
      state.upgrades = Object.assign({ speed: 0, click: 0, bit: 0, sonar: 0, battery: 0 }, s.upgrades);
      state.collection = s.collection || {};
      state.paused = false;
      return s.lastSave || null;
    } catch (e) { return null; }
  }

  /* 放置していた時間を精算する。鉱脈は平均的な出来で自動処理。 */
  function settleOffline(lastSave) {
    if (!lastSave) return null;
    const elapsed = Math.min((Date.now() - lastSave) / 1000, offlineCapH() * 3600);
    if (elapsed < 60) return null;

    const gained = digSpeed() * elapsed;
    const veins = Math.floor(elapsed / veinInterval());
    const q = Math.min(AUTO_CAP, assist() * HIT_DUR);   // 放置中は自動ゲージ分だけ
    let money = 0;
    for (let i = 0; i < veins; i++) {
      const d = state.depth + (gained * (i + 1)) / veins;
      const item = pickItem(stratumAt(d), q);
      money += itemValue(item, d, q);
      record(item, d);
    }
    state.depth += gained;
    state.money += money;
    state.caught += veins;
    state.veinTimer = veinInterval();
    return { minutes: Math.floor(elapsed / 60), depth: Math.floor(gained), veins, money: Math.floor(money) };
  }

  /* ---------- 収集物の抽選 ---------- */
  function pickItem(stratum, quality) {
    const bonus = quality * 0.35 + rareBonus();
    const boost = { common: 1, rare: 1 + bonus * 2, epic: 1 + bonus * 3.5, legendary: 1 + bonus * 5 };
    let total = 0;
    const weights = stratum.items.map((it) => {
      const w = RARITY[it.rarity].weight * boost[it.rarity];
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return stratum.items[i];
    }
    return stratum.items[0];
  }

  function itemValue(item, depth, quality) {
    return RARITY[item.rarity].value * depthMult(depth) * (0.25 + quality * 1.5);
  }

  function record(item, depth) {
    const c = state.collection[item.id];
    if (c) c.count += 1;
    else state.collection[item.id] = { count: 1, firstDepth: Math.floor(depth) };
  }

  /* ---------- 進行 ---------- */
  function update(dt) {
    flash = Math.max(0, flash - dt * 3);
    shake = Math.max(0, shake - dt * 8);
    updateParticles(dt);

    if (state.paused) return;

    if (mode === 'dig') {
      state.depth += digSpeed() * dt;
      state.veinTimer -= dt;
      if (Math.random() < dt * 12) spawnDust();
      if (state.veinTimer <= 0) {
        state.veinTimer = 0;
        mode = 'hit';
        hit = { t: 0, gauge: 0 };
        flash = 1;
      }
    } else if (mode === 'hit') {
      hit.t += dt;
      if (hit.gauge < AUTO_CAP) hit.gauge = Math.min(AUTO_CAP, hit.gauge + assist() * dt);
      if (hit.t >= HIT_DUR) resolveHit();
    } else if (mode === 'result') {
      result.t += dt;
      if (result.t >= RESULT_DUR) {
        mode = 'dig';
        result = null;
        state.veinTimer = veinInterval() * (0.75 + Math.random() * 0.5);
      }
    }
  }

  function resolveHit() {
    const quality = clamp(hit.gauge, 0, 1);
    if (quality < FAIL_LINE) {
      state.missed += 1;
      result = { miss: true, t: 0 };
    } else {
      const item = pickItem(stratumAt(state.depth), quality);
      const money = Math.floor(itemValue(item, state.depth, quality));
      const isNew = !state.collection[item.id];
      record(item, state.depth);
      state.money += money;
      state.caught += 1;
      result = { item: item, money: money, quality: quality, isNew: isNew, t: 0 };
      if (RARITY[item.rarity].value >= 260) flash = 1;
    }
    mode = 'result';
    save();
    refreshPanels();
  }

  function onDig() {
    if (mode !== 'hit' || state.paused) return;
    hit.gauge = clamp(hit.gauge + clickPower(), 0, 1);
    shake = 1;
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: W * 0.5, y: DRILL_Y + 10,
        vx: (Math.random() - 0.5) * 220, vy: -Math.random() * 180 - 40,
        life: 0.5 + Math.random() * 0.3, color: '#ffd166', size: 2 + Math.random() * 2,
      });
    }
  }

  /* ---------- パーティクル ---------- */
  function spawnDust() {
    particles.push({
      x: W * 0.5 + (Math.random() - 0.5) * 24, y: DRILL_Y + 12,
      vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 40 - 10,
      life: 0.6, color: 'rgba(255,255,255,0.35)', size: 1.5,
    });
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  /* ---------- 描画 ---------- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    W = canvas.getBoundingClientRect().width;   // 幅は CSS の --card-w が決める
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function depthAtRow(y) { return state.depth + (y - DRILL_Y) / PPM; }

  function render() {
    ctx.clearRect(0, 0, W, H);
    const sx = shake > 0 ? (Math.random() - 0.5) * shake * 3 : 0;
    ctx.save();
    ctx.translate(sx, 0);

    drawGround();
    drawVein();
    drawTunnel();
    drawDrill();
    drawParticles();
    drawTopEdge();

    ctx.restore();

    if (flash > 0) {
      ctx.fillStyle = 'rgba(255,220,140,' + (flash * 0.25) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    if (mode === 'hit') drawHitUI();
    if (mode === 'result') drawResult();
  }

  function drawGround() {
    for (let y = 0; y < H; y++) {
      const d = depthAtRow(y);
      if (d < 0) {
        ctx.fillStyle = 'rgba(120,180,220,0.18)';
        ctx.fillRect(0, y, W, 1);
        continue;
      }
      const st = stratumAt(d);
      const next = STRATA[STRATA.indexOf(st) + 1];
      const span = (next ? next.from : st.from + 8000) - st.from;
      const t = clamp((d - st.from) / span, 0, 1);
      let col = mix(st.top, st.bottom, t);
      // 8mごとの縞で下方向のスクロールを体感させる
      if (Math.floor(d / 8) % 2 === 0) col = mix(col, '#000000', 0.06);
      ctx.fillStyle = col;
      ctx.fillRect(0, y, W, 1);
    }

    // 岩や小石のまだら模様（ワールド座標で決定論的に生成）
    const cell = 22;
    const startCell = Math.floor((depthAtRow(0) * PPM) / cell);
    const endCell = Math.ceil((depthAtRow(H) * PPM) / cell);
    for (let cy = startCell; cy <= endCell; cy++) {
      const d = (cy * cell) / PPM;
      if (d < 0) continue;
      const st = stratumAt(d);
      for (let cx = 0; cx < Math.ceil(W / cell); cx++) {
        const r = hash(cx, cy);
        if (r > 0.32) continue;
        const px = cx * cell + hash(cx + 7, cy) * cell;
        const py = DRILL_Y + (d - state.depth) * PPM + hash(cx, cy + 9) * cell;
        if (py < -6 || py > H + 6) continue;
        const size = 1.5 + r * 7;
        ctx.fillStyle = st.speck;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.ellipse(px, py, size, size * 0.72, r * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // 地表の草
    const surfaceY = DRILL_Y - state.depth * PPM;
    if (surfaceY > -4 && surfaceY < H) {
      ctx.fillStyle = '#5a8f3c';
      ctx.fillRect(0, surfaceY - 4, W, 5);
    }

    // 地層の境界線とラベル
    for (const st of STRATA) {
      if (st.from === 0) continue;
      const y = DRILL_Y + (st.from - state.depth) * PPM;
      if (y < -20 || y > H + 20) continue;
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = 'bold 12px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('▼ ' + st.name + '  ' + st.from.toLocaleString() + 'm', 16, y + 16);
    }
  }

  function drawVein() {
    // 残り時間を距離に読み替えて、鉱脈が下から迫ってくるように見せる
    const y = DRILL_Y + state.veinTimer * digSpeed() * PPM;
    if (y < -40 || y > H + 40) return;
    const cx = W * 0.5;
    const pulse = 0.6 + Math.sin(performance.now() / 180) * 0.4;
    ctx.save();
    ctx.fillStyle = 'rgba(255,209,102,' + (0.18 * pulse) + ')';
    ctx.beginPath();
    ctx.ellipse(cx, y, 90, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rx = cx + Math.cos(a) * (26 + hash(i, 3) * 40);
      const ry = y + Math.sin(a) * 12;
      ctx.fillStyle = i % 3 === 0 ? '#ffd166' : '#e8a33d';
      ctx.beginPath();
      ctx.arc(rx, ry, 3 + hash(i, 11) * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTunnel() {
    const cx = W * 0.5;
    const top = Math.max(0, DRILL_Y - state.depth * PPM);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(cx - 15, top, 30, DRILL_Y - top);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(cx - 15, top, 4, DRILL_Y - top);
  }

  function drawDrill() {
    const cx = W * 0.5;
    const bob = mode === 'dig' && !state.paused ? Math.sin(performance.now() / 60) * 1.2 : 0;
    const y = DRILL_Y + bob;

    ctx.fillStyle = '#2f3542';
    ctx.fillRect(cx - 17, y - 42, 34, 34);
    ctx.fillStyle = '#ff7a45';
    ctx.fillRect(cx - 17, y - 42, 34, 6);
    ctx.fillStyle = '#8ad4ff';
    ctx.fillRect(cx - 10, y - 32, 20, 12);

    // 回転するビット
    const spin = state.paused ? 0 : (performance.now() / 1000) * (mode === 'hit' ? 14 : 6);
    ctx.save();
    ctx.translate(cx, y - 8);
    ctx.fillStyle = '#b8c2cc';
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(13, 0);
    ctx.lineTo(0, 22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const o = ((spin + i * 0.33) % 1) * 20;
      ctx.beginPath();
      ctx.moveTo(-13 + o * 0.6, o);
      ctx.lineTo(13 - o * 0.6, o);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* 帯の上端が「切り取られた四角」に見えないよう、断面の縁として陰をつける */
  function drawTopEdge() {
    const g = ctx.createLinearGradient(0, 0, 0, 12);
    g.addColorStop(0, 'rgba(0,0,0,0.28)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-20, 0, W + 40, 12);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-20, 0, W + 40, 1);
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawHitUI() {
    const cx = W * 0.5;
    const bw = 280;
    const bh = 16;
    const bx = cx - bw / 2;
    const by = 114;   // ドリルの下、HUDの上に収める

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 10, by - 24, bw + 20, bh + 40);

    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('鉱脈発見！ クリックで掘り出せ', cx, by - 10);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, by, bw, bh);
    const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    g.addColorStop(0, '#4fc3f7');
    g.addColorStop(1, '#7cf7a0');
    ctx.fillStyle = g;
    ctx.fillRect(bx, by, bw * hit.gauge, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(bx + bw * FAIL_LINE, by, 1, bh);  // ここを下回ると失敗
    ctx.fillRect(bx + bw * AUTO_CAP, by, 1, bh);   // 自動で溜まる上限

    const rest = 1 - hit.t / HIT_DUR;
    ctx.fillStyle = rest < 0.3 ? '#ff6b6b' : 'rgba(255,255,255,0.7)';
    ctx.fillRect(bx, by + bh + 4, bw * rest, 4);
  }

  function drawResult() {
    const cx = W * 0.5;
    const a = clamp((RESULT_DUR - result.t) * 2, 0, 1);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';

    if (result.miss) {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(cx - 110, 102, 220, 34);
      ctx.fillStyle = '#ff8787';
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.fillText('逃してしまった…', cx, 125);
    } else {
      const col = RARITY[result.item.rarity].color;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(cx - 150, 88, 300, 52);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - 150, 88, 300, 52);
      ctx.font = '26px "Segoe UI Emoji", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(result.item.icon, cx - 110, 124);
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.fillStyle = col;
      ctx.fillText(result.item.name + (result.isNew ? '  NEW!' : ''), cx + 20, 112);
      ctx.font = '13px "Segoe UI", sans-serif';
      ctx.fillStyle = '#ffd166';
      ctx.fillText('+' + formatNum(result.money) + ' G', cx + 20, 132);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- HUD ---------- */
  const el = {
    depth: document.getElementById('depth'),
    stratum: document.getElementById('stratum'),
    next: document.getElementById('next'),
    money: document.getElementById('money'),
    pause: document.getElementById('btn-pause'),
  };

  function paintHud() {
    el.depth.textContent = Math.floor(state.depth).toLocaleString('ja-JP');
    el.stratum.textContent = stratumAt(state.depth).name;
    const rest = Math.max(0, state.veinTimer * digSpeed());
    el.next.textContent = mode === 'dig' ? '次の鉱脈まで ' + Math.ceil(rest) + 'm'
      : mode === 'hit' ? '採掘中！' : '回収中…';
    el.money.textContent = formatNum(state.money);
    el.pause.textContent = state.paused ? '▶' : '⏸';
  }

  /* ---------- パネル ---------- */
  const panel = document.getElementById('panel');
  let openPanel = null;

  function togglePanel(name) {
    openPanel = openPanel === name ? null : name;
    panel.classList.toggle('open', !!openPanel);
    document.body.classList.toggle('panel-open', !!openPanel);
    refreshPanels();
  }

  function refreshPanels() {
    if (!openPanel) { panel.innerHTML = ''; return; }
    panel.innerHTML = openPanel === 'upgrade' ? upgradeHtml() : collectionHtml();
    panel.querySelectorAll('[data-buy]').forEach((b) => {
      b.addEventListener('click', () => buy(b.dataset.buy));
    });
    panel.querySelector('.panel-close').addEventListener('click', () => togglePanel(openPanel));
  }

  function upgradeHtml() {
    const rows = UPGRADES.map((u) => {
      const l = lv(u.id);
      const cost = u.cost(l);
      const maxed = l >= u.max;
      const afford = state.money >= cost;
      return '<div class="row">' +
        '<div class="row-icon">' + u.icon + '</div>' +
        '<div class="row-main">' +
          '<div class="row-name">' + u.name + ' <span class="lvtag">Lv.' + l + '</span></div>' +
          '<div class="row-desc">' + u.desc(l) + '</div>' +
        '</div>' +
        '<button class="buy' + (afford && !maxed ? '' : ' disabled') + '" data-buy="' + u.id + '"' +
          (maxed ? ' disabled' : '') + '>' + (maxed ? 'MAX' : formatNum(cost) + ' G') + '</button>' +
        '</div>';
    }).join('');
    return '<div class="panel-head"><h2>🔧 強化</h2><button class="panel-close">×</button></div>' +
      '<div class="panel-body">' + rows + '</div>';
  }

  function collectionHtml() {
    const total = Object.keys(ALL_ITEMS).length;
    const got = Object.keys(state.collection).length;
    const groups = STRATA.map((s) => {
      const cells = s.items.map((it) => {
        const c = state.collection[it.id];
        if (!c) return '<div class="cell locked"><div class="ic">？</div><div class="nm">？？？</div></div>';
        return '<div class="cell" style="border-color:' + RARITY[it.rarity].color + '">' +
          '<div class="ic">' + it.icon + '</div>' +
          '<div class="nm">' + it.name + '</div>' +
          '<div class="sub">×' + c.count + ' / ' + c.firstDepth + 'm</div>' +
          '</div>';
      }).join('');
      return '<div class="group"><div class="group-name">' + s.name +
        ' <span>' + s.from.toLocaleString() + 'm〜</span></div>' +
        '<div class="grid">' + cells + '</div></div>';
    }).join('');
    return '<div class="panel-head"><h2>📖 図鑑 <span class="rate">' + got + ' / ' + total + '</span></h2>' +
      '<button class="panel-close">×</button></div>' +
      '<div class="panel-body">' + groups + '</div>';
  }

  function buy(id) {
    const u = UPGRADES.find((x) => x.id === id);
    const l = lv(id);
    if (l >= u.max) return;
    const cost = u.cost(l);
    if (state.money < cost) return;
    state.money -= cost;
    state.upgrades[id] = l + 1;
    save();
    refreshPanels();
  }

  /* ---------- 起動 ---------- */
  function showWelcome(info) {
    const box = document.getElementById('welcome');
    box.innerHTML = 'おかえりなさい。' + info.minutes + '分の放置で <b>' +
      info.depth.toLocaleString() + 'm</b> 掘り進み、鉱脈 <b>' + info.veins +
      '</b> 件から <b>' + formatNum(info.money) + ' G</b> を回収しました。';
    box.classList.add('show');
    setTimeout(() => box.classList.remove('show'), 9000);
  }

  function bindEvents() {
    window.addEventListener('resize', resize);
    canvas.addEventListener('mousedown', onDig);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); onDig(); }
    });
    document.getElementById('btn-upgrade').addEventListener('click', () => togglePanel('upgrade'));
    document.getElementById('btn-book').addEventListener('click', () => togglePanel('book'));
    el.pause.addEventListener('click', () => { state.paused = !state.paused; });
    const quit = document.getElementById('btn-quit');
    quit.addEventListener('click', () => {
      save();
      if (window.desk) window.desk.quit();
    });
    window.addEventListener('beforeunload', save);
    setInterval(save, 5000);
  }

  function loop(prev) {
    const now = performance.now();
    const dt = Math.min((now - prev) / 1000, 0.1);
    update(dt);
    render();
    if (now - lastHudPaint > 100) { paintHud(); lastHudPaint = now; }
    requestAnimationFrame(() => loop(now));
  }

  function start() {
    const lastSave = load();
    const info = settleOffline(lastSave);
    if (!(state.veinTimer > 0)) state.veinTimer = veinInterval();
    resize();
    bindEvents();
    paintHud();
    if (info) showWelcome(info);
    requestAnimationFrame(() => loop(performance.now()));
  }

  if (window.desk) document.body.classList.add('electron');
  start();
})();
