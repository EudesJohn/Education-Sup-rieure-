"""Vérification DB + test email."""
import sys, os

# Ajouter le dossier server au path
sys.path.insert(0, r"D:\Etudiant Note\server")
sys.path.insert(0, r"D:\Etudiant Note\server\server")

# Env vars pour la connexion
os.environ["SUPABASE_URL"] = "https://jkjvoipvnodkwoqpvnob.supabase.co"
os.environ["SUPABASE_SERVICE_KEY"] = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpranZvaXB2bm9ka3dvcXB2bm9iIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDc2MTE5OSwiZXhwIjoyMDU2MzM3MTk5fQ.DSR5tsHJ6sAU7iD9e1Q5fZIIfpmRNKW_jqj5Ojj1FWg"
os.environ["JWT_SECRET_KEY"] = "dev-check-key-2026-not-for-prod-xxx"
os.environ["DEBUG"] = "False"
os.environ["SMTP_HOST"] = "smtp.gmail.com"
os.environ["SMTP_PORT"] = "587"
os.environ["SMTP_USER"] = "eudesjohn@gmail.com"
os.environ["SMTP_PASSWORD"] = "ldmx lsih hxlg pmzy"
os.environ["FROM_EMAIL"] = "eudesjohn@gmail.com"
os.environ["FRONTEND_URL"] = "https://education-sup-rieure-r1h3.vercel.app"

from core.db import get_teacher_by_email

# 1. Vérifier les comptes récents
print("=== COMPTES ===")
for email in ["eudesjohn@gmail.com"]:
    t = get_teacher_by_email(email)
    if t:
        print(f"  {email}: id={t['id']}, verified={t['is_verified']}, role={t['role']}, 2fa={t.get('is_2fa_enabled')}")
    else:
        print(f"  {email}: non trouvé")

# 2. Chercher tout compte non vérifié
from core.supabase_client import get_supabase
supabase = get_supabase()
result = supabase.table("teachers").select("id, email, full_name, is_verified, created_at").eq("is_verified", False).order("created_at", desc=True).limit(5).execute()
if result.data:
    print("\n=== COMPTES NON VÉRIFIÉS (5 plus récents) ===")
    for t in result.data:
        print(f"  id={t['id']}, email={t['email']}, full_name={t['full_name']}, created={t['created_at']}")

# 3. Test d'envoi d'email direct
print("\n=== TEST ENVOI EMAIL ===")
from services.email_service import email_service
import asyncio

async def test_send():
    from core.security import create_access_token
    from datetime import timedelta

    # Test avec un email factice
    token = create_access_token(data={"sub": "999", "type": "email_verify"}, expires_delta=timedelta(hours=24))
    print(f"  Token généré: {token[:50]}...")

    success = await email_service.send_verification_email("eudesjohn@gmail.com", token)
    print(f"  Envoi email: {'✅ RÉUSSI' if success else '❌ ÉCHEC'}")

    # Vérifier la config SMTP
    print(f"  SMTP config: host={email_service.smtp_host}, port={email_service.smtp_port}")
    print(f"  SMTP user: {email_service.smtp_user}")
    print(f"  SMTP enabled: {email_service._enabled}")

asyncio.run(test_send())
