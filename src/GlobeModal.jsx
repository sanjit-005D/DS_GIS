import React, { useState, useCallback, useEffect } from 'react'
import MapboxViewer from './MapboxViewerClean'
import AveragedSpectrum from './AveragedSpectrum'
import Plot from 'react-plotly.js'
import { db } from './apiClient' // Custom API client (eyenetbio database)
import { computePCAGrouping, computeClusteringGrouping, computeRFGrouping } from './lib/spectralGrouping'
import { compareGroupingMethods } from './lib/spectralGrouping'

// Left-side controls removed — we'll render a compact basemap selector and samples toggle directly on the map

export default function GlobeModal({ open, onClose, _selectedSNo, selectedTable, selectedIdColumn, spectralRanges, setSpectralRanges, activeRangeIndex, setActiveRangeIndex }) {
  const initialLayer = (() => { try { return window.localStorage.getItem('mapStyle') || 'gibs' } catch (e) { return 'gibs' } })()
  const [layer, setLayer] = useState(initialLayer) // 'gibs' | 'street'
  const [showLabels, _setShowLabels] = useState(true)
  const [showSamples, setShowSamples] = useState(true)
  const [cameraPos, setCameraPos] = useState({ lat: 20.5937, lon: 78.9629, alt: 250000 })
  // stable callback to receive camera updates from the Globe component
  const cameraChangeCallback = useCallback(({ lat, lon, alt }) => setCameraPos({ lat, lon, alt }), [])
  const [selectedSampleDetails, setSelectedSampleDetails] = useState(null)
  // stable handler for marker clicks
  const handleMarkerClick = useCallback((props) => {
    // console.log('GlobeModal: handleMarkerClick called with:', props)
    setSelectedSampleDetails(props)
  }, [])

  const [selectedSampleRow, setSelectedSampleRow] = useState(null)
  const [sampleLoading, setSampleLoading] = useState(false)
  const [homeRequestCounter, setHomeRequestCounter] = useState(0)
  const [integralsMap, setIntegralsMap] = useState(null)
  const [integralsMeta, setIntegralsMeta] = useState({ min: 0, max: 0, x1: 0, x2: 0 })
  const avgRef = React.useRef(null)
  const [paletteDomainMin, setPaletteDomainMin] = useState(0)
  const [paletteDomainMax, setPaletteDomainMax] = useState(100)
  const [paletteLow, setPaletteLow] = useState(0)
  const [paletteHigh, setPaletteHigh] = useState(100)
  const [selectedPalette, setSelectedPalette] = useState('default')
  const [surfaceOverlayEnabled, setSurfaceOverlayEnabled] = useState(true)
  const [contourOverlayEnabled, setContourOverlayEnabled] = useState(false)
  const [spreadDiameterKm, setSpreadDiameterKm] = useState(320)
  const [overlayOpacity, setOverlayOpacity] = useState(0.45)
  
  // Color mapping mode: 'cursor' (X1/X2 + cursor module) or 'integration' (wavelength slider module)
  const [colorMappingMode, setColorMappingMode] = useState(null)
  const [lastActiveMode, setLastActiveMode] = useState('cursor') // Remember last active mode
  
  // Separate state for integration module (wavelength slider)
  const [integrationDomainMin, setIntegrationDomainMin] = useState(0)
  const [integrationDomainMax, setIntegrationDomainMax] = useState(100)
  const [integrationLow, setIntegrationLow] = useState(0)
  const [integrationHigh, setIntegrationHigh] = useState(100)
  const [integrationIntegrals, setIntegrationIntegrals] = useState(null)
  const [integrationMeta, setIntegrationMeta] = useState({ min: 0, max: 0, x1: 0, x2: 0 })
  const integrationDragRef = React.useRef(null)
  const integrationDebounceRef = React.useRef(null)
  const [integrationDragging, setIntegrationDragging] = useState(null)
  
  // Cursor mode controls state (synced from AveragedSpectrum ref)
  const [cursorModeState, setCursorModeState] = useState({ x1Str: '0.00', x2Str: '0.00', sliderEnabled: false, cursorIdx: null, leftIdx: 0, rightIdx: 0, leftPct: 0, widthPct: 0 })
  const cursorModeUpdateRef = React.useRef(null)
  const cursorUserLockUntilRef = React.useRef(0)
  const cursorPendingIdxRef = React.useRef(null)
  const cursorPendingAtRef = React.useRef(0)
  const cursorRecoveryAtRef = React.useRef(0)
  const [cursorSliderLocalValue, setCursorSliderLocalValue] = useState(null)
  
  // Cursor mode wavelength region slider state
  const [cursorX1, setCursorX1] = useState(0)
  const [cursorX2, setCursorX2] = useState(100)
  const [cursorDomainMin, setCursorDomainMin] = useState(0)
  const [cursorDomainMax, setCursorDomainMax] = useState(100)
  const cursorDragRef = React.useRef(null)
  const cursorDebounceRef = React.useRef(null)
  const [cursorDragging, setCursorDragging] = useState(null)
  const [wavelengthRegionEnabled, setWavelengthRegionEnabled] = useState(false)
  const [toggleHovered, setToggleHovered] = useState(false)
  const [toggleTooltipDismissed, setToggleTooltipDismissed] = useState(() => {
    return sessionStorage.getItem('toggleTooltipDismissed') === 'true'
  })
  
  // Bottom bar minimized state
  const [bottomBarMinimized, setBottomBarMinimized] = useState(true)
  const isLightLayer = layer === 'light'
  
  const PALETTES = {
    // Basic and standard color scales (at top)
    default: { colors: ['#d7191c', '#fdae61', '#ffffbf', '#abdda4', '#2b83ba'], label: 'Basic' },
    jet: { colors: ['#00007F', '#0000FF', '#00FFFF', '#FFFF00', '#FF0000', '#7F0000'], label: 'Jet' },
    hot: { colors: ['#000000', '#8B0000', '#FF4500', '#FFD700', '#FFFF00', '#FFFFFF'], label: 'Hot' },
    cool: { colors: ['#00FFFF', '#00BFFF', '#8A2BE2', '#FF00FF'], label: 'Cool' },
    bone: { colors: ['#000000', '#2F4F4F', '#708090', '#A9C8C8', '#FFFFFF'], label: 'Bone' },
    copper: { colors: ['#000000', '#4E2F0E', '#8B4513', '#CD853F', '#FFC77F'], label: 'Copper' },
    gray: { colors: ['#000000', '#404040', '#808080', '#C0C0C0', '#FFFFFF'], label: 'Grayscale' },
    rainbow: { colors: ['#9400D3', '#4B0082', '#0000FF', '#00FF00', '#FFFF00', '#FF7F00', '#FF0000'], label: 'Rainbow' },
    spectral: { colors: ['#9E0142', '#D53E4F', '#F46D43', '#FDAE61', '#FEE08B', '#E6F598', '#ABDDA4', '#66C2A5', '#3288BD', '#5E4FA2'], label: 'Spectral' },
    coolwarm: { colors: ['#3B4CC0', '#6788EE', '#9ABBFF', '#C9D7F0', '#EDD1C2', '#F7A889', '#E26952', '#B40426'], label: 'Cool-Warm' },
    // Scientific/matplotlib palettes
    viridis: { colors: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'], label: 'Viridis' },
    plasma: { colors: ['#0d0887', '#6a00a8', '#b12a90', '#f16363', '#fca636'], label: 'Plasma' },
    inferno: { colors: ['#000004', '#420a68', '#932667', '#dd513a', '#fca50a'], label: 'Inferno' },
    magma: { colors: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fe9f6d'], label: 'Magma' },
    turbo: { colors: ['#30123b', '#3f45a3', '#2ca02c', '#f6c300', '#f13b3b'], label: 'Turbo' }
  }
  const paletteDragRef = React.useRef(null)
  const paletteDebounceRef = React.useRef(null)
  const [paletteDragging, setPaletteDragging] = useState(null)
  
  // Normalization state
  const [useNormalized, setUseNormalized] = useState(false)

  // Phase 1: grouping methods (PCA MVP)
  const [groupingEnabled, setGroupingEnabled] = useState(false)
  const [groupingMethod, setGroupingMethod] = useState('pca')
  const [pcaComponents, setPcaComponents] = useState(2)
  const [pcaGroupsCount, setPcaGroupsCount] = useState(3)
  const [clusteringDistance, setClusteringDistance] = useState('euclidean')
  const [clusteringInit, setClusteringInit] = useState('spread')
  const [clusteringCompactness, setClusteringCompactness] = useState(null)
  const [rfTrees, setRfTrees] = useState(32)
  const [rfDepth, setRfDepth] = useState(4)
  const [rfCompactness, setRfCompactness] = useState(null)
  const [groupingSeed, setGroupingSeed] = useState(42)
  const [methodComparison, setMethodComparison] = useState(null)
  const [recommendedMethod, setRecommendedMethod] = useState(null)
  const [groupAssignments, setGroupAssignments] = useState({})
  const [groupStats, setGroupStats] = useState([])
  const [pcaExplained, setPcaExplained] = useState([])
  const [groupAveragedTraces, setGroupAveragedTraces] = useState([])
  const [groupRepresentation, setGroupRepresentation] = useState(null)
  const [groupRepPanelRect, setGroupRepPanelRect] = useState(() => {
    const w = 460
    const h = 290
    const initialLeft = (typeof window !== 'undefined') ? Math.max(8, window.innerWidth - w - 420) : 420
    return { left: initialLeft, top: 86, width: w, height: h }
  })
  const [groupRepPanelMinimized, setGroupRepPanelMinimized] = useState(false)
  const groupRepPanelDragRef = React.useRef(null)
  const GROUP_PALETTES = {
    q09: { label: 'Q09 ColorBlindSafe8', colors: ['#1f77b4', '#ff7f0e', '#2ca02c', '#9467bd', '#d62728', '#17becf', '#bcbd22', '#8c564b'] },
    q11: { label: 'Q11 Paired Color', colors: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a'] },
    q13: { label: 'Q13 Color4Line', colors: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#a65628'] },
    q03: { label: 'Q03 Rainbow7', colors: ['#e41a1c', '#ff7f00', '#ffff33', '#4daf4a', '#377eb8', '#4b0082', '#984ea3'] },
    q02: { label: 'Q02 Candy', colors: ['#ff66c4', '#ffde59', '#7ed957', '#5ce1e6', '#8c52ff', '#ff914d'] },
    q05: { label: 'Q05 Moderate2', colors: ['#3a86ff', '#8338ec', '#ff006e', '#fb5607', '#ffbe0b', '#43aa8b', '#577590', '#f3722c'] },
    q06: { label: 'Q06 Moderate3', colors: ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#8ab17d', '#6d597a', '#b56576'] },
    q07: { label: 'Q07 Bold1', colors: ['#d00000', '#f48c06', '#ffba08', '#2dc653', '#34a0a4', '#3f37c9', '#7209b7', '#f72585'] },
    q08: { label: 'Q08 Bold2', colors: ['#00a6fb', '#0582ca', '#006494', '#003554', '#051923', '#ef476f', '#ffd166', '#06d6a0'] },
    q10: { label: 'Q10 ColorBlindSafe15', colors: ['#00429d', '#4771b2', '#73a2c6', '#a5d5d8', '#ffffe0', '#f9c89c', '#ed8a63', '#d1495b', '#93003a', '#2b9348', '#55a630', '#80b918', '#aacc00', '#bfd200', '#d4d700'] },
    s01: { label: 'S01 Gray Scale', colors: ['#1f1f1f', '#4a4a4a', '#737373', '#9a9a9a', '#bfbfbf', '#e0e0e0'] }
  }
  const [selectedGroupPalette, setSelectedGroupPalette] = useState('q09')
  const pcaPanelRef = React.useRef(null)
  const PCA_PANEL_MIN_HEIGHT = 120
  const [pcaPanelRect, setPcaPanelRect] = useState(() => {
    const w = 220
    const h = 180
    return { left: 8, top: 92, width: w, height: h }
  })
  const [pcaPanelMinimized, setPcaPanelMinimized] = useState(false)
  const pcaPanelActionRef = React.useRef(null)
  const avgPanelDragRef = React.useRef(null)
  const samplePopupDragRef = React.useRef(null)
  const groupAvgPopupDragRef = React.useRef(null)
  const popupResizeActionRef = React.useRef(null)
  const [avgPanelRect, setAvgPanelRect] = useState(() => {
    const w = 410
    const h = 190
    const initialLeft = (typeof window !== 'undefined') ? Math.max(8, window.innerWidth - w - 292) : 700
    return { left: initialLeft, top: 86, width: w, height: h }
  })
  const [avgPanelMinimized, setAvgPanelMinimized] = useState(false)
  const [samplePopupRect, setSamplePopupRect] = useState(() => {
    const w = 220
    const h = 255
    const initialLeft = (typeof window !== 'undefined') ? Math.max(8, window.innerWidth - w - 58) : 840
    return { left: initialLeft, top: 86, width: w, height: h }
  })
  const [samplePopupMinimized, setSamplePopupMinimized] = useState(false)
  const [groupAvgPopupRect, setGroupAvgPopupRect] = useState(() => {
    const w = 330
    const h = 250
    const initialLeft = (typeof window !== 'undefined') ? Math.max(8, window.innerWidth - w - 58) : 740
    return { left: initialLeft, top: 350, width: w, height: h }
  })
  const [groupAvgPopupMinimized, setGroupAvgPopupMinimized] = useState(false)
  const GROUP_COLORS = GROUP_PALETTES[selectedGroupPalette]?.colors || GROUP_PALETTES.q09.colors
  const POPUP_MINIMIZED_WIDTH = 240
  const POPUP_MINIMIZED_HEIGHT = 34

  // parse raw nested object from clicked feature (Mapbox may stringify nested objects)
  const clickedRaw = (() => {
    try {
      const r = selectedSampleDetails?.raw
      if (!r) return null
      if (typeof r === 'string') {
        try { return JSON.parse(r) } catch (e) { void e; return null }
      }
      if (typeof r === 'object') return r
      return null
    } catch (e) { void e; return null }
  })()
  // (Range controller removed) — left-side controller UI and related state were removed per user request.

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
        const _raw = selectedSampleDetails?.raw
        let parsedRaw = null
        try {
          if (_raw && typeof _raw === 'string') parsedRaw = JSON.parse(_raw)
          else if (_raw && typeof _raw === 'object') parsedRaw = _raw
        } catch (e) { void e; parsedRaw = null }

        const detectXY = (obj) => {
          if (!obj) return [[], []]
          const xCandidates = ['Shift x axis', 'shift_x_axis', 'Shift (X)', 'x', 'shift']
          const yCandidates = ['Intensity y axis', 'intensity_y_axis', 'Intensity (Y)', 'y', 'intensity']
          const toNumArrayLocal = (val) => {
            if (!val && val !== 0) return []
            if (Array.isArray(val)) return val.map(Number).filter(n => !Number.isNaN(n))
            if (typeof val === 'number') return [val]
            if (typeof val === 'string') {
              try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed.map(Number).filter(n => !Number.isNaN(n)) } catch (e) { void e }
              const matches = val.match(/-?\d+\.?\d*(?:e[+-]?\d+)?/ig)
              if (matches) return matches.map(Number).filter(n => !Number.isNaN(n))
              return val.replace(/^\[|\]$/g, '').split(/[\,\s]+/).filter(Boolean).map(Number).filter(n => !Number.isNaN(n))
            }
            return []
          }
          let x = []
          let y = []
          for (const k of xCandidates) { if (!x.length && obj[k] !== undefined) x = toNumArrayLocal(obj[k]) }
          for (const k of yCandidates) { if (!y.length && obj[k] !== undefined) y = toNumArrayLocal(obj[k]) }
          return [x, y]
        }

        const [xFromRaw, yFromRaw] = detectXY(parsedRaw)
        if (xFromRaw.length > 0 && yFromRaw.length > 0) {
          if (!cancelled) setSelectedSampleRow(parsedRaw)
          setSampleLoading(false)
          return
        }

        const sNo = selectedSampleDetails?.[selectedIdColumn] ?? selectedSampleDetails?.['S.No'] ?? selectedSampleDetails?.sno ?? selectedSampleDetails?.id ?? (parsedRaw && (parsedRaw[selectedIdColumn] ?? parsedRaw['S.No'] ?? parsedRaw.sno ?? parsedRaw.id))
        if (sNo == null || sNo === '') { setSelectedSampleRow(null); setSampleLoading(false); return }
        let rowData = null
        try {
          const tableToUse = selectedTable || 'v_complete_spectral_data'
          const filterName = selectedIdColumn && selectedIdColumn.includes('.') ? `"${selectedIdColumn}"` : (selectedIdColumn || '"S.No"')
          const resp = await db.from(tableToUse).select('*').filter(filterName, 'eq', String(sNo)).single()
          if (resp && resp.data) rowData = resp.data
          else if (resp && resp.error) throw resp.error
        } catch (e) { void e
          try {
            const tableToUse = selectedTable || 'v_complete_spectral_data'
            const alt = await db.from(tableToUse).select('*').eq('sno', String(sNo)).single()
            if (alt && alt.data) rowData = alt.data
            else if (alt && alt.error) throw alt.error
          } catch (e2) { void e2
            try {
              const tableToUse = selectedTable || 'v_complete_spectral_data'
              const alt2 = await db.from(tableToUse).select('*').eq('id', String(sNo)).single()
              if (alt2 && alt2.data) rowData = alt2.data
              else rowData = null
            } catch (e3) { void e3; rowData = null }
          }
        }
        if (!cancelled) setSelectedSampleRow(rowData)
      } catch (e) { /* console.warn('Failed to fetch sample row', e); */ if (!cancelled) setSelectedSampleRow(null) }
      setSampleLoading(false)
    }
    fetchRow()
    return () => { cancelled = true }
  }, [selectedSampleDetails, selectedTable, selectedIdColumn])

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
  
  

  // force a bright theme for control boxes regardless of basemap
  // keep a slight blur so controls sit above the map, with black text for readability
  const controlBg = 'rgba(255,255,255,0.85)'
  const textColor = '#111'

  // available basemap styles (id matches layer values used by MapboxViewer)
  const MAPBOX_TOKEN = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAPBOX_TOKEN) ? String(import.meta.env.VITE_MAPBOX_TOKEN).trim() : ''
  const STYLES = [
    { id: 'gibs', label: 'Satellite', styleId: 'satellite-streets-v11' },
    { id: 'street', label: 'Streets', styleId: 'outdoors-v12' },
    { id: 'light', label: 'Light', styleId: 'light-v11' }
  ]
  const previewUrl = (styleId) => {
    try {
      if (!MAPBOX_TOKEN) return ''
      // center at India region with low zoom for preview
      return `https://api.mapbox.com/styles/v1/mapbox/${styleId}/static/78.9629,20.5937,1/240x140?access_token=${MAPBOX_TOKEN}`
    } catch (e) { return '' }
  }

  // persist user's style choice
  useEffect(() => { try { window.localStorage.setItem('mapStyle', layer) } catch (e) { void e } }, [layer])

  // Preserve previous cursor/integration selection when maximizing toolbar
  useEffect(() => {
    if (bottomBarMinimized) return
    // Small delay to ensure DOM is updated before restoring range/cursor.
    const timer = setTimeout(() => {
      try {
        if (avgRef.current && typeof avgRef.current.setRange === 'function') {
          avgRef.current.setRange(cursorX1, cursorX2)
        }
        if (avgRef.current && cursorModeState?.cursorIdx != null && typeof avgRef.current.handleCursorChange === 'function') {
          avgRef.current.handleCursorChange(cursorModeState.cursorIdx)
        }
      } catch (e) { void e }
    }, 100)
    return () => clearTimeout(timer)
  }, [bottomBarMinimized])

  // Sync cursor mode state from AveragedSpectrum ref periodically
  useEffect(() => {
    const sync = () => {
      if (avgRef.current && typeof avgRef.current.getCursorModeState === 'function') {
        const state = avgRef.current.getCursorModeState()
        setCursorModeState((prev) => {
          const same =
            prev.x1Str === state.x1Str &&
            prev.x2Str === state.x2Str &&
            prev.sliderEnabled === state.sliderEnabled &&
            prev.cursorIdx === state.cursorIdx &&
            prev.leftIdx === state.leftIdx &&
            prev.rightIdx === state.rightIdx &&
            prev.leftPct === state.leftPct &&
            prev.widthPct === state.widthPct
          return same ? prev : state
        })
        const now = Date.now()
        if (cursorPendingIdxRef.current != null) {
          if (state?.cursorIdx === cursorPendingIdxRef.current) {
            cursorPendingIdxRef.current = null
            setCursorSliderLocalValue(null)
          } else {
            const pendingAge = now - cursorPendingAtRef.current
            if (pendingAge > 1200) {
              cursorPendingIdxRef.current = null
              if (now >= cursorUserLockUntilRef.current) setCursorSliderLocalValue(null)
            }
          }
        } else if (now >= cursorUserLockUntilRef.current) {
          setCursorSliderLocalValue(null)
        }
      }
    }
    sync()
    cursorModeUpdateRef.current = setInterval(sync, 100)
    return () => { if (cursorModeUpdateRef.current) clearInterval(cursorModeUpdateRef.current) }
  }, [])

  const commitCursorSliderIdx = useCallback((rawIdx, holdMs = 900) => {
    const idx = Number(rawIdx)
    if (!Number.isFinite(idx)) return
    cursorPendingIdxRef.current = idx
    cursorPendingAtRef.current = Date.now()
    cursorUserLockUntilRef.current = Date.now() + holdMs
    setCursorSliderLocalValue(idx)
    if (avgRef.current?.handleCursorChange) avgRef.current.handleCursorChange(idx)
  }, [])

  // Keep cursor slider reliably available in cursor mode across style/layout transitions.
  useEffect(() => {
    if (colorMappingMode !== 'cursor') return
    if (!cursorModeState.sliderEnabled && avgRef.current?.handleSet) {
      const now = Date.now()
      if (now - cursorRecoveryAtRef.current > 900) {
        cursorRecoveryAtRef.current = now
        try { avgRef.current.handleSet() } catch (e) { void e }
      }
    }
  }, [colorMappingMode, cursorModeState.sliderEnabled])

  // Phase 1 computation: PCA grouping for marker color coding.
  useEffect(() => {
    let cancelled = false
    const runGrouping = async () => {
      if (!groupingEnabled || !isLightLayer) {
        if (!cancelled) {
          setGroupAssignments({})
          setGroupStats([])
          setPcaExplained([])
          setClusteringCompactness(null)
          setGroupAveragedTraces([])
          setGroupRepresentation(null)
        }
        return
      }
      if (groupingMethod !== 'pca' && groupingMethod !== 'clustering' && groupingMethod !== 'rf') {
        if (!cancelled) {
          setGroupAssignments({})
          setGroupStats([])
          setPcaExplained([])
          setClusteringCompactness(null)
          setRfCompactness(null)
          setMethodComparison(null)
          setRecommendedMethod(null)
          setGroupAveragedTraces([])
          setGroupRepresentation(null)
        }
        return
      }

      try {
        const payload = avgRef.current?.getSpectralMatrix?.({ normalize: useNormalized })
        const ids = payload?.ids || []
        const matrix = payload?.matrix || []
        if (!ids.length || !matrix.length) {
          if (!cancelled) {
            setGroupAssignments({})
            setGroupStats([])
            setPcaExplained([])
            setClusteringCompactness(null)
            setRfCompactness(null)
            setMethodComparison(null)
            setRecommendedMethod(null)
            setMethodComparison(null)
            setRecommendedMethod(null)
            setGroupAveragedTraces([])
            setGroupRepresentation(null)
          }
          return
        }
        let result
        if (groupingMethod === 'pca') {
          result = computePCAGrouping({ ids, matrix, components: pcaComponents, groups: pcaGroupsCount, seed: groupingSeed })
        } else if (groupingMethod === 'clustering') {
          result = computeClusteringGrouping({ ids, matrix, groups: pcaGroupsCount, distance: clusteringDistance, init: clusteringInit, seed: groupingSeed })
        } else {
          result = computeRFGrouping({ ids, matrix, groups: pcaGroupsCount, trees: rfTrees, depth: rfDepth, seed: groupingSeed })
        }
        const assignments = result.groupAssignments || {}
        const xGrid = avgRef.current?.getSpectralGrid?.() || []
        const dims = matrix[0]?.length || 0
        const grouped = {}
        for (let i = 0; i < ids.length; i++) {
          const sid = String(ids[i])
          const gid = Number(assignments[sid])
          if (!Number.isFinite(gid)) continue
          const row = matrix[i]
          if (!Array.isArray(row) || !row.length) continue
          if (!grouped[gid]) grouped[gid] = { sum: new Array(dims).fill(0), count: 0 }
          for (let j = 0; j < dims; j++) grouped[gid].sum[j] += Number(row[j]) || 0
          grouped[gid].count += 1
        }
        const traceX = (Array.isArray(xGrid) && xGrid.length === dims)
          ? xGrid
          : Array.from({ length: dims }, (_, idx) => idx + 1)
        const traces = Object.keys(grouped)
          .map(k => Number(k))
          .sort((a, b) => a - b)
          .map(gid => {
            const bucket = grouped[gid]
            const y = bucket.sum.map(v => v / Math.max(1, bucket.count))
            return {
              x: traceX,
              y,
              type: 'scatter',
              mode: 'lines',
              name: `G${gid + 1}`,
              line: { width: 1.6, color: GROUP_COLORS[gid % GROUP_COLORS.length] }
            }
          })
        const representation = groupingMethod === 'pca'
          ? {
              method: 'pca',
              points: Array.isArray(result.scatterPoints) ? result.scatterPoints : [],
              xLabel: 'PC1',
              yLabel: 'PC2'
            }
          : {
              method: groupingMethod,
              dendrogram: result.dendrogram || { ids: [], merges: [] }
            }
        if (!cancelled) {
          setGroupAssignments(assignments)
          setGroupStats(result.groups || [])
          setPcaExplained(groupingMethod === 'pca' ? (result.explainedVariance || []) : [])
          setClusteringCompactness(groupingMethod === 'clustering' ? result.compactness : null)
          setRfCompactness(groupingMethod === 'rf' ? result.compactness : null)
          setGroupAveragedTraces(traces)
          setGroupRepresentation(representation)
        }

        const comparison = compareGroupingMethods({
          ids,
          matrix,
          groups: pcaGroupsCount,
          pcaComponents,
          clusteringDistance,
          clusteringInit,
          rfTrees,
          rfDepth,
          seed: groupingSeed
        })
        if (!cancelled) {
          setMethodComparison(comparison)
          setRecommendedMethod(comparison.bestMethod)
        }
      } catch (e) {
        if (!cancelled) {
          setGroupAssignments({})
          setGroupStats([])
          setPcaExplained([])
          setClusteringCompactness(null)
          setRfCompactness(null)
          setMethodComparison(null)
          setRecommendedMethod(null)
          setGroupAveragedTraces([])
          setGroupRepresentation(null)
        }
      }
    }

    const timer = setTimeout(runGrouping, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [groupingEnabled, groupingMethod, pcaComponents, pcaGroupsCount, clusteringDistance, clusteringInit, rfTrees, rfDepth, groupingSeed, useNormalized, selectedTable, isLightLayer, selectedGroupPalette])

  // Keep PCA panel anchored near top-right when it opens or window size changes.
  useEffect(() => {
    if (!isLightLayer || !groupingEnabled) return
    const onResize = () => {
      setPcaPanelRect(prev => {
        const maxLeft = Math.max(8, window.innerWidth - prev.width - 8)
        const maxTop = Math.max(8, window.innerHeight - prev.height - 8)
        const left = Math.min(prev.left, maxLeft)
        const top = Math.min(prev.top, maxTop)
        return (left === prev.left && top === prev.top) ? prev : { ...prev, left, top }
      })
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [groupingEnabled, groupingMethod, isLightLayer])

  // Open the grouping panel near the left edge when enabled.
  useEffect(() => {
    if (!isLightLayer || !groupingEnabled) return
    setPcaPanelRect(prev => ({ ...prev, left: 8 }))
    setPcaPanelMinimized(false)
  }, [groupingEnabled, isLightLayer])

  // Keep grouping panel tall enough to show all content when maximized (no internal scroll).
  useEffect(() => {
    if (!isLightLayer || !groupingEnabled || pcaPanelMinimized) return
    const raf = window.requestAnimationFrame(() => {
      const node = pcaPanelRef.current
      if (!node) return
      const contentHeight = Math.ceil(node.scrollHeight + 2)
      setPcaPanelRect(prev => {
        const maxH = Math.max(PCA_PANEL_MIN_HEIGHT, Math.floor(window.innerHeight - 16))
        const nextHeight = Math.min(maxH, Math.max(PCA_PANEL_MIN_HEIGHT, contentHeight))
        const nextTop = Math.max(8, Math.min(prev.top, window.innerHeight - nextHeight - 8))
        if (Math.abs(prev.height - nextHeight) < 1 && Math.abs(prev.top - nextTop) < 1) return prev
        return { ...prev, top: nextTop, height: nextHeight }
      })
    })
    return () => window.cancelAnimationFrame(raf)
  }, [
    isLightLayer,
    groupingEnabled,
    pcaPanelMinimized,
    groupingMethod,
    groupStats.length,
    pcaExplained.length,
    rfCompactness,
    clusteringCompactness,
    methodComparison,
    groupAveragedTraces.length
  ])

  // Drag + resize interactions for the floating grouping panel.
  useEffect(() => {
    const onMove = (e) => {
      const action = pcaPanelActionRef.current
      if (!action) return
      const dx = e.clientX - action.startX
      const dy = e.clientY - action.startY

      const minW = 220
      const minH = PCA_PANEL_MIN_HEIGHT
      const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.56))
      const maxH = Math.max(minH, Math.floor(window.innerHeight - 16))

      if (action.type === 'drag') {
        const left = Math.max(8, Math.min(action.startRect.left + dx, window.innerWidth - action.startRect.width - 8))
        const top = Math.max(8, Math.min(action.startRect.top + dy, window.innerHeight - action.startRect.height - 8))
        setPcaPanelRect(prev => ({ ...prev, left, top }))
        return
      }

      let { left, top, width, height } = action.startRect
      const dir = action.direction

      if (dir.includes('e')) width = action.startRect.width + dx
      if (dir.includes('s')) height = action.startRect.height + dy
      if (dir.includes('w')) {
        width = action.startRect.width - dx
        left = action.startRect.left + dx
      }
      if (dir.includes('n')) {
        height = action.startRect.height - dy
        top = action.startRect.top + dy
      }

      width = Math.max(minW, Math.min(maxW, width))
      height = Math.max(minH, Math.min(maxH, height))

      if (dir.includes('w')) left = action.startRect.left + (action.startRect.width - width)
      if (dir.includes('n')) top = action.startRect.top + (action.startRect.height - height)

      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      top = Math.max(8, Math.min(top, window.innerHeight - height - 8))

      setPcaPanelRect({ left, top, width, height })
    }

    const onUp = () => {
      pcaPanelActionRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Keep the floating averaged spectrum panel inside viewport bounds.
  useEffect(() => {
    const onResize = () => {
      setAvgPanelRect(prev => {
        const maxLeft = Math.max(8, window.innerWidth - prev.width - 8)
        const maxTop = Math.max(8, window.innerHeight - prev.height - 8)
        const left = Math.min(prev.left, maxLeft)
        const top = Math.min(prev.top, maxTop)
        return (left === prev.left && top === prev.top) ? prev : { ...prev, left, top }
      })
      setSamplePopupRect(prev => {
        const maxLeft = Math.max(8, window.innerWidth - prev.width - 8)
        const maxTop = Math.max(8, window.innerHeight - prev.height - 8)
        const left = Math.min(prev.left, maxLeft)
        const top = Math.min(prev.top, maxTop)
        return (left === prev.left && top === prev.top) ? prev : { ...prev, left, top }
      })
      setGroupAvgPopupRect(prev => {
        const maxLeft = Math.max(8, window.innerWidth - prev.width - 8)
        const maxTop = Math.max(8, window.innerHeight - prev.height - 8)
        const left = Math.min(prev.left, maxLeft)
        const top = Math.min(prev.top, maxTop)
        return (left === prev.left && top === prev.top) ? prev : { ...prev, left, top }
      })
      setGroupRepPanelRect(prev => {
        const maxLeft = Math.max(8, window.innerWidth - prev.width - 8)
        const maxTop = Math.max(8, window.innerHeight - prev.height - 8)
        const left = Math.min(prev.left, maxLeft)
        const top = Math.min(prev.top, maxTop)
        return (left === prev.left && top === prev.top) ? prev : { ...prev, left, top }
      })
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Drag interaction for floating averaged spectrum panel (Light mode).
  useEffect(() => {
    const onMove = (e) => {
      const action = avgPanelDragRef.current
      if (!action) return
      const dx = e.clientX - action.startX
      const dy = e.clientY - action.startY
      const width = action.startRect.width
      const height = action.startRect.height
      const left = Math.max(8, Math.min(action.startRect.left + dx, window.innerWidth - width - 8))
      const top = Math.max(8, Math.min(action.startRect.top + dy, window.innerHeight - height - 8))
      setAvgPanelRect(prev => ({ ...prev, left, top }))
    }
    const onUp = () => {
      avgPanelDragRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Default vertical stacking to avoid overlap between sample tooltip spectrum and group average popup.
  useEffect(() => {
    if (!open) return
    const rightGap = 58
    const sampleTop = bottomBarMinimized ? 180 : 86

    setSamplePopupRect(prev => ({
      ...prev,
      left: Math.max(8, window.innerWidth - prev.width - rightGap),
      top: Math.max(8, Math.min(sampleTop, window.innerHeight - 180))
    }))

    if (groupAveragedTraces.length > 0) {
      const groupTop = sampleTop + 245
      setGroupAvgPopupRect(prev => ({
        ...prev,
        left: Math.max(8, window.innerWidth - prev.width - rightGap),
        top: Math.max(8, Math.min(groupTop, window.innerHeight - 210))
      }))
    }
  }, [open, bottomBarMinimized, selectedSampleDetails, groupAveragedTraces.length])

  useEffect(() => {
    if (selectedSampleDetails) setSamplePopupMinimized(false)
  }, [selectedSampleDetails])

  useEffect(() => {
    if (groupRepresentation) setGroupRepPanelMinimized(false)
  }, [groupRepresentation?.method])

  // Drag interaction for sample details popup.
  useEffect(() => {
    const onMove = (e) => {
      const action = samplePopupDragRef.current
      if (!action) return
      const dx = e.clientX - action.startX
      const dy = e.clientY - action.startY
      const width = action.startRect.width
      const height = action.startRect.height
      const left = Math.max(8, Math.min(action.startRect.left + dx, window.innerWidth - width - 8))
      const top = Math.max(8, Math.min(action.startRect.top + dy, window.innerHeight - height - 8))
      setSamplePopupRect(prev => ({ ...prev, left, top }))
    }
    const onUp = () => { samplePopupDragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Drag interaction for group average popup.
  useEffect(() => {
    const onMove = (e) => {
      const action = groupAvgPopupDragRef.current
      if (!action) return
      const dx = e.clientX - action.startX
      const dy = e.clientY - action.startY
      const width = action.startRect.width
      const height = action.startRect.height
      const left = Math.max(8, Math.min(action.startRect.left + dx, window.innerWidth - width - 8))
      const top = Math.max(8, Math.min(action.startRect.top + dy, window.innerHeight - height - 8))
      setGroupAvgPopupRect(prev => ({ ...prev, left, top }))
    }
    const onUp = () => { groupAvgPopupDragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Drag interaction for grouping representation popup.
  useEffect(() => {
    const onMove = (e) => {
      const action = groupRepPanelDragRef.current
      if (!action) return
      const dx = e.clientX - action.startX
      const dy = e.clientY - action.startY
      const width = action.startRect.width
      const height = action.startRect.height
      const left = Math.max(8, Math.min(action.startRect.left + dx, window.innerWidth - width - 8))
      const top = Math.max(8, Math.min(action.startRect.top + dy, window.innerHeight - height - 8))
      setGroupRepPanelRect(prev => ({ ...prev, left, top }))
    }
    const onUp = () => { groupRepPanelDragRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Resize interaction for light-map floating popups.
  useEffect(() => {
    const onMove = (e) => {
      const action = popupResizeActionRef.current
      if (!action) return
      const dx = e.clientX - action.startX
      const dy = e.clientY - action.startY
      const minW = action.minW || 220
      const minH = action.minH || 160
      const maxW = Math.max(minW, Math.floor(window.innerWidth * 0.74))
      const maxH = Math.max(minH, Math.floor(window.innerHeight * 0.74))
      const nextW = Math.max(minW, Math.min(maxW, action.startRect.width + dx))
      const nextH = Math.max(minH, Math.min(maxH, action.startRect.height + dy))

      action.setRect(prev => ({
        ...prev,
        width: nextW,
        height: nextH,
        left: Math.min(prev.left, Math.max(8, window.innerWidth - nextW - 8)),
        top: Math.min(prev.top, Math.max(8, window.innerHeight - nextH - 8))
      }))
    }
    const onUp = () => { popupResizeActionRef.current = null }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [])

  // Trigger color update when switching to cursor mode
  useEffect(() => {
    if (!colorMappingMode) return // Skip if disabled
    if (colorMappingMode === 'cursor' && avgRef.current) {
      // Force a recomputation of cursor mode integrals immediately
      try {
        if (avgRef.current.computeIntegralsForCursor) {
          const result = avgRef.current.computeIntegralsForCursor(useNormalized)
          if (result) {
            setIntegralsMap(result.integrals || {})
            setIntegralsMeta({ min: result.min || 0, max: result.max || 0, x1: result.x1 || 0, x2: result.x2 || 0 })
          }
        }
      } catch (e) { void e }
    } else if (colorMappingMode === 'integration' && avgRef.current) {
      // Force recomputation for integration mode
      try {
        if (avgRef.current.computeIntegralsForRange) {
          const result = avgRef.current.computeIntegralsForRange(integrationLow, integrationHigh, useNormalized)
          if (result) {
            setIntegralsMap(result.integrals || {})
            setIntegralsMeta({ min: result.min || 0, max: result.max || 0, x1: result.x1 || 0, x2: result.x2 || 0 })
          }
        }
      } catch (e) { void e }
    }
  }, [colorMappingMode, useNormalized, integrationLow, integrationHigh])

  // Sync cursor wavelength slider from AveragedSpectrum state
  useEffect(() => {
    if (avgRef.current) {
      try {
        // Update domain based on the full range using getWavelengthRange
        const range = avgRef.current.getWavelengthRange?.()
        if (range && range.min !== undefined && range.max !== undefined) {
          if (Math.abs(cursorDomainMin - range.min) > 0.01 || Math.abs(cursorDomainMax - range.max) > 0.01) {
            setCursorDomainMin(range.min)
            setCursorDomainMax(range.max)
          }
        } else if (avgRef.current.grid && avgRef.current.grid.length > 0) {
          // Fallback to grid
          const min = avgRef.current.grid[0]
          const max = avgRef.current.grid[avgRef.current.grid.length - 1]
          if (Math.abs(cursorDomainMin - min) > 0.01 || Math.abs(cursorDomainMax - max) > 0.01) {
            setCursorDomainMin(min)
            setCursorDomainMax(max)
          }
        }
        
        // Sync x1/x2 values from state only if not currently dragging
        if (cursorModeState && !cursorDragRef.current) {
          const x1 = parseFloat(cursorModeState.x1Str)
          const x2 = parseFloat(cursorModeState.x2Str)
          if (!isNaN(x1) && !isNaN(x2)) {
            setCursorX1(x1)
            setCursorX2(x2)
          }
        }
      } catch (e) { void e }
    }
  }, [cursorModeState])

  // Initialize cursor wavelength values when switching to cursor mode or when sample changes
  useEffect(() => {
    if (colorMappingMode === 'cursor' && avgRef.current) {
      try {
        // Get current X1/X2 values from AveragedSpectrum
        const state = avgRef.current.getCursorModeState?.()
        if (state) {
          const x1 = parseFloat(state.x1Str)
          const x2 = parseFloat(state.x2Str)
          if (!isNaN(x1) && !isNaN(x2)) {
            setCursorX1(x1)
            setCursorX2(x2)
          }
        }
        // Get domain from getWavelengthRange (same as integration mode)
        const range = avgRef.current.getWavelengthRange?.()
        if (range && range.min !== undefined && range.max !== undefined) {
          setCursorDomainMin(range.min)
          setCursorDomainMax(range.max)
        } else if (avgRef.current.grid && avgRef.current.grid.length > 0) {
          // Fallback to grid if getWavelengthRange is not available
          setCursorDomainMin(avgRef.current.grid[0])
          setCursorDomainMax(avgRef.current.grid[avgRef.current.grid.length - 1])
        }
      } catch (e) { void e }
    }
  }, [colorMappingMode, selectedSampleRow])

  const buildDendrogramPlot = useCallback((dendrogram) => {
    const ids = Array.isArray(dendrogram?.ids) ? dendrogram.ids : []
    const merges = Array.isArray(dendrogram?.merges) ? dendrogram.merges : []
    if (!ids.length) return { lineX: [], lineY: [], leafX: [], leafY: [], leafIds: [] }

    const nodeX = new Map()
    const nodeY = new Map()
    const nodeSize = new Map()
    const lineX = []
    const lineY = []

    for (let i = 0; i < ids.length; i++) {
      nodeX.set(i, i)
      nodeY.set(i, 0)
      nodeSize.set(i, 1)
    }

    const sortedMerges = merges.slice().sort((a, b) => Number(a.id) - Number(b.id))
    for (const m of sortedMerges) {
      const left = Number(m.left)
      const right = Number(m.right)
      const curr = Number(m.id)
      if (!nodeX.has(left) || !nodeX.has(right)) continue
      const xl = nodeX.get(left)
      const xr = nodeX.get(right)
      const yl = nodeY.get(left) || 0
      const yr = nodeY.get(right) || 0
      const h = Number(m.height) || 0

      lineX.push(xl, xl, null, xr, xr, null, xl, xr, null)
      lineY.push(yl, h, null, yr, h, null, h, h, null)

      const sl = nodeSize.get(left) || 1
      const sr = nodeSize.get(right) || 1
      nodeX.set(curr, (xl * sl + xr * sr) / (sl + sr))
      nodeY.set(curr, h)
      nodeSize.set(curr, sl + sr)
    }

    return {
      lineX,
      lineY,
      leafX: ids.map((_, i) => i),
      leafY: ids.map(() => 0),
      leafIds: ids
    }
  }, [])

  if (!open) return null

  const groupAvgPlotWidth = Math.max(250, Math.min(420, groupAvgPopupRect.width - 14))
  const groupAvgPlotHeight = Math.max(140, Math.min(320, groupAvgPopupRect.height - 56))
  const groupRepPlotWidth = Math.max(280, Math.min(560, groupRepPanelRect.width - 14))
  const groupRepPlotHeight = Math.max(160, Math.min(360, groupRepPanelRect.height - 56))

  const startPcaPanelAction = (type, e, direction = null) => {
    if (!isLightLayer || !groupingEnabled) return
    e.preventDefault()
    e.stopPropagation()
    pcaPanelActionRef.current = {
      type,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...pcaPanelRect }
    }
  }

  const onPcaPanelPointerDown = (e) => {
    const interactive = e.target?.closest?.('input, select, option, button, textarea, .pca-resize-handle')
    if (interactive) return
    startPcaPanelAction('drag', e)
  }

  const startPopupResize = (e, setRect, startRect, minW = 220, minH = 160) => {
    e.preventDefault()
    e.stopPropagation()
    popupResizeActionRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      setRect,
      startRect: { ...startRect },
      minW,
      minH
    }
  }

  const onAvgPanelPointerDown = (e) => {
    const interactive = e.target?.closest?.('input, select, option, button, textarea, canvas, .popup-resize-handle')
    if (interactive) return
    e.preventDefault()
    e.stopPropagation()
    avgPanelDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...avgPanelRect }
    }
  }

  const onSamplePopupPointerDown = (e) => {
    const interactive = e.target?.closest?.('input, select, option, button, textarea, canvas, .popup-resize-handle')
    if (interactive) return
    e.preventDefault()
    e.stopPropagation()
    samplePopupDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...samplePopupRect }
    }
  }

  const onGroupAvgPopupPointerDown = (e) => {
    const interactive = e.target?.closest?.('input, select, option, button, textarea, canvas, .popup-resize-handle')
    if (interactive) return
    e.preventDefault()
    e.stopPropagation()
    groupAvgPopupDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...groupAvgPopupRect }
    }
  }

  const onGroupRepPanelPointerDown = (e) => {
    const interactive = e.target?.closest?.('input, select, option, button, textarea, canvas, .popup-resize-handle')
    if (interactive) return
    e.preventDefault()
    e.stopPropagation()
    groupRepPanelDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRect: { ...groupRepPanelRect }
    }
  }

  return (
    <div className="globe-modal-overlay" onClick={onClose}>
      <div className="globe-modal" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        {/* close button placed outside the top-right of the modal box for better visibility */}
        <button
          className="globe-close"
          onClick={onClose}
            style={{
            position: 'absolute',
            top: 0,
            right: 0,
            zIndex: 999,
            width: 36,
            height: 36,
            borderRadius: 18,
            border: 'none',
            background: 'rgba(0,0,0,0.6)',
            color: '#fff',
            cursor: 'pointer',
              boxShadow: 'none'
          }}
        >
          ✕
        </button>

        {/* Left-side collapsible panel (minivisible) holding the left controls */}
        {/* Panel sits vertically centered, width matches AveragedSpectrum (360px) and expands to map height when opened */}
        {
          /* local state for panel open/closed */
        }
        {/* Compact top-left basemap + samples toggle (restored to old position) */}
          <div style={{ position: 'absolute', left: 0, top: 0, zIndex: 1240 }}>
          <div style={{ background: 'transparent', color: '#fff', padding: 8, borderRadius: 0, boxShadow: 'none', display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 13, color: '#fff', marginRight: 6 }}>Basemap</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {STYLES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setLayer(s.id)}
                  title={s.label}
                  style={{
                    width: 64,
                    height: 44,
                    borderRadius: 6,
                    border: layer === s.id ? '2px solid var(--accent)' : '1px solid rgba(0,0,0,0.12)',
                    padding: 0,
                    backgroundColor: '#fff',
                    backgroundImage: previewUrl(s.styleId) ? `url(${previewUrl(s.styleId)})` : 'linear-gradient(90deg,#eee,#ddd)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
            
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginLeft: 6 }}>
              <input type="checkbox" checked={showSamples} onChange={(e) => setShowSamples(e.target.checked)} style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: 13, color: '#fff' }}>Samples</span>
            </label>
          </div>
          
        </div>

          {/* Range controller removed per user request */}

          <div className="globe-map" style={{ height: '100vh', position: 'relative' }}>
            <MapboxViewer
              className="globe-cs"
              selectedLayer={layer}
              showLabels={showLabels}
              showSamples={showSamples}
        homeRequest={homeRequestCounter}
        integrals={integralsMap}
        integralsMeta={integralsMeta}
              selectedPalette={selectedPalette}
                surfaceOverlayEnabled={layer === 'light' && surfaceOverlayEnabled}
              contourOverlayEnabled={layer === 'light' && contourOverlayEnabled}
              spreadDiameterKm={spreadDiameterKm}
              overlayOpacity={overlayOpacity}
              groupingEnabled={isLightLayer && groupingEnabled}
              groupingMethod={isLightLayer ? groupingMethod : 'pca'}
              groupAssignments={isLightLayer ? groupAssignments : {}}
              groupColors={GROUP_COLORS}
              useNormalized={useNormalized}
              onCameraChange={cameraChangeCallback}
              onMarkerClick={handleMarkerClick}
              selectedTable={selectedTable}
              selectedIdColumn={selectedIdColumn}
              spectralRanges={spectralRanges}
              setSpectralRanges={setSpectralRanges}
              activeRangeIndex={activeRangeIndex}
              setActiveRangeIndex={setActiveRangeIndex}
          />
          {/* Home button placed under Mapbox controls (top-right). Uses inline SVG and triggers homeRequestCounter. */}
          <div style={{ position: 'absolute', right: 5, top: 132, zIndex: 1260 }}>
            <button
              onClick={() => setHomeRequestCounter(c => c + 1)}
              title="Home"
              aria-label="Home"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 6,
                border: 'none',
                background: '#ffffff',
                boxShadow: '0 6px 18px rgba(0,0,0,0.16)',
                cursor: 'pointer',
                padding: 6
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 11.5L12 4L21 11.5" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 12V19C6 19.5523 6.44772 20 7 20H17C17.5523 20 18 19.5523 18 19V12" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M9 20V14H15V20" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* Position box at top-right of the GIS map */}
          <div style={{ position: 'absolute', right: 40, top: 0, zIndex: 1350 }}>
            <div style={{ background: controlBg, padding: '8px 10px', borderRadius: 8, color: textColor, backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', boxShadow: 'none', minWidth: 180, fontSize: 13 }}>
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
              {/* Test button to verify sample details rendering */}
              {/* Temporary debug UI removed */}
            </div>
          </div>

          {isLightLayer && groupingEnabled && (groupingMethod === 'pca' || groupingMethod === 'clustering' || groupingMethod === 'rf') && (
            <div
              ref={pcaPanelRef}
              onPointerDown={onPcaPanelPointerDown}
              style={{
                position: 'absolute',
                left: pcaPanelRect.left,
                top: pcaPanelRect.top,
                zIndex: 1350,
                background: controlBg,
                padding: '8px 10px',
                borderRadius: 8,
                color: textColor,
                width: pcaPanelRect.width,
                height: pcaPanelMinimized ? 42 : pcaPanelRect.height,
                fontSize: 11,
                overflow: 'hidden',
                touchAction: 'none',
                userSelect: 'none'
              }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: pcaPanelMinimized ? 0 : 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>
                    {groupingMethod === 'pca' ? 'PCA Groups' : groupingMethod === 'clustering' ? 'Clustering Groups' : 'RF Groups'}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPcaPanelMinimized(v => !v)
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: textColor,
                      cursor: 'pointer',
                      fontSize: 14,
                      lineHeight: 1,
                      padding: 0,
                      width: 18,
                      height: 18
                    }}
                    title={pcaPanelMinimized ? 'Maximize panel' : 'Minimize panel'}
                  >
                    {pcaPanelMinimized ? '▢' : '▁'}
                  </button>
                </div>
                {!pcaPanelMinimized && (
                  <>
                <div style={{ fontSize: 10, opacity: 0.75, marginBottom: 6 }}>Drag panel to move | drag any edge to resize</div>
                {groupStats.map((g) => (
                  <div key={g.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: GROUP_COLORS[g.id % GROUP_COLORS.length], display: 'inline-block' }} />
                      <span>Group {g.id + 1}</span>
                    </div>
                    <span>{g.count}</span>
                  </div>
                ))}
                {groupingMethod === 'pca' && pcaExplained.length > 1 && (
                  <div style={{ marginTop: 6, opacity: 0.85 }}>
                    PC1: {pcaExplained[0].toFixed(1)}% | PC2: {pcaExplained[1].toFixed(1)}%
                  </div>
                )}
                {groupingMethod === 'clustering' && Number.isFinite(clusteringCompactness) && (
                  <div style={{ marginTop: 6, opacity: 0.85 }}>
                    Compactness: {Number(clusteringCompactness).toFixed(2)}
                  </div>
                )}
                {groupingMethod === 'rf' && Number.isFinite(rfCompactness) && (
                  <div style={{ marginTop: 6, opacity: 0.85 }}>
                    RF Compactness: {Number(rfCompactness).toFixed(2)}
                  </div>
                )}
                {methodComparison?.bestMethod && (
                  <div style={{ marginTop: 6, fontWeight: 700 }}>
                    Recommended: {methodComparison.bestMethod.toUpperCase()}
                  </div>
                )}
                  </>
                )}
                {/* Resize handles: all edges and corners */}
                {!pcaPanelMinimized && (
                  <>
                <div className="pca-resize-handle" onPointerDown={(e) => startPcaPanelAction('resize', e, 'n')} style={{ position: 'absolute', top: -3, left: 10, right: 10, height: 6, cursor: 'ns-resize' }} />
                <div className="pca-resize-handle" onPointerDown={(e) => startPcaPanelAction('resize', e, 's')} style={{ position: 'absolute', bottom: -3, left: 10, right: 10, height: 6, cursor: 'ns-resize' }} />
                <div className="pca-resize-handle" onPointerDown={(e) => startPcaPanelAction('resize', e, 'e')} style={{ position: 'absolute', top: 10, right: -3, bottom: 10, width: 6, cursor: 'ew-resize' }} />
                <div className="pca-resize-handle" onPointerDown={(e) => startPcaPanelAction('resize', e, 'w')} style={{ position: 'absolute', top: 10, left: -3, bottom: 10, width: 6, cursor: 'ew-resize' }} />
                <div className="pca-resize-handle" onPointerDown={(e) => startPcaPanelAction('resize', e, 'nw')} style={{ position: 'absolute', top: -4, left: -4, width: 10, height: 10, cursor: 'nwse-resize' }} />
                <div className="pca-resize-handle" onPointerDown={(e) => startPcaPanelAction('resize', e, 'ne')} style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, cursor: 'nesw-resize' }} />
                <div className="pca-resize-handle" onPointerDown={(e) => startPcaPanelAction('resize', e, 'sw')} style={{ position: 'absolute', bottom: -4, left: -4, width: 10, height: 10, cursor: 'nesw-resize' }} />
                <div className="pca-resize-handle" onPointerDown={(e) => startPcaPanelAction('resize', e, 'se')} style={{ position: 'absolute', bottom: -4, right: -4, width: 10, height: 10, cursor: 'nwse-resize' }} />
                  </>
                )}
            </div>
          )}

      {/* New bottom bar: averaged spectrum (left), horizontal color palette (middle), slider (below palette) */}
          <div className="globe-bottom-bar" style={{ position: 'absolute', left: 0, bottom: 0, width: '98vw', height: bottomBarMinimized ? '32px' : 'auto', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: bottomBarMinimized ? 'center' : 'flex-start', gap: bottomBarMinimized ? 0 : (layer === 'light' ? 10 : 16), padding: bottomBarMinimized ? '0 12px' : (layer === 'light' ? '10px 8px 4px 8px' : '10px 8px 4px calc(12cm + 8px)'), background: controlBg, borderRadius: 6, boxShadow: 'none', backdropFilter: 'blur(6px)', transition: 'height 0.2s ease, padding 0.2s ease' }}>
        {/* Title and note shown when minimized */}
        {bottomBarMinimized && (
          <>
            <span style={{ position: 'absolute', left: 12, fontStyle: 'italic', fontSize: 11, color: textColor, opacity: 0.8 }}>
              Note: Click on the sample marker to get Sample details
            </span>
            <span style={{ fontWeight: 700, fontSize: 13, color: textColor, letterSpacing: '0.5px', margin: '0 auto' }}>SPECTRAL ANALYSIS TOOLS</span>
          </>
        )}
        {/* Minimize/Maximize button at top-right corner */}
        <button
          onClick={() => setBottomBarMinimized(!bottomBarMinimized)}
          style={{
            position: 'absolute',
            right: 8,
            top: bottomBarMinimized ? '50%' : 4,
            transform: bottomBarMinimized ? 'translateY(-50%)' : 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            borderRadius: 4,
            width: 32,
            height: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            color: '#000',
            fontSize: 16,
            fontWeight: 'bold',
            boxShadow: 'none'
          }}
          title={bottomBarMinimized ? 'Maximize' : 'Minimize'}
        >
          {bottomBarMinimized ? '▲' : '▼'}
        </button>

        {!bottomBarMinimized && layer !== 'light' && (
          <div style={{ position: 'absolute', left: 12, bottom: 8, zIndex: 2, background: 'transparent', border: 'none', borderRadius: 8, padding: '8px 10px', boxShadow: 'none', backdropFilter: 'none' }}>
            <div style={{ width: 390, overflow: 'hidden' }}>
              <AveragedSpectrum ref={avgRef} selectedTable={selectedTable} selectedIdColumn={selectedIdColumn} controlBg={controlBg} textColor={textColor} useNormalized={useNormalized} colorMappingMode={colorMappingMode} integrationRangeLow={colorMappingMode === 'integration' ? integrationLow : cursorX1} integrationRangeHigh={colorMappingMode === 'integration' ? integrationHigh : cursorX2} onRangeChange={(info) => {
                if (colorMappingMode === 'cursor') {
                  setIntegralsMap(info.integrals || {})
                  setIntegralsMeta({ min: info.min || 0, max: info.max || 0, x1: info.x1 || 0, x2: info.x2 || 0 })
                }
                if (info && info.x1 !== undefined && info.x2 !== undefined) {
                  try {
                    const range = avgRef?.current?.getWavelengthRange?.()
                    if (range) {
                      setIntegrationDomainMin(range.min)
                      setIntegrationDomainMax(range.max)
                      if (integrationLow === 0 && integrationHigh === 100) {
                        setIntegrationLow(range.min)
                        setIntegrationHigh(range.max)
                      }
                    }
                  } catch (er) { void er }
                }
                if (info && info.x1 !== undefined && info.x2 !== undefined) {
                  setPaletteDomainMin(info.x1)
                  setPaletteDomainMax(info.x2)
                  setPaletteLow(info.x1)
                  setPaletteHigh(info.x2)
                }
              }} inline={true} />
            </div>
          </div>
        )}
        
        <div style={{ display: bottomBarMinimized ? 'none' : 'contents' }}>
        {/* Color bar, palette selector, and normalization - right next to spectrum */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: layer === 'light' ? 0 : 6, flex: '0 0 auto', marginLeft: layer === 'light' ? 0 : 6, marginTop: 0, order: layer === 'light' ? 0 : 3 }}>
          {/* Spectral range color bar + method comparison */}
          {layer === 'light' ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 8, width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                
              </div>

              
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', gap: 16, width: '100%' }}>
              <div style={{ position: 'relative', width: 280, height: 18 }}>
                <div
                  style={{
                    position: 'absolute', inset: 0,
                    borderRadius: 6,
                    background: `linear-gradient(to right, ${[...PALETTES[selectedPalette].colors].reverse().join(', ')})`,
                    boxShadow: 'none'
                  }}
                  aria-hidden={true}
                />
                <div style={{ position: 'absolute', top: -30, left: 0, fontSize: 11, fontWeight: 600, color: '#000' }}>
                  Low
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#000000ff', marginTop: 2 }}>
                    {integralsMeta.min.toFixed(2)}
                  </div>
                </div>
                <div style={{ position: 'absolute', top: -30, right: 0, fontSize: 11, fontWeight: 600, color: '#000', textAlign: 'right' }}>
                  High
                  <div style={{ fontSize: 9, fontWeight: 400, color: '#050505ff', marginTop: 2 }}>
                    {integralsMeta.max.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {layer === 'light' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 0, padding: '10px 12px', border: '1px solid rgba(0,0,0,0.14)', borderRadius: 8, background: 'rgba(255,255,255,0.56)', minWidth: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 12, rowGap: 0, alignItems: 'start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: textColor }}>Grouping</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: textColor }}>
                      <input
                        type="checkbox"
                        checked={groupingEnabled}
                        onChange={(e) => setGroupingEnabled(e.target.checked)}
                        style={{ width: 14, height: 14 }}
                      />
                      <span>Grouping Methods</span>
                    </label>
                    <select
                      value={groupingMethod}
                      onChange={(e) => setGroupingMethod(e.target.value)}
                      style={{ fontSize: 10, padding: '3px 5px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.2)', background: '#fff', color: textColor, minWidth: 110 }}
                    >
                      <option value="pca">PCA</option>
                      <option value="clustering">Clustering</option>
                      <option value="rf">Random Forest</option>
                    </select>
                  </div>

                  {groupingEnabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 11, color: textColor }}>Group Palette</label>
                      <select
                        value={selectedGroupPalette}
                        onChange={(e) => setSelectedGroupPalette(e.target.value)}
                        style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.2)', background: '#fff', color: textColor, minWidth: 170 }}
                      >
                        {Object.entries(GROUP_PALETTES).map(([key, item]) => (
                          <option key={key} value={key}>{item.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {groupingEnabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {groupingMethod === 'pca' && (
                        <>
                          <label style={{ fontSize: 11, color: textColor }}>PCs</label>
                          <select value={pcaComponents} onChange={(e) => setPcaComponents(Number(e.target.value))} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4 }}>
                            <option value={2}>2</option>
                            <option value={3}>3</option>
                          </select>
                        </>
                      )}
                      <label style={{ fontSize: 11, color: textColor }}>Groups</label>
                      <input
                        type="range"
                        min={2}
                        max={6}
                        step={1}
                        value={pcaGroupsCount}
                        onChange={(e) => setPcaGroupsCount(Number(e.target.value))}
                        style={{ width: 92 }}
                      />
                      <span style={{ fontSize: 11, color: textColor, minWidth: 14 }}>{pcaGroupsCount}</span>
                    </div>
                  )}

                  {groupingEnabled && groupingMethod === 'clustering' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 11, color: textColor }}>Distance</label>
                      <select value={clusteringDistance} onChange={(e) => setClusteringDistance(e.target.value)} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4 }}>
                        <option value="euclidean">Euclidean</option>
                        <option value="manhattan">Manhattan</option>
                      </select>
                      <label style={{ fontSize: 11, color: textColor }}>Init</label>
                      <select value={clusteringInit} onChange={(e) => setClusteringInit(e.target.value)} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4 }}>
                        <option value="spread">Spread</option>
                        <option value="kmeans++">KMeans++</option>
                      </select>
                    </div>
                  )}

                  {groupingEnabled && groupingMethod === 'rf' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 11, color: textColor }}>Trees</label>
                      <input
                        type="range"
                        min={8}
                        max={96}
                        step={8}
                        value={rfTrees}
                        onChange={(e) => setRfTrees(Number(e.target.value))}
                        style={{ width: 92 }}
                      />
                      <span style={{ fontSize: 11, color: textColor, minWidth: 18 }}>{rfTrees}</span>
                      <label style={{ fontSize: 11, color: textColor }}>Depth</label>
                      <select value={rfDepth} onChange={(e) => setRfDepth(Number(e.target.value))} style={{ fontSize: 10, padding: '2px 5px', borderRadius: 4 }}>
                        <option value={2}>2</option>
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                        <option value={6}>6</option>
                      </select>
                    </div>
                  )}

                  {groupingEnabled && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <label style={{ fontSize: 11, color: textColor }}>Seed</label>
                      <input
                        type="number"
                        value={groupingSeed}
                        min={1}
                        max={999999}
                        onChange={(e) => setGroupingSeed(Number(e.target.value) || 42)}
                        style={{ width: 90, fontSize: 10, padding: '2px 5px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.2)' }}
                      />
                      {recommendedMethod && (
                        <span style={{ fontSize: 10, color: textColor, opacity: 0.8 }}>Best: {recommendedMethod.toUpperCase()}</span>
                      )}
                    </div>
                  )}

                  {groupingEnabled && !isLightLayer && methodComparison?.methods?.length > 0 && (
                    <div style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.55)', fontSize: 10 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Method Comparison</div>
                      {methodComparison.methods.map((m) => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 2 }}>
                          <span>{m.label}</span>
                          <span>
                            {Number.isFinite(m.score) ? m.score.toFixed(2) : 'n/a'}
                            {m.id === recommendedMethod ? ' (recommended)' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: textColor }}>Overlay</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: textColor, whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={surfaceOverlayEnabled}
                        onChange={(e) => setSurfaceOverlayEnabled(e.target.checked)}
                        style={{ width: 14, height: 14 }}
                      />
                      <span>Map Overlay</span>
                    </label>
                    <label style={{ fontSize: 11, fontWeight: 600, color: textColor, whiteSpace: 'nowrap' }}>Palette:</label>
                    <select
                      value={selectedPalette}
                      onChange={(e) => setSelectedPalette(e.target.value)}
                      style={{
                        fontSize: 10,
                        padding: '3px 5px',
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.3)',
                        background: 'rgba(255,255,255,0.1)',
                        color: textColor,
                        minWidth: 100
                      }}>
                      {Object.entries(PALETTES).map(([key, palette]) => (
                        <option key={key} value={key}>
                          {palette.label}
                        </option>
                      ))}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: textColor, whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={contourOverlayEnabled}
                        onChange={(e) => setContourOverlayEnabled(e.target.checked)}
                        style={{ width: 14, height: 14 }}
                      />
                      <span>Contours</span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 11, color: textColor, minWidth: 88 }}>Spread (km)</label>
                    <input
                      type="range"
                      min={1}
                      max={400}
                      step={1}
                      value={spreadDiameterKm}
                      onChange={(e) => setSpreadDiameterKm(Number(e.target.value))}
                      style={{ width: 170 }}
                    />
                    <span style={{ fontSize: 11, color: textColor, minWidth: 42 }}>{spreadDiameterKm}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ fontSize: 11, color: textColor, minWidth: 88 }}>Transparency</label>
                    <input
                      type="range"
                      min={0.05}
                      max={0.9}
                      step={0.05}
                      value={overlayOpacity}
                      onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                      style={{ width: 170 }}
                    />
                    <span style={{ fontSize: 11, color: textColor, minWidth: 42 }}>{Math.round(overlayOpacity * 100)}%</span>
                  </div>

                  {groupingEnabled && methodComparison?.methods?.length > 0 && (
                    <div style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', background: 'rgba(255,255,255,0.55)', fontSize: 10, lineHeight: 1.2, marginTop: 2 }}>
                      <div style={{ fontWeight: 700, marginBottom: 4 }}>Method Comparison</div>
                      {methodComparison.methods.map((m) => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 2 }}>
                          <span>{m.label}</span>
                          <span>
                            {Number.isFinite(m.score) ? m.score.toFixed(2) : 'n/a'}
                            {m.id === recommendedMethod ? ' (recommended)' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: textColor, whiteSpace: 'nowrap' }}>Palette:</label>
                <select 
                  value={selectedPalette} 
                  onChange={(e) => setSelectedPalette(e.target.value)} 
                  style={{ 
                    fontSize: 10, 
                    padding: '3px 5px',
                    borderRadius: 4,
                    border: '1px solid rgba(255,255,255,0.3)',
                    background: 'rgba(255,255,255,0.1)',
                    color: textColor,
                    minWidth: 100
                  }}>
                  {Object.entries(PALETTES).map(([key, palette]) => (
                    <option key={key} value={key}>
                      {palette.label}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 2, alignSelf: 'stretch', minWidth: 170 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: textColor }}>
                  <input
                    type="checkbox"
                    checked={useNormalized}
                    onChange={() => setUseNormalized(true)}
                    style={{ width: 14, height: 14 }}
                  />
                  <span>Normalized Spectrum</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: textColor }}>
                  <input
                    type="checkbox"
                    checked={!useNormalized}
                    onChange={() => setUseNormalized(false)}
                    style={{ width: 14, height: 14 }}
                  />
                  <span>Original Spectrum</span>
                </label>
              </div>
            </div>
          )}

        </div>
        
        {/* Color Mapping Mode Selection - vertical radio switch */}
        <div style={{ background: 'transparent', color: textColor, padding: 8, marginLeft: layer === 'light' ? 10 : 6, display: 'flex', flexDirection: 'column', gap: layer === 'light' ? 2 : 6, flex: '0 0 auto', alignItems: 'center', position: 'relative', order: layer === 'light' ? 0 : 4 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: textColor, marginBottom: 6, transform: 'translateY(-1cm)' }}>Color Mapping</label>
          
          {/* Vertical Radio Switch */}
          <div style={{ 
            position: 'relative', 
            width: 60, 
            height: 80, 
            background: 'rgba(0,0,0,0.1)', 
            borderRadius: 20, 
            border: '1px solid rgba(0,0,0,0.2)',
            cursor: 'pointer',
            marginTop: 8,
            transform: 'translateY(-1cm)'
          }}
          onMouseEnter={() => setToggleHovered(true)}
          onMouseLeave={() => setToggleHovered(false)}
          onClick={() => {
            setToggleHovered(false)
            // Single click: Switch between modes (only if already enabled)
            if (colorMappingMode) {
              const newMode = colorMappingMode === 'cursor' ? 'integration' : 'cursor'
              setColorMappingMode(newMode)
              setLastActiveMode(newMode)
              if (newMode === 'integration') {
                try {
                  const result = avgRef?.current?.computeIntegralsForRange?.(integrationLow, integrationHigh, useNormalized)
                  if (result) {
                    setIntegralsMap(result.integrals || {})
                    setIntegralsMeta({ min: result.min || 0, max: result.max || 0, x1: result.x1 || 0, x2: result.x2 || 0 })
                  }
                } catch (er) { void er }
              }
            }
          }}
          onDoubleClick={() => {
            setToggleHovered(false)
            // Double click: Toggle on/off
            if (colorMappingMode) {
              // Turn off
              setColorMappingMode(null)
              setIntegralsMap({})
            } else {
              // Turn on (restore last active mode)
              setColorMappingMode(lastActiveMode)
            }
          }}>
            {/* Switch Knob */}
            <div style={{
              position: 'absolute',
              top: !colorMappingMode ? 23 : (colorMappingMode === 'cursor' ? 4 : 42),
              left: 4,
              width: 52,
              height: 34,
              background: !colorMappingMode ? 'rgba(128,128,128,0.6)' : (colorMappingMode === 'cursor' ? 'rgba(0,120,255,0.9)' : 'rgba(0,200,100,0.9)'),
              borderRadius: 16,
              transition: 'top 0.2s ease, background 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
              color: '#fff',
              textTransform: 'uppercase',
              boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
            }}>
              {!colorMappingMode ? 'OFF' : (colorMappingMode === 'cursor' ? 'Cursor' : 'Integ')}
            </div>

          </div>

          {/* Tooltip */}
          {toggleHovered && !toggleTooltipDismissed && (
            <div 
              onMouseEnter={() => setToggleHovered(true)}
              onMouseLeave={() => setToggleHovered(false)}
              style={{
              position: 'absolute',
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              marginBottom: '-48px',
              background: 'rgba(0, 0, 0, 0.9)',
              color: '#fff',
              padding: '8px 10px',
              borderRadius: '4px',
              fontSize: '10px',
              fontWeight: '500',
              zIndex: 2000,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              pointerEvents: 'auto',
              minWidth: '200px'
            }}>
              <div style={{ marginBottom: '6px', whiteSpace: 'nowrap' }}>
                Single click: Switch modes | Double click: Toggle ON/OFF
              </div>
              <div 
                onClick={(e) => {
                  e.stopPropagation()
                  sessionStorage.setItem('toggleTooltipDismissed', 'true')
                  setToggleTooltipDismissed(true)
                  setToggleHovered(false)
                }}
                style={{
                  fontSize: '9px',
                  color: '#aaa',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  textAlign: 'center',
                  paddingTop: '4px',
                  borderTop: '1px solid rgba(255,255,255,0.2)'
                }}
              >
                Don't show again
              </div>
            </div>
          )}

          {layer === 'light' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 'calc(-1cm - 8px)', alignSelf: 'stretch', minWidth: 120 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: textColor }}>
                <input
                  type="checkbox"
                  checked={useNormalized}
                  onChange={() => setUseNormalized(true)}
                  style={{ width: 14, height: 14 }}
                />
                <span>Normalized Spectrum</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11, color: textColor }}>
                <input
                  type="checkbox"
                  checked={!useNormalized}
                  onChange={() => setUseNormalized(false)}
                  style={{ width: 14, height: 14 }}
                />
                <span>Original Spectrum</span>
              </label>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: '0 0 auto', marginLeft: layer === 'light' ? 10 : 8, order: layer === 'light' ? 0 : 5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Cursor Mode Box - always visible, blurred when disabled */}
        {(colorMappingMode === 'cursor' || !colorMappingMode) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12, background: 'rgba(0,120,255,0.05)', borderRadius: 8, border: '1px solid rgba(0,120,255,0.2)', flex: '0 0 auto', width: 390, minHeight: 164, marginRight: 0, overflow: 'hidden', filter: !colorMappingMode ? 'blur(2px)' : 'none', opacity: !colorMappingMode ? 0.5 : 1, pointerEvents: !colorMappingMode ? 'none' : 'auto', transition: 'filter 0.3s ease, opacity 0.3s ease' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: textColor, marginBottom: 8 }}>Cursor Mode</div>
            
            {/* Wavelength Selector Label */}
            <div style={{ fontSize: 11, fontWeight: 600, color: textColor, marginBottom: 2, opacity: !wavelengthRegionEnabled ? 0.4 : 1 }}>Wavelength Selector</div>
            {/* Slider track - now on top */}
            <div 
              onClick={() => {
                if (!wavelengthRegionEnabled) {
                  setWavelengthRegionEnabled(true)
                }
              }}
              style={{ position: 'relative', height: 24, background: 'rgba(0,0,0,0.03)', borderRadius: 4, width: '100%', marginBottom: 2, opacity: !wavelengthRegionEnabled ? 0.4 : 1, cursor: !wavelengthRegionEnabled ? 'pointer' : 'default' }}
            >
              <div style={{ position: 'absolute', left: `${cursorModeState.leftPct}%`, width: `${cursorModeState.widthPct}%`, top: 4, height: 8, background: 'rgba(107,33,168,0.15)', borderRadius: 4 }} />
              {cursorModeState.sliderEnabled && (
                <input
                  className="cursor-mode-range"
                  type="range"
                  min={cursorModeState.leftIdx}
                  max={cursorModeState.rightIdx}
                  step={1}
                  value={cursorSliderLocalValue == null ? (cursorModeState.cursorIdx == null ? cursorModeState.leftIdx : cursorModeState.cursorIdx) : cursorSliderLocalValue}
                  onInput={(e) => {
                    commitCursorSliderIdx(e.target.value, 900)
                  }}
                  onChange={(e) => {
                    commitCursorSliderIdx(e.target.value, 900)
                  }}
                  onClick={(e) => {
                    commitCursorSliderIdx(e.currentTarget.value, 900)
                  }}
                  onPointerUp={(e) => {
                    const idx = Number(e.currentTarget.value)
                    if (Number.isFinite(idx)) {
                      commitCursorSliderIdx(idx, 500)
                    } else {
                      const pending = cursorPendingIdxRef.current
                      if (pending != null && avgRef.current?.handleCursorChange) avgRef.current.handleCursorChange(pending)
                      cursorUserLockUntilRef.current = Date.now() + 500
                    }
                  }}
                  onPointerCancel={() => {
                    cursorUserLockUntilRef.current = Date.now() + 500
                  }}
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, width: '100%', background: 'transparent', cursor: 'pointer', zIndex: 2, pointerEvents: wavelengthRegionEnabled ? 'auto' : 'none' }}
                />
              )}
            </div>
            
            {/* Wavelength Region Selector Label */}
            <div style={{ fontSize: 11, fontWeight: 600, color: textColor, marginTop: 4, marginBottom: 2, opacity: wavelengthRegionEnabled ? 0.4 : 1 }}>Wavelength Region Selector</div>
            {/* Wavelength Region Slider - two-point slider */}
            <div style={{ position: 'relative', width: '100%', height: 24, marginTop: 0, opacity: wavelengthRegionEnabled ? 0.4 : 1 }}>
              {/* Transparent overlay when disabled to catch clicks */}
              {wavelengthRegionEnabled && (
                <div 
                  onClick={() => setWavelengthRegionEnabled(false)}
                  style={{ position: 'absolute', inset: 0, cursor: 'pointer', zIndex: 10 }}
                />
              )}
              {(() => {
                // Use cursorModeState as source of truth, with fallback to state
                const x1Val = parseFloat(cursorModeState.x1Str) || cursorX1
                const x2Val = parseFloat(cursorModeState.x2Str) || cursorX2
                const domainMin = cursorDomainMin
                const domainMax = cursorDomainMax
                
                return (
                  <>
                    {/* Track background */}
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 4, background: 'rgba(0,0,0,0.1)', borderRadius: 2 }} />
                    {/* Selected range highlight */}
                    <div style={{ 
                      position: 'absolute', 
                      left: `${((x1Val - domainMin) / (domainMax - domainMin)) * 100}%`, 
                      right: `${100 - ((x2Val - domainMin) / (domainMax - domainMin)) * 100}%`, 
                      top: 10, 
                      height: 4, 
                      background: 'rgba(0,120,255,0.5)', 
                      borderRadius: 2 
                    }} />
                    <input
                      type="range"
                      min={domainMin}
                      max={domainMax}
                      value={x1Val}
                      step={Math.max((domainMax - domainMin) / 512 || 0.01, 1e-6)}
                      onPointerDown={() => { 
                        // Enable two-point slider, disable one-point slider
                        setWavelengthRegionEnabled(false)
                        cursorDragRef.current = 'low'; 
                        setCursorDragging('low') 
                      }}
                      onPointerUp={() => { cursorDragRef.current = null; setCursorDragging(null) }}
                      onPointerCancel={() => { cursorDragRef.current = null; setCursorDragging(null) }}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        const step = Math.max((domainMax - domainMin) / 512 || 0.01, 1e-6)
                        // Get fresh x2 value from cursorModeState
                        const currentX2 = parseFloat(cursorModeState.x2Str) || x2Val
                        const clamped = Math.min(v, currentX2 - step)
                        setCursorX1(clamped)
                        // Update X1 string immediately for visual feedback
                        if (avgRef.current?.setX1Str) avgRef.current.setX1Str(clamped.toFixed(2))
                        // Debounce the handleSet call to avoid excessive updates
                        try { if (cursorDebounceRef.current) clearTimeout(cursorDebounceRef.current) } catch (er) { void er }
                        cursorDebounceRef.current = setTimeout(() => {
                          try {
                            if (avgRef.current?.handleSet) avgRef.current.handleSet()
                          } catch (er) { void er }
                        }, 40)
                      }}
                      className="cursor-range-slider"
                      style={{ position: 'absolute', left: 0, right: 0, width: '100%', height: '100%', background: 'transparent', WebkitAppearance: 'none', appearance: 'none', pointerEvents: 'none', zIndex: 3 }}
                      aria-label='Wavelength low'
                    />
                    <input
                      type="range"
                      min={domainMin}
                      max={domainMax}
                      value={x2Val}
                      step={Math.max((domainMax - domainMin) / 512 || 0.01, 1e-6)}
                      onPointerDown={() => { 
                        // Enable two-point slider, disable one-point slider
                        setWavelengthRegionEnabled(false)
                        cursorDragRef.current = 'high'; 
                        setCursorDragging('high') 
                      }}
                      onPointerUp={() => { cursorDragRef.current = null; setCursorDragging(null) }}
                      onPointerCancel={() => { cursorDragRef.current = null; setCursorDragging(null) }}
                      onChange={(e) => {
                        const v = Number(e.target.value)
                        const step = Math.max((domainMax - domainMin) / 512 || 0.01, 1e-6)
                        // Get fresh x1 value from cursorModeState
                        const currentX1 = parseFloat(cursorModeState.x1Str) || x1Val
                        const clamped = Math.max(v, currentX1 + step)
                        setCursorX2(clamped)
                        // Update X2 string immediately for visual feedback
                        if (avgRef.current?.setX2Str) avgRef.current.setX2Str(clamped.toFixed(2))
                        // Debounce the handleSet call to avoid excessive updates
                        try { if (cursorDebounceRef.current) clearTimeout(cursorDebounceRef.current) } catch (er) { void er }
                        cursorDebounceRef.current = setTimeout(() => {
                          try {
                            if (avgRef.current?.handleSet) avgRef.current.handleSet()
                          } catch (er) { void er }
                        }, 40)
                      }}
                      className="cursor-range-slider"
                      style={{ position: 'absolute', left: 0, right: 0, width: '100%', height: '100%', background: 'transparent', WebkitAppearance: 'none', appearance: 'none', pointerEvents: 'none', zIndex: 4 }}
                      aria-label='Wavelength high'
                    />
                  </>
                )
              })()}
              <style>{`
                .cursor-range-slider::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  appearance: none;
                  width: 16px;
                  height: 16px;
                  background: rgba(0,120,255,0.9);
                  border-radius: 50%;
                  cursor: pointer;
                  pointer-events: auto;
                  border: 2px solid white;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                .cursor-range-slider::-moz-range-thumb {
                  width: 16px;
                  height: 16px;
                  background: rgba(0,120,255,0.9);
                  border-radius: 50%;
                  cursor: pointer;
                  pointer-events: auto;
                  border: 2px solid white;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                .cursor-range-slider::-webkit-slider-runnable-track {
                  background: transparent;
                }
                .cursor-range-slider::-moz-range-track {
                  background: transparent;
                }
              `}</style>
            </div>
            {/* Note about clicking disabled slider */}
            <div style={{ fontSize: 10, color: textColor, opacity: 0.7, fontStyle: 'italic', marginTop: -8 }}>
              Note: Click on the disabled slider to enable it
            </div>
          </div>
        )}

        {layer === 'light' && Boolean(colorMappingMode) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0', minHeight: 164 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#000' }}>High</div>
            <div style={{ fontSize: 9, color: '#111' }}>{integralsMeta.max.toFixed(2)}</div>
            <div style={{ width: 18, height: 'calc(104px + 0.5cm)', borderRadius: 6, background: `linear-gradient(to top, ${[...PALETTES[selectedPalette].colors].reverse().join(', ')})` }} aria-hidden={true} />
            <div style={{ fontSize: 10, fontWeight: 600, color: '#000' }}>Low</div>
            <div style={{ fontSize: 9, color: '#111' }}>{integralsMeta.min.toFixed(2)}</div>
          </div>
        )}
        
        {/* Integration Module - always visible, blurred when disabled */}
        {((layer === 'light' && colorMappingMode === 'integration') || (layer !== 'light' && (colorMappingMode === 'integration' || !colorMappingMode))) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12, background: 'rgba(0,200,100,0.05)', borderRadius: 8, border: '1px solid rgba(0,200,100,0.2)', flex: '0 0 auto', width: 420, minHeight: 164, marginRight: 0, filter: !colorMappingMode ? 'blur(2px)' : 'none', opacity: !colorMappingMode ? 0.5 : 'none', pointerEvents: !colorMappingMode ? 'none' : 'auto', transition: 'filter 0.3s ease, opacity 0.3s ease' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: textColor, marginBottom: 8 }}>Integration Mode</div>
            {/* Slider - now on top */}
            <div style={{ position: 'relative', width: '100%', height: 24, marginBottom: 8 }}>
              {/* Track background */}
              <div style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 4, background: 'rgba(0,0,0,0.1)', borderRadius: 2 }} />
              {/* Selected range highlight */}
              <div style={{ 
                position: 'absolute', 
                left: `${((integrationLow - integrationDomainMin) / (integrationDomainMax - integrationDomainMin)) * 100}%`, 
                right: `${100 - ((integrationHigh - integrationDomainMin) / (integrationDomainMax - integrationDomainMin)) * 100}%`, 
                top: 10, 
                height: 4, 
                background: 'rgba(0,200,100,0.5)', 
                borderRadius: 2 
              }} />
              <input
                type="range"
                min={integrationDomainMin}
                max={integrationDomainMax}
                value={integrationLow}
                step={Math.max((integrationDomainMax - integrationDomainMin) / 512 || 0.01, 1e-6)}
                onPointerDown={() => { integrationDragRef.current = 'low'; setIntegrationDragging('low') }}
                onPointerUp={() => { integrationDragRef.current = null; setIntegrationDragging(null) }}
                onPointerCancel={() => { integrationDragRef.current = null; setIntegrationDragging(null) }}
                onChange={(e) => {
                  const raw = e.target.value
                  const v = Number(raw)
                  const step = Math.max((integrationDomainMax - integrationDomainMin) / 512 || 0.01, 1e-6)
                  const clamped = Math.min(v, Number(integrationHigh) - step)
                  setIntegrationLow(clamped)
                  try { if (integrationDebounceRef.current) clearTimeout(integrationDebounceRef.current) } catch (er) { void er }
                  integrationDebounceRef.current = setTimeout(() => {
                    try {
                      const result = avgRef?.current?.computeIntegralsForRange?.(clamped, Number(integrationHigh), useNormalized)
                      if (result) {
                        setIntegralsMap(result.integrals || {})
                        setIntegralsMeta({ min: result.min || 0, max: result.max || 0, x1: result.x1 || 0, x2: result.x2 || 0 })
                      }
                    } catch (er) { void er }
                  }, 40)
                }}
                className="dual-range-slider"
                style={{ position: 'absolute', left: 0, right: 0, width: '100%', height: '100%', background: 'transparent', WebkitAppearance: 'none', appearance: 'none', pointerEvents: 'none', zIndex: 2 }}
                aria-label='Integration low'
              />
              <input
                type="range"
                min={integrationDomainMin}
                max={integrationDomainMax}
                value={integrationHigh}
                step={Math.max((integrationDomainMax - integrationDomainMin) / 512 || 0.01, 1e-6)}
                onPointerDown={() => { integrationDragRef.current = 'high'; setIntegrationDragging('high') }}
                onPointerUp={() => { integrationDragRef.current = null; setIntegrationDragging(null) }}
                onPointerCancel={() => { integrationDragRef.current = null; setIntegrationDragging(null) }}
                onChange={(e) => {
                  const raw = e.target.value
                  const v = Number(raw)
                  const step = Math.max((integrationDomainMax - integrationDomainMin) / 512 || 0.01, 1e-6)
                  const clamped = Math.max(v, Number(integrationLow) + step)
                  setIntegrationHigh(clamped)
                  try { if (integrationDebounceRef.current) clearTimeout(integrationDebounceRef.current) } catch (er) { void er }
                  integrationDebounceRef.current = setTimeout(() => {
                    try {
                      const result = avgRef?.current?.computeIntegralsForRange?.(Number(integrationLow), clamped, useNormalized)
                      if (result) {
                        setIntegralsMap(result.integrals || {})
                        setIntegralsMeta({ min: result.min || 0, max: result.max || 0, x1: result.x1 || 0, x2: result.x2 || 0 })
                      }
                    } catch (er) { void er }
                  }, 40)
                }}
                className="dual-range-slider"
                style={{ position: 'absolute', left: 0, right: 0, width: '100%', height: '100%', background: 'transparent', WebkitAppearance: 'none', appearance: 'none', pointerEvents: 'none', zIndex: 2 }}
                aria-label='Integration high'
              />
              <style>{`
                .dual-range-slider::-webkit-slider-thumb {
                  -webkit-appearance: none;
                  appearance: none;
                  width: 16px;
                  height: 16px;
                  background: #0c8;
                  border-radius: 50%;
                  cursor: pointer;
                  pointer-events: auto;
                  border: 2px solid white;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                .dual-range-slider::-moz-range-thumb {
                  width: 16px;
                  height: 16px;
                  background: #0c8;
                  border-radius: 50%;
                  cursor: pointer;
                  pointer-events: auto;
                  border: 2px solid white;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.3);
                }
                .dual-range-slider::-webkit-slider-runnable-track {
                  background: transparent;
                }
                .dual-range-slider::-moz-range-track {
                  background: transparent;
                }
              `}</style>
            </div>
            {/* Wavelength display - now below slider */}
            <div style={{ fontSize: 12, color: textColor }}>Wavelength: {integrationLow.toFixed(1)} → {integrationHigh.toFixed(1)}</div>
            <div style={{ fontSize: 9, color: textColor, opacity: 0.7 }}>Integrate wavelength range</div>
          </div>
        )}
        </div>

        {layer !== 'light' && <div style={{ flex: '1 1 auto', minWidth: 24, order: 2 }} />}
        </div>
        
        {/* Close the wrapper for minimized state */}
        </div>
      </div>

      {!bottomBarMinimized && layer === 'light' && (
        <div
          onPointerDown={onAvgPanelPointerDown}
          style={{
            position: 'absolute',
            left: avgPanelRect.left,
            top: avgPanelRect.top,
            width: avgPanelMinimized ? Math.min(avgPanelRect.width, POPUP_MINIMIZED_WIDTH) : avgPanelRect.width,
            height: avgPanelMinimized ? POPUP_MINIMIZED_HEIGHT : avgPanelRect.height,
            zIndex: 1350,
            background: controlBg,
            border: '1px solid rgba(0,0,0,0.14)',
            borderRadius: 8,
            padding: avgPanelMinimized ? '6px 10px' : '8px 10px',
            boxShadow: 'none',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            cursor: 'grab',
            userSelect: 'none',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: avgPanelMinimized ? 0 : 4 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: textColor, opacity: 0.85 }}>Averaged Spectrum (drag to move)</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setAvgPanelMinimized(v => !v)
              }}
              style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, width: 18, height: 18 }}
              title={avgPanelMinimized ? 'Maximize popup' : 'Minimize popup'}
            >
              {avgPanelMinimized ? '▢' : '▁'}
            </button>
          </div>
          {!avgPanelMinimized && (
            <div style={{ width: '100%', overflow: 'hidden' }}>
              <AveragedSpectrum ref={avgRef} selectedTable={selectedTable} selectedIdColumn={selectedIdColumn} controlBg={controlBg} textColor={textColor} useNormalized={useNormalized} colorMappingMode={colorMappingMode} integrationRangeLow={colorMappingMode === 'integration' ? integrationLow : cursorX1} integrationRangeHigh={colorMappingMode === 'integration' ? integrationHigh : cursorX2} onRangeChange={(info) => {
              // This is the cursor module data (X1/X2 + cursor)
              if (colorMappingMode === 'cursor') {
                setIntegralsMap(info.integrals || {})
                setIntegralsMeta({ min: info.min || 0, max: info.max || 0, x1: info.x1 || 0, x2: info.x2 || 0 })
              }
              // Initialize integration module domain from full wavelength range
              if (info && info.x1 !== undefined && info.x2 !== undefined) {
                try {
                  const range = avgRef?.current?.getWavelengthRange?.()
                  if (range) {
                    setIntegrationDomainMin(range.min)
                    setIntegrationDomainMax(range.max)
                    // Initialize cursors at the extremes only on first load
                    if (integrationLow === 0 && integrationHigh === 100) {
                      setIntegrationLow(range.min)
                      setIntegrationHigh(range.max)
                    }
                  }
                } catch (er) { void er }
              }
              // update palette domain/values for the cursor module slider (X1/X2)
              if (info && info.x1 !== undefined && info.x2 !== undefined) {
                setPaletteDomainMin(info.x1)
                setPaletteDomainMax(info.x2)
                setPaletteLow(info.x1)
                setPaletteHigh(info.x2)
              }
              }} inline={true} />
            </div>
          )}
          <div
            className="popup-resize-handle"
            aria-hidden={avgPanelMinimized}
            onPointerDown={(e) => startPopupResize(e, setAvgPanelRect, avgPanelRect, 320, 150)}
            style={{ position: 'absolute', right: 2, bottom: 2, width: 12, height: 12, cursor: 'nwse-resize', borderRight: '2px solid rgba(0,0,0,0.35)', borderBottom: '2px solid rgba(0,0,0,0.35)', display: avgPanelMinimized ? 'none' : 'block' }}
          />
        </div>
      )}

      {isLightLayer && groupingEnabled && groupAveragedTraces.length > 0 && (
        <div
          onPointerDown={onGroupAvgPopupPointerDown}
          style={{
            position: 'absolute',
            left: groupAvgPopupRect.left,
            top: groupAvgPopupRect.top,
            zIndex: 1390,
            background: 'rgba(255,255,255,0.97)',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 8,
            padding: groupAvgPopupMinimized ? '6px 8px' : '8px 8px 6px 8px',
            width: groupAvgPopupMinimized ? Math.min(groupAvgPopupRect.width, POPUP_MINIMIZED_WIDTH) : groupAvgPopupRect.width,
            height: groupAvgPopupMinimized ? POPUP_MINIMIZED_HEIGHT : groupAvgPopupRect.height,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            cursor: 'grab',
            userSelect: 'none',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: groupAvgPopupMinimized ? 0 : 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: textColor, opacity: 0.9 }}>Group Average Spectrum (popup, drag to move)</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setGroupAvgPopupMinimized(v => !v)
              }}
              style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, width: 18, height: 18 }}
              title={groupAvgPopupMinimized ? 'Maximize popup' : 'Minimize popup'}
            >
              {groupAvgPopupMinimized ? '▢' : '▁'}
            </button>
          </div>
          {!groupAvgPopupMinimized && (
            <Plot
              data={groupAveragedTraces}
              layout={{
                width: groupAvgPlotWidth,
                height: groupAvgPlotHeight,
                margin: { t: 6, b: 24, l: 30, r: 8 },
                paper_bgcolor: '#ffffff',
                plot_bgcolor: '#ffffff',
                showlegend: true,
                legend: { orientation: 'h', x: 0, y: 1.12, font: { size: 9 } },
                xaxis: { title: { text: 'Shift', font: { size: 10 } }, tickfont: { size: 9 }, zeroline: false, showgrid: true, gridcolor: 'rgba(0,0,0,0.06)' },
                yaxis: { title: { text: 'Intensity', font: { size: 10 } }, tickfont: { size: 9 }, zeroline: false, showgrid: true, gridcolor: 'rgba(0,0,0,0.06)' }
              }}
              config={{ displayModeBar: false, responsive: false }}
              style={{ width: groupAvgPlotWidth, height: groupAvgPlotHeight }}
            />
          )}
          <div
            className="popup-resize-handle"
            aria-hidden={groupAvgPopupMinimized}
            onPointerDown={(e) => startPopupResize(e, setGroupAvgPopupRect, groupAvgPopupRect, 300, 200)}
            style={{ position: 'absolute', right: 2, bottom: 2, width: 12, height: 12, cursor: 'nwse-resize', borderRight: '2px solid rgba(0,0,0,0.35)', borderBottom: '2px solid rgba(0,0,0,0.35)', display: groupAvgPopupMinimized ? 'none' : 'block' }}
          />
        </div>
      )}

      {isLightLayer && groupingEnabled && groupRepresentation && (
        <div
          onPointerDown={onGroupRepPanelPointerDown}
          style={{
            position: 'absolute',
            left: groupRepPanelRect.left,
            top: groupRepPanelRect.top,
            zIndex: 1380,
            background: 'rgba(255,255,255,0.97)',
            border: '1px solid rgba(0,0,0,0.15)',
            borderRadius: 8,
            padding: groupRepPanelMinimized ? '6px 8px' : '8px 8px 6px 8px',
            width: groupRepPanelMinimized ? Math.min(groupRepPanelRect.width, POPUP_MINIMIZED_WIDTH) : groupRepPanelRect.width,
            height: groupRepPanelMinimized ? POPUP_MINIMIZED_HEIGHT : groupRepPanelRect.height,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            cursor: 'grab',
            userSelect: 'none',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: groupRepPanelMinimized ? 0 : 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: textColor, opacity: 0.9 }}>
              {groupRepresentation.method === 'pca' ? 'PCA Representation' : groupRepresentation.method === 'clustering' ? 'Cluster Dendrogram' : 'RF Tree/Dendrogram'}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setGroupRepPanelMinimized(v => !v)
              }}
              style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, width: 18, height: 18 }}
              title={groupRepPanelMinimized ? 'Maximize popup' : 'Minimize popup'}
            >
              {groupRepPanelMinimized ? '▢' : '▁'}
            </button>
          </div>
          {!groupRepPanelMinimized && (
            <Plot
              data={(() => {
                if (groupRepresentation.method === 'pca') {
                  const pts = Array.isArray(groupRepresentation.points) ? groupRepresentation.points : []
                  return [
                    {
                      x: pts.map(p => Number(p.x) || 0),
                      y: pts.map(p => Number(p.y) || 0),
                      text: pts.map(p => String(p.id)),
                      type: 'scatter',
                      mode: 'markers',
                      marker: {
                        size: 8,
                        opacity: 0.9,
                        color: pts.map(p => {
                          const gid = Number(groupAssignments[String(p.id)])
                          return GROUP_COLORS[(Number.isFinite(gid) ? gid : 0) % GROUP_COLORS.length]
                        }),
                        line: { width: 0.8, color: 'rgba(0,0,0,0.35)' }
                      },
                      hovertemplate: 'ID: %{text}<br>X: %{x:.3f}<br>Y: %{y:.3f}<extra></extra>'
                    }
                  ]
                }
                const dplot = buildDendrogramPlot(groupRepresentation.dendrogram)
                return [
                  {
                    x: dplot.lineX,
                    y: dplot.lineY,
                    type: 'scatter',
                    mode: 'lines',
                    line: { width: 1, color: '#111' },
                    hoverinfo: 'skip',
                    showlegend: false
                  },
                  {
                    x: dplot.leafX,
                    y: dplot.leafY,
                    text: dplot.leafIds,
                    type: 'scatter',
                    mode: 'markers',
                    marker: {
                      size: 7,
                      color: dplot.leafIds.map((sid) => {
                        const gid = Number(groupAssignments[String(sid)])
                        return GROUP_COLORS[(Number.isFinite(gid) ? gid : 0) % GROUP_COLORS.length]
                      }),
                      line: { width: 0.6, color: 'rgba(0,0,0,0.35)' }
                    },
                    hovertemplate: 'ID: %{text}<extra></extra>',
                    showlegend: false
                  }
                ]
              })()}
              layout={{
                width: groupRepPlotWidth,
                height: groupRepPlotHeight,
                margin: { t: 8, b: 34, l: 34, r: 8 },
                paper_bgcolor: '#ffffff',
                plot_bgcolor: '#ffffff',
                showlegend: false,
                xaxis: {
                  title: { text: groupRepresentation.method === 'pca' ? 'Component 1' : 'Sample Order', font: { size: 10 } },
                  tickfont: { size: 9 },
                  showgrid: true,
                  gridcolor: 'rgba(0,0,0,0.06)',
                  zeroline: false
                },
                yaxis: {
                  title: { text: groupRepresentation.method === 'pca' ? 'Component 2' : 'Linkage Distance', font: { size: 10 } },
                  tickfont: { size: 9 },
                  showgrid: true,
                  gridcolor: 'rgba(0,0,0,0.06)',
                  zeroline: false
                }
              }}
              config={{ displayModeBar: false, responsive: false }}
              style={{ width: groupRepPlotWidth, height: groupRepPlotHeight }}
            />
          )}
          <div
            className="popup-resize-handle"
            aria-hidden={groupRepPanelMinimized}
            onPointerDown={(e) => startPopupResize(e, setGroupRepPanelRect, groupRepPanelRect, 320, 220)}
            style={{ position: 'absolute', right: 2, bottom: 2, width: 12, height: 12, cursor: 'nwse-resize', borderRight: '2px solid rgba(0,0,0,0.35)', borderBottom: '2px solid rgba(0,0,0,0.35)', display: groupRepPanelMinimized ? 'none' : 'block' }}
          />
        </div>
      )}

        {/* Sample details panel (appears when a marker is clicked) */}
        {selectedSampleDetails && (
          <div
            onPointerDown={onSamplePopupPointerDown}
            style={{
              position: 'absolute',
              left: samplePopupRect.left,
              top: samplePopupRect.top,
              zIndex: 1400
            }}
          >
            <div style={{ position: 'relative', background: 'rgba(255,255,255,0.97)', padding: samplePopupMinimized ? '6px 7px' : 7, borderRadius: 7, color: textColor, width: samplePopupMinimized ? Math.min(samplePopupRect.width, POPUP_MINIMIZED_WIDTH) : samplePopupRect.width, height: samplePopupMinimized ? POPUP_MINIMIZED_HEIGHT : samplePopupRect.height, minWidth: 220, border: '1px solid rgba(0,0,0,0.15)', boxShadow: '0 6px 20px rgba(0,0,0,0.12)', cursor: 'grab', userSelect: 'none', overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: samplePopupMinimized ? 0 : 3 }}>
                <strong style={{ fontSize: 13 }}>Sample details (popup)</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setSamplePopupMinimized(v => !v)
                    }}
                    style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', fontSize: 14, lineHeight: 1, width: 18, height: 18, padding: 0 }}
                    title={samplePopupMinimized ? 'Maximize popup' : 'Minimize popup'}
                  >
                    {samplePopupMinimized ? '▢' : '▁'}
                  </button>
                  <button onClick={() => setSelectedSampleDetails(null)} style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>
              </div>
              {!samplePopupMinimized && (
                <div style={{ fontSize: 10, lineHeight: '1.3' }}>
                  <div><strong>S.No:</strong> {formatVal(
                    // prefer selectedSampleRow (fetched full row), then selectedSampleDetails top-level props, then nested raw
                    selectedSampleRow?.['S.No'] ?? selectedSampleRow?.sno ?? selectedSampleRow?.id ??
                    selectedSampleDetails?.['S.No'] ?? selectedSampleDetails?.sno ?? selectedSampleDetails?.id ??
                    (clickedRaw && (clickedRaw['S.No'] ?? clickedRaw.sno ?? clickedRaw.id)) ?? ''
                  )}</div>
                  <div><strong>Sample name:</strong> {formatVal(
                    selectedSampleRow?.['Sample name'] ?? selectedSampleRow?.sample_name ??
                    (clickedRaw && (clickedRaw['Sample name'] ?? clickedRaw.sample_name)) ??
                    selectedSampleDetails?.['Sample name'] ?? selectedSampleDetails?.sample_name ?? ''
                  )}</div>
                  {/* only show the three requested fields */}
                  {/* geo_tag may be available on the fetched row or inside the selectedSampleDetails.raw object */}
                  <div style={{ marginTop: 6 }}><strong>geo_tag:</strong> {formatVal(
                    selectedSampleRow?.geo_tag ?? (clickedRaw && (clickedRaw.geo_tag ?? clickedRaw.geo)) ?? selectedSampleDetails?.geo_tag ?? ''
                  )}</div>
                  {/* Timestamp - when the sample was updated in the database */}
                  {(() => {
                    const ts = selectedSampleRow?.updated_at || selectedSampleRow?.created_at || selectedSampleRow?.timestamp ||
                               (clickedRaw && (clickedRaw.updated_at || clickedRaw.created_at || clickedRaw.timestamp)) ||
                               selectedSampleDetails?.updated_at || selectedSampleDetails?.created_at || selectedSampleDetails?.timestamp
                    if (ts) {
                      const d = new Date(ts)
                      return (
                        <div style={{ marginTop: 6 }}><strong>Updated:</strong> {d.toLocaleDateString()} {d.toLocaleTimeString()}</div>
                      )
                    }
                    return null
                  })()}
                  {/* plot: show spectra if available in fetched row */}
                  <div style={{ marginTop: 6 }}>
                    {sampleLoading && <div style={{ marginTop: 4, fontSize: 9 }}>Loading plot…</div>}
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
                        if (!hasData) return <div style={{ fontSize: 9, marginTop: 4 }}>No spectral data available for this sample.</div>
                        // choose plot colors based on selected basemap layer
                        const plotLineColor = '#14399eff'
                        // Always transparent background per request
                        const plotBg = 'rgba(0,0,0,0)'
                        const axisColor = '#111111'
                        return (
                          <div style={{ width: 200, maxWidth: 200, marginTop: 4, overflow: 'hidden' }}>
                            <Plot
                              data={[
                                { x: x, y: y, type: 'scatter', mode: 'lines', line: { color: plotLineColor, width: 1.5 }, name: 'Spectra' }
                              ]}
                              layout={{
                                width: 200,
                                margin: { t: 2, b: 22, l: 28, r: 3 },
                                height: 110,
                                paper_bgcolor: 'rgba(0,0,0,0)',
                                plot_bgcolor: plotBg,
                                xaxis: { title: { text: 'Shift', font: { color: axisColor, size: 9 } }, tickfont: { color: axisColor, size: 9 }, automargin: true },
                                yaxis: { title: { text: 'Intensity', font: { color: axisColor, size: 9 } }, tickfont: { color: axisColor, size: 9 }, automargin: true }
                              }}
                              config={{ displayModeBar: false, responsive: false }}
                              style={{ width: 200, height: 110 }}
                            />
                          </div>
                        )
                      })()
                    )}
                  </div>
                </div>
              )}
              <div
                className="popup-resize-handle"
                aria-hidden={samplePopupMinimized}
                onPointerDown={(e) => startPopupResize(e, setSamplePopupRect, samplePopupRect, 220, 180)}
                style={{ position: 'absolute', right: 2, bottom: 2, width: 12, height: 12, cursor: 'nwse-resize', borderRight: '2px solid rgba(0,0,0,0.35)', borderBottom: '2px solid rgba(0,0,0,0.35)', display: samplePopupMinimized ? 'none' : 'block' }}
              />
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
