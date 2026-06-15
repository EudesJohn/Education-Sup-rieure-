/** Gestion des dossiers pédagogiques — RF-06.
 *
 * Fonctionnalités :
 * 1. Upload de document → classification IA automatique
 * 2. Liste filtrée des documents
 * 3. Recherche intelligente (full-text)
 * 4. Aperçu des statistiques
 */

import { useEffect, useState, useRef } from 'react'
import { Layout } from '@/components/Layout'
import { documentApi } from '@/services/api'
import type { PedagogicalDocument, DocumentUploadResponse } from '@/types'

// =============================================================
// Page principale
// =============================================================

export function DocumentLibraryPage() {
  const [documents, setDocuments] = useState<PedagogicalDocument[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showUpload, setShowUpload] = useState(false)

  const fetchDocs = async (type?: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await documentApi.list(type ? { type } : {})
      setDocuments(res.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }

  const fetchCounts = async () => {
    try {
      const res = await documentApi.getCounts()
      setCounts(res.data)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    fetchDocs(typeFilter || undefined)
    fetchCounts()
  }, [typeFilter])

  const handleDeleted = () => fetchDocs()

  const docTypes = [
    { key: '', label: 'Tous', icon: AllIcon },
    { key: 'course', label: 'Cours', icon: CourseIcon },
    { key: 'td', label: 'TD', icon: TdIcon },
    { key: 'tp', label: 'TP', icon: TpIcon },
    { key: 'exam', label: 'Examens', icon: ExamIcon },
    { key: 'correction', label: 'Corrections', icon: CorrectionIcon },
    { key: 'reference', label: 'Références', icon: RefIcon },
  ]

  return (
    <Layout title="Dossiers pédagogiques">
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-accent/10 border border-rose-accent/20 text-rose-accent text-sm animate-fade-in">
          {error}
        </div>
      )}

      {/* Barre d'outils */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        {/* Barre de recherche */}
        <div className="relative flex-1 max-w-md w-full">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                setLoading(true)
                documentApi.search(searchQuery.trim())
                  .then((res) => setDocuments(res.data.results))
                  .catch(() => {})
                  .finally(() => setLoading(false))
              }
            }}
            placeholder="Rechercher dans les documents..."
            className="input w-full pl-10 text-sm"
          />
        </div>

        <button
          onClick={() => setShowUpload(!showUpload)}
          className="btn-primary text-sm px-5 py-2.5 flex-shrink-0"
        >
          <svg className="w-4 h-4 inline-block mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          Importer
        </button>
      </div>

      {/* Filtres par type et compteurs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {docTypes.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTypeFilter(key); setSearchQuery('') }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium transition-all border ${
              typeFilter === key
                ? 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan'
                : 'bg-white/[0.03] border-white/[0.06] text-muted/70 hover:text-white hover:border-white/20'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
            {counts[key] !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                typeFilter === key ? 'bg-neon-cyan/20' : 'bg-white/[0.06]'
              }`}>
                {counts[key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Upload panel */}
      {showUpload && <UploadPanel onDone={() => { setShowUpload(false); fetchDocs(); fetchCounts() }} />}

      {/* Liste des documents */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-white/[0.04] rounded w-3/4 mb-3" />
              <div className="h-3 bg-white/[0.04] rounded w-1/2 mb-2" />
              <div className="h-3 bg-white/[0.04] rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-white/[0.03] flex items-center justify-center">
            <svg className="w-8 h-8 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-white/70 mb-2">Aucun document</h3>
          <p className="text-sm text-muted/50 max-w-md mx-auto">
            Importez des cours, TD, TP ou examens. L'IA les classifiera automatiquement.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} doc={doc} onDeleted={handleDeleted} />
          ))}
        </div>
      )}
    </Layout>
  )
}

// =============================================================
// Upload Panel
// =============================================================

