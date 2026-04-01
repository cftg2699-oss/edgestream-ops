#!/usr/bin/env node
import { DuelLayout }       from './layout.js';
import { MetricsCollector } from '../src/metrics/index.js';
import { WebSocket }        from 'ws';

const args = Object.fromEntries(
  process.argv.slice(2).filter(a=>a.startsWith('--')).map(a=>a.slice(2).split('='))
);

const PORT = process.env.PORT || args.port || '8080';
const url  = args.url || `ws://localhost:${PORT}`;

const metrics = new MetricsCollector();
const layout  = new DuelLayout({ metrics });

layout.init();

const ws = new WebSocket(url);
ws.on('open', () => {});
ws.on('message', raw => {
  try {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'event') layout.renderEvent(msg.data);
  } catch(_){}
});
ws.on('error', err => {
  layout.teardown();
  console.error('\n\x1b[31mConnection error:\x1b[0m', err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  ws.close();
  layout.teardown();
  metrics.export();
  process.exit(0);
});
