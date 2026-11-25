/* ============================================================================
   YANAI TRADING — market.js
   Live market data from CNBC's public quote + chart endpoints.
   Both endpoints send Access-Control-Allow-Origin: * so this works from a
   static site such as GitHub Pages with no backend and no API key.

   Quotes : one batched request for the whole watchlist.
   Bars   : 1-minute OHLCV history (includes pre/post; the app filters to the
            regular session).
   ========================================================================== */

const QUOTE_ENDPOINT =
  'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol';
const CHART_ENDPOINT = 'https://ts-api.cnbc.com/harmony/app/charts/1D.json';

const QUOTE_TTL = 4000;
const BAR_TTL = 40000;

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const cleaned = String(value).replace(/[,$%\s]/g, '');
  if (!cleaned || cleaned === '--' || cleaned === 'N/A') return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function parseQuote(raw) {
  const symbol = String(raw.symbol || '').toUpperCase();
  if (!symbol) return null;
  const last = toNumber(raw.last);
  const prevClose = toNumber(raw.previous_day_closing) || toNumber(raw.previous_close) || toNumber(raw.prevClose);
  const ext = raw.ExtendedMktQuote || null;
  const extPrice = ext ? toNumber(ext.last) : 0;
  const statusRaw = String(raw.curmktstatus || '').toUpperCase();
  const status =
    statusRaw === 'REG_MKT' ? 'open' : statusRaw === 'PRE_MKT' ? 'pre' : statusRaw === 'POST_MKT' ? 'after' : 'closed';

  // During pre/post market the regular "last" is the prior close. Show the
  // extended print for display, but the trading engine only acts in regular hours.
  const useExtended = (status === 'pre' || status === 'after') && extPrice > 0;
  const price = useExtended ? extPrice : last > 0 ? last : prevClose;
  const change = prevClose > 0 ? price - prevClose : 0;
  const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

  return {
    symbol,
    name: raw.name || raw.shortName || symbol,
    price,
    regularPrice: last > 0 ? last : prevClose,
    prevClose,
    change,
    changePct,
    open: toNumber(raw.open),
    high: toNumber(raw.high),
    low: toNumber(raw.low),
    volume: toNumber(raw.volume),
    status,
    extended: useExtended,
    extendedPrice: extPrice,
    extendedChangePct: ext ? toNumber(ext.change_pct) : 0,
    at: Date.now(),
  };
}

function parseBars(raw) {
  const rows = raw?.barData?.priceBars;
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    const t = Math.floor(toNumber(row.tradeTimeinMills) / 1000);
    const o = toNumber(row.open);
    const h = toNumber(row.high);
    const l = toNumber(row.low);
    const c = toNumber(row.close);
    const v = toNumber(row.volume);
    if (!t || !(o > 0) || !(h > 0) || !(l > 0) || !(c > 0)) continue;
    if (h < Math.max(o, c) - 1e-6 || l > Math.min(o, c) + 1e-6) continue;
    out.push({ t, o, h, l, c, v: v > 0 ? v : 0 });
  }
  out.sort((a, b) => a.t - b.t);
  const deduped = [];
  for (const bar of out) {
    if (deduped.length && deduped[deduped.length - 1].t === bar.t) deduped[deduped.length - 1] = bar;
    else deduped.push(bar);
  }
  return deduped;
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Market data responded ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('Market data request timed out');
    if (err && err.message && err.message.startsWith('Market data responded')) throw err;
    throw new Error('Could not reach the market data feed');
  } finally {
    clearTimeout(timer);
  }
}

export class MarketFeed {
  constructor() {
    this.quoteCache = new Map();
    this.barCache = new Map();
    this.quoteInflight = new Map();
    this.barInflight = new Map();
    this.errors = [];
    this.lastQuoteAt = 0;
    this.lastBarAt = 0;
    this.source = 'CNBC';
  }

  noteError(kind, message) {
    this.errors.unshift({ t: Date.now(), kind, message: String(message || 'Unknown error') });
    if (this.errors.length > 8) this.errors.length = 8;
  }

  async quotes(symbols) {
    const list = [...new Set(symbols.map((s) => String(s).toUpperCase()).filter(Boolean))].slice(0, 30);
    if (!list.length) return {};
    const key = list.join(',');
    const now = Date.now();
    const cached = list.every((s) => this.quoteCache.get(s) && now - this.quoteCache.get(s).at < QUOTE_TTL);
    if (cached) return Object.fromEntries(list.map((s) => [s, this.quoteCache.get(s)]));
    if (this.quoteInflight.has(key)) return this.quoteInflight.get(key);

    const url = `${QUOTE_ENDPOINT}?symbols=${encodeURIComponent(list.join('|'))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json&events=1`;
    const task = (async () => {
      try {
        const data = await fetchWithTimeout(url, 15000);
        const rows = data?.FormattedQuoteResult?.FormattedQuote;
        if (!Array.isArray(rows)) throw new Error('Unexpected quote response');
        const out = {};
        for (const row of rows) {
          const parsed = parseQuote(row);
          if (!parsed) continue;
          this.quoteCache.set(parsed.symbol, parsed);
          out[parsed.symbol] = parsed;
        }
        if (!Object.keys(out).length) throw new Error('No quotes returned');
        this.lastQuoteAt = Date.now();
        return out;
      } catch (err) {
        this.noteError('quote', err.message);
        throw err;
      } finally {
        this.quoteInflight.delete(key);
      }
    })();
    this.quoteInflight.set(key, task);
    return task;
  }

  async bars(symbol, { force = false } = {}) {
    const sym = String(symbol).toUpperCase();
    const now = Date.now();
    const cached = this.barCache.get(sym);
    if (!force && cached && now - cached.at < BAR_TTL) return cached.bars;
    if (this.barInflight.has(sym)) return this.barInflight.get(sym);

    const url = `${CHART_ENDPOINT}?symbol=${encodeURIComponent(sym)}&events=0&lang=en-US`;
    const task = (async () => {
      try {
        const data = await fetchWithTimeout(url, 20000);
        const bars = parseBars(data);
        if (!bars.length) throw new Error('No price bars returned');
        this.barCache.set(sym, { at: Date.now(), bars });
        this.lastBarAt = Date.now();
        return bars;
      } catch (err) {
        this.noteError('bar', `${sym}: ${err.message}`);
        throw err;
      } finally {
        this.barInflight.delete(sym);
      }
    })();
    this.barInflight.set(sym, task);
    return task;
  }

  async refreshBars(symbols, { force = false, concurrency = 3 } = {}) {
    const list = [...new Set(symbols.map((s) => String(s).toUpperCase()).filter(Boolean))];
    const results = {};
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, list.length) }, async () => {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        const sym = list[index];
        try {
          results[sym] = await this.bars(sym, { force });
        } catch {
          /* recorded in this.errors */
        }
      }
    });
    await Promise.all(workers);
    return results;
  }

  cachedQuote(symbol) {
    return this.quoteCache.get(String(symbol).toUpperCase()) || null;
  }

  cachedBars(symbol) {
    return this.barCache.get(String(symbol).toUpperCase())?.bars || null;
  }

  clearSymbol(symbol) {
    const sym = String(symbol).toUpperCase();
    this.quoteCache.delete(sym);
    this.barCache.delete(sym);
  }
}
