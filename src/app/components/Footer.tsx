import { Link } from 'react-router';
import { FilmonsLogo } from './FilmonsLogo';

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-100 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link to="/"><FilmonsLogo iconSize={24} theme="light"/></Link>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">
              Canada's film gear & creative services marketplace.
            </p>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Platform</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/marketplace" className="text-gray-600 hover:text-blue-600 transition-colors">Marketplace</Link></li>
              <li><Link to="/feed" className="text-gray-600 hover:text-blue-600 transition-colors">Feed</Link></li>
              <li><Link to="/create-listing" className="text-gray-600 hover:text-blue-600 transition-colors">List your gear</Link></li>
              <li><Link to="/wallet" className="text-gray-600 hover:text-blue-600 transition-colors">FP Wallet</Link></li>
            </ul>
          </div>

          {/* Account */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Account</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/login" className="text-gray-600 hover:text-blue-600 transition-colors">Sign in</Link></li>
              <li><Link to="/phone-signup" className="text-gray-600 hover:text-blue-600 transition-colors">Create account</Link></li>
              <li><Link to="/verification" className="text-gray-600 hover:text-blue-600 transition-colors">Get verified</Link></li>
              <li><Link to="/dashboard" className="text-gray-600 hover:text-blue-600 transition-colors">Dashboard</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/refund-policy" className="text-gray-600 hover:text-blue-600 transition-colors">Refund Policy</Link></li>
              <li><Link to="/privacy-policy" className="text-gray-600 hover:text-blue-600 transition-colors">Privacy Policy</Link></li>
              <li><Link to="/terms-conditions" className="text-gray-600 hover:text-blue-600 transition-colors">Terms & Conditions</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-gray-400">
          <span>© 2026 FILMONS. All rights reserved.</span>
          <span className="text-xs">Made for Canadian filmmakers 🎬</span>
        </div>
      </div>
    </footer>
  );
}