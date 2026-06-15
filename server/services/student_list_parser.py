"""Service de parsing et détection de colonnes pour l'import de listes étudiants.

Support : CSV, Excel (.xlsx), PDF (tableaux structurés)
Détection automatique des colonnes : Nom, Prénom, Matricule, Email, Classe

CDC v2.2 — RF-02 : Import et Vérification de la Liste des Étudiants
"""

import csv
import io
import json
import logging
import re
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# Mapping heuristique : variations possibles pour chaque colonne cible
COLUMN_PATTERNS = {
    "student_name": [
        "nom", "prénom", "nom complet", "name", "full name", "names",
        "student name", "nom et prénoms", "nom & prénoms", "nom et prenom",
    ],
    "student_number": [
        "matricule", "numéro", "numero", "id", "student id", "student number",
        "n°", "no", "identifiant", "code", "matricule étudiant",
    ],
    "email": [
        "email", "e-mail", "e mail", "courriel", "mail", "email address",
    ],
    "class_name": [
        "classe", "clas", "groupe", "group", "promotion", "niveau", "level",
        "section", "parcours", "filière", "filiere", "option",
    ],
}


# Score de confiance minimum pour accepter une détection automatique
CONFIDENCE_THRESHOLD = 0.6


@dataclass
class ColumnMapping:
    """Mapping détecté entre les colonnes du fichier et les champs cibles."""
    student_name: Optional[str] = None      # Nom de colonne détecté pour le nom
    student_number: Optional[str] = None    # ... pour le matricule
    email: Optional[str] = None             # ... pour l'email
    class_name: Optional[str] = None        # ... pour la classe
    confidence: float = 0.0                 # Score global de confiance (0-1)
    unmapped: list[str] = field(default_factory=list)


@dataclass
class ParseResult:
    """Résultat du parsing d'un fichier d'import."""
    success: bool
    entries: list[dict] = field(default_factory=list)   # Données parsées
    headers: list[str] = field(default_factory=list)    # En-têtes originales
    column_mapping: Optional[ColumnMapping] = None      # Mapping détecté
    total_rows: int = 0
    error_rows: list[dict] = field(default_factory=list) # Lignes en erreur
    warnings: list[str] = field(default_factory=list)    # Avertissements
    error: Optional[str] = None                          # Erreur fatale


