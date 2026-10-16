/**
 * generateServiceAgreement.ts
 * Service Agreement document for funded hire requests. Built on the same
 * template/CSS as the equipment Rental Agreement (see generatePDF.ts) and,
 * like it, shows each party's LEGAL name from identity verification.
 */

import { supabase } from '../../lib/supabase';
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
}

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
  const links = (h.reference_links || []).filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/>
<title>Filmons Service Agreement &#x2014; ${ref}</title>
<style>${BASE_CSS}</style>
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
  <div class="sec-title">Section 1 &#x2014; Parties</div>
  <div class="sub">1.1 Service Provider (Hired Creator)</div>
  <div class="two">
    <div class="field"><div class="fl">Full Legal Name</div><div class="fv">${esc(providerName)}</div></div>
    <div class="field"><div class="fl">Filmons Username</div><div class="fv">${d.provider_username ? '@' + esc(d.provider_username) : DASH}</div></div>
    <div class="field"><div class="fl">Email Address</div><div class="fv">${esc(d.provider_email) || DASH}</div></div>
  </div>
  <div class="sub">1.2 Client (Hiring Party)</div>
  <div class="two">
    <div class="field"><div class="fl">Full Legal Name</div><div class="fv">${esc(clientName)}</div></div>
    <div class="field"><div class="fl">Filmons Username</div><div class="fv">${d.client_username ? '@' + esc(d.client_username) : DASH}</div></div>
    <div class="field"><div class="fl">Email Address</div><div class="fv">${esc(d.client_email) || DASH}</div></div>
  </div>
  <div class="note">Names shown are the legal names each party provided during Filmons identity verification.</div>
</div>

<div class="sec">
  <div class="sec-title">Section 2 &#x2014; Scope of Services</div>
  <table class="info">
    <tr><td>Project Title</td><td colspan="3"><strong>${esc(h.project_title)}</strong></td></tr>
    <tr><td>Service</td><td colspan="3">${esc(h.service_label)}${h.is_custom ? ' (custom request)' : ''}</td></tr>
    <tr><td>Description of Work</td><td colspan="3" style="white-space:pre-wrap">${esc(h.description) || DASH}</td></tr>
    <tr><td>Work Arrangement</td><td>${workType}</td><td>Location</td><td>${location}</td></tr>
    <tr><td>Schedule</td><td>${schedule}</td><td>Time</td><td>${times}</td></tr>
    ${links.length ? `<tr><td>Reference Links</td><td colspan="3">${links.map(l => esc(l)).join('<br/>')}</td></tr>` : ''}
  </table>
  <div class="note">Any change to scope, schedule or price must be agreed by both parties through Filmons messaging. Work outside the scope above is not covered by this Agreement.</div>
</div>

<div class="sec">
  <div class="sec-title">Section 3 &#x2014; Compensation &amp; Payment</div>
  <table class="info">
    <tr><td>Pricing Basis</td><td>${rateUnit}</td><td>Agreed Amount</td><td>${money(h.budget_amount, cur)}</td></tr>
    <tr><td>Total Paid by Client</td><td>${money(gross, cur)}</td><td>Filmons Fee${t ? ` (${(t.fee_rate * 100).toFixed(0)}%)` : ''}</td><td>${t ? money(t.fee_amount, cur) : DASH}</td></tr>
    <tr><td style="font-weight:800">Provider Net Earnings</td><td style="font-weight:800;color:#1e3a5f" colspan="3">${t ? money(t.net_amount, cur) : DASH}</td></tr>
    ${t && t.initial_release_amount != null ? `<tr><td>Released on Start</td><td>${money(t.initial_release_amount, cur)}</td><td>Held Until Completion</td><td>${money(t.held_amount, cur)}</td></tr>` : ''}
  </table>
  <div class="note">The Client's payment is collected by Filmons at booking and held in escrow. The portion held is released to the Provider once the Client confirms the work is complete. If the Client reports a problem, held funds are frozen while Filmons reviews the dispute.</div>
</div>

