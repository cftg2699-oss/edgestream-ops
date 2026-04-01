import http from 'http';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { Simulator } from '../../simulator/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT     = parseInt(process.env.PORT || '8080', 10);
const TOKEN    = process.env.EDGESTREAM_TOKEN || null;
const RATE     = parseInt(process.env.SIM_RATE || '1000', 10);
const INDUSTRY = process.env.SIM_INDUSTRY || 'trading';

// Live metrics state — updated by connected duel clients
let liveMetrics = {
  latency_legacy: 0, latency_edge: 0, latency_delta: 0,
  bandwidth_legacy: 0, bandwidth_edge: 0, bandwidth_saving: 0,
  events_per_sec: 0, fps_legacy: 0, fps_edge: 0,
  total_events: 0, uptime: 0,
};

// Simple per-event metrics computed server-side
let _evCount = 0, _evSecCount = 0, _evSecLast = Date.now(), _startTime = Date.now();

let simRunning = false;

const DASHBOARD = fs.readFileSync(path.resolve(__dirname, '../../public/dashboard.html'));

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'edgestream', version: '2.1.0', uptime: process.uptime(), sim: simRunning }));
    return;
  }

  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ ...liveMetrics, uptime: ((Date.now() - _startTime) / 1000).toFixed(1) }));
    return;
  }

  if (req.url === '/' || req.url === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(DASHBOARD);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ service: 'EdgeStream OPS', version: '2.1.0', dashboard: '/dashboard', metrics: '/metrics' }));
});

const wss     = new WebSocketServer({ server: httpServer });
const clients = new Set();
const sim     = new Simulator({ rate: RATE, industry: INDUSTRY });

wss.on('connection', (ws, req) => {
  if (TOKEN) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.searchParams.get('token') !== TOKEN) { ws.close(4001, 'Unauthorized'); return; }
  }

  clients.add(ws);
  console.log(`[+] Client connected — total: ${clients.size}`);

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      // Accept metrics push from duel clients
      if (msg.type === 'metrics') { liveMetrics = { ...liveMetrics, ...msg.data }; return; }
      if (msg.type === 'set_rate' && msg.rate) sim.setRate(parseInt(msg.rate));
    } catch (_) {}
  });

  ws.on('close', () => { clients.delete(ws); console.log(`[-] Client left — total: ${clients.size}`); });
  ws.on('error', () => clients.delete(ws));
  ws.send(JSON.stringify({ type: 'hello', version: '2.1.0', ts: Date.now() }));
});

sim.on('event', ev => {
  // Update server-side EPS
  _evCount++; _evSecCount++;
  const now = Date.now();
  if (now - _evSecLast >= 1000) {
    liveMetrics.events_per_sec = _evSecCount;
    liveMetrics.total_events   = _evCount;
    _evSecCount = 0;
    _evSecLast  = now;
  }

  if (clients.size === 0) return;
  const pkt = JSON.stringify({ type: 'event', data: ev });
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(pkt);
  }
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ EdgeStream listening on port ${PORT}`);
  console.log(`   Dashboard: http://0.0.0.0:${PORT}/dashboard`);
  sim.start();
  simRunning = true;
});

process.on('SIGTERM', () => { sim.stop(); httpServer.close(() => process.exit(0)); });
process.on('uncaughtException', err => console.error('Uncaught:', err.message));
