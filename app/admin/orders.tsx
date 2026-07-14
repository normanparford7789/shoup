import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  ShoppingBag,
  Search,
  X,
  ChevronDown,
  Package,
  User,
  DollarSign,
  Calendar,
  Store,
  Megaphone,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';

const ADMIN_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

type OrderItem = {
  id: string;
  product_id: string;
  quantity: number;
  subtotal: string;
  merchant_earnings: string;
  affiliate_earnings: string;
  product?: { id: string; name: string; price: string };
};

type Order = {
  id: string;
  user_id: string;
  total: string;
  status: string;
  created_at: string;
  affiliate_code: string | null;
  affiliate_user_id: string | null;
  profile?: { id: string; full_name: string; email: string } | null;
  items?: OrderItem[];
};

const STATUS_FILTERS = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Shipped', value: 'shipped' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  pending: { color: colors.warning[600], bg: colors.warning[50], label: 'Pending' },
  confirmed: { color: colors.primary[700], bg: colors.primary[50], label: 'Confirmed' },
  shipped: { color: colors.accent[600], bg: colors.accent[50], label: 'Shipped' },
  delivered: { color: colors.success[600], bg: colors.success[50], label: 'Delivered' },
  completed: { color: colors.success[700], bg: colors.success[50], label: 'Completed' },
  cancelled: { color: colors.error[500], bg: colors.error[50], label: 'Cancelled' },
};

