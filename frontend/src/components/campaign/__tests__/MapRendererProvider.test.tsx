import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  MapRendererProvider,
  useMapRendererHost,
} from "../MapRendererProvider";

function HostProbe({
  label,
  onHost,
}: {
  label: string;
  onHost?: (host: NonNullable<ReturnType<typeof useMapRendererHost>>) => void;
}) {
  const host = useMapRendererHost();
  if (host) onHost?.(host);
  return (
    <output data-testid={label}>{host?.registry.list().length ?? 0}</output>
  );
}

describe("MapRendererProvider", () => {
  it("makes one scoped renderer host available to campaign descendants", () => {
    render(
      <MapRendererProvider contributionLoader={() => new Promise(() => {})}>
        <HostProbe label="host" />
      </MapRendererProvider>,
    );

    // The registered CozyVTT terrain, token, and overlay layers are available
    // without passing a host through every intermediate campaign component.
    expect(screen.getByTestId("host")).toHaveTextContent("3");
  });

  it("does not expose a host outside its workspace boundary", () => {
    render(<HostProbe label="outside" />);
    expect(screen.getByTestId("outside")).toHaveTextContent("0");
  });

  it("loads and disposes an active trusted renderer contribution", async () => {
    const captured: {
      host?: NonNullable<ReturnType<typeof useMapRendererHost>>;
    } = {};
    const activate = vi.fn((api) =>
      api.registerLayer({
        id: "glow",
        surface: "overlay",
        render: () => {},
      }),
    );
    const { unmount } = render(
      <MapRendererProvider
        contributionLoader={async () => [
          {
            extensionId: "example.renderer",
            renderer: {
              id: "map-glow",
              name: "Map Glow",
              contractVersion: "1.0.0",
              moduleUrl:
                "/api/extensions/contributions/renderers/example.renderer/map-glow",
            },
          },
        ]}
        moduleImporter={async () => ({ activateMapRenderer: activate })}
      >
        <HostProbe
          label="plugin-host"
          onHost={(host) => {
            captured.host = host;
          }}
        />
      </MapRendererProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("plugin-host")).toHaveTextContent("4"),
    );
    expect(activate).toHaveBeenCalledOnce();
    unmount();
    expect(captured.host?.registry.list()).toHaveLength(3);
  });
});
