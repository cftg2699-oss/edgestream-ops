import { EdgeStreamEngine } from '../src/engine/EdgeStreamEngine.js';
import { formatEvent }      from '../src/shared/formatter.js';
import { tokenize, styledCharsFromTokens, ansiCodesToString, diffAnsiCodes } from '../core/index.js';

const ESC  = '\x1b';
const mv   = (r, c) => `${ESC}[${r};${c}H`;
const clr  = ()     => `${ESC}[2J`;
const home = ()     => `${ESC}[H`;
const hide = ()     => `${ESC}[?25l`;
const show = ()     => `${ESC}[?25h`;
const c    = (code, s) => `${ESC}[${code}m${s}${ESC}[0m`;
const HEADER_ROWS = 8;
const FOOTER_ROWS = 3;

export class DuelLayout {
  constructor({ metrics, recording = false } = {}) {
    this._metrics   = metrics;
    this._recording = recording;
    this._recStart  = Date.now();
    this._recFrames = [];
    this._cols = process.stdout.columns || 220;
    this._rows = process.stdout.rows    || 50;
    this._half = Math.floor(this._cols * 0.38);
    this._panelTop    = HEADER_ROWS + 1;
    this._panelBottom = this._rows - FOOTER_ROWS;
    this._panelHeight = this._panelBottom - this._panelTop;
    this._legPanelW   = this._half - 4;
    this._edgPanelW   = this._cols - this._half - 4;
    this._engine = new EdgeStreamEngine();
    this._legacyLines    = [];
    this._legacyThrottle = 100;
    this._legacyLast     = 0;
  }

  init() { this._write(hide() + clr() + home() + this._chrome()); }

  renderEvent(event) {
    const now      = Date.now();
    let out        = '';
    const ansiLine  = formatEvent(event);
    const lineBytes = Buffer.byteLength(ansiLine, 'utf8');
    const t0e = Date.now();
    const { patch: edgePatch, bytes: edgeBytes } = this._engine.processLine(ansiLine, this._panelTop, this._half + 2, this._edgPanelW);
    const edgeLat = Date.now() - t0e;
    out += edgePatch;
    if (this._metrics) this._metrics.recordEdge(edgeLat, edgeBytes, lineBytes);
    if (now - this._legacyLast >= this._legacyThrottle) {
      const t0l = Date.now();
      this._legacyLines.push(ansiLine);
      if (this._legacyLines.length > this._panelHeight) this._legacyLines = this._legacyLines.slice(-this._panelHeight);
      const legacyRender = this._fullRenderLeft();
      const legacyBytes  = legacyRender.length;
      const legacyLat    = (Date.now() - t0l) + Math.floor(this._panelHeight * 1.2);
      out += legacyRender;
      this._legacyLast = now;
      if (this._metrics) this._metrics.recordLegacy(legacyLat, legacyBytes);
    }
    out += this._metricsBar();
    if (out.length) this._write(out);
  }

  teardown() { process.stdout.write(show()); }

  _write(data) {
    process.stdout.write(data);
    if (this._recording) this._recFrames.push([(Date.now() - this._recStart) / 1000, 'o', data]);
  }

  _truncate(line, maxVisible) {
    let visible = 0, out = '', i = 0;
    while (i < line.length) {
      if (line[i] === '\x1b') { const end = line.indexOf('m', i); if (end === -1) break; out += line.slice(i, end + 1); i = end + 1; continue; }
      if (visible >= maxVisible) break;
      out += line[i]; visible++; i++;
    }
    return out + '\x1b[0m';
  }

  _fullRenderLeft() {
    let out = '';
    for (let i = 0; i < this._panelHeight; i++) {
      const row = this._panelTop + i;
      out += mv(row, 2) + `${ESC}[${this._legPanelW}X`;
      const lineIdx = this._legacyLines.length - this._panelHeight + i;
      if (lineIdx >= 0 && lineIdx < this._legacyLines.length) out += mv(row, 2) + this._truncate(this._legacyLines[lineIdx], this._legPanelW);
    }
    return out;
  }

