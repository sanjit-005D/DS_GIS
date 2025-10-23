import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

export default function GlobeModal({ open, onClose }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)
  const [points, setPoints] = useState([])

  useEffect(() => {
    if (!open) return
    let maplibregl = window.maplibregl
    if (!maplibregl) {
      console.error('maplibre-gl not found on window. Make sure the CDN script is loaded.')
      return
    }

    // initialize map only once
    if (!mapRef.current) {
      mapRef.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [0, 20],
        zoom: 1.2,
        // enable a globe-like atmosphere by using projection: 'globe' when supported
        projection: 'globe'
      })

      // add navigation
      mapRef.current.addControl(new maplibregl.NavigationControl())
    }

    // fetch points from Supabase
    let mounted = true
    ;(async () => {
      try {
        if (!supabase) {
          console.warn('Supabase client not initialized in GlobeModal; skipping fetch.');
          return
        }

        // Fetch all columns directly to avoid errors if column names differ from assumptions
        let data, error
        try {
          const res = await supabase
            .from('test')
            .select('*')
            .limit(1000)
          data = res.data
          error = res.error
        } catch (e) {
          console.error('Supabase request threw', e)
          try { console.error('Supabase request threw (string):', JSON.stringify(e)) } catch (ee) {}
          return
        }

        if (error) {
          console.error('Supabase select(*) error', error)
          try { console.error('Supabase select(*) error (string):', JSON.stringify(error)) } catch (ee) {}
          return
        }

        // Detect which column contains geo coordinates and which contains a label.
        const rows = data || []
        if (rows.length === 0) {
          console.warn('No rows returned from table')
          if (!mounted) return
          setPoints([])
          return
        }

        console.info('GlobeModal fetched rows:', rows.length)
        // show first row keys as quick diagnostic
        console.info('Sample row keys:', Object.keys(rows[0]).slice(0,50))

        // helper to test if a value looks like lat/lon pair (tight rules)
        const looksLikeLatLon = (v) => {
          if (v == null) return false
          // GeoJSON object
          if (typeof v === 'object') {
            if (v.type === 'Point' && Array.isArray(v.coordinates) && v.coordinates.length >= 2 && !isNaN(Number(v.coordinates[0])) && !isNaN(Number(v.coordinates[1]))) return true
            // array-like only valid if exactly 2 numeric entries
            if (Array.isArray(v) && v.length === 2 && !isNaN(Number(v[0])) && !isNaN(Number(v[1]))) return true
            return false
          }
          const s = String(v).trim()
          // JSON array like [lon,lat] with exactly two numbers
          if (s.startsWith('[') && s.endsWith(']')) {
            try { const p = JSON.parse(s); if (Array.isArray(p) && p.length === 2 && !isNaN(Number(p[0])) && !isNaN(Number(p[1]))) return true } catch (e) {}
          }
          // comma or space separated numeric pair (ensure only two numeric tokens)
          const parts = s.replace(/^POINT\s*\(/i, '').replace(/\)$/, '').split(/[ ,]+/).map(p => p.trim()).filter(Boolean)
          if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) return true
          return false
        }

        // prefer explicit geo-like column names first
        const keys = Object.keys(rows[0])
        const geoCandidates = ['geo_tag','geo','location','coordinates','geom','the_geom','latlon','point','lat_lon','latitude_longitude','latitude','longitude','lon','lat']
        let geoKey = null
        for (const cand of geoCandidates) {
          const found = keys.find(k => k.toLowerCase() === cand.toLowerCase())
          if (found) { geoKey = found; break }
        }

        // if not found by name, scan rows for tight lat/lon-like values (but avoid large arrays like Shift x axis)
        if (!geoKey) {
          for (const k of keys) {
            const val = rows[0][k]
            if (looksLikeLatLon(val)) { geoKey = k; break }
          }
        }
        // if still not found, scan a few more rows to try to discover a consistent geo column
        if (!geoKey) {
          for (let i = 1; i < Math.min(rows.length, 10); i++) {
            for (const k of keys) {
              if (looksLikeLatLon(rows[i][k])) { geoKey = k; break }
            }
            if (geoKey) break
          }
        }

        // find label key - prefer obvious names
        const labelCandidates = ['sample_name', 'sample', 'name', 'sampleid', 's.no', 's_no', 'sno', 'id']
        let labelKey = null
        for (const cand of labelCandidates) {
          const found = keys.find(k => k.toLowerCase() === cand.toLowerCase())
          if (found) { labelKey = found; break }
        }
        // fallback: pick the first string-like key that's not the geoKey
        if (!labelKey) {
          for (const k of keys) {
            if (k === geoKey) continue
            const v = rows[0][k]
            if (typeof v === 'string' && v.trim().length > 0) { labelKey = k; break }
          }
        }
        // final fallback: use index as label
        if (!labelKey) labelKey = null

        console.info('GlobeModal detected geo column:', geoKey, 'label column:', labelKey)

        const parseFailures = []
        const parsed = rows.map((r, idx) => {
          if (!geoKey) return null
          const raw = r[geoKey]
          let lat = null, lon = null
          try {
            if (raw == null) return null
            if (typeof raw === 'object') {
              if (raw.type === 'Point' && Array.isArray(raw.coordinates)) {
                lon = Number(raw.coordinates[0]); lat = Number(raw.coordinates[1])
              } else if (Array.isArray(raw)) {
                // array-like [lon,lat] or [lat,lon]
                const a0 = Number(raw[0]); const a1 = Number(raw[1])
                if (!isNaN(a0) && !isNaN(a1)) { lon = a0; lat = a1 }
              }
            } else {
              const s = String(raw).trim()
              // JSON array string
              if ((s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
                try {
                  const parsedJson = JSON.parse(s)
                  if (Array.isArray(parsedJson) && parsedJson.length >= 2) { const a0 = Number(parsedJson[0]); const a1 = Number(parsedJson[1]); if (!isNaN(a0) && !isNaN(a1)) { lon = a0; lat = a1 } }
                } catch (e) {}
              }
              // comma/space separated
              if (lat == null || lon == null) {
                const parts = s.replace(/^POINT\s*\(/i, '').replace(/\)$/, '').split(/[ ,]+/).map(p => p.trim()).filter(Boolean)
                if (parts.length >= 2) {
                  const n0 = Number(parts[0]); const n1 = Number(parts[1])
                  if (!isNaN(n0) && !isNaN(n1)) {
                    // heuristics: if both within lat range (-90..90) treat first as lat, else treat first as lon
                    if (Math.abs(n0) <= 90 && Math.abs(n1) <= 90) {
                      // ambiguous - keep order as lat,lon
                      lat = n0; lon = n1
                    } else {
                      lon = n0; lat = n1
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.warn('failed to parse geo value', raw)
          }
          if (lat == null || lon == null) {
            // record failure details
            parseFailures.push({ idx, label: labelKey ? (r[labelKey] ?? null) : null, raw })
            return null
          }

          // normalize and validate ranges: lat must be between -90 and 90; lon between -180 and 180
          const inLatRange = (n) => typeof n === 'number' && isFinite(n) && n >= -90 && n <= 90
          const inLonRange = (n) => typeof n === 'number' && isFinite(n) && n >= -180 && n <= 180

          // if lat is out of range but lon is a valid latitude, they may be swapped
          if (!inLatRange(lat) && inLatRange(lon) && inLonRange(lat)) {
            // swap
            const tmp = lat; lat = lon; lon = tmp
          }

          // final check
          if (!inLatRange(lat) || !inLonRange(lon)) {
            parseFailures.push({ idx, label: labelKey ? (r[labelKey] ?? null) : null, raw, parsedLat: lat, parsedLon: lon })
            return null
          }

          const label = labelKey ? (r[labelKey] ?? r[labelKey.toLowerCase()] ?? r[labelKey.toUpperCase()]) : null
          return { id: r[labelKey] ?? idx, lat, lon, label: label || String(r[labelKey] ?? idx) }
        }).filter(Boolean)
        if (!mounted) return
        setPoints(parsed)

        console.info('GlobeModal parsed points:', parsed.length)
        if (parseFailures.length > 0) {
          console.warn('GlobeModal parse failures (first 20):', parseFailures.slice(0,20))
        }

        // add markers
        const map = mapRef.current
        // remove existing markers layer if any
        if (map.getSource && map.getSource('samples')) {
          try { map.removeLayer('samples-layer'); map.removeSource('samples') } catch (e) {}
        }

        const features = parsed.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { id: p.id, label: p.label } }))
        if (map.getSource) {
          // remove existing source/layers if present
          try { if (map.getLayer('samples-layer')) map.removeLayer('samples-layer') } catch (e) {}
          try { if (map.getSource('samples')) map.removeSource('samples') } catch (e) {}

          map.addSource('samples', { type: 'geojson', data: { type: 'FeatureCollection', features } })

          // circle markers
          map.addLayer({
            id: 'samples-layer',
            type: 'circle',
            source: 'samples',
            paint: {
              'circle-radius': 6,
              'circle-color': '#ff5722',
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1
            }
          })

          // Remove any existing DOM label markers we previously added
          try {
            if (mapRef.current._labelMarkers && Array.isArray(mapRef.current._labelMarkers)) {
              mapRef.current._labelMarkers.forEach(m => { try { m.remove() } catch (e) {} })
            }
          } catch (e) {}
          mapRef.current._labelMarkers = []

          // Add HTML DOM markers for labels to avoid glyph/font PBF fetches from style server
          parsed.forEach(p => {
            const el = document.createElement('div')
            el.className = 'sample-label'
            el.textContent = p.label || ''
            // create a marker anchored to the left so label sits right of the circle
            const marker = new maplibregl.Marker({ element: el, anchor: 'left' })
              .setLngLat([p.lon, p.lat])
              .addTo(map)
            mapRef.current._labelMarkers.push(marker)
          })

          // popup on click
          map.on('click', 'samples-layer', (e) => {
            const feature = e.features && e.features[0]
            if (!feature) return
            const coords = feature.geometry.coordinates.slice()
            const label = feature.properties && feature.properties.label
            const lon = coords[0]
            const lat = coords[1]
            const html = `
              <div class="popup-content">
                <div class="popup-title">${String(label || '')}</div>
                <div class="popup-coords">Lon: ${Number(lon).toFixed(6)}<br/>Lat: ${Number(lat).toFixed(6)}</div>
              </div>
            `
            new maplibregl.Popup({ closeOnClick: true })
              .setLngLat(coords)
              .setHTML(html)
              .addTo(map)
          })
        }

      } catch (e) {
        console.error('error loading geo points', e)
      }
    })()

    return () => { mounted = false }
  }, [open])

  if (!open) return null

  return (
    <div className="globe-modal-overlay" onClick={onClose}>
      <div className="globe-modal" onClick={(e) => e.stopPropagation()}>
        <button className="globe-close" onClick={onClose}>✕</button>
        <div ref={mapContainer} className="globe-map" />
      </div>
    </div>
  )
}
