#!/usr/bin/env node
// Simple shapefile -> GeoJSON converter using the 'shapefile' npm package.
// Usage: node scripts/convert-shapefile.js <input.shp> <output.geojson>

const fs = require('fs')
const path = require('path')
const shapefile = require('shapefile')

async function convert(shpPath, outPath) {
  if (!fs.existsSync(shpPath)) {
    console.error('Input .shp not found:', shpPath)
    process.exitCode = 2
    return
  }

  const features = []
  try {
    const source = await shapefile.open(shpPath)
    while (true) {
      const result = await source.read()
      if (result.done) break
      // result.value: {type: 'Feature', properties: {...}, geometry: {...}}
      const v = result.value
      features.push({ type: 'Feature', properties: v.properties || {}, geometry: v.geometry || null })
    }
  } catch (err) {
    console.error('Failed to read shapefile:', err && err.stack ? err.stack : err)
    process.exitCode = 3
    return
  }

  const fc = { type: 'FeatureCollection', features }
  try {
    fs.writeFileSync(outPath, JSON.stringify(fc, null, 2), 'utf8')
    console.log('Wrote', outPath, 'with', features.length, 'features')
  } catch (err) {
    console.error('Failed to write output GeoJSON:', err)
    process.exitCode = 4
  }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.length < 2) {
    console.error('Usage: node scripts/convert-shapefile.js <input.shp> <output.geojson>')
    process.exitCode = 1
    return
  }
  const inShp = argv[0]
  const outGeo = argv[1]
  await convert(inShp, outGeo)
}

if (require.main === module) main()
