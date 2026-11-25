/* ============================================================================
   YANAI TRADING — store.js
   Durable local persistence (localStorage). Everything the bot knows lives
   in one versioned JSON document, with validation and safe trimming.
   ========================================================================== */

import {
  newPortfolio,
  normalizeSettings,
  validSymbol,
  STRATEGY_IDS,
  VERSION,
} from './engine.js';

const KEY = 'yanai.trading.state.v1';
const MAX_TRADES = 2000;
const MAX_EQUITY = 5000;
const MAX_LOGS = 300;
const MAX_WATCH = 30;

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

/* Old profile defaults that were replaced by the 1,000-trade cap. */
const LEGACY_TRADE_CAPS = new Set([12, 20, 30]);

function migrate(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const version = String(raw.version || '0.0.0');
  if (version >= '2.0.0') return raw;

  const settings = raw.settings && typeof raw.settings === 'object' ? { ...raw.settings } : null;
  if (settings) {
    const cap = Number(settings.maxTradesPerDay);
    if (!Number.isFinite(cap) || LEGACY_TRADE_CAPS.has(cap)) {
      settings.maxTradesPerDay = 1000;
    }
    if (!Number.isFinite(Number(settings.maxChasePct))) settings.maxChasePct = 0.4;
    if (!Number.isFinite(Number(settings.timeStopMin))) settings.timeStopMin = 45;
    raw.settings = settings;
  }
  raw.version = VERSION;
  return raw;
}

function normalizePosition(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const side = raw.side === 'SHORT' ? 'SHORT' : raw.side === 'LONG' ? 'LONG' : null;
  const qty = Number(raw.qty);
  const entry = Number(raw.entry);
  if (!side || !(qty > 0) || !(entry > 0)) return null;
  const stop = Number(raw.stop);
  const target = Number(raw.target);
  return {
    side,
    qty: Math.floor(qty),
    entry,
    stop: isNum(stop) && stop > 0 ? stop : entry * (side === 'LONG' ? 0.99 : 1.01),
    target: isNum(target) && target > 0 ? target : entry * (side === 'LONG' ? 1.02 : 0.98),
    risk: isNum(Number(raw.risk)) && Number(raw.risk) > 0 ? Number(raw.risk) : Math.abs(entry - stop) || entry * 0.01,
    high: isNum(Number(raw.high)) ? Number(raw.high) : entry,
    low: isNum(Number(raw.low)) ? Number(raw.low) : entry,
    mark: isNum(Number(raw.mark)) ? Number(raw.mark) : entry,
    openedAt: Number(raw.openedAt) || Date.now(),
    strategy: STRATEGY_IDS.includes(raw.strategy) ? raw.strategy : 'trend_long',
    reason: typeof raw.reason === 'string' ? raw.reason : '',
    score: isNum(Number(raw.score)) ? Number(raw.score) : null,
  };
}

function normalizePortfolio(raw, settings) {
  const fallback = newPortfolio(settings.startingEquity);
  if (!raw || typeof raw !== 'object') return fallback;
  const pf = {
    initial: isNum(Number(raw.initial)) && Number(raw.initial) > 0 ? Number(raw.initial) : settings.startingEquity,
    cash: isNum(Number(raw.cash)) ? Number(raw.cash) : settings.startingEquity,
    positions: {},
    realized: isNum(Number(raw.realized)) ? Number(raw.realized) : 0,
    trades: [],
    equity: [],
    dayKey: typeof raw.dayKey === 'string' ? raw.dayKey : '',
    dayStartEquity: isNum(Number(raw.dayStartEquity)) ? Number(raw.dayStartEquity) : settings.startingEquity,
    dayTrades: Number.isInteger(raw.dayTrades) && raw.dayTrades >= 0 ? raw.dayTrades : 0,
    tradeSeq: Number.isInteger(raw.tradeSeq) && raw.tradeSeq >= 0 ? raw.tradeSeq : 0,
    lastExit: {},
  };
  if (raw.positions && typeof raw.positions === 'object') {
    for (const [sym, p] of Object.entries(raw.positions)) {
      const pos = normalizePosition(p);
      if (pos && validSymbol(sym)) pf.positions[sym] = pos;
    }
  }
  if (Array.isArray(raw.trades)) {
    pf.trades = raw.trades
      .filter((t) => t && typeof t === 'object' && validSymbol(t.symbol) && (t.action === 'OPEN' || t.action === 'CLOSE'))
      .slice(0, MAX_TRADES);
  }
  if (Array.isArray(raw.equity)) {
    pf.equity = raw.equity
      .filter((p) => p && isNum(Number(p.t)) && isNum(Number(p.value)))
      .map((p) => ({ t: Number(p.t), value: Number(p.value) }))
      .sort((a, b) => a.t - b.t)
      .slice(-MAX_EQUITY);
  }
  if (raw.lastExit && typeof raw.lastExit === 'object') {
    for (const [sym, t] of Object.entries(raw.lastExit)) {
      if (validSymbol(sym) && isNum(Number(t))) pf.lastExit[sym] = Number(t);
    }
  }
  return pf;
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object') return null;
  raw = migrate(raw);
  const settings = normalizeSettings(raw.settings || {});
  const now = Date.now();
  const watchlist = Array.isArray(raw.watchlist)
    ? raw.watchlist
        .filter((w) => w && validSymbol(String(w.symbol).toUpperCase()))
        .map((w) => ({
          symbol: String(w.symbol).toUpperCase(),
          name: typeof w.name === 'string' && w.name ? w.name : String(w.symbol).toUpperCase(),
          enabled: w.enabled !== false,
          addedAt: Number(w.addedAt) || now,
        }))
        .filter((w, i, arr) => arr.findIndex((x) => x.symbol === w.symbol) === i)
        .slice(0, MAX_WATCH)
    : [];
  const logs = Array.isArray(raw.logs)
    ? raw.logs
        .filter((l) => l && typeof l === 'object')
        .map((l) => ({
          t: Number(l.t) || now,
          kind: typeof l.kind === 'string' ? l.kind : 'info',
          title: String(l.title || ''),
          body: String(l.body || ''),
          symbol: String(l.symbol || ''),
        }))
        .slice(0, MAX_LOGS)
    : [];
  return {
    version: VERSION,
    createdAt: Number(raw.createdAt) || now,
    updatedAt: now,
    running: raw.running === true,
    settings,
    watchlist,
    portfolio: normalizePortfolio(raw.portfolio, settings),
    logs,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

function trimForStorage(state) {
  if (state.portfolio.trades.length > MAX_TRADES) state.portfolio.trades.length = MAX_TRADES;
  if (state.portfolio.equity.length > MAX_EQUITY) {
    state.portfolio.equity.splice(0, state.portfolio.equity.length - MAX_EQUITY);
  }
  if (state.logs.length > MAX_LOGS) state.logs.length = MAX_LOGS;
}

export function saveState(state) {
  try {
    state.updatedAt = Date.now();
    trimForStorage(state);
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    try {
      // Last resort: keep only the essentials.
      const slim = {
        ...state,
        logs: state.logs.slice(0, 60),
        portfolio: {
          ...state.portfolio,
          trades: state.portfolio.trades.slice(0, 250),
          equity: state.portfolio.equity.slice(-600),
        },
      };
      localStorage.setItem(KEY, JSON.stringify(slim));
      return true;
    } catch {
      return false;
    }
  }
}

export function clearState() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
