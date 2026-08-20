/**
 * Public contract for the canvas renderer kernel.
 *
 * The contract version deliberately belongs to the rendering boundary rather
 * than to a particular map implementation. A future renderer plugin can
 * declare the version it was written for before it is allowed to run.
 */
export const RENDERER_CONTRACT_VERSION = '1.0.0' as const;

/** Kept open so future plugin packages can declare newer contracts. */
export type RendererContractVersion = string;

/**
 * The minimum data every renderer layer receives. Product-specific render
 * contexts extend this interface with their own drawing state and services.
 */
export interface RendererContext {
  readonly contractVersion: RendererContractVersion;
}

/**
 * A deterministic, independently replaceable unit of rendering work.
 *
 * `order` is evaluated only within a surface; equal orders retain the order
 * in which they were registered. Keeping surfaces separate lets a host retain
 * explicit canvas/z-index ownership while still allowing plugins inside it.
 */
export interface RendererLayer<
  Context extends RendererContext,
  Surface extends string = string,
> {
  readonly id: string;
  readonly contractVersion: RendererContractVersion;
  readonly surface: Surface;
  readonly order?: number;
  readonly render: (context: Context) => void;
}

export interface RendererLayerError<
  Context extends RendererContext,
  Surface extends string = string,
> {
  readonly error: unknown;
  readonly layer: RendererLayer<Context, Surface>;
  readonly context: Context;
}

export type RendererLayerErrorHandler<
  Context extends RendererContext,
  Surface extends string = string,
> = (event: RendererLayerError<Context, Surface>) => void;
