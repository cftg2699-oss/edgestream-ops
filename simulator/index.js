import { EventEmitter } from 'events';

// ─── Templates ────────────────────────────────────────────────────────────────

const rnd  = arr => arr[Math.floor(Math.random() * arr.length)];
const rndN = (min, max) => (Math.random() * (max - min) + min);
const ip   = () => `${rndN(1,254)|0}.${rndN(1,254)|0}.${rndN(1,254)|0}.${rndN(1,254)|0}`;

const TEMPLATES = {
  trading: [
    { src: 'NYSE',   sev: 'critical', pay: () => ({ sym: rnd(['AAPL','TSLA','MSFT','NVDA','AMZN','META']), px: rndN(50,800).toFixed(2), vol: (rndN(100,50000)|0), side: rnd(['BUY','SELL']) }) },
    { src: 'NASDAQ', sev: 'high',     pay: () => ({ sym: rnd(['GOOG','NFLX','AMD','INTC','QCOM']), bid: rndN(50,500).toFixed(2), ask: rndN(50,500).toFixed(2), sprd: rndN(0,0.5).toFixed(3) }) },
    { src: 'RISK',   sev: 'medium',   pay: () => ({ port: rnd(['P1','P2','P3','P4']), var: (rndN(0,1e6)|0), pnl: (rndN(-50000,50000)).toFixed(2) }) },
    { src: 'FIX',    sev: 'info',     pay: () => ({ ordId: (rndN(1e5,1e6)|0), status: rnd(['FILLED','PARTIAL','NEW','CANCELLED']), qty: (rndN(1,5000)|0) }) },
    { src: 'DARK',   sev: 'high',     pay: () => ({ sym: rnd(['AAPL','TSLA']), hidden: (rndN(1000,100000)|0), venue: rnd(['IEX','BATS','EDGX']) }) },
  ],
  soc: [
    { src: 'FWLL',   sev: 'critical', pay: () => ({ src_ip: ip(), dst_ip: ip(), port: (rndN(1,65535)|0), act: rnd(['BLOCK','DROP','ALERT']), rule: `R${(rndN(1,999)|0)}` }) },
    { src: 'IDS',    sev: 'high',     pay: () => ({ sig: rnd(['SQL_INJ','XSS','BRUTE','RFI','SSRF']), src: ip(), confidence: rndN(60,100).toFixed(0)+'%' }) },
    { src: 'AUTH',   sev: 'medium',   pay: () => ({ user: rnd(['admin','root','svc_acc','deploy']), result: rnd(['FAIL','FAIL','FAIL','OK']), attempts: (rndN(1,20)|0) }) },
    { src: 'SIEM',   sev: 'info',     pay: () => ({ rule: `SIEM-${(rndN(100,999)|0)}`, score: rndN(0,100).toFixed(1), host: `srv-${(rndN(1,200)|0)}` }) },
    { src: 'EDR',    sev: 'critical', pay: () => ({ proc: rnd(['cmd.exe','powershell','bash']), pid: (rndN(100,65535)|0), hash: Math.random().toString(16).slice(2,18) }) },
  ],
  telecom: [
    { src: 'RAN',    sev: 'critical', pay: () => ({ cell: `C${(rndN(1,999)|0)}`, kpi: rnd(['RACH','HO','BLER','RSRP']), val: rndN(0,100).toFixed(2), thr: '5.00' }) },
    { src: 'CORE',   sev: 'high',     pay: () => ({ nf: rnd(['AMF','SMF','UPF','PCF','AUSF']), cpu: rndN(0,100).toFixed(1), mem: rndN(0,100).toFixed(1), rps: (rndN(100,10000)|0) }) },
    { src: 'OSS',    sev: 'medium',   pay: () => ({ alm: `ALM-${(rndN(1,9999)|0)}`, node: `eNB-${(rndN(1,999)|0)}`, state: rnd(['ACTIVE','CLEARED','ACK','UNACK']) }) },
    { src: 'CDR',    sev: 'info',     pay: () => ({ msisdn: `+1${(rndN(2e9,3e9)|0)}`, dur: (rndN(0,3600)|0), bytes: (rndN(0,1e6)|0) }) },
    { src: 'VoLTE',  sev: 'high',     pay: () => ({ call: (rndN(1e6,9e6)|0), mos: rndN(1,5).toFixed(2), jitter: rndN(0,50).toFixed(1)+'ms', pkt_loss: rndN(0,5).toFixed(2)+'%' }) },
  ],
};

let _id = 1;

export function generateEvent(industry = 'trading') {
  const tmpl = rnd(TEMPLATES[industry] || TEMPLATES.trading);
  return {
    id:        _id++,
    timestamp: Date.now(),
    source:    tmpl.src,
    severity:  tmpl.sev,
    payload:   tmpl.pay(),
  };
}

export class Simulator extends EventEmitter {
  constructor({ rate = 100, industry = 'trading', burst = false } = {}) {
    super();
    this.rate     = rate;
    this.industry = industry;
    this.burst    = burst;
    this._timer   = null;
    this._count   = 0;
    this._start   = null;
    this._eventsPerSec = 0;
    this._secondCount  = 0;
    this._secondTimer  = null;
  }

  start() {
    this._start = Date.now();
    this._count = 0;

    // Track events/sec
    this._secondTimer = setInterval(() => {
      this._eventsPerSec = this._secondCount;
      this._secondCount  = 0;
    }, 1000);

    const intervalMs = Math.max(0.2, 1000 / this.rate);

    // For very high rates, batch multiple events per tick
    const batchSize = this.rate > 500 ? Math.ceil(this.rate / 200) : 1;
    const tickMs    = this.rate > 500 ? Math.max(1, Math.floor(1000 / (this.rate / batchSize))) : intervalMs;

    this._timer = setInterval(() => {
      for (let b = 0; b < batchSize; b++) {
        const ev = generateEvent(this.industry);
        this._count++;
        this._secondCount++;
        this.emit('event', ev);
      }

      if (this.burst && Math.random() < 0.02) {
        for (let i = 0; i < 20; i++) {
          const ev = generateEvent(this.industry);
          this._count++;
          this._secondCount++;
          this.emit('event', ev);
        }
      }
    }, tickMs);

    return this;
  }

  stop() {
    if (this._timer)       { clearInterval(this._timer);       this._timer = null; }
    if (this._secondTimer) { clearInterval(this._secondTimer); this._secondTimer = null; }
    return this;
  }

  setRate(r) {
    const was = !!this._timer;
    this.stop();
    this.rate = r;
    if (was) this.start();
  }

  stats() {
    const elapsed = ((Date.now() - (this._start || Date.now())) / 1000) || 0.001;
    return { count: this._count, elapsed: elapsed.toFixed(1), eventsPerSec: this._eventsPerSec, rate: (this._count / elapsed).toFixed(1) };
  }
}
