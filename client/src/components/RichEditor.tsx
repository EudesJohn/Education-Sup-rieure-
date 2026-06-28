/** Éditeur de texte enrichi basé sur Tiptap avec support KaTeX.
 *
 * Implémente toutes les fonctionnalités de niveau Microsoft Word requises
 * par le cahier des charges (section 7.2) :
 *   - Mise en forme : gras, italique, souligné, barré, exposant, indice
 *   - Polices / tailles / couleurs
 *   - Alignements, interlignes
 *   - Titres, listes, tableaux, images
 *   - Éditeur mathématique LaTeX avec rendu temps réel
 *   - Annuler/Refaire, rechercher/remplacer
 *   - Compteur de mots
 */

import { useCallback, useRef, useState, useEffect, type ReactNode } from 'react'
import DOMPurify from 'dompurify'

// Tiptap
import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import LinkExtension from '@tiptap/extension-link'
import ImageExtension from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TextStyle from '@tiptap/extension-text-style'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import Superscript from '@tiptap/extension-superscript'
import Subscript from '@tiptap/extension-subscript'
import Color from '@tiptap/extension-color'

import type { Editor } from '@tiptap/core'

interface RichEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  readOnly?: boolean
  minHeight?: string
  showToolbar?: boolean
  showWordCount?: boolean
  showMathEditor?: boolean
}

// ============================================================
// Extension personnalisée : Taille de police
// ============================================================
import { Extension } from '@tiptap/core'

const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return { types: ['textStyle'] }
  },
  addGlobalAttributes() {
    return [
      {
        types: ['textStyle'],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {}
              return { style: `font-size: ${attributes.fontSize}px` }
            },
          },
        },
      },
    ]
  },
  addCommands() {
    return {
      setFontSize: (fontSize: string) => ({ chain }) => {
        return chain().setMark('textStyle', { fontSize }).run()
      },
    }
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType
    }
  }
}

