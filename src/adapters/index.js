/**
 * EdgeStream Adapters
 * All adapters emit 'event' in the standard format:
 *   { id, timestamp, source, severity, payload }
 */

import { EventEmitter } from 'events';
import { WebSocket }    from 'ws';
import { Simulator, generateEvent } from '../../simulator/index.js';

// ─── WebSocket Adapter ────────────────────────────────────────────────────────
export class WebSocketAdapter extends EventEmitter {
  constructor(url, { token } = {}) {
    super();
    this._url   = token ? `${url}?token=${token}` : url;
    this._ws    = null;
    this._retry = true;
  }
  connect() {
    this._ws = new WebSocket(this._url);
    this._ws.on('open',    ()    => this.emit('connected'));
    this._ws.on('message', raw  => {
      try { const m = JSON.parse(raw); if (m.type==='event') this.emit('event', m.data); } catch(_){}
    });
    this._ws.on('close', () => { this.emit('disconnected'); if(this._retry) setTimeout(()=>this.connect(),2000); });
    this._ws.on('error', e => this.emit('error', e));
    return this;
  }
  disconnect() { this._retry=false; this._ws?.close(); }
}

// ─── Kafka Mock Adapter ───────────────────────────────────────────────────────
export class KafkaAdapter extends EventEmitter {
  constructor({ topic='edgestream', industry='trading', rate=500 } = {}) {
    super();
    this._sim = new Simulator({ rate, industry });
    this._topic = topic;
  }
  connect() {
    this._sim.on('event', ev => this.emit('event', { ...ev, _kafka_topic: this._topic, _kafka_offset: ev.id }));
    this._sim.start();
    this.emit('connected');
    return this;
  }
  disconnect() { this._sim.stop(); }
}

// ─── REST Polling Adapter ─────────────────────────────────────────────────────
export class RESTAdapter extends EventEmitter {
  constructor({ url, intervalMs=500, industry='trading' } = {}) {
    super();
    this._url = url;
    this._ms  = intervalMs;
    this._sim = new Simulator({ rate: 1, industry }); // fallback if no url
    this._timer = null;
  }
  connect() {
    // If no real URL, use simulator as mock REST source
    if (!this._url) {
      this._timer = setInterval(() => {
        const ev = generateEvent('trading');
        this.emit('event', { ...ev, _rest_polled: true });
      }, this._ms);
    }
    this.emit('connected');
    return this;
  }
  disconnect() { if(this._timer) clearInterval(this._timer); }
}

// ─── Redis Stream Adapter (mock) ──────────────────────────────────────────────
export class RedisAdapter extends EventEmitter {
  constructor({ stream='edgestream:events', industry='trading', rate=200 } = {}) {
    super();
    this._sim = new Simulator({ rate, industry });
    this._stream = stream;
  }
  connect() {
    this._sim.on('event', ev => this.emit('event', { ...ev, _redis_stream: this._stream, _redis_id: `${Date.now()}-0` }));
    this._sim.start();
    this.emit('connected');
    return this;
  }
  disconnect() { this._sim.stop(); }
}

// ─── File Tail Adapter ────────────────────────────────────────────────────────
export class FileTailAdapter extends EventEmitter {
  constructor({ filePath, industry='trading' } = {}) {
    super();
    this._file = filePath;
    this._industry = industry;
  }
  connect() {
    if (!this._file) {
      // Mock: generate file-like events
      this._timer = setInterval(() => {
        this.emit('event', generateEvent(this._industry));
      }, 100);
    } else {
      // Real file tail would use fs.watch or readline here
      this.emit('error', new Error('Real file path support: implement readline tail'));
    }
    this.emit('connected');
    return this;
  }
  disconnect() { if(this._timer) clearInterval(this._timer); }
}

// ─── Simulator Adapter ────────────────────────────────────────────────────────
export class SimulatorAdapter extends EventEmitter {
  constructor({ rate=1000, industry='trading', burst=false } = {}) {
    super();
    this._sim = new Simulator({ rate, industry, burst });
  }
  connect() {
    this._sim.on('event', ev => this.emit('event', ev));
    this._sim.start();
    this.emit('connected');
    return this;
  }
  disconnect() { this._sim.stop(); }
  setRate(r)   { this._sim.setRate(r); }
}
