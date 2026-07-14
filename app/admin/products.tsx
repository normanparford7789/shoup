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
  Image,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Package,
  Search,
  X,
  Trash2,
  Store,
  DollarSign,
  Calendar,
  AlertTriangle,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';

const ADMIN_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

type Product = {
  id: string;
  name: string;
  price: string;
  category: string;
  image_url: string | null;
  stock: number;
  merchant_id: string | null;
  created_at: string;
  merchant?: { id: string; full_name: string; email: string } | null;
};

export default function AdminProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      const response = await fetch(`${ADMIN_API_BASE}/products`, { headers });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load products');
      }
      const data = await response.json();
      setProducts(data.products || []);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/products/${deleteTarget.id}`, {
        method: 'DELETE',
        headers,
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete product');
      }
      setDeleteTarget(null);
      Alert.alert('Success', 'Product deleted successfully');
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setDeleting(false);
    }
  };

  const filteredProducts = products.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.category?.toLowerCase().includes(q) ||
      p.merchant?.full_name?.toLowerCase().includes(q) ||
      p.merchant?.email?.toLowerCase().includes(q)
    );
  });

  const fmt = (v: string) => `$${Number(v || 0).toFixed(2)}`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>All Products</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading products…</Text>
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
        <Text style={styles.title}>All Products</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Search size={18} color={colors.neutral[400]} />
          <TextInput
            style={styles.searchField}
            placeholder="Search by name, category, or merchant…"
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

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {/* Stats summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{products.length}</Text>
          <Text style={styles.summaryLabel}>Total Products</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{products.filter(p => p.merchant_id).length}</Text>
          <Text style={styles.summaryLabel}>Merchant Products</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{products.filter(p => !p.merchant_id).length}</Text>
          <Text style={styles.summaryLabel}>Platform Products</Text>
        </View>
      </View>

      {/* Products list */}
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredProducts.length === 0 ? (
          <View style={styles.emptyState}>
            <Package size={48} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No products found</Text>
            <Text style={styles.emptyMsg}>Try adjusting your search.</Text>
          </View>
        ) : (
          filteredProducts.map(product => (
            <View key={product.id} style={styles.productCard}>
              <View style={styles.productRow}>
                {/* Product image */}
                {product.image_url ? (
                  <Image source={{ uri: product.image_url }} style={styles.productImage} />
                ) : (
                  <View style={styles.productImagePlaceholder}>
                    <Package size={20} color={colors.neutral[400]} />
                  </View>
                )}
                {/* Product info */}
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.productCategory}>{product.category || 'Uncategorized'}</Text>
                  <View style={styles.productMetaRow}>
                    <View style={styles.productMetaItem}>
                      <DollarSign size={12} color={colors.success[600]} />
                      <Text style={styles.productPrice}>{fmt(product.price)}</Text>
                    </View>
                    <View style={styles.productMetaItem}>
                      <Package size={12} color={colors.neutral[400]} />
                      <Text style={styles.productMetaText}>Stock: {product.stock ?? 0}</Text>
                    </View>
                  </View>
                </View>
                {/* Delete button */}
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => setDeleteTarget(product)}
                >
                  <Trash2 size={16} color={colors.error[500]} />
                </TouchableOpacity>
              </View>
              {/* Merchant info */}
              {product.merchant ? (
                <View style={styles.merchantRow}>
                  <Store size={12} color={colors.primary[600]} />
                  <Text style={styles.merchantText}>
                    {product.merchant.full_name || 'Unknown merchant'}
                    {product.merchant.email ? ` (${product.merchant.email})` : ''}
                  </Text>
                </View>
              ) : (
                <View style={styles.merchantRow}>
                  <Store size={12} color={colors.neutral[400]} />
                  <Text style={styles.merchantText}>Platform product (no merchant)</Text>
                </View>
              )}
              <View style={styles.dateRow}>
                <Calendar size={12} color={colors.neutral[400]} />
                <Text style={styles.dateText}>Added: {fmtDate(product.created_at)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Delete confirmation modal */}
      <Modal visible={!!deleteTarget} transparent animationType="fade" onRequestClose={() => !deleting && setDeleteTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.deleteIconWrap}>
              <AlertTriangle size={48} color={colors.error[500]} />
            </View>
            <Text style={styles.modalTitle}>Delete Product?</Text>
            <Text style={styles.modalMsg}>
              Are you sure you want to delete "{deleteTarget?.name}"? This action cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  onPress={() => setDeleteTarget(null)}
                  variant="outline"
                  disabled={deleting}
                  fullWidth
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Delete"
                  onPress={handleDelete}
                  loading={deleting}
                  fullWidth
                />
              </View>
            </View>
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
  errorBanner: {
    backgroundColor: colors.error[50], borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, margin: spacing.md,
    borderWidth: 1, borderColor: colors.error[100],
  },
  errorBannerText: { ...typography.bodySmall, color: colors.error[700] },
  summaryRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.md, backgroundColor: colors.surface },
  summaryCard: { flex: 1, backgroundColor: colors.inputBg, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  summaryValue: { ...typography.h3, fontWeight: '700', color: colors.primary[700] },
  summaryLabel: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...typography.h4, color: colors.text },
  emptyMsg: { ...typography.body, color: colors.textSecondary },
  productCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  productRow: { flexDirection: 'row', gap: spacing.md },
  productImage: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.inputBg },
  productImagePlaceholder: {
    width: 64, height: 64, borderRadius: radius.md,
    backgroundColor: colors.inputBg, alignItems: 'center', justifyContent: 'center',
  },
  productName: { ...typography.body, fontWeight: '600', color: colors.text, flexShrink: 1 },
  productCategory: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  productMetaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  productMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  productPrice: { ...typography.bodySmall, fontWeight: '700', color: colors.success[700] },
  productMetaText: { ...typography.caption, color: colors.textSecondary },
  deleteBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.error[50], alignItems: 'center', justifyContent: 'center',
  },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  merchantText: { ...typography.caption, color: colors.textSecondary },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  dateText: { ...typography.caption, color: colors.neutral[400] },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, width: '100%', maxWidth: 400, alignItems: 'center', ...shadows.lg },
  deleteIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.error[50], alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  modalTitle: { ...typography.h3, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  modalMsg: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg },
  modalActions: { flexDirection: 'row', gap: spacing.md, width: '100%' },
});
