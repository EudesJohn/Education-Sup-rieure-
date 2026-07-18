"""Test SMTP Gmail avec/sans espaces."""
import smtplib, ssl

host, port = "smtp.gmail.com", 587
user = "eudesjohn@gmail.com"

for label, pwd in [
    ("AVEC espaces", "ldmx lsih hxlg pmzy"),
]:
    try:
        print(f"--- Test {label} ---")
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=10) as s:
            s.starttls(context=context)
            s.login(user, pwd)
            print("  ✅ LOGIN RÉUSSI !")
            s.quit()
    except smtplib.SMTPAuthenticationError as e:
        print(f"  ❌ Login refusé: {e.smtp_code} {e.smtp_error.decode() if isinstance(e.smtp_error, bytes) else e.smtp_error[:80]}...")
    except Exception as e:
        print(f"  ❌ Erreur: {type(e).__name__}: {e}")
