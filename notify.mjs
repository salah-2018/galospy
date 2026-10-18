// المرحلة 4: تنبيه Telegram بالمرشحين الجدد أو بتوقف المسح
import fs from 'fs';
const read = f => { try { return JSON.parse(fs.readFileSync('docs/data/' + f, 'utf8')); } catch { return null; } };
const prod = read('products.json'), meta = read('meta.json');
const token = process.env.TELEGRAM_TOKEN, chat = process.env.TELEGRAM_CHAT, url = process.env.DASHBOARD_URL || '';
const lines = [];
if (meta && meta.abort) lines.push('تحذير: ' + meta.abort);
const fresh = prod ? prod.products.filter(p => p.isNew).slice(0, 5) : [];
fresh.forEach(p => lines.push(`مرشح جديد: ${p.label}\n  ${p.countries.join('/')} | ${p.niche} | ${p.adv} معلن، ${p.proven} صامد ≥${prod.criteria.provenDays} يوم | وسيط السعر ${p.price.med || 'غير معروف'}`));
if (!lines.length) { console.log('لا شيء للتنبيه'); process.exit(0); }
const text = lines.join('\n\n') + (url ? '\n\n' + url : '');
console.log(text);
if (!token || !chat) { console.log('(لا توجد أسرار Telegram: لم يُرسل)'); process.exit(0); }
const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }) });
console.log('Telegram:', r.status);
