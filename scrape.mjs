// المرحلة 1: مسح Ad Library وحفظ الإعلانات في docs/data/ads.json
import { chromium } from 'playwright';
import fs from 'fs';
import { extractAll } from './extract.mjs';

const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const D = 'docs/data/';
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(D + f, 'utf8')); } catch { return d; } };
const ads = read('ads.json', {}), meta = read('meta.json', { cursor: 0 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const now = Date.now();

const queries = [];
Object.keys(cfg.keywords).forEach(c => cfg.keywords[c].forEach(q => queries.push({ c, q })));
const n = Math.min(cfg.maxQueriesPerRun, queries.length);
const todo = Array.from({ length: n }, (_, i) => queries[((meta.cursor || 0) + i) % queries.length]);
meta.cursor = ((meta.cursor || 0) + n) % Math.max(1, queries.length);
meta.queries = []; meta.abort = null;

function merge(found) {
  for (const a of found) {
    const o = ads[a.id];
    if (o) {
      a.countries = [...new Set([...(o.countries || []), ...a.countries])];
      a.first = o.first;
      for (const k of ['price', 'cur', 'platform', 'bundle', 'apps', 'priceTried', 'shop']) if (o[k] !== undefined) a[k] = o[k];
      for (const k of ['text', 'dest', 'thumb']) if (!a[k]) a[k] = o[k];
      a.stoppedAt = (o.status !== 'inactive' && a.status === 'inactive') ? now : o.stoppedAt;
    } else a.first = now;
    a.lastSeen = now;
    ads[a.id] = a;
  }
}

async function scrollAll(page) {
  let last = 0, same = 0; const trace = [], t0 = Date.now();
  while (Date.now() - t0 < cfg.maxScrollSeconds * 1000) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.keyboard.press('End').catch(() => {});
    await page.waitForTimeout(2200);
    const c = await page.evaluate(() => (document.body.innerText.match(/Library ID|معرّف المكتبة|معرف المكتبة/g) || []).length);
    trace.push(c);
    same = c === last ? same + 1 : 0; last = c;
    if (same >= 4 || c >= cfg.maxCards) break;
  }
  return { cards: last, trace };
}

const browser = await chromium.launch();
let fails = 0;
for (const t of todo) {
  const r = { ...t }, t0 = Date.now();
  const ctx = await browser.newContext({ locale: 'ar', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  try {
    const url = `https://www.facebook.com/ads/library/?active_status=${cfg.status || 'all'}&ad_type=all&country=${t.c}&q=${encodeURIComponent(t.q)}&search_type=keyword_unordered&media_type=all`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    for (const name of [/allow all cookies/i, /السماح بجميع/, /decline optional cookies/i, /رفض ملفات/]) {
      const b = page.getByRole('button', { name }).first();
      if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); break; }
    }
    const s = await scrollAll(page);
    r.cards = s.cards; r.trace = s.trace;
    const found = await page.evaluate(extractAll);
    r.found = found.length;
    merge(found);
    if (!found.length) {
      r.error = 'no cards';
      r.snippet = (await page.evaluate(() => document.body.innerText)).slice(0, 200);
    }
  } catch (e) { r.error = String(e).slice(0, 200); }
  r.ms = Date.now() - t0;
  meta.queries.push(r);
  console.log(JSON.stringify({ ...r, trace: undefined }));
  await ctx.close();
  fails = r.error ? fails + 1 : 0;
  if (fails >= 3) { meta.abort = 'توقف المسح: 3 استعلامات متتالية فشلت (حجب محتمل)'; console.log(meta.abort); break; }
  await sleep(6000 + Math.random() * 6000);
}
await browser.close();

// تنظيف: إعلانات لم تُرَ منذ keepDays أيام
const cut = now - cfg.keepDays * 864e5;
for (const id of Object.keys(ads)) if ((ads[id].lastSeen || ads[id].first || 0) < cut) delete ads[id];

meta.lastRun = now; meta.total = Object.keys(ads).length;
fs.mkdirSync(D, { recursive: true });
fs.writeFileSync(D + 'ads.json', JSON.stringify(ads));
fs.writeFileSync(D + 'meta.json', JSON.stringify(meta, null, 1));
console.log('إجمالي الإعلانات المحفوظة:', meta.total);
