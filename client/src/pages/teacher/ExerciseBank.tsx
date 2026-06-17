/** Banque de questions — Salle d'Examen. */

import { useState, useEffect, type FormEvent } from 'react'
import { Layout } from '@/components/Layout'
import { api } from '@/services/api'
import type { Exercise } from '@/types'

export function ExerciseBank() {
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null)
  const [showVariants, setShowVariants] = useState<number | null>(null)

  const [form, setForm] = useState({
    title: '', subject: '', difficulty: 'medium', instructions: '',
    correct_answer: '', points: '10', exercise_type: 'open',
  })
  const [variants, setVariants] = useState<Array<{ content: string; variant_order: number }>>([])
  const [currentVariant, setCurrentVariant] = useState('')

  useEffect(() => { fetchExercises() }, [])

  const fetchExercises = async () => {
    setLoading(true)
    try { const res = await api.get('/exams/exercises'); setExercises(res.data.items || []) }
    catch (err: any) { setError(err.response?.data?.detail || 'Erreur de chargement') }
    finally { setLoading(false) }
  }

  const resetForm = () => {
    setForm({ title: '', subject: '', difficulty: 'medium', instructions: '', correct_answer: '', points: '10', exercise_type: 'open' })
    setVariants([]); setCurrentVariant(''); setEditingExercise(null); setShowCreateForm(false)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError('')
    try {
      if (editingExercise) { await api.put(`/exams/exercises/${editingExercise.id}`, form) }
      else {
        const res = await api.post('/exams/exercises', form)
        const exercise = res.data as Exercise
        for (const variant of variants) { await api.post(`/exams/exercises/${exercise.id}/variants`, variant) }
      }
      resetForm(); fetchExercises()
    } catch (err: any) { setError(err.response?.data?.detail || "Erreur lors de l'enregistrement") }
  }

  const deleteExercise = async (id: number) => {
    if (!confirm('Supprimer cet exercice ? Toutes les variantes seront supprimées.')) return
    try { await api.delete(`/exams/exercises/${id}`); fetchExercises() }
    catch (err: any) { setError(err.response?.data?.detail || 'Erreur lors de la suppression') }
  }

  const startEdit = (exercise: Exercise) => {
    setEditingExercise(exercise)
    setForm({
      title: exercise.title, subject: exercise.subject, difficulty: exercise.difficulty,
      instructions: exercise.instructions, correct_answer: exercise.correct_answer || '',
      points: String(exercise.points), exercise_type: exercise.exercise_type,
    })
    setVariants(exercise.variants || []); setShowCreateForm(true)
  }

  return (
    <Layout title="Banque de questions">
      <div className="space-y-5">
        {error && (
          <div className="bg-correcteur-clair border border-correcteur/20 text-correcteur px-4 py-3 rounded-md text-sm animate-fade-in">{error}</div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between animate-fade-in">
          <p className="text-sm text-text-secondary">{exercises.length} exercice{exercises.length !== 1 ? 's' : ''}</p>
          <button onClick={() => { resetForm(); setShowCreateForm(true) }}
            className="btn btn-primary">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Nouvel exercice
          </button>
        </div>

        {/* Formulaire */}
        {showCreateForm && (
          <div className="card p-6 animate-scale-in">
            <h3 className="font-heading font-semibold text-lg text-white mb-5">
              {editingExercise ? "Modifier l'exercice" : 'Nouvel exercice'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white mb-1.5">Titre *</label>
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="input" placeholder="Exercice 1 : Dérivation" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Matière *</label>
                  <input type="text" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="input" placeholder="Mathématiques" required />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Difficulté</label>
                  <select value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}
                    className="input">
                    <option value="easy">Facile</option>
                    <option value="medium">Moyen</option>
                    <option value="hard">Difficile</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Type</label>
                  <select value={form.exercise_type} onChange={(e) => setForm({ ...form, exercise_type: e.target.value })}
                    className="input">
                    <option value="open">Question ouverte</option>
                    <option value="qcm">QCM</option>
                    <option value="numerical">Numérique</option>
                    <option value="mixed">Mixte</option>
                    <option value="code">Code</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Points *</label>
                  <input type="number" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })}
                    className="input" min="1" required />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Consigne *</label>
                <RichEditorInline value={form.instructions} onChange={(v: string) => setForm({ ...form, instructions: v })} />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Corrigé (optionnel)</label>
                <RichEditorInline value={form.correct_answer || ''} onChange={(v: string) => setForm({ ...form, correct_answer: v })} />
              </div>

              {/* Variantes */}
              <div className="border-t border-marge pt-5">
                <h4 className="font-medium text-sm text-white mb-1">Variantes de données</h4>
                <p className="text-xs text-text-secondary mb-3">Ajoutez des variantes pour générer des épreuves uniques.</p>

                {variants.map((v, i) => (
                  <div key={i} className="flex items-start gap-2 mb-2 p-3 bg-slate-mid/30 rounded-md border border-marge">
                    <span className="text-xs font-medium text-muted mt-1 min-w-[24px]">V{i + 1}</span>
                    <pre className="flex-1 text-sm text-text-secondary whitespace-pre-wrap max-h-20 overflow-y-auto">{v.content}</pre>
                    <button type="button" onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                      className="text-muted hover:text-correcteur transition-colors p-1">✕</button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <input type="text" value={currentVariant}
                    onChange={(e) => setCurrentVariant(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (currentVariant.trim()) { setVariants([...variants, { content: currentVariant, variant_order: variants.length + 1 }]); setCurrentVariant('') } } }}
                    placeholder="Saisissez le contenu de la variante..."
                    className="input flex-1 text-sm" />
                  <button type="button" onClick={() => { if (currentVariant.trim()) { setVariants([...variants, { content: currentVariant, variant_order: variants.length + 1 }]); setCurrentVariant('') } }}
                    className="btn btn-ghost text-sm">
                    + Ajouter
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn btn-primary font-semibold">
                  {editingExercise ? 'Enregistrer' : "Créer l'exercice"}
                </button>
                <button type="button" onClick={resetForm} className="btn btn-ghost">
                  Annuler
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Liste */}
        <div className="card-plain overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-muted">
              <svg className="animate-spin w-5 h-5 mx-auto" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : exercises.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-14 h-14 bg-slate-mid/50 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <p className="text-text-secondary font-medium">Aucun exercice</p>
              <button onClick={() => { resetForm(); setShowCreateForm(true) }}
                className="mt-3 text-sm text-neon-cyan hover:text-white-clair font-medium">Créer votre premier exercice</button>
            </div>
          ) : (
            <div className="divide-y divide-marge/50">
              {exercises.map((exercise, i) => (
                <div key={exercise.id} className="px-5 py-4 hover:bg-white/[0.03] transition-all duration-200 card-hover"
                  style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-white">{exercise.title}</h4>
                        <span className={`badge ${
                          exercise.difficulty === 'easy' ? 'badge-completed' :
                          exercise.difficulty === 'hard' ? 'badge-danger' : 'badge-warning'
                        }`}>
                          {exercise.difficulty === 'easy' ? 'Facile'
                            : exercise.difficulty === 'hard' ? 'Difficile'
                            : 'Moyen'}
                        </span>
                        <span className="text-xs text-text-secondary capitalize">
                          {exercise.exercise_type === 'open' ? 'Question ouverte'
                            : exercise.exercise_type === 'qcm' ? 'QCM'
                            : exercise.exercise_type === 'code' ? 'Code'
                            : exercise.exercise_type === 'numerical' ? 'Numérique'
                            : 'Mixte'}
                        </span>
                      </div>
                      <p className="text-sm text-text-secondary">
                        {exercise.subject} — {exercise.points} pts — {exercise.variants?.length || 0} variante(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      <button onClick={() => setShowVariants(showVariants === exercise.id ? null : exercise.id)}
                        className="btn-secondary text-xs px-3 py-1.5">
                        Variantes
                      </button>
                      <button onClick={() => startEdit(exercise)}
                        className="btn-secondary text-xs px-3 py-1.5">
                        Modifier
                      </button>
                      <button onClick={() => deleteExercise(exercise.id)}
                        className="btn-danger text-xs px-3 py-1.5">
                        Supprimer
                      </button>
                    </div>
                  </div>

                  {showVariants === exercise.id && (
                    <div className="mt-3 pl-4 border-l-2 border-vert-moyen space-y-2 animate-fade-in">
                      {(!exercise.variants || exercise.variants.length === 0) ? (
                        <p className="text-sm text-muted italic">Aucune variante</p>
                      ) : (
                        exercise.variants.map((v) => (
                          <div key={v.id} className="text-sm p-2.5 bg-slate-mid/30 rounded-md border border-marge">
                            <span className="text-xs font-medium text-muted">V{v.variant_order} : </span>
                            {v.content}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

/** Version simplifiée du RichEditor pour le formulaire (évite l'import complet) */
function RichEditorInline({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="input min-h-[100px] resize-y"
      placeholder="Rédigez l'énoncé..."
    />
  )
}
