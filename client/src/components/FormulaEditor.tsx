/** Barre d'outils formule + aperçu LaTeX en direct (mode étudiant).
 *
 * Intégré aux textareas de l'épreuve pour faciliter la saisie de formules
 * mathématiques sans connaître LaTeX.
 *
 * Utilise KaTeX pour le rendu en temps réel.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import DOMPurify from 'dompurify'
import katex from 'katex'

interface FormulaEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Groupes de boutons pour la palette de symboles */
const MATH_BUTTONS = [
  {
    label: 'Fractions',
    buttons: [
      { latex: '\\frac{}{}', label: 'a/b', desc: 'Fraction' },
      { latex: '\\frac{d}{dx}', label: 'dy/dx', desc: 'Dérivée' },
    ],
  },
  {
    label: 'Exposants/Indices',
    buttons: [
      { latex: '^{}', label: 'x²', desc: 'Exposant' },
      { latex: '_{}', label: 'x₂', desc: 'Indice' },
      { latex: '_{}^{}', label: 'ₐᵇ', desc: 'Indice+Exposant' },
    ],
  },
  {
    label: 'Racines',
    buttons: [
      { latex: '\\sqrt{}', label: '√', desc: 'Racine carrée' },
      { latex: '\\sqrt[]{}', label: '∛', desc: 'Racine n-ième' },
    ],
  },
  {
    label: 'Sommes/Produits',
    buttons: [
      { latex: '\\sum_{i=1}^{n}', label: 'Σ', desc: 'Somme' },
      { latex: '\\prod_{i=1}^{n}', label: 'Π', desc: 'Produit' },
      { latex: '\\int_{a}^{b}', label: '∫', desc: 'Intégrale' },
    ],
  },
  {
    label: 'Symboles grecs',
    buttons: [
      { latex: '\\alpha', label: 'α', desc: 'Alpha' },
      { latex: '\\beta', label: 'β', desc: 'Bêta' },
      { latex: '\\gamma', label: 'γ', desc: 'Gamma' },
      { latex: '\\theta', label: 'θ', desc: 'Thêta' },
      { latex: '\\pi', label: 'π', desc: 'Pi' },
      { latex: '\\omega', label: 'ω', desc: 'Oméga' },
      { latex: '\\Delta', label: 'Δ', desc: 'Delta maj.' },
    ],
  },
  {
    label: 'Opérateurs',
    buttons: [
      { latex: '\\lim_{x \\to \\infty}', label: 'lim', desc: 'Limite' },
      { latex: '\\to', label: '→', desc: 'Flèche' },
      { latex: '\\infty', label: '∞', desc: 'Infini' },
      { latex: '\\approx', label: '≈', desc: 'Approximatif' },
      { latex: '\\neq', label: '≠', desc: 'Différent de' },
      { latex: '\\pm', label: '±', desc: 'Plus ou moins' },
      { latex: '\\times', label: '×', desc: 'Multiplication' },
      { latex: '\\div', label: '÷', desc: 'Division' },
    ],
  },
  {
    label: 'Ensembles',
    buttons: [
      { latex: '\\mathbb{N}', label: 'ℕ', desc: 'Naturels' },
      { latex: '\\mathbb{Z}', label: 'ℤ', desc: 'Entiers' },
      { latex: '\\mathbb{Q}', label: 'ℚ', desc: 'Rationnels' },
      { latex: '\\mathbb{R}', label: 'ℝ', desc: 'Réels' },
      { latex: '\\mathbb{C}', label: 'ℂ', desc: 'Complexes' },
      { latex: '\\in', label: '∈', desc: 'Appartient à' },
      { latex: '\\subset', label: '⊂', desc: 'Sous-ensemble' },
    ],
  },
  {
    label: 'Délimiteurs',
    buttons: [
      { latex: '\\left( \\right)', label: '( )', desc: 'Parenthèses' },
      { latex: '\\left[ \\right]', label: '[ ]', desc: 'Crochets' },
      { latex: '\\left\\{ \\right\\}', label: '{ }', desc: 'Accolades' },
      { latex: '\\begin{cases} \\end{cases}', label: 'cas', desc: 'Système' },
    ],
  },
]

