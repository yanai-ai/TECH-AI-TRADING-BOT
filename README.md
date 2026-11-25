# YANAI TRADING
# https://yanai-ai.github.io/TECH-AI-TRADING-BOT/

A browser-based **paper trading terminal** that trades real US market prices with long and short
intraday strategies. It runs entirely in your browser — no backend, no API key, no sign-up — so it
can be hosted for free on GitHub Pages.

> **Paper only.** YANAI TRADING never connects to a broker and never places a real order. Every fill
> is simulated against live public quotes.

---

## Quick start

### Run it locally

ES modules need to be served over HTTP, so opening `index.html` directly from disk will not work.

```bash
cd "Yanai Trading"
python -m http.server 8000
```

Then open <http://localhost:8000>.

### Publish it on GitHub Pages

1. Create a repository and upload every file in this folder to the **root** of the default branch
   (`index.html`, `style.css`, and the `.js` files).
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch** → branch `main` → folder `/ (root)`
   → **Save**.
4. After a minute, open `https://<your-username>.github.io/<repo-name>/`.

There is no build step. The site is plain HTML, CSS and ES modules.

---

## What it does

- **Live market data** from CNBC's public quote and 1-minute chart endpoints. Both send
  `Access-Control-Allow-Origin: *`, so they work directly from a static page.
- **Regular US session only.** Entries and exits are active from 09:30 to 16:00 ET on trading days,
  with US market holidays and early closes (13:00 ET) handled in code.
- **Long and short strategies.** Eight setups, four per side, scored 0–99. A trade opens only when
  the score clears your threshold, the 5-minute trend agrees, and the stock is not fighting the tape.
- **Risk-based sizing.** Position size comes from the distance to the stop, then gets capped by a
  per-position allocation limit and a total leverage limit.
- **Automated exits.** Hard stop, profit target, a trailing stop that activates after a chosen amount
  of profit, a breakeven lock once a trade earns 1R, and a time stop for trades that go nowhere.
- **Candlestick charts.** A full 1m / 5m / 15m candle chart with EMA 9/21/50, session VWAP, volume and
  entry/stop/target lines for the selected stock.
- **Market & news tab.** Index, sector and volatility tiles, watchlist breadth, relative strength
  versus SPY, and recent CNBC headlines for the market and your most active tickers.
- **Real-time control.** Add or remove tickers, and switch any ticker off, without restarting.
- **Optional end-of-day flatten.** Close everything five minutes before the bell, or hold overnight.
- **Durable.** Watchlist, settings, positions, trade history and the equity curve persist in
  `localStorage`.

The bot starts **paused**. Press **Start trading** when you are ready.

---

## Strategies

| Strategy | Side | Idea |
| --- | --- | --- |
| Trend Rider | Long | Pullback into the fast EMA while the 9/21/50 EMAs are stacked upward. |
| Breakout | Long | Close above the 20-bar high on an above-average volume candle. |
| VWAP Reclaim | Long | Price crosses back above the session VWAP with participation. |
| Dip Buyer | Long | Oversold lower-Bollinger reclaim in a flat short-term trend. |
| Downtrend Short | Short | Rally into the fast EMA while the EMAs are stacked downward. |
| Breakdown | Short | Close below the 20-bar low on a strong bearish candle. |
| VWAP Rejection | Short | Price crosses back below the session VWAP with participation. |
| Fade Rally | Short | Overbought upper-Bollinger rejection in a flat short-term trend. |

Indicators used: EMA 9/21/50, RSI 14, ATR 14, session VWAP, Bollinger Bands (20, 2), relative volume.

Every signal also has to survive three context filters:

1. **Higher-timeframe agreement** — the 5-minute EMA stack must not point against the trade.
2. **Relative strength versus SPY** — longs want stocks outperforming the index; shorts want laggards.
3. **Over-extension guards** — price must not be too far from VWAP, and the entry must not chase a
   move that has already run past the signal candle.

The optional **regime filter** uses SPY: it skips long setups while SPY is in a downtrend and short
setups while SPY is in an uptrend. It also raises the score bar when the VIX is elevated. Turn it off
in **Settings → Session & behaviour** if you want the bot to trade both directions regardless of the
index.

---

## How a trade is sized

For each signal:

```
risk per share = max(ATR × atrMult, price × stopPct)
quantity       = floor(equity × riskPct / risk per share)
```

The quantity is then reduced so that:

- a single position never exceeds `maxAllocPct` of equity,
- total exposure never exceeds `maxGrossLeverage × equity`,
- a long position never needs more cash than is available.

Stops and targets are placed at `entry − risk` and `entry + targetR × risk` for longs, mirrored for
shorts. A configurable slippage (in basis points) is applied against you on every fill.

