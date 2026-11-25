/* ============================================================================
   YANAI TRADING — engine.js
   Pure logic: US market calendar, indicators, long/short strategies,
   portfolio accounting and settings. No DOM, no network.
   ========================================================================== */

export const VERSION = '1.0.0';

/* ----------------------------------------------------------------------------
   Strategy catalogue
   -------------------------------------------------------------------------- */
export const STRATEGIES = [
  {
    id: 'trend_long',
    name: 'Trend Rider',
    side: 'LONG',
    tag: 'Pullback',
    desc: 'Buys a pullback into the fast EMA while the 9/21/50 EMAs are stacked upward and momentum is still constructive.',
    indicator: 'EMA 9 / 21 / 50 · RSI 14',
  },
  {
    id: 'breakout_long',
    name: 'Breakout',
    side: 'LONG',
    tag: 'Momentum',
    desc: 'Buys a close above the 20-bar high when a strong candle arrives with above-average volume.',
    indicator: '20-bar high · Relative volume',
  },
  {
    id: 'vwap_long',
    name: 'VWAP Reclaim',
    side: 'LONG',
    tag: 'Reclaim',
    desc: 'Buys when price crosses back above the session VWAP with participation, a classic intraday strength signal.',
    indicator: 'Session VWAP · Volume',
  },
  {
    id: 'reversion_long',
    name: 'Dip Buyer',
    side: 'LONG',
    tag: 'Mean reversion',
    desc: 'Buys an oversold lower-band reclaim when the short-term trend is flat, catching snap-back moves.',
    indicator: 'Bollinger 20 / 2 · RSI 14',
  },
  {
    id: 'trend_short',
    name: 'Downtrend Short',
    side: 'SHORT',
    tag: 'Pullback',
    desc: 'Shorts a rally into the fast EMA while the 9/21/50 EMAs are stacked downward and momentum stays weak.',
    indicator: 'EMA 9 / 21 / 50 · RSI 14',
  },
  {
    id: 'breakdown_short',
    name: 'Breakdown',
    side: 'SHORT',
    tag: 'Momentum',
    desc: 'Shorts a close below the 20-bar low when a strong bearish candle arrives with above-average volume.',
    indicator: '20-bar low · Relative volume',
  },
  {
    id: 'vwap_short',
    name: 'VWAP Rejection',
    side: 'SHORT',
    tag: 'Rejection',
    desc: 'Shorts when price crosses back below the session VWAP with participation, a classic intraday weakness signal.',
    indicator: 'Session VWAP · Volume',
  },
  {
    id: 'reversion_short',
    name: 'Fade Rally',
    side: 'SHORT',
    tag: 'Mean reversion',
    desc: 'Shorts an overbought upper-band rejection when the short-term trend is flat, fading exhausted rallies.',
    indicator: 'Bollinger 20 / 2 · RSI 14',
  },
];

export const STRATEGY_IDS = STRATEGIES.map((s) => s.id);
export const STRATEGY_MAP = Object.fromEntries(STRATEGIES.map((s) => [s.id, s]));

/* ----------------------------------------------------------------------------
   Risk profiles & settings
   -------------------------------------------------------------------------- */
export const PROFILES = {
  conservative: {
    label: 'Conservative',
    riskPct: 0.25,
    maxPositions: 3,
    maxAllocPct: 12,
    stopPct: 1.0,
    atrMult: 1.6,
    targetR: 1.8,
    trailTriggerR: 1.0,
    trailPct: 0.7,
    dailyLossPct: 2.0,
    maxTradesPerDay: 12,
    cooldownMin: 10,
  },
  balanced: {
    label: 'Balanced',
    riskPct: 0.5,
    maxPositions: 5,
    maxAllocPct: 20,
    stopPct: 0.8,
    atrMult: 1.4,
    targetR: 2.0,
    trailTriggerR: 1.0,
    trailPct: 0.8,
    dailyLossPct: 3.0,
    maxTradesPerDay: 20,
    cooldownMin: 5,
  },
  aggressive: {
    label: 'Aggressive',
    riskPct: 0.9,
    maxPositions: 8,
    maxAllocPct: 25,
    stopPct: 0.7,
    atrMult: 1.2,
    targetR: 2.2,
    trailTriggerR: 0.8,
    trailPct: 1.0,
    dailyLossPct: 4.0,
    maxTradesPerDay: 30,
    cooldownMin: 3,
  },
};