function UploadPanel({ onDone }: { onDone: () => void }) {
  const [uploading, setUploading] = useState(false)
  const [classification, setClassification] = useState<DocumentUploadResponse['ai_classification'] | null>(null)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [docTitle, setDocTitle] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError('')
    setProgress(0)
    setClassification(null)

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !['pdf', 'docx', 'doc', 'txt', 'md', 'ppt', 'pptx', 'odt', 'html'].includes(ext)) {
      setError(`Format .${ext} non supporté`)
      return
    }

    setUploading(true)
    try {
      const res = await documentApi.upload(file, docTitle || undefined, undefined, setProgress)
      setClassification(res.data.ai_classification)
      setDocTitle(res.data.title || file.name.replace(/\.[^/.]+$/, ''))
    } catch (err: any) {
      setError(err.response?.data?.detail || "Erreur lors de l'import")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="card p-6 mb-6 animate-fade-in">
      <h3 className="font-medium text-white mb-4">Importer un document pédagogique</h3>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-accent/10 border border-rose-accent/20 text-rose-accent text-sm">
          {error}
        </div>
      )}

      {/* Zone de drop */}
      {!classification && (
        <div
          onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]) }}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-white/10 hover:border-neon-cyan/30 rounded-xl p-8 text-center cursor-pointer transition-all"
        >
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt,.md,.ppt,.pptx,.odt,.html" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />

          <svg className="w-10 h-10 mx-auto mb-3 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm text-muted/70 mb-1">Cliquez ou glissez-déposez un fichier</p>
          <p className="text-xs text-muted/40">PDF, DOCX, TXT, MD, PPT, ODT (max 50 Mo)</p>

          {uploading && (
            <div className="mt-4 max-w-xs mx-auto">
              <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-violet-iq transition-all duration-300"
                     style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted/50 mt-1.5">Analyse en cours{progress < 100 ? '...' : ' et classification IA...'}</p>
            </div>
          )}
        </div>
      )}

      {/* Classification result */}
      {classification && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-emerald-300">Document classifié avec succès</p>
              <p className="text-xs text-emerald-400/70">Confiance : {Math.round(classification.confidence * 100)}%</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <MetaBadge label="Matière" value={classification.subject} />
            <MetaBadge label="Niveau" value={classification.academic_level} />
            <MetaBadge label="Type" value={classification.document_type} />
            <MetaBadge label="Fichier" value={classification.keywords.slice(0, 2).join(', ') || '-'} />
          </div>

          {classification.summary && (
            <p className="text-sm text-muted/70 p-3 rounded-lg bg-white/[0.03] italic">
              "{classification.summary}"
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={() => setClassification(null)} className="btn-ghost text-sm px-4 py-2">
              Importer un autre
            </button>
            <button onClick={onDone} className="btn-primary text-sm px-5 py-2">
              Terminé
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================
// Document Card
// =============================================================

function DocumentCard({ doc, onDeleted }: { doc: PedagogicalDocument; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`Supprimer "${doc.title}" ?`)) return
    setDeleting(true)
    try { await documentApi.delete(doc.id); onDeleted() }
    catch { setDeleting(false) }
  }

  const typeColors: Record<string, string> = {
    course: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
    td: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    tp: 'bg-violet-iq/15 text-violet-300 border-violet-iq/20',
    exam: 'bg-rose-accent/15 text-rose-300 border-rose-accent/20',
    correction: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
    reference: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20',
  }

  return (
    <div className="card p-5 hover:border-neon-cyan/20 transition-all duration-200 group">
      <div className="flex items-start justify-between mb-3">
        <div className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${typeColors[doc.document_type] || 'bg-white/[0.06] text-muted/60'}`}>
          {doc.document_type === 'course' ? 'Cours' :
           doc.document_type === 'td' ? 'TD' :
           doc.document_type === 'tp' ? 'TP' :
           doc.document_type === 'exam' ? 'Examen' :
           doc.document_type === 'correction' ? 'Correction' :
           doc.document_type === 'reference' ? 'Référence' : 'Autre'}
        </div>
        <button onClick={handleDelete} disabled={deleting}
          className="p-1.5 rounded-lg text-muted/30 hover:text-rose-accent hover:bg-rose-accent/10 transition-all opacity-0 group-hover:opacity-100">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <h3 className="font-medium text-white text-sm mb-1 leading-snug line-clamp-2">{doc.title}</h3>

      {doc.description && (
        <p className="text-xs text-muted/60 mb-3 line-clamp-2">{doc.description}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted/50">
        {doc.subject && (
          <span className="px-2 py-0.5 rounded-full bg-white/[0.04]">{doc.subject}</span>
        )}
        {doc.academic_level && (
          <span className="px-2 py-0.5 rounded-full bg-white/[0.04]">{doc.academic_level}</span>
        )}
        <span className="ml-auto">{doc.file_type?.toUpperCase()}</span>
      </div>
    </div>
  )
}

function MetaBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 rounded-lg bg-white/[0.03] text-center">
      <p className="text-[10px] text-muted/50 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-medium text-white truncate">{value || '-'}</p>
    </div>
  )
}

// =============================================================
// Petites icônes SVG
// =============================================================

function AllIcon({ className }: { className?: string }) {
  return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25z" />
  </svg>
}
function CourseIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg> }
function TdIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg> }
function TpIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" /></svg> }
function ExamIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" /></svg> }
function CorrectionIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> }
function RefIcon({ className }: { className?: string }) { return <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" /></svg> }
