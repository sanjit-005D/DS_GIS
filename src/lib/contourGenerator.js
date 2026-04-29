/**
 * Contour line generator using Inverse Distance Weighting (IDW) interpolation
 * and Marching Squares algorithm for contour extraction.
 *
 * Usage:
 *   const contours = generateContours(samples, { numLevels: 10, gridSize: 50 })
 *   // Returns GeoJSON FeatureCollection with LineString features
 */

/**
 * Interpolate value at a single grid point using Inverse Distance Weighting.
 * @param {number} x - Grid x coordinate
 * @param {number} y - Grid y coordinate
 * @param {Array} samples - Array of {lon, lat, value}
 * @param {number} power - IDW power (default 2)
 * @returns {number} Interpolated value
 */
function interpolateIDW(x, y, samples, power = 2) {
  if (!samples || samples.length === 0) return 0

  let totalWeight = 0
  let totalValue = 0

  for (const sample of samples) {
    const dx = sample.lon - x
    const dy = sample.lat - y
    const distSq = dx * dx + dy * dy

    // Exact match: return the value directly
    if (distSq < 1e-10) return sample.value

    const distance = Math.sqrt(distSq)
    const weight = 1 / Math.pow(distance, power)

    totalWeight += weight
    totalValue += weight * sample.value
  }

  return totalWeight > 0 ? totalValue / totalWeight : 0
}

/**
 * Create a regular grid of interpolated values across bounding box.
 * @param {Array} samples - Array of {lon, lat, value}
 * @param {number} gridSize - Number of grid cells per side
 * @returns {Object} { grid: 2D array, bounds: {minLon, minLat, maxLon, maxLat}, cellSize: {lon, lat} }
 */
function createInterpolatedGrid(samples, gridSize = 40) {
  if (!samples || samples.length === 0) {
    return { grid: [], bounds: null, cellSize: null }
  }

  // Find bounds
  let minLon = samples[0].lon, maxLon = samples[0].lon
  let minLat = samples[0].lat, maxLat = samples[0].lat

  for (const s of samples) {
    minLon = Math.min(minLon, s.lon)
    maxLon = Math.max(maxLon, s.lon)
    minLat = Math.min(minLat, s.lat)
    maxLat = Math.max(maxLat, s.lat)
  }

  // Add padding
  const lonPad = (maxLon - minLon) * 0.1
  const latPad = (maxLat - minLat) * 0.1
  minLon -= lonPad
  maxLon += lonPad
  minLat -= latPad
  maxLat += latPad

  const cellLonSize = (maxLon - minLon) / gridSize
  const cellLatSize = (maxLat - minLat) / gridSize

  // Interpolate grid
  const grid = []
  for (let row = 0; row <= gridSize; row++) {
    grid[row] = []
    const lat = minLat + row * cellLatSize
    for (let col = 0; col <= gridSize; col++) {
      const lon = minLon + col * cellLonSize
      grid[row][col] = interpolateIDW(lon, lat, samples, 2)
    }
  }

  return {
    grid,
    bounds: { minLon, maxLon, minLat, maxLat },
    cellSize: { lon: cellLonSize, lat: cellLatSize },
    gridSize
  }
}

/**
 * Marching Squares: trace contour lines for a specific level value.
 * Returns array of line segments (chains of coordinates).
 */
function marchingSquares(grid, level, bounds, cellSize) {
  const lines = []
  const { minLon, minLat } = bounds
  const { lon: cellLonSize, lat: cellLatSize } = cellSize
  const rows = grid.length
  const cols = rows > 0 ? grid[0].length : 0

  if (rows < 2 || cols < 2) return lines

  // Track visited edges to avoid duplicates
  const visitedEdges = new Set()

  // Process each cell
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      // Get corner values
      const v0 = grid[row][col]
      const v1 = grid[row][col + 1]
      const v2 = grid[row + 1][col + 1]
      const v3 = grid[row + 1][col]

      // Determine cell type (which corners are above/below level)
      let cellType = 0
      if (v0 >= level) cellType |= 1
      if (v1 >= level) cellType |= 2
      if (v2 >= level) cellType |= 4
      if (v3 >= level) cellType |= 8

      // No contour in this cell
      if (cellType === 0 || cellType === 15) continue

      // Get corner coordinates
      const x0 = minLon + col * cellLonSize
      const y0 = minLat + row * cellLatSize
      const x1 = x0 + cellLonSize
      const y1 = y0 + cellLatSize

      // Interpolate contour crossing points on edges
      const topLeft = [x0, y0]
      const topRight = [x1, y0]
      const bottomRight = [x1, y1]
      const bottomLeft = [x0, y1]

      const edgePoints = {
        top: lerpPoint(topLeft, topRight, v0, v1, level),
        right: lerpPoint(topRight, bottomRight, v1, v2, level),
        bottom: lerpPoint(bottomRight, bottomLeft, v2, v3, level),
        left: lerpPoint(bottomLeft, topLeft, v3, v0, level)
      }

      // Generate line segments based on cell type
      const segments = getLineSegments(cellType, edgePoints)
      for (const seg of segments) {
        lines.push(seg)
      }
    }
  }

  return lines
}

/**
 * Linear interpolation between two points based on value threshold.
 */
