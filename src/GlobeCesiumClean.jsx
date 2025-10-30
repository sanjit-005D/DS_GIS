import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// Provider configuration moved to module scope so it's stable for hooks
const providerConfig = {
  gibs: { minDistance: 200, maximumLevel: 19 },
  osm: { minDistance: 50, maximumLevel: 19 }
}

// Minimum allowable camera altitude (meters) — do not allow zooming closer than this
const MIN_CAMERA_ALTITUDE = 350
// Initial view altitude (meters) — used for the initial flyTo and the Home destination
const INITIAL_VIEW_ALTITUDE = 22000000

// Single, clean implementation (new filename to avoid the corrupted original).
// `showLabels` is not implemented yet — omit to avoid unused var
export default function GlobeCesium({ className, selectedLayer = 'gibs', onCameraChange, showSamples = true, selectedSNo, onMarkerClick }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const [loading, setLoading] = useState(true)

  const resolveLayer = (prop) => {
    if (prop) return prop
    return 'gibs'
  }

  // This effect intentionally runs only once on mount; default to satellite ('gibs')
  useEffect(() => {
    let cancelled = false

    const loadCesium = () => new Promise((resolve, reject) => {
      if (window.Cesium) { resolve(window.Cesium); return }
      if (!document.getElementById('cesium-widgets-css')) {
        const link = document.createElement('link')
        link.id = 'cesium-widgets-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/cesium@latest/Build/Cesium/Widgets/widgets.css'
        document.head.appendChild(link)
      }
      if (document.getElementById('cesium-sdk')) {
        const iv = setInterval(() => { if (window.Cesium) { clearInterval(iv); resolve(window.Cesium) } }, 100)
        return
      }
      const s = document.createElement('script')
      s.id = 'cesium-sdk'
      s.src = 'https://unpkg.com/cesium@latest/Build/Cesium/Cesium.js'
      s.async = true
      s.onload = () => { if (window.Cesium) resolve(window.Cesium); else reject(new Error('Cesium failed to load')) }
      s.onerror = (e) => reject(e)
      document.body.appendChild(s)
    })

    const init = async () => {
      try {
        const Cesium = await loadCesium()
        if (cancelled) return

  const viewer = new Cesium.Viewer(containerRef.current, { animation: false, timeline: false, baseLayerPicker: false, geocoder: false, homeButton: true, sceneModePicker: true, navigationHelpButton: false, infoBox: false, selectionIndicator: false })
  try { viewer.imageryLayers.removeAll() } catch (e) { void e }

        const setImagery = (choice) => {
          try {
            viewer.imageryLayers.removeAll()
          } catch (e) { void e }

          const cfg = providerConfig[choice] || providerConfig.osm
          try {
            if (viewer.scene && viewer.scene.screenSpaceCameraController) {
              // enforce a hard minimum altitude across basemaps
              const minAllowed = Math.max(cfg.minDistance || 0, MIN_CAMERA_ALTITUDE)
              viewer.scene.screenSpaceCameraController.minimumZoomDistance = minAllowed
            }
          } catch (e) { void e }

          if (choice === 'gibs') {
            // Use Esri World Imagery as a reliable satellite basemap (no token required).
            // This replaces the previous GIBS provider which in some environments failed to fetch tiles.
            try {
              viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                credit: 'Esri World Imagery',
                maximumLevel: cfg.maximumLevel
              }))
            } catch (e) { void e; // fallback to OSM if Esri imagery cannot be added
              try {
                viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
                  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                  subdomains: ['a','b','c'],
                  credit: '© OpenStreetMap contributors',
                  maximumLevel: providerConfig.osm.maximumLevel
                }))
              } catch (e) { void e }
            }
          } else {
            try {
              viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                subdomains: ['a','b','c'],
                credit: '© OpenStreetMap contributors',
                maximumLevel: providerConfig.osm.maximumLevel
              }))
            } catch (e) { void e }
          }

          viewer._currentMinDistance = Math.max(cfg.minDistance || 0, MIN_CAMERA_ALTITUDE)

          // Apply a subtle canvas filter for OSM (street) mode to darken text/labels.
          try {
            const applyCanvasFilter = (c) => {
              try {
                const canvas = viewer && viewer.scene && viewer.scene.canvas
                if (!canvas) return
                if (c === 'osm') {
                  // darken a bit to increase label contrast
                  canvas.style.filter = 'brightness(0.85) contrast(0.95)'
                } else {
                  // reset for satellite
                  canvas.style.filter = ''
                }
              } catch (e) { void e }
            }
            applyCanvasFilter(choice)
          } catch (e) { void e }
        }

    // set initial imagery (default to satellite)
    viewer._setImagery = setImagery
    setImagery('gibs')

    // Smoothly fly the camera to India (approx. longitude, latitude) at a wider altitude
      try {
      viewer.camera.flyTo({
        // Use the shared initial view altitude constant
        destination: Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, INITIAL_VIEW_ALTITUDE),
        duration: 2.5
      })

      // (no automatic home capture here) — home should be set explicitly by the user via the UI
    } catch (e) { void e }

    viewerRef.current = viewer

    // If requested, fetch spectral samples from Supabase and render markers
    let sampleEntities = []

    const parseGeoTag = (val) => {
      if (!val) return null
      try {
        // If it's an object with coordinates (GeoJSON)
        if (typeof val === 'object') {
          if (val.type === 'Point' && Array.isArray(val.coordinates)) {
            return { lon: Number(val.coordinates[0]), lat: Number(val.coordinates[1]) }
          }
          if (val.longitude !== undefined && val.latitude !== undefined) return { lon: Number(val.longitude), lat: Number(val.latitude) }
          if (val.lon !== undefined && val.lat !== undefined) return { lon: Number(val.lon), lat: Number(val.lat) }
        }
        if (typeof val === 'string') {
          const s = val.trim()
          // JSON array or object
          if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
            try {
              const parsed = JSON.parse(s)
              return parseGeoTag(parsed)
            } catch (e) { void e }
          }
          // POINT(lon lat)
          const pointMatch = s.match(/POINT\s*\(?\s*([+-]?\d+\.?\d*)[,\s]+([+-]?\d+\.?\d*)\s*\)?/i)
          if (pointMatch) return { lon: Number(pointMatch[1]), lat: Number(pointMatch[2]) }
          // comma-separated lat,lon or lon,lat
          const parts = s.split(/[;,]/).map(p => p.trim()).filter(Boolean)
          if (parts.length === 2) {
            const a = Number(parts[0]), b = Number(parts[1])
            if (!Number.isNaN(a) && !Number.isNaN(b)) {
              // guess: if first value is in range -90..90, treat as lat
              if (a >= -90 && a <= 90) return { lat: a, lon: b }
              return { lat: b, lon: a }
            }
          }
        }
      } catch (e) { void e }
      return null
    }

    const clearSampleEntities = () => {
      try {
        sampleEntities.forEach(se => { try { viewer.entities.remove(se) } catch (e) { void e } })
        sampleEntities = []
      } catch (e) { void e }
    }

    const fetchAndMarkSamples = async () => {
      try {
        clearSampleEntities()
        if (!showSamples) return
        const { data: rows, error } = await supabase.from('test').select('*')
        if (error) { console.warn('Supabase fetch error', error); return }
        if (!rows || rows.length === 0) return
        rows.forEach((r) => {
          try {
            const geo = parseGeoTag(r['geo_tag'])
            if (!geo) return
            const { lat, lon } = geo
            // prefer using S.No inside the marker (unique sample identifier). Fall back to other fields if missing.
            const labelText = (r['S.No'] || r['SNo'] || r['id'] || r['Sample name'] || r['sample_name'] || '').toString()
            const ent = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lon, lat, 2.0),
              point: {
                // slightly larger marker so the S.No label can be rendered inside
                pixelSize: 18,
                color: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1
              },
              label: {
                text: labelText,
                // center the label on top of the point so the S.No appears inside the marker
                font: 'bold 12px Arial',
                fillColor: Cesium.Color.BLACK,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                pixelOffset: new Cesium.Cartesian2(0, 0),
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                scaleByDistance: new Cesium.NearFarScalar(2e6, 1.0, 6e6, 0.0),
                showBackground: false
              },
              properties: r
            })
            sampleEntities.push(ent)
          } catch (e) { void e }
        })
        // highlight selectedSNo if provided
        try {
          if (selectedSNo) {
            const found = sampleEntities.find(se => (se.properties && String(se.properties['S.No']) === String(selectedSNo)) )
            if (found) {
              try { found.point.color = Cesium.Color.ORANGE } catch (e) { void e }
              try { found.point.pixelSize = 22 } catch (e) { void e }
              try { found.label.font = 'bold 14px Arial' } catch (e) { void e }
            }
          }
        } catch (e) { void e }
      } catch (e) { console.warn('Failed to fetch or render samples', e) }
    }

    try { fetchAndMarkSamples() } catch (e) { void e }

    // Start periodic camera reporting (500ms) to update the position box and enforce min altitude.
    try {
      const camInterval = setInterval(() => {
        try {
          const pos = viewer.camera.position
          const carto = Cesium.Cartographic.fromCartesian(pos)
          const lon = Cesium.Math.toDegrees(carto.longitude)
          const lat = Cesium.Math.toDegrees(carto.latitude)
          let alt = carto.height || 0
          if (alt < MIN_CAMERA_ALTITUDE && !viewer._isClamping) {
            viewer._isClamping = true
            try {
              viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(lon, lat, MIN_CAMERA_ALTITUDE), duration: 0.6 })
                .then(() => { try { viewer._isClamping = false } catch (e) { void e } })
                .catch(() => { try { viewer._isClamping = false } catch (e) { void e } })
            } catch (e) { void e; viewer._isClamping = false }
            alt = MIN_CAMERA_ALTITUDE
          }
          try { if (typeof onCameraChange === 'function') onCameraChange({ lat, lon, alt }) } catch (e) { void e }
        } catch (e) { void e }
      }, 500)
      viewer._cameraInterval = camInterval
    } catch (e) { void e }

    // pick / click handlers for markers
    try {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
      // change cursor on hover
      handler.setInputAction((movement) => {
        try {
          const picked = viewer.scene.pick(movement.endPosition)
          if (Cesium.defined(picked) && picked.id) {
            viewer.container.style.cursor = 'pointer'
          } else {
            viewer.container.style.cursor = ''
          }
        } catch (e) { void e }
      }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

      handler.setInputAction((click) => {
        try {
          const picked = viewer.scene.pick(click.position)
          if (Cesium.defined(picked) && picked.id && picked.id.properties) {
            // entity picked — call callback with plain JS object of properties
              try {
                // Only surface the minimal details the UI should show on click:
                // - 'Sample name' (or fallback to 'sample_name')
                // - 'geo_tag' (raw geo_tag field)
                const p = picked.id.properties
                let sampleName = ''
                let geo = null
                let sNo = ''
                try {
                  if (p) {
                    if (typeof p.getValue === 'function') {
                      try { sampleName = p.getValue('Sample name') ?? p.getValue('sample_name') ?? '' } catch (e) { void e }
                      try { geo = p.getValue('geo_tag') ?? p.getValue('geo') ?? null } catch (e) { void e }
                      try { sNo = p.getValue('S.No') ?? p.getValue('SNo') ?? p.getValue('id') ?? '' } catch (e) { void e }
                    } else {
                      sampleName = p['Sample name'] ?? p['sample_name'] ?? ''
                      geo = p['geo_tag'] ?? p['geo'] ?? null
                      sNo = p['S.No'] ?? p['SNo'] ?? p['id'] ?? ''
                    }
                  }
                } catch (e) { void e }
                // Ensure values are primitive or safe strings
                const normName = (sampleName && typeof sampleName === 'object') ? (sampleName['Sample name'] ?? sampleName.sample_name ?? JSON.stringify(sampleName)) : String(sampleName ?? '')
                const normGeo = (geo && typeof geo === 'object') ? JSON.stringify(geo) : (geo == null ? '' : String(geo))
                const normSno = sNo == null ? '' : String(sNo)
                const props = { 'S.No': normSno, 'Sample name': normName, geo_tag: normGeo }
                if (typeof onMarkerClick === 'function') onMarkerClick(props)
              } catch (e) { void e }
          }
        } catch (e) { void e }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

      viewer._markerHandler = handler
    } catch (e) { void e }

    // Wire the home button to fly to India (ensure home returns to India)
      // Ensure India is the initial and home position. Clear any previously persisted custom home.
      try { localStorage.removeItem('globe_home') } catch (e) { void e }

  try {
  // Home destination altitude set to match the initial view altitude
  const homeDest = Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, INITIAL_VIEW_ALTITUDE)
        try {
          const btn = viewer.container && viewer.container.querySelector && viewer.container.querySelector('.cesium-home-button')
          if (btn) {
            const newBtn = btn.cloneNode(true)
            btn.parentNode.replaceChild(newBtn, btn)
            newBtn.addEventListener('click', (ev) => {
              ev.preventDefault(); ev.stopPropagation();
              try { viewer.camera.flyTo({ destination: homeDest, duration: 1.6 }) } catch (err) { void err }
            })
            viewer._homeBtn = newBtn
            viewer._homeDest = homeDest
            viewer._homeSet = true
          }
        } catch (e) { void e }
      } catch (e) { void e }

    setLoading(false)
      } catch (err) { console.error('Cesium init failed', err); setLoading(false) }
    }

    init()

    return () => {
      cancelled = true
      try {
        const v = viewerRef.current
        if (v) {
          try {
            // clear any camera interval we started
            if (v._cameraInterval) { clearInterval(v._cameraInterval); v._cameraInterval = null }
          } catch (e) { void e }
          try {
            if (v._screenSpaceHandler && typeof v._screenSpaceHandler.destroy === 'function') v._screenSpaceHandler.destroy()
          } catch (e) { void e }
          try {
            if (v._noDataObserver && typeof v._noDataObserver.disconnect === 'function') v._noDataObserver.disconnect()
          } catch (e) { void e }
          try {
            v.destroy()
            viewerRef.current = null
          } catch (e) { void e; viewerRef.current = null }
        }
      } catch (e) { void e }
      // ensure any canvas filters are removed on unmount
      try {
        const v2 = viewerRef.current
        if (v2 && v2.scene && v2.scene.canvas) { v2.scene.canvas.style.filter = '' }
      } catch (e) { void e }
    }
  }, [onCameraChange, showSamples, selectedSNo, onMarkerClick])

  // React to selectedLayer prop changes and update imagery accordingly
  useEffect(() => {
    const v = viewerRef.current
    if (!v || typeof v._setImagery !== 'function') return
    const choice = resolveLayer(selectedLayer)
    try { v._setImagery(choice) } catch (e) { console.warn('Imagery swap failed', e) }
  }, [selectedLayer])

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      {loading && <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 10, color: '#fff' }}>Loading globe…</div>}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
