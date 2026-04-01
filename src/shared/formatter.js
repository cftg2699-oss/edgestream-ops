/**
 * EventFormatter
 * Converts standard EdgeStream events to ANSI-colored strings.
 * These strings are then fed into EdgeStreamEngine.processLine().
 */

const SEV = {
  critical: '\x1b[1;31m',   // bold red
  high:     '\x1b[33m',     // yellow
  medium:   '\x1b[36m',     // cyan
  low:      '\x1b[32m',     // green
  info:     '\x1b[90m',     // dark gray
};
const RST = '\x1b[0m';
const DIM = '\x1b[2m';
const BLD = '\x1b[1m';

export function formatEvent(event) {
  const { timestamp, source, id, payload, severity } = event;
  const sc = SEV[severity] || SEV.info;
  const ts = new Date(timestamp).toISOString().slice(11, 23);
  const sev = (severity || 'info').toUpperCase().padEnd(8);
  const src = (source || '---').padEnd(9).slice(0, 9);
  const pid = String(id || 0).padStart(7).slice(-7);
  const pay = JSON.stringify(payload || {}).slice(0, 42).padEnd(42);

  return `${DIM}${ts}${RST} ${sc}${BLD}${sev}${RST} ${sc}${src}${RST} ${DIM}${pid}${RST} ${pay}`;
}