function lerpPoint(p1, p2, v1, v2, level) {
  if (Math.abs(v2 - v1) < 1e-10) return [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
  const t = (level - v1) / (v2 - v1)
  return [
    p1[0] + t * (p2[0] - p1[0]),
    p1[1] + t * (p2[1] - p1[1])
  ]
}

/**
 * Determine line segments for a cell based on marching squares lookup table.
 */
function getLineSegments(cellType, edges) {
  const { top, right, bottom, left } = edges
  const segments = []

  // Marching squares cases
  switch (cellType) {
    case 1: segments.push([left, bottom]); break
    case 2: segments.push([top, right]); break
    case 3: segments.push([left, right]); break
    case 4: segments.push([bottom, right]); break
    case 5: segments.push([left, top]); segments.push([bottom, right]); break
    case 6: segments.push([top, bottom]); break
    case 7: segments.push([left, top]); segments.push([left, bottom]); break
    case 8: segments.push([left, top]); break
    case 9: segments.push([bottom, top]); break
    case 10: segments.push([left, top]); segments.push([right, bottom]); break
    case 11: segments.push([left, bottom]); segments.push([left, top]); break
    case 12: segments.push([left, right]); break
    case 13: segments.push([bottom, right]); segments.push([left, bottom]); break
    case 14: segments.push([left, right]); segments.push([right, bottom]); break
  }

  return segments
}

/**
 * Chain line segments into continuous LineStrings.
 */
function chainSegments(segments) {
  if (segments.length === 0) return []

  const chains = []
  const used = new Set()

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue

    const chain = [segments[i][0], segments[i][1]]
    used.add(i)

    // Try to extend chain in both directions
    let extended = true
    while (extended) {
      extended = false
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue

        const [p1, p2] = segments[j]
        const chainStart = chain[0]
        const chainEnd = chain[chain.length - 1]

        // Check if p1 or p2 connects to the chain
        if (pointsEqual(p2, chainStart)) {
          chain.unshift(p1)
          used.add(j)
          extended = true
          break
        } else if (pointsEqual(p1, chainStart)) {
          chain.unshift(p2)
          used.add(j)
          extended = true
          break
        } else if (pointsEqual(p1, chainEnd)) {
          chain.push(p2)
          used.add(j)
          extended = true
          break
        } else if (pointsEqual(p2, chainEnd)) {
          chain.push(p1)
          used.add(j)
          extended = true
          break
        }
      }
    }

    if (chain.length > 2) {
      chains.push(chain)
    }
  }

  return chains
}

function pointsEqual(p1, p2, tolerance = 1e-8) {
  return Math.abs(p1[0] - p2[0]) < tolerance && Math.abs(p1[1] - p2[1]) < tolerance
}

/**
 * Generate contour levels from grid min/max.
 */
function generateLevels(grid, numLevels = 10) {
  let min = Infinity, max = -Infinity
  for (const row of grid) {
    for (const val of row) {
      min = Math.min(min, val)
      max = Math.max(max, val)
    }
  }

  if (min === Infinity || min === max) return []

  const levels = []
  for (let i = 0; i < numLevels; i++) {
    const level = min + ((i + 1) / (numLevels + 1)) * (max - min)
    levels.push(level)
  }
  return levels
}

/**
 * Main contour generation function.
 * @param {Array} samples - Array of {lon, lat, value} objects
 * @param {Object} options - {numLevels, gridSize, customLevels}
 * @returns {Object} GeoJSON FeatureCollection with contour lines
 */
export function generateContours(samples, options = {}) {
  const { numLevels = 8, gridSize = 35, customLevels = null } = options

  if (!samples || samples.length < 3) {
    return { type: 'FeatureCollection', features: [] }
  }

  // Create interpolated grid
  const gridData = createInterpolatedGrid(samples, gridSize)
  if (!gridData.grid || gridData.grid.length === 0) {
    return { type: 'FeatureCollection', features: [] }
  }

  // Determine contour levels
  const levels = customLevels || generateLevels(gridData.grid, numLevels)

  // Generate contour lines for each level
  const features = []
  for (const level of levels) {
    const segments = marchingSquares(gridData.grid, level, gridData.bounds, gridData.cellSize)
    const chains = chainSegments(segments)

    for (const chain of chains) {
      features.push({
        type: 'Feature',
        properties: { level: Number(level.toFixed(2)), type: 'contour' },
        geometry: {
          type: 'LineString',
          coordinates: chain
        }
      })
    }
  }

  return {
    type: 'FeatureCollection',
    features
  }
}

/**
 * Optional: Generate a raster/heatmap tile URL or canvas-based heatmap.
 * For now, we return contour lines only.
 */
export function getContourBounds(contours) {
  if (!contours || !contours.features || contours.features.length === 0) {
    return null
  }

  let minLon = Infinity, maxLon = -Infinity
  let minLat = Infinity, maxLat = -Infinity

  for (const feature of contours.features) {
    const coords = feature.geometry.coordinates
    for (const [lon, lat] of coords) {
      minLon = Math.min(minLon, lon)
      maxLon = Math.max(maxLon, lon)
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
    }
  }

  return { minLon, maxLon, minLat, maxLat }
}

export default {
  generateContours,
  getContourBounds
}