export const DEFAULT_SETTINGS = {
  profile: 'balanced',
  ...PROFILES.balanced,
  strategies: [...STRATEGY_IDS],
  eodMode: 'close', // 'close' = flatten before the bell, 'hold' = carry overnight
  autoStart: false,
  entryCutoffMin: 15,
  minBars: 15,
  slippageBps: 2,
  maxGrossLeverage: 1.5,
  startingEquity: 100000,
  threshold: 60,
  allowShorts: true,
  regimeFilter: true,
};

export const DEFAULT_WATCHLIST = [
  ['NVDA', 'NVIDIA Corp'],
  ['AAPL', 'Apple Inc.'],
  ['MSFT', 'Microsoft Corp.'],
  ['TSLA', 'Tesla Inc.'],
  ['AMZN', 'Amazon.com Inc.'],
  ['GOOGL', 'Alphabet Inc.'],
  ['META', 'Meta Platforms Inc.'],
  ['AMD', 'Advanced Micro Devices'],
  ['SPY', 'SPDR S&P 500 ETF'],
  ['QQQ', 'Invesco QQQ Trust'],
  ['AVGO', 'Broadcom Inc.'],
  ['PLTR', 'Palantir Technologies'],
];

const LIMITS = {
  riskPct: [0.05, 2],
  maxPositions: [1, 10],
  maxAllocPct: [2, 50],
  stopPct: [0.15, 5],
  atrMult: [0.5, 4],
  targetR: [0.5, 6],
  trailTriggerR: [0.2, 4],
  trailPct: [0, 4],
  dailyLossPct: [0.2, 8],
  maxTradesPerDay: [1, 60],
  cooldownMin: [0, 60],
  entryCutoffMin: [0, 60],
  minBars: [5, 60],
  slippageBps: [0, 25],
  maxGrossLeverage: [1, 3],
  startingEquity: [1000, 10000000],
  threshold: [40, 95],
};

const INTEGER_KEYS = new Set(['maxPositions', 'maxTradesPerDay', 'minBars', 'entryCutoffMin', 'cooldownMin']);

export const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);

export function normalizeSettings(raw = {}) {
  const out = {
    ...DEFAULT_SETTINGS,
    strategies: [...DEFAULT_SETTINGS.strategies],
  };
  out.profile = Object.prototype.hasOwnProperty.call(PROFILES, raw.profile) ? raw.profile : 'custom';
  for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
    const v = Number(raw[key]);
    if (Number.isFinite(v)) out[key] = clamp(v, lo, hi);
    if (INTEGER_KEYS.has(key)) out[key] = Math.round(out[key]);
  }
  if (Array.isArray(raw.strategies)) {
    const set = new Set(raw.strategies.filter((id) => STRATEGY_MAP[id]));
    out.strategies = STRATEGY_IDS.filter((id) => set.has(id));
  }
  out.eodMode = raw.eodMode === 'hold' ? 'hold' : 'close';
  out.autoStart = raw.autoStart === true;
  out.allowShorts = raw.allowShorts !== false;
  out.regimeFilter = raw.regimeFilter !== false;
  return out;
}

export function validSymbol(s) {
  return typeof s === 'string' && /^[A-Z][A-Z0-9]{0,6}(?:[.\-][A-Z0-9]{1,3})?$/.test(s);
}

/* ----------------------------------------------------------------------------
   US Eastern time (no tzdata / no Intl dependency)
   DST: second Sunday of March 07:00 UTC -> first Sunday of November 06:00 UTC
   -------------------------------------------------------------------------- */
const MIN = 60000;
const DAY = 86400000;

