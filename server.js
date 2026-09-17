const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Garantir diretório de uploads
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads', 'tenants');
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Aviso ao criar pasta de uploads:', e.message);
}

// Middlewares
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Servir arquivos estáticos
app.use('/img', express.static(path.join(__dirname, 'img')));
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// Middleware de Resolução de Tenant
app.use(async (req, res, next) => {
  try {
    const tenantHeader = req.headers['x-tenant-slug'] || req.headers['x-tenant-id'];
    const tenantQuery = req.query.tenant || req.query.tenant_id;
    const tenantBody = req.body && (req.body.tenant || req.body.tenant_id || req.body.tenant_slug);
    
    const identifier = tenantHeader || tenantQuery || tenantBody;
    if (identifier) {
      const tenant = await db.getTenantBySlug(identifier) || await db.getTenantById(identifier);
      if (tenant) {
        req.tenant = tenant;
        req.tenantId = tenant.id;
      }
    }
  } catch (err) {
    console.warn('Aviso no middleware de tenant:', err.message);
  }
  next();
});

// ----------------------------------------------------
// ROTAS DE STATUS & CONFIGURAÇÃO
// ----------------------------------------------------
app.get('/api/health', async (req, res) => {
  try {
    await db.initDb();
    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      db: db.getDbStatus()
    });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.get('/api/config/db-status', async (req, res) => {
  await db.initDb();
  res.json(db.getDbStatus());
});

// ----------------------------------------------------
const cloudinary = require('cloudinary').v2;

// Configuração Cloudinary para Uploads em Nuvem
if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('☁️ Cloudinary ativo para armazenamento de fotos em produção (CDN).');
} else if (process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_URL.includes('<your_api_key>')) {
  cloudinary.config(true);
  console.log('☁️ Cloudinary ativo via CLOUDINARY_URL.');
}

// ----------------------------------------------------
// ROTAS DE UPLOAD DE FOTOS (CLOUDINARY OU LOCAL)
// ----------------------------------------------------
app.post('/api/upload', async (req, res) => {
  try {
    const { image, filename, tenant } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: 'Nenhuma imagem enviada.' });
    }

    const safeTenant = (tenant || 'tenant').replace(/[^a-z0-9_-]/gi, '');

    // Se Cloudinary estiver configurado, envia para Cloudinary CDN
    const hasCloudinary = Boolean(
      (process.env.CLOUDINARY_URL && !process.env.CLOUDINARY_URL.includes('<your_api_key>')) ||
      (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
    );

    if (hasCloudinary) {
      try {
        const uploadResult = await cloudinary.uploader.upload(image, {
          folder: `atlas_agendamento/${safeTenant}`,
          public_id: `photo_${safeTenant}_${Date.now()}`,
          overwrite: true,
          resource_type: 'image'
        });

        return res.json({
          success: true,
          message: 'Foto enviada com sucesso para o Cloudinary!',
          url: uploadResult.secure_url
        });
      } catch (cloudErr) {
        console.warn('⚠️ Falha no upload para o Cloudinary, usando armazenamento local:', cloudErr.message);
      }
    }

    // Fallback: Armazenamento Local
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, error: 'Formato de imagem inválido. Envie um data URL base64.' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, 'base64');

    let ext = 'jpg';
    if (mimeType.includes('png')) ext = 'png';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('jpeg')) ext = 'jpg';

    const cleanFilename = `photo_${safeTenant}_${Date.now()}.${ext}`;
    const filePath = path.join(UPLOADS_DIR, cleanFilename);

    fs.writeFileSync(filePath, buffer);

    const publicUrl = `/uploads/tenants/${cleanFilename}`;
    res.json({
      success: true,
      message: 'Foto enviada com sucesso localmente!',
      url: publicUrl
    });
  } catch (err) {
    console.error('Erro ao fazer upload da imagem:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao salvar foto.' });
  }
});

// ----------------------------------------------------
// ROTAS DE GESTÃO DE TENANTS (NEGÓCIOS)
// ----------------------------------------------------
app.get('/api/tenants', async (req, res) => {
  try {
    const tenants = await db.listTenants();
    res.json({ success: true, data: tenants });
  } catch (err) {
    console.error('Erro ao listar tenants:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar negócios.' });
  }
});

app.get('/api/tenants/:slug', async (req, res) => {
  try {
    const tenant = await db.getTenantBySlug(req.params.slug) || await db.getTenantById(req.params.slug);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Negócio não encontrado.' });
    }
    // Não expor admin_pin na consulta pública
    const { admin_pin, ...publicData } = tenant;
    res.json({ success: true, data: publicData });
  } catch (err) {
    console.error('Erro ao buscar tenant:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar dados do negócio.' });
  }
});

