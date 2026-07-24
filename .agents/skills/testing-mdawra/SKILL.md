---
name: testing-mdawra
description: How to bring up and end-to-end test the Mdawra restaurant ordering platform (Express + Prisma/Postgres backend, Vite React customer menu + admin panel) locally in a browser.
---

# Testing the Mdawra ordering platform

## Bring-up (all three must run)

```bash
sudo service postgresql start                      # DB `mdawra`, role mdawra/mdawra
cd <repo>/backend  && npx prisma migrate deploy && node prisma/seed.js   # only if data missing
cd <repo>/backend  && setsid nohup node src/index.js  > /tmp/backend.log 2>&1 &   # :4000
cd <repo>/frontend && setsid nohup npm run dev        > /tmp/frontend.log 2>&1 &  # :5173
curl -s -o /dev/null -w 'api:%{http_code}\n' localhost:4000/api/categories
```

Processes are killed by VM restarts — always re-check both ports before blaming the app
(`ERR_CONNECTION_REFUSED` in Chrome usually just means the dev servers are down).

Customer menu: `http://localhost:5173/` · Admin: `http://localhost:5173/admin/login`
(seeded admin `admin@mdawra.com` / `Admin@123`).

## Useful facts when writing tests

- Settings (`/admin/settings`) drive the cart: `deliveryFee`, `minimumOrder` (seeded 2.000),
  `serviceChargePercent`, `taxPercent`, `whatsappNumber`. Below the minimum the Checkout button
  is disabled — keep the cart above it or the checkout test cannot run.
- The **WhatsApp checkout button also creates a real order** in the DB; expect an extra order row.
  It opens `api.whatsapp.com/send/?phone=…` and Chrome shows an `Open xdg-open?` prompt — that is
  expected, just verify the URL/decoded text and cancel.
- Customizable items are opened via the `›` button (not `+`); extras with `extraPrice` add to the
  modal CTA amount and become a sub-line in the cart and in the admin order detail.
- New categories/items are inserted with `order = 0`, so they appear near the **top**, not appended
  last. Don't assume "created last ⇒ shown last" when asserting ordering.
- The Media picker and file upload use a normal `<input type=file>`; in the GTK file chooser use
  `ctrl+L` and paste the absolute path. Sample images live in `/home/ubuntu/mdawra_assets/*.jpeg`.
- Arabic text often cannot be typed via xdotool; if an "(AR)" field is required, an ASCII
  placeholder is acceptable — note it in the report instead of claiming Arabic input was verified.
- Admin nav hides `Users` for STAFF (`AdminLayout.jsx` `adminOnly` filter) but the route has no
  guard; STAFF can still open `/admin/users` and the API returns `Insufficient permissions`.
- Known cosmetic bug area: i18n pluralization uses legacy `*_plural` keys with i18next v26, so
  counts render as "3 item". If a plural label looks wrong, check `src/i18n/{en,ar}.json` key
  suffixes (`_one`/`_other`) before assuming a component bug.

## Devin Secrets Needed

None — everything runs locally with seeded credentials.
