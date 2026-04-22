import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
// Load three-globe dynamically at runtime from CDN to avoid Vite import-analysis
// and optional three/webgpu / three/tsl subpath issues during bundling.

export default function ThreeGlobeViewer({ className, onCameraChange, onMarkerClick, showSamples: _showSamples = true }) {
  const containerRef = useRef(null)
  const globeRef = useRef(null)

  useEffect(() => {
    let mounted = true
    const setup = async () => {
      const el = containerRef.current
      if (!el || !mounted) return

      // Dynamically import three-globe from unpkg as an ESM module to avoid Vite
      // resolving its internal optional three subpath imports during dev prebundle.
      let ThreeGlobeModule
      try {
        ThreeGlobeModule = await import('https://unpkg.com/three-globe?module')
      } catch (e) {
        // console.error('Failed to load three-globe from CDN', e)
        return
      }
      const ThreeGlobeCtor = ThreeGlobeModule?.default || ThreeGlobeModule

      // Scene
      const scene = new THREE.Scene()
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
      renderer.setSize(el.clientWidth, el.clientHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      el.appendChild(renderer.domElement)

      // Camera
      const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 1000)
      camera.position.set(0, 0, 300)

      // Controls
      const controls = new OrbitControls(camera, renderer.domElement)
      controls.enableDamping = true
      controls.autoRotate = false
      controls.minDistance = 120
      controls.maxDistance = 600

      // Lights
      const ambient = new THREE.AmbientLight(0xbbbbbb)
      scene.add(ambient)
      const dir = new THREE.DirectionalLight(0xffffff, 0.6)
      dir.position.set(5, 3, 5)
      scene.add(dir)

      // Globe
      const globe = new ThreeGlobeCtor({ waitForGlobeReady: true })
        .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
        .bumpImageUrl('//unpkg.com/three-globe/example/img/earth-topology.png')

      globeRef.current = globe
      scene.add(globe)

      // Handle resize
      const onResize = () => {
        if (!el) return
        const w = el.clientWidth
        const h = el.clientHeight
        renderer.setSize(w, h)
        camera.aspect = w / h
        camera.updateProjectionMatrix()
      }
      window.addEventListener('resize', onResize)

      // Raycaster for clicks
      const raycaster = new THREE.Raycaster()
      const mouse = new THREE.Vector2()

      const onClick = (ev) => {
        const rect = renderer.domElement.getBoundingClientRect()
        mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1
        mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1
        raycaster.setFromCamera(mouse, camera)
        const intersects = raycaster.intersectObject(globe.object3D, true)
        if (intersects.length && typeof onMarkerClick === 'function') {
          onMarkerClick({ point: intersects[0].point, object: intersects[0].object })
        }
      }
      renderer.domElement.addEventListener('click', onClick)

      // Animation loop
      const animate = () => {
        if (!mounted) return
        controls.update()
        renderer.render(scene, camera)
        requestAnimationFrame(animate)
      }
      animate()

      // expose camera periodically
      const cameraTicker = setInterval(() => {
        try {
          const pos = camera.position
          if (typeof onCameraChange === 'function') onCameraChange({ lat: 0, lon: 0, alt: pos.z })
        } catch (e) { void e }
      }, 1000)

      // cleanup
      const cleanup = () => {
        mounted = false
        clearInterval(cameraTicker)
        window.removeEventListener('resize', onResize)
        renderer.domElement.removeEventListener('click', onClick)
        controls.dispose()
        renderer.dispose()
        try { scene.remove(globe) } catch (e) { void e }
        if (el && renderer.domElement.parentNode === el) el.removeChild(renderer.domElement)
      }

      // attach cleanup to outer scope
      ThreeGlobeViewer.__cleanup = cleanup
    }

    setup()

    return () => {
      mounted = false
      if (ThreeGlobeViewer.__cleanup) try { ThreeGlobeViewer.__cleanup() } catch (e) { void e }
    }
  }, [onCameraChange, onMarkerClick])

  return (
    <div ref={containerRef} className={className} style={{ width: '100%', height: '100%', minHeight: 400 }} />
  )
}
