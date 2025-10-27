import React, { useEffect, useRef, useState } from 'react'
import supabase from './supabaseClient'
import placeholderDistricts from './data/districts-placeholder.json'

export default function GlobeCesium({ className, selectedSNo }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const infoRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    const addCesiumAssets = () => {
      if (!document.getElementById('cesium-widgets-css')) {
        const link = document.createElement('link')
        link.id = 'cesium-widgets-css'
        link.rel = 'stylesheet'
        link.href = 'https://unpkg.com/cesium@latest/Build/Cesium/Widgets/widgets.css'
        document.head.appendChild(link)
      }
      return new Promise((resolve, reject) => {
        if (window.Cesium) return resolve(window.Cesium)
        if (document.getElementById('cesium-sdk')) {
          const interval = setInterval(() => {
            if (window.Cesium) { clearInterval(interval); resolve(window.Cesium) }
          }, 100)
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
    }

    const init = async () => {
      try {
        const Cesium = await addCesiumAssets()
        if (cancelled) return
        // Some Cesium builds / CDN packages may not expose `createWorldTerrain`.
        // Use it when available; otherwise fall back to a safe ellipsoid terrain provider
        // (i.e. no terrain) so the viewer still initializes.
        let terrainProvider = null
        try {
          if (typeof Cesium.createWorldTerrain === 'function') {
            terrainProvider = Cesium.createWorldTerrain()
          } else if (Cesium.EllipsoidTerrainProvider) {
            terrainProvider = new Cesium.EllipsoidTerrainProvider()
          }
        } catch (e) {
          // If anything goes wrong, leave terrainProvider null and continue without terrain
          console.warn('Could not create Cesium world terrain, falling back to ellipsoid.', e)
          try { terrainProvider = new Cesium.EllipsoidTerrainProvider() } catch (_) { terrainProvider = null }
        }

        const viewerOptions = {
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: true,
          sceneModePicker: true,
          navigationHelpButton: false,
          infoBox: false,
          selectionIndicator: false,
        }
        if (terrainProvider) viewerOptions.terrainProvider = terrainProvider

        const viewer = new Cesium.Viewer(containerRef.current, viewerOptions)
        viewer.imageryLayers.removeAll()
        viewer.imageryLayers.addImageryProvider(new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          credit: 'Esri World Imagery',
        }))
  viewerRef.current = viewer

  // create an info popup element for marker details
  const info = document.createElement('div')
  info.style.position = 'absolute'
  info.style.pointerEvents = 'auto'
  info.style.background = 'rgba(0,0,0,0.85)'
  info.style.color = '#fff'
  info.style.padding = '8px 10px'
  info.style.borderRadius = '6px'
  info.style.maxWidth = '320px'
  info.style.fontSize = '13px'
  info.style.display = 'none'
  info.style.zIndex = 9999
  containerRef.current.style.position = containerRef.current.style.position || 'relative'
  containerRef.current.appendChild(info)
  infoRef.current = info

  // create a simple layer control UI (continents/countries/states/districts)
  const controls = document.createElement('div')
  controls.style.position = 'absolute'
  controls.style.right = '12px'
  controls.style.top = '12px'
  controls.style.background = 'rgba(0,0,0,0.6)'
  controls.style.color = '#fff'
  controls.style.padding = '8px'
  controls.style.borderRadius = '6px'
  controls.style.fontSize = '13px'
  controls.style.zIndex = 10000
  controls.innerHTML = `
    <div style="margin-bottom:6px;font-weight:600">Layers</div>
    <label style="display:block"><input type="checkbox" data-layer="continent" checked /> Continents</label>
    <label style="display:block"><input type="checkbox" data-layer="country" checked /> Countries</label>
    <label style="display:block"><input type="checkbox" data-layer="state" checked /> States</label>
    <label style="display:block"><input type="checkbox" data-layer="district" /> Districts (lazy)</label>
  `
  containerRef.current.appendChild(controls)

  const layerControls = {}
  controls.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    const layer = cb.getAttribute('data-layer')
    layerControls[layer] = cb
    cb.addEventListener('change', () => {
      const show = cb.checked
      // toggle visibility for dataSources matching layer
      viewer.dataSources._dataSources.forEach((ds) => {
        try {
          if (ds._layerName && (ds._layerName === layer || ds._layerName.startsWith(layer + '-'))) {
            ds.show = show
          }
        } catch (e) {}
      })
      // if user unchecked districts, remove all loaded per-state district layers
      if (layer === 'district' && !show) {
        // remove per-state district dataSources
        Object.keys(loadedStateDistricts).forEach((k) => {
          try { viewer.dataSources.remove(loadedStateDistricts[k], true) } catch (e) {}
          delete loadedStateDistricts[k]
        })
      }
    })
  })

        // Load continents and countries first (prefer public/ files if present, else use remote fallbacks)
        const tryFetchJson = async (path) => {
          try {
            const r = await fetch(path)
            if (r.ok) return await r.json()
          } catch (e) {}
          return null
        }

        const continentsLocal = await tryFetchJson('/continents.geojson')
        const countriesLocal = await tryFetchJson('/countries.geojson')

        const continentsUrlFallback = 'https://raw.githubusercontent.com/datasets/continents/master/data/continents.geojson'
        const countriesUrlFallback = 'https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson'

  const continentsGeo = continentsLocal || await (async () => { try { const r = await fetch(continentsUrlFallback); return r.ok ? await r.json() : null } catch (e) { return null } })()
  const countriesGeo = countriesLocal || await (async () => { try { const r = await fetch(countriesUrlFallback); return r.ok ? await r.json() : null } catch (e) { return null } })()

        // keep track of loaded per-state district layers
        const loadedStateDistricts = {}

        // Helper to create a slug from a name for per-state filenames
        const slugify = (s) => s ? String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : ''

        // Helper to load district GeoJSON for a state slug
        const loadStateDistricts = async (stateSlug, stateName) => {
          if (!layerControls['district'] || !layerControls['district'].checked) return null
          if (loadedStateDistricts[stateSlug]) {
            // already loaded: ensure visible
            try { loadedStateDistricts[stateSlug].show = true } catch (e) {}
            return loadedStateDistricts[stateSlug]
          }
          const path = `/state-districts/${stateSlug}.geojson`
          try {
            const r = await fetch(path)
            if (!r.ok) {
              console.warn('State districts file not found for', stateName, path)
              return null
            }
            const gj = await r.json()
            const dsState = await Cesium.GeoJsonDataSource.load(gj, { clampToGround: false })
            // style polygons and add labels
            dsState.entities.values.forEach((e) => {
              try {
                if (e.polygon) {
                  e.polygon.material = Cesium.Color.fromCssColorString('rgba(255,255,255,0.0)')
                  e.polygon.outline = true
                  e.polygon.outlineColor = Cesium.Color.WHITE
                }
                // attach label for district
                const name = e.properties && (e.properties.name?.getValue ? e.properties.name.getValue() : e.properties.name)
                if (name) {
                  // add a small label at centroid
                  let pos = null
                  if (e.polygon && e.polygon.hierarchy && typeof e.polygon.hierarchy.getValue === 'function') {
                    const hier = e.polygon.hierarchy.getValue(); pos = hier && hier.positions
                  } else if (e.position && typeof e.position.getValue === 'function') pos = [e.position.getValue()]
                  if (pos && pos.length) {
                    const sphere = Cesium.BoundingSphere.fromPoints(pos)
                    const labelEnt = viewer.entities.add({ position: sphere.center, label: { text: name, font: '12px sans-serif', fillColor: Cesium.Color.WHITE, style: Cesium.LabelStyle.FILL_AND_OUTLINE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, show: true } })
                    labelEnt._labelLevel = 'district'
                  }
                }
              } catch (e) {}
            })
            dsState._layerName = 'district-' + stateSlug
            viewer.dataSources.add(dsState)
            loadedStateDistricts[stateSlug] = dsState
            return dsState
          } catch (e) { console.warn('Failed loading state districts for', stateName, e); return null }
        }

        // Helper to load a GeoJSON data source and create centroid labels with a level tag
        const loadAndLabel = async (geojsonObj, level) => {
          if (!geojsonObj) return null
          try {
            let dsLocal = null
            try {
              dsLocal = await Cesium.GeoJsonDataSource.load(geojsonObj, { clampToGround: false })
            } catch (loadErr) {
              console.warn(`Failed to load GeoJSON for level=${level}`, loadErr)
              return null
            }
            dsLocal._layerName = level
            viewer.dataSources.add(dsLocal)
            dsLocal.entities.values.forEach((ent) => {
              try {
                const name = ent.properties && (ent.properties.name?.getValue ? ent.properties.name.getValue() : ent.properties.name)
                if (!name) return
                // compute centroid/position for polygons/lines/points
                let positions = null
                let centerPosition = null
                if (ent.polygon && ent.polygon.hierarchy && typeof ent.polygon.hierarchy.getValue === 'function') {
                  const hier = ent.polygon.hierarchy.getValue()
                  positions = hier && hier.positions
                } else if (ent.polyline && ent.polyline.positions && typeof ent.polyline.positions.getValue === 'function') {
                  const pos = ent.polyline.positions.getValue()
                  positions = pos
                } else if (ent.position && typeof ent.position.getValue === 'function') {
                  // point feature: use its Cartesian3 directly
                  try { centerPosition = ent.position.getValue() } catch (e) { centerPosition = null }
                }

                if (!positions && !centerPosition) return

                if (positions && positions.length > 0) {
                  // validate positions are reasonable (finite numbers)
                  let valid = false
                  try {
                    for (let i = 0; i < positions.length; i++) {
                      const p = positions[i]
                      if (p && isFinite(p.x) && isFinite(p.y) && isFinite(p.z)) { valid = true; break }
                    }
                  } catch (e) { valid = false }
                  if (!valid) return
                  const sphere = Cesium.BoundingSphere.fromPoints(positions)
                  centerPosition = sphere.center
                }

                if (!centerPosition) return

                const lab = viewer.entities.add({ position: centerPosition, label: { text: name, font: level === 'continent' ? '18px sans-serif' : '14px sans-serif', fillColor: Cesium.Color.WHITE, style: Cesium.LabelStyle.FILL_AND_OUTLINE, outlineColor: Cesium.Color.BLACK, outlineWidth: 2, show: false } })
                lab._labelLevel = level
                // for state labels, store a slug so clicking can load districts lazily
                if (level === 'state') { lab._stateName = name; lab._stateSlug = slugify(name) }
              } catch (e) {
                // ignore per-feature rendering errors
              }
            })
            return dsLocal
          } catch (e) { console.warn('loadAndLabel unexpected error', e); return null }
        }

        // load continents and countries (async sequentially)
        await loadAndLabel(continentsGeo, 'continent')
        await loadAndLabel(countriesGeo, 'country')

  // Load India states and district placeholders from public/ if available.
  // Prefer a TopoJSON (smaller) if present, convert it to GeoJSON client-side using topojson-client.
  async function ensureTopojsonClient() {
    if (window.topojson && typeof window.topojson.feature === 'function') return window.topojson
    return new Promise((resolve, reject) => {
      const id = 'topojson-client-js'
      if (document.getElementById(id)) {
        const iv = setInterval(() => { if (window.topojson && typeof window.topojson.feature === 'function') { clearInterval(iv); resolve(window.topojson) } }, 50)
        return
      }
      const s = document.createElement('script')
      s.id = id
      s.src = 'https://unpkg.com/topojson-client@3/dist/topojson-client.min.js'
      s.async = true
      s.onload = () => { if (window.topojson && typeof window.topojson.feature === 'function') resolve(window.topojson); else reject(new Error('topojson-client failed to load')) }
      s.onerror = (e) => reject(e)
      document.head.appendChild(s)
    })
  }

  // Try loading a TopoJSON and convert to a single GeoJSON FeatureCollection.
  const tryFetchTopoJson = async (path) => {
    try {
      const r = await fetch(path)
      if (!r.ok) return null
      const topo = await r.json()
      if (!topo || !topo.objects) return null
      try {
        await ensureTopojsonClient()
      } catch (e) {
        console.warn('Failed to load topojson-client, falling back to GeoJSON if available', e)
        return null
      }
      const features = []
      Object.keys(topo.objects).forEach((k) => {
        try {
          const fc = window.topojson.feature(topo, topo.objects[k])
          if (fc && fc.type === 'FeatureCollection' && Array.isArray(fc.features)) {
            fc.features.forEach(f => features.push(f))
          } else if (fc && (fc.type === 'Feature')) {
            features.push(fc)
          }
        } catch (e) {
          // ignore per-object failures
        }
      })
      return { type: 'FeatureCollection', features }
    } catch (e) { return null }
  }

  // Prefer the high-fidelity dissolved state polygons (gadm-like), then try lighter simplified TopoJSONs,
  // and finally fall back to `india_states.geojson`.
  const topoCandidates = [
    '/state-polygons.gadm-like.topo.json',
    '/state-polygons.simplified.0.05pct.topo.json',
    '/state-polygons.simplified.0.5pct.topo.json'
  ]
  let loaded = false
  for (const p of topoCandidates) {
    const t = await tryFetchTopoJson(p)
    if (t) { await loadAndLabel(t, 'state'); loaded = true; break }
  }
  if (!loaded) {
    const indiaStatesLocal = await tryFetchJson('/india_states.geojson')
    if (indiaStatesLocal) await loadAndLabel(indiaStatesLocal, 'state')
  }

  const indiaDistrictsLocal = await tryFetchJson('/india_districts_placeholder.geojson')
  if (indiaDistrictsLocal) await loadAndLabel(indiaDistrictsLocal, 'district')

        // Try loading a user-supplied GeoJSON from the public folder first for districts.
        // If not present, fall back to the bundled placeholder.
        let geojson = null
        try {
          const res = await fetch('/districts.geojson')
          if (res.ok) geojson = await res.json()
        } catch (e) { /* no public file */ }
        if (!geojson) geojson = placeholderDistricts

        // Load GeoJSON without clamping to terrain so polygon outlines are supported.
        // If you prefer polygons to follow terrain, change clampToGround to true but be
        // aware Cesium will disable outlines for terrain-clamped geometry.
  const ds = await Cesium.GeoJsonDataSource.load(geojson, { clampToGround: false })
  ds._layerName = 'district'
  viewer.dataSources.add(ds)

        // Add centroid labels for each polygon feature and classify them as state/district
        ds.entities.values.forEach((ent) => {
          try {
            const name = ent.properties && (ent.properties.name?.getValue ? ent.properties.name.getValue() : ent.properties.name)
            if (!name) return
            // determine polygon positions if present
            let positions = null
            if (ent.polygon && ent.polygon.hierarchy && typeof ent.polygon.hierarchy.getValue === 'function') {
              const hier = ent.polygon.hierarchy.getValue()
              positions = hier && hier.positions
            }
            if (!positions || positions.length === 0) return
            const sphere = Cesium.BoundingSphere.fromPoints(positions)
            const labelEnt = viewer.entities.add({ position: sphere.center, label: { text: name, font: '14px sans-serif', fillColor: Cesium.Color.WHITE, show: false } })
            // classify size: treat large polygons as 'state', smaller as 'district'
            // sphere.radius is in meters; threshold chosen empirically
            const type = (sphere.radius && sphere.radius > 80000) ? 'state' : 'district'
            labelEnt._labelType = type
            // Ensure polygon outlines are enabled by setting an explicit height (0)
            // and enabling outline on the polygon property if present.
            if (ent.polygon) {
              try {
                // set a flat height so outlines render
                if (ent.polygon.height === undefined) ent.polygon.height = 0
                if (ent.polygon.outline === undefined) ent.polygon.outline = true
              } catch (e) {
                // ignore per-entity polygon adjustment errors
              }
            }
          } catch (e) {
            // ignore per-feature errors
          }
        })

        // helper to find a value from multiple possible column names
        const getField = (obj, names) => {
          for (const n of names) {
            if (Object.prototype.hasOwnProperty.call(obj, n) && obj[n] !== undefined && obj[n] !== null) return obj[n]
          }
          return null
        }

        // load supabase points (select all columns for robustness)
        try {
          const res = await supabase.from('test').select('*')
          if (res?.error) {
            console.warn('Supabase query error loading points. Check SUPABASE_URL, anon key, table name, and RLS/permissions.', res.error)
          } else if (res?.data) {
            res.data.forEach((row) => {
              const parsed = parseGeoTag(row.geo_tag)
              if (parsed) {
                // Determine S.No and sample name from common column name variants
                const sNo = getField(row, ['S.No', 'S_No', 'SNo', 'sno', 's_no', 'id'])
                const sampleName = getField(row, ['Sample name', 'Sample Name', 'sample_name', 'sampleName', 'SampleName', 'name', 'sample', 'sampleid'])

                // Create an entity with the S.No/sampleName rendered inside the marker SVG
                // Prefer showing S.No; if missing show the Sample name; otherwise show a small dot fallback
                const labelText = sNo != null ? String(sNo) : (sampleName != null ? String(sampleName) : (row.geo_tag ? '●' : ''))
                const ent = viewer.entities.add({
                  position: Cesium.Cartesian3.fromDegrees(parsed.lng, parsed.lat, 0),
                  billboard: {
                    // render the S.No/sample text inside the SVG marker so it's always visible
                    image: makeSvgDataUrl(labelText),
                    verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                    // keep billboard visible at distance and slightly larger overall
                    scaleByDistance: new Cesium.NearFarScalar(1000, 1.4, 20000000, 0.6),
                    scale: 1.0,
                  },
                  // text is baked into the SVG marker; no separate label needed
                  properties: row,
                })
                try { ent.sample = row } catch (e) { /* ignore */ }
              }
            })
          }
        } catch (e) {
          console.warn('Supabase points load failed (network or client error)', e)
        }

        // Click / touch handler to show sample details
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
        handler.setInputAction((click) => {
          const picked = viewer.scene.pick(click.position)
          if (Cesium.defined(picked) && picked.id) {
            const ent = picked.id
            const data = ent.sample || (ent.properties && typeof ent.properties.getValue === 'function' ? ent.properties.getValue(Cesium.JulianDate.now()) : null)
            if (data) {
              const getField = (obj, names) => {
                for (const n of names) {
                  if (Object.prototype.hasOwnProperty.call(obj, n)) return obj[n]
                }
                return null
              }
              const sNo = getField(data, ['S.No', 'S_No', 'SNo', 'sno', 's_no', 'id'])
              // include the exact 'Sample name' variant as requested
              const sampleName = getField(data, ['Sample name', 'Sample Name', 'sample_name', 'sampleName', 'SampleName', 'name', 'sample', 'sampleid'])
              const geo = getField(data, ['geo_tag', 'geo', 'location'])

              const html = [`<div style="font-weight:600;margin-bottom:6px">${sampleName || 'Sample'}</div>`,
                sNo ? `<div><strong>S.No:</strong> ${sNo}</div>` : null,
                geo ? `<div style="word-break:break-word"><strong>geo_tag:</strong> ${JSON.stringify(geo)}</div>` : null].filter(Boolean).join('')

              if (infoRef.current) {
                infoRef.current.innerHTML = html
                const rect = containerRef.current.getBoundingClientRect()
                const x = click.position.x
                const y = click.position.y
                infoRef.current.style.left = `${Math.min(rect.width - 20, x + 12)}px`
                infoRef.current.style.top = `${Math.max(8, y - 12)}px`
                infoRef.current.style.display = 'block'
              }
              return
            }

            // If the picked entity is a state label and districts layer is enabled, lazy-load districts
            if (ent._stateSlug) {
              loadStateDistricts(ent._stateSlug, ent._stateName)
              return
            }
          }
          if (infoRef.current) infoRef.current.style.display = 'none'
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

        // hide popup on map move
        viewer.camera.moveStart.addEventListener(() => { if (infoRef.current) infoRef.current.style.display = 'none' })

        const toggleLabels = () => {
          const cameraHeight = viewer.camera.positionCartographic.height
          // Label visibility rules by camera height (meters):
          // - continent: shown when very far out
          // - country: shown at medium zoom
          // - state: shown when nearer
          // - district: shown when very near
          const showContinent = cameraHeight > 8000000
          const showCountry = cameraHeight > 1500000 && cameraHeight <= 8000000
          const showState = cameraHeight < 1500000
          const showDistrict = cameraHeight < 200000
          viewer.entities.values.forEach((e) => {
            if (!e.label) return
            // new levels use _labelLevel; older district/state code used _labelType
            const level = e._labelLevel || e._labelType || 'district'
            if (level === 'continent') e.label.show = showContinent
            else if (level === 'country') e.label.show = showCountry
            else if (level === 'state') e.label.show = showState
            else e.label.show = showDistrict
          })
        }

        viewer.camera.moveEnd.addEventListener(toggleLabels)
        viewer.camera.changed.addEventListener(toggleLabels)
        toggleLabels()

        setLoading(false)
      } catch (err) { console.error('Failed to initialize Cesium viewer', err); setLoading(false) }
    }

    init()
    return () => {
      cancelled = true
      try { if (viewerRef.current) { viewerRef.current.destroy(); viewerRef.current = null } } catch (e) {}
    }
  }, [])

  return (
    <div className={className} style={{ width: '100%', height: '100%' }}>
      {loading && <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 10, color: '#fff' }}>Loading globe…</div>}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

