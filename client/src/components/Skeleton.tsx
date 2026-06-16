/** Skeleton — Loader visuel style PEAN (shimmer).
 *  Utilise l'animation `.shimmer` déjà définie dans index.css */

interface SkeletonProps {
  className?: string
  /** Nombre de lignes (pour les textes) */
  lines?: number
  /** Type prédéfini */
  variant?: 'card' | 'text' | 'table-row' | 'stat'
}

export function Skeleton({ className = '', variant, lines = 3 }: SkeletonProps) {
  if (variant === 'stat') {
    return (
      <div className={`card p-4 ${className}`}>
        <div className="shimmer h-3 w-20 rounded mb-3" />
        <div className="shimmer h-8 w-16 rounded" />
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={`card-plain p-5 ${className}`}>
        <div className="shimmer h-4 w-3/4 rounded mb-4" />
        <div className="space-y-2">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="shimmer h-3 w-full rounded" style={{ width: `${85 - i * 15}%` }} />
          ))}
        </div>
      </div>
    )
  }

  if (variant === 'table-row') {
    return (
      <div className={`flex items-center gap-4 px-5 py-4 ${className}`}>
        <div className="shimmer h-4 w-8 rounded" />
        <div className="shimmer h-4 w-1/3 rounded" />
        <div className="shimmer h-4 w-1/4 rounded ml-auto" />
        <div className="shimmer h-6 w-16 rounded ml-auto" />
      </div>
    )
  }

  // Texte simple
  if (lines > 1) {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="shimmer h-3 rounded" style={{ width: `${95 - i * 10}%` }} />
        ))}
      </div>
    )
  }

  return <div className={`shimmer rounded ${className}`} />
}

/** Bloc de chargement pour liste admin — remplace "Chargement..." text */
export function AdminListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-white/5">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} variant="table-row" />
      ))}
    </div>
  )
}
