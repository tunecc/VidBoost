/**
 * Style utility functions for subtitle components
 */

export function buildTextShadow(outlined: boolean, color: string): string {
  if (outlined) {
    // Outline mode: stroke effect
    return `
      -1px -1px 0 ${color},
      1px -1px 0 ${color},
      -1px 1px 0 ${color},
      1px 1px 0 ${color}
    `.trim();
  } else {
    // Shadow mode: drop shadow for readability
    return `2px 2px 4px rgba(0, 0, 0, 0.8)`;
  }
}

export function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
