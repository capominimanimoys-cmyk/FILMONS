/**
 * generateServiceAgreement.ts
 * Service Agreement document for funded hire requests. Built on the same
 * template/CSS as the equipment Rental Agreement (see generatePDF.ts) and,
 * like it, shows each party's LEGAL name from identity verification.
 */

import { supabase } from '../../lib/supabase';
import { signRentalDoc } from '../../lib/upload';
import { BASE_CSS, fetchLegalName } from './generatePDF';
import { withTimeout } from './withTimeout';
import type { HireRequestRow, HireTransactionRow } from './hireApi';

export interface ServiceAgreementData {
  hire: HireRequestRow;
  txn: HireTransactionRow | null;
  client_name?: string;      // requester, legal name
  client_email?: string;
  client_username?: string;
  provider_name?: string;    // host / creator, legal name
  provider_email?: string;
  provider_username?: string;
  // Signatures captured in ServiceAgreementModal (image as data URL).
  client_signature?: PartySignature;
  provider_signature?: PartySignature;
}

export interface PartySignature { name: string; dataUrl?: string; signedAt: string }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const DASH = '&#x2014;';
const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: 'long', day: 'numeric' }) : DASH;
const money = (n: number | null | undefined, cur = 'CAD') => n == null ? DASH : `$${Number(n).toFixed(2)} ${esc(cur)}`;

