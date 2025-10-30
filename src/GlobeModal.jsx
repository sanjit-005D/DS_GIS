import React, { useState, useCallback } from 'react'
import GlobeCesium from './GlobeCesiumClean'

export default function GlobeModal({ open, onClose, selectedSNo }) {
  const [layer, setLayer] = useState('gibs') // 'gibs' | 'osm'
  const [showLabels, setShowLabels] = useState(true)
  const [showSamples, setShowSamples] = useState(true)
  const [cameraPos, setCameraPos] = useState({ lat: 20.5937, lon: 78.9629, alt: 10000000 })
  // stable callback to receive camera updates from the Globe component
  const cameraChangeCallback = useCallback(({ lat, lon, alt }) => setCameraPos({ lat, lon, alt }), [])
  const [selectedSampleDetails, setSelectedSampleDetails] = useState(null)
  // stable handler for marker clicks
  const handleMarkerClick = useCallback((props) => setSelectedSampleDetails(props), [])

  const formatVal = (v) => {
    try {
      if (v === null || v === undefined) return ''
      if (typeof v === 'string') return v
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      // fallback for objects/arrays: JSON stringify with truncation
      const s = JSON.stringify(v)
      if (s.length > 200) return s.slice(0, 197) + '...'
      return s
    } catch (e) { try { void e; return String(v) } catch (e2) { void e2; return '' } }
  }
  

  if (!open) return null

  // choose colors that contrast with the underlying basemap
  const isDarkBg = layer === 'gibs' // satellite tends to be darker
  const controlBg = isDarkBg ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.85)'
  const textColor = isDarkBg ? '#fff' : '#111'

  return (
    <div className="globe-modal-overlay" onClick={onClose}>
      <div className="globe-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        {/* close button placed outside the top-right of the modal box for better visibility */}
        <button
          className="globe-close"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: -18,
            right: -18,
            zIndex: 999,
            width: 36,
            height: 36,
            borderRadius: 18,
            border: 'none',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0,0,0,0.35)'
          }}
        >
          ✕
        </button>

        {/* Layer controls */}
        <div style={{ position: 'absolute', left: 12, top: 12, zIndex: 220, display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ background: controlBg, padding: '6px 8px', borderRadius: 8, color: textColor, display: 'flex', gap: 6, alignItems: 'center', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', boxShadow: '0 4px 16px rgba(0,0,0,0.35)' }}>
            <label style={{ fontSize: 13, marginRight: 6, color: textColor }}>Basemap</label>
            <select
              value={layer}
              onChange={(e) => setLayer(e.target.value)}
              style={{ padding: '6px', borderRadius: 6, color: textColor, background: isDarkBg ? 'rgba(255,255,255,0.06)' : '#fff', border: '1px solid rgba(0,0,0,0.12)' }}
            >
              <option value="gibs">Satellite</option>
              <option value="osm">Streets</option>
            </select>
            {/* Set Home button removed per request */}
            <label style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 6, color: textColor }}>
              <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
              <span style={{ fontSize: 13 }}>{showLabels ? 'Labels on' : 'Labels off'}</span>
            </label>
            <label style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 6, color: textColor }}>
              <input type="checkbox" checked={showSamples} onChange={(e) => setShowSamples(e.target.checked)} />
              <span style={{ fontSize: 13 }}>{showSamples ? 'Samples on' : 'Samples off'}</span>
            </label>
          </div>
        </div>

        <div className="globe-map" style={{ height: '80vh' }}>
            <GlobeCesium
            className="globe-cs"
            selectedSNo={selectedSNo}
            selectedLayer={layer}
            showLabels={showLabels}
            showSamples={showSamples}
              onCameraChange={cameraChangeCallback}
              onMarkerClick={handleMarkerClick}
          />
        </div>

        {/* Bottom-right camera info box — styled to match the basemap control */}
        <div style={{ position: 'absolute', right: 12, bottom: 12, zIndex: 220 }}>
          <div style={{ background: controlBg, padding: '8px 10px', borderRadius: 8, color: textColor, backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', boxShadow: '0 4px 16px rgba(0,0,0,0.35)', minWidth: 180, fontSize: 13 }}>
            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4, color: textColor }}>Position</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ color: textColor }}>
                <div style={{ fontSize: 12 }}>Lat</div>
                <div style={{ fontWeight: 600 }}>{cameraPos.lat.toFixed(4)}</div>
              </div>
              <div style={{ color: textColor }}>
                <div style={{ fontSize: 12 }}>Lon</div>
                <div style={{ fontWeight: 600 }}>{cameraPos.lon.toFixed(4)}</div>
              </div>
              <div style={{ color: textColor, textAlign: 'right' }}>
                <div style={{ fontSize: 12 }}>Alt</div>
                <div style={{ fontWeight: 600 }}>{Math.round(cameraPos.alt).toLocaleString()} m</div>
              </div>
            </div>
          </div>
        </div>

        {/* Sample details panel (appears when a marker is clicked) */}
        {selectedSampleDetails && (
          <div style={{ position: 'absolute', right: 12, top: 72, zIndex: 300 }}>
            <div style={{ background: controlBg, padding: 12, borderRadius: 8, color: textColor, boxShadow: '0 6px 24px rgba(0,0,0,0.35)', minWidth: 240 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>Sample details</strong>
                <button onClick={() => setSelectedSampleDetails(null)} style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ fontSize: 13, lineHeight: '1.3' }}>
                <div><strong>S.No:</strong> {formatVal(selectedSampleDetails?.['S.No'] ?? selectedSampleDetails?.sno ?? selectedSampleDetails?.id ?? '')}</div>
                <div><strong>Sample name:</strong> {formatVal(selectedSampleDetails?.['Sample name'] ?? selectedSampleDetails?.sample_name ?? '')}</div>
                {/* only show the three requested fields */}
                {/* geo_tag may be a string or JSON string */}
                <div style={{ marginTop: 6 }}><strong>geo_tag:</strong> {formatVal(selectedSampleDetails?.geo_tag)}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
