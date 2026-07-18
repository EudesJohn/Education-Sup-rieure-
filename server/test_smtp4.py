import smtplib, ssl, sys

host, port = "smtp.gmail.com", 587
user = "eudesjohn@gmail.com"
password = "mngy znqj nksw iiea"

for label, pwd in [("avec espaces", password), ("sans espaces", password.replace(" ", ""))]:
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(host, port, timeout=10) as s:
            s.starttls(context=context)
            s.login(user, pwd)
            print(f"OK [{label}]")
            sys.exit(0)
    except smtplib.SMTPAuthenticationError:
        print(f"REFUSE [{label}]")
    except Exception as e:
        print(f"ERREUR [{label}]: {type(e).__name__}")

print("TOUS REFUSES")