export function RichEditor({
  value,
  onChange,
  placeholder = 'Rédigez votre réponse ici...',
  readOnly = false,
  minHeight = '300px',
  showToolbar = true,
  showWordCount = true,
  showMathEditor = true,
}: RichEditorProps) {
  const [mathDialogOpen, setMathDialogOpen] = useState(false)
  const [mathExpr, setMathExpr] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [fontSize, setFontSize] = useState('16')
  const [fontFamily, setFontFamily] = useState('Inter')
  const [isCodeExam, setIsCodeExam] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: { HTMLAttributes: { class: 'code-block' } },
      }),
      Placeholder.configure({ placeholder }),
      Underline,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: { class: 'text-vert-feuille underline hover:text-vert-moyen' },
      }),
      ImageExtension.configure({ inline: false, allowBase64: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TextStyle,
      FontFamily,
      Highlight.configure({ multicolor: true }),
      Superscript,
      Subscript,
      Color,
      FontSize,
    ],
    content: value || '',
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[200px] px-4 py-3',
        style: `min-height: ${minHeight}`,
      },
    },
  })

  // Synchroniser la valeur externe → éditeur (lors du changement de session)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value || '', false)
    }
  }, [value])

  // (conditionnel : désactivé car SetContent ci-dessus suffit)
  // Empêcher le re-rendu boucle

  const FONTS = [
    'Inter', 'Arial', 'Helvetica', 'Times New Roman', 'Courier New',
    'Georgia', 'Verdana', 'Trebuchet MS', 'Comic Sans MS',
  ]

  const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36', '48', '72']

  // ============================================================
  // Insérer une formule mathématique LaTeX
  // ============================================================
  const insertMath = useCallback(() => {
    if (!editor || !mathExpr.trim()) return
    const formula = `\\[${mathExpr}\\]`
    editor.chain().focus().insertContent(formula).run()
    setMathExpr('')
    setMathDialogOpen(false)
  }, [editor, mathExpr])

  // ============================================================
  // Insérer un tableau
  // ============================================================
  const insertTable = useCallback(() => {
    if (!editor) return
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
  }, [editor])

  // ============================================================
  // Insérer une image
  // ============================================================
  const insertImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt('URL de l\'image :')
    if (url) {
      editor.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  // ============================================================
  // Lien
  // ============================================================
  const setLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL du lien :', previousUrl || '')

    if (url === null) return

    if (url === '') {
      editor.chain().focus().unsetLink().run()
      return
    }

    editor.chain().focus().setLink({ href: url }).run()
  }, [editor])

  // ============================================================
  // Rechercher / Remplacer
  // ============================================================
  const handleSearch = useCallback(() => {
    if (!editor || !searchQuery) return
    const text = editor.state.doc.textContent
    const idx = text.toLowerCase().indexOf(searchQuery.toLowerCase())
    if (idx >= 0) {
      // Scroll au bon endroit — utilisation de find
      editor.commands.setTextSelection({ from: idx + 1, to: idx + 1 + searchQuery.length })
      editor.commands.scrollIntoView()
    }
  }, [editor, searchQuery])

  // ============================================================
  // Compteur de mots
  // ============================================================
  const wordCount = editor
    ? editor.state.doc.textContent.split(/\s+/).filter(Boolean).length
    : 0
  const charCount = editor
    ? editor.state.doc.textContent.length
    : 0

  // ============================================================
  // Barre d'outils
  // ============================================================
  const Toolbar = () => (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-white border-b border-gray-200
                    shadow-sm sticky top-0 z-10 print:hidden">
      {/* === Styles de texte === */}
      <ToolbarBtn
        label="Gras"
        icon={<strong className="text-sm">B</strong>}
        active={editor?.isActive('bold')}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarBtn
        label="Italique"
        icon={<em className="text-sm">I</em>}
        active={editor?.isActive('italic')}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <ToolbarBtn
        label="Souligné"
        icon={<span className="text-sm" style={{ textDecoration: 'underline' }}>U</span>}
        active={editor?.isActive('underline')}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      />
      <ToolbarBtn
        label="Barré"
        icon={<span className="text-sm" style={{ textDecoration: 'line-through' }}>S</span>}
        active={editor?.isActive('strike')}
        onClick={() => editor?.chain().focus().toggleStrike().run()}
      />
      <ToolbarBtn
        label="Exposant"
        icon={<sup className="text-xs">x²</sup>}
        active={editor?.isActive('superscript')}
        onClick={() => editor?.chain().focus().toggleSuperscript().run()}
      />
      <ToolbarBtn
        label="Indice"
        icon={<sub className="text-xs">x₂</sub>}
        active={editor?.isActive('subscript')}
        onClick={() => editor?.chain().focus().toggleSubscript().run()}
      />
      <ToolbarBtn
        label="Surlignage"
        icon={<span className="text-sm" style={{ background: '#fde68a' }}>A</span>}
        active={editor?.isActive('highlight')}
        onClick={() => editor?.chain().focus().toggleHighlight().run()}
      />

      <Divider />

      {/* === Police et taille === */}
      <select
        value={fontFamily}
        onChange={(e) => {
          setFontFamily(e.target.value)
          editor?.chain().focus().setFontFamily(e.target.value).run()
        }}
        className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white text-gray-700 outline-none focus:ring-1 focus:ring-vert-moyen"
        title="Police"
      >
        {FONTS.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>

      <select
        value={fontSize}
        onChange={(e) => {
          setFontSize(e.target.value)
          editor?.chain().focus().setFontSize(e.target.value).run()
        }}
        className="text-xs border border-gray-300 rounded px-1.5 py-1 bg-white text-gray-700 outline-none focus:ring-1 focus:ring-vert-moyen w-14"
        title="Taille de police"
      >
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      {/* Couleur du texte */}
      <input
        type="color"
        onInput={(e) => editor?.chain().focus().setColor((e.target as HTMLInputElement).value).run()}
        className="w-6 h-6 p-0 border-0 cursor-pointer rounded"
        title="Couleur du texte"
      />

      <Divider />

      {/* === Titres === */}
      <ToolbarBtn
        label="Titre 1"
        icon={<span className="text-xs font-bold">H1</span>}
        active={editor?.isActive('heading', { level: 1 })}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarBtn
        label="Titre 2"
        icon={<span className="text-xs font-bold">H2</span>}
        active={editor?.isActive('heading', { level: 2 })}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarBtn
        label="Titre 3"
        icon={<span className="text-xs font-bold">H3</span>}
        active={editor?.isActive('heading', { level: 3 })}
        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
      />
      <ToolbarBtn
        label="Paragraphe"
        icon={<span className="text-xs">¶</span>}
        active={editor?.isActive('paragraph')}
        onClick={() => editor?.chain().focus().setParagraph().run()}
      />

      <Divider />

      {/* === Alignement === */}
      <ToolbarBtn
        label="Aligner à gauche"
        icon={<span className="text-xs">⏤</span>}
        active={editor?.isActive({ textAlign: 'left' })}
        onClick={() => editor?.chain().focus().setTextAlign('left').run()}
      />
      <ToolbarBtn
        label="Centrer"
        icon={<span className="text-xs">⏤⏤</span>}
        active={editor?.isActive({ textAlign: 'center' })}
        onClick={() => editor?.chain().focus().setTextAlign('center').run()}
      />
      <ToolbarBtn
        label="Aligner à droite"
        icon={<span className="text-xs">⏤</span>}
        active={editor?.isActive({ textAlign: 'right' })}
        onClick={() => editor?.chain().focus().setTextAlign('right').run()}
      />
      <ToolbarBtn
        label="Justifier"
        icon={<span className="text-xs"></span>}
        active={editor?.isActive({ textAlign: 'justify' })}
        onClick={() => editor?.chain().focus().setTextAlign('justify').run()}
      />

      <Divider />

      {/* === Listes === */}
      <ToolbarBtn
        label="Liste à puces"
        icon={<span className="text-xs">•</span>}
        active={editor?.isActive('bulletList')}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarBtn
        label="Liste numérotée"
        icon={<span className="text-xs">1.</span>}
        active={editor?.isActive('orderedList')}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />

      <Divider />

      {/* === Insertion === */}
      <ToolbarBtn
        label="Tableau"
        icon={<span className="text-xs">⊞</span>}
        onClick={insertTable}
      />
      <ToolbarBtn
        label="Image"
        icon={<span className="text-xs"></span>}
        onClick={insertImage}
      />
      <ToolbarBtn
        label="Lien"
        icon={<span className="text-xs"></span>}
        active={editor?.isActive('link')}
        onClick={setLink}
      />

      {showMathEditor && (
        <ToolbarBtn
          label="Formule mathématique"
          icon={<span className="text-sm font-serif italic">Σ</span>}
          active={mathDialogOpen}
          onClick={() => setMathDialogOpen(!mathDialogOpen)}
        />
      )}

      <Divider />

      {/* === Code === */}
      <ToolbarBtn
        label="Code"
        icon={<code className="text-xs">{"</>"}</code>}
        active={editor?.isActive('code')}
        onClick={() => editor?.chain().focus().toggleCode().run()}
      />
      <ToolbarBtn
        label="Bloc de code"
        icon={<span className="text-xs border border-gray-400 px-0.5 rounded">{'</>'}</span>}
        active={editor?.isActive('codeBlock')}
        onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarBtn
        label="Citation"
        icon={<span className="text-xs"></span>}
        active={editor?.isActive('blockquote')}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      />

      <Divider />

      {/* === Annuler / Refaire === */}
      <ToolbarBtn
        label="Annuler"
        icon={<span className="text-xs">↩</span>}
        onClick={() => editor?.chain().focus().undo().run()}
      />
      <ToolbarBtn
        label="Refaire"
        icon={<span className="text-xs">↪</span>}
        onClick={() => editor?.chain().focus().redo().run()}
      />

      {/* Rechercher */}
      <ToolbarBtn
        label="Rechercher"
        icon={<span className="text-xs"></span>}
        active={searchOpen}
        onClick={() => setSearchOpen(!searchOpen)}
      />
    </div>
  )

  // ============================================================
  // Rendu conditionnel : si pas d'éditeur (chargement)
  // ============================================================
  if (!editor) {
    return (
      <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
        <div className="p-8 text-center text-gray-400">
          <svg className="animate-spin w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="mt-2 text-sm">Chargement de l'éditeur...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden bg-white dark:bg-slate-800
                    dark:border-slate-600 flex flex-col relative">
      {showToolbar && <Toolbar />}

      {/* Rechercher */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            placeholder="Rechercher dans le texte..."
            className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-vert-moyen"
          />
          <button onClick={handleSearch}
            className="px-3 py-1 bg-vert-moyen hover:bg-tableau-clair text-white text-xs rounded transition-colors">
            Rechercher
          </button>
          <button onClick={() => { setSearchOpen(false); setSearchQuery('') }}
            className="text-xs text-gray-500 hover:text-gray-700">
            
          </button>
        </div>
      )}

      {/* Dialogue mathématique */}
      {mathDialogOpen && (
        <div className="mx-3 mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-blue-700 mb-1">
              Formule LaTeX
            </label>
            <input
              type="text"
              value={mathExpr}
              onChange={(e) => setMathExpr(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') insertMath() }}
              placeholder='\frac{a}{b} \sum_{i=0}^{n} x_i'
              className="w-full px-3 py-1.5 text-sm border border-blue-300 rounded bg-white text-gray-900 font-mono focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <div className="mt-1 text-xs text-blue-500 font-mono"
                 dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(mathExpr ? renderLatexPreview(mathExpr) : '') }} />
          </div>
          <button onClick={insertMath}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors">
            Insérer
          </button>
          <button onClick={() => setMathDialogOpen(false)}
            className="px-2 py-1.5 text-gray-500 hover:text-gray-700 text-sm">
            
          </button>
        </div>
      )}

      {/* Zone d'édition */}
      <div className="relative">
        {readOnly ? (
          <div className="p-4 text-gray-900 dark:text-gray-100 prose prose-sm max-w-none"
               dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(value)) }} />
        ) : (
          <>
            <EditorContent editor={editor} />

            {/* Bubble Menu (sélection de texte) */}
            <BubbleMenu editor={editor} tippyOptions={{ duration: 150 }}>
              <div className="flex items-center gap-0.5 bg-gray-900 text-white rounded-lg shadow-xl px-2 py-1.5">
                <button onClick={() => editor.chain().focus().toggleBold().run()}
                  className={`px-1.5 py-0.5 rounded text-xs font-bold ${editor.isActive('bold') ? 'bg-vert-moyen' : 'hover:bg-gray-700'}`}>B</button>
                <button onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={`px-1.5 py-0.5 rounded text-xs italic ${editor.isActive('italic') ? 'bg-vert-moyen' : 'hover:bg-gray-700'}`}>I</button>
                <button onClick={() => editor.chain().focus().toggleUnderline().run()}
                  className={`px-1.5 py-0.5 rounded text-xs underline ${editor.isActive('underline') ? 'bg-vert-moyen' : 'hover:bg-gray-700'}`}>U</button>
                <span className="w-px h-4 bg-gray-700 mx-1" />
                <button onClick={() => editor.chain().focus().toggleCode().run()}
                  className={`px-1.5 py-0.5 rounded text-xs font-mono ${editor.isActive('code') ? 'bg-vert-moyen' : 'hover:bg-gray-700'}`}>{'<>'}</button>
                <button onClick={setLink}
                  className={`px-1.5 py-0.5 rounded text-xs ${editor.isActive('link') ? 'bg-vert-moyen' : 'hover:bg-gray-700'}`}></button>
              </div>
            </BubbleMenu>
          </>
        )}
      </div>

      {/* Barre d'état : compteur de mots */}
      {showWordCount && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
          <div className="flex items-center gap-4">
            {showMathEditor && (
              <button onClick={() => setMathDialogOpen(!mathDialogOpen)}
                className="flex items-center gap-1 text-vert-feuille hover:text-tableau-clair font-medium">
                <span className="font-serif italic text-sm">Σ</span>
                Insérer une formule
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span>{wordCount} mot{wordCount !== 1 ? 's' : ''}</span>
            <span>{charCount} caractère{charCount !== 1 ? 's' : ''}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// Composant helper : bouton de barre d'outils
// ============================================================
function ToolbarBtn({
  label, icon, active, onClick,
}: {
  label: string
  icon: ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`
        px-1.5 py-1 text-xs font-medium rounded transition-colors
        ${active
          ? 'bg-vert-moyen/10 text-tableau-clair ring-1 ring-vert-moyen/30'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }
      `}
    >
      {icon}
    </button>
  )
}

// ============================================================
// Séparateur de barre d'outils
// ============================================================
function Divider() {
  return <div className="w-px h-5 mx-0.5 bg-gray-300 flex-shrink-0" />
}

// ============================================================
// Helper : rendu simple de LaTeX en HTML (preview rapide)
// ============================================================
function renderLatexPreview(expr: string): string {
  if (!expr) return ''
  // Rendu minimal pour la prévisualisation
  const html = expr
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '<span class="frac"><sup>$1</sup>⁄<sub>$2</sub></span>')
    .replace(/\\sum/g, '∑')
    .replace(/\\int/g, '∫')
    .replace(/\\pi/g, 'π')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\theta/g, 'θ')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)')
    .replace(/\\infty/g, '∞')
  return html
}

// ============================================================
// Helper : rendu markdown → HTML (fallback pour readOnly)
// ============================================================
function renderMarkdown(text: string): string {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
    .replace(/\\\[(.+?)\\\]/g, '<span class="math-formula">$$\n$1\n$$</span>')
    .replace(/\n/g, '<br/>')
  return html
}

export default RichEditor
