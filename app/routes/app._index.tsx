// REPLACES app/routes/app._index.tsx
// Dashboard: KPI cards + per-offer analytics, bulk actions, status toggle.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate, useSubmit } from "react-router";
import {
  Badge,
  BlockStack,
  Button,
  ButtonGroup,
  Card,
  EmptyState,
  Grid,
  Icon,
  IndexTable,
  Page,
  Pagination,
  Text,
  Tooltip,
  useIndexResourceState,
} from "@shopify/polaris";
import {
  DeleteIcon,
  DuplicateIcon,
  EditIcon,
  PauseCircleIcon,
  PlayIcon,
} from "@shopify/polaris-icons";
import { useState } from "react";

import { authenticate } from "../shopify.server";
import {
  deleteOffers,
  duplicateOffer,
  listOffers,
  setOfferStatus,
} from "../models/offer.server";
import { getStats } from "../models/analytics.server";
import { syncToShopify } from "../models/shopify-sync.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const [offers, stats] = await Promise.all([listOffers(), getStats()]);

  let currency = "";
  try {
    const res = await admin.graphql(`#graphql\n    query { shop { currencyCode } }`);
    currency = (await res.json()).data?.shop?.currencyCode ?? "";
  } catch {
    // currency is cosmetic — never block the dashboard on it
  }

  const rows = offers.map((o) => {
    const s = stats.get(o.id);
    const orders = s?.orders ?? 0;
    const impressions = s?.impressions ?? 0;
    const revenueX100 = s?.revenueX100 ?? 0;
    return {
      id: o.id,
      name: o.name,
      type: o.type,
      status: o.status,
      orders,
      impressions,
      revenueX100,
      aovX100: orders > 0 ? Math.round(revenueX100 / orders) : 0,
      conversion: impressions > 0 ? (orders / impressions) * 100 : 0,
    };
  });

  const totalRevenueX100 = rows.reduce((s, r) => s + r.revenueX100, 0);
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);

  return {
    currency,
    rows,
    kpis: {
      revenueX100: totalRevenueX100,
      avgSaleX100: totalOrders > 0 ? Math.round(totalRevenueX100 / totalOrders) : 0,
      bundlesSold: totalOrders,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  if (intent === "toggle") {
    const id = String(form.get("id"));
    const status = String(form.get("status")) === "ACTIVE" ? "PAUSED" : "ACTIVE";
    await setOfferStatus(id, status as "ACTIVE" | "PAUSED");
  } else {
    const ids = JSON.parse(String(form.get("ids") ?? "[]")) as string[];
    if (!ids.length) return { ok: false };
    if (intent === "bulk-delete") await deleteOffers(ids);
    else if (intent === "bulk-duplicate") {
      for (const id of ids) await duplicateOffer(id);
    }
  }
  await syncToShopify(admin);
  return { ok: true };
};

const STATUS_TONE: Record<string, "success" | "info" | "warning"> = {
  ACTIVE: "success",
  DRAFT: "info",
  PAUSED: "warning",
};

const TYPE_LABEL: Record<string, string> = {
  QUANTITY_BREAK: "Quantity break",
  BOGO: "BOGO",
  FREE_GIFT: "Free gift",
  MIX_MATCH: "Mix & Match",
};

export default function Dashboard() {
  const { currency, rows, kpis } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const submit = useSubmit();

  const money = (x100: number) =>
    `${(x100 / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pagedRows = rows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rangeStart = rows.length === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(rows.length, (page + 1) * PAGE_SIZE);

  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(pagedRows);

  const bulk = (intent: string, ids: string[] = selectedResources) => {
    submit({ intent, ids: JSON.stringify(ids) }, { method: "post" });
    clearSelection();
  };

  const kpiCard = (label: string, value: string) => (
    <Card>
      <BlockStack gap="100">
        <Text as="p" tone="subdued">{label}</Text>
        <Text as="p" variant="headingLg">{value}</Text>
      </BlockStack>
    </Card>
  );

  return (
    <Page
      title="Bundle Engine"
      primaryAction={{
        content: "Create offer",
        onAction: () => navigate("/app/offers/new"),
      }}
    >
      <BlockStack gap="400">
        <Grid columns={{ xs: 1, sm: 3, md: 3, lg: 3 }}>
          <Grid.Cell>{kpiCard("Revenue generated", money(kpis.revenueX100))}</Grid.Cell>
          <Grid.Cell>{kpiCard("Average bundle sale", money(kpis.avgSaleX100))}</Grid.Cell>
          <Grid.Cell>{kpiCard("Total bundles sold", String(kpis.bundlesSold))}</Grid.Cell>
        </Grid>

        <Card padding="0">
          {rows.length === 0 ? (
            <EmptyState
              heading="Create your first offer"
              action={{
                content: "Create offer",
                onAction: () => navigate("/app/offers/new"),
              }}
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Offers appear here with revenue, impressions and conversion stats.</p>
            </EmptyState>
          ) : (
            <IndexTable
              resourceName={{ singular: "offer", plural: "offers" }}
              itemCount={pagedRows.length}
              selectedItemsCount={allResourcesSelected ? "All" : selectedResources.length}
              onSelectionChange={handleSelectionChange}
              promotedBulkActions={[
                { content: "Duplicate", onAction: () => bulk("bulk-duplicate") },
                { content: "Delete", onAction: () => bulk("bulk-delete") },
              ]}
              headings={[
                { title: "Offer" },
                { title: "Status" },
                { title: "Orders" },
                { title: "Impressions" },
                { title: "Avg order value" },
                { title: "Conversion" },
                { title: "Revenue" },
                { title: "Actions" },
              ]}
            >
              {pagedRows.map((r, index) => (
                <IndexTable.Row
                  id={r.id}
                  key={r.id}
                  position={index}
                  selected={selectedResources.includes(r.id)}
                >
                  <IndexTable.Cell>
                    <BlockStack gap="050">
                      <Button variant="plain" onClick={() => navigate(`/app/offers/${r.id}`)}>
                        {r.name}
                      </Button>
                      <Text as="span" tone="subdued" variant="bodySm">
                        {TYPE_LABEL[r.type] ?? r.type}
                      </Text>
                    </BlockStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Badge tone={STATUS_TONE[r.status] ?? "info"}>{r.status}</Badge>
                  </IndexTable.Cell>
                  <IndexTable.Cell>{r.orders}</IndexTable.Cell>
                  <IndexTable.Cell>{r.impressions}</IndexTable.Cell>
                  <IndexTable.Cell>{r.orders ? money(r.aovX100) : "—"}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {r.impressions ? `${r.conversion.toFixed(2)}%` : "—"}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" fontWeight="semibold">{money(r.revenueX100)}</Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <div onClick={(e) => e.stopPropagation()}>
                      <ButtonGroup>
                        {r.status !== "DRAFT" && (
                          <Tooltip content={r.status === "ACTIVE" ? "Pause" : "Activate"}>
                            <Button
                              size="slim"
                              icon={<Icon source={r.status === "ACTIVE" ? PauseCircleIcon : PlayIcon} />}
                              accessibilityLabel={r.status === "ACTIVE" ? "Pause" : "Activate"}
                              onClick={() =>
                                submit({ intent: "toggle", id: r.id, status: r.status }, { method: "post" })
                              }
                            />
                          </Tooltip>
                        )}
                        <Tooltip content="Duplicate">
                          <Button
                            size="slim"
                            icon={<Icon source={DuplicateIcon} />}
                            accessibilityLabel="Duplicate"
                            onClick={() => bulk("bulk-duplicate", [r.id])}
                          />
                        </Tooltip>
                        <Tooltip content="Edit">
                          <Button
                            size="slim"
                            icon={<Icon source={EditIcon} />}
                            accessibilityLabel="Edit"
                            onClick={() => navigate(`/app/offers/${r.id}`)}
                          />
                        </Tooltip>
                        <Tooltip content="Delete">
                          <Button
                            size="slim"
                            tone="critical"
                            icon={<Icon source={DeleteIcon} />}
                            accessibilityLabel="Delete"
                            onClick={() => {
                              if (confirm(`Delete "${r.name}"? This can't be undone.`)) {
                                bulk("bulk-delete", [r.id]);
                              }
                            }}
                          />
                        </Tooltip>
                      </ButtonGroup>
                    </div>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
          {rows.length > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "12px", padding: "12px 16px" }}>
              <Text as="span" tone="subdued" variant="bodySm">
                {`${rangeStart}-${rangeEnd} of ${rows.length} bundle${rows.length === 1 ? "" : "s"}`}
              </Text>
              <Pagination
                hasPrevious={page > 0}
                onPrevious={() => setPage((p) => Math.max(0, p - 1))}
                hasNext={page < pageCount - 1}
                onNext={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              />
            </div>
          )}
        </Card>
      </BlockStack>
    </Page>
  );
}
