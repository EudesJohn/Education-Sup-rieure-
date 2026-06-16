/** Mini-formulaire pour les étudiants — saisie du code de session et redirection. */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export function StudentAccessForm() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = code.trim().toUpperCase()
    if (trimmed) {
      navigate(`/exam/${trimmed}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        className="input flex-1 text-sm py-2"
        placeholder="Code de session (ex: ABC123)"
        required
        autoComplete="off"
      />
      <button
        type="submit"
        disabled={!code.trim()}
        className="btn btn-primary px-4 py-2 text-sm font-medium whitespace-nowrap disabled:opacity-50"
      >
        Accéder
      </button>
    </form>
  )
}
