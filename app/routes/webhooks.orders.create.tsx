// CREATE this file at app/routes/webhooks.orders.create.tsx
// Attributes new orders to offers for the analytics dashboard.

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { recordOrder } from "../models/analytics.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload } = await authenticate.webhook(request);
  try {
    await recordOrder(payload);
  } catch (e) {
    console.error("Order attribution failed", e);
  }
  return new Response(); // always 200 so Shopify doesn't retry forever
};
