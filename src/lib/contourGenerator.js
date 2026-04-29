/**
 * Contour line generator using Inverse Distance Weighting (IDW) interpolation
 * and simple grid-based contour extraction.
 *
 * Usage:
 *   const contours = generateContours(samples, { numLevels: 10, gridSize: 50 })
 *   // Returns GeoJSON FeatureCollection with Point features (contour points)
 */

/**
 * Interpolate value at a single grid point using Inverse Distance Weighting.
 * @param {number} x - Grid x coordinate
 * @param {number} y - Grid y coordinate
 * @param {Array} samples - Array of {lon, lat, value}
 * @param {number} power - IDW power (default 1.5 for smoother results)
 * @returns {number} Interpolated value
 */
function interpolateIDW(x, y, samples, power = 1.5) {
  if (!samples || samples.length === 0) return 0

  let totalWeight = 0
  let totalValue = 0
  let closestDist = Infinity
  let closestVal = 0

  for (const sample of samples) {
    const dx = sample.lon - x
    const dy = sample.lat - y
    const distSq = dx * dx + dy * dy

    if (distSq === 0) return sample.value

    const distance = Math.sqrt(distSq)
    if (distance < closestDist) {
      closestDist = distance
      closestVal = sample.value
    }

    const weight = 1 / Math.pow(distance, power)
    totalWeight += weight
    totalValue += weight * sample.value
  }

  return totalWeight > 0 ? totalValue / totalWeight : closestVal
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
/**
 * Generate contour level values from grid min/max.
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
  for (let i = 1; i <= numLevels; i++) {
    const level = min + (i / (numLevels + 1)) * (max - min)
    levels.push(level)
  }
  return levels
}

/**
 * Simple contour line generation using grid edge crossings.
 * For each grid cell, find edges where values cross a contour level.
 */
function generateContourForLevel(grid, level, bounds, cellSize) {
  const { minLon, minLat, maxLon, maxLat } = bounds
  const { lon: cellLonSize, lat: cellLatSize } = cellSize
  const rows = grid.length
  const cols = rows > 0 ? grid[0].length : 0

  const lines = []

  if (rows < 2 || cols < 2) return lines

  // Create linestrings by walking the grid
  const visited = new Set()

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const v00 = grid[row][col]
      const v10 = grid[row][col + 1]
      const v01 = grid[row + 1][col]
      const v11 = grid[row + 1][col + 1]

      // Check if contour passes through this cell
      const vals = [v00, v10, v11, v01]
      const above = vals.filter(v => v >= level)
      const below = vals.filter(v => v < level)

      if (above.length === 0 || below.length === 0) continue

      // Cell coordinates
      const x0 = minLon + col * cellLonSize
      const y0 = minLat + row * cellLatSize
      const x1 = x0 + cellLonSize
      const y1 = y0 + cellLatSize

      // Find crossing points on edges and draw approximate contour
      const crossings = []

      // Top edge (v00, v10)
      if ((v00 - level) * (v10 - level) <= 0 && Math.abs(v10 - v00) > 1e-6) {
        const t = (level - v00) / (v10 - v00)
        crossings.push([x0 + t * cellLonSize, y0])
      }

      // Right edge (v10, v11)
      if ((v10 - level) * (v11 - level) <= 0 && Math.abs(v11 - v10) > 1e-6) {
        const t = (level - v10) / (v11 - v10)
        crossings.push([x1, y0 + t * cellLatSize])
      }

      // Bottom edge (v11, v01)
      if ((v11 - level) * (v01 - level) <= 0 && Math.abs(v01 - v11) > 1e-6) {
        const t = (level - v11) / (v01 - v11)
        crossings.push([x1 - t * cellLonSize, y1])
      }

      // Left edge (v01, v00)
      if ((v01 - level) * (v00 - level) <= 0 && Math.abs(v00 - v01) > 1e-6) {
        const t = (level - v01) / (v00 - v01)
        crossings.push([x0, y1 - t * cellLatSize])
      }

      // Add crossing points as line
      if (crossings.length >= 2) {
        lines.push({
          coordinates: crossings,
          level
        })
      }
    }
  }

  return lines
}

/**
 * Chain individual line segments into continuous polylines.
 */
function chainContourLines(lineSegments) {
  if (lineSegments.length === 0) return []

  const chains = []
  const used = new Set()

  for (let i = 0; i < lineSegments.length; i++) {
    if (used.has(i)) continue

    const start = lineSegments[i].coordinates
    const chain = [...start]
    used.add(i)

    // Try to chain with nearby segments
    let changed = true
    while (changed) {
      changed = false

      for (let j = 0; j < lineSegments.length; j++) {
        if (used.has(j)) continue

        const seg = lineSegments[j].coordinates
        if (seg.length < 2) continue

        const chainStart = chain[0]
        const chainEnd = chain[chain.length - 1]
        const segStart = seg[0]
        const segEnd = seg[seg.length - 1]

        const tolerance = 0.01

        // Check connections
        if (distance(chainEnd, segStart) < tolerance) {
          chain.push(...seg.slice(1))
          used.add(j)
          changed = true
          break
        } else if (distance(chainEnd, segEnd) < tolerance) {
          chain.push(...seg.slice(0, -1).reverse())
          used.add(j)
          changed = true
          break
        } else if (distance(chainStart, segEnd) < tolerance) {
          chain.unshift(...seg.slice(0, -1).reverse())
          used.add(j)
          changed = true
          break
        } else if (distance(chainStart, segStart) < tolerance) {
          chain.unshift(...seg.slice(1))
          used.add(j)
          changed = true
          break
        }
      }
    }

    if (chain.length >= 3) {
      chains.push(chain)
    }
  }

  return chains
}

function distance(p1, p2) {
  const dx = p1[0] - p2[0]
  const dy = p1[1] - p2[1]
  return Math.sqrt(dx * dx + dy * dy)
}

/**
 * Main contour generation function.
 * @param {Array} samples - Array of {lon, lat, value} objects
 * @param {Object} options - {numLevels, gridSize}
 * @returns {Object} GeoJSON FeatureCollection with contour LineString features
 */
export function generateContours(samples, options = {}) {
  const { numLevels = 8, gridSize = 50 } = options

  if (!samples || samples.length < 3) {
    return { type: 'FeatureCollection', features: [] }
  }

  // Create interpolated grid
  const gridData = createInterpolatedGrid(samples, gridSize)
  if (!gridData.grid || gridData.grid.length === 0) {
    return { type: 'FeatureCollection', features: [] }
  }

  // Generate levels
  const levels = generateLevels(gridData.grid, numLevels)
  const features = []

  // For each level, generate contour lines
  for (const level of levels) {
    const segments = generateContourForLevel(gridData.grid, level, gridData.bounds, gridData.cellSize)
    const chains = chainContourLines(segments)

    for (const chain of chains) {
      if (chain.length >= 2) {
        features.push({
          type: 'Feature',
          properties: {
            level: Number(level.toFixed(2)),
            type: 'contour'
          },
          geometry: {
            type: 'LineString',
            coordinates: chain
          }
        })
      }
    }
  }

  return {
    type: 'FeatureCollection',
    features
  }
}
