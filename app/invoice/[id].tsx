import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Share,
  ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, FileText, Share as ShareIcon, CheckCircle, Clock } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { EmptyState } from '@/components/EmptyState';
import type { Order, OrderItem } from '@/lib/supabase';

type InvoiceOrder = Order & { order_items: OrderItem[] };

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<InvoiceOrder | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('id', id)
      .maybeSingle();
    setOrder(data as InvoiceOrder | null);
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const handleShare = async () => {
    if (!order) return;
    try {
      await Share.share({
        message: `Invoice ${order.invoice_number ?? order.order_number}\nOrder: ${order.order_number}\nTotal: $${order.total.toFixed(2)}\n25% Paid: $${order.upfront_amount.toFixed(2)}\nDue on Delivery: $${order.remaining_amount.toFixed(2)}`,
      });
    } catch {}
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary[600]} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Invoice</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState title="Invoice not found" message="This invoice may have been removed" />
      </SafeAreaView>
    );
  }

  const orderDate = new Date(order.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const orderTime = new Date(order.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit',
  });

  const shippingInfo = order.shipping_address as {
    governorate?: string;
    branch_name?: string;
    branch_address?: string;
    branch_phone?: string;
  } | null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.replace('/(tabs)/index')}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Invoice</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
          <ShareIcon size={20} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
        {/* Invoice Header */}
        <View style={styles.invoiceHeader}>
          <View style={styles.invoiceHeaderLeft}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>S</Text>
            </View>
            <View>
              <Text style={styles.brandName}>STYLE</Text>
              <Text style={styles.brandTagline}>Clothing Store</Text>
            </View>
          </View>
          <View style={styles.invoiceHeaderRight}>
            <Text style={styles.invoiceLabel}>INVOICE</Text>
            <Text style={styles.invoiceNumber}>{order.invoice_number ?? order.order_number}</Text>
            <Text style={styles.invoiceDate}>{orderDate}</Text>
            <Text style={styles.invoiceTime}>{orderTime}</Text>
          </View>
        </View>

        {/* Status Badge */}
        <View style={styles.statusRow}>
          <View style={[
            styles.statusBadge,
            order.payment_status === 'paid' ? styles.statusPaid
              : order.payment_status === 'partial' ? styles.statusPartial
              : styles.statusUnpaid,
          ]}>
            {order.payment_status === 'paid' ? (
              <CheckCircle size={14} color={colors.success[700]} />
            ) : (
              <Clock size={14} color={order.payment_status === 'partial' ? colors.warning[600] : colors.error[700]} />
            )}
            <Text style={[
              styles.statusText,
              order.payment_status === 'paid' ? styles.statusTextPaid
                : order.payment_status === 'partial' ? styles.statusTextPartial
                : styles.statusTextUnpaid,
            ]}>
              {order.payment_status === 'paid' ? 'FULLY PAID'
                : order.payment_status === 'partial' ? '25% PAID - 75% ON DELIVERY'
                : 'UNPAID'}
            </Text>
          </View>
        </View>

        {/* Shipping Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoCardTitle}>SHIPPING BRANCH</Text>
          {shippingInfo ? (
            <>
              <Text style={styles.infoText}>{shippingInfo.governorate ?? ''}</Text>
              <Text style={styles.infoTextBold}>{shippingInfo.branch_name ?? ''}</Text>
              <Text style={styles.infoText}>{shippingInfo.branch_address ?? ''}</Text>
              {shippingInfo.branch_phone ? (
                <Text style={styles.infoText}>Phone: {shippingInfo.branch_phone}</Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.infoText}>No shipping info</Text>
          )}
        </View>

        {/* Order Info */}
        <View style={styles.orderInfoRow}>
          <View style={styles.orderInfoCard}>
            <Text style={styles.orderInfoLabel}>ORDER NUMBER</Text>
            <Text style={styles.orderInfoValue}>{order.order_number}</Text>
          </View>
          <View style={styles.orderInfoCard}>
            <Text style={styles.orderInfoLabel}>PAYMENT METHOD</Text>
            <Text style={styles.orderInfoValue}>{order.payment_method.replace(/_/g, ' ').toUpperCase()}</Text>
          </View>
        </View>

        {/* Line Items */}
        <View style={styles.itemsCard}>
          <View style={styles.itemsHeader}>
            <Text style={styles.itemsHeaderItem}>Item</Text>
            <Text style={styles.itemsHeaderQty}>Qty</Text>
            <Text style={styles.itemsHeaderPrice}>Unit Price</Text>
            <Text style={styles.itemsHeaderTotal}>Total</Text>
          </View>
          {order.order_items?.map((item, i) => (
            <View key={item.id ?? i} style={styles.itemRow}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName}>{item.product_name}</Text>
                {item.size ? <Text style={styles.itemVariant}>Size: {item.size}</Text> : null}
                {item.color ? <Text style={styles.itemVariant}>Color: {item.color}</Text> : null}
              </View>
              <Text style={styles.itemQty}>{item.quantity}</Text>
              <Text style={styles.itemPrice}>${item.unit_price.toFixed(2)}</Text>
              <Text style={styles.itemTotal}>${item.subtotal.toFixed(2)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsCard}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>${order.subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Shipping</Text>
            <Text style={styles.totalsValue}>${order.shipping_cost.toFixed(2)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Tax</Text>
            <Text style={styles.totalsValue}>${order.tax.toFixed(2)}</Text>
          </View>
          {order.discount > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Discount</Text>
              <Text style={styles.totalsValue}>-${order.discount.toFixed(2)}</Text>
            </View>
          ) : null}
          <View style={styles.grandTotalRow}>
            <Text style={styles.grandTotalLabel}>Grand Total</Text>
            <Text style={styles.grandTotalValue}>${order.total.toFixed(2)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.totalsRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={16} color={colors.success[700]} />
              <Text style={styles.upfrontLabel}>Paid Upfront (25%)</Text>
            </View>
            <Text style={styles.upfrontValue}>${order.upfront_amount.toFixed(2)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Clock size={16} color={colors.warning[600]} />
              <Text style={styles.remainingLabel}>Due on Delivery (75%)</Text>
            </View>
            <Text style={styles.remainingValue}>${order.remaining_amount.toFixed(2)}</Text>
          </View>
        </View>

        {/* Signature Section */}
        <View style={styles.signatureCard}>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Customer Signature</Text>
          </View>
          <View style={styles.signatureBlock}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Store Signature</Text>
          </View>
        </View>

        {/* Terms */}
        <View style={styles.termsCard}>
          <Text style={styles.termsTitle}>Terms & Conditions</Text>
          <Text style={styles.termsText}>
            1. 25% of the total amount is paid upfront at the time of order.
          </Text>
          <Text style={styles.termsText}>
            2. The remaining 75% is due upon delivery at the selected shipping branch.
          </Text>
          <Text style={styles.termsText}>
            3. Please present this invoice when collecting your order.
          </Text>
          <Text style={styles.termsText}>
            4. Returns are accepted within 14 days with original packaging.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Thank you for shopping with STYLE</Text>
          <Text style={styles.footerSubtext}>This is a computer-generated invoice and is valid without signature.</Text>
        </View>
      </ScrollView>
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
  invoiceHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    backgroundColor: colors.primary[600], padding: spacing.lg, margin: spacing.md, borderRadius: radius.lg,
  },
  invoiceHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  logoCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { fontSize: 28, fontWeight: '700', color: colors.white },
  brandName: { ...typography.h4, color: colors.white, fontWeight: '700' },
  brandTagline: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  invoiceHeaderRight: { alignItems: 'flex-end' },
  invoiceLabel: { ...typography.caption, color: 'rgba(255,255,255,0.7)', fontWeight: '700', letterSpacing: 2 },
  invoiceNumber: { ...typography.bodySmall, color: colors.white, fontWeight: '700' },
  invoiceDate: { ...typography.caption, color: 'rgba(255,255,255,0.8)' },
  invoiceTime: { ...typography.caption, color: 'rgba(255,255,255,0.6)', fontSize: 10 },
  statusRow: { paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full,
  },
  statusPaid: { backgroundColor: colors.success[50] },
  statusPartial: { backgroundColor: colors.warning[50] },
  statusUnpaid: { backgroundColor: colors.error[50] },
  statusText: { ...typography.caption, fontWeight: '700', letterSpacing: 0.5 },
  statusTextPaid: { color: colors.success[700] },
  statusTextPartial: { color: colors.warning[600] },
  statusTextUnpaid: { color: colors.error[700] },
  infoCard: {
    marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadows.sm, marginBottom: spacing.sm,
  },
  infoCardTitle: { ...typography.caption, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, marginBottom: spacing.sm },
  infoText: { ...typography.bodySmall, color: colors.textSecondary, marginBottom: 2 },
  infoTextBold: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: 2 },
  orderInfoRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  orderInfoCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, ...shadows.sm },
  orderInfoLabel: { ...typography.caption, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, marginBottom: 4 },
  orderInfoValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  itemsCard: {
    marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadows.sm, marginBottom: spacing.sm,
  },
  itemsHeader: { flexDirection: 'row', paddingBottom: spacing.sm, borderBottomWidth: 1.5, borderBottomColor: colors.border },
  itemsHeaderItem: { flex: 2, ...typography.caption, fontWeight: '700', color: colors.textMuted },
  itemsHeaderQty: { flex: 1, ...typography.caption, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },
  itemsHeaderPrice: { flex: 1.5, ...typography.caption, fontWeight: '700', color: colors.textMuted, textAlign: 'right' },
  itemsHeaderTotal: { flex: 1.5, ...typography.caption, fontWeight: '700', color: colors.textMuted, textAlign: 'right' },
  itemRow: { flexDirection: 'row', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemInfo: { flex: 2 },
  itemName: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  itemVariant: { ...typography.caption, color: colors.textMuted },
  itemQty: { flex: 1, ...typography.bodySmall, color: colors.text, textAlign: 'center' },
  itemPrice: { flex: 1.5, ...typography.bodySmall, color: colors.text, textAlign: 'right' },
  itemTotal: { flex: 1.5, ...typography.bodySmall, fontWeight: '600', color: colors.text, textAlign: 'right' },
  totalsCard: {
    marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadows.sm, marginBottom: spacing.sm,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  totalsLabel: { ...typography.bodySmall, color: colors.textSecondary },
  totalsValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  grandTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm,
    marginTop: spacing.sm, borderTopWidth: 1.5, borderTopColor: colors.border,
  },
  grandTotalLabel: { ...typography.h4, color: colors.text, fontWeight: '700' },
  grandTotalValue: { ...typography.h4, color: colors.primary[600], fontWeight: '700' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  upfrontLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.success[700] },
  upfrontValue: { ...typography.bodySmall, fontWeight: '700', color: colors.success[700] },
  remainingLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.warning[600] },
  remainingValue: { ...typography.bodySmall, fontWeight: '600', color: colors.warning[600] },
  signatureCard: {
    flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  signatureBlock: { alignItems: 'center' },
  signatureLine: { width: 120, height: 1.5, backgroundColor: colors.neutral[400], marginBottom: 4 },
  signatureLabel: { ...typography.caption, color: colors.textMuted },
  termsCard: {
    marginHorizontal: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadows.sm, marginBottom: spacing.sm,
  },
  termsTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  termsText: { ...typography.caption, color: colors.textSecondary, marginBottom: 4 },
  footer: { alignItems: 'center', paddingVertical: spacing.lg },
  footerText: { ...typography.bodySmall, fontWeight: '700', color: colors.primary[600] },
  footerSubtext: { ...typography.caption, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
});
