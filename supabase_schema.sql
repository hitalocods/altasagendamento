-- ====================================================================
-- ATLAS AGENDAMENTO — SCHEMA DE PRODUÇÃO SUPABASE (POSTGRESQL)
-- Projeto: ngfjahsvmwkevcdfcofd
-- URL: https://ngfjahsvmwkevcdfcofd.supabase.co
-- ====================================================================

-- 1. TABELA DE TENANTS (NEGÓCIOS / SALÕES)
CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
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
  specialties TEXT, -- JSON array em string ou texto
  admin_pin TEXT DEFAULT '1234',
  plan TEXT DEFAULT 'pro',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. TABELA DE PROFISSIONAIS DA EQUIPE
CREATE TABLE IF NOT EXISTS professionals (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'Profissional',
  whatsapp TEXT,
  avatar TEXT,
  color TEXT DEFAULT '#B59B79',
  active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABELA DE SERVIÇOS
CREATE TABLE IF NOT EXISTS services (
  id TEXT NOT NULL,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  duration TEXT DEFAULT '1h',
  price NUMERIC(10,2) DEFAULT 0.00,
  description TEXT,
  category TEXT DEFAULT 'Geral',
  PRIMARY KEY (tenant_id, id)
);

-- 4. TABELA DE AGENDAMENTOS
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  professional_id INTEGER REFERENCES professionals(id) ON DELETE SET NULL,
  professional_name TEXT,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  service_id TEXT,
  service_name TEXT NOT NULL,
  price NUMERIC(10,2) DEFAULT 0.00,
  appointment_date DATE NOT NULL,
  appointment_time TEXT NOT NULL,
  notes TEXT,
  payment_status TEXT DEFAULT 'pendente',
  payment_method TEXT DEFAULT 'pix',
  status TEXT DEFAULT 'pendente',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. TABELA DE FINANÇAS (RECEITAS & DESPESAS)
CREATE TABLE IF NOT EXISTS finances (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'receita' | 'despesa'
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  date DATE NOT NULL,
  payment_method TEXT DEFAULT 'pix',
  status TEXT DEFAULT 'pago',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. TABELA DE ESTOQUE
CREATE TABLE IF NOT EXISTS inventory (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 2,
  cost_price NUMERIC(10,2) DEFAULT 0.00,
  supplier TEXT,
  last_restock TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. TABELA DE CONFIGURAÇÕES POR TENANT (DISPONIBILIDADE, PREÇOS, ETC.)
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

-- ====================================================================
-- ÍNDICES PARA ALTA PERFORMANCE MULTI-TENANT
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_professionals_tenant ON professionals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_date ON appointments(tenant_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_prof ON appointments(professional_id);
CREATE INDEX IF NOT EXISTS idx_finances_tenant_date ON finances(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_inventory_tenant ON inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_settings_tenant ON tenant_settings(tenant_id);

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES PARA O SUPABASE
-- Permite acesso total para a aplicação pública e administrativa
-- ====================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  -- Tenants
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'Allow public full access on tenants') THEN
    CREATE POLICY "Allow public full access on tenants" ON tenants FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Professionals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'professionals' AND policyname = 'Allow public full access on professionals') THEN
    CREATE POLICY "Allow public full access on professionals" ON professionals FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Services
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'services' AND policyname = 'Allow public full access on services') THEN
    CREATE POLICY "Allow public full access on services" ON services FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Appointments
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'appointments' AND policyname = 'Allow public full access on appointments') THEN
    CREATE POLICY "Allow public full access on appointments" ON appointments FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Finances
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'finances' AND policyname = 'Allow public full access on finances') THEN
    CREATE POLICY "Allow public full access on finances" ON finances FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Inventory
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inventory' AND policyname = 'Allow public full access on inventory') THEN
    CREATE POLICY "Allow public full access on inventory" ON inventory FOR ALL USING (true) WITH CHECK (true);
  END IF;

  -- Tenant Settings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_settings' AND policyname = 'Allow public full access on tenant_settings') THEN
    CREATE POLICY "Allow public full access on tenant_settings" ON tenant_settings FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ====================================================================