class StudentListParser:
    """Parse un fichier d'import et retourne les données structurées.

    Formats supportés : CSV, Excel (.xlsx), PDF (tableaux textuels)
    """

    SUPPORTED_EXTENSIONS = {'.csv', '.xlsx', '.xls', '.pdf'}

    def parse(self, filename: str, content: bytes) -> ParseResult:
        """Point d'entrée : détecte le format et parse."""
        ext = self._detect_extension(filename)

        if ext == '.csv':
            return self._parse_csv(content)
        elif ext in ('.xlsx', '.xls'):
            return self._parse_xlsx(content)
        elif ext == '.pdf':
            return self._parse_pdf(content)
        else:
            return ParseResult(
                success=False,
                error=f"Format non supporté : {ext}. Formats acceptés : {', '.join(self.SUPPORTED_EXTENSIONS)}"
            )

    def _detect_extension(self, filename: str) -> str:
        """Détecte l'extension du fichier (insensible à la casse)."""
        _, ext = filename.lower().rsplit('.', 1) if '.' in filename else ('', '')
        return f'.{ext}' if ext else ''

    def detect_columns(self, headers: list[str]) -> ColumnMapping:
        """Détecte automatiquement les colonnes par correspondance floue.

        Utilise une heuristique simple : normalise les en-têtes et les compare
        aux patterns connus. Retourne le mapping avec un score de confiance.
        """
        mapping = ColumnMapping()
        matched = set()

        for header in headers:
            normalized = self._normalize_header(header)

            for target_field, patterns in COLUMN_PATTERNS.items():
                if target_field in matched:
                    continue

                # Chercher une correspondance exacte ou partielle
                for pattern in patterns:
                    if normalized == pattern:
                        setattr(mapping, target_field, header)
                        matched.add(target_field)
                        break
                    elif pattern in normalized or normalized in pattern:
                        # Correspondance partielle — on prend mais avec pénalité
                        if getattr(mapping, target_field) is None:
                            setattr(mapping, target_field, header)
                            matched.add(target_field)

        # Calculer le score de confiance
        required_fields = ['student_name', 'student_number']
        found_required = sum(1 for f in required_fields if getattr(mapping, f) is not None)
        mapping.confidence = found_required / len(required_fields)

        # Colonnes non mappées
        mapped_headers = {getattr(mapping, f) for f in COLUMN_PATTERNS.keys() if getattr(mapping, f)}
        mapping.unmapped = [h for h in headers if h not in mapped_headers]

        return mapping

    def _normalize_header(self, header: str) -> str:
        """Normalise un en-tête de colonne pour la comparaison."""
        h = header.lower().strip()
        # Supprimer les accents courants
        h = h.replace('é', 'e').replace('è', 'e').replace('ê', 'e')
        h = h.replace('à', 'a').replace('â', 'a')
        h = h.replace('ù', 'u').replace('û', 'u')
        h = h.replace('ô', 'o')
        h = h.replace('ç', 'c')
        h = h.replace('î', 'i').replace('ï', 'i')
        # Supprimer les caractères spéciaux
        h = re.sub(r'[^\w\s]', ' ', h)
        # Normaliser les espaces
        h = re.sub(r'\s+', ' ', h).strip()
        return h

    def _parse_csv(self, content: bytes) -> ParseResult:
        """Parse un fichier CSV avec détection automatique du délimiteur."""
        try:
            # Essayer d'abord UTF-8, puis Latin-1
            try:
                text = content.decode('utf-8-sig')
            except UnicodeDecodeError:
                text = content.decode('latin-1')

            # Détecter le délimiteur (, ou ;)
            delimiter = self._detect_csv_delimiter(text)

            reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
            headers = reader.fieldnames or []
            if not headers:
                return ParseResult(success=False, error="Fichier CSV vide ou illisible")

            # Détecter les colonnes
            mapping = self.detect_columns(headers)
            if not mapping.student_name or not mapping.student_number:
                return ParseResult(
                    success=False,
                    error="Impossible de détecter les colonnes 'Nom' et 'Matricule' dans le fichier. "
                          "Veuillez vérifier que le fichier contient bien ces colonnes.",
                    headers=headers,
                    column_mapping=mapping,
                )

            # Extraire les données
            entries = []
            error_rows = []
            warnings = []

            for idx, row in enumerate(reader):
                try:
                    student_name = (row.get(mapping.student_name) or '').strip()
                    student_number = (row.get(mapping.student_number) or '').strip()

                    if not student_name and not student_number:
                        continue  # Ligne vide
                    if not student_name:
                        error_rows.append({"row": idx + 2, "reason": "Nom manquant", "data": dict(row)})
                        continue
                    if not student_number:
                        error_rows.append({"row": idx + 2, "reason": "Matricule manquant", "data": dict(row)})
                        continue

                    email = (row.get(mapping.email) or '').strip() if mapping.email else ''
                    class_name = (row.get(mapping.class_name) or '').strip() if mapping.class_name else ''

                    entries.append({
                        "student_name": student_name,
                        "student_number": student_number,
                        "email": email or None,
                        "class_name": class_name or None,
                        "row_index": idx + 1,
                    })
                except Exception as e:
                    error_rows.append({"row": idx + 2, "reason": str(e), "data": dict(row) if row else {}})

            # Vérifier les doublons de matricule
            numbers_seen = {}
            for entry in entries:
                num = entry["student_number"]
                if num in numbers_seen:
                    warnings.append(f"Matricule '{num}' apparaît plusieurs fois (lignes {numbers_seen[num]}, {entry.get('row_index') or '?'}). \
Seule la 1ère occurrence sera conservée.")
                numbers_seen[num] = numbers_seen.get(num, 0) + 1

            # Dédupliquer (conserver la 1ère occurrence)
            seen = set()
            unique_entries = []
            for entry in entries:
                if entry["student_number"] not in seen:
                    seen.add(entry["student_number"])
                    unique_entries.append(entry)

            return ParseResult(
                success=True,
                entries=unique_entries,
                headers=headers,
                column_mapping=mapping,
                total_rows=len(unique_entries),
                error_rows=error_rows,
                warnings=warnings,
            )

        except Exception as e:
            logger.exception("Erreur lors du parsing CSV")
            return ParseResult(success=False, error=f"Erreur de parsing CSV : {str(e)}")

    def _detect_csv_delimiter(self, text: str) -> str:
        """Détecte le délimiteur CSV (priorité à ';' si présent)."""
        first_lines = text.split('\n')[:5]
        semicolon_count = sum(line.count(';') for line in first_lines)
        comma_count = sum(line.count(',') for line in first_lines)
        return ';' if semicolon_count > comma_count else ','

    def _parse_xlsx(self, content: bytes) -> ParseResult:
        """Parse un fichier Excel (.xlsx)."""
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            if ws is None:
                return ParseResult(success=False, error="Le fichier Excel ne contient pas de feuille active")

            rows = list(ws.iter_rows(values_only=True))
            if not rows:
                return ParseResult(success=False, error="Fichier Excel vide")

            headers = [str(h).strip() if h is not None else '' for h in rows[0]]
            if not any(headers):
                return ParseResult(success=False, error="La première ligne (en-têtes) est vide")

            mapping = self.detect_columns(headers)
            if not mapping.student_name or not mapping.student_number:
                return ParseResult(
                    success=False,
                    error="Impossible de détecter les colonnes 'Nom' et 'Matricule' dans le fichier.",
                    headers=headers,
                    column_mapping=mapping,
                )

            # Index des colonnes
            name_idx = headers.index(mapping.student_name)
            number_idx = headers.index(mapping.student_number)
            email_idx = headers.index(mapping.email) if mapping.email else None
            class_idx = headers.index(mapping.class_name) if mapping.class_name else None

            entries = []
            error_rows = []
            for idx, row in enumerate(rows[1:], start=1):
                try:
                    student_name = str(row[name_idx]).strip() if row[name_idx] is not None else ''
                    student_number = str(row[number_idx]).strip() if row[number_idx] is not None else ''

                    if not student_name and not student_number:
                        continue
                    if not student_name:
                        error_rows.append({"row": idx + 1, "reason": "Nom manquant"})
                        continue
                    if not student_number:
                        error_rows.append({"row": idx + 1, "reason": "Matricule manquant"})
                        continue

                    email = str(row[email_idx]).strip() if email_idx is not None and row[email_idx] else ''
                    class_name = str(row[class_idx]).strip() if class_idx is not None and row[class_idx] else ''

                    entries.append({
                        "student_name": student_name,
                        "student_number": student_number,
                        "email": email or None,
                        "class_name": class_name or None,
                        "row_index": idx + 1,
                    })
                except Exception as e:
                    error_rows.append({"row": idx + 1, "reason": str(e)})

            # Déduplication
            seen = set()
            unique_entries = []
            for entry in entries:
                if entry["student_number"] not in seen:
                    seen.add(entry["student_number"])
                    unique_entries.append(entry)

            wb.close()
            return ParseResult(
                success=True,
                entries=unique_entries,
                headers=headers,
                column_mapping=mapping,
                total_rows=len(unique_entries),
                error_rows=error_rows,
            )

        except ImportError:
            return ParseResult(success=False, error="Bibliothèque 'openpyxl' non installée. Impossible de parser les fichiers Excel.")
        except Exception as e:
            logger.exception("Erreur lors du parsing Excel")
            return ParseResult(success=False, error=f"Erreur de parsing Excel : {str(e)}")

    def _parse_pdf(self, content: bytes) -> ParseResult:
        """Parse un fichier PDF (tableaux textuels extraits).

        Utilise pypdf pour l'extraction texte + analyse heuristique des tableaux.
        Pour les PDF complexes, recommande la conversion en CSV.
        """
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            all_text = ""
            for page in reader.pages:
                page_text = page.extract_text()
                if page_text:
                    all_text += page_text + "\n"

            if not all_text.strip():
                return ParseResult(
                    success=False,
                    error="Le PDF ne contient pas de texte exploitable. "
                          "Essayez d'exporter en CSV depuis votre système de gestion académique."
                )

            # Analyse heuristique : détecter si c'est un tableau structuré
            lines = all_text.strip().split('\n')
            # Essayer de détecter un séparateur tabulaire
            tab_lines = [l for l in lines if '\t' in l]

            if len(tab_lines) >= 2:
                # Format avec tabs — traiter comme TSV
                tsv_content = '\n'.join(tab_lines)
                return self._parse_csv(tsv_content.encode('utf-8'))

            # Essayer de détecter des colonnes par espacement
            # Premier essai : la première ligne contient les en-têtes
            headers_line = lines[0] if lines else ''
            headers = re.split(r'\s{2,}|\t', headers_line.strip())
            headers = [h.strip() for h in headers if h.strip()]

            if len(headers) >= 2:
                # Simuler un CSV avec ces colonnes
                csv_lines = [';'.join(headers)]
                for line in lines[1:]:
                    if line.strip():
                        cols = re.split(r'\s{2,}|\t', line.strip())
                        csv_lines.append(';'.join(cols))
                csv_content = '\n'.join(csv_lines)
                return self._parse_csv(csv_content.encode('utf-8'))

            # Si tout échoue, on ne peut pas parser ce PDF
            return ParseResult(
                success=False,
                error="Le format du PDF n'a pas pu être analysé automatiquement. "
                      "Veuillez exporter votre liste au format CSV depuis votre système de gestion académique.",
                warnings=[
                    "L'extraction depuis un PDF est limitée. Le format CSV est fortement recommandé "
                    "pour une meilleure fiabilité de l'import."
                ]
            )

        except ImportError:
            return ParseResult(success=False, error="Bibliothèque 'pypdf' non installée.")
        except Exception as e:
            logger.exception("Erreur lors du parsing PDF")
            return ParseResult(success=False, error=f"Erreur de parsing PDF : {str(e)}")

    def validate_entries(
        self,
        entries: list[dict],
        expected_count: Optional[int] = None,
    ) -> tuple[list[str], int, int]:
        """Valide les entrées parsées.

        Retourne : (warnings, valid_count, duplicate_count)
        """
        warnings = []
        seen_numbers = set()
        duplicates = 0

        for entry in entries:
            num = entry.get("student_number", "")
            if num in seen_numbers:
                duplicates += 1
                warnings.append(f"Matricule en double ignoré : {num}")
            seen_numbers.add(num)

        valid_count = len(entries) - duplicates

        if expected_count and valid_count != expected_count:
            warnings.append(
                f"Nombre d'étudiants importé ({valid_count}) différent du nombre configuré "
                f"pour la session ({expected_count}). Vérifiez la cohérence."
            )

        return warnings, valid_count, duplicates


# Alias pour import facile
parse_student_list = StudentListParser().parse
detect_columns = StudentListParser().detect_columns
