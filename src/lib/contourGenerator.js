/**
 * Natural Contour generator.
 * Combines efficiency with grid smoothing and curve interpolation.
 */

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function lightInterpolate(lon, lat, samples, spreadKm) {
  if (!samples || samples.length === 0) return 0;
  
  let totalWeight = 0;
  let totalValue = 0;
  const sigma = Number.isFinite(spreadKm) ? Math.max(0.1, spreadKm / 3) : 50;

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const distKm = haversineDistanceKm(lat, lon, s.lat, s.lon);
    
    if (distKm < 1e-6) return s.value;

    const weight = Math.exp(-Math.pow(distKm / sigma, 2));
    totalWeight += weight;
    totalValue += s.value * weight;
  }
  
  return totalWeight > 0 ? totalValue / totalWeight : 0;
}

function smoothGrid(grid) {
  const rows = grid.length, cols = grid[0].length;
  const smoothed = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0, count = 0;
      // Use a larger 5x5 kernel for much smoother results
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            // Distance-based weight for kernel
            const w = Math.exp(-(dr*dr + dc*dc) / 2);
            sum += grid[nr][nc] * w; count += w;
          }
        }
      }
      smoothed[r][c] = sum / count;
    }
  }
  return smoothed;
}

function chaikinSmooth(points, iterations = 4) {
  if (points.length < 3) return points;
  let current = points;
  for (let iter = 0; iter < iterations; iter++) {
    const next = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i], p1 = current[i+1];
      next.push([0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]);
      next.push([0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]);
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
}

function chainSegments(segments) {
  if (!segments.length) return [];
  const unused = [...segments], chains = [];
  const prec = 6;
  const key = p => `${p[0].toFixed(prec)}:${p[1].toFixed(prec)}`;

  while (unused.length) {
    let chain = unused.pop();
    let extended = true;
    while (extended) {
      extended = false;
      const sK = key(chain[0]), eK = key(chain[chain.length - 1]);
      for (let i = 0; i < unused.length; i++) {
        const seg = unused[i], ssK = key(seg[0]), seK = key(seg[seg.length - 1]);
        if (eK === ssK) { chain.push(...seg.slice(1)); unused.splice(i, 1); extended = true; break; }
        if (eK === seK) { chain.push(...seg.slice(0, -1).reverse()); unused.splice(i, 1); extended = true; break; }
        if (sK === seK) { chain.unshift(...seg.slice(0, -1)); unused.splice(i, 1); extended = true; break; }
        if (sK === ssK) { chain.unshift(...seg.slice(1).reverse()); unused.splice(i, 1); extended = true; break; }
      }
    }
    chains.push(chain);
  }
  return chains;
}

