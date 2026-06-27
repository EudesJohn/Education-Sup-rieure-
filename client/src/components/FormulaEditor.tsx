/** Barre d'outils symboles mathématiques réels en direct (mode étudiant).
 *
 * Intégré aux textareas de l'épreuve pour faciliter la saisie de symboles
 * mathématiques réels sans connaître LaTeX.
 */

import { useState, useRef, useEffect, useCallback } from 'react'

interface FormulaEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** Groupes de boutons pour la palette de symboles réels */
const MATH_BUTTONS = [
  {
    label: 'Fractions / Division',
    buttons: [
      { latex: '/', label: 'a/b', desc: 'Fraction (/) / division' },
      { latex: 'dy/dx', label: 'dy/dx', desc: 'Dérivée' },
    ],
  },
  {
    label: 'Exposants / Indices',
    buttons: [
      { latex: '^', label: 'x²', desc: 'Exposant (^)' },
      { latex: '_', label: 'x₂', desc: 'Indice (_)' },
    ],
  },
  {
    label: 'Racines',
    buttons: [
      { latex: '√', label: '√', desc: 'Racine carrée' },
      { latex: '∛', label: '∛', desc: 'Racine cubique' },
    ],
  },
  {
    label: 'Sommes / Produits / Intégrales',
    buttons: [
      { latex: 'Σ', label: 'Σ', desc: 'Somme' },
      { latex: 'Π', label: 'Π', desc: 'Produit' },
      { latex: '∫', label: '∫', desc: 'Intégrale' },
    ],
  },
  {
    label: 'Symboles grecs',
    buttons: [
      { latex: 'α', label: 'α', desc: 'Alpha' },
      { latex: 'β', label: 'β', desc: 'Bêta' },
      { latex: 'γ', label: 'γ', desc: 'Gamma' },
      { latex: 'θ', label: 'θ', desc: 'Thêta' },
      { latex: 'π', label: 'π', desc: 'Pi' },
      { latex: 'ω', label: 'ω', desc: 'Oméga' },
      { latex: 'Δ', label: 'Δ', desc: 'Delta maj.' },
    ],
  },
  {
    label: 'Opérateurs & Logique',
    buttons: [
      { latex: 'lim ', label: 'lim', desc: 'Limite' },
      { latex: '→', label: '→', desc: 'Flèche vers la droite' },
      { latex: '∞', label: '∞', desc: 'Infini' },
      { latex: '≈', label: '≈', desc: 'Approximativement égal' },
      { latex: '≠', label: '≠', desc: 'Différent de' },
      { latex: '±', label: '±', desc: 'Plus ou moins' },
      { latex: '×', label: '×', desc: 'Multiplication' },
      { latex: '÷', label: '÷', desc: 'Division' },
    ],
  },
  {
    label: 'Ensembles',
    buttons: [
      { latex: 'ℕ', label: 'ℕ', desc: 'Entiers naturels' },
      { latex: 'ℤ', label: 'ℤ', desc: 'Entiers relatifs' },
      { latex: 'ℚ', label: 'ℚ', desc: 'Rationnels' },
      { latex: 'ℝ', label: 'ℝ', desc: 'Réels' },
      { latex: 'ℂ', label: 'ℂ', desc: 'Complexes' },
      { latex: '∈', label: '∈', desc: 'Appartient à' },
      { latex: '⊂', label: '⊂', desc: 'Sous-ensemble de' },
    ],
  },
  {
    label: 'Délimiteurs',
    buttons: [
      { latex: '()', label: '( )', desc: 'Parenthèses' },
      { latex: '[]', label: '[ ]', desc: 'Crochets' },
      { latex: '{}', label: '{ }', desc: 'Accolades' },
    ],
  },
]

/** Symboles rapides affichés en barre rapide (toujours visibles) */
const QUICK_FORMULAS = [
  { latex: '/', preview: 'a/b' },
  { latex: '^', preview: 'xⁿ' },
  { latex: '√', preview: '√' },
  { latex: 'Σ', preview: 'Σ' },
  { latex: '∫', preview: '∫' },
  { latex: 'π', preview: 'π' },
  { latex: 'α', preview: 'α' },
  { latex: 'β', preview: 'β' },
  { latex: 'θ', preview: 'θ' },
  { latex: '∞', preview: '∞' },
  { latex: '→', preview: '→' },
  { latex: '≠', preview: '≠' },
  { latex: '≈', preview: '≈' },
  { latex: '()', preview: '( )' },
]

export function FormulaEditor({ value, onChange, placeholder }: FormulaEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showToolbar, setShowToolbar] = useState(false)
  const [activeGroup, setActiveGroup] = useState<string | null>(null)

  /** Insère un symbole réel au curseur dans le textarea */
  const insertSymbol = useCallback((symbol: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const text = value

    const selected = text.substring(start, end)
    let insert = symbol
    if (selected && (symbol === '()' || symbol === '[]' || symbol === '{}')) {
      // Entourer le texte sélectionné si c'est un délimiteur
      insert = symbol.charAt(0) + selected + symbol.charAt(1)
    }

    const newValue = text.substring(0, start) + insert + text.substring(end)
    onChange(newValue)

    // Repositionner le curseur juste après le symbole inséré
    setTimeout(() => {
      ta.focus()
      const cursorPos = start + insert.length
      ta.setSelectionRange(cursorPos, cursorPos)
    }, 0)
  }, [value, onChange])

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
        <span className="text-[10px] text-muted/30 italic">
          Cliquez sur un symbole pour l'insérer dans votre réponse.
        </span>
      </div>

      {/* Formules rapides (toujours visibles) */}
      <div className="flex flex-wrap gap-1">
        {QUICK_FORMULAS.map((f) => (
          <button
            key={f.latex}
            type="button"
            onClick={() => insertSymbol(f.latex)}
            title={f.latex}
            className="px-2 py-1 rounded-lg text-xs font-serif bg-white/5 hover:bg-violet-iq/10 hover:text-violet-iq border border-white/10 hover:border-violet-iq/30 transition-all text-white"
          >
            {f.preview}
          </button>
        ))}
      </div>

      {/* Palette complète de symboles */}
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
                      onClick={() => insertSymbol(btn.latex)}
                      title={btn.desc}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-sans bg-white/5 hover:bg-violet-iq/10 hover:text-violet-iq border border-white/10 hover:border-violet-iq/30 transition-all text-white"
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
        className="input w-full h-32 text-sm resize-y font-mono text-white bg-midnight/40"
      />
    </div>
  )
}

export default FormulaEditor
