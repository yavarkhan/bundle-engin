# V1 Launch Guide — Zero to Live Store (Windows, beginner)

V1 scope: quantity breaks, product-page widget, Function discount, basic admin.
Everything else is skipped. Follow in order. Don't skip steps.

Two folders matter:
- **SCAFFOLD** (the files I made): `C:\Users\User\Documents\claude\shopify plugin\bundle-engine`
- **PROJECT** (the app you'll generate): `C:\Users\User\Projects\bundle-engine`

---

## STEP 1 — Open the correct folder
**Do:** Press `Win + E` (File Explorer) → go to `Documents > claude > shopify plugin`.
**Checkpoint:** You see a `bundle-engine` folder and a `docs` folder.
**Then:** Press `Win`, type `powershell`, press Enter. In the blue/black window run:
```powershell
mkdir C:\Users\User\Projects
```
**Expected:** A line showing the new directory (or "already exists" — fine).
**If error "access denied":** run `mkdir $HOME\Projects` instead and use that path everywhere below.

## STEP 2 — Install Node and Shopify CLI
**Folder:** any (PowerShell).
```powershell
node --version
```
**Expected:** `v20.x.x` or higher.
**If "not recognized":** Download the LTS installer at https://nodejs.org, install with all defaults, close and reopen PowerShell, try again.
Then:
```powershell
npm install -g @shopify/cli@latest
shopify version
```
**Expected:** `shopify version` prints `3.x.x`.
**If error:** Close and reopen PowerShell (PATH refresh). Still failing → reinstall Node.
**Checkpoint:** Both commands print version numbers.

You also need a free Shopify Partner account + development store: sign up at https://partners.shopify.com → Stores → Add store → **Create development store** → name it `bundle-engine-test`.

## STEP 3 — Create the Shopify Remix app
**Folder:** `C:\Users\User\Projects`
```powershell
cd C:\Users\User\Projects
shopify app init
```
Answer the prompts:
- Name: `bundle-engine`
- Template: **Build a Remix app (recommended)** → **TypeScript** (if asked)
- A browser may open asking you to log into your Partner account — log in.
**Expected:** Ends with a success message; folder `C:\Users\User\Projects\bundle-engine` exists.
**If it hangs on login:** check the browser window it opened; approve, return to PowerShell.
**Checkpoint:** `C:\Users\User\Projects\bundle-engine\app\routes\app._index.tsx` exists.

## STEP 4 — Copy the bundle-engine files in
**Folder:** any (PowerShell). Run this whole block (copy-paste all of it at once):
```powershell
$src = "C:\Users\User\Documents\claude\shopify plugin\bundle-engine"
$dst = "C:\Users\User\Projects\bundle-engine"
Copy-Item "$src\prisma\schema.prisma" "$dst\prisma\schema.prisma" -Force
New-Item -ItemType Directory -Force "$dst\app\models" | Out-Null
Copy-Item "$src\app\models\*" "$dst\app\models\" -Force
Copy-Item "$src\app\routes\app.tsx" "$dst\app\routes\" -Force
Copy-Item "$src\app\routes\app._index.tsx" "$dst\app\routes\" -Force
Copy-Item ($src + '\app\routes\app.offers.$id.tsx') "$dst\app\routes\" -Force
Copy-Item "$src\tests" "$dst\" -Recurse -Force
Copy-Item "$src\vitest.config.ts" "$dst\" -Force
```
**Expected:** No output = success.
**If "cannot find path":** check the `bundle-engine` scaffold folder really is at that Documents path (Step 1).
Now set the app's permissions: open `C:\Users\User\Projects\bundle-engine\shopify.app.toml` in Notepad and make the scopes line read exactly:
```toml
scopes = "read_products,write_discounts,read_discounts"
```
Save and close.
**Checkpoint:** `$dst\app\models\offer.server.ts` exists; toml shows the 3 scopes.

## STEP 5 — Generate the Shopify Function extension
**Folder:** `C:\Users\User\Projects\bundle-engine`
```powershell
cd C:\Users\User\Projects\bundle-engine
shopify app generate extension
```
Answer: type = **Discount function** (under "Function") → name = `bundle-discount` → language = **JavaScript**.
**Expected:** "extension was created in extensions\bundle-discount".
Now overlay my code (paste the whole block):
```powershell
$src = "C:\Users\User\Documents\claude\shopify plugin\bundle-engine"
$dst = "C:\Users\User\Projects\bundle-engine"
Copy-Item "$src\extensions\bundle-discount\src\*" "$dst\extensions\bundle-discount\src\" -Force
New-Item -ItemType Directory -Force "$dst\extensions\bundle-discount\tests" | Out-Null
Copy-Item "$src\extensions\bundle-discount\tests\*" "$dst\extensions\bundle-discount\tests\" -Force
Remove-Item "$dst\extensions\bundle-discount\src\cart_delivery_options*" -ErrorAction SilentlyContinue
```
Then open `$dst\extensions\bundle-discount\shopify.extension.toml` in Notepad. If you see a `[[extensions.targeting]]` block mentioning `cart.delivery-options`, delete that whole block (we don't discount shipping). Keep everything else as generated. Save.
**Checkpoint:** `src` contains `evaluate.js`, `cart_lines_discounts_generate_run.js`, `cart_lines_discounts_generate_run.graphql`, `index.js` and NO `cart_delivery_options` files; toml has exactly one targeting block.

## STEP 6 — Generate the Theme App Extension
**Folder:** `C:\Users\User\Projects\bundle-engine`
```powershell
shopify app generate extension
```
Answer: type = **Theme app extension** → name = `bundle-widget`.
**Expected:** "extension was created in extensions\bundle-widget".
Copy the widget in (V1 needs only these — we skip the gift watcher):
```powershell
$src = "C:\Users\User\Documents\claude\shopify plugin\bundle-engine"
$dst = "C:\Users\User\Projects\bundle-engine"
Copy-Item "$src\extensions\bundle-widget\blocks\bundle-widget.liquid" "$dst\extensions\bundle-widget\blocks\" -Force
Copy-Item "$src\extensions\bundle-widget\assets\*" "$dst\extensions\bundle-widget\assets\" -Force
Copy-Item "$src\extensions\bundle-widget\locales\en.default.json" "$dst\extensions\bundle-widget\locales\" -Force
```
**Checkpoint:** `blocks\bundle-widget.liquid`, `assets\be-widget.js`, `assets\be-widget.css` exist in the project.

## STEP 7 — Install dependencies
**Folder:** `C:\Users\User\Projects\bundle-engine`
```powershell
npm install
npm install -D vitest
```
**Expected:** Ends with `added … packages` (warnings in yellow are normal).
Then open `package.json` in Notepad and inside `"scripts": {` add this line (with the comma):
```json
"test": "vitest run",
```
Save.
**If `EACCES`/network errors:** check internet, disable VPN, run again.
**Checkpoint:** `node_modules` folder exists; `package.json` scripts contain `"test"`.

## STEP 8 — Environment variables
**For local development: nothing to do.** `shopify app dev` injects the API key, secret, and URLs automatically, and the database is a local file. Skip to Step 9. (Production variables come in Step 17.)

## STEP 9 — Database migration
**Folder:** `C:\Users\User\Projects\bundle-engine`
```powershell
npx prisma migrate dev --name add-bundles
```
**Expected:** `Your database is now in sync with your schema.` and `Generated Prisma Client`.
**If "Drift detected" or migration conflict:** delete `prisma\dev.sqlite` and the `prisma\migrations` folder, then rerun the command. (Safe — the dev database is empty.)
**Checkpoint:** `prisma\migrations` contains a new folder ending in `add_bundles`.

## STEP 10 — Run the tests
**Folder:** `C:\Users\User\Projects\bundle-engine`
```powershell
npm run test
```
**Expected:** Green output: `Test Files 2 passed`, `Tests 33 passed` (24 discount-calculation tests + 9 admin validation tests).
**If a test fails:** the message names a file — re-copy that exact file from the scaffold (Step 4/5) and rerun. Do NOT continue with red tests.
**Checkpoint:** "33 passed".

## STEP 11 — Start the local app
**Folder:** `C:\Users\User\Projects\bundle-engine`
```powershell
shopify app dev
```
Prompts: choose your Partner org → choose store **bundle-engine-test** → "create this app?" yes.
**Expected:** After a build, you see `Preview URL: https://…` and the terminal keeps running. Leave this window open from now on.
**If "store not found":** run `shopify app config link`, pick the right org/store, then `shopify app dev` again.
**Checkpoint:** Terminal shows the preview URL and no red errors.

## STEP 12 — Install on the development store
**Do:** In the running terminal press `p` (opens the preview) — your browser opens the dev store admin asking to install **bundle-engine**. Click **Install**.
**Expected:** The app opens embedded in the admin showing "Bundle Engine" with an empty offer list and a **Create offer** button.
**If a blank page:** refresh once; if still blank, check the `shopify app dev` terminal for a red error.
**Checkpoint (screenshot moment):** Embedded app page titled "Bundle Engine", empty state visible.

## STEP 13 — Create your first quantity-break offer
**Do (in the app):**
1. Click **Create offer**.
2. Name: `Buy more save more`. Offer type: leave **Quantity break**.
3. Click **Select products** → pick ONE test product (dev stores have sample products) → Add.
4. Tiers are pre-filled: Buy 2 → 10% (MOST POPULAR, preselected), Buy 3 → 15%. Click **Add tier** → set Buy `4`, Percentage, `20`, badge `BEST VALUE`.
5. Click **Save & activate**.
**Expected:** Back on the list, the offer shows a green **ACTIVE** badge.
**If "Discount function not found":** the `shopify app dev` terminal must still be running; wait 30 seconds, click Save & activate again.
**Checkpoint:** Dev store admin → **Discounts** shows an active automatic discount named **Bundle Engine**.

## STEP 14 — Add the widget block to the product page
**Do:** Dev store admin → **Online Store → Themes → Customize** →
1. Top-center dropdown → **Products → Default product**.
2. Left sidebar, inside "Product information" → **Add block** → **Apps** → **Bundle Widget**.
3. Drag it just below the price block. Click **Save** (top right).
**Expected:** The editor preview shows the radio tier cards (Buy 1 / Buy 2 / Buy 3 / Buy 4) on the product you put in the offer.
**If the block list has no "Bundle Widget":** the dev terminal must be running; refresh the theme editor.
**If cards don't show in preview:** preview a product that is IN the offer (use the editor's "Change" product picker).
**Checkpoint (screenshot moment):** Tier cards visible with SAVE 10% / 15% / 20% labels and badges.

## STEP 15 — Test the cart
**Do:** Open the storefront product page (theme editor → top right ⋯ → "Preview", or visit the store URL). Select **Buy 3** → quantity becomes 3 → **Add to cart** → open the cart page.
**Expected:** Line item quantity 3 with a discount tag **"Buy more save more (Buy 3)"** and 15% off the line; cart total reduced.
**If no discount in cart:** confirm the offer is ACTIVE (Step 13 checkpoint), the product matches, and the dev terminal is running. Change cart quantity to 2 → tag should switch to the 10% tier.
**Checkpoint:** Discount tag visible on the cart line.

## STEP 16 — Test the checkout
**Do:** Click **Checkout**. Dev stores use test payments: choose the **Bogus Gateway** (or "(for testing) " option), card number `1`, any future date, any CVV → place the order.
**Expected:** Order summary shows the discount line (−15%) and the reduced total; order completes.
**If discount missing at checkout but present in cart:** refresh; if persistent, check Discounts page shows Bundle Engine active and `shopify app dev` is running.
**Checkpoint (screenshot moment):** Checkout summary with the discount row. 🎉 Local V1 works end-to-end. You can stop `shopify app dev` with `Ctrl+C` when ready to deploy.

## STEP 17 — Deploy the app (hosting + release)
Two parts: (a) host the admin server, (b) release the extensions to Shopify.

**(a) Host on Railway (~30 min):**
1. Put the project on GitHub: create a free account at https://github.com → New repository `bundle-engine` (Private) → follow its "push an existing folder" commands:
   ```powershell
   cd C:\Users\User\Projects\bundle-engine
   git init
   git add .
   git commit -m "v1"
   git branch -M main
   git remote add origin https://github.com/YOURNAME/bundle-engine.git
   git push -u origin main
   ```
   **If `git` not recognized:** install https://git-scm.com (defaults), reopen PowerShell.
2. https://railway.app → sign in with GitHub → **New Project → Deploy from GitHub repo** → pick `bundle-engine`.
3. In the service: **Settings → Volumes → Add volume**, mount path `/data` (this keeps your SQLite database safe between deploys — simplest possible V1 setup).
4. **Settings → Networking → Generate Domain.** Note it, e.g. `https://bundle-engine-production.up.railway.app`.
5. **Variables → add:**
   - `SHOPIFY_API_KEY` = Client ID (Partner Dashboard → Apps → bundle-engine → Overview)
   - `SHOPIFY_API_SECRET` = Client secret (same page)
   - `SCOPES` = `read_products,write_discounts,read_discounts`
   - `SHOPIFY_APP_URL` = your Railway domain from 4
   - `DATABASE_URL` = `file:/data/prod.sqlite`
6. **Settings → Deploy:** Build command `npm run build` · Start command `npx prisma migrate deploy && npm run start`.
7. Redeploy. **Expected:** deployment turns green; opening the domain shows a page (not a crash).

**(b) Point the app at the server and release:**
Open `shopify.app.toml` in Notepad, set:
```toml
application_url = "https://YOUR-RAILWAY-DOMAIN"
[auth]
redirect_urls = [ "https://YOUR-RAILWAY-DOMAIN/auth/callback", "https://YOUR-RAILWAY-DOMAIN/auth/shopify/callback", "https://YOUR-RAILWAY-DOMAIN/api/auth/callback" ]
```
Then:
```powershell
shopify app deploy
```
Confirm with yes.
**Expected:** `New version released`.
**Checkpoint:** Partner Dashboard → your app → Versions shows an active version containing `bundle-discount` and `bundle-widget`.

## STEP 18 — Install on your LIVE store
**Do:** Partner Dashboard → Apps → bundle-engine → **Distribution** → **Custom distribution** → enter your live store's `xxxx.myshopify.com` domain → generate link.
⚠️ Custom distribution is permanent for this app and locks it to this one store — that's exactly what we want.
Open the install link → review the 3 permissions → **Install**.
**Expected:** The app opens embedded in your LIVE admin with an empty offer list.
**If OAuth/redirect error:** the Railway `SHOPIFY_APP_URL` and the toml `application_url` must be identical, and Step 17(b)'s deploy must have run after editing them.
**Checkpoint:** "Bundle Engine" appears under Apps in your live store admin.

## STEP 19 — Duplicate your live theme (safety)
**Do:** Live admin → **Online Store → Themes** → on the Current theme click **⋯ → Duplicate**. Also click **⋯ → Download theme file** and keep the zip as a backup.
**Expected:** A copy appears in the Theme library.
**Checkpoint:** "Copy of <your theme>" listed + backup zip downloaded.

## STEP 20 — Add the widget to the DUPLICATE theme
**Do:** On the duplicate (NOT the live one) click **Customize** → Products → Default product → Add block → Apps → **Bundle Widget** → drag below price → **Save**.
**Expected:** Same tier-card preview as Step 14 (cards appear once an offer exists — next step).
**Checkpoint:** Block saved in the duplicate theme.

## STEP 21 — Create the real live offer
**Do:** Live admin → Apps → Bundle Engine → **Create offer** → name it, pick your real product(s), set the tiers you actually want (e.g. Buy 2 → 10%, Buy 3 → 15%, Buy 4 → 20%) → **Save & activate**.
**Expected:** ACTIVE badge; live admin → Discounts shows automatic discount **Bundle Engine**.
**If "Discount function not found":** Step 17(b) deploy didn't finish — run `shopify app deploy` again, then Save & activate.
**Checkpoint:** Active discount visible in live Discounts page.

## STEP 22 — Test live checkout (on the duplicate theme preview)
**Do:** Themes → duplicate theme → **⋯ → Preview**. Open the offer product, select Buy 3, add to cart, verify the cart discount tag, proceed to checkout.
**Expected:** Checkout shows the discount and reduced total with your REAL payment methods (Tabby/Apple Pay/etc. all see the discounted total).
**To fully verify:** place a small real order yourself, confirm the order in admin shows the discount, then cancel & refund it (Orders → the order → Refund).
**Checkpoint:** Real checkout shows correct discounted total.

## STEP 23 — Publish the duplicate theme
**Do:** Themes → duplicate theme → **Publish** → confirm.
**Expected:** Your store is now live with the widget. Visit the product page as a customer and re-verify the widget + cart tag once.
**Checkpoint (final):** Live product page shows tier cards; cart shows the discount. **V1 is live.** 🚀

## STEP 24 — Emergency disable (keep this handy)
In order of speed:
1. **Pause one offer (seconds):** Apps → Bundle Engine → open the offer → **Pause**. Widget tier still shows until sync, discount stops immediately on save.
2. **Kill ALL discounts (seconds):** Admin → **Discounts** → "Bundle Engine" → **Deactivate**. Every offer stops instantly; widget prices stop applying (no wrong charges — checkout simply doesn't discount).
3. **Hide the widget (1 min):** Themes → Customize → select the Bundle Widget block → remove → Save. (Or republish your pre-launch theme backup.)
4. **Server problem:** the storefront widget and discounts DON'T depend on your Railway server — they run on Shopify. A down server only blocks the admin pages.
5. **Nuclear:** Admin → Apps → Bundle Engine → **Uninstall**. Shopify automatically deletes the discount, the metafields, and the widget — no theme files were ever modified, no scripts remain, no product data is touched.
