/** Éditeur de code pour les examens de programmation.
 *
 * Utilise Monaco Editor (VS Code) via @monaco-editor/react.
 * Support : coloration syntaxique (13 langages), auto-complétion,
 *           numéros de ligne, repli de code, thème dark.
 *
 * Props compatibles avec l'ancienne version textarea (rétrocompatible).
 */

import { useRef, useMemo, useCallback } from 'react'
import Editor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
import { LANGUAGES } from '@/types'

// =============================================================
// Types
// =============================================================

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  onLanguageChange?: (language: string) => void
  readOnly?: boolean
  height?: string
  placeholder?: string
}

// Mapping de nos noms de langage vers les identifiants Monaco
const MONACO_LANGUAGE_MAP: Record<string, string> = {
  python: 'python',
  javascript: 'javascript',
  typescript: 'typescript',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  go: 'go',
  rust: 'rust',
  php: 'php',
  ruby: 'ruby',
  r: 'r',
  bash: 'shell',
  sqlite: 'sql',
}

// =============================================================
// Composant principal
// =============================================================

export function CodeEditor({
  value,
  onChange,
  language = 'python',
  onLanguageChange,
  readOnly = false,
  height = '400px',
}: CodeEditorProps) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<BeforeMount>[0] | null>(null)

  const monacoLanguage = MONACO_LANGUAGE_MAP[language] || 'plaintext'

  // Configuration de l'éditeur — options stables
  const editorOptions = useMemo(
    () => ({
      minimap: { enabled: false },
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      fontLigatures: true,
      lineNumbers: 'on' as const,
      lineNumbersMinChars: 3,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: true,
      wordWrap: 'on' as const,
      folding: true,
      renderLineHighlight: 'line' as const,
      cursorBlinking: 'smooth' as const,
      cursorSmoothCaretAnimation: 'explicit' as const,
      smoothScrolling: true,
      padding: { top: 12, bottom: 12 },
      minimapEnabled: false,
      readOnly,
      renderWhitespace: 'selection' as const,
      bracketPairColorization: { enabled: true },
      autoClosingBrackets: 'always' as const,
      autoClosingQuotes: 'always' as const,
      formatOnPaste: true,
      suggest: {
        showKeywords: true,
        showSnippets: true,
      },
    }),
    [readOnly]
  )

  // Montage : focus et contexte
  const handleEditorDidMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor
      if (!readOnly) {
        editor.focus()
      }
    },
    [readOnly]
  )

  // Avant montage : enregistrer le theme dark personnalisé
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    monacoRef.current = monaco

    // Thème "Deep Focus" — assorti au design system PEAN
    monaco.editor.defineTheme('pean-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A6E85', fontStyle: 'italic' },
        { token: 'keyword', foreground: '8B5CF6' },
        { token: 'string', foreground: '06F2DB' },
        { token: 'number', foreground: 'F59E0B' },
        { token: 'type', foreground: '60A5FA' },
        { token: 'function', foreground: '34D399' },
        { token: 'variable', foreground: 'E2E8F0' },
        { token: 'constant', foreground: 'F472B6' },
        { token: 'operator', foreground: 'A78BFA' },
      ],
      colors: {
        'editor.background': '#0B0E1A',
        'editor.foreground': '#E2E8F0',
        'editor.lineHighlightBackground': '#1A1D2E',
        'editor.selectionBackground': '#2D1B69',
        'editor.inactiveSelectionBackground': '#1E1E3A',
        'editorCursor.foreground': '#06F2DB',
        'editorLineNumber.foreground': '#3D3F52',
        'editorLineNumber.activeForeground': '#8B5CF6',
        'editor.selectionHighlightBackground': '#2D1B6940',
        'editorBracketMatch.background': '#2D1B6940',
        'editorBracketMatch.border': '#8B5CF6',
        'editorGutter.background': '#0B0E1A',
        'editorWidget.background': '#131627',
        'editorWidget.border': '#1E203A',
        'input.background': '#1A1D2E',
        'input.border': '#2D2F45',
        'input.foreground': '#E2E8F0',
        'list.activeSelectionBackground': '#2D1B69',
        'list.hoverBackground': '#1A1D2E',
        'scrollbarSlider.background': '#2D2F4580',
        'scrollbarSlider.hoverBackground': '#3D3F52',
        'scrollbarSlider.activeBackground': '#8B5CF6',
      },
    })
  }, [])

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      if (newValue !== undefined) {
        onChange(newValue)
      }
    },
    [onChange]
  )

  return (
    <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-[#0B0E1A]">
      {/* Barre d'outils — style VS Code */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0B0E1A] border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-rose-accent/80" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          </div>
          <span className="text-xs text-muted/50 font-mono">
            {LANGUAGES[language] || language || 'Code'}
          </span>
        </div>
        {onLanguageChange && (
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="text-xs bg-[#1A1D2E] text-muted border border-white/[0.08] rounded-md px-2.5 py-1.5 outline-none focus:border-neon-cyan/50 transition-colors cursor-pointer"
          >
            {Object.entries(LANGUAGES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Monaco Editor */}
      <Editor
        height={height}
        language={monacoLanguage}
        value={value}
        onChange={handleChange}
        theme="pean-dark"
        beforeMount={handleBeforeMount}
        onMount={handleEditorDidMount}
        options={editorOptions}
        loading={
          <div className="flex items-center justify-center h-full min-h-[200px] bg-[#0B0E1A]">
            <div className="flex items-center gap-3">
              <svg className="animate-spin w-5 h-5 text-neon-cyan/60" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-muted/50">Chargement de l'éditeur...</span>
            </div>
          </div>
        }
      />
    </div>
  )
}


// =============================================================
// Console d'exécution (inchangée — conservée pour compatibilité)
// =============================================================

export interface ConsoleLine {
  type: 'stdout' | 'stderr' | 'system' | 'error'
  text: string
}

interface ExecConsoleProps {
  lines: ConsoleLine[]
  visible: boolean
  onToggle: () => void
  loading?: boolean
}

export function ExecConsole({ lines, visible, onToggle, loading = false }: ExecConsoleProps) {
  const consoleRef = useRef<HTMLDivElement>(null)

  // Auto-scroll vers le bas
  if (visible && lines.length > 0) {
    setTimeout(() => {
      if (consoleRef.current) {
        consoleRef.current.scrollTop = consoleRef.current.scrollHeight
      }
    }, 50)
  }

  return (
    <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-[#0B0E1A]">
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-[#131627] border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-muted/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          <span className="text-sm font-medium text-muted">Console</span>
          {lines.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-muted/50">{lines.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <svg className="animate-spin w-4 h-4 text-neon-cyan/60" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <svg
            className={`w-4 h-4 text-muted/40 transition-transform ${visible ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Contenu */}
      {visible && (
        <div
          ref={consoleRef}
          className="bg-[#070A14] text-muted font-mono text-sm p-4 overflow-auto"
          style={{ maxHeight: '250px', minHeight: '120px' }}
        >
          {lines.length === 0 ? (
            <span className="text-muted/40 italic">
              {loading ? 'Exécution en cours...' : 'Cliquez sur "Exécuter" pour voir le résultat ici.'}
            </span>
          ) : (
            lines.map((line, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap break-all leading-6 ${
                  line.type === 'stderr'
                    ? 'text-rose-accent'
                    : line.type === 'error'
                      ? 'text-rose-accent bg-rose-accent/10 px-2 -mx-2 rounded'
                      : line.type === 'system'
                        ? 'text-muted/50 italic'
                        : 'text-white/80'
                }`}
              >
                {line.type === 'system' && '> '}
                {line.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}


// =============================================================
// Résultat des cas de test (inchangé — conservé pour compatibilité)
// =============================================================

interface TestResultViewProps {
  results: Array<{
    description?: string
    passed: boolean
    input: string
    expected_output: string
    actual_output: string
    error?: string
  }>
  passed: number
  total: number
}

export function TestResultsView({ results, passed, total }: TestResultViewProps) {
  if (total === 0) return null

  const allPassed = passed === total

  return (
    <div className="border border-white/[0.08] rounded-xl overflow-hidden bg-[#0B0E1A]">
      <div className={`px-4 py-3 font-medium text-sm flex items-center gap-2 ${
        allPassed
          ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/20'
          : 'bg-amber-500/10 text-amber-400 border-b border-amber-500/20'
      }`}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {allPassed ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          )}
        </svg>
        {allPassed
          ? `Tous les tests passent (${passed}/${total})`
          : `${passed}/${total} tests passés`
        }
      </div>
      <div className="divide-y divide-white/[0.06]">
        {results.map((result, i) => (
          <div key={i} className="px-4 py-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                result.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-accent/20 text-rose-accent'
              }`}>
                {result.passed ? '✓' : '✗'}
              </span>
              <span className="font-medium text-white/80">
                {result.description || `Test #${i + 1}`}
              </span>
            </div>
            {!result.passed && (
              <div className="ml-7 mt-1 p-2 bg-[#131627] rounded text-xs space-y-1 font-mono">
                {result.input && <div><span className="text-muted/50">Entrée :</span> <span className="text-white/70">{result.input}</span></div>}
                <div><span className="text-muted/50">Attendu :</span> <span className="text-emerald-400">{result.expected_output}</span></div>
                <div><span className="text-muted/50">Reçu :</span> <span className="text-rose-accent">{result.actual_output || '(vide)'}</span></div>
                {result.error && <div><span className="text-rose-accent/70">Erreur :</span> {result.error}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
