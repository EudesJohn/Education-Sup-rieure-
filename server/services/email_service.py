"""Service d'envoi d'emails pour PEAN.

Gère l'envoi d'emails transactionnels :
- Vérification d'email (inscription)
- Réinitialisation de mot de passe
- Notifications diverses

En développement, les emails sont loggés et stockés localement.
En production, utilise SMTP ou un service d'API email (SendGrid, Mailgun, etc.).
"""

import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EmailService:
    """Service d'envoi d'emails transactionnels."""

    def __init__(self):
        self.smtp_host: str = settings.SMTP_HOST or ""
        self.smtp_port: int = settings.SMTP_PORT or 587
        self.smtp_user: str = settings.SMTP_USER or ""
        self.smtp_password: str = settings.SMTP_PASSWORD or ""
        self.from_email: str = settings.FROM_EMAIL or "noreply@pean.education"
        self.app_name: str = settings.APP_NAME
        self.frontend_url: str = settings.FRONTEND_URL or "http://localhost:5173"
        self._enabled: bool = bool(self.smtp_host and self.smtp_user)

    def _is_enabled(self) -> bool:
        """Vérifie si l'envoi d'email est configuré."""
        return self._enabled

    def _log_email(self, to: str, subject: str, html: str):
        """Logge un email dans les logs (utile en développement)."""
        logger.info(
            "[EMAIL] To: %s | Subject: %s | Body preview: %s...",
            to, subject, html[:120].replace("\n", " "),
        )

    async def send_email(
        self,
        to: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
    ) -> bool:
        """Envoie un email via SMTP ou le logge en développement.

        Returns:
            True si l'email a été envoyé/loggé avec succès
        """
        # Toujours logger
        self._log_email(to, subject, html_content)

        # En développement ou sans SMTP configuré, on s'arrête là
        if settings.DEBUG or not self._is_enabled():
            logger.info("Email envoye (mode debug) : %s -> %s", subject, to)
            return True

        # En production : envoyer via SMTP
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"{self.app_name} — {subject}"
            msg["From"] = self.from_email
            msg["To"] = to

            if text_content:
                msg.attach(MIMEText(text_content, "plain"))
            msg.attach(MIMEText(html_content, "html"))

            context = ssl.create_default_context()
            with smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10) as server:
                server.starttls(context=context)
                server.login(self.smtp_user, self.smtp_password)
                server.sendmail(self.from_email, to, msg.as_string())

            logger.info("Email envoye avec succes : %s -> %s", subject, to)
            return True

        except Exception as e:
            logger.error("Echec envoi email a %s : %s", to, str(e))
            return False

    # === Templates d'emails ===

    async def send_verification_email(self, to: str, token: str) -> bool:
        """Envoie l'email de vérification avec lien de confirmation."""
        verify_url = f"{self.frontend_url}/verify-email?token={token}"
        html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0;">
<div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
  <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 32px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 22px;">{self.app_name}</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Vérification de votre adresse email</p>
  </div>
  <div style="padding: 32px;">
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">Bonjour,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Merci d'avoir créé votre compte enseignant sur <strong>{self.app_name}</strong>.
      Pour activer votre compte et accéder à toutes les fonctionnalités,
      veuillez vérifier votre adresse email en cliquant sur le bouton ci-dessous :
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{verify_url}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px;">
        Verifier mon email
      </a>
    </div>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
      Ce lien expire dans 24 heures. Si vous n'avez pas créé de compte, ignorez cet email.
    </p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">
    <p style="color: #9ca3af; font-size: 12px;">
      Lien direct : <a href="{verify_url}" style="color: #6366f1;">{verify_url}</a>
    </p>
  </div>
</div>
</body>
</html>"""
        return await self.send_email(to, "Vérification de votre adresse email", html)

    async def send_password_reset_email(self, to: str, token: str) -> bool:
        """Envoie l'email de réinitialisation de mot de passe."""
        reset_url = f"{self.frontend_url}/reset-password?token={token}"
        html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0;">
<div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
  <div style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 32px; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 22px;">{self.app_name}</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">Réinitialisation du mot de passe</p>
  </div>
  <div style="padding: 32px;">
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">Bonjour,</p>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">
      Vous avez demandé la réinitialisation de votre mot de passe.
      Cliquez sur le bouton ci-dessous pour définir un nouveau mot de passe :
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="{reset_url}" style="display: inline-block; padding: 14px 36px; background: linear-gradient(135deg, #f59e0b, #d97706); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 15px;">
        Reinitialiser mon mot de passe
      </a>
    </div>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.5;">
      Ce lien expire dans 30 minutes. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
    </p>
  </div>
</div>
</body>
</html>"""
        return await self.send_email(to, "Réinitialisation de votre mot de passe", html)

    async def send_notification(self, to: str, subject: str, message: str) -> bool:
        """Envoie une notification par email."""
        html = f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0;">
<div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
  <div style="padding: 32px;">
    <h2 style="color: #111827; margin: 0 0 12px;">{subject}</h2>
    <p style="color: #374151; font-size: 15px; line-height: 1.6;">{message}</p>
  </div>
</div>
</body>
</html>"""
        return await self.send_email(to, subject, html)


# Instance singleton
email_service = EmailService()
