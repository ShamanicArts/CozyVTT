import {
  Grid3x3,
  Ghost,
  Maximize2,
  Palette,
  Ruler,
  Zap,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { useMapControls } from "@/hooks/useMapControls";
import Button from "@/components/ui/Button";
import { useCampaignPresentationSwitcher } from "@/presentations";

type RulerColor = "amber" | "purple" | "black";

interface MapToolbarProps {
  readonly controls: ReturnType<typeof useMapControls>;
  readonly canvasSize: { width: number; height: number };
  readonly hasMap: boolean;
  readonly isDM: boolean;
  readonly showGrid: boolean;
  readonly gridColor: "black" | "white";
  readonly onToggleGrid: () => void;
  readonly onToggleGridColor: () => void;
  readonly showRuler: boolean;
  readonly rulerColor: RulerColor;
  readonly onToggleRuler: () => void;
  readonly onCycleRulerColor: () => void;
  readonly showAoE: boolean;
  readonly onToggleAoE: () => void;
  readonly showSpiritTokens: boolean;
  readonly onToggleSpiritTokens: () => void;
}

/** Display-only campaign map controls. Interaction state remains in MapCanvas. */
export default function MapToolbar({
  controls,
  canvasSize,
  hasMap,
  isDM,
  showGrid,
  gridColor,
  onToggleGrid,
  onToggleGridColor,
  showRuler,
  rulerColor,
  onToggleRuler,
  onCycleRulerColor,
  showAoE,
  onToggleAoE,
  showSpiritTokens,
  onToggleSpiritTokens,
}: MapToolbarProps) {
  const presentationSwitcher = useCampaignPresentationSwitcher();
  return (
    <div className="absolute left-2 top-2 z-30 flex max-w-[calc(100%-1rem)] items-center gap-1 rounded-cozy border border-brand/20 bg-surface-light p-1.5 shadow-lg sm:left-4 sm:top-4 sm:gap-2">
      {presentationSwitcher}
      {presentationSwitcher && (
        <div className="hidden h-6 w-px bg-moss-green/20 sm:block" />
      )}
      <Button
        onClick={controls.zoomOut}
        disabled={controls.zoom <= controls.minZoom}
        variant="secondary"
        className="min-h-11 min-w-11 p-2 sm:min-h-9 sm:min-w-9"
        title="Zoom Out"
        aria-label="Zoom out"
      >
        <ZoomOut className="w-4 h-4" />
      </Button>
      <span className="text-xs text-stone-gray font-mono min-w-[4rem] text-center">
        {Math.round(controls.zoom * 100)}%
      </span>
      <Button
        onClick={controls.zoomIn}
        disabled={controls.zoom >= controls.maxZoom}
        variant="secondary"
        className="min-h-11 min-w-11 p-2 sm:min-h-9 sm:min-w-9"
        title="Zoom In"
        aria-label="Zoom in"
      >
        <ZoomIn className="w-4 h-4" />
      </Button>
      <div className="hidden h-6 w-px bg-moss-green/20 sm:block" />
      <Button
        onClick={() =>
          controls.fitToScreen(canvasSize.width, canvasSize.height)
        }
        variant="secondary"
        className="min-h-11 min-w-11 p-2 sm:min-h-9 sm:min-w-9"
        title="Fit to Screen"
        aria-label="Fit map to screen"
      >
        <Maximize2 className="w-4 h-4" />
      </Button>
      <Button
        onClick={onToggleGrid}
        variant="secondary"
        className={`min-h-11 min-w-11 p-2 sm:min-h-9 sm:min-w-9 ${showGrid ? "bg-moss-green/20" : ""}`}
        title="Toggle Grid"
        aria-label="Toggle grid"
      >
        <Grid3x3 className="w-4 h-4" />
      </Button>
      {showGrid && (
        <Button
          onClick={onToggleGridColor}
          variant="secondary"
          className="hidden min-h-9 min-w-9 p-2 sm:inline-flex"
          title={`Grid Color: ${gridColor === "black" ? "Black" : "White"}`}
          aria-label={`Grid color: ${gridColor}`}
        >
          <Palette className="w-4 h-4" />
        </Button>
      )}
      {hasMap && (
        <>
          <div className="hidden h-6 w-px bg-moss-green/20 sm:block" />
          <Button
            onClick={onToggleRuler}
            variant="secondary"
            className={`hidden min-h-9 min-w-9 p-2 sm:inline-flex ${showRuler ? "bg-moss-green/20" : ""}`}
            title="Ruler — measure distance"
            aria-label="Toggle ruler"
          >
            <Ruler
              className={`w-4 h-4 ${showRuler ? "text-moss-green" : ""}`}
            />
          </Button>
          {showRuler && (
            <Button
              onClick={onCycleRulerColor}
              variant="secondary"
              className="hidden min-h-9 min-w-9 p-2 sm:inline-flex"
              title={`Ruler color: ${rulerColor === "amber" ? "Amber" : rulerColor === "purple" ? "Purple" : "Black"}`}
              aria-label={`Ruler color: ${rulerColor}`}
            >
              <Palette
                className={`w-4 h-4 ${rulerColor === "purple" ? "text-spirit-purple" : rulerColor === "black" ? "text-stone-gray" : "text-warm-amber"}`}
              />
            </Button>
          )}
          <Button
            onClick={onToggleAoE}
            variant="secondary"
            className={`hidden min-h-9 min-w-9 p-2 sm:inline-flex ${showAoE ? "bg-moss-green/20" : ""}`}
            title="AoE Shape — area of effect overlay"
            aria-label="Toggle area of effect tool"
          >
            <Zap className={`w-4 h-4 ${showAoE ? "text-moss-green" : ""}`} />
          </Button>
        </>
      )}
      {isDM && (
        <>
          <div className="hidden h-6 w-px bg-moss-green/20 sm:block" />
          <Button
            onClick={onToggleSpiritTokens}
            variant="secondary"
            className={`hidden min-h-9 min-w-9 p-2 sm:inline-flex ${showSpiritTokens ? "bg-spirit-purple/15" : ""}`}
            title={
              showSpiritTokens
                ? "Hiding spirit tokens (click to show)"
                : "Spirit tokens hidden — click to show"
            }
            aria-label="Toggle spirit tokens"
          >
            <Ghost
              className={`w-4 h-4 ${showSpiritTokens ? "text-spirit-purple" : "text-stone-gray/40"}`}
            />
          </Button>
        </>
      )}
    </div>
  );
}
