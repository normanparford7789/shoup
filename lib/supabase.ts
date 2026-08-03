import 'react-native-url-polyfill/auto';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// قراءة القيم من expo-constants (مضمّنة في APK عند البناء) أو process.env كبديل
// هذا يضمن الاتصال بقاعدة البيانات حتى لو لم تُحمَّل متغيرات .env بشكل صحيح أثناء Gradle
const extra = Constants.expoConfig?.extra ?? {};

const supabaseUrl: string =
  extra.supabaseUrl ||
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://uiajhhqjyntjpoenhcnx.supabase.co';

const supabaseAnonKey: string =
  extra.supabaseAnonKey ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpYWpoaHFqeW50anBvZW5oY254Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjQ2MTcsImV4cCI6MjEwMTMwMDYxN30.m1JvtvDxTjV0sguHl78hPMu6tv5gmzOGTuBK7VfI_rw';
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  category_id: string | null;
  brand: string | null;
  sku: string | null;
  material: string | null;
  status: string;
  is_featured: boolean;
  is_new: boolean;
  rating: number;
  review_count: number;
  merchant_id: string | null;
  created_at: string;
  category?: Category;
  images?: ProductImage[];
  variants?: ProductVariant[];
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
};

export type ProductImage = {
  id: string;
  product_id: string;
  image_url: string;
  sort_order: number;
};

export type ProductVariant = {
  id: string;
  product_id: string;
  size: string;
  color: string;
  color_hex: string | null;
  stock: number;
  sku: string | null;
};

export type CartItem = {
  id: string;
  user_id: string;
  product_id: string;
  variant_id: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  product?: Product;
};

export type Order = {
  id: string;
  user_id: string;
  order_number: string;
  status: string;
  subtotal: number;
  shipping_cost: number;
  tax: number;
  discount: number;
  total: number;
  upfront_amount: number;
  remaining_amount: number;
  invoice_number: string | null;
  shipping_branch_id: string | null;
  coupon_code: string | null;
  shipping_address: any;
  payment_method: string;
  payment_status: string;
  tracking_number: string | null;
  carrier: string | null;
  notes: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

export type Governorate = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ShippingBranch = {
  id: string;
  governorate_id: string;
  branch_name: string;
  address: string;
  phone: string | null;
  manager_name: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  governorate?: Governorate;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_image: string | null;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
};

export type Address = {
  id: string;
  user_id: string;
  full_name: string;
  phone: string;
  country: string;
  city: string;
  street: string;
  postal_code: string | null;
  is_default: boolean;
};

export type Review = {
  id: string;
  product_id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  images: string[];
  is_approved: boolean;
  helpful_count: number;
  created_at: string;
};

export type Coupon = {
  id: string;
  code: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_spend: number;
  max_uses: number | null;
  used_count: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
};

export type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  cta_text: string | null;
  cta_link: string | null;
  placement: string;
  sort_order: number;
  is_active: boolean;
};

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  data: any;
  is_read: boolean;
  created_at: string;
};

export type ReturnRequest = {
  id: string;
  user_id: string;
  order_id: string;
  order_item_id: string;
  reason: string;
  description: string | null;
  images: string[];
  type: 'refund' | 'exchange';
  status: string;
  created_at: string;
};

export type SupportTicket = {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  category: string;
  status: string;
  priority: string;
  created_at: string;
};

export type UserRole = 'customer' | 'publisher' | 'merchant' | 'admin';

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  default_currency: string;
  default_language: string;
  role: UserRole;
  is_banned: boolean;
  is_active: boolean;
  admin_notes: string | null;
};

export type Wallet = {
  id: string;
  user_id: string;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
  created_at: string;
  updated_at: string;
};

export type WalletTransaction = {
  id: string;
  wallet_id: string;
  user_id: string;
  type: 'credit' | 'debit' | 'pending_credit' | 'pending_release' | 'withdrawal' | 'adjustment';
  amount: number;
  description: string | null;
  order_id: string | null;
  order_item_id: string | null;
  withdrawal_id: string | null;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
};

export type WithdrawalRequest = {
  id: string;
  user_id: string;
  amount: number;
  payment_info: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  admin_notes: string | null;
  invoice_number: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AffiliateLink = {
  id: string;
  user_id: string;
  product_id: string;
  affiliate_code: string;
  clicks_count: number;
  purchases_count: number;
  total_earnings: number;
  is_active: boolean;
  created_at: string;
  product?: Product;
};

export type AffiliateClick = {
  id: string;
  affiliate_link_id: string;
  product_id: string;
  user_id: string | null;
  ip_address: string | null;
  created_at: string;
};

export type MerchantRestriction = {
  id: string;
  merchant_id: string;
  can_upload_products: boolean;
  can_upload_reels: boolean;
  can_edit_products: boolean;
  can_delete_products: boolean;
  restricted_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Reel = {
  id: string;
  product_id: string | null;
  video_url: string;
  thumbnail_url: string | null;
  title: string | null;
  description: string | null;
  likes_count: number;
  comments_count: number;
  is_active: boolean;
  sort_order: number;
  merchant_id: string | null;
  created_at: string;
  product?: Product;
};

export type ReelLike = {
  id: string;
  reel_id: string;
  user_id: string;
  created_at: string;
};

export type ReelComment = {
  id: string;
  reel_id: string;
  user_id: string;
  body: string;
  created_at: string;
};
