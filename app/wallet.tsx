import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
  Modal,
  FlatList,
  RefreshControl,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Wallet,
  Plus,
  ArrowDownCircle,
  ArrowUpCircle,
  Clock,
  X,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';

type WalletData = {
  id: string;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
};

type Transaction = {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  status: string;
  created_at: string;
};

const TOPUP_AMOUNTS = [10, 25, 50, 100, 200, 500];

export default function CustomerWalletScreen() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [processing, setProcessing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: w } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setWallet(w as WalletData | null);

    if (w) {
      const { data: txs } = await supabase
        .from('wallet_transactions')
        .select('*')
        .eq('wallet_id', w.id)
        .order('created_at', { ascending: false })
        .limit(50);
      setTransactions((txs as Transaction[]) ?? []);
    } else {
      setTransactions([]);
    }
  }, [user]);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const ensureWallet = async (): Promise<WalletData | null> => {
    if (!user) return null;
    if (wallet) return wallet;
    const { data: newWallet } = await supabase
      .from('wallets')
      .insert({ user_id: user.id })
      .select()
      .maybeSingle();
    const w = newWallet as WalletData | null;
    setWallet(w);
    return w;
  };

  const handleTopUp = async () => {
    const amount = parseFloat(topUpAmount);
    if (!amount || amount <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount');
      return;
    }

    setProcessing(true);
    try {
      const w = await ensureWallet();
      if (!w) {
        Alert.alert('Error', 'Could not access wallet');
        return;
      }

      // Simulate top-up (in production this would go through a payment gateway)
      await supabase
        .from('wallets')
        .update({
          available_balance: w.available_balance + amount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', w.id);

      await supabase.from('wallet_transactions').insert({
        wallet_id: w.id,
        user_id: user!.id,
        type: 'topup',
        amount,
        description: `Wallet top-up of $${amount.toFixed(2)}`,
        status: 'completed',
      });

      setProcessing(false);
      setShowTopUp(false);
      setTopUpAmount('');
      Alert.alert('Success', `$${amount.toFixed(2)} added to your wallet`);
      await load();
    } catch (e: any) {
      setProcessing(false);
      Alert.alert('Error', e.message ?? 'Failed to top up wallet');
    }
  };

  if (loading) return <LoadingState />;

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>My Wallet</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState
          icon={<Wallet size={64} color={colors.neutral[300]} />}
          title="Sign in required"
          message="Sign in to access your wallet"
        />
      </SafeAreaView>
    );
  }

  const formatType = (type: string) => {
    const labels: Record<string, string> = {
      credit: 'Credit', debit: 'Debit', pending_credit: 'Pending Credit',
      pending_release: 'Released', withdrawal: 'Withdrawal',
      adjustment: 'Adjustment', topup: 'Top Up', payment: 'Payment',
    };
    return labels[type] ?? type;
  };

  const isCredit = (type: string) => ['credit', 'pending_credit', 'pending_release', 'topup'].includes(type);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My Wallet</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowTopUp(true)}>
          <Plus size={24} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <Wallet size={24} color={colors.white} />
            <Text style={styles.balanceTitle}>Available Balance</Text>
          </View>
          <Text style={styles.balanceAmount}>
            ${(wallet?.available_balance ?? 0).toFixed(2)}
          </Text>
          <View style={styles.balanceSubRow}>
            <View style={styles.balanceSubItem}>
              <Text style={styles.balanceSubLabel}>Pending</Text>
              <Text style={styles.balanceSubValue}>${(wallet?.pending_balance ?? 0).toFixed(2)}</Text>
            </View>
            <View style={styles.balanceSubItem}>
              <Text style={styles.balanceSubLabel}>Total Top-ups</Text>
              <Text style={styles.balanceSubValue}>${(wallet?.total_withdrawn ?? 0).toFixed(2)}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.topUpBtn}
            onPress={() => setShowTopUp(true)}
          >
            <Plus size={18} color={colors.primary[600]} />
            <Text style={styles.topUpBtnText}>Top Up Wallet</Text>
          </TouchableOpacity>
        </View>

        {/* Transactions */}
        <View style={styles.transactionsSection}>
          <Text style={styles.sectionTitle}>Transaction History</Text>
          {transactions.length === 0 ? (
            <EmptyState
              icon={<Clock size={48} color={colors.neutral[300]} />}
              title="No transactions yet"
              message="Top up your wallet to start using it for payments"
            />
          ) : (
            <FlatList
              data={transactions}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.txCard}>
                  <View style={[
                    styles.txIcon,
                    { backgroundColor: isCredit(item.type) ? colors.success[50] : colors.error[50] },
                  ]}>
                    {isCredit(item.type) ? (
                      <ArrowDownCircle size={20} color={colors.success[700]} />
                    ) : (
                      <ArrowUpCircle size={20} color={colors.error[500]} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txType}>{formatType(item.type)}</Text>
                    <Text style={styles.txDesc} numberOfLines={1}>{item.description ?? ''}</Text>
                    <Text style={styles.txDate}>
                      {new Date(item.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <Text style={[
                    styles.txAmount,
                    { color: isCredit(item.type) ? colors.success[700] : colors.error[500] },
                  ]}>
                    {isCredit(item.type) ? '+' : '-'}${item.amount.toFixed(2)}
                  </Text>
                </View>
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Top Up Modal */}
      <Modal visible={showTopUp} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Top Up Wallet</Text>
              <TouchableOpacity onPress={() => { setShowTopUp(false); setTopUpAmount(''); }}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Choose an amount</Text>
            <View style={styles.amountGrid}>
              {TOPUP_AMOUNTS.map(amt => (
                <TouchableOpacity
                  key={amt}
                  style={[
                    styles.amountChip,
                    topUpAmount === String(amt) && styles.amountChipActive,
                  ]}
                  onPress={() => setTopUpAmount(String(amt))}
                >
                  <Text style={[
                    styles.amountChipText,
                    topUpAmount === String(amt) && styles.amountChipTextActive,
                  ]}>${amt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Or enter custom amount</Text>
            <View style={styles.customAmountRow}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.customInput}
                value={topUpAmount}
                onChangeText={setTopUpAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
              />
            </View>
            <Button
              title={processing ? 'Processing...' : 'Add to Wallet'}
              onPress={handleTopUp}
              loading={processing}
              fullWidth
              size="lg"
            />
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
  balanceCard: {
    margin: spacing.md, backgroundColor: colors.primary[600], borderRadius: radius.xl,
    padding: spacing.lg, ...shadows.lg,
  },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  balanceTitle: { ...typography.bodySmall, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  balanceAmount: { ...typography.h1, color: colors.white, fontWeight: '700', marginBottom: spacing.md },
  balanceSubRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.lg },
  balanceSubItem: { flex: 1 },
  balanceSubLabel: { ...typography.caption, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  balanceSubValue: { ...typography.bodySmall, color: colors.white, fontWeight: '600' },
  topUpBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.white, paddingVertical: spacing.md, borderRadius: radius.md,
  },
  topUpBtnText: { ...typography.button, color: colors.primary[600], fontWeight: '700' },
  transactionsSection: { paddingHorizontal: spacing.md },
  sectionTitle: { ...typography.h4, color: colors.text, fontWeight: '700', marginBottom: spacing.md },
  txCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  txIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
  },
  txType: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  txDesc: { ...typography.caption, color: colors.textMuted },
  txDate: { ...typography.caption, color: colors.textMuted, fontSize: 10 },
  txAmount: { ...typography.bodySmall, fontWeight: '700' },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg,
  },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { ...typography.h4, color: colors.text },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm },
  amountGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  amountChip: {
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background,
  },
  amountChipActive: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  amountChipText: { ...typography.bodySmall, color: colors.textSecondary, fontWeight: '600' },
  amountChipTextActive: { color: colors.primary[700], fontWeight: '700' },
  customAmountRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.background,
    marginBottom: spacing.lg,
  },
  currencySymbol: { ...typography.h4, color: colors.textMuted },
  customInput: { flex: 1, paddingVertical: spacing.md, ...typography.h4, color: colors.text },
});
