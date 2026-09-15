import { useState } from 'react';
import { toast } from 'sonner';
import { BottomSheet } from '../BottomSheet';
import { createOrUpdateRecommendation } from '../../lib/recommendationsApi';

export function RecommendationComposeSheet({
  recommenderId, recommenderRole, recipientId, recipientName, existingBody, existingRelationship, onClose, onSaved,
}: {
  recommenderId: string;
  recommenderRole?: string;
  recipientId: string;
  recipientName: string;
  existingBody?: string;
  existingRelationship?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [relationship, setRelationship] = useState(existingRelationship ?? '');
  const [body, setBody] = useState(existingBody ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = body.trim();
    if (!trimmed) { toast.error('Write a short recommendation first'); return; }
    setSaving(true);
    const ok = await createOrUpdateRecommendation({
      recommenderId, recipientId, roleSnapshot: recommenderRole, relationship: relationship.trim() || undefined, body: trimmed,
    });
    setSaving(false);
    if (!ok) { toast.error('Could not save your recommendation'); return; }
    toast.success('Recommendation posted');
    onSaved();
    onClose();
  };

  return (
    <BottomSheet title={`Recommend ${recipientName}`} onClose={onClose}>
      <div className="px-4 pb-4 space-y-3">
        <div>
          <label className="text-xs font-bold text-gray-500">How do you know {recipientName}? (optional)</label>
          <input
            value={relationship} onChange={e => setRelationship(e.target.value)}
            placeholder="e.g. Worked together on a music video shoot"
            className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-400"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500">Your recommendation</label>
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder={`Share what it's like working with ${recipientName}...`}
            rows={5}
            className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-400 resize-none"
          />
        </div>
        <button
          onClick={submit} disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50"
        >
          {saving ? 'Posting…' : 'Post Recommendation'}
        </button>
      </div>
    </BottomSheet>
  );
}
