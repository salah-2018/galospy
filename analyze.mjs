// المرحلة 3: تجميع الإعلانات في منتجات وتطبيق معايير الترشيح المحددة في config.json
import fs from 'fs';
import { clusters, toks, stem, median } from './lib.mjs';

const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8')), C = cfg.criteria;
const D = 'docs/data/';
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(D + f, 'utf8')); } catch { return d; } };
const ads = read('ads.json', {}), stores = read('stores.json', {}), state = read('state.json', { seen: [] });
const now = Date.now(), DAY = 864e5;

// أيام الإعلان النشط تُعاد من تاريخ البدء لأن آخر مسح قد يكون قديماً
Object.values(ads).forEach(a => { if (a.status !== 'inactive' && a.start) a.days = Math.max(0, Math.floor((now - a.start) / DAY)); });

const nicheSets = Object.fromEntries(Object.entries(cfg.niches).map(([k, w]) => [k, new Set(toks(w).map(stem))]));
const nicheOf = text => {
  const t = toks(text).map(stem); let best = 'other', bn = 0;
  for (const [k, s] of Object.entries(nicheSets)) { const n = t.filter(w => s.has(w)).length; if (n > bn) { bn = n; best = k; } }
  return best;
};
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

const out = [];
for (const p of clusters(ads)) {
  const items = p.items;
  const nc = {}; items.forEach(a => { const n = nicheOf(a.text); nc[n] = (nc[n] || 0) + 1; });
  const niche = Object.entries(nc).sort((x, y) => y[1] - x[1])[0][0];
  const countries = [...new Set(items.flatMap(a => a.countries || []))];
  const med = median(p.prices), killRate = p.adv ? p.killed / p.adv : 0;
  const wk = Array(8).fill(0); p.starts.forEach(t => { const w = Math.floor((now - t) / (7 * DAY)); if (w >= 0 && w < 8) wk[w]++; });
  const proven = items.filter(a => a.status !== 'inactive' && (a.days || 0) >= C.provenDays);
  const provenAdv = new Set(proven.map(a => a.page)).size;
  const checks = {
    advertisers: p.adv >= C.minAdvertisers,
    proven: provenAdv >= C.minProven,
    notSaturated: !(p.adv >= C.saturationAdvertisers && p.ent >= C.saturationEntrants14),
    lowKillRate: killRate <= C.maxKillRate,
    price: med ? ((!C.priceMin || med >= C.priceMin) && (!C.priceMax || med <= C.priceMax)) : (C.needPrice ? false : null)
  };
  const labels = { advertisers: 'معلنون قليلون', proven: 'لا يكفي معلنون صامدون', notSaturated: 'مشبع', lowKillRate: 'كثيرون أوقفوه بسرعة', price: 'السعر خارج النطاق أو مجهول' };
  const reasons = Object.entries(checks).filter(([, v]) => v === false).map(([k]) => labels[k]);
  const best = items.slice().sort((x, y) => (y.days || 0) - (x.days || 0));
  const apps = {}; items.forEach(a => (a.apps || []).forEach(x => apps[x] = (apps[x] || 0) + 1));
  const advs = p.advs.map(([page, arr]) => {
    const a = arr.slice().sort((x, y) => (y.days || 0) - (x.days || 0))[0], h = hostOf(a.dest);
    return { page, ads: arr.length, days: a.days || 0, status: a.status, price: (arr.find(x => x.price > 0) || {}).price || 0, dest: a.dest || '', platform: a.platform || '', bundle: !!a.bundle, store: stores[h] ? { products: stores[h].products, avgP: stores[h].avgP } : null, stopped: !!a.stoppedAt };
  }).sort((x, y) => y.days - x.days);
  out.push({
    label: p.label, niche, countries, adv: p.adv, proven: provenAdv, killed: p.killed, ent: p.ent, active: p.active, maxDays: p.maxDays,
    price: { min: p.prices[0] || 0, med, max: p.prices[p.prices.length - 1] || 0, n: p.prices.length },
    bundlePct: Math.round(items.filter(a => a.bundle).length / items.length * 100),
    apps: Object.entries(apps).sort((x, y) => y[1] - x[1]).slice(0, 6).map(e => e[0]),
    checks, reasons, candidate: reasons.length === 0, verdict: p.v[0], weekly: wk,
    thumb: (best.find(a => a.thumb) || {}).thumb || '', thumbId: (best.find(a => a.thumb) || {}).id || '',
    texts: best.slice(0, 3).map(a => a.text).filter(Boolean), advertisers: advs, tc: Object.entries(p.tc).sort((x, y) => y[1] - x[1]).slice(0, 4).map(e => e[0])
  });
}
out.sort((x, y) => (y.candidate - x.candidate) || (y.proven - x.proven) || (y.adv - x.adv));

// المرشحون الجدد (لم يُنبَّه عنهم سابقاً): تشابه ≥2 كلمة مع منتج مرّ سابقاً يُعد نفسه
const seen = state.seen || [];
out.forEach(p => {
  p.isNew = false;
  if (!p.candidate) return;
  if (!seen.some(k => k.filter(w => p.tc.includes(w)).length >= 2)) { p.isNew = true; seen.push(p.tc); }
});
state.seen = seen.slice(-300);

// صور المرشحين: روابط fbcdn تنتهي صلاحيتها، فنحفظ نسخة محلية لأفضل 40 مرشحاً
const keep = new Set();
let dl = 0;
for (const p of out.filter(p => p.candidate).slice(0, 40)) {
  if (!p.thumb || !p.thumbId) continue;
  const f = `docs/media/${p.thumbId}.jpg`; keep.add(`${p.thumbId}.jpg`);
  if (!fs.existsSync(f) && dl < 20) {
    try {
      const r = await fetch(p.thumb, { signal: AbortSignal.timeout(10000) });
      const b = Buffer.from(await r.arrayBuffer());
      if (r.ok && b.length < 400_000) { fs.writeFileSync(f, b); dl++; }
    } catch {}
  }
  if (fs.existsSync(f)) p.thumb = `media/${p.thumbId}.jpg`;
}
try { fs.readdirSync('docs/media').filter(x => x.endsWith('.jpg') && !keep.has(x)).forEach(x => fs.unlinkSync('docs/media/' + x)); } catch {}
out.forEach(p => { delete p.thumbId; });

fs.writeFileSync(D + 'products.json', JSON.stringify({ generated: now, criteria: C, total: out.length, candidates: out.filter(p => p.candidate).length, products: out.slice(0, 400) }));
fs.writeFileSync(D + 'state.json', JSON.stringify(state));
fs.writeFileSync(D + 'ads.json', JSON.stringify(ads));
console.log(`منتجات: ${out.length} | مرشحون: ${out.filter(p => p.candidate).length} | جدد: ${out.filter(p => p.isNew).length}`);
