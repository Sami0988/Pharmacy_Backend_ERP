const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgres://postgres:devpassword@localhost:5433/pharmacy_erp?sslmode=disable';
const outputFile = process.argv[2] || path.join(__dirname, 'backup.sql');

function escapeValue(v) {
  if (v === null) return 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function backup() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected to local database');

    const tables = await client.query(`
      SELECT tablename FROM pg_tables 
      WHERE schemaname = 'public' ORDER BY tablename
    `);

    let sql = '-- Pharmacy ERP Backup\n';
    sql += `-- Generated: ${new Date().toISOString()}\n\n`;

    for (const row of tables.rows) {
      const tableName = row.tablename;
      console.log(`Backing up: ${tableName}`);

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
          const values = Object.values(drow).map(escapeValue);
          sql += `INSERT INTO "${tableName}" (${colNames.join(', ')}) VALUES (${values.join(', ')});\n`;
        }
        sql += '\n';
      }
    }

    fs.writeFileSync(outputFile, sql);
    console.log(`Backup complete: ${outputFile}`);

    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('Backup failed:', error.message);
    process.exit(1);
  }
}

backup();
