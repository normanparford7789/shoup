-- ============================================================
--  STYLE APP — ADD ROLES, WALLETS, AFFILIATES & MERCHANT FEATURES
--  نسخ هذا الكود كاملاً في Supabase → SQL Editor → Run
--  يضيف نظام الأدوار، المحافظ، طلبات السحب، روابط الأفلييت، وإدارة التجار
--  آمن لإعادة التشغيل (idempotent) — يمكن تشغيله أكثر من مرة بدون مشاكل
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. إضافة دور المستخدم وحالة الحظر/التفعيل لجدول profiles
-- ════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='role') THEN
    ALTER TABLE profiles ADD COLUMN role text NOT NULL DEFAULT 'customer'
      CHECK (role IN ('customer','publisher','merchant','admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_banned') THEN
    ALTER TABLE profiles ADD COLUMN is_banned boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_active') THEN
    ALTER TABLE profiles ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='admin_notes') THEN
    ALTER TABLE profiles ADD COLUMN admin_notes text;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 2. إضافة merchant_id لجدول المنتجات
-- ════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='merchant_id') THEN
    ALTER TABLE products ADD COLUMN merchant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_merchant ON products(merchant_id);

-- ════════════════════════════════════════════════════════════
-- 3. إضافة merchant_id لجدول الريلزات
-- ════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reels' AND column_name='merchant_id') THEN
    ALTER TABLE reels ADD COLUMN merchant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reels_merchant ON reels(merchant_id);

-- ════════════════════════════════════════════════════════════
-- 4. إضافة تتبع الأفلييت لجدول الطلبات
-- ════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='affiliate_code') THEN
    ALTER TABLE orders ADD COLUMN affiliate_code text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='affiliate_user_id') THEN
    ALTER TABLE orders ADD COLUMN affiliate_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- 5. إضافة أرباح التاجر والأفلييت وفترة الاحتجاز لجدول عناصر الطلب
-- ════════════════════════════════════════════════════════════
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='merchant_id') THEN
    ALTER TABLE order_items ADD COLUMN merchant_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='merchant_earnings') THEN
    ALTER TABLE order_items ADD COLUMN merchant_earnings numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='affiliate_earnings') THEN
    ALTER TABLE order_items ADD COLUMN affiliate_earnings numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_items' AND column_name='hold_until') THEN
    ALTER TABLE order_items ADD COLUMN hold_until timestamptz;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_order_items_merchant ON order_items(merchant_id);

-- ════════════════════════════════════════════════════════════
-- 5b. جدول المحافظات (Governorates)
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
CREATE POLICY "read_governorates" ON governorates FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_governorates" ON governorates;
CREATE POLICY "insert_governorates" ON governorates FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_governorates" ON governorates;
CREATE POLICY "update_governorates" ON governorates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_governorates" ON governorates;
CREATE POLICY "delete_governorates" ON governorates FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_governorates_active ON governorates(is_active, sort_order);

CREATE TRIGGER trg_governorates_updated_at
  BEFORE UPDATE ON governorates
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ════════════════════════════════════════════════════════════
-- 5c. جدول افرع الشحن (Shipping Branches)
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
CREATE POLICY "read_shipping_branches" ON shipping_branches FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_shipping_branches" ON shipping_branches;
CREATE POLICY "insert_shipping_branches" ON shipping_branches FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_shipping_branches" ON shipping_branches;
CREATE POLICY "update_shipping_branches" ON shipping_branches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_shipping_branches" ON shipping_branches;
CREATE POLICY "delete_shipping_branches" ON shipping_branches FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_shipping_branches_governorate ON shipping_branches(governorate_id);
CREATE INDEX IF NOT EXISTS idx_shipping_branches_active ON shipping_branches(is_active, sort_order);

CREATE TRIGGER trg_shipping_branches_updated_at
  BEFORE UPDATE ON shipping_branches
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- Add shipping-related columns to orders
DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='upfront_amount') THEN
    ALTER TABLE orders ADD COLUMN upfront_amount numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $;

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='remaining_amount') THEN
    ALTER TABLE orders ADD COLUMN remaining_amount numeric(12,2) NOT NULL DEFAULT 0;
  END IF;
