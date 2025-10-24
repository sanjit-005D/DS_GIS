import React, { useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'

export default function GlobeModal({ open, onClose, selectedSNo }) {
  const globeContainerRef = useRef(null)
  const globeInstanceRef = useRef(null)
  const miniMapContainerRef = useRef(null)
  const miniMapInstanceRef = useRef(null)
  const [points, setPoints] = useState([])
  const [miniMapVisible, setMiniMapVisible] = useState(false)

  useEffect(() => {
    if (!open) return
    let mounted = true

    // attempt to dynamically import three and globe.gl (ESM) for a clean build and to avoid CDN/deprecation warnings
    let GlobeFactory = null
    let THREE = null
    const tryLoadGlobe = async () => {
      try {
        const threeMod = await import('three')
        // Ensure the global THREE reference is set so three-globe (if it checks window.THREE)
        // will reuse the same Three instance instead of causing duplicate copies which
        // can lead to WebGL texture mismatch errors (glTexStorage2D: Texture is immutable).
        window.THREE = threeMod
        // package on npm is 'three-globe'
        const globeMod = await import('three-globe')
        THREE = threeMod
        // three-globe exports a function or default depending on bundler
        GlobeFactory = globeMod.default || globeMod
        // also expose Globe on window to aid some UMD builds
        try { window.Globe = GlobeFactory } catch (e) {}
      } catch (e) {
        console.warn('Dynamic import of three/three-globe failed, falling back to window globals if present', e)
        if (window.Globe && window.THREE) {
          GlobeFactory = window.Globe
          THREE = window.THREE
        }
      }
      return { GlobeFactory, THREE }
    }

    const createGlobe = async (pointsData) => {
      // clear previous content
      if (globeContainerRef.current) globeContainerRef.current.innerHTML = ''

      const Three = THREE
      const ThreeGlobe = GlobeFactory
      if (!Three || !ThreeGlobe) {
        console.error('three or three-globe not available; cannot instantiate globe')
        return
      }

      // dynamic import of helpers
      let OrbitControls = null
      let CSS2DRenderer = null
      try {
        const oc = await import('three/examples/jsm/controls/OrbitControls.js')
        OrbitControls = oc.OrbitControls || oc.default || oc
      } catch (e) { console.warn('OrbitControls import failed', e) }
      try {
        const css2d = await import('three/examples/jsm/renderers/CSS2DRenderer.js')
        CSS2DRenderer = css2d.CSS2DRenderer || css2d.default || css2d
      } catch (e) { console.warn('CSS2DRenderer import failed', e) }

      // Create renderers: WebGL + CSS2D for HTML markers
      const width = globeContainerRef.current.clientWidth || 800
      const height = globeContainerRef.current.clientHeight || 600

      const renderer = new Three.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setPixelRatio(window.devicePixelRatio || 1)
      renderer.setSize(width, height)
  renderer.domElement.style.display = 'block'
  // prevent default touch actions from interfering with OrbitControls on touch devices
  try { renderer.domElement.style.touchAction = 'none' } catch (e) {}

      // Attempt to set color-space / encoding to match three-globe expectations and avoid
      // texture storage mismatches that can cause GL_INVALID_OPERATION warnings.
      try {
        // Prefer the newer outputColorSpace where present (Three >=0.154). Fall back to outputEncoding.
        if ('outputColorSpace' in renderer && Three.SRGBColorSpace !== undefined) {
          renderer.outputColorSpace = Three.SRGBColorSpace
        } else if ('outputEncoding' in renderer && Three.sRGBEncoding !== undefined) {
          renderer.outputEncoding = Three.sRGBEncoding
        }
        // Disable tone mapping to avoid additional internal texture conversions which
        // can interact badly with textures created elsewhere. Use NoToneMapping if available.
        if ('toneMapping' in renderer && Three.NoToneMapping !== undefined) renderer.toneMapping = Three.NoToneMapping
        // increase exposure slightly to brighten final render if supported
        try { if ('toneMappingExposure' in renderer) renderer.toneMappingExposure = 1.4 } catch (e) {}
      } catch (e) {
        console.warn('Unable to set renderer color-space/encoding safely', e)
      }

      let labelRenderer = null
      if (CSS2DRenderer) {
        labelRenderer = new CSS2DRenderer()
        labelRenderer.setSize(width, height)
        labelRenderer.domElement.style.position = 'absolute'
        labelRenderer.domElement.style.top = '0'
        // allow pointer events on individual marker elements only.
        // Keep the overlay itself from intercepting pointer events so OrbitControls
        // receives pointer events from the WebGL canvas underneath.
        labelRenderer.domElement.style.pointerEvents = 'none'
      }

      // append renderers to container
      globeContainerRef.current.appendChild(renderer.domElement)
      if (labelRenderer) globeContainerRef.current.appendChild(labelRenderer.domElement)

      // Scene and camera
      const scene = new Three.Scene()
      const camera = new Three.PerspectiveCamera(60, width / height, 1, 2000)
      camera.position.z = 400

          // Lights — increase intensities to brighten the globe as requested
          scene.add(new Three.AmbientLight(0xffffff, 1.6))
          try { scene.add(new Three.HemisphereLight(0xffffff, 0x444444, 1.0)) } catch (e) {}
          const dl = new Three.DirectionalLight(0xffffff, 1.8)
          dl.position.set(1, 1, 1)
          scene.add(dl)
          // add a soft fill point light to reduce shadowing and brighten details
          try {
            const pl = new Three.PointLight(0xffffff, 1.0)
            pl.position.set(200, 200, 200)
            scene.add(pl)
          } catch (e) {}

  // Instantiate globe (ThreeGlobe may be a constructor/class or a factory) - handle both
      let globe = null
      try {
        console.info('ThreeGlobe type before instantiation', typeof ThreeGlobe, ThreeGlobe)
        // Try class-style construction
        globe = new ThreeGlobe({ waitForGlobeReady: true })
        globe
          .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
          .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
          .pointsData(pointsData)
          .pointLat(d => d.lat)
          .pointLng(d => d.lng)
          .pointColor(() => '#ff5722')
          // make markers slightly more visible by increasing altitude/radius
          .pointAltitude(0.04)
          .pointRadius(1.2)
        scene.add(globe)
        // Use URL strings for globe images so three-globe manages texture creation
        try {
          globe.globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
          globe.bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        } catch (e) { console.warn('setting globe image URLs failed', e) }
      } catch (e) {
        console.warn('new ThreeGlobe(...) failed, attempting factory-call fallback', e)
        try {
          // some builds export a factory function: call it and try to add result
          const maybe = ThreeGlobe()
          if (maybe && typeof maybe === 'object') {
            // Try to treat as globe instance
            globe = maybe
            if (globe.globeImageUrl) {
              globe
                .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-night.jpg')
                .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
                .pointsData(pointsData)
                .pointLat(d => d.lat)
                .pointLng(d => d.lng)
                .pointColor(() => '#ff5722')
                .pointAltitude(0.02)
                .pointRadius(0.6)
              scene.add(globe)
            } else if (typeof maybe === 'function') {
              // pattern: const Globe = ThreeGlobe(); const mounted = Globe(container)
              try {
                const mounted = maybe(globeContainerRef.current)
                if (mounted) globe = mounted
              } catch (e2) { console.warn('factory -> container call failed', e2) }
            }
          }
        } catch (e2) {
          console.error('Fallback instantiation also failed', e2)
        }
      }

      // HTML markers via three-globe htmlElements layer if available, else create CSS2D objects
      if (globe.htmlElementsData && globe.htmlElement) {
        globe.htmlElementsData(pointsData)
        globe.htmlElement(d => {
          const el = document.createElement('div')
          el.className = 'sample-label'
          el.textContent = d.label || ''
          el.style.cursor = 'pointer'
          // allow clicks on the marker element even though the labelRenderer overlay is pointer-events:none
          el.style.pointerEvents = 'auto'
          // accessibility: expose as a button role, make focusable and provide aria-label
          el.setAttribute('role', 'button')
          el.setAttribute('aria-label', d.label ? String(d.label) : 'Sample point')
          el.tabIndex = 0
          el.onclick = () => showMiniMap(d.lat, d.lng, d.label)
          el.onkeydown = (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault()
              showMiniMap(d.lat, d.lng, d.label)
            }
          }
          return el
        })
        globe.htmlElementVisibilityModifier((el, isVisible) => { el.style.opacity = isVisible ? '1' : '0'; el.style.pointerEvents = isVisible ? 'auto' : 'none' })
      }

      // Controls
      let controls = null
      if (OrbitControls) {
        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controls.enablePan = false
        controls.minDistance = 120
        controls.maxDistance = 800
        // ensure rotation and zoom are enabled
        controls.enableRotate = true
        controls.enableZoom = true
        // sensible rotate/zoom speeds for globe interaction
        try { controls.rotateSpeed = controls.rotateSpeed || 1.0 } catch (e) {}
        try { controls.zoomSpeed = controls.zoomSpeed || 1.2 } catch (e) {}
      }

      // Handle resize
      const handleResize = () => {
        const w = globeContainerRef.current.clientWidth || 800
        const h = globeContainerRef.current.clientHeight || 600
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
        if (labelRenderer) labelRenderer.setSize(w, h)
      }
      window.addEventListener('resize', handleResize)

      // Animation loop
      let rafId = null
      const animate = () => {
        if (controls) controls.update()
        renderer.render(scene, camera)
        if (labelRenderer) labelRenderer.render(scene, camera)
        rafId = requestAnimationFrame(animate)
      }
      animate()

      // Ensure initial camera framing and interactivity. If camera is very far
      // away (globe appears tiny), bring it closer and set the controls target.
      try {
        camera.lookAt(0, 0, 0)
        if (controls) {
          controls.target.set(0, 0, 0)
          // reduce distance if too large
          if (camera.position.length() > 600) camera.position.set(0, 0, Math.max(220, camera.position.z / 2))
          controls.update()
        } else {
          if (camera.position.z > 600) camera.position.set(0, 0, 300)
        }
      } catch (e) { console.warn('Error adjusting initial camera/controls', e) }

      // store instances for cleanup
      globeInstanceRef.current = {
        renderer,
        labelRenderer,
        scene,
        camera,
        controls,
        globe,
        rafId,
        handleResize
      }
      // expose nothing else on globeInstanceRef to avoid auto-focus behaviors
    }

    const showMiniMap = (lat, lng, label) => {
      setMiniMapVisible(true)
      // initialize MapLibre map in miniMapContainerRef
      setTimeout(() => {
        try {
          if (!window.maplibregl) {
            console.warn('maplibre-gl not available for mini-map')
            return
          }
          // destroy previous map if exists
          if (miniMapInstanceRef.current) {
            try { miniMapInstanceRef.current.remove() } catch (e) {}
            miniMapInstanceRef.current = null
          }
          const map = new window.maplibregl.Map({
            container: miniMapContainerRef.current,
            style: 'https://demotiles.maplibre.org/style.json',
            center: [lng, lat],
            zoom: 16
          })
          new window.maplibregl.NavigationControl()
          map.addControl(new window.maplibregl.NavigationControl())
          const marker = new window.maplibregl.Marker().setLngLat([lng, lat]).addTo(map)
          miniMapInstanceRef.current = map
        } catch (e) { console.error('mini map init failed', e) }
      }, 120) // allow modal/layout to settle
    }

    ;(async () => {
      // load globe and three dynamically (preferred) or fallback to window globals
      const libs = await tryLoadGlobe()
      if (!libs || !libs.GlobeFactory) {
        console.error('Unable to load three-globe and three.js from node_modules or window. Make sure to run `npm install` for "three" and "three-globe" or include CDN scripts.')
        return
      }
      // ensure closure vars are populated for later usage
      GlobeFactory = libs.GlobeFactory || GlobeFactory
      THREE = libs.THREE || THREE
      try {
        if (!supabase) {
          console.warn('Supabase client not initialized in GlobeModal; skipping fetch.')
          return
        }
        const { data, error } = await supabase.from('test').select('*').limit(1000)
        if (error) {
          console.error('Supabase select(*) error', error)
          return
        }

        const rows = data || []
        console.info('GlobeModal fetched rows:', rows.length)
        if (rows.length === 0) return

        // attempt to locate geo and label keys (reuse robust detection)
        const keys = Object.keys(rows[0])
        const geoCandidates = ['geo_tag','geo','location','coordinates','geom','the_geom','latlon','point','lat_lon','latitude_longitude','latitude','longitude','lon','lat']
        let geoKey = keys.find(k => geoCandidates.includes(k.toLowerCase())) || null
        // fallback: find first key whose value in a row looks like lat/lon (tight rules)
        if (!geoKey) {
          for (const k of keys) {
            const v = rows[0][k]
            if (v == null) continue
            const s = typeof v === 'string' ? v.trim() : null
            if ((Array.isArray(v) && v.length === 2) || (s && s.match(/-?\d+/))) { geoKey = k; break }
          }
        }

        const labelCandidates = ['sample_name','sample','name','sampleid','s.no','s_no','sno','id']
        let labelKey = keys.find(k => labelCandidates.includes(k.toLowerCase())) || keys.find(k => typeof rows[0][k] === 'string') || null

        // build points array
        const parsed = []
        rows.forEach((r, idx) => {
          if (!geoKey) return
          const raw = r[geoKey]
          let lat = null, lng = null
          try {
            if (raw == null) return
            if (typeof raw === 'object') {
              if (raw.type === 'Point' && Array.isArray(raw.coordinates)) { lng = Number(raw.coordinates[0]); lat = Number(raw.coordinates[1]) }
              else if (Array.isArray(raw) && raw.length === 2) { lng = Number(raw[0]); lat = Number(raw[1]) }
            } else {
              const s = String(raw).trim()
              if (s.startsWith('[') && s.endsWith(']')) {
                try { const a = JSON.parse(s); if (Array.isArray(a) && a.length === 2) { lng = Number(a[0]); lat = Number(a[1]) } } catch (e) {}
              }
              if (lat == null || lng == null) {
                const parts = s.replace(/^POINT\s*\(/i, '').replace(/\)$/, '').split(/[ ,]+/).map(p => p.trim()).filter(Boolean)
                if (parts.length >= 2) {
                  const n0 = Number(parts[0]), n1 = Number(parts[1])
                  if (!isNaN(n0) && !isNaN(n1)) {
                    // heuristic: assume first is lon unless both look like lat
                    if (Math.abs(n0) <= 90 && Math.abs(n1) <= 90) { lat = n0; lng = n1 } else { lng = n0; lat = n1 }
                  }
                }
              }
            }
          } catch (e) { return }
          if (lat == null || lng == null) return
          // validate
          if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return
          parsed.push({ lat, lng, label: labelKey ? (r[labelKey] ?? String(idx)) : String(idx) })
        })

        if (!mounted) return
        setPoints(parsed)
        // create globe with parsed points
        const pts = parsed.map(p => ({ lat: p.lat, lng: p.lng, label: p.label }))
        // createGlobe is async; call and catch errors
        try {
          await createGlobe(pts)
        } catch (e) {
          console.error('createGlobe failed', e)
        }

        // No auto-focus: do not change camera to a specific sample automatically.

      } catch (e) {
        console.error('error loading geo points', e)
      }
    })()

    return () => {
      mounted = false
      // destroy mini map
      try { if (miniMapInstanceRef.current) { miniMapInstanceRef.current.remove(); miniMapInstanceRef.current = null } } catch (e) {}
      // destroy globe
      try {
        if (globeInstanceRef.current) {
          const inst = globeInstanceRef.current
          // stop animation
          try { if (inst.rafId) cancelAnimationFrame(inst.rafId) } catch (e) {}
          // remove resize listener
          try { window.removeEventListener('resize', inst.handleResize) } catch (e) {}
          // dispose renderer
          try { if (inst.renderer && inst.renderer.dispose) inst.renderer.dispose() } catch (e) {}
          // remove DOM nodes
          try { if (inst.renderer && inst.renderer.domElement && inst.renderer.domElement.parentNode) inst.renderer.domElement.parentNode.removeChild(inst.renderer.domElement) } catch (e) {}
          try { if (inst.labelRenderer && inst.labelRenderer.domElement && inst.labelRenderer.domElement.parentNode) inst.labelRenderer.domElement.parentNode.removeChild(inst.labelRenderer.domElement) } catch (e) {}
          globeInstanceRef.current = null
        }
        if (globeContainerRef.current) globeContainerRef.current.innerHTML = ''
      } catch (e) { console.warn('Error cleaning globe', e) }
    }
  }, [open])

  // No auto-focus on selectedSNo while modal is open (user requested auto-focus removal)

  // update globe pointsData if points change after initial mount
  useEffect(() => {
    try {
      if (globeInstanceRef.current && globeInstanceRef.current.globe && typeof globeInstanceRef.current.globe.pointsData === 'function') {
        globeInstanceRef.current.globe.pointsData(points || [])
      }
    } catch (e) { /* non-fatal */ }
  }, [points])

  if (!open) return null

  return (
    <div className="globe-modal-overlay" onClick={onClose}>
      <div className="globe-modal" onClick={(e) => e.stopPropagation()}>
        <button className="globe-close" onClick={onClose}>✕</button>
        <div ref={globeContainerRef} className="globe-map" />
        {miniMapVisible && (
          <div className="mini-map-overlay">
            <button className="mini-map-close" onClick={() => { setMiniMapVisible(false); try { if (miniMapInstanceRef.current) { miniMapInstanceRef.current.remove(); miniMapInstanceRef.current = null } } catch (e) {} }}>Close</button>
            <div ref={miniMapContainerRef} className="mini-map" />
          </div>
        )}
      </div>
    </div>
  )
}