function utcDate(y, m, d) {
  return new Date(Date.UTC(y, m - 1, d));
}
function pad2(n) {
  return String(n).padStart(2, '0');
}
export function dateKey(dt) {
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}
function addDays(dt, n) {
  return new Date(dt.getTime() + n * DAY);
}
function nthWeekdayUTC(y, m, weekday, n) {
  const first = utcDate(y, m, 1);
  const delta = (weekday - first.getUTCDay() + 7) % 7;
  return addDays(first, delta + 7 * (n - 1));
}
function lastWeekdayUTC(y, m, weekday) {
  const nextMonth = m === 12 ? utcDate(y + 1, 1, 1) : utcDate(y, m + 1, 1);
  let d = addDays(nextMonth, -1);
  d = addDays(d, -((d.getUTCDay() - weekday + 7) % 7));
  return d;
}
function easterUTC(y) {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utcDate(y, month, day);
}
function observed(dt) {
  const wd = dt.getUTCDay();
  if (wd === 6) return addDays(dt, -1);
  if (wd === 0) return addDays(dt, 1);
  return dt;
}

export function etOffsetMinutes(date = new Date()) {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 2, nthWeekdayUTC(y, 3, 0, 2).getUTCDate(), 7, 0, 0, 0);
  const end = Date.UTC(y, 10, nthWeekdayUTC(y, 11, 0, 1).getUTCDate(), 6, 0, 0, 0);
  const t = date.getTime();
  return t >= start && t < end ? -240 : -300;
}

export function nowET(date = new Date()) {
  const et = new Date(date.getTime() + etOffsetMinutes(date) * MIN);
  return {
    year: et.getUTCFullYear(),
    month: et.getUTCMonth() + 1,
    day: et.getUTCDate(),
    hour: et.getUTCHours(),
    minute: et.getUTCMinutes(),
    second: et.getUTCSeconds(),
    weekday: et.getUTCDay(),
    date: `${et.getUTCFullYear()}-${pad2(et.getUTCMonth() + 1)}-${pad2(et.getUTCDate())}`,
  };
}

export function etWallToUtc(y, m, d, hh, mm) {
  const wall = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const off = etOffsetMinutes(new Date(wall));
  return new Date(wall - off * MIN);
}

const HOLIDAY_CACHE = new Map();
export function holidays(year) {
  if (HOLIDAY_CACHE.has(year)) return HOLIDAY_CACHE.get(year);
  const set = new Set();
  const add = (dt) => set.add(dateKey(dt));
  add(observed(utcDate(year, 1, 1))); // New Year's Day
  add(nthWeekdayUTC(year, 1, 1, 3)); // MLK Day
  add(nthWeekdayUTC(year, 2, 1, 3)); // Presidents' Day
  add(addDays(easterUTC(year), -2)); // Good Friday
  add(lastWeekdayUTC(year, 5, 1)); // Memorial Day
  add(observed(utcDate(year, 6, 19))); // Juneteenth
  add(observed(utcDate(year, 7, 4))); // Independence Day
  add(nthWeekdayUTC(year, 9, 1, 1)); // Labor Day
  add(nthWeekdayUTC(year, 11, 4, 4)); // Thanksgiving
  add(observed(utcDate(year, 12, 25))); // Christmas
  if (utcDate(year, 1, 1).getUTCDay() === 6) add(utcDate(year - 1, 12, 31));
  if (year === 2025) add(utcDate(2025, 1, 9)); // National Day of Mourning
  HOLIDAY_CACHE.set(year, set);
  return set;
}

const EARLY_CACHE = new Map();
export function earlyCloses(year) {
  if (EARLY_CACHE.has(year)) return EARLY_CACHE.get(year);
  const set = new Set();
  const j3 = utcDate(year, 7, 3);
  const j4 = utcDate(year, 7, 4);
  if (j3.getUTCDay() >= 1 && j3.getUTCDay() <= 5 && j4.getUTCDay() >= 1 && j4.getUTCDay() <= 5) {
    set.add(dateKey(j3));
  }
  const thanksgiving = nthWeekdayUTC(year, 11, 4, 4);
  const blackFriday = addDays(thanksgiving, 1);
  if (blackFriday.getUTCDay() >= 1 && blackFriday.getUTCDay() <= 5) set.add(dateKey(blackFriday));
  const christmasEve = utcDate(year, 12, 24);
  const christmas = utcDate(year, 12, 25);
  if (christmasEve.getUTCDay() >= 1 && christmasEve.getUTCDay() <= 5 && christmas.getUTCDay() >= 1 && christmas.getUTCDay() <= 5) {
    set.add(dateKey(christmasEve));
  }
  EARLY_CACHE.set(year, set);
  return set;
}

