/* ============================================================================
   YANAI TRADING — ui.js
   All rendering and interaction. The UI reads from `state` + `bot.snapshot()`
   and writes back through the bot so the trading loop stays the source of truth.
   ========================================================================== */

import {
  STRATEGIES,
  STRATEGY_MAP,
  STRATEGY_IDS,
  PROFILES,
  normalizeSettings,
  newPortfolio,
  addLog,
  marketStatus,
} from './engine.js';
import { saveState, clearState, download, exportJSON, normalizeState } from './store.js';
import {
  money,
  signedMoney,
  signedPct,
  price,
  etTime,
  etDateTime,
  etStamp,
  relTime,
  minutesLabel,
  tone,
  sparkline,
  esc,
} from './format.js';

let state = null;
let bot = null;
let currentView = 'dashboard';

const VIEWS = ['dashboard', 'watchlist', 'strategies', 'history', 'settings'];
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

/* ================================================================ bootstrap */

export function initUI(ctx) {
  state = ctx.state;
  bot = ctx.bot;
  buildStrategies();
  buildSettings();
  wire();

  const hash = location.hash.replace('#', '');
  setView(VIEWS.includes(hash) ? hash : 'dashboard', false);
  render();

  setInterval(() => {
    const el = $('#clock');
    if (el) el.textContent = `${etTime()} ET`;
    renderStatus(marketStatus());
  }, 1000);
}

/* ==================================================================== wiring */

function wire() {
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn) setView(btn.dataset.view);
  });

  document.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump]');
    if (jump) {
      e.preventDefault();
      setView(jump.dataset.jump);
    }
  });

  $('#runBtn').addEventListener('click', () => {
    bot.toggle();
    const running = state.running;
    toast(
      running
        ? 'Bot armed. It will trade the next qualifying setup.'
        : 'Bot paused. Open positions keep their stops.',
      running ? 'success' : 'warn',
    );
    render();
  });

  $('#closeAllBtn').addEventListener('click', async () => {
    const count = Object.keys(state.portfolio.positions).length;
    if (!count) return;
    const ok = await confirmDialog({
      title: 'Close every position?',
      body: `This market-closes ${count} paper position${count === 1 ? '' : 's'} at the latest quote.`,
      confirmLabel: 'Close all',
      danger: true,
    });
    if (!ok) return;
    bot.closeAll('Manual close all');
    toast('All positions closed', 'success');
  });

  $('#positionsBody').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-close-position]');
    if (!btn) return;
    const sym = btn.dataset.closePosition;
    const pos = state.portfolio.positions[sym];
    if (!pos) return;
    bot.closePosition(sym, 'Manual close', pos.mark || pos.entry);
    bot.emit();
  });

  $('#clearLogsBtn').addEventListener('click', () => {
    state.logs = [];
    saveState(state);
    render();
  });

  $('#watchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = $('#watchInput');
    const symbol = input.value.trim().toUpperCase();
    if (!symbol) return;
    const result = bot.addSymbol(symbol);
    if (!result.ok) {
      toast(result.error, 'error');
      input.select();
      return;
    }
    input.value = '';
    toast(`${symbol} added — scanning for setups.`, 'success');
    render();
  });

  $('#watchBody').addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove-symbol]');
    if (remove) {
      const sym = remove.dataset.removeSymbol;
      bot.removeSymbol(sym);
      toast(`${sym} removed from the watchlist.`, 'info');
      return;
    }
    const toggle = e.target.closest('[data-toggle-symbol]');
    if (toggle) {
      const sym = toggle.dataset.toggleSymbol;
      bot.toggleSymbol(sym);
      const row = state.watchlist.find((w) => w.symbol === sym);
      toast(
        row && row.enabled ? `${sym} scanning resumed.` : `${sym} paused — no new entries.`,
        row && row.enabled ? 'success' : 'warn',
      );
    }
  });

  $('#strategyGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-strategy-toggle]');
    if (!btn) return;
    const id = btn.dataset.strategyToggle;
    const set = new Set(state.settings.strategies);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    state.settings.strategies = STRATEGY_IDS.filter((s) => set.has(s));
    state.settings.profile = 'custom';
    saveState(state);
    syncStrategies();
    render();
  });

  $('#stratAllOn').addEventListener('click', () => {
    state.settings.strategies = [...STRATEGY_IDS];
    state.settings.profile = 'custom';
    saveState(state);
    syncStrategies();
    toast('All strategies enabled', 'success');
  });

  $('#stratAllOff').addEventListener('click', () => {
    state.settings.strategies = [];
    state.settings.profile = 'custom';
    saveState(state);
    syncStrategies();
    toast('All strategies disabled — the bot will not open new trades.', 'warn');
  });

  $('#settingsRoot').addEventListener('change', onSettingsChange);
  $('#settingsRoot').addEventListener('click', onSettingsClick);

  $('#exportCsv').addEventListener('click', exportTradesCsv);
  $('#exportJson').addEventListener('click', () => {
    download(`yanai-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(state));
    toast('Backup downloaded.', 'success');
  });

  window.addEventListener('resize', () => {
    if (bot) drawEquity(bot.snapshot());
  });
}

/* ==================================================================== render */

export function render() {
  if (!state || !bot) return;
  const snap = bot.snapshot();
  renderHeader(snap);
  renderStats(snap);
  drawEquity(snap);
  renderPositions(snap);
  renderActivity();
  renderSide(snap);
  renderWatch(snap);
  renderSignalBoard(snap);
  syncStrategies();
  if (currentView === 'history') renderHistory();
  renderFooter(snap);
}

function setView(name, updateHash = true) {
  if (!VIEWS.includes(name)) name = 'dashboard';
  currentView = name;
  $$('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
  if (updateHash) {
    try {
      window.history.replaceState(null, '', `#${name}`);
    } catch {
      /* file:// can refuse this; harmless */
    }
  }
  if (name === 'settings') syncSettings();
  if (name === 'strategies') syncStrategies();
  render();
}