END $;

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='invoice_number') THEN
    ALTER TABLE orders ADD COLUMN invoice_number text UNIQUE;
  END IF;
END $;

DO $ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='shipping_branch_id') THEN
    ALTER TABLE orders ADD COLUMN shipping_branch_id uuid REFERENCES shipping_branches(id) ON DELETE SET NULL;
  END IF;
END $;

-- ════════════════════════════════════════════════════════════
-- 6. جدول المحافظ (Wallets)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wallets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  available_balance numeric(12,2) NOT NULL DEFAULT 0,
  pending_balance  numeric(12,2) NOT NULL DEFAULT 0,
  total_earned     numeric(12,2) NOT NULL DEFAULT 0,
  total_withdrawn  numeric(12,2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
CREATE POLICY "wallets_select_own" ON wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
CREATE POLICY "wallets_update_own" ON wallets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
CREATE POLICY "wallets_insert_own" ON wallets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);

CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ════════════════════════════════════════════════════════════
-- 7. جدول معاملات المحفظة (Wallet Transactions)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       uuid NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type            text NOT NULL CHECK (type IN ('credit','debit','pending_credit','pending_release','withdrawal','adjustment','topup','payment')),
  amount          numeric(12,2) NOT NULL,
  description     text,
  order_id        uuid REFERENCES orders(id) ON DELETE SET NULL,
  order_item_id   uuid REFERENCES order_items(id) ON DELETE SET NULL,
  withdrawal_id   uuid,
  status          text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed','cancelled')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_tx_select_own" ON wallet_transactions;
CREATE POLICY "wallet_tx_select_own" ON wallet_transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallet_tx_insert_own" ON wallet_transactions;
CREATE POLICY "wallet_tx_insert_own" ON wallet_transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_wallet ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_created ON wallet_transactions(created_at DESC);

-- ════════════════════════════════════════════════════════════
-- 8. جدول طلبات السحب (Withdrawal Requests)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_info    text NOT NULL,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid','cancelled')),
  admin_notes     text,
  invoice_number  text UNIQUE,
  processed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdrawals_select_own" ON withdrawal_requests;
CREATE POLICY "withdrawals_select_own" ON withdrawal_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "withdrawals_insert_own" ON withdrawal_requests;
CREATE POLICY "withdrawals_insert_own" ON withdrawal_requests FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "withdrawals_update_own" ON withdrawal_requests;
CREATE POLICY "withdrawals_update_own" ON withdrawal_requests FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawal_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created ON withdrawal_requests(created_at DESC);

CREATE TRIGGER trg_withdrawals_updated_at
  BEFORE UPDATE ON withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ════════════════════════════════════════════════════════════
-- 9. جدول روابط الأفلييت (Affiliate Links)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  affiliate_code  text UNIQUE NOT NULL,
  clicks_count    int NOT NULL DEFAULT 0,
  purchases_count int NOT NULL DEFAULT 0,
  total_earnings  numeric(12,2) NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE affiliate_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliate_links_select_own" ON affiliate_links;
