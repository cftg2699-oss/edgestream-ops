/**
 * EdgeStream WebSocket Server — Entry Point
 * Railway / Docker / npm start
 *
 * Reads PORT from environment (Railway injects this automatically).
 * Starts simulator + broadcasts events to all connected WebSocket clients.
 */

import http from 'http';
import { WebSocketServer } from 'ws';
import { Simulator } from '../simulator/index.js';

const PORT     = parseInt(process.env.PORT || '8080', 10);
const TOKEN    = process.env.EDGESTREAM_TOKEN || null;
const RATE     = parseInt(process.env.SIM_RATE || '1000', 10);
const INDUSTRY = process.env.SIM_INDUSTRY || 'trading';

const httpServer = http.createServer((req, res) => {
  // Health check endpoint — Railway uses this to verify the service is up
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'edgestream', version: '2.1.0', uptime: process.uptime() }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    service:   'EdgeStream OPS',
    version:   '2.1.0',
    websocket: `ws://connect-here:${PORT}`,
    docs:      'https://github.com/your-org/edgestream-ops',
  }));
});

const wss     = new WebSocketServer({ server: httpServer });
const clients = new Set();

const sim = new Simulator({ rate: RATE, industry: INDUSTRY });

wss.on('connection', (ws, req) => {
  // Optional token auth
  if (TOKEN) {
    const url = new URL(req.url || '/', `http://localhost`);
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
        console.log(`[~] Rate changed to ${msg.rate} ev/s`);
      }
    } catch (_) {}
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[-] Client disconnected — total: ${clients.size}`);
  });

  ws.on('error', () => clients.delete(ws));

  ws.send(JSON.stringify({ type: 'hello', version: '2.1.0', ts: Date.now() }));
});

// Broadcast every event from simulator to all WS clients
sim.on('event', ev => {
  const pkt = JSON.stringify({ type: 'event', data: ev });
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(pkt);
  }
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ EdgeStream server running on port ${PORT}`);
  console.log(`   Industry: ${INDUSTRY} | Rate: ${RATE} ev/s`);
  console.log(`   WebSocket: ws://0.0.0.0:${PORT}`);
  sim.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  sim.stop();
  httpServer.close(() => process.exit(0));
});
