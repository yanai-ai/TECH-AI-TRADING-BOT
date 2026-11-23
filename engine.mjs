export const UNIVERSE = [
  ['NVDA','NVIDIA','Tech',140],['AAPL','Apple','Tech',226],['MSFT','Microsoft','Tech',422],
  ['TSLA','Tesla','Tech',252],['SPY','SPDR S&P 500','ETF',571],['QQQ','Invesco QQQ','ETF',487],
  ['AMD','Advanced Micro Devices','Tech',156],['AMZN','Amazon','Tech',195],['GOOGL','Alphabet','Tech',178],
  ['META','Meta Platforms','Tech',584],['AVGO','Broadcom','Tech',174],['MU','Micron Technology','Tech',102],
  ['PLTR','Palantir','Tech',53],['NFLX','Netflix','Tech',91],['CRM','Salesforce','Tech',281],['ORCL','Oracle','Tech',168],
  ['COST','Costco','Consumer',884],['WMT','Walmart','Consumer',82],['KO','Coca-Cola','Consumer',68],['MCD','McDonald’s','Consumer',299],
  ['JPM','JPMorgan Chase','Finance',213],['BAC','Bank of America','Finance',41],['GS','Goldman Sachs','Finance',521],
  ['V','Visa','Finance',295],['XOM','Exxon Mobil','Energy',118],['CVX','Chevron','Energy',151],['COP','ConocoPhillips','Energy',109],
  ['UNH','UnitedHealth','Health',526],['LLY','Eli Lilly','Health',815],['JNJ','Johnson & Johnson','Health',159],
  ['IWM','iShares Russell 2000','ETF',223],['DIA','SPDR Dow Jones','ETF',424],['XLK','Technology Select Sector','ETF',226],
  ['XLF','Financial Select Sector','ETF',46],['XLE','Energy Select Sector','ETF',92],['GLD','SPDR Gold Shares','ETF',245],
  ['TLT','iShares 20+ Year Treasury','ETF',95],['SMH','VanEck Semiconductor','ETF',241],['VOO','Vanguard S&P 500','ETF',527],
].map(([symbol,name,sector,base])=>({symbol,name,sector,base}));
export const SEED_SYMBOLS = UNIVERSE.slice(0,8).map(s=>s.symbol);
export const STRATEGIES = {
  trend:{name:'Trend pullback',short:'Trend',description:'Buy a bounce off the fast EMA when the broader trend is rising.',indicator:'EMA 9 / 21'},
  dip:{name:'Dip reversal',short:'Dip',description:'Look for an oversold rebound with a real candle body.',indicator:'RSI 14 / EMA 21'},
  breakout:{name:'Volume breakout',short:'Breakout',description:'Require a close above recent highs with a volume surge.',indicator:'18-bar high / relative volume'},
  vwap:{name:'VWAP reclaim',short:'VWAP',description:'Look for a move back above session VWAP with volume confirmation.',indicator:'Session VWAP / relative volume'},
  range:{name:'Range rebound',short:'Range',description:'Buy lower-band reversals only when the moving averages are close.',indicator:'Bollinger Band / RSI 14'},
};
export const SESSION_LABEL = {pre:'Pre-market',regular:'Regular',after:'After-hours',overnight:'Overnight',closed:'Closed'};
export const PROFILE = {
  cautious:{risk:0.25,allocation:12,maxPositions:2,stop:0.65,target:1.4,trail:0.6,spread:16,loss:1.2},
  balanced:{risk:0.5,allocation:18,maxPositions:4,stop:0.8,target:1.6,trail:0.8,spread:24,loss:2},
  active:{risk:0.75,allocation:22,maxPositions:5,stop:0.95,target:1.9,trail:0.95,spread:32,loss:2.75},
};
export const DEFAULT = {profile:'balanced',...PROFILE.balanced,strategies:Object.keys(STRATEGIES),sessions:['pre','regular','after','overnight']};
export const validSymbol = s => typeof s==='string' && /^[A-Z][A-Z0-9]{0,6}(?:[.-][A-Z0-9]{1,3})?$/.test(s);
export const limit = (x,a,b) => Math.min(Math.max(x,a),b);
export function settings(raw={}) {
  const keys = {risk:[.05,2],allocation:[2,35],maxPositions:[1,10],stop:[.15,5],target:[.2,10],trail:[.15,5],spread:[5,60],loss:[.2,6]};
  const result={...DEFAULT,profile:Object.hasOwn(PROFILE,raw.profile)?raw.profile:'custom'};
  for(const [key,[lo,hi]] of Object.entries(keys)) {
    const v=raw[key]; result[key]=typeof v==='number' && Number.isFinite(v)?limit(v,lo,hi):DEFAULT[key];
  }
  result.maxPositions=Math.round(result.maxPositions);
  result.strategies=Array.isArray(raw.strategies)?Object.keys(STRATEGIES).filter(k=>raw.strategies.includes(k)):[...DEFAULT.strategies];
  result.sessions=Array.isArray(raw.sessions)?Object.keys(SESSION_LABEL).filter(k=>k!=='closed'&&raw.sessions.includes(k)):[...DEFAULT.sessions];
  return result;
}

