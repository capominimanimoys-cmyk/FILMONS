export function RefundPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold mb-8">Refund Policy</h1>

      <div className="prose prose-gray max-w-none">
        <p className="text-gray-600 mb-6">
          Last updated: August 13, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Overview</h2>
          <p className="text-gray-700 mb-4">
            Filmons is a marketplace platform that connects equipment owners with renters. Payments for bookings made through Filmons are processed by us via Stripe, and a Filmons Fee is charged on top of the listing price (see our Fee Disclosure). Because Filmons processes these payments directly, refund requests for bookings paid through the platform are also handled through Filmons, as described below — rather than being a matter purely between the two parties.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">How Payments Work</h2>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Card payments are processed through Stripe at checkout.</li>
            <li>Funds are held as pending earnings in the equipment owner's Filmons wallet and become available roughly 48 hours after the rental period ends.</li>
            <li>Filmons does not calculate, display, or manage taxes in its pricing — Stripe handles any applicable tax separately.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Requesting a Refund</h2>
          <p className="text-gray-700 mb-4">
            If you paid for a booking through Filmons, you can request a refund or cancellation from your Orders page. This submits a request for review by our team — it is not processed automatically.
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Approved refunds for card payments are returned to your original payment method via Stripe.</li>
            <li>Approved refunds for other payment methods are reflected as a balance adjustment; Filmons is not responsible for reversing funds that were exchanged directly between parties outside the platform.</li>
            <li>If a booking is marked disputed while under review, the equipment owner's pending earnings for that booking are held and will not automatically release until the dispute is resolved.</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Rental Agreements</h2>
          <p className="text-gray-700 mb-4">
            Beyond payment and refunds, rental logistics — equipment condition, delivery/pickup, and any additional terms — remain between the equipment owner and the renter. We recommend that both parties:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Clearly discuss expectations before confirming a rental</li>
            <li>Document agreements in writing</li>
            <li>Inspect equipment before and after rental</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Dispute Resolution</h2>
          <p className="text-gray-700 mb-4">
            In case of disputes regarding a rental, we encourage users to:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Communicate directly with the other party first</li>
            <li>Keep records of all communications</li>
            <li>Contact Filmons if a resolution can't be reached — we can place a hold on the related payout while the dispute is reviewed</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
          <p className="text-gray-700">
            If you have questions about this refund policy, please contact us through the platform.
          </p>
        </section>
      </div>
    </div>
  );
}
