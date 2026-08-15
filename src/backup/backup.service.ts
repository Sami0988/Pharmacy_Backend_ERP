import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Client } from 'pg';

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  private readonly connectionString = process.env.DATABASE_URL;
  private readonly driveFolderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
  private readonly retentionDays = 1825;

  async runBackup(): Promise<void> {
    const dumpPath = await this.dumpDatabase();
    try {
      await this.uploadToDrive(dumpPath);
      await this.deleteOldBackups();
      this.logger.log('Backup completed and uploaded successfully');
    } finally {
      if (fs.existsSync(dumpPath)) fs.unlinkSync(dumpPath);
    }
  }

  private escapeValue(v: any): string {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return String(v);
    if (v instanceof Date) return `'${v.toISOString()}'`;
    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
    return `'${String(v).replace(/'/g, "''")}'`;
  }

  private async dumpDatabase(): Promise<string> {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const fileName = `pharmacy-backup-${dateStamp}.sql`;
    const filePath = path.join(os.tmpdir(), fileName);

    this.logger.log(`Starting database backup -> ${filePath}`);

    const client = new Client({ connectionString: this.connectionString });
    await client.connect();

    try {
      const tables = await client.query(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'public' ORDER BY tablename
      `);

      let sql = '-- Pharmacy ERP Backup\n';
      sql += `-- Generated: ${new Date().toISOString()}\n\n`;

      for (const row of tables.rows) {
        const tableName = row.tablename;
        this.logger.log(`Backing up: ${tableName}`);

        const cols = await client.query(`
          SELECT column_name, data_type, 
                 CASE WHEN character_maximum_length IS NOT NULL 
                      THEN character_maximum_length::text 
                      ELSE NULL END as max_len,
                 is_nullable, column_default
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = $1 
          ORDER BY ordinal_position
        `, [tableName]);

        const colDefs = cols.rows.map(c => {
          let type = c.data_type.toUpperCase();
          if (c.data_type === 'character varying') type = 'VARCHAR';
          else if (c.data_type === 'character') type = `CHAR(${c.max_len})`;
          else if (c.data_type === 'numeric') type = 'NUMERIC';
          else if (c.data_type === 'timestamp without time zone') type = 'TIMESTAMP';
          else if (c.data_type === 'timestamp with time zone') type = 'TIMESTAMPTZ';

          let def = '';
          if (c.column_default && !c.column_default.includes('nextval')) {
            def = ` DEFAULT ${c.column_default}`;
          }

          const nullable = c.is_nullable === 'NO' ? ' NOT NULL' : '';
          return `  "${c.column_name}" ${type}${nullable}${def}`;
        });

        sql += `DROP TABLE IF EXISTS "${tableName}" CASCADE;\n`;
        sql += `CREATE TABLE "${tableName}" (\n${colDefs.join(',\n')}\n);\n\n`;

        const colNames = cols.rows.map(c => `"${c.column_name}"`);
        const data = await client.query(`SELECT * FROM "${tableName}"`);

        if (data.rows.length > 0) {
          for (const drow of data.rows) {
            const values = Object.values(drow).map(v => this.escapeValue(v));
            sql += `INSERT INTO "${tableName}" (${colNames.join(', ')}) VALUES (${values.join(', ')});\n`;
          }
          sql += '\n';
        }
      }

      fs.writeFileSync(filePath, sql);
      this.logger.log(`Backup written: ${filePath} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)} MB)`);
      return filePath;
    } finally {
      await client.end();
    }
  }

  private getDriveClient() {
    const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    if (!keyPath) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_PATH env var is not set');
    }
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    return google.drive({ version: 'v3', auth });
  }

  private async uploadToDrive(filePath: string): Promise<void> {
    const drive = this.getDriveClient();
    const fileName = path.basename(filePath);

    this.logger.log(`Uploading ${fileName} to Google Drive`);

    await drive.files.create({
      requestBody: {
        name: fileName,
        parents: this.driveFolderId ? [this.driveFolderId] : undefined,
      },
      media: {
        mimeType: 'application/sql',
        body: fs.createReadStream(filePath),
      },
    });
  }

  private async deleteOldBackups(): Promise<void> {
    const drive = this.getDriveClient();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);

    const res = await drive.files.list({
      q: `'${this.driveFolderId}' in parents and name contains 'pharmacy-backup-' and trashed = false`,
      fields: 'files(id, name, createdTime)',
    });

    const files = res.data.files || [];
    for (const file of files) {
      if (file.createdTime && new Date(file.createdTime) < cutoff) {
        this.logger.log(`Deleting old backup from Drive: ${file.name}`);
        await drive.files.delete({ fileId: file.id! });
      }
    }
  }
}
