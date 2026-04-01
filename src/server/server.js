/**
 * EdgeStream WebSocket Server — Entry Point
 * Railway / Docker / npm start
 *
 * PORT is injected automatically by Railway.
 * /health responds immediately so healthcheck passes fast.
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { Simulator } from '../simulator/index.js';

const PORT     = parseInt(process.env.PORT || '8080', 10);
const TOKEN    = process.env.EDGESTREAM_TOKEN || null;
const RATE     = parseInt(process.env.SIM_RATE || '1000', 10);
const INDUSTRY = process.env.SIM_INDUSTRY || 'trading';

let simRunning = false;

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });

  if (req.url === '/health') {
    res.end(JSON.stringify({
      status: 'ok',
      service: 'edgestream',
      version: '2.1.0',
      uptime: process.uptime(),
      sim: simRunning,
    }));
    return;
  }

  res.end(JSON.stringify({
    service: 'EdgeStream OPS',
    version: '2.1.0',
    status: 'ok',
    industry: INDUSTRY,
    rate: RATE,
  }));
});

const wss     = new WebSocketServer({ server: httpServer });
const clients = new Set();
const sim     = new Simulator({ rate: RATE, industry: INDUSTRY });

wss.on('connection', (ws, req) => {
  if (TOKEN) {
    const url = new URL(req.url || '/', 'http://localhost');
    if (url.searchParams.get('token') !== TOKEN) {
      ws.close(4001, 'Unauthorized');
      return;
    }
  }

  clients.add(ws);
  console.log(`[+] Client connected — total: ${clients.size}`);

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'set_rate' && msg.rate) {
        sim.setRate(parseInt(msg.rate));
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[-] Client left — total: ${clients.size}`);
  });

  ws.on('error', () => clients.delete(ws));

  ws.send(JSON.stringify({ type: 'hello', version: '2.1.0', ts: Date.now() }));
});

sim.on('event', ev => {
  if (clients.size === 0) return;
  const pkt = JSON.stringify({ type: 'event', data: ev });
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(pkt);
  }
});

// Listen FIRST — Railway healthcheck hits /health immediately after deploy
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ EdgeStream listening on port ${PORT}`);
  sim.start();
  simRunning = true;
  console.log(`✅ Simulator running — ${RATE} ev/s [${INDUSTRY}]`);
});

process.on('SIGTERM', () => {
  sim.stop();
  httpServer.close(() => process.exit(0));
});

process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err.message);
});