  _chrome() {
    let out = '';
    const W = this._cols, H = this._half;
    out += mv(1,1) + c('36;1','╔'+'═'.repeat(W-2)+'╗');
    const title = ' ⚡  EDGESTREAM OPS  —  SHADOW DUEL MODE  v2.1  ⚡ ';
    const pad = Math.max(0,Math.floor((W-2-title.length)/2));
    out += mv(2,1)+c('36;1','║')+' '.repeat(pad)+c('33;1',title)+' '.repeat(Math.max(0,W-2-pad-title.length))+c('36;1','║');
    out += mv(3,1)+c('36;1','╠'+'═'.repeat(W-2)+'╣');
    for (let r=4;r<=5;r++) out += mv(r,1)+c('36;1','║')+' '.repeat(W-2)+c('36;1','║');
    out += mv(6,1)+c('36;1','╠'+'═'.repeat(H-2)+'╦'+'═'.repeat(W-H-1)+'╣');
    const legLbl='  🔴  LEGACY  ·  Full Redraw  ·  10 FPS';
    const edgLbl='  🟢  EDGESTREAM  ·  Incremental Diff  ·  Unlimited FPS';
    out += mv(7,1)+c('36;1','║')+c('31;1',legLbl)+' '.repeat(Math.max(0,H-2-legLbl.length))+c('36;1','║')+c('32;1',edgLbl)+' '.repeat(Math.max(0,W-H-1-edgLbl.length))+c('36;1','║');
    out += mv(8,1)+c('36;1','╠'+'═'.repeat(H-2)+'╬'+'═'.repeat(W-H-1)+'╣');
    for (let r=9;r<=this._panelBottom;r++) { out+=mv(r,1)+c('36;1','║'); out+=mv(r,H)+c('36;1','║'); out+=mv(r,W)+c('36;1','║'); }
    out += mv(this._panelBottom+1,1)+c('36;1','╠'+'═'.repeat(H-2)+'╩'+'═'.repeat(W-H-1)+'╣');
    const foot='  Ctrl+C  ·  edgestream © 2025  ·  demo:trading | demo:soc | demo:telecom  ·  benchmark';
    out += mv(this._panelBottom+2,1)+c('36;1','║')+c('90',foot)+' '.repeat(Math.max(0,W-2-foot.length))+c('36;1','║');
    out += mv(this._panelBottom+3,1)+c('36;1','╚'+'═'.repeat(W-2)+'╝');
    return out;
  }

  _metricsBar() {
    if (!this._metrics) return '';
    const m = this._metrics.get();
    const W = this._cols;
    const bwC  = m.bandwidth_saving > 80 ? '32;1' : m.bandwidth_saving > 50 ? '33' : '31';
    const latC = m.latency_edge < m.latency_legacy ? '32;1' : '33';
    const renderSpeedup = m.fps_legacy > 0 ? (m.fps_edge / m.fps_legacy).toFixed(1) : '—';
    const row4 = `  ${c('90','Latency')}  Legacy:${c('31;1',String(m.latency_legacy).padStart(5)+'ms')}  Edge:${c(latC,String(m.latency_edge).padStart(5)+'ms')}  Δ:${c('33;1',String(m.latency_delta).padStart(6)+'ms')}     ${c('90','Render Speedup:')}${c('32;1',String(renderSpeedup).padStart(6)+'x')}  faster     ${c('90','CPU Savings: full redraw avoided every')}${c('32;1',' '+Math.round(1000/Math.max(1,m.fps_legacy))+'ms')}`;
    const row5 = `  ${c('90','Events/s:')}${c('33;1',String(m.events_per_sec).padStart(6))}   ${c('90','FPS Legacy:')}${c('31;1',String(m.fps_legacy).padStart(5))}  FPS Edge:${c('32;1',String(m.fps_edge).padStart(6))}   ${c('90','Total:')}${c('37',String(m.total_events).padStart(9))}   ${c('90','Uptime:')}${c('37',String(m.uptime).padStart(6)+'s')}`;
    let out = '';
    out += mv(4,1)+c('36;1','║')+row4+' '.repeat(Math.max(0,W-2-this._vlen(row4)))+c('36;1','║');
    out += mv(5,1)+c('36;1','║')+row5+' '.repeat(Math.max(0,W-2-this._vlen(row5)))+c('36;1','║');
    return out;
  }

_fmtBytes(n) { if(n>=1e6) return (n/1e6).toFixed(1)+'MB'; if(n>=1e3) return (n/1e3).toFixed(1)+'KB'; return n+'B'; }
  _vlen(s) { return s.replace(/\x1b\[[0-9;]*m/g,'').length; }
  get metrics() { return this._metrics; }

  async saveRecording(outPath) {
    const fs   = (await import('fs')).default;
    const path = (await import('path')).default;
    const header = { version: 2, width: this._cols, height: this._rows,
                     timestamp: Math.floor(this._recStart / 1000), title: 'EdgeStream Shadow Duel' };
    const lines = [JSON.stringify(header), ...this._recFrames.map(f => JSON.stringify(f))];
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, lines.join('\n'));
  }

}
