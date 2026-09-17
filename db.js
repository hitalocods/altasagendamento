require('dotenv').config();

// Se DATABASE_URL estiver configurada para produção (Supabase), conecta e opera 100% no PostgreSQL
if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('[YOUR-PASSWORD]')) {
  console.log('⚡ Conectando diretamente ao Supabase PostgreSQL na nuvem...');
  module.exports = require('./db_postgres');
  return;
}

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

// Diretório de dados e banco SQLite
const DATA_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'atlas_data') : path.join(__dirname, 'data');
const SQLITE_FILE = path.join(DATA_DIR, 'atlas.sqlite');

try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Aviso ao preparar diretório de dados:', e.message);
}

let dbInstance = null;

// Dados Padrão Iniciais para o Tenant Padrão
const DEFAULT_SERVICES = [
  { id: 'social', name: 'Maquiagem Social', duration: '1h', price: 160.00, description: 'Produção sofisticada e duradoura para eventos sociais, madrinhas e convidadas.', category: 'Maquiagem' },
  { id: 'noiva', name: 'Noiva (Produção Completa)', duration: '2h30', price: 450.00, description: 'Atendimento de alta exclusividade com prévia, blindagem total e acabamento de alta definição.', category: 'Noivas' },
  { id: 'formanda', name: 'Formanda Glam', duration: '2h', price: 220.00, description: 'Make marcante com iluminação glamorosa, pele resistente a lágrimas e fotos inesquecíveis.', category: 'Formandas' },
  { id: 'penteado', name: 'Penteado Exclusivo', duration: '1h', price: 140.00, description: 'Semipreso, coque clássico, tranças estilizadas ou ondas glamorosas.', category: 'Cabelo' },
  { id: 'combo', name: 'Combo Make + Penteado', duration: '2h', price: 280.00, description: 'Harmonização total de cabelo e maquiagem para uma presença impecável.', category: 'Combos' }
];

const DEFAULT_INVENTORY = [
  { name: 'Base Líquida Kryolan Dermacolor', category: 'Maquiagem', quantity: 4, min_quantity: 2, cost_price: 189.90, supplier: 'Kryolan Brasil', last_restock: '2026-08-28' },
  { name: 'Cílios Postiços 3D Mink (Par)', category: 'Descartáveis', quantity: 15, min_quantity: 5, cost_price: 14.50, supplier: 'Distribuidora Glam', last_restock: '2026-08-25' },
  { name: 'Fixador de Maquiagem Blindagem', category: 'Maquiagem', quantity: 1, min_quantity: 3, cost_price: 65.00, supplier: 'Beauty Store', last_restock: '2026-08-10' },
  { name: 'Spray Fixador de Penteado Extra Forte', category: 'Penteados', quantity: 5, min_quantity: 2, cost_price: 58.00, supplier: 'Schwarzkopf', last_restock: '2026-08-20' },
  { name: 'Pó Facial Translúcido Laura Mercier', category: 'Maquiagem', quantity: 1, min_quantity: 2, cost_price: 240.00, supplier: 'Sephora', last_restock: '2026-08-15' },
  { name: 'Iluminador Líquido Rare Beauty', category: 'Maquiagem', quantity: 3, min_quantity: 2, cost_price: 190.00, supplier: 'Sephora', last_restock: '2026-08-29' }
];

const DEFAULT_DAILY_TIMES = {
  0: ['09:00', '11:00', '14:00', '16:00'],
  1: ['07:30', '08:30', '10:00', '11:30', '14:00', '15:30', '17:00', '18:30'],
  2: ['07:30', '08:30', '10:00', '11:30', '14:00', '15:30', '17:00', '18:30'],
  3: ['07:30', '08:30', '10:00', '11:30', '14:00', '15:30', '17:00', '18:30'],
  4: ['07:30', '08:30', '10:00', '11:30', '14:00', '15:30', '17:00', '18:30'],
  5: ['07:30', '08:30', '10:00', '11:30', '14:00', '15:30', '17:00', '18:30'],
  6: ['07:30', '08:30', '10:00', '11:30', '14:00', '15:30', '17:00', '18:30']
};

const DEFAULT_AVAILABILITY = {
  active_days: [1, 2, 3, 4, 5, 6],
  custom_times: ['07:30', '08:30', '10:00', '11:30', '14:00', '15:30', '17:00', '18:30'],
  daily_times: DEFAULT_DAILY_TIMES,
  blocked_dates: [
    { id: '1', date: '2026-09-15', reason: 'Curso de Especialização' },
    { id: '2', date: '2026-09-25', reason: 'Viagem / Congresso' }
  ]
};

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(SQLITE_FILE);
    // Ativa Foreign Keys e WAL mode para performance
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA journal_mode = WAL;');
  }
  return dbInstance;
}

let isInitialized = false;

