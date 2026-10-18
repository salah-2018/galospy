// المرحلة 2: قراءة صفحات الهبوط (سعر، منصة، حزم، تطبيقات) من الخادم، دون قيود CORS
import fs from 'fs';

const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const D = 'docs/data/';
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(D + f, 'utf8')); } catch { return d; } };
const ads = read('ads.json', {}), stores = read('stores.json', {});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const safeUrl = u => {
  try {
    const x = new URL(u);
    if (!/^https?:$/.test(x.protocol)) return null;
    if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(x.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(x.hostname) || /\.(local|internal)$/.test(x.hostname)) return null;
    return x;
  } catch { return null; }
};
async function get(url, ms = 12000) {
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': UA, 'accept-language': 'ar,fr;q=0.8,en;q=0.5' } });
    if (!r.ok) throw new Error('http ' + r.status);
    return (await r.text()).slice(0, 1_500_000);
  } finally { clearTimeout(to); }
}
const AR_D = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const num = v => {
  let t = AR_D(v).replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t.replace(/,/g, '')); return isFinite(n) ? n : 0;
};
const APPS = {
  'Facebook Pixel': /fbq\(|fbevents\.js/i, 'TikTok Pixel': /analytics\.tiktok\.com/i, 'Snap Pixel': /sc-static\.net\/scevent/i,
  'Google Tag': /googletagmanager\.com/i, Hotjar: /hotjar/i, Klaviyo: /klaviyo/i, 'Judge.me': /judge\.me/i, Loox: /loox\.io/i,
  Stamped: /stamped\.io/i, Yotpo: /yotpo/i, PageFly: /pagefly/i, GemPages: /gempages/i, Vitals: /vitals\.co/i, ReConvert: /reconvert/i,
  Zipify: /zipify/i, Tidio: /tidio/i, 'Tawk.to': /tawk\.to/i, 'Releasit COD': /releasit/i, 'EasySell COD': /easysell/i
};

function parse(html) {
  const meta = n => { const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${n}["'][^>]*content=["']([^"']*)`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${n}["']`, 'i')); return a ? a[1] : ''; };
  let price = meta('product:price:amount') || meta('og:price:amount'), cur = meta('product:price:currency') || meta('og:price:currency');
  const walk = o => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    const t = [].concat(o['@type'] || []);
    if (t.includes('Product') && o.offers) { const f = [].concat(o.offers)[0] || {}; price = price || f.price || f.lowPrice; cur = cur || f.priceCurrency; }
    Object.values(o).forEach(walk);
  };
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { walk(JSON.parse(m[1])); } catch {} }
  const text = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  if (!price) { const mm = text.match(/([\d٠-٩][\d٠-٩.,\s]{1,9}?)\s*(دج|د\.ج|دينار|DA|DZD|ر\.س|ريال|SAR)/i); if (mm) { price = mm[1]; cur = mm[2]; } }
  const platform = /cdn\.shopify\.com/.test(html) ? 'Shopify' : /youcan/i.test(html) ? 'YouCan' : /zid\.(store|sa)/i.test(html) ? 'Zid' : /salla/i.test(html) ? 'Salla' : /woocommerce/i.test(html) ? 'WooCommerce' : /wp-content/.test(html) ? 'WordPress' : 'unknown';
  const bundle = /(اشتر[يى]\s*\d|\d\s*\+\s*\d|قطعتين|قطعتان|3\s*قطع|buy\s*\d|2\s*pieces)/i.test(text);
  const apps = Object.keys(APPS).filter(k => APPS[k].test(html));
  return { price: num(price), cur: cur || '', platform, bundle, apps, title: meta('og:title') || (html.match(/<title>([^<]*)/i) || [])[1] || '' };
}

async function shopify(origin) {
  const j = JSON.parse(await get(origin + '/products.json?limit=250'));
  const ps = j.products || [];
  const prices = ps.map(p => +p.variants?.[0]?.price).filter(Boolean);
  return {
    products: ps.length, minP: prices.length ? Math.min(...prices) : 0, maxP: prices.length ? Math.max(...prices) : 0,
    avgP: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
    newest: [...ps].sort((x, y) => new Date(y.created_at) - new Date(x.created_at)).slice(0, 5).map(p => ({ title: p.title, price: p.variants?.[0]?.price, created: (p.created_at || '').slice(0, 10) }))
  };
}

const key = a => { const u = safeUrl(a.dest); return u ? u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '') : null; };
const lim = Date.now() - 3 * 864e5, groups = new Map();
Object.values(ads).forEach(a => {
  const k = key(a); if (!k || a.price > 0 || a.priceTried > lim) return;
  if (!groups.has(k)) groups.set(k, []); groups.get(k).push(a);
});
const list = [...groups.entries()].sort((x, y) => Math.max(...y[1].map(a => a.days || 0)) - Math.max(...x[1].map(a => a.days || 0))).slice(0, cfg.maxEnrichPerRun);
console.log('صفحات للفحص:', list.length, 'من', groups.size);

let ok = 0;
for (const [k, arr] of list) {
  const f = { priceTried: Date.now() };
  try {
    const info = parse(await get(arr[0].dest));
    Object.assign(f, { platform: info.platform, bundle: info.bundle, cur: info.cur, apps: info.apps }); if (info.price) f.price = info.price;
    const origin = safeUrl(arr[0].dest).origin, h = origin.replace(/^https?:\/\/(www\.)?/, '');
    if (info.platform === 'Shopify' && !(stores[h] && Date.now() - stores[h].t < 3 * 864e5)) {
      try { stores[h] = { ...(await shopify(origin)), platform: 'Shopify', apps: info.apps, t: Date.now() }; } catch {}
    }
    ok++;
  } catch {}
  arr.forEach(a => Object.assign(a, f));
  await sleep(400);
}
console.log('نجح فحص', ok, 'من', list.length);
const hs = Object.keys(stores);
if (hs.length > 400) hs.sort((a, b) => stores[a].t - stores[b].t).slice(0, hs.length - 400).forEach(h => delete stores[h]);
fs.writeFileSync(D + 'ads.json', JSON.stringify(ads));
fs.writeFileSync(D + 'stores.json', JSON.stringify(stores));
