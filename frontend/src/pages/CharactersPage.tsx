// ============================================
// Characters Page
// Character library management for players
// ============================================

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { Plus, LogOut, Loader2, RefreshCw, Upload } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import characterService from "@/services/character.service";
import {
  useCampaignsQuery,
  useCharactersQuery,
  queryKeys,
} from "@/hooks/queries";
import CharacterCard from "@/components/character/CharacterCard";
import NewCharacterModal from "@/components/character/NewCharacterModal";
import DeleteCharacterModal from "@/components/character/DeleteCharacterModal";
import AssignCharacterModal from "@/components/character/AssignCharacterModal";
import ImportCharacterModal from "@/components/character/ImportCharacterModal";
import EmptyState from "@/components/common/EmptyState";
import type { Character, Campaign } from "@/types";
import Button from "@/components/ui/Button";

export default function CharactersPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { mascotUrl } = useTheme();

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(
    null,
  );

  // Server resources via react-query (shared cache with DashboardPage)
  const queryClient = useQueryClient();
  const charactersQuery = useCharactersQuery();
  const campaignsQuery = useCampaignsQuery();

  const characters = charactersQuery.data ?? [];
  const campaigns = campaignsQuery.data ?? [];
  const loading = charactersQuery.isPending || campaignsQuery.isPending;
  const queryError = charactersQuery.error || campaignsQuery.error;
  const error = queryError
    ? (queryError as any).response?.data?.message || "Failed to load characters"
    : "";

  const loadData = () => {
    charactersQuery.refetch();
    campaignsQuery.refetch();
  };

  // Local cache mutations mirror the previous setState behavior
  const setCharactersData = (updater: (prev: Character[]) => Character[]) => {
    queryClient.setQueryData<Character[]>(queryKeys.characters, (prev) =>
      updater(prev ?? []),
    );
  };

  const handleCharacterCreated = (newCharacter: Character) => {
    setCharactersData((prev) => [newCharacter, ...prev]);
    showSuccess("Character created successfully!");
    // Note: For now we just close the modal.
  };

  const handleEdit = (character: Character) => {
    navigate(`/characters/${character.id}/edit`);
  };

  const handleCopy = async (character: Character) => {
    try {
      const copiedCharacter = await characterService.copyCharacter(
        character.id,
      );
      setCharactersData((prev) => [copiedCharacter, ...prev]);
      showSuccess(`${character.name} copied successfully`);
    } catch (err: any) {
      showToast(
        err.response?.data?.message || "Failed to copy character",
        "error",
      );
    }
  };

  const handleDeleteClick = (character: Character) => {
    setSelectedCharacter(character);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async (characterId: string) => {
    // Errors propagate to the modal, which handles the display
    await characterService.deleteCharacter(characterId);
    setCharactersData((prev) => prev.filter((c) => c.id !== characterId));
    showSuccess("Character deleted successfully");
    setShowDeleteModal(false);
    setSelectedCharacter(null);
  };

  const handleAssignClick = (character: Character) => {
    setSelectedCharacter(character);
    setShowAssignModal(true);
  };

  const handleAssignConfirm = async (
    characterId: string,
    campaignId: string | null,
  ) => {
    // Errors propagate to the modal, which handles the display
    let updatedCharacter: Character;

    if (campaignId) {
      updatedCharacter = await characterService.assignCharacter(
        characterId,
        campaignId,
      );
      const campaign = campaigns.find((c) => c.id === campaignId);
      showSuccess(`Assigned to ${campaign?.name || "campaign"}`);
    } else {
      updatedCharacter = await characterService.unassignCharacter(characterId);
      showSuccess("Character unassigned");
    }

    // Update character in list
    setCharactersData((prev) =>
      prev.map((c) => (c.id === characterId ? updatedCharacter : c)),
    );

    setShowAssignModal(false);
    setSelectedCharacter(null);
  };

  const handleExport = (character: Character) => {
    characterService.exportCharacterJSON(character);
    showSuccess(`Exported ${character.name}`);
  };

  const handleImport = async (data: {
    name: string;
    gameSystem: string | null;
    data: any;
  }) => {
    // Errors propagate to the modal, which handles the display
    const importedCharacter = await characterService.createCharacter({
      name: data.name,
      data: data.data,
      gameSystem: data.gameSystem as import("@/types").GameSystem | null,
    });

    setCharactersData((prev) => [importedCharacter, ...prev]);
    showSuccess(`${data.name} imported successfully`);
  };

  const handleLogout = async () => {
    await logout();
  };

  const showSuccess = (message: string) => {
    showToast(message, "success");
  };

  // Get campaign for a character
  const getCharacterCampaign = (character: Character): Campaign | null => {
    if (!character.campaignId) return null;
    return campaigns.find((c) => c.id === character.campaignId) || null;
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-brand/15 bg-surface-light">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex h-11 w-11 flex-none items-center justify-center rounded-cozy transition-colors hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label="Back to dashboard"
            >
              <img src={mascotUrl} alt="" className="h-7 w-7 object-contain" />
            </button>
            <h1 className="truncate text-base font-semibold text-ink">
              Characters
            </h1>
          </div>

          <div className="flex items-center gap-1">
            <Button
              onClick={() => navigate("/dashboard")}
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
              Dashboard
            </Button>
            <Button
              onClick={loadData}
              disabled={loading}
              variant="ghost"
              size="sm"
              iconOnly
              aria-label={
                loading ? "Refreshing characters" : "Refresh characters"
              }
              aria-busy={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
            </Button>
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="Log out of CozyVTT"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-6xl px-3 py-6 sm:px-6 sm:py-8"
      >
        <section>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-xl font-semibold text-ink">
              Your characters
              {!loading && (
                <span className="ml-2 text-sm font-normal text-ink-muted">
                  {characters.length}
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setShowImportModal(true)}
                variant="secondary"
                size="sm"
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import
              </Button>
              <Button
                onClick={() => setShowCreateModal(true)}
                size="sm"
                className="flex items-center gap-2"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                New character
              </Button>
            </div>
          </div>

          {error && (
            <div className="mb-5 rounded-cozy border border-danger/25 bg-danger/5 p-3">
              <p className="text-sm font-medium text-danger">{error}</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="mb-3 h-7 w-7 animate-spin text-brand" />
              <p className="text-sm text-ink-muted">Loading characters…</p>
            </div>
          )}

          {!loading && characters.length === 0 && (
            <EmptyState
              title="No characters yet"
              description="Create a character for a campaign or keep one ready for later."
              action={
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New character
                </Button>
              }
            />
          )}

          {!loading && characters.length > 0 && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {characters.map((character) => (
                <CharacterCard
                  key={character.id}
                  character={character}
                  campaign={getCharacterCampaign(character)}
                  onEdit={handleEdit}
                  onCopy={handleCopy}
                  onDelete={handleDeleteClick}
                  onAssign={handleAssignClick}
                  onExport={handleExport}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <NewCharacterModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCharacterCreated}
      />

      <DeleteCharacterModal
        isOpen={showDeleteModal}
        character={selectedCharacter}
        campaign={
          selectedCharacter ? getCharacterCampaign(selectedCharacter) : null
        }
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedCharacter(null);
        }}
        onConfirm={handleDeleteConfirm}
      />

      <AssignCharacterModal
        isOpen={showAssignModal}
        character={selectedCharacter}
        currentCampaign={
          selectedCharacter ? getCharacterCampaign(selectedCharacter) : null
        }
        onClose={() => {
          setShowAssignModal(false);
          setSelectedCharacter(null);
        }}
        onConfirm={handleAssignConfirm}
      />

      {showImportModal && (
        <ImportCharacterModal
          onClose={() => setShowImportModal(false)}
          onImport={handleImport}
          existingCharacterNames={characters.map((c) => c.name)}
        />
      )}
    </div>
  );
}