export function isTradingDay(dt) {
  const wd = dt.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  const y = dt.getUTCFullYear();
  const key = dateKey(dt);
  return !holidays(y - 1).has(key) && !holidays(y).has(key) && !holidays(y + 1).has(key);
}

export function nextTradingDay(dt) {
  let d = addDays(dt, 1);
  for (let i = 0; i < 30; i += 1) {
    if (isTradingDay(d)) return d;
    d = addDays(d, 1);
  }
  return d;
}

export function sessionBounds(y, m, d) {
  const key = dateKey(utcDate(y, m, d));
  const early = earlyCloses(y).has(key);
  const closeMin = early ? 13 * 60 : 16 * 60;
  return {
    early,
    open: etWallToUtc(y, m, d, 9, 30),
    close: etWallToUtc(y, m, d, Math.floor(closeMin / 60), closeMin % 60),
  };
}

const LABELS = {
  open: 'Market open',
  pre: 'Pre-market',
  after: 'After hours',
  closed: 'Market closed',
  weekend: 'Weekend',
  holiday: 'Market holiday',
};

export function marketStatus(now = new Date()) {
  const et = nowET(now);
  const d = utcDate(et.year, et.month, et.day);
  const mins = et.hour * 60 + et.minute + et.second / 60;
  const trading = isTradingDay(d);
  const early = trading && earlyCloses(et.year).has(et.date);
  const openMin = 570;
  const closeMin = early ? 780 : 960;

  let state = 'closed';
  if (!trading) {
    state = d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 'weekend' : 'holiday';
  } else if (mins < 240) {
    state = 'closed';
  } else if (mins < openMin) {
    state = 'pre';
  } else if (mins < closeMin) {
    state = 'open';
  } else if (mins < 1200) {
    state = 'after';
  }

  const today = trading ? sessionBounds(et.year, et.month, et.day) : null;
  const nextDate = trading && mins < openMin ? d : nextTradingDay(d);
  const next = sessionBounds(nextDate.getUTCFullYear(), nextDate.getUTCMonth() + 1, nextDate.getUTCDate());

  return {
    state,
    label: LABELS[state],
    date: et.date,
    nowEt: `${pad2(et.hour)}:${pad2(et.minute)}:${pad2(et.second)}`,
    nowEtShort: `${pad2(et.hour)}:${pad2(et.minute)}`,
    weekday: et.weekday,
    tradingDay: trading,
    earlyClose: early,
    openAt: today ? today.open.getTime() : null,
    closeAt: today ? today.close.getTime() : null,
    nextOpenAt: next.open.getTime(),
    nextOpenEarly: next.early,
    minutesToOpen: state === 'open' ? null : Math.max(0, Math.round((next.open.getTime() - now.getTime()) / MIN)),
    minutesToClose: state === 'open' && today ? Math.max(0, Math.round((today.close.getTime() - now.getTime()) / MIN)) : null,
    minutesFromOpen: state === 'open' && today ? Math.max(0, Math.round((now.getTime() - today.open.getTime()) / MIN)) : null,
  };
}

const BAR_CLASS_CACHE = new Map();
export function classifyBar(tEpoch) {
  if (BAR_CLASS_CACHE.has(tEpoch)) return BAR_CLASS_CACHE.get(tEpoch);
  const et = nowET(new Date(tEpoch * 1000));
  const d = utcDate(et.year, et.month, et.day);
  const mins = et.hour * 60 + et.minute;
  const trading = isTradingDay(d);
  const early = trading && earlyCloses(et.year).has(et.date);
  const closeMin = early ? 780 : 960;
  let session = 'closed';
  if (trading && mins >= 570 && mins < closeMin) session = 'regular';
  else if (trading && mins >= 240 && mins < 570) session = 'pre';
  else if (trading && mins >= closeMin && mins < 1200) session = 'after';
  const result = { d: et.date, mins, session };
  if (BAR_CLASS_CACHE.size > 12000) BAR_CLASS_CACHE.clear();
  BAR_CLASS_CACHE.set(tEpoch, result);
  return result;
}

