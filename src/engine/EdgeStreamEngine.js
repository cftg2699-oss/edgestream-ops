import {
  tokenize,
  styledCharsFromTokens,
  diffAnsiCodes,
  ansiCodesToString,
} from '../../core/index.js';

const MAX_LINES = 38;
const mv = (row, col) => `\x1b[${row};${col}H`;

export class EdgeStreamEngine {
  constructor() {
    this._lines      = [];
    this._prevLines  = [];
    this._renderCount = 0;
    this._totalBytes  = 0;
    this._startTime   = Date.now();
  }

  processLine(ansiLine, panelTop = 1, colOffset = 1, maxWidth = 80, panelHeight = MAX_LINES) {
    const t0 = Date.now();
    const tokens   = tokenize(ansiLine, maxWidth);
    const newChars = styledCharsFromTokens(tokens);
    this._lines.push(newChars);
    if (this._lines.length > MAX_LINES) this._lines.shift();
    const patch = this._buildPatch(panelTop, colOffset, maxWidth, panelHeight);
    const latency = Date.now() - t0;
    this._totalBytes += patch.length;
    this._renderCount++;
    return { patch, latency, bytes: patch.length };
  }

  _buildPatch(panelTop, colOffset, maxWidth, panelHeight) {
    if (!this._prevLines) this._prevLines = [];
    let out = '';
    const lines = this._lines;
    const total = lines.length;
    for (let i = 0; i < Math.min(total, panelHeight); i++) {
      const bufIdx  = total - Math.min(total, panelHeight) + i;
      const panelRow = panelTop + (panelHeight - Math.min(total, panelHeight)) + i;
      const newChars  = lines[bufIdx];
      const prevChars = this._prevLines[bufIdx] || [];
      out += this._diffLine(prevChars, newChars, panelRow, colOffset, maxWidth);
    }
    this._prevLines = lines.map(l => [...l]);
    return out;
  }

  _diffLine(prevChars, newChars, row, col, maxWidth) {
    const maxLen = Math.max(prevChars.length, newChars.length, 1);
    let out = '';
    let inRun = false;
    let runStyles = [];
    for (let c = 0; c < Math.min(maxLen, maxWidth); c++) {
      const prev = prevChars[c];
      const next = newChars[c];
      const prevVal    = prev ? prev.value  : ' ';
      const nextVal    = next ? next.value  : ' ';
      const prevStyles = prev ? prev.styles : [];
      const nextStyles = next ? next.styles : [];
      const styleChanged = JSON.stringify(prevStyles.map(s => s.code)) !==
                           JSON.stringify(nextStyles.map(s => s.code));
      const charChanged  = prevVal !== nextVal;
      if (charChanged || styleChanged) {
        if (!inRun) {
          out += mv(row, col + c);
          out += ansiCodesToString(diffAnsiCodes(runStyles, nextStyles));
          runStyles = nextStyles;
          inRun = true;
        } else {
          const sd = diffAnsiCodes(runStyles, nextStyles);
          if (sd.length) { out += ansiCodesToString(sd); runStyles = nextStyles; }
        }
        out += nextVal;
      } else {
        if (inRun && runStyles.length) {
          out += ansiCodesToString(diffAnsiCodes(runStyles, []));
          runStyles = [];
          inRun = false;
        }
      }
    }
    if (inRun && runStyles.length) out += ansiCodesToString(diffAnsiCodes(runStyles, []));
    return out;
  }

  reset() {
    this._lines      = [];
    this._prevLines  = [];
    this._renderCount = 0;
    this._totalBytes  = 0;
    this._startTime   = Date.now();
  }
}