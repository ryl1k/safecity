// Clean CARTO Positron / Dark Matter basemap (matches the web's minimal design).
// Returns a MapLibre style JSON string for the @maplibre Map `mapStyle` prop.
export function basemapStyle(dark: boolean): string {
  const variant = dark ? 'dark_all' : 'light_all';
  return JSON.stringify({
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: ['a', 'b', 'c', 'd'].map(
          (s) => `https://${s}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png`,
        ),
        tileSize: 256,
        attribution: '© OpenStreetMap © CARTO',
      },
    },
    layers: [{ id: 'carto', type: 'raster', source: 'carto' }],
  });
}
