import http from 'http';
import { WebSocketServer } from 'ws';
import { Simulator } from '../../simulator/index.js';

export function createServer({ rate = 1000, industry = 'trading', silent = false } = {}) {
  const PORT  = parseInt(process.env.PORT || '8080', 10);
  const TOKEN = process.env.EDGESTREAM_TOKEN || null;

  const httpServer = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ service: 'EdgeStream', version: '2.1.0', status: 'ok' }));
  });

  const wss     = new WebSocketServer({ server: httpServer });
  const clients = new Set();

  const sim = new Simulator({ rate, industry });

  wss.on('connection', (ws, req) => {
    if (TOKEN) {
      const url = new URL(req.url || '/', `http://localhost`);
      if (url.searchParams.get('token') !== TOKEN) {
        ws.close(4001, 'Unauthorized'); return;
      }
    }
    clients.add(ws);
    ws.on('message', raw => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'set_rate') sim.setRate(parseInt(msg.rate));
      } catch (_) {}
    });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
    ws.send(JSON.stringify({ type: 'hello', ts: Date.now() }));
  });

  sim.on('event', ev => {
    const pkt = JSON.stringify({ type: 'event', data: ev });
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(pkt);
    }
  });

  httpServer.listen(PORT, () => {
    if (!silent) process.stdout.write(`\x1b[32m[EdgeStream] WS server on ws://localhost:${PORT}\x1b[0m\n`);
    sim.start();
  });

  return { httpServer, wss, sim, clients };
}
