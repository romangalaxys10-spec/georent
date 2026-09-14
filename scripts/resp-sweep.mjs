#!/usr/bin/env node
// Responsive sweep of LIVE georent.space-z.ai sub-pages
// viewports × locales × providers → report scrollWidth bleed + offscreen elements
import { execSync } from 'node:child_process';

const S = 'sweep';
const BASE = 'https://georent.space-z.ai';
const pages = [
  ['korter', '/listing/korter/602231?url=https%3A%2F%2Fkorter.ge%2Fen%2Fapartments-for-sale-tbilisi%2F602231'],
  ['ss', '/listing/ss/26045778'],
  ['myhome', '/listing/myhome/26047083'],
];
const viewports = [[360, 780], [375, 667], [390, 844], [414, 896], [768, 1024]];
const locales = ['en', 'he'];

const run = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 60000 }).trim(); }
  catch (e) { return 'ERR:' + String(e.stdout || e.message).slice(0, 120); }
};
const ab = (c) => run(`agent-browser --session ${S} ${c}`);

ab(`close`);
let worst = [];
for (const locale of locales) {
  for (const [w, h] of viewports) {
    ab(`set viewport ${w} ${h}`);
    ab(`storage local set dealradar-locale ${locale}`);
    for (const [prov, path] of pages) {
      ab(`open "${BASE}${path}"`);
      ab('wait --load networkidle');
      ab('wait 6000'); // allow live fetch + render
      const res = ab(`eval "(() => { const dw=document.documentElement.scrollWidth, cw=document.documentElement.clientWidth; const bad=[...document.querySelectorAll('body *')].filter(el=>{const cs=getComputedStyle(el); if(['auto','scroll'].includes(cs.overflowX)||['auto','scroll'].includes(cs.overflow))return false; const r=el.getBoundingClientRect(); return (r.right>cw+2||r.left<-2)&&r.width>0;}); return JSON.stringify({dw,cw,n:bad.length,top:bad.slice(0,3).map(el=>el.tagName+'.'+String(el.className).slice(0,50))}); })()"`);
      let parsed; try { parsed = JSON.parse(JSON.parse(res)); } catch { parsed = { raw: res.slice(0, 150) }; }
      const flag = parsed.dw > w + 1 ? 'BLEED' : (parsed.n > 0 ? 'inner' : 'ok');
      console.log(`${locale} ${w}x${h} ${prov}: ${flag} scrollW=${parsed.dw} innerOff=${parsed.n} ${flag !== 'ok' ? JSON.stringify(parsed.top || parsed.raw) : ''}`);
      if (parsed.dw > w + 1) worst.push(`${locale}/${w}/${prov}`);
      ab(`screenshot /home/z/my-project/docs/screenshots/sweep-${locale}-${w}-${prov}.png`);
    }
  }
}
console.log('WORST:', worst.length ? worst.join(', ') : 'NONE');
