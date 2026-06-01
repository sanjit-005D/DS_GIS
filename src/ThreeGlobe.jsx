import React, { useEffect, useRef } from 'react'
import * as THREE from 'three'
import ThreeGlobeCtor from 'three-globe'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

export default function ThreeGlobeViewer({ className, onCameraChange, onMarkerClick, showSamples: _showSamples = true }) {
  const containerRef = useRef(null)
  const globeRef = useRef(null)

  useEffect(() => {
    let mounted = true
    const setup = async () => {
      const el = containerRef.current
      if (!el || !mounted) return
      const useFallbackGlobe = !ThreeGlobeCtor

      // Scene
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x0b1f33)
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
      const makeFallbackSphere = () => {
        const globeGeometry = new THREE.SphereGeometry(100, 64, 64)
        const globeMaterial = new THREE.MeshPhongMaterial({
          color: 0x2d6aa6,
          shininess: 14,
          emissive: 0x0a2238,
          emissiveIntensity: 0.32
        })
        const mesh = new THREE.Mesh(globeGeometry, globeMaterial)
        try {
          const loader = new THREE.TextureLoader()
          loader.load(
            'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
            (texture) => {
              globeMaterial.map = texture
              globeMaterial.color.setHex(0xffffff)
              globeMaterial.needsUpdate = true
            },
            undefined,
            () => {
              // keep solid-color fallback if texture fetch fails
            }
          )
        } catch (e) { void e }
        return mesh
      }

      let globe
      if (!useFallbackGlobe && ThreeGlobeCtor) {
        try {
          globe = new ThreeGlobeCtor({ waitForGlobeReady: true })
            .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
            .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
        } catch (e) {
          globe = makeFallbackSphere()
        }
      } else {
        globe = makeFallbackSphere()
      }

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
        const target = globe.object3D || globe
        const intersects = raycaster.intersectObject(target, true)
        if (intersects.length && typeof onMarkerClick === 'function') {
          onMarkerClick({ point: intersects[0].point, object: intersects[0].object })
        }
      }
      renderer.domElement.addEventListener('click', onClick)

      // Animation loop
      const animate = () => {
        if (!mounted) return
        if (globe && !globe.object3D) {
          globe.rotation.y += 0.0015
        }
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
