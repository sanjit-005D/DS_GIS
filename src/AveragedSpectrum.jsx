import React, { useCallback, useEffect, useRef, useState } from 'react'
import { db, isApiAvailable, setApiAvailable } from './apiClient'

// Single-file AveragedSpectrum component (clean, self-contained)
// - Fetches spectra rows from custom database API (eyenetbio) (guarded)
// - Interpolates each sample to fixed grid N=512
// - Computes averaged spectrum and per-sample integrals
// - Exposes X1/X2 numeric inputs with Set/Reset
// - Single draggable cursor constrained to [X1,X2], snaps to grid
// - Emits onRangeChange({ integrals, min, max, x1, x2 })

const toNumArray = (val) => {
  if (val == null) return []
  if (Array.isArray(val)) return val.map(Number).filter(n => !Number.isNaN(n))
  if (typeof val === 'number') return [val]
  if (typeof val === 'string') {
    try { const p = JSON.parse(val); if (Array.isArray(p)) return p.map(Number).filter(n => !Number.isNaN(n)) } catch (e) { void e }
    const m = val.match(/-?\d+\.?\d*(?:e[+-]?\d+)?/ig)
    if (m) return m.map(Number).filter(n => !Number.isNaN(n))
    return val.replace(/^\[|\]$/g, '').split(/[,\s]+/).filter(Boolean).map(Number).filter(n => !Number.isNaN(n))
  }
  return []
}

const interpLinear = (xs, ys, xq) => {
  if (!xs || xs.length === 0) return 0
  let i = 0
  while (i < xs.length && xs[i] < xq) i++
  if (i === 0) return ys[0]
  if (i >= xs.length) return ys[xs.length - 1]
  const x0 = xs[i - 1], x1 = xs[i], y0 = ys[i - 1], y1 = ys[i]
  if (x1 === x0) return y0
  return y0 + (y1 - y0) * ((xq - x0) / (x1 - x0))
}

