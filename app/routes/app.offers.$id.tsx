// CREATE this file at app/routes/app.offers.$id.tsx
// Offer editor. Handles /app/offers/new and /app/offers/<id>.
// Per-tier: quantity, discount, badge, custom title/subtitle/label and an
// image uploaded straight into Shopify Files (needs write_files scope).

import { useCallback, useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import {
  redirect,
  useActionData,
  useFetcher,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "react-router";
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
  Thumbnail,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import {
  deleteOffer,
  getOffer,
  saveOffer,
  type OfferInput,
  type OfferType,
} from "../models/offer.server";
import { syncToShopify } from "../models/shopify-sync.server";
import { uploadImage } from "../models/upload.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  if (params.id === "new") return { offer: null };
  const offer = await getOffer(params.id!);
  if (!offer) throw new Response("Offer not found", { status: 404 });
  return {
    offer: {
      id: offer.id,
      type: offer.type,
      name: offer.name,
      status: offer.status,
      products: JSON.parse(offer.productsJson),
      config: JSON.parse(offer.configJson),
      tiers: offer.tiers.map((t) => ({
        minQty: t.minQty,
        discountType: t.discountType,
        value: t.valueX100 / 100,
        badge: t.badge ?? "",
        preselected: t.preselected,
        title: t.title ?? "",
        subtitle: t.subtitle ?? "",
        labelText: t.labelText ?? "",
        imageUrl: t.imageUrl ?? "",
        freeShipping: t.freeShipping,
        giftProductId: t.giftProductId ?? "",
        giftVariantId: t.giftVariantId ?? "",
        giftTitle: t.giftTitle ?? "",
        getQty: t.getQty,
        bundleProducts: (() => {
          try {
            return JSON.parse(t.bundleProductsJson || "[]");
          } catch {
            return [];
          }
        })(),
      })),
    },
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  try {
    if (intent === "upload-image") {
      const file = form.get("file") as File;
      const tierIndex = String(form.get("tierIndex"));
      const uploadedUrl = await uploadImage(admin, file);
      return { uploadedUrl, tierIndex };
    }
    if (intent === "delete") {
      await deleteOffer(params.id!);
      await syncToShopify(admin);
      return redirect("/app");
    }
    const payload = JSON.parse(String(form.get("payload"))) as OfferInput;
    if (params.id !== "new") payload.id = params.id!;
    await saveOffer(payload);
    await syncToShopify(admin);
    return redirect("/app");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Something went wrong." };
  }
};

type BundleProduct = { productId: string; variantId?: string; title: string; handle?: string };

type TierRow = {
  minQty: string;
  discountType: string;
  value: string;
  badge: string;
  preselected: boolean;
  title: string;
  subtitle: string;
  labelText: string;
  imageUrl: string;
  freeShipping: boolean;
  giftProductId: string;
  giftVariantId: string;
  giftTitle: string;
  bundleProducts: BundleProduct[];
};

const TYPE_OPTIONS = [
  { label: "Quantity break (Buy 2 save 10%)", value: "QUANTITY_BREAK" },
  { label: "BOGO (Buy X get Y)", value: "BOGO" },
  { label: "Free gift (spend threshold)", value: "FREE_GIFT" },
  { label: "Mix & Match (any N products)", value: "MIX_MATCH" },
];

const DISCOUNT_TYPE_OPTIONS = [
  { label: "None (regular price)", value: "NONE" },
  { label: "Percentage off (10 = 10%)", value: "PERCENTAGE" },
  { label: "Amount off per unit (20 = AED 20 off)", value: "FIXED_AMOUNT" },
  { label: "Fixed price per unit (179 = AED 179 each)", value: "FIXED_UNIT_PRICE" },
];

const EMPTY_TIER: Omit<TierRow, "minQty" | "discountType" | "value"> = {
  badge: "",
  preselected: false,
  title: "",
  subtitle: "",
  labelText: "",
  imageUrl: "",
  freeShipping: false,
  giftProductId: "",
  giftVariantId: "",
  giftTitle: "",
  bundleProducts: [],
};

export default function OfferEditor() {
  const { offer } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const uploadFetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const saving = navigation.state === "submitting";
  const uploading = uploadFetcher.state !== "idle";

  const [type, setType] = useState<OfferType>((offer?.type as OfferType) ?? "QUANTITY_BREAK");
  const [name, setName] = useState(offer?.name ?? "");
  const [status] = useState(offer?.status ?? "DRAFT");
  const [products, setProducts] = useState<{ id: string; title: string }[]>(
    offer?.products ?? [],
  );
  const [tiers, setTiers] = useState<TierRow[]>(
    offer?.tiers?.length
      ? offer.tiers.map((t: any) => ({
          minQty: String(t.minQty),
          discountType: t.discountType,
          value: String(t.value),
          badge: t.badge,
          preselected: t.preselected,
          title: t.title,
          subtitle: t.subtitle,
          labelText: t.labelText,
          imageUrl: t.imageUrl,
          freeShipping: Boolean(t.freeShipping),
          giftProductId: t.giftProductId ?? "",
          giftVariantId: t.giftVariantId ?? "",
          giftTitle: t.giftTitle ?? "",
          bundleProducts: t.bundleProducts ?? [],
        }))
      : [
          { ...EMPTY_TIER, minQty: "2", discountType: "PERCENTAGE", value: "10", badge: "MOST POPULAR", preselected: true },
          { ...EMPTY_TIER, minQty: "3", discountType: "PERCENTAGE", value: "15", badge: "BEST VALUE", preselected: false },
        ],
  );
  // BOGO tiers (Buy X Get Y rungs)
  const loadedTiers: any[] = offer?.tiers ?? [];
  const [bogoTiers, setBogoTiers] = useState(
    offer?.type === "BOGO" && loadedTiers.length
      ? loadedTiers.map((t) => ({
          buy: String(t.minQty),
          get: String(t.getQty ?? 1),
          pct: String(t.value),
          badge: t.badge ?? "",
          title: t.title ?? "",
          subtitle: t.subtitle ?? "",
        }))
      : [
          {
            buy: String(offer?.config?.buyQty ?? 1),
            get: String(offer?.config?.getQty ?? 1),
            pct: String(offer?.config?.percentOff ?? 100),
            badge: offer?.config?.badge ?? "",
            title: offer?.config?.title ?? "",
            subtitle: offer?.config?.subtitle ?? "",
          },
        ],
  );
  // FREE_GIFT threshold ladder
  const [giftTiers, setGiftTiers] = useState(
    offer?.type === "FREE_GIFT" && loadedTiers.length
      ? loadedTiers.map((t) => ({
          threshold: String(t.value),
          giftProductId: t.giftProductId ?? "",
          giftVariantId: t.giftVariantId ?? "",
          giftTitle: t.giftTitle ?? "",
        }))
      : [
          {
            threshold: offer?.config?.thresholdX100
              ? String(offer.config.thresholdX100 / 100)
              : "300",
            giftProductId: offer?.config?.giftProductId ?? "",
            giftVariantId: offer?.config?.giftVariantId ?? "",
            giftTitle: offer?.config?.giftTitle ?? "",
          },
        ],
  );
  // MIX_MATCH threshold tiers
  const [mmTiers, setMmTiers] = useState(
    offer?.type === "MIX_MATCH" && loadedTiers.length
      ? loadedTiers.map((t) => ({
          minQty: String(t.minQty),
          pct: String(t.value),
          badge: t.badge ?? "",
        }))
      : [
          {
            minQty: String(offer?.config?.minQty ?? 3),
            pct: String(offer?.config?.percentOff ?? 20),
            badge: "",
          },
        ],
  );
  const updateRow = <T,>(setter: React.Dispatch<React.SetStateAction<T[]>>) =>
    (i: number, patch: Partial<T>) =>
      setter((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const updateBogo = updateRow(setBogoTiers);
  const updateGiftTier = updateRow(setGiftTiers);
  const updateMm = updateRow(setMmTiers);
  // Add-on upsells (any offer type)
  const [addons, setAddons] = useState<
    { id: string; variantId: string; title: string; handle?: string; preselected?: boolean }[]
  >(offer?.config?.addons ?? []);

  // Apply finished uploads to the right tier row
  useEffect(() => {
    const d = uploadFetcher.data as any;
    if (d?.uploadedUrl && d?.tierIndex !== undefined) {
      setTiers((rows) =>
        rows.map((r, i) => (i === Number(d.tierIndex) ? { ...r, imageUrl: d.uploadedUrl } : r)),
      );
    }
  }, [uploadFetcher.data]);

  const uploadError = (uploadFetcher.data as any)?.error;

  const pickProducts = useCallback(async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: products.map((p) => ({ id: p.id })),
    });
    if (selection) {
      setProducts(
        selection.map((p: any) => ({ id: p.id, title: p.title, handle: p.handle })),
      );
    }
  }, [products, shopify]);

  const pickTierGift = useCallback(
    async (i: number) => {
      const selection = await shopify.resourcePicker({ type: "product", multiple: false });
      if (selection?.[0]) {
        const p: any = selection[0];
        updateTier(i, {
          giftProductId: p.id,
          giftVariantId: p.variants?.[0]?.id ?? "",
          giftTitle: p.title,
        });
      }
    },
    [shopify],
  );

  const pickTierBundle = useCallback(
    async (i: number) => {
      const current = tiers[i]?.bundleProducts ?? [];
      const selection = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        selectionIds: current.map((b) => ({ id: b.productId })),
      });
      if (selection) {
        updateTier(i, {
          bundleProducts: selection.map((p: any) => ({
            productId: p.id,
            variantId: p.variants?.[0]?.id ?? "",
            title: p.title,
            handle: p.handle,
          })),
        });
      }
    },
    [tiers, shopify],
  );

  const pickAddons = useCallback(async () => {
    const selection = await shopify.resourcePicker({
      type: "product",
      multiple: true,
      selectionIds: addons.map((a) => ({ id: a.id })),
    });
    if (selection) {
      setAddons((prev) =>
        selection.map((p: any) => ({
          id: p.id,
          variantId: p.variants?.[0]?.id ?? "",
          title: p.title,
          handle: p.handle,
          // keep the preselect choice for add-ons that were already picked
          preselected: prev.find((a) => a.id === p.id)?.preselected ?? false,
        })),
      );
    }
  }, [addons, shopify]);

  const pickLadderGift = useCallback(
    async (i: number) => {
      const selection = await shopify.resourcePicker({ type: "product", multiple: false });
      if (selection?.[0]) {
        const p: any = selection[0];
        updateGiftTier(i, {
          giftProductId: p.id,
          giftVariantId: p.variants?.[0]?.id ?? "",
          giftTitle: p.title,
        });
      }
    },
    [shopify],
  );

  const updateTier = (i: number, patch: Partial<TierRow>) =>
    setTiers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const onPickImage = (i: number, file: File | null) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("intent", "upload-image");
    fd.append("tierIndex", String(i));
    fd.append("file", file);
    uploadFetcher.submit(fd, { method: "post", encType: "multipart/form-data" });
  };

  const save = (saveStatus: string) => {
    const payload: OfferInput = {
      type,
      name,
      status: saveStatus as OfferInput["status"],
      products,
      tiers:
        type === "QUANTITY_BREAK"
          ? tiers.map((t) => ({
              minQty: parseInt(t.minQty, 10),
              discountType: t.discountType as any,
              value: t.discountType === "NONE" ? 0 : parseFloat(t.value),
              badge: t.badge,
              preselected: t.preselected,
              title: t.title,
              subtitle: t.subtitle,
              labelText: t.labelText,
              imageUrl: t.imageUrl,
              freeShipping: Boolean(t.freeShipping),
              giftProductId: t.giftProductId,
              giftVariantId: t.giftVariantId,
              giftTitle: t.giftTitle,
              bundleProducts: t.bundleProducts,
            }))
          : type === "BOGO"
            ? bogoTiers.map((r) => ({
                minQty: parseInt(r.buy, 10),
                getQty: parseInt(r.get, 10),
                discountType: "PERCENTAGE" as const,
                value: parseFloat(r.pct),
                badge: r.badge,
                title: r.title,
                subtitle: r.subtitle,
              }))
            : type === "FREE_GIFT"
              ? giftTiers.map((r) => ({
                  minQty: 1,
                  discountType: "THRESHOLD" as const,
                  value: parseFloat(r.threshold),
                  giftProductId: r.giftProductId,
                  giftVariantId: r.giftVariantId,
                  giftTitle: r.giftTitle,
                }))
              : mmTiers.map((r) => ({
                  minQty: parseInt(r.minQty, 10),
                  discountType: "PERCENTAGE" as const,
                  value: parseFloat(r.pct),
                  badge: r.badge,
                })),
      config: { addons: addons.length ? addons : undefined },
    };
    submit({ payload: JSON.stringify(payload) }, { method: "post" });
  };

  return (
    <Page
      title={offer ? `Edit: ${offer.name}` : "Create offer"}
      backAction={{ url: "/app" }}
      primaryAction={{
        content: "Save & activate",
        loading: saving,
        onAction: () => save("ACTIVE"),
      }}
      secondaryActions={[
        { content: "Save as draft", onAction: () => save("DRAFT") },
        ...(offer
          ? [
              { content: "Pause", onAction: () => save("PAUSED") },
              {
                content: "Delete",
                destructive: true,
                onAction: () => submit({ intent: "delete" }, { method: "post" }),
              },
            ]
          : []),
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {actionData && "error" in (actionData as any) && (actionData as any).error && (
              <Banner tone="critical" title="Could not save">
                <p>{(actionData as any).error}</p>
              </Banner>
            )}
            {uploadError && (
              <Banner tone="critical" title="Image upload failed">
                <p>{uploadError}</p>
              </Banner>
            )}

            <Card>
              <BlockStack gap="400">
                <TextField
                  label="Offer name"
                  value={name}
                  onChange={setName}
                  autoComplete="off"
                  placeholder="e.g. Perfume quantity breaks"
                />
                <Select
                  label="Offer type"
                  options={TYPE_OPTIONS}
                  value={type}
                  onChange={(v) => setType(v as OfferType)}
                  disabled={Boolean(offer)}
                  helpText={offer ? "Type cannot change after creation — create a new offer instead." : undefined}
                />
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span">Status:</Text>
                  <Badge tone={status === "ACTIVE" ? "success" : status === "PAUSED" ? "warning" : "info"}>
                    {status}
                  </Badge>
                </InlineStack>
              </BlockStack>
            </Card>

            {type !== "FREE_GIFT" && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    {type === "MIX_MATCH" ? "Mix & Match pool" : "Applies to products"}
                  </Text>
                  <InlineStack gap="200" wrap>
                    {products.map((p) => (
                      <Badge key={p.id}>{p.title}</Badge>
                    ))}
                  </InlineStack>
                  <Button onClick={pickProducts}>
                    {products.length ? "Change products" : "Select products"}
                  </Button>
                </BlockStack>
              </Card>
            )}

            {type === "QUANTITY_BREAK" && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Tiers</Text>
                  <Text as="p" tone="subdued">
                    Tip: add a tier with quantity 1 and discount "None" if you want a styled
                    "single item" row with its own title and image (like Kaching's Starter option).
                  </Text>
                  {tiers.map((tier, i) => (
                    <BlockStack key={i} gap="300">
                      {i > 0 && <Divider />}
                      <InlineStack gap="300" wrap blockAlign="end">
                        <div style={{ minWidth: 90 }}>
                          <TextField label="Buy qty" type="number" value={tier.minQty}
                            onChange={(v) => updateTier(i, { minQty: v })} autoComplete="off" />
                        </div>
                        <div style={{ minWidth: 240 }}>
                          <Select label="Discount type" options={DISCOUNT_TYPE_OPTIONS}
                            value={tier.discountType}
                            onChange={(v) => updateTier(i, { discountType: v })} />
                        </div>
                        <div style={{ minWidth: 110 }}>
                          <TextField label="Value" type="number" value={tier.value}
                            disabled={tier.discountType === "NONE"}
                            onChange={(v) => updateTier(i, { value: v })} autoComplete="off" />
                        </div>
                        <div style={{ minWidth: 150 }}>
                          <TextField label="Badge (optional)" value={tier.badge}
                            onChange={(v) => updateTier(i, { badge: v })} autoComplete="off"
                            placeholder="MOST POPULAR" />
                        </div>
                        <Checkbox label="Preselected" checked={tier.preselected}
                          onChange={(v) => updateTier(i, { preselected: v })} />
                        <Button tone="critical" variant="plain"
                          onClick={() => setTiers((rows) => rows.filter((_, idx) => idx !== i))}>
                          Remove
                        </Button>
                      </InlineStack>
                      <InlineStack gap="300" wrap blockAlign="end">
                        <div style={{ minWidth: 170 }}>
                          <TextField label="Title (optional)" value={tier.title}
                            onChange={(v) => updateTier(i, { title: v })} autoComplete="off"
                            placeholder={`Buy ${tier.minQty || "N"}`} />
                        </div>
                        <div style={{ minWidth: 220 }}>
                          <TextField label="Subtitle (optional)" value={tier.subtitle}
                            onChange={(v) => updateTier(i, { subtitle: v })} autoComplete="off"
                            placeholder="Perfect for daily relaxation" />
                        </div>
                        <div style={{ minWidth: 140 }}>
                          <TextField label="Label (optional)" value={tier.labelText}
                            onChange={(v) => updateTier(i, { labelText: v })} autoComplete="off"
                            placeholder="Save AED 35" />
                        </div>
                        <InlineStack gap="200" blockAlign="center">
                          {tier.imageUrl ? (
                            <Thumbnail source={tier.imageUrl} alt="Tier image" size="small" />
                          ) : null}
                          <label style={{ cursor: "pointer" }}>
                            <span style={{ display: "none" }}>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => onPickImage(i, e.target.files?.[0] ?? null)}
                              />
                            </span>
                            <Button
                              disabled={uploading}
                              loading={uploading}
                              onClick={() => {
                                const input = document.createElement("input");
                                input.type = "file";
                                input.accept = "image/*";
                                input.onchange = () =>
                                  onPickImage(i, input.files?.[0] ?? null);
                                input.click();
                              }}
                            >
                              {tier.imageUrl ? "Change image" : "Upload image"}
                            </Button>
                          </label>
                          {tier.imageUrl ? (
                            <Button variant="plain" tone="critical"
                              onClick={() => updateTier(i, { imageUrl: "" })}>
                              Remove image
                            </Button>
                          ) : null}
                        </InlineStack>
                      </InlineStack>
                      <InlineStack gap="300" wrap blockAlign="center">
                        <Checkbox label="Free shipping at this tier"
                          checked={tier.freeShipping}
                          onChange={(v) => updateTier(i, { freeShipping: v })} />
                        {tier.giftProductId ? (
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone="success">{`Gift: ${tier.giftTitle}`}</Badge>
                            <Button variant="plain" tone="critical"
                              onClick={() =>
                                updateTier(i, { giftProductId: "", giftVariantId: "", giftTitle: "" })
                              }>
                              Remove gift
                            </Button>
                          </InlineStack>
                        ) : (
                          <Button variant="plain" onClick={() => pickTierGift(i)}>
                            + Add free gift at this tier
                          </Button>
                        )}
                      </InlineStack>
                      <InlineStack gap="200" wrap blockAlign="center">
                        <Text as="span" tone="subdued">Complete the bundle:</Text>
                        {tier.bundleProducts.map((b) => (
                          <Badge key={b.productId}>{b.title}</Badge>
                        ))}
                        <Button variant="plain" onClick={() => pickTierBundle(i)}>
                          {tier.bundleProducts.length ? "Change products" : "+ Add cross-sell product(s)"}
                        </Button>
                        {tier.bundleProducts.length > 0 && (
                          <Button variant="plain" tone="critical"
                            onClick={() => updateTier(i, { bundleProducts: [] })}>
                            Remove
                          </Button>
                        )}
                      </InlineStack>
                      {tier.bundleProducts.length > 0 && (
                        <Text as="p" tone="subdued">
                          Shown as a "Complete the bundle" option: this tier's product(s) at this
                          tier's price, plus the selected product(s) above at full price (no
                          extra discount).
                        </Text>
                      )}
                    </BlockStack>
                  ))}
                  <Button
                    onClick={() =>
                      setTiers((rows) => [
                        ...rows,
                        { ...EMPTY_TIER, minQty: "4", discountType: "PERCENTAGE", value: "20" },
                      ])
                    }
                  >
                    Add tier
                  </Button>
                </BlockStack>
              </Card>
            )}

            {(
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">Add-on upsells</Text>
                  <Text as="p" tone="subdued">
                    Shown as checkbox rows under the tiers (e.g. Shipping Protection,
                    1-Year Warranty). Create each add-on as a normal product with its
                    own price first, then pick it here. Checked add-ons are added to
                    the cart together with the bundle.
                  </Text>
                  <BlockStack gap="200">
                    {addons.map((a, i) => (
                      <InlineStack key={a.id} gap="300" blockAlign="center">
                        <Badge>{a.title}</Badge>
                        <Checkbox
                          label="Preselected (checked by default for the customer)"
                          checked={Boolean(a.preselected)}
                          onChange={(v) =>
                            setAddons((rows) =>
                              rows.map((r, idx) =>
                                idx === i ? { ...r, preselected: v } : r,
                              ),
                            )
                          }
                        />
                      </InlineStack>
                    ))}
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button onClick={pickAddons}>
                      {addons.length ? "Change add-ons" : "Select add-on products"}
                    </Button>
                    {addons.length > 0 && (
                      <Button variant="plain" tone="critical" onClick={() => setAddons([])}>
                        Remove all
                      </Button>
                    )}
                  </InlineStack>
                </BlockStack>
              </Card>
            )}

            {type === "BOGO" && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Buy X get Y — tiers</Text>
                  {bogoTiers.map((r, i) => (
                    <BlockStack key={i} gap="300">
                      {i > 0 && <Divider />}
                      <InlineStack gap="300" wrap blockAlign="end">
                        <div style={{ minWidth: 100 }}>
                          <TextField label="Buy (X)" type="number" value={r.buy}
                            onChange={(v) => updateBogo(i, { buy: v })} autoComplete="off" />
                        </div>
                        <div style={{ minWidth: 100 }}>
                          <TextField label="Get (Y)" type="number" value={r.get}
                            onChange={(v) => updateBogo(i, { get: v })} autoComplete="off" />
                        </div>
                        <div style={{ minWidth: 150 }}>
                          <TextField label="Y % off (100 = free)" type="number" value={r.pct}
                            onChange={(v) => updateBogo(i, { pct: v })} autoComplete="off" />
                        </div>
                        <div style={{ minWidth: 160 }}>
                          <TextField label="Badge (optional)" value={r.badge}
                            onChange={(v) => updateBogo(i, { badge: v })} autoComplete="off"
                            placeholder="Todays Special Deal" />
                        </div>
                        <Button tone="critical" variant="plain"
                          onClick={() => setBogoTiers((rows) => rows.filter((_, idx) => idx !== i))}>
                          Remove
                        </Button>
                      </InlineStack>
                      <InlineStack gap="300" wrap>
                        <div style={{ minWidth: 200 }}>
                          <TextField label="Display title (optional)" value={r.title}
                            onChange={(v) => updateBogo(i, { title: v })} autoComplete="off"
                            placeholder="Buy 2, get 1 FREE" />
                        </div>
                        <div style={{ minWidth: 240 }}>
                          <TextField label="Display subtitle (optional)" value={r.subtitle}
                            onChange={(v) => updateBogo(i, { subtitle: v })} autoComplete="off"
                            placeholder="2 Smart Correctors, Free shipping" />
                        </div>
                      </InlineStack>
                    </BlockStack>
                  ))}
                  <Button
                    onClick={() =>
                      setBogoTiers((rows) => [
                        ...rows,
                        { buy: "3", get: "2", pct: "100", badge: "", title: "", subtitle: "" },
                      ])
                    }
                  >
                    Add tier
                  </Button>
                  <Text as="p" tone="subdued">
                    Each tier is a selectable row in the widget (e.g. Buy 1 Get 1 Free AND
                    Buy 3 Get 2 Free). The cart automatically gets the best tier the
                    quantity qualifies for.
                  </Text>
                </BlockStack>
              </Card>
            )}

            {type === "FREE_GIFT" && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Free gift — threshold tiers</Text>
                  {giftTiers.map((r, i) => (
                    <InlineStack key={i} gap="300" wrap blockAlign="end">
                      <div style={{ minWidth: 200 }}>
                        <TextField label="Spend threshold (store currency)" type="number"
                          value={r.threshold}
                          onChange={(v) => updateGiftTier(i, { threshold: v })}
                          autoComplete="off" />
                      </div>
                      {r.giftProductId ? (
                        <InlineStack gap="200" blockAlign="center">
                          <Badge tone="success">{r.giftTitle || "Gift"}</Badge>
                          <Button variant="plain" onClick={() => pickLadderGift(i)}>Change</Button>
                        </InlineStack>
                      ) : (
                        <Button onClick={() => pickLadderGift(i)}>Select gift product</Button>
                      )}
                      <Button tone="critical" variant="plain"
                        onClick={() => setGiftTiers((rows) => rows.filter((_, idx) => idx !== i))}>
                        Remove
                      </Button>
                    </InlineStack>
                  ))}
                  <Button
                    onClick={() =>
                      setGiftTiers((rows) => [
                        ...rows,
                        { threshold: "500", giftProductId: "", giftVariantId: "", giftTitle: "" },
                      ])
                    }
                  >
                    Add tier
                  </Button>
                  <Text as="p" tone="subdued">
                    Example ladder: 300 → Gift A, 500 → Gift B, 1000 → Gift C. The highest
                    reached tier's gift is auto-added and made free; lower gifts swap out
                    automatically as the cart grows.
                  </Text>
                </BlockStack>
              </Card>
            )}

            {type === "MIX_MATCH" && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">Mix & Match — tiers</Text>
                  {mmTiers.map((r, i) => (
                    <InlineStack key={i} gap="300" wrap blockAlign="end">
                      <div style={{ minWidth: 170 }}>
                        <TextField label="Minimum items" type="number" value={r.minQty}
                          onChange={(v) => updateMm(i, { minQty: v })} autoComplete="off" />
                      </div>
                      <div style={{ minWidth: 120 }}>
                        <TextField label="Percent off" type="number" value={r.pct}
                          onChange={(v) => updateMm(i, { pct: v })} autoComplete="off" />
                      </div>
                      <div style={{ minWidth: 160 }}>
                        <TextField label="Badge (optional)" value={r.badge}
                          onChange={(v) => updateMm(i, { badge: v })} autoComplete="off" />
                      </div>
                      <Button tone="critical" variant="plain"
                        onClick={() => setMmTiers((rows) => rows.filter((_, idx) => idx !== i))}>
                        Remove
                      </Button>
                    </InlineStack>
                  ))}
                  <Button
                    onClick={() =>
                      setMmTiers((rows) => [...rows, { minQty: "5", pct: "25", badge: "" }])
                    }
                  >
                    Add tier
                  </Button>
                  <Text as="p" tone="subdued">
                    Example: any 2 → 10%, any 3 → 20%. The best reached tier applies to all
                    qualifying items automatically.
                  </Text>
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