export default function AdminOrdersScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    };
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/orders?status=${filterStatus}`, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load orders');
      }
      const data = await response.json();
      setOrders(data.orders || []);
    } catch (e: any) {
      setError(e.message);
    }
  }, [filterStatus]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filteredOrders = orders.filter(o => {
    if (search) {
      const q = search.toLowerCase();
      const name = o.profile?.full_name?.toLowerCase() || '';
      const email = o.profile?.email?.toLowerCase() || '';
      if (!name.includes(q) && !email.includes(q) && !o.id.includes(q)) return false;
    }
    return true;
  });

  const fmt = (v: string) => `$${Number(v || 0).toFixed(2)}`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const openDetail = (order: Order) => {
    setDetailOrder(order);
    setDetailVisible(true);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>All Orders</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading orders…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>All Orders</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Search size={18} color={colors.neutral[400]} />
          <TextInput
            style={styles.searchField}
            placeholder="Search by customer, email, or order ID…"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <X size={16} color={colors.neutral[400]} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Status filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={{ paddingHorizontal: spacing.md, gap: spacing.sm }}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, filterStatus === f.value && styles.filterChipActive]}
            onPress={() => setFilterStatus(f.value)}
          >
            <Text style={[styles.filterChipText, filterStatus === f.value && styles.filterChipTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {/* Orders list */}
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <ShoppingBag size={48} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No orders found</Text>
            <Text style={styles.emptyMsg}>Try adjusting filters or search.</Text>
          </View>
        ) : (
          filteredOrders.map(order => {
            const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
            const itemCount = order.items?.length || 0;
            return (
              <TouchableOpacity
                key={order.id}
                style={styles.orderCard}
                onPress={() => openDetail(order)}
                activeOpacity={0.7}
              >
                <View style={styles.orderCardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderId}>#{order.id.slice(0, 8)}</Text>
                    <Text style={styles.orderCustomer}>{order.profile?.full_name || 'Unknown'}</Text>
                    <Text style={styles.orderEmail}>{order.profile?.email || ''}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                </View>
                <View style={styles.orderCardFooter}>
                  <View style={styles.orderMetaItem}>
                    <Package size={14} color={colors.neutral[400]} />
                    <Text style={styles.orderMetaText}>{itemCount} item{itemCount !== 1 ? 's' : ''}</Text>
                  </View>
                  <View style={styles.orderMetaItem}>
                    <Calendar size={14} color={colors.neutral[400]} />
                    <Text style={styles.orderMetaText}>{fmtDate(order.created_at)}</Text>
                  </View>
                  <Text style={styles.orderTotal}>{fmt(order.total)}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Order detail modal */}
      <Modal visible={detailVisible} transparent animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order Details</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setDetailVisible(false)}>
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>
            {detailOrder ? (
              <ScrollView style={{ maxHeight: 500 }}>
                {/* Customer info */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Customer</Text>
                  <View style={styles.detailRow}>
                    <User size={16} color={colors.neutral[400]} />
                    <Text style={styles.detailText}>{detailOrder.profile?.full_name || 'Unknown'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailSubText}>{detailOrder.profile?.email || ''}</Text>
                  </View>
                </View>

                {/* Order info */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Order Info</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Order ID:</Text>
                    <Text style={styles.detailValue}>#{detailOrder.id.slice(0, 12)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailValue}>{fmtDate(detailOrder.created_at)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status:</Text>
                    <View style={[styles.statusBadge, { backgroundColor: (STATUS_CONFIG[detailOrder.status] ?? STATUS_CONFIG.pending).bg }]}>
                      <Text style={[styles.statusBadgeText, { color: (STATUS_CONFIG[detailOrder.status] ?? STATUS_CONFIG.pending).color }]}>
                        {(STATUS_CONFIG[detailOrder.status] ?? STATUS_CONFIG.pending).label}
                      </Text>
                    </View>
                  </View>
                  {detailOrder.affiliate_code ? (
                    <View style={styles.detailRow}>
                      <Megaphone size={16} color={colors.accent[500]} />
                      <Text style={styles.detailLabel}>Affiliate:</Text>
                      <Text style={styles.detailValue}>{detailOrder.affiliate_code}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Items */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Items ({detailOrder.items?.length || 0})</Text>
                  {detailOrder.items?.map((item, idx) => (
                    <View key={idx} style={styles.itemCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemName}>{item.product?.name || 'Unknown product'}</Text>
                        <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
                        <Text style={styles.itemSubtotal}>{fmt(item.subtotal)}</Text>
                      </View>
                      <View style={styles.itemEarnings}>
                        {Number(item.merchant_earnings) > 0 ? (
                          <View style={styles.earningRow}>
                            <Store size={12} color={colors.primary[600]} />
                            <Text style={styles.earningText}>Merchant: {fmt(item.merchant_earnings)}</Text>
                          </View>
                        ) : null}
                        {Number(item.affiliate_earnings) > 0 ? (
                          <View style={styles.earningRow}>
                            <Megaphone size={12} color={colors.accent[600]} />
                            <Text style={styles.earningText}>Affiliate: {fmt(item.affiliate_earnings)}</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>

                {/* Total */}
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Order Total</Text>
                  <Text style={styles.totalValue}>{fmt(detailOrder.total)}</Text>
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h4, color: colors.text, fontWeight: '700' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary },
  searchRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  searchInput: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.inputBg, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  searchField: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 0 },
  filterScroll: { flexGrow: 0, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  filterChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.full, backgroundColor: colors.inputBg,
  },
  filterChipActive: { backgroundColor: colors.primary[600] },
  filterChipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  filterChipTextActive: { color: colors.white, fontWeight: '700' },
  errorBanner: {
    backgroundColor: colors.error[50], borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, margin: spacing.md,
    borderWidth: 1, borderColor: colors.error[100],
  },
  errorBannerText: { ...typography.bodySmall, color: colors.error[700] },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...typography.h4, color: colors.text },
  emptyMsg: { ...typography.body, color: colors.textSecondary },
  orderCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  orderCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderId: { ...typography.bodySmall, fontWeight: '700', color: colors.primary[700] },
  orderCustomer: { ...typography.body, fontWeight: '600', color: colors.text, marginTop: 2 },
  orderEmail: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full },
  statusBadgeText: { ...typography.caption, fontWeight: '700' },
  orderCardFooter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  orderMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  orderMetaText: { ...typography.caption, color: colors.textSecondary },
  orderTotal: { ...typography.body, fontWeight: '700', color: colors.text, marginLeft: 'auto' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.lg, width: '100%', maxWidth: 500, ...shadows.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { ...typography.h4, fontWeight: '700', color: colors.text },
  modalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center' },
  detailSection: { marginBottom: spacing.md },
  detailSectionTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.textSecondary, marginBottom: spacing.sm, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  detailText: { ...typography.body, color: colors.text, fontWeight: '600' },
  detailSubText: { ...typography.bodySmall, color: colors.textSecondary },
  detailLabel: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '500' },
  detailValue: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  itemCard: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  itemQty: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  itemSubtotal: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginTop: 4 },
  itemEarnings: { alignItems: 'flex-end', gap: 4 },
  earningRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  earningText: { ...typography.caption, color: colors.textSecondary, fontWeight: '500' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.md, borderTopWidth: 2, borderTopColor: colors.border, marginTop: spacing.sm },
  totalLabel: { ...typography.h4, fontWeight: '700', color: colors.text },
  totalValue: { ...typography.h2, fontWeight: '700', color: colors.primary[700] },
});
