import { useState, useSyncExternalStore } from "react";
import { Box, Loader2, Map as MapIcon } from "lucide-react";
import Button from "@/components/ui/Button";
import { api } from "@/services/api";
import type { PresentationRegistry } from "@/presentations";

const CORE_MAP_2D_PRESENTATION_ID = "cozyvtt.core.map-2d";

export function PresentationSelector({
  campaignId,
  activePresentationId,
  registry,
  onChanged,
}: {
  readonly campaignId: string;
  readonly activePresentationId: string;
  readonly registry: PresentationRegistry;
  readonly onChanged: (presentationId: string) => void;
}) {
  useSyncExternalStore(
    registry.subscribe,
    registry.getRevision,
    registry.getRevision,
  );
  const [saving, setSaving] = useState(false);
  const contributions = registry.list();
  const selectedAvailable = contributions.some(
    ({ id }) => id === activePresentationId,
  );

  const select = async (presentationId: string) => {
    if (presentationId === activePresentationId) return;
    setSaving(true);
    try {
      const result = await api.setCampaignPresentation(
        campaignId,
        presentationId,
      );
      onChanged(result.activePresentationId);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-1" role="group" aria-label="Map view">
      {contributions.map((contribution) => {
        const selected =
          selectedAvailable && contribution.id === activePresentationId;
        const Icon =
          contribution.id === CORE_MAP_2D_PRESENTATION_ID ? MapIcon : Box;
        return (
          <Button
            key={contribution.id}
            variant="secondary"
            className={`min-h-11 min-w-11 p-2 sm:min-h-9 sm:min-w-9 ${selected ? "bg-moss-green/20 text-moss-green" : ""}`}
            title={contribution.title}
            aria-label={contribution.title}
            aria-pressed={selected}
            disabled={saving}
            onClick={() => void select(contribution.id)}
          >
            {saving && selected ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Icon className="h-4 w-4" aria-hidden="true" />
            )}
          </Button>
        );
      })}
    </div>
  );
}
