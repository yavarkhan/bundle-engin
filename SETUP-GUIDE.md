# Bundle Engine — Complete Setup Guide (beginner-friendly)

Follow this top to bottom. Don't skip steps. Every command shows what success
and failure look like.

---

## Part A — Install the tools (once)

### A1. Install Node.js
1. Go to https://nodejs.org and install the **LTS** version (20 or newer).
2. Open a terminal (Windows: press Start, type `powershell`, press Enter).
3. Run:
   ```
   node --version
   ```
   **Success:** prints something like `v20.11.0`.
   **Failure:** "node is not recognized" → close and reopen the terminal; if it persists, reinstall Node and tick "Add to PATH".

### A2. Install the Shopify CLI
```
npm install -g @shopify/cli@latest
```
**Success:** ends with `added … packages`. Check with `shopify version` → prints `3.x.x`.
**Failure (permissions error on Mac/Linux):** run `sudo npm install -g @shopify/cli@latest`.

### A3. Get a Partner account + development store
1. Sign up free at https://partners.shopify.com (use yavarkhan@gmail.com).
2. In the Partner Dashboard: **Stores → Add store → Create development store**. Name it anything (e.g. `bundle-engine-test`). You'll test here before touching your live store.

---

## Part B — Create the app

### B1. Generate the official app
In your terminal, go to the folder where you keep projects, then:
```
shopify app init
```
It asks questions — answer:
- *Name your app:* `bundle-engine`
- *Which template:* **Build a Remix app** (recommended) → **TypeScript**

**Success:** ends with `Your project is ready!` and a new `bundle-engine` folder exists.
**Failure (login prompt):** a browser opens — log in with your Partner account, then it continues.

### B2. Open the project
```
cd bundle-engine
```
All commands from now on run **inside this folder**.

### B3. Copy the overlay files
Copy everything from this scaffold into the generated app using the table in
[`README.md`](./README.md). In plain words:
1. **Replace** `prisma/schema.prisma` with ours.
2. Copy `prisma/seed-offers.cjs` in next to it.
3. Create the folder `app/models/` and copy both `.server.ts` files into it.
4. **Replace** `app/routes/app.tsx` and `app/routes/app._index.tsx`; copy `app.offers.$id.tsx` in next to them.
5. Copy the `tests/` folder and `vitest.config.ts` to the app root.
6. Do **not** copy `shopify.app.toml` or `package.json` — those are reference files; we edit the generated ones in B4/B5.

### B4. Set the scopes
Open the generated `shopify.app.toml` (app root) and make the scopes line read:
```toml
[access_scopes]
scopes = "read_products,write_discounts,read_discounts"
```

### B5. Add the test runner
```
npm install
npm install -D vitest
```
Then open the generated `package.json` and add inside `"scripts": { … }`:
```json
"test": "vitest run",
"seed:offers": "node prisma/seed-offers.cjs"
```
**Success for npm install:** ends with `added … packages` (warnings are fine).
**Failure (`EACCES`/network):** check your internet; corporate VPNs sometimes block npm — try again off VPN.

### B6. Create the database
```
npm run setup
```
(That template script runs `prisma generate && prisma migrate deploy`. If it errors, run `npx prisma migrate dev --name add-bundles` instead.)
**Success:** `Your database is now in sync with your schema.`
**Failure `Drift detected`:** delete the file `prisma/dev.sqlite` and the folder `prisma/migrations`, then run `npx prisma migrate dev --name init` — this is safe; the dev database is empty.

---

## Part C — Add the two extensions

### C1. The discount Function
```
shopify app generate extension
```
Answer: *Type:* **Discount function** → *Name:* `bundle-discount` → *Language:* **JavaScript**.
**Success:** `extensions/bundle-discount` folder appears.

Now overlay our files:
1. **Replace** `extensions/bundle-discount/src/cart_lines_discounts_generate_run.js` with ours.
2. **Replace** `extensions/bundle-discount/src/cart_lines_discounts_generate_run.graphql` with ours.
3. **Replace** `extensions/bundle-discount/src/index.js` with ours.
4. Copy in `extensions/bundle-discount/src/evaluate.js` and `extensions/bundle-discount/tests/evaluate.test.js`.
5. If the generated folder also has `cart_delivery_options_…` files, **delete them**, and in `extensions/bundle-discount/shopify.extension.toml` delete the whole `[[extensions.targeting]]` block that mentions `cart.delivery-options` (compare with our reference toml). We don't discount shipping.