async function initDb() {
  if (isInitialized) return;

  const db = getDb();

  // 1. Tabela de Tenants (Multi-Tenant)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      business_name TEXT NOT NULL,
      title_first TEXT,
      title_last TEXT,
      tagline TEXT,
      description TEXT,
      about_text TEXT,
      primary_photo TEXT,
      whatsapp TEXT,
      instagram TEXT,
      specialties TEXT,
      admin_pin TEXT DEFAULT '1234',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Tabela de Agendamentos
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      client_name TEXT NOT NULL,
      client_phone TEXT NOT NULL,
      service_id TEXT,
      service_name TEXT NOT NULL,
      price REAL DEFAULT 0.00,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT NOT NULL,
      notes TEXT,
      payment_status TEXT DEFAULT 'pendente',
      payment_method TEXT DEFAULT 'pix',
      status TEXT DEFAULT 'pendente',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `);

  // 3. Tabela de Finanças
  db.exec(`
    CREATE TABLE IF NOT EXISTS finances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      payment_method TEXT DEFAULT 'pix',
      status TEXT DEFAULT 'pago',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `);

  // 4. Tabela de Estoque
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      quantity INTEGER DEFAULT 0,
      min_quantity INTEGER DEFAULT 2,
      cost_price REAL DEFAULT 0.00,
      supplier TEXT,
      last_restock TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `);

  // 5. Tabela de Serviços
  db.exec(`
    CREATE TABLE IF NOT EXISTS services (
      id TEXT NOT NULL,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      duration TEXT DEFAULT '1h',
      price REAL DEFAULT 0.00,
      description TEXT,
      category TEXT DEFAULT 'Geral',
      PRIMARY KEY (tenant_id, id),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `);

  // 6. Tabela de Configurações por Tenant
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (tenant_id, key),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `);

  // 7. Tabela de Profissionais da Equipe
  db.exec(`
    CREATE TABLE IF NOT EXISTS professionals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'Profissional',
      whatsapp TEXT,
      avatar TEXT,
      color TEXT DEFAULT '#B59B79',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    );
  `);

  // Migrações dinâmicas seguras para bancos existentes
  try { db.exec("ALTER TABLE tenants ADD COLUMN plan TEXT DEFAULT 'pro';"); } catch (e) {}
  try { db.exec("ALTER TABLE appointments ADD COLUMN professional_id INTEGER;"); } catch (e) {}
  try { db.exec("ALTER TABLE appointments ADD COLUMN professional_name TEXT;"); } catch (e) {}

  // Semente do Tenant Padrão (Studio Lumina) se não existir
  seedDefaultTenant(db);

  isInitialized = true;
  console.log('✅ SQLite Multi-Tenant Conectado e Inicializado em:', SQLITE_FILE);
}

function seedDefaultTenant(db) {
  // Inicializa o padrão Studio Lumina
  try {
    const oldCheck = db.prepare('SELECT id FROM tenants WHERE slug = ?').get('studio-lumina');
    if (oldCheck) {
      db.prepare(`
        UPDATE tenants 
        SET slug = 'studio-lumina',
            business_name = 'Studio Lumina — Salão & Beleza',
            title_first = 'Studio',
            title_last = 'Lumina',
            tagline = 'Beleza Editorial & Atendimento Exclusivo',
            description = 'Espaço dedicado ao cuidado completo da sua beleza. Cabelos, maquiagem, unhas e estética com profissionais especializados.',
            about_text = 'No Studio Lumina, combinamos excelência técnica, produtos de alto padrão e uma atmosfera sofisticada para proporcionar uma experiência inesquecível a cada cliente.',
            primary_photo = 'img/salon_cover.webp',
            whatsapp = '(11) 98765-4321',
            instagram = '@studioluminabeauty',
            specialties = ?,
            plan = 'pro'
        WHERE id = ?
      `).run(JSON.stringify(['Cabelos & Penteados', 'Maquiagem', 'Unhas & Alongamentos', 'Estética Facial']), oldCheck.id);

      db.prepare('DELETE FROM professionals WHERE tenant_id = ?').run(oldCheck.id);
      db.prepare(`
        INSERT INTO professionals (tenant_id, name, role, whatsapp, avatar, color, active)
        VALUES 
          (?, 'Camila Santos', 'Master Hair & Visagista', '(11) 98765-4321', 'img/default_avatar.webp', '#B59B79', 1),
          (?, 'Juliana Costa', 'Maquiadora Especialista', '(11) 98765-4322', 'img/default_avatar.webp', '#A88661', 1),
          (?, 'Beatriz Lima', 'Nail Designer & Alongamentos', '(11) 98765-4323', 'img/default_avatar.webp', '#D6BD9F', 1)
      `).run(oldCheck.id, oldCheck.id, oldCheck.id);

      db.prepare(`UPDATE appointments SET professional_name = 'Camila Santos' WHERE tenant_id = ?`).run(oldCheck.id);
    }
  } catch (e) {
    console.warn('Migração de tenant demo:', e.message);
  }

  const checkStmt = db.prepare('SELECT id FROM tenants WHERE slug = ?');
  const existing = checkStmt.get('studio-lumina');

  let tenantId;
  if (!existing) {
    const insertTenant = db.prepare(`
      INSERT INTO tenants (
        slug, business_name, title_first, title_last, tagline, 
        description, about_text, primary_photo, whatsapp, instagram, 
        specialties, admin_pin, plan
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res = insertTenant.run(
      'studio-lumina',
      'Studio Lumina — Salão & Beleza',
      'Studio',
      'Lumina',
      'Beleza Editorial & Atendimento Exclusivo',
      'Espaço dedicado ao cuidado completo da sua beleza. Cabelos, maquiagem, unhas e estética com profissionais especializados.',
      'No Studio Lumina, combinamos excelência técnica, produtos de alto padrão e uma atmosfera sofisticada para proporcionar uma experiência inesquecível a cada cliente.',
      'img/salon_cover.webp',
      '(11) 98765-4321',
      '@studioluminabeauty',
      JSON.stringify(['Cabelos & Penteados', 'Maquiagem', 'Unhas & Alongamentos', 'Estética Facial']),
      '1234',
      'pro'
    );
    tenantId = res.lastInsertRowid;

    // Inserir Serviços Padrão
    const insertSvc = db.prepare(`
      INSERT INTO services (id, tenant_id, name, duration, price, description, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of DEFAULT_SERVICES) {
      insertSvc.run(s.id, tenantId, s.name, s.duration, s.price, s.description, s.category);
    }

    // Inserir Estoque Padrão
    const insertInv = db.prepare(`
      INSERT INTO inventory (tenant_id, name, category, quantity, min_quantity, cost_price, supplier, last_restock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const i of DEFAULT_INVENTORY) {
      insertInv.run(tenantId, i.name, i.category, i.quantity, i.min_quantity, i.cost_price, i.supplier, i.last_restock);
    }

    // Inserir Configurações Padrão
    const insertSetting = db.prepare(`
      INSERT INTO tenant_settings (tenant_id, key, value)
      VALUES (?, ?, ?)
    `);
    insertSetting.run(tenantId, 'availability', JSON.stringify(DEFAULT_AVAILABILITY));
    insertSetting.run(tenantId, 'show_prices', 'true');

    // Inserir Equipe de Profissionais Padrão
    db.prepare(`
      INSERT INTO professionals (tenant_id, name, role, whatsapp, avatar, color, active)
      VALUES 
        (?, 'Camila Santos', 'Master Hair & Visagista', '(11) 98765-4321', 'img/default_avatar.webp', '#B59B79', 1),
        (?, 'Juliana Costa', 'Maquiadora Especialista', '(11) 98765-4322', 'img/default_avatar.webp', '#A88661', 1),
        (?, 'Beatriz Lima', 'Nail Designer & Alongamentos', '(11) 98765-4323', 'img/default_avatar.webp', '#D6BD9F', 1)
    `).run(tenantId, tenantId, tenantId);

    // Inserir Agendamentos e Finanças Demonstrativos
    const insertApp = db.prepare(`
      INSERT INTO appointments (
        tenant_id, client_name, client_phone, service_id, service_name, price,
        appointment_date, appointment_time, notes, payment_status, payment_method, status,
        professional_id, professional_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertApp.run(tenantId, 'Mariana Oliveira', '(11) 98888-1111', 'combo', 'Combo Make + Penteado', 280.00, '2026-09-18', '14:00', 'Madrinha de casamento', 'pago_total', 'pix', 'confirmado', 1, 'Camila Santos');
    insertApp.run(tenantId, 'Fernanda Costa', '(11) 97777-2222', 'formanda', 'Formanda Glam', 220.00, '2026-09-18', '16:30', 'Formatura', 'sinal_pago', 'pix', 'pendente', 2, 'Juliana Costa');
    insertApp.run(tenantId, 'Patricia Souza', '(11) 96666-3333', 'noiva', 'Noiva (Produção Completa)', 450.00, '2026-09-20', '15:00', 'Noiva', 'sinal_pago', 'pix', 'confirmado', 1, 'Camila Santos');

    const insertFin = db.prepare(`
      INSERT INTO finances (
        tenant_id, type, category, description, amount, date, payment_method, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertFin.run(tenantId, 'receita', 'Combo Make + Penteado', 'Atendimento Mariana Oliveira', 280.00, '2026-09-18', 'pix', 'pago');
    insertFin.run(tenantId, 'receita', 'Formanda Glam', 'Sinal Formatura Fernanda Costa', 110.00, '2026-09-18', 'pix', 'pago');
    insertFin.run(tenantId, 'despesa', 'Produtos & Cosméticos', 'Reposição de bases e finalizadores', 120.00, '2026-09-18', 'cartao_credito', 'pago');
    insertFin.run(tenantId, 'receita', 'Noiva (Produção Completa)', 'Agendamento: Patricia Souza', 225.00, '2026-09-20', 'pix', 'pago');
  } else {
    tenantId = existing.id;
  }
  return tenantId;
}

// ----------------------------------------------------
// RESOLUÇÃO DE TENANT (ID ou SLUG)
// ----------------------------------------------------
function resolveTenantId(tenantIdentifier) {
  initDb();
  const db = getDb();
  if (!tenantIdentifier) {
    const row = db.prepare('SELECT id FROM tenants ORDER BY id ASC LIMIT 1').get();
    return row ? row.id : 1;
  }
  if (typeof tenantIdentifier === 'number' || (!isNaN(tenantIdentifier) && Number.isInteger(Number(tenantIdentifier)))) {
    return Number(tenantIdentifier);
  }
  const row = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(String(tenantIdentifier).trim().toLowerCase());
  if (row) return row.id;
  // Fallback para primeiro tenant
  const fallback = db.prepare('SELECT id FROM tenants ORDER BY id ASC LIMIT 1').get();
  return fallback ? fallback.id : 1;
}

function getDbStatus() {
  return {
    isSQLite: true,
    storage: 'SQLite Multi-Tenant Local (node:sqlite)',
    dbFile: SQLITE_FILE,
    timestamp: new Date().toISOString()
  };
}

// ----------------------------------------------------
// GESTÃO DE TENANTS (NEGÓCIOS)
// ----------------------------------------------------
function formatTenantRow(row) {
  if (!row) return null;
  let specialties = [];
  try {
    specialties = typeof row.specialties === 'string' ? JSON.parse(row.specialties) : (row.specialties || []);
  } catch (e) {
    specialties = String(row.specialties || '').split(',').map(s => s.trim()).filter(Boolean);
  }
  return {
    ...row,
    specialties
  };
}

async function listTenants() {
  await initDb();
  const db = getDb();
  const rows = db.prepare('SELECT id, slug, business_name, title_first, title_last, tagline, primary_photo, whatsapp, created_at FROM tenants ORDER BY id ASC').all();
  return rows;
}

async function getTenantBySlug(slug) {
  await initDb();
  const db = getDb();
  const cleanSlug = String(slug).trim().toLowerCase();
  const row = db.prepare('SELECT * FROM tenants WHERE slug = ?').get(cleanSlug);
  return formatTenantRow(row);
}

async function getTenantById(id) {
  await initDb();
  const db = getDb();
  const row = db.prepare('SELECT * FROM tenants WHERE id = ?').get(Number(id));
  return formatTenantRow(row);
}

async function createTenant(data) {
  await initDb();
  const db = getDb();
  
  // Sanitizar slug
  let slug = (data.slug || data.business_name || 'meu-negocio')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  if (!slug) slug = `negocio-${Date.now()}`;

  // Garantir unicidade do slug
  let finalSlug = slug;
  let counter = 1;
  while (db.prepare('SELECT id FROM tenants WHERE slug = ?').get(finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  const businessName = data.business_name || 'Meu Salão & Espaço de Beleza';
  const titleFirst = data.title_first || businessName.split(' ')[0] || 'Studio';
  const titleLast = data.title_last || businessName.split(' ').slice(1).join(' ') || 'Beauty';
  const tagline = data.tagline || 'Atendimento Exclusivo';
  const description = data.description || 'Beleza que respeita o seu tempo e a sua história.';
  const aboutText = data.about_text || 'Atendimento especializado e exclusivo com produtos de alta qualidade e foco no seu bem-estar.';
  const primaryPhoto = data.primary_photo || 'img/salon_cover.webp';
  const whatsapp = data.whatsapp || '';
  const instagram = data.instagram || '';
  const specialties = Array.isArray(data.specialties) ? JSON.stringify(data.specialties) : JSON.stringify(['Maquiagem', 'Penteados', 'Tratamentos']);
  const adminPin = data.admin_pin || '1234';
  const plan = data.plan || 'pro';

  const insert = db.prepare(`
    INSERT INTO tenants (
      slug, business_name, title_first, title_last, tagline,
      description, about_text, primary_photo, whatsapp, instagram,
      specialties, admin_pin, plan
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = insert.run(
    finalSlug, businessName, titleFirst, titleLast, tagline,
    description, aboutText, primaryPhoto, whatsapp, instagram,
    specialties, adminPin, plan
  );

  const tenantId = res.lastInsertRowid;

  // Criar 1º profissional do salão automaticamente com o nome informado
  const profName = `${titleFirst} ${titleLast}`.trim() || businessName;
  db.prepare(`
    INSERT INTO professionals (tenant_id, name, role, whatsapp, avatar, color, active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(tenantId, profName, 'Responsável / Profissional', whatsapp, primaryPhoto, '#B59B79');

  // Criar serviços padrão para o novo tenant
  const insertSvc = db.prepare(`
    INSERT INTO services (id, tenant_id, name, duration, price, description, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of DEFAULT_SERVICES) {
    insertSvc.run(s.id, tenantId, s.name, s.duration, s.price, s.description, s.category);
  }

  // Criar configurações padrão de disponibilidade
  const insertSetting = db.prepare(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES (?, ?, ?)
  `);
  insertSetting.run(tenantId, 'availability', JSON.stringify(DEFAULT_AVAILABILITY));
  insertSetting.run(tenantId, 'show_prices', 'true');

  return getTenantById(tenantId);
}

async function updateTenant(identifier, updates) {
  await initDb();
  const tenantId = resolveTenantId(identifier);
  const db = getDb();

  const allowedFields = [
    'business_name', 'title_first', 'title_last', 'tagline',
    'description', 'about_text', 'primary_photo', 'whatsapp',
    'instagram', 'specialties', 'admin_pin', 'plan'
  ];

  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      let val = updates[field];
      if (field === 'specialties' && Array.isArray(val)) {
        val = JSON.stringify(val);
      }
      params.push(val);
    }
  }

  if (setClauses.length === 0) {
    return getTenantById(tenantId);
  }

  params.push(tenantId);
  const sql = `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...params);

  return getTenantById(tenantId);
}

// ----------------------------------------------------
// MÉTODOS DE AGENDAMENTOS
// ----------------------------------------------------
async function getAppointments(filters = {}, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier || filters.tenant_id || filters.tenant);
  const db = getDb();

  let sql = 'SELECT * FROM appointments WHERE tenant_id = ?';
  const params = [tenantId];

  if (filters.status && filters.status !== 'todos') {
    sql += ' AND status = ?';
    params.push(filters.status);
  }
  if (filters.date) {
    sql += ' AND appointment_date = ?';
    params.push(filters.date);
  }
  if (filters.startDate && filters.endDate) {
    sql += ' AND appointment_date >= ? AND appointment_date <= ?';
    params.push(filters.startDate, filters.endDate);
  }

  sql += ' ORDER BY appointment_date DESC, appointment_time ASC';
  let rows = db.prepare(sql).all(...params);

  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(a => 
      (a.client_name && a.client_name.toLowerCase().includes(q)) ||
      (a.client_phone && a.client_phone.includes(q)) ||
      (a.service_name && a.service_name.toLowerCase().includes(q))
    );
  }

  return rows;
}

async function getAppointmentById(id, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();
  return db.prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?').get(Number(id), tenantId) || null;
}

async function createAppointment(appData, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier || appData.tenant_id || appData.tenant);
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO appointments (
      tenant_id, client_name, client_phone, service_id, service_name, price,
      appointment_date, appointment_time, notes, payment_status, payment_method, status,
      professional_id, professional_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    tenantId,
    appData.client_name,
    appData.client_phone,
    appData.service_id || null,
    appData.service_name,
    parseFloat(appData.price) || 0.00,
    appData.appointment_date,
    appData.appointment_time,
    appData.notes || '',
    appData.payment_status || 'pendente',
    appData.payment_method || 'pix',
    appData.status || 'pendente',
    appData.professional_id ? Number(appData.professional_id) : null,
    appData.professional_name || null
  );

  return db.prepare('SELECT * FROM appointments WHERE id = ?').get(res.lastInsertRowid);
}

async function updateAppointment(id, updates, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier || updates.tenant_id || updates.tenant);
  const db = getDb();

  const existing = await getAppointmentById(id, tenantId);
  if (!existing) return null;

  const allowedFields = [
    'client_name', 'client_phone', 'service_id', 'service_name',
    'price', 'appointment_date', 'appointment_time', 'notes',
    'payment_status', 'payment_method', 'status',
    'professional_id', 'professional_name'
  ];

  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      let val = updates[field];
      if (field === 'price') val = parseFloat(val) || 0.00;
      params.push(val);
    }
  }

  if (setClauses.length > 0) {
    params.push(Number(id), tenantId);
    db.prepare(`UPDATE appointments SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
  }

  return getAppointmentById(id, tenantId);
}

async function deleteAppointment(id, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const existing = await getAppointmentById(id, tenantId);
  if (!existing) return null;

  db.prepare('DELETE FROM appointments WHERE id = ? AND tenant_id = ?').run(Number(id), tenantId);
  return existing;
}

// ----------------------------------------------------
// MÉTODOS FINANCEIROS
// ----------------------------------------------------
async function getTransactions(filters = {}, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier || filters.tenant_id || filters.tenant);
  const db = getDb();

  let sql = 'SELECT * FROM finances WHERE tenant_id = ?';
  const params = [tenantId];

  if (filters.type && filters.type !== 'todos') {
    sql += ' AND type = ?';
    params.push(filters.type);
  }
  if (filters.category) {
    sql += ' AND category = ?';
    params.push(filters.category);
  }
  if (filters.date) {
    sql += ' AND date = ?';
    params.push(filters.date);
  }
  if (filters.startDate && filters.endDate) {
    sql += ' AND date >= ? AND date <= ?';
    params.push(filters.startDate, filters.endDate);
  }

  sql += ' ORDER BY date DESC, id DESC';
  let rows = db.prepare(sql).all(...params);

  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(t => 
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q))
    );
  }

  return rows;
}

