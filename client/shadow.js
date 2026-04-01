#!/usr/bin/env node
/**
 * EdgeStream Shadow Mode
 * Connects to an existing client WebSocket stream (read-only, non-invasive)
 * Maps events using config/mapping.json
 *
 * Usage: npm run shadow -- --url=ws://client.host:8080
 */

import { DuelLayout }       from './layout.js';
import { MetricsCollector } from '../src/metrics/index.js';
import { WebSocket }        from 'ws';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('='))
);

const url = args.url || process.env.SHADOW_URL;
if (!url) {
  console.error('\x1b[31mError:\x1b[0m --url=<ws://host:port> is required\n');
  console.error('  Usage: npm run shadow -- --url=ws://client.host:8080\n');
  process.exit(1);
}

// ─── Load mapping config ──────────────────────────────────────────────────────
const mappingPath = path.resolve(__dirname, '../config/mapping.json');
let mapping = null;
if (fs.existsSync(mappingPath)) {
  try { mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf8')); } catch(_) {}
}

/**
 * Map arbitrary client payload to standard EdgeStream event format.
 * Uses mapping.json if present, otherwise applies sensible defaults.
 */
function mapEvent(raw) {
  if (!mapping) {
    // Auto-detect common fields
    return {
      id:        raw.id        || raw.event_id  || raw.seq       || Date.now(),
      timestamp: raw.timestamp || raw.ts        || raw.time      || Date.now(),
      source:    raw.source    || raw.src        || raw.system    || 'shadow',
      severity:  raw.severity  || raw.level      || raw.priority  || 'info',
      payload:   raw.payload   || raw.data       || raw.body      || raw,
    };
  }

  // Apply explicit field mapping
  const get = (obj, key) => key.split('.').reduce((o, k) => o?.[k], obj);
  return {
    id:        get(raw, mapping.id        || 'id')        || Date.now(),
    timestamp: get(raw, mapping.timestamp || 'timestamp') || Date.now(),
    source:    get(raw, mapping.source    || 'source')    || 'shadow',
    severity:  get(raw, mapping.severity  || 'severity')  || 'info',
    payload:   get(raw, mapping.payload   || 'payload')   || raw,
  };
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
const metrics = new MetricsCollector();
const layout  = new DuelLayout({ metrics });

layout.init();

process.stdout.write(`\x1b[90m  Connecting to ${url} ...\x1b[0m\n`);

const ws = new WebSocket(url);

ws.on('open', () => {
  process.stdout.write(`\x1b[32m  Connected to ${url}\x1b[0m\n`);
});

ws.on('message', raw => {
  try {
    const parsed = JSON.parse(raw.toString());
    // Handle both raw events and EdgeStream-wrapped events
    const rawEvent = parsed.type === 'event' ? parsed.data : parsed;
    const event    = mapEvent(rawEvent);
    layout.renderEvent(event);
  } catch (_) {}
});

ws.on('error', err => {
  layout.teardown();
  console.error('\n\x1b[31mConnection error:\x1b[0m', err.message);
  process.exit(1);
});

ws.on('close', () => {
  layout.teardown();
  const data = metrics.export();
  console.log('\n\x1b[33mConnection closed.\x1b[0m');
  console.log(`  Total events: ${data.total_events} | BW saved: ${data.bandwidth_saving}%`);
  process.exit(0);
});

process.on('SIGINT', () => {
  ws.close();
  layout.teardown();
  metrics.export();
  process.exit(0);
});
