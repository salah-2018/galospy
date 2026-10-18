# Ad Spy أونلاين

1. أنشئ مستودعاً **عاماً** على GitHub وارفع كل محتويات هذا المجلد (بما فيها `.github` و`docs`).
2. Settings > Pages: Source = Deploy from a branch، Branch = main، Folder = /docs.
3. Settings > Actions > General > Workflow permissions: Read and write permissions.
4. Actions > scrape > Run workflow (أول تشغيل يدوي). بعد انتهائه افتح رابط Pages.
5. اختياري لتنبيهات Telegram: أنشئ بوتاً من BotFather، وأضف في Settings > Secrets and variables > Actions
   السريّين `TELEGRAM_TOKEN` و`TELEGRAM_CHAT`، والمتغير `DASHBOARD_URL` (رابط صفحتك).
6. عدّل `config.json` (الدول، الكلمات، معايير الترشيح، قواميس المجالات).

بعد كل تشغيل يلتزم البوت بتحديث `docs/data`. يعمل كل 6 ساعات تلقائياً.
