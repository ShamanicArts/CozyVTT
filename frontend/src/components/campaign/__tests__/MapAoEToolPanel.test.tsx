import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import MapAoEToolPanel from '../MapAoEToolPanel';

describe('MapAoEToolPanel', () => {
  it('routes shape, size, and clear actions through the supplied controller ports', () => {
    const onConfigChange = vi.fn();
    const onClearOrigin = vi.fn();
    render(
      <MapAoEToolPanel
        visible
        config={{ shape: 'sphere', sizeFt: 20 }}
        origin={{ x: 3, y: 4 }}
        onConfigChange={onConfigChange}
        onClearOrigin={onClearOrigin}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cone' }));
    expect(onConfigChange).toHaveBeenCalledOnce();
    expect(onConfigChange.mock.calls[0][0]({ shape: 'sphere', sizeFt: 20 })).toEqual({ shape: 'cone', sizeFt: 20 });

    fireEvent.click(screen.getByRole('button', { name: /Clear placement/ }));
    expect(onClearOrigin).toHaveBeenCalledOnce();
  });
});
