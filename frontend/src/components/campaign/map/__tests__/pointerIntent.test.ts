import { describe, expect, it } from 'vitest';
import { resolveMapPointerIntent } from '../pointerIntent';

describe('resolveMapPointerIntent', () => {
  it('reserves right-click for DM panning while a tool is active', () => {
    expect(resolveMapPointerIntent({
      button: 2, isDM: true, wallMode: 'wall-draw', fogMode: null, lightMode: null,
    })).toBe('tool-pan');
  });

  it('leaves right-click available to the normal context menu otherwise', () => {
    expect(resolveMapPointerIntent({
      button: 2, isDM: true, wallMode: null, fogMode: null, lightMode: null,
    })).toBe('ignore');
  });

  it('only gives primary actions to a left click', () => {
    expect(resolveMapPointerIntent({
      button: 0, isDM: false, wallMode: null, fogMode: null, lightMode: null,
    })).toBe('primary-action');
    expect(resolveMapPointerIntent({
      button: 1, isDM: true, wallMode: 'wall-draw', fogMode: null, lightMode: null,
    })).toBe('ignore');
  });
});
