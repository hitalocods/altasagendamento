const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function run() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || dbUrl.includes('[YOUR-PASSWORD]')) {
    console.error('❌ ERRO: DATABASE_URL não configurada ou ainda contém [YOUR-PASSWORD].');
    console.log('Edite o arquivo .env e substitua [YOUR-PASSWORD] pela senha do banco de dados do Supabase.');
    process.exit(1);
  }

  console.log('🔄 Conectando ao PostgreSQL / Supabase...');
  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✅ Conexão estabelecida com sucesso!');

    const sqlPath = path.join(__dirname, '..', 'supabase_schema.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🚀 Executando migração supabase_schema.sql...');
    await client.query(sql);
    console.log('🎉 Migração concluída com sucesso no Supabase!');

    // Testar contagem de tenants
    const res = await client.query('SELECT COUNT(*) as count FROM tenants');
    console.log(`📊 Tenants no banco de dados: ${res.rows[0].count}`);

    client.release();
    await pool.end();
  } catch (err) {
    console.error('❌ Falha ao executar migração no Supabase:', err.message);
    process.exit(1);
  }
}

run();
