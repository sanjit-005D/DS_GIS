import React, { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export default function StreetMap({ open = false, onClose = () => {} , center = [78.9629, 20.5937], zoom = 3 }) {
  const mapContainer = useRef(null)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    if (!mapContainer.current) return

    // initialize map only once per open
    try {
      mapRef.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://demotiles.maplibre.org/style.json',
        center: [center[0], center[1]],
        zoom: zoom,
      })

      // add a small navigation control
      mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right')

    } catch (err) {
      // console.warn('MapLibre init failed', err)
    }

    return () => {
      try {
        if (mapRef.current) {
          mapRef.current.remove()
          mapRef.current = null
        }
      } catch (e) { void e }
    }
  }, [open, center, zoom])

  if (!open) return null

  return (
    <div style={overlayStyle} role="dialog" aria-modal="true">
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div style={{ fontWeight: 700 }}>Street Map</div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close street map">×</button>
        </div>
        <div ref={mapContainer} style={{ flex: 1, minHeight: 360 }} />
      </div>
    </div>
  )
}

// inline styles to avoid modifying CSS files
const overlayStyle = {
  position: 'fixed',
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000
}
const modalStyle = {
  width: '86%',
  maxWidth: '1200px',
  height: '70%',
  background: '#0b0c10',
  borderRadius: 8,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: 'none'
}
const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '10px 14px',
  color: '#fff',
  borderBottom: '1px solid rgba(255,255,255,0.04)'
}
const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#fff',
  fontSize: 22,
  cursor: 'pointer',
  lineHeight: 1
}