/* ==================================================================== header */

const STATUS_TEXT = {
  open: 'Market open',
  pre: 'Pre-market',
  after: 'After hours',
  closed: 'Market closed',
  weekend: 'Weekend',
  holiday: 'Market holiday',
};

function statusSub(st) {
  if (st.state === 'open') {
    const early = st.earlyClose ? ' · early close' : '';
    return `Closes in ${minutesLabel(st.minutesToClose)}${early}`;
  }
  if (st.state === 'pre') return `Opens in ${minutesLabel(st.minutesToOpen)} · 09:30 ET`;
  return `Opens ${etStamp(st.nextOpenAt)}`;
}

function renderStatus(st) {
  $('#statusPill').className = `status-pill ${st.state}`;
  $('#statusLabel').textContent = STATUS_TEXT[st.state] || 'Market';
  $('#statusSub').textContent = statusSub(st);
}

function renderHeader(snap) {
  const st = snap.status;
  const m = snap.metrics;

  renderStatus(st);
  $('#clock').textContent = `${etTime()} ET`;

  $('#eqValue').textContent = money(m.equity);
  const change = $('#eqChange');
  change.textContent = signedMoney(m.dayPnl);
  change.className = `hs-value ${tone(m.dayPnl)}`;

  const running = state.running === true;
  const btn = $('#runBtn');
  btn.classList.toggle('running', running);
  btn.setAttribute('aria-pressed', String(running));
  $('#runBtnLabel').textContent = running ? 'Pause bot' : 'Start trading';
  const use = $('#runIcon');
  if (use) use.setAttribute('href', running ? '#i-pause' : '#i-play');
}

/* ===================================================================== stats */

function setStat(id, value, sub, cls = '') {
  const v = $(`#${id}`);
  const s = $(`#${id}Sub`);
  if (v) {
    v.textContent = value;
    v.className = `stat-value ${cls}`.trim();
  }
  if (s) s.textContent = sub;
}

function renderStats(snap) {
  const pf = state.portfolio;
  const m = snap.metrics;
  const open = Object.keys(pf.positions).length;
  const profile = PROFILES[state.settings.profile]?.label || 'Custom';
  $('#accountNote').textContent = `Started ${money(pf.initial, 0)} · ${profile}`;

  setStat('statEquity', money(m.equity), `All-time ${signedPct(m.pnlPct)}`, tone(m.pnl));
  setStat('statDayPnl', signedMoney(m.dayPnl), `${signedPct(m.dayPnlPct)} today`, tone(m.dayPnl));
  setStat('statOpenPnl', signedMoney(m.openPnl), `${open} open`, tone(m.openPnl));
  setStat('statRealized', signedMoney(m.realized), `${m.closed} closed`, tone(m.realized));
  setStat(
    'statWinRate',
    m.winRate == null ? '—' : `${(m.winRate * 100).toFixed(0)}%`,
    `${m.wins}W · ${m.losses}L`,
  );
  setStat(
    'statProfitFactor',
    m.profitFactor == null ? '—' : m.profitFactor === Infinity ? '∞' : m.profitFactor.toFixed(2),
    'gross win / gross loss',
  );
  setStat(
    'statMaxDD',
    m.maxDD > 0 ? `-${(m.maxDD * 100).toFixed(2)}%` : '0.00%',
    'peak to trough',
    m.maxDD > 0.02 ? 'down' : '',
  );
  setStat(
    'statExposure',
    money(snap.exposure, 0),
    `${m.equity > 0 ? ((snap.exposure / m.equity) * 100).toFixed(0) : 0}% of equity`,
  );
}

/* ================================================================ equity chart */

