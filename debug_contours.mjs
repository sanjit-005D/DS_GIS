import { generateContours } from './src/lib/contourGenerator.js'
const samples = []
for (let i = 0; i < 50; i++) {
  const lon = -1 + 2 * Math.random()
  const lat = 35 + 2 * Math.random()
  const value = Math.sin(lon * 3) * Math.cos(lat * 1.5) * 100 + 200
  samples.push({ lon, lat, value })
}
const res = generateContours(samples, { numLevels: 8, gridSize: 80, spreadKm: 100 })
console.log('features:', res.features.length)
for (let i=0;i<Math.min(10,res.features.length);i++){
  const f=res.features[i]
  console.log(i, f.geometry.type, Object.keys(f.properties||{}), 'coords sample:', Array.isArray(f.geometry.coordinates)? (f.geometry.coordinates.length? f.geometry.coordinates[0]:null):null)
}
