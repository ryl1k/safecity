const CENTER_LAT = 49.8419, CENTER_LNG = 24.0318;
const RADIUS_M = Number(process.argv[2] ?? 2500);
const HIGHWAY_FILTER = 'footway|path|pedestrian|steps|service|residential|primary|secondary|tertiary|living_street|unclassified|track|cycleway|corridor';

const query = `[out:json][timeout:120];(way["highway"~"${HIGHWAY_FILTER}"](around:${RADIUS_M},${CENTER_LAT},${CENTER_LNG}););out body;>;out skel qt;`;
const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'SafeCity/1.0' },
  body: 'data=' + encodeURIComponent(query),
  signal: AbortSignal.timeout(150_000),
});
const data = await res.json();
const nodeMap = new Map();
const wayList = [];
for (const el of data.elements) {
  if (el.type === 'node') nodeMap.set(el.id, true);
  else if (el.type === 'way' && el.nodes?.length >= 2) wayList.push(el);
}
const nodeWayCount = new Map();
for (const w of wayList) for (const n of w.nodes) nodeWayCount.set(n, (nodeWayCount.get(n) ?? 0) + 1);
const intersections = new Set();
for (const w of wayList) {
  intersections.add(w.nodes[0]);
  intersections.add(w.nodes[w.nodes.length - 1]);
  for (const n of w.nodes) if ((nodeWayCount.get(n) ?? 0) >= 2) intersections.add(n);
}
let segments = 0;
for (const w of wayList) {
  let s = 0;
  for (let i = 1; i < w.nodes.length; i++) {
    if (intersections.has(w.nodes[i]) || i === w.nodes.length - 1) { segments++; s = i; }
  }
}
console.log(`Radius: ${RADIUS_M}m | Ways: ${wayList.length} | Segments after split: ${segments}`);
