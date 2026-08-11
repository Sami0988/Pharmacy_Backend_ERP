import 'dotenv/config';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';

async function createAdmin() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  const hashedPassword = await bcrypt.hash('Sami@123', 10);

  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role
     RETURNING id, name, email, role`,
    ['Samuel Sam', 'samuasami84@gmail.com', hashedPassword, 'admin'],
  );

  console.log('Admin user created:', result.rows[0]);
  await pool.end();
}

createAdmin().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
