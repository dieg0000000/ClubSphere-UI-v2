/*
  # Create Finance System

  1. New Tables
    - `finance_config` - Club and bank configuration for invoicing
      - Club info (name, address, postal code, city)
      - Bank info (QR-IBAN, bank name, bank address)
      - Email settings (sender, sender name, payment delay)
      - Reminder settings (days, fees)
      - Sibling discount settings (max age, discount percentages)
    
    - `seasons` - Season configuration for invoice numbering
      - Season name (ex: "2025-2026")
      - Season code (ex: "2526")
      - Invoice prefix (ex: "FA2526")
      - Invoice counter
      - Start/end dates
      - Active flag
    
    - `fee_configs` - Fee amounts per category per season
      - Links to season and team_category
      - Amount in CHF
      - Currency
      - Description
    
    - `invoices` - Member invoices
      - Invoice number (unique)
      - Links to season, member, team, category
      - Base amount and discounts
      - Sibling discount details
      - QR reference for payment
      - Status tracking (draft, sent, paid, cancelled, etc.)
      - Reminder dates
      - Payment dates
      - Cancellation info
      - Email tracking
    
    - `payments` - Payment records from bank imports
      - Links to invoice
      - Amount and currency
      - Payment date
      - QR reference
      - Debtor info
      - CAMT transaction details
      - Automatic matching flag

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage all finance data
*/

-- Finance configuration (one row per club)
CREATE TABLE IF NOT EXISTS finance_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  club_name TEXT,
  club_address TEXT,
  club_postal_code TEXT,
  club_city TEXT,
  bank_name TEXT,
  bank_address TEXT,
  qr_iban TEXT,
  email_sender TEXT DEFAULT 'info@fcromanel.ch',
  email_sender_name TEXT DEFAULT 'FC Romanel',
  payment_delay_days INTEGER DEFAULT 30,
  reminder1_days INTEGER DEFAULT 40,
  reminder2_days INTEGER DEFAULT 55,
  reminder2_fee DECIMAL(10,2) DEFAULT 30.00,
  fratrie_max_age INTEGER DEFAULT 18,
  fratrie_discount_2 INTEGER DEFAULT 20,
  fratrie_discount_3 INTEGER DEFAULT 30,
  fratrie_discount_4 INTEGER DEFAULT 40,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Season configuration
CREATE TABLE IF NOT EXISTS seasons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  invoice_prefix TEXT NOT NULL,
  invoice_next_number INTEGER DEFAULT 1,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Fee configuration per category per season
CREATE TABLE IF NOT EXISTS fee_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  season_id UUID REFERENCES seasons(id) ON DELETE CASCADE,
  category_id UUID REFERENCES team_categories(id),
  category_name TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'CHF',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(season_id, category_id)
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  season_id UUID REFERENCES seasons(id),
  member_id UUID REFERENCES members(id),
  team_id UUID REFERENCES teams(id),
  category_id UUID REFERENCES team_categories(id),
  
  base_amount DECIMAL(10,2) NOT NULL,
  fratrie_discount_pct INTEGER DEFAULT 0,
  fratrie_discount_amount DECIMAL(10,2) DEFAULT 0,
  reminder_fee DECIMAL(10,2) DEFAULT 0,
  total_amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'CHF',
  
  fratrie_group_id UUID,
  fratrie_sibling_count INTEGER DEFAULT 1,
  
  qr_reference TEXT,
  
  status TEXT DEFAULT 'draft',
  
  issue_date DATE,
  due_date DATE,
  paid_date DATE,
  reminder1_date DATE,
  reminder2_date DATE,
  
  cancelled_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  
  sent_to_email TEXT,
  last_sent_at TIMESTAMPTZ,
  
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Payments (from camt.054 import)
CREATE TABLE IF NOT EXISTS payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID REFERENCES invoices(id),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'CHF',
  payment_date DATE,
  qr_reference TEXT,
  debtor_name TEXT,
  debtor_iban TEXT,
  camt_transaction_id TEXT,
  import_batch TEXT,
  matched_automatically BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE finance_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated can view finance_config"
  ON finance_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert finance_config"
  ON finance_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update finance_config"
  ON finance_config FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete finance_config"
  ON finance_config FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can view seasons"
  ON seasons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert seasons"
  ON seasons FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update seasons"
  ON seasons FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete seasons"
  ON seasons FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can view fee_configs"
  ON fee_configs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert fee_configs"
  ON fee_configs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update fee_configs"
  ON fee_configs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete fee_configs"
  ON fee_configs FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can view invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can view payments"
  ON payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update payments"
  ON payments FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete payments"
  ON payments FOR DELETE
  TO authenticated
  USING (true);