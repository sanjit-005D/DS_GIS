import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

// Provider configuration
const providerConfig = {
  gibs: { minDistance: 200, maximumLevel: 19 },
  osm: { minDistance: 50, maximumLevel: 19 }
}

const MIN_CAMERA_ALTITUDE = 350
const INITIAL_VIEW_ALTITUDE = 22000000

function parseGeoTag(value) {
  if (!value) return null
  try {
    if (typeof value === 'string') {
      const s = value.trim()
      const csv = s.match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/)
      if (csv) return { lat: Number(csv[1]), lon: Number(csv[2]) }
      const point = s.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i)
      if (point) return { lon: Number(point[1]), lat: Number(point[2]) }
      try {
        const j = JSON.parse(s)
        if (j && j.coordinates && Array.isArray(j.coordinates)) return { lon: Number(j.coordinates[0]), lat: Number(j.coordinates[1]) }
      } catch (e) { /* ignore */ }
    } else if (typeof value === 'object') {
      const v = value
      if (v.lat != null && v.lon != null) return { lat: Number(v.lat), lon: Number(v.lon) }
      if (v.coordinates && Array.isArray(v.coordinates)) return { lon: Number(v.coordinates[0]), lat: Number(v.coordinates[1]) }
    }
  } catch (e) { /* ignore */ }
  return null
}

