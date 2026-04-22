import React, { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { db, isApiAvailable, setApiAvailable } from './apiClient'

// Clean, minimal Mapbox viewer. Kept intentionally small to avoid complex nested blocks
// that previously caused parser issues with the transform pipeline.
const ensureMapbox = () => {
  if (!HAS_MAPBOX_TOKEN) return Promise.resolve(maplibregl)
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.mapboxgl) return resolve(window.mapboxgl)
    if (!document.getElementById('mapbox-gl-css')) {
      const l = document.createElement('link')
      l.id = 'mapbox-gl-css'
      l.rel = 'stylesheet'
      l.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css'
      document.head.appendChild(l)
    }
    if (document.getElementById('mapbox-gl-js')) {
      const iv = setInterval(() => { if (window.mapboxgl) { clearInterval(iv); resolve(window.mapboxgl) } }, 100)
      return
    }
    const s = document.createElement('script')
    s.id = 'mapbox-gl-js'
    s.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js'
    s.async = true
    s.onload = () => { if (window.mapboxgl) resolve(window.mapboxgl); else reject(new Error('mapbox-gl failed to load')) }
    s.onerror = (e) => reject(e)
    document.body.appendChild(s)
  })
}

const MAPBOX_TOKEN = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAPBOX_TOKEN)
  ? String(import.meta.env.VITE_MAPBOX_TOKEN).trim()
  : ''

const HAS_MAPBOX_TOKEN = Boolean(MAPBOX_TOKEN)