/* ----------------------------------------------------------------------------
   Indicators
   -------------------------------------------------------------------------- */
export function emaSeries(values, n) {
  if (!values.length) return [];
  const k = 2 / (n + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i += 1) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}
export function ema(values, n) {
  const s = emaSeries(values, n);
  return s.length ? s[s.length - 1] : 0;
}
export function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
export function rsi(closes, n = 14) {
  if (closes.length < n + 1) return 50;
  const start = Math.max(1, closes.length - Math.max(n * 4, 80));
  let gain = 0;
  let loss = 0;
  for (let i = start; i < start + n && i < closes.length; i += 1) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) gain += ch;
    else loss -= ch;
  }
  let ag = gain / n;
  let al = loss / n;
  for (let i = start + n; i < closes.length; i += 1) {
    const ch = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(ch, 0)) / n;
    al = (al * (n - 1) + Math.max(-ch, 0)) / n;
  }
  if (al === 0) return ag === 0 ? 50 : 100;
  return 100 - 100 / (1 + ag / al);
}
export function atr(bars, n = 14) {
  if (bars.length < 2) return 0;
  const start = Math.max(1, bars.length - n);
  let sum = 0;
  let count = 0;
  for (let i = start; i < bars.length; i += 1) {
    const b = bars[i];
    const pc = bars[i - 1].c;
    sum += Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    count += 1;
  }
  return count ? sum / count : 0;
}
export function vwap(bars) {
  let pv = 0;
  let vol = 0;
  for (const b of bars) {
    const typical = (b.h + b.l + b.c) / 3;
    pv += typical * b.v;
    vol += b.v;
  }
  if (vol > 0) return pv / vol;
  return bars.length ? bars[bars.length - 1].c : 0;
}
export function bollinger(closes, n = 20, k = 2) {
  if (closes.length < n) {
    const m = mean(closes);
    return { mid: m, sd: 0, upper: m, lower: m };
  }
  const win = closes.slice(-n);
  const mid = mean(win);
  const sd = Math.sqrt(mean(win.map((v) => (v - mid) ** 2)));
  return { mid, sd, upper: mid + k * sd, lower: mid - k * sd };
}
export function relVolume(bars, n = 20) {
  if (bars.length < 2) return 1;
  const prior = bars.slice(Math.max(0, bars.length - n - 1), bars.length - 1).map((b) => b.v);
  const avg = mean(prior);
  return avg > 0 ? bars[bars.length - 1].v / avg : 1;
}

/* ----------------------------------------------------------------------------
   Strategy evaluation
   bars        = warm-up context (previous session tail + today's regular bars)
   sessionBars = today's regular-session bars (used for VWAP)
   Returns an array of setups sorted by score, best first.
   -------------------------------------------------------------------------- */