Once a trade is up by `trailTriggerR`, the stop starts following the best price. At 1R the stop is
also moved to breakeven (plus a small buffer), so a winner cannot turn into a loser. If a trade has
not made at least 0.35R after `timeStopMin`, it is closed to free the slot.

---

## The dashboard

- **Account** — equity, day P&L, open P&L, realized P&L, win rate, profit factor, max drawdown,
  exposure.
- **Candlesticks** — 1m / 5m / 15m candles for any watchlist symbol, with EMA 9/21/50, session VWAP,
  volume and the entry/stop/target of an open position drawn on the chart.
- **Equity curve** — sampled every minute while the app is open.
- **Open positions** — side, quantity, entry, last, P&L in dollars / percent / R, stop, target, and a
  one-click close.
- **Activity** — every entry, exit, stop adjustment and risk halt.
- **Watchlist** — live prices, mini candlesticks, the current best signal per symbol, and a scanning
  toggle. Click a mini chart to open that symbol in the dashboard chart.
- **Signal board** — every detected setup with its score and the reason it triggered.

The **Strategies** tab shows live closed-trade results for each setup — trade count, win rate and net
P&L — so you can switch off the ones that are not working for the current market.

The **Market** tab adds index and volatility tiles (S&P 500, Nasdaq, Dow, Russell 2000, VIX, 10-year
yield, crude, gold), a sector heat map, watchlist breadth, relative strength versus SPY, and recent
CNBC headlines. Headlines refresh every five minutes and fail gracefully if CNBC is unreachable.

Pausing stops **new entries**. Open positions keep their stops and targets, and the end-of-day
flatten still runs.

---

## Settings worth knowing

| Setting | Default | Meaning |
| --- | --- | --- |
| Risk per trade | 0.5% | Equity risked from entry to stop. |
| Max open positions | 5 | Concurrent positions. |
| Max per position | 20% | Notional cap for one position. |
| Max gross leverage | 1.5× | Total exposure versus equity. |
| Stop distance | 0.8% | Minimum stop width. |
| ATR stop multiple | 1.4× | Uses the wider of ATR-based and percent-based stops. |
| Target | 2.0R | Profit target in units of risk. |
| Trail after / distance | 1.0R / 0.8% | Trailing stop trigger and distance. |
| Time stop | 45 min | Closes a trade that has gone nowhere for this long. 0 turns it off. |
| Max chase | 0.4% | Skips a signal if price has already run this far past the trigger candle. |
| Daily loss limit | 3.0% | Stops new entries for the day. |
| Max entries per day | 1000 | Safety cap; open-position, warm-up and cooldown limits bind first. |
| Cooldown after exit | 5 min | Wait before re-entering the same symbol. Doubles after a loss. |
| Signal threshold | 60 | Minimum score to trade. The VIX raises it when markets are stressed. |
| End of day | Close | Flatten before the bell, or hold overnight. |
| Short selling | On | Turn off for long-only. |
| Auto-start | Off | Start trading automatically when the page opens. |

Profiles (**Conservative**, **Balanced**, **Aggressive**) are presets. Changing any number switches
you to a custom profile.

---

## Data source and limits

- Quotes and 1-minute bars come from CNBC's public endpoints. They are unofficial, can be delayed or
  briefly unavailable, and may change without notice.
- Headlines come from CNBC's public site-search API. They are informational only and are never used
  to trigger a trade.
- The 1-minute history includes pre-market and after-hours bars; the app filters to the regular
  session before computing any indicator.
- The app must stay open in a tab to trade. Browsers throttle background timers, so keep the tab
  visible during the session if you want the tightest reaction time.
- Because the app is browser-only, nothing runs while the page is closed. If you choose to hold
  positions overnight and close the tab, stops will not execute until you reopen the page.
- All state is local to one browser. Use **Settings → Download backup** to move it, and **Import
  backup** to restore it.

---

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Page shell and views. |
| `style.css` | The full dark terminal theme, responsive down to phones. |
| `engine.js` | Market calendar, indicators, strategy scoring, portfolio accounting. |
| `market.js` | CNBC quote, 1-minute bar and headline client with caching and concurrency limits. |
| `bot.js` | The trading loop: entries, exits, sizing, trailing stops, EOD flatten. |
| `chart.js` | Canvas candlestick renderer with EMA/VWAP overlays and position lines. |
| `store.js` | Versioned `localStorage` persistence with validation and trimming. |
| `ui.js` | Rendering, charts, settings, dialogs and toasts. |
| `format.js` | Number, price, percent and ET-time formatting. |
| `app.js` | Bootstraps state, the bot and the UI. |

---

## Disclaimer

YANAI TRADING is a simulation and an educational tool. It is not investment advice, it is not a
broker, and its results are not indicative of real trading performance. Simulated fills ignore
queue position, partial fills, borrow availability, liquidity and many other real-world frictions.
Trade real money only with capital you can afford to lose.