function getStyleByLayer(layer) {
  if (HAS_MAPBOX_TOKEN) {
    const mapboxStyles = {
      gibs: 'mapbox://styles/mapbox/satellite-streets-v11',
      street: 'mapbox://styles/mapbox/outdoors-v12',
      light: 'mapbox://styles/mapbox/light-v11'
    }
    if (mapboxStyles[layer]) return mapboxStyles[layer]
    return mapboxStyles.gibs
  }

  return {
    version: 8,
    sources: {
      'osm-raster': {
        type: 'raster',
        tiles: ['https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution: 'OpenStreetMap contributors, CARTO'
      }
    },
    layers: [
      {
        id: 'osm-raster-layer',
        type: 'raster',
        source: 'osm-raster',
        minzoom: 0,
        maxzoom: 22
      }
    ]
  }
}

function getMapProjection() {
  return HAS_MAPBOX_TOKEN ? 'globe' : 'mercator'
}

function applyMapBackdrop(map) {
  try {
    if (!map) return
    if (HAS_MAPBOX_TOKEN) {
      if (typeof map.setLight === 'function') {
        map.setLight({
          anchor: 'map',
          position: [1.5, 90, 80],
          'position-transition': { duration: 0 }
        })
      }
      if (typeof map.setFog === 'function') {
        map.setFog({
          'range': [0.6, 8],
          'horizon-blend': 0,
          'color': 'rgba(255,255,255,0)',
          'high-color': 'rgba(255,255,255,0)',
          'space-color': 'rgb(11, 11, 25)',
          'star-intensity': 0.6
        })
      }
      return
    }

    if (typeof map.setFog === 'function') map.setFog(null)
    if (typeof map.setLight === 'function') {
      map.setLight({
        anchor: 'viewport',
        position: [0, 0, 0],
        intensity: 0.35,
        'position-transition': { duration: 0 }
      })
    }
  } catch (e) { void e }
}
// (Reverted) keep style selection dynamic based on `selectedLayer`

// Top-level palettes and helper so they're stable across renders
const PALETTES = {
  // Basic and standard color scales (at top)
  default: ['#d7191c', '#fdae61', '#ffffbf', '#abdda4', '#2b83ba'],
  jet: ['#00007F', '#0000FF', '#00FFFF', '#FFFF00', '#FF0000', '#7F0000'],
  hot: ['#000000', '#8B0000', '#FF4500', '#FFD700', '#FFFF00', '#FFFFFF'],
  cool: ['#00FFFF', '#00BFFF', '#8A2BE2', '#FF00FF'],
  bone: ['#000000', '#2F4F4F', '#708090', '#A9C8C8', '#FFFFFF'],
  copper: ['#000000', '#4E2F0E', '#8B4513', '#CD853F', '#FFC77F'],
  gray: ['#000000', '#404040', '#808080', '#C0C0C0', '#FFFFFF'],
  rainbow: ['#9400D3', '#4B0082', '#0000FF', '#00FF00', '#FFFF00', '#FF7F00', '#FF0000'],
  spectral: ['#9E0142', '#D53E4F', '#F46D43', '#FDAE61', '#FEE08B', '#E6F598', '#ABDDA4', '#66C2A5', '#3288BD', '#5E4FA2'],
  coolwarm: ['#3B4CC0', '#6788EE', '#9ABBFF', '#C9D7F0', '#EDD1C2', '#F7A889', '#E26952', '#B40426'],
  // Scientific/matplotlib palettes
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  plasma: ['#0d0887', '#6a00a8', '#b12a90', '#f16363', '#fca636'],
  inferno: ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a'],
  magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d'],
  turbo: ['#30123b', '#3f45a3', '#2ca02c', '#f6c300', '#f13b3b']
}

function makeColorExpressionStatic(meta, cmap = 'viridis') {
  try {
    if (!meta || meta.min === undefined || meta.max === undefined) return '#ff2d55'
    const min = Number(meta.min), max = Number(meta.max)
    if (!isFinite(min) || !isFinite(max) || max <= min) return '#ff2d55'
    const palette = PALETTES[cmap] || PALETTES.viridis
    // Reverse palette so low values get the first color, high values get the last color
    const reversedPalette = [...palette].reverse()
    const n = reversedPalette.length
    const pairs = []
    for (let i = 0; i < n; i++) {
      const value = min + (i / (n - 1)) * (max - min)
      pairs.push([value, reversedPalette[i]])
    }
    // build safe interpolate expression (sorted, unique stop values)
    return buildInterpolate(['coalesce', ['get', 'intVal'], min], pairs)
  } catch (e) { void e; return '#ff2d55' }
}

// build a safe 3-stop interpolate expression [min -> mid -> max] with colors blue->yellow->red
function makeThreeStopExpression(meta) {
  try {
    if (!meta || meta.min === undefined || meta.max === undefined) return '#ff2d55'
    const min = Number(meta.min)
    const max = Number(meta.max)
    if (!isFinite(min) || !isFinite(max) || max <= min) return '#ff2d55'
    const mid = min + (max - min) / 2
    // use safe builder to guarantee ascending stop inputs
    return buildInterpolate(['coalesce', ['get', 'intVal'], min], [[min, '#2b83ba'], [mid, '#ffffbf'], [max, '#d7191c']])
  } catch (e) { void e; return '#ff2d55' }
}

// Helper: construct an interpolate expression from an input expression and
// an array of [value,color] pairs. Ensures values are finite, sorted and unique.
function buildInterpolate(inputExpr, pairs) {
  try {
    if (!Array.isArray(pairs) || pairs.length === 0) return '#ff2d55'
    const cleaned = pairs.map(p => [Number(p[0]), p[1]]).filter(p => Number.isFinite(p[0]) && p[1])
    if (cleaned.length === 0) return '#ff2d55'
    cleaned.sort((a, b) => a[0] - b[0])
    const uniq = []
    for (const [v, c] of cleaned) {
      if (uniq.length === 0 || uniq[uniq.length - 1][0] !== v) uniq.push([v, c])
    }
    if (uniq.length === 0) return '#ff2d55'
    if (uniq.length === 1) return uniq[0][1]
    const expr = ['interpolate', ['linear'], inputExpr]
    for (const [v, c] of uniq) { expr.push(v, c) }
    return expr
  } catch (e) { void e; return '#ff2d55' }
}

function makeGroupColorExpression(groupAssignments = {}, groupColors = [], fallback = '#ff2d55') {
  try {
    const entries = Object.entries(groupAssignments || {})
    if (!entries.length) return fallback
    const colors = Array.isArray(groupColors) && groupColors.length ? groupColors : ['#e63946', '#2a9d8f', '#457b9d']
    const expr = ['match', ['to-string', ['get', 'id']]]
    for (const [sampleId, gidRaw] of entries) {
      const gid = Number(gidRaw)
      const color = colors[((Number.isFinite(gid) ? gid : 0) % colors.length + colors.length) % colors.length]
      expr.push(String(sampleId), color)
    }
    expr.push(fallback)
    return expr
  } catch (e) { void e; return fallback }
}

function resolveSampleCircleColorExpression({ groupingActive = false, groupAssignments = {}, groupColors = [], surfaceOverlayEnabled = false, integralsMeta = null, selectedPalette = 'viridis' }) {
  if (groupingActive) return makeGroupColorExpression(groupAssignments, groupColors, '#ff2d55')
  void surfaceOverlayEnabled
  return makeColorExpressionStatic(integralsMeta, selectedPalette)
}

function getReversedPalette(cmap = 'viridis') {
  const palette = PALETTES[cmap] || PALETTES.viridis
  return [...palette].reverse()
}

function makeHeatmapColorExpression(cmap = 'viridis') {
  const rev = getReversedPalette(cmap)
  if (!rev.length) return ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 1, 'rgba(255,45,85,1)']
  const n = rev.length
  const expr = ['interpolate', ['linear'], ['heatmap-density']]
  // Keep very low density transparent so baseline fill is visible.
  expr.push(0, 'rgba(0,0,0,0)')
  for (let i = 0; i < n; i++) {
    const stop = 0.08 + (i / Math.max(1, n - 1)) * 0.92
    expr.push(stop, rev[i])
  }
  return expr
}

function destinationPoint(lon, lat, distanceKm, bearingDeg = 90) {
  const R = 6371
  const d = Math.max(0, Number(distanceKm) || 0) / R
  const brng = (Number(bearingDeg) || 0) * Math.PI / 180
  const lat1 = (Number(lat) || 0) * Math.PI / 180
  const lon1 = (Number(lon) || 0) * Math.PI / 180

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  )
  const lon2 = lon1 + Math.atan2(
    Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
  )

  return {
    lon: ((lon2 * 180 / Math.PI + 540) % 360) - 180,
    lat: lat2 * 180 / Math.PI
  }
}

function kmRadiusToPixels(map, radiusKm) {
  try {
    if (!map || typeof map.project !== 'function' || typeof map.getCenter !== 'function') return 0
    const center = map.getCenter()
    if (!center) return 0
    const srcLon = Number(center.lng)
    const srcLat = Number(center.lat)
    if (!Number.isFinite(srcLon) || !Number.isFinite(srcLat)) return 0

    const dst = destinationPoint(srcLon, srcLat, Math.max(0, Number(radiusKm) || 0), 90)
    const p1 = map.project([srcLon, srcLat])
    const p2 = map.project([dst.lon, dst.lat])
    const dx = Number(p2.x) - Number(p1.x)
    const dy = Number(p2.y) - Number(p1.y)
    const px = Math.sqrt(dx * dx + dy * dy)
    return Number.isFinite(px) ? px : 0
  } catch (e) { void e; return 0 }
}

