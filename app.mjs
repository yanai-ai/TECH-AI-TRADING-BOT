import {UNIVERSE,SEED_SYMBOLS,STRATEGIES,SESSION_LABEL,PROFILE,DEFAULT,TAPES,START_INDEX,TAPE_LENGTH,validSymbol,marketSession,settings,makeReplay,replayStep,tape,metrics,note} from './engine.mjs';

const glyphs={
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list:'<path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1"/>',
  layers:'<path d="m3 9 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5M3 17l9 5 9-5"/>',
  book:'<path d="M6 3h14v17H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 15a2 2 0 0 1 2-2h14M8 7h8m-8 4h5"/>',
  activity:'<path d="M2 12h5l3-7 4 14 3-7h5"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',
  'arrow-right':'<path d="M4 12h15m-6-6 6 6-6 6"/>',up:'<path d="M12 19V5m-6 6 6-6 6 6"/>',down:'<path d="M12 5v14m-6-6 6 6 6-6"/>',
  play:'<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',pause:'<path d="M9 5v14m6-14v14" stroke-width="2.5"/>',
  step:'<path d="M5 5v14l10-7zm13 0v14"/>',fast:'<path d="m3 6 8 6-8 6zm10 0 8 6-8 6z"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--panel)"/><circle cx="15" cy="12" r="2" fill="var(--panel)"/><circle cx="10" cy="18" r="2" fill="var(--panel)"/>',
  wallet:'<path d="M20 8V5H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h15v-4m0-8H5a2 2 0 1 1 0-4m15 4h1v8h-6a4 4 0 0 1 0-8h5Zm-5 4h1"/>',
  cash:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h1m10 0h1"/>',
  trend:'<path d="m3 16 5-5 4 3 8-8m-5 0h5v5"/>',target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.1"/>',
  candles:'<path d="M7 3v4m0 6v8m10-18v8m0 6v4"/><rect x="5" y="7" width="4" height="6" rx=".5"/><rect x="15" y="11" width="4" height="6" rx=".5"/>',
  search:'<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',shield:'<path d="m12 3 8 4v5c0 4-4 8-8 10-4-2-8-6-8-10V7l8-4Z"/><path d="m8 12 3 3 5-6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',rotate:'<path d="M4 11a8 8 0 1 1 1 6M4 5v6h6"/>',
  flask:'<path d="M9 3h6m-5 0v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3M7 15h10"/>',
  box:'<rect x="4" y="6" width="16" height="14" rx="2"/><path d="M4 11h16m-10 4h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
};
const icon=(name,size=16)=>`<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${glyphs[name]??glyphs.info}</svg>`;
document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon,e.closest('.topbar')?17:16));
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const dollars=n=>Number.isFinite(n)?usd.format(n):'—';
const signed=(n,format=dollars)=>!Number.isFinite(n)?'—':`${n>0?'+':n<0?'−':''}${format(Math.abs(n))}`;
const pct=n=>`${n.toFixed(2)}%`;
const tone=n=>n>0?'positive':n<0?'negative':'neutral';
const etTime = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const etClock = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const etDay = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric'});
const hh=t=>etTime.format(t*1000);
const sessionRows=[['pre','04:00–09:30'],['regular','09:30–16:00'],['after','16:00–20:00'],['overnight','20:00–04:00']];
const pages={
  overview:['Trading dashboard','Monitor setups, manage risk, and put your strategies to the test.'],
  watchlist:['Watchlist','Build the universe your paper engine scans.'],
  strategies:['Strategies','Choose which setups qualify, then test your rules on a replay.'],
  journal:['Trade journal','Review simulated fills and the decisions behind them.'],
};
const marketBase=document.querySelector('meta[name="market-api"]').content;
const endpoint=marketBase.startsWith('__PORT_')?'':marketBase.replace(/\/$/,'');
const state={page:'overview',mode:'replay',symbol:'NVDA',range:60,candles:true,volume:true,markers:true,enabled:[...SEED_SYMBOLS],custom:[],config:settings(DEFAULT),replay:makeReplay(),history:[],filter:'All',search:'',sort:'universe',side:'ALL',journalTab:'fills',playing:false,market:null,marketError:'',pending:false,draft:null,backtest:null,backStrategy:'all',backTape:'mixed'};
let chartHover=false, toastTimer, timer, marketReadVersion=0, lastControls='';
const list=()=>[...UNIVERSE,...(state.mode==='market'?(state.market?.custom??[]):state.custom).map(symbol=>({symbol,name:'Custom ticker',sector:'Custom'}))];
const bySymbol=s=>list().find(x=>x.symbol===s)??{symbol:s,name:'Custom ticker',sector:'Custom'};
const enabled=()=>state.mode==='market'?(state.market?.enabled??SEED_SYMBOLS):state.enabled;
const config=()=>state.mode==='market'?settings(state.market?.config??DEFAULT):state.config;
const book=()=>state.mode==='market'?(state.market?.book??null):state.replay.book;
const age=t=>t?Math.max(0,Math.round((Date.now()/1000-t)/60)):null;
const open=(title,body)=>{
  $('modal').innerHTML=`<div class="modal-head"><h2 id="modalTitle">${title}</h2><button class="icon-btn" aria-label="Close dialog" data-action="close">${icon('close')}</button></div><div class="modal-body">${body}</div>`;
  if(!$('modal').open)$('modal').showModal();
};
const toast=message=>{
  clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;
  toastTimer=setTimeout(()=>$('toast').hidden=true,3400);
};
const btn=(label,action,{type='',glyph='',disabled=false}={})=>`<button type="button" class="btn ${type}" data-action="${action}" ${disabled?'disabled':''}>${glyph?icon(glyph,15):''}${label}</button>`;
const empty=(message,glyph='box')=>`<div class="empty">${icon(glyph,17)}<span>${esc(message)}</span></div>`;
const tickerButton=s=>`<button type="button" class="symbol-button" data-symbol="${esc(s)}">${esc(s)}</button>`;
const actionNote=(b)=>b? b.positions && Object.keys(b.positions).length : 0;

