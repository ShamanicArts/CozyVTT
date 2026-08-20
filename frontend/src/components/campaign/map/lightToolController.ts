import type { LightSource } from '@/types/walls';

export function placeLight(
  x: number,
  y: number,
  defaults: Pick<LightSource, 'brightRadius' | 'dimRadius' | 'color'>,
  id: () => string,
): LightSource {
  return {
    id: id(), x: Math.round(x), y: Math.round(y),
    brightRadius: defaults.brightRadius, dimRadius: defaults.dimRadius,
    color: defaults.color, enabled: true,
  };
}

export function updateLightPosition(lights: readonly LightSource[], id: string, x: number, y: number): LightSource[] {
  return lights.map((light) => light.id === id ? { ...light, x: Math.round(x), y: Math.round(y) } : light);
}

export function nearestLight(lights: readonly LightSource[], x: number, y: number, radius: number): LightSource | null {
  let closest: LightSource | null = null;
  let closestDistance = Infinity;
  for (const light of lights) {
    const distance = Math.hypot(x - light.x, y - light.y);
    if (distance <= radius && distance < closestDistance) {
      closest = light;
      closestDistance = distance;
    }
  }
  return closest;
}
