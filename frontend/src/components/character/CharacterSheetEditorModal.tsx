import { asError } from "@/utils/errors";
/**
 * Character Sheet Editor Modal
 */

import { useState } from 'react';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/services/api';
import type { Character } from '@/types';
import ConfirmDialog from '@/components/common/ConfirmDialog';

// Import editor components
import { CharacterSheetRouter } from '../character-sheets/CharacterSheetRouter';

interface CharacterSheetEditorModalProps {
  character: Character;
  onClose: () => void;
  onSaved?: () => void; // Optional callback after save
}

export default function CharacterSheetEditorModal({
  character,
  onClose,
  onSaved,
}: CharacterSheetEditorModalProps) {
  const [saving, setSaving] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const { showToast } = useToast();

  // Handle save. The editors pass a freshly-uploaded token image URL as the
  // third argument — forward it so the character's token actually updates.
  // (Omit it when undefined so an edit that didn't touch the token keeps the
  // existing image.)
  const handleSave = async (data: unknown, _showToast?: boolean, tokenImageUrl?: string) => {
    try {
      setSaving(true);
      await api.updateCharacter(character.id, {
        data,
        ...(tokenImageUrl !== undefined ? { tokenImageUrl } : {}),
      });

      // Call optional callback
      if (onSaved) {
        onSaved();
      }

      // Close modal
      onClose();
    } catch (_caught) {
      const error = asError(_caught);
      console.error('Error saving character:', error);

      // Show detailed error message
      const errorMessage = error.response?.data?.message || 'Failed to save character. Please try again.';
      const validationErrors = error.response?.data?.validationErrors;

      if (validationErrors) {
        console.error('Validation errors:', validationErrors);
        showToast(`Validation Error: ${errorMessage}`, 'error');
      } else {
        showToast(errorMessage, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    setConfirmClose(true);
  };

  const modalRef = useFocusTrap(true, onClose);

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" aria-hidden="true">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-sheet-editor-title"
        className="bg-soft-cream border-2 border-moss-green/30 rounded-xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col"
      >
        {/* Close Button */}
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={handleCancel}
            aria-label="Close dialog"
            className="p-2 rounded-lg bg-soft-cream/90 hover:bg-stone-gray/10 transition-colors border border-moss-green/20"
            disabled={saving}
          >
            <X className="w-5 h-5 text-stone-gray" />
          </button>
        </div>

        {/* Visually hidden title for accessibility */}
        <h2 id="character-sheet-editor-title" className="sr-only">
          Edit Character Sheet: {character.name}
        </h2>

        {/* Editor Content */}
        <div className="flex-1 overflow-y-auto">
          <CharacterSheetRouter
            character={character}
            mode="edit"
            onSave={handleSave}
            onCancel={handleCancel}
          />
        </div>
      </div>
    </div>
    {/* ConfirmDialog must be rendered AFTER the modal overlay so it appears
        on top at the same z-50 stacking level (later DOM = visually on top). */}
    <ConfirmDialog
      isOpen={confirmClose}
      title="Discard Changes?"
      message="Are you sure you want to cancel? Any unsaved changes will be lost."
      confirmLabel="Discard"
      cancelLabel="Keep Editing"
      variant="warning"
      onConfirm={onClose}
      onCancel={() => setConfirmClose(false)}
    />
    </>
  );
}
