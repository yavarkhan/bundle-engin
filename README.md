# Bundle Engine — private Shopify bundle & discount app (one store)

Quantity breaks, BOGO, free gifts, and Mix & Match for a single live Shopify
store. Discounts run server-side in a **Shopify Function** (work in cart,
checkout, all payment methods, Markets, POS). The widget is a **Theme App
Extension** (no theme code edits, clean uninstall).

**Start here → [`SETUP-GUIDE.md`](./SETUP-GUIDE.md)** — beginner-friendly,
every command with expected output.

## How this folder works

This folder is an **overlay**, not a runnable app by itself. The Shopify CLI
generates the official Remix app (auth, sessions, build setup); you then copy
these files into it. The guide walks through it step by step.

| File in this folder | Into your generated app | Action |
|---|---|---|
| `prisma/schema.prisma` | `prisma/schema.prisma` | **Replace** |
| `prisma/seed-offers.cjs` | `prisma/seed-offers.cjs` | Add |
| `app/models/offer.server.ts` | same path | Add |
| `app/models/shopify-sync.server.ts` | same path | Add |
| `app/routes/app.tsx` | same path | **Replace** |
| `app/routes/app._index.tsx` | same path | **Replace** |
| `app/routes/app.offers.$id.tsx` | same path | Add |
| `tests/offer-validation.test.ts` | same path | Add |
| `vitest.config.ts` | app root | Add |
| `extensions/bundle-discount/src/*` (4 files) | same paths | **Replace** generated src |
| `extensions/bundle-discount/tests/evaluate.test.js` | same path | Add |
| `extensions/bundle-discount/shopify.extension.toml` | — | Reference: edit the generated one to match |
| `extensions/bundle-widget/blocks/*` (2 files) | same paths | Add |
| `extensions/bundle-widget/assets/*` (2 files) | same paths | Add |
| `extensions/bundle-widget/locales/en.default.json` | same path | Add |
| `shopify.app.toml` | — | Reference: merge `[access_scopes]` + `[webhooks]` into the generated one |
| `package.json` | — | Reference: add listed scripts + `vitest` only |

`public/` needs nothing — the template's `public/` stays as generated.

## Architecture in one paragraph

The admin (Remix + Polaris) saves offers to the database, then compiles them
into one small JSON blob written to two metafields: on the **shop** (read by
the Liquid widget — zero API calls at render time) and on the **automatic
discount** (read by the Function — zero network at checkout). If the app
server is down, the storefront widget and all discounts keep working.

Full docs: [`../docs/`](../docs/) — PRD, architecture, schema, functions,
deployment, security, prebuilt offers, competitor benchmark.

## Commands

```bash
npx vitest run          # all tests (function evaluator + admin validation)
node prisma/seed-offers.cjs   # create the 4 prebuilt draft offers
shopify app dev         # local development against your dev store
shopify app deploy      # release functions + theme extension
```
