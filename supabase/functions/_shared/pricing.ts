// Single source of truth for the Filmons Fee. Both checkout-quote
// (pre-payment breakdown shown to the user) and stripe-charge (the actual
// charge amount) call this — nothing recomputes the math independently, so
// what the user sees before paying and what they're actually charged can
// never drift apart. rental-agreement-sign also calls this to freeze a
// pricing_snapshot at signing time.
//
// Tax is deliberately out of scope: Stripe handles applicable tax on its
// own, separately. Filmons never calculates, stores, or displays a tax
// figure — no second tax-calculation engine here.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}
const H = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

export interface PricingBreakdown {
  subtotal: number;
  buyerFeeRate: number;
  buyerFeeAmount: number;
  sellerFeeRate: number;
  sellerFeeAmount: number;
  total: number;
  feeConfigVersion: string;
}

function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calcFee(row: any | undefined, subtotal: number): number {
  if (!row) return 0;
  if (row.fee_type === "percentage") return round2(subtotal * Number(row.rate || 0));
  if (row.fee_type === "fixed") return round2(Number(row.fixed_amount || 0));
  if (row.fee_type === "percentage_plus_fixed") {
    return round2(subtotal * Number(row.rate || 0) + Number(row.fixed_amount || 0));
  }
  return 0;
}

export async function computeBreakdown(input: { subtotal: number; context?: string }): Promise<PricingBreakdown> {
  const subtotal = Math.max(0, Number(input.subtotal) || 0);
  // Every existing caller (rental/service checkout) passes no context and
  // gets exactly today's behavior -- 'rental' is the default so a new
  // context-scoped fee row (e.g. 'opportunity') can never leak into an
  // unrelated calculation just because it happens to be active.
  const context = input.context || 'rental';

  const feeRes = await fetch(rest(`/platform_fee_config?active=eq.true&context=eq.${encodeURIComponent(context)}&select=*`), { headers: H });
  const feeRows: any[] = await feeRes.json().catch(() => []);
  const buyerRow = Array.isArray(feeRows) ? feeRows.find((r) => r.payer === "buyer") : undefined;
  const sellerRow = Array.isArray(feeRows) ? feeRows.find((r) => r.payer === "seller") : undefined;
  const feeConfigVersion = buyerRow?.version || sellerRow?.version || "unversioned";

  const buyerFeeAmount = calcFee(buyerRow, subtotal);
  const buyerFeeRate = buyerRow?.fee_type === "percentage" ? Number(buyerRow.rate || 0) : 0;
  const sellerFeeAmount = calcFee(sellerRow, subtotal);
  const sellerFeeRate = sellerRow?.fee_type === "percentage" ? Number(sellerRow.rate || 0) : 0;

  // Total before any Stripe-side adjustments (e.g. Stripe Tax, if the
  // merchant enables it) — this is what Filmons sends to Stripe, not
  // necessarily the final amount Stripe ends up charging.
  const total = round2(subtotal + buyerFeeAmount);

  return {
    subtotal,
    buyerFeeRate,
    buyerFeeAmount,
    sellerFeeRate,
    sellerFeeAmount,
    total,
    feeConfigVersion,
  };
}