async function createTransaction(txData, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier || txData.tenant_id || txData.tenant);
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO finances (tenant_id, type, category, description, amount, date, payment_method, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    tenantId,
    txData.type,
    txData.category,
    txData.description,
    parseFloat(txData.amount) || 0.00,
    txData.date || new Date().toISOString().split('T')[0],
    txData.payment_method || 'pix',
    txData.status || 'pago'
  );

  return db.prepare('SELECT * FROM finances WHERE id = ?').get(res.lastInsertRowid);
}

async function updateTransaction(id, updates, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier || updates.tenant_id || updates.tenant);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM finances WHERE id = ? AND tenant_id = ?').get(Number(id), tenantId);
  if (!existing) return null;

  const allowedFields = ['type', 'category', 'description', 'amount', 'date', 'payment_method', 'status'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      let val = updates[field];
      if (field === 'amount') val = parseFloat(val) || 0.00;
      params.push(val);
    }
  }

  if (setClauses.length > 0) {
    params.push(Number(id), tenantId);
    db.prepare(`UPDATE finances SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
  }

  return db.prepare('SELECT * FROM finances WHERE id = ?').get(Number(id));
}

async function deleteTransaction(id, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM finances WHERE id = ? AND tenant_id = ?').get(Number(id), tenantId);
  if (!existing) return null;

  db.prepare('DELETE FROM finances WHERE id = ? AND tenant_id = ?').run(Number(id), tenantId);
  return existing;
}

async function getFinancialMetrics(filters = {}, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier || filters.tenant_id || filters.tenant);
  
  const transactions = await getTransactions(filters, tenantId);
  const appointments = await getAppointments(filters, tenantId);

  let totalRevenue = 0;
  let totalExpenses = 0;

  transactions.forEach(t => {
    const val = parseFloat(t.amount) || 0;
    if (t.type === 'receita') totalRevenue += val;
    else if (t.type === 'despesa') totalExpenses += val;
  });

  const netProfit = totalRevenue - totalExpenses;
  const completedApps = appointments.filter(a => a.status === 'concluido').length;
  const pendingApps = appointments.filter(a => a.status === 'pendente').length;
  const averageTicket = appointments.length > 0 ? (totalRevenue / appointments.length) : 0;

  const catMap = {};
  transactions.forEach(t => {
    const cat = t.category || 'Geral';
    catMap[cat] = (catMap[cat] || 0) + (parseFloat(t.amount) || 0);
  });

  const categories = {
    labels: Object.keys(catMap).length > 0 ? Object.keys(catMap) : ['Geral'],
    values: Object.keys(catMap).length > 0 ? Object.values(catMap) : [totalRevenue]
  };

  return {
    metrics: {
      totalRevenue,
      totalExpenses,
      netProfit,
      totalAppointments: appointments.length,
      completedAppointments: completedApps,
      pendingAppointments: pendingApps,
      averageTicket
    },
    charts: {
      timeline: {
        labels: ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'],
        revenue: [totalRevenue * 0.25, totalRevenue * 0.35, totalRevenue * 0.25, totalRevenue * 0.15],
        expenses: [totalExpenses * 0.3, totalExpenses * 0.3, totalExpenses * 0.2, totalExpenses * 0.2]
      },
      categories
    }
  };
}

// ----------------------------------------------------
// MÉTODOS DE ESTOQUE
// ----------------------------------------------------
async function getInventory(tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();
  return db.prepare('SELECT * FROM inventory WHERE tenant_id = ? ORDER BY name ASC').all(tenantId);
}

async function createInventoryItem(item, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier || item.tenant_id || item.tenant);
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO inventory (tenant_id, name, category, quantity, min_quantity, cost_price, supplier, last_restock)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    tenantId,
    item.name,
    item.category || 'Geral',
    parseInt(item.quantity, 10) || 0,
    parseInt(item.min_quantity, 10) || 2,
    parseFloat(item.cost_price) || 0.00,
    item.supplier || '',
    item.last_restock || new Date().toISOString().split('T')[0]
  );

  return db.prepare('SELECT * FROM inventory WHERE id = ?').get(res.lastInsertRowid);
}

async function updateInventoryItem(id, updates, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM inventory WHERE id = ? AND tenant_id = ?').get(Number(id), tenantId);
  if (!existing) return null;

  const allowedFields = ['name', 'category', 'quantity', 'min_quantity', 'cost_price', 'supplier', 'last_restock'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      let val = updates[field];
      if (field === 'quantity' || field === 'min_quantity') val = parseInt(val, 10) || 0;
      if (field === 'cost_price') val = parseFloat(val) || 0.00;
      params.push(val);
    }
  }

  if (setClauses.length > 0) {
    params.push(Number(id), tenantId);
    db.prepare(`UPDATE inventory SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
  }

  return db.prepare('SELECT * FROM inventory WHERE id = ?').get(Number(id));
}

