#!/usr/bin/env node
/**
 * EdgeStream Demo Runner
 * npm run demo | demo:trading | demo:soc | demo:telecom
 *
 * Starts local WS server + simulator, runs Shadow Duel for 60s, exports metrics.
 */

import { createServer }     from '../src/server/index.js';
import { DuelLayout }       from './layout.js';
import { MetricsCollector } from '../src/metrics/index.js';
import { WebSocket }        from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Parse CLI args ───────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => a.slice(2).split('='))
);

const industry  = args.industry  || 'trading';
const rate      = parseInt(args.rate || '5000');
const duration  = parseInt(args.duration || '60') * 1000;
const recording = 'record' in args;

// ─── Boot ─────────────────────────────────────────────────────────────────────
const metrics = new MetricsCollector();
const layout  = new DuelLayout({ metrics, recording });

// Start embedded server + simulator
const { sim } = createServer({ rate, industry, silent: true });

// Give server 300ms to be ready then connect
await new Promise(r => setTimeout(r, 300));

const PORT = parseInt(process.env.PORT || '8080', 10);
const ws   = new WebSocket(`ws://localhost:${PORT}`);

layout.init();

ws.on('open', () => {
  // nothing extra needed — server already broadcasting
});

ws.on('message', raw => {
  try {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'event') {
      layout.renderEvent(msg.data);
    }
  } catch (_) {}
});

ws.on('error', err => {
  // Swallow connection errors during teardown
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(reason) {
  sim.stop();
  ws.close();
  layout.teardown();

  const data = metrics.export();
  process.stdout.write('\x1b[2J\x1b[H'); // clear screen

  console.log('\n\x1b[36;1m═══ EdgeStream — Run Summary ═══\x1b[0m\n');
  console.log(`  Industry:        \x1b[33m${industry}\x1b[0m`);
  console.log(`  Events/s:        \x1b[32;1m${data.events_per_sec}\x1b[0m`);
  console.log(`  Latency Legacy:  \x1b[31m${data.latency_legacy}ms\x1b[0m`);
  console.log(`  Latency Edge:    \x1b[32;1m${data.latency_edge}ms\x1b[0m`);
  console.log(`  Bandwidth Saved: \x1b[32;1m${data.bandwidth_saving}%\x1b[0m`);
  console.log(`  FPS Edge:        \x1b[32;1m${data.fps_edge}\x1b[0m`);
  console.log(`  Total Events:    \x1b[37m${data.total_events}\x1b[0m`);
  console.log('\n  \x1b[90mMetrics saved → metrics/last-run.json\x1b[0m\n');

  if (recording) {
    const recPath = path.resolve(__dirname, '../recordings/demo.asciicast');
    await layout.saveRecording(recPath).then(() => {
      console.log(`  \x1b[90mRecording saved → recordings/demo.asciicast\x1b[0m\n`);
      process.exit(0);
    }).catch(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

// Auto-stop after duration
setTimeout(() => shutdown('timeout'), duration);

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