export default function MapboxViewer({ className, selectedLayer = 'gibs', onCameraChange, showSamples = true, showLabels = true, selectedTable, selectedIdColumn, onMarkerClick, homeRequest = 0, integrals = null, integralsMeta = null, selectedPalette = 'viridis', useNormalized = false, surfaceOverlayEnabled = true, contourOverlayEnabled = false, spreadDiameterKm = 320, overlayOpacity = 0.45, groupingEnabled = false, groupingMethod = 'pca', groupAssignments = {}, groupColors = [] }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const lastSamplesGeoRef = useRef(null)
  const onCameraChangeRef = useRef(onCameraChange)
  const onMarkerClickRef = useRef(onMarkerClick)
  const showSamplesRef = useRef(showSamples)
  const selectedLayerRef = useRef(selectedLayer)
  const selectedPaletteRef = useRef(selectedPalette)
  const integralsMetaRef = useRef(integralsMeta)
  const groupingEnabledRef = useRef(groupingEnabled)
  const groupingMethodRef = useRef(groupingMethod)
  const groupAssignmentsRef = useRef(groupAssignments)
  const groupColorsRef = useRef(groupColors)
  const samplesLoadInFlightRef = useRef(false)
  const isGroupingActive = selectedLayer === 'light' && groupingEnabled && (groupingMethod === 'pca' || groupingMethod === 'clustering' || groupingMethod === 'rf')
  const isGroupingRenderable = isGroupingActive && Object.keys(groupAssignments || {}).length > 0

  const applySharedSpaceAmbience = React.useCallback((map) => {
    applyMapBackdrop(map)
  }, [])

  const ensureOverlayLayers = React.useCallback((map) => {
    try {
      if (!map || !map.getSource || !map.getLayer || !map.addLayer || !map.addSource) return

      if (!map.getLayer('samples-heatmap')) {
        const heatLayer = {
          id: 'samples-heatmap',
          type: 'heatmap',
          source: 'samples',
          layout: { visibility: 'none' },
          paint: {
            'heatmap-weight': ['max', 0.18, ['coalesce', ['get', 'intNorm'], 0]],
            'heatmap-intensity': 1.35,
            'heatmap-color': makeHeatmapColorExpression(selectedPalette),
            'heatmap-radius': 22,
            'heatmap-opacity': Math.max(0, Math.min(1, Number(overlayOpacity) || 0))
          }
        }
        if (map.getLayer('samples-layer')) map.addLayer(heatLayer, 'samples-layer')
        else map.addLayer(heatLayer)
      }

      if (!map.getLayer('samples-spread')) {
        const spreadLayer = {
          id: 'samples-spread',
          type: 'circle',
          source: 'samples',
          layout: { visibility: 'none' },
          paint: {
            'circle-color': resolveSampleCircleColorExpression({ groupingActive: isGroupingRenderable, groupAssignments, groupColors, surfaceOverlayEnabled: false, integralsMeta, selectedPalette }),
            'circle-radius': 22,
            'circle-blur': 0.9,
            'circle-opacity': Math.max(0, Math.min(1, Number(overlayOpacity) || 0))
          }
        }
        if (map.getLayer('samples-layer')) map.addLayer(spreadLayer, 'samples-layer')
        else map.addLayer(spreadLayer)
      }

      const contourLayerDefs = [
        { id: 'samples-contour-r1', factor: 0.28, alpha: 0.90 },
        { id: 'samples-contour-r2', factor: 0.42, alpha: 0.86 },
        { id: 'samples-contour-r3', factor: 0.56, alpha: 0.82 },
        { id: 'samples-contour-r4', factor: 0.70, alpha: 0.78 },
        { id: 'samples-contour-r5', factor: 0.84, alpha: 0.74 },
        { id: 'samples-contour-r6', factor: 1.00, alpha: 0.70 }
      ]
      for (const def of contourLayerDefs) {
        if (!map.getLayer(def.id)) {
          const layer = {
            id: def.id,
            type: 'circle',
            source: 'samples',
            layout: { visibility: 'none' },
            paint: {
              'circle-color': 'rgba(0,0,0,0)',
              'circle-radius': 12,
              'circle-stroke-color': '#000000',
              'circle-stroke-width': 0.8,
              'circle-stroke-opacity': def.alpha
            }
          }
          if (map.getLayer('samples-layer')) map.addLayer(layer, 'samples-layer')
          else map.addLayer(layer)
        }
      }
    } catch (e) { void e }
  }, [surfaceOverlayEnabled, contourOverlayEnabled, selectedPalette, overlayOpacity, isGroupingRenderable, groupAssignments, groupColors, integralsMeta])

  const applyOverlayStyling = React.useCallback((map) => {
    try {
      if (!map || !map.getLayer || !map.setPaintProperty || !map.setLayoutProperty) return
      const clampedOpacity = Math.max(0, Math.min(1, Number(overlayOpacity) || 0))
      const spreadOverlayMode = surfaceOverlayEnabled
      const contourMode = spreadOverlayMode && contourOverlayEnabled && !isGroupingRenderable
      // Spread slider is interpreted as a true geodesic radius in km.
      // Pixel radius is derived from current zoom/projection, so zooming out shrinks it naturally.
      const radiusPx = Math.max(0.25, kmRadiusToPixels(map, Math.max(1, Number(spreadDiameterKm) || 1)))

      if (map.getLayer('samples-heatmap')) {
        map.setLayoutProperty('samples-heatmap', 'visibility', contourMode ? 'visible' : 'none')
        map.setPaintProperty('samples-heatmap', 'heatmap-weight', ['max', 0.18, ['coalesce', ['get', 'intNorm'], 0]])
        map.setPaintProperty('samples-heatmap', 'heatmap-intensity', 1.35)
        map.setPaintProperty('samples-heatmap', 'heatmap-color', makeHeatmapColorExpression(selectedPalette))
        map.setPaintProperty('samples-heatmap', 'heatmap-radius', radiusPx)
        map.setPaintProperty('samples-heatmap', 'heatmap-opacity', contourMode ? Math.min(1, clampedOpacity * 0.95) : clampedOpacity)
      }

      if (map.getLayer('samples-spread')) {
        const spreadColorExpr = resolveSampleCircleColorExpression({
          groupingActive: isGroupingRenderable,
          groupAssignments,
          groupColors,
          surfaceOverlayEnabled: false,
          integralsMeta,
          selectedPalette
        })
        map.setLayoutProperty('samples-spread', 'visibility', spreadOverlayMode && !contourMode ? 'visible' : 'none')
        map.setPaintProperty('samples-spread', 'circle-color', spreadColorExpr)
        map.setPaintProperty('samples-spread', 'circle-radius', radiusPx)
        map.setPaintProperty('samples-spread', 'circle-blur', 0.92)
        map.setPaintProperty('samples-spread', 'circle-opacity', clampedOpacity)
      }

      const contourLayerDefs = [
        { id: 'samples-contour-r1', factor: 0.28, alpha: 0.90 },
        { id: 'samples-contour-r2', factor: 0.42, alpha: 0.86 },
        { id: 'samples-contour-r3', factor: 0.56, alpha: 0.82 },
        { id: 'samples-contour-r4', factor: 0.70, alpha: 0.78 },
        { id: 'samples-contour-r5', factor: 0.84, alpha: 0.74 },
        { id: 'samples-contour-r6', factor: 1.00, alpha: 0.70 }
      ]
      for (const def of contourLayerDefs) {
        if (!map.getLayer(def.id)) continue
        map.setLayoutProperty(def.id, 'visibility', contourMode ? 'visible' : 'none')
        map.setPaintProperty(def.id, 'circle-color', 'rgba(0,0,0,0)')
        map.setPaintProperty(def.id, 'circle-radius', Math.max(0.25, radiusPx * def.factor))
        map.setPaintProperty(def.id, 'circle-stroke-color', '#000000')
        map.setPaintProperty(def.id, 'circle-stroke-width', ['interpolate', ['linear'], ['zoom'], 2, 0.35, 5, 0.6, 8, 0.9, 11, 1.2])
        map.setPaintProperty(def.id, 'circle-stroke-opacity', Math.max(0.1, Math.min(1, def.alpha * clampedOpacity * 1.15)))
      }

      if (map.getLayer('samples-layer')) {
        const markerColorExpr = resolveSampleCircleColorExpression({
          groupingActive: isGroupingRenderable,
          groupAssignments,
          groupColors,
          surfaceOverlayEnabled: false,
          integralsMeta,
          selectedPalette
        })
        if (isGroupingRenderable) {
          map.setPaintProperty('samples-layer', 'circle-color', markerColorExpr)
          map.setPaintProperty('samples-layer', 'circle-radius', 5.5)
          map.setPaintProperty('samples-layer', 'circle-stroke-color', '#ffffff')
          map.setPaintProperty('samples-layer', 'circle-stroke-width', 1.3)
          map.setPaintProperty('samples-layer', 'circle-opacity', 0.96)
        } else if (spreadOverlayMode) {
          map.setPaintProperty('samples-layer', 'circle-color', markerColorExpr)
          map.setPaintProperty('samples-layer', 'circle-radius', 4.8)
          map.setPaintProperty('samples-layer', 'circle-stroke-color', '#ffffff')
          map.setPaintProperty('samples-layer', 'circle-stroke-width', 1)
          map.setPaintProperty('samples-layer', 'circle-opacity', 0.96)
        } else {
          map.setPaintProperty('samples-layer', 'circle-color', markerColorExpr)
          map.setPaintProperty('samples-layer', 'circle-radius', 6)
          map.setPaintProperty('samples-layer', 'circle-stroke-color', '#ffffff')
          map.setPaintProperty('samples-layer', 'circle-stroke-width', 1.4)
          map.setPaintProperty('samples-layer', 'circle-opacity', 0.96)
        }
      }
    } catch (e) { void e }
  }, [overlayOpacity, spreadDiameterKm, surfaceOverlayEnabled, contourOverlayEnabled, selectedPalette, integralsMeta, isGroupingRenderable, groupAssignments, groupColors])

  // keep refs updated so event handlers don't need effect re-registration
  useEffect(() => { onCameraChangeRef.current = onCameraChange }, [onCameraChange])
  useEffect(() => { onMarkerClickRef.current = onMarkerClick }, [onMarkerClick])
  useEffect(() => { showSamplesRef.current = showSamples }, [showSamples])
  useEffect(() => { selectedLayerRef.current = selectedLayer }, [selectedLayer])
  useEffect(() => { selectedPaletteRef.current = selectedPalette }, [selectedPalette])
  useEffect(() => { integralsMetaRef.current = integralsMeta }, [integralsMeta])
  useEffect(() => { groupingEnabledRef.current = groupingEnabled }, [groupingEnabled])
  useEffect(() => { groupingMethodRef.current = groupingMethod }, [groupingMethod])
  useEffect(() => { groupAssignmentsRef.current = groupAssignments }, [groupAssignments])
  useEffect(() => { groupColorsRef.current = groupColors }, [groupColors])

  

  // helper to load samples into the map source
  const loadSamples = React.useCallback(async (map) => {
    if (samplesLoadInFlightRef.current) return
    samplesLoadInFlightRef.current = true
    try {
      // clear last-known geojson until we successfully fetch new rows
      try { lastSamplesGeoRef.current = null } catch (e) { void e }
      if (!isApiAvailable()) {
        // do not attempt to fetch if API earlier reported as unavailable
        if (map.getSource && map.getSource('samples')) map.getSource('samples').setData({ type: 'FeatureCollection', features: [] })
        return
      }
      if (!map) return
      const { data: rows, error } = await db.from(selectedTable || 'v_complete_spectral_data').select('*')
      if (error) throw error
      if (!rows || !rows.length) {
        if (map.getSource && map.getSource('samples')) map.getSource('samples').setData({ type: 'FeatureCollection', features: [] })
        return
      }

      
      const features = []
      const parseGeo = (row) => {
        if (!row) return null
        const maybeNum = (v) => (v == null ? null : (typeof v === 'number' ? v : (Number(v))))
        const lonCandidates = [row.lon, row.longitude, row.lng, row.x, row.lon_e]
        const latCandidates = [row.lat, row.latitude, row.lat_n, row.y]
        for (let i = 0; i < lonCandidates.length; i++) {
          const lo = maybeNum(lonCandidates[i])
          const la = maybeNum(latCandidates[i])
          if (Number.isFinite(lo) && Number.isFinite(la)) return [lo, la]
        }
        const raw = String(row.geo_tag ?? row.geo ?? row.location ?? row.geom ?? '')
        if (raw) {
          try {
            const j = JSON.parse(raw)
            if (j && j.type === 'Point' && Array.isArray(j.coordinates) && j.coordinates.length >= 2) {
              const [lx, ly] = j.coordinates; if (Number.isFinite(Number(lx)) && Number.isFinite(Number(ly))) return [Number(lx), Number(ly)]
            }
            if (j && j.coordinates && Array.isArray(j.coordinates) && j.coordinates.length >= 2) {
              const [lx, ly] = j.coordinates; if (Number.isFinite(Number(lx)) && Number.isFinite(Number(ly))) return [Number(lx), Number(ly)]
            }
          } catch (e) { void e; /* not JSON */ }
          const point = raw.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i)
          if (point) { const lx = Number(point[1]), ly = Number(point[2]); if (Number.isFinite(lx) && Number.isFinite(ly)) return [lx, ly] }
          const csv = raw.match(/^\s*(-?\d+(?:\.\d+)?)[,\s]+(-?\d+(?:\.\d+)?)\s*$/)
          if (csv) {
            const a = Number(csv[1]), b = Number(csv[2])
            if (a >= -90 && a <= 90 && b >= -180 && b <= 180) return [b, a]
            if (a >= -180 && a <= 180 && b >= -90 && b <= 90) return [a, b]
          }
        }
        return null
      }
      for (const r of rows) {
        try {
          const coords = parseGeo(r)
          if (!coords) continue
          const [lon, lat] = coords
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
          const id = String(r[selectedIdColumn || 'id'] ?? r['S.No'] ?? r.sno ?? '')
          // attach precomputed integral value (if provided by parent) for coloring
          const intVal = integrals && integrals[id] !== undefined ? Number(integrals[id]) : null
          const grp = (isGroupingRenderable && groupAssignments && groupAssignments[id] !== undefined)
            ? Number(groupAssignments[id])
            : null
          const norm = (intVal !== null && integralsMeta && Number.isFinite(Number(integralsMeta.min)) && Number.isFinite(Number(integralsMeta.max)) && Number(integralsMeta.max) > Number(integralsMeta.min))
            ? Math.max(0, Math.min(1, (Number(intVal) - Number(integralsMeta.min)) / (Number(integralsMeta.max) - Number(integralsMeta.min))))
            : 0
          features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { id, raw: r, intVal, intNorm: norm, grp } })
        } catch (e) { void e; /* ignore per-row errors */ }
      }
  const geojson = { type: 'FeatureCollection', features }
  lastSamplesGeoRef.current = geojson
  if (!map.getSource('samples')) map.addSource('samples', { type: 'geojson', data: geojson })
  else map.getSource('samples').setData(geojson)
      if (!map.getLayer('samples-layer')) {
        map.addLayer({
          id: 'samples-layer',
          type: 'circle',
          source: 'samples',
          layout: {
            'visibility': 
            showSamples ? 'visible' : 'none'
          },
          paint: {
            'circle-radius': 6,
            'circle-color': resolveSampleCircleColorExpression({ groupingActive: isGroupingRenderable, groupAssignments, groupColors, surfaceOverlayEnabled, integralsMeta, selectedPalette }),
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.4
          }
        })
      } else {
        map.setLayoutProperty('samples-layer', 'visibility', showSamples ? 'visible' : 'none')
      }
      ensureOverlayLayers(map)
      applyOverlayStyling(map)
    } catch (err) { /* console.warn('Failed to load samples', err); */ }
    finally { samplesLoadInFlightRef.current = false }
  }, [selectedTable, selectedIdColumn, showSamples, integrals, integralsMeta, selectedPalette, ensureOverlayLayers, applyOverlayStyling, isGroupingRenderable, groupAssignments, groupColors, surfaceOverlayEnabled])

  function makeThreeStopExpressionPalette(meta, cmap = 'viridis') {
    try {
      if (!meta || meta.min === undefined || meta.max === undefined) return '#ff2d55'
      const min = Number(meta.min)
      const max = Number(meta.max)
      if (!isFinite(min) || !isFinite(max) || max <= min) return '#ff2d55'
      const mid = min + (max - min) / 2
      const palette = PALETTES[cmap] || PALETTES.viridis
      // Reverse palette so low values get the first color, high values get the last color
      const reversedPalette = [...palette].reverse()
      const first = reversedPalette[0]
      const middle = reversedPalette[Math.floor(reversedPalette.length / 2)]
      const last = reversedPalette[reversedPalette.length - 1]
      return buildInterpolate(['coalesce', ['get', 'intVal'], min], [[min, first], [mid, middle], [max, last]])
    } catch (e) { void e; return '#ff2d55' }
  }

  

  // keep a ref to the latest loadSamples so handlers attached once can call the up-to-date function
  const loadSamplesRef = useRef(loadSamples)
  useEffect(() => { loadSamplesRef.current = loadSamples }, [loadSamples])
  const ensureOverlayLayersRef = useRef(ensureOverlayLayers)
  useEffect(() => { ensureOverlayLayersRef.current = ensureOverlayLayers }, [ensureOverlayLayers])
  const applyOverlayStylingRef = useRef(applyOverlayStyling)
  useEffect(() => { applyOverlayStylingRef.current = applyOverlayStyling }, [applyOverlayStyling])

  // Ensure we force-refresh samples whenever the selected table changes.
  // Some environments keep the source/layer and only update data; calling
  // loadSamples immediately here guarantees the map shows the newly selected table.
  useEffect(() => {
    try {
      const map = mapRef.current
      if (!map) return
      // clear any previously cached geojson briefly while loading new data
      try { if (map.getSource && map.getSource('samples')) map.getSource('samples').setData({ type: 'FeatureCollection', features: [] }) } catch (e) { void e }
      if (loadSamplesRef.current) {
        try { loadSamplesRef.current(map) } catch (e) { /* console.warn('loadSamples error on selectedTable change', e) */ }
      }
    } catch (e) { void e }
  }, [selectedTable])

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const mapboxgl = await ensureMapbox()
        if (cancelled) return
        if (HAS_MAPBOX_TOKEN) {
          mapboxgl.accessToken = MAPBOX_TOKEN || ''
        }

        const style = getStyleByLayer(selectedLayerRef.current)
        const map = new mapboxgl.Map({ 
          container: containerRef.current, 
          style, 
          center: [78.9629, 20.5937], 
          zoom: 1.74,  // Approximately 300,000m altitude
          projection: getMapProjection(),
          attributionControl: false // Disable default attribution to add custom one
        })
        mapRef.current = map

  try { map.addControl(new mapboxgl.NavigationControl()) } catch (e) { void e; /* ignore */ }
  // Add a compact attribution control in the bottom-right so Mapbox credits appear at the app's bottom-right
  try { map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right') } catch (e) { void e; /* ignore */ }
  // allow mouse wheel to zoom the globe (enable scrollZoom)
  try { if (map && map.scrollZoom && typeof map.scrollZoom.enable === 'function') map.scrollZoom.enable() } catch (e) { void e; /* ignore */ }

      
  map.on('load', async () => {
              try { applySharedSpaceAmbience(map) } catch (e) { void e }
              // load samples when style ready (use ref to latest function)
              try {
                if (loadSamplesRef.current) await loadSamplesRef.current(map)
                // ensure samples-layer visibility and paint defaults after creation
                if (map.getLayer && map.getLayer('samples-layer')) {
                  try {
                    map.setLayoutProperty('samples-layer', 'visibility', showSamplesRef.current ? 'visible' : 'none')
                    // default paint after style load
                    const grouped = selectedLayerRef.current === 'light' && groupingEnabledRef.current && (groupingMethodRef.current === 'pca' || groupingMethodRef.current === 'clustering' || groupingMethodRef.current === 'rf') && Object.keys(groupAssignmentsRef.current || {}).length > 0
                    map.setPaintProperty('samples-layer', 'circle-color', resolveSampleCircleColorExpression({
                      groupingActive: grouped,
                      groupAssignments: groupAssignmentsRef.current,
                      groupColors: groupColorsRef.current,
                      surfaceOverlayEnabled: surfaceOverlayEnabled,
                      integralsMeta: integralsMetaRef.current,
                      selectedPalette: selectedPaletteRef.current
                    }))
                  } catch (e) { void e; /* ignore */ }
                }
              } catch (e) { /* console.warn('loadSamples error on style load', e) */ }
        })
        // also handle subsequent style loads (setStyle) so sources/layers are re-added
        map.on('style.load', async () => {
          // Country labels removed - GeoJSON file not available
          try { } catch (e) { /* console.warn('Map style.load error', e) */ }
      try { applySharedSpaceAmbience(map) } catch (e) { void e }

          try {
            const hasSamplesSource = Boolean(map.getSource && map.getSource('samples'))
            const hasSamplesLayer = Boolean(map.getLayer && map.getLayer('samples-layer'))
            if ((!hasSamplesSource || !hasSamplesLayer) && loadSamplesRef.current) await loadSamplesRef.current(map)
            try {
              if (ensureOverlayLayersRef.current) ensureOverlayLayersRef.current(map)
              if (applyOverlayStylingRef.current) applyOverlayStylingRef.current(map)
            } catch (e) { void e }
            if (map.getLayer && map.getLayer('samples-layer')) {
              try { map.setLayoutProperty('samples-layer', 'visibility', showSamplesRef.current ? 'visible' : 'none') } catch (e) { void e; /* ignore */ }
            }
          } catch (e) { /* console.warn('loadSamples error on style.load', e) */ }
        })

        map.on('move', () => {
          try {
            const c = map.getCenter(); const z = map.getZoom()
            if (typeof onCameraChangeRef.current === 'function') onCameraChangeRef.current({ lat: c.lat, lon: c.lng, alt: Math.round(1000000 / Math.pow(2, z)) })
            try { if (applyOverlayStylingRef.current) applyOverlayStylingRef.current(map) } catch (e) { void e }
          } catch (e) { void e; /* ignore */ }
        })

        map.on('click', (ev) => {
          try {
            const layers = []
            if (map.getLayer('samples-layer')) layers.push('samples-layer')
            if (map.getLayer('samples-spread')) layers.push('samples-spread')
            if (map.getLayer('samples-heatmap')) layers.push('samples-heatmap')
            if (!layers.length) return

            let features = map.queryRenderedFeatures(ev.point, { layers })
            if ((!features || !features.length) && typeof map.queryRenderedFeatures === 'function') {
              // Fallback: take any rendered feature from samples source at click point.
              features = (map.queryRenderedFeatures(ev.point) || []).filter((item) => item?.source === 'samples')
            }

            const picked = (features || []).find((feat) => feat?.properties)
            if (picked && typeof onMarkerClickRef.current === 'function') {
              onMarkerClickRef.current(picked.properties)
            }
          } catch (e) { /* console.warn('Click handler error:', e) */ }
        })

        // Add pointer cursor on hover over markers
        map.on('mouseenter', 'samples-layer', () => {
          try { map.getCanvas().style.cursor = 'pointer' } catch (e) { void e }
        })
        map.on('mouseleave', 'samples-layer', () => {
          try { map.getCanvas().style.cursor = '' } catch (e) { void e }
        })
        
        // Create a popup for showing S.No on hover
        const PopupCtor = mapboxgl.Popup || (window.mapboxgl && window.mapboxgl.Popup)
        const popup = new PopupCtor({
          closeButton: false,
          closeOnClick: false,
          offset: 10,
          className: 'sample-tooltip'
        })
        
        // Show S.No tooltip on hover
        map.on('mousemove', 'samples-layer', (e) => {
          try {
            if (e.features && e.features.length > 0) {
              const feature = e.features[0]
              const sno = feature.properties?.id || 'N/A'
              // Try to get intVal from properties (might be stringified)
              let intVal = feature.properties?.intVal
              if (typeof intVal === 'string') {
                intVal = parseFloat(intVal)
              }
              
              let tooltipContent = `S.No: ${sno}`
              
              // If intVal exists (X1/X2 is set and cursor mode is active), show intensity
              if (intVal !== null && intVal !== undefined && !isNaN(intVal) && isFinite(intVal)) {
                tooltipContent += `<br/>Intensity: ${Number(intVal).toFixed(4)}`
              }
              
              popup.setLngLat(e.lngLat)
                .setHTML(`<div style="padding: 2px 6px; font-size: 13px; font-weight: 600; white-space: nowrap; line-height: 1.4;">${tooltipContent}</div>`)
                .addTo(map)
            }
          } catch (err) { void err }
        })
        
        // Remove tooltip when mouse leaves the marker
        map.on('mouseleave', 'samples-layer', () => {
          try {
            popup.remove()
          } catch (err) { void err }
        })
      } catch (err) {
        // console.error('Map init error', err)
      }
    }
    // We intentionally run this init once on mount. loadSamples is stable (useCallback) but
    // including it here would cause re-initialization when table/visibility change — we avoid that.
    init()
    return () => {
      cancelled = true
      try { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null } } catch (e) { void e; /* ignore */ }
    }
  }, [])
  /* eslint-enable react-hooks/exhaustive-deps */

  // keep style in sync without recreating the map
  useEffect(() => {
    try {
      const map = mapRef.current
      if (!map) return
      const style = getStyleByLayer(selectedLayer)
      try {
        if (typeof map.setProjection === 'function') map.setProjection(getMapProjection())
        if (typeof map.setStyle === 'function') map.setStyle(style)
        else map.setStyle(style)
        applyMapBackdrop(map)
      } catch (e) { /* console.warn('setStyle error:', e) */ }
    } catch (e) { /* console.warn('selectedLayer effect error:', e) */ }
  }, [selectedLayer])

  // toggle label layer visibility without recreating it
  useEffect(() => {
    try {
      const map = mapRef.current
      if (!map) return
      if (showLabels) {
        if (map.getSource && !map.getLayer('country-labels') && map.getSource('countries')) {
          map.addLayer({
            id: 'country-labels',
            type: 'symbol',
            source: 'countries',
            layout: {
              'text-field': ['coalesce', ['get', 'NAME_EN'], ['get', 'NAME'], ['get', 'NAME_LONG'], ''],
              'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
              'text-size': 12
            },
            paint: { 'text-color': '#111', 'text-halo-color': '#fff', 'text-halo-width': 1 }
          })
        } else if (map.getLayer && map.getLayer('country-labels')) {
          map.setLayoutProperty('country-labels', 'visibility', 'visible')
        }
      } else {
        if (map.getLayer && map.getLayer('country-labels')) map.setLayoutProperty('country-labels', 'visibility', 'none')
      }
    } catch (e) { void e; /* ignore */ }
  }, [showLabels])

  // Home request: when the parent increments `homeRequest`, fly to the initial home position
  useEffect(() => {
    try {
      const map = mapRef.current
      if (!map) return
      map.flyTo({ center: [78.9629, 20.5937], zoom: 1.74, essential: true, duration: 2500 })  // Approximately 300,000m altitude
    } catch (e) { void e; /* ignore */ }
  }, [homeRequest])

  // Keep marker visibility in sync and only reload samples when missing.
  useEffect(() => {
    try {
      const map = mapRef.current
      if (!map) return
      // if integralsMeta changed, update paint expression so colors reflect new range
      try {
          if (!groupingEnabled && map.getLayer && map.getLayer('samples-layer') && integralsMeta && integralsMeta.min !== undefined) {
            map.setPaintProperty('samples-layer', 'circle-color', makeColorExpressionStatic(integralsMeta, selectedPalette))
          }
  } catch (e) { void e; /* ignore */ }
      const hasSamplesLayer = Boolean(map.getLayer && map.getLayer('samples-layer'))
      const hasSamplesSource = Boolean(map.getSource && map.getSource('samples'))

      // If layer already exists, only update visibility/paint. Avoid frequent setData reloads.
      if (hasSamplesLayer) {
        map.setLayoutProperty('samples-layer', 'visibility', showSamples ? 'visible' : 'none')
        try { applyOverlayStyling(map) } catch (e) { void e }
        return
      }

      // If samples are requested but layer/source is missing (initial load/style reset), load once.
      if (showSamples && (!hasSamplesLayer || !hasSamplesSource)) {
        try { if (loadSamplesRef.current) loadSamplesRef.current(map) } catch (e) { /* console.warn('loadSamples error', e) */ }
      }
    } catch (e) { void e; /* ignore */ }
  }, [selectedTable, selectedIdColumn, showSamples, integralsMeta, selectedPalette, groupingEnabled, applyOverlayStyling])

  // when integrals change, update existing source features' intVal property and update paint
  useEffect(() => {
    try {
      const map = mapRef.current
      if (!map || !integrals) return
      // In grouping mode markers are colored by group, so avoid frequent source rewrites
      // from cursor/integration updates that can cause visual blinking.
      if (isGroupingActive) {
        try { applyOverlayStyling(map) } catch (e) { void e }
        return
      }
      const src = map.getSource && map.getSource('samples')
      if (!src) return
      // build updated geojson from last known data if available
      const base = lastSamplesGeoRef.current || (src._data || null)
      if (!base || !base.features) return
      const updated = {
        type: 'FeatureCollection',
        features: base.features.map(f => {
          const id = String(f.properties && (f.properties.id ?? ''))
          const intVal = integrals[id] !== undefined ? Number(integrals[id]) : null
          const norm = (intVal !== null && integralsMeta && Number.isFinite(Number(integralsMeta.min)) && Number.isFinite(Number(integralsMeta.max)) && Number(integralsMeta.max) > Number(integralsMeta.min))
            ? Math.max(0, Math.min(1, (Number(intVal) - Number(integralsMeta.min)) / (Number(integralsMeta.max) - Number(integralsMeta.min))))
            : 0
          return { ...f, properties: { ...f.properties, intVal, intNorm: norm } }
        })
      }
  try { src.setData(updated); lastSamplesGeoRef.current = updated } catch (e) { void e; /* ignore */ }

      // update paint expression
      try { applyOverlayStyling(map) } catch (e) { void e; /* ignore */ }
  } catch (e) { void e; /* ignore */ }
  }, [integrals, integralsMeta, selectedPalette, applyOverlayStyling, isGroupingActive, groupAssignments, groupColors, surfaceOverlayEnabled])

  // update color expression when palette changes independently of data/meta changes
  useEffect(() => {
    try {
      const map = mapRef.current
      if (!map) return
      try { ensureOverlayLayers(map); applyOverlayStyling(map) } catch (e) { void e }
    } catch (e) { void e }
  }, [selectedPalette, integralsMeta, ensureOverlayLayers, applyOverlayStyling])

  useEffect(() => {
    try {
      const map = mapRef.current
      if (!map) return
      ensureOverlayLayers(map)
      applyOverlayStyling(map)
    } catch (e) { void e }
  }, [surfaceOverlayEnabled, spreadDiameterKm, overlayOpacity, ensureOverlayLayers, applyOverlayStyling])

  useEffect(() => {
    try {
      const map = mapRef.current
      if (!map) return
      applyOverlayStyling(map)
    } catch (e) { void e }
  }, [groupingEnabled, groupingMethod, groupAssignments, groupColors, applyOverlayStyling, selectedLayer, surfaceOverlayEnabled])

  return (<div ref={containerRef} className={className} style={{ width: '100%', height: '100%' }} />)
}
