#!/usr/bin/env node
/**
 * EdgeStream Simulator Runner
 * npm run simulate -- --rate=5000 --industry=trading
 */

import { Simulator } from './index.js';

const args = Object.fromEntries(
  process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('='))
);

const rate     = parseInt(args.rate     || '1000');
const industry = args.industry          || 'trading';
const burst    = 'burst' in args;

const sim = new Simulator({ rate, industry, burst });

console.log(`\x1b[36m[Simulator]\x1b[0m industry=\x1b[33m${industry}\x1b[0m rate=\x1b[33m${rate}\x1b[0m ev/s burst=\x1b[33m${burst}\x1b[0m`);
console.log('\x1b[90mPress Ctrl+C to stop\x1b[0m\n');

sim.on('event', ev => {
  process.stdout.write(
    `\x1b[2m${new Date(ev.timestamp).toISOString().slice(11,23)}\x1b[0m ` +
    `\x1b[33m${ev.source.padEnd(7)}\x1b[0m ` +
    `\x1b[37m${JSON.stringify(ev.payload).slice(0,60)}\x1b[0m\n`
  );
});

sim.start();

// Print stats every 5s
setInterval(() => {
  const s = sim.stats();
  process.stdout.write(
    `\x1b[36m[stats]\x1b[0m events=${s.count} elapsed=${s.elapsed}s actual=${s.rate} ev/s\n`
  );
}, 5000);

process.on('SIGINT', () => {
  sim.stop();
  const s = sim.stats();
  console.log(`\n\x1b[32m[done]\x1b[0m ${s.count} events in ${s.elapsed}s (${s.rate} ev/s)`);
  process.exit(0);
});
