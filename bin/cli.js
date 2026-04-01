#!/usr/bin/env node
/**
 * EdgeStream CLI
 * edgestream <command> [options]
 */

const [,, cmd, ...rest] = process.argv;
const args = Object.fromEntries(
  rest.filter(a => a.startsWith('--')).map(a => a.slice(2).split('='))
);

const HELP = `
\x1b[36;1mEdgeStream OPS v2.1\x1b[0m — Ultra-low latency event visualization

\x1b[33mUsage:\x1b[0m  edgestream <command> [options]

\x1b[33mCommands:\x1b[0m
  duel        Start Shadow Duel Mode (requires running server)
  simulate    Start event simulator
  demo        Run full demo (server + duel, 60s)
  demo:trading / demo:soc / demo:telecom
  shadow      Connect to client WebSocket stream
  benchmark   Run performance benchmark
  record      Record demo as .asciicast
  connect     Connect to external WebSocket

\x1b[33mOptions:\x1b[0m
  --industry=trading|soc|telecom
  --rate=5000
  --url=ws://host:port
  --duration=60

\x1b[90mExamples:\x1b[0m
  edgestream demo --industry=trading --rate=5000
  edgestream shadow --url=ws://client.host:8080
  edgestream benchmark
`;

switch (cmd) {
  case 'duel':
    await import('../client/duel.js');
    break;
  case 'demo':
  case 'demo:trading':
    process.argv.push('--industry=trading', '--rate=5000');
    await import('../client/demo.js');
    break;
  case 'demo:soc':
    process.argv.push('--industry=soc', '--rate=5000');
    await import('../client/demo.js');
    break;
  case 'demo:telecom':
    process.argv.push('--industry=telecom', '--rate=5000');
    await import('../client/demo.js');
    break;
  case 'simulate':
    await import('../simulator/run.js');
    break;
  case 'shadow':
  case 'connect':
    await import('../client/shadow.js');
    break;
  case 'benchmark':
    await import('../src/engine/benchmark.js');
    break;
  case 'record':
    process.argv.push('--record');
    await import('../client/demo.js');
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    console.log(HELP);
    process.exit(0);
}