export function evaluate(bars, enabled = STRATEGY_IDS, sessionBars = null) {
  if (!Array.isArray(bars) || bars.length < 25) return [];
  const last = bars[bars.length - 1];
  if (!last || !(last.c > 0)) return [];
  const closes = bars.map((b) => b.c);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const ema50 = ema(closes, 50);
  const strength = rsi(closes, 14);
  const atr14 = atr(bars, 14);
  const session = sessionBars && sessionBars.length >= 2 ? sessionBars : bars.slice(-390);
  const sessionVwap = vwap(session);
  const prevSessionClose = session.length >= 2 ? session[session.length - 2].c : last.c;
  const prior = bars.slice(-21, -1);
  const resistance = Math.max(...prior.map((b) => b.h));
  const support = Math.min(...prior.map((b) => b.l));
  const relvol = relVolume(bars, 20);
  const bb = bollinger(closes, 20, 2);
  const o = last.o;
  const h = last.h;
  const l = last.l;
  const c = last.c;
  const range = Math.max(h - l, 1e-9);
  const body = c - o;
  const bodyRatio = Math.abs(body) / range;
  const bullish = body > 0;
  const bearish = body < 0;
  const trendUp = ema9 > ema21 && ema21 > ema50;
  const trendDown = ema9 < ema21 && ema21 < ema50;
  const flat = ema21 > 0 ? Math.abs(ema9 / ema21 - 1) < 0.0035 : false;
  const volOk = relvol >= 0.6;
  const atrPct = c > 0 ? atr14 / c : 0;
  if (atrPct > 0.05) return []; // too chaotic to size safely

  const setups = [];
  const add = (id, score, reason) => {
    if (!enabled.includes(id)) return;
    setups.push({
      id,
      side: STRATEGY_MAP[id].side,
      score: Math.round(clamp(score, 0, 99)),
      reason,
      atr: atr14,
      vwap: sessionVwap,
      relvol,
      rsi: strength,
    });
  };

  /* ---- LONG: trend pullback ---- */
  if (
    trendUp &&
    c > ema21 &&
    l <= Math.max(ema9, ema21) * 1.0015 &&
    c > ema9 &&
    bullish &&
    strength >= 45 &&
    strength <= 74 &&
    volOk
  ) {
    const score = 62 + (strength - 45) * 0.5 + Math.min(relvol, 2) * 4 + (bodyRatio > 0.5 ? 5 : 0) + (c > ema9 ? 3 : 0);
    add('trend_long', score, `Uptrend pullback · RSI ${Math.round(strength)} · ${relvol.toFixed(1)}× vol`);
  }

  /* ---- LONG: breakout ---- */
  if (c > resistance && bodyRatio > 0.35 && relvol >= 1.3 && strength < 82) {
    const score = 64 + Math.min(relvol, 3.2) * 7 + bodyRatio * 8;
    add('breakout_long', score, `New 20-bar high · ${relvol.toFixed(1)}× vol · RSI ${Math.round(strength)}`);
  }

  /* ---- LONG: VWAP reclaim ---- */
  if (sessionVwap > 0 && prevSessionClose < sessionVwap && c > sessionVwap && relvol >= 1.0 && strength < 76) {
    const score = 63 + Math.min(relvol, 3) * 6 + (c > ema9 ? 4 : 0);
    add('vwap_long', score, `Reclaimed VWAP ${sessionVwap.toFixed(2)} · ${relvol.toFixed(1)}× vol`);
  }

  /* ---- LONG: oversold lower-band reclaim ---- */
  if (bb.sd > 0 && l <= bb.lower && c > bb.lower && c < bb.mid * 1.001 && strength < 36 && flat && bullish) {
    const score = 62 + (36 - strength) * 0.9 + (c > bb.lower ? 4 : 0);
    add('reversion_long', score, `Lower-band reclaim · RSI ${Math.round(strength)} · flat trend`);
  }

  /* ---- SHORT: downtrend rally ---- */
  if (
    trendDown &&
    c < ema21 &&
    h >= Math.min(ema9, ema21) * 0.9985 &&
    c < ema9 &&
    bearish &&
    strength >= 26 &&
    strength <= 55 &&
    volOk
  ) {
    const score = 62 + (55 - strength) * 0.5 + Math.min(relvol, 2) * 4 + (bodyRatio > 0.5 ? 5 : 0) + (c < ema9 ? 3 : 0);
    add('trend_short', score, `Downtrend rally · RSI ${Math.round(strength)} · ${relvol.toFixed(1)}× vol`);
  }

  /* ---- SHORT: breakdown ---- */
  if (c < support && bodyRatio > 0.35 && bearish && relvol >= 1.3 && strength > 18) {
    const score = 64 + Math.min(relvol, 3.2) * 7 + bodyRatio * 8;
    add('breakdown_short', score, `New 20-bar low · ${relvol.toFixed(1)}× vol · RSI ${Math.round(strength)}`);
  }

  /* ---- SHORT: VWAP rejection ---- */
  if (sessionVwap > 0 && prevSessionClose > sessionVwap && c < sessionVwap && relvol >= 1.0 && strength > 24) {
    const score = 63 + Math.min(relvol, 3) * 6 + (c < ema9 ? 4 : 0);
    add('vwap_short', score, `Rejected at VWAP ${sessionVwap.toFixed(2)} · ${relvol.toFixed(1)}× vol`);
  }

  /* ---- SHORT: overbought upper-band rejection ---- */
  if (bb.sd > 0 && h >= bb.upper && c < bb.upper && c > bb.mid * 0.999 && strength > 64 && flat && bearish) {
    const score = 62 + (strength - 64) * 0.9 + (c < bb.upper ? 4 : 0);
    add('reversion_short', score, `Upper-band rejection · RSI ${Math.round(strength)} · flat trend`);
  }

  setups.sort((a, b) => b.score - a.score);
  return setups;
}

