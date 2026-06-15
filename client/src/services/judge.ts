/** Client API pour le service d'exécution de code (Judge). */

import { api } from './api'
import type {
  CodeRunRequest,
  CodeRunResponse,
  CodeSubmitRequest,
  CodeSubmitResponse,
} from '@/types'

export const judgeApi = {
  /** Liste les langages de programmation disponibles. */
  async listLanguages(): Promise<Array<{ id: string; name: string; extension: string }>> {
    const res = await api.get('/judge/languages')
    return res.data
  },

  /** Exécute du code (test rapide). */
  async runCode(data: CodeRunRequest): Promise<CodeRunResponse> {
    const res = await api.post('/judge/run', data)
    return res.data
  },

  /** Soumet du code avec cas de test. */
  async submitCode(data: CodeSubmitRequest): Promise<CodeSubmitResponse> {
    const res = await api.post('/judge/submit', data)
    return res.data
  },
}
