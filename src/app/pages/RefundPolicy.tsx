export function RefundPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold mb-8">Refund Policy</h1>
      
      <div className="prose prose-gray max-w-none">
        <p className="text-gray-600 mb-6">
          Last updated: April 2, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Overview</h2>
          <p className="text-gray-700 mb-4">
            Filmons is a marketplace platform that connects equipment owners with renters. As we do not directly handle transactions or rental agreements, refund policies are managed between the parties involved in each rental.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Marketplace Platform</h2>
          <p className="text-gray-700 mb-4">
            Filmons acts as a listing platform only. We do not:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Process payments</li>
            <li>Handle equipment delivery</li>
            <li>Manage rental agreements</li>
            <li>Store payment information</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Rental Agreements</h2>
          <p className="text-gray-700 mb-4">
            All rental terms, including cancellation and refund policies, are agreed upon directly between the equipment owner and the renter. We recommend that both parties:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Clearly discuss cancellation policies before confirming a rental</li>
            <li>Document agreements in writing</li>
            <li>Agree on payment methods and refund terms</li>
            <li>Inspect equipment before and after rental</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Dispute Resolution</h2>
          <p className="text-gray-700 mb-4">
            In case of disputes regarding refunds or rental terms, we encourage users to:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Communicate directly with the other party</li>
            <li>Keep records of all communications</li>
            <li>Refer to your agreed-upon rental terms</li>
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