export function FormulaEditor({ value, onChange, placeholder }: FormulaEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showToolbar, setShowToolbar] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  /** Insère du LaTeX au curseur dans le textarea */
  const insertLatex = useCallback((latex: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = value

    // Si du texte est sélectionné, l'utiliser comme contenu des accolades
    const selected = text.substring(start, end)
    let insert = latex
    if (selected) {
      // Remplacer la première paire {} vide par la sélection
      insert = latex.replace(/\{\}/, `{${selected}}`)
    }

    const newValue = text.substring(0, start) + insert + text.substring(end)
    onChange(newValue)

    // Repositionner le curseur après l'insertion
    setTimeout(() => {
      ta.focus()
      const cursorPos = start + insert.length
      ta.setSelectionRange(cursorPos, cursorPos)
    }, 0)
  }, [value, onChange])

  /** Extraire les formules LaTeX du texte pour la prévisualisation */
  const extractLatex = (text: string): string[] => {
    const formulas: string[] = []
    // Cherche les motifs inline $...$ et display \[...\]
    const inlineRegex = /\$(.+?)\$/g
    const displayRegex = /\\\[(.+?)\\\]/g

    let match
    while ((match = displayRegex.exec(text)) !== null) {
      formulas.push(match[1].trim())
    }
    while ((match = inlineRegex.exec(text)) !== null) {
      formulas.push(match[1].trim())
    }

    // Aussi chercher les commandes LaTeX sans délimiteurs (frac, sqrt, sum, int, etc.)
    const cmdRegex = /(\\\\?[a-zA-Z]+(?:\\{[^}]*\\})?)/g
    while ((match = cmdRegex.exec(text)) !== null) {
      const cmd = match[1].trim()
      if (/\\\\?frac|sqrt|sum|int|prod|lim|alpha|beta|gamma|theta|pi|omega|Delta|mathbb|left|right|begin|to|infty|approx|neq|pm|times|div|subset|in/.test(cmd) && !formulas.includes(cmd.replace(/\\/g, ''))) {
        // Ne pas ajouter les commandes déjà capturées dans les délimiteurs
      }
    }

    return formulas
  }

  /** Rendu d'une formule LaTeX via KaTeX */
  const renderLatex = (formula: string): string => {
    try {
      return katex.renderToString(formula, {
        throwOnError: false,
        displayMode: formula.length > 20,
        output: 'html',
      })
    } catch {
      return `<span class="text-rose-400 text-xs">⚠️ ${DOMPurify.sanitize(formula)}</span>`
    }
  }

  const formulas = showPreview ? extractLatex(value) : []

  return (
    <div className="space-y-2">
      {/* Bouton toggle barre d'outils */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowToolbar(!showToolbar)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            showToolbar
              ? 'bg-violet-iq/10 border-violet-iq/30 text-violet-iq'
              : 'bg-white/5 border-white/10 text-muted/60 hover:text-white hover:border-white/20'
          }`}
        >
          <span className="font-serif italic text-sm">Σ</span>
          {showToolbar ? 'Masquer les symboles' : 'Insérer un symbole mathématique'}
        </button>
        {formulas.length > 0 && (
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs text-muted/50 hover:text-white transition-colors"
          >
            {showPreview ? 'Masquer l\'aperçu' : 'Afficher l\'aperçu'}
          </button>
        )}
      </div>

      {/* Palette de symboles */}
      {showToolbar && (
        <div className="bg-midnight/80 rounded-xl border border-white/10 p-3 animate-fade-in space-y-2">
          {MATH_BUTTONS.map((group) => (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => setActiveGroup(activeGroup === group.label ? null : group.label)}
                className="text-[10px] text-muted/50 uppercase tracking-wider font-medium hover:text-white transition-colors"
              >
                {activeGroup === group.label ? '▼ ' : '▶ '}{group.label}
              </button>
              {activeGroup === group.label && (
                <div className="flex flex-wrap gap-1 mt-1 mb-2">
                  {group.buttons.map((btn) => (
                    <button
                      key={btn.latex}
                      type="button"
                      onClick={() => insertLatex(btn.latex)}
                      title={btn.desc}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-white/5 hover:bg-violet-iq/10 hover:text-violet-iq border border-white/10 hover:border-violet-iq/30 transition-all"
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || 'Rédigez votre réponse ici...'}
        className="input w-full h-32 text-sm resize-y font-mono"
      />

      {/* Aperçu des formules en direct */}
      {showPreview && formulas.length > 0 && (
        <div className="bg-deep-space/60 rounded-xl border border-white/10 p-4 space-y-3 animate-fade-in">
          <p className="text-[10px] text-muted/50 uppercase tracking-wider font-medium">Aperçu des formules</p>
          {formulas.map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-[10px] text-muted/30 font-mono mt-1">{i + 1}.</span>
              <div
                className="text-white/90 overflow-x-auto py-1"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderLatex(f)) }}
              />
            </div>
          ))}
          <p className="text-[10px] text-muted/30 italic">
            Utilisez $...$ pour une formule inline et \[...\] pour une formule en display.
          </p>
        </div>
      )}
    </div>
  )
}

export default FormulaEditor
