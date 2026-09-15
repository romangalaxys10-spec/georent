#!/usr/bin/env node
// Responsive sweep of LOCAL dev incl. the new local-ads surfaces
// viewports × locales × routes → report scrollWidth bleed + horizontal scroll
import { execSync } from 'node:child_process';

const S = 'sweep2';
const BASE = 'http://localhost:3000';
const pages = [
  ['home', '/'],
  ['local-detail', '/listing/local/cmu2rks470002p3uyhus2hh61'],
  ['ss-detail', '/listing/ss/26045778'],
];
const viewports = [[360, 780], [390, 844], [768, 1024], [1440, 900]];
const locales = ['en', 'he', 'ar'];

const run = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 60000 }).trim(); }
  catch (e) { return 'ERR:' + String(e.stdout || e.message).slice(0, 120); }
};
const ab = (c) => run(`agent-browser --session ${S} ${c}`);

ab(`close`);
let bad = [];
for (const locale of locales) {
  for (const [w, h] of viewports) {
    ab(`set viewport ${w} ${h}`);
    ab(`storage local set dealradar-locale ${locale}`);
    for (const [name, path] of pages) {
      ab(`open "${BASE}${path}"`);
      ab('wait --load networkidle');
      const res = ab(`eval "(()=>{const b=document.body; const bleed=b.scrollWidth-innerWidth; const rtl=document.documentElement.dir; return JSON.stringify({bleed, rtl})})()"`);
      console.log(`${locale} ${w}x${h} ${name}: ${res}`);
      if (res.includes('ERR:') || /"bleed":-?\d+/.test(res) === false || !/"bleed":0/.test(res)) {
        bad.push(`${locale} ${w}x${h} ${name} → ${res}`);
      }
    }
  }
}
ab(`close`);
console.log(bad.length ? `\nISSUES:\n${bad.join('\n')}` : '\nALL CLEAN');
