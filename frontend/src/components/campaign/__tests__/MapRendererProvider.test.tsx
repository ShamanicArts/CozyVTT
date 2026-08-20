import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MapRendererProvider, useMapRendererHost } from '../MapRendererProvider';

function HostProbe({ label }: { label: string }) {
  const host = useMapRendererHost();
  return <output data-testid={label}>{host?.registry.list().length ?? 0}</output>;
}

describe('MapRendererProvider', () => {
  it('makes one scoped renderer host available to campaign descendants', () => {
    render(
      <MapRendererProvider>
        <HostProbe label="host" />
      </MapRendererProvider>,
    );

    // The registered CozyVTT terrain, token, and overlay layers are available
    // without passing a host through every intermediate campaign component.
    expect(screen.getByTestId('host')).toHaveTextContent('3');
  });

  it('does not expose a host outside its workspace boundary', () => {
    render(<HostProbe label="outside" />);
    expect(screen.getByTestId('outside')).toHaveTextContent('0');
  });
});