-- SEED INICIAL: STUDIO LUMINA — SALÃO & BELEZA (PLANO SALÃO PRO)
-- ====================================================================
INSERT INTO tenants (
  slug, business_name, title_first, title_last, tagline,
  description, about_text, primary_photo, whatsapp, instagram,
  specialties, admin_pin, plan
) VALUES (
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
  '["Cabelos & Penteados", "Maquiagem", "Unhas & Alongamentos", "Estética Facial"]',
  '1234',
  'pro'
) ON CONFLICT (slug) DO NOTHING;

-- Inserir Profissionais Padrão da Equipe (Tenant Studio Lumina)
DO $$
DECLARE
  v_tenant_id INT;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants WHERE slug = 'studio-lumina' LIMIT 1;
  IF v_tenant_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM professionals WHERE tenant_id = v_tenant_id) THEN
      INSERT INTO professionals (tenant_id, name, role, whatsapp, avatar, color, active)
      VALUES 
        (v_tenant_id, 'Camila Santos', 'Master Hair & Visagista', '(11) 98765-4321', 'img/default_avatar.webp', '#B59B79', 1),
        (v_tenant_id, 'Juliana Costa', 'Maquiadora Especialista', '(11) 98765-4322', 'img/default_avatar.webp', '#A88661', 1),
        (v_tenant_id, 'Beatriz Lima', 'Nail Designer & Alongamentos', '(11) 98765-4323', 'img/default_avatar.webp', '#D6BD9F', 1);
    END IF;

    -- Inserir Serviços Padrão
    IF NOT EXISTS (SELECT 1 FROM services WHERE tenant_id = v_tenant_id) THEN
      INSERT INTO services (id, tenant_id, name, duration, price, description, category)
      VALUES
        ('social', v_tenant_id, 'Maquiagem Social', '1h', 160.00, 'Produção sofisticada e duradoura para eventos sociais, madrinhas e convidadas.', 'Maquiagem'),
        ('noiva', v_tenant_id, 'Noiva (Produção Completa)', '2h30', 450.00, 'Atendimento de alta exclusividade com prévia, blindagem total e acabamento de alta definição.', 'Noivas'),
        ('formanda', v_tenant_id, 'Formanda Glam', '2h', 220.00, 'Make marcante com iluminação glamorosa, pele resistente a lágrimas e fotos inesquecíveis.', 'Formandas'),
        ('penteado', v_tenant_id, 'Penteado Exclusivo', '1h', 140.00, 'Semipreso, coque clássico, tranças estilizadas ou ondas glamorosas.', 'Cabelo'),
        ('combo', v_tenant_id, 'Combo Make + Penteado', '2h', 280.00, 'Harmonização total de cabelo e maquiagem para uma presença impecável.', 'Combos');
    END IF;

    -- Inserir Estoque Padrão
    IF NOT EXISTS (SELECT 1 FROM inventory WHERE tenant_id = v_tenant_id) THEN
      INSERT INTO inventory (tenant_id, name, category, quantity, min_quantity, cost_price, supplier, last_restock)
      VALUES
        (v_tenant_id, 'Base Líquida Kryolan Dermacolor', 'Maquiagem', 4, 2, 189.90, 'Kryolan Brasil', '2026-08-28'),
        (v_tenant_id, 'Cílios Postiços 3D Mink (Par)', 'Descartáveis', 15, 5, 14.50, 'Distribuidora Glam', '2026-08-25'),
        (v_tenant_id, 'Fixador de Maquiagem Blindagem', 'Maquiagem', 1, 3, 65.00, 'Beauty Store', '2026-08-10'),
        (v_tenant_id, 'Spray Fixador de Penteado Extra Forte', 'Penteados', 5, 2, 58.00, 'Schwarzkopf', '2026-08-20'),
        (v_tenant_id, 'Pó Facial Translúcido Laura Mercier', 'Maquiagem', 1, 2, 240.00, 'Sephora', '2026-08-15'),
        (v_tenant_id, 'Iluminador Líquido Rare Beauty', 'Maquiagem', 3, 2, 190.00, 'Sephora', '2026-08-29');
    END IF;

    -- Inserir Configurações Padrão
    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES 
      (v_tenant_id, 'availability', '{"active_days":[1,2,3,4,5,6],"custom_times":["07:30","08:30","10:00","11:30","14:00","15:30","17:00","18:30"],"daily_times":{"0":["09:00","11:00","14:00","16:00"],"1":["07:30","08:30","10:00","11:30","14:00","15:30","17:00","18:30"],"2":["07:30","08:30","10:00","11:30","14:00","15:30","17:00","18:30"],"3":["07:30","08:30","10:00","11:30","14:00","15:30","17:00","18:30"],"4":["07:30","08:30","10:00","11:30","14:00","15:30","17:00","18:30"],"5":["07:30","08:30","10:00","11:30","14:00","15:30","17:00","18:30"],"6":["07:30","08:30","10:00","11:30","14:00","15:30","17:00","18:30"]},"blocked_dates":[{"id":"1","date":"2026-09-15","reason":"Curso de Especialização"},{"id":"2","date":"2026-09-25","reason":"Viagem / Congresso"}]}')
    ON CONFLICT (tenant_id, key) DO NOTHING;

    INSERT INTO tenant_settings (tenant_id, key, value)
    VALUES (v_tenant_id, 'show_prices', 'true')
    ON CONFLICT (tenant_id, key) DO NOTHING;

    -- Inserir Agendamentos e Finanças Demonstrativos
    IF NOT EXISTS (SELECT 1 FROM appointments WHERE tenant_id = v_tenant_id) THEN
      INSERT INTO appointments (
        tenant_id, client_name, client_phone, service_id, service_name, price,
        appointment_date, appointment_time, notes, payment_status, payment_method, status,
        professional_id, professional_name
      ) VALUES
        (v_tenant_id, 'Mariana Oliveira', '(11) 98888-1111', 'combo', 'Combo Make + Penteado', 280.00, '2026-09-18', '14:00', 'Madrinha de casamento', 'pago_total', 'pix', 'confirmado', (SELECT id FROM professionals WHERE tenant_id = v_tenant_id AND name LIKE 'Camila%' LIMIT 1), 'Camila Santos'),
        (v_tenant_id, 'Fernanda Costa', '(11) 97777-2222', 'formanda', 'Formanda Glam', 220.00, '2026-09-18', '16:30', 'Formatura', 'sinal_pago', 'pix', 'pendente', (SELECT id FROM professionals WHERE tenant_id = v_tenant_id AND name LIKE 'Juliana%' LIMIT 1), 'Juliana Costa'),
        (v_tenant_id, 'Patricia Souza', '(11) 96666-3333', 'noiva', 'Noiva (Produção Completa)', 450.00, '2026-09-20', '15:00', 'Noiva', 'sinal_pago', 'pix', 'confirmado', (SELECT id FROM professionals WHERE tenant_id = v_tenant_id AND name LIKE 'Camila%' LIMIT 1), 'Camila Santos');

      INSERT INTO finances (tenant_id, type, category, description, amount, date, payment_method, status)
      VALUES
        (v_tenant_id, 'receita', 'Serviço', 'Combo Make + Penteado - Mariana Oliveira', 280.00, '2026-09-18', 'pix', 'pago'),
        (v_tenant_id, 'receita', 'Sinal', 'Sinal Formanda Glam - Fernanda Costa', 110.00, '2026-09-18', 'pix', 'pago'),
        (v_tenant_id, 'receita', 'Sinal', 'Sinal Noiva Completa - Patricia Souza', 225.00, '2026-09-20', 'pix', 'pago'),
        (v_tenant_id, 'despesa', 'Produtos', 'Reposição Base Kryolan e Cílios 3D', 204.40, '2026-09-14', 'cartao_credito', 'pago'),
        (v_tenant_id, 'despesa', 'Custos Fixos', 'Energia Elétrica & Condomínio Studio', 380.00, '2026-09-10', 'boleto', 'pago');
    END IF;
  END IF;
END $$;
