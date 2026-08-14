// Returns the authoritative price breakdown (subtotal, Filmons Fee, total)
// for a given subtotal — called before any payment method is chosen so the
// renter sees the real total up front, and again when a rental agreement
// is signed so its pricing_snapshot freezes real numbers. stripe-charge
// independently calls the same shared computeBreakdown, so the quote shown
// here and the amount actually charged can never drift apart. No tax is
// calculated here — Stripe handles applicable tax on its own.
import { computeBreakdown } from "../_shared/pricing.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const { subtotal } = await req.json();
    if (typeof subtotal !== "number" || subtotal < 0) {
      return new Response(JSON.stringify({ error: "subtotal must be a non-negative number" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const breakdown = await computeBreakdown({ subtotal });
    return new Response(JSON.stringify(breakdown), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("checkout-quote error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
