// Offscreen MapLibre renderer for single tiles
// Renders a MapTiler/Mapbox style to a 256x256 canvas for a given tile z/x/y.
// This is a prototype helper intended for use with Cesium custom ImageryProviders.
// It dynamically imports maplibre from unpkg to avoid bundler pre-bundling problems.

export async function renderTileFromStyle({ styleUrl, apiKey, z, x, y, size = 256, format = 'image/png' }) {
  if (typeof window === 'undefined') throw new Error('renderTileFromStyle must run in a browser environment')

  // Dynamically load maplibre GL as an ESM module from unpkg to avoid build-time
  // resolver issues in dev. You can replace this with a local import if you
  // install maplibre-gl as a dependency.
  let maplibre
  try {
    maplibre = await import('https://unpkg.com/maplibre-gl@^2.6.0/dist/maplibre-gl.js?module')
  } catch (err) {
    // console.error('Failed to load maplibre-gl from CDN', err)
    throw err
  }

  // Helper: convert tile coordinates to geographic center (lon, lat)
  const tileCenterLonLat = (x, y, z) => {
    const n = Math.pow(2, z)
    const lon = (x + 0.5) / n * 360 - 180
    const latRadians = Math.atan(Math.sinh(Math.PI - 2 * Math.PI * (y + 0.5) / n))
    const lat = (latRadians * 180) / Math.PI
    return [lon, lat]
  }

  const [lon, lat] = tileCenterLonLat(x, y, z)

  // Create an offscreen container
  const container = document.createElement('div')
  container.style.width = `${size}px`
  container.style.height = `${size}px`
  container.style.position = 'absolute'
  container.style.left = '-9999px'
  container.style.top = '-9999px'
  document.body.appendChild(container)

  // Build style URL with API key when provided
  const styleWithKey = apiKey ? `${styleUrl}${styleUrl.includes('?') ? '&' : '?'}key=${apiKey}` : styleUrl

  // Create a maplibre map
  const map = new maplibre.Map({
    container: container,
    style: styleWithKey,
    center: [lon, lat],
    zoom: z,
    interactive: false,
    attributionControl: false,
    preserveDrawingBuffer: true,
    pitch: 0,
    bearing: 0
  })

  // Resize to exact tile size
  map.resize()

  // Wait for the map to finish rendering
  await new Promise((resolve, reject) => {
    const onIdle = () => {
      cleanupListeners()
      resolve()
    }
    const onError = (e) => {
      cleanupListeners()
      reject(e)
    }
    const cleanupListeners = () => {
      try { map.off('idle', onIdle) } catch (e) { void e }
      try { map.off('error', onError) } catch (e) { void e }
    }
    map.once('idle', onIdle)
    map.once('error', onError)
    // Fallback timeout in case 'idle' never fires
    setTimeout(() => { cleanupListeners(); resolve() }, 3000)
  })

  // Extract canvas image
  let dataUrl
  try {
    const canvas = map.getCanvas()
    dataUrl = canvas.toDataURL(format)
  } catch (e) {
    // console.error('Failed to read canvas from map', e)
    throw e
  }

  // Cleanup
  try { map.remove() } catch (e) { void e }
  try { container.parentNode && container.parentNode.removeChild(container) } catch (e) { void e }

  return dataUrl
}

// Note: This helper is intentionally minimal. For production use you should:
// - Cache generated tiles (in-memory and persistent) keyed by z/x/y/style
// - Reuse maplibre instances where possible (pool of renderers)
// - Respect MapTiler usage limits and caching headers
// - Consider server-side pre-rendering instead of client-side tile generation for performance
