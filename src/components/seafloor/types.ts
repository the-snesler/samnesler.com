export interface SeafloorConfig {
  height?: number; // CSS height of the band in px (default: 500)
  subdivisions?: number; // Terrain grid resolution along X (default: 192)
  animationSpeed?: number; // Global time multiplier (default: 1.0)
  terrainAmplitude?: number; // Static displacement scale (default: 0.9)
  rockCount?: number; // Instanced rocks (default: 90)
  grassCount?: number; // Instanced seagrass tufts (default: 520)
  kelpCount?: number; // Instanced kelp stalks (default: 40)
  seed?: number; // Scatter/terrain seed (default: 1337)
}

/** Theme-driven colours shared by every seafloor program. */
export interface SeafloorPalette {
  uSandCol: { value: number[] };
  uSandDeepCol: { value: number[] };
  uRockCol: { value: number[] };
  uFloraCol: { value: number[] };
  uFloraTipCol: { value: number[] };
  uCausticCol: { value: number[] };
  uFogCol: { value: number[] };
}

export interface SeafloorUniforms extends SeafloorPalette {
  uTime: { value: number };
  uFogRange: { value: [number, number] };
}