### C2. The theme widget
```
shopify app generate extension
```
Answer: *Type:* **Theme app extension** → *Name:* `bundle-widget`.
Then copy our files into it: `blocks/bundle-widget.liquid`, `blocks/app-embed.liquid`, `assets/be-widget.js`, `assets/be-widget.css`, `locales/en.default.json`.

### C3. Run the tests
```
npm run test
```
**Success:** all tests pass — `Test Files 2 passed`, ~30 tests, covering quantity breaks, BOGO, free gifts, Mix & Match, cart/checkout calculations, and bundle-creation validation.
**Failure:** the error names the file and line — re-check you copied that file completely.

---

## Part D — Run it locally and create your first bundle

### D1. Start dev mode
```
shopify app dev
```
Answer the prompts: select your **development store**. 
**Success:** a QR/preview URL appears and the terminal says `Preview URL: …`. Press `p` to open the app — it opens embedded in your dev store's admin.
**Failure `store not found`:** run `shopify app config link` and pick the right organization/store, then retry.

### D2. (Optional) load the 4 prebuilt offers
In a **second** terminal in the same folder:
```
npm run seed:offers
```
**Success:** `Created 4 draft offers…` — they appear in the app's offer list.

### D3. Create your first offer
1. In the embedded app click **Create offer**.
2. Name: `Buy more, save more`. Type: **Quantity break**.
3. Click **Select products** and pick one test product.
4. Keep the default tiers (Buy 2 → 10%, Buy 3 → 15%) or edit them.
5. Click **Save & activate**.
**Success:** you return to the list and the offer shows a green **ACTIVE** badge. Behind the scenes the app just created an automatic discount called **Bundle Engine** (check: dev store admin → Discounts).
**Failure "Discount function not found":** the function isn't registered yet — make sure `shopify app dev` is still running in the other terminal (it registers the function), then click Save & activate again.

### D4. Put the widget on the product page
1. Dev store admin → **Online Store → Themes → Customize**.
2. Top-center dropdown → **Products → Default product**.
3. In the left sidebar inside the product information section click **Add block → Apps → Bundle Widget**. Drag it under the price.
4. Click **Save**.

(For the free-gift offer also enable the embed: in the same editor, click the **App embeds** icon (puzzle piece, bottom-left) → toggle **Bundle Engine gift watcher** on → Save.)

### D5. Confirm the discount works
1. Open the product page on the storefront. **You should see** the radio tier cards ("Buy 1 / Buy 2 SAVE 10% / Buy 3 SAVE 15%").
2. Select **Buy 3** → the quantity becomes 3 → click Add to cart.
3. Open the cart page: the line shows a discount tag **"Buy more, save more (Buy 3)"** with 15% off.
4. Click **Checkout**: the discount line appears in the order summary with the reduced total.
**If the widget doesn't appear:** the offer isn't ACTIVE, the product isn't in the offer, or the block wasn't added to the template you're viewing.
**If the widget appears but no discount in cart:** check the Discounts page shows "Bundle Engine" as Active, and that `shopify app dev` is running (in dev mode functions execute through the dev session).

That's the full loop working locally. 🎉

---

## Part E — Deploy to your LIVE store

### E0. Backups first (always)
1. **Theme:** live store admin → Online Store → Themes → ⋯ → **Download theme file** (keep the zip).
2. **App config:** copy `shopify.app.toml` somewhere safe.
3. **Database:** after going live, back up before each change: for Postgres run
   `pg_dump "$DATABASE_URL" > backup-$(date +%F).sql` (Railway/Neon also have automatic backups — turn them on).
4. **Code:** push the project to a private GitHub repo (`git init`, commit, push).

### E1. Host the app server
The admin + database need a small server. Railway is the simplest:
1. Sign up at https://railway.app → **New Project → Deploy from GitHub repo** → pick your repo.
2. In the project click **+ New → Database → PostgreSQL**. Railway creates it and exposes `DATABASE_URL`.
3. Edit `prisma/schema.prisma`: change `provider = "sqlite"` to `provider = "postgresql"`, commit, push. Delete the `prisma/migrations` folder, run locally `npx prisma migrate dev --name init-postgres` against a local/throwaway Postgres OR simply let the deploy run `npx prisma migrate deploy` after you commit the new migration.
4. In the Railway service → **Variables**, add:
   - `SHOPIFY_API_KEY` = Client ID (Partner Dashboard → your app → Overview)
   - `SHOPIFY_API_SECRET` = Client secret (same page)
   - `SCOPES` = `read_products,write_discounts,read_discounts`
   - `SHOPIFY_APP_URL` = your Railway URL (Settings → Domains → Generate domain, e.g. `https://bundle-engine.up.railway.app`)
   - `DATABASE_URL` = (reference the Postgres plugin variable)