async function adjustInventoryQuantity(id, delta, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM inventory WHERE id = ? AND tenant_id = ?').get(Number(id), tenantId);
  if (!existing) return null;

  const newQty = Math.max(0, existing.quantity + parseInt(delta, 10));
  db.prepare('UPDATE inventory SET quantity = ? WHERE id = ? AND tenant_id = ?').run(newQty, Number(id), tenantId);

  return db.prepare('SELECT * FROM inventory WHERE id = ?').get(Number(id));
}

async function deleteInventoryItem(id, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM inventory WHERE id = ? AND tenant_id = ?').get(Number(id), tenantId);
  if (!existing) return null;

  db.prepare('DELETE FROM inventory WHERE id = ? AND tenant_id = ?').run(Number(id), tenantId);
  return existing;
}

// ----------------------------------------------------
// MÉTODOS DE DISPONIBILIDADE & HORÁRIOS
// ----------------------------------------------------
async function getAvailabilitySettings(tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const row = db.prepare('SELECT value FROM tenant_settings WHERE tenant_id = ? AND key = ?').get(tenantId, 'availability');
  let result = null;

  if (row) {
    try {
      result = JSON.parse(row.value);
    } catch (e) {
      result = null;
    }
  }

  if (!result) {
    result = { ...DEFAULT_AVAILABILITY };
  }

  if (!result.daily_times) {
    result.daily_times = { ...DEFAULT_DAILY_TIMES };
  } else {
    for (let day = 0; day <= 6; day++) {
      if (!result.daily_times[day]) {
        result.daily_times[day] = DEFAULT_DAILY_TIMES[day] || ['09:00', '14:00'];
      }
    }
  }

  return result;
}

