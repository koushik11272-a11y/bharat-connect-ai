"""
email_service.py

Reusable Email Notification Service for BharatConnect AI.
Dispatches admin notifications for user registrations and trip creations using Gmail SMTP.

Includes:
- Automatic environment variable loading from .env
- Clearly labeled MOCK MODE when Gmail credentials are not configured
- Complete resilience against SMTP network/authentication failures
- Strict security: Never formats or transmits passwords, hashes, salts, or tokens
"""

import os
import json
import re
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from typing import Optional, Dict, Any, List

# Configure logger for email operations
logger = logging.getLogger("bharatconnect.email")
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter("[%(levelname)s] %(asctime)s - %(name)s: %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)

def load_env_file(filepath: Optional[str] = None) -> Dict[str, str]:
    """
    Lightweight, robust .env parser without external dependencies.
    Reads key-value pairs into os.environ if not already defined.
    """
    loaded = {}
    if filepath is None:
        base_dir = os.path.dirname(os.path.abspath(__file__))
        filepath = os.path.join(base_dir, ".env")

    if not os.path.isfile(filepath):
        return loaded

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    if key not in os.environ:
                        os.environ[key] = val
                    loaded[key] = val
    except Exception as e:
        logger.warning(f"Failed to parse .env file at {filepath}: {e}")
    return loaded

# Load environment on module import
load_env_file()


class EmailNotificationService:
    """
    Reusable service for sending admin notifications via Gmail SMTP or Mock Mode.
    """

    def __init__(self, env_file: Optional[str] = None):
        self.env_file = env_file
        self.sent_emails: List[Dict[str, Any]] = []
        self.reload_config()

    def reload_config(self):
        """Reload configuration from .env and os.environ."""
        load_env_file(self.env_file)
        self.smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
        try:
            self.smtp_port = int(os.getenv("SMTP_PORT", "587"))
        except (ValueError, TypeError):
            self.smtp_port = 587

        self.smtp_username = (os.getenv("SMTP_USERNAME") or "").strip()
        self.smtp_password = (os.getenv("SMTP_PASSWORD") or "").strip()
        self.admin_email = (os.getenv("ADMIN_EMAIL") or "").strip()

    def is_configured(self) -> bool:
        """
        Check if valid Gmail SMTP credentials are configured.
        Returns False if username, password, or admin email are missing or placeholders.
        """
        if not self.smtp_username or not self.smtp_password or not self.admin_email:
            return False

        # Detect common template placeholders
        placeholders = [
            "your_email@gmail.com",
            "your_admin_email@gmail.com",
            "admin_notifications@gmail.com",
            "your_app_password",
            "your_16_char_app_password",
            "placeholder"
        ]
        if self.smtp_username.lower() in placeholders or self.smtp_password.lower() in placeholders:
            return False

        # Basic email check on username and admin_email
        email_pattern = r"^[\w\.\+\-]+@[a-zA-Z0-9\-]+(\.[a-zA-Z0-9\-]+)+$"
        if not re.match(email_pattern, self.smtp_username) or not re.match(email_pattern, self.admin_email):
            return False

        return True

    def _record_email(self, record: Dict[str, Any]):
        """Record email in memory and persist to data/email_notifications.json for cross-process access."""
        self.sent_emails.append(record)
        try:
            data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
            os.makedirs(data_dir, exist_ok=True)
            store_path = os.path.join(data_dir, "email_notifications.json")
            items = []
            if os.path.isfile(store_path):
                with open(store_path, "r", encoding="utf-8") as f:
                    items = json.load(f)
            items.append(record)
            with open(store_path, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning(f"Could not persist notification record: {e}")

    def send_email(
        self,
        subject: str,
        text_body: str,
        html_body: Optional[str] = None,
        recipient: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send an email notification to the administrator.
        Operates in MOCK MODE if credentials are unconfigured or invalid.
        Never crashes or raises an exception to the caller.
        """
        to_email = recipient or self.admin_email or "admin-unconfigured@bharatconnect.ai"
        timestamp = datetime.utcnow().isoformat() + "Z"

        # Check for simulated failure (useful for resilience testing across processes)
        if os.getenv("SIMULATE_EMAIL_FAILURE", "").strip().lower() in ("1", "true", "yes"):
            err_msg = "Simulated SMTP failure (SIMULATE_EMAIL_FAILURE active)"
            logger.warning(f"[EMAIL FAILURE SIMULATED] {err_msg}")
            failed_record = {
                "timestamp": timestamp,
                "is_mock": False,
                "recipient": to_email,
                "subject": subject,
                "error": err_msg,
                "status": "SIMULATED_FAILURE"
            }
            self._record_email(failed_record)
            return {
                "success": False,
                "mock": False,
                "recipient": to_email,
                "subject": subject,
                "error": err_msg,
                "message": f"Failed to send email to {to_email}: {err_msg}",
                "record": failed_record
            }

        # Check for MOCK MODE
        if not self.is_configured():
            mock_record = {
                "timestamp": timestamp,
                "is_mock": True,
                "recipient": to_email,
                "subject": subject,
                "text_body": text_body,
                "html_body": html_body,
                "status": "MOCK_DISPATCHED"
            }
            self._record_email(mock_record)

            # Clearly labeled log output - explicitly states NO real email was sent
            logger.info("=" * 65)
            logger.info("[MOCK MODE - NO REAL EMAIL SENT: Gmail credentials not configured]")
            logger.info(f"Recipient: {to_email}")
            logger.info(f"Subject:   {subject}")
            logger.info("Message Body:")
            for line in text_body.strip().split("\n"):
                logger.info(f"  {line}")
            logger.info("=" * 65)

            return {
                "success": True,
                "mock": True,
                "recipient": to_email,
                "subject": subject,
                "message": "[MOCK MODE] Notification logged in mock mode. No real email was sent because Gmail SMTP credentials are not configured.",
                "record": mock_record
            }

        # Real SMTP Delivery
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"BharatConnect AI Alerts <{self.smtp_username}>"
            msg["To"] = to_email

            part1 = MIMEText(text_body, "plain", "utf-8")
            msg.attach(part1)

            if html_body:
                part2 = MIMEText(html_body, "html", "utf-8")
                msg.attach(part2)

            logger.info(f"Connecting to SMTP server {self.smtp_host}:{self.smtp_port} for {to_email}...")
            server = smtplib.SMTP(self.smtp_host, self.smtp_port, timeout=10)
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(self.smtp_username, self.smtp_password)
            server.sendmail(self.smtp_username, [to_email], msg.as_string())
            server.quit()

            record = {
                "timestamp": timestamp,
                "is_mock": False,
                "recipient": to_email,
                "subject": subject,
                "text_body": text_body,
                "html_body": html_body,
                "status": "SENT"
            }
            self._record_email(record)
            logger.info(f"[EMAIL SENT] Successfully sent notification to {to_email}: '{subject}'")

            return {
                "success": True,
                "mock": False,
                "recipient": to_email,
                "subject": subject,
                "message": f"Email successfully dispatched to {to_email} via Gmail SMTP.",
                "record": record
            }

        except Exception as e:
            logger.error(f"[EMAIL FAILURE] Failed to send email to {to_email}: {e}")
            failed_record = {
                "timestamp": timestamp,
                "is_mock": False,
                "recipient": to_email,
                "subject": subject,
                "error": str(e),
                "status": "FAILED"
            }
            self._record_email(failed_record)

            return {
                "success": False,
                "mock": False,
                "recipient": to_email,
                "subject": subject,
                "error": str(e),
                "message": f"Failed to send email to {to_email}: {e}",
                "record": failed_record
            }

    def notify_new_user_registration(
        self,
        full_name: str,
        email: str,
        country: str,
        registered_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send an email notification to the administrator when a new user registers.

        Email contains:
        - New user registered
        - Full name
        - Email
        - Country
        - Registration date/time

        SECURITY MANDATE:
        Never includes passwords, password hashes, salts, session tokens, or API secrets.
        """
        dt_str = registered_at or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        subject = f"[BharatConnect Admin] New User Registered: {full_name}"

        text_content = (
            "===========================================================\n"
            "            BHARATCONNECT AI - ADMIN NOTIFICATION          \n"
            "===========================================================\n"
            "New user registered\n\n"
            f"- Full name:              {full_name}\n"
            f"- Email:                  {email}\n"
            f"- Country:                {country}\n"
            f"- Registration date/time: {dt_str}\n"
            "===========================================================\n"
            "Notification generated automatically by BharatConnect AI backend.\n"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }}
    .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #ff7708, #d95d00); padding: 24px 28px; color: #ffffff; }}
    .header h2 {{ margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }}
    .header p {{ margin: 6px 0 0 0; opacity: 0.9; font-size: 13px; }}
    .content {{ padding: 28px; }}
    .badge {{ display: inline-block; background-color: #ecfdf5; color: #047857; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; border: 1px solid #a7f3d0; margin-bottom: 18px; }}
    .item-table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
    .item-table td {{ padding: 12px 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }}
    .item-label {{ color: #64748b; font-weight: 500; width: 40%; }}
    .item-value {{ color: #0f172a; font-weight: 600; width: 60%; }}
    .footer {{ background-color: #f8fafc; padding: 16px 28px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>BharatConnect AI Admin Alert</h2>
      <p>India Tourism & Global Collaboration Platform</p>
    </div>
    <div class="content">
      <span class="badge">New user registered</span>
      <table class="item-table">
        <tr>
          <td class="item-label">Full name:</td>
          <td class="item-value">{full_name}</td>
        </tr>
        <tr>
          <td class="item-label">Email:</td>
          <td class="item-value"><a href="mailto:{email}" style="color: #ff7708; text-decoration: none;">{email}</a></td>
        </tr>
        <tr>
          <td class="item-label">Country:</td>
          <td class="item-value">{country}</td>
        </tr>
        <tr>
          <td class="item-label">Registration date/time:</td>
          <td class="item-value">{dt_str}</td>
        </tr>
      </table>
    </div>
    <div class="footer">
      Automated dispatch from BharatConnect AI Server • Confidential Admin Notice
    </div>
  </div>
</body>
</html>"""

        return self.send_email(
            subject=subject,
            text_body=text_content,
            html_body=html_content
        )

    def notify_trip_created(
        self,
        user_name: str,
        user_email: str,
        destination: str,
        duration_days: int,
        travelers_count: int,
        budget: Optional[str] = None,
        created_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send an email notification to the administrator when a user creates, saves, or books a trip.

        Email contains:
        - User name
        - User email
        - Destination
        - Number of days
        - Number of travelers
        - Budget if available
        - Trip creation date/time
        """
        dt_str = created_at or datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        budget_display = budget if budget else "Not specified"
        subject = f"[BharatConnect Admin] New Trip Saved: {destination} ({user_name})"

        text_content = (
            "===========================================================\n"
            "            BHARATCONNECT AI - ADMIN NOTIFICATION          \n"
            "===========================================================\n"
            "A traveler has created / saved a trip itinerary\n\n"
            f"- User name:              {user_name}\n"
            f"- User email:             {user_email}\n"
            f"- Destination:            {destination}\n"
            f"- Number of days:         {duration_days}\n"
            f"- Number of travelers:    {travelers_count}\n"
            f"- Budget:                 {budget_display}\n"
            f"- Trip creation date/time: {dt_str}\n"
            "===========================================================\n"
            "Notification generated automatically by BharatConnect AI backend.\n"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }}
    .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #0ea5e9, #0284c7); padding: 24px 28px; color: #ffffff; }}
    .header h2 {{ margin: 0; font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }}
    .header p {{ margin: 6px 0 0 0; opacity: 0.9; font-size: 13px; }}
    .content {{ padding: 28px; }}
    .badge {{ display: inline-block; background-color: #e0f2fe; color: #0369a1; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 20px; border: 1px solid #bae6fd; margin-bottom: 18px; }}
    .item-table {{ width: 100%; border-collapse: collapse; margin-top: 10px; }}
    .item-table td {{ padding: 12px 8px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }}
    .item-label {{ color: #64748b; font-weight: 500; width: 40%; }}
    .item-value {{ color: #0f172a; font-weight: 600; width: 60%; }}
    .footer {{ background-color: #f8fafc; padding: 16px 28px; font-size: 12px; color: #94a3b8; text-align: center; border-top: 1px solid #e2e8f0; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>BharatConnect AI Admin Alert</h2>
      <p>New Trip Created & Saved</p>
    </div>
    <div class="content">
      <span class="badge">New Trip Saved</span>
      <table class="item-table">
        <tr>
          <td class="item-label">User name:</td>
          <td class="item-value">{user_name}</td>
        </tr>
        <tr>
          <td class="item-label">User email:</td>
          <td class="item-value"><a href="mailto:{user_email}" style="color: #0284c7; text-decoration: none;">{user_email}</a></td>
        </tr>
        <tr>
          <td class="item-label">Destination:</td>
          <td class="item-value">{destination}</td>
        </tr>
        <tr>
          <td class="item-label">Number of days:</td>
          <td class="item-value">{duration_days} days</td>
        </tr>
        <tr>
          <td class="item-label">Number of travelers:</td>
          <td class="item-value">{travelers_count} traveler(s)</td>
        </tr>
        <tr>
          <td class="item-label">Budget:</td>
          <td class="item-value">{budget_display}</td>
        </tr>
        <tr>
          <td class="item-label">Trip creation date/time:</td>
          <td class="item-value">{dt_str}</td>
        </tr>
      </table>
    </div>
    <div class="footer">
      Automated dispatch from BharatConnect AI Server • Confidential Admin Notice
    </div>
  </div>
</body>
</html>"""

        return self.send_email(
            subject=subject,
            text_body=text_content,
            html_body=html_content
        )

    def send_verification_otp(
        self,
        email: str,
        full_name: str,
        otp_code: str,
        expires_minutes: int = 10
    ) -> Dict[str, Any]:
        """
        Send a 6-digit verification code to a registering traveler's email.
        """
        subject = f"[BharatConnect AI] Your Verification Code: {otp_code}"
        text_content = (
            "===========================================================\n"
            "              BHARATCONNECT AI - EMAIL VERIFICATION         \n"
            "===========================================================\n"
            f"Dear {full_name},\n\n"
            "Welcome to BharatConnect AI — Your Gateway to Incredible India.\n\n"
            f"Your 6-digit email verification code is:\n\n"
            f"      >>>  {otp_code}  <<<\n\n"
            f"This code will expire in {expires_minutes} minutes.\n\n"
            "If you did not request this code, please ignore this message.\n"
            "Never share your verification code with anyone.\n"
            "===========================================================\n"
            "24/7 Traveler Assistance: support@bharatconnect.ai | +91 11-2336-5358\n"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #071326; margin: 0; padding: 24px; color: #e2e8f0; }}
    .card {{ max-width: 580px; margin: 0 auto; background: #0B1F3A; border-radius: 16px; border: 1px solid rgba(212, 175, 55, 0.35); overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }}
    .header {{ background: linear-gradient(135deg, #0B1F3A, #163664); padding: 32px 28px; text-align: center; border-bottom: 1px solid rgba(212, 175, 55, 0.25); }}
    .brand {{ color: #D4AF37; font-size: 24px; font-weight: 800; letter-spacing: 1px; margin: 0; text-transform: uppercase; }}
    .tagline {{ color: #94a3b8; font-size: 12px; margin-top: 6px; letter-spacing: 1.5px; text-transform: uppercase; }}
    .content {{ padding: 32px 28px; text-align: center; }}
    .greeting {{ font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 12px; }}
    .lead {{ font-size: 14px; color: #cbd5e1; line-height: 1.6; margin-bottom: 24px; }}
    .otp-box {{ display: inline-block; background: #071326; border: 2px solid #D4AF37; border-radius: 12px; padding: 18px 36px; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #D4AF37; margin: 8px 0 24px 0; font-family: monospace; box-shadow: 0 0 20px rgba(212, 175, 55, 0.2); }}
    .expiry {{ font-size: 12px; color: #94a3b8; margin-bottom: 24px; }}
    .notice {{ background: rgba(212, 175, 55, 0.08); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: 10px; padding: 12px; font-size: 12px; color: #e2e8f0; text-align: left; line-height: 1.5; }}
    .footer {{ background-color: #071326; padding: 20px 28px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="brand">BharatConnect AI</h1>
      <p class="tagline">Plan with AI • Navigate with Locals • Experience India</p>
    </div>
    <div class="content">
      <div class="greeting">Welcome, {full_name}!</div>
      <p class="lead">Please enter the 6-digit verification code below to verify your email address and activate your global traveler account.</p>
      <div class="otp-box">{otp_code}</div>
      <p class="expiry">This verification code expires in <strong>{expires_minutes} minutes</strong>.</p>
      <div class="notice">
        <strong>Security Notice:</strong> Never share this code with anyone. BharatConnect AI representatives will never ask for your code.
      </div>
    </div>
    <div class="footer">
      24/7 International Traveler Concierge: support@bharatconnect.ai • +91 11-2336-5358<br>
      © 2026 BharatConnect AI. Official India Tourism & Global Collaboration Gateway.
    </div>
  </div>
</body>
</html>"""

        return self.send_email(
            subject=subject,
            text_body=text_content,
            html_body=html_content,
            recipient=email
        )

    def send_password_reset_otp(
        self,
        email: str,
        full_name: str,
        otp_code: str,
        expires_minutes: int = 10
    ) -> Dict[str, Any]:
        """
        Send a 6-digit password reset code to a traveler's email.
        """
        subject = f"[BharatConnect AI] Password Reset Code: {otp_code}"
        text_content = (
            "===========================================================\n"
            "             BHARATCONNECT AI - PASSWORD RESET              \n"
            "===========================================================\n"
            f"Dear {full_name},\n\n"
            "We received a request to reset your BharatConnect AI password.\n\n"
            f"Your 6-digit reset code is:\n\n"
            f"      >>>  {otp_code}  <<<\n\n"
            f"This code will expire in {expires_minutes} minutes.\n\n"
            "If you did not make this request, please change your password immediately.\n"
            "===========================================================\n"
            "24/7 Traveler Assistance: support@bharatconnect.ai\n"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #071326; margin: 0; padding: 24px; color: #e2e8f0; }}
    .card {{ max-width: 580px; margin: 0 auto; background: #0B1F3A; border-radius: 16px; border: 1px solid rgba(212, 175, 55, 0.35); overflow: hidden; }}
    .header {{ background: linear-gradient(135deg, #0B1F3A, #163664); padding: 30px; text-align: center; border-bottom: 1px solid rgba(212, 175, 55, 0.25); }}
    .brand {{ color: #D4AF37; font-size: 22px; font-weight: 800; margin: 0; }}
    .content {{ padding: 32px 28px; text-align: center; }}
    .otp-box {{ display: inline-block; background: #071326; border: 2px solid #D4AF37; border-radius: 12px; padding: 16px 32px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #D4AF37; margin: 16px 0; font-family: monospace; }}
    .footer {{ background-color: #071326; padding: 18px; font-size: 11px; color: #64748b; text-align: center; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="brand">BharatConnect AI</h1>
    </div>
    <div class="content">
      <h2 style="color: #ffffff; font-size: 18px; margin-top: 0;">Password Reset Request</h2>
      <p style="font-size: 14px; color: #cbd5e1;">Use the verification code below to reset your account password:</p>
      <div class="otp-box">{otp_code}</div>
      <p style="font-size: 12px; color: #94a3b8;">Valid for {expires_minutes} minutes. If you did not request this reset, please ignore this email.</p>
    </div>
    <div class="footer">
      Automated Security Notification • BharatConnect AI
    </div>
  </div>
</body>
</html>"""

        return self.send_email(
            subject=subject,
            text_body=text_content,
            html_body=html_content,
            recipient=email
        )

    def send_trip_confirmation_email(
        self,
        user_email: str,
        user_name: str,
        trip_data: Dict[str, Any],
        guide_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Send a rich, production-style HTML trip confirmation email to a traveler's verified address.
        Includes full itinerary details, assigned guide, budget allocation, and 24/7 support hotlines.
        """
        trip_id = trip_data.get("id", "TRIP-CONFIRMED")
        booking_ref = f"BC-{trip_id[-6:].upper()}"
        trip_title = trip_data.get("title") or trip_data.get("name") or "Incredible India Journey"
        destination = trip_data.get("destination", "India")
        duration = trip_data.get("duration_days") or len(trip_data.get("itinerary", [])) or 7
        travelers = trip_data.get("travelers_count", 2)
        start_date = trip_data.get("start_date", "Date upon arrival")
        end_date = trip_data.get("end_date", "To be confirmed")
        budget_usd = trip_data.get("total_budget_usd") or trip_data.get("budget_usd") or 3500
        budget_inr = trip_data.get("total_budget_inr") or int(budget_usd * 86.5)

        # Guide details
        guide_name = guide_data.get("name", "Arjun Sharma") if guide_data else "Assigned Verified Local Guide"
        guide_phone = guide_data.get("phone", "+91 98290 14820") if guide_data else "+91 11-2336-5358"
        guide_city = guide_data.get("city", "Jaipur & Rajasthan") if guide_data else destination
        guide_languages = ", ".join(guide_data.get("languages", ["English", "Hindi"])) if guide_data else "English, Hindi"

        # Itinerary rows
        itinerary = trip_data.get("itinerary", [])
        itinerary_rows_html = ""
        itinerary_text_lines = []
        for day in itinerary[:7]:
            d_num = day.get("day", 1)
            d_title = day.get("title", f"Day {d_num}")
            d_city = day.get("city", destination)
            d_stay = day.get("stay", "Heritage Hotel")
            itinerary_rows_html += f"""
            <tr>
              <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 12px; color: #D4AF37; font-weight: 700; width: 15%;">Day {d_num}</td>
              <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px; color: #ffffff; font-weight: 600; width: 45%;">{d_title}<br><span style="font-size: 11px; color: #94a3b8;">📍 {d_city}</span></td>
              <td style="padding: 10px 8px; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 12px; color: #cbd5e1; width: 40%;">🏨 {d_stay}</td>
            </tr>"""
            itinerary_text_lines.append(f"Day {d_num}: {d_title} ({d_city}) - Stay: {d_stay}")

        subject = f"[BharatConnect AI] Trip Confirmed: {trip_title} (Ref: {booking_ref})"

        text_content = (
            "===========================================================\n"
            "         BHARATCONNECT AI - OFFICIAL TRIP CONFIRMATION      \n"
            "===========================================================\n"
            f"Dear {user_name},\n\n"
            "Congratulations! Your India travel journey has been confirmed.\n\n"
            f"- Booking Reference:     {booking_ref}\n"
            f"- Trip Name:             {trip_title}\n"
            f"- Destination(s):        {destination}\n"
            f"- Duration:              {duration} Days\n"
            f"- Party Size:            {travelers} Traveler(s)\n"
            f"- Travel Dates:          {start_date} to {end_date}\n"
            f"- Total Estimated Budget: ${budget_usd:,} USD (₹{budget_inr:,} INR)\n\n"
            "ASSIGNED LOCAL GUIDE:\n"
            f"- Name:                  {guide_name} (Verified Specialist)\n"
            f"- Regional Base:         {guide_city}\n"
            f"- Languages:             {guide_languages}\n"
            f"- Direct Contact:        {guide_phone}\n\n"
            "ITINERARY HIGHLIGHTS:\n"
            + "\n".join(itinerary_text_lines) + "\n\n"
            "24/7 ASSISTANCE & EMERGENCY HOTLINES:\n"
            "- Ministry of Tourism 24/7 Toll-Free Multi-Lingual Help Line: 1363 / 1800-11-1363\n"
            "- All-India Emergency Dispatch: 112 / Medical Emergency: 108\n"
            "- BharatConnect Concierge: support@bharatconnect.ai | +91 11-2336-5358\n"
            "===========================================================\n"
        )

        html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #071326; margin: 0; padding: 24px; color: #e2e8f0; }}
    .card {{ max-width: 640px; margin: 0 auto; background: #0B1F3A; border-radius: 18px; border: 1px solid rgba(212, 175, 55, 0.4); overflow: hidden; box-shadow: 0 16px 40px rgba(0,0,0,0.6); }}
    .header {{ background: linear-gradient(135deg, #0B1F3A 0%, #173868 100%); padding: 32px 28px; border-bottom: 1px solid rgba(212, 175, 55, 0.3); text-align: center; }}
    .brand {{ color: #D4AF37; font-size: 26px; font-weight: 800; letter-spacing: 1px; margin: 0; }}
    .badge {{ display: inline-block; background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; font-size: 11px; font-weight: 700; padding: 4px 14px; border-radius: 20px; margin-top: 10px; text-transform: uppercase; letter-spacing: 1px; }}
    .content {{ padding: 28px; }}
    .booking-bar {{ background: #071326; border: 1px solid rgba(212, 175, 55, 0.25); border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }}
    .section-title {{ font-size: 14px; font-weight: 700; color: #D4AF37; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 12px 0; border-bottom: 1px solid rgba(212, 175, 55, 0.2); padding-bottom: 6px; }}
    .info-table {{ width: 100%; border-collapse: collapse; }}
    .info-table td {{ padding: 8px 4px; font-size: 13px; }}
    .label {{ color: #94a3b8; width: 40%; font-weight: 500; }}
    .val {{ color: #ffffff; width: 60%; font-weight: 600; }}
    .guide-card {{ background: rgba(212, 175, 55, 0.08); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 14px; padding: 18px; margin-top: 10px; }}
    .itinerary-table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
    .btn {{ display: inline-block; background: linear-gradient(135deg, #D4AF37, #B8952B); color: #071326; font-weight: 700; font-size: 14px; padding: 14px 28px; border-radius: 12px; text-decoration: none; margin-top: 24px; box-shadow: 0 4px 14px rgba(212, 175, 55, 0.35); }}
    .footer {{ background-color: #071326; padding: 20px 28px; font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); line-height: 1.6; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 class="brand">BharatConnect AI</h1>
      <span class="badge">Official Trip Confirmed ✓</span>
    </div>
    <div class="content">
      <div class="booking-bar">
        <div>
          <span style="font-size: 11px; color: #94a3b8; display: block;">CONFIRMATION REFERENCE</span>
          <span style="font-size: 20px; font-weight: 800; color: #D4AF37; font-family: monospace;">{booking_ref}</span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 11px; color: #94a3b8; display: block;">TRAVEL DATES</span>
          <span style="font-size: 13px; font-weight: 700; color: #ffffff;">{start_date}</span>
        </div>
      </div>

      <p style="font-size: 15px; color: #e2e8f0; line-height: 1.5; margin-bottom: 20px;">
        Dear <strong>{user_name}</strong>, your customized journey to India has been confirmed. Below are your travel details, your assigned certified local specialist, and direct emergency assistance resources.
      </p>

      <div class="section-title">Trip Overview</div>
      <table class="info-table">
        <tr><td class="label">Journey Title:</td><td class="val">{trip_title}</td></tr>
        <tr><td class="label">Destinations:</td><td class="val">{destination}</td></tr>
        <tr><td class="label">Duration:</td><td class="val">{duration} Days</td></tr>
        <tr><td class="label">Travelers:</td><td class="val">{travelers} Traveler(s)</td></tr>
        <tr><td class="label">Estimated Budget:</td><td class="val">${budget_usd:,} USD <span style="color: #94a3b8; font-size: 11px;">(₹{budget_inr:,} INR)</span></td></tr>
      </table>

      <div class="section-title">Your Assigned Verified Local Guide</div>
      <div class="guide-card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <strong style="color: #ffffff; font-size: 16px;">{guide_name}</strong>
          <span style="background: rgba(16, 185, 129, 0.2); color: #34d399; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 12px;">Licensed Specialist ✓</span>
        </div>
        <p style="font-size: 12px; color: #cbd5e1; margin: 4px 0;">📍 Base: <strong>{guide_city}</strong> • Languages: <strong>{guide_languages}</strong></p>
        <p style="font-size: 12px; color: #cbd5e1; margin: 4px 0;">📞 Direct Coordination: <strong style="color: #D4AF37;">{guide_phone}</strong></p>
        <p style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Your guide will connect with you via WhatsApp/phone 48 hours before your arrival in India.</p>
      </div>

      <div class="section-title">Day-by-Day Itinerary Highlights</div>
      <table class="itinerary-table">
        {itinerary_rows_html}
      </table>

      <div class="section-title">24/7 Traveler Emergency & Support</div>
      <table class="info-table" style="font-size: 12px;">
        <tr><td class="label">Ministry of Tourism (24/7 Helpline):</td><td class="val" style="color: #D4AF37;">1363 or 1800-11-1363</td></tr>
        <tr><td class="label">All-India Police / Emergency:</td><td class="val" style="color: #f87171;">112</td></tr>
        <tr><td class="label">BharatConnect Concierge:</td><td class="val"><a href="mailto:support@bharatconnect.ai" style="color: #D4AF37; text-decoration: none;">support@bharatconnect.ai</a></td></tr>
      </table>

      <div style="text-align: center; margin-top: 28px;">
        <a href="http://127.0.0.1:8000/#my-plans" class="btn">Open My Trip Dashboard →</a>
      </div>
    </div>
    <div class="footer">
      Official Confirmation Notice • BharatConnect AI<br>
      Integrated with India Ministry of Tourism & Enterprise Alliance • 256-Bit SSL Encrypted
    </div>
  </div>
</body>
</html>"""

        return self.send_email(
            subject=subject,
            text_body=text_content,
            html_body=html_content,
            recipient=user_email
        )

    def get_sent_emails(self) -> List[Dict[str, Any]]:
        """Return a copy of all mock and dispatched emails from memory and file store."""
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
        store_path = os.path.join(data_dir, "email_notifications.json")
        if os.path.isfile(store_path):
            try:
                with open(store_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return list(self.sent_emails)

    def clear_sent_emails(self):
        """Clear recorded email history in memory and file store."""
        self.sent_emails.clear()
        data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
        store_path = os.path.join(data_dir, "email_notifications.json")
        if os.path.isfile(store_path):
            try:
                with open(store_path, "w", encoding="utf-8") as f:
                    json.dump([], f)
            except Exception:
                pass


# Default singleton instance for import across application
email_service = EmailNotificationService()