const ET = new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const holidays=new Set([
  '2025-01-01','2025-01-09','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
  '2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
  '2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
  '2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25'
]);
const half=new Set(['2025-07-03','2025-11-28','2025-12-24','2026-11-27','2026-12-24','2027-11-26','2028-07-03','2028-11-24']);
const sessionCache=new Map();
export function marketSession(sec=Date.now()/1000) {
  const idx=Math.floor(sec/60);
  if(sessionCache.has(idx))return sessionCache.get(idx);
  const {year,month,day,hour,minute}=Object.fromEntries(ET.formatToParts(new Date(sec*1000)).map(p=>[p.type,p.value]));
  const date=`${year}-${month}-${day}`, time=Number(hour)*60+Number(minute);
  let dateObj=new Date(`${date}T00:00:00Z`);
  if(time>=1200) dateObj=new Date(+dateObj+86400000);
  const tradeDate=dateObj.toISOString().slice(0,10), weekday=dateObj.getUTCDay();
  const early=half.has(tradeDate), valid=weekday>0&&weekday<6&&!holidays.has(tradeDate)&&tradeDate>='2025-01-01'&&tradeDate<='2028-12-31';
  let key='closed';
  if(valid) {
    if(time>=1200||time<240) key='overnight';
    else if(time<570) key='pre';
    else if(time<(early?780:960)) key='regular';
    else if(time<(early?1020:1200)) key='after';
  }
  const result={key,tradeDate,early,time,label:SESSION_LABEL[key]};
  if(sessionCache.size>=7000)sessionCache.clear();
  sessionCache.set(idx,result);
  return result;
}

export const mean = a => a.length ? a.reduce((sum,x)=>sum+x,0)/a.length : 0;
function ema(a,n) { return a.reduce((previous,value,i)=>i ? previous+(value-previous)*2/(n+1):value,0); }
export function rsi(closes,n=14) {
  if(closes.length<n+1) return 50;
  const changes=closes.slice(-n-1).slice(1).map((v,i)=>v-closes[closes.length-n-1+i]);
  const up=mean(changes.map(v=>Math.max(0,v))), down=mean(changes.map(v=>Math.max(0,-v)));
  return !down ? (up?100:50):100-100/(1+up/down);
}
export const normalizeBar = b => {
  if(!b || ![b.t,b.o,b.h,b.l,b.c,b.v].every(Number.isFinite) || b.t%60 || b.l<=0 || b.l>Math.min(b.o,b.c) || b.h<Math.max(b.o,b.c) || b.v<0) return null;
  return {t:b.t,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v};
};
export function analyze(bars,selected=DEFAULT.strategies) {
  const x=bars.at(-1);
  if(bars.length<24||!x||bars.at(-5).t<x.t-8*60) return {setups:[],reason:'Waiting for enough recent candles'};
  const previous=bars.at(-2), tail=bars.slice(-45), closes=tail.map(b=>b.c);
  const fast=ema(closes,9), slow=ema(closes,21), oldSlow=ema(closes.slice(0,-4),21), oldFast=ema(closes.slice(0,-1),9);
  const strength=rsi(closes), oldRsi=rsi(closes.slice(0,-1));
  const local=bars.slice(-19,-1), resistance=Math.max(...local.map(b=>b.h));
  const rel=x.v/Math.max(mean(local.map(b=>b.v)),1);
  const atr=mean(bars.slice(-15).slice(1).map((b,i)=>Math.max(b.h-b.l,Math.abs(b.h-bars.at(-15+i).c),Math.abs(b.l-bars.at(-15+i).c))));
  const body=x.c-x.o, range=Math.max(x.h-x.l,.00001);
  const band=mean(closes.slice(-21,-1)), sd=Math.sqrt(mean(closes.slice(-21,-1).map(v=>(v-band)**2)));
  const session=marketSession(x.t);
  const cohort=bars.filter(b=>b.t>=x.t-12*3600).filter(b=>{const s=marketSession(b.t);return s.key===session.key&&s.tradeDate===session.tradeDate;});
  const denom=cohort.reduce((sum,b)=>sum+b.v,0);
  const vwap=denom?cohort.reduce((sum,b)=>sum+(b.h+b.l+b.c)/3*b.v,0)/denom:0;
  const setups=[];
  const add=(id,score,reason)=>{if(selected.includes(id))setups.push({id,score:Math.round(limit(score,0,99)),reason});};
  const metrics={strength,rel,fast,slow,vwap,atr};
  if(x.v<=0||atr/x.c>.035) return {setups,metrics,reason:'Liquidity or volatility filter'};
  if(fast>slow&&slow>oldSlow&&x.l<=Math.max(fast,oldFast)*1.0006&&x.c>fast&&body>0&&strength>48&&strength<76&&rel>=.64)
    add('trend',65+(strength-48)*.56+Math.min(rel,3)*5,`Rising EMAs, bounce from EMA 9`);
  if(x.l<slow*.998&&oldRsi<43&&strength>oldRsi+1&&body/range>.25&&rel>=.55)
    add('dip',65+(43-oldRsi)*.6+Math.min(rel,3)*5,`Oversold rebound · RSI ${Math.round(strength)}`);
  if(x.c>resistance&&body/range>.40&&rel>=1.3&&strength<87)
    add('breakout',67+Math.min(rel,3.2)*7,`New 18-bar high · ${rel.toFixed(1)}× volume`);
  if(cohort.length>12&&vwap>0&&previous.c<vwap&&x.c>vwap&&body>0&&rel>=1.02&&strength<75)
    add('vwap',65+Math.min(rel,3)*7,`Reclaimed session VWAP · ${rel.toFixed(1)}× volume`);
  if(sd>0&&Math.abs(fast-slow)/x.c<.004&&x.l<band-1.8*sd&&x.c>band-1.8*sd&&body>0&&strength>oldRsi&&strength<58)
    add('range',65+(58-strength)*.45+Math.min(rel,3)*3,`Rebound off lower band in a flat trend`);
  setups.sort((a,b)=>b.score-a.score);
  return {setups,metrics,reason:'No qualifying setup'};
}

