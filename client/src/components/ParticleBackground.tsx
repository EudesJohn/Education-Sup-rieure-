/** ParticleBackground — Toile de fond animée 3D avec symboles scientifiques.
 *
 *  Affiche des symboles mathématiques, informatiques et scientifiques
 *  flottant dans l'espace avec rotation 3D, effet de parallaxe à la souris,
 *  et profondeur de champ. Performance optimisée avec Canvas 2D.
 *
 *  Utilisation :
 *    <ParticleBackground />                     → couvre tout l'écran
 *    <ParticleBackground density={60} />         → densité custom
 *    <ParticleBackground speed={0.5} />          → vitesse ralentie
 */

import { useEffect, useRef, useCallback } from 'react'

// ─── Symboles par catégorie ──────────────────────────────────────────────

const SYMBOLS_MATH = ['∑', '∫', 'π', '√', '∞', '∂', '∆', '≈', '≠', '≤', '≥', '±', '×', '÷', 'θ', 'φ', 'λ', 'Ψ', 'Ω', 'α', 'β', 'γ']
const SYMBOLS_CS = ['</>', '{ }', '=>', '&&', '||', '!=', '#', '!', '?', ':=', '::', '->', '++', '--']
const SYMBOLS_SCIENCE = ['⚛', '🧬', '🔬', '📡', '💡']

// Fusion + poids pour varier l'apparition
const ALL_SYMBOLS = [
  ...SYMBOLS_MATH.map(s => ({ s, weight: 2 })),      // maths : fréquent
  ...SYMBOLS_CS.map(s => ({ s, weight: 1.5 })),       // info : moyen
  ...SYMBOLS_SCIENCE.map(s => ({ s, weight: 1 })),    // science : rare
]

// Palette de couleurs pour les symboles
const COLORS = [
  '06F2DB', // neon cyan
  '8B5CF6', // violet iq
  'F59E0B', // amber iq
  '0EA5E9', // blue
  '10B981', // emerald
  'F43F5E', // rose
]

// ─── Types Particules ────────────────────────────────────────────────────

interface Particle {
  x: number
  y: number
  z: number            // profondeur (0-1) : 0 = loin, 1 = près
  symbol: string
  color: string
  size: number
  opacity: number
  vx: number
  vy: number
  rotation: number
  rotationSpeed: number
  phase: number        // décalage sinusoïdal pour float
}

// ─── Props ───────────────────────────────────────────────────────────────

interface ParticleBackgroundProps {
  density?: number      // nombre de particules (défaut: 45)
  speed?: number        // multiplicateur de vitesse (défaut: 1)
  interactive?: boolean // parallaxe souris (défaut: true)
  className?: string
}

// ─── Helper : tirage pondéré ─────────────────────────────────────────────

function weightedRandom(items: { s: string; weight: number }[]): string {
  const total = items.reduce((acc, item) => acc + item.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item.s
  }
  return items[0].s
}

// ─── Helper : random entre min et max ────────────────────────────────────

const rand = (min: number, max: number) => Math.random() * (max - min) + min

// ─── Composant ───────────────────────────────────────────────────────────

export function ParticleBackground({
  density = 45,
  speed = 1,
  interactive = true,
  className = '',
}: ParticleBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const particlesRef = useRef<Particle[]>([])
  const rafRef = useRef<number>(0)
  const timeRef = useRef(0)
  const dimensionsRef = useRef({ w: 0, h: 0 })

  // Initialisation des particules
  const initParticles = useCallback((w: number, h: number) => {
    const count = Math.min(density, 120) // cap performance
    particlesRef.current = Array.from({ length: count }, () => ({
      x: rand(0, w),
      y: rand(0, h),
      z: rand(0.2, 1),
      symbol: weightedRandom(ALL_SYMBOLS),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: rand(10, 28),
      opacity: rand(0.02, 0.08),
      vx: rand(-0.15, 0.15) * speed,
      vy: rand(-0.08, 0.08) * speed,
      rotation: rand(0, Math.PI * 2),
      rotationSpeed: rand(-0.005, 0.005) * speed,
      phase: rand(0, Math.PI * 2),
    }))
  }, [density, speed])

  // Gestion du redimensionnement
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      dimensionsRef.current = { w, h }

      // Réinitialiser les particules si la taille change
      if (particlesRef.current.length === 0) {
        initParticles(w, h)
      }
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [initParticles])

  // Mouse tracking
  useEffect(() => {
    if (!interactive) return

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = {
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      }
    }

    window.addEventListener('mousemove', handleMouse)
    return () => window.removeEventListener('mousemove', handleMouse)
  }, [interactive])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let reducedMotion = false
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion = mq.matches
    mq.addEventListener('change', (e) => { reducedMotion = e.matches })

    const animate = (timestamp: number) => {
      if (reducedMotion) {
        rafRef.current = requestAnimationFrame(animate)
        return
      }

      const dt = Math.min((timestamp - timeRef.current) / 16.67, 3) // normalize to ~60fps, cap
      timeRef.current = timestamp

      const dpr = window.devicePixelRatio || 1
      const { w, h } = dimensionsRef.current
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      // Trier par profondeur pour un effet 3D correct
      const sorted = [...particlesRef.current].sort((a, b) => a.z - b.z)

      for (const p of sorted) {
        // Mouvement
        p.x += p.vx * dt + mx * 0.08 * p.z * dt
        p.y += p.vy * dt + my * 0.06 * p.z * dt

        // Rebond / wrap
        if (p.x < -50) p.x = w + 50
        if (p.x > w + 50) p.x = -50
        if (p.y < -50) p.y = h + 50
        if (p.y > h + 50) p.y = -50

        // Rotation
        p.rotation += p.rotationSpeed * dt

        // Profondeur : scaling et opacité
        const scale = 0.5 + p.z * 0.6
        const alpha = p.opacity * (0.3 + p.z * 0.7)
        const size = p.size * scale

        // Flottement sinusoïdal subtil
        const floatY = Math.sin(timestamp * 0.001 * 0.5 + p.phase) * 3 * p.z

        ctx.save()
        ctx.translate(p.x * dpr, (p.y + floatY) * dpr)
        ctx.rotate(p.rotation)
        ctx.globalAlpha = alpha

        ctx.font = `${Math.round(size * dpr)}px "JetBrains Mono", monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = `#${p.color}`

        // Glow sur les particules proches
        if (p.z > 0.7) {
          ctx.shadowColor = `#${p.color}`
          ctx.shadowBlur = 8 * dpr
        }

        ctx.fillText(p.symbol, 0, 0)
        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    timeRef.current = performance.now()
    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none z-0 particle-canvas ${className}`}
      aria-hidden="true"
    />
  )
}
