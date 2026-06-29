"""Routeur pour la génération de codes d'accès étudiants par session.

Permet au professeur de :
1. Générer des codes PIN uniques (6 chiffres) pour chaque étudiant d'une session
2. Lister les codes générés
3. En option, les étudiants peuvent s'identifier avec leur PIN
"""

import io
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from core.db import (
    get_session_by_id,
    get_list_entries,
    generate_session_access_codes,
    regenerate_single_access_code,
    get_session_access_codes,
    get_access_code_by_pin,
    mark_access_code_used,
    create_audit_log,
)
from core.dependencies import get_current_teacher

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Codes d'accès étudiants"])


def _get_supabase():
    from core.supabase_client import get_supabase
    return get_supabase()


# ============================================================
# GÉNÉRATION DES CODES
# ============================================================


@router.post("/teacher/sessions/{session_id}/generate-access-codes")
async def generate_codes(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Générer des codes PIN uniques pour chaque étudiant de la session.

    Supporte deux modes :
    1. Via student_list_id (ancien système de listes manuelles)
    2. Via class_id (nouveau système — les étudiants sont gérés par l'admin)
    Chaque étudiant reçoit un code à 6 chiffres.
    Les anciens codes sont remplacés.
    """
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    # Essayer d'abord class_id (nouveau système), puis student_list_id (ancien)
    class_id = session.get("class_id")
    student_list_id = session.get("student_list_id")

    entries = []

    if class_id:
        from core.db import list_class_students
        students = list_class_students(class_id)
        for s in students:
            entries.append({
                "student_name": s["student_name"],
                "student_number": s["student_number"],
                "class_name": None,
            })
    elif student_list_id:
        entries = get_list_entries(student_list_id)

    if not entries:
        detail = "Aucun étudiant trouvé"
        if class_id:
            detail = "Aucun étudiant dans cette classe. L'admin doit d'abord inscrire des étudiants."
        elif not student_list_id:
            detail = (
                "Aucune classe ou liste d'étudiants associée à cette session. "
                "Associez d'abord une liste d'étudiants à la session "
                "(Menu Sessions → Détail de la session → Associer une liste)."
            )
        raise HTTPException(status_code=400, detail=detail)

    # Générer les codes
    codes = generate_session_access_codes(
        session_id=session_id,
        teacher_id=teacher["id"],
        entries=entries,
    )

    if not codes:
        raise HTTPException(
            status_code=500,
            detail="Erreur lors de la génération des codes",
        )

    # Journaliser
    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "access_codes_generated",
        "resource_type": "session",
        "resource_id": session_id,
        "details": json.dumps({
            "student_count": len(codes),
            "session_title": session.get("title"),
        }),
    })

    return {
        "generated": len(codes),
        "session_id": session_id,
        "session_title": session.get("title"),
        "codes": [
            {
                "id": c["id"],
                "student_name": c["student_name"],
                "student_number": c["student_number"],
                "class_name": c.get("class_name"),
                "access_pin": c["access_pin"],
                "is_used": c["is_used"],
            }
            for c in codes
        ],
        "message": f"{len(codes)} codes d'accès générés avec succès",
    }


@router.post("/teacher/sessions/{session_id}/access-codes/{student_number}/regenerate")
def regenerate_code(
    session_id: int,
    student_number: str,
    teacher: dict = Depends(get_current_teacher),
):
    """Regénérer le code PIN d'un étudiant spécifique.

    Supprime l'ancien code (s'il existe) et en génère un nouveau
    à 6 chiffres pour cet étudiant uniquement.
    """
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    new_code = regenerate_single_access_code(
        session_id=session_id,
        teacher_id=teacher["id"],
        student_number=student_number,
    )

    if not new_code:
        raise HTTPException(
            status_code=404,
            detail=f"Aucun code trouvé pour l'étudiant {student_number}",
        )

    # Journaliser
    create_audit_log({
        "actor_type": "teacher",
        "actor_id": teacher["id"],
        "action": "access_code_regenerated",
        "resource_type": "session",
        "resource_id": session_id,
        "details": json.dumps({
            "student_number": student_number,
            "student_name": new_code["student_name"],
        }),
    })

    return {
        "id": new_code["id"],
        "student_name": new_code["student_name"],
        "student_number": new_code["student_number"],
        "access_pin": new_code["access_pin"],
        "is_used": new_code["is_used"],
    }


# ============================================================
# LISTE DES CODES
# ============================================================


@router.get("/teacher/sessions/{session_id}/access-codes")
def list_access_codes(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Lister les codes d'accès d'une session."""
    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    codes = get_session_access_codes(session_id)
    total = len(codes)
    used = sum(1 for c in codes if c.get("is_used"))

    return {
        "session_id": session_id,
        "session_title": session.get("title"),
        "total": total,
        "used": used,
        "remaining": total - used,
        "codes": [
            {
                "id": c["id"],
                "student_name": c["student_name"],
                "student_number": c["student_number"],
                "class_name": c.get("class_name"),
                "access_pin": c["access_pin"],
                "is_used": c["is_used"],
                "used_at": c.get("used_at"),
            }
            for c in codes
        ],
    }


# ============================================================
# EXPORT PDF DES CODES D'ACCÈS
# ============================================================


@router.get("/teacher/sessions/{session_id}/access-codes/pdf")
def export_access_codes_pdf(
    session_id: int,
    teacher: dict = Depends(get_current_teacher),
):
    """Export des codes d'accès étudiants au format PDF.

    Génère un PDF téléchargeable listant tous les étudiants
    avec leur matricule et code PIN.
    """
    try:
        from fpdf import FPDF
    except ImportError:
        raise HTTPException(status_code=500, detail="fpdf2 n'est pas installé")

    session = get_session_by_id(session_id)
    if not session or session["teacher_id"] != teacher["id"]:
        raise HTTPException(status_code=404, detail="Session non trouvée")

    codes = get_session_access_codes(session_id)
    if not codes:
        raise HTTPException(status_code=404, detail="Aucun code d'accès généré")

    class CodesPDF(FPDF):
        def header(self):
            self.set_font("Helvetica", "B", 16)
            self.cell(0, 10, "PEAN - Codes d'acces", align="C", new_x="LMARGIN", new_y="NEXT")
            self.set_font("Helvetica", "", 10)
            self.cell(0, 6, f"Session: {session['title']}", align="C", new_x="LMARGIN", new_y="NEXT")
            self.ln(3)
            self.set_draw_color(37, 99, 235)
            self.set_line_width(0.5)
            self.line(10, self.get_y(), 200, self.get_y())
            self.ln(5)

        def footer(self):
            self.set_y(-15)
            self.set_font("Helvetica", "I", 8)
            self.set_text_color(128)
            self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    pdf = CodesPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # En-tête du tableau
    headers = ["N°", "Etudiant", "Matricule", "Code PIN"]
    col_widths = [15, 70, 50, 45]

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(37, 99, 235)
    pdf.set_text_color(255, 255, 255)
    for i, header in enumerate(headers):
        pdf.cell(col_widths[i], 8, header, border=1, fill=True, align="C")
    pdf.ln()

    # Lignes
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(0, 0, 0)

    fill = False
    for idx, code in enumerate(codes):
        if pdf.get_y() > 265:
            pdf.add_page()
            pdf.set_font("Helvetica", "B", 9)
            pdf.set_fill_color(37, 99, 235)
            pdf.set_text_color(255, 255, 255)
            for i, header in enumerate(headers):
                pdf.cell(col_widths[i], 8, header, border=1, fill=True, align="C")
            pdf.ln()
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(0, 0, 0)

        if fill:
            pdf.set_fill_color(249, 250, 251)
        else:
            pdf.set_fill_color(255, 255, 255)

        data = [
            str(idx + 1),
            code.get("student_name", "")[:35],
            code.get("student_number", "")[:20],
            code.get("access_pin", ""),
        ]
        for i, val in enumerate(data):
            pdf.cell(col_widths[i], 7, val, border=1, fill=fill, align="C" if i in (0, 3) else "L")
        pdf.ln()
        fill = not fill

    # Résumé
    pdf.ln(8)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(37, 99, 235)
    pdf.cell(0, 8, "Resume", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(0, 0, 0)
    total = len(codes)
    used = sum(1 for c in codes if c.get("is_used"))
    pdf.cell(0, 6, f"Total codes: {total}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Utilises: {used}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 6, f"Disponibles: {total - used}", new_x="LMARGIN", new_y="NEXT")

    output = io.BytesIO()
    pdf.output(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=session_{session_id}_codes_acces.pdf"},
    )


# ============================================================
# AUTHENTIFICATION PAR PIN
# ============================================================


@router.post("/sessions/auth-by-pin")
async def authenticate_by_pin(
    data: dict,
):
    """Authentifier un étudiant via son code PIN + matricule.

    Deux modes :
    1. Mode complet : { "access_pin": "123456", "student_name": "Jean", "student_number": "MAT001" }
       — vérifie nom + matricule
    2. Mode simplifié (recommandé) : { "access_pin": "123456", "student_number": "MAT001" }
       — ne vérifie que le matricule (le nom vient de la base)

    Retourne les informations de la session et de l'étudiant.
    """
    try:
        pin = (data.get("access_pin") or "").strip()
        student_name = (data.get("student_name") or "").strip()
        student_number = (data.get("student_number") or "").strip()
    except Exception as e:
        logger.error("auth-by-pin: erreur parsing body", exc_info=True)
        raise HTTPException(status_code=400, detail=f"Corps de requête invalide : {str(e)}")

    if not pin or len(pin) != 6 or not pin.isdigit():
        raise HTTPException(status_code=400, detail="Code PIN invalide (6 chiffres requis)")
    if not student_number:
        raise HTTPException(status_code=400, detail="Le numéro d'étudiant (matricule) est requis")

    try:
        # Chercher le code PIN
        code_record = get_access_code_by_pin(pin)
        if not code_record:
            raise HTTPException(
                status_code=404,
                detail="Code PIN invalide ou déjà utilisé",
            )

        # Vérifier le matricule (obligatoire)
        if code_record["student_number"].strip().lower() != student_number.lower():
            raise HTTPException(
                status_code=400,
                detail="Le matricule ne correspond pas au code PIN",
            )

        # Vérifier le nom si fourni (optionnel — mode compatible)
        if student_name and code_record["student_name"].strip().lower() != student_name.lower():
            raise HTTPException(
                status_code=400,
                detail="Le nom ne correspond pas au code PIN",
            )

        # Utiliser le nom depuis la base si non fourni
        if not student_name:
            student_name = code_record["student_name"]

        session_id = code_record["session_id"]

        # Vérifier la session
        session = get_session_by_id(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session introuvable")

        if session.get("status") not in ("active", "draft"):
            raise HTTPException(
                status_code=400,
                detail=f"Session {session.get('status')} — impossible de rejoindre",
            )

        # Marquer le code comme utilisé
        mark_access_code_used(code_record["id"])

        # Journaliser
        create_audit_log({
            "actor_type": "student",
            "actor_id": code_record["student_number"],
            "action": "student_authenticated_by_pin",
            "resource_type": "session",
            "resource_id": session_id,
            "details": json.dumps({
                "student_name": code_record["student_name"],
                "student_number": code_record["student_number"],
            }),
        })

        return {
            "student_name": code_record["student_name"],
            "student_number": code_record["student_number"],
            "class_name": code_record.get("class_name"),
            "session_id": session_id,
            "session_code": session.get("access_code"),
            "session_title": session.get("title"),
            "session_status": session.get("status"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("auth-by-pin: erreur inattendue", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Erreur interne du serveur : {str(e)}",
        )