export function buildServiceAgreementHTML(d: ServiceAgreementData): string {
  const h = d.hire, t = d.txn;
  const ref = `SVC-${h.id.slice(0, 8).toUpperCase()}`;
  const workType = { on_site: 'On-site', remote: 'Remote', hybrid: 'Hybrid' }[h.work_type] || DASH;
  const location = h.work_type === 'remote' ? 'Remote' : ([h.street_address, h.city, h.province, h.postal_code, h.country].filter(Boolean).map(esc).join(', ') || DASH);
  const schedule = h.date_type === 'flexible' ? 'Flexible dates'
    : h.date_type === 'range' && h.end_date ? `${fmtDate(h.start_date)} &#x2013; ${fmtDate(h.end_date)}`
    : fmtDate(h.start_date);
  const times = h.start_time ? `${esc(h.start_time)}${h.end_time ? ` &#x2013; ${esc(h.end_time)}` : ''}` : DASH;
  const rateUnit = h.pricing_type === 'hourly' ? 'per hour' : h.pricing_type === 'daily' ? 'per day' : 'fixed price';
  const cur = t?.currency || h.currency || 'CAD';
  const gross = t?.gross_amount ?? h.budget_amount;
  const agreedAt = t?.funded_at ? fmtDate(t.funded_at) : DASH;
  const clientName = d.client_name || DASH;
  const providerName = d.provider_name || DASH;
  const sigBox = (sig: PartySignature | undefined, fallback: string) => sig
    ? `<div class="sig-box">${sig.dataUrl ? `<img src="${sig.dataUrl}" alt="Signature"/>` : ''}<div class="sig-line">Digitally signed by ${esc(sig.name)} &#x2014; ${esc(new Date(sig.signedAt).toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'long', timeStyle: 'short' }))} EST</div></div>`
    : `<div class="sig-box"><div class="sig-line">Not yet signed</div></div>`;
  const links = (h.reference_links || []).filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>Filmons Service Agreement &#x2014; ${ref}</title>
<style>${BASE_CSS}
  .clause{font-size:9.5px;color:#374151;line-height:1.6;margin:0 0 8px}
  .clause-sub{font-size:9.5px;color:#6b7280;margin:-4px 0 10px}</style>
</head><body>

<div class="cover">
  <div class="cover-logo">&#x1F3AC; FILMONS</div>
  <div class="cover-sub">Film Gear &amp; Creative Services Marketplace</div>
  <div class="cover-title">SERVICE AGREEMENT</div>
  <div class="cover-desc">This Agreement governs the engagement of a Service Provider by a Client for creative or production services booked through the Filmons platform.</div>
  <div class="cover-ref">
    Agreement Reference: ${ref}<br/>
    Agreement Date: ${agreedAt}
  </div>
  <div class="cover-site">filmons.com | gabriel@filmons.app</div>
</div>

<div class="sec">
  <div class="sec-title">01 / Parties &amp; identity</div>
  <p class="clause-sub">Client and service provider details &#x2014; verified account records.</p>
  <div class="field"><div class="fl">Agreement ID / booking ID / effective date</div><div class="fv">${ref} / ${esc(h.id)} / ${agreedAt}</div></div>
  <div class="sub">Client</div>
  <p class="clause">The client purchases the services described in this agreement. A business must identify its legal entity and authorized representative.</p>
  <div class="two">
    <div class="field"><div class="fl">Legal first name(s) / middle name(s) / legal last name</div><div class="fv">${esc(clientName)}</div></div>
    <div class="field"><div class="fl">Business legal name (if applicable) / representative title</div><div class="fv">${DASH}</div></div>
    <div class="field"><div class="fl">Phone number / email address</div><div class="fv">${esc(d.client_email) || DASH}</div></div>
    <div class="field"><div class="fl">FILMONS account ID / username</div><div class="fv">${d.client_username ? '@' + esc(d.client_username) : DASH} / ${esc(h.requester_id)}</div></div>
  </div>
  <div class="sub">Service provider</div>
  <p class="clause">The provider performs the services. A display name does not replace the contracting party's legal name.</p>
  <div class="two">
    <div class="field"><div class="fl">Legal first name(s) / middle name(s) / legal last name</div><div class="fv">${esc(providerName)}</div></div>
    <div class="field"><div class="fl">Business legal name (if applicable) / representative title</div><div class="fv">${DASH}</div></div>
    <div class="field"><div class="fl">Phone number / email address</div><div class="fv">${esc(d.provider_email) || DASH}</div></div>
    <div class="field"><div class="fl">FILMONS account ID / username</div><div class="fv">${d.provider_username ? '@' + esc(d.provider_username) : DASH} / ${esc(h.host_id)}</div></div>
  </div>
  <div class="note">Names shown are the legal names each party provided during Filmons identity verification.</div>
</div>

<div class="sec pgbreak">
  <div class="sec-title">02 / Booking &amp; deliverables</div>
  <p class="clause-sub">Define the work precisely before either party accepts.</p>
  <table class="info">
    <tr><td>Service title / listing ID / project name</td><td colspan="3"><strong>${esc(h.project_title)}</strong> &#x2014; ${esc(h.service_label)}${h.is_custom ? ' (custom request)' : ''}</td></tr>
    <tr><td>Scope of work, included tasks and deliverables</td><td colspan="3" style="white-space:pre-wrap">${esc(h.description) || DASH}</td></tr>
    <tr><td>Service location / remote arrangements / access requirements</td><td colspan="3">${workType} &#x2014; ${location}</td></tr>
    <tr><td>Start date and time / end date and time / time zone</td><td colspan="3">${schedule}${times !== DASH ? ` &#x2022; ${times}` : ''} (Eastern Time)</td></tr>
    <tr><td>Delivery milestones / due dates / delivery method and file formats</td><td colspan="3">Files and revisions are exchanged through Filmons messaging; milestones as recorded in the booking.</td></tr>
    <tr><td>Client responsibilities: materials, access, approvals, permits and deadlines</td><td colspan="3">${DASH}</td></tr>
    <tr><td>Provider responsibilities: personnel, equipment, licences and insurance</td><td colspan="3">${DASH}</td></tr>
    <tr><td>Included revisions / revision deadline / extra work rate</td><td colspan="3">${DASH}</td></tr>
    <tr><td>Acceptance criteria / client review period / method of written approval</td><td colspan="3">The Provider marks the work complete on Filmons; the Client then confirms completion or reports a problem in the booking record.</td></tr>
    ${links.length ? `<tr><td>Reference links</td><td colspan="3">${links.map(l => esc(l)).join('<br/>')}</td></tr>` : ''}
  </table>
  <div class="sub">Scope changes</div>
  <p class="clause">Changes to price, dates, deliverables or personnel require both parties' written approval through the booking record or an attached signed change order before the changed work begins. Silence alone is not approval.</p>
</div>

<div class="sec">
  <div class="sec-title">03 / Price, payment &amp; cancellation</div>
  <p class="clause-sub">Agreed amounts and the booking policy version; financial terms must not be ambiguous.</p>
  <table class="info">
    <tr><td>Currency / service subtotal / applicable taxes / approved expenses</td><td colspan="3">${esc(cur)} &#x2022; ${money(h.budget_amount, cur)} (${rateUnit}) &#x2022; taxes: ${DASH} &#x2022; expenses: ${DASH}</td></tr>
    <tr><td>Platform fee: amount or rate / fee payer / fee tax / policy version</td><td colspan="3">${t ? `${money(t.fee_amount, cur)} (${(t.fee_rate * 100).toFixed(0)}%)` : DASH} &#x2022; deducted from the Provider's earnings &#x2022; Filmons booking policy, version 1.0</td></tr>
    <tr><td>Total payable by client / expected net payable to provider</td><td>${money(gross, cur)}</td><td style="font-weight:800">${t ? money(t.net_amount, cur) : DASH}</td><td>net to provider</td></tr>
    <tr><td>Deposit or milestones: amounts, due dates and release conditions</td><td colspan="3">${t && t.initial_release_amount != null ? `${money(t.initial_release_amount, cur)} on start; ${money(t.held_amount, cur)} held until the Client confirms completion.` : DASH}</td></tr>
    <tr><td>Cancellation / rescheduling notice periods, charges and refund calculation</td><td colspan="3">${DASH} &#x2014; if blank, no automatic cancellation penalty is agreed.</td></tr>
    <tr><td>No-show / late arrival / overtime / approved non-refundable expenses</td><td colspan="3">${DASH}</td></tr>
  </table>
  <div class="sub">Payment and wallet status</div>
  <p class="clause">Payments must use the agreed FILMONS payment flow. A payment shown in the FILMONS balance may still be pending and unavailable to withdraw. Mark funds Available for payout only after Stripe confirms those funds are available for payout for the relevant account. Work approval and payment availability are separate events. Stripe processing, verification, reserves, disputes and bank processing can delay availability or receipt. Do not promise an instant payout or a fixed release date unless confirmed for this booking. This clause does not represent funds as escrow.</p>
  <div class="sub">Cancellation and refunds</div>
  <p class="clause">Either party may cancel by written notice. Apply the completed cancellation terms above, subject to mandatory law. If those terms are blank, no automatic cancellation penalty is agreed. Any earned fees, approved costs and unperformed work must be reconciled in writing. Refund timing depends on the payment processor and bank; a platform decision cannot remove statutory rights.</p>
  <div class="sub">Payment disputes</div>
  <p class="clause">Notify the other party promptly with the booking ID and supporting records. An undisputed amount remains due under the agreed schedule. Any hold, refund or adjustment must follow applicable law, payment-provider rules and the disclosed booking policy; this agreement does not authorize arbitrary deductions.</p>
</div>

<div class="sec pgbreak">
  <div class="sec-title">04 / Service rules &amp; protections</div>
  <p class="clause-sub">These proposed terms become part of the booking only when both parties accept them.</p>
  <div class="sub">1. Accurate information and authority</div>
  <p class="clause">Each party confirms its supplied details are accurate, has legal capacity to contract, and has authority to bind any named business. Verification is not a guarantee of skill, safety or performance. No impersonation, fraudulent documents or unauthorized account use is allowed.</p>
  <div class="sub">2. Professional conduct and safety</div>
  <p class="clause">Provide lawful services with reasonable care and skill. No harassment, discrimination, threats, fraud or illegal activity. Follow agreed site rules and lawful safety requirements. A party may pause unsafe or unlawful work, notify the other promptly, and discuss a safe alternative and fair cost allocation.</p>
  <div class="sub">3. Equipment and property</div>
  <p class="clause">Identify any equipment included in the scope and record its condition. No substitutions that materially affect the work without approval. Each party is responsible for loss or damage to the extent caused by its negligence, wilful misconduct or breach, subject to applicable law. Gear rentals need a separate rental schedule or agreement.</p>
  <div class="sub">4. Creative ownership and permissions</div>
  <p class="clause">The parties must complete the ownership and usage field below. Until then, no copyright assignment, portfolio permission or unrestricted licence is implied by payment alone. Each party must obtain rights and releases for materials, music, people and locations it supplies, as required for the agreed use.</p>
  <table class="info"><tr><td>Ownership / licence, territory, duration, source files, payment conditions, portfolio use</td><td>${DASH}</td></tr></table>
  <div class="sub">5. Confidentiality and personal information</div>
  <p class="clause">Use confidential project information and personal details only for the booking, necessary administration, disputes or legal obligations. Share only with authorized recipients who need access. Protect records and delete them when no longer needed, subject to lawful retention. No public posting of addresses, identity documents or private contact details. Marketing consent must be separate.</p>
  <div class="sub">6. Unforeseen events and termination</div>
  <p class="clause">An affected party must promptly report events beyond reasonable control and try to reduce disruption. Agree in writing on rescheduling or termination and reconcile completed work and approved costs. For a material breach, provide written notice and a reasonable chance to remedy where practicable; serious fraud or safety risks may justify immediate termination.</p>
  <div class="sub">7. Liability and mandatory rights</div>
  <p class="clause">Each party remains responsible for its own acts and obligations under applicable law. No liability cap or broad indemnity is created by this template. Nothing excludes rights or liabilities that cannot lawfully be excluded, including applicable consumer protections.</p>
</div>

<div class="sec pgbreak">
  <div class="sec-title">05 / Verification &amp; acceptance</div>
  <p class="clause-sub">Complete the remaining fields, attach schedules, then sign the same final version.</p>
  <div class="sub">8. FILMONS role and governing documents</div>
  <p class="clause">The client and provider contract with each other; FILMONS facilitates the booking. FILMONS is not a signatory, employer, insurer or guarantor under this template. Any different role requires express agreement by the relevant entity. Identify applicable policies below. Mandatory law prevails over conflicting contract terms.</p>
  <table class="info">
    <tr><td>Platform terms / privacy notice / booking policy: exact versions, dates or links</td><td>Filmons Terms of Service, Privacy Notice and booking policy, as in force at signing</td></tr>
    <tr><td>Governing province or territory / country / competent court location</td><td>British Columbia, Canada</td></tr>
  </table>
  <div class="sub">9. Resolving disagreements</div>
  <p class="clause">First attempt a good-faith written resolution. Either party may request FILMONS support using the booking record. Mediation requires mutual agreement. No mandatory arbitration or waiver of lawful court, regulator or consumer remedies is imposed. Chosen law and venue apply only to the extent permitted by mandatory law.</p>
  <table class="info">
    <tr><td>Client: verification status / verification reference / checked date</td><td>${d.client_name ? 'Verified &#x2014; Filmons identity verification' : DASH}</td></tr>
    <tr><td>Provider: verification status / verification reference / checked date</td><td>${d.provider_name ? 'Verified &#x2014; Filmons identity verification' : DASH}</td></tr>
  </table>
  <div class="sub">Identity record handling</div>
  <p class="clause">Use an internal verification reference or masked identifier only when needed. Do not attach government ID images, full document numbers, birth dates or financial credentials to this shared PDF. Any required identity checks must use a separate secure process with a stated purpose, appropriate notice, access controls and retention limits.</p>
  <table class="info"><tr><td>Schedules / attachments / agreed exceptions</td><td>None</td></tr></table>
  <div class="sub">10. Acceptance and electronic records</div>
  <p class="clause">By signing, each party confirms it reviewed the completed agreement and attached schedules, agrees to the stated terms and, if signing electronically, consents to electronic execution and receiving a downloadable copy. Capture the final agreement version and acceptance timestamps in the booking record. A typed name here is not, by itself, a complete identity or signature audit trail.</p>
  <div class="two">
    <div>
      <div class="sub" style="margin-top:0">Provider signature / printed legal name / date and time</div>
      <div class="field"><div class="fl">Printed legal name</div><div class="fv">${esc(providerName)}</div></div>
      <div class="field"><div class="fl">Signature</div>${sigBox(d.provider_signature, 'Digitally accepted (Filmons platform)')}</div>
      <div class="field"><div class="fl">Date</div><div class="fv">${d.provider_signature ? fmtDate(d.provider_signature.signedAt) : agreedAt}</div></div>
    </div>
    <div>
      <div class="sub" style="margin-top:0">Client signature / printed legal name / date and time</div>
      <div class="field"><div class="fl">Printed legal name</div><div class="fv">${esc(clientName)}</div></div>
      <div class="field"><div class="fl">Signature</div>${sigBox(d.client_signature, 'Digitally accepted and funded (Filmons platform)')}</div>
      <div class="field"><div class="fl">Date</div><div class="fv">${d.client_signature ? fmtDate(d.client_signature.signedAt) : agreedAt}</div></div>
    </div>
  </div>
  <table class="info" style="margin-top:14px;border:2px solid #e5e7eb">
    <tr><td colspan="4" style="background:#f8fafc;font-weight:700;font-size:9px;letter-spacing:.5px;text-transform:uppercase;color:#374151">For Platform Use Only</td></tr>
    <tr><td>Agreement Ref</td><td>${ref}</td><td>Hire Request ID</td><td>${esc(h.id)}</td></tr>
    <tr><td>Payment Status</td><td>${esc(t?.payment_status || DASH)}</td><td>Work Status</td><td>${esc(t?.work_status || DASH)}</td></tr>
  </table>
</div>

<div class="footer">
  This document is generated by Filmons. For support, visit filmons.com or email gabriel@filmons.app.<br/>
  Agreement Ref: ${ref} &nbsp;&#xB7;&nbsp; Based on the FILMONS Service Agreement template &#x2014; version 1.0 &#x2014; ${new Date().getFullYear()}
</div>

</body></html>`;
}

/** Loads both parties (legal names) + the transaction and builds the document. */
export async function generateServiceAgreement(hire: HireRequestRow, txn?: HireTransactionRow | null): Promise<string> {
  const profile = (id: string) =>
    Promise.resolve(supabase.from('profiles').select('name, email, username').eq('id', id).maybeSingle()).then(r => r.data).catch(() => null);

  const [clientProfile, providerProfile, txnRow] = await Promise.all([
    withTimeout(profile(hire.requester_id), 3500, null),
    withTimeout(profile(hire.host_id), 3500, null),
    txn !== undefined ? Promise.resolve(txn) : withTimeout(
      Promise.resolve(supabase.from('hire_transactions').select('*').eq('hire_request_id', hire.id).maybeSingle())
        .then(r => r.data as HireTransactionRow | null).catch(() => null), 3500, null),
  ]);
  const [clientName, providerName] = await Promise.all([
    fetchLegalName(hire.requester_id, clientProfile?.name),
    fetchLegalName(hire.host_id, providerProfile?.name),
  ]);

  const sigs: any[] = await withTimeout(
    Promise.resolve(supabase.from('service_agreement_signatures').select('*').eq('hire_request_id', hire.id))
      .then(r => r.data || []).catch(() => []), 3500, []);
  const toSig = async (row: any): Promise<PartySignature | undefined> => {
    if (!row) return undefined;
    let dataUrl: string | undefined;
    const url = await withTimeout(signRentalDoc(row.signature_path, 300), 3000, null);
    if (url) {
      try {
        const blob = await (await fetch(url)).blob();
        dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(blob); });
      } catch { /* best-effort: document still renders without the image */ }
    }
    return { name: `${row.legal_first_name} ${row.legal_last_name}`.trim(), dataUrl, signedAt: row.signed_at };
  };
  const [clientSig, providerSig] = await Promise.all([
    toSig(sigs.find(x => x.user_id === hire.requester_id)),
    toSig(sigs.find(x => x.user_id === hire.host_id)),
  ]);

  return buildServiceAgreementHTML({
    hire, txn: txnRow,
    client_signature: clientSig, provider_signature: providerSig,
    client_name: clientSig?.name || clientName, client_email: clientProfile?.email, client_username: clientProfile?.username,
    provider_name: providerSig?.name || providerName, provider_email: providerProfile?.email, provider_username: providerProfile?.username,
  });
}
