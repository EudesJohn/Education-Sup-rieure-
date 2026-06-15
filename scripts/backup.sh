#!/bin/bash
# ============================================================
# backup.sh — Backup de la base de données PostgreSQL
# ============================================================
# Usage :
#   ./scripts/backup.sh                    # Backup dans ./backups/
#   ./scripts/backup.sh /chemin/vers/backup # Backup personnalisé
#
# À mettre dans une crontab :
#   0 3 * * * /opt/pean/scripts/backup.sh
# ============================================================

set -euo pipefail

# Configuration (surcharger via variables d'environnement)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-pean}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-pean_db}"
BACKUP_DIR="${1:-./backups}"

# S'assurer que le dossier de backup existe
mkdir -p "$BACKUP_DIR"

# Nom du fichier : pean_YYYY-MM-DD_HHmmss.sql.gz
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
FILENAME="${BACKUP_DIR}/pean_${TIMESTAMP}.sql.gz"
LATEST_LINK="${BACKUP_DIR}/pean_latest.sql.gz"

# Effacer les backups de plus de 30 jours
find "$BACKUP_DIR" -name "pean_*.sql.gz" -mtime +30 -delete 2>/dev/null

# Exporter le mot de passe pour pg_dump
export PGPASSWORD="$DB_PASSWORD"

# Backup
echo "📦 Backup de $DB_NAME sur $DB_HOST:$DB_PORT..."
pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --no-owner \
    --no-acl \
    --format=custom \
    --compress=9 \
    --file="$FILENAME"

# Symlink "latest"
ln -sf "$FILENAME" "$LATEST_LINK"

echo "✅ Backup terminé : $FILENAME"
echo "   Taille : $(du -h "$FILENAME" | cut -f1)"

unset PGPASSWORD
