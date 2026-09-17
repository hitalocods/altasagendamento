const { Pool } = require('pg');
require('dotenv').config();

let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    pool.on('error', (err) => {
      console.error('Erro inesperado no Pool do Supabase:', err.message);
    });
  }
  return pool;
}

const DEFAULT_SERVICES = [
  { id: 'social', name: 'Maquiagem Social', duration: '1h', price: 160.00, description: 'Produção sofisticada e duradoura para eventos sociais, madrinhas e convidadas.', category: 'Maquiagem' },
  { id: 'noiva', name: 'Noiva (Produção Completa)', duration: '2h30', price: 450.00, description: 'Atendimento de alta exclusividade com prévia, blindagem total e acabamento de alta definição.', category: 'Noivas' },
  { id: 'formanda', name: 'Formanda Glam', duration: '2h', price: 220.00, description: 'Make marcante com iluminação glamorosa, pele resistente a lágrimas e fotos inesquecíveis.', category: 'Formandas' },
  { id: 'penteado', name: 'Penteado Exclusivo', duration: '1h', price: 140.00, description: 'Semipreso, coque clássico, tranças estilizadas ou ondas glamorosas.', category: 'Cabelo' },
  { id: 'combo', name: 'Combo Make + Penteado', duration: '2h', price: 280.00, description: 'Harmonização total de cabelo e maquiagem para uma presença impecável.', category: 'Combos' }
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

async function initDb() {
  const p = getPool();
  try {
    const res = await p.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('Erro ao inicializar conexão Supabase:', err.message);
    throw err;
  }
}

function getDbStatus() {
  return {
    isSQLite: false,
    isPostgres: true,
    storage: 'Supabase PostgreSQL (Produção Nuvem)',
    database: 'postgres',
    project: 'ngfjahsvmwkevcdfcofd',
    timestamp: new Date().toISOString()
  };
}

async function resolveTenantId(identifier) {
  if (!identifier) {
    const res = await getPool().query('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
    return res.rows[0] ? res.rows[0].id : 1;
  }
  if (!isNaN(Number(identifier)) && Number(identifier) > 0) {
    return Number(identifier);
  }
  const clean = String(identifier).trim().toLowerCase();
  const res = await getPool().query('SELECT id FROM tenants WHERE LOWER(slug) = $1 LIMIT 1', [clean]);
  if (res.rows[0]) return res.rows[0].id;

  const fallback = await getPool().query('SELECT id FROM tenants ORDER BY id ASC LIMIT 1');
  return fallback.rows[0] ? fallback.rows[0].id : 1;
}

// ----------------------------------------------------
// GESTÃO DE TENANTS (NEGÓCIOS)
// ----------------------------------------------------
async function listTenants() {
  const res = await getPool().query('SELECT id, slug, business_name, title_first, title_last, tagline, primary_photo, whatsapp, created_at FROM tenants ORDER BY id ASC');
  return res.rows;
}

async function getTenantBySlug(slug) {
  const cleanSlug = String(slug).trim().toLowerCase();
  const res = await getPool().query('SELECT * FROM tenants WHERE LOWER(slug) = $1', [cleanSlug]);
  return formatTenantRow(res.rows[0] || null);
}

async function getTenantById(id) {
  const res = await getPool().query('SELECT * FROM tenants WHERE id = $1', [Number(id)]);
  return formatTenantRow(res.rows[0] || null);
}

async function createTenant(data) {
  const p = getPool();
  let slug = (data.slug || data.business_name || 'meu-negocio')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  if (!slug) slug = `negocio-${Date.now()}`;

  let finalSlug = slug;
  let counter = 1;
  while (true) {
    const check = await p.query('SELECT id FROM tenants WHERE slug = $1', [finalSlug]);
    if (check.rows.length === 0) break;
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  const businessName = data.business_name || 'Meu Salão & Espaço de Beleza';
  const titleFirst = data.title_first || businessName.split(' ')[0] || 'Studio';
  const titleLast = data.title_last || businessName.split(' ').slice(1).join(' ') || 'Beauty';
  const tagline = data.tagline || 'Atendimento Exclusivo';
  const description = data.description || 'Beleza que respeita o seu tempo e a sua história.';
  const aboutText = data.about_text || 'Atendimento especializado e exclusivo com produtos de alta qualidade e foco no seu bem-estar.';
  const primaryPhoto = data.primary_photo || 'img/atlas_brand.png';
  const whatsapp = data.whatsapp || '';
  const instagram = data.instagram || '';
  const specialties = Array.isArray(data.specialties) ? JSON.stringify(data.specialties) : JSON.stringify(['Maquiagem', 'Penteados', 'Tratamentos']);
  const adminPin = data.admin_pin || '1234';
  const plan = data.plan || 'pro';

  const insertRes = await p.query(`
    INSERT INTO tenants (
      slug, business_name, title_first, title_last, tagline,
      description, about_text, primary_photo, whatsapp, instagram,
      specialties, admin_pin, plan
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *
  `, [
    finalSlug, businessName, titleFirst, titleLast, tagline,
    description, aboutText, primaryPhoto, whatsapp, instagram,
    specialties, adminPin, plan
  ]);

  const newTenant = insertRes.rows[0];
  const tenantId = newTenant.id;

  // Criar 1º profissional
  const profName = `${titleFirst} ${titleLast}`.trim() || businessName;
  await p.query(`
    INSERT INTO professionals (tenant_id, name, role, whatsapp, avatar, color, active)
    VALUES ($1, $2, $3, $4, $5, $6, 1)
  `, [tenantId, profName, 'Responsável / Profissional', whatsapp, primaryPhoto, '#B59B79']);

  // Criar serviços padrão
  for (const s of DEFAULT_SERVICES) {
    await p.query(`
      INSERT INTO services (id, tenant_id, name, duration, price, description, category)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (tenant_id, id) DO NOTHING
    `, [s.id, tenantId, s.name, s.duration, s.price, s.description, s.category]);
  }

  // Criar configurações padrão
  await p.query(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES ($1, 'availability', $2), ($1, 'show_prices', 'true')
    ON CONFLICT (tenant_id, key) DO NOTHING
  `, [tenantId, JSON.stringify(DEFAULT_AVAILABILITY)]);

  return formatTenantRow(newTenant);
}

async function updateTenant(identifier, updates) {
  const tenantId = await resolveTenantId(identifier);
  const allowedFields = [
    'business_name', 'title_first', 'title_last', 'tagline',
    'description', 'about_text', 'primary_photo', 'whatsapp',
    'instagram', 'specialties', 'admin_pin', 'plan'
  ];

  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      let val = updates[field];
      if (field === 'specialties' && Array.isArray(val)) {
        val = JSON.stringify(val);
      }
      params.push(val);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) {
    return getTenantById(tenantId);
  }

  params.push(tenantId);
  const sql = `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${params.length} RETURNING *`;
  const res = await getPool().query(sql, params);
  return formatTenantRow(res.rows[0] || null);
}

// ----------------------------------------------------
// MÉTODOS DE AGENDAMENTOS
// ----------------------------------------------------
async function getAppointments(filters = {}, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier || filters.tenant_id || filters.tenant);
  let sql = 'SELECT * FROM appointments WHERE tenant_id = $1';
  const params = [tenantId];

  if (filters.status && filters.status !== 'todos') {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }
  if (filters.date) {
    params.push(filters.date);
    sql += ` AND appointment_date = $${params.length}`;
  }
  if (filters.startDate && filters.endDate) {
    params.push(filters.startDate);
    const pStart = params.length;
    params.push(filters.endDate);
    const pEnd = params.length;
    sql += ` AND appointment_date >= $${pStart} AND appointment_date <= $${pEnd}`;
  }

  sql += ' ORDER BY appointment_date DESC, appointment_time ASC';
  const res = await getPool().query(sql, params);
  let rows = res.rows;

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
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query('SELECT * FROM appointments WHERE id = $1 AND tenant_id = $2', [Number(id), tenantId]);
  return res.rows[0] || null;
}

async function createAppointment(appData, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier || appData.tenant_id || appData.tenant);
  const res = await getPool().query(`
    INSERT INTO appointments (
      tenant_id, client_name, client_phone, service_id, service_name, price,
      appointment_date, appointment_time, notes, payment_status, payment_method, status,
      professional_id, professional_name
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [
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
  ]);

  return res.rows[0];
}

async function updateAppointment(id, updates, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier || updates.tenant_id || updates.tenant);
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
      let val = updates[field];
      if (field === 'price') val = parseFloat(val) || 0.00;
      params.push(val);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) return getAppointmentById(id, tenantId);

  params.push(Number(id), tenantId);
  const sql = `UPDATE appointments SET ${setClauses.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`;
  const res = await getPool().query(sql, params);
  return res.rows[0] || null;
}

async function deleteAppointment(id, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query('DELETE FROM appointments WHERE id = $1 AND tenant_id = $2 RETURNING *', [Number(id), tenantId]);
  return res.rows[0] || null;
}

// ----------------------------------------------------
// MÉTODOS FINANCEIROS
// ----------------------------------------------------
async function getTransactions(filters = {}, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier || filters.tenant_id || filters.tenant);
  let sql = 'SELECT * FROM finances WHERE tenant_id = $1';
  const params = [tenantId];

  if (filters.type && filters.type !== 'todos') {
    params.push(filters.type);
    sql += ` AND type = $${params.length}`;
  }
  if (filters.category) {
    params.push(filters.category);
    sql += ` AND category = $${params.length}`;
  }
  if (filters.date) {
    params.push(filters.date);
    sql += ` AND date = $${params.length}`;
  }
  if (filters.startDate && filters.endDate) {
    params.push(filters.startDate);
    const pStart = params.length;
    params.push(filters.endDate);
    const pEnd = params.length;
    sql += ` AND date >= $${pStart} AND date <= $${pEnd}`;
  }

  sql += ' ORDER BY date DESC, id DESC';
  const res = await getPool().query(sql, params);
  let rows = res.rows;

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
  const tenantId = await resolveTenantId(tenantIdentifier || txData.tenant_id || txData.tenant);
  const res = await getPool().query(`
    INSERT INTO finances (tenant_id, type, category, description, amount, date, payment_method, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    tenantId,
    txData.type,
    txData.category,
    txData.description,
    parseFloat(txData.amount) || 0.00,
    txData.date || new Date().toISOString().split('T')[0],
    txData.payment_method || 'pix',
    txData.status || 'pago'
  ]);
  return res.rows[0];
}

async function updateTransaction(id, updates, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier || updates.tenant_id || updates.tenant);
  const allowedFields = ['type', 'category', 'description', 'amount', 'date', 'payment_method', 'status'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      let val = updates[field];
      if (field === 'amount') val = parseFloat(val) || 0.00;
      params.push(val);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) return null;

  params.push(Number(id), tenantId);
  const sql = `UPDATE finances SET ${setClauses.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`;
  const res = await getPool().query(sql, params);
  return res.rows[0] || null;
}

async function deleteTransaction(id, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query('DELETE FROM finances WHERE id = $1 AND tenant_id = $2 RETURNING *', [Number(id), tenantId]);
  return res.rows[0] || null;
}

async function getFinancialMetrics(filters = {}, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier || filters.tenant_id || filters.tenant);
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
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query('SELECT * FROM inventory WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
  return res.rows;
}

async function createInventoryItem(item, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier || item.tenant_id || item.tenant);
  const res = await getPool().query(`
    INSERT INTO inventory (tenant_id, name, category, quantity, min_quantity, cost_price, supplier, last_restock)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
  `, [
    tenantId,
    item.name,
    item.category || 'Geral',
    parseInt(item.quantity, 10) || 0,
    parseInt(item.min_quantity, 10) || 2,
    parseFloat(item.cost_price) || 0.00,
    item.supplier || '',
    item.last_restock || new Date().toISOString().split('T')[0]
  ]);
  return res.rows[0];
}

async function updateInventoryItem(id, updates, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const allowedFields = ['name', 'category', 'quantity', 'min_quantity', 'cost_price', 'supplier', 'last_restock'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      let val = updates[field];
      if (field === 'quantity' || field === 'min_quantity') val = parseInt(val, 10) || 0;
      if (field === 'cost_price') val = parseFloat(val) || 0.00;
      params.push(val);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) return null;

  params.push(Number(id), tenantId);
  const sql = `UPDATE inventory SET ${setClauses.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`;
  const res = await getPool().query(sql, params);
  return res.rows[0] || null;
}

async function adjustInventoryQuantity(id, delta, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query(`
    UPDATE inventory SET quantity = GREATEST(0, quantity + $1)
    WHERE id = $2 AND tenant_id = $3
    RETURNING *
  `, [parseInt(delta, 10), Number(id), tenantId]);
  return res.rows[0] || null;
}

async function deleteInventoryItem(id, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query('DELETE FROM inventory WHERE id = $1 AND tenant_id = $2 RETURNING *', [Number(id), tenantId]);
  return res.rows[0] || null;
}

// ----------------------------------------------------
// MÉTODOS DE DISPONIBILIDADE & HORÁRIOS
// ----------------------------------------------------
async function getAvailabilitySettings(tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query('SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = $2', [tenantId, 'availability']);
  let result = null;

  if (res.rows[0] && res.rows[0].value) {
    try {
      result = typeof res.rows[0].value === 'string' ? JSON.parse(res.rows[0].value) : res.rows[0].value;
    } catch (e) {
      result = null;
    }
  }

  if (!result) result = { ...DEFAULT_AVAILABILITY };
  if (!result.daily_times) result.daily_times = { ...DEFAULT_DAILY_TIMES };

  return result;
}

async function updateAvailabilitySettings(settings, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  await getPool().query(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES ($1, 'availability', $2)
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2
  `, [tenantId, JSON.stringify(settings)]);
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
  const tenantId = await resolveTenantId(tenantIdentifier);
  const servicesRes = await getPool().query('SELECT * FROM services WHERE tenant_id = $1 ORDER BY name ASC', [tenantId]);
  const priceRes = await getPool().query('SELECT value FROM tenant_settings WHERE tenant_id = $1 AND key = $2', [tenantId, 'show_prices']);
  const show_prices = priceRes.rows[0] ? priceRes.rows[0].value === 'true' : true;

  return {
    services: servicesRes.rows.length > 0 ? servicesRes.rows : DEFAULT_SERVICES,
    show_prices
  };
}

async function getServices(tenantIdentifier = null) {
  const config = await getServicesSettings(tenantIdentifier);
  return config.services;
}

async function createService(serviceData, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier || serviceData.tenant_id || serviceData.tenant);
  const id = serviceData.id || `svc_${Date.now()}`;
  const name = serviceData.name || 'Novo Serviço';
  const duration = serviceData.duration || '1h';
  const price = parseFloat(serviceData.price) || 0.00;
  const description = serviceData.description || '';
  const category = serviceData.category || 'Geral';

  const res = await getPool().query(`
    INSERT INTO services (id, tenant_id, name, duration, price, description, category)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [id, tenantId, name, duration, price, description, category]);
  return res.rows[0];
}

async function updateService(id, updates, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const allowedFields = ['name', 'duration', 'price', 'description', 'category'];
  const setClauses = [];
  const params = [];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      let val = updates[field];
      if (field === 'price') val = parseFloat(val) || 0.00;
      params.push(val);
      setClauses.push(`${field} = $${params.length}`);
    }
  }

  if (setClauses.length === 0) return null;

  params.push(id, tenantId);
  const sql = `UPDATE services SET ${setClauses.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING *`;
  const res = await getPool().query(sql, params);
  return res.rows[0] || null;
}

async function deleteService(id, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query('DELETE FROM services WHERE id = $1 AND tenant_id = $2 RETURNING *', [id, tenantId]);
  return res.rows[0] || null;
}

async function toggleShowPrices(show, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  await getPool().query(`
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES ($1, 'show_prices', $2)
    ON CONFLICT (tenant_id, key) DO UPDATE SET value = $2
  `, [tenantId, String(Boolean(show))]);
  return Boolean(show);
}

// ----------------------------------------------------
// GESTÃO DE PROFISSIONAIS (EQUIPE & LIMITES DO PLANO)
// ----------------------------------------------------
function getPlanLimit(plan) {
  if (plan === 'free') return 1;
  if (plan === 'pro') return 3;
  return 9999;
}

async function listProfessionals(tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query('SELECT * FROM professionals WHERE tenant_id = $1 ORDER BY id ASC', [tenantId]);
  return res.rows;
}

async function getProfessionalById(id, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const res = await getPool().query('SELECT * FROM professionals WHERE id = $1 AND tenant_id = $2', [Number(id), tenantId]);
  return res.rows[0] || null;
}

async function createProfessional(data, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const p = getPool();

  const tenantRes = await p.query('SELECT plan FROM tenants WHERE id = $1', [tenantId]);
  const plan = tenantRes.rows[0] && tenantRes.rows[0].plan ? tenantRes.rows[0].plan : 'pro';
  const limit = getPlanLimit(plan);

  const countRes = await p.query('SELECT COUNT(*) as count FROM professionals WHERE tenant_id = $1', [tenantId]);
  const currentCount = parseInt(countRes.rows[0].count, 10);
  if (currentCount >= limit) {
    const err = new Error(`Limite de profissionais atingido para o seu plano (${currentCount}/${limit}). Faça upgrade para adicionar mais profissionais.`);
    err.status = 403;
    err.limitReached = true;
    err.currentLimit = limit;
    err.currentCount = currentCount;
    throw err;
  }

  const name = String(data.name || '').trim();
  if (!name) throw new Error('Nome do profissional é obrigatório');

  const role = data.role || 'Profissional';
  const whatsapp = data.whatsapp || '';
  const avatar = data.avatar || '';
  const color = data.color || '#B59B79';
  const active = data.active !== undefined ? (data.active ? 1 : 0) : 1;

  const res = await p.query(`
    INSERT INTO professionals (tenant_id, name, role, whatsapp, avatar, color, active)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `, [tenantId, name, role, whatsapp, avatar, color, active]);

  return res.rows[0];
}

async function updateProfessional(id, data, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const existing = await getProfessionalById(id, tenantId);
  if (!existing) return null;

  const name = data.name !== undefined ? String(data.name).trim() : existing.name;
  const role = data.role !== undefined ? String(data.role).trim() : existing.role;
  const whatsapp = data.whatsapp !== undefined ? String(data.whatsapp).trim() : existing.whatsapp;
  const avatar = data.avatar !== undefined ? String(data.avatar).trim() : existing.avatar;
  const color = data.color !== undefined ? String(data.color).trim() : existing.color;
  const active = data.active !== undefined ? (data.active ? 1 : 0) : existing.active;

  const res = await getPool().query(`
    UPDATE professionals
    SET name = $1, role = $2, whatsapp = $3, avatar = $4, color = $5, active = $6
    WHERE id = $7 AND tenant_id = $8
    RETURNING *
  `, [name, role, whatsapp, avatar, color, active, Number(id), tenantId]);

  return res.rows[0] || null;
}

async function deleteProfessional(id, tenantIdentifier = null) {
  const tenantId = await resolveTenantId(tenantIdentifier);
  const p = getPool();

  const countRes = await p.query('SELECT COUNT(*) as count FROM professionals WHERE tenant_id = $1', [tenantId]);
  const count = parseInt(countRes.rows[0].count, 10);
  if (count <= 1) {
    const err = new Error('Você deve manter ao menos um profissional cadastrado.');
    err.status = 400;
    throw err;
  }

  const res = await p.query('DELETE FROM professionals WHERE id = $1 AND tenant_id = $2 RETURNING *', [Number(id), tenantId]);
  return res.rows[0] || null;
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
