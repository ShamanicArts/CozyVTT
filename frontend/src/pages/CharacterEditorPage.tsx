// ============================================
// Character Editor Page
// Allows editing characters for any game system
// ============================================

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertCircle, Loader2, Lock, Download } from "lucide-react";
import CharacterSheetSkeleton from "@/components/skeletons/CharacterSheetSkeleton";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import characterService from "@/services/character.service";
import campaignService from "@/services/campaign.service";
import { CharacterSheetRouter } from "@/components/character-sheets/CharacterSheetRouter";
import type { Character, Campaign } from "@/types";
import Button from "@/components/ui/Button";

export default function CharacterEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  // State
  const [character, setCharacter] = useState<Character | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<number | null>(null);
  const pendingDataRef = useRef<any>(null);

  // ============================================
  // Fetch Character & Check Permissions
  // ============================================

  useEffect(() => {
    if (!id || !user) return;

    const fetchCharacter = async () => {
      try {
        setLoading(true);
        setError(null);
        setPermissionError(null);

        // Fetch character
        const fetchedCharacter = await characterService.getCharacter(id);
        setCharacter(fetchedCharacter);

        // Check permissions
        const canEdit = await checkEditPermission(fetchedCharacter);
        if (!canEdit) {
          setPermissionError(
            "You do not have permission to edit this character. Only the owner or the DM of the assigned campaign can edit characters.",
          );
          return;
        }

        // Fetch campaign if character is assigned
        if (fetchedCharacter.campaignId) {
          try {
            const fetchedCampaign = await campaignService.getCampaign(
              fetchedCharacter.campaignId,
            );
            setCampaign(fetchedCampaign);
          } catch (err) {
            console.warn("Failed to fetch campaign:", err);
            // Not critical - continue without campaign data
          }
        }
      } catch (err: any) {
        console.error("Failed to fetch character:", err);
        setError(err.message || "Failed to load character");
      } finally {
        setLoading(false);
      }
    };

    fetchCharacter();
  }, [id, user]);

  // ============================================
  // Permission Check
  // ============================================

  const checkEditPermission = async (char: Character): Promise<boolean> => {
    if (!user) return false;

    // User owns the character
    if (char.userId === user.id) {
      return true;
    }

    // Character is assigned to a campaign - check if user is the DM
    if (char.campaignId) {
      try {
        const camp = await campaignService.getCampaign(char.campaignId);
        if (camp.ownerId === user.id) {
          return true;
        }
      } catch (err) {
        console.error("Failed to check campaign permission:", err);
      }
    }

    return false;
  };

  // ============================================
  // Save Handler
  // ============================================

  const handleSave = useCallback(
    async (data: any, doShowToast = true, tokenImageUrl?: string) => {
      if (!character) return;

      try {
        setSaving(true);

        // Update character via API
        // Use the new tokenImageUrl if provided, otherwise keep the existing one
        const updated = await characterService.updateCharacter(character.id, {
          name: character.name,
          data,
          tokenImageUrl:
            tokenImageUrl !== undefined
              ? tokenImageUrl
              : character.tokenImageUrl || undefined,
        });

        // Update local state
        setCharacter(updated);
        setHasUnsavedChanges(false);
        setLastSaved(new Date());
        pendingDataRef.current = null;

        if (doShowToast) {
          showToast("Character saved!", "success");
        }
      } catch (err: any) {
        console.error("Failed to save character:", err);
        console.error("Error response:", err.response?.data);

        // Show detailed validation errors if available
        if (err.response?.data?.validationErrors) {
          const validationErrors = err.response.data.validationErrors;
          const errorMessages = validationErrors
            .map((e: any) => `${e.path}: ${e.message}`)
            .join("\n");
          setError(`Validation errors:\n${errorMessages}`);
          console.error("Validation errors:", validationErrors);
        } else {
          setError(
            err.response?.data?.message ||
              err.message ||
              "Failed to save character",
          );
        }
      } finally {
        setSaving(false);
      }
    },
    [character],
  );

  // ============================================
  // Character Sheet Save Handler (called by bottom save button)
  // ============================================

  const handleSheetSave = useCallback(
    async (data: any, showToast?: boolean, tokenImageUrl?: string) => {
      // Log the data being saved for debugging
      console.log("Saving character data:", data);

      // Save immediately when user clicks save in character sheet
      // Pass tokenImageUrl through so token images are persisted
      await handleSave(data, showToast ?? true, tokenImageUrl);

      // Store for top save button reference
      pendingDataRef.current = data;
    },
    [handleSave],
  );

  // ============================================
  // Cleanup Auto-save Timer
  // ============================================

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // ============================================
  // Unsaved Changes Warning
  // ============================================

  // Warn user before closing/refreshing page
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // ============================================
  // Navigation Handlers
  // ============================================

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setConfirmLeave(true);
      return;
    }
    navigate("/characters");
  };

  const handleCancel = () => {
    handleBack();
  };

  // ============================================
  // Render
  // ============================================

  // Loading state — full-page skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <CharacterSheetSkeleton />
      </div>
    );
  }

  // Error state
  if (error || !character) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
        <div className="w-full max-w-md rounded-cozy border border-danger/20 bg-surface-light p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-8 w-8 text-danger" />
          <h2 className="mb-2 text-xl font-semibold text-ink">
            Failed to load character
          </h2>
          <p className="mb-5 text-sm text-ink-secondary">
            {error || "Character not found"}
          </p>
          <Button onClick={() => navigate("/characters")}>
            Back to characters
          </Button>
        </div>
      </div>
    );
  }

  // Permission denied state
  if (permissionError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas p-4">
        <div className="w-full max-w-md rounded-cozy border border-warm-amber/20 bg-surface-light p-6 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-warm-amber" />
          <h2 className="mb-2 text-xl font-semibold text-ink">
            Permission denied
          </h2>
          <p className="mb-5 text-sm text-ink-secondary">{permissionError}</p>
          <Button onClick={() => navigate("/characters")}>
            Back to characters
          </Button>
        </div>
      </div>
    );
  }

  // Main editor
  return (
    <>
      <ConfirmDialog
        isOpen={confirmLeave}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to leave? Your changes will be lost."
        confirmLabel="Leave"
        cancelLabel="Stay"
        variant="warning"
        onConfirm={() => navigate("/characters")}
        onCancel={() => setConfirmLeave(false)}
      />
      <div className="min-h-screen bg-canvas text-ink">
        <header className="sticky top-0 z-40 border-b border-brand/15 bg-surface-light">
          <div className="mx-auto flex min-h-14 max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={handleBack}
                className="flex h-11 w-11 flex-none items-center justify-center rounded-cozy text-ink-secondary transition-colors hover:bg-surface hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                aria-label="Back to characters"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold text-ink sm:text-base">
                  {character.name}
                </h1>
                {campaign && (
                  <p className="truncate text-[11px] text-ink-muted">
                    {campaign.name}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {saving && (
                <span className="flex items-center gap-1.5 text-xs text-brand">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </span>
              )}
              {lastSaved && !hasUnsavedChanges && (
                <span className="hidden text-xs text-ink-muted lg:inline">
                  Saved{" "}
                  {lastSaved.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}

              <Button
                onClick={() => characterService.exportCharacterJSON(character)}
                variant="ghost"
                size="sm"
                iconOnly
                title="Export character as JSON"
                aria-label="Export character as JSON"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-2 py-3 sm:px-4 sm:py-5">
          <CharacterSheetRouter
            character={character}
            mode="edit"
            onSave={handleSheetSave}
            onCancel={handleCancel}
          />
        </main>
      </div>
    </>
  );
}
