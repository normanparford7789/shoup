import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  RefreshControl,
  ScrollView,
  Modal,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Plus,
  MapPin,
  Edit2,
  Trash2,
  X,
  Check,
  Store,
  Phone,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { LoadingState } from '@/components/LoadingState';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import type { Governorate, ShippingBranch } from '@/lib/supabase';

type BranchWithGov = ShippingBranch & { governorate?: Governorate };

export default function AdminShippingBranchesScreen() {
  const { user, isAdmin } = useAuth();
  const [governorates, setGovernorates] = useState<Governorate[]>([]);
  const [branches, setBranches] = useState<BranchWithGov[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showGovModal, setShowGovModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [editingGov, setEditingGov] = useState<Governorate | null>(null);
  const [editingBranch, setEditingBranch] = useState<BranchWithGov | null>(null);
  const [expandedGov, setExpandedGov] = useState<string | null>(null);
  const [govForm, setGovForm] = useState({ name: '', is_active: true, sort_order: 0 });
  const [branchForm, setBranchForm] = useState({
    governorate_id: '',
    branch_name: '',
    address: '',
    phone: '',
    manager_name: '',
    is_active: true,
    sort_order: 0,
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: govs } = await supabase
      .from('governorates')
      .select('*')
      .order('sort_order', { ascending: true });
    setGovernorates((govs as Governorate[]) ?? []);

    const { data: brs } = await supabase
      .from('shipping_branches')
      .select('*, governorate:governorates(*)')
      .order('sort_order', { ascending: true });
    setBranches((brs as BranchWithGov[]) ?? []);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openAddGov = () => {
    setEditingGov(null);
    setGovForm({ name: '', is_active: true, sort_order: 0 });
    setShowGovModal(true);
  };

  const openEditGov = (gov: Governorate) => {
    setEditingGov(gov);
    setGovForm({ name: gov.name, is_active: gov.is_active, sort_order: gov.sort_order });
    setShowGovModal(true);
  };

  const saveGov = async () => {
    if (!govForm.name.trim()) {
      Alert.alert('Required', 'Governorate name is required');
      return;
    }
    setSaving(true);
    if (editingGov) {
      await supabase
        .from('governorates')
        .update({
          name: govForm.name.trim(),
          is_active: govForm.is_active,
          sort_order: govForm.sort_order,
        })
        .eq('id', editingGov.id);
    } else {
      await supabase.from('governorates').insert({
        name: govForm.name.trim(),
        is_active: govForm.is_active,
        sort_order: govForm.sort_order,
      });
    }
    setSaving(false);
    setShowGovModal(false);
    await load();
  };

  const removeGov = (gov: Governorate) => {
    Alert.alert(
      'Delete Governorate',
      'This will also delete all branches in this governorate. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('governorates').delete().eq('id', gov.id);
            await load();
          },
        },
      ]
    );
  };

  const openAddBranch = (govId?: string) => {
    setEditingBranch(null);
    setBranchForm({
      governorate_id: govId ?? '',
      branch_name: '',
      address: '',
      phone: '',
      manager_name: '',
      is_active: true,
      sort_order: 0,
    });
    setShowBranchModal(true);
  };

  const openEditBranch = (branch: BranchWithGov) => {
    setEditingBranch(branch);
    setBranchForm({
      governorate_id: branch.governorate_id,
      branch_name: branch.branch_name,
      address: branch.address,
      phone: branch.phone ?? '',
      manager_name: branch.manager_name ?? '',
      is_active: branch.is_active,
      sort_order: branch.sort_order,
    });
    setShowBranchModal(true);
  };

  const saveBranch = async () => {
    if (!branchForm.governorate_id) {
      Alert.alert('Required', 'Please select a governorate');
      return;
    }
    if (!branchForm.branch_name.trim() || !branchForm.address.trim()) {
      Alert.alert('Required', 'Branch name and address are required');
      return;
    }
    setSaving(true);
    if (editingBranch) {
      await supabase
        .from('shipping_branches')
        .update({
          governorate_id: branchForm.governorate_id,
          branch_name: branchForm.branch_name.trim(),
          address: branchForm.address.trim(),
          phone: branchForm.phone.trim() || null,
          manager_name: branchForm.manager_name.trim() || null,
          is_active: branchForm.is_active,
          sort_order: branchForm.sort_order,
        })
        .eq('id', editingBranch.id);
    } else {
      await supabase.from('shipping_branches').insert({
        governorate_id: branchForm.governorate_id,
        branch_name: branchForm.branch_name.trim(),
        address: branchForm.address.trim(),
        phone: branchForm.phone.trim() || null,
        manager_name: branchForm.manager_name.trim() || null,
        is_active: branchForm.is_active,
        sort_order: branchForm.sort_order,
      });
    }
    setSaving(false);
    setShowBranchModal(false);
    await load();
  };

  const removeBranch = (branch: BranchWithGov) => {
    Alert.alert(
      'Delete Branch',
      `Delete "${branch.branch_name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await supabase.from('shipping_branches').delete().eq('id', branch.id);
            await load();
          },
        },
      ]
    );
  };

  if (!user || !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Shipping Branches</Text>
          <View style={{ width: 40 }} />
        </View>
        <EmptyState
          icon={<MapPin size={64} color={colors.neutral[300]} />}
          title="Access Denied"
          message="Admin access required"
        />
      </SafeAreaView>
    );
  }

  if (loading) return <LoadingState />;

  const branchesForGov = (govId: string) => branches.filter(b => b.governorate_id === govId);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Shipping Branches</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={openAddGov}>
          <Plus size={24} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={governorates}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <EmptyState
            icon={<MapPin size={64} color={colors.neutral[300]} />}
            title="No governorates"
            message="Add governorates and shipping branches for customers to select during checkout"
            action={<Button title="Add Governorate" onPress={openAddGov} />}
          />
        }
        renderItem={({ item: gov }) => {
          const govBranches = branchesForGov(gov.id);
          const isExpanded = expandedGov === gov.id;
          return (
            <View style={styles.govCard}>
              <TouchableOpacity
                style={styles.govHeader}
                onPress={() => setExpandedGov(isExpanded ? null : gov.id)}
              >
                <View style={styles.govLeft}>
                  <View style={styles.govIcon}>
                    <MapPin size={20} color={colors.primary[600]} />
                  </View>
                  <View>
                    <Text style={styles.govName}>{gov.name}</Text>
                    <Text style={styles.govCount}>{govBranches.length} branch(es)</Text>
                  </View>
                </View>
                <View style={styles.govActions}>
                  <TouchableOpacity onPress={() => openEditGov(gov)}>
                    <Edit2 size={18} color={colors.primary[600]} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeGov(gov)}>
                    <Trash2 size={18} color={colors.error[500]} />
                  </TouchableOpacity>
                  {isExpanded ? (
                    <ChevronUp size={20} color={colors.textMuted} />
                  ) : (
                    <ChevronDown size={20} color={colors.textMuted} />
                  )}
                </View>
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.branchesList}>
                  {govBranches.map(branch => (
                    <View key={branch.id} style={styles.branchCard}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.branchHeader}>
                          <Store size={16} color={colors.primary[600]} />
                          <Text style={styles.branchName}>{branch.branch_name}</Text>
                        </View>
                        <Text style={styles.branchAddress}>{branch.address}</Text>
                        {branch.phone ? (
                          <View style={styles.branchInfoRow}>
                            <Phone size={14} color={colors.textMuted} />
                            <Text style={styles.branchInfoText}>{branch.phone}</Text>
                          </View>
                        ) : null}
                        {branch.manager_name ? (
                          <Text style={styles.branchInfoText}>Manager: {branch.manager_name}</Text>
                        ) : null}
                        {!branch.is_active && (
                          <View style={styles.inactiveBadge}>
                            <Text style={styles.inactiveText}>Inactive</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.branchActions}>
                        <TouchableOpacity onPress={() => openEditBranch(branch)}>
                          <Edit2 size={16} color={colors.primary[600]} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeBranch(branch)}>
                          <Trash2 size={16} color={colors.error[500]} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={styles.addBranchBtn}
                    onPress={() => openAddBranch(gov.id)}
                  >
                    <Plus size={18} color={colors.primary[600]} />
                    <Text style={styles.addBranchText}>Add Branch</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />

      {/* Governorate Modal */}
      <Modal visible={showGovModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingGov ? 'Edit Governorate' : 'Add Governorate'}</Text>
              <TouchableOpacity onPress={() => setShowGovModal(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.label}>Governorate Name *</Text>
            <TextInput
              style={styles.input}
              value={govForm.name}
              onChangeText={v => setGovForm({ ...govForm, name: v })}
              placeholder="e.g. Damascus"
            />
            <Text style={styles.label}>Sort Order</Text>
            <TextInput
              style={styles.input}
              value={String(govForm.sort_order)}
              onChangeText={v => setGovForm({ ...govForm, sort_order: Number(v) || 0 })}
              keyboardType="numeric"
            />
            <TouchableOpacity
              style={styles.defaultRow}
              onPress={() => setGovForm({ ...govForm, is_active: !govForm.is_active })}
            >
              <View style={[styles.checkbox, govForm.is_active && styles.checkboxActive]}>
                {govForm.is_active ? <Check size={16} color={colors.white} /> : null}
              </View>
              <Text style={styles.defaultLabel}>Active</Text>
            </TouchableOpacity>
            <Button title={saving ? 'Saving...' : 'Save'} onPress={saveGov} loading={saving} fullWidth />
          </View>
        </View>
      </Modal>

      {/* Branch Modal */}
      <Modal visible={showBranchModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editingBranch ? 'Edit Branch' : 'Add Branch'}</Text>
              <TouchableOpacity onPress={() => setShowBranchModal(false)}>
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              <Text style={styles.label}>Governorate *</Text>
              <View style={styles.pickerWrap}>
                {governorates.map(gov => (
                  <TouchableOpacity
                    key={gov.id}
                    style={[
                      styles.pickerItem,
                      branchForm.governorate_id === gov.id && styles.pickerItemActive,
                    ]}
                    onPress={() => setBranchForm({ ...branchForm, governorate_id: gov.id })}
                  >
                    <Text
                      style={[
                        styles.pickerItemText,
                        branchForm.governorate_id === gov.id && styles.pickerItemTextActive,
                      ]}
                    >
                      {gov.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.label}>Branch Name *</Text>
              <TextInput
                style={styles.input}
                value={branchForm.branch_name}
                onChangeText={v => setBranchForm({ ...branchForm, branch_name: v })}
                placeholder="e.g. Downtown Branch"
              />
              <Text style={styles.label}>Address *</Text>
              <TextInput
                style={styles.input}
                value={branchForm.address}
                onChangeText={v => setBranchForm({ ...branchForm, address: v })}
                placeholder="Full branch address"
                multiline
              />
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={branchForm.phone}
                onChangeText={v => setBranchForm({ ...branchForm, phone: v })}
                keyboardType="phone-pad"
              />
              <Text style={styles.label}>Manager Name</Text>
              <TextInput
                style={styles.input}
                value={branchForm.manager_name}
                onChangeText={v => setBranchForm({ ...branchForm, manager_name: v })}
              />
              <Text style={styles.label}>Sort Order</Text>
              <TextInput
                style={styles.input}
                value={String(branchForm.sort_order)}
                onChangeText={v => setBranchForm({ ...branchForm, sort_order: Number(v) || 0 })}
                keyboardType="numeric"
              />
              <TouchableOpacity
                style={styles.defaultRow}
                onPress={() => setBranchForm({ ...branchForm, is_active: !branchForm.is_active })}
              >
                <View style={[styles.checkbox, branchForm.is_active && styles.checkboxActive]}>
                  {branchForm.is_active ? <Check size={16} color={colors.white} /> : null}
                </View>
                <Text style={styles.defaultLabel}>Active</Text>
              </TouchableOpacity>
              <Button title={saving ? 'Saving...' : 'Save Branch'} onPress={saveBranch} loading={saving} fullWidth />
            </ScrollView>
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
  govCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, ...shadows.sm, overflow: 'hidden',
  },
  govHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: spacing.md,
  },
  govLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  govIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primary[50],
    alignItems: 'center', justifyContent: 'center',
  },
  govName: { ...typography.body, fontWeight: '700', color: colors.text },
  govCount: { ...typography.caption, color: colors.textMuted },
  govActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  branchesList: { padding: spacing.md, paddingTop: 0, gap: spacing.sm },
  branchCard: {
    flexDirection: 'row', gap: spacing.sm, padding: spacing.sm,
    backgroundColor: colors.background, borderRadius: radius.md,
  },
  branchHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  branchName: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  branchAddress: { ...typography.caption, color: colors.textSecondary, marginBottom: 2 },
  branchInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  branchInfoText: { ...typography.caption, color: colors.textMuted },
  branchActions: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  inactiveBadge: {
    backgroundColor: colors.error[50], paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: radius.sm, alignSelf: 'flex-start', marginTop: 4,
  },
  inactiveText: { ...typography.caption, color: colors.error[700], fontWeight: '600' },
  addBranchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: spacing.sm, borderWidth: 1.5, borderColor: colors.primary[600],
    borderStyle: 'dashed', borderRadius: radius.md,
  },
  addBranchText: { ...typography.bodySmall, color: colors.primary[600], fontWeight: '600' },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg,
  },
  modalContent: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle: { ...typography.h4, color: colors.text },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: 4, marginTop: spacing.sm },
  input: {
    borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    ...typography.body, color: colors.text, backgroundColor: colors.background,
  },
  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  pickerItem: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.background,
  },
  pickerItemActive: { borderColor: colors.primary[600], backgroundColor: colors.primary[50] },
  pickerItemText: { ...typography.bodySmall, color: colors.textSecondary },
  pickerItemTextActive: { color: colors.primary[700], fontWeight: '600' },
  defaultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: colors.primary[600], borderColor: colors.primary[600] },
  defaultLabel: { ...typography.bodySmall, color: colors.text },
});
