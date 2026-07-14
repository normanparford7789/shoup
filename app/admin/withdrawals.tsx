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
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Wallet,
  Shield,
  Check,
  X,
  Banknote,
  Clock,
  Search,
  X as XIcon,
  CheckCircle,
  Layers,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';

const ADMIN_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

type Withdrawal = {
  id: string;
  user_id: string;
  amount: number;
  payment_info: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';
  admin_notes: string | null;
  invoice_number: string | null;
  created_at: string;
  profile?: { full_name: string | null } | null;
};

type ProcessStatus = 'approved' | 'rejected' | 'paid';

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  pending: { label: 'Pending', color: colors.warning[600], bg: colors.warning[50] },
  approved: { label: 'Approved', color: colors.primary[600], bg: colors.primary[50] },
  rejected: { label: 'Rejected', color: colors.error[600], bg: colors.error[50] },
  paid: { label: 'Paid', color: colors.success[600], bg: colors.success[50] },
  cancelled: { label: 'Cancelled', color: colors.neutral[500], bg: colors.neutral[100] },
};

export default function AdminWithdrawalsScreen() {
  const { user, isAdmin } = useAuth();
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Process modal
  const [processModal, setProcessModal] = useState<{
    withdrawal: Withdrawal;
    action: ProcessStatus;
  } | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(false);
  const [batchPaying, setBatchPaying] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }
      const response = await fetch(`${ADMIN_API_BASE}/withdrawals`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }
      const data = await response.json();
      setWithdrawals(data.withdrawals as Withdrawal[]);
    } catch (e: any) {
      setError(e.message || 'Failed to load withdrawals');
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

  // ── API helpers ───────────────────────────────────────────────
  const getAuthToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };

  const updateLocalWithdrawal = (id: string, patch: Partial<Withdrawal>) => {
    setWithdrawals(prev => prev.map(w => (w.id === id ? { ...w, ...patch } : w)));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBatchPay = async () => {
    if (selectedIds.length === 0) return;
    Alert.alert(
      'Confirm Batch Payout',
      `Pay ${selectedIds.length} withdrawal request(s)? This will process all selected requests as paid and deduct from user wallets.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pay All',
          style: 'default',
          onPress: async () => {
            setBatchPaying(true);
            try {
              const token = await getAuthToken(); const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
              const response = await fetch(`${ADMIN_API_BASE}/withdrawals/batch-pay`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ ids: selectedIds }),
              });
              if (!response.ok) {
                const errBody = await response.json().catch(() => ({}));
                throw new Error(errBody.error || 'Batch payout failed');
              }
              const result = await response.json();
              Alert.alert(
                'Batch Payout Complete',
                `Success: ${result.successCount}\nFailed: ${result.failCount}${result.errors?.length ? '\n\nErrors:\n' + result.errors.slice(0, 5).join('\n') : ''}`
              );
              setSelectedIds([]);
              setBatchMode(false);
              await load();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setBatchPaying(false);
            }
          },
        },
      ]
    );
  };

  const handleProcess = async () => {
    if (!processModal) return;
    const { withdrawal, action } = processModal;
    setProcessing(true);
    try {
      const token = await getAuthToken();
      const response = await fetch(`${ADMIN_API_BASE}/withdrawals/${withdrawal.id}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: action,
          admin_notes: adminNotes.trim() || '',
        }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to process withdrawal');
      }
      updateLocalWithdrawal(withdrawal.id, {
        status: action,
        admin_notes: adminNotes.trim() || null,
      });
      setProcessModal(null);
      setAdminNotes('');
      Alert.alert('Success', `Withdrawal ${STATUS_CONFIG[action].label.toLowerCase()} successfully`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setProcessing(false);
    }
  };

  const openProcessModal = (withdrawal: Withdrawal, action: ProcessStatus) => {
    setProcessModal({ withdrawal, action });
    setAdminNotes(withdrawal.admin_notes ?? '');
  };

  // ── Filtering ─────────────────────────────────────────────────
  const statusCounts = withdrawals.reduce((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredWithdrawals = withdrawals.filter(w => {
    if (filterStatus !== 'all' && w.status !== filterStatus) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const name = (w.profile?.full_name ?? '').toLowerCase();
      return (
        name.includes(q) ||
        w.id.toLowerCase().includes(q) ||
        (w.invoice_number ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Withdrawals</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Admin Access Required</Text>
          <Text style={styles.accessMsg}>
            You need administrator privileges to manage withdrawals.
          </Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button title="Back to Home" onPress={() => router.replace('/(tabs)/index')} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Withdrawals</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading withdrawals…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (error && withdrawals.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Withdrawals</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <View style={{ marginTop: spacing.lg }}>
            <Button title="Retry" onPress={load} variant="outline" />
          </View>
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
        <Text style={styles.title}>Withdrawals</Text>
        <TouchableOpacity
          style={[styles.batchBtn, batchMode && styles.batchBtnActive]}
          onPress={() => {
            setBatchMode(!batchMode);
            setSelectedIds([]);
          }}
        >
          <Layers size={18} color={batchMode ? colors.white : colors.primary[600]} />
          <Text style={[styles.batchBtnText, batchMode && styles.batchBtnTextActive]}>Batch</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color={colors.neutral[400]} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, ID, or invoice…"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <XIcon size={18} color={colors.neutral[400]} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[styles.filterBtn, filterStatus === 'all' && styles.filterBtnActive]}
          onPress={() => setFilterStatus('all')}
        >
          <Text style={[styles.filterText, filterStatus === 'all' && styles.filterTextActive]}>
            All ({withdrawals.length})
          </Text>
        </TouchableOpacity>
        {['pending', 'approved', 'paid', 'rejected', 'cancelled'].map(status => {
          const count = statusCounts[status] ?? 0;
          if (count === 0 && filterStatus !== status) return null;
          return (
            <TouchableOpacity
              key={status}
              style={[styles.filterBtn, filterStatus === status && styles.filterBtnActive]}
              onPress={() => setFilterStatus(status)}
            >
              <Text style={[styles.filterText, filterStatus === status && styles.filterTextActive]}>
                {STATUS_CONFIG[status].label} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Withdrawals list */}
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {filteredWithdrawals.length === 0 ? (
          <View style={styles.emptyState}>
            <Wallet size={56} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No withdrawals found</Text>
            <Text style={styles.emptyMsg}>
              {search ? 'Try a different search term.' : 'No withdrawal requests match this filter.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {filteredWithdrawals.map(w => {
              const statusCfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.pending;
              const isSelected = selectedIds.includes(w.id);
              const isSelectable = batchMode && w.status === 'pending';
              return (
                <TouchableOpacity
                  key={w.id}
                  style={[styles.withdrawalCard, isSelectable && isSelected && styles.withdrawalCardSelected]}
                  activeOpacity={isSelectable ? 0.7 : 1}
                  onPress={isSelectable ? () => toggleSelection(w.id) : undefined}
                >
                  {/* Batch checkbox */}
                  {isSelectable ? (
                    <View style={styles.batchCheckbox}>
                      <View style={[styles.checkbox, isSelected && styles.checkboxActive]}>
                        {isSelected ? <Check size={16} color={colors.white} /> : null}
                      </View>
                    </View>
                  ) : null}
                  {/* Top row: user + amount */}
                  <View style={styles.cardTop}>
                    <View style={styles.cardTopLeft}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>
                          {(w.profile?.full_name ?? '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userName} numberOfLines={1}>
                          {w.profile?.full_name || 'Unknown user'}
                        </Text>
                        <Text style={styles.dateText}>
                          {new Date(w.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.amountText}>
                      ${Number(w.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>

                  {/* Status badge */}
                  <View style={styles.statusRow}>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                      {w.status === 'pending' ? (
                        <Clock size={12} color={statusCfg.color} />
                      ) : w.status === 'paid' ? (
                        <Check size={12} color={statusCfg.color} />
                      ) : w.status === 'rejected' || w.status === 'cancelled' ? (
                        <X size={12} color={statusCfg.color} />
                      ) : (
                        <Check size={12} color={statusCfg.color} />
                      )}
                      <Text style={[styles.statusText, { color: statusCfg.color }]}>
                        {statusCfg.label}
                      </Text>
                    </View>
                    {w.invoice_number ? (
                      <View style={styles.invoiceBadge}>
                        <Text style={styles.invoiceText}>Invoice: {w.invoice_number}</Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Payment info */}
                  <View style={styles.paymentInfoBox}>
                    <Text style={styles.paymentInfoLabel}>Payment Info</Text>
                    <Text style={styles.paymentInfoValue}>{w.payment_info || 'No payment info provided'}</Text>
                  </View>

                  {/* Admin notes (if any) */}
                  {w.admin_notes ? (
                    <View style={[styles.paymentInfoBox, { backgroundColor: colors.neutral[50] }]}>
                      <Text style={styles.paymentInfoLabel}>Admin Notes</Text>
                      <Text style={styles.paymentInfoValue}>{w.admin_notes}</Text>
                    </View>
                  ) : null}

                  {/* Actions */}
                  {w.status === 'pending' ? (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionApprove]}
                        onPress={() => openProcessModal(w, 'approved')}
                      >
                        <Check size={16} color={colors.primary[600]} />
                        <Text style={[styles.actionBtnText, { color: colors.primary[600] }]}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionReject]}
                        onPress={() => openProcessModal(w, 'rejected')}
                      >
                        <X size={16} color={colors.error[500]} />
                        <Text style={[styles.actionBtnText, { color: colors.error[500] }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {w.status === 'approved' ? (
                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionPay]}
                        onPress={() => openProcessModal(w, 'paid')}
                      >
                        <Banknote size={16} color={colors.success[600]} />
                        <Text style={[styles.actionBtnText, { color: colors.success[600] }]}>Mark as Paid</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.actionReject]}
                        onPress={() => openProcessModal(w, 'rejected')}
                      >
                        <X size={16} color={colors.error[500]} />
                        <Text style={[styles.actionBtnText, { color: colors.error[500] }]}>Reject</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}

                  {w.status === 'paid' || w.status === 'rejected' || w.status === 'cancelled' ? (
                    <View style={styles.completedRow}>
                      <Text style={styles.completedText}>
                        {w.status === 'paid' && 'This withdrawal has been paid out.'}
                        {w.status === 'rejected' && 'This withdrawal was rejected.'}
                        {w.status === 'cancelled' && 'This withdrawal was cancelled by the user.'}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Process modal ─────────────────────────────────────────── */}
      <Modal
        visible={processModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => !processing && setProcessModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {processModal?.action === 'approved' && 'Approve Withdrawal'}
                {processModal?.action === 'rejected' && 'Reject Withdrawal'}
                {processModal?.action === 'paid' && 'Mark as Paid'}
              </Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !processing && setProcessModal(null)}
              >
                <XIcon size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            {processModal ? (
              <>
                {/* Withdrawal summary */}
                <View style={styles.summaryBox}>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>User</Text>
                    <Text style={styles.summaryValue}>
                      {processModal.withdrawal.profile?.full_name || 'Unknown'}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Amount</Text>
                    <Text style={styles.summaryValue}>
                      ${Number(processModal.withdrawal.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Text>
                  </View>
                  <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.summaryLabel}>Payment</Text>
                    <Text style={[styles.summaryValue, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                      {processModal.withdrawal.payment_info || 'N/A'}
                    </Text>
                  </View>
                </View>

                <Text style={styles.notesLabel}>Admin Notes (Optional)</Text>
                <TextInput
                  style={[styles.notesInput, styles.textArea]}
                  placeholder={
                    processModal.action === 'rejected'
                      ? 'Reason for rejection…'
                      : 'Add any notes about this transaction…'
                  }
                  value={adminNotes}
                  onChangeText={setAdminNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  editable={!processing}
                />

                {/* Warning for reject */}
                {processModal.action === 'rejected' ? (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      Rejecting will return the funds to the user's wallet balance.
                    </Text>
                  </View>
                ) : null}

                {/* Warning for paid */}
                {processModal.action === 'paid' ? (
                  <View style={[styles.warningBox, { backgroundColor: colors.success[50] }]}>
                    <Text style={[styles.warningText, { color: colors.success[700] }]}>
                      Confirm that you have sent the payment to the user's payment info before marking as paid.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.modalActions}>
                  <View style={{ flex: 1 }}>
                    <Button
                      title="Cancel"
                      onPress={() => setProcessModal(null)}
                      variant="outline"
                      disabled={processing}
                      fullWidth
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      title={
                        processModal.action === 'approved'
                          ? 'Approve'
                          : processModal.action === 'rejected'
                          ? 'Reject'
                          : 'Confirm Paid'
                      }
                      onPress={handleProcess}
                      loading={processing}
                      variant={
                        processModal.action === 'rejected' ? 'primary' : 'primary'
                      }
                      fullWidth
                    />
                  </View>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Batch pay floating bar */}
      {batchMode ? (
        <View style={styles.batchBar}>
          <View>
            <Text style={styles.batchBarCount}>{selectedIds.length} selected</Text>
            <Text style={styles.batchBarHint}>Tap pending items to select</Text>
          </View>
          <TouchableOpacity
            style={[styles.batchPayBtn, selectedIds.length === 0 && styles.batchPayBtnDisabled]}
            disabled={selectedIds.length === 0 || batchPaying}
            onPress={handleBatchPay}
          >
            <Banknote size={18} color={colors.white} />
            <Text style={styles.batchPayBtnText}>
              {batchPaying ? 'Processing…' : `Pay All (${selectedIds.length})`}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  // Access guard
  accessGuard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  accessTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.md,
  },
  accessMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorEmoji: { fontSize: 48 },
  errorTitle: {
    ...typography.h3,
    color: colors.text,
  },
  errorMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: colors.error[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    margin: spacing.md,
    marginBottom: 0,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: 0,
  },
  // Filter
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.sm,
  },
  filterBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterBtnActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  filterText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
  },
  emptyMsg: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Withdrawal card
  withdrawalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTopLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h4,
    color: colors.white,
    fontWeight: '700',
  },
  userName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  dateText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  amountText: {
    ...typography.h3,
    fontWeight: '700',
    color: colors.text,
  },
  // Status
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  invoiceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.neutral[100],
  },
  invoiceText: {
    ...typography.caption,
    color: colors.neutral[600],
    fontWeight: '500',
  },
  // Payment info
  paymentInfoBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  paymentInfoLabel: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  paymentInfoValue: {
    ...typography.bodySmall,
    color: colors.text,
  },
  // Actions
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
  },
  actionApprove: {
    backgroundColor: colors.primary[50],
  },
  actionReject: {
    backgroundColor: colors.error[50],
  },
  actionPay: {
    backgroundColor: colors.success[50],
  },
  actionBtnText: {
    ...typography.bodySmall,
    fontWeight: '600',
  },
  // Completed
  completedRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  completedText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[100],
  },
  // Summary
  summaryBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  summaryLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  summaryValue: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  // Notes
  notesLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  notesInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // Warning
  warningBox: {
    backgroundColor: colors.warning[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning[100],
  },
  warningText: {
    ...typography.caption,
    color: colors.warning[600],
  },
  // Modal actions
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  // Batch button in header
  batchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.primary[600],
    backgroundColor: colors.surface,
  },
  batchBtnActive: {
    backgroundColor: colors.primary[600],
  },
  batchBtnText: {
    ...typography.bodySmall,
    color: colors.primary[600],
    fontWeight: '600',
  },
  batchBtnTextActive: {
    color: colors.white,
  },
  // Batch checkbox
  batchCheckbox: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 10,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.neutral[400],
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  withdrawalCardSelected: {
    borderColor: colors.primary[600],
    borderWidth: 2,
    backgroundColor: colors.primary[50],
  },
  // Batch pay bar
  batchBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadows.lg,
  },
  batchBarCount: {
    ...typography.h4,
    fontWeight: '700',
    color: colors.text,
  },
  batchBarHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  batchPayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary[600],
    borderRadius: radius.md,
  },
  batchPayBtnDisabled: {
    backgroundColor: colors.neutral[300],
  },
  batchPayBtnText: {
    ...typography.body,
    color: colors.white,
    fontWeight: '700',
  },
});
