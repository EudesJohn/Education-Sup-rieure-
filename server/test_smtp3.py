"""Test nouveau mot de passe d'application Gmail."""
import smtplib, ssl
from email.mime.text import MIMEText

host, port = "smtp.gmail.com", 587
user = "eudesjohn@gmail.com"
password = "tozw relt krve vdxh"  # fourni par l'utilisateur

try:
    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=10) as s:
        s.starttls(context=context)
        s.login(user, password)
        print("LOGIN OK ✅")

        # Envoyer un vrai email
        msg = MIMEText("Test SMTP depuis PEAN — nouveau mot de passe d'application ✅")
        msg["Subject"] = "Test SMTP PEAN — OK"
        msg["From"] = user
        msg["To"] = user
        s.sendmail(user, user, msg.as_string())
        print("EMAIL ENVOYÉ ✅")
except Exception as e:
    print(f"ERREUR: {type(e).__name__}: {e}")
