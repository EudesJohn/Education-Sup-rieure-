"""Service IA pour la gestion des dossiers pédagogiques (RF-06).

Analyse, classification et suggestions pédagogiques via Groq AI.
Utilise llama-3.3-70b pour l'analyse de documents et les rapports.
"""

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import httpx

from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


# ============================================================
# Dataclasses de résultat
# ============================================================

@dataclass
class ClassificationResult:
    """Résultat de la classification IA d'un document."""
    subject: str
    academic_level: str
    document_type: str
    keywords: list[str] = field(default_factory=list)
    summary: str = ""
    confidence: float = 0.0
    error: Optional[str] = None


@dataclass
class SearchResult:
    """Résultat de recherche sémantique."""
    document_id: int
    title: str
    snippet: str
    relevance: float
    document_type: str
    subject: Optional[str] = None


@dataclass
class PedagogicalSuggestion:
    """Suggestion pédagogique pour une session."""
    category: str       # 'exercise', 'resource', 'pacing', 'variation'
    title: str
    description: str
    priority: str       # 'high', 'medium', 'low'
    reason: str


@dataclass
class SessionReport:
    """Rapport de session généré par IA."""
    summary: str
    highlights: list[str] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    statistics: dict = field(default_factory=dict)
    error: Optional[str] = None


# ============================================================
# Service principal
# ============================================================