app.post('/api/tenants', async (req, res) => {
  try {
    const { business_name, title_first, title_last, tagline, description, about_text, primary_photo, whatsapp, instagram, specialties, admin_pin, plan } = req.body;

    if (!business_name) {
      return res.status(400).json({ success: false, error: 'O nome do negócio é obrigatório.' });
    }

    const created = await db.createTenant({
      business_name,
      title_first,
      title_last,
      tagline,
      description,
      about_text,
      primary_photo,
      whatsapp,
      instagram,
      specialties,
      admin_pin: admin_pin || '1234',
      plan: plan || 'pro'
    });

    res.status(201).json({
      success: true,
      message: 'Negócio criado com sucesso!',
      data: created
    });
  } catch (err) {
    console.error('Erro ao cadastrar tenant:', err);
    res.status(500).json({ success: false, error: 'Erro ao criar negócio.' });
  }
});

app.put('/api/tenants/:slug', async (req, res) => {
  try {
    const tenant = await db.getTenantBySlug(req.params.slug) || await db.getTenantById(req.params.slug);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Negócio não encontrado.' });
    }

    const updated = await db.updateTenant(tenant.id, req.body);
    const { admin_pin, ...publicData } = updated;
    res.json({ success: true, message: 'Dados atualizados com sucesso!', data: publicData });
  } catch (err) {
    console.error('Erro ao atualizar tenant:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar dados do negócio.' });
  }
});

app.post('/api/tenants/:slug/verify-pin', async (req, res) => {
  try {
    const { pin } = req.body;
    const tenant = await db.getTenantBySlug(req.params.slug) || await db.getTenantById(req.params.slug);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Negócio não encontrado.' });
    }

    const isValid = String(tenant.admin_pin || '1234') === String(pin);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Senha incorreta.' });
    }

    res.json({ success: true, message: 'Acesso autorizado!', tenant_id: tenant.id, slug: tenant.slug });
  } catch (err) {
    console.error('Erro ao validar PIN:', err);
    res.status(500).json({ success: false, error: 'Erro ao validar senha.' });
  }
});

// ----------------------------------------------------
// ROTAS DE GESTÃO DE PROFISSIONAIS (EQUIPE)
// ----------------------------------------------------
app.get('/api/professionals', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const professionals = await db.listProfessionals(targetTenant);
    const tenant = await db.getTenantBySlug(targetTenant) || await db.getTenantById(targetTenant);
    const plan = tenant && tenant.plan ? tenant.plan : 'pro';
    const limit = db.getPlanLimit(plan);

    res.json({
      success: true,
      data: professionals,
      plan: plan,
      limit: limit,
      count: professionals.length,
      limitReached: professionals.length >= limit
    });
  } catch (err) {
    console.error('Erro ao listar profissionais:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar profissionais.' });
  }
});

app.post('/api/professionals', async (req, res) => {
  try {
    const targetTenant = req.body.tenant || req.query.tenant || req.tenantId;
    const { name, role, whatsapp, avatar, color, active } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'O nome do profissional é obrigatório.' });
    }

    const created = await db.createProfessional({
      name, role, whatsapp, avatar, color, active
    }, targetTenant);

    res.status(201).json({
      success: true,
      message: 'Profissional cadastrado com sucesso!',
      data: created
    });
  } catch (err) {
    console.error('Erro ao criar profissional:', err);
    if (err.limitReached) {
      return res.status(403).json({
        success: false,
        limitReached: true,
        error: err.message,
        currentLimit: err.currentLimit
      });
    }
    res.status(500).json({ success: false, error: err.message || 'Erro ao cadastrar profissional.' });
  }
});

app.put('/api/professionals/:id', async (req, res) => {
  try {
    const targetTenant = req.body.tenant || req.query.tenant || req.tenantId;
    const updated = await db.updateProfessional(req.params.id, req.body, targetTenant);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Profissional não encontrado.' });
    }
    res.json({ success: true, message: 'Profissional atualizado com sucesso!', data: updated });
  } catch (err) {
    console.error('Erro ao atualizar profissional:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar profissional.' });
  }
});

app.delete('/api/professionals/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const deleted = await db.deleteProfessional(req.params.id, targetTenant);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Profissional não encontrado.' });
    }
    res.json({ success: true, message: 'Profissional removido com sucesso!', data: deleted });
  } catch (err) {
    console.error('Erro ao excluir profissional:', err);
    res.status(err.status || 500).json({ success: false, error: err.message || 'Erro ao remover profissional.' });
  }
});

