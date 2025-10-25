import React from 'react'
import GlobeCesium from './GlobeCesium'

export default function GlobeModal({ open, onClose, selectedSNo }) {
  if (!open) return null

  return (
    <div className="globe-modal-overlay" onClick={onClose}>
      <div className="globe-modal" onClick={(e) => e.stopPropagation()}>
        <button className="globe-close" onClick={onClose}>✕</button>
        <div className="globe-map" style={{ height: '600px' }}>
          <GlobeCesium className="globe-cs" selectedSNo={selectedSNo} />
        </div>
      </div>
    </div>
  )
}
