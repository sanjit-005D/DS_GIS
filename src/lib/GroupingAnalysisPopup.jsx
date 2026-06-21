import React from 'react'
import Plot from 'react-plotly.js'

/**
 * buildDendrogramPlot: Helper to convert hierarchical dendrogram merges into Plotly traces.
 */
function buildDendrogramPlot(dendrogram) {
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
}

export default function GroupingAnalysisPopup({
  groupRepresentation,
  groupAssignments,
  groupColors,
  rect,
  minimized,
  setMinimized,
  onRectChange,
  onPointerDown,
  onResizeStart,
  POPUP_MINIMIZED_WIDTH = 240,
  POPUP_MINIMIZED_HEIGHT = 34,
  textColor = '#111',
  controlBg = 'rgba(255,255,255,0.97)'
}) {
  if (!groupRepresentation) return null

  const plotHeight = Math.max(160, rect.height - 56)

  return (
    <div
      onPointerDown={onPointerDown}
      className="resizable-panel"
      style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        zIndex: 1380,
        background: controlBg,
        border: '1px solid rgba(0,0,0,0.15)',
        borderRadius: 8,
        padding: minimized ? '6px 8px' : '8px 8px 6px 8px',
        width: minimized ? Math.min(rect.width, POPUP_MINIMIZED_WIDTH) : rect.width,
        height: minimized ? POPUP_MINIMIZED_HEIGHT : rect.height,
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
        cursor: 'grab',
        userSelect: 'none',
        overflow: 'auto'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: minimized ? 0 : 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: textColor, opacity: 0.9 }}>
          {groupRepresentation.method === 'pca' ? 'PCA Representation' : 'Cluster Dendrogram'}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setMinimized(v => !v)
          }}
          style={{ background: 'transparent', border: 'none', color: textColor, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, width: 18, height: 18 }}
          title={minimized ? 'Maximize popup' : 'Minimize popup'}
        >
          {minimized ? '▢' : '▁'}
        </button>
      </div>

      {!minimized && (
        <div style={{ width: '100%', height: plotHeight }}>
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
                        return groupColors[(Number.isFinite(gid) ? gid : 0) % groupColors.length]
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
                      return groupColors[(Number.isFinite(gid) ? gid : 0) % groupColors.length]
                    }),
                    line: { width: 0.6, color: 'rgba(0,0,0,0.35)' }
                  },
                  hovertemplate: 'ID: %{text}<extra></extra>',
                  showlegend: false
                }
              ]
            })()}
            useResizeHandler={true}
            layout={{
              autosize: true,
              margin: { t: 8, b: 34, l: 34, r: 8 },
              paper_bgcolor: 'rgba(0,0,0,0)',
              plot_bgcolor: 'rgba(0,0,0,0)',
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
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
      )}
      <div
        className="popup-resize-handle"
        aria-hidden={minimized}
        onPointerDown={(e) => onResizeStart(e, onRectChange, rect, 320, 220)}
        style={{ position: 'absolute', right: 2, bottom: 2, width: 12, height: 12, cursor: 'nwse-resize', borderRight: '2px solid rgba(0,0,0,0.35)', borderBottom: '2px solid rgba(0,0,0,0.35)', display: minimized ? 'none' : 'block' }}
      />
    </div>
  )
}
