export function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      
      <div className="prose prose-gray max-w-none">
        <p className="text-gray-600 mb-6">
          Last updated: April 2, 2026
        </p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Introduction</h2>
          <p className="text-gray-700 mb-4">
            Welcome to Filmons. We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information when you use our platform.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Information We Collect</h2>
          <p className="text-gray-700 mb-4">We collect information that you provide directly to us:</p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Account information (name, email, password)</li>
            <li>Listing details (equipment descriptions, prices, images)</li>
            <li>Contact preferences (WhatsApp, Instagram, Facebook, Email, Phone)</li>
            <li>Profile information</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">How We Use Your Information</h2>
          <p className="text-gray-700 mb-4">We use the information we collect to:</p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Provide and maintain our services</li>
            <li>Enable communication between users</li>
            <li>Display your listings to potential renters</li>
            <li>Improve and personalize user experience</li>
            <li>Send important updates about the platform</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Data Storage</h2>
          <p className="text-gray-700 mb-4">
            Your data is stored locally in your browser using localStorage. This means:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Data persists on your device only</li>
            <li>Clearing browser data will remove your information</li>
            <li>We do not have access to your locally stored data</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Information Sharing</h2>
          <p className="text-gray-700 mb-4">
            When you create a listing, certain information becomes visible to other users:
          </p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Listing details and images</li>
            <li>Your chosen contact methods</li>
            <li>City/location information</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Third-Party Services</h2>
          <p className="text-gray-700 mb-4">
            When you choose to be contacted via third-party platforms (WhatsApp, Instagram, Facebook), you'll be redirected to those services. Please review their respective privacy policies.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Your Rights</h2>
          <p className="text-gray-700 mb-4">You have the right to:</p>
          <ul className="list-disc pl-6 text-gray-700 mb-4 space-y-2">
            <li>Access your personal information</li>
            <li>Update or delete your account</li>
            <li>Modify your listings</li>
            <li>Choose your contact preferences</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Security</h2>
          <p className="text-gray-700 mb-4">
            We implement reasonable security measures to protect your information. However, no method of transmission over the internet is 100% secure.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Changes to This Policy</h2>
          <p className="text-gray-700 mb-4">
            We may update this privacy policy from time to time. We will notify users of any material changes by updating the "Last updated" date.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Contact Us</h2>
          <p className="text-gray-700">
            If you have questions about this privacy policy, please contact us through the platform.
          </p>
        </section>
      </div>
    </div>
  );
}
