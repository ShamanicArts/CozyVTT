import { Grid3x3, Ghost, Maximize2, Palette, Ruler, Zap, ZoomIn, ZoomOut } from 'lucide-react';
import type { useMapControls } from '@/hooks/useMapControls';
import Button from '@/components/ui/Button';

type RulerColor = 'amber' | 'purple' | 'black';

interface MapToolbarProps {
  readonly controls: ReturnType<typeof useMapControls>;
  readonly canvasSize: { width: number; height: number };
  readonly hasMap: boolean;
  readonly isDM: boolean;
  readonly showGrid: boolean;
  readonly gridColor: 'black' | 'white';
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
  return (
    <div className="absolute top-4 left-4 glass-panel p-2 flex items-center gap-2 bg-parchment/90 backdrop-blur-sm">
      <Button onClick={controls.zoomOut} disabled={controls.zoom <= controls.minZoom} variant="secondary" className="p-2" title="Zoom Out">
        <ZoomOut className="w-4 h-4" />
      </Button>
      <span className="text-xs text-stone-gray font-mono min-w-[4rem] text-center">
        {Math.round(controls.zoom * 100)}%
      </span>
      <Button onClick={controls.zoomIn} disabled={controls.zoom >= controls.maxZoom} variant="secondary" className="p-2" title="Zoom In">
        <ZoomIn className="w-4 h-4" />
      </Button>
      <div className="w-px h-6 bg-moss-green/20" />
      <Button onClick={() => controls.fitToScreen(canvasSize.width, canvasSize.height)} variant="secondary" className="p-2" title="Fit to Screen">
        <Maximize2 className="w-4 h-4" />
      </Button>
      <Button onClick={onToggleGrid} variant="secondary" className={`p-2 ${showGrid ? 'bg-moss-green/20' : ''}`} title="Toggle Grid">
        <Grid3x3 className="w-4 h-4" />
      </Button>
      {showGrid && (
        <Button onClick={onToggleGridColor} variant="secondary" className="p-2" title={`Grid Color: ${gridColor === 'black' ? 'Black' : 'White'}`}>
          <Palette className="w-4 h-4" />
        </Button>
      )}
      {hasMap && (
        <>
          <div className="w-px h-6 bg-moss-green/20" />
          <Button onClick={onToggleRuler} variant="secondary" className={`p-2 ${showRuler ? 'bg-moss-green/20' : ''}`} title="Ruler — measure distance">
            <Ruler className={`w-4 h-4 ${showRuler ? 'text-moss-green' : ''}`} />
          </Button>
          {showRuler && (
            <Button onClick={onCycleRulerColor} variant="secondary" className="p-2" title={`Ruler color: ${rulerColor === 'amber' ? 'Amber' : rulerColor === 'purple' ? 'Purple' : 'Black'}`}>
              <Palette className={`w-4 h-4 ${rulerColor === 'purple' ? 'text-spirit-purple' : rulerColor === 'black' ? 'text-stone-gray' : 'text-warm-amber'}`} />
            </Button>
          )}
          <Button onClick={onToggleAoE} variant="secondary" className={`p-2 ${showAoE ? 'bg-moss-green/20' : ''}`} title="AoE Shape — area of effect overlay">
            <Zap className={`w-4 h-4 ${showAoE ? 'text-moss-green' : ''}`} />
          </Button>
        </>
      )}
      {isDM && (
        <>
          <div className="w-px h-6 bg-moss-green/20" />
          <Button onClick={onToggleSpiritTokens} variant="secondary" className={`p-2 ${showSpiritTokens ? 'bg-spirit-purple/15' : ''}`} title={showSpiritTokens ? 'Hiding spirit tokens (click to show)' : 'Spirit tokens hidden — click to show'}>
            <Ghost className={`w-4 h-4 ${showSpiritTokens ? 'text-spirit-purple' : 'text-stone-gray/40'}`} />
          </Button>
        </>
      )}
    </div>
  );
}
