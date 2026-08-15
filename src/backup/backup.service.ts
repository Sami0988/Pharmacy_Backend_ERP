import { Injectable, Logger } from '@nestjs/common';
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

  private readonly clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  private readonly clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  private readonly refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN!;
  private readonly redirectUri = 'https://pharmacy-backend-erp.onrender.com/api/v1/backup/oauth/callback';

  private accessToken: string = '';
  private tokenExpiry = 0;

  getAuthorizeUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file',
      access_type: 'offline',
      prompt: 'consent',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      throw new Error(`Token exchange failed: ${await res.text()}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return { accessToken: data.access_token, refreshToken: data.refresh_token };
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      throw new Error(`Token refresh failed: ${await res.text()}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return this.accessToken;
  }

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

  private async uploadToDrive(filePath: string): Promise<void> {
    const token = await this.getAccessToken();
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);

    this.logger.log(`Uploading ${fileName} to Google Drive`);

    const metadata = { name: fileName, parents: this.driveFolderId ? [this.driveFolderId] : [] };
    const boundary = '----BackupBoundary' + Date.now();

    const jsonPart = Buffer.from(JSON.stringify(metadata));
    const filePart = fileContent;

    const parts: Buffer[] = [];
    parts.push(Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`));
    parts.push(jsonPart);
    parts.push(Buffer.from(`\r\n--${boundary}\r\nContent-Type: application/sql\r\n\r\n`));
    parts.push(filePart);
    parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: body as any,
      },
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upload failed: ${err}`);
    }

    this.logger.log(`Uploaded: ${fileName}`);
  }

  private async deleteOldBackups(): Promise<void> {
    const token = await this.getAccessToken();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.retentionDays);

    const q = `'${this.driveFolderId}' in parents and name contains 'pharmacy-backup-' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      this.logger.error(`Failed to list backups: ${await res.text()}`);
      return;
    }

    const data = await res.json();
    const files = data.files || [];

    for (const file of files) {
      if (file.createdTime && new Date(file.createdTime) < cutoff) {
        this.logger.log(`Deleting old backup from Drive: ${file.name}`);
        await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    }
  }
}
