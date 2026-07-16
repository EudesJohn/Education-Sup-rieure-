import { useEffect, useState, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { useSearchParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { useAuthStore } from '@/stores/authStore'

function extractSection(markdown: string, sectionTitle: string, nextTitle?: string): string {
  const lines = markdown.split('\n')
  let inSection = false
  let result: string[] = []
  for (const line of lines) {
    if (line.startsWith(`## ${sectionTitle}`)) {
      inSection = true
      result.push(line)
      continue
    }
    if (inSection && nextTitle && line.startsWith(`## ${nextTitle}`)) {
      break
    }
    if (inSection) {
      result.push(line)
    }
  }
  return result.join('\n')
}

export function HelpPage() {
  const [searchParams] = useSearchParams()
  const role = searchParams.get('role')
  const isStudentView = role === 'student'
  const { teacher } = useAuthStore()
  const printRef = useRef<HTMLDivElement>(null)

  const [rawContent, setRawContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<string>('')

  useEffect(() => {
    fetch('/GUIDE_UTILISATION.md')
      .then((res) => res.text())
      .then((text) => {
        setRawContent(text)
        setLoading(false)
      })
      .catch(() => {
        setRawContent('Impossible de charger le guide. Réessayez plus tard.')
        setLoading(false)
      })
  }, [])

  // Filtrer selon le rôle
  const content = useMemo(() => {
    if (!rawContent) return ''
    if (isStudentView) {
      return extractSection(rawContent, 'Guide Étudiant', 'Guide Enseignant')
    }
    return rawContent
  }, [rawContent, isStudentView])

  // Extraire les titres pour la table des matières
  const headings = content
    .split('\n')
    .filter((l) => l.startsWith('## '))
    .map((l) => l.replace('## ', '').replace(/[#*`]/g, '').trim())

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      { rootMargin: '-80px 0px -60% 0px' },
    )
    document.querySelectorAll('h2[id], h3[id]').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [content])

  const handleDownloadPdf = () => {
    window.print()
  }

  return (
    <Layout title={isStudentView ? 'Guide étudiant' : "Guide d'utilisation"}>
      <div className="flex gap-8">
        {/* Bouton télécharger en-tête */}
        <div className="fixed bottom-8 right-8 z-40 flex flex-col gap-2">
          <button
            onClick={handleDownloadPdf}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-neon-cyan text-deep-space font-semibold text-sm
              shadow-lg shadow-neon-cyan/20 hover:shadow-neon-cyan/30 hover:scale-[1.02] active:scale-[0.98]
              transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Télécharger en PDF
          </button>
        </div>

        {/* Table des matières latérale (full guide only) */}
        {!isStudentView && headings.length > 0 && (
          <nav className="hidden xl:block w-56 flex-shrink-0">
            <div className="sticky top-8 space-y-1 border-l border-slate-mid/40 pl-4">
              <p className="text-[10px] font-semibold text-muted/50 uppercase tracking-[0.15em] mb-3">
                Sections
              </p>
              {headings.map((h) => {
                const id = h.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
                return (
                  <a
                    key={h}
                    href={`#${id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
                    }}
                    className={`block text-xs leading-relaxed transition-all duration-200 border-l-2 -ml-[17px] pl-3 ${
                      activeSection === id
                        ? 'border-neon-cyan text-neon-cyan font-medium'
                        : 'border-transparent text-muted/60 hover:text-white/70 hover:border-muted/30'
                    }`}
                  >
                    {h}
                  </a>
                )
              })}
            </div>
          </nav>
        )}

        {/* Contenu */}
        <div ref={printRef} className="flex-1 min-w-0 max-w-3xl">
          {loading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-8 bg-slate-mid/30 rounded w-3/4" />
              <div className="h-4 bg-slate-mid/20 rounded w-full" />
              <div className="h-4 bg-slate-mid/20 rounded w-5/6" />
              <div className="h-4 bg-slate-mid/20 rounded w-2/3" />
            </div>
          ) : content ? (
            <article
              className="prose prose-invert max-w-none
                prose-h1:text-white prose-h1:text-3xl prose-h1:font-heading prose-h1:font-semibold prose-h1:tracking-tight
                prose-h2:text-white prose-h2:text-xl prose-h2:font-heading prose-h2:font-semibold prose-h2:mt-10 prose-h2:mb-4 prose-h2:border-b prose-h2:border-slate-mid/30 prose-h2:pb-2
                prose-h3:text-white/90 prose-h3:text-lg prose-h3:font-heading prose-h3:font-medium prose-h3:mt-8 prose-h3:mb-3
                prose-h4:text-white/80 prose-h4:font-medium prose-h4:mt-6 prose-h4:mb-2
                prose-p:text-text-secondary prose-p:leading-relaxed prose-p:my-2
                prose-a:text-neon-cyan prose-a:no-underline hover:prose-a:text-neon-cyan-dim
                prose-strong:text-white prose-strong:font-semibold
                prose-code:text-neon-cyan prose-code:bg-slate-deep prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono
                prose-pre:bg-slate-deep prose-pre:border prose-pre:border-slate-mid/30 prose-pre:rounded-xl prose-pre:p-4 prose-pre:shadow-lg
                prose-th:text-white prose-th:font-medium prose-th:border prose-th:border-slate-mid/30 prose-th:px-4 prose-th:py-2.5
                prose-td:text-text-secondary prose-td:border prose-td:border-slate-mid/30 prose-td:px-4 prose-td:py-2.5
                prose-table:border-collapse prose-table:w-full prose-table:my-6
                prose-thead:bg-slate-deep/50
                prose-hr:border-slate-mid/30 prose-hr:my-8
                prose-blockquote:border-l-neon-cyan/50 prose-blockquote:text-text-secondary prose-blockquote:pl-4 prose-blockquote:italic
                prose-ul:list-disc prose-ul:pl-6 prose-ul:text-text-secondary prose-ul:space-y-1
                prose-ol:list-decimal prose-ol:pl-6 prose-ol:text-text-secondary prose-ol:space-y-1
                prose-li:my-0.5
                print-content
              "
            >
              <ReactMarkdown
                components={{
                  h2: ({ children, ...props }) => {
                    const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
                    return <h2 id={id} {...props}>{children}</h2>
                  },
                  h3: ({ children, ...props }) => {
                    const id = String(children).toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')
                    return <h3 id={id} {...props}>{children}</h3>
                  },
                  table: ({ children }) => (
                    <div className="overflow-x-auto">
                      <table className="text-sm">{children}</table>
                    </div>
                  ),
                  input: ({ checked, ...props }) => (
                    <input type="checkbox" checked={checked} readOnly className="accent-neon-cyan mr-2" {...props} />
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            </article>
          ) : (
            <p className="text-muted/60 italic">Section non disponible.</p>
          )}
        </div>
      </div>
    </Layout>
  )
}
