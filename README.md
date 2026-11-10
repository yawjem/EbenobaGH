# Ebenoba GH — marketplace (v1 build)

```
supabase/migrations/   001 schema · 002 sample data (delete before launch) · 003 order number on packages · 004 create_order (checkout) · 005 seller portal · 006 delivery PIN · 007 phone login · 008 photo slots + offer page · 009 delivery options
supabase/functions/   Edge Functions: checkout, paystack-webhook, send-notifications, promo-notifier, send-sms-hook (+ _shared, _tests)
app-src/               React Native (Expo) buyer app — source files that setup.sh drops into a fresh Expo project
web/                   Next.js: admin dashboard (/admin) + rider site (/rider) — deploy to Vercel
```

## 1. Database (10 min)
1. Supabase → SQL editor → run `001_init_schema.sql`, then `002_seed.sql` (optional), then `003_package_order_number.sql`, then `004_create_order.sql`, then `005_seller_portal.sql`, then `006_delivery_pin.sql`, then `007_phone_login.sql`, then `008_photo_slots_campaign_page.sql`, then `009_delivery_options.sql`.
2. Sign up once (any way), then promote yourself:
   `update public.profiles set role = 'admin' where email = 'you@example.com';`
3. Database → Extensions → enable `pg_cron`, then uncomment the 3 jobs at the bottom of file 001.
4. Auth → Providers → Email: turn **off** "Confirm email" while testing.