/* ----------------------------------------------------------------------------
   Portfolio accounting
   Long : cash -= entry*qty on open, cash += exit*qty on close
   Short: cash += entry*qty on open, cash -= exit*qty on close
   Equity = cash + long market value - short market value
   -------------------------------------------------------------------------- */
export function newPortfolio(initial = 100000) {
  return {
    initial,
    cash: initial,
    positions: {},
    realized: 0,
    trades: [],
    equity: [],
    dayKey: '',
    dayStartEquity: initial,
    dayTrades: 0,
    tradeSeq: 0,
    lastExit: {},
  };
}

export function positionPnl(p, mark) {
  return p.side === 'LONG' ? (mark - p.entry) * p.qty : (p.entry - mark) * p.qty;
}

export function equityOf(pf, marks = {}) {
  let eq = pf.cash;
  for (const [sym, p] of Object.entries(pf.positions)) {
    const mark = Number.isFinite(marks[sym]) ? marks[sym] : p.mark ?? p.entry;
    eq += p.side === 'LONG' ? p.qty * mark : -p.qty * mark;
  }
  return eq;
}

export function openPnl(pf, marks = {}) {
  let pnl = 0;
  for (const [sym, p] of Object.entries(pf.positions)) {
    const mark = Number.isFinite(marks[sym]) ? marks[sym] : p.mark ?? p.entry;
    pnl += positionPnl(p, mark);
  }
  return pnl;
}

export function metricsOf(pf, marks = {}) {
  const equity = equityOf(pf, marks);
  const closes = pf.trades.filter((t) => t.action === 'CLOSE');
  const wins = closes.filter((t) => t.pnl > 0);
  const losses = closes.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);
  let peak = pf.initial;
  let maxDD = 0;
  for (const p of pf.equity) {
    peak = Math.max(peak, p.value);
    if (peak > 0) maxDD = Math.max(maxDD, 1 - p.value / peak);
  }
  return {
    equity,
    pnl: equity - pf.initial,
    pnlPct: pf.initial ? (equity / pf.initial - 1) * 100 : 0,
    realized: pf.realized,
    openPnl: openPnl(pf, marks),
    cash: pf.cash,
    closed: closes.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closes.length ? wins.length / closes.length : null,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : null,
    maxDD,
    dayPnl: equity - pf.dayStartEquity,
    dayPnlPct: pf.dayStartEquity ? (equity / pf.dayStartEquity - 1) * 100 : 0,
  };
}

/* ----------------------------------------------------------------------------
   Defaults
   -------------------------------------------------------------------------- */
export function defaultState() {
  const now = Date.now();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    running: false,
    settings: { ...DEFAULT_SETTINGS, strategies: [...STRATEGY_IDS] },
    watchlist: DEFAULT_WATCHLIST.map(([symbol, name]) => ({
      symbol,
      name,
      enabled: true,
      addedAt: now,
    })),
    portfolio: newPortfolio(DEFAULT_SETTINGS.startingEquity),
    logs: [],
  };
}

export function newTrade(pf, fields) {
  pf.tradeSeq += 1;
  return {
    id: pf.tradeSeq,
    t: Date.now(),
    ...fields,
  };
}

export function addLog(state, kind, title, body = '', symbol = '') {
  state.logs.unshift({ t: Date.now(), kind, title, body, symbol });
  if (state.logs.length > 300) state.logs.length = 300;
}