export function createBook() {
  return {initial:10000,cash:10000,positions:{},marks:{},bars:{},fills:[],logs:[],pending:{},lastExit:{},equity:[],dayKey:'',dayOpen:10000,fillId:0};
}
export const value = book => book.cash+Object.entries(book.positions).reduce((s,[symbol,p])=>s+p.qty*(book.marks[symbol]||p.entry),0);
export function metrics(book) {
  const exits=book.fills.filter(t=>t.side==='SELL'), winners=exits.filter(t=>t.pnl>0);
  const wins=winners.reduce((s,t)=>s+t.pnl,0), losses=-exits.filter(t=>t.pnl<0).reduce((s,t)=>s+t.pnl,0);
  let peak=book.initial, maxDD=0;
  for(const p of book.equity){peak=Math.max(peak,p.value);maxDD=Math.max(maxDD,1-p.value/peak);}
  return {equity:value(book),pnl:value(book)-book.initial,realized:exits.reduce((s,t)=>s+t.pnl,0),wins:winners.length,closed:exits.length,winRate:exits.length?winners.length/exits.length:null,profitFactor:losses?wins/losses:null,maxDD};
}
export function note(book,t,kind,title,body,symbol='') {
  book.logs.unshift({t,kind,title,body,symbol}); if(book.logs.length>160)book.logs.pop();
}
export function ingest(book,entries,{config=DEFAULT,enabled=SEED_SYMBOLS,benchmark='SPY',quotes=null,now=null,source='Replay'}={}) {
  const clean=Object.entries(entries).filter(([s,b])=>validSymbol(s)&&normalizeBar(b)&&(!book.bars[s]?.length||b.t>book.bars[s].at(-1).t)).sort(([a],[b])=>a.localeCompare(b));
  if(!clean.length)return 0;
  const t=now??Math.max(...clean.map(([,b])=>b.t)), current=marketSession(t);
  if(book.dayKey!==current.tradeDate){book.dayKey=current.tradeDate;book.dayOpen=value(book);}
  const session=current.key, canTrade=config.sessions.includes(session);
  const watched=new Set(enabled);
  const fill=(side,symbol,price,qty,reason,kind,candleTime)=>{
    const p=book.positions[symbol];
    let pnl=null;
    if(side==='BUY')book.cash-=price*qty;
    else {book.cash+=price*qty;pnl=(price-p.entry)*qty;delete book.positions[symbol];book.lastExit[symbol]=t;}
    book.fills.unshift({id:++book.fillId,t,candleTime,side,symbol,price,qty,reason,strategy:kind,session,source,pnl});
    note(book,t,side.toLowerCase(),`${side==='BUY'?'Paper buy':'Paper sell'} · ${symbol}`,reason,symbol);
  };
  for(const [s,b] of clean){
    (book.bars[s]??=[]).push(b);
    if(book.bars[s].length>440)book.bars[s].shift();
    book.marks[s]=quotes?b.c:b.o;
  }
  const openEquity=value(book);let replayCash=book.cash,replaySlots=Object.keys(book.positions).length;
  const ordered=[...clean].sort(([a],[b])=>Number(Boolean(book.positions[b]))-Number(Boolean(book.positions[a]))||(book.pending[b]?.score??0)-(book.pending[a]?.score??0)||a.localeCompare(b));
  for(const [symbol,bar] of ordered) {
    const ownSession=marketSession(bar.t);
    if(!canTrade||ownSession.key!==session||ownSession.tradeDate!==current.tradeDate)continue;
    const q=quotes?.[symbol], qAge=q?t-q.t:Infinity, ageLimit=session==='regular'?85:120;
    const fresh=!quotes||(t-bar.t>=60&&t-bar.t<=155);
    const quoteOk=!quotes||(qAge>=-3&&qAge<=ageLimit&&q.t>=bar.t+60&&q.bid>0&&q.ask>=q.bid&&marketSession(q.t).key===session&&marketSession(q.t).tradeDate===current.tradeDate);
    const spread=quotes?(quoteOk?(q.ask-q.bid)/((q.bid+q.ask)/2)*1e4:Infinity):(session==='regular'?6:18);
    const liquid=bar.v*bar.c>=(session==='regular'?15000:3500);
    const entryOk=fresh&&quoteOk&&spread<=Math.min(config.spread,session==='regular'?60:30)&&liquid;
    const exitOk=fresh&&quoteOk&&spread<=Math.min(config.spread*2,session==='regular'?120:55);
    const slip=(session==='regular'?.00025:.00065);
    const p=book.positions[symbol]; let exited=false;
    if(p&&exitOk) {
      const market=quotes?q.bid:bar.o, stop=Math.max(p.stop,p.high>=p.entry+(p.entry-p.stop)?p.high*(1-p.trail/100):0);
      let exitPrice, reason;
      if((quotes?market:bar.l)<=stop){exitPrice=Math.min(market,stop);reason=stop>p.stop?'Trailing stop':'Stop loss';}
      else if((quotes?market:bar.h)>=p.target){exitPrice=p.target;reason='Profit target';}
      if(exitPrice){fill('SELL',symbol,exitPrice*(1-slip-(quotes?0:spread/20000)),p.qty,reason,p.strategy,bar.t);exited=true;}
      else p.high=Math.max(p.high,quotes?market:bar.h);
    }
    const pending=book.pending[symbol];
    delete book.pending[symbol];
    if(!p&&!exited&&pending&&watched.has(symbol)&&config.strategies.includes(pending.id)&&pending.t+60===bar.t&&pending.session===session&&pending.tradeDate===current.tradeDate) {
      const eq=quotes?value(book):openEquity, dayLoss=100*(eq/book.dayOpen-1), crowded=(quotes?Object.keys(book.positions).length:replaySlots)>=config.maxPositions;
      const reference=quotes?q?.ask:bar.o, drift=Math.abs(reference/pending.close-1);
      const spaced=!book.lastExit[symbol]||t-book.lastExit[symbol]>=5*60;
      const tooFar=drift>(session==='regular'?.006:.0035);
      if(entryOk&&!crowded&&dayLoss>-config.loss&&spaced&&!tooFar) {
        const price=reference*(1+slip+(quotes?0:spread/20000));
        const riskDistance=Math.max(price*config.stop/100,pending.atr*1.3);
        const maxSpend=Math.min(quotes?book.cash:replayCash,eq*config.allocation/100*(session==='regular'?1:.55));
        const qty=Math.floor(Math.min(maxSpend/price,eq*config.risk/100/riskDistance));
        if(qty>0){
          book.positions[symbol]={qty,entry:price,stop:Math.max(.01,price-riskDistance),target:price*(1+config.target/100),high:price,trail:config.trail,t,strategy:pending.id};
          fill('BUY',symbol,price,qty,pending.reason,pending.id,bar.t);
          if(!quotes){replayCash-=price*qty;replaySlots++;}
          if(!quotes&&bar.l<=book.positions[symbol].stop){
            const stop=book.positions[symbol].stop;
            fill('SELL',symbol,stop*(1-slip-spread/20000),qty,'Stop loss on entry bar',pending.id,bar.t);
          }
        }
      } else {
        const reason=!fresh||!quoteOk?'Missing or stale market data':!entryOk?'Spread or liquidity limit':crowded?'Position cap reached':dayLoss<=-config.loss?'Daily loss limit reached':!spaced?'Re-entry cooldown':'Price moved away from the setup';
        note(book,t,'guard',`Entry skipped · ${symbol}`,reason,symbol);
      }
    }
    if(book.positions[symbol]||!watched.has(symbol)||!entryOk||exited)continue;
    const result=analyze(book.bars[symbol],config.strategies), setup=result.setups[0];
    if(!setup)continue;
    const marketBars=book.bars[benchmark]??[];
    if(['trend','breakout','vwap'].includes(setup.id)&&symbol!==benchmark&&marketBars.length>=6&&marketBars.at(-1).t>=bar.t-120&&marketBars.at(-1).c<marketBars.at(-6).c*.994) {
      note(book,t,'guard',`Entry skipped · ${symbol}`,'SPY market filter: sharp 5-bar decline',symbol); continue;
    }
    const floor=session==='regular'?66:73;
    if(setup.score<floor) continue;
    book.pending[symbol]={...setup,t:bar.t,close:bar.c,atr:result.metrics.atr,session,tradeDate:current.tradeDate};
    note(book,t,'signal',`${STRATEGIES[setup.id].name} · ${symbol}`,`${setup.reason} · score ${setup.score}/99`,symbol);
  }
  for(const [s,b] of clean)book.marks[s]=b.c;
  const point={t,value:value(book)};
  if(book.equity.at(-1)?.t===t)book.equity[book.equity.length-1]=point;
  else book.equity.push(point);
  if(book.equity.length>18000)book.equity.shift();
  return clean.length;
}

