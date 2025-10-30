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
  // store country label entities at the effect scope so cleanup can access them
  let countryLabelEntities = []

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

    // Attempt to load a GeoJSON file from public/ containing admin-0 countries
    const possibleCountryFiles = [
      '/ne_10m_admin_0_countries.geojson',
      '/ne_50m_admin_0_countries.geojson',
      '/ne_110m_admin_0_countries.geojson',
      '/admin0_countries.geojson',
      '/countries.geojson',
      '/state-polygons.topo.json',
      '/state-polygons.topojson'
    ]

    const computeCentroidFromCoords = (geom) => {
      // geom is a GeoJSON geometry object
      try {
        if (!geom) return null
        const type = geom.type
        let ring = null
        if (type === 'Polygon') ring = geom.coordinates && geom.coordinates[0]
        else if (type === 'MultiPolygon') ring = (geom.coordinates && geom.coordinates[0] && geom.coordinates[0][0])
        if (!ring || ring.length === 0) return null
        // Simple centroid: average of vertices
        let sumX = 0, sumY = 0, count = 0
        for (let i = 0; i < ring.length; i++) {
          const c = ring[i]
          // GeoJSON coordinate order: [lon, lat]
          const lon = Number(c[0])
          const lat = Number(c[1])
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
          sumX += lon; sumY += lat; count++
        }
        if (count === 0) return null
        return { lon: sumX / count, lat: sumY / count }
      } catch (e) { void e; return null }
    }

    const loadCountryLabels = async () => {
      try {
        let data = null
        for (const path of possibleCountryFiles) {
          try {
            const res = await fetch(path)
            if (!res.ok) continue
            // detect topojson by extension and skip (we prefer GeoJSON). If it's topojson, attempt to parse if it looks like GeoJSON
            const txt = await res.text()
            try {
              const parsed = JSON.parse(txt)
              // naive: if parsed.type === 'Topology', it's TopoJSON — skip
              if (parsed && parsed.type === 'Topology') {
                // skip topojson (not supported here)
                continue
              }
              data = parsed
              break
            } catch (e) { void e; continue }
          } catch (e) { void e; continue }
        }
        if (!data || !data.features) return
        // iterate features and add labels
        data.features.forEach((f) => {
          try {
            const geom = f.geometry
            if (!geom) return
            const c = computeCentroidFromCoords(geom)
            if (!c) return
            // determine label text from common properties
            const props = f.properties || {}
            const labelText = props.NAME || props.NAME_LONG || props.ADMIN || props.name || props.country || props.NAME_EN || props.Name || ''
            if (!labelText) return
            const ent = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(Number(c.lon), Number(c.lat), 0.0),
              label: {
                text: String(labelText),
                font: 'bold 14px Arial',
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cesium.Cartesian2(0, -12),
                scaleByDistance: new Cesium.NearFarScalar(2e6, 1.0, 6e6, 0.0),
                showBackground: false
              }
            })
            countryLabelEntities.push(ent)
          } catch (e) { void e }
        })
      } catch (e) { void e }
    }


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
        // select only the exact column names we want (case-sensitive / may include spaces)
        // Supabase allows quoting column names in the select string
        const { data: rows, error } = await supabase.from('test').select('"S.No","Sample name","geo_tag"')
        if (error) { console.warn('Supabase fetch error', error); return }
        if (!rows || rows.length === 0) return
        rows.forEach((r) => {
          try {
            // r will contain only the selected columns (see select below)
            const geo = parseGeoTag(r['geo_tag'])
            if (!geo) return
            const { lat, lon } = geo
            // prefer using S.No inside the marker (unique sample identifier). Fall back to other fields if missing.
            // Normalize the three fields we care about
            const sNoVal = r['S.No'] ?? r['SNo'] ?? r['id'] ?? ''
            const sampleNameVal = r['Sample name'] ?? r['sample_name'] ?? ''
            let geoRaw = r['geo_tag'] ?? r['geo'] ?? null
            // If geoRaw is an object that contains an inner geo_tag, prefer that
            try {
              if (geoRaw && typeof geoRaw === 'object') {
                if (geoRaw.geo_tag) geoRaw = geoRaw.geo_tag
                else if (geoRaw['geo_tag']) geoRaw = geoRaw['geo_tag']
                else if (geoRaw.coordinates && Array.isArray(geoRaw.coordinates)) geoRaw = `${geoRaw.coordinates[1]},${geoRaw.coordinates[0]}`
                else geoRaw = JSON.stringify(geoRaw)
              }
              // if geoRaw is a JSON string containing an object with geo_tag, parse it
              if (typeof geoRaw === 'string') {
                const s = geoRaw.trim()
                if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                  try {
                    const parsed = JSON.parse(s)
                    if (parsed && typeof parsed === 'object') {
                      if (parsed.geo_tag) geoRaw = parsed.geo_tag
                    }
                  } catch (e) { void e }
                }
              }
            } catch (e) { void e }

            const labelText = String(sNoVal ?? '')
            // Build a minimal properties object that exactly matches the table columns we care about
            const props = {
              'S.No': sNoVal == null ? '' : String(sNoVal),
              'Sample name': (typeof sampleNameVal === 'object') ? JSON.stringify(sampleNameVal) : String(sampleNameVal ?? ''),
              'geo_tag': geoRaw == null ? '' : String(geoRaw)
            }

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
              // store only the minimal properties on the entity
              properties: props
            })
            // also keep a plain JS copy on the entity so picking/PropertyBag issues don't leak nested objects
            try { ent._sampleProps = props } catch (e) { void e }
            sampleEntities.push(ent)
          } catch (e) { void e }
        })
        // highlight selectedSNo if provided
        try {
          if (selectedSNo) {
            const found = sampleEntities.find(se => {
              try {
                const p = se && se.properties
                if (!p) return false
                // properties on the entity were normalized to contain 'S.No'
                return String(p['S.No']) === String(selectedSNo)
              } catch (e) { void e; return false }
            })
            if (found) {
              try { found.point.color = Cesium.Color.ORANGE } catch (e) { void e }
              try { found.point.pixelSize = 22 } catch (e) { void e }
              try { found.label.font = 'bold 14px Arial' } catch (e) { void e }
            }
          }
        } catch (e) { void e }
      } catch (e) { console.warn('Failed to fetch or render samples', e) }
    }

  // fetch only the minimal columns from Supabase to avoid passing large nested objects
  try { fetchAndMarkSamples() } catch (e) { void e }
  // Try to load country labels from any GeoJSON placed in `public/`
  try { loadCountryLabels() } catch (e) { void e }

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
          if (Cesium.defined(picked) && picked.id) {
            try {
              const ent = picked.id
              // prefer the plain JS copy we attached to the entity
              let props = null
              try { props = ent._sampleProps ?? null } catch (e) { void e }
              if (!props && ent.properties) {
                const p = ent.properties
                try {
                  if (typeof p.getValue === 'function') {
                    const sNo = (p.getValue('S.No') ?? p.getValue('SNo') ?? p.getValue('id') ?? '')
                    const name = (p.getValue('Sample name') ?? p.getValue('sample_name') ?? '')
                    let geo = (p.getValue('geo_tag') ?? p.getValue('geo') ?? null)
                    try {
                      if (geo && typeof geo === 'object') {
                        if (geo.geo_tag) geo = geo.geo_tag
                        else if (geo.coordinates && Array.isArray(geo.coordinates)) geo = `${geo.coordinates[1]},${geo.coordinates[0]}`
                        else geo = JSON.stringify(geo)
                      }
                      if (typeof geo === 'string') {
                        const s = geo.trim()
                        if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
                          try { const parsed = JSON.parse(s); if (parsed && parsed.geo_tag) geo = parsed.geo_tag } catch (e) { void e }
                        }
                      }
                    } catch (e) { void e }
                    props = { 'S.No': sNo == null ? '' : String(sNo), 'Sample name': String(name ?? ''), geo_tag: geo == null ? '' : String(geo) }
                  } else {
                    const sNo = p['S.No'] ?? p['SNo'] ?? p['id'] ?? ''
                    const name = p['Sample name'] ?? p['sample_name'] ?? ''
                    let geo = p['geo_tag'] ?? p['geo'] ?? ''
                    if (geo && typeof geo === 'object') {
                      try { geo = geo.geo_tag ?? (geo.coordinates && Array.isArray(geo.coordinates) ? `${geo.coordinates[1]},${geo.coordinates[0]}` : JSON.stringify(geo)) } catch (e) { void e }
                    }
                    props = { 'S.No': sNo == null ? '' : String(sNo), 'Sample name': String(name ?? ''), geo_tag: geo == null ? '' : String(geo) }
                  }
                } catch (e) { void e }
              }
              if (props && typeof onMarkerClick === 'function') onMarkerClick(props)
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
            // remove any country label entities we added
            try {
              if (Array.isArray(countryLabelEntities) && countryLabelEntities.length) {
                countryLabelEntities.forEach(ent => { try { if (v.entities) v.entities.remove(ent) } catch (e) { void e } })
                countryLabelEntities = []
              }
            } catch (e) { void e }
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