// ----------------------------------------------------
// ROTAS DE AGENDAMENTOS (MULTI-TENANT)
// ----------------------------------------------------
app.get('/api/appointments', async (req, res) => {
  try {
    const { status, date, startDate, endDate, search, tenant } = req.query;
    const targetTenant = tenant || req.tenantId;
    const appointments = await db.getAppointments({ status, date, startDate, endDate, search }, targetTenant);
    res.json({ success: true, count: appointments.length, data: appointments });
  } catch (err) {
    console.error('Erro ao buscar agendamentos:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar agendamentos.' });
  }
});

app.get('/api/appointments/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const appointment = await db.getAppointmentById(req.params.id, targetTenant);
    if (!appointment) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
    }
    res.json({ success: true, data: appointment });
  } catch (err) {
    console.error('Erro ao buscar agendamento:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar agendamento.' });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    const {
      client_name, client_phone, service_id, service_name, price,
      appointment_date, appointment_time, notes, payment_status, payment_method,
      status, tenant, professional_id, professional_name
    } = req.body;
    const targetTenant = tenant || req.tenantId;

    if (!client_name || !client_phone || !service_name || !appointment_date || !appointment_time) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: client_name, client_phone, service_name, appointment_date, appointment_time.'
      });
    }

    const created = await db.createAppointment({
      client_name,
      client_phone,
      service_id,
      service_name,
      price: parseFloat(price) || 0,
      appointment_date,
      appointment_time,
      notes,
      payment_status: payment_status || 'pendente',
      payment_method: payment_method || 'pix',
      status: status || 'pendente',
      professional_id,
      professional_name
    }, targetTenant);

    res.status(201).json({ success: true, message: 'Agendamento criado com sucesso!', data: created });
  } catch (err) {
    console.error('Erro ao criar agendamento:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao salvar agendamento.' });
  }
});

app.put('/api/appointments/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.body.tenant || req.tenantId;
    const updated = await db.updateAppointment(req.params.id, req.body, targetTenant);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
    }
    res.json({ success: true, message: 'Agendamento atualizado com sucesso!', data: updated });
  } catch (err) {
    console.error('Erro ao atualizar agendamento:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao atualizar agendamento.' });
  }
});

app.delete('/api/appointments/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const removed = await db.deleteAppointment(req.params.id, targetTenant);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Agendamento não encontrado.' });
    }
    res.json({ success: true, message: 'Agendamento removido com sucesso!', data: removed });
  } catch (err) {
    console.error('Erro ao excluir agendamento:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao excluir agendamento.' });
  }
});

// ----------------------------------------------------
// ROTAS DO FINANCEIRO (MULTI-TENANT)
// ----------------------------------------------------
app.get('/api/finances', async (req, res) => {
  try {
    const { type, category, startDate, endDate, date, tenant } = req.query;
    const targetTenant = tenant || req.tenantId;
    const transactions = await db.getTransactions({ type, category, startDate, endDate, date }, targetTenant);
    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (err) {
    console.error('Erro ao buscar financeiro:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar dados financeiros.' });
  }
});

app.post('/api/finances', async (req, res) => {
  try {
    const { type, category, description, amount, date, payment_method, status, tenant } = req.body;
    const targetTenant = tenant || req.tenantId;

    if (!type || !description || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Campos obrigatórios: type (receita/despesa), description, amount.'
      });
    }

    const created = await db.createTransaction({
      type,
      category: category || (type === 'receita' ? 'Atendimento' : 'Geral'),
      description,
      amount: parseFloat(amount),
      date: date || new Date().toISOString().split('T')[0],
      payment_method: payment_method || 'pix',
      status: status || 'pago'
    }, targetTenant);

    res.status(201).json({ success: true, message: 'Lançamento financeiro registrado!', data: created });
  } catch (err) {
    console.error('Erro ao criar transação financeira:', err);
    res.status(500).json({ success: false, error: 'Erro interno ao salvar transação.' });
  }
});

app.put('/api/finances/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.body.tenant || req.tenantId;
    const updated = await db.updateTransaction(req.params.id, req.body, targetTenant);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Transação não encontrada.' });
    }
    res.json({ success: true, message: 'Lançamento atualizado!', data: updated });
  } catch (err) {
    console.error('Erro ao atualizar transação:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar transação.' });
  }
});

