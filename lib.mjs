/* lib.js: منطق مشترك بين لوحة التحكم والخلفية */
const NORM = s => String(s || '').toLowerCase().replace(/[\u064B-\u065F\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const STOP = new Set(('الدفع عند الاستلام التوصيل توصيل لجميع الولايات اطلب الان مجاني مجانا سعر دينار جزائري شحن مدن المملكه السعوديه الجزائر عرض خاص محدود الكميه متوفر متوفره لدينا يمكنك الطلب طلب اضغط الرابط تواصل معنا واتساب رقم الهاتف ضمان جوده عاليه احصل علي على من في الي الى هذا هذه هذي مع كل عن او ثم الان فقط بدون بعد قبل اكثر اجل لكل حتي حتى ' +
  'cash delivery paiement livraison gratuite commandez maintenant prix pour les des une avec dans vous nous the and for with your').split(' '));
const toks = t => [...new Set((NORM(t).match(/[\u0621-\u064Aa-z]{3,}/g) || []).filter(w => !STOP.has(w)))];

/* مجالك: أدوات المنزل والمطبخ والكهرومنزلي */
const NICHE_DEFAULT = 'مطبخ طبخ كهربائي كهرومنزلي قدر ضغط ماكينة خلاط مكنسة مروحة مدفأة غلاية مقلاة فرن ثلاجة غسالة أواني صحون طنجرة عجين عصير قهوة سخان محضرة شواية مجفف تقطيع خضار فرامة مبشرة طاسة موقد ميكروويف مكواة cuisine robot friteuse mixeur aspirateur ustensiles cuiseur bouilloire ventilateur chauffage electrique';
const NICHE_PRESET = ['مقلاة هوائية الدفع عند الاستلام', 'خلاط كهربائي الدفع عند الاستلام', 'قدر ضغط كهربائي', 'ماكينة تقطيع الخضار', 'مكنسة كهربائية الدفع عند الاستلام', 'أدوات المطبخ توصيل لجميع الولايات', 'أواني المطبخ الدفع عند الاستلام', 'مدفأة كهربائية الدفع عند الاستلام', 'غلاية كهربائية الدفع عند الاستلام', 'robot de cuisine paiement à la livraison', 'friteuse sans huile paiement à la livraison', 'ustensiles de cuisine livraison 58 wilayas'];
let NICHE = new Set();
const stem = w => w.replace(/^(وال|بال|لل|ال)/, '');
function setNiche(str) { NICHE = new Set(toks(str || NICHE_DEFAULT).map(stem)); }
const isNiche = text => toks(text).some(w => NICHE.has(stem(w)));
setNiche();

function median(a) { return a.length ? a[Math.floor(a.length / 2)] : 0; }

function clusters(ads) {
  const list = Object.values(ads).filter(a => a.text).map(a => ({ a, t: toks(a.text) })).filter(x => x.t.length >= 4);
  const idx = new Map();
  list.forEach((x, i) => x.t.forEach(w => { if (!idx.has(w)) idx.set(w, []); idx.get(w).push(i); }));
  const par = list.map((_, i) => i);
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  list.forEach((x, i) => {
    const cnt = new Map();
    x.t.forEach(w => { const l = idx.get(w); if (l.length > 80) return; l.forEach(j => { if (j > i) cnt.set(j, (cnt.get(j) || 0) + 1); }); });
    cnt.forEach((c, j) => { const y = list[j], jac = c / (x.t.length + y.t.length - c); if (c >= 3 && jac >= 0.25) par[find(j)] = find(i); });
  });
  const groups = new Map();
  list.forEach((x, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(x); });
  const now = Date.now(), D14 = 14 * 864e5, out = [];
  groups.forEach(items => {
    if (items.length < 2) return;
    const byAdv = {};
    items.forEach(({ a }) => (byAdv[a.page] ||= []).push(a));
    const advs = Object.entries(byAdv);
    let win = 0, killed = 0, ent = 0, active = 0; const starts = [];
    advs.forEach(([, arr]) => {
      if (arr.some(a => a.status !== 'inactive' && (a.days || 0) >= 14)) win++;
      if (arr.every(a => a.status === 'inactive' && (a.days || 0) < 7)) killed++;
      if (arr.some(a => a.status !== 'inactive')) active++;
      const mn = Math.min(...arr.map(a => a.start || Infinity));
      if (isFinite(mn)) { starts.push(mn); if (now - mn <= D14) ent++; }
    });
    const tc = {}; items.forEach(x => x.t.forEach(w => tc[w] = (tc[w] || 0) + 1));
    const label = Object.entries(tc).sort((x, y) => y[1] - x[1] || y[0].length - x[0].length).slice(0, 3).map(e => e[0]).join(' ');
    const best = items.map(x => x.a).sort((x, y) => (y.days || 0) - (x.days || 0));
    const thumb = (best.find(a => a.thumb) || {}).thumb || '';
    const prices = items.map(x => x.a.price).filter(p => p > 0).sort((x, y) => x - y);
    const adv = advs.length;
    let v;
    if (adv < 2) v = ['—', 'معلنون قليلون لا يكفون للحكم', 'var(--mu)'];
    else if (win === 0 && killed >= 2) v = ['فاشل', killed + ' معلنين جرّبوه وأوقفوه خلال أقل من 7 أيام، ولا أحد صمد 14 يوماً', '#dc2626'];
    else if (adv >= 8 && ent >= 3) v = ['مشبع', 'دخل ' + ent + ' معلنين جدد خلال 14 يوماً ووصل العدد إلى ' + adv, 'var(--wa)'];
    else if (win >= 2) v = ['مثبت', win + ' معلنين يواصلون العرض 14 يوماً فأكثر', 'var(--ok)'];
    else v = ['غير حاسم', 'لا إشارة واضحة بعد: أعد المسح بعد أيام', 'var(--mu)'];
    const niche = items.filter(x => isNiche(x.a.text)).length >= items.length / 2;
    out.push({ label, tc, items: items.map(x => x.a), advs, adv, win, killed, ent, active, thumb, prices, starts, maxDays: best[0].days || 0, v, niche });
  });
  return out;
}

/* الاقتصاد: الحاسبة والمرشحون وسجل الاختبارات تستعمل نفس الدالة */
const DEF_CV = { sell: 3500, buy: 1800, pack: 50, ship: 600, ret: 400, cf: 60, dl: 75, mkt: 350, auto: true };
function econ(cv, sell, buy) {
  const cf = cv.cf / 100, dl = cv.dl / 100, mkt = cv.mkt;
  const margin = sell - buy - cv.pack - cv.ship;
  const perLead = cf * dl * margin - cf * (1 - dl) * cv.ret;
  const perDel = cf * dl ? perLead / (cf * dl) : 0;
  const budget = Math.max(0, Math.round(perDel * 3));
  let v;
  if (perLead <= 0) v = ['اتركه فوراً', 'خسارة حتى لو كان الإعلان بلا تكلفة.', '#dc2626', 'kill0'];
  else if (!mkt) v = ['أدخل تكلفة السوق', 'لا أستطيع الحكم دون تكلفة الطلب الخام المعتادة.', 'var(--mu)', 'nomkt'];
  else if (perLead < mkt) v = ['اتركه', `أقصى تكلفة مسموحة ${Math.round(perLead)} أقل من تكلفة السوق ${mkt}. ابحث عن منتج آخر أو سعر شراء أقل.`, '#dc2626', 'kill'];
  else if (perLead < mkt * 1.3) v = ['هامش ضعيف', 'أي خطأ صغير في التأكيد أو التسليم يحوّله إلى خسارة. لا تجرّبه إلا بزاوية أفضل من المنافسين.', 'var(--wa)', 'weak'];
  else v = ['جرّبه', `بميزانية اختبار حتى ${budget}، وأوقفه إذا استهلكتها دون طلبات مسلّمة.`, 'var(--ok)', 'try'];
  return { margin, perLead, perDel, budget, v };
}

function realRates(tests) {
  let raw = 0, conf = 0, del = 0, rt = 0;
  (tests || []).forEach(t => { raw += +t.raw || 0; conf += +t.conf || 0; del += +t.deliv || 0; rt += +t.retN || 0; });
  return { raw, conf, del, rt, cf: raw ? conf / raw * 100 : 0, dl: (del + rt) ? del / (del + rt) * 100 : 0, ok: raw >= 30 && (del + rt) >= 10 };
}
function effCV(calc, tests) {
  const cv = { ...DEF_CV, ...(calc || {}) }, r = realRates(tests);
  if (cv.auto !== false && r.ok) { cv.cf = Math.max(1, Math.round(r.cf)); cv.dl = Math.max(1, Math.round(r.dl)); }
  return cv;
}

/* مطابقة أسعار الجملة مع مجموعات المنتجات */
function wmatch(cl, wh) {
  return (wh || []).filter(w => {
    const t = toks(w.kw || w.name); if (!t.length) return false;
    const need = Math.max(1, Math.ceil(t.length / 2)), min = Math.max(2, 0.3 * cl.items.length);
    return t.filter(x => (cl.tc[x] || 0) >= min).length >= need;
  });
}
function candidates(cl, wh, cv) {
  const out = [];
  cl.forEach(p => {
    if (p.v[0] === 'فاشل' || p.v[0] === 'مشبع' || p.v[0] === '—') return;
    wmatch(p, wh).forEach(w => {
      const sell = median(p.prices) || +w.sell || 0;
      out.push({ p, w, sell, e: sell ? econ(cv, sell, +w.buy || 0) : null });
    });
  });
  return out;
}
export { NORM, STOP, toks, NICHE_DEFAULT, NICHE_PRESET, setNiche, isNiche, stem, median, clusters, econ, DEF_CV, realRates, effCV, wmatch, candidates };