export function generateContours(samples, options = {}) {
  const { numLevels = 8, gridSize = 60, spreadKm = Infinity, viewportBounds = null } = options;
  if (!samples || samples.length < 3) return { type: 'FeatureCollection', features: [] };

  let minLon, maxLon, minLat, maxLat, minVal = Infinity, maxVal = -Infinity;
  
  if (viewportBounds) {
    minLon = viewportBounds.getWest();
    maxLon = viewportBounds.getEast();
    minLat = viewportBounds.getSouth();
    maxLat = viewportBounds.getNorth();
  } else {
    minLon = Infinity; maxLon = -Infinity; minLat = Infinity; maxLat = -Infinity;
    for (const s of samples) {
      minLon = Math.min(minLon, s.lon); maxLon = Math.max(maxLon, s.lon);
      minLat = Math.min(minLat, s.lat); maxLat = Math.max(maxLat, s.lat);
    }
    const pX = (maxLon - minLon) * 0.15, pY = (maxLat - minLat) * 0.15;
    minLon -= pX; maxLon += pX; minLat -= pY; maxLat += pY;
  }

  for (const s of samples) {
    minVal = Math.min(minVal, s.value); maxVal = Math.max(maxVal, s.value);
  }

  const res = Math.max(40, Math.min(120, gridSize));
  const dx = (maxLon - minLon) / res, dy = (maxLat - minLat) / res;
  
  // Pre-process samples for faster interpolation
  const processedSamples = samples.map(s => ({
    ...s,
    latRad: s.lat * Math.PI / 180,
    lonRad: s.lon * Math.PI / 180,
    cosLat: Math.cos(s.lat * Math.PI / 180)
  }));

  const fastInterpolate = (lon, lat) => {
    let totalWeight = 0;
    let totalValue = 0;
    // Larger sigma creates softer, more circular blobs. 
    // We also use a slower decay to prevent sharp linear boundaries.
    const sigma = Number.isFinite(spreadKm) ? Math.max(5, spreadKm / 1.5) : 80;
    const lat1 = lat * Math.PI / 180;
    const lon1 = lon * Math.PI / 180;
    const cosLat1 = Math.cos(lat1);

    for (let i = 0; i < processedSamples.length; i++) {
      const s = processedSamples[i];
      const dLat = s.latRad - lat1;
      const dLon = s.lonRad - lon1;
      const a = Math.sin(dLat / 2) ** 2 + cosLat1 * s.cosLat * Math.sin(dLon / 2) ** 2;
      const distKm = 12742 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      if (distKm < 1e-6) return { value: s.value, weight: 1.0 };
      // Gaussian weight with softer decay
      const weight = Math.exp(-Math.pow(distKm / sigma, 2));
      totalWeight += weight;
      totalValue += s.value * weight;
    }

    // Clipping threshold: if we are too far from data, default to minVal
    const weightThreshold = 0.02;
    if (totalWeight < weightThreshold) return { value: minVal, weight: totalWeight };
    
    return { value: totalWeight > 0 ? totalValue / totalWeight : minVal, weight: totalWeight };
  };

  const gridData = Array.from({ length: res + 1 }, (_, i) => 
    Array.from({ length: res + 1 }, (_, j) => fastInterpolate(minLon + j * dx, minLat + i * dy))
  );
  
  // Extract values for smoothing, keep weights for clipping
  let grid = gridData.map(row => row.map(cell => cell.value));
  const weights = gridData.map(row => row.map(cell => cell.weight));
  
  grid = smoothGrid(grid);

  const levels = [];
  if (maxVal > minVal) for (let i = 1; i <= numLevels; i++) levels.push(minVal + (i / (numLevels + 1)) * (maxVal - minVal));

  const features = [];
  const interp = (p1, p2, v1, v2, lvl) => {
    const t = (lvl - v1) / (v2 - v1 || 1e-6);
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  };
  for (let li = 0; li < levels.length; li++) {
    const level = levels[li];
    const segments = [];
    for (let i = 0; i < res; i++) {
      for (let j = 0; j < res; j++) {
        // Clipping: if any corner has weight above threshold, we can contour.
        // Otherwise, skip to avoid extrapolation artifacts.
        const w1 = weights[i][j], w2 = weights[i][j+1], w3 = weights[i+1][j+1], w4 = weights[i+1][j];
        if (w1 < 0.02 && w2 < 0.02 && w3 < 0.02 && w4 < 0.02) continue;

        const v1 = grid[i][j], v2 = grid[i][j+1], v3 = grid[i+1][j+1], v4 = grid[i+1][j];
        let m = 0; if (v1 >= level) m |= 8; if (v2 >= level) m |= 4; if (v3 >= level) m |= 2; if (v4 >= level) m |= 1;
        if (m === 0 || m === 15) continue;
        const x = minLon + j * dx, y = minLat + i * dy;
        const top = interp([x, y], [x + dx, y], v1, v2, level), right = interp([x + dx, y], [x + dx, y + dy], v2, v3, level);
        const bot = interp([x, y + dy], [x + dx, y + dy], v4, v3, level), left = interp([x, y], [x, y + dy], v1, v4, level);
        if (m===1||m===14) segments.push([left, bot]); else if (m===2||m===13) segments.push([bot, right]);
        else if (m===3||m===12) segments.push([left, right]); else if (m===4||m===11) segments.push([top, right]);
        else if (m===6||m===9) segments.push([top, bot]); else if (m===7||m===8) segments.push([top, left]);
        else if (m===5) segments.push([top, left], [bot, right]); else if (m===10) segments.push([top, right], [left, bot]);
      }
    }
    // compute linewidth for this level (0.5 -> 3.0)
    const lineWidth = (levels.length > 1) ? (0.5 + (li / (levels.length - 1)) * 2.5) : 1.0;
    for (const chain of chainSegments(segments)) {
      if (chain.length < 2) continue;
      const smoothed = chaikinSmooth(chain, 2);
      // main contour line feature
      features.push({
        type: 'Feature',
        properties: { level: Number(level.toFixed(2)), linewidth: Number(lineWidth.toFixed(2)) },
        geometry: { type: 'LineString', coordinates: smoothed }
      });
      // add a Point feature at the midpoint for labeling (map can render label from properties.label)
      const mid = smoothed[Math.floor(smoothed.length / 2)];
      if (mid) {
        features.push({
          type: 'Feature',
          properties: { label: String(Number(level.toFixed(2))), level: Number(level.toFixed(2)) },
          geometry: { type: 'Point', coordinates: mid }
        });
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
