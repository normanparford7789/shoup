/*
# Add Shipping Branches, Governorates, and 25% Upfront Payment

## Overview
This migration adds:
1. Governorates table - admin-managed list of governorates/provinces
2. Shipping Branches table - admin-managed shipping branches per governorate
3. Order columns for 25% upfront payment, remaining amount, invoice number, and shipping branch reference

## New Tables
- `governorates` - name, is_active, sort_order
- `shipping_branches` - governorate_id (FK), branch_name, address, phone, manager_name, is_active, sort_order

## Modified Tables
- `orders` - added: upfront_amount, remaining_amount, invoice_number, shipping_branch_id

## Security
- Governorates and shipping branches: SELECT public (anon + authenticated), writes authenticated-only
- All tables have RLS enabled

## Important Notes
1. Customers select a governorate then a shipping branch during checkout (replaces address entry)
2. Orders now track 25% upfront payment and 75% remaining for cash-on-delivery model
3. Each order gets a unique invoice number for professional invoice generation
*/

-- ════════════════════════════════════════════════════════════
-- جدول المحافظات (Governorates)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS governorates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE governorates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_governorates" ON governorates;
CREATE POLICY "read_governorates" ON governorates FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_governorates" ON governorates;
CREATE POLICY "insert_governorates" ON governorates FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_governorates" ON governorates;
CREATE POLICY "update_governorates" ON governorates FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_governorates" ON governorates;
CREATE POLICY "delete_governorates" ON governorates FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_governorates_active ON governorates(is_active, sort_order);

-- ════════════════════════════════════════════════════════════
-- جدول افرع الشحن (Shipping Branches)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS shipping_branches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate_id  uuid NOT NULL REFERENCES governorates(id) ON DELETE CASCADE,
  branch_name     text NOT NULL,
  address         text NOT NULL,
  phone           text,
  manager_name    text,
  is_active       boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shipping_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_shipping_branches" ON shipping_branches;
CREATE POLICY "read_shipping_branches" ON shipping_branches FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_shipping_branches" ON shipping_branches;
CREATE POLICY "insert_shipping_branches" ON shipping_branches FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_shipping_branches" ON shipping_branches;
CREATE POLICY "update_shipping_branches" ON shipping_branches FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_shipping_branches" ON shipping_branches;
CREATE POLICY "delete_shipping_branches" ON shipping_branches FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_shipping_branches_governorate ON shipping_branches(governorate_id);
CREATE INDEX IF NOT EXISTS idx_shipping_branches_active ON shipping_branches(is_active, sort_order);

-- updated_at triggers
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_governorates_updated_at ON governorates;
CREATE TRIGGER trg_governorates_updated_at
  BEFORE UPDATE ON governorates
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS trg_shipping_branches_updated_at ON shipping_branches;
CREATE TRIGGER trg_shipping_branches_updated_at
  BEFORE UPDATE ON shipping_branches
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Add shipping-related columns to orders
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='upfront_amount') THEN
    ALTER TABLE orders ADD COLUMN upfront_amount numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='remaining_amount') THEN
    ALTER TABLE orders ADD COLUMN remaining_amount numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='invoice_number') THEN
    ALTER TABLE orders ADD COLUMN invoice_number text UNIQUE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='shipping_branch_id') THEN
    ALTER TABLE orders ADD COLUMN shipping_branch_id uuid REFERENCES shipping_branches(id) ON DELETE SET NULL;
  END IF;
END $$;
