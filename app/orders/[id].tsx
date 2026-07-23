import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Image,
  Alert,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ChevronLeft,
  Package,
  Truck,
  CheckCircle,
  Home,
  RotateCcw,
  MessageCircle,
  Download,
  FileText,
  MapPin,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/LoadingState';
import { Button } from '@/components/Button';
import type { Order } from '@/lib/supabase';

const STATUS_STEPS = [
  { key: 'pending', label: 'Order Placed', icon: CheckCircle },
  { key: 'processing', label: 'Processing', icon: Package },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: Home },
];

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('orders')
      .select(`*, order_items:order_items(*)`)
      .eq('id', id)
      .maybeSingle();
    setOrder(data as Order | null);
  }, [id]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <LoadingState />;
  if (!order) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Order Details</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text>Order not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentStepIdx = STATUS_STEPS.findIndex(s => s.key === order.status);
  const isCancelled = order.status === 'cancelled';
  const isDelivered = order.status === 'delivered';

  const handleCancel = () => {
    Alert.alert(
      'Cancel Order',
      'Are you sure you want to cancel this order?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id);
            await load();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Order Details</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.orderInfoCard}>
          <Text style={styles.orderNumber}>{order.order_number}</Text>
          <Text style={styles.orderDate}>
            Placed on {new Date(order.created_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </Text>
          <View style={[styles.statusBadge, isCancelled && styles.statusBadgeCancelled]}>
            <Text style={[styles.statusText, isCancelled && styles.statusTextCancelled]}>
              {isCancelled ? 'Cancelled' : STATUS_STEPS[currentStepIdx]?.label ?? order.status}
            </Text>
          </View>
        </View>
        {!isCancelled ? (
          <View style={styles.trackingCard}>
            <Text style={styles.sectionTitle}>Order Tracking</Text>
            <View style={styles.trackingSteps}>
              {STATUS_STEPS.map((step, i) => {
                const Icon = step.icon;
                const isComplete = i <= currentStepIdx;
                const isCurrent = i === currentStepIdx;
                return (
                  <View key={step.key} style={styles.trackingStep}>
                    <View style={styles.trackingIconRow}>
                      <View
                        style={[
                          styles.trackingIcon,
                          isComplete && styles.trackingIconComplete,
                          isCurrent && styles.trackingIconCurrent,
                        ]}
                      >
                        <Icon
                          size={18}
                          color={isComplete ? colors.white : colors.neutral[400]}
                        />
                      </View>
                      {i < STATUS_STEPS.length - 1 ? (
                        <View
                          style={[
                            styles.trackingLine,
                            i < currentStepIdx && styles.trackingLineComplete,
                          ]}
                        />
                      ) : null}
                    </View>
                    <Text
                      style={[
                        styles.trackingLabel,
                        isComplete && styles.trackingLabelComplete,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </View>
                );
              })}
            </View>
            {order.tracking_number ? (
              <View style={styles.trackingNumberRow}>
                <Text style={styles.trackingNumberLabel}>Tracking Number:</Text>
                <Text style={styles.trackingNumber}>{order.tracking_number}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items ({order.order_items?.length ?? 0})</Text>
          {order.order_items?.map(item => (
            <View key={item.id} style={styles.itemCard}>
              {item.product_image ? (
                <Image source={{ uri: item.product_image }} style={styles.itemImage} resizeMode="cover" />
              ) : (
                <View style={[styles.itemImage, { backgroundColor: colors.neutral[200] }]} />
              )}
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={2}>{item.product_name}</Text>
                {item.size ? <Text style={styles.itemVariant}>Size: {item.size}</Text> : null}
                {item.color ? <Text style={styles.itemVariant}>Color: {item.color}</Text> : null}
                <Text style={styles.itemQty}>Qty: {item.quantity}</Text>
              </View>
              <View style={styles.itemPriceCol}>
                <Text style={styles.itemPrice}>${item.unit_price.toFixed(2)}</Text>
                <Text style={styles.itemSubtotal}>${item.subtotal.toFixed(2)}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shipping Branch</Text>
          <View style={styles.addressCard}>
            {order.shipping_address ? (
              <>
                <View style={styles.branchInfoHeader}>
                  <MapPin size={18} color={colors.primary[600]} />
                  <Text style={styles.addressName}>{(order.shipping_address as any)?.governorate ?? ''}</Text>
                </View>
                <Text style={styles.addressText}>
                  {(order.shipping_address as any)?.branch_name ?? ''}
                </Text>
                <Text style={styles.addressText}>
                  {(order.shipping_address as any)?.branch_address ?? ''}
                </Text>
                {(order.shipping_address as any)?.branch_phone ? (
                  <Text style={styles.addressText}>Phone: {(order.shipping_address as any)?.branch_phone}</Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.addressText}>No shipping info</Text>
            )}
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payment Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>${order.subtotal.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Shipping</Text>
              <Text style={styles.summaryValue}>
                {order.shipping_cost === 0 ? 'FREE' : `$${order.shipping_cost.toFixed(2)}`}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Tax</Text>
              <Text style={styles.summaryValue}>${order.tax.toFixed(2)}</Text>
            </View>
            {order.discount > 0 ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Discount</Text>
                <Text style={[styles.summaryValue, { color: colors.success[600] }]}>
                  -${order.discount.toFixed(2)}
                </Text>
              </View>
            ) : null}
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${order.total.toFixed(2)}</Text>
            </View>
            {order.upfront_amount > 0 ? (
              <>
                <View style={[styles.summaryRow, { marginTop: spacing.sm }]}>
                  <Text style={[styles.summaryLabel, { color: colors.success[700], fontWeight: '600' }]}>Paid Upfront (25%)</Text>
                  <Text style={[styles.summaryValue, { color: colors.success[700], fontWeight: '700' }]}>
                    ${order.upfront_amount.toFixed(2)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: colors.warning[600], fontWeight: '600' }]}>Due on Delivery (75%)</Text>
                  <Text style={[styles.summaryValue, { color: colors.warning[600], fontWeight: '600' }]}>
                    ${order.remaining_amount.toFixed(2)}
                  </Text>
                </View>
              </>
            ) : null}
            <View style={[styles.summaryRow, { marginTop: spacing.sm }]}>
              <Text style={styles.summaryLabel}>Payment Method</Text>
              <Text style={styles.summaryValue}>
                {order.payment_method === 'cash_on_delivery' ? 'Cash on Delivery' :
                 order.payment_method === 'card' ? 'Card' :
                 order.payment_method === 'wallet' ? 'Wallet' : 'Bank Transfer'}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Payment Status</Text>
              <Text style={[styles.summaryValue, {
                color: order.payment_status === 'paid' ? colors.success[600] : 
                       order.payment_status === 'partial' ? colors.warning[600] : colors.warning[500],
              }]}>
                {order.payment_status === 'partial' ? '25% Paid' :
                 order.payment_status.charAt(0).toUpperCase() + order.payment_status.slice(1)}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.actionsRow}>
          <Button
            title="View Invoice"
            onPress={() => router.push(`/invoice/${order.id}`)}
          />
          {!isCancelled && !isDelivered && order.status === 'pending' ? (
            <Button title="Cancel Order" onPress={handleCancel} variant="outline" />
          ) : null}
          {isDelivered ? (
            <Button
              title="Request Return"
              onPress={() => router.push(`/returns?order_id=${order.id}`)}
              variant="outline"
            />
          ) : null}
          <Button
            title="Contact Support"
            onPress={() => router.push('/support')}
            variant="ghost"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  orderInfoCard: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  orderNumber: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
  },
  orderDate: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
    marginBottom: spacing.sm,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary[600],
  },
  statusBadgeCancelled: {
    backgroundColor: colors.error[50],
  },
  statusTextCancelled: {
    color: colors.error[500],
  },
  trackingCard: {
    margin: spacing.md,
    marginTop: 0,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    ...shadows.sm,
  },
  sectionTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  trackingSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trackingStep: {
    flex: 1,
    alignItems: 'center',
  },
  trackingIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  trackingIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.neutral[200],
  },
  trackingIconComplete: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  trackingIconCurrent: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  trackingLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.neutral[200],
    marginHorizontal: -4,
  },
  trackingLineComplete: {
    backgroundColor: colors.primary[600],
  },
  trackingLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    fontSize: 10,
  },
  trackingLabelComplete: {
    color: colors.text,
    fontWeight: '600',
  },
  trackingNumberRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  trackingNumberLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  trackingNumber: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  section: {
    margin: spacing.md,
    marginTop: 0,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    ...shadows.sm,
  },
  itemImage: {
    width: 70,
    height: 70,
    borderRadius: radius.sm,
  },
  itemInfo: {
    flex: 1,
    gap: 2,
  },
  itemName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  itemVariant: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  itemQty: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  itemPriceCol: {
    alignItems: 'flex-end',
  },
  itemPrice: {
    ...typography.caption,
    color: colors.textMuted,
  },
  itemSubtotal: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  addressCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
    ...shadows.sm,
  },
  branchInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  addressName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  addressText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  summaryValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
  },
  totalLabel: {
    ...typography.h4,
    color: colors.text,
  },
  totalValue: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.primary[600],
  },
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    flexWrap: 'wrap',
  },
});
