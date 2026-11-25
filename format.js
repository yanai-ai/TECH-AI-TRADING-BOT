/* ============================================================================
   YANAI TRADING — format.js
   Small display helpers. Browsers ship full ICU, so ET timestamps use Intl.
   ========================================================================== */

const ET = 'America/New_York';

const nf2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});
const stampFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: ET,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const money = (n, digits = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  return `${sign}$${digits === 0 ? nf0.format(abs) : abs.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

export const signedMoney = (n, digits = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
};

export const pct = (n, digits = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
};

export const signedPct = (n, digits = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
};

export const num = (n, digits = 2) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export const price = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '—';
  return nf2.format(v);
};

export const compact = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
};

const cleanHour = (s) => s.replace(/^24:/, '00:');

export const etTime = (t = Date.now()) => cleanHour(timeFmt.format(new Date(t)));
export const etDateTime = (t = Date.now()) => cleanHour(dateTimeFmt.format(new Date(t)));
export const etStamp = (t = Date.now()) => cleanHour(stampFmt.format(new Date(t)));

export const relTime = (t) => {
  const diff = Date.now() - Number(t || 0);
  if (!Number.isFinite(diff) || diff < 0) return 'now';
  if (diff < 20000) return 'just now';
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

export const duration = (ms) => {
  const total = Math.max(0, Math.round(Number(ms) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
};

export const minutesLabel = (mins) => {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
};

export const tone = (n) => (n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

/* Tiny inline sparkline as an SVG path. Returns '' when there is no data. */
export function sparkline(values, width = 88, height = 26) {
  const vals = (values || []).filter((v) => Number.isFinite(v));
  if (vals.length < 2) return '';
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (max - min < 1e-9) {
    max += 1;
    min -= 1;
  }
  const stepX = width / (vals.length - 1);
  const pad = 2;
  const h = height - pad * 2;
  const pts = vals.map((v, i) => {
    const x = i * stepX;
    const y = pad + h - ((v - min) / (max - min)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return `M${pts.join('L')}`;
}
