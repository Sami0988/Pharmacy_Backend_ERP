#!/bin/bash
set -euo pipefail

# Pharmacy ERP - Database Restore Script
# This script restores a database backup from MinIO or local file

# Configuration
BACKUP_BUCKET="${MINIO_BACKUP_BUCKET:-backups}"
TEMP_DIR="/tmp/pharmacy_backups"

# Check for backup file argument
if [ $# -eq 0 ]; then
    echo "Usage: $0 <backup_filename>"
    echo "Example: $0 pharmacy_erp_20260804_120000.sql.gz"
    echo ""
    echo "Available backups in MinIO:"
    if command -v mc &> /dev/null; then
        mc alias set pharmacy-minio \
            "http://${MINIO_ENDPOINT:-localhost}:${MINIO_PORT:-9000}" \
            "${MINIO_ACCESS_KEY:-minioadmin}" \
            "${MINIO_SECRET_KEY:-minioadmin}" 2>/dev/null || true
        mc ls "pharmacy-minio/$BACKUP_BUCKET/" | grep "pharmacy_erp_" || echo "No backups found"
    else
        echo "MinIO client (mc) not installed"
    fi
    exit 1
fi

BACKUP_FILENAME="$1"
BACKUP_FILE="$TEMP_DIR/$BACKUP_FILENAME"

# Create temp directory
mkdir -p "$TEMP_DIR"

# Download from MinIO if not local
if [ ! -f "$BACKUP_FILE" ]; then
    if command -v mc &> /dev/null; then
        echo "Downloading backup from MinIO..."
        mc alias set pharmacy-minio \
            "http://${MINIO_ENDPOINT:-localhost}:${MINIO_PORT:-9000}" \
            "${MINIO_ACCESS_KEY:-minioadmin}" \
            "${MINIO_SECRET_KEY:-minioadmin}" 2>/dev/null || true
        mc cp "pharmacy-minio/$BACKUP_BUCKET/$BACKUP_FILENAME" "$BACKUP_FILE"
    else
        echo "ERROR: Backup file not found locally and MinIO client not installed"
        exit 1
    fi
fi

# Extract database connection details from DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
    echo "ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

DB_USER=$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's|.*:\([0-9]*\)/.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

echo "WARNING: This will overwrite the current database: $DB_NAME"
echo "Press Enter to continue or Ctrl+C to cancel..."
read -r

echo "Restoring backup: $BACKUP_FILENAME"

# Restore the backup
PGPASSWORD="$DB_PASSWORD" pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    --clean \
    --if-exists \
    --no-owner \
    --no-acl \
    "$BACKUP_FILE"

# Cleanup
rm -f "$BACKUP_FILE"

echo "Restore completed successfully!"