async function updateAvailabilitySettings(settings, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES (?, 'availability', ?)
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = excluded.value
  `);

  stmt.run(tenantId, JSON.stringify(settings));
  return settings;
}

async function addBlockedDate(date, reason, tenantIdentifier = null) {
  const current = await getAvailabilitySettings(tenantIdentifier);
  if (!current.blocked_dates) current.blocked_dates = [];
  const newBlocked = { id: String(Date.now()), date, reason: reason || 'Folga' };
  current.blocked_dates.push(newBlocked);
  await updateAvailabilitySettings(current, tenantIdentifier);
  return newBlocked;
}

async function deleteBlockedDate(idOrDate, tenantIdentifier = null) {
  const current = await getAvailabilitySettings(tenantIdentifier);
  if (!current.blocked_dates) return false;
  const beforeLen = current.blocked_dates.length;
  current.blocked_dates = current.blocked_dates.filter(b => b.id !== String(idOrDate) && b.date !== String(idOrDate));
  if (current.blocked_dates.length < beforeLen) {
    await updateAvailabilitySettings(current, tenantIdentifier);
    return true;
  }
  return false;
}

// ----------------------------------------------------
// MÉTODOS DE SERVIÇOS
// ----------------------------------------------------
async function getServicesSettings(tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const services = db.prepare('SELECT * FROM services WHERE tenant_id = ? ORDER BY name ASC').all(tenantId);
  const priceRow = db.prepare('SELECT value FROM tenant_settings WHERE tenant_id = ? AND key = ?').get(tenantId, 'show_prices');
  const show_prices = priceRow ? priceRow.value === 'true' : true;

  return {
    services: services.length > 0 ? services : DEFAULT_SERVICES,
    show_prices
  };
}

async function getServices(tenantIdentifier = null) {
  const config = await getServicesSettings(tenantIdentifier);
  return config.services;
}

async function createService(serviceData, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier || serviceData.tenant_id || serviceData.tenant);
  const db = getDb();

  const id = serviceData.id || `svc_${Date.now()}`;
  const name = serviceData.name || 'Novo Serviço';
  const duration = serviceData.duration || '1h';
  const price = parseFloat(serviceData.price) || 0.00;
  const description = serviceData.description || '';
  const category = serviceData.category || 'Geral';

  const stmt = db.prepare(`
    INSERT INTO services (id, tenant_id, name, duration, price, description, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, tenantId, name, duration, price, description, category);
  return db.prepare('SELECT * FROM services WHERE id = ? AND tenant_id = ?').get(id, tenantId);
}

