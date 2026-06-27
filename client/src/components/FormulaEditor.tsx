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
      { latex: '\\frac{a}{b}', label: 'a/b', desc: 'Fraction' },
      { latex: '\\frac{d}{dx}', label: 'dy/dx', desc: 'Dérivée' },
    ],
  },
  {
    label: 'Exposants/Indices',
    buttons: [
      { latex: 'x^{n}', label: 'x²', desc: 'Exposant' },
      { latex: 'x_{n}', label: 'x₂', desc: 'Indice' },
      { latex: 'x_{i}^{j}', label: 'ₐᵇ', desc: 'Indice+Exposant' },
    ],
  },
  {
    label: 'Racines',
    buttons: [
      { latex: '\\sqrt{x}', label: '√', desc: 'Racine carrée' },
      { latex: '\\sqrt[n]{x}', label: '∛', desc: 'Racine n-ième' },
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
      { latex: '\\begin{cases} x \\\\ y \\end{cases}', label: 'cas', desc: 'Système' },
    ],
  },
]

/** Formules prédéfinies affichées en barre rapide (toujours visible) */
const QUICK_FORMULAS = [
  { latex: '\\frac{a}{b}', preview: 'a/b' },
  { latex: 'x^{n}', preview: 'xⁿ' },
  { latex: '\\sqrt{x}', preview: '√x' },
  { latex: '\\sqrt[n]{x}', preview: 'ⁿ√x' },
  { latex: '\\sum_{i=1}^{n}', preview: 'Σ' },
  { latex: '\\int_{a}^{b}', preview: '∫' },
  { latex: '\\pi', preview: 'π' },
  { latex: '\\alpha', preview: 'α' },
  { latex: '\\beta', preview: 'β' },
  { latex: '\\theta', preview: 'θ' },
  { latex: '\\infty', preview: '∞' },
  { latex: '\\to', preview: '→' },
  { latex: '\\neq', preview: '≠' },
  { latex: '\\approx', preview: '≈' },
  { latex: '\\left( \\right)', preview: '( )' },
  { latex: '\\begin{cases} \\end{cases}', preview: '{…' },
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

    // Repositionner le curseur dans la première paire de {} ou à la fin
    setTimeout(() => {
      ta.focus()
      // Chercher le premier placeholder ({a}, {b}, {n}, {x}, {i}) pour y placer le curseur
      let cursorPos = start + insert.length
      const placeholderMatch = insert.match(/\{([a-z])\}/)
      if (placeholderMatch) {
        const placeholderOffset = insert.indexOf(placeholderMatch[0])
        cursorPos = start + placeholderOffset + 1  // à l'intérieur des {}
      }
      ta.setSelectionRange(cursorPos, cursorPos)
    }, 0)
  }, [value, onChange])

  /** Préparer le contenu à rendre : extrait $...$ ou tente de rendre tout le texte */
  const getPreviewContent = useCallback((text: string): { formulas: string[]; fullPreview: string | null } => {
    const result: string[] = []
    let fullPreview: string | null = null

    if (!text.trim()) return { formulas: [], fullPreview: null }

    // Chercher les motifs $...$ et \[...\]
    const inlineRegex = /\$(.+?)\$/g
    const displayRegex = /\\\[(.+?)\\\]/g

    let match
    while ((match = displayRegex.exec(text)) !== null) {
      result.push(match[1].trim())
    }
    while ((match = inlineRegex.exec(text)) !== null) {
      result.push(match[1].trim())
    }

    // Si aucun délimiteur trouvé, tenter de rendre tout le texte comme une formule
    if (result.length === 0) {
      try {
        katex.renderToString(text.trim(), { throwOnError: true, displayMode: false })
        // Si pas d'erreur, le texte est une formule LaTeX valide
        fullPreview = text.trim()
      } catch {
        // Vérifier si le texte contient au moins une commande LaTeX (\frac, \sqrt, etc.)
        if (/\\[a-zA-Z]+/.test(text)) {
          fullPreview = text.trim()
        }
      }
    }

    return { formulas: result, fullPreview }
  }, [])

  /** Rendu d'une formule LaTeX via KaTeX */
  const renderLatex = (formula: string, displayMode?: boolean): string => {
    try {
      return katex.renderToString(formula, {
        throwOnError: false,
        displayMode: displayMode ?? formula.length > 20,
        output: 'html',
      })
    } catch {
      return `<span class="text-rose-400 text-xs">⚠️ ${DOMPurify.sanitize(formula)}</span>`
    }
  }

  const preview = showPreview ? getPreviewContent(value) : { formulas: [], fullPreview: null }
  const hasPreviewContent = preview.formulas.length > 0 || preview.fullPreview

  return (
    <div className="space-y-2">
      {/* Barre d'outils */}
      <div className="flex items-center gap-2 flex-wrap">
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
          {showToolbar ? 'Masquer' : 'Symboles'}
        </button>
        <button
          type="button"
          onClick={() => setShowPreview(!showPreview)}
          className={`text-xs px-2.5 py-1.5 rounded-lg transition-all border ${
            showPreview
              ? 'bg-neon-cyan/5 border-neon-cyan/15 text-neon-cyan/80'
              : 'text-muted/50 hover:text-white border-transparent'
          }`}
        >
          {showPreview ? 'Aperçu ✓' : 'Aperçu'}
        </button>
        <span className="text-[10px] text-muted/30 italic">
          Cliquez une formule → modifiez les lettres (a, b, n, x...)
        </span>
      </div>

      {/* Formules rapides (toujours visibles) */}
      <div className="flex flex-wrap gap-1">
        {QUICK_FORMULAS.map((f) => (
          <button
            key={f.latex}
            type="button"
            onClick={() => insertLatex(f.latex)}
            title={f.latex}
            className="px-2 py-1 rounded-lg text-xs font-serif bg-white/5 hover:bg-violet-iq/10 hover:text-violet-iq border border-white/10 hover:border-violet-iq/30 transition-all"
          >
            {f.preview}
          </button>
        ))}
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

      {/* Aperçu en direct */}
      {showPreview && hasPreviewContent && (
        <div className="bg-deep-space/60 rounded-xl border border-white/10 p-4 space-y-3 animate-fade-in">
          <p className="text-[10px] text-muted/50 uppercase tracking-wider font-medium">
            Aperçu des formules
            {preview.fullPreview && <span className="ml-2 normal-case text-muted/30">(rendu automatique)</span>}
          </p>
          {preview.fullPreview && (
            <div className="flex items-start gap-3">
              <span className="text-[10px] text-muted/30 font-mono mt-1">▶</span>
              <div
                className="text-white/90 overflow-x-auto py-2"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderLatex(preview.fullPreview, true)) }}
              />
            </div>
          )}
          {preview.formulas.map((f, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-[10px] text-muted/30 font-mono mt-1">{i + 1}.</span>
              <div
                className="text-white/90 overflow-x-auto py-1"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderLatex(f)) }}
              />
            </div>
          ))}
          {!preview.fullPreview && preview.formulas.length > 0 && (
            <p className="text-[10px] text-muted/30 italic">
              Utilisez $...$ pour une formule inline et \[...\] pour une formule en display.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default FormulaEditor
