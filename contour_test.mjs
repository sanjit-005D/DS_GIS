import { generateContours } from './src/lib/contourGenerator.js'

const samples = []
for (let i = 0; i < 200; i++) {
  const lon = -1 + 2 * Math.random()
  const lat = 35 + 2 * Math.random()
  const value = Math.sin(lon * 3) * Math.cos(lat * 1.5) * 100 + 200
  samples.push({ lon, lat, value })
}

const spreadValues = [5, 25, 100, 320]
for (const spreadKm of spreadValues) {
  const start = performance.now()
  const result = generateContours(samples, { numLevels: 16, gridSize: 120, integralsMeta: { min: 50, max: 350 }, spreadKm })
  const end = performance.now()
  console.log(`spreadKm=${spreadKm} -> features=${result.features.length} timeMs=${(end-start).toFixed(2)}`)
}
