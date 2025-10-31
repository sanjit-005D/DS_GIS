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

export default function GlobeCesium({ className, selectedLayer = 'gibs', onCameraChange, showSamples = true, selectedSNo, onMarkerClick }) {
  const containerRef = useRef(null)
  const viewerRef = useRef(null)
  const [loading, setLoading] = useState(true)

  const resolveLayer = (prop) => (prop ? prop : 'gibs')

  useEffect(() => {
    let cancelled = false
    let sampleEntities = []
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

    const fetchAndAddSamples = async (Cesium) => {
      try {
        if (!showSamples) return
        const { data: rows, error } = await supabase.from('test').select('"S.No","Sample name","geo_tag"')
        if (error) { console.warn('Supabase fetch error', error); return }
        if (!rows || rows.length === 0) return
        const v = viewerRef.current
        if (!v) return

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
                pixelSize: 12,
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
            sampleEntities.push(ent)
          } catch (e) { void e }
        })
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

        try {
          handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
          handler.setInputAction((click) => {
            try {
              const picked = viewer.scene.pick(click.position)
              if (picked && picked.id && picked.id.properties) {
                const props = picked.id.properties
                if (onMarkerClick) onMarkerClick(props)
              }
            } catch (e) { void e }
          }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
        } catch (e) { void e }

        await fetchAndAddSamples(Cesium)
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
      try { const v = viewerRef.current; if (v) { v.destroy(); viewerRef.current = null } } catch (e) { void e }
    }
  }, [onCameraChange, showSamples, selectedSNo, onMarkerClick, selectedLayer])

  useEffect(() => {
    const v = viewerRef.current
    if (!v) return
    try { if (typeof v._setImageryChoice === 'string') { /* imagery handled in init */ } } catch (e) { void e }
  }, [selectedLayer])

  return (
    <div className={className} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {loading && <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 10, color: '#fff' }}>Loading globe…</div>}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  )
}
