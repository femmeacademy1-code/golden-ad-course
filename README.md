# מודעת הזהב – מערכת הקורס

דף מכירה, התחברות, אזור קורס עם גולדי (סוכנת AI), ולוח ניהול. רץ על **Cloudflare Pages + Functions + D1**.
בלי שלב build: `public/` הוא האתר, `functions/` ה-API, `migrations/` מסד הנתונים.

## מה בנוי
| נתיב | מה |
|---|---|
| `/` | דף מכירה + טופס הרשמה (שומר תלמידה כ"ממתינה" ומעביר לתשלום) |
| `/login`, `/reset` | כניסה ואיפוס סיסמה |
| `/course` | פרקים, דפי יצירה (נשמרים אוטומטית), גולדי, ייצוא לדוקס |
| `/admin` | תלמידות, שליחת גישה (מייל/ווצאפ), הערות, CSV, **הגדרות** (חוקי גולדי, סרטונים, קבוצת ווצאפ, פיקסל) |
| `/legal` | תקנון, פרטיות, עוגיות (טיוטה – למלא את השדות ב-[ ] ולהעביר לעו"ד) |

## מה עוד לא סגור
- **חברת סליקה**: `functions/_lib/payment.js` גנרי. אחרי שבוחרים חברה מתאימים את קריאת ה-webhook והאימות אליה.
- **תמונות לדף המכירה** (סרטוני בונוס 3, המלצות): שמים קבצים ב-`public/assets/slots/` בשמות `bonus-ad-video-1.jpg` … `review-1.jpg` … (jpg/png/webp).
- הפונט Ploni Yad – לוודא רישיון אתר.

## הקמה (פעם אחת)
1. **Cloudflare**: Workers & Pages → Create → Pages → Connect to Git → הריפו הזה. Build command: ריק. Output directory: `public`.
2. **D1**: `npx wrangler login`, ואז `npx wrangler d1 create golden-ad-course`. מעתיקים את ה-`database_id` ל-`wrangler.toml`, ובלוח Cloudflare: Pages → Settings → Bindings → D1 database → שם משתנה `DB`.
3. טבלאות: `npm install && npm run db:remote`.
4. **משתנים וסודות** (Pages → Settings → Variables and Secrets):
   `SITE_URL` (למשל `https://kurs.example.com`), `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `MAIL_FROM`, `PAYMENT_WEBHOOK_SECRET`,
   `PAYMENT_URL_TEMPLATE` (קישור דף התשלום; אפשר להשתמש ב-`{id}` `{email}` `{name}` `{phone}` `{amount}`),
   `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` (מייצרים עם `npm run hash -- 'סיסמה-ארוכה'`), `WHATSAPP_GROUP_URL` (אופציונלי), `ANTHROPIC_MODEL` (אופציונלי).
5. **Resend**: מאמתים דומיין שולח (SPF/DKIM) כדי שהמיילים לא ייפלו לספאם.
6. כתובת ה-webhook לחברת הסליקה: `https://<הדומיין>/api/payment-webhook?secret=<PAYMENT_WEBHOOK_SECRET>`.
7. נכנסים ל-`/admin`, ובהגדרות מדביקים קישורי embed של 4 הסרטונים וקישור לקבוצת הווצאפ.

## פיתוח מקומי
```
npm install
cp .dev.vars.example .dev.vars   # ממלאים ערכים
npm run db:local
npm run dev                       # http://localhost:8788
```

## זרימת רכישה
טופס → `POST /api/checkout` (תלמידה "ממתינה" + הסכמות) → דף תשלום → webhook → סיסמה אקראית, גישה פעילה, מייל עם הפרטים.
ה-webhook אידמפוטנטי לפי מספר העסקה, ומחזיר שגיאה אם המייל נכשל כדי שהחברה תנסה שוב.
