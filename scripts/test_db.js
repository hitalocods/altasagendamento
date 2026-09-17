const { Pool } = require('pg');
require('dotenv').config();

async function check() {
  console.log('🔍 Verificando status dos bancos de dados configurados...\n');

  // 1. Supabase / Postgres
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes('[YOUR-PASSWORD]')) {
    console.log('⚠️ PostgreSQL (Supabase): Senha pendente no .env ([YOUR-PASSWORD]).');
    console.log('   Quando definir a senha, execute: npm run db:migrate');
  } else {
    try {
      const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      const res = await pool.query('SELECT current_database(), now() as current_time');
      console.log('✅ PostgreSQL (Supabase) CONECTADO!');
      console.log(`   Database: ${res.rows[0].current_database} | Hora: ${res.rows[0].current_time}`);
      await pool.end();
    } catch (err) {
      console.error('❌ Falha na conexão PostgreSQL (Supabase):', err.message);
    }
  }

  // 2. Cloudinary
  const cloudUrl = process.env.CLOUDINARY_URL;
  if (cloudUrl && !cloudUrl.includes('<your_api_key>')) {
    console.log('\n✅ Cloudinary: Configurado e pronto para uploads em produção!');
  } else {
    console.log('\n⚠️ Cloudinary: API Key pendente no .env.');
    console.log('   Enquanto isso, os uploads funcionam em armazenamento local de fallback.');
  }
}

check();
