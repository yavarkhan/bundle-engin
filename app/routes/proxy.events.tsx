// CREATE this file at app/routes/proxy.events.tsx
// App-proxy endpoint: the storefront widget beacons impressions here.
// URL on the storefront: POST /apps/bundle-engine/events
// (Shopify signs proxy requests; authenticate.public.appProxy verifies.)

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordImpression } from "../models/analytics.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  try {
    const body = JSON.parse(await request.text());
    if (body?.offerId && typeof body.offerId === "string" && body.offerId.length < 64) {
      await recordImpression(body.offerId);
    }
  } catch {
    // malformed beacons are ignored — never error toward the storefront
  }
  return new Response(null, { status: 204 });
};
