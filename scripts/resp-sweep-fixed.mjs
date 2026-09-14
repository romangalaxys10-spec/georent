#!/usr/bin/env node
// Post-fix sweep on LOCAL dev: providers × locales × viewports
// → bleed, stuck skeletons, console errors
import { execSync } from 'node:child_process';

const S = 'fix';
const BASE = 'http://localhost:3000';
const pages = [
  ['korter', '/listing/korter/602231?url=https%3A%2F%2Fkorter.ge%2Fen%2Fapartments-for-sale-tbilisi%2F602231'],
  ['ss', '/listing/ss/26045778'],
  ['myhome', '/listing/myhome/26047083'],
];
const viewports = [[360, 780], [390, 844], [768, 1024]];
const locales = ['en', 'he'];

const run = (cmd) => {
  try { return execSync(cmd, { encoding: 'utf8', timeout: 60000 }).trim(); }
  catch (e) { return 'ERR:' + String(e.stdout || e.message).slice(0, 120); }
};
const ab = (c) => run(`agent-browser --session ${S} ${c}`);

ab('close');
ab(`set viewport 390 844`);
let problems = 0;
for (const locale of locales) {
  ab(`storage local set dealradar-locale ${locale}`);
  for (const [w, h] of viewports) {
    ab(`set viewport ${w} ${h}`);
    for (const [prov, path] of pages) {
      const t0 = Date.now();
      ab(`open "${BASE}${path}"`);
      ab('wait --load networkidle');
      ab('wait 2500');
      const res = ab(`eval "(() => { const dw=document.documentElement.scrollWidth, cw=document.documentElement.clientWidth; const bad=[...document.querySelectorAll('body *')].filter(el=>{const cs=getComputedStyle(el); if(['auto','scroll'].includes(cs.overflowX)||['auto','scroll'].includes(cs.overflow))return false; const r=el.getBoundingClientRect(); return (r.right>cw+2||r.left<-2)&&r.width>0;}); const price=/\\$[\\d,]+/.test(document.body.innerText); const pulses=document.querySelectorAll('.animate-pulse').length; return JSON.stringify({dw,cw,n:bad.length,price,pulses,h1:document.querySelector('h1')?.textContent?.slice(0,40)||null}); })()"`);
      let parsed; try { parsed = JSON.parse(JSON.parse(res)); } catch { parsed = { raw: res.slice(0, 120) }; }
      const bleed = parsed.dw > w + 1;
      const stuck = parsed.pulses > 6;
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      const flag = bleed ? 'BLEED' : stuck ? 'SKELETON-STUCK' : parsed.price ? 'ok' : 'no-price';
      if (bleed || stuck) problems++;
      console.log(`${locale} ${w} ${prov}: ${flag} scrollW=${parsed.dw} off=${parsed.n} price=${parsed.price} pulses=${parsed.pulses} ${secs}s`);
      if (flag === 'ok' && locale === 'en' && w === 390) {
        ab(`screenshot /home/z/my-project/docs/screenshots/fixed-${prov}-390.png`);
      }
    }
  }
}
const errs = ab('errors');
console.log('PAGE ERRORS:', errs === '' || errs.includes('No errors') ? 'none' : errs.slice(0, 300));
console.log(problems === 0 ? 'SWEEP CLEAN' : `PROBLEMS: ${problems}`);