function parseGeoTag(tag) {
  if (!tag) return null
  if (typeof tag === 'string') {
    const s = tag.trim()
    const csv = s.split(',').map(x => x.trim())
    if (csv.length === 2 && !isNaN(Number(csv[0])) && !isNaN(Number(csv[1]))) return { lat: Number(csv[0]), lng: Number(csv[1]) }
    try { const obj = JSON.parse(s); if (obj && obj.type === 'Point' && Array.isArray(obj.coordinates)) return { lat: obj.coordinates[1], lng: obj.coordinates[0] } } catch (e) {}
  }
  // also handle when geo_tag is already an object (Postgres JSON column)
  if (typeof tag === 'object') {
    try {
      if (tag.type === 'Point' && Array.isArray(tag.coordinates)) return { lat: tag.coordinates[1], lng: tag.coordinates[0] }
      // handle PostGIS-like object shapes
      if (tag.coordinates && Array.isArray(tag.coordinates)) return { lat: tag.coordinates[1], lng: tag.coordinates[0] }
      if (tag.lat !== undefined && tag.lng !== undefined) return { lat: Number(tag.lat), lng: Number(tag.lng) }
      if (tag.latitude !== undefined && tag.longitude !== undefined) return { lat: Number(tag.latitude), lng: Number(tag.longitude) }
    } catch (e) {}
  }
  return null
}

