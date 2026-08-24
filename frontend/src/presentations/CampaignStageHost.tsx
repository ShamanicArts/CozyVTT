import {
  Component,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ErrorInfo,
  type ReactNode,
} from "react";
import type {
  CampaignPresentationContext,
  CampaignPresentationContribution,
  CampaignPresentationInstance,
  ImperativeCampaignPresentationContribution,
} from "./contracts";
import type { PresentationRegistry } from "./PresentationRegistry";

interface PresentationErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly resetKey: CampaignPresentationContribution;
}

interface PresentationErrorBoundaryState {
  readonly failed: boolean;
}

class PresentationErrorBoundary extends Component<
  PresentationErrorBoundaryProps,
  PresentationErrorBoundaryState
> {
  state: PresentationErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PresentationErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Presentation failures are contained so the campaign shell remains usable.
  }

  componentDidUpdate(previous: PresentationErrorBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function UnavailablePresentation() {
  return (
    <div
      className="flex h-full w-full items-center justify-center text-sm text-ink-secondary"
      role="status"
    >
      This campaign presentation is unavailable.
    </div>
  );
}

function ImperativePresentationMount({
  contribution,
  context,
}: {
  readonly contribution: ImperativeCampaignPresentationContribution;
  readonly context: CampaignPresentationContext;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<CampaignPresentationInstance | null>(null);
  const contextRef = useRef(context);
  const [error, setError] = useState<Error | null>(null);
  contextRef.current = context;

  const containLifecycleError = (lifecycleError: unknown) => {
    setError(
      lifecycleError instanceof Error
        ? lifecycleError
        : new Error("Campaign presentation lifecycle failed."),
    );
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let active = true;
    let observer: ResizeObserver | null = null;
    const activate = async () => {
      try {
        const activationContext = contextRef.current;
        const instance = await contribution.activate(mount, activationContext);
        if (!active) {
          instance.dispose();
          return;
        }

        instanceRef.current = instance;
        instance.setVisible(true);
        const { width, height } = mount.getBoundingClientRect();
        instance.resize({ width, height });
        if (contextRef.current !== activationContext) {
          instance.update(contextRef.current);
        }

        if (typeof ResizeObserver !== "undefined") {
          observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            try {
              instance.resize({
                width: entry.contentRect.width,
                height: entry.contentRect.height,
              });
            } catch (resizeError) {
              containLifecycleError(resizeError);
            }
          });
          observer.observe(mount);
        }
      } catch (activationError) {
        if (active) {
          containLifecycleError(activationError);
        }
      }
    };

    void activate();
    return () => {
      active = false;
      observer?.disconnect();
      const instance = instanceRef.current;
      instanceRef.current = null;
      if (instance) {
        try {
          instance.setVisible(false);
        } catch {
          // A broken provider must not prevent its remaining cleanup.
        }
        try {
          instance.dispose();
        } catch {
          // Cleanup failures must not escape the campaign stage boundary.
        }
      }
    };
  }, [contribution]);

  useEffect(() => {
    try {
      instanceRef.current?.update(context);
    } catch (updateError) {
      containLifecycleError(updateError);
    }
  }, [context]);

  if (error) throw error;
  return <div ref={mountRef} className="h-full w-full" />;
}

function PresentationView({
  contribution,
  context,
}: {
  readonly contribution: CampaignPresentationContribution;
  readonly context: CampaignPresentationContext;
}) {
  return (
    <div
      className="h-full w-full"
      data-campaign-presentation={contribution.id}
    >
      {contribution.kind === "react" ? (
        contribution.render(context)
      ) : (
        <ImperativePresentationMount
          contribution={contribution}
          context={context}
        />
      )}
    </div>
  );
}

export function CampaignStageHost({
  registry,
  activePresentationId,
  fallbackPresentationId,
  context,
}: {
  readonly registry: PresentationRegistry;
  readonly activePresentationId: string;
  readonly fallbackPresentationId: string;
  readonly context: CampaignPresentationContext;
}) {
  useSyncExternalStore(
    registry.subscribe,
    registry.getRevision,
    registry.getRevision,
  );

  const contribution = registry.resolve(
    activePresentationId,
    fallbackPresentationId,
  );
  if (!contribution) return <UnavailablePresentation />;

  const fallback = registry.get(fallbackPresentationId);
  const fallbackView =
    fallback && fallback.id !== contribution.id ? (
      <PresentationErrorBoundary
        fallback={<UnavailablePresentation />}
        resetKey={fallback}
      >
        <PresentationView contribution={fallback} context={context} />
      </PresentationErrorBoundary>
    ) : (
      <UnavailablePresentation />
    );

  return (
    <PresentationErrorBoundary
      key={contribution.id}
      fallback={fallbackView}
      resetKey={contribution}
    >
      <PresentationView contribution={contribution} context={context} />
    </PresentationErrorBoundary>
  );
}
