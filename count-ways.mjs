const query = '[out:json][timeout:60];(way["highway"~"^(footway|path|pedestrian|steps|cycleway|living_street|residential|service|unclassified|tertiary|secondary|primary|trunk)$"](around:2500,49.8419,24.0318););out count;';

const encoded = 'data=' + encodeURIComponent(query);
const r = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SafeCity/1.0' },
  body: encoded,
});
const text = await r.text();
if (text.startsWith('<')) { console.error('Overpass returned XML error:\n', text.slice(0, 400)); process.exit(1); }
const d = JSON.parse(text);
console.log('Total ways at 2km radius:', d.elements[0]?.tags?.total);
