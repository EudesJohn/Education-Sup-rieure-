"""Point d'entrée ASGI pour Vercel Serverless Functions."""
import sys
import os

# Ajouter le dossier server/ au PYTHONPATH
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__))))

from main import app

# Export ASGI handler pour Vercel
handler = app