## 2. Web (admin + rider) on Vercel
1. Push the repo to GitHub → vercel.com → **Add New Project** → pick the repo.
2. **Root Directory: `web`**. Framework: Next.js (auto).
3. Environment variables (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` — server only. Used by `/api/admin/create-user` to create shop-owner and rider logins. Do **not** prefix with `NEXT_PUBLIC_`.
4. Deploy. Admin signs in at `/login` → `/admin`. Riders use the same login page → `/rider`.

Local run: `cd web && cp .env.example .env.local && npm install && npm run dev`

## 3. Mobile app
On your computer (Node 20+): `cd app-src && bash setup.sh ebenoba-app`, put the Supabase URL and anon key in `ebenoba-app/.env`, then `npx expo start`.
Play Store build later: `npx eas-cli build -p android` (needs a free Expo account).

## Order numbers
Every order has a number like `EB-261104-10000`. Every package carries it (`packages.order_number`), so admin, rider and seller can all search and mark statuses by it, and customers see it in the app.

## 4. Payments and notifications (Edge Functions)
Install the Supabase CLI, then `supabase login` and `supabase link --project-ref <your-ref>`.

**Secrets** (never put these in the app or in `NEXT_PUBLIC_` variables):
```
supabase secrets set PAYSTACK_SECRET_KEY=sk_test_xxx CRON_SECRET=<long random string> \
  MNOTIFY_API_KEY=xxx SMS_SENDER_ID=EbenobaGH BREVO_API_KEY=xkeysib-xxx EMAIL_FROM="Ebenoba GH <orders@yourdomain.com>"
```
**Deploy:**
```
supabase functions deploy checkout
supabase functions deploy paystack-webhook --no-verify-jwt   # Paystack has no Supabase login; the signature is checked in code
supabase functions deploy send-notifications --no-verify-jwt
supabase functions deploy promo-notifier --no-verify-jwt
supabase functions deploy send-sms-hook --no-verify-jwt     # texts the login codes (see Phone login below)
```
**Paystack dashboard** → Settings → API Keys & Webhooks → webhook URL:
`https://<project-ref>.supabase.co/functions/v1/paystack-webhook`. Start with test keys; switch to live keys only after a full test order.

**Schedules** (SQL editor, needs `pg_cron` + `pg_net`; replace the URL and secret):
```sql
select cron.schedule('send-notifications','* * * * *', $$ select net.http_post(
  url:='https://<ref>.supabase.co/functions/v1/send-notifications',
  headers:='{"x-cron-secret":"<CRON_SECRET>"}'::jsonb) $$);
select cron.schedule('promo-notifier','0 */4 * * *', $$ select net.http_post(
  url:='https://<ref>.supabase.co/functions/v1/promo-notifier',
  headers:='{"x-cron-secret":"<CRON_SECRET>"}'::jsonb) $$);
```
Plus the 3 SQL jobs from file 001 (interest refresh, earnings release, expire unpaid orders).

**Push notifications:** in the app folder run `npx eas-cli init` once (creates the Expo project ID the push registration needs).
**SMS:** register your sender ID in your mNotify dashboard before launch, otherwise messages may be rejected or rewritten. Check one real SMS end to end.

## Seller portal ("My Shop" tab)
1. A buyer opens **Account → Sell on Ebenoba GH** and sends an application (shop name, description, phone, region, city).
2. You approve it in the admin dashboard → **Seller applications** (optionally set that shop's commission). This creates the shop, makes the person a seller and sends them a push + email.
3. When they next open the app, a **My Shop** tab appears (only for approved sellers). It has:
   - dashboard: orders to pack, ready for pickup, return requests, low stock; sales graph (7/30/90 days) with comparison to the previous period; monthly goal progress bar; money on hold / ready to pay out / paid out; best sellers
   - **Add product / My products**: up to 6 pictures, description, category, brand, price, sale price with an end date, options (size/colour) with stock, Live/Hidden/Archived
   - **Business profile**: picture, name, about, phone, address, monthly goal, MoMo or bank details for payouts
   - **Shop orders**: search by order number; Start packing → Packed; "Can't supply"; approve or reject returns
   Sellers get a push notification for every new paid order. Admin-created owners (Shops page) see the tab too.
After updating an existing app project run `npx expo install expo-image-picker` and rebuild the dev client (new native module).

## Phone login (SMS code) and guest browsing
The login screen offers **Phone number** (a 6-digit code texted to the person, no password) and **Email + password**. A "Continue browsing" button closes it: anyone can open the app and browse, search and fill a cart with no account. An account is asked for only at checkout, orders, wishlist and selling.
Supabase sends the code through our `send-sms-hook` function, which texts it with mNotify (Ghana numbers only). One-time setup:
1. Run `007_phone_login.sql` and deploy `send-sms-hook` (command above).
2. Supabase dashboard → Authentication → Sign In / Providers → **Phone**: turn it on. We do not use Twilio; the hook below does the sending. (If the page insists on choosing a provider, pick any: the hook replaces it.)
3. Authentication → **Hooks** → Send SMS → type HTTPS → URL `https://<ref>.supabase.co/functions/v1/send-sms-hook` → generate the secret, then run `supabase secrets set SEND_SMS_HOOK_SECRET="v1,whsec_..."` (paste exactly what the dashboard shows).
4. Authentication → Rate limits: raise "SMS sent per hour" (the default is low and a busy launch day can hit it). Set the code expiry to about 5 minutes (networks can be slow).
5. Your mNotify sender ID `EbenobaGH` must be approved. Test with your own number before the client sees it.
A person who signs up by phone and another by email are separate accounts, even with the same number (we can add account linking later). Phone sign-ups have no email, so they get SMS and push updates only.

## Brevo (email codes + order emails)
1. Brevo account → *Senders, domains & dedicated IPs* → add and verify the sender address (e.g. orders@yourdomain.com).
2. *SMTP & API* → create an **API key** (for order emails) and note the **SMTP** login/key (for the sign-up code).
3. Supabase → Authentication → *SMTP Settings* → enable custom SMTP: host `smtp-relay.brevo.com`, port `587`, the SMTP login and key from Brevo, sender = the verified address.
4. Supabase → Authentication → *Email Templates* → **Confirm signup**: put `Your Ebenoba GH code is {{ .Token }}` in the body (remove the `{{ .ConfirmationURL }}` link). Authentication → Providers → Email: *Confirm email* ON, *OTP length* 6.
5. Secrets for the order emails: `supabase secrets set BREVO_API_KEY=xkeysib-... EMAIL_FROM="Ebenoba GH <orders@yourdomain.com>"`, then redeploy `send-notifications`.

## Google sign-in
1. Google Cloud Console → APIs & Services → OAuth consent screen (External), then Credentials → *Create OAuth client ID* → **Web application**. Authorised redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback`.
2. Supabase → Authentication → Providers → Google → paste the Client ID and Secret, enable.
3. Supabase → Authentication → URL Configuration → add to *Redirect URLs*: `ebenoba://**` and (for Expo Go testing only) `exp://**`.

## Delivery options
Customers pick ONE method and ONE time for the whole order. Ghana: Ebenoba Rider, Shaq Express, Seamless Courier Service. Other countries: FedEx (only countries in an active zone).
Price = base x method factor x time multiplier; international base = zone base + per-kg x weight (sellers enter product weight). Everything is editable in the admin dashboard under **Delivery options**; the seeded FedEx zones and prices are placeholders.

## Product photos
Every product needs one picture **in the box** and one **out of the box / in use** before it can go Live, plus up to 4 extra views. Tapping an offer banner opens the list of products it applies to.

## Delivery PIN
Every package gets a 4-digit code that only the buyer can see (order screen in the app, and in the "on its way" SMS for our own riders). The rider enters it on the rider site to confirm delivery; the server checks it. 5 wrong tries lock the package. In the admin order page you can see the code, see failed tries, and press **New code / unlock**. Third-party couriers and pickups have no code: you mark those delivered by hand. After running 006, redeploy `send-notifications` (the SMS wording changed).

## Colour system
Crimson = brand, buttons, sale. Navy = structure and "we're preparing it". Teal = delivery and trust. Gold = stars, featured, needs attention. Green = success only. Small text on tinted backgrounds uses the darker `*Text` shades (contrast 4.5:1 or better). Edit in `app-src/src/lib/theme.ts` and `web/app/globals.css`.

## Tests
`bun test supabase/functions/_tests` runs 31 tests for the webhook signature, amount checks, idempotency, checkout errors and notification retries.

## What works now vs. what is still to build
| Done | Next |
|---|---|
| Buyer app + My Shop tab: browse, search, product page ("Sold by"), wishlist, cart, address, **checkout via Paystack**, orders + live tracking, consent-based tracking, recommendations, push token | Seller web version, bulk product upload, seller-created brands |
| Admin: overview, orders, shops + owners, products, riders, promotions, returns, complaints, earnings, settings | Live rider tracking, cars, account linking (phone + email), web storefront link |
| Server: atomic order creation, Paystack webhook, SMS/email/push on status change, capped promo pushes | Automatic Paystack split payouts and refunds (currently recorded manually by admin) |

**Not yet verified by me:** a real `npm install` / `expo start` / `next build` (my workspace could not reach the npm registry), the Edge Functions on a live Deno runtime, and mNotify's exact response format. Run the app and one test order on your machine before showing the client.
