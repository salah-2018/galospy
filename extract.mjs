// يُنفَّذ داخل صفحة Ad Library عبر page.evaluate (يجب ألا يعتمد على أي متغير خارجي)
export function extractAll() {
  const ID_RE = /(?:Library ID|معرّف المكتبة|معرف المكتبة)\s*:?\s*([\d٠-٩]+)/;
  const ID_ALL = /(Library ID|معرّف المكتبة|معرف المكتبة)/g;
  const norm = s => s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
  const EN = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const AR = [['يناير', 'كانون الثاني'], ['فبراير', 'شباط'], ['مارس', 'آذار'], ['أبريل', 'نيسان'], ['مايو', 'أيار'], ['يونيو', 'حزيران'], ['يوليو', 'تموز'], ['أغسطس', 'آب'], ['سبتمبر', 'أيلول'], ['أكتوبر', 'تشرين الأول'], ['نوفمبر', 'تشرين الثاني'], ['ديسمبر', 'كانون الأول']];

  function parseDate(t) {
    t = norm(t); let m;
    if ((m = t.match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{4})/))) return new Date(+m[3], EN[m[2].toLowerCase()], +m[1]);
    if ((m = t.match(/([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})/))) return new Date(+m[3], EN[m[1].toLowerCase()], +m[2]);
    if ((m = t.match(/(\d{1,2})\s+([\u0600-\u06FF ]+?)\s+(\d{4})/))) {
      const i = AR.findIndex(a => a.some(n => m[2].includes(n)));
      if (i >= 0) return new Date(+m[3], i, +m[1]);
    }
    if ((m = t.match(/(\d{4})-(\d{2})-(\d{2})/))) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }
  function dates(text) {
    const out = [];
    for (const line of text.split('\n')) for (const part of line.split(/\s[-–—]\s/)) { const d = parseDate(part); if (d) out.push(d); }
    return out;
  }
  const country = () => (new URLSearchParams(location.search).get('country') || '').toUpperCase();

  function findCards() {
    const out = new Map();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (!n.nodeValue.match(ID_ALL)) continue;
      let el = n.parentElement;
      while (el.parentElement && el.parentElement !== document.body) {
        const c = (el.parentElement.innerText.match(ID_ALL) || []).length;
        if (c > 1) break;
        el = el.parentElement;
      }
      const m = el.innerText.match(ID_RE);
      if (m) out.set(norm(m[1]), el);
    }
    return out;
  }

  function extract(id, el) {
    const text = el.innerText;
    const a = { id, countries: [country()].filter(Boolean), seen: Date.now() };
    const ds = dates(text), start = ds[0];
    a.status = /Inactive|غير نشط/.test(text) ? 'inactive' : 'active';
    const end = a.status === 'inactive' && ds[1] ? ds[1] : new Date();
    a.start = start ? start.getTime() : null;
    a.days = start ? Math.max(0, Math.floor((end - start) / 864e5)) : 0;

    const links = [...el.querySelectorAll('a[href]')];
    const pl = links.find(l => /facebook\.com\/(?!ads\/|l\.php|help|policies)[^/?]+/.test(l.href) && l.innerText.trim());
    a.page = pl ? pl.innerText.trim() : '(unknown)';
    a.pageUrl = pl ? pl.href.split('?')[0] : '';

    let dest = '';
    for (const l of links) {
      try {
        const u = new URL(l.href);
        if (u.hostname === 'l.facebook.com' && u.searchParams.get('u')) { dest = u.searchParams.get('u'); break; }
        if (!/facebook\.com|fb\.com|instagram\.com/.test(u.hostname)) { dest = l.href; break; }
      } catch (e) {}
    }
    a.dest = dest;

    const body = el.querySelector('div[style*="pre-wrap"]');
    if (body && body.innerText.trim().length > 10) a.text = body.innerText.trim().slice(0, 1200);
    else {
      const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 25 && !ID_RE.test(s) && !/Started running|بدأ العرض|Platforms|المنصات/.test(s));
      a.text = (lines.sort((x, y) => y.length - x.length)[0] || '').slice(0, 1200);
    }

    const t2 = norm(text);
    const cm = t2.match(/(\d+)\s+ads?\s+use\s+this/i) || t2.match(/(\d+)\s+إعلان(?:ات)?\s+(?:تستخدم|يستخدم)/);
    a.copies = cm ? +cm[1] : 1;
    const v = el.querySelector('video');
    a.media = v ? 'video' : 'image';
    const img = [...el.querySelectorAll('img')].find(i => /fbcdn|scontent/.test(i.src) && (i.width > 100 || i.naturalWidth > 100));
    a.thumb = (v && v.poster) || (img && img.src) || '';
    return a;
  }

  const out = [];
  findCards().forEach((el, id) => { try { out.push(extract(id, el)); } catch (e) {} });
  return out;
}