CREATE POLICY "affiliate_links_select_own" ON affiliate_links FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "affiliate_links_insert_own" ON affiliate_links;
CREATE POLICY "affiliate_links_insert_own" ON affiliate_links FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "affiliate_links_update_own" ON affiliate_links;
CREATE POLICY "affiliate_links_update_own" ON affiliate_links FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "affiliate_links_delete_own" ON affiliate_links;
CREATE POLICY "affiliate_links_delete_own" ON affiliate_links FOR DELETE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "affiliate_links_read_by_code" ON affiliate_links;
CREATE POLICY "affiliate_links_read_by_code" ON affiliate_links FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_affiliate_links_user ON affiliate_links(user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_product ON affiliate_links(product_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_links_code ON affiliate_links(affiliate_code);

-- ════════════════════════════════════════════════════════════
-- 10. جدول نقرات الأفلييت (Affiliate Clicks)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_link_id uuid NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "affiliate_clicks_insert_any" ON affiliate_clicks;
CREATE POLICY "affiliate_clicks_insert_any" ON affiliate_clicks FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "affiliate_clicks_select_own" ON affiliate_clicks;
CREATE POLICY "affiliate_clicks_select_own" ON affiliate_clicks FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_link ON affiliate_clicks(affiliate_link_id);

-- ════════════════════════════════════════════════════════════
-- 11. جدول قيود التاجر (Merchant Restrictions)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS merchant_restrictions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id     uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  can_upload_products boolean NOT NULL DEFAULT true,
  can_upload_reels    boolean NOT NULL DEFAULT true,
  can_edit_products   boolean NOT NULL DEFAULT true,
  can_delete_products boolean NOT NULL DEFAULT true,
  restricted_notes    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE merchant_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_restrictions_select_own" ON merchant_restrictions;
CREATE POLICY "merchant_restrictions_select_own" ON merchant_restrictions FOR SELECT TO authenticated USING (auth.uid() = merchant_id);

DROP POLICY IF EXISTS "merchant_restrictions_insert_own" ON merchant_restrictions;
CREATE POLICY "merchant_restrictions_insert_own" ON merchant_restrictions FOR INSERT TO authenticated WITH CHECK (auth.uid() = merchant_id);

DROP POLICY IF EXISTS "merchant_restrictions_update_own" ON merchant_restrictions;
CREATE POLICY "merchant_restrictions_update_own" ON merchant_restrictions FOR UPDATE TO authenticated USING (auth.uid() = merchant_id) WITH CHECK (auth.uid() = merchant_id);

CREATE INDEX IF NOT EXISTS idx_merchant_restrictions_merchant ON merchant_restrictions(merchant_id);

CREATE TRIGGER trg_merchant_restrictions_updated_at
  BEFORE UPDATE ON merchant_restrictions
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ════════════════════════════════════════════════════════════
-- 12. إنشاء محفظة تلقائياً عند تسجيل الناشر/التاجر
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION handle_new_user_extended()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'customer')
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role;

  IF COALESCE(NEW.raw_user_meta_data->>'role', 'customer') IN ('publisher', 'merchant') THEN
    INSERT INTO wallets (user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user_extended();

-- ════════════════════════════════════════════════════════════
-- 13. دالة: معالجة أرباح التاجر (75%) والأفلييت (10%) عند الطلب
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION process_order_merchant_earnings(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item record;
  merchant_earn numeric(12,2);
  affiliate_earn numeric(12,2);
  hold_date timestamptz;
  w_id uuid;
BEGIN
  hold_date := now() + interval '10 days';

  FOR item IN
    SELECT oi.id, oi.product_id, oi.subtotal, oi.quantity, p.merchant_id, o.affiliate_user_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id
  LOOP
    merchant_earn := ROUND(item.subtotal * 0.75, 2);

    IF item.affiliate_user_id IS NOT NULL THEN
      affiliate_earn := ROUND(item.subtotal * 0.10, 2);
    ELSE
      affiliate_earn := 0;
    END IF;

    UPDATE order_items SET
      merchant_id = item.merchant_id,
      merchant_earnings = merchant_earn,
      affiliate_earnings = affiliate_earn,
      hold_until = hold_date
    WHERE id = item.id;

    IF item.merchant_id IS NOT NULL THEN
      SELECT id INTO w_id FROM wallets WHERE user_id = item.merchant_id;
      IF w_id IS NULL THEN
        INSERT INTO wallets (user_id) VALUES (item.merchant_id)
        ON CONFLICT (user_id) DO NOTHING;
        SELECT id INTO w_id FROM wallets WHERE user_id = item.merchant_id;
      END IF;

      UPDATE wallets SET
        pending_balance = pending_balance + merchant_earn,
        total_earned = total_earned + merchant_earn,
        updated_at = now()
      WHERE user_id = item.merchant_id;

      INSERT INTO wallet_transactions (
        wallet_id, user_id, type, amount, description, order_id, order_item_id, status
      ) VALUES (
        w_id, item.merchant_id, 'pending_credit', merchant_earn,
        'Earnings from order (10-day hold)', p_order_id, item.id, 'pending'
      );
    END IF;

    IF item.affiliate_user_id IS NOT NULL THEN
      SELECT id INTO w_id FROM wallets WHERE user_id = item.affiliate_user_id;
      IF w_id IS NULL THEN
        INSERT INTO wallets (user_id) VALUES (item.affiliate_user_id)
        ON CONFLICT (user_id) DO NOTHING;
        SELECT id INTO w_id FROM wallets WHERE user_id = item.affiliate_user_id;
      END IF;

      UPDATE wallets SET
        pending_balance = pending_balance + affiliate_earn,
        total_earned = total_earned + affiliate_earn,
        updated_at = now()
      WHERE user_id = item.affiliate_user_id;

      INSERT INTO wallet_transactions (
        wallet_id, user_id, type, amount, description, order_id, order_item_id, status
      ) VALUES (
        w_id, item.affiliate_user_id, 'pending_credit', affiliate_earn,
        'Affiliate commission from order (10-day hold)', p_order_id, item.id, 'pending'
      );
    END IF;
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 14. دالة: تحرير الأرباح المعلقة بعد 10 أيام
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION release_pending_earnings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  item record;
  w_id uuid;
BEGIN
  FOR item IN
    SELECT oi.id, oi.merchant_id, oi.merchant_earnings, oi.affiliate_earnings,
           oi.order_id, oi.hold_until,
           o.affiliate_user_id
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    WHERE oi.hold_until IS NOT NULL
      AND oi.hold_until <= now()
      AND oi.merchant_earnings > 0
  LOOP
    IF item.merchant_id IS NOT NULL AND item.merchant_earnings > 0 THEN
      SELECT id INTO w_id FROM wallets WHERE user_id = item.merchant_id;
      IF w_id IS NOT NULL THEN
        UPDATE wallets SET
          pending_balance = GREATEST(pending_balance - item.merchant_earnings, 0),
          available_balance = available_balance + item.merchant_earnings,
          updated_at = now()
        WHERE user_id = item.merchant_id;

        INSERT INTO wallet_transactions (
          wallet_id, user_id, type, amount, description, order_id, order_item_id, status
        ) VALUES (
          w_id, item.merchant_id, 'pending_release', item.merchant_earnings,
          'Pending earnings released', item.order_id, item.id, 'completed'
        );
      END IF;
    END IF;

    IF item.affiliate_user_id IS NOT NULL AND item.affiliate_earnings > 0 THEN
      SELECT id INTO w_id FROM wallets WHERE user_id = item.affiliate_user_id;
      IF w_id IS NOT NULL THEN
        UPDATE wallets SET
          pending_balance = GREATEST(pending_balance - item.affiliate_earnings, 0),
          available_balance = available_balance + item.affiliate_earnings,
          updated_at = now()
        WHERE user_id = item.affiliate_user_id;

        INSERT INTO wallet_transactions (
          wallet_id, user_id, type, amount, description, order_id, order_item_id, status
        ) VALUES (
          w_id, item.affiliate_user_id, 'pending_release', item.affiliate_earnings,
          'Affiliate pending earnings released', item.order_id, item.id, 'completed'
        );
      END IF;
    END IF;

    UPDATE order_items SET hold_until = NULL WHERE id = item.id;
  END LOOP;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 15. دالة: معالجة طلب السحب (يدفع الأدمن)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION process_withdrawal(
  p_withdrawal_id uuid,
  p_status text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  w record;
  w_id uuid;
BEGIN
  SELECT * INTO w FROM withdrawal_requests WHERE id = p_withdrawal_id;
  IF w IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request not found';
  END IF;

  IF p_status = 'paid' THEN
    SELECT id INTO w_id FROM wallets WHERE user_id = w.user_id;
    IF w_id IS NOT NULL THEN
      UPDATE wallets SET
        available_balance = GREATEST(available_balance - w.amount, 0),
        total_withdrawn = total_withdrawn + w.amount,
        updated_at = now()
      WHERE user_id = w.user_id;

      INSERT INTO wallet_transactions (
        wallet_id, user_id, type, amount, description, withdrawal_id, status
      ) VALUES (
        w_id, w.user_id, 'withdrawal', w.amount,
        'Withdrawal paid: ' || COALESCE(w.invoice_number, 'N/A'),
        p_withdrawal_id, 'completed'
      );
    END IF;
  END IF;

  UPDATE withdrawal_requests SET
    status = p_status,
    processed_at = now(),
    updated_at = now()
  WHERE id = p_withdrawal_id;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 16. دالة: تسجيل نقرة على رابط الأفلييت
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION track_affiliate_click(p_affiliate_code text, p_user_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  link record;
BEGIN
  SELECT * INTO link FROM affiliate_links WHERE affiliate_code = p_affiliate_code AND is_active = true;
  IF link IS NOT NULL THEN
    UPDATE affiliate_links SET clicks_count = clicks_count + 1 WHERE id = link.id;
    INSERT INTO affiliate_clicks (affiliate_link_id, product_id, user_id)
    VALUES (link.id, link.product_id, p_user_id);
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 17. تحديث سياسات المنتجات للملكية التجارية
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "products_insert" ON products;
DROP POLICY IF EXISTS "products_insert_merchant" ON products;
CREATE POLICY "products_insert_merchant" ON products FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "products_update" ON products;
DROP POLICY IF EXISTS "products_update_merchant" ON products;
CREATE POLICY "products_update_merchant" ON products FOR UPDATE TO authenticated
  USING (merchant_id IS NULL OR auth.uid() = merchant_id)
  WITH CHECK (merchant_id IS NULL OR auth.uid() = merchant_id);

DROP POLICY IF EXISTS "products_delete" ON products;
DROP POLICY IF EXISTS "products_delete_merchant" ON products;
CREATE POLICY "products_delete_merchant" ON products FOR DELETE TO authenticated
  USING (merchant_id IS NULL OR auth.uid() = merchant_id);

-- ════════════════════════════════════════════════════════════
-- 18. تحديث سياسات الريلزات للملكية التجارية
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "reels_insert" ON reels;
DROP POLICY IF EXISTS "reels_insert_merchant" ON reels;
CREATE POLICY "reels_insert_merchant" ON reels FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "reels_update" ON reels;
DROP POLICY IF EXISTS "reels_update_merchant" ON reels;
CREATE POLICY "reels_update_merchant" ON reels FOR UPDATE TO authenticated
  USING (merchant_id IS NULL OR auth.uid() = merchant_id)
  WITH CHECK (merchant_id IS NULL OR auth.uid() = merchant_id);

DROP POLICY IF EXISTS "reels_delete" ON reels;
DROP POLICY IF EXISTS "reels_delete_merchant" ON reels;
CREATE POLICY "reels_delete_merchant" ON reels FOR DELETE TO authenticated
  USING (merchant_id IS NULL OR auth.uid() = merchant_id);

-- ════════════════════════════════════════════════════════════
-- 19. السماح للتجار برؤية عناصر طلباتهم
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "order_items_select" ON order_items;
CREATE POLICY "order_items_select" ON order_items FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.user_id = auth.uid())
    OR order_items.merchant_id = auth.uid()
  );

-- ════════════════════════════════════════════════════════════
-- 20. السماح للتجار برؤية الطلبات التي تحتوي منتجاتهم
-- ════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "orders_select" ON orders;
CREATE POLICY "orders_select" ON orders FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM order_items WHERE order_items.order_id = orders.id AND order_items.merchant_id = auth.uid())
  );

-- ════════════════════════════════════════════════════════════
-- ✅ تم! كل الجداول والدوال والسياسات جاهزة
-- ════════════════════════════════════════════════════════════
