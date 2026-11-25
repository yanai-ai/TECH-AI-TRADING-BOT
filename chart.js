/* ============================================================================
   YANAI TRADING — chart.js
   Canvas candlestick chart: candles, wicks, volume, EMA 9/21/50, session VWAP,
   open-position levels and a hover crosshair. No DOM writes.
   ========================================================================== */

import { emaSeries } from './engine.js';
import { etTime } from './format.js';

const C = {
  up: '#34d399',
  down: '#f87171',
  grid: 'rgba(255,255,255,0.05)',
  axis: '#5d6879',
  text: '#8b98ab',
  ema9: '#34d399',
  ema21: '#60a5fa',
  ema50: '#a78bfa',
  vwap: '#fbbf24',
  entry: 'rgba(233,238,247,0.7)',
  stop: '#f87171',
  target: '#34d399',
  volUp: 'rgba(52,211,153,0.26)',
  volDown: 'rgba(248,113,113,0.26)',
};

const priceFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const px = (v) => (Number.isFinite(v) ? priceFmt.format(v) : '—');
const hhmm = (t) => etTime(t * 1000).slice(0, 5);
const volLabel = (v) => {
  const n = Number(v) || 0;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
};

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Draw the candle chart.
 * @param {HTMLCanvasElement} canvas
 * @param {Array} bars already aggregated OHLCV bars
 * @param {{interval?: number, vwapLine?: number, position?: object|null, hover?: number|null}} opts
 * @returns {null | {count:number, slot:number, x0:number, firstT:number, lastT:number}}
 */
