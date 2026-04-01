import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const METRICS_DIR = path.resolve(__dirname, '../../metrics');

export class MetricsCollector {
  constructor() { this.reset(); }

  reset() {
    this._t0            = Date.now();
    this._legLat        = [];
    this._edgLat        = [];
    this._legBytes      = 0;
    this._edgBytes      = 0;
    this._legFrames     = 0;
    this._edgFrames     = 0;
    this._totalEvents   = 0;
    this._eps           = 0;
    this._epsWindow     = 0;
    this._epsLast       = Date.now();
  }

  recordLegacy(latMs, bytes) {
    this._legLat.push(latMs);
    if (this._legLat.length > 200) this._legLat.shift();
    this._legBytes += bytes;
    this._legFrames++;
  }

  recordEdge(latMs, bytes) {
    this._edgLat.push(latMs);
    if (this._edgLat.length > 200) this._edgLat.shift();
    this._edgBytes += bytes;
    this._edgFrames++;
    this._totalEvents++;
    this._epsWindow++;
    const now = Date.now();
    if (now - this._epsLast >= 1000) {
      this._eps = this._epsWindow;
      this._epsWindow = 0;
      this._epsLast = now;
    }
  }

  _avg(arr) { return arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : 0; }

  get() {
    const elapsed = ((Date.now() - this._t0) / 1000) || 0.001;
    const ll = parseFloat(this._avg(this._legLat).toFixed(2));
    const el = parseFloat(this._avg(this._edgLat).toFixed(2));
    const legPerFrame = this._legFrames > 0 ? this._legBytes / this._legFrames : 0;
    const edgPerFrame = this._edgFrames > 0 ? this._edgBytes / this._edgFrames : 0;
    const bwSave = legPerFrame > 0
      ? parseFloat((((legPerFrame - edgPerFrame) / legPerFrame) * 100).toFixed(1))
      : 0;
    return {
      latency_legacy:    ll,
      latency_edge:      el,
      latency_delta:     parseFloat((ll - el).toFixed(2)),
      bandwidth_legacy:  Math.round(legPerFrame),
      bandwidth_edge:    Math.round(edgPerFrame),
      bandwidth_saving:  bwSave,
      events_per_sec:    this._eps,
      fps_legacy:        parseFloat((this._legFrames / elapsed).toFixed(1)),
      fps_edge:          parseFloat((this._edgFrames / elapsed).toFixed(1)),
      total_events:      this._totalEvents,
      uptime:            parseFloat(elapsed.toFixed(1)),
    };
  }

  export() {
    const data = this.get();
    try {
      fs.mkdirSync(METRICS_DIR, { recursive: true });
      fs.writeFileSync(path.join(METRICS_DIR, 'last-run.json'), JSON.stringify(data, null, 2));
    } catch (_) {}
    return data;
  }
}