app.delete('/api/finances/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const removed = await db.deleteTransaction(req.params.id, targetTenant);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Transação não encontrada.' });
    }
    res.json({ success: true, message: 'Lançamento excluído!', data: removed });
  } catch (err) {
    console.error('Erro ao excluir transação:', err);
    res.status(500).json({ success: false, error: 'Erro ao excluir transação.' });
  }
});

app.get('/api/finances/metrics', async (req, res) => {
  try {
    const { period, startDate, endDate, tenant } = req.query;
    const targetTenant = tenant || req.tenantId;
    const metrics = await db.getFinancialMetrics({ period: period || 'mes', startDate, endDate }, targetTenant);
    res.json({ success: true, data: metrics });
  } catch (err) {
    console.error('Erro ao calcular métricas:', err);
    res.status(500).json({ success: false, error: 'Erro ao processar métricas financeiras.' });
  }
});

// ----------------------------------------------------
// ROTAS DE ESTOQUE (MULTI-TENANT)
// ----------------------------------------------------
app.get('/api/inventory', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const items = await db.getInventory(targetTenant);
    res.json({ success: true, count: items.length, data: items });
  } catch (err) {
    console.error('Erro ao buscar estoque:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar itens de estoque.' });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const { name, category, quantity, min_quantity, cost_price, supplier, last_restock, tenant } = req.body;
    const targetTenant = tenant || req.tenantId;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Nome do produto é obrigatório.' });
    }

    const created = await db.createInventoryItem({
      name,
      category,
      quantity,
      min_quantity,
      cost_price,
      supplier,
      last_restock
    }, targetTenant);

    res.status(201).json({ success: true, message: 'Produto cadastrado no estoque!', data: created });
  } catch (err) {
    console.error('Erro ao criar item de estoque:', err);
    res.status(500).json({ success: false, error: 'Erro ao cadastrar produto no estoque.' });
  }
});

app.put('/api/inventory/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.body.tenant || req.tenantId;
    const updated = await db.updateInventoryItem(req.params.id, req.body, targetTenant);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Produto não encontrado.' });
    }
    res.json({ success: true, message: 'Estoque atualizado!', data: updated });
  } catch (err) {
    console.error('Erro ao atualizar estoque:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar produto no estoque.' });
  }
});

app.post('/api/inventory/:id/adjust', async (req, res) => {
  try {
    const { delta, tenant } = req.body;
    const targetTenant = tenant || req.tenantId;
    const adjusted = await db.adjustInventoryQuantity(req.params.id, delta, targetTenant);
    if (!adjusted) {
      return res.status(404).json({ success: false, error: 'Produto não encontrado.' });
    }
    res.json({ success: true, message: 'Quantidade ajustada!', data: adjusted });
  } catch (err) {
    console.error('Erro ao ajustar quantidade:', err);
    res.status(500).json({ success: false, error: 'Erro ao ajustar estoque.' });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const removed = await db.deleteInventoryItem(req.params.id, targetTenant);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Produto não encontrado.' });
    }
    res.json({ success: true, message: 'Produto removido do estoque!', data: removed });
  } catch (err) {
    console.error('Erro ao excluir do estoque:', err);
    res.status(500).json({ success: false, error: 'Erro ao remover produto.' });
  }
});

// ----------------------------------------------------
// ROTAS DE DISPONIBILIDADE & HORÁRIOS (MULTI-TENANT)
// ----------------------------------------------------
app.get('/api/availability', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const availability = await db.getAvailabilitySettings(targetTenant);
    res.json({ success: true, data: availability });
  } catch (err) {
    console.error('Erro ao buscar disponibilidade:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar horários e dias.' });
  }
});

app.put('/api/availability', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.body.tenant || req.tenantId;
    const updated = await db.updateAvailabilitySettings(req.body, targetTenant);
    res.json({ success: true, message: 'Configurações de horários e dias atualizadas!', data: updated });
  } catch (err) {
    console.error('Erro ao atualizar disponibilidade:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar horários.' });
  }
});

app.post('/api/availability/blocked-dates', async (req, res) => {
  try {
    const { date, reason, tenant } = req.body;
    const targetTenant = tenant || req.tenantId;
    if (!date) {
      return res.status(400).json({ success: false, error: 'Data é obrigatória.' });
    }
    const blocked = await db.addBlockedDate(date, reason, targetTenant);
    res.status(201).json({ success: true, message: 'Data bloqueada com sucesso!', data: blocked });
  } catch (err) {
    console.error('Erro ao bloquear data:', err);
    res.status(500).json({ success: false, error: 'Erro ao bloquear dia de atendimento.' });
  }
});

