"""Test SMTP Gmail directement."""
import smtplib
import ssl
from email.mime.text import MIMEText

host = "smtp.gmail.com"
port = 587
user = "eudesjohn@gmail.com"
password = "ldmxlslhhxlgpmzy"  # sans espaces

msg = MIMEText("Ceci est un test SMTP depuis PEAN.")
msg["Subject"] = "Test SMTP PEAN"
msg["From"] = user
msg["To"] = user

try:
    print(f"Connexion à {host}:{port}...")
    context = ssl.create_default_context()
    with smtplib.SMTP(host, port, timeout=15) as server:
        server.set_debuglevel(1)
        print("STARTTLS...")
        server.starttls(context=context)
        print(f"Login {user}...")
        server.login(user, password)
        print("Envoi...")
        server.sendmail(user, user, msg.as_string())
        print("✅ EMAIL ENVOYÉ !")
except Exception as e:
    print(f"❌ ERREUR: {e}")