async function updateService(id, updates, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM services WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  if (!existing) return null;

  const allowedFields = ['name', 'duration', 'price', 'description', 'category'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      setClauses.push(`${field} = ?`);
      let val = updates[field];
      if (field === 'price') val = parseFloat(val) || 0.00;
      params.push(val);
    }
  }

  if (setClauses.length > 0) {
    params.push(id, tenantId);
    db.prepare(`UPDATE services SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...params);
  }

  return db.prepare('SELECT * FROM services WHERE id = ? AND tenant_id = ?').get(id, tenantId);
}

async function deleteService(id, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const existing = db.prepare('SELECT * FROM services WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  if (!existing) return null;

  db.prepare('DELETE FROM services WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  return existing;
}

async function toggleShowPrices(show, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES (?, 'show_prices', ?)
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = excluded.value
  `);

  stmt.run(tenantId, String(Boolean(show)));
  return Boolean(show);
}

// ----------------------------------------------------
// GESTÃO DE PROFISSIONAIS (EQUIPE & LIMITES DO PLANO)
// ----------------------------------------------------
function getPlanLimit(plan) {
  if (plan === 'free') return 1;
  if (plan === 'pro') return 3;
  return 9999; // elite / ilimitado
}

async function listProfessionals(tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();
  const rows = db.prepare('SELECT * FROM professionals WHERE tenant_id = ? ORDER BY id ASC').all(tenantId);
  return rows;
}

