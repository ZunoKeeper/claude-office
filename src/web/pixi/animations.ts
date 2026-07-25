export function bob(t: number, amplitude = 2, periodMs = 1400): number {
  return Math.sin((t / periodMs) * Math.PI * 2) * amplitude;
}

export function pulseAlpha(t: number, periodMs = 900, min = 0.5, max = 1): number {
  const w = (Math.sin((t / periodMs) * Math.PI * 2) + 1) / 2;
  return min + (max - min) * w;
}
