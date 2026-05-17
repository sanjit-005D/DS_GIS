/**
 * Contour line generator using IDW interpolation, marching squares,
 * segment chaining, and Chaikin smoothing.
 */

function interpolateIDW(x, y, samples, power = 1.8) {
  if (!samples || samples.length === 0) return 0

  let totalWeight = 0
  let totalValue = 0
  let closestDistance = Infinity
  let closestValue = 0

  for (const sample of samples) {
    const dx = sample.lon - x
    const dy = sample.lat - y
    const distSq = dx * dx + dy * dy

    if (distSq === 0) return sample.value

    const distance = Math.sqrt(distSq)
    if (distance < closestDistance) {
      closestDistance = distance
      closestValue = sample.value
    }

    const weight = 1 / Math.pow(distance, power)
    totalWeight += weight
    totalValue += weight * sample.value
  }

  return totalWeight > 0 ? totalValue / totalWeight : closestValue
}

function createInterpolatedGrid(samples, gridSize = 64) {
  if (!samples || samples.length === 0) {
    return { grid: [], bounds: null, cellSize: null }
  }

  let minLon = samples[0].lon
  let maxLon = samples[0].lon
  let minLat = samples[0].lat
  let maxLat = samples[0].lat

  for (const sample of samples) {
    minLon = Math.min(minLon, sample.lon)
    maxLon = Math.max(maxLon, sample.lon)
    minLat = Math.min(minLat, sample.lat)
    maxLat = Math.max(maxLat, sample.lat)
  }

  const lonSpan = Math.max(0.01, maxLon - minLon)
  const latSpan = Math.max(0.01, maxLat - minLat)
  const lonPad = lonSpan * 0.12
  const latPad = latSpan * 0.12

  minLon -= lonPad
  maxLon += lonPad
  minLat -= latPad
  maxLat += latPad

  const effectiveGridSize = Math.max(24, Math.min(140, Math.round(gridSize)))
  const cellLonSize = (maxLon - minLon) / effectiveGridSize
  const cellLatSize = (maxLat - minLat) / effectiveGridSize

  const grid = []
  for (let row = 0; row <= effectiveGridSize; row++) {
    const lat = minLat + row * cellLatSize
    const rowValues = []
    for (let col = 0; col <= effectiveGridSize; col++) {
      const lon = minLon + col * cellLonSize
      rowValues.push(interpolateIDW(lon, lat, samples, 2))
    }
    grid.push(rowValues)
  }

  return {
    grid,
    bounds: { minLon, maxLon, minLat, maxLat },
    cellSize: { lon: cellLonSize, lat: cellLatSize },
    gridSize: effectiveGridSize
  }
}

function generateLevels(grid, numLevels = 10) {
  let min = Infinity
  let max = -Infinity

  for (const row of grid) {
    for (const value of row) {
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
  }

  if (min === Infinity || min === max) return []

  const levels = []
  const steps = Math.max(1, numLevels)
  for (let i = 1; i <= steps; i++) {
    levels.push(min + (i / (steps + 1)) * (max - min))
  }
  return levels
}

function generateLevelsFromRange(min, max, numLevels = 10) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return []
  const levels = []
  const steps = Math.max(1, numLevels)
  for (let i = 1; i <= steps; i++) {
    levels.push(min + (i / (steps + 1)) * (max - min))
  }
  return levels
}

function keyPoint(point, precision = 6) {
  return `${point[0].toFixed(precision)}:${point[1].toFixed(precision)}`
}

function interpolatePoint(p1, p2, v1, v2, level) {
  if (Math.abs(v2 - v1) < 1e-12) return [p1[0], p1[1]]
  const t = (level - v1) / (v2 - v1)
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]
}

function buildCellSegments(x0, y0, x1, y1, values, level) {
  const [tl, tr, br, bl] = values
  const top = interpolatePoint([x0, y0], [x1, y0], tl, tr, level)
  const right = interpolatePoint([x1, y0], [x1, y1], tr, br, level)
  const bottom = interpolatePoint([x1, y1], [x0, y1], br, bl, level)
  const left = interpolatePoint([x0, y1], [x0, y0], bl, tl, level)

  const mask = (tl >= level ? 8 : 0) | (tr >= level ? 4 : 0) | (br >= level ? 2 : 0) | (bl >= level ? 1 : 0)
  if (mask === 0 || mask === 15) return []

  const center = (tl + tr + br + bl) / 4
  const segments = []

  switch (mask) {
    case 1:
    case 14:
      segments.push([left, bottom])
      break
    case 2:
    case 13:
      segments.push([bottom, right])
      break
    case 3:
    case 12:
      segments.push([left, right])
      break
    case 4:
    case 11:
      segments.push([top, right])
      break
    case 5:
      if (center >= level) {
        segments.push([top, right], [left, bottom])
      } else {
        segments.push([top, left], [bottom, right])
      }
      break
    case 6:
    case 9:
      segments.push([top, bottom])
      break
    case 7:
    case 8:
      segments.push([top, left])
      break
    case 10:
      if (center >= level) {
        segments.push([top, left], [bottom, right])
      } else {
        segments.push([top, right], [left, bottom])
      }
      break
    default:
      break
  }

  return segments
}