export default function GlobeCesium({ className, selectedLayer = 'gibs', onCameraChange, showSamples = true, showLabels = true, selectedSNo, onMarkerClick }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const [loading, setLoading] = useState(true)

  const resolveLayer = (prop) => (prop ? prop : 'gibs')

  useEffect(() => {
  let cancelled = false
  // keep references to entities we add so we can remove them on unmount
  let sampleEntities = []
  let countryLabelEntities = []
    let handler = null

    const ensureCesium = () => new Promise((resolve, reject) => {
      if (window.Cesium) return resolve(window.Cesium)
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

    const clearSamples = () => {
      try {
        const v = viewerRef.current
        if (!v || !v.entities) return
        sampleEntities.forEach(e => { try { v.entities.remove(e) } catch (err) { void err } })
        sampleEntities = []
      } catch (e) { void e }
    }

    const computeCentroidFromCoords = (geom) => {
      try {
        if (!geom) return null
        const type = geom.type

        // helper: compute polygon centroid (area-weighted) using shoelace formula
        const polygonCentroid = (ring) => {
          if (!ring || ring.length === 0) return null
          // ensure ring is closed for algorithm
          const pts = ring.slice()
          if (pts.length < 3) return null
          if (pts[0][0] !== pts[pts.length - 1][0] || pts[0][1] !== pts[pts.length - 1][1]) pts.push(pts[0])
          let A = 0, Cx = 0, Cy = 0
          for (let i = 0; i < pts.length - 1; i++) {
            const x0 = Number(pts[i][0]), y0 = Number(pts[i][1])
            const x1 = Number(pts[i + 1][0]), y1 = Number(pts[i + 1][1])
            if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) continue
            const cross = x0 * y1 - x1 * y0
            A += cross
            Cx += (x0 + x1) * cross
            Cy += (y0 + y1) * cross
          }
          A = A / 2
          if (Math.abs(A) < 1e-9) {
            // degenerate: fallback to average
            let sx = 0, sy = 0, cnt = 0
            for (let i = 0; i < ring.length; i++) {
              const x = Number(ring[i][0]), y = Number(ring[i][1])
              if (!Number.isFinite(x) || !Number.isFinite(y)) continue
              sx += x; sy += y; cnt++
            }
            if (cnt === 0) return null
            return { lon: sx / cnt, lat: sy / cnt }
          }
          const cx = Cx / (6 * A)
          const cy = Cy / (6 * A)
          return { lon: cx, lat: cy }
        }

        if (type === 'Polygon') {
          const outer = geom.coordinates && geom.coordinates[0]
          return polygonCentroid(outer)
        }

        if (type === 'MultiPolygon') {
          // choose the polygon with the largest absolute area
          let best = null
          let bestArea = 0
          const polys = geom.coordinates || []
          for (let p = 0; p < polys.length; p++) {
            const ring = polys[p] && polys[p][0]
            if (!ring) continue
            // compute signed area quickly
            let area = 0
            for (let i = 0; i < ring.length - 1; i++) {
              const x0 = Number(ring[i][0]), y0 = Number(ring[i][1])
              const x1 = Number(ring[i + 1][0]), y1 = Number(ring[i + 1][1])
              if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) continue
              area += x0 * y1 - x1 * y0
            }
            area = Math.abs(area) / 2
            if (area > bestArea) { bestArea = area; best = ring }
          }
          if (best) return polygonCentroid(best)
          return null
        }

        // Fallback for Point or unknown: try Point coordinates or simple averaging
        if (type === 'Point' && Array.isArray(geom.coordinates)) {
          return { lon: Number(geom.coordinates[0]), lat: Number(geom.coordinates[1]) }
        }
        return null
      } catch (e) { void e; return null }
    }

    const loadCountryLabels = async (Cesium, viewer) => {
      try {
        if (!showLabels) return
        const possibleCountryFiles = [
          '/ne_10m_admin_0_countries.geojson',
          '/ne_50m_admin_0_countries.geojson',
          '/ne_110m_admin_0_countries.geojson',
          '/admin0_countries.geojson',
          '/countries.geojson'
        ]
        let data = null
        for (const path of possibleCountryFiles) {
          try {
            const res = await fetch(path)
            if (!res.ok) continue
            const txt = await res.text()
            try {
              const parsed = JSON.parse(txt)
              if (parsed && parsed.type === 'Topology') continue
              data = parsed
              break
            } catch (e) { void e; continue }
          } catch (e) { void e; continue }
        }
        if (!data || !data.features) return
        data.features.forEach((f) => {
          try {
            const geom = f.geometry
            if (!geom) return
            const c = computeCentroidFromCoords(geom)
            if (!c) return
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
                // Make labels visible at a much wider range so they appear at global zoom
                // Initial view altitude is ~22e6, so ensure far distance is larger than that.
                scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 5e7, 0.0),
                showBackground: false
              }
            })
            countryLabelEntities.push(ent)
          } catch (e) { void e }
        })
      } catch (e) { void e }
    }

    const fetchAndAddSamples = async (Cesium) => {
      try {
        if (!showSamples) return
        const { data: rows, error } = await supabase.from('test').select('"S.No","Sample name","geo_tag"')
        if (error) { console.warn('Supabase fetch error', error); return }
        if (!rows || rows.length === 0) return
        const v = viewerRef.current
        if (!v) return

        // clear any previous sample entities we added
        try {
          sampleEntities.forEach(se => { try { v.entities.remove(se) } catch (e) { void e } })
        } catch (e) { void e }
        sampleEntities = []

        rows.forEach((r) => {
          try {
            const geo = parseGeoTag(r['geo_tag'])
            if (!geo) return
            const lat = Number(geo.lat); const lon = Number(geo.lon)
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return
            const sNoVal = r['S.No'] ?? r['SNo'] ?? r['id'] ?? ''
            const labelText = String(sNoVal ?? '')
            const props = {
              'S.No': sNoVal == null ? '' : String(sNoVal),
              'Sample name': (r['Sample name'] == null) ? '' : String(r['Sample name']),
              'geo_tag': r['geo_tag'] == null ? '' : String(r['geo_tag'])
            }

            const ent = v.entities.add({
              position: Cesium.Cartesian3.fromDegrees(lon, lat, 2.0),
              point: {
                pixelSize: 14,
                color: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1
              },
              label: {
                text: labelText,
                font: 'bold 12px Arial',
                fillColor: Cesium.Color.BLACK,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 2,
                pixelOffset: new Cesium.Cartesian2(0, 0),
                horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
                verticalOrigin: Cesium.VerticalOrigin.CENTER
              },
              properties: props
            })
            try { ent._sampleProps = props } catch (e) { void e }
            sampleEntities.push(ent)
          } catch (e) { void e }
        })

        try {
          const v2 = viewerRef.current
          if (v2) {
            try { v2._sampleEntities = sampleEntities } catch (e) { void e }
          }
        } catch (e) { void e }

        // apply selected highlight if requested
        try {
          if (selectedSNo) {
            const found = sampleEntities.find(se => {
              try { return String(se._sampleProps?.['S.No'] ?? se.properties?.['S.No'] ?? '') === String(selectedSNo) } catch (e) { return false }
            })
            if (found) {
              try { found.point.color = Cesium.Color.RED } catch (e) { void e }
              try { found.point.pixelSize = 18 } catch (e) { void e }
            }
          }
        } catch (e) { void e }
      } catch (e) { console.warn('Failed to fetch or render samples', e) }
    }

    const init = async () => {
      try {
        const Cesium = await ensureCesium()
        if (cancelled) return

        const viewer = new Cesium.Viewer(containerRef.current, {
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: true,
          sceneModePicker: true,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false
        })

        try { viewer.imageryLayers.removeAll() } catch (e) { void e }

        const setImagery = (choice) => {
          try { viewer.imageryLayers.removeAll() } catch (e) { void e }
          const cfg = providerConfig[choice] || providerConfig.osm
          try {
            if (viewer.scene && viewer.scene.screenSpaceCameraController) {
              viewer.scene.screenSpaceCameraController.minimumZoomDistance = Math.max(cfg.minDistance || 0, MIN_CAMERA_ALTITUDE)
            }
          } catch (e) { void e }

          if (choice === 'gibs') {
            try {
              viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
                url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                credit: 'Esri World Imagery',
                maximumLevel: cfg.maximumLevel
              }))
            } catch (e) {
              try {
                viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
                  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                  subdomains: ['a','b','c'],
                  credit: '© OpenStreetMap contributors',
                  maximumLevel: providerConfig.osm.maximumLevel
                }))
              } catch (err) { void err }
            }
          } else {
            try {
              viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
                url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                subdomains: ['a','b','c'],
                credit: '© OpenStreetMap contributors',
                maximumLevel: providerConfig.osm.maximumLevel
              }))
            } catch (err) { void err }
          }

          try {
            const canvas = viewer && viewer.scene && viewer.scene.canvas
            if (canvas) canvas.style.filter = (choice === 'osm') ? 'brightness(0.85) contrast(0.95)' : ''
          } catch (e) { void e }

          viewer._setImageryChoice = choice
        }

        setImagery(resolveLayer(selectedLayer))

        try { viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(78.9629, 20.5937, INITIAL_VIEW_ALTITUDE), duration: 2.5 }) } catch (e) { void e }

        viewerRef.current = viewer

        // start periodic camera reporting and enforce minimum altitude
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

        try {
          handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
          handler.setInputAction((movement) => {
            try {
              const picked = viewer.scene.pick(movement.endPosition)
              if (Cesium.defined(picked) && picked.id) viewer.container.style.cursor = 'pointer'
              else viewer.container.style.cursor = ''
            } catch (e) { void e }
          }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

          handler.setInputAction((click) => {
            try {
              const picked = viewer.scene.pick(click.position)
              if (Cesium.defined(picked) && picked.id) {
                try {
                  const ent = picked.id
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
        } catch (e) { void e }

  await fetchAndAddSamples(Cesium)
  try { await loadCountryLabels(Cesium, viewer) } catch (e) { void e }
  setLoading(false)
      } catch (err) {
        console.error('Cesium init failed', err)
        setLoading(false)
      }
    }

    init()

    return () => {
      cancelled = true
      try { clearSamples() } catch (e) { void e }
      try { if (handler && typeof handler.destroy === 'function') handler.destroy() } catch (e) { void e }
      try {
        const v = viewerRef.current
        if (v) {
          try {
            if (Array.isArray(countryLabelEntities) && countryLabelEntities.length) {
              countryLabelEntities.forEach(ent => { try { if (v.entities) v.entities.remove(ent) } catch (e) { void e } })
              countryLabelEntities = []
            }
          } catch (e) { void e }
          try {
            if (v._cameraInterval) { try { clearInterval(v._cameraInterval) } catch (e) { void e }; v._cameraInterval = null }
          } catch (e) { void e }
          try { v.destroy(); viewerRef.current = null } catch (e) { void e; viewerRef.current = null }
        }
      } catch (e) { void e }
    }
  }, [onCameraChange, showSamples, selectedSNo, onMarkerClick, selectedLayer])

  useEffect(() => {
    const v = viewerRef.current
    if (!v) return
    try { if (typeof v._setImageryChoice === 'string') { /* imagery handled in init */ } } catch (e) { void e }
    // react to selectedSNo changes by highlighting the corresponding marker
    try {
      const ents = v._sampleEntities || []
      // reset all markers to default
      ents.forEach(se => {
        try { if (se && se.point) { se.point.color = Cesium.Color.YELLOW; se.point.pixelSize = 14 } } catch (e) { void e }
      })
      if (selectedSNo) {
        try {
          const found = ents.find(se => { try { return String(se._sampleProps?.['S.No'] ?? se.properties?.['S.No'] ?? '') === String(selectedSNo) } catch (e) { return false } })
          if (found) { try { found.point.color = Cesium.Color.RED; found.point.pixelSize = 20 } catch (e) { void e } }
        } catch (e) { void e }
      }
    } catch (e) { void e }
  }, [selectedLayer])

  return (
    <div className={className} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {loading && <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 10, color: '#fff' }}>Loading globe…</div>}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