export const TAPES={mixed:'Mixed session',trend:'Trending session',volatile:'Volatile session',bear:'Selloff stress test'};
export const START_INDEX=101, TAPE_LENGTH=276;
const SEED=Date.parse('2026-10-08T13:30:00Z')/1000;
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
export function tape(symbol,mode='mixed'){
  const item=UNIVERSE.find(s=>s.symbol===symbol), base=item?.base??(45+hash(symbol)%150);
  let seed=hash(`${symbol}${mode}`);
  const draw=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const phase=(hash(symbol)%19)/11, factor=symbol==='NVDA'?1.15:item?.sector==='ETF'?.62:1;
  let open=base*(1.001+(draw()-.5)*.012);
  return Array.from({length:TAPE_LENGTH},(_,i)=>{
    let drift=(i<35?.00035:i<53?-.0016:i<72?.0015:i<85?-.00045:i<122?.00125:i<146?-.00115:i<168?.00095:i<205?-.00055:i<238?.00135:.00038);
    if(mode==='trend')drift=drift*.72+.00043;
    if(mode==='volatile')drift=drift*1.32+Math.sin(i*.38)*.00125;
    if(mode==='bear')drift=drift*.73-.0009+Math.sin(i*.21)*.00115;
    const c=open*(1+factor*(drift+Math.sin(i*.31+phase)*.00082+(draw()-.49)*.00355));
    const h=Math.max(c,open)*(1+draw()*.0019), l=Math.min(c,open)*(1-draw()*.0018);
    const v=Math.round((2500+draw()*36000+Math.abs(c-open)/open*3600000)*(symbol==='NVDA'?1.35:1)*(i<30?1.5:1));
    const bar={t:SEED+i*60,o:open,h,l,c,v};open=c;
    return bar;
  });
}
export function makeReplay(symbols=UNIVERSE.map(s=>s.symbol),mode='mixed') {
  const data=Object.fromEntries([...new Set([...symbols,'SPY'])].map(s=>[s,tape(s,mode)]));
  const book=createBook();
  for(const [s,list] of Object.entries(data)){book.bars[s]=list.slice(0,START_INDEX);book.marks[s]=list[START_INDEX-1].c;}
  book.equity.push({t:SEED+(START_INDEX-1)*60,value:book.initial});
  return {data,book,index:START_INDEX,mode};
}
export function replayStep(replay,config,enabled) {
  if(replay.index>=TAPE_LENGTH)return false;
  const bars=Object.fromEntries(Object.entries(replay.data).map(([s,list])=>[s,list[replay.index]]));
  ingest(replay.book,bars,{config,enabled,source:'Synthetic replay'});
  replay.index++;
  return true;
}
