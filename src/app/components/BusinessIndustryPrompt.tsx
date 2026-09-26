// Shown app-wide (see Root.tsx, next to SubscriptionDowngradeBanner) for a
// Business account with no Business Industry set yet -- once after
// login/mount, then re-checked periodically (not on every route change,
// since this component itself never unmounts across navigation) so it
// re-appears roughly every ~6h until the field is completed. "Not now" and
// closing the panel both just persist the cooldown timestamp; saving a
// valid industry clears `missing` and this stops rendering for good unless
// the field is emptied again later.
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { normalizeTier } from '../lib/reliabilityApi';
import { EditProfileFieldPanel } from './EditProfileFieldPanel';
import { BusinessIndustryList } from './BusinessIndustryPicker';

const COOLDOWN_MS = 6 * 60 * 60 * 1000;
// Re-evaluates the cooldown periodically while the app stays open -- this
// is a check interval, not the cooldown itself, so it can be much shorter
// without re-showing the prompt any more often than COOLDOWN_MS allows.
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

function isDue(lastPromptAt?: string): boolean {
  if (!lastPromptAt) return true;
  return Date.now() - new Date(lastPromptAt).getTime() > COOLDOWN_MS;
}

export function BusinessIndustryPrompt() {
  const { user, setUserDirectly } = useAuth();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);

  const missing = normalizeTier(user?.accountType) === 'business' && !user?.businessIndustry;

  useEffect(() => {
    if (!missing) { setOpen(false); return; }
    const check = () => setOpen(isDue(user?.lastBusinessIndustryPromptAt));
    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, user?.id, user?.lastBusinessIndustryPromptAt]);

  if (!open || !user) return null;

  const persistPromptTimestamp = async () => {
    const now = new Date().toISOString();
    setUserDirectly({ ...user, lastBusinessIndustryPromptAt: now });
    await supabase.from('profiles').update({ last_business_industry_prompt_at: now }).eq('id', user.id);
  };

  const notNow = () => {
    setOpen(false);
    persistPromptTimestamp();
  };

  const save = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setUserDirectly({ ...user, businessIndustry: selected });
    await supabase.from('profiles').update({ business_industry: selected }).eq('id', user.id);
    setSaving(false);
    setOpen(false);
  };

  return (
    <EditProfileFieldPanel
      title="Business Industry"
      onClose={notNow}
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          <button onClick={notNow} className="text-sm font-semibold text-gray-500 hover:text-gray-700 transition-colors">
            Not now
          </button>
          <button
            onClick={save}
            disabled={!selected || saving}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors disabled:opacity-40"
          >
            Save & continue
          </button>
        </div>
      }
    >
      <div className="px-4 pt-4 pb-2">
        <p className="text-base font-black text-gray-900">What sector is your business in?</p>
        <p className="text-sm text-gray-500 mt-1">Choose the industry that best describes your business on FILMONS.</p>
      </div>
      <BusinessIndustryList value={selected} onSelect={setSelected} />
    </EditProfileFieldPanel>
  );
}
