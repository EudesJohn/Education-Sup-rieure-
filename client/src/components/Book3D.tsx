/** Book3D — Livre 3D animé avec suivi de matière.
 *
 *  Affiche un livre en 3D (CSS transforms) dont la couverture et les
 *  particules changent selon la matière. Auto-cycle ou pilotable.
 *
 *  Utilisation :
 *    <Book3D />                    → auto-cycle matières
 *    <Book3D subject="math" />     → matière fixe
 *    <Book3D className="..." />    → classes additionnelles
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SubjectConfig {
  id: string
  name: string
  icon: string
  symbols: string[]
  accent: string
  accentRgb: string
  description: string
  coverGradient: string
}

// ─── Config matières ────────────────────────────────────────────────────────

const SUBJECTS: SubjectConfig[] = [
  {
    id: 'math',
    name: 'Mathématiques',
    icon: 'Σ',
    symbols: ['∫', 'π', '∞', '√', '∂', 'Δ', 'θ', 'λ', '≤', '≥'],
    accent: '#C89838',
    accentRgb: '200, 152, 56',
    description: 'Calcul • Algèbre • Géométrie',
    coverGradient: 'linear-gradient(135deg, #C89838 0%, #A67B2E 40%, #8B6525 100%)',
  },
  {
    id: 'algo',
    name: 'Algorithmique',
    icon: '< / >',
    symbols: ['{', '}', '=>', '&&', '||', '!=', '===', '->', '++', '#' ],
    accent: '#4A8C6F',
    accentRgb: '74, 140, 111',
    description: 'Python • Java • C • JavaScript',
    coverGradient: 'linear-gradient(135deg, #2D6A4F 0%, #4A8C6F 40%, #6BB28C 100%)',
  },
  {
    id: 'physics',
    name: 'Physique',
    icon: '⚛',
    symbols: ['Ψ', 'λ', 'ν', 'ε₀', 'μ₀', 'ħ', '∇', '∫', 'α', 'β'],
    accent: '#38BDF8',
    accentRgb: '56, 189, 248',
    description: 'Mécanique • Thermodynamique • Électromagnétisme',
    coverGradient: 'linear-gradient(135deg, #0E7490 0%, #38BDF8 40%, #7DD3FC 100%)',
  },
  {
    id: 'literature',
    name: 'Littérature',
    icon: '✍',
    symbols: ['«', '»', '—', '…', '·', '¶', '§', 'œ', 'à', 'é'],
    accent: '#F43F5E',
    accentRgb: '244, 63, 94',
    description: 'Français • Philosophie • Poésie',
    coverGradient: 'linear-gradient(135deg, #BE185D 0%, #F43F5E 40%, #FB7185 100%)',
  },
]

const PARTICLE_COUNT = 8
const CYCLE_MS = 30000
const OPEN_DURATION_MS = 1200
const CLOSE_DURATION_MS = 700

// ─── Props ──────────────────────────────────────────────────────────────────

interface Book3DProps {
  subject?: string
  className?: string
}

// ─── Composant ──────────────────────────────────────────────────────────────

export function Book3D({ subject, className = '' }: Book3DProps) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [showContent, setShowContent] = useState(false)
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)
  const [hasInteracted, setHasInteracted] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [pageOffset, setPageOffset] = useState(0) // for page flip animation
  const containerRef = useRef<HTMLDivElement>(null)
  const cycleRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  // Détecter prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Sujet actuel
  const currentSubject = subject
    ? SUBJECTS.find((s) => s.id === subject) || SUBJECTS[0]
    : SUBJECTS[currentIdx]

  // Ouverture initiale
  useEffect(() => {
    if (reducedMotion) {
      setIsOpen(true)
      setShowContent(true)
      return
    }
    const t1 = setTimeout(() => setIsOpen(true), 600)
    const t2 = setTimeout(() => setShowContent(true), 1200)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [reducedMotion])

  // Auto-cycle — livre toujours ouvert, seul le contenu change
  useEffect(() => {
    if (subject || reducedMotion) return
    setIsOpen(true)
    setShowContent(true)
    cycleRef.current = setInterval(() => {
      // Fondu du contenu actuel
      setShowContent(false)
      setTimeout(() => {
        setCurrentIdx((i) => (i + 1) % SUBJECTS.length)
        setTimeout(() => setShowContent(true), 400)
      }, 500)
    }, CYCLE_MS)
    return () => clearInterval(cycleRef.current)
  }, [subject, reducedMotion])

  // Mouse tracking
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || reducedMotion) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2
    setMouseX(x)
    setMouseY(y)
    if (!hasInteracted) setHasInteracted(true)
  }, [reducedMotion, hasInteracted])

  const handleMouseLeave = useCallback(() => {
    setMouseX(0)
    setMouseY(0)
    setHasInteracted(false)
  }, [])

  // Click pour changer de sujet
  const handleClick = useCallback(() => {
    if (reducedMotion) {
      setCurrentIdx((i) => (i + 1) % SUBJECTS.length)
      return
    }
    setShowContent(false)
    setTimeout(() => {
      setCurrentIdx((i) => (i + 1) % SUBJECTS.length)
      setTimeout(() => setShowContent(true), 400)
    }, 500)
  }, [reducedMotion])

  // Degré d'ouverture pour la couverture
  const coverRotateY = isOpen ? -165 : 0

  // Animation reduced-motion : pas de transitions
  const animDuration = reducedMotion ? 0 : undefined

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full flex items-center justify-center overflow-hidden select-none ${className}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label="Changer de matière"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick() }}
    >
      {/* Ambiance glow */}
      <div
        className="absolute rounded-full blur-3xl transition-all duration-1000 ease-out pointer-events-none"
        style={{
          width: reducedMotion ? 0 : 420,
          height: reducedMotion ? 0 : 420,
          background: `radial-gradient(circle, rgba(${currentSubject.accentRgb}, 0.15), transparent 70%)`,
          transform: `translate(${mouseX * 15}px, ${mouseY * 15}px)`,
        }}
      />

      {/* === 3D BOOK === */}
      <div
        className="relative"
        style={{
          perspective: reducedMotion ? 'none' : '1400px',
          width: 260,
          height: 340,
        }}
      >
        <div
          className="relative w-full h-full"
          style={{
            transformStyle: 'preserve-3d',
            transform: reducedMotion
              ? 'none'
              : `rotateX(${12 - mouseY * 6}deg) rotateY(${mouseX * 8}deg)`,
            transition: hasInteracted ? 'transform 0.15s ease-out' : 'transform 1s ease-out',
          }}
        >
          {/* ====== BACK COVER ====== */}
          <div
            className="absolute rounded-r-sm"
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#0A1A14',
              border: '1px solid rgba(200, 152, 56, 0.15)',
              transform: 'translateZ(-18px)',
              borderRadius: '2px 6px 6px 2px',
            }}
          />

          {/* ====== SPINE ====== */}
          <div
            className="absolute left-0 top-0 rounded-l-sm"
            style={{
              width: 16,
              height: '100%',
              backgroundColor: '#0D221C',
              borderRight: '1px solid rgba(200, 152, 56, 0.12)',
              transform: 'translateZ(-8px)',
              borderRadius: '3px 0 0 3px',
            }}
          />

          {/* ====== PAGE STACK (visible sur la tranche droite) ====== */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={`page-${i}`}
              className="absolute"
              style={{
                width: '100%',
                height: '100%',
                backgroundColor: `hsl(40, 15%, ${88 - i * 1.5}%)`,
                transform: `translateZ(${-14 + i * 0.8}px) translateX(${i * 0.2}px) translateY(${i * 0.15}px)`,
                borderRadius: '0 4px 4px 0',
                borderRight: '1px solid rgba(0,0,0,0.06)',
                boxShadow: i === 11 ? 'none' : undefined,
              }}
            />
          ))}

          {/* ====== INTERIOR (contenu visible quand le livre est ouvert) ====== */}
          <div
            className="absolute flex flex-col items-center justify-center"
            style={{
              width: '100%',
              height: '100%',
              backgroundColor: '#F7F4EE',
              transform: 'translateZ(-3px)',
              borderRadius: '0 6px 6px 0',
              boxShadow: 'inset 0 0 40px rgba(0,0,0,0.06)',
              transition: `opacity ${reducedMotion ? 0 : 400}ms ease`,
              opacity: showContent ? 1 : 0,
            }}
          >
            {/* Icône sujet */}
            <div
              className="flex items-center justify-center rounded-full mb-4"
              style={{
                width: 64,
                height: 64,
                backgroundColor: `${currentSubject.accent}15`,
                border: `2px solid ${currentSubject.accent}30`,
                fontSize: 26,
                fontWeight: 700,
                color: currentSubject.accent,
                fontFamily: '"Fraunces", serif',
                transition: `all ${reducedMotion ? 0 : 600}ms ease`,
              }}
            >
              {currentSubject.icon}
            </div>

            {/* Nom matière */}
            <h3
              className="font-heading font-semibold text-center mb-1"
              style={{
                fontSize: 22,
                color: '#0A1A14',
                letterSpacing: '-0.01em',
                transition: `all ${reducedMotion ? 0 : 600}ms ease`,
              }}
            >
              {currentSubject.name}
            </h3>

            {/* Description */}
            <p
              className="text-xs text-center"
              style={{
                color: '#5C5346',
                fontFamily: '"Inter", sans-serif',
                transition: `all ${reducedMotion ? 0 : 600}ms ease`,
              }}
            >
              {currentSubject.description}
            </p>

            {/* Symboles décoratifs */}
            <div className="flex gap-2.5 mt-5 flex-wrap justify-center px-4">
              {currentSubject.symbols.slice(0, 5).map((sym, i) => (
                <span
                  key={`sym-${i}`}
                  className="font-mono font-bold opacity-70"
                  style={{
                    fontSize: 15,
                    color: currentSubject.accent,
                    transition: `all ${reducedMotion ? 0 : 600}ms ease ${i * 50}ms`,
                  }}
                >
                  {sym}
                </span>
              ))}
            </div>
          </div>

          {/* ====== FRONT COVER (s'ouvre/se ferme avec rotateY) ====== */}
          <div
            className="absolute top-0 left-0 cursor-pointer"
            style={{
              width: '100%',
              height: '100%',
              transformOrigin: 'left center',
              transform: `translateZ(-2px) rotateY(${coverRotateY}deg)`,
              transition: reducedMotion
                ? 'none'
                : `transform ${OPEN_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
              borderRadius: '2px 6px 6px 2px',
              backfaceVisibility: 'hidden',
            }}
          >
            {/* Couverture avant avec dégradé */}
            <div
              className="absolute inset-0 rounded-r-sm"
              style={{
                background: currentSubject.coverGradient,
                borderRadius: '2px 6px 6px 2px',
                boxShadow: `
                  inset 0 1px 0 rgba(255,255,255,0.15),
                  0 4px 20px rgba(0,0,0,0.3)
                `,
                border: '1px solid rgba(0,0,0,0.2)',
              }}
            />

            {/* Motif doré subtil */}
            <div
              className="absolute inset-0 opacity-[0.07] rounded-r-sm"
              style={{
                backgroundImage:
                  'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,215,0,0.3) 4px, rgba(255,215,0,0.3) 5px)',
                borderRadius: '2px 6px 6px 2px',
              }}
            />

            {/* Contenu de la couverture */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
              {/* Filet doré haut */}
              <div
                className="w-3/4 h-px mb-5"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.4), transparent)' }}
              />

              <div
                className="flex items-center justify-center rounded-full mb-3"
                style={{
                  width: 56,
                  height: 56,
                  backgroundColor: 'rgba(255,255,255,0.12)',
                  border: '1.5px solid rgba(255,215,0,0.3)',
                  fontSize: 22,
                  fontWeight: 700,
                  color: '#E8D5A0',
                  fontFamily: '"Fraunces", serif',
                }}
              >
                {currentSubject.icon}
              </div>

              <h3
                className="font-heading font-bold text-center text-white"
                style={{
                  fontSize: 20,
                  letterSpacing: '-0.01em',
                  textShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              >
                {currentSubject.name}
              </h3>

              {/* Filet doré bas */}
              <div
                className="w-3/4 h-px mt-5"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(255,215,0,0.4), transparent)' }}
              />
            </div>

            {/* Effet de pliure (dos de la couverture visible quand ouverte) */}
            <div
              className="absolute inset-0 rounded-r-sm"
              style={{
                transform: 'rotateY(180deg)',
                backfaceVisibility: 'hidden',
                background: 'linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.15))',
                borderRadius: '2px 6px 6px 2px',
              }}
            />
          </div>
        </div>
      </div>

      {/* === PARTICULES FLOTTANTES === */}
      {!reducedMotion && (
        <div className="absolute inset-0 pointer-events-none">
          {currentSubject.symbols.slice(0, PARTICLE_COUNT).map((symbol, i) => {
            const x = 12 + (i * 11.5) % 76
            const y = 8 + (i * 13.7) % 78
            const delay = i * 0.35
            const duration = 3.5 + (i % 4) * 1.5
            const size = 13 + (i % 5) * 4
            return (
              <div
                key={`${currentSubject.id}-p-${i}`}
                className="absolute font-bold pointer-events-none"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  fontSize: size,
                  color: currentSubject.accent,
                  opacity: 0,
                  animation: `book3d-float ${duration}s ease-in-out ${delay}s infinite`,
                  fontFamily: '"JetBrains Mono", monospace',
                  textShadow: `0 0 6px rgba(${currentSubject.accentRgb}, 0.15)`,
                }}
              >
                {symbol}
              </div>
            )
          })}
        </div>
      )}

      {/* Compteur de matière (bas, centré) */}
      {!subject && (
        <div
          className="absolute bottom-6 flex items-center gap-1.5"
          style={{
            opacity: showContent ? 1 : 0,
            transition: `opacity ${reducedMotion ? 0 : 500}ms ease`,
          }}
        >
          {SUBJECTS.map((s, i) => (
            <div
              key={s.id}
              className="rounded-full transition-all duration-300"
              style={{
                width: i === currentIdx ? 20 : 6,
                height: 6,
                backgroundColor: i === currentIdx ? currentSubject.accent : 'rgba(255,255,255,0.2)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