function clock(){
  const m=marketSession(), allowed=config().sessions;
  $('clock').textContent=`${etClock.format(Date.now())} ET`;
  $('marketLabel').textContent=m.key==='regular'?'Regular market':m.key==='closed'?'US market closed':m.label;
  $('marketBadge').className=`market-label ${m.key==='closed'?'':m.key==='regular'?'active':'ext'}`;
  $('sessionList').innerHTML=sessionRows.map(([id,hours])=>`<div class="session-row ${m.key===id?'now':''}" title="${allowed.includes(id)?'Enabled':'Disabled'} in active settings"><i></i><b>${SESSION_LABEL[id]}</b><time>${m.early&&id==='regular'?'09:30–13:00':m.early&&id==='after'?'13:00–17:00':hours}</time></div>`).join('');
}
function header(){
  const [title,subtitle]=pages[state.page];
  $('title').textContent=title;$('subtitle').textContent=subtitle;$('screenLabel').textContent=`WORKSPACE / ${state.page==='journal'?'TRADE JOURNAL':state.page.toUpperCase()}`;
  document.querySelectorAll('#nav button').forEach(e=>e.dataset.page===state.page?e.setAttribute('aria-current','page'):e.removeAttribute('aria-current'));
  document.querySelectorAll('.view').forEach(e=>e.hidden=e.id!==state.page);
  const mode=`<div class="segment" aria-label="Paper data mode"><button data-mode="replay" aria-pressed="${state.mode==='replay'}">Replay</button><button data-mode="market" aria-pressed="${state.mode==='market'}">Market data</button></div>`;
  const isMarket=state.mode==='market', end=state.replay.index>=TAPE_LENGTH, m=state.market;
  const overviewActions=isMarket
    ? btn('Scan now','scan',{glyph:'step',disabled:state.pending||!m?.configured||!!state.marketError})+btn(m?.armed?'Pause engine':'Start engine','arm',{glyph:m?.armed?'pause':'play',type:'accent',disabled:state.pending||!m?.configured||!!state.marketError})
    : btn('Step 1m','step',{glyph:'step',disabled:end||state.playing})+btn(state.playing?'Pause replay':'Play replay','play',{glyph:state.playing?'pause':'play',type:'accent',disabled:end})+btn('Replay tools','replay-tools',{glyph:'settings'});
  const controls=mode+(state.page==='overview'?overviewActions:state.page==='watchlist'?btn('Add symbol','add',{type:'accent',glyph:'plus'}):'');
  if(lastControls!==controls){$('viewControls').innerHTML=controls;lastControls=controls;}
  $('railSource').textContent=isMarket?'Alpaca feed':'Replay feed';
  $('railStatus').textContent=isMarket?(state.marketError?'Worker unreachable':m?.configured?'Paper worker':'Not configured'):'Synthetic prices';
  const message=isMarket?(state.marketError||m?.message||'Connecting to the market-data worker…'):null;
  $('notice').hidden=!message;
  if(message&&$('notice').dataset.message!==message){$('notice').innerHTML=`${icon('info')}<span>${esc(message)}</span><button class="text-button" data-action="connection">Data & sessions ${icon('chevron',14)}</button>`;$('notice').dataset.message=message;}
  clock();
}
function stat(label,value,sub,glyph,css=''){return `<div class="stat"><div class="stat-label"><span data-icon="${glyph}">${icon(glyph,14)}</span>${label}</div><strong class="${css}">${value}</strong><small>${sub}</small></div>`;}
function stats(){
  const b=book(), m=b?metrics(b):{};
  $('stats').innerHTML=
    stat('Portfolio equity',dollars(m.equity),state.mode==='replay'?'Synthetic paper account':'Market data · paper account','wallet')+
    stat('Buying power',dollars(b?.cash),b?`${actionNote(b)} open ${actionNote(b)===1?'position':'positions'}`:'Awaiting worker','cash')+
    stat('Total return',signed(m.pnl),b?`${signed(m.pnl/b.initial*100,pct)} since inception`:'Awaiting worker','trend',tone(m.pnl))+
    stat('Closed trades',m.closed??'—',m.winRate==null?'Win rate: —':`Win rate: ${(100*m.winRate).toFixed(1)}%`,'target');
}
function quoteFor(s){
  const bars=book()?.bars?.[s]??[], latest=bars.at(-1);
  return {bars,latest,change:latest&&bars.length>1?(latest.c/bars[0].c-1)*100:null};
}
function renderChart(){
  if(state.page!=='overview')return;
  const symbol=state.symbol, {bars,latest,change}=quoteFor(symbol), b=book();
  $('chartSymbol').textContent=symbol;
  $('symbolIcon').textContent=symbol.slice(0,2);$('chartCompany').textContent=bySymbol(symbol).name;
  $('quoteHead').innerHTML=`<span class="quote-price">${dollars(latest?.c)}</span><span class="quote-change ${tone(change)}">${Number.isFinite(change)?`${change>0?'↑ ':change<0?'↓ ':''}${signed(change,pct)}`:''}</span><span class="quote-note">${latest?`${etDay.format(latest.t*1000)} · ${hh(latest.t)} ET`:'No price yet'}</span>`;
  document.querySelectorAll('[data-range]').forEach(x=>x.setAttribute('aria-pressed',String(+x.dataset.range===state.range)));
  $('chartSource').innerHTML=`<i></i> ${state.mode==='replay'?'Synthetic replay':`Alpaca${state.market?.lastFeed?' · '+esc(state.market.lastFeed.toUpperCase()):''}` } · 1-minute bars`;
  for(const [key,active] of [['chart-style',!state.candles],['volume',state.volume],['fills',state.markers]])document.querySelector(`[data-action="${key}"]`).setAttribute('aria-pressed',String(active));
  const host=$('chart');
  if(!bars.length){host.innerHTML=empty('No candles for this symbol yet.','candles');host.onpointermove=null;return;}
  const W=Math.max(host.clientWidth||550,268), H=host.clientHeight||248, L=10,R=W-62, top=11, bottom=H-(state.volume?57:29);
  const series=bars.slice(-(state.range||bars.length));
  const maxHigh=Math.max(...series.map(c=>c.h)), minLow=Math.min(...series.map(c=>c.l)), pad=Math.max((maxHigh-minLow)*.085,.035);
  const high=maxHigh+pad,low=minLow-pad, y=p=>top+(high-p)/(high-low)*(bottom-top);
  const step=(R-L)/series.length, x=i=>L+(i+.5)*step, ww=Math.min(8,Math.max(.8,step*.66)), maxV=Math.max(1,...series.map(c=>c.v));
  const hLines=Array.from({length:5},(_,i)=>{
    const price=high-(high-low)*i/4,pos=y(price);
    return `<path class="gridline" d="M${L} ${pos}H${R}"/><text class="plot-label" x="${R+9}" y="${pos+4}">${price.toFixed(2)}</text>`;
  }).join('');
  const vLines=Array.from({length:Math.min(W<480?4:6,series.length)},(_,i)=>{
    const n=Math.min(W<480?4:6,series.length), j=Math.round(i*(series.length-1)/Math.max(n-1,1)), xx=x(j);
    return `<path class="gridline" d="M${xx} ${top}V${H-20}"/><text class="plot-label" x="${Math.max(25,xx)}" y="${H-5}" text-anchor="middle">${hh(series[j].t)}</text>`;
  }).join('');
  const color=c=>c.c>=c.o?'#80dca0':'#e58d81';
  const volumes=state.volume?series.map((c,i)=>{const vh=c.v/maxV*27;return `<rect x="${x(i)-ww/2}" y="${H-22-vh}" width="${ww}" height="${vh}" fill="${color(c)}" opacity=".37"/>`;}).join(''):'';
  const candles=state.candles?series.map((c,i)=>{const xx=x(i), yy=Math.min(y(c.o),y(c.c)), height=Math.max(1,Math.abs(y(c.o)-y(c.c)));return `<path stroke="${color(c)}" d="M${xx} ${y(c.h)}V${y(c.l)}"/><rect x="${xx-ww/2}" y="${yy}" width="${ww}" height="${height}" rx=".4" fill="${color(c)}"/>`;}).join(''):`<path fill="none" stroke="#85e5a8" stroke-width="1.8" d="${series.map((c,i)=>`${i?'L':'M'}${x(i)},${y(c.c)}`).join(' ')}"/>`;
  const lastY=y(latest.c), lastColor=color(latest);
  const markers=state.markers?(b?.fills??[]).filter(f=>f.symbol===symbol&&f.candleTime>=series[0].t).slice(0,55).map(f=>{
    const i=series.findIndex(c=>c.t===f.candleTime);if(i<0)return '';
    const xx=x(i),yy=f.side==='BUY'?Math.min(bottom-1,y(series[i].l)+10):Math.max(top+7,y(series[i].h)-4), d=f.side==='BUY'?`M${xx} ${yy-6}l5 7h-10z`:`M${xx} ${yy+6}l5 -7h-10z`;
    return `<path d="${d}" fill="${f.side==='BUY'?'#aafb96':'#ffc19c'}"><title>${f.side} ${esc(f.symbol)} ${dollars(f.price)}</title></path>`;
  }).join(''):'';
  host.innerHTML=`<svg role="img" aria-label="${esc(symbol)} ${state.candles?'candlestick':'line'} chart, ${series.length} one-minute bars" viewBox="0 0 ${W} ${H}">${hLines}${vLines}${volumes}${candles}${markers}<path d="M${L} ${lastY}H${R}" stroke="${lastColor}" opacity=".52" stroke-dasharray="3 4"/><rect x="${R+3}" y="${lastY-9}" width="57" height="18" rx="3" fill="${lastColor}"/><text x="${R+31.5}" y="${lastY+4}" text-anchor="middle" style="fill:#132018;font:500 12px var(--code)">${latest.c.toFixed(2)}</text><path id="crosshair" stroke="#a2b9a9" opacity=".7" stroke-dasharray="3 4" visibility="hidden"/></svg><div class="chart-tip" id="chartTip" hidden></div>`;
  host.onpointermove=e=>{
    if(e.pointerType==='touch')return;
    const px=e.clientX-host.getBoundingClientRect().left,i=Math.max(0,Math.min(series.length-1,Math.floor((px-L)/step)));
    if(px>R||px<L){host.onpointerleave();return;}
    const c=series[i],cross=$('crosshair'),tip=$('chartTip');
    cross.setAttribute('d',`M${x(i)} ${top}V${H-20}`);cross.setAttribute('visibility','visible');
    tip.textContent=`${hh(c.t)} ET · O ${c.o.toFixed(2)} · H ${c.h.toFixed(2)} · L ${c.l.toFixed(2)} · C ${c.c.toFixed(2)}`;tip.hidden=false;chartHover=true;
  };
  host.onpointerleave=()=>{chartHover=false;$('crosshair')?.setAttribute('visibility','hidden');if($('chartTip'))$('chartTip').hidden=true;};
}
function decisions(rows){
  const kinds={buy:'up',sell:'down',guard:'shield',signal:'activity',system:'info'};
  return rows.map(log=>`<div class="log"><span class="log-circle" data-icon="${kinds[log.kind]}">${icon(kinds[log.kind],15)}</span><div><b>${esc(log.title)}</b><p>${esc(log.body)}</p></div><time>${hh(log.t)} ET</time></div>`).join('');
}
function watchOverview(){
  const shown=[...new Set([state.symbol,...enabled(),...list().map(x=>x.symbol)])].slice(0,7);
  $('watchRows').innerHTML=shown.map(s=>{const q=quoteFor(s);return `<tr class="${s===state.symbol?'selected':''}"><td>${tickerButton(s)}</td><td>${dollars(q.latest?.c)}</td><td class="${tone(q.change)}">${signed(q.change,pct)}</td></tr>`;}).join('');
}
function overview(){
  const b=book(), logs=b?.logs??[];
  stats();watchOverview();if(!chartHover)renderChart();
  const held=Object.entries(b?.positions??{});
  $('positionCount').textContent=held.length;
  $('positionSub').textContent=b?`Current paper holdings${held.length?' · marks use last completed candle':''}`:'No worker connection';
  $('positions').innerHTML=held.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>Symbol</th><th>Qty</th><th>Entry</th><th>Stop / target</th><th>Open P&L</th></tr></thead><tbody>${held.map(([s,p])=>{const gain=((b.marks[s]??p.entry)-p.entry)*p.qty;return `<tr><td>${tickerButton(s)}</td><td class="mono">${p.qty}</td><td class="mono">${dollars(p.entry)}</td><td class="mono">${dollars(p.stop)} / ${dollars(p.target)}</td><td class="mono ${tone(gain)}">${signed(gain)}</td></tr>`;}).join('')}</tbody></table></div>`:empty('No open positions. Qualifying setups will appear here.');
  const completed=state.mode==='replay'&&state.replay.index>=TAPE_LENGTH;
  $('activityStatus').innerHTML=`<i></i> ${state.playing?'PLAYING':completed?'COMPLETE':state.mode==='market'?(state.market?.armed?'ARMED':'PAUSED'):'READY'}`;
  const noLogs=state.mode==='replay'?[{t:state.replay.book.equity[0].t,kind:'system',title:'Replay ready',body:'Step one minute or press Play to scan for setups.'}]:[];
  $('decisions').innerHTML=logs.length||noLogs.length?decisions((logs.length?logs:noLogs).slice(0,4)):empty('No market-data decisions yet.','activity');
}

function watchRows(){
  const active=enabled(), term=state.search.trim().toLowerCase();
  let shown=list().filter(s=>(state.filter==='All'||(state.filter==='Scanning'?active.includes(s.symbol):s.sector===state.filter))&&(!term||`${s.symbol} ${s.name} ${s.sector}`.toLowerCase().includes(term)));
  if(state.sort==='symbol')shown.sort((a,b)=>a.symbol.localeCompare(b.symbol));
  if(state.sort==='change')shown.sort((a,b)=>(quoteFor(b.symbol).change??-Infinity)-(quoteFor(a.symbol).change??-Infinity));
  $('universeSummary').textContent=`${shown.length} of ${list().length} symbols · ${active.length} scanning`;
  $('universeRows').innerHTML=shown.length?shown.map(s=>{const q=quoteFor(s.symbol), hot=active.includes(s.symbol);return `<tr><td><div class="sym-name"><span class="symbol-icon">${esc(s.symbol.slice(0,2))}</span><div>${tickerButton(s.symbol)}</div></div></td><td>${esc(s.name)}</td><td><span class="pill off">${esc(s.sector)}</span></td><td class="mono">${dollars(q.latest?.c)}</td><td class="mono ${tone(q.change)}">${signed(q.change,pct)}</td><td><input aria-label="Scan ${esc(s.symbol)}" type="checkbox" data-scan="${esc(s.symbol)}" ${hot?'checked':''} ${state.mode==='market'&&(!state.market?.configured||state.pending)?'disabled':''}></td></tr>`;}).join(''):`<tr><td colspan="6">${empty('No symbols match these filters.','search')}</td></tr>`;
}
function watchlist(){
  $('watchlist').innerHTML=`<article class="panel data-panel"><div class="panel-header"><div><h2>Symbol universe</h2><p>${state.mode==='replay'?'Synthetic prices are not market quotes.':'Prices come from the selected market-data feed.'}</p></div><label class="search-wrap">${icon('search',15)}<input type="search" id="symbolSearch" aria-label="Search symbols" placeholder="Find a symbol" value="${esc(state.search)}"></label></div><div class="toolbar"><span id="universeSummary" class="summary"></span><select id="sectorFilter" aria-label="Sector filter">${['All','Scanning','Tech','ETF','Finance','Consumer','Energy','Health','Custom'].map(x=>`<option ${x===state.filter?'selected':''} value="${x}">${x==='All'?'All sectors':x}</option>`).join('')}</select><select id="sortFilter" aria-label="Sort symbols">${Object.entries({universe:'Default order',symbol:'Symbol A–Z',change:'Change high to low'}).map(([v,n])=>`<option value="${v}" ${state.sort===v?'selected':''}>${n}</option>`).join('')}</select>${btn('Enable all','enable-all',{disabled:state.mode==='market'&&(!state.market?.configured||state.pending)})}${btn('Clear scan list','disable-all',{type:'ghost',disabled:state.mode==='market'&&(!state.market?.configured||state.pending)})}</div><div class="table-scroll"><table class="data-table"><thead><tr><th>Symbol</th><th>Company / fund</th><th>Sector</th><th>Last bar</th><th>Window change</th><th>Scan</th></tr></thead><tbody id="universeRows"></tbody></table></div></article>`;
  watchRows();
}
const fields={
  risk:['Risk per trade (%)',.05,2,.05],allocation:['Max allocation (%)',2,35,1],maxPositions:['Max positions',1,10,1],stop:['Minimum stop (%)',.15,5,.05],target:['Profit target (%)',.2,10,.05],trail:['Trailing stop (%)',.15,5,.05],spread:['Max entry spread (bps)',5,60,1],loss:['Daily loss limit (%)',.2,6,.05],
};
function strategy(){
  const d=state.draft??=structuredClone(config());
  const disabled=state.mode==='market'&&(!state.market?.configured||state.pending||!!state.marketError);
  $('strategies').innerHTML=`<div class="strategy-grid">${Object.entries(STRATEGIES).map(([id,s])=>`<article class="panel strategy-card"><div class="inline"><h2>${s.name}</h2><input aria-label="Enable ${s.name}" data-setting-strategy="${id}" type="checkbox" ${d.strategies.includes(id)?'checked':''}></div><p>${s.description}</p><span class="eyebrow">${s.indicator}</span></article>`).join('')}</div>
    <form id="riskForm"><div class="settings-grid"><article class="panel"><div class="panel-header"><div><h2>Risk controls</h2><p>Long-only · whole shares · no leverage</p></div><span class="pill">${esc(d.profile.toUpperCase())}</span></div><div class="panel-body"><div class="eyebrow">RISK PROFILE</div><div class="profile-line">${Object.keys(PROFILE).map(id=>`<button type="button" class="btn" data-profile="${id}" aria-pressed="${d.profile===id}">${id[0].toUpperCase()+id.slice(1)}</button>`).join('')}</div><div class="field-grid">${Object.entries(fields).map(([id,[label,min,max,step]])=>`<label class="field">${label}<input type="number" data-setting-number="${id}" value="${d[id]}" min="${min}" max="${max}" step="${step}" required></label>`).join('')}</div></div></article>
    <article class="panel"><div class="panel-header"><div><h2>Market sessions</h2><p>Eastern Time · US equity calendar</p></div>${icon('activity')}</div><div class="panel-body">${sessionRows.map(([id,h])=>`<label class="checkbox-line"><input type="checkbox" data-setting-session="${id}" ${d.sessions.includes(id)?'checked':''}> ${SESSION_LABEL[id]} · ${h} ET</label>`).join('')}<p class="secondary-note">Disabled sessions block both entries and exits. Extended sessions require fresh quotes, narrower spreads and smaller position sizes. Early closes can shorten the day.</p><p class="secondary-note">The replay tapes all use regular hours. The session controls apply to the market-data worker when connected.</p></div></article></div>
    <div class="toolbar" style="padding:0 0 14px;border:0"><button class="btn accent" type="submit" ${disabled?'disabled':''}>Save ${state.mode==='market'?'market':'replay'} settings</button><span class="summary">${disabled?'Connect a data worker to save market settings.':'Changes apply to future decisions, not existing stop and target prices.'}</span></div></form>
    <article class="panel data-panel"><div class="panel-header"><div><h2>Strategy lab</h2><p>Compare rules on a separate synthetic tape</p></div>${icon('flask',18)}</div><div class="panel-body"><div class="inline"><select id="backStrategy" aria-label="Backtest strategy"><option value="all">All enabled strategies</option>${Object.entries(STRATEGIES).map(([id,s])=>`<option ${state.backStrategy===id?'selected':''} value="${id}">${s.name}</option>`).join('')}</select><select id="backTape" aria-label="Backtest tape">${Object.entries(TAPES).map(([id,n])=>`<option value="${id}" ${id===state.backTape?'selected':''}>${n}</option>`).join('')}</select>${btn('Run backtest','backtest',{glyph:'play'})}</div><div id="backtestResult" aria-live="polite"></div><p class="secondary-note">Synthetic scenarios are for testing behavior, not forecasting returns. Signals use finalized candles and can only enter on the next bar; fills include estimated spread and slippage.</p></div></article>`;
  renderBacktest();
}
function renderBacktest(){
  const target=$('backtestResult'),r=state.backtest;if(!target||!r)return;
  target.innerHTML=`<div class="backtest-result"><b>${esc(r.name)} · ${esc(TAPES[r.mode])}</b><div class="mini-metrics">${[['Net P&L',signed(r.pnl)],['Closed trades',r.closed],['Win rate',r.winRate==null?'—':pct(r.winRate*100)],['Drawdown',pct(r.maxDD*100)]].map(([name,v])=>`<div>${name}<strong>${v}</strong></div>`).join('')}</div><p class="secondary-note">${r.symbols} scanner symbols · ${r.open} positions marked to final close · synthetic data</p></div>`;
}
function journal(){
  const b=book(), m=b?metrics(b):{}, fills=b?.fills??[];
  const tab=state.journalTab, filtered=state.side==='ALL'?fills:fills.filter(t=>t.side===state.side);
  $('journal').innerHTML=`<div class="stats">${stat('Realized P&L',signed(m.realized),'Closed positions','trend',tone(m.realized))}${stat('Paper fills',b?fills.length:'—','Entries + exits','list')}${stat('Win rate',m.winRate==null?'—':pct(m.winRate*100),'Closed positions only','target')}${stat('Max drawdown',b?pct(100*m.maxDD):'—','Peak-to-trough equity','shield')}</div>
    <article class="panel data-panel"><div class="panel-header"><div><h2>Paper ledger</h2><p>${state.mode==='replay'?'Synthetic replay':'Alpaca market data'} · Times shown in ET</p></div>${btn('Export CSV','csv',{glyph:'download',disabled:!fills.length})}</div>
    <div class="toolbar"><div class="segment" aria-label="Journal view"><button data-journal="fills" aria-pressed="${tab==='fills'}">Fills</button><button data-journal="decisions" aria-pressed="${tab==='decisions'}">Decisions</button></div><span class="summary"></span>${tab==='fills'?`<select id="sideFilter" aria-label="Filter fills"><option value="ALL">All sides</option><option value="BUY" ${state.side==='BUY'?'selected':''}>Buys</option><option value="SELL" ${state.side==='SELL'?'selected':''}>Sells</option></select>`:''}</div>
    ${tab==='decisions'?((b?.logs?.length)?decisions(b.logs.slice(0,80)):empty('No decisions recorded for this book.','activity')):filtered.length?`<div class="table-scroll"><table class="data-table"><thead><tr><th>Time ET</th><th>Side</th><th>Symbol</th><th>Qty / fill</th><th>Strategy / reason</th><th>Realized P&L</th></tr></thead><tbody>${filtered.slice(0,120).map(t=>`<tr><td class="mono">${etDay.format(t.t*1000)} ${hh(t.t)}</td><td class="mono ${t.side==='BUY'?'positive':'negative'}">${t.side}</td><td>${tickerButton(t.symbol)}</td><td class="mono">${t.qty} × ${dollars(t.price)}</td><td class="journal-reason">${esc(STRATEGIES[t.strategy]?.name??t.strategy)} · ${esc(t.reason)}</td><td class="mono ${tone(t.pnl)}">${signed(t.pnl)}</td></tr>`).join('')}</tbody></table></div>`:empty('No fills match this view.')}</article>`;
}
function render(){header();if(state.page==='overview')overview();else if(state.page==='watchlist')watchlist();else if(state.page==='strategies')strategy();else journal();}
function go(id){if(!Object.hasOwn(pages,id))return;state.page=id;if(id==='strategies')state.draft??=structuredClone(config());render();window.scrollTo({top:0});}
function selectSymbol(s){if(!validSymbol(s))return;state.symbol=s;chartHover=false;go('overview');}

function actualStep(){
  const key=JSON.stringify([state.config,state.enabled]);
  if(state.replay.index<TAPE_LENGTH&&state.history.at(-1)?.key!==key)state.history.push({at:state.replay.index,key});
  return replayStep(state.replay,state.config,state.enabled);
}
function stopReplay(){clearInterval(timer);state.playing=false;}
function play(){
  if(state.playing){stopReplay();render();return;}
  if(state.replay.index>=TAPE_LENGTH)return;
  state.playing=true;render();
  timer=setInterval(()=>{
    if(!actualStep()){stopReplay();render();return;}
    if(state.page==='overview')overview();else if(state.page==='journal'&&state.journalTab==='decisions')journal();
  },520);
}
function newReplay(mode){
  stopReplay();state.replay=makeReplay([...UNIVERSE.map(s=>s.symbol),...state.custom],mode);state.history=[];
  render();toast(`${TAPES[mode]} loaded`);
}
function replayTools(){
  open('Replay tools',`<p>Replay uses generated one-minute candles and a separate $10,000 paper book. It never changes the market-data ledger.</p><form id="tapeForm"><label class="field">Replay tape<select id="tapeSelect">${Object.entries(TAPES).map(([k,v])=>`<option value="${k}" ${state.replay.mode===k?'selected':''}>${v}</option>`).join('')}</select></label><div class="inline"><button class="btn" type="submit">Load tape</button>${btn('Run to end','run-all',{glyph:'fast',disabled:state.replay.index>=TAPE_LENGTH})}</div></form><p class="mono">${state.replay.index-START_INDEX} / ${TAPE_LENGTH-START_INDEX} replay minutes processed</p><div class="modal-actions">${btn('Import checkpoint','import',{glyph:'book'})}${btn('Save checkpoint','checkpoint',{glyph:'download'})}${btn('Reset replay','reset',{type:'danger',glyph:'rotate'})}</div><input type="file" id="checkpointFile" accept=".json,application/json" hidden>`);
}
function addDialog(){
  if(state.mode==='market'&&!state.market?.configured){connection();return;}
  open('Add symbol',`<p>Add a US ticker, for example <code>DIS</code> or <code>BRK.B</code>. Replay creates a synthetic tape for new symbols. Market mode needs the provider to recognize the ticker.</p><form id="addForm"><label class="field">Ticker symbol<input name="symbol" maxlength="11" placeholder="DIS" autocomplete="off" required autofocus></label><span class="error" id="addError" role="alert"></span><div class="modal-actions">${btn('Cancel','close')}<button class="btn accent" type="submit">Add to scanner</button></div></form>`);
}
function connection(){
  const m=state.market;
  open('Data & market sessions',`<p><b>${m?.configured?'Alpaca market-data worker configured':'Replay available · market feed not configured'}</b></p>
    <p>Replay runs entirely in this preview. Market mode needs a continuously running private worker with Alpaca market-data credentials. No broker orders are sent.</p>
    <p>The worker defaults to <code>iex</code> during regular hours, <code>sip</code> before and after the bell, and <code>overnight</code> after 8 p.m. ET. Feed access depends on your Alpaca plan.</p>
    <div>${sessionRows.map(([id,h])=>`<div class="session-row"><i></i><b>${SESSION_LABEL[id]}</b><time>${h} ET</time></div>`).join('')}</div>
    <p>NYSE holidays and early closes are built in through 2028. Fresh data and enabled sessions are required; pausing the worker also pauses simulated exits.</p>
    <p><a href="https://docs.alpaca.markets/us/docs/245-trading-for-trading-api" target="_blank" rel="noopener">Alpaca overnight data documentation</a> · <a href="https://www.nyse.com/trade/hours-calendars" target="_blank" rel="noopener">NYSE calendar</a></p>
    <div class="modal-actions">${btn('Close','close',{type:'accent'})}</div>`);
}
function download(file,content,type){
  const uri=URL.createObjectURL(new Blob([content],{type}));
  const a=document.createElement('a');a.href=uri;a.download=file;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(uri),4000);
}
function csv(){
  const cols=['t','side','symbol','qty','price','strategy','reason','session','source','pnl'];
  const encode=v=>`"${String(v??'').replaceAll('"','""')}"`;
  const rows=(book()?.fills??[]).map(x=>cols.map(k=>encode(k==='t'?new Date(x.t*1000).toISOString():x[k])).join(','));
  if(!rows.length)return;
  download(`afterbell-${state.mode}-fills.csv`,[cols.join(','),...rows].join('\r\n'),'text/csv;charset=utf-8');
}
async function restore(file){
  try{
    if(!file||file.size>180000)return toast('Choose an Afterbell checkpoint under 180 KB.');
    const x=JSON.parse(await file.text());
    if(x.version!==1||!Object.hasOwn(TAPES,x.mode)||!Number.isInteger(x.index)||x.index<START_INDEX||x.index>TAPE_LENGTH||!Array.isArray(x.history)||x.history.length>TAPE_LENGTH-START_INDEX)throw Error();
    const custom=Array.isArray(x.custom)?[...new Set(x.custom.filter(validSymbol))].filter(s=>!UNIVERSE.some(v=>v.symbol===s)).slice(0,20):[];
    const r=makeReplay([...UNIVERSE.map(s=>s.symbol),...custom],x.mode), history=[];
    let prev=START_INDEX-1,cfg=settings(DEFAULT),syms=[...SEED_SYMBOLS];
    for(const a of x.history){
      if(!Number.isInteger(a.at)||a.at<=prev||a.at>=x.index||typeof a.key!=='string')throw Error();
      const [c,s]=JSON.parse(a.key);if(!c||!Array.isArray(s))throw Error();
      const filtered=s.filter(z=>Object.hasOwn(r.data,z));
      history.push({at:a.at,key:JSON.stringify([settings(c),filtered])});prev=a.at;
    }
    const keyed=new Map(history.map(a=>[a.at,a.key]));
    while(r.index<x.index){if(keyed.has(r.index))[cfg,syms]=JSON.parse(keyed.get(r.index));replayStep(r,cfg,syms);}
    stopReplay();state.replay=r;state.custom=custom;state.history=history;state.config=settings(x.config??DEFAULT);state.enabled=Array.isArray(x.enabled)?[...new Set(x.enabled.filter(z=>Object.hasOwn(r.data,z)))]:[...SEED_SYMBOLS];state.draft=null;
    if(!Object.hasOwn(r.data,state.symbol))state.symbol='NVDA';
    $('modal').close();render();toast('Replay checkpoint restored');
  }catch{toast('This is not a valid Afterbell checkpoint.');}
}
async function getMarket(){
  if(state.pending)return;
  const version=++marketReadVersion;
  const wasConfigured=state.market?.configured, wasUnreachable=Boolean(state.marketError);
  try{
    const response=await fetch(`${endpoint}/api/state`,{signal:AbortSignal.timeout(6500),cache:'no-store'});
    if(!response.ok)throw Error();
    const data=await response.json();
    if(version!==marketReadVersion)return;
    state.market=data;state.marketError='';
  }catch{if(version!==marketReadVersion)return;state.marketError='Market-data worker unavailable. Replay is still available.';}
  if(state.mode==='market'){
    header();
    if(state.page==='overview')overview();else if(state.page==='watchlist'&&$('universeRows'))watchRows();else if(state.page==='journal')journal();
    else if(state.page==='strategies'&&(wasConfigured!==state.market?.configured||wasUnreachable!==Boolean(state.marketError))){
      if(!wasConfigured&&state.market?.configured)state.draft=null;
      strategy();
    }
  }
}
async function updateMarket(action,payload={}){
  if(state.pending||state.marketError)return false;
  marketReadVersion++;state.pending=true;header();
  try{
    const response=await fetch(`${endpoint}/api/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(12500)});
    const data=await response.json();
    if(!response.ok)throw Error(data.error??'Worker did not accept the request.');
    state.market=data;state.marketError='';return true;
  }catch(e){toast(e.message==='Failed to fetch'?'Market worker unavailable.':e.message);return false;}
  finally{state.pending=false;render();}
}
async function setEnabled(next){
  if(state.mode==='market')await updateMarket('settings',{enabled:next});
  else {state.enabled=next;if(state.page==='watchlist')watchRows();else render();}
}

document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t||t.disabled)return;
  const {page,mode,symbol,range,action,profile,journal:jt}=t.dataset;
  if(page){go(page);return;}
  if(mode&&mode!==state.mode){
    stopReplay();state.mode=mode;state.draft=null;chartHover=false;
    if(mode==='market')getMarket();render();return;
  }
  if(symbol){selectSymbol(symbol);return;}
  if(range!==undefined){state.range=+range;chartHover=false;renderChart();return;}
  if(jt){state.journalTab=jt;journal();return;}
  if(profile){Object.assign(state.draft,PROFILE[profile],{profile});strategy();return;}
  if(action==='play')play();
  else if(action==='step'){actualStep();render();}
  else if(action==='replay-tools')replayTools();
  else if(action==='run-all'){
    stopReplay();while(actualStep()){} $('modal').close();render();toast('Replay complete. Review results in Trade journal.');
  } else if(action==='close')$('modal').close();
  else if(action==='connection')connection();
  else if(action==='add')addDialog();
  else if(action==='chart-style'){state.candles=!state.candles;renderChart();}
  else if(action==='volume'){state.volume=!state.volume;renderChart();}
  else if(action==='fills'){state.markers=!state.markers;renderChart();}
  else if(action==='enable-all')setEnabled(list().map(s=>s.symbol));
  else if(action==='disable-all')setEnabled([]);
  else if(action==='scan')updateMarket('scan');
  else if(action==='arm')updateMarket('arm',{armed:!state.market?.armed});
  else if(action==='csv')csv();
  else if(action==='import')$('checkpointFile').click();
  else if(action==='checkpoint')download('afterbell-replay.json',JSON.stringify({version:1,mode:state.replay.mode,index:state.replay.index,history:state.history,custom:state.custom,config:state.config,enabled:state.enabled}),'application/json');
  else if(action==='reset')open('Reset replay?',`<p>Clear the synthetic ledger and return to $10,000. Your watchlist and settings stay intact, and the market-data book is not affected.</p><div class="modal-actions">${btn('Cancel','replay-tools')}${btn('Reset to $10,000','reset-confirm',{type:'danger'})}</div>`);
  else if(action==='reset-confirm'){$('modal').close();newReplay(state.replay.mode);}
  else if(action==='backtest'){
    const cfg=config(), active=state.backStrategy==='all'?cfg.strategies:[state.backStrategy], syms=enabled(), mode=state.backTape;
    const r=makeReplay(syms,mode);
    while(replayStep(r,{...cfg,sessions:['regular'],strategies:active},syms)){}
    state.backtest={...metrics(r.book),open:Object.keys(r.book.positions).length,symbols:syms.length,mode,name:state.backStrategy==='all'?'Enabled strategies':STRATEGIES[state.backStrategy].name};
    renderBacktest();
  }
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='symbolSearch'){state.search=t.value;watchRows();}
  if(t.dataset.settingNumber&&state.draft){
    state.draft[t.dataset.settingNumber]=t.valueAsNumber;state.draft.profile='custom';
    $('riskForm').querySelector('.pill').textContent='CUSTOM';
    document.querySelectorAll('[data-profile]').forEach(b=>b.setAttribute('aria-pressed','false'));
  }
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(t.id==='sectorFilter'){state.filter=t.value;watchRows();}
  if(t.id==='sortFilter'){state.sort=t.value;watchRows();}
  if(t.id==='sideFilter'){state.side=t.value;journal();}
  if(t.id==='backStrategy')state.backStrategy=t.value;
  if(t.id==='backTape')state.backTape=t.value;
  if(t.id==='checkpointFile')restore(t.files[0]);
  const {scan,settingStrategy,settingSession}=t.dataset;
  if(scan){const old=enabled();setEnabled(t.checked?[...new Set([...old,scan])]:old.filter(s=>s!==scan));}
  if(settingStrategy&&state.draft){const a=new Set(state.draft.strategies);t.checked?a.add(settingStrategy):a.delete(settingStrategy);state.draft.strategies=[...a];}
  if(settingSession&&state.draft){const a=new Set(state.draft.sessions);t.checked?a.add(settingSession):a.delete(settingSession);state.draft.sessions=[...a];}
});
document.addEventListener('submit',async e=>{
  const form=e.target;e.preventDefault();
  if(form.id==='riskForm'){
    const next=settings(state.draft);
    if(state.mode==='market'){if(await updateMarket('settings',{config:next}))toast('Market settings saved');}
    else {state.config=next;state.draft=structuredClone(next);render();toast('Replay settings saved');}
  }
  if(form.id==='tapeForm'){const mode=$('tapeSelect').value;$('modal').close();newReplay(mode);}
  if(form.id==='addForm'){
    const s=new FormData(form).get('symbol').trim().toUpperCase(), exists=list().some(x=>x.symbol===s);
    if(!validSymbol(s)){$('addError').textContent='Enter a valid ticker, such as AAPL or BRK.B.';return;}
    if(!exists&&(state.mode==='market'?(state.market?.custom?.length??0):state.custom.length)>=20){$('addError').textContent='Custom ticker limit reached (20).';return;}
    if(state.mode==='market'){
      if(await updateMarket('settings',{add:s})){$('modal').close();toast(`${s} is on the scan list`);}
    }else{
      if(!exists){
        state.custom.push(s);
        const bars=tape(s,state.replay.mode);
        state.replay.data[s]=bars;state.replay.book.bars[s]=bars.slice(0,state.replay.index);state.replay.book.marks[s]=bars[state.replay.index-1].c;
      }
      state.enabled=[...new Set([...state.enabled,s])];state.filter='All';state.search='';$('modal').close();
      if(state.page==='overview')selectSymbol(s);else render();toast(`${s} is on the scan list`);
    }
  }
});
new ResizeObserver(()=>{chartHover=false;renderChart();}).observe($('chart'));
setInterval(clock,1000);
setInterval(()=>{if(state.mode==='market'&&!state.pending)getMarket();},12000);
render();
