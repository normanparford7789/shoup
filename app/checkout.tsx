import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  MapPin,
  Truck,
  CreditCard,
  CheckCircle,
  Plus,
  Store,
  Wallet,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useCart } from '@/lib/CartContext';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import type { Governorate, ShippingBranch } from '@/lib/supabase';

type PaymentMethod = 'wallet' | 'cash_on_delivery' | 'card' | 'transfer';

const UPFRONT_PERCENTAGE = 0.25;

export default function CheckoutScreen() {
  const { items, subtotal, clearCart } = useCart();
  const { user } = useAuth();
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [branches, setBranches] = useState<ShippingBranch[]>([]);
  const [selectedGovernorate, setSelectedGovernorate] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<ShippingBranch | null>(null);
  const [showGovernorates, setShowGovernorates] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash_on_delivery');
  const [walletBalance, setWalletBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);

  const loadShippingData = useCallback(async () => {
    const { data: govs } = await supabase
      .from('governorates')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setGovernorates((govs as Governorate[]) ?? []);

    const { data: brs } = await supabase
      .from('shipping_branches')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    setBranches((brs as ShippingBranch[]) ?? []);
  }, []);

  const loadWallet = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('wallets')
      .select('available_balance')
      .eq('user_id', user.id)
      .maybeSingle();
    setWalletBalance(data?.available_balance ?? 0);
  }, [user]);

  useEffect(() => {
    Promise.all([loadShippingData(), loadWallet()]).finally(() => setLoading(false));
  }, [loadShippingData, loadWallet]);

  const shippingCost = 5.99;
  const tax = subtotal * 0.08;
  const total = subtotal + shippingCost + tax;
  const upfrontAmount = total * UPFRONT_PERCENTAGE;
  const remainingAmount = total - upfrontAmount;

  const filteredBranches = selectedGovernorate
    ? branches.filter(b => b.governorate_id === selectedGovernorate)
    : [];

  const selectGovernorate = (govId: string) => {
    setSelectedGovernorate(govId);
    setSelectedBranch(null);
    setShowGovernorates(false);
  };

  const placeOrder = useCallback(async () => {
    if (!user) {
      Alert.alert('Sign in required', 'Please sign in to place an order.');
      return;
    }
    if (!selectedBranch) {
      Alert.alert('Branch required', 'Please select a shipping branch.');
      return;
    }
    if (items.length === 0) {
      Alert.alert('Empty cart', 'Add items to your cart first.');
      return;
    }
    if (paymentMethod === 'wallet' && walletBalance < upfrontAmount) {
      Alert.alert(
        'Insufficient wallet balance',
        `Your wallet balance ($${walletBalance.toFixed(2)}) is not enough for the 25% upfront payment ($${upfrontAmount.toFixed(2)}). Please top up your wallet or choose another payment method.`
      );
      return;
    }
    setPlacing(true);
    try {
      const orderNumber = `ORD-${Date.now().toString().slice(-8)}`;
      const invoiceNumber = `INV-${Date.now().toString().slice(-10)}`;
      const shippingInfo = {
        governorate: governorates.find(g => g.id === selectedGovernorate)?.name ?? '',
        branch_name: selectedBranch.branch_name,
        branch_address: selectedBranch.address,
        branch_phone: selectedBranch.phone,
      };

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          order_number: orderNumber,
          invoice_number: invoiceNumber,
          status: 'pending',
          subtotal,
          shipping_cost: shippingCost,
          tax,
          total,
          upfront_amount: upfrontAmount,
          remaining_amount: remainingAmount,
          shipping_branch_id: selectedBranch.id,
          shipping_address: shippingInfo,
          payment_method: paymentMethod,
          payment_status: paymentMethod === 'wallet' ? 'partial' : 'unpaid',
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = items.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        product_name: item.product?.name ?? 'Product',
        product_image: item.product?.images?.[0]?.image_url ?? null,
        size: item.size,
        color: item.color,
        quantity: item.quantity,
        unit_price: item.product?.price ?? 0,
        subtotal: (item.product?.price ?? 0) * item.quantity,
      }));

      const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
      if (itemsError) throw itemsError;

      // Process merchant and affiliate earnings
      await supabase.rpc('process_order_merchant_earnings', { p_order_id: order.id });

      // If paying with wallet, deduct the 25% upfront
      if (paymentMethod === 'wallet') {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (wallet) {
          await supabase
            .from('wallets')
            .update({
              available_balance: walletBalance - upfrontAmount,
              updated_at: new Date().toISOString(),
            })
            .eq('id', wallet.id);

          await supabase.from('wallet_transactions').insert({
            wallet_id: wallet.id,
            user_id: user.id,
            type: 'payment',
            amount: upfrontAmount,
            description: `25% upfront payment for order ${orderNumber}`,
            order_id: order.id,
            status: 'completed',
          });
        }
      }

      await supabase.from('notifications').insert({
        user_id: user.id,
        type: 'order_placed',
        title: 'Order Confirmed',
        body: `Your order ${orderNumber} has been placed. 25% ($${upfrontAmount.toFixed(2)}) paid upfront, remaining $${remainingAmount.toFixed(2)} due on delivery.`,
        data: { order_id: order.id, invoice_number: invoiceNumber },
      });

      await clearCart();
      Alert.alert(
        'Order Placed!',
        `Order ${orderNumber} placed.\n25% upfront: $${upfrontAmount.toFixed(2)}\nDue on delivery: $${remainingAmount.toFixed(2)}\nInvoice: ${invoiceNumber}`,
        [{ text: 'View Invoice', onPress: () => router.replace(`/invoice/${order.id}`) }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to place order');
    } finally {
      setPlacing(false);
    }
  }, [
    user, selectedBranch, selectedGovernorate, governorates, items, subtotal,
    shippingCost, tax, total, upfrontAmount, remainingAmount, paymentMethod,
    walletBalance, clearCart,
  ]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary[600]} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Checkout</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState title="Your cart is empty" message="Add items before checking out" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Checkout</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Shipping Branch Selection */}
        <Section title="Shipping Branch" icon={<MapPin size={18} color={colors.primary[600]} />}>
          <Text style={styles.helperText}>Select your governorate, then choose a shipping branch</Text>

          {/* Governorate Selector */}
          <TouchableOpacity
            style={styles.selectorBtn}
            onPress={() => setShowGovernorates(!showGovernorates)}
          >
            <Text style={selectedGovernorate ? styles.selectorText : styles.selectorPlaceholder}>
              {selectedGovernorate
                ? governorates.find(g => g.id === selectedGovernorate)?.name
                : 'Select Governorate'}
            </Text>
            {showGovernorates ? (
              <ChevronUp size={20} color={colors.textMuted} />
            ) : (
              <ChevronDown size={20} color={colors.textMuted} />
            )}
          </TouchableOpacity>

          {showGovernorates && (
            <View style={styles.dropdownList}>
              {governorates.map(gov => (
                <TouchableOpacity
                  key={gov.id}
                  style={[
                    styles.dropdownItem,
                    selectedGovernorate === gov.id && styles.dropdownItemActive,
                  ]}
                  onPress={() => selectGovernorate(gov.id)}
                >
                  <MapPin size={16} color={colors.primary[600]} />
                  <Text style={styles.dropdownItemText}>{gov.name}</Text>
                  {selectedGovernorate === gov.id ? (
                    <CheckCircle size={16} color={colors.primary[600]} />
                  ) : null}
                </TouchableOpacity>
              ))}
              {governorates.length === 0 && (
                <Text style={styles.emptyDropdown}>No governorates available yet</Text>
              )}
            </View>
          )}

          {/* Branch List for selected governorate */}
          {selectedGovernorate && (
            <View style={styles.branchList}>
              <Text style={styles.branchListTitle}>Available Branches</Text>
              {filteredBranches.length === 0 ? (
                <Text style={styles.emptyBranches}>No branches in this governorate</Text>
              ) : (
                filteredBranches.map(branch => (
                  <TouchableOpacity
                    key={branch.id}
                    style={[
                      styles.branchCard,
                      selectedBranch?.id === branch.id && styles.branchCardActive,
                    ]}
                    onPress={() => setSelectedBranch(branch)}
                  >
                    <View style={styles.branchIcon}>
                      <Store size={20} color={colors.primary[600]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.branchName}>{branch.branch_name}</Text>
                      <Text style={styles.branchAddress}>{branch.address}</Text>
                      {branch.phone ? (
                        <Text style={styles.branchPhone}>{branch.phone}</Text>
                      ) : null}
                    </View>
                    {selectedBranch?.id === branch.id ? (
                      <CheckCircle size={24} color={colors.primary[600]} />
                    ) : (
                      <View style={styles.radioOuter}>
                        <View style={styles.radioInner} />
                      </View>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </Section>

        {/* Payment Method */}
        <Section title="Payment Method" icon={<CreditCard size={18} color={colors.primary[600]} />}>
          <View style={styles.paymentInfoBox}>
            <Text style={styles.paymentInfoText}>
              You pay 25% now and the remaining 75% when you receive your order.
            </Text>
          </View>
          {([
            { key: 'wallet', label: 'Wallet', desc: `Balance: $${walletBalance.toFixed(2)}`, icon: <Wallet size={18} color={colors.primary[600]} /> },
            { key: 'cash_on_delivery', label: 'Cash on Delivery', desc: 'Pay 25% cash at branch', icon: <CreditCard size={18} color={colors.primary[600]} /> },
            { key: 'card', label: 'Credit/Debit Card', desc: 'Visa, Mastercard, Amex', icon: <CreditCard size={18} color={colors.primary[600]} /> },
            { key: 'transfer', label: 'Bank Transfer', desc: 'Direct bank transfer', icon: <CreditCard size={18} color={colors.primary[600]} /> },
          ] as { key: PaymentMethod; label: string; desc: string; icon: React.ReactNode }[]).map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.optionRow, paymentMethod === m.key && styles.optionRowActive]}
              onPress={() => setPaymentMethod(m.key)}
            >
              {m.icon}
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.optionLabel}>{m.label}</Text>
                <Text style={styles.optionDesc}>{m.desc}</Text>
              </View>
              <View style={[styles.radio, paymentMethod === m.key && styles.radioActive]}>
                {paymentMethod === m.key ? <View style={styles.radioDot} /> : null}
              </View>
            </TouchableOpacity>
          ))}
        </Section>

        {/* Order Summary */}
        <Section title="Order Summary">
          {items.map(item => (
            <View key={item.id} style={styles.summaryItem}>
              <Text style={styles.summaryItemName} numberOfLines={1}>
                {item.product?.name} x{item.quantity}
              </Text>
              <Text style={styles.summaryItemPrice}>
                ${((item.product?.price ?? 0) * item.quantity).toFixed(2)}
              </Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal</Text>
            <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Shipping</Text>
            <Text style={styles.summaryValue}>${shippingCost.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tax</Text>
            <Text style={styles.summaryValue}>${tax.toFixed(2)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.upfrontLabel}>Pay Now (25%)</Text>
            <Text style={styles.upfrontValue}>${upfrontAmount.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.remainingLabel}>Pay on Delivery (75%)</Text>
            <Text style={styles.remainingValue}>${remainingAmount.toFixed(2)}</Text>
          </View>
        </Section>
      </ScrollView>
      <View style={styles.bottomBar}>
        <View style={styles.bottomBarInfo}>
          <Text style={styles.bottomBarLabel}>Pay Now (25%)</Text>
          <Text style={styles.bottomBarAmount}>${upfrontAmount.toFixed(2)}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: spacing.md }}>
          <Button
            title={placing ? 'Placing Order...' : 'Place Order'}
            onPress={placeOrder}
            loading={placing}
            fullWidth
            size="lg"
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        {icon}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
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
  section: { margin: spacing.md, marginBottom: 0 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { ...typography.h4, color: colors.text },
  sectionBody: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm },
  helperText: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  selectorBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.background,
  },
  selectorText: { ...typography.body, color: colors.text, fontWeight: '600' },
  selectorPlaceholder: { ...typography.body, color: colors.textMuted },
  dropdownList: { marginTop: spacing.sm, gap: 4 },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.md, backgroundColor: colors.background,
  },
  dropdownItemActive: { backgroundColor: colors.primary[50] },
  dropdownItemText: { ...typography.bodySmall, color: colors.text, flex: 1 },
  emptyDropdown: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },
  branchList: { marginTop: spacing.md },
  branchListTitle: { ...typography.bodySmall, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  emptyBranches: { ...typography.caption, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },
  branchCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5,
    borderColor: colors.border, marginBottom: spacing.sm,
  },
  branchCardActive: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  branchIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary[50],
    alignItems: 'center', justifyContent: 'center',
  },
  branchName: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  branchAddress: { ...typography.caption, color: colors.textSecondary },
  branchPhone: { ...typography.caption, color: colors.textMuted },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.neutral[300],
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 0, height: 0 },
  paymentInfoBox: {
    backgroundColor: colors.primary[50], borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md,
  },
  paymentInfoText: { ...typography.caption, color: colors.primary[700], fontWeight: '600' },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  optionRowActive: {},
  optionLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  optionDesc: { ...typography.caption, color: colors.textMuted },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.neutral[300],
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary[600] },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary[600] },
  summaryItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, gap: spacing.md },
  summaryItemName: { flex: 1, ...typography.bodySmall, color: colors.text },
  summaryItemPrice: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  summaryLabel: { ...typography.bodySmall, color: colors.textSecondary },
  summaryValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  totalRow: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { ...typography.h4, color: colors.text },
  totalValue: { ...typography.h4, fontWeight: '700', color: colors.primary[600] },
  upfrontLabel: { ...typography.bodySmall, fontWeight: '700', color: colors.success[700] },
  upfrontValue: { ...typography.bodySmall, fontWeight: '700', color: colors.success[700] },
  remainingLabel: { ...typography.bodySmall, fontWeight: '600', color: colors.warning[600] },
  remainingValue: { ...typography.bodySmall, fontWeight: '600', color: colors.warning[600] },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.md,
  },
  bottomBarInfo: {},
  bottomBarLabel: { ...typography.caption, color: colors.textMuted, fontWeight: '600' },
  bottomBarAmount: { ...typography.h4, color: colors.success[700], fontWeight: '700' },
});
