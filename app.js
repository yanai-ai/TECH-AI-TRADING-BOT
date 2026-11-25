/* ============================================================================
   YANAI TRADING — app.js
   Boots the terminal: restore state, create the bot, mount the UI.
   ========================================================================== */

import { defaultState, addLog } from './engine.js';
import { loadState, saveState } from './store.js';
import { Bot } from './bot.js';
import { initUI, render, toast } from './ui.js';

const restored = loadState();
const state = restored || defaultState();

/* The terminal always opens paused unless auto-start was explicitly enabled. */
state.running = state.settings.autoStart === true;

if (!restored) {
  addLog(
    state,
    'info',
    'Welcome to YANAI TRADING',
    'A paper account is ready with live market data. Press Start trading when you are ready.',
  );
}

const bot = new Bot(state, { onChange: () => render() });

initUI({ state, bot });

bot.boot().then(() => {
  render();
  if (!restored) {
    toast('YANAI TRADING is ready. Press Start trading to begin.', 'success', 5200);
  }
});

/* Best-effort save when the tab goes away. */
window.addEventListener('pagehide', () => {
  if (!window.__yanaiSkipSave) saveState(state);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && !window.__yanaiSkipSave) saveState(state);
});

/* Surface unexpected failures instead of failing silently. */
let reported = false;
const report = (message) => {
  if (reported) return;
  reported = true;
  toast(`Something went wrong: ${message}`, 'error', 7000);
  setTimeout(() => {
    reported = false;
  }, 15000);
};
window.addEventListener('error', (e) => report(e.message || 'script error'));
window.addEventListener('unhandledrejection', (e) =>
  report(e.reason?.message || String(e.reason || 'async error')),
);

/* Handy for debugging from the console. */
window.__yanai = { state, bot, render };