function makeSvgDataUrl(text) {
  // Render a slightly larger red marker and optionally draw bold white text centered inside it
  const size = 40
  const r = 10
  const circleCx = 20
  const circleCy = 14
  const fill = '#ff3333'
  const textSvg = text ? `<text x='${circleCx}' y='${circleCy+2}' text-anchor='middle' font-family='sans-serif' font-weight='700' font-size='12' fill='#ffffff'>${escapeXml(String(text))}</text>` : ''
  const svg = `<?xml version='1.0' encoding='utf-8'?>` +
    `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 ${size} ${size}'>` +
    `<circle cx='${circleCx}' cy='${circleCy}' r='${r}' fill='${fill}' stroke='#ffffff' stroke-width='2'/>` +
    `<path d='M${circleCx} ${circleCy + 12} C ${circleCx} ${circleCy+ -4} ${circleCx-4} ${circleCy-8} ${circleCx} ${circleCy-11} C ${circleCx+4} ${circleCy-8} ${circleCx} ${circleCy-4} ${circleCx} ${circleCy+12} Z' fill='${fill}' opacity='0.95'/>` +
    textSvg +
    `</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"\n]/g, (c) => {
    switch (c) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case "'": return '&apos;'
      case '"': return '&quot;'
      case '\n': return '\u000A'
      default: return c
    }
  })
}
