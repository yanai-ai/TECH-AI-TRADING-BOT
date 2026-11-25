/* ============================================================================
   YANAI TRADING — bot.js
   The trader. Turns live CNBC bars + quotes into paper orders.

   Safety model
     · New entries only during the regular session, and only while running.
     · Stops, targets and trailing stops are managed even when paused.
     · Optional end-of-day flatten a few minutes before the bell.
     · Risk-based sizing, per-name allocation cap, gross leverage cap,
       daily loss limit, daily trade limit and per-symbol cooldowns.
   ========================================================================== */

import {
  marketStatus,
  classifyBar,
  evaluate,
  ema,
  equityOf,
  metricsOf,
  addLog,
  newTrade,
  validSymbol,
  STRATEGY_MAP,
} from './engine.js';
import { MarketFeed } from './market.js';
import { saveState } from './store.js';

const OPEN_TICK_MS = 6000;
const IDLE_TICK_MS = 30000;
const EQUITY_SAMPLE_MS = 60000;
const PERSIST_MS = 15000;
const EOD_FLATTEN_MIN = 5;
const BAR_STALE_MS = 60000;
const BAR_STALE_IDLE_MS = 900000;

const round2 = (n) => Math.round(n * 100) / 100;

function usd(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/* Split CNBC's mixed pre/regular/after bars into warm-up + today's session. */
function regularSeries(bars, todayKey) {
  const reg = [];
  for (const b of bars) {
    const cls = classifyBar(b.t);
    if (cls.session === 'regular') reg.push({ ...b, d: cls.d });
  }
  const session = reg.filter((b) => b.d === todayKey);
  const prior = reg.filter((b) => b.d !== todayKey).slice(-120);
  return { session, combined: [...prior, ...session] };
}

export class Bot {
  constructor(state, { onChange } = {}) {
    this.state = state;
    this.onChange = onChange || (() => {});
    this.feed = new MarketFeed();
    this.timer = null;
    this.busy = false;
    this.stopped = false;
    this.quotes = {};
    this.bars = {};
    this.signals = {};
    this.regime = null;
    this.status = marketStatus();
    this.lastSample = 0;
    this.lastPersist = 0;
    this.halted = { day: '', reasons: new Set() };
  }

  /* ---------------------------------------------------------------- lifecycle */

  async boot() {
    this.state.running = this.state.settings.autoStart === true;
    const pf = this.state.portfolio;
    if (!pf.equity.length) {
      pf.equity.push({ t: Date.now() - 60000, value: round2(equityOf(pf, this.marks())) });
    }
    await this.safeTick();
    this.schedule();
  }

  schedule() {
    if (this.stopped) return;
    clearTimeout(this.timer);
    const live = this.status.state === 'open';
    this.timer = setTimeout(() => this.run(), live ? OPEN_TICK_MS : IDLE_TICK_MS);
  }

  async run() {
    await this.safeTick();
    this.schedule();
  }

  async safeTick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.tick();
    } catch (err) {
      this.feed.noteError('engine', err && err.message ? err.message : String(err));
    } finally {
      this.busy = false;
      this.lastSample = this.lastSample || 0;
      this.emit();
      this.persist();
    }
  }

  start() {
    if (this.state.running) return;
    this.state.running = true;
    addLog(this.state, 'info', 'Bot armed', 'Scanning the watchlist for setups. Stops and targets stay active while paused.');
    this.persist(true);
    this.emit();
  }

  pause() {
    if (!this.state.running) return;
    this.state.running = false;
    addLog(this.state, 'info', 'Bot paused', 'No new entries. Open positions are still protected by their stops.');
    this.persist(true);
    this.emit();
  }

  toggle() {
    if (this.state.running) this.pause();
    else this.start();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  emit() {
    try {
      this.onChange();
    } catch {
      /* the UI must never break the loop */
    }
  }

  persist(force = false) {
    const now = Date.now();
    if (!force && now - this.lastPersist < PERSIST_MS) return;
    this.lastPersist = now;
    saveState(this.state);
  }

  /* ------------------------------------------------------------------- data */

  activeSymbols() {
    const set = new Set();
    for (const w of this.state.watchlist) if (w.enabled) set.add(w.symbol);
    for (const sym of Object.keys(this.state.portfolio.positions)) set.add(sym);
    return [...set];
  }

  displaySymbols() {
    const set = new Set(this.activeSymbols());
    for (const w of this.state.watchlist) set.add(w.symbol);
    return [...set].slice(0, 30);
  }

  marks() {
    const out = {};
    for (const [sym, p] of Object.entries(this.state.portfolio.positions)) {
      const q = this.quotes[sym];
      const px = q && q.regularPrice > 0 ? q.regularPrice : p.mark || p.entry;
      if (px > 0) out[sym] = px;
    }
    return out;
  }

  grossExposure() {
    let gross = 0;
    for (const [sym, p] of Object.entries(this.state.portfolio.positions)) {
      const mark = this.marks()[sym] ?? p.mark ?? p.entry;
      gross += Math.abs(p.qty * mark);
    }
    return gross;
  }

  async refreshBars(targets) {
    const now = Date.now();
    const live = this.status.state === 'open';
    const stale = targets.filter((sym) => {
      const cached = this.feed.barCache.get(sym);
      if (!cached) return true;
      return now - cached.at > (live ? BAR_STALE_MS : BAR_STALE_IDLE_MS);
    });
    if (!stale.length) return;

    const held = new Set(Object.keys(this.state.portfolio.positions));
    stale.sort((a, b) => Number(held.has(b)) - Number(held.has(a)));
    const batch = stale.slice(0, live ? 4 : 6);
    await this.feed.refreshBars(batch, { concurrency: 2 });
    for (const sym of targets) {
      const cached = this.feed.cachedBars(sym);
      if (cached) this.bars[sym] = cached;
    }
  }

  updateRegime() {
    const spy = this.bars.SPY;
    if (!spy || spy.length < 60) {
      this.regime = null;
      return;
    }
    const { combined } = regularSeries(spy, this.status.date);
    if (combined.length < 60) {
      this.regime = null;
      return;
    }
    const closes = combined.map((b) => b.c);
    const e9 = ema(closes, 9);
    const e21 = ema(closes, 21);
    const e50 = ema(closes, 50);
    const last = closes[closes.length - 1];
    const bias = e9 > e21 && e21 > e50 ? 'up' : e9 < e21 && e21 < e50 ? 'down' : 'flat';
    this.regime = { bias, e9, e21, e50, last };
  }

  updateSignals() {
    const today = this.status.date;
    const settings = this.state.settings;
    const signals = {};
    for (const sym of this.activeSymbols()) {
      const raw = this.bars[sym];
      if (!raw || raw.length < 30) continue;
      const { session, combined } = regularSeries(raw, today);
      if (!session.length) continue;
      const setups = evaluate(combined, settings.strategies, session);
      signals[sym] = { setups, session, combined, at: Date.now() };
    }
    this.signals = signals;
  }

  /* -------------------------------------------------------------------- tick */

  async tick() {
    const state = this.state;
    const pf = state.portfolio;
    this.status = marketStatus();
    const status = this.status;

    const display = this.displaySymbols();
    if (display.length) {
      try {
        const quotes = await this.feed.quotes(display);
        Object.assign(this.quotes, quotes);
      } catch {
        /* recorded inside the feed */
      }
    }

    const barTargets = [...new Set([...this.activeSymbols(), 'SPY'])];
    for (const sym of barTargets) {
      const cached = this.feed.cachedBars(sym);
      if (cached) this.bars[sym] = cached;
    }
    if (barTargets.length) await this.refreshBars(barTargets);

    this.updateRegime();
    this.updateSignals();
    this.rolloverDay();
    this.markPositions();

    this.manageExits();
    if (state.running && status.state === 'open') this.manageEntries();

    const now = Date.now();
    if (!this.lastSample) this.lastSample = now - EQUITY_SAMPLE_MS;
    if (now - this.lastSample >= EQUITY_SAMPLE_MS) {
      this.lastSample = now;
      pf.equity.push({ t: now, value: round2(equityOf(pf, this.marks())) });
      if (pf.equity.length > 5000) pf.equity.splice(0, pf.equity.length - 5000);
    }
  }

  /* ------------------------------------------------------------- accounting */

  rolloverDay() {
    const pf = this.state.portfolio;
    const key = this.status.date;
    if (pf.dayKey === key) return;
    const first = !pf.dayKey;
    pf.dayKey = key;
    pf.dayStartEquity = round2(equityOf(pf, this.marks()));
    pf.dayTrades = 0;
    pf.lastExit = {};
    this.halted = { day: key, reasons: new Set() };
    if (!first && this.status.tradingDay) {
      addLog(
        this.state,
        'info',
        'New trading session',
        `${key} · starting equity ${usd(pf.dayStartEquity)}`,
      );
    }
  }

  markPositions() {
    const pf = this.state.portfolio;
    for (const [sym, p] of Object.entries(pf.positions)) {
      const q = this.quotes[sym];
      let mark = q && q.regularPrice > 0 ? q.regularPrice : null;
      if (!mark) {
        const bars = this.bars[sym];
        mark = bars && bars.length ? bars[bars.length - 1].c : p.mark || p.entry;
      }
      if (!(mark > 0)) continue;
      p.mark = round2(mark);
      p.high = round2(Math.max(Number(p.high) || mark, mark));
      p.low = round2(Math.min(Number(p.low) || mark, mark));
    }
  }

  noteHalt(reason) {
    const day = this.status.date;
    if (this.halted.day !== day) this.halted = { day, reasons: new Set() };
    if (this.halted.reasons.has(reason)) return;
    this.halted.reasons.add(reason);
    addLog(this.state, 'warn', 'New entries stopped', reason);
  }

  /* ------------------------------------------------------------------- exits */

  manageExits() {
    const state = this.state;
    const pf = state.portfolio;
    const settings = state.settings;
    const status = this.status;
    if (status.state !== 'open') return;

    const eod =
      settings.eodMode === 'close' &&
      status.minutesToClose !== null &&
      status.minutesToClose <= EOD_FLATTEN_MIN;

    for (const sym of Object.keys(pf.positions)) {
      const p = pf.positions[sym];
      if (!p) continue;
      const mark = p.mark > 0 ? p.mark : p.entry;
      const risk = p.risk > 0 ? p.risk : Math.abs(p.entry - p.stop);

      /* Trailing stop: only once the trade has earned trailTriggerR. */
      if (risk > 0) {
        const favorable = p.side === 'LONG' ? p.high - p.entry : p.entry - p.low;
        if (favorable >= settings.trailTriggerR * risk) {
          const trail = settings.trailPct / 100;
          if (p.side === 'LONG') {
            const next = round2(p.high * (1 - trail));
            if (next > p.stop + 0.005) {
              p.stop = next;
              addLog(state, 'info', `${sym} stop raised`, `Trailing stop moved to ${usd(next)}`, sym);
            }
          } else {
            const next = round2(p.low * (1 + trail));
            if (next < p.stop - 0.005) {
              p.stop = next;
              addLog(state, 'info', `${sym} stop lowered`, `Trailing stop moved to ${usd(next)}`, sym);
            }
          }
        }
      }

      if (eod) {
        this.closePosition(sym, 'End of day flatten', mark);
        continue;
      }

      if (p.side === 'LONG') {
        if (mark <= p.stop) this.closePosition(sym, 'Stop loss', mark);
        else if (mark >= p.target) this.closePosition(sym, 'Target reached', p.target);
      } else {
        if (mark >= p.stop) this.closePosition(sym, 'Stop loss', mark);
        else if (mark <= p.target) this.closePosition(sym, 'Target reached', p.target);
      }
    }
  }

  closePosition(symbol, reason, priceRef) {
    const state = this.state;
    const pf = state.portfolio;
    const p = pf.positions[symbol];
    if (!p) return null;
    const raw = Number(priceRef) > 0 ? Number(priceRef) : p.mark || p.entry;
    const slip = state.settings.slippageBps / 10000;
    const price = round2(p.side === 'LONG' ? raw * (1 - slip) : raw * (1 + slip));

    pf.cash = round2(pf.cash + (p.side === 'LONG' ? price * p.qty : -price * p.qty));
    const pnl = round2(p.side === 'LONG' ? (price - p.entry) * p.qty : (p.entry - price) * p.qty);
    pf.realized = round2(pf.realized + pnl);
    pf.lastExit[symbol] = Date.now();

    const cost = p.entry * p.qty;
    pf.trades.unshift(
      newTrade(pf, {
        action: 'CLOSE',
        symbol,
        side: p.side,
        qty: p.qty,
        entry: p.entry,
        price,
        notional: round2(price * p.qty),
        pnl,
        pnlPct: cost > 0 ? round2((pnl / cost) * 100) : 0,
        reason,
        strategy: p.strategy,
        openedAt: p.openedAt,
        heldMs: Date.now() - p.openedAt,
      }),
    );
    if (pf.trades.length > 2000) pf.trades.length = 2000;

    delete pf.positions[symbol];
    addLog(
      state,
      pnl >= 0 ? 'win' : 'loss',
      `${symbol} ${p.side === 'LONG' ? 'long' : 'short'} closed`,
      `${reason} · ${usd(pnl)} · ${price.toFixed(2)}`,
      symbol,
    );
    this.persist(true);
    return pnl;
  }

  closeAll(reason = 'Manual close all') {
    const syms = Object.keys(this.state.portfolio.positions);
    for (const sym of syms) {
      const p = this.state.portfolio.positions[sym];
      this.closePosition(sym, reason, p ? p.mark || p.entry : null);
    }
    this.emit();
  }

  /* ------------------------------------------------------------------ entries */

  manageEntries() {
    const state = this.state;
    const pf = state.portfolio;
    const settings = state.settings;
    const status = this.status;

    if (status.minutesToClose !== null && status.minutesToClose <= settings.entryCutoffMin) return;
    if (status.minutesFromOpen !== null && status.minutesFromOpen < settings.minBars) return;

    const metrics = metricsOf(pf, this.marks());
    if (metrics.dayPnlPct <= -settings.dailyLossPct) {
      this.noteHalt(`Daily loss limit hit (${metrics.dayPnlPct.toFixed(2)}% vs -${settings.dailyLossPct}%).`);
      return;
    }
    if (pf.dayTrades >= settings.maxTradesPerDay) {
      this.noteHalt(`Daily trade limit reached (${settings.maxTradesPerDay} entries).`);
      return;
    }

    let slots = settings.maxPositions - Object.keys(pf.positions).length;
    if (slots <= 0) return;

    const candidates = [];
    for (const [sym, sig] of Object.entries(this.signals)) {
      if (pf.positions[sym]) continue;
      const watch = state.watchlist.find((w) => w.symbol === sym);
      if (!watch || !watch.enabled) continue;
      if (sig.session.length < settings.minBars) continue;
      const lastExit = pf.lastExit[sym];
      if (lastExit && Date.now() - lastExit < settings.cooldownMin * 60000) continue;

      for (const setup of sig.setups) {
        if (setup.score < settings.threshold) continue;
        if (setup.side === 'SHORT' && !settings.allowShorts) continue;
        if (settings.regimeFilter && this.regime) {
          if (this.regime.bias === 'up' && setup.side === 'SHORT') continue;
          if (this.regime.bias === 'down' && setup.side === 'LONG') continue;
        }
        const q = this.quotes[sym];
        const price =
          q && q.regularPrice > 0 ? q.regularPrice : sig.combined[sig.combined.length - 1]?.c;
        if (!(price > 0)) continue;
        candidates.push({ sym, setup, price });
      }
    }

    candidates.sort((a, b) => b.setup.score - a.setup.score);
    const seen = new Set();
    for (const cand of candidates) {
      if (slots <= 0) break;
      if (seen.has(cand.sym)) continue;
      seen.add(cand.sym);
      if (this.openPosition(cand.sym, cand.setup, cand.price)) slots -= 1;
    }
  }

  openPosition(symbol, setup, priceRef) {
    const state = this.state;
    const pf = state.portfolio;
    const settings = state.settings;
    const ref = Number(priceRef);
    if (!(ref > 0)) return false;

    const metrics = metricsOf(pf, this.marks());
    const equity = metrics.equity;
    if (!(equity > 0)) return false;

    const atrPart = setup.atr > 0 ? setup.atr * settings.atrMult : 0;
    const stopDist = Math.max(atrPart, ref * (settings.stopPct / 100));
    if (!(stopDist > 0)) return false;

    const slip = settings.slippageBps / 10000;
    const entry = round2(setup.side === 'LONG' ? ref * (1 + slip) : ref * (1 - slip));
    if (!(entry > 0)) return false;

    const riskDollars = equity * (settings.riskPct / 100);
    let qty = Math.floor(riskDollars / stopDist);
    qty = Math.min(qty, Math.floor((equity * (settings.maxAllocPct / 100)) / entry));
    const room = equity * settings.maxGrossLeverage - this.grossExposure();
    qty = Math.min(qty, Math.floor(room / entry));
    if (setup.side === 'LONG') qty = Math.min(qty, Math.floor(pf.cash / entry));
    if (qty < 1) return false;

    const stop = round2(setup.side === 'LONG' ? entry - stopDist : entry + stopDist);
    const target = round2(
      setup.side === 'LONG'
        ? entry + settings.targetR * stopDist
        : entry - settings.targetR * stopDist,
    );

    pf.cash = round2(pf.cash + (setup.side === 'LONG' ? -entry * qty : entry * qty));
    pf.dayTrades += 1;
    pf.positions[symbol] = {
      side: setup.side,
      qty,
      entry,
      stop,
      target,
      risk: round2(stopDist),
      high: entry,
      low: entry,
      mark: entry,
      openedAt: Date.now(),
      strategy: setup.id,
      reason: setup.reason,
      score: setup.score,
    };

    pf.trades.unshift(
      newTrade(pf, {
        action: 'OPEN',
        symbol,
        side: setup.side,
        qty,
        price: entry,
        notional: round2(entry * qty),
        reason: setup.reason,
        strategy: setup.id,
        score: setup.score,
      }),
    );
    if (pf.trades.length > 2000) pf.trades.length = 2000;

    addLog(
      state,
      'open',
      `${symbol} ${setup.side === 'LONG' ? 'long' : 'short'} opened`,
      `${qty} @ ${usd(entry)} · stop ${usd(stop)} · target ${usd(target)} · ${STRATEGY_MAP[setup.id]?.name || setup.id}`,
      symbol,
    );
    this.persist(true);
    return true;
  }

  /* ------------------------------------------------------------------ symbols */

  addSymbol(input) {
    const symbol = String(input || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!symbol) return { ok: false, error: 'Enter a ticker symbol.' };
    if (!validSymbol(symbol)) return { ok: false, error: `"${symbol}" is not a valid ticker.` };
    if (this.state.watchlist.some((w) => w.symbol === symbol)) {
      return { ok: false, error: `${symbol} is already on the watchlist.` };
    }
    if (this.state.watchlist.length >= 30) {
      return { ok: false, error: 'The watchlist is full (30 symbols).' };
    }
    this.state.watchlist.push({
      symbol,
      name: symbol,
      enabled: true,
      addedAt: Date.now(),
    });
    addLog(this.state, 'info', `${symbol} added`, 'Now scanning this symbol for setups.', symbol);
    this.persist(true);
    this.emit();

    this.feed
      .quotes([symbol])
      .then((quotes) => {
        const q = quotes[symbol];
        if (q && q.name) {
          const row = this.state.watchlist.find((w) => w.symbol === symbol);
          if (row) row.name = q.name;
          this.emit();
        }
      })
      .catch(() => {});

    this.feed
      .bars(symbol, { force: true })
      .then((bars) => {
        if (bars && bars.length) this.bars[symbol] = bars;
        this.emit();
      })
      .catch(() => {});

    return { ok: true };
  }

  removeSymbol(symbol) {
    const sym = String(symbol || '').toUpperCase();
    const before = this.state.watchlist.length;
    this.state.watchlist = this.state.watchlist.filter((w) => w.symbol !== sym);
    if (this.state.watchlist.length === before) return;
    this.feed.clearSymbol(sym);
    delete this.bars[sym];
    delete this.signals[sym];
    addLog(this.state, 'info', `${sym} removed`, 'No longer scanned for new setups.', sym);
    this.persist(true);
    this.emit();
  }

  toggleSymbol(symbol, enabled) {
    const row = this.state.watchlist.find((w) => w.symbol === symbol);
    if (!row) return;
    row.enabled = enabled === undefined ? !row.enabled : Boolean(enabled);
    this.persist(true);
    this.emit();
  }

  /* ------------------------------------------------------------------- view */

  snapshot() {
    const pf = this.state.portfolio;
    const marks = this.marks();
    return {
      status: this.status,
      quotes: this.quotes,
      signals: this.signals,
      regime: this.regime,
      marks,
      metrics: metricsOf(pf, marks),
      exposure: this.grossExposure(),
      errors: this.feed.errors.slice(0, 4),
      source: this.feed.source,
    };
  }
}
