export function routeFor(scenario, closure = false) {
  return {
    points: structuredClone(closure ? scenario.detour : scenario.route),
    distanceKm: scenario.distanceKm + (closure ? 0.9 : 0),
    rerouted: closure,
  };
}

export function haversineKm(a, b) {
  const toRad = value => value * Math.PI / 180;
  const r = 6371;
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function pointAlong(points, progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  const lengths = [];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const length = haversineKm(points[index - 1], points[index]);
    lengths.push(length);
    total += length;
  }
  let remaining = total * clamped;
  for (let index = 0; index < lengths.length; index += 1) {
    if (remaining <= lengths[index] || index === lengths.length - 1) {
      const ratio = lengths[index] ? remaining / lengths[index] : 0;
      return [
        points[index][0] + (points[index + 1][0] - points[index][0]) * ratio,
        points[index][1] + (points[index + 1][1] - points[index][1]) * ratio,
      ];
    }
    remaining -= lengths[index];
  }
  return points.at(-1);
}