<div class="sec pgbreak">
  <div class="sec-title">Section 4 &#x2014; Delivery &amp; Completion</div>
  <table class="info">
    <tr><td>Completion</td><td>The Provider marks the work complete on Filmons; the Client then confirms completion or reports a problem.</td></tr>
    <tr><td>Deliverables</td><td>As described in Section 2. Files and revisions are exchanged through Filmons messaging.</td></tr>
    <tr><td>Problem Reports</td><td>A Client who reports a problem freezes the held funds. Filmons mediates and may release, refund or split the held amount.</td></tr>
  </table>
</div>

<div class="sec">
  <div class="sec-title">Section 5 &#x2014; Cancellation &amp; Refunds</div>
  <table class="data">
    <tr><th>Situation</th><th>Outcome</th></tr>
    <tr><td>Request cancelled before the Provider accepts terms</td><td>No charge.</td></tr>
    <tr><td>Cancelled after payment, before work starts</td><td>Handled by Filmons support; refund of the amount held, less any non-refundable processing costs.</td></tr>
    <tr><td>Cancelled after work has started</td><td>Funds already released remain with the Provider; held funds are resolved by Filmons mediation.</td></tr>
    <tr><td>Provider no-show / non-delivery</td><td>Client is refunded the amount held.</td></tr>
  </table>
</div>

<div class="sec">
  <div class="sec-title">Section 6 &#x2014; General Terms</div>
  <table class="info">
    <tr><td>Independent Contractor</td><td>The Provider is an independent contractor, not an employee, partner or agent of the Client or Filmons. The Provider is responsible for their own taxes, insurance, tools and permits.</td></tr>
    <tr><td>Intellectual Property</td><td>Unless the parties agree otherwise in writing, ownership of the finished work transfers to the Client upon full payment; the Provider may show the work in their portfolio.</td></tr>
    <tr><td>Confidentiality</td><td>Each party will keep the other's non-public project information confidential.</td></tr>
    <tr><td>Filmons' Role</td><td>Marketplace facilitator and payment escrow only. Filmons is not a party to the services and does not guarantee their quality.</td></tr>
    <tr><td>Governing Law</td><td>Province of British Columbia, Canada, and applicable federal laws.</td></tr>
    <tr><td>Dispute Resolution</td><td>Filmons mediation first, then BCICAC binding arbitration. Class actions waived.</td></tr>
    <tr><td>Entire Agreement</td><td>This Agreement together with the Filmons Terms of Service is the entire agreement between the parties.</td></tr>
  </table>
</div>

<div class="sec">
  <div class="sec-title">Section 7 &#x2014; Acknowledgement</div>
  <p style="font-size:9.5px;color:#374151;margin-bottom:14px;line-height:1.6">Both parties accepted the terms above digitally on the Filmons platform: the Provider by accepting the offer, and the Client by accepting and funding the engagement.</p>
  <div class="two">
    <div>
      <div class="sub" style="margin-top:0">SERVICE PROVIDER</div>
      <div class="field"><div class="fl">Full Name</div><div class="fv">${esc(providerName)}</div></div>
      <div class="field"><div class="fl">Acceptance</div><div class="sig-box"><div class="sig-line">Digitally accepted (Filmons platform)</div></div></div>
      <div class="field"><div class="fl">Date</div><div class="fv">${agreedAt}</div></div>
    </div>
    <div>
      <div class="sub" style="margin-top:0">CLIENT</div>
      <div class="field"><div class="fl">Full Name</div><div class="fv">${esc(clientName)}</div></div>
      <div class="field"><div class="fl">Acceptance</div><div class="sig-box"><div class="sig-line">Digitally accepted and funded (Filmons platform)</div></div></div>
      <div class="field"><div class="fl">Date</div><div class="fv">${agreedAt}</div></div>
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
  Agreement Ref: ${ref} &nbsp;&#xB7;&nbsp; Version 1.0 &#x2014; ${new Date().getFullYear()}
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

  return buildServiceAgreementHTML({
    hire, txn: txnRow,
    client_name: clientName, client_email: clientProfile?.email, client_username: clientProfile?.username,
    provider_name: providerName, provider_email: providerProfile?.email, provider_username: providerProfile?.username,
  });
}
