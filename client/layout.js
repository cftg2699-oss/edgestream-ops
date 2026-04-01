/**
 * DuelLayout
 * ANSI split-screen renderer: LEFT=Legacy (full redraw, 10 FPS) | RIGHT=EdgeStream (incremental diff)
 *
 * Uses explicit ANSI escape codes for all cursor positioning:
 *   \x1b[H        — cursor home
 *   \x1b[2J       — clear screen
 *   \x1b[r;cH     — absolute cursor positioning
 */

import { EdgeStreamEngine } from '../src/engine/EdgeStreamEngine.js';
import { formatEvent }      from '../src/shared/formatter.js';
import { tokenize, styledCharsFromTokens, ansiCodesToString, diffAnsiCodes } from '../core/index.js';

// ─── ANSI primitives ──────────────────────────────────────────────────────────
const ESC = '\x1b';
const mv   = (r, c) => `${ESC}[${r};${c}H`;
const clr  = () => `${ESC}[2J`;
const home = () => `${ESC}[H`;
const rst  = () => `${ESC}[0m`;
const hide = () => `${ESC}[?25l`;
const show = () => `${ESC}[?25h`;
const c    = (code, s) => `${ESC}[${code}m${s}${ESC}[0m`;

// ─── Layout geometry ──────────────────────────────────────────────────────────
const HEADER_ROWS  = 8;   // rows for title + metrics
const FOOTER_ROWS  = 3;
const PANEL_COL    = 2;   // internal padding

export class DuelLayout {
  constructor({ metrics, recording = false } = {}) {
    this._metrics   = metrics;
    this._recording = recording;
    this._recStart  = Date.now();
    this._recFrames = [];

    this._cols = process.stdout.columns || 220;
    this._rows = process.stdout.rows    || 50;
    this._half = Math.floor(this._cols * 0.38);

    // Panel dimensions (1-based terminal rows/cols)
    this._panelTop    = HEADER_ROWS + 1;
    this._panelBottom = this._rows - FOOTER_ROWS;
    this._panelHeight = this._panelBottom - this._panelTop;
    this._panelW      = this._half - 3;

    // EdgeStream incremental engine (right panel)
    this._engine = new EdgeStreamEngine();

    // Legacy full-state buffer (left panel) — plain ANSI strings
    this._legacyLines = [];
    this._legacyThrottle = 100; // 10 FPS
    this._legacyLast     = 0;

    // Track previous left-panel render for byte counting
    this._legacyPrevRender = '';
  }

  // ── Public API ────────────────────────────────────────────────────────────

  init() {
    let out = '';
    out += hide();
    out += clr();
    out += home();
    out += this._chrome();
    this._write(out);
  }

  renderEvent(event) {
    const now = Date.now();
    let out   = '';

    const ansiLine = formatEvent(event);

    // ── RIGHT: EdgeStream incremental diff ───────────────────────────────
    const t0e = Date.now();
    const { patch: edgePatch, bytes: edgeBytes } = this._engine.processLine(
      ansiLine,
      this._panelTop,
      this._half + 2,   // right panel col start
      this._panelW
    );
    const edgeLat = Date.now() - t0e;
    out += edgePatch;
    const lineBytes = Buffer.byteLength(ansiLine);
    if (this._metrics) this._metrics.recordEdge(edgeLat, edgeBytes, lineBytes);

    // ── LEFT: Legacy full redraw, throttled to 10 FPS ───────────────────
    if (now - this._legacyLast >= this._legacyThrottle) {
      const t0l = Date.now();

      this._legacyLines.push(ansiLine);
      if (this._legacyLines.length > this._panelHeight) {
        this._legacyLines = this._legacyLines.slice(-this._panelHeight);
      }

      const legacyRender = this._fullRenderLeft();
      const legacyBytes  = legacyRender.length;
      const legacyLat    = Date.now() - t0l;

      out += legacyRender;
      this._legacyLast = now;
      if (this._metrics) this._metrics.recordLegacy(legacyLat, legacyBytes);
    }

    // ── Metrics bar ──────────────────────────────────────────────────────
    out += this._metricsBar();

    if (out.length) this._write(out);
  }

  teardown() {
    process.stdout.write(show());
  }

  // asciicast recording
  async saveRecording(outPath) {
    const fs   = await import('fs');
    const path = await import('path');
    const header = { version: 2, width: this._cols, height: this._rows,
                     timestamp: Math.floor(this._recStart / 1000), title: 'EdgeStream Shadow Duel' };
    const lines = [JSON.stringify(header), ...this._recFrames.map(f => JSON.stringify(f))];
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, lines.join('\n'));
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _write(data) {
    process.stdout.write(data);
    if (this._recording) {
      this._recFrames.push([(Date.now() - this._recStart) / 1000, 'o', data]);
    }
  }

  /**
   * Full re-render of the left (Legacy) panel — writes every line top-to-bottom
   */
  _fullRenderLeft() {
    let out = '';
    const w = this._panelW;
    for (let i = 0; i < this._panelHeight; i++) {
      const row = this._panelTop + i;
      out += mv(row, 1) + `${ESC}[K`; // move + erase line
      const lineIdx = this._legacyLines.length - this._panelHeight + i;
      if (lineIdx >= 0 && lineIdx < this._legacyLines.length) {
        out += this._legacyLines[lineIdx];
      }
    }
    return out;
  }