const AveragedSpectrum = React.forwardRef(function AveragedSpectrum({ selectedTable = null, selectedIdColumn = null, textColor = '#111', onRangeChange = () => {}, _inline = false, useNormalized = false, colorMappingMode = 'cursor', integrationRangeLow = null, integrationRangeHigh = null }, ref) {
  const canvasRef = useRef(null)
  const trackRef = useRef(null)
  const rawGridRef = useRef([])
  const userDraggingRef = useRef(false)
  const pendingRangeRef = useRef(null)
  const pendingCursorRef = useRef(null)
  const currentDragIdxRef = useRef(null)
  const rangeInputRef = useRef(null)
  const useNormalizedRef = useRef(useNormalized)

  const [loading, setLoading] = useState(true)
  const [grid, setGrid] = useState([])
  const [avgY, setAvgY] = useState([])
  const [perSample, setPerSample] = useState([])
  const [latestTimestamp, setLatestTimestamp] = useState(null)
  const [globalIntensityMin, setGlobalIntensityMin] = useState(0)
  const [globalIntensityMax, setGlobalIntensityMax] = useState(1)

  const [iLow, setILow] = useState(0)
  const [iHigh, setIHigh] = useState(0)
  const [x1Str, setX1Str] = useState('0.00')
  const [x2Str, setX2Str] = useState('0.00')

  const [sliderEnabled, setSliderEnabled] = useState(false)
  const [cursorVal, setCursorVal] = useState(null)
  const [cursorIdx, setCursorIdx] = useState(null)
  const [_tooltipVisible, setTooltipVisible] = useState(false)

  const onRangeChangeRef = useRef(onRangeChange)
  useEffect(() => { onRangeChangeRef.current = onRangeChange }, [onRangeChange])

  // expose programmatic setter via ref: setCursorValue(x)
  React.useImperativeHandle(ref, () => ({
    // Cursor mode controls for external rendering
    getCursorModeState: () => ({
      x1Str,
      x2Str,
      sliderEnabled,
      cursorIdx,
      cursorVal,
      grid,
      iLow,
      iHigh,
      leftIdx: Math.min(iLow, iHigh),
      rightIdx: Math.max(iLow, iHigh),
      leftPct: grid && grid.length > 0 ? (Math.min(iLow, iHigh) / (grid.length - 1)) * 100 : 0,
      widthPct: grid && grid.length > 0 ? ((Math.abs(iHigh - iLow) / (grid.length - 1)) * 100) : 0
    }),
    setX1Str: (v) => setX1Str(v),
    setX2Str: (v) => setX2Str(v),
    handleSet: () => {
      const v1 = Number(x1Str); const v2 = Number(x2Str)
      if (!grid || !grid.length) return
      let idx1 = 0; let idx2 = grid.length - 1
      if (!Number.isNaN(v1)) {
        idx1 = 0
        for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v1) < Math.abs(grid[idx1] - v1)) idx1 = i
      }
      if (!Number.isNaN(v2)) {
        idx2 = 0
        for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v2) < Math.abs(grid[idx2] - v2)) idx2 = i
      }
      setILow(idx1); setIHigh(idx2)
      const l = Math.min(idx1, idx2)
      setSliderEnabled(true)
      setCursorIdx(l); setCursorVal(grid[l])
      setX1Str((grid[idx1] ?? 0).toFixed(2))
      setX2Str((grid[idx2] ?? 0).toFixed(2))
    },
    handleReset: () => {
      if (!grid || !grid.length) return
      setILow(0); setIHigh(grid.length - 1)
      setX1Str((grid[0] ?? 0).toFixed(2)); setX2Str((grid[grid.length - 1] ?? 0).toFixed(2))
      setSliderEnabled(false); setCursorIdx(null); setCursorVal(null)
    },
    handleCursorChange: (idx) => {
      if (!grid || grid.length === 0) return
      setCursorIdx(idx); setCursorVal(grid[idx])
    },
    setCursorValue: (x) => {
      if (!grid || !grid.length) return
      // if the user is actively dragging, defer programmatic cursor moves
      if (userDraggingRef.current) { pendingCursorRef.current = x; return }
      // clamp to [iLow,iHigh]
      const low = Math.max(0, Math.min(iLow, grid.length - 1))
      const high = Math.max(0, Math.min(iHigh, grid.length - 1))
      const l = Math.min(low, high); const h = Math.max(low, high)
      if (x == null) { setCursorVal(null); return }
      // find nearest grid sample in [l,h]
      let nearest = l
      for (let i = l; i <= h; i++) if (Math.abs((grid[i] ?? 0) - x) < Math.abs((grid[nearest] ?? 0) - x)) nearest = i
      setSliderEnabled(true)
      setCursorIdx(nearest)
      setCursorVal(grid[nearest])
    }
    ,
    setRange: (x1, x2) => {
      if (!grid || !grid.length) return
      // If the user is actively dragging the thumb, defer applying external
      // range changes to avoid racing with the user's interaction. Store the
      // requested range and apply it once dragging completes.
      if (userDraggingRef.current) { pendingRangeRef.current = [x1, x2]; return }
      const v1 = Number(x1); const v2 = Number(x2)
      let idx1 = 0; let idx2 = grid.length - 1
      if (!Number.isNaN(v1)) {
        idx1 = 0
        for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v1) < Math.abs(grid[idx1] - v1)) idx1 = i
      }
      if (!Number.isNaN(v2)) {
        idx2 = 0
        for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v2) < Math.abs(grid[idx2] - v2)) idx2 = i
      }
      setILow(idx1); setIHigh(idx2)
      const l = Math.min(idx1, idx2)
      setSliderEnabled(true)
      // Only initialize the cursor to the left bound if there is no current cursor index.
      // This avoids repeatedly forcing the cursor to X1 when the parent calls `setRange` interactively.
      if (cursorIdx == null) { setCursorIdx(l); setCursorVal(grid[l]) }
      setX1Str((grid[idx1] ?? 0).toFixed(2))
      setX2Str((grid[idx2] ?? 0).toFixed(2))
    },
    // Compute integrals for a wavelength range WITHOUT modifying internal state (for integration module)
    computeIntegralsForRange: (x1, x2, shouldNormalize = false) => {
      if (!grid || !grid.length || !perSample || perSample.length === 0) {
        return { integrals: {}, min: 0, max: 0, x1: 0, x2: 0 }
      }
      const v1 = Number(x1); const v2 = Number(x2)
      let idx1 = 0; let idx2 = grid.length - 1
      if (!Number.isNaN(v1)) {
        for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v1) < Math.abs(grid[idx1] - v1)) idx1 = i
      }
      if (!Number.isNaN(v2)) {
        for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v2) < Math.abs(grid[idx2] - v2)) idx2 = i
      }
      const l = Math.min(idx1, idx2)
      const h = Math.max(idx1, idx2)
      const integrals = {}
      let globalMin = Infinity, globalMax = -Infinity
      const isSinglePoint = (l === h)
      
      for (const s of perSample) {
        let yData = s.y
        // For integration (range), normalize each sample individually if requested
        // For single point, use raw values for proper cross-sample comparison
        if (!isSinglePoint && shouldNormalize && yData && yData.length > 0) {
          const minY = Math.min(...yData)
          const maxY = Math.max(...yData)
          const range = maxY - minY
          if (range > 0) {
            yData = yData.map(v => (v - minY) / range)
          }
        }
        let value = 0
        if (isSinglePoint) {
          // Single point: use raw Y value at that wavelength for proper comparison
          value = s.y[l] ?? 0
        } else {
          // Range: compute trapezoidal integral
          for (let i = l; i < h; i++) {
            const xv0 = grid[i]; const xv1 = grid[i + 1]; const dx = (xv1 - xv0) || 0
            const y0 = (yData[i] ?? 0); const y1 = (yData[i + 1] ?? 0)
            value += 0.5 * (y0 + y1) * dx
          }
        }
        integrals[String(s.id)] = value
        if (value < globalMin) globalMin = value
        if (value > globalMax) globalMax = value
      }
      return { 
        integrals, 
        min: globalMin === Infinity ? 0 : globalMin, 
        max: globalMax === -Infinity ? 0 : globalMax, 
        x1: grid[l] ?? 0, 
        x2: grid[h] ?? 0 
      }
    },
    // Compute integrals for cursor mode (uses current X1/X2 range and cursor position)
    computeIntegralsForCursor: (shouldNormalize = false) => {
      if (!grid || !grid.length || !perSample || perSample.length === 0) {
        return { integrals: {}, min: 0, max: 0, x1: 0, x2: 0 }
      }
      // Use current cursor index if available, otherwise use leftIdx
      const idx = cursorIdx != null ? cursorIdx : Math.min(iLow, iHigh)
      const l = Math.max(0, Math.min(idx, grid.length - 1))
      const integrals = {}
      let globalMin = Infinity, globalMax = -Infinity
      
      for (const s of perSample) {
        let value = s.y[l] ?? 0
        
        // If normalization is requested, normalize this sample's entire spectrum first
        if (shouldNormalize) {
          const minY = Math.min(...s.y)
          const maxY = Math.max(...s.y)
          const range = maxY - minY
          if (range > 0) {
            value = (value - minY) / range
          }
        }
        
        integrals[String(s.id)] = value
        if (value < globalMin) globalMin = value
        if (value > globalMax) globalMax = value
      }
      return { 
        integrals, 
        min: globalMin === Infinity ? 0 : globalMin, 
        max: globalMax === -Infinity ? 0 : globalMax, 
        x1: grid[Math.min(iLow, iHigh)] ?? 0, 
        x2: grid[Math.max(iLow, iHigh)] ?? 0 
      }
    },
    // Get full wavelength range
    getWavelengthRange: () => {
      if (!grid || !grid.length) return { min: 0, max: 100 }
      return { min: grid[0], max: grid[grid.length - 1] }
    },
    // Export the aligned wavelength grid used by getSpectralMatrix.
    getSpectralGrid: () => {
      if (!grid || !grid.length) return []
      return grid.slice()
    },
    // Export aligned spectra for grouping methods (PCA/clustering/RF).
    getSpectralMatrix: (options = {}) => {
      if (!perSample || perSample.length === 0) return { ids: [], matrix: [] }
      const shouldNormalize = Boolean(options.normalize)
      const ids = []
      const matrix = []
      for (const s of perSample) {
        const y = Array.isArray(s?.y) ? s.y.map(Number) : []
        if (!y.length) continue
        let row = y
        if (shouldNormalize) {
          const minY = Math.min(...y)
          const maxY = Math.max(...y)
          const range = maxY - minY
          row = range > 0 ? y.map(v => (v - minY) / range) : y.map(() => 0)
        }
        ids.push(String(s.id ?? ''))
        matrix.push(row)
      }
      return { ids, matrix }
    }
  }), [grid, iLow, iHigh, cursorIdx, cursorVal, perSample, x1Str, x2Str, sliderEnabled])

  useEffect(() => { rawGridRef.current = grid }, [grid])

  const computeAndNotify = useCallback((samples, gridArr, lowIdx, highIdx, shouldNormalize, globalIntensityMin, globalIntensityMax) => {
    if (!samples || samples.length === 0 || !gridArr || gridArr.length === 0) {
      onRangeChangeRef.current({ integrals: {}, min: 0, max: 0, x1: 0, x2: 0 })
      return
    }
    const integrals = {}
    const l = Math.max(0, Math.min(lowIdx, gridArr.length - 1))
    const h = Math.max(0, Math.min(highIdx, gridArr.length - 1))
    
    // Check if we're at a single point (cursor mode)
    const isSinglePoint = (l === h)
    
    // Debug: log mode detection
    if (samples.length > 0) {
      // console.log('[computeAndNotify] Mode:', isSinglePoint ? 'CURSOR' : 'INTEGRATION', '| l=', l, 'h=', h, '| wavelength=', gridArr[h]?.toFixed(2))
    }
    
    for (const s of samples) {
      let value = 0
      
      if (isSinglePoint) {
        // CURSOR MODE: Use ORIGINAL RAW database value (no interpolation)
        const cursorWavelength = gridArr[h]
        if (s.rawX && s.rawY) {
          // Find the closest wavelength in the original raw data
          let closestIdx = 0
          let minDiff = Math.abs(s.rawX[0] - cursorWavelength)
          for (let i = 1; i < s.rawX.length; i++) {
            const diff = Math.abs(s.rawX[i] - cursorWavelength)
            if (diff < minDiff) {
              minDiff = diff
              closestIdx = i
            }
          }
          // Get the RAW intensity value from the database
          let rawValue = s.rawY[closestIdx] ?? 0
          
          // Apply normalization if requested (normalize the raw data, not grid data)
          if (shouldNormalize && s.rawY && s.rawY.length > 0) {
            const minY = Math.min(...s.rawY)
            const maxY = Math.max(...s.rawY)
            const range = maxY - minY
            if (range > 0) {
              rawValue = (rawValue - minY) / range
            }
          }
          
          value = rawValue
          
          // Debug: log first sample's values in detail
          // if (samples.indexOf(s) === 0) {
          //   console.log('[computeAndNotify CURSOR MODE] Sample', s.id,
          //               '\n  Cursor wavelength:', cursorWavelength.toFixed(2),
          //               '\n  Closest raw wavelength:', s.rawX[closestIdx].toFixed(2),
          //               '\n  Raw DB value:', (s.rawY[closestIdx] ?? 0).toFixed(4), 
          //               '\n  After normalization:', value.toFixed(4),
          //               '\n  Normalized?', shouldNormalize,
          //               '\n  Grid value at same index (NOT USED):', (s.y[h] ?? 0).toFixed(4))
          // }
        } else {
          // Fallback: missing raw data
          // console.warn('[computeAndNotify] Sample', s.id, 'missing rawY data')
          value = 0
        }
      } else {
        // INTEGRATION MODE: Use interpolated grid data for trapezoidal integration
        let yData = s.y
        // Apply normalization to the grid data if requested
        if (shouldNormalize && yData && yData.length > 0) {
          const minY = Math.min(...yData)
          const maxY = Math.max(...yData)
          const range = maxY - minY
          if (range > 0) {
            yData = yData.map(v => (v - minY) / range)
          }
        }
        // Calculate the integral (area under curve)
        for (let i = l; i < h; i++) {
          const x0 = gridArr[i]; const x1 = gridArr[i + 1]; const dx = (x1 - x0) || 0
          const y0 = (yData[i] ?? 0); const y1 = (yData[i + 1] ?? 0)
          value += 0.5 * (y0 + y1) * dx
        }
      }
      
      integrals[String(s.id)] = value
    }
    const x1 = gridArr[l] ?? 0
    const x2 = gridArr[h] ?? 0
    
    // For cursor mode (single point), use actual min/max from current cursor position
    // For integration mode, use global min/max for consistent scale
    let fixedMin, fixedMax
    if (isSinglePoint) {
      // Calculate min/max from current integrals (values at cursor position)
      const values = Object.values(integrals)
      fixedMin = values.length > 0 ? Math.min(...values) : 0
      fixedMax = values.length > 0 ? Math.max(...values) : 1
    } else {
      // Use GLOBAL min/max from entire dataset for consistent color scale
      fixedMin = globalIntensityMin ?? 0
      fixedMax = globalIntensityMax ?? 1
    }
    
    onRangeChangeRef.current({ integrals, min: fixedMin, max: fixedMax, x1, x2 })
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        if (!isApiAvailable()) { setLoading(false); return }
        if (!selectedTable) { setGrid([]); setAvgY([]); setPerSample([]); setLoading(false); return }
        const { data: rows, error } = await db.from(selectedTable).select('*').limit(2000)
        if (error) { /* console.warn('AveragedSpectrum: failed to fetch rows', error); */ setGrid([]); setAvgY([]); setPerSample([]); setLoading(false); return }
        if (!rows || rows.length === 0) { setGrid([]); setAvgY([]); setPerSample([]); setLoading(false); return }

        const valid = []
        for (const r of rows) {
          try {
            const xC = ['Shift x axis', 'shift_x_axis', 'Shift (X)', 'x', 'shift']
            const yC = ['Intensity y axis', 'intensity_y_axis', 'Intensity (Y)', 'y', 'intensity']
            let xs = [], ys = []
            for (const k of xC) if (!xs.length && r[k] !== undefined) xs = toNumArray(r[k])
            for (const k of yC) if (!ys.length && r[k] !== undefined) ys = toNumArray(r[k])
            if (xs.length > 1 && ys.length > 1 && xs.length === ys.length) {
              // Store the ORIGINAL raw data from database before any processing
              valid.push({ raw: r, x: xs, y: ys, originalX: [...xs], originalY: [...ys] })
            }
          } catch (e) { void e }
        }
        if (valid.length === 0) { setGrid([]); setAvgY([]); setPerSample([]); setLoading(false); return }

        // If every sample already shares the same x-grid (e.g. 1..1024), prefer
        // direct per-index averaging to preserve exact sample alignment and avoid
        // needless interpolation. Otherwise fall back to resampling to N=512.
        let g = null
        let samples = []
        let avg = []
        // normalize x arrays to numbers for comparison
        const firstX = valid[0].x.map(Number)
        const sameGrid = valid.every(v => Array.isArray(v.x) && v.x.length === firstX.length && v.x.every((xi, k) => Number(xi) === firstX[k]))
        if (sameGrid) {
          const N = firstX.length
          g = firstX.slice()
          const accum = new Array(N).fill(0)
          for (const item of valid) {
            const id = String((selectedIdColumn && item.raw[selectedIdColumn]) ?? item.raw.id ?? item.raw['S.No'] ?? item.raw.sno ?? '')
            const yArr = (item.y || []).map(Number)
            // ensure yArr length matches grid
            if (yArr.length !== N) {
              // fallback to interpolation for this item if lengths mismatch
              const yInterp = new Array(N)
              for (let j = 0; j < N; j++) yInterp[j] = interpLinear(item.x, item.y, g[j])
              // Store BOTH interpolated data (for plotting) AND original raw data from database
              samples.push({ id, x: g.slice(), y: yInterp, rawX: item.originalX, rawY: item.originalY })
              for (let j = 0; j < N; j++) accum[j] += (yInterp[j] || 0)
            } else {
              // When grids match, y = yArr (processed), but keep original database values separate
              samples.push({ id, x: g.slice(), y: yArr, rawX: item.originalX, rawY: item.originalY })
              for (let j = 0; j < N; j++) accum[j] += (yArr[j] || 0)
            }
          }
          avg = accum.map(v => v / Math.max(1, samples.length))
        } else {
          // Samples do not share an identical grid. Use the first sample's
          // x-grid as the reference grid and resample all other samples to it.
          const gRef = firstX.slice()
          const Nref = gRef.length
          g = gRef
          const accum = new Array(Nref).fill(0)
          for (const item of valid) {
            const id = String((selectedIdColumn && item.raw[selectedIdColumn]) ?? item.raw.id ?? item.raw['S.No'] ?? item.raw.sno ?? '')
            const yInterp = new Array(Nref)
            for (let j = 0; j < Nref; j++) yInterp[j] = interpLinear(item.x, item.y, g[j])
            // Store BOTH interpolated data (for plotting) AND original raw data from database
            samples.push({ id, x: g.slice(), y: yInterp, rawX: item.originalX, rawY: item.originalY })
            for (let j = 0; j < Nref; j++) accum[j] += (yInterp[j] || 0)
          }
          avg = accum.map(v => v / Math.max(1, samples.length))
        }
        if (!cancelled) {
          setGrid(g); setAvgY(avg); setPerSample(samples)
          setILow(0); setIHigh(g.length - 1)
          setX1Str((g[0] ?? 0).toFixed(2)); setX2Str((g[g.length - 1] ?? 0).toFixed(2))
          // Find the latest timestamp from all rows
          let latest = null
          for (const item of valid) {
            const ts = item.raw?.updated_at || item.raw?.created_at || item.raw?.timestamp
            if (ts) {
              const d = new Date(ts)
              if (!latest || d > latest) latest = d
            }
          }
          setLatestTimestamp(latest)
          // Calculate GLOBAL min/max intensity across ALL wavelengths and ALL samples
          // Use RAW data from database, not interpolated data
          let globalMin = Infinity
          let globalMax = -Infinity
          for (const sample of samples) {
            // Use rawY if available (original database values), otherwise fall back to y
            const intensityData = sample.rawY || sample.y
            for (const yVal of intensityData) {
              if (yVal < globalMin) globalMin = yVal
              if (yVal > globalMax) globalMax = yVal
            }
          }
          if (globalMin === Infinity) globalMin = 0
          if (globalMax === -Infinity) globalMax = 1
          // console.log('[AveragedSpectrum] Global min/max from RAW data:', 
          //             'min=', globalMin.toFixed(4), 'max=', globalMax.toFixed(4),
          //             'Sample count:', samples.length,
          //             'First sample has rawY:', !!samples[0]?.rawY)
          setGlobalIntensityMin(globalMin)
          setGlobalIntensityMax(globalMax)
          try { computeAndNotify(samples, g, 0, g.length - 1, useNormalizedRef.current, globalMin, globalMax) } catch (e) { void e }
        }
      } catch (e) {
        // console.warn('AveragedSpectrum load error', e)
        if (!cancelled) { setGrid([]); setAvgY([]); setPerSample([]) }
      } finally { if (!cancelled) setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [selectedTable, selectedIdColumn, computeAndNotify])

  useEffect(() => {
    if (!grid || grid.length === 0) return
    const low = Math.max(0, Math.min(iLow, grid.length - 1))
    const high = Math.max(0, Math.min(iHigh, grid.length - 1))
    const l = Math.min(low, high); const h = Math.max(low, high)
    if (!sliderEnabled) return
    const xL = grid[l], xH = grid[h]
    try { /* console.debug('[AveragedSpectrum] clamp cursorIdx=', cursorIdx, 'xL=', xL, 'xH=', xH, 'userDragging=', userDraggingRef.current) */ } catch (er) { }
    if (userDraggingRef.current) {
      // while the user is actively dragging, avoid forcing clamping; report integrals
      // using the current cursor index if present, otherwise use left bound
      const useIdx = (cursorIdx == null) ? l : Math.max(l, Math.min(cursorIdx, h))
      // CURSOR MODE: Pass same index for both low and high to use raw database values
      try { computeAndNotify(perSample, grid, useIdx, useIdx, useNormalized, globalIntensityMin, globalIntensityMax) } catch (e) { void e }
    } else {
      // only force initialization if cursorIdx is unset AND we are not mid-drag
      if (cursorIdx == null) { setCursorIdx(l); setCursorVal(grid[l]) }
      else if (cursorIdx < l) { setCursorIdx(l); setCursorVal(grid[l]) }
      else if (cursorIdx > h) { setCursorIdx(h); setCursorVal(grid[h]) }
      const cidx = cursorIdx == null ? l : Math.max(l, Math.min(cursorIdx, h))
      // CURSOR MODE: Pass same index for both low and high to use raw database values
      try { computeAndNotify(perSample, grid, cidx, cidx, useNormalized, globalIntensityMin, globalIntensityMax) } catch (e) { void e }
    }
  }, [iLow, iHigh, grid, sliderEnabled, computeAndNotify, perSample, cursorIdx, globalIntensityMin, globalIntensityMax])

  useEffect(() => {
    if (!sliderEnabled) return
    if (cursorIdx == null) return
    if (!grid || grid.length === 0) return
    const low = Math.max(0, Math.min(iLow, grid.length - 1))
    const high = Math.max(0, Math.min(iHigh, grid.length - 1))
    const l = Math.min(low, high)
    const cidx = Math.max(l, Math.min(cursorIdx, high))
    // CURSOR MODE: Pass same index for both low and high to use raw database values
    try { computeAndNotify(perSample, grid, cidx, cidx, useNormalized, globalIntensityMin, globalIntensityMax) } catch (e) { void e }
  }, [cursorVal, sliderEnabled, iLow, iHigh, grid, perSample, computeAndNotify, globalIntensityMin, globalIntensityMax])

  // Separate effect to recompute integrals when normalization changes WITHOUT resetting sliders
  useEffect(() => {
    useNormalizedRef.current = useNormalized
    if (!grid || grid.length === 0 || !perSample || perSample.length === 0) return
    const low = Math.max(0, Math.min(iLow, grid.length - 1))
    const high = Math.max(0, Math.min(iHigh, grid.length - 1))
    const l = Math.min(low, high)
    const cidx = cursorIdx != null ? Math.max(l, Math.min(cursorIdx, high)) : l
    // CURSOR MODE: Pass same index for both low and high to use raw database values
    try { computeAndNotify(perSample, grid, cidx, cidx, useNormalized, globalIntensityMin, globalIntensityMax) } catch (e) { void e }
  }, [useNormalized, grid, perSample, iLow, iHigh, cursorIdx, computeAndNotify, globalIntensityMin, globalIntensityMax])

  // Trigger color update when colorMappingMode changes (especially when switching back to cursor mode)
  useEffect(() => {
    if (!grid || grid.length === 0 || !perSample || perSample.length === 0) return
    if (colorMappingMode === 'cursor') {
      // Force recomputation when switching to cursor mode
      const low = Math.max(0, Math.min(iLow, grid.length - 1))
      const high = Math.max(0, Math.min(iHigh, grid.length - 1))
      const l = Math.min(low, high)
      const cidx = cursorIdx != null ? Math.max(l, Math.min(cursorIdx, high)) : l
      try { computeAndNotify(perSample, grid, cidx, cidx, useNormalized, globalIntensityMin, globalIntensityMax) } catch (e) { void e }
    }
  }, [colorMappingMode, grid, perSample, iLow, iHigh, cursorIdx, computeAndNotify, useNormalized, globalIntensityMin, globalIntensityMax])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    // Use fixed width or fallback if clientWidth is 0 (when hidden)
    const clientW = c.clientWidth > 0 ? c.clientWidth : 370
    const w = Math.max(220, Math.min(420, clientW))
    const h = 80
    c.width = Math.floor(w * dpr)
    c.height = Math.floor(h * dpr)
    c.style.width = w + 'px'
    c.style.height = h + 'px'
    const ctx = c.getContext('2d')
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, w, h)

    if (!grid || grid.length < 2 || !avgY || avgY.length === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.04)'
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = textColor
      ctx.font = '12px sans-serif'
      ctx.fillText(loading ? 'Loading…' : 'No averaged spectrum', 12, 20)
      return
    }

    const y = avgY.slice()
    const minY = Math.min(...y)
    const maxY = Math.max(...y)
    const norm = v => (v - minY) / (maxY - minY || 1)
    const padding = 8
    const gx = i => padding + (i / (grid.length - 1)) * (w - padding * 2)
    const gy = val => h - padding - val * (h - padding * 2)

    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(200,200,200,0.45)'
    ctx.beginPath()
    for (let i = 0; i < grid.length; i++) {
      const vx = gx(i)
      const vy = gy((y[i] - minY) / (maxY - minY || 1))
      if (i === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    }
    ctx.stroke()

    ctx.lineWidth = 2
    ctx.strokeStyle = '#00438fff'
    ctx.beginPath()
    for (let i = 0; i < grid.length; i++) {
      const vx = gx(i)
      const vy = gy(norm(y[i]))
      if (i === 0) ctx.moveTo(vx, vy)
      else ctx.lineTo(vx, vy)
    }
    ctx.stroke()

    if (sliderEnabled) {
      // Determine the bounds
      const low = Math.max(0, Math.min(iLow, grid.length - 1))
      const high = Math.max(0, Math.min(iHigh, grid.length - 1))
      const x1Idx = Math.min(low, high)
      const x2Idx = Math.max(low, high)
      
      // Check if user has an active cursor (cursor is set and within the range)
      const hasActiveCursor = (cursorIdx != null && cursorIdx >= x1Idx && cursorIdx <= x2Idx)
      
      if (colorMappingMode === 'integration') {
        // INTEGRATION MODE: Use integration range values to find marker positions
        let integX1Idx = x1Idx
        let integX2Idx = x2Idx
        
        // If integration range values are provided, find their indices in the grid
        if (integrationRangeLow != null && integrationRangeHigh != null) {
          // Find closest grid indices for integration range
          integX1Idx = 0
          integX2Idx = grid.length - 1
          let minDiff1 = Math.abs(grid[0] - integrationRangeLow)
          let minDiff2 = Math.abs(grid[0] - integrationRangeHigh)
          
          for (let i = 0; i < grid.length; i++) {
            const diff1 = Math.abs(grid[i] - integrationRangeLow)
            const diff2 = Math.abs(grid[i] - integrationRangeHigh)
            if (diff1 < minDiff1) {
              minDiff1 = diff1
              integX1Idx = i
            }
            if (diff2 < minDiff2) {
              minDiff2 = diff2
              integX2Idx = i
            }
          }
        }
        
        // INTEGRATION MODE: Draw TWO line markers at integration range positions
        // INTEGRATION MODE: Draw TWO line markers at integration range positions
        const cx1 = gx(integX1Idx)
        const cx2 = gx(integX2Idx)
        
        // Fill the area between X1 and X2 with a subtle highlight
        ctx.fillStyle = 'rgba(0, 179, 134, 0.08)'
        ctx.fillRect(cx1, 4, cx2 - cx1, h - 10)
        
        // Draw X1 line marker (green)
        ctx.strokeStyle = '#00b386ff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx1, 4)
        ctx.lineTo(cx1, h - 6)
        ctx.stroke()
        ctx.fillStyle = '#00b386ff'
        ctx.font = '11px sans-serif'
        ctx.fillText((grid[integX1Idx] ?? 0).toFixed(2), Math.max(6, cx1 - 22), 14)
        
        // Draw X2 line marker (red)
        ctx.strokeStyle = '#d63030ff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx2, 4)
        ctx.lineTo(cx2, h - 6)
        ctx.stroke()
        ctx.fillStyle = '#d63030ff'
        ctx.font = '11px sans-serif'
        ctx.fillText((grid[integX2Idx] ?? 0).toFixed(2), Math.min(w - 32, cx2 - 22), 14)
        
        // Also draw cursor line if cursor is active within the range
        if (hasActiveCursor) {
          const cx = gx(cursorIdx)
          ctx.strokeStyle = '#003985ff'
          ctx.lineWidth = 1
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.moveTo(cx, 4)
          ctx.lineTo(cx, h - 6)
          ctx.stroke()
          ctx.setLineDash([])
        }
      } else if (colorMappingMode === 'cursor') {
        // CURSOR MODE: Draw TWO line markers at X1/X2 positions (similar to integration mode)
        let cursorX1Idx = x1Idx
        let cursorX2Idx = x2Idx
        
        // If integration range values are provided (reused for cursor mode X1/X2), find their indices in the grid
        if (integrationRangeLow != null && integrationRangeHigh != null) {
          // Find closest grid indices for cursor mode X1/X2 range
          cursorX1Idx = 0
          cursorX2Idx = grid.length - 1
          let minDiff1 = Math.abs(grid[0] - integrationRangeLow)
          let minDiff2 = Math.abs(grid[0] - integrationRangeHigh)
          
          for (let i = 0; i < grid.length; i++) {
            const diff1 = Math.abs(grid[i] - integrationRangeLow)
            const diff2 = Math.abs(grid[i] - integrationRangeHigh)
            if (diff1 < minDiff1) {
              minDiff1 = diff1
              cursorX1Idx = i
            }
            if (diff2 < minDiff2) {
              minDiff2 = diff2
              cursorX2Idx = i
            }
          }
        }
        
        const cx1 = gx(cursorX1Idx)
        const cx2 = gx(cursorX2Idx)
        
        // Fill the area between X1 and X2 with a subtle highlight
        ctx.fillStyle = 'rgba(0, 120, 255, 0.08)'
        ctx.fillRect(cx1, 4, cx2 - cx1, h - 10)
        
        // Draw X1 line marker (blue)
        ctx.strokeStyle = '#0078ffff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx1, 4)
        ctx.lineTo(cx1, h - 6)
        ctx.stroke()
        ctx.fillStyle = '#0078ffff'
        ctx.font = '11px sans-serif'
        ctx.fillText((grid[cursorX1Idx] ?? 0).toFixed(2), Math.max(6, cx1 - 22), 14)
        
        // Draw X2 line marker (blue)
        ctx.strokeStyle = '#0078ffff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx2, 4)
        ctx.lineTo(cx2, h - 6)
        ctx.stroke()
        ctx.fillStyle = '#0078ffff'
        ctx.font = '11px sans-serif'
        ctx.fillText((grid[cursorX2Idx] ?? 0).toFixed(2), Math.min(w - 32, cx2 - 22), 14)
        
        // Also draw cursor line if cursor is active within the range
        if (hasActiveCursor) {
          const cx = gx(cursorIdx)
          ctx.strokeStyle = '#6b2198ff'
          ctx.lineWidth = 1.5
          ctx.setLineDash([3, 3])
          ctx.beginPath()
          ctx.moveTo(cx, 4)
          ctx.lineTo(cx, h - 6)
          ctx.stroke()
          ctx.setLineDash([])
          ctx.fillStyle = '#6b2198ff'
          ctx.font = '11px sans-serif'
          ctx.fillText((grid[cursorIdx] ?? 0).toFixed(2), Math.max(6, Math.min(w - 32, cx - 22)), 24)
        }
      }
    }

  }, [grid, avgY, loading, textColor, sliderEnabled, cursorVal, iLow, iHigh, cursorIdx, userDraggingRef, colorMappingMode, integrationRangeLow, integrationRangeHigh])

  const maxIdx = (grid && grid.length > 0) ? grid.length - 1 : 0
  const leftIdx = Math.min(iLow, iHigh)
  const rightIdx = Math.max(iLow, iHigh)
  const leftPct = maxIdx > 0 ? (leftIdx / maxIdx) * 100 : 0
  const widthPct = maxIdx > 0 ? ((rightIdx - leftIdx) / maxIdx) * 100 : 0

  // Use explicit index state for the cursor. `cursorIdx` is set when the user
  // drags the native range input and kept in sync with `cursorVal`.

  const handleSet = () => {
    const v1 = Number(x1Str); const v2 = Number(x2Str)
    if (!grid || !grid.length) return
    // compute indices locally (do not rely on stale state)
    let idx1 = 0; let idx2 = grid.length - 1
    if (!Number.isNaN(v1)) {
      idx1 = 0
      for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v1) < Math.abs(grid[idx1] - v1)) idx1 = i
    }
    if (!Number.isNaN(v2)) {
      idx2 = 0
      for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v2) < Math.abs(grid[idx2] - v2)) idx2 = i
    }
    setILow(idx1); setIHigh(idx2)
    const l = Math.min(idx1, idx2)
    setSliderEnabled(true)
    setCursorIdx(l); setCursorVal(grid[l])
    // update the visible input strings to the snapped grid values
    setX1Str((grid[idx1] ?? 0).toFixed(2))
    setX2Str((grid[idx2] ?? 0).toFixed(2))
  }
  const handleReset = () => {
    if (!grid || !grid.length) return
    setILow(0); setIHigh(grid.length - 1)
    setX1Str((grid[0] ?? 0).toFixed(2)); setX2Str((grid[grid.length - 1] ?? 0).toFixed(2))
    setSliderEnabled(false); setCursorIdx(null); setCursorVal(null)
  }

  const onThumbPointerDown = (ev) => {
    ev.preventDefault(); setTooltipVisible(true)
    const onMove = (me) => {
      if (!trackRef.current || !rawGridRef.current) return
      const rect = trackRef.current.getBoundingClientRect()
      const clamped = Math.max(rect.left, Math.min(rect.right, me.clientX))
      const frac = (clamped - rect.left) / Math.max(1, rect.width)
      const rx = rawGridRef.current
      const lowIdx = Math.min(iLow, iHigh); const highIdx = Math.max(iLow, iHigh)
      const xL = rx[lowIdx]; const xH = rx[highIdx]
      const val = xL + frac * (xH - xL)
      let nearest = lowIdx; let best = Math.abs((rx[nearest] ?? 0) - val)
      for (let k = lowIdx + 1; k <= highIdx; k++) { const d = Math.abs((rx[k] ?? 0) - val); if (d < best) { best = d; nearest = k } }
      setCursorIdx(nearest); setCursorVal(rx[nearest])
    }
    const onUp = () => { setTooltipVisible(false); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp) }
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp)
  }

  // Handler for native range pointer down: mark dragging state and register a
  // document-level pointerup listener to reliably clear dragging even if the
  // pointer leaves the control during the drag.
  const handleRangePointerDown = (ev) => {
    // don't prevent default — let the native range thumb operate normally
    userDraggingRef.current = true
    setTooltipVisible(true)
    const clear = () => {
      userDraggingRef.current = false
      setTooltipVisible(false)
      // If an external range update was deferred while dragging, apply it now.
      try {
        if (pendingRangeRef.current && Array.isArray(pendingRangeRef.current)) {
          const [px1, px2] = pendingRangeRef.current
          pendingRangeRef.current = null
          // apply the pending range now that dragging has finished
          try { if (px1 !== undefined && px2 !== undefined) {
            const v1 = Number(px1); const v2 = Number(px2)
            let idx1 = 0; let idx2 = grid.length - 1
            if (!Number.isNaN(v1)) {
              idx1 = 0
              for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v1) < Math.abs(grid[idx1] - v1)) idx1 = i
            }
            if (!Number.isNaN(v2)) {
              idx2 = 0
              for (let i = 0; i < grid.length; i++) if (Math.abs(grid[i] - v2) < Math.abs(grid[idx2] - v2)) idx2 = i
            }
            setILow(idx1); setIHigh(idx2)
            const l = Math.min(idx1, idx2)
            if (cursorIdx == null) { setCursorIdx(l); setCursorVal(grid[l]) }
            setX1Str((grid[idx1] ?? 0).toFixed(2))
            setX2Str((grid[idx2] ?? 0).toFixed(2))
          } } catch (e) { void e }
        }
        // If a programmatic cursor update was deferred while dragging, apply it now
        try {
            // First, if the user moved the thumb, persist that index
            if (currentDragIdxRef.current !== null) {
              try {
                const finalIdx = currentDragIdxRef.current; currentDragIdxRef.current = null
                if (Number.isFinite(finalIdx) && grid && grid.length) {
                  const clamped = Math.max(0, Math.min(grid.length - 1, finalIdx))
                  setCursorIdx(clamped); setCursorVal(grid[clamped])
                }
              } catch (ee) { void ee }
            }

            if (pendingCursorRef.current !== null) {
            const pc = pendingCursorRef.current; pendingCursorRef.current = null
            if (pc == null) { setCursorVal(null); setCursorIdx(null) }
            else {
              // find nearest grid index within current bounds
              const lowIdx = Math.min(iLow, iHigh); const highIdx = Math.max(iLow, iHigh)
              let nearest = Math.max(0, Math.min(grid.length - 1, lowIdx))
              for (let i = lowIdx; i <= Math.min(highIdx, grid.length - 1); i++) if (Math.abs((grid[i] ?? 0) - pc) < Math.abs((grid[nearest] ?? 0) - pc)) nearest = i
              setCursorIdx(nearest); setCursorVal(grid[nearest])
            }
          }
                  // If a programmatic cursor update was deferred while dragging, apply it now
        try {
          // Always apply the user's last dragged index first (priority)
          if (currentDragIdxRef.current !== null) {
            try {
              const finalIdx = currentDragIdxRef.current; currentDragIdxRef.current = null
              if (Number.isFinite(finalIdx) && grid && grid.length) {
                const clamped = Math.max(0, Math.min(grid.length - 1, finalIdx))
                setCursorIdx(clamped); setCursorVal(grid[clamped])
              }
            } catch (ee) { void ee }
          } else if (pendingCursorRef.current !== null) {
            // only apply programmatic cursor if user didn't drag
            const pc = pendingCursorRef.current; pendingCursorRef.current = null
            if (pc == null) { setCursorVal(null); setCursorIdx(null) }
            else {
              // find nearest grid index within current bounds
              const lowIdx = Math.min(iLow, iHigh); const highIdx = Math.max(iLow, iHigh)
              let nearest = Math.max(0, Math.min(grid.length - 1, lowIdx))
              for (let i = lowIdx; i <= Math.min(highIdx, grid.length - 1); i++) if (Math.abs((grid[i] ?? 0) - pc) < Math.abs((grid[nearest] ?? 0) - pc)) nearest = i
              setCursorIdx(nearest); setCursorVal(grid[nearest])
            }
          } else if (rangeInputRef.current) {
            // fallback: read input's final value if no drag or programmatic update happened
            const rawVal = Number(rangeInputRef.current.value)
            if (Number.isFinite(rawVal)) {
              const lowIdx = Math.min(iLow, iHigh); const highIdx = Math.max(iLow, iHigh)
              const clamped = Math.max(lowIdx, Math.min(highIdx, rawVal))
              setCursorIdx(clamped); setCursorVal(grid[clamped])
            }
          }
        } catch (e) { void e }
        } catch (e) { void e }
      } catch (e) { void e }
      document.removeEventListener('pointerup', clear)
      document.removeEventListener('pointercancel', clear)
    }
    document.addEventListener('pointerup', clear)
    document.addEventListener('pointercancel', clear)
  }


  return (
    <div style={{ fontFamily: 'sans-serif', color: textColor, fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <canvas ref={canvasRef} style={{ width: 370, height: 110, display: 'block', background: 'transparent', flex: '0 0 auto', borderRadius: 4 }} />
          <div style={{ fontSize: 12, color: textColor, paddingLeft: 10 }}>
            {grid && grid.length > 0 && `${(grid[0] ?? 0).toFixed(1)} → ${(grid[grid.length - 1] ?? 0).toFixed(1)}`}
          </div>
          {latestTimestamp && (
            <div style={{ fontSize: 10, color: textColor, opacity: 0.7, paddingLeft: 10 }}>
              Last updated: {latestTimestamp.toLocaleDateString()} {latestTimestamp.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default AveragedSpectrum