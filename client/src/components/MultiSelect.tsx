/** MultiSelect — sélection avec tags, recherche et menu déroulant. */

import { useState, useRef, useEffect } from 'react'

interface Option {
  id: number
  name: string
}

interface MultiSelectProps {
  options: Option[]
  selected: number[]
  onChange: (ids: number[]) => void
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  label?: string
  required?: boolean
  error?: string
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Sélectionner...',
  loading = false,
  disabled = false,
  label,
  required = false,
  error,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  // Fermer au clic extérieur
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Filtrer les options par recherche
  const filtered = options.filter((opt) =>
    opt.name.toLowerCase().includes(query.toLowerCase()),
  )

  const toggle = (id: number) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const removeTag = (id: number) => {
    onChange(selected.filter((s) => s !== id))
  }

  const selectedNames = options
    .filter((opt) => selected.includes(opt.id))
    .map((opt) => opt.name)

  return (
    <div className="relative" ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary mb-1">
          {label}
          {required && ' *'}
        </label>
      )}

      {/* Bouton d'ouverture */}
      <button
        type="button"
        onClick={() => { if (!disabled && !loading) setOpen(!open) }}
        disabled={disabled || loading}
        className="input text-left flex items-center gap-2 min-h-[42px] h-auto py-2 flex-wrap"
      >
        {selected.length === 0 ? (
          <span className="text-muted/50">{loading ? 'Chargement...' : placeholder}</span>
        ) : (
          selectedNames.map((name) => (
            <span
              key={name}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-neon-cyan/10 text-neon-cyan text-xs font-medium border border-neon-cyan/20"
            >
              {name}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  const id = options.find((o) => o.name === name)?.id
                  if (id) removeTag(id)
                }}
                className="hover:text-white transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))
        )}
        <svg className={`w-4 h-4 ml-auto text-muted/50 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {error && <p className="text-xs text-rose-accent mt-1">{error}</p>}

      {/* Menu déroulant */}
      {open && (
        <div className="absolute z-50 mt-1 w-full glass-card p-2 max-h-60 overflow-y-auto animate-fade-in">
          {/* Recherche */}
          <div className="relative mb-2">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-muted/50 outline-none focus:border-neon-cyan/40 transition-colors"
              placeholder="Rechercher..."
              autoFocus
            />
          </div>

          {/* Options */}
          {filtered.length === 0 ? (
            <p className="text-xs text-muted/50 text-center py-4">Aucun résultat</p>
          ) : (
            <div className="space-y-0.5">
              {filtered.map((opt) => {
                const isSelected = selected.includes(opt.id)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors ${
                      isSelected
                        ? 'bg-neon-cyan/10 text-white'
                        : 'text-text-secondary hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'bg-neon-cyan border-neon-cyan'
                        : 'border-white/20'
                    }`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-deep-space" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                    {opt.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Compteur */}
          {selected.length > 0 && (
            <div className="mt-2 pt-2 border-t border-white/5 text-xs text-muted/50 text-center">
              {selected.length} sélectionné{selected.length > 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