  /**
   * Draw the static UI chrome (borders, labels)
   */
  _chrome() {
    let out = '';
    const W = this._cols;
    const H = this._half;

    // Row 1: top border
    out += mv(1, 1) + c('36;1', '╔' + '═'.repeat(W - 2) + '╗');

    // Row 2: title
    const title = ' ⚡  EDGESTREAM OPS  —  SHADOW DUEL MODE  v2.1  ⚡ ';
    const pad   = Math.max(0, Math.floor((W - title.length - 2) / 2));
    out += mv(2, 1) + c('36;1','║') + ' '.repeat(pad) + c('33;1', title) + ' '.repeat(Math.max(0, W - 2 - pad - title.length)) + c('36;1','║');

    // Row 3: separator
    out += mv(3, 1) + c('36;1', '╠' + '═'.repeat(W - 2) + '╣');

    // Row 4-5: metrics (placeholder, filled later)
    for (let r = 4; r <= 5; r++) {
      out += mv(r, 1) + c('36;1','║') + ' '.repeat(W - 2) + c('36;1','║');
    }

    // Row 6: second separator
    out += mv(6, 1) + c('36;1', '╠' + '═'.repeat(H - 2) + '╦' + '═'.repeat(W - H - 1) + '╣');

    // Row 7: panel labels
    const legLbl = '  🔴  LEGACY ENGINE  ·  Full Redraw  ·  Throttled 10 FPS';
    const edgLbl = '  🟢  EDGESTREAM ENGINE  ·  Incremental Diff  ·  Unlimited FPS';
    const legPad = H - 2 - legLbl.length;
    const edgPad = W - H - 1 - edgLbl.length;
    out += mv(7, 1) + c('36;1','║') + c('31;1', legLbl) + ' '.repeat(Math.max(0, legPad)) + c('36;1','║') + c('32;1', edgLbl) + ' '.repeat(Math.max(0, edgPad)) + c('36;1','║');

    // Row 8: panel header separator
    out += mv(8, 1) + c('36;1', '╠' + '═'.repeat(H - 2) + '╬' + '═'.repeat(W - H - 1) + '╣');

    // Rows 9..panelBottom: side borders only
    for (let r = 9; r <= this._panelBottom; r++) {
      out += mv(r, 1) + c('36;1','║');
      out += mv(r, H) + c('36;1','║');
      out += mv(r, W) + c('36;1','║');
    }

    // Footer separator
    out += mv(this._panelBottom + 1, 1) + c('36;1', '╠' + '═'.repeat(H - 2) + '╩' + '═'.repeat(W - H - 1) + '╣');

    // Footer text
    const foot = '  Ctrl+C stop  ·  edgestream © 2025  ·  npm run demo:trading | demo:soc | demo:telecom  ·  npm run benchmark';
    out += mv(this._panelBottom + 2, 1) + c('36;1','║') + c('90', foot) + ' '.repeat(Math.max(0, W - 2 - foot.length)) + c('36;1','║');
    out += mv(this._panelBottom + 3, 1) + c('36;1', '╚' + '═'.repeat(W - 2) + '╝');

    return out;
  }

  /**
   * Live metrics bar (rows 4-5 inside header)
   */
  _metricsBar() {
    if (!this._metrics) return '';
    const m = this.metrics ? this.metrics.get() : this._metrics.get();
    const W = this._cols;

    const bwC  = m.bandwidth_saving > 80 ? '32;1' : m.bandwidth_saving > 50 ? '33' : '31';
    const latC = m.latency_edge < 10 ? '32;1' : '33';

    const row4 = [
      `  ${c('90','Latency')}`,
      `  Legacy:${c('31', String(m.latency_legacy).padStart(5)+'ms')}`,
      `  Edge:${c(latC, String(m.latency_edge).padStart(5)+'ms')}`,
      `  Δ:${c('33', String(m.latency_delta).padStart(6)+'ms')}`,
      `     ${c('90','Bandwidth')}`,
      `  Legacy:${c('31', this._fmtBytes(m.bandwidth_legacy).padStart(10))}`,
      `  Edge:${c('32', this._fmtBytes(m.bandwidth_edge).padStart(10))}`,
      `  Saving:${c(bwC, String(m.bandwidth_saving).padStart(5)+'%')}`,
    ].join('');

    const row5 = [
      `  ${c('90','Events/s:')}${c('33;1', String(m.events_per_sec).padStart(6))}`,
      `   ${c('90','FPS Legacy:')}${c('31', String(m.fps_legacy).padStart(6))}`,
      `  FPS Edge:${c('32;1', String(m.fps_edge).padStart(6))}`,
      `   ${c('90','Total:')}${c('37', String(m.total_events).padStart(9))}`,
      `   ${c('90','Uptime:')}${c('37', String(m.uptime).padStart(6)+'s')}`,
    ].join('');

    const vl4 = this._vlen(row4);
    const vl5 = this._vlen(row5);

    let out = '';
    out += mv(4, 1) + c('36;1','║') + row4 + ' '.repeat(Math.max(0, W - 2 - vl4)) + c('36;1','║');
    out += mv(5, 1) + c('36;1','║') + row5 + ' '.repeat(Math.max(0, W - 2 - vl5)) + c('36;1','║');
    return out;
  }

  _fmtBytes(n) {
    if (n >= 1e9) return (n/1e9).toFixed(1)+'GB';
    if (n >= 1e6) return (n/1e6).toFixed(1)+'MB';
    if (n >= 1e3) return (n/1e3).toFixed(1)+'KB';
    return n+'B';
  }

  // Strip ANSI and return visible length
  _vlen(s) { return s.replace(/\x1b\[[0-9;]*m/g, '').length; }

  // Expose metrics getter consistently
  get metrics() { return this._metrics; }
}
