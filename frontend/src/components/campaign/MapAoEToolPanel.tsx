export type AoEShape = 'sphere' | 'cylinder' | 'cone' | 'line' | 'cube';

export interface AoEConfig {
  shape: AoEShape;
  sizeFt: number;
  widthFt?: number;
}

interface MapAoEToolPanelProps {
  readonly visible: boolean;
  readonly config: AoEConfig;
  readonly origin: { x: number; y: number } | null;
  readonly onConfigChange: (updater: (previous: AoEConfig) => AoEConfig) => void;
  readonly onClearOrigin: () => void;
}

/** Visual controls for the ruler-independent area-of-effect overlay. */
export default function MapAoEToolPanel({
  visible,
  config,
  origin,
  onConfigChange,
  onClearOrigin,
}: MapAoEToolPanelProps) {
  if (!visible) return null;

  return (
    <div className="absolute top-12 left-2 z-10 p-3 space-y-3 w-52 shadow-xl rounded-xl border border-moss-green/30 bg-parchment/95 backdrop-blur-sm">
      <p className="text-xs font-semibold text-moss-green">AoE Shape</p>
      <div className="flex flex-wrap gap-1.5">
        {(['sphere', 'cone', 'line', 'cube'] as AoEShape[]).map((shape) => (
          <button
            key={shape}
            onClick={() => onConfigChange((previous) => ({ ...previous, shape }))}
            className={`text-xs px-2 py-1 rounded border transition-colors capitalize ${
              config.shape === shape
                ? 'bg-moss-green/20 border-moss-green/60 text-moss-green font-medium'
                : 'border-stone-gray/30 text-stone-gray hover:border-moss-green/40 hover:text-moss-green'
            }`}
          >
            {shape === 'sphere' ? 'Circle' : shape.charAt(0).toUpperCase() + shape.slice(1)}
          </button>
        ))}
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-stone-gray">
          {config.shape === 'sphere' ? 'Radius' : 'Length'} (ft)
        </label>
        <input
          type="number" min={5} max={500} step={5} value={config.sizeFt}
          onChange={(event) => onConfigChange((previous) => ({
            ...previous,
            sizeFt: Math.max(5, parseInt(event.target.value) || 5),
          }))}
          className="w-full input-cozy text-sm py-1"
        />
      </div>
      {config.shape === 'line' && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-gray">Width (ft)</label>
          <input
            type="number" min={5} max={100} step={5} value={config.widthFt ?? 5}
            onChange={(event) => onConfigChange((previous) => ({
              ...previous,
              widthFt: Math.max(5, parseInt(event.target.value) || 5),
            }))}
            className="w-full input-cozy text-sm py-1"
          />
        </div>
      )}
      <div className="space-y-1">
        <p className="text-xs font-medium text-stone-gray">Presets</p>
        <div className="flex flex-wrap gap-1">
          {[10, 15, 20, 30, 60].map((feet) => (
            <button
              key={feet}
              onClick={() => onConfigChange((previous) => ({ ...previous, sizeFt: feet }))}
              className="text-xs px-1.5 py-0.5 rounded bg-moss-green/10 hover:bg-moss-green/20 text-moss-green border border-moss-green/20 transition-colors"
            >
              {feet} ft
            </button>
          ))}
        </div>
      </div>
      {origin && (
        <button onClick={onClearOrigin} className="text-xs text-stone-gray hover:text-danger-ink transition-colors">
          × Clear placement
        </button>
      )}
      <p className="text-xs text-stone-gray/70">{origin ? 'Click map to reposition' : 'Click map to place shape'}</p>
    </div>
  );
}
