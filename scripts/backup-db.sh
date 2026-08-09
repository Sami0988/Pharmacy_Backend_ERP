#!/bin/bash
set -euo pipefail

# Pharmacy ERP - Database Backup Script
# This script backs up the PostgreSQL database and uploads it to MinIO

# Configuration
BACKUP_BUCKET="${MINIO_BACKUP_BUCKET:-backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILENAME="pharmacy_erp_${TIMESTAMP}.sql.gz"
TEMP_DIR="/tmp/pharmacy_backups"

# Create temp directory
mkdir -p "$TEMP_DIR"

# Extract database connection details from DATABASE_URL
# Format: postgres://user:password@host:port/database
if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

# Parse DATABASE_URL
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

echo "Starting backup of database: $DB_NAME"
echo "Timestamp: $TIMESTAMP"

# Run pg_dump and compress
PGPASSWORD="$DB_PASSWORD" pg_dump \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --format=custom \
    --compress=9 \
    -f "$TEMP_DIR/$BACKUP_FILENAME"

echo "Backup created: $TEMP_DIR/$BACKUP_FILENAME"

# Upload to MinIO using mc (MinIO Client)
# Install mc: https://min.io/docs/minio/linux/reference/minio-mc.html
if command -v mc &> /dev/null; then
    # Set up MinIO alias if not already configured
    mc alias set pharmacy-minio \
        "http://${MINIO_ENDPOINT:-localhost}:${MINIO_PORT:-9000}" \
        "${MINIO_ACCESS_KEY:-minioadmin}" \
        "${MINIO_SECRET_KEY:-minioadmin}" 2>/dev/null || true

    # Upload backup
    mc cp "$TEMP_DIR/$BACKUP_FILENAME" \
        "pharmacy-minio/$BACKUP_BUCKET/$BACKUP_FILENAME"

    echo "Backup uploaded to MinIO: $BACKUP_BUCKET/$BACKUP_FILENAME"

    # Clean up old backups (keep last N days)
    echo "Cleaning up backups older than $BACKUP_RETENTION_DAYS days..."
    CUTOFF_DATE=$(date -d "-${BACKUP_RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || \
                  date -v-"${BACKUP_RETENTION_DAYS}"d +%Y%m%d 2>/dev/null || \
                  echo "")

    if [ -n "$CUTOFF_DATE" ]; then
        mc ls "pharmacy-minio/$BACKUP_BUCKET/" | while read -r line; do
            FILE_DATE=$(echo "$line" | grep -oP 'pharmacy_erp_\K[0-9]{8}' || echo "")
            if [ -n "$FILE_DATE" ] && [ "$FILE_DATE" -lt "$CUTOFF_DATE" ]; then
                FILE_NAME=$(echo "$line" | awk '{print $NF}')
                echo "Removing old backup: $FILE_NAME"
                mc rm "pharmacy-minio/$BACKUP_BUCKET/$FILE_NAME"
            fi
        done
    fi
else
    echo "WARNING: MinIO client (mc) not found. Backup saved locally only."
    echo "Install mc: https://min.io/docs/minio/linux/reference/minio-mc.html"
fi

# Cleanup temp files
rm -f "$TEMP_DIR/$BACKUP_FILENAME"

echo "Backup completed successfully!"
