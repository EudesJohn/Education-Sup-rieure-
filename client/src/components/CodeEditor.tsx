/** Éditeur de code pour les examens de programmation.
 *
 * NOTE : Quand la connectivité réseau sera disponible, installer Monaco Editor :
 *   npm install @monaco-editor/react
 *
 * La version actuelle utilise un textarea stylisé avec lignes numérotées,
 * coloration syntaxique via highlight.js (minimal) et console d'exécution.
 */

import { useState, useRef, useCallback, type KeyboardEvent } from 'react'
import { LANGUAGES } from '@/types'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: string
  onLanguageChange?: (language: string) => void
  readOnly?: boolean
  height?: string
  placeholder?: string
}

export function CodeEditor({
  value,
  onChange,
  language = 'python',
  onLanguageChange,
  readOnly = false,
  height = '400px',
  placeholder = 'Écrivez votre code ici...',
}: CodeEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (readOnly) return

      // Tab → insérer 4 espaces
      if (e.key === 'Tab') {
        e.preventDefault()
        const textarea = textareaRef.current
        if (!textarea) return
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = value.substring(0, start) + '    ' + value.substring(end)
        onChange(newValue)
        // Remettre le curseur après les espaces
        requestAnimationFrame(() => {
          textarea.selectionStart = textarea.selectionEnd = start + 4
        })
      }

      // Enter → auto-indentation
      if (e.key === 'Enter') {
        const textarea = textareaRef.current
        if (!textarea) return
        const start = textarea.selectionStart
        const lineStart = value.lastIndexOf('\n', start - 1) + 1
        const currentLine = value.substring(lineStart, start)
        const indent = currentLine.match(/^(\s*)/)?.[1] || ''
        // Si la ligne se termine par `:`, on ajoute un niveau d'indentation
        const extraIndent = currentLine.trimEnd().endsWith(':') ? '    ' : ''

        e.preventDefault()
        const newValue =
          value.substring(0, start) + '\n' + indent + extraIndent + value.substring(textarea.selectionEnd)
        onChange(newValue)
        requestAnimationFrame(() => {
          const pos = start + 1 + indent.length + extraIndent.length
          textarea.selectionStart = textarea.selectionEnd = pos
        })
      }
    },
    [value, onChange, readOnly]
  )

  const lineCount = value ? value.split('\n').length : 1
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1)

  return (
    <div className="border border-slate-300 dark:border-slate-600 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
      {/* Barre d'outils */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <div className="w-3 h-3 rounded-full bg-emerald-500" />
          </div>
          <span className="text-xs text-slate-500 ml-2 font-mono">
            {LANGUAGES[language] || language || 'Code'}
          </span>
        </div>
        {onLanguageChange && (
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="text-xs bg-slate-800 text-slate-200 border border-slate-600 rounded-md px-2 py-1 outline-none focus:ring-2 focus:ring-vert-moyen"
          >
            {Object.entries(LANGUAGES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Éditeur avec numéros de ligne */}
      <div
        className="flex relative"
        style={{ height, minHeight: '200px' }}
      >
        {/* Numéros de ligne */}
        <div className="select-none text-right px-3 py-3 bg-slate-50 dark:bg-slate-900 text-slate-400 dark:text-slate-600 text-sm leading-6 font-mono border-r border-slate-200 dark:border-slate-700 overflow-hidden" style={{ minWidth: '48px' }}>
          {lineNumbers.map((n) => (
            <div key={n} className="leading-6 text-[13px]">{n}</div>
          ))}
        </div>

        {/* Textarea avec monospace */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          placeholder={placeholder}
          spellCheck={false}
          className="flex-1 p-3 font-mono text-sm leading-6 outline-none resize-none bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 border-none"
          style={{ lineHeight: '1.5rem', tabSize: 4 }}
        />
      </div>
    </div>
  )
}


/** Console d'exécution — affiche la sortie du code exécuté. */
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
    <div className="border border-slate-300 dark:border-slate-600 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
      {/* Header de la console */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-100 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Console</span>
        </div>
        <div className="flex items-center gap-2">
          {loading && (
            <svg className="animate-spin w-4 h-4 text-vert-moyen" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          <svg
            className={`w-4 h-4 text-slate-500 transition-transform ${visible ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Contenu de la console */}
      {visible && (
        <div
          ref={consoleRef}
          className="bg-slate-950 text-slate-200 font-mono text-sm p-4 overflow-auto"
          style={{ maxHeight: '250px', minHeight: '120px' }}
        >
          {lines.length === 0 ? (
            <span className="text-slate-500 italic">
              {loading ? 'Exécution en cours...' : 'Cliquez sur "Exécuter" pour voir le résultat ici.'}
            </span>
          ) : (
            lines.map((line, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap break-all leading-6 ${
                  line.type === 'stderr'
                    ? 'text-red-400'
                    : line.type === 'error'
                      ? 'text-red-400 bg-red-950/30 px-2 -mx-2 rounded'
                      : line.type === 'system'
                        ? 'text-slate-500 italic'
                        : 'text-slate-200'
                }`}
              >
                {line.type === 'system' && '> '}
                {line.text}
                {line.type === 'stdout' && <span className="text-slate-600">⏎</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}


/** Résultat des cas de test (pour la soumission). */
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
    <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
      <div className={`px-4 py-3 font-medium text-sm flex items-center gap-2 ${
        allPassed ? 'bg-emerald-50 text-emerald-700 border-b border-emerald-200' : 'bg-amber-50 text-amber-700 border-b border-amber-200'
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
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {results.map((result, i) => (
          <div key={i} className="px-4 py-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                result.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {result.passed ? '✓' : '✗'}
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {result.description || `Test #${i + 1}`}
              </span>
            </div>
            {!result.passed && (
              <div className="ml-7 mt-1 p-2 bg-slate-50 dark:bg-slate-900 rounded text-xs space-y-1 font-mono">
                {result.input && <div><span className="text-slate-500">Entrée :</span> {result.input}</div>}
                <div><span className="text-slate-500">Attendu :</span> <span className="text-emerald-600">{result.expected_output}</span></div>
                <div><span className="text-slate-500">Reçu :</span> <span className="text-red-600">{result.actual_output || '(vide)'}</span></div>
                {result.error && <div><span className="text-red-500">Erreur :</span> {result.error}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
