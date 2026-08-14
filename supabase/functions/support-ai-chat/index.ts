// Server-side AI support triage. Runs with the service-role key so it can
// safely look up order/wallet/payout/verification STATUS fields (never raw
// documents, never full payout destinations) and ground its answer in
// them, instead of trusting the client or inventing an explanation — see
// _shared/supportKnowledge.ts's PLATFORM_FACTS for the mechanics it's told
// to treat as authoritative. Uses a NEW server-only OPENAI_API_KEY secret
// — the existing VITE_OPENAI_KEY used by src/app/lib/aiapi.tsx is
// client-exposed and must never see account-specific data.
import { buildKnowledgeBlock } from '../_shared/supportKnowledge.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';

function rest(path: string) {
  return `${SUPABASE_URL}/rest/v1${path}`;
}
const H = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function selectOne(table: string, filter: string, columns: string) {
  const res = await fetch(rest(`/${table}?${filter}&select=${columns}&limit=1`), { headers: H });
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] : null;
}

// Categories/subcategories that always warrant "Connect with an Agent"
// regardless of what the model itself decides — matches spec sections 8/9/25/26.
const ALWAYS_ESCALATE_CATEGORIES = new Set(['trust_safety']);
const ALWAYS_ESCALATE_SUBCATEGORIES = new Set([
  'account_compromised', 'missing_balance', 'havent_received_payout',
  'wrong_amount', 'refund_issue', 'payout_problem', 'missing_equipment', 'damage',
]);

interface RelatedIds {
  orderId?: string;
  listingId?: string;
  walletTransactionId?: string;
  payoutRequestId?: string;
  verificationId?: string;
}

async function gatherSafeFacts(userId: string, ids: RelatedIds): Promise<{ facts: string; missingWalletTx: boolean }> {
  const lines: string[] = [];
  let missingWalletTx = false;

  if (ids.orderId) {
    const order = await selectOne('orders', `id=eq.${ids.orderId}`, 'id,status,payment_method,listing_title,refund_status,dispute_status,paid_at,renter_id,host_id');
    if (order) {
      lines.push(`Order ${order.id}: listing="${order.listing_title}", order_status=${order.status}, payment=${order.paid_at ? 'paid' : 'unpaid'}, refund_status=${order.refund_status}, dispute_status=${order.dispute_status}.`);
      if (order.paid_at && order.host_id) {
        const wtx = await selectOne('wallet_transactions', `order_id=eq.${ids.orderId}&transaction_type=eq.rental_earning`, 'id,status,balance_type');
        if (wtx) {
          lines.push(`Host wallet transaction for this order: status=${wtx.status}, balance_type=${wtx.balance_type}.`);
        } else {
          lines.push(`Host wallet transaction for this order: MISSING — payment is paid but no wallet transaction exists yet.`);
          missingWalletTx = true;
        }
      }
    } else {
      lines.push(`Order ${ids.orderId}: not found.`);
    }
  }

  if (ids.walletTransactionId) {
    const wtx = await selectOne('wallet_transactions', `id=eq.${ids.walletTransactionId}`, 'id,transaction_type,amount,currency,status,balance_type,order_id');
    if (wtx) lines.push(`Wallet transaction ${wtx.id}: type=${wtx.transaction_type}, status=${wtx.status}, balance_type=${wtx.balance_type}, amount=${wtx.amount} ${wtx.currency}.`);
  }

  if (ids.payoutRequestId) {
    const p = await selectOne('payout_requests', `id=eq.${ids.payoutRequestId}`, 'id,status,amount,currency,payout_method,requested_at');
    if (p) lines.push(`Payout request ${p.id}: status=${p.status}, amount=${p.amount} ${p.currency}, method=${p.payout_method}, requested_at=${p.requested_at}. (Exact payout destination is never shared with the AI.)`);
  }

  if (ids.verificationId) {
    const v = await selectOne('identity_verifications', `id=eq.${ids.verificationId}`, 'id,status,decision_reason');
    if (v) lines.push(`Creator+ verification ${v.id}: status=${v.status}${v.decision_reason ? `, reason="${v.decision_reason}"` : ''}.`);
  }

  return { facts: lines.join('\n') || '(no related object attached)', missingWalletTx };
}

async function callOpenAI(messages: { role: string; content: string }[]): Promise<any> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (!OPENAI_API_KEY) {
    return new Response(JSON.stringify({ error: 'AI support is not configured yet' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  try {
    const { mode = 'chat', userId, category, subcategory, relatedIds, history } = await req.json() as {
      mode?: 'chat' | 'summarize'; userId?: string; category?: string; subcategory?: string;
      relatedIds?: RelatedIds; history?: { role: 'user' | 'assistant'; content: string }[];
    };
    if (!userId || !Array.isArray(history) || history.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing userId or history' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { facts, missingWalletTx } = await gatherSafeFacts(userId, relatedIds || {});
    const knowledge = buildKnowledgeBlock(category);

    const alwaysEscalate = ALWAYS_ESCALATE_CATEGORIES.has(category || '') || ALWAYS_ESCALATE_SUBCATEGORIES.has(subcategory || '') || missingWalletTx;

    if (mode === 'summarize') {
      const systemPrompt = `You are writing an internal support-team summary of a customer support conversation for Filmons, a creative-equipment rental marketplace. Use ONLY the facts given below — never invent order/payment/wallet details. Output JSON: {"summary": string}. The summary should use this structure (omit sections that don't apply):\n\nCUSTOMER ISSUE\n<one-line summary of what they reported>\n\nRELATED OBJECT\n<order/listing/transaction id and what's known about it>\n\nSAFE SYSTEM FACTS\n<the facts below, verbatim or condensed>\n\nCUSTOMER REPORT\n<what the customer said, in their words>\n\nRECOMMENDED REVIEW\n<what a human agent should check first>\n\nKNOWN FACTS:\n${facts}`;
      const messages = [
        { role: 'system', content: systemPrompt },
        ...history.map(h => ({ role: h.role, content: h.content })),
      ];
      const result = await callOpenAI(messages);
      return new Response(JSON.stringify({ summary: result.summary || '' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const systemPrompt = `You are "Filmons Support", an AI assistant helping a signed-in Filmons user (category: ${category || 'general'}${subcategory ? `, issue: ${subcategory}` : ''}).

Hard rules — never break these:
- Never claim a refund has been issued, a payout has been sent, or a verification has been decided unless the KNOWN FACTS below explicitly confirm it.
- Never invent a payment status, wallet balance, verification decision, refund, payout, or order status. If a fact isn't in KNOWN FACTS, say you don't have that information rather than guessing.
- If KNOWN FACTS shows something that looks wrong or missing (e.g. payment paid but no wallet transaction), say plainly that it needs review by the team — do not speculate on why.
- Keep answers short (2-4 sentences) and concrete, using KNOWN FACTS and PLATFORM_FACTS.
- Always end by considering whether to recommend "Connect with an Agent" — you MUST recommend it if the issue involves missing money, a payout/refund problem, account compromise, fraud, safety, or anything requiring admin action.

${knowledge}

KNOWN FACTS about the objects attached to this conversation:
${facts}

Respond ONLY as JSON: {"reply": string, "recommendEscalate": boolean}.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content })),
    ];
    const result = await callOpenAI(messages);
    const recommendEscalate = alwaysEscalate || !!result.recommendEscalate;

    return new Response(JSON.stringify({
      reply: result.reply || "I'm not sure how to help with that — let's connect you with an agent.",
      recommendEscalate,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('support-ai-chat error:', e);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