class DocumentAIService:
    """Service d'analyse IA pour les documents pédagogiques."""

    GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.model = settings.GROQ_MODEL
        self.max_tokens = settings.GROQ_MAX_TOKENS
        self.temperature = 0.2  # Plus froid pour la classification

    async def _call_groq(self, system_prompt: str, user_prompt: str) -> Optional[str]:
        """Appeler l'API Groq avec un prompt système + utilisateur."""
        if not self.api_key:
            logger.warning("GROQ_API_KEY non configurée — analyse IA désactivée")
            return None

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    self.GROQ_URL,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt},
                        ],
                        "temperature": self.temperature,
                        "max_tokens": self.max_tokens,
                    },
                )
                response.raise_for_status()
                data = response.json()
                return data["choices"][0]["message"]["content"]
        except httpx.TimeoutException:
            logger.error("Timeout lors de l'appel Groq pour l'analyse de document")
            return None
        except Exception as e:
            logger.exception("Erreur lors de l'appel Groq : %s", e)
            return None

    def _extract_json(self, text: Optional[str]) -> Optional[dict]:
        """Extrait un objet JSON depuis la réponse texte."""
        if not text:
            return None
        # Chercher ```json ... ``` ou ``` ... ```
        match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
        if match:
            try:
                return json.loads(match.group(1))
            except json.JSONDecodeError:
                pass
        # Sinon, essayer de parser le texte directement
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return None

    # ============================================================
    # Classification de document
    # ============================================================

    async def classify_document(
        self,
        title: str,
        content_preview: str,
        filename: str,
    ) -> ClassificationResult:
        """Classifie un document pédagogique (matière, niveau, type, mots-clés).

        Args:
            title: Titre du document (ou nom de fichier)
            content_preview: Extrait du contenu (max 3000 caractères)
            filename: Nom du fichier original
        """
        system_prompt = (
            "Tu es un assistant pédagogique qui analyse des documents académiques. "
            "Réponds UNIQUEMENT avec un objet JSON valide, sans texte avant ni après. "
            "Utilise ce format exact :\n"
            "{\n"
            '  "subject": "nom de la matière en français (ex: Mathématiques, Informatique, Physique)",\n'
            '  "academic_level": "niveau (ex: L1, L2, L3, M1, M2, Doctorat, Lycée)",\n'
            '  "document_type": "course" ou "td" ou "tp" ou "exam" ou "correction" ou "reference",\n'
            '  "keywords": ["mot-clé1", "mot-clé2", "mot-clé3", ...],\n'
            '  "summary": "résumé du document en 2-3 phrases en français",\n'
            '  "confidence": 0.95\n'
            "}"
        )

        user_prompt = (
            f"Titre : {title}\n"
            f"Fichier : {filename}\n"
            f"Contenu extrait (début) :\n{content_preview[:3000]}"
        )

        response = await self._call_groq(system_prompt, user_prompt)
        data = self._extract_json(response)

        if not data:
            return ClassificationResult(
                subject="Non classifié",
                academic_level="Non spécifié",
                document_type="other",
                keywords=[],
                summary="",
                confidence=0.0,
                error="Impossible d'analyser le document avec l'IA",
            )

        return ClassificationResult(
            subject=data.get("subject", "Non classifié"),
            academic_level=data.get("academic_level", "Non spécifié"),
            document_type=data.get("document_type", "other"),
            keywords=data.get("keywords", []),
            summary=data.get("summary", ""),
            confidence=data.get("confidence", 0.5),
        )

    # ============================================================
    # Recherche sémantique
    # ============================================================

    async def search_documents(
        self,
        teacher_id: int,
        query: str,
        documents: list[dict],
    ) -> list[SearchResult]:
        """Recherche intelligente dans les documents.

        Utilise l'IA quand la recherche full-text ne donne pas assez de résultats.
        """
        from core.db import search_pedagogical_documents

        # D'abord, recherche full-text via PostgreSQL
        results = search_pedagogical_documents(teacher_id, query)

        if results:
            # Conversion en SearchResult
            return [
                SearchResult(
                    document_id=doc["id"],
                    title=doc["title"],
                    snippet=(doc.get("description") or doc.get("ai_classification", {}).get("summary", ""))[:200],
                    relevance=1.0,
                    document_type=doc.get("document_type", "other"),
                    subject=doc.get("subject"),
                )
                for doc in results[:10]
            ]

        # Si pas de résultat, tenter une recherche sémantique via IA
        if not documents:
            return []

        system_prompt = (
            "Tu es un assistant de recherche documentaire. "
            "À partir de la liste de documents fournie et de la requête de l'utilisateur, "
            "trouve les documents les plus pertinents. "
            "Réponds UNIQUEMENT avec un tableau JSON contenant les index des documents triés par pertinence :\n"
            '[{"index": 2, "reason": "raison très courte"}, ...]\n'
            "Maximum 5 résultats."
        )

        docs_text = "\n".join(
            f"[{i}] {d.get('title', 'Sans titre')} — {d.get('subject', '')} — {d.get('description', '')[:100]}"
            for i, d in enumerate(documents[:30])
        )

        response = await self._call_groq(system_prompt, f"Requête : {query}\n\nDocuments :\n{docs_text}")
        data = self._extract_json(response)

        if not data or not isinstance(data, list):
            return []

        return [
            SearchResult(
                document_id=documents[item.get("index", 0)].get("id", 0),
                title=documents[item.get("index", 0)].get("title", ""),
                snippet=item.get("reason", ""),
                relevance=max(0, 1.0 - i * 0.2),
                document_type=documents[item.get("index", 0)].get("document_type", "other"),
                subject=documents[item.get("index", 0)].get("subject"),
            )
            for i, item in enumerate(data)
            if isinstance(item, dict) and item.get("index", -1) < len(documents)
        ]

    # ============================================================
    # Suggestions pédagogiques
    # ============================================================

    async def generate_suggestions(
        self,
        session_title: str,
        subject: str,
        student_count: int,
        exercises: list[dict],
        documents: list[dict],
    ) -> list[PedagogicalSuggestion]:
        """Génère des suggestions pédagogiques pour une session."""
        system_prompt = (
            "Tu es un conseiller pédagogique IA. Analyse la session d'examen "
            "et propose 3-5 suggestions pour améliorer l'enseignement. "
            "Réponds UNIQUEMENT avec un tableau JSON :\n"
            '[\n'
            '  {\n'
            '    "category": "exercise"|"resource"|"pacing"|"variation",\n'
            '    "title": "titre court",\n'
            '    "description": "description détaillée",\n'
            '    "priority": "high"|"medium"|"low",\n'
            '    "reason": "justification pédagogique"\n'
            '  }\n'
            ']'
        )

        exercises_text = "\n".join(
            f"- {e.get('title', 'Sans titre')} ({e.get('exercise_type', 'open')}, {e.get('difficulty', 'medium')}, {e.get('points', 0)}pts)"
            for e in exercises[:10]
        )
        docs_text = "\n".join(
            f"- {d.get('title', 'Sans titre')} ({d.get('subject', '')}, {d.get('document_type', 'other')})"
            for d in documents[:10]
        )

        user_prompt = (
            f"Session : {session_title}\n"
            f"Matière : {subject}\n"
            f"Nombre d'étudiants : {student_count}\n\n"
            f"Exercices :\n{exercises_text if exercises_text else '(aucun)'}\n\n"
            f"Documents pédagogiques disponibles :\n{docs_text if docs_text else '(aucun)'}"
        )

        response = await self._call_groq(system_prompt, user_prompt)
        data = self._extract_json(response)

        if not data or not isinstance(data, list):
            return []

        return [
            PedagogicalSuggestion(
                category=item.get("category", "resource"),
                title=item.get("title", ""),
                description=item.get("description", ""),
                priority=item.get("priority", "low"),
                reason=item.get("reason", ""),
            )
            for item in data
        ]

    # ============================================================
    # Rapport de session
    # ============================================================

    async def generate_session_report(
        self,
        session: dict,
        submissions: list[dict],
        corrections: list[dict],
        exercises: list[dict],
    ) -> SessionReport:
        """Génère un rapport de session avec analyse IA."""
        system_prompt = (
            "Tu es un rapporteur pédagogique IA. Génère un rapport de session d'examen. "
            "Réponds UNIQUEMENT avec un objet JSON :\n"
            "{\n"
            '  "summary": "résumé global de la session en 3-5 phrases",\n'
            '  "highlights": ["point fort 1", "point fort 2", ...],\n'
            '  "recommendations": ["recommandation 1", "recommandation 2", ...],\n'
            '  "statistics": {\n'
            '    "average_score": 12.5,\n'
            '    "median_score": 13.0,\n'
            '    "success_rate": 0.75,\n'
            '    "highest_score": 19,\n'
            '    "lowest_score": 4\n'
            '  }\n'
            "}"
        )

        # Calculer les stats
        scores = []
        for c in corrections:
            score = c.get("final_score") or c.get("ai_score")
            if score is not None:
                scores.append(float(score))

        avg_score = sum(scores) / len(scores) if scores else 0
        sorted_scores = sorted(scores)
        median = sorted_scores[len(sorted_scores) // 2] if sorted_scores else 0
        success_rate = sum(1 for s in scores if s >= 10) / len(scores) if scores else 0

        user_prompt = (
            f"Session : {session.get('title', 'Sans titre')}\n"
            f"Matière : {session.get('subject', '')}\n"
            f"Étudiants : {len(submissions)}/{session.get('student_count', 0)}\n"
            f"Exercices : {len(exercises)}\n"
            f"Score moyen : {avg_score:.1f}/20\n"
            f"Médiane : {median:.1f}/20\n"
            f"Taux de réussite : {success_rate*100:.0f}%\n"
            f"Notes : {', '.join(f'{s:.1f}' for s in sorted_scores[:10])}{'...' if len(scores) > 10 else ''}"
        )

        response = await self._call_groq(system_prompt, user_prompt)
        data = self._extract_json(response)

        if not data:
            return SessionReport(
                summary="Rapport non disponible",
                error="L'analyse IA n'a pas pu être générée",
                statistics={
                    "average_score": round(avg_score, 1),
                    "median_score": round(median, 1),
                    "success_rate": round(success_rate, 2),
                    "highest_score": max(scores) if scores else 0,
                    "lowest_score": min(scores) if scores else 0,
                    "total_submissions": len(submissions),
                },
            )

        stats = data.get("statistics", {})
        # S'assurer que les stats calculées sont présentes
        if "average_score" not in stats and avg_score:
            stats["average_score"] = round(avg_score, 1)
        if "total_submissions" not in stats:
            stats["total_submissions"] = len(submissions)

        return SessionReport(
            summary=data.get("summary", ""),
            highlights=data.get("highlights", []),
            recommendations=data.get("recommendations", []),
            statistics=stats,
        )


# Instance singleton
document_ai_service = DocumentAIService()