app.delete('/api/availability/blocked-dates/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const unblocked = await db.deleteBlockedDate(req.params.id, targetTenant);
    if (!unblocked) {
      return res.status(404).json({ success: false, error: 'Data bloqueada não encontrada.' });
    }
    res.json({ success: true, message: 'Data desbloqueada com sucesso!', data: unblocked });
  } catch (err) {
    console.error('Erro ao desbloquear data:', err);
    res.status(500).json({ success: false, error: 'Erro ao desbloquear dia.' });
  }
});

// ----------------------------------------------------
// ROTAS DE SERVIÇOS (MULTI-TENANT)
// ----------------------------------------------------
app.get('/api/services', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const config = await db.getServicesSettings(targetTenant);
    res.json({ success: true, data: config.services, show_prices: config.show_prices });
  } catch (err) {
    console.error('Erro ao buscar serviços:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar catálogo de serviços.' });
  }
});

app.post('/api/services', async (req, res) => {
  try {
    const { name, duration, price, description, category, tenant } = req.body;
    const targetTenant = tenant || req.tenantId;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Nome do serviço é obrigatório.' });
    }
    const created = await db.createService({ name, duration, price, description, category }, targetTenant);
    res.status(201).json({ success: true, message: 'Serviço criado com sucesso!', data: created });
  } catch (err) {
    console.error('Erro ao criar serviço:', err);
    res.status(500).json({ success: false, error: 'Erro ao criar serviço.' });
  }
});

app.put('/api/services/settings/toggle-prices', async (req, res) => {
  try {
    const { show_prices, tenant } = req.body;
    const targetTenant = tenant || req.tenantId;
    const updated = await db.toggleShowPrices(show_prices, targetTenant);
    res.json({ success: true, message: 'Exibição de preços atualizada!', show_prices: updated });
  } catch (err) {
    console.error('Erro ao alterar exibição de preços:', err);
    res.status(500).json({ success: false, error: 'Erro ao alterar exibição de preços.' });
  }
});

app.put('/api/services/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.body.tenant || req.tenantId;
    const updated = await db.updateService(req.params.id, req.body, targetTenant);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Serviço não encontrado.' });
    }
    res.json({ success: true, message: 'Serviço atualizado com sucesso!', data: updated });
  } catch (err) {
    console.error('Erro ao atualizar serviço:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar serviço.' });
  }
});

app.delete('/api/services/:id', async (req, res) => {
  try {
    const targetTenant = req.query.tenant || req.tenantId;
    const removed = await db.deleteService(req.params.id, targetTenant);
    if (!removed) {
      return res.status(404).json({ success: false, error: 'Serviço não encontrado.' });
    }
    res.json({ success: true, message: 'Serviço removido com sucesso!', data: removed });
  } catch (err) {
    console.error('Erro ao excluir serviço:', err);
    res.status(500).json({ success: false, error: 'Erro ao excluir serviço.' });
  }
});

// ----------------------------------------------------
// ROTAS DE PÁGINAS E NAVEGAÇÃO MULTI-TENANT
// ----------------------------------------------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/painel', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/agendar', (req, res) => res.sendFile(path.join(__dirname, 'agendamento.html')));
app.get('/agendamento.html', (req, res) => res.sendFile(path.join(__dirname, 'agendamento.html')));
app.get('/vitrine', (req, res) => res.sendFile(path.join(__dirname, 'vitrine.html')));
app.get('/vitrine.html', (req, res) => res.sendFile(path.join(__dirname, 'vitrine.html')));

// Rotas personalizadas por slug (/p/:slug -> Vitrine do salão, /p/:slug/agendar, /p/:slug/admin)
app.get('/p/:slug', (req, res) => res.sendFile(path.join(__dirname, 'vitrine.html')));
app.get('/p/:slug/agendar', (req, res) => res.sendFile(path.join(__dirname, 'agendamento.html')));
app.get('/p/:slug/agendamento', (req, res) => res.sendFile(path.join(__dirname, 'agendamento.html')));
app.get('/p/:slug/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// Inicialização Local ou Serverless
if (!process.env.VERCEL && require.main === module) {
  db.initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`✨ Atlas Agendamento Multi-Tenant rodando na porta ${PORT}!`);
      console.log(`🌐 Acesse: http://localhost:${PORT}`);
    });
  }).catch((err) => {
    console.error('Erro ao iniciar DB localmente:', err);
    app.listen(PORT, () => {
      console.log(`✨ Servidor rodando com contingência na porta ${PORT}!`);
    });
  });
}

module.exports = app;
