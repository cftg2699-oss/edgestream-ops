# ⚡ EdgeStream OPS — Shadow Duel Mode

> Ultra-low latency event visualization platform.  
> Side-by-side ANSI comparison: **Legacy full redraw** vs **EdgeStream incremental diff**.

```
╔═══════════════════════════════════════════════════════════════╗
║   ⚡  EDGESTREAM OPS  —  SHADOW DUEL MODE  v2.1  ⚡          ║
╠═══════════════════════╦═══════════════════════════════════════╣
║  Latency Legacy: 240ms  Edge: 3ms  Δ: 237ms  BW Saved: 92%  ║
╠═══════════════════════╬═══════════════════════════════════════╣
║  🔴 LEGACY · 10 FPS   ║  🟢 EDGESTREAM · Unlimited FPS       ║
╠═══════════════════════╬═══════════════════════════════════════╣
║  12:34:56.001 CRITICAL ║  12:34:56.001 CRITICAL               ║
║  NYSE    AAPL BUY...   ║  NYSE    AAPL BUY...  ← diff patch  ║
║  ...                   ║  ...                                  ║
╚═══════════════════════╩═══════════════════════════════════════╝
```

## Installation

### One-command install
```bash
curl -sL https://install.edgestream.sh | bash
```

### Manual
```bash
git clone https://github.com/edgestream/edgestream-ops
cd edgestream-ops
npm install
npm run demo
```

**Requirements:** Node.js >= 18

---

## Quick Start

```bash
npm run demo              # Trading demo at 5000 ev/s (60 seconds)
npm run demo:trading      # Same as above
npm run demo:soc          # Security Operations Center events
npm run demo:telecom      # Telecom/RAN network events
```

---

## All Commands

| Command | Description |
|---------|-------------|
| `npm run demo` | Full demo: server + Shadow Duel, 5000 ev/s, 60s |
| `npm run demo:trading` | Trading feed demo |
| `npm run demo:soc` | SOC / security events demo |
| `npm run demo:telecom` | Telecom / RAN events demo |
| `npm run duel` | Duel client only (requires running server) |
| `npm start` | Start WebSocket server only (port 8080) |
| `npm run simulate` | Start event simulator only |
| `npm run shadow -- --url=<ws://host:port>` | Connect to external stream |
| `npm run benchmark` | Performance benchmark (1k/3k/5k ev/s) |
| `npm run record` | Record demo as `.asciicast` |

---

## Architecture

```
edgestream-ops/
├── core/                   # Real engine (your files)
│   ├── ansiCodes.js        # ANSI code parsing & utilities
│   ├── diff.js             # diffAnsiCodes() — minimal style transitions
│   ├── reduce.js           # reduceAnsiCodes() — state reduction
│   ├── styledChars.js      # styledCharsFromTokens() / styledCharsToString()
│   ├── tokenize.js         # tokenize() — ANSI-aware string tokenizer
│   ├── undo.js             # undoAnsiCodes()
│   └── index.js            # Re-exports all
│
├── src/
│   ├── engine/
│   │   ├── EdgeStreamEngine.js   # Core incremental renderer
│   │   └── benchmark.js          # Performance benchmarking
│   ├── adapters/
│   │   └── index.js              # WS / Kafka / REST / Redis / File / Simulator
│   ├── metrics/
│   │   └── index.js              # MetricsCollector + JSON export
│   ├── server/
│   │   └── index.js              # WebSocket broadcast server (port 8080)
│   └── shared/
│       └── formatter.js          # Event → colored ANSI line
│
├── client/
│   ├── layout.js           # DuelLayout — ANSI split-panel renderer
│   ├── demo.js             # Full demo runner
│   ├── duel.js             # Standalone duel client
│   └── shadow.js           # Shadow mode (external WS)
│
├── simulator/
│   ├── index.js            # Simulator class + generateEvent()
│   └── run.js              # CLI runner
│
├── config/
│   └── mapping.json        # Field mapping for Shadow Mode
│
├── recordings/             # .asciicast output
├── metrics/                # last-run.json, benchmark.json
├── Dockerfile
└── install.sh
```

---

## Core Engine

The real diff engine uses character-level ANSI style tracking:

```
Event string
    ↓
tokenize()              — parse chars + ANSI codes into tokens
    ↓
styledCharsFromTokens() — attach reduced style state to each char
    ↓
diffAnsiCodes()         — minimal transitions between char styles
    ↓
ANSI patch              — only changed characters written to stdout
```

**Key invariant:** `process.stdout.write()` only — no frameworks, no blessed, no ink.

---

## Shadow Mode (PoC with Client Data)

Connect to any existing WebSocket stream without modifying client infrastructure:

```bash
npm run shadow -- --url=ws://client-host:8080
```

Configure field mapping in `config/mapping.json`:
```json
{
  "id":        "trade_id",
  "timestamp": "exec_time",
  "source":    "venue",
  "severity":  "urgency",
  "payload":   "order"
}
```

---

## Benchmark

```bash
npm run benchmark
```

Example output:
```
  Rate(ev/s)  Lat Edge  Lat Legacy  BW Saved  FPS Edge
  ──────────────────────────────────────────────────────
  1000        1ms       12ms        88%        980
  3000        2ms       18ms        91%        2940
  5000        3ms       24ms        92%        4890
```

Saved to `metrics/benchmark.json`.

---

## Recording

```bash
npm run record
# → recordings/demo.asciicast
```

Convert to video externally:
```bash
agg recordings/demo.asciicast demo.gif
# or: asciinema upload recordings/demo.asciicast
```

---

## Docker

```bash
docker build -t edgestream .
docker run -p 8080:8080 edgestream
```

## Railway / Fly.io

Reads `PORT` env var automatically. Deploy with `railway up` or `flyctl deploy`.

---

## Success Criteria

| Metric | Target | Typical |
|--------|--------|---------|
| Bandwidth saving | > 80% | 88–92% |
| Edge latency | < 10ms | 1–4ms |
| Flickering | None | ✓ |
| Panel separation | Strict | ✓ |

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | WebSocket server port (default: 8080) |
| `EDGESTREAM_TOKEN` | Optional auth token for WS connections |
| `SHADOW_URL` | Default URL for shadow mode |
