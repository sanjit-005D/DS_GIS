import React, { useState, useCallback, useEffect } from 'react'
import GlobeCesium from './GlobeCesiumClean'
import Plot from 'react-plotly.js'
import { supabase } from './supabaseClient'

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

  const [selectedSampleRow, setSelectedSampleRow] = useState(null)
  const [sampleLoading, setSampleLoading] = useState(false)

  // helper: parse numeric arrays (few variants tolerated)
  const toNumArray = (val) => {
    if (!val && val !== 0) return []
    if (Array.isArray(val)) return val.map(Number).filter(n => !Number.isNaN(n))
    if (typeof val === 'number') return [val]
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val)
        if (Array.isArray(parsed)) return parsed.map(Number).filter(n => !Number.isNaN(n))
      } catch (e) { void e }
      const matches = val.match(/-?\d+\.?\d*(?:e[+-]?\d+)?/ig)
      if (matches) return matches.map(Number).filter(n => !Number.isNaN(n))
      return val.replace(/^\[|\]$/g, '').split(/[,\s]+/).filter(Boolean).map(Number).filter(n => !Number.isNaN(n))
    }
    return []
  }

  // fetch full row (including spectral arrays) when a marker is clicked
  useEffect(() => {
    let cancelled = false
    const fetchRow = async () => {
      if (!selectedSampleDetails) { setSelectedSampleRow(null); return }
      setSampleLoading(true)
      try {
        const sNo = selectedSampleDetails?.['S.No'] ?? selectedSampleDetails?.sno ?? selectedSampleDetails?.id
        if (sNo == null || sNo === '') { setSelectedSampleRow(null); setSampleLoading(false); return }
        // query by S.No — column name contains a dot in some schemas; supabase-js accepts quoted identifiers in select but eq should work with the raw key
        // attempt a robust query for a column named `S.No` by using a quoted filter name
        // this ensures the REST URL contains the quoted identifier ("S.No") instead of an invalid key
        let rowData = null
        try {
          const resp = await supabase.from('test').select('*').filter('"S.No"', 'eq', String(sNo)).single()
          if (resp && resp.data) rowData = resp.data
          else if (resp && resp.error) throw resp.error
        } catch (innerErr) {
          // fallback: try common alternative column names
          try {
            const alt = await supabase.from('test').select('*').eq('sno', String(sNo)).single()
            if (alt && alt.data) rowData = alt.data
            else if (alt && alt.error) throw alt.error
          } catch (altErr) {
            try {
              const alt2 = await supabase.from('test').select('*').eq('id', String(sNo)).single()
              if (alt2 && alt2.data) rowData = alt2.data
              else rowData = null
            } catch (alt2Err) {
              rowData = null
            }
          }
        }
        if (!cancelled) setSelectedSampleRow(rowData)
      } catch (e) { console.warn('Failed to fetch sample row', e); if (!cancelled) setSelectedSampleRow(null) }
      setSampleLoading(false)
    }
    fetchRow()
    return () => { cancelled = true }
  }, [selectedSampleDetails])

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
                {/* plot: show spectra if available in fetched row */}
                <div style={{ marginTop: 10 }}>
                  {sampleLoading && <div style={{ marginTop: 6, fontSize: 13 }}>Loading plot…</div>}
                  {!sampleLoading && selectedSampleRow && (
                    (() => {
                      // try a few common column names used in this app
                      const xCandidates = ['Shift x axis', 'shift_x_axis', 'Shift (X)', 'x', 'shift']
                      const yCandidates = ['Intensity y axis', 'intensity_y_axis', 'Intensity (Y)', 'y', 'intensity']
                      let x = []
                      let y = []
                      for (const k of xCandidates) { if (!x.length && selectedSampleRow[k] !== undefined) x = toNumArray(selectedSampleRow[k]) }
                      for (const k of yCandidates) { if (!y.length && selectedSampleRow[k] !== undefined) y = toNumArray(selectedSampleRow[k]) }
                      const hasData = x.length > 0 && y.length > 0
                      if (!hasData) return <div style={{ fontSize: 13, marginTop: 6 }}>No spectral data available for this sample.</div>
                      return (
                        <div style={{ width: 420, maxWidth: '100%', marginTop: 6 }}>
                          <Plot
                            data={[
                              { x: x, y: y, type: 'scatter', mode: 'lines', line: { color: '#caa6ff', width: 2 }, name: 'Spectra' }
                            ]}
                            layout={{
                              margin: { t: 8, b: 32, l: 40, r: 8 },
                              height: 220,
                              paper_bgcolor: 'rgba(0,0,0,0)',
                              plot_bgcolor: 'rgba(0,0,0,0)',
                              xaxis: { title: 'Shift', automargin: true },
                              yaxis: { title: 'Intensity', automargin: true }
                            }}
                            config={{ displayModeBar: false, responsive: true }}
                            style={{ width: '100%', height: 220 }}
                          />
                        </div>
                      )
                    })()
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