export function drawCandles(canvas, bars, opts = {}) {
  if (!canvas) return null;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w < 40 || h < 40) return null;

  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const data = (bars || []).filter((b) => b && b.c > 0 && b.h >= b.l);
  if (data.length < 2) return null;

  const axisW = 62;
  const timeH = 18;
  const gap = 8;
  const padL = 2;
  const plotW = w - axisW - padL;
  const volH = Math.max(26, Math.round((h - timeH) * 0.17));
  const priceTop = 8;
  const priceBottom = h - timeH - volH - gap;
  const priceH = priceBottom - priceTop;
  if (plotW < 50 || priceH < 40) return null;

  const perBar = opts.interval === 1 ? 4 : 5;
  const maxBars = Math.max(24, Math.floor(plotW / perBar));
  const view = data.slice(-maxBars);
  const startIndex = data.length - view.length;

  const closes = data.map((b) => b.c);
  const e9 = emaSeries(closes, 9).slice(startIndex);
  const e21 = emaSeries(closes, 21).slice(startIndex);
  const e50 = emaSeries(closes, 50).slice(startIndex);

  let min = Math.min(...view.map((b) => b.l));
  let max = Math.max(...view.map((b) => b.h));
  const extras = [opts.vwapLine, e9[e9.length - 1], e21[e21.length - 1], e50[e50.length - 1]];
  if (opts.position) extras.push(opts.position.entry, opts.position.stop, opts.position.target);
  for (const v of extras) {
    if (Number.isFinite(v) && v > 0) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  const span = Math.max(max - min, Math.max(max, 1) * 0.0015);
  min -= span * 0.045;
  max += span * 0.045;

  const slot = plotW / view.length;
  const X = (i) => padL + (i + 0.5) * slot;
  const Y = (v) => priceTop + (1 - (v - min) / (max - min)) * priceH;

  /* ---------------------------------------------------------------- price grid */
  ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i += 1) {
    const y = priceTop + (priceH * i) / 4;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y + 0.5);
    ctx.lineTo(padL + plotW, y + 0.5);
    ctx.stroke();
    ctx.fillStyle = C.axis;
    ctx.fillText(px(max - ((max - min) * i) / 4), padL + plotW + 8, y);
  }

  /* ------------------------------------------------------------------- volume */
  const volMax = Math.max(1, ...view.map((b) => b.v || 0));
  const bodyW = Math.max(1, Math.min(12, slot * 0.62));
  view.forEach((b, i) => {
    const x = X(i);
    const up = b.c >= b.o;
    const vh = ((b.v || 0) / volMax) * (volH - 2);
    ctx.fillStyle = up ? C.volUp : C.volDown;
    ctx.fillRect(x - bodyW / 2, h - timeH - vh, bodyW, vh);
  });

  /* ------------------------------------------------------------------- candles */
  view.forEach((b, i) => {
    const x = X(i);
    const up = b.c >= b.o;
    const color = b.c === b.o ? C.axis : up ? C.up : C.down;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, Y(b.h));
    ctx.lineTo(x, Y(b.l));
    ctx.stroke();

    const yo = Y(b.o);
    const yc = Y(b.c);
    const top = Math.min(yo, yc);
    const bh = Math.max(1, Math.abs(yc - yo));
    ctx.fillStyle = color;
    ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
  });

  /* ---------------------------------------------------------------------- time */
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.axis;
  const tickIdx = [...new Set([0, Math.floor((view.length - 1) / 3), Math.floor((2 * (view.length - 1)) / 3), view.length - 1])];
  for (const i of tickIdx) {
    const x = Math.max(padL + 16, Math.min(padL + plotW - 16, X(i)));
    ctx.fillText(hhmm(view[i].t), x, h - 4);
  }

  /* ------------------------------------------------------------------ EMA lines */
  const drawLine = (series, color, width = 1.25) => {
    ctx.beginPath();
    let started = false;
    series.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      const x = X(i);
      const y = Y(v);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  drawLine(e9, C.ema9);
  drawLine(e21, C.ema21);
  drawLine(e50, C.ema50);

  /* -------------------------------------------------------------------- VWAP */
  if (Number.isFinite(opts.vwapLine) && opts.vwapLine > min && opts.vwapLine < max) {
    const y = Y(opts.vwapLine);
    ctx.strokeStyle = C.vwap;
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.vwap;
    ctx.font = '9px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`VWAP ${px(opts.vwapLine)}`, padL + 4, Math.max(priceTop + 8, y - 5));
  }

  /* -------------------------------------------------------- position overlays */
  if (opts.position) {
    const tag = (value, color, label) => {
      if (!(Number.isFinite(value) && value > 0 && value >= min && value <= max)) return;
      const y = Y(value);
      ctx.strokeStyle = color;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = '9px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(label, padL + plotW - 4, y - 4);
      ctx.textAlign = 'left';
    };
    tag(opts.position.entry, C.entry, 'entry');
    tag(opts.position.stop, C.stop, 'stop');
    tag(opts.position.target, C.target, 'target');
  }

  /* ---------------------------------------------------------------- last price */
  const last = view[view.length - 1];
  const lastY = Math.max(priceTop + 7, Math.min(priceBottom - 7, Y(last.c)));
  ctx.strokeStyle = 'rgba(233,238,247,0.3)';
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(padL, lastY);
  ctx.lineTo(padL + plotW, lastY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = last.c >= last.o ? C.up : C.down;
  roundRect(ctx, padL + plotW + 3, lastY - 8, axisW - 7, 16, 3);
  ctx.fill();
  ctx.fillStyle = '#04140d';
  ctx.font = '700 10px ui-monospace, SFMono-Regular, Consolas, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(px(last.c), padL + plotW + 7, lastY);

  /* -------------------------------------------------------------- hover cursor */
  const hover = Number.isInteger(opts.hover) ? Math.max(0, Math.min(view.length - 1, opts.hover)) : null;
  if (hover != null) {
    const b = view[hover];
    const x = X(hover);
    const y = Y(b.c);
    ctx.strokeStyle = 'rgba(233,238,247,0.24)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, priceTop);
    ctx.lineTo(x, priceBottom);
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const text = `${hhmm(b.t)}  O ${px(b.o)}  H ${px(b.h)}  L ${px(b.l)}  C ${px(b.c)}  V ${volLabel(b.v)}`;
    ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
    const tw = ctx.measureText(text).width;
    const bx = padL + 6;
    const by = priceTop + 6;
    ctx.fillStyle = 'rgba(12,17,25,0.94)';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, bx, by, tw + 16, 22, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dbe5f3';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 8, by + 11);
  }

  return {
    count: view.length,
    slot,
    x0: padL,
    firstT: view[0].t,
    lastT: last.t,
  };
}