5. Set the start command (Railway → Settings → Deploy): `npm run docker-start` if present in package.json, otherwise `npm run start`. Build command: `npm run build && npx prisma migrate deploy`.
**Success:** the deployment turns green and opening `https://<your-domain>` shows a Shopify auth page or "app" page (not a crash).

### E2. Point the app at the server
In `shopify.app.toml` set:
```toml
application_url = "https://bundle-engine.up.railway.app"
[auth]
redirect_urls = [ "https://bundle-engine.up.railway.app/auth/callback", "https://bundle-engine.up.railway.app/auth/shopify/callback", "https://bundle-engine.up.railway.app/api/auth/callback" ]
```
Then push the config + release everything:
```
shopify app deploy
```
**Success:** `New version released to users.` This publishes the Function and the theme extension to Shopify's infrastructure (they do NOT run on Railway).

### E3. Install on the live store
1. Partner Dashboard → your app → **Distribution** → choose **Custom distribution** → enter your live store's `.myshopify.com` domain.
   ⚠️ This is permanent-per-app and limits it to this one store — exactly what we want. (If you created the app on the store's own Dev Dashboard instead, just use its install link.)
2. Open the generated **install link**, approve the scopes on your live store.
**Success:** the app opens embedded in your live admin with an empty offer list.

### E4. Go live
1. Run the seed (against production DB) or create offers manually in the live admin (D3).
2. Add the **Bundle Widget** block to your LIVE theme's product template (D4) — *tip: duplicate your live theme first, add the block to the copy, preview, then publish the copy.*
3. Verify on the live storefront exactly as in D5, including a real (or 100%-discounted test) checkout.
4. Payments note: nothing to configure — the discount is applied by Shopify **before** payment, so Tabby, Apple Pay, Google Pay, Shop Pay and normal checkout all see the already-discounted total. Markets/multi-currency: percentage tiers convert automatically; fixed-price tiers show "Special price at checkout" outside AED (see docs/05).

---

## Part F — Tests, rollback, uninstall

### F1. Test commands
```
npm run test        # everything: function evaluator + admin validation
npx vitest          # watch mode while developing
```

### F2. Rollback plan
| What broke | How to roll back |
|---|---|
| Bad widget/function release | Partner Dashboard → your app → Versions → previous version → **Release**. Instant. |
| Bad server deploy | Railway → Deployments → previous deployment → **Redeploy**. |
| Bad offer (wrong discount live) | In the app: open the offer → **Pause**. Discount stops within seconds. Panic button: admin → Discounts → deactivate "Bundle Engine" (kills ALL offers at once). |
| Database problem | Restore the latest `pg_dump` backup / Railway backup, then open any offer and click Save to re-sync metafields. |
| Theme problem | Online Store → Themes → publish your backup/duplicate theme. (The app never edits theme files, so this is only for unrelated issues.) |

### F3. Clean uninstall (guarantees)
Removing the app from the store automatically: deletes the "Bundle Engine" automatic discount (app-owned), removes the app's metafields, and removes the widget block + app embed from the theme (theme app extensions never modify theme files). No orphan scripts, no leftover discounts, no product data touched — products, prices and orders are never modified by this app. Your offer definitions stay safe in YOUR database in case you reinstall.

### F4. Final pre-launch checklist
- [ ] `npm run test` → all green
- [ ] Widget shows correct prices on mobile + desktop
- [ ] Cart shows discount tag; checkout total matches widget promise
- [ ] BOGO, free gift threshold, Mix & Match each tested once on dev store
- [ ] Gift auto-adds in the cart drawer and auto-removes when below threshold
- [ ] Tested with a second currency (if Markets enabled)
- [ ] Theme backup downloaded; DB backup scheduled; repo pushed to GitHub
- [ ] Discount combinations reviewed (admin → Discounts → Bundle Engine → Combinations) against any existing discount codes
- [ ] Rollback table above bookmarked