function drawEquity(snap) {
  const canvas = $('#equityChart');
  if (!canvas) return;
  const empty = $('#chartEmpty');
  const series = state.portfolio.equity.slice(-800);
  const live = { t: Date.now(), value: snap.metrics.equity };
  const points = series.length ? [...series, live] : [];
  const hasData = points.length >= 2 && canvas.clientWidth > 0;

  if (empty) empty.style.display = hasData ? 'none' : 'grid';

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 10 || h < 10) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!hasData) return;

  const base = Number(state.portfolio.initial) || points[0].value;
  const values = points.map((p) => p.value);
  let min = Math.min(...values, base);
  let max = Math.max(...values, base);
  const span = Math.max(max - min, Math.abs(base) * 0.002, 1);
  min -= span * 0.14;
  max += span * 0.14;

  const padL = 6;
  const padR = 62;
  const padT = 12;
  const padB = 14;
  const iw = w - padL - padR;
  const ih = h - padT - padB;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const X = (t) => padL + (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5) * iw;
  const Y = (v) => padT + (1 - (v - min) / (max - min)) * ih;

  /* horizontal grid + right-side labels */
  ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 3; i += 1) {
    const y = padT + (ih * i) / 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y + 0.5);
    ctx.lineTo(padL + iw, y + 0.5);
    ctx.stroke();
    const value = max - ((max - min) * i) / 3;
    ctx.fillStyle = '#5d6879';
    ctx.fillText(money(value, 0), padL + iw + 10, y);
  }

  /* starting equity baseline */
  if (base >= min && base <= max) {
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(padL, Y(base));
    ctx.lineTo(padL + iw, Y(base));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const rising = points[points.length - 1].value >= points[0].value;
  const rgb = rising ? '52,211,153' : '248,113,113';
  const line = rising ? '#34d399' : '#f87171';

  /* area fill */
  const gradient = ctx.createLinearGradient(0, padT, 0, padT + ih);
  gradient.addColorStop(0, `rgba(${rgb},0.26)`);
  gradient.addColorStop(1, `rgba(${rgb},0.01)`);
  ctx.beginPath();
  ctx.moveTo(X(points[0].t), padT + ih);
  for (const p of points) ctx.lineTo(X(p.t), Y(p.value));
  ctx.lineTo(X(points[points.length - 1].t), padT + ih);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  /* the line */
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = X(p.t);
    const y = Y(p.value);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = `rgba(${rgb},0.5)`;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  /* last point */
  const lastX = X(points[points.length - 1].t);
  const lastY = Y(points[points.length - 1].value);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 6, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${rgb},0.18)`;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2.6, 0, Math.PI * 2);
  ctx.fillStyle = line;
  ctx.fill();

  const legend = $('#equityLegend');
  if (legend) {
    const change = snap.metrics.equity - base;
    legend.innerHTML = `<span class="${tone(change)}">${signedMoney(change)}</span> vs start`;
  }
}

function renderFooter(snap) {
  const foot = $('#footFeed');
  if (!foot) return;
  const last = bot.feed.lastQuoteAt || 0;
  const age = last ? relTime(last) : 'not yet';
  foot.textContent = `Data: ${snap.source} public quotes & 1-minute bars · updated ${age}`;
}

/* ================================================================ positions */

function renderPositions(snap) {
  const pf = state.portfolio;
  const entries = Object.entries(pf.positions);
  $('#positionsCount').textContent = String(entries.length);
  $('#positionsEmpty').classList.toggle('show', entries.length === 0);
  $('#closeAllBtn').disabled = entries.length === 0;

  const rows = entries
    .map(([sym, p]) => {
      const mark = snap.marks[sym] ?? p.mark ?? p.entry;
      const pnl = p.side === 'LONG' ? (mark - p.entry) * p.qty : (p.entry - mark) * p.qty;
      const cost = p.entry * p.qty;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      const risk = p.risk > 0 ? p.risk : Math.abs(p.entry - p.stop);
      const rMultiple = risk > 0 ? pnl / (risk * p.qty) : 0;
      const strategy = STRATEGY_MAP[p.strategy]?.name || p.strategy;
      return `<tr>
        <td>
          <div class="sym">
            <strong>${esc(sym)}</strong>
            <span>${esc(strategy)}</span>
          </div>
        </td>
        <td><span class="badge badge-${p.side === 'LONG' ? 'long' : 'short'}">${p.side}</span></td>
        <td class="num">${p.qty.toLocaleString('en-US')}</td>
        <td class="num">${price(p.entry)}</td>
        <td class="num">${price(mark)}</td>
        <td class="num ${tone(pnl)}">
          ${signedMoney(pnl)}
          <div class="pnl-sub">${signedPct(pnlPct)} · ${rMultiple >= 0 ? '+' : ''}${rMultiple.toFixed(2)}R</div>
        </td>
        <td class="num">${price(p.stop)}</td>
        <td class="num">${price(p.target)}</td>
        <td class="num">
          <button class="icon-btn" type="button" data-close-position="${esc(sym)}" title="Close ${esc(sym)}">
            ${icon('x')}
          </button>
        </td>
      </tr>`;
    })
    .join('');

  $('#positionsBody').innerHTML = rows;
}

/* ================================================================= activity */

function renderActivity() {
  const list = state.logs.slice(0, 60);
  const el = $('#activityList');
  if (!list.length) {
    el.innerHTML =
      '<li class="activity-empty">No activity yet. Press Start trading to begin scanning for setups.</li>';
    return;
  }
  el.innerHTML = list
    .map(
      (l) => `<li>
        <span class="act-dot ${esc(l.kind)}"></span>
        <div class="act-body">
          <div class="act-title">${esc(l.title)}<time>${etTime(l.t)}</time></div>
          ${l.body ? `<div class="act-text">${esc(l.body)}</div>` : ''}
        </div>
      </li>`,
    )
    .join('');
}

/* ================================================================ side rail */

function collectSetups(snap) {
  const out = [];
  for (const [sym, sig] of Object.entries(snap.signals)) {
    for (const setup of sig.setups) out.push({ sym, setup });
  }
  out.sort((a, b) => b.setup.score - a.setup.score);
  return out;
}

function renderSide(snap) {
  const st = snap.status;
  const settings = state.settings;
  const running = state.running === true;
  const scanning = state.watchlist.filter((w) => w.enabled).length;
  const held = Object.keys(state.portfolio.positions).length;
  const setups = collectSetups(snap);
  const best = setups[0] || null;

  let hint;
  if (!settings.strategies.length) {
    hint = 'No strategies are enabled. Turn at least one on in the Strategies tab before starting.';
  } else if (running && st.state === 'open') {
    hint = best
      ? `Armed and scanning <strong>${scanning}</strong> symbols. Best setup: <strong>${esc(best.sym)}</strong> ${best.setup.side.toLowerCase()} at <span class="hl">${best.setup.score}</span>/99.`
      : `Armed and scanning <strong>${scanning}</strong> symbols. Nothing above your score threshold yet.`;
  } else if (running) {
    hint = `Armed. Entries begin at the next open — <strong>${etStamp(st.nextOpenAt)}</strong>.`;
  } else if (st.state === 'open') {
    hint = `Paused. No new entries until you press <strong>Start trading</strong>.${
      held ? ' Open positions are still protected by their stops.' : ''
    }`;
  } else if (st.state === 'pre') {
    hint = `Paused. Pre-market now — entries begin at the 09:30 ET open.${
      scanning ? ` Watching <strong>${scanning}</strong> symbols.` : ' Add symbols to the watchlist to begin.'
    }`;
  } else {
    hint = `Paused. The market is closed.${
      scanning
        ? ` Watching <strong>${scanning}</strong> symbols for the next open.`
        : ' Add symbols to the watchlist to begin.'
    }`;
  }
  if (snap.metrics.dayPnlPct <= -settings.dailyLossPct) {
    hint += '<br><span class="down">Daily loss limit reached — no new entries until tomorrow.</span>';
  }
  $('#botHint').innerHTML = hint;

  const regime = snap.regime;
  const regimeLabel = regime
    ? regime.bias === 'up'
      ? 'Bullish'
      : regime.bias === 'down'
        ? 'Bearish'
        : 'Choppy'
    : '—';
  const regimeCls = regime ? (regime.bias === 'up' ? 'up' : regime.bias === 'down' ? 'down' : 'flat') : '';
  let openRisk = 0;
  for (const p of Object.values(state.portfolio.positions)) {
    openRisk += (p.risk || 0) * p.qty;
  }
  const riskPct = snap.metrics.equity > 0 ? (openRisk / snap.metrics.equity) * 100 : 0;

  $('#miniStats').innerHTML = `
    <div><span class="k">Regime</span><span class="v ${regimeCls}">${regimeLabel}</span></div>
    <div><span class="k">Trades today</span><span class="v">${state.portfolio.dayTrades} / ${settings.maxTradesPerDay}</span></div>
    <div><span class="k">Scanning</span><span class="v">${scanning} symbols</span></div>
    <div><span class="k">Risk on</span><span class="v">${riskPct.toFixed(1)}%</span></div>
  `;

  const mini = state.watchlist.slice(0, 7);
  $('#miniWatch').innerHTML = mini.length
    ? mini
        .map((w) => {
          const q = snap.quotes[w.symbol];
          return `<li>
            <span class="mw-sym">${esc(w.symbol)}</span>
            <span class="mw-price">${q ? price(q.price) : '—'}</span>
            <span class="mw-chg ${q ? tone(q.changePct) : 'flat'}">${q ? signedPct(q.changePct) : '—'}</span>
          </li>`;
        })
        .join('')
    : '<li class="activity-empty">No symbols yet.</li>';

  const top = setups.slice(0, 6);
  $('#signalNote').textContent = top.length ? `${setups.length} active` : '';
  $('#signalList').innerHTML = top.length
    ? top
        .map(
          ({ sym, setup }) => `<li>
            <span class="chip ${setup.side === 'LONG' ? 'long' : 'short'}">${setup.side === 'LONG' ? 'L' : 'S'}</span>
            <div class="sl-main">
              <span class="sl-name">${esc(sym)}</span>
              <span class="sl-desc">${esc(STRATEGY_MAP[setup.id]?.name || setup.id)}</span>
            </div>
            <span class="score ${setup.score >= settings.threshold ? 'hot' : ''}">${setup.score}</span>
          </li>`,
        )
        .join('')
    : '<li class="activity-empty">No setups detected yet.</li>';
}

/* ================================================================= watchlist */

function renderWatch(snap) {
  const rows = state.watchlist;
  $('#watchCount').textContent = String(rows.length);
  $('#watchEmpty').classList.toggle('show', rows.length === 0);

  const settings = state.settings;
  const html = rows
    .map((w) => {
      const q = snap.quotes[w.symbol];
      const sig = snap.signals[w.symbol];
      const best = sig && sig.setups.length ? sig.setups[0] : null;
      const bars = bot.bars[w.symbol] || [];
      const closes = bars.slice(-40).map((b) => b.c);
      const spark = closes.length >= 2 ? sparkline(closes) : '';
      const sparkTone = closes.length >= 2 ? tone(closes[closes.length - 1] - closes[0]) : 'flat';
      const pos = state.portfolio.positions[w.symbol];
      const positionBadge = pos
        ? ` <span class="badge badge-${pos.side === 'LONG' ? 'long' : 'short'}">${pos.side}</span>`
        : '';

      let signalCell = '<span class="chip watch">—</span>';
      if (best) {
        const hot = best.score >= settings.threshold;
        signalCell = `<span class="chip ${best.side === 'LONG' ? 'long' : 'short'}" title="${esc(best.reason)}">
          <span class="dot"></span>${esc(STRATEGY_MAP[best.id]?.name || best.id)}
          <span class="score ${hot ? 'hot' : ''}">${best.score}</span>
        </span>`;
      }

      return `<tr class="${w.enabled ? '' : 'row-off'}">
        <td>
          <div class="sym">
            <strong>${esc(w.symbol)}${positionBadge}</strong>
            <span>${esc(w.name)}</span>
          </div>
        </td>
        <td class="num">${q ? price(q.price) : '—'}</td>
        <td class="num ${q ? tone(q.changePct) : 'flat'}">${q ? signedPct(q.changePct) : '—'}</td>
        <td>${
          spark
            ? `<svg class="spark ${sparkTone}" viewBox="0 0 88 26" preserveAspectRatio="none"><path d="${spark}"/></svg>`
            : '<span class="flat">—</span>'
        }</td>
        <td>${signalCell}</td>
        <td class="center">
          <button class="switch" type="button" role="switch" aria-checked="${w.enabled}"
            data-toggle-symbol="${esc(w.symbol)}" aria-label="Scan ${esc(w.symbol)}"></button>
        </td>
        <td class="num">
          <button class="icon-btn" type="button" data-remove-symbol="${esc(w.symbol)}" title="Remove ${esc(w.symbol)}">
            ${icon('trash')}
          </button>
        </td>
      </tr>`;
    })
    .join('');

  $('#watchBody').innerHTML = html;

  const setups = collectSetups(snap);
  const hot = setups.filter((s) => s.setup.score >= settings.threshold).length;
  $('#boardNote').textContent = `${Object.keys(snap.signals).length} symbols scanned · ${hot} above threshold`;
}

/* ============================================================= signal board */

function renderSignalBoard(snap) {
  const el = $('#signalBoard');
  if (!el) return;
  const setups = collectSetups(snap);
  const threshold = state.settings.threshold;
  if (!setups.length) {
    el.innerHTML =
      '<div class="board-empty">No setups detected right now. The board updates with every new 1-minute bar.</div>';
    return;
  }
  const bySymbol = new Map();
  for (const s of setups) if (!bySymbol.has(s.sym)) bySymbol.set(s.sym, s);

  el.innerHTML = [...bySymbol.values()]
    .slice(0, 30)
    .map(({ sym, setup }) => {
      const q = snap.quotes[sym];
      const hot = setup.score >= threshold;
      return `<article class="board-card">
        <div class="board-top">
          <span class="board-sym">${esc(sym)}</span>
          <span class="chip ${setup.side === 'LONG' ? 'long' : 'short'}"><span class="dot"></span>${setup.side}</span>
        </div>
        <div class="board-meta">
          ${esc(STRATEGY_MAP[setup.id]?.name || setup.id)} · score
          <span class="score ${hot ? 'hot' : ''}">${setup.score}</span>
          ${q ? ` · ${price(q.price)}` : ''}
        </div>
        <p class="board-reason">${esc(setup.reason)}</p>
      </article>`;
    })
    .join('');
}

/* ================================================================ strategies */

function buildStrategies() {
  const grid = $('#strategyGrid');
  if (!grid) return;
  grid.innerHTML = STRATEGIES.map(
    (s) => `<article class="strategy-card" data-card="${s.id}">
      <div class="sc-top">
        <span class="badge badge-${s.side === 'LONG' ? 'long' : 'short'}">${s.side}</span>
        <span class="sc-name">${esc(s.name)}</span>
        <button class="switch" type="button" role="switch" aria-checked="true"
          data-strategy-toggle="${s.id}" aria-label="Enable ${esc(s.name)}"></button>
      </div>
      <p class="sc-desc">${esc(s.desc)}</p>
      <div class="sc-foot">
        <span class="sc-ind">${esc(s.indicator)}</span>
        <span class="sc-tag">${esc(s.tag)}</span>
      </div>
    </article>`,
  ).join('');
}

function syncStrategies() {
  const enabled = new Set(state.settings.strategies);
  for (const s of STRATEGIES) {
    const card = $(`[data-card="${s.id}"]`);
    if (!card) continue;
    const on = enabled.has(s.id);
    card.classList.toggle('off', !on);
    const btn = $('[data-strategy-toggle]', card);
    if (btn) btn.setAttribute('aria-checked', String(on));
  }
}

/* ================================================================== settings */

const SETTING_GROUPS = [
  {
    title: 'Position sizing',
    fields: [
      { key: 'riskPct', label: 'Risk per trade', suffix: '%', min: 0.05, max: 2, step: 0.05, hint: 'Equity risked between entry and stop.' },
      { key: 'maxPositions', label: 'Max open positions', min: 1, max: 10, step: 1, hint: 'Concurrent paper positions.' },
      { key: 'maxAllocPct', label: 'Max per position', suffix: '%', min: 2, max: 50, step: 1, hint: 'Cap on a single position\u2019s notional.' },
      { key: 'maxGrossLeverage', label: 'Max gross leverage', suffix: 'x', min: 1, max: 3, step: 0.1, hint: 'Total exposure versus equity.' },
    ],
  },
  {
    title: 'Stops & targets',
    fields: [
      { key: 'stopPct', label: 'Stop distance', suffix: '%', min: 0.15, max: 5, step: 0.05, hint: 'Minimum stop, as a percent of price.' },
      { key: 'atrMult', label: 'ATR stop multiple', suffix: 'x', min: 0.5, max: 4, step: 0.1, hint: 'Stop = ATR \u00d7 this, when wider.' },
      { key: 'targetR', label: 'Target', suffix: 'R', min: 0.5, max: 6, step: 0.1, hint: 'Profit target in units of risk.' },
      { key: 'trailTriggerR', label: 'Trail after', suffix: 'R', min: 0.2, max: 4, step: 0.1, hint: 'Start trailing once this much is earned.' },
      { key: 'trailPct', label: 'Trail distance', suffix: '%', min: 0, max: 4, step: 0.05, hint: 'Distance behind the best price.' },
    ],
  },
  {
    title: 'Limits & pacing',
    fields: [
      { key: 'dailyLossPct', label: 'Daily loss limit', suffix: '%', min: 0.2, max: 8, step: 0.1, hint: 'Stop entries for the day at this loss.' },
      { key: 'maxTradesPerDay', label: 'Max entries per day', min: 1, max: 60, step: 1 },
      { key: 'cooldownMin', label: 'Cooldown after exit', suffix: 'min', min: 0, max: 60, step: 1, hint: 'Wait before re-entering a symbol.' },
      { key: 'entryCutoffMin', label: 'No entries before close', suffix: 'min', min: 0, max: 60, step: 1 },
      { key: 'minBars', label: 'Warm-up bars', min: 5, max: 60, step: 1, hint: 'Session minutes required before trading.' },
      { key: 'threshold', label: 'Signal threshold', min: 40, max: 95, step: 1, hint: 'Minimum score (0\u201399) to open a trade.' },
      { key: 'slippageBps', label: 'Slippage', suffix: 'bps', min: 0, max: 25, step: 1, hint: 'Adverse fill applied to entries and exits.' },
    ],
  },
];

const PROFILE_BLURB = {
  conservative: 'Smaller size, tighter stops',
  balanced: 'Default blend of risk and pace',
  aggressive: 'Larger size, more trades',
};

function fieldHtml(f) {
  return `<div class="field">
    <label for="set-${f.key}">${esc(f.label)}${f.suffix ? ` (${esc(f.suffix)})` : ''}</label>
    <input id="set-${f.key}" type="number" inputmode="decimal" data-setting="${f.key}"
      min="${f.min ?? ''}" max="${f.max ?? ''}" step="${f.step ?? 1}" />
    ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}
  </div>`;
}

function toggleRow(key, title, desc) {
  return `<div class="toggle-row">
    <div class="tr-text">
      <span class="tr-title">${esc(title)}</span>
      <span class="tr-desc">${esc(desc)}</span>
    </div>
    <button class="switch" type="button" role="switch" aria-checked="false"
      data-toggle-setting="${key}" aria-label="${esc(title)}"></button>
  </div>`;
}

function buildSettings() {
  const root = $('#settingsRoot');
  if (!root) return;
  root.innerHTML = `<div class="settings-wrap">
    <div class="panel">
      <div class="panel-head">
        <h2>Risk profile</h2>
        <span class="panel-note">Presets — fine-tune anything below</span>
      </div>
      <div class="setting-body">
        <div class="profile-row" id="profileRow">
          ${Object.entries(PROFILES)
            .map(
              ([key, p]) => `<button class="profile-btn" type="button" data-profile="${key}">
                <strong>${esc(p.label)}</strong>
                <span>${esc(PROFILE_BLURB[key] || '')}</span>
              </button>`,
            )
            .join('')}
        </div>
        <p class="panel-note">
          Balanced is the default. Changing any number below switches you to a custom profile.
        </p>
      </div>
    </div>

    <div class="settings-grid">
      ${SETTING_GROUPS.map(
        (group) => `<div class="panel">
          <div class="panel-head"><h2>${esc(group.title)}</h2></div>
          <div class="setting-body">
            <div class="fields">${group.fields.map(fieldHtml).join('')}</div>
          </div>
        </div>`,
      ).join('')}

      <div class="panel">
        <div class="panel-head"><h2>Session &amp; behaviour</h2></div>
        <div class="setting-body">
          <div class="field">
            <label for="set-eodMode">End of day</label>
            <select id="set-eodMode" data-setting="eodMode">
              <option value="close">Close positions before the bell</option>
              <option value="hold">Hold positions overnight</option>
            </select>
            <span class="hint">Closing flattens everything 5 minutes before the close.</span>
          </div>
          ${toggleRow('allowShorts', 'Short selling', 'Enable the short strategies. Turn off for long-only trading.')}
          ${toggleRow('regimeFilter', 'Regime filter', 'Uses SPY to skip longs in a downtrend and shorts in an uptrend.')}
          ${toggleRow('autoStart', 'Auto-start', 'Start trading automatically when the page opens. Off by default.')}
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Account</h2></div>
        <div class="setting-body">
          <div class="field">
            <label for="set-startingEquity">Starting equity</label>
            <input id="set-startingEquity" type="number" inputmode="decimal"
              data-setting="startingEquity" min="1000" max="10000000" step="1000" />
            <span class="hint">Applies when you reset the paper account.</span>
          </div>
          <p class="panel-note">
            All fills are simulated at live CNBC quotes with your slippage setting applied.
            Nothing is ever sent to a broker.
          </p>
        </div>
      </div>
    </div>

    <div class="panel danger-zone">
      <div class="panel-head"><h2>Data &amp; reset</h2></div>
      <div class="danger-actions">
        <button class="btn" type="button" data-action="export">Download backup</button>
        <button class="btn" type="button" data-action="import">Import backup</button>
        <button class="danger-btn" type="button" data-action="reset-portfolio">Reset paper account</button>
        <button class="danger-btn" type="button" data-action="wipe">Erase everything</button>
      </div>
    </div>
  </div>`;

  syncSettings();
}

function syncSettings() {
  if (!state) return;
  const s = state.settings;
  for (const input of $$('#settingsRoot [data-setting]')) {
    const key = input.dataset.setting;
    if (document.activeElement === input) continue;
    input.value = key === 'eodMode' ? s.eodMode : s[key];
  }
  for (const btn of $$('#settingsRoot [data-toggle-setting]')) {
    btn.setAttribute('aria-checked', String(Boolean(s[btn.dataset.toggleSetting])));
  }
  for (const btn of $$('#profileRow [data-profile]')) {
    btn.classList.toggle('active', s.profile === btn.dataset.profile);
  }
}

function onSettingsChange(e) {
  const input = e.target.closest('[data-setting]');
  if (!input) return;
  const key = input.dataset.setting;

  if (key === 'eodMode') {
    applySetting(key, input.value);
    return;
  }

  if (input.value.trim() === '') {
    syncSettings();
    return;
  }
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    syncSettings();
    return;
  }
  applySetting(key, value);
  input.value = state.settings[key];
}

function onSettingsClick(e) {
  const toggle = e.target.closest('[data-toggle-setting]');
  if (toggle) {
    const key = toggle.dataset.toggleSetting;
    state.settings[key] = !state.settings[key];
    saveState(state);
    syncSettings();
    render();
    toast(`${toggle.closest('.toggle-row')?.querySelector('.tr-title')?.textContent || key} ${state.settings[key] ? 'enabled' : 'disabled'}.`, 'info');
    return;
  }

  const profile = e.target.closest('[data-profile]');
  if (profile) {
    applyProfile(profile.dataset.profile);
    return;
  }

  const action = e.target.closest('[data-action]');
  if (action) handleAction(action.dataset.action);
}

function applySetting(key, value) {
  state.settings[key] = value;
  if (!['eodMode', 'startingEquity', 'autoStart', 'allowShorts', 'regimeFilter'].includes(key)) {
    state.settings.profile = 'custom';
  }
  state.settings = normalizeSettings(state.settings);
  saveState(state);
  syncSettings();
  render();
}

function applyProfile(name) {
  const preset = PROFILES[name];
  if (!preset) return;
  state.settings = normalizeSettings({ ...state.settings, ...preset, profile: name });
  saveState(state);
  syncSettings();
  render();
  toast(`${preset.label} profile applied.`, 'success');
}

async function handleAction(action) {
  if (action === 'export') {
    download(`yanai-backup-${new Date().toISOString().slice(0, 10)}.json`, exportJSON(state));
    toast('Backup downloaded.', 'success');
    return;
  }
  if (action === 'import') {
    importBackup();
    return;
  }
  if (action === 'reset-portfolio') {
    const ok = await confirmDialog({
      title: 'Reset the paper account?',
      body: `Equity returns to ${money(state.settings.startingEquity, 0)} and all open positions and trade history are cleared. Your watchlist and settings stay.`,
      confirmLabel: 'Reset account',
      danger: true,
    });
    if (!ok) return;
    state.portfolio = newPortfolio(state.settings.startingEquity);
    addLog(state, 'info', 'Paper account reset', `Starting equity ${money(state.settings.startingEquity, 0)}.`);
    saveState(state);
    render();
    toast('Paper account reset.', 'success');
    return;
  }
  if (action === 'wipe') {
    const ok = await confirmDialog({
      title: 'Erase all local data?',
      body: 'This deletes the watchlist, settings, trade history and the paper account from this browser. It cannot be undone.',
      confirmLabel: 'Erase everything',
      danger: true,
    });
    if (!ok) return;
    clearState();
    window.__yanaiSkipSave = true;
    location.reload();
  }
}

function importBackup() {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'application/json,.json';
  picker.onchange = async () => {
    const file = picker.files && picker.files[0];
    if (!file) return;
    try {
      const parsed = normalizeState(JSON.parse(await file.text()));
      if (!parsed) throw new Error('not a YANAI backup');
      parsed.running = false;
      Object.assign(state, parsed);
      bot.state = state;
      bot.bars = {};
      bot.signals = {};
      bot.feed.quoteCache.clear();
      bot.feed.barCache.clear();
      saveState(state);
      syncSettings();
      syncStrategies();
      render();
      toast('Backup restored. The bot is paused.', 'success');
    } catch (err) {
      toast(`Import failed: ${err?.message || 'unreadable file'}`, 'error');
    }
  };
  picker.click();
}

/* =================================================================== history */

function renderHistory() {
  const closed = state.portfolio.trades.filter((t) => t.action === 'CLOSE');
  $('#historyEmpty').classList.toggle('show', closed.length === 0);

  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const net = closed.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
  const best = closed.length ? Math.max(...closed.map((t) => Number(t.pnl) || 0)) : 0;
  const worst = closed.length ? Math.min(...closed.map((t) => Number(t.pnl) || 0)) : 0;

  $('#historySummary').innerHTML = [
    ['Closed trades', String(closed.length), ''],
    ['Net P&L', signedMoney(net), tone(net)],
    ['Win rate', closed.length ? `${((wins.length / closed.length) * 100).toFixed(0)}%` : '\u2014', ''],
    ['Avg win', money(avgWin), ''],
    ['Avg loss', money(avgLoss), ''],
    ['Profit factor', pf === Infinity ? '\u221e' : pf.toFixed(2), ''],
    ['Best trade', signedMoney(best), tone(best)],
    ['Worst trade', signedMoney(worst), tone(worst)],
  ]
    .map(
      ([k, v, cls]) =>
        `<div class="hs-item"><span class="k">${k}</span><span class="v ${cls}">${v}</span></div>`,
    )
    .join('');

  const rows = closed
    .slice()
    .sort((a, b) => b.t - a.t)
    .slice(0, 400)
    .map(
      (t) => `<tr>
        <td>${etDateTime(t.t)}</td>
        <td><div class="sym"><strong>${esc(t.symbol)}</strong><span>${esc(STRATEGY_MAP[t.strategy]?.name || t.strategy || '')}</span></div></td>
        <td><span class="badge badge-${t.side === 'LONG' ? 'long' : 'short'}">${esc(t.side || '')}</span></td>
        <td class="num">${Number(t.qty || 0).toLocaleString('en-US')}</td>
        <td class="num">${price(t.entry)}</td>
        <td class="num">${price(t.price)}</td>
        <td class="num ${tone(t.pnl)}">${signedMoney(t.pnl)}</td>
        <td class="num ${tone(t.pnlPct)}">${signedPct(t.pnlPct)}</td>
        <td>${esc(t.reason || '')}</td>
      </tr>`,
    )
    .join('');

  $('#historyBody').innerHTML = rows;
}

function csvCell(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportTradesCsv() {
  const trades = state.portfolio.trades.slice().sort((a, b) => a.t - b.t);
  if (!trades.length) {
    toast('No trades to export yet.', 'warn');
    return;
  }
  const header = ['time_et', 'action', 'symbol', 'side', 'qty', 'price', 'entry', 'notional', 'pnl', 'pnl_pct', 'strategy', 'reason'];
  const lines = [header.join(',')];
  for (const t of trades) {
    lines.push(
      [
        etDateTime(t.t),
        t.action,
        t.symbol,
        t.side || '',
        t.qty ?? '',
        t.price ?? '',
        t.entry ?? '',
        t.notional ?? '',
        t.pnl ?? '',
        t.pnlPct ?? '',
        STRATEGY_MAP[t.strategy]?.name || t.strategy || '',
        t.reason || '',
      ]
        .map(csvCell)
        .join(','),
    );
  }
  download(`yanai-trades-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'), 'text/csv');
  toast(`Exported ${trades.length} trade records.`, 'success');
}

/* ==================================================================== toast */

export function toast(message, kind = 'info', ms = 3800) {
  const stack = $('#toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `<span class="t-dot"></span><div class="t-body">${esc(message)}</div>`;
  stack.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 240);
  }, ms);
}

/* ==================================================================== modal */

function confirmDialog({ title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h3 id="modalTitle">${esc(title)}</h3>
      <p>${esc(body)}</p>
      <div class="modal-actions">
        <button class="btn" type="button" data-modal-cancel>${esc(cancelLabel)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-modal-ok>${esc(confirmLabel)}</button>
      </div>
    </div>`;
    root.classList.add('open');

    const onKey = (e) => {
      if (e.key === 'Escape') done(false);
    };
    const onBackdrop = (e) => {
      if (e.target === root) done(false);
    };
    const done = (value) => {
      root.classList.remove('open');
      root.innerHTML = '';
      document.removeEventListener('keydown', onKey);
      root.removeEventListener('click', onBackdrop);
      resolve(value);
    };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', onBackdrop);
    $('[data-modal-cancel]', root).addEventListener('click', () => done(false));
    $('[data-modal-ok]', root).addEventListener('click', () => done(true));
  });
}