async function getProfessionalById(id, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();
  return db.prepare('SELECT * FROM professionals WHERE id = ? AND tenant_id = ?').get(id, tenantId);
}

async function createProfessional(data, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  // Obter plano do tenant e verificar limites
  const tenant = db.prepare('SELECT plan FROM tenants WHERE id = ?').get(tenantId);
  const plan = tenant && tenant.plan ? tenant.plan : 'pro';
  const limit = getPlanLimit(plan);

  const countRow = db.prepare('SELECT COUNT(*) as count FROM professionals WHERE tenant_id = ?').get(tenantId);
  if (countRow.count >= limit) {
    const err = new Error(`Limite de profissionais atingido para o seu plano (${countRow.count}/${limit}). Faça upgrade para adicionar mais profissionais.`);
    err.status = 403;
    err.limitReached = true;
    err.currentLimit = limit;
    err.currentCount = countRow.count;
    throw err;
  }

  const name = String(data.name || '').trim();
  if (!name) throw new Error('Nome do profissional é obrigatório');

  const role = data.role || 'Profissional';
  const whatsapp = data.whatsapp || '';
  const avatar = data.avatar || '';
  const color = data.color || '#B59B79';
  const active = data.active !== undefined ? (data.active ? 1 : 0) : 1;

  const stmt = db.prepare(`
    INSERT INTO professionals (tenant_id, name, role, whatsapp, avatar, color, active)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(tenantId, name, role, whatsapp, avatar, color, active);
  return getProfessionalById(res.lastInsertRowid, tenantId);
}

async function updateProfessional(id, data, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const existing = await getProfessionalById(id, tenantId);
  if (!existing) return null;

  const name = data.name !== undefined ? String(data.name).trim() : existing.name;
  const role = data.role !== undefined ? String(data.role).trim() : existing.role;
  const whatsapp = data.whatsapp !== undefined ? String(data.whatsapp).trim() : existing.whatsapp;
  const avatar = data.avatar !== undefined ? String(data.avatar).trim() : existing.avatar;
  const color = data.color !== undefined ? String(data.color).trim() : existing.color;
  const active = data.active !== undefined ? (data.active ? 1 : 0) : existing.active;

  db.prepare(`
    UPDATE professionals
    SET name = ?, role = ?, whatsapp = ?, avatar = ?, color = ?, active = ?
    WHERE id = ? AND tenant_id = ?
  `).run(name, role, whatsapp, avatar, color, active, id, tenantId);

  return getProfessionalById(id, tenantId);
}

async function deleteProfessional(id, tenantIdentifier = null) {
  await initDb();
  const tenantId = resolveTenantId(tenantIdentifier);
  const db = getDb();

  const existing = await getProfessionalById(id, tenantId);
  if (!existing) return null;

  // Não permitir excluir se for o único profissional
  const countRow = db.prepare('SELECT COUNT(*) as count FROM professionals WHERE tenant_id = ?').get(tenantId);
  if (countRow.count <= 1) {
    const err = new Error('Você deve manter ao menos um profissional cadastrado.');
    err.status = 400;
    throw err;
  }

  db.prepare('DELETE FROM professionals WHERE id = ? AND tenant_id = ?').run(id, tenantId);
  return existing;
}

module.exports = {
  initDb,
  getDbStatus,
  listTenants,
  getTenantBySlug,
  getTenantById,
  createTenant,
  updateTenant,
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getFinancialMetrics,
  getInventory,
  createInventoryItem,
  updateInventoryItem,
  adjustInventoryQuantity,
  deleteInventoryItem,
  getAvailabilitySettings,
  updateAvailabilitySettings,
  addBlockedDate,
  deleteBlockedDate,
  getServicesSettings,
  getServices,
  createService,
  updateService,
  deleteService,
  toggleShowPrices,
  listProfessionals,
  getProfessionalById,
  createProfessional,
  updateProfessional,
  deleteProfessional,
  getPlanLimit
};