function chainSegments(segments) {
  if (!segments.length) return []

  const unused = segments.map((segment) => segment.slice())
  const chains = []
  const precision = 6

  while (unused.length) {
    const chain = unused.pop()
    let extended = true

    while (extended) {
      extended = false
      const startKey = keyPoint(chain[0], precision)
      const endKey = keyPoint(chain[chain.length - 1], precision)

      for (let i = 0; i < unused.length; i++) {
        const segment = unused[i]
        const segStartKey = keyPoint(segment[0], precision)
        const segEndKey = keyPoint(segment[segment.length - 1], precision)

        if (endKey === segStartKey) {
          chain.push(...segment.slice(1))
          unused.splice(i, 1)
          extended = true
          break
        }
        if (endKey === segEndKey) {
          chain.push(...segment.slice(0, -1).reverse())
          unused.splice(i, 1)
          extended = true
          break
        }
        if (startKey === segEndKey) {
          chain.unshift(...segment.slice(0, -1))
          unused.splice(i, 1)
          extended = true
          break
        }
        if (startKey === segStartKey) {
          chain.unshift(...segment.slice(1).reverse())
          unused.splice(i, 1)
          extended = true
          break
        }
      }
    }

    chains.push(chain)
  }

  return chains
}

function chaikinSmooth(points, iterations = 2) {
  if (!Array.isArray(points) || points.length < 3) return points

  let current = points.map((point) => [point[0], point[1]])
  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = [current[0]]
    for (let i = 0; i < current.length - 1; i++) {
      const p0 = current[i]
      const p1 = current[i + 1]
      const q = [0.75 * p0[0] + 0.25 * p1[0], 0.75 * p0[1] + 0.25 * p1[1]]
      const r = [0.25 * p0[0] + 0.75 * p1[0], 0.25 * p0[1] + 0.75 * p1[1]]
      next.push(q, r)
    }
    next.push(current[current.length - 1])
    current = next
  }
  return current
}

export function generateContours(samples, options = {}) {
  const { numLevels = 8, gridSize = 80, integralsMeta = null } = options

  if (!samples || samples.length < 3) {
    return { type: 'FeatureCollection', features: [] }
  }

  const gridData = createInterpolatedGrid(samples, gridSize)
  if (!gridData.grid || gridData.grid.length === 0) {
    return { type: 'FeatureCollection', features: [] }
  }

  let levels
  if (integralsMeta && Number.isFinite(integralsMeta.min) && Number.isFinite(integralsMeta.max) && integralsMeta.max > integralsMeta.min) {
    levels = generateLevelsFromRange(integralsMeta.min, integralsMeta.max, numLevels)
  } else {
    levels = generateLevels(gridData.grid, numLevels)
  }
  const features = []

  for (const level of levels) {
    const segments = []
    const { minLon, minLat, maxLon, maxLat } = gridData.bounds
    const { lon: cellLonSize, lat: cellLatSize } = gridData.cellSize
    const rows = gridData.grid.length - 1
    const cols = gridData.grid[0].length - 1

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tl = gridData.grid[row][col]
        const tr = gridData.grid[row][col + 1]
        const br = gridData.grid[row + 1][col + 1]
        const bl = gridData.grid[row + 1][col]

        const x0 = minLon + col * cellLonSize
        const y0 = minLat + row * cellLatSize
        const x1 = x0 + cellLonSize
        const y1 = y0 + cellLatSize

        const cellSegments = buildCellSegments(x0, y0, x1, y1, [tl, tr, br, bl], level)
        for (const segment of cellSegments) segments.push(segment)
      }
    }

    const chains = chainSegments(segments)
    for (const chain of chains) {
      if (chain.length < 2) continue
      const smoothed = chaikinSmooth(chain, 2)
      if (smoothed.length < 2) continue
      features.push({
        type: 'Feature',
        properties: {
          level: Number(level.toFixed(2)),
          type: 'contour',
          minLon,
          maxLon,
          minLat,
          maxLat
        },
        geometry: {
          type: 'LineString',
          coordinates: smoothed
        }
      })
    }
  }

  return {
    type: 'FeatureCollection',
    features
  }
}
