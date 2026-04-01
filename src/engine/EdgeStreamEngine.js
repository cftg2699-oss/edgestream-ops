/**
 * EdgeStreamEngine
 * Wraps the real core engine (tokenize → styledChars → diffAnsiCodes)
 * for incremental ANSI line-level rendering.
 *
 * The engine maintains a rolling buffer of StyledChar arrays per line.
 * On each new event, it computes the minimal ANSI patch to update only
 * changed characters — never re-rendering the full screen.
 */

import {
  tokenize,
  styledCharsFromTokens,
  styledCharsToString,
  diffAnsiCodes,
  ansiCodesToString,
  reduceAnsiCodes,
} from '../core/index.js';

// Max lines kept in the rolling window
const MAX_LINES = 20;

// ANSI cursor positioning helper
const mv = (row, col) => `\x1b[${row};${col}H`;

export class EdgeStreamEngine {
  constructor(options = {}) {
    this._opts = options;
    // Each entry: { raw: string, chars: StyledChar[] }
    this._lines = [];
    this._renderCount = 0;
    this._totalBytes = 0;
    this._startTime = Date.now();
  }

  /**
   * Process one event string (already formatted/colored ANSI line).
   * Returns { patch, latency, bytes, changedChars }
   *
   * @param {string} ansiLine  — A fully-colored ANSI string for one event line
   * @param {number} rowOffset — Top row of the panel in terminal coordinates (1-based)
   * @param {number} colOffset — Left col of the panel (1-based)
   * @param {number} maxWidth  — Max visible characters per line
   */
  processLine(ansiLine, rowOffset = 1, colOffset = 1, maxWidth = 80) {
    const t0 = Date.now();

    // Tokenize the new line with the real engine
    const tokens   = tokenize(ansiLine, maxWidth);
    const newChars = styledCharsFromTokens(tokens);

    // Add new line to buffer
    this._lines.push(newChars);
    if (this._lines.length > MAX_LINES) {
      this._lines.shift();
    }

    // Compute which terminal row each buffer line maps to
    // Most-recent line → bottom of the window
    const patch = this._buildPatch(rowOffset, colOffset, maxWidth);

    const latency = Date.now() - t0;
    this._totalBytes += patch.length;
    this._renderCount++;

    return { patch, latency, bytes: patch.length };
  }

  /**
   * Build the minimal ANSI patch to update the panel.
   * Only emits cursor-moves + character writes for lines that changed.
   */
  _buildPatch(rowOffset, colOffset, maxWidth) {
    // For truly incremental rendering, we track _prev line chars
    // and emit only the changed characters within each line.
    if (!this._prevLines) this._prevLines = [];

    let out = '';
    const displayLines = this._lines.slice(-MAX_LINES);

    for (let i = 0; i < displayLines.length; i++) {
      const newChars  = displayLines[i];
      const prevChars = this._prevLines[i] || [];
      const row = rowOffset + i;
      const col = colOffset;

      // Find changed character range
      const linePatch = this._diffLine(prevChars, newChars, row, col, maxWidth);
      out += linePatch;
    }

    // Save current lines as previous for next render
    this._prevLines = displayLines.map(line => [...line]);

    return out;
  }

  /**
   * Diff two StyledChar arrays and emit minimal ANSI to patch the terminal line.
   */
  _diffLine(prevChars, newChars, row, col, maxWidth) {
    const maxLen = Math.max(prevChars.length, newChars.length, 1);
    let out = '';
    let inRun = false;
    let runStart = -1;
    let runStyles = [];

    for (let c = 0; c < Math.min(maxLen, maxWidth); c++) {
      const prev = prevChars[c];
      const next = newChars[c];

      // Determine if this position changed
      const prevVal    = prev ? prev.value  : ' ';
      const nextVal    = next ? next.value  : ' ';
      const prevStyles = prev ? prev.styles : [];
      const nextStyles = next ? next.styles : [];

      const styleChanged = JSON.stringify(prevStyles.map(s => s.code))
                        !== JSON.stringify(nextStyles.map(s => s.code));
      const charChanged  = prevVal !== nextVal;

      if (charChanged || styleChanged) {
        if (!inRun) {
          // Start a new run: move cursor to position
          out += mv(row, col + c);
          // Emit style diff from runStyles (reset) to nextStyles
          out += ansiCodesToString(diffAnsiCodes(runStyles, nextStyles));
          runStyles = nextStyles;
          inRun = true;
          runStart = c;
        } else {
          // Continue run: emit style transition if needed
          const sd = diffAnsiCodes(runStyles, nextStyles);
          if (sd.length) {
            out += ansiCodesToString(sd);
            runStyles = nextStyles;
          }
        }
        out += nextVal;
      } else {
        if (inRun) {
          // Close run: reset styles if active
          if (runStyles.length) {
            out += ansiCodesToString(diffAnsiCodes(runStyles, []));
            runStyles = [];
          }
          inRun = false;
        }
      }
    }

    // Close any open run
    if (inRun && runStyles.length) {
      out += ansiCodesToString(diffAnsiCodes(runStyles, []));
    }

    return out;
  }

  getMetrics() {
    const elapsed = (Date.now() - this._startTime) / 1000 || 0.001;
    return {
      renderCount:        this._renderCount,
      totalBytes:         this._totalBytes,
      avgBytesPerRender:  Math.round(this._totalBytes / this._renderCount) || 0,
      fps:                (this._renderCount / elapsed).toFixed(1),
    };
  }

  reset() {
    this._lines     = [];
    this._prevLines = [];
    this._renderCount = 0;
    this._totalBytes  = 0;
    this._startTime   = Date.now();
  }
}
