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
  Switch,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Users as UsersIcon,
  Shield,
  ShieldOff,
  CheckCircle,
  XCircle,
  Settings2,
  Search,
  Ban,
  CircleCheck,
  CircleSlash,
  Lock,
  Unlock,
  Video,
  Pencil,
  Trash2,
  X,
  UserPlus,
  Mail,
  KeyRound,
  Store,
  Megaphone,
  ShieldCheck,
  Eye,
  EyeOff,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';
import type { UserRole } from '@/lib/supabase';

const ADMIN_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

type AdminUser = {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_banned: boolean;
  is_active: boolean;
  email: string;
  created_at: string;
  admin_notes?: string | null;
};

type Restrictions = {
  can_upload_products: boolean;
  can_upload_reels: boolean;
  can_edit_products: boolean;
  can_delete_products: boolean;
  restricted_notes: string;
};

const ROLES: UserRole[] = ['customer', 'publisher', 'merchant', 'admin'];

const ROLE_COLORS: Record<UserRole, string> = {
  customer: colors.neutral[600],
  publisher: colors.accent[600],
  merchant: colors.primary[600],
  admin: colors.error[600],
};

const ROLE_LABELS: Record<UserRole, string> = {
  customer: 'Customer',
  publisher: 'Publisher',
  merchant: 'Merchant',
  admin: 'Admin',
};

export default function AdminUsersScreen() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<UserRole | 'all'>('all');

  // Modal state
  const [roleModalUser, setRoleModalUser] = useState<AdminUser | null>(null);
  const [restrictionsModalUser, setRestrictionsModalUser] = useState<AdminUser | null>(null);
  const [restrictions, setRestrictions] = useState<Restrictions>({
    can_upload_products: true,
    can_upload_reels: true,
    can_edit_products: true,
    can_delete_products: true,
    restricted_notes: '',
  });
  const [restrictionsLoading, setRestrictionsLoading] = useState(false);
  const [restrictionsSaving, setRestrictionsSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create user modal state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: '', email: '', password: '', role: 'merchant' as UserRole });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }
      const response = await fetch(`${ADMIN_API_BASE}/users`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }
      const data = await response.json();
      setUsers(data.users as AdminUser[]);
    } catch (e: any) {
      setError(e.message || 'Failed to load users');
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
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      Authorization: `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    };
  };

  const updateLocalUser = (id: string, patch: Partial<AdminUser>) => {
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...patch } : u)));
  };

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setActionLoading(`role-${userId}`);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/users/${userId}/role`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ role }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to update role');
      }
      updateLocalUser(userId, { role });
      setRoleModalUser(null);
      Alert.alert('Success', `Role updated to ${ROLE_LABELS[role]}`);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleBanToggle = async (u: AdminUser) => {
    setActionLoading(`ban-${u.id}`);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/users/${u.id}/ban`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_banned: !u.is_banned }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to update ban status');
      }
      updateLocalUser(u.id, { is_banned: !u.is_banned });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleActiveToggle = async (u: AdminUser) => {
    setActionLoading(`active-${u.id}`);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/users/${u.id}/active`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to update active status');
      }
      updateLocalUser(u.id, { is_active: !u.is_active });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActionLoading(null);
    }
  };

  const openRestrictions = async (u: AdminUser) => {
    setRestrictionsModalUser(u);
    setRestrictionsLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/restrictions/${u.id}`, {
        headers: { Authorization: headers.Authorization },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.restrictions) {
          setRestrictions({
            can_upload_products: data.restrictions.can_upload_products ?? true,
            can_upload_reels: data.restrictions.can_upload_reels ?? true,
            can_edit_products: data.restrictions.can_edit_products ?? true,
            can_delete_products: data.restrictions.can_delete_products ?? true,
            restricted_notes: data.restrictions.restricted_notes ?? '',
          });
        } else {
          // No existing restrictions — default to all-true
          setRestrictions({
            can_upload_products: true,
            can_upload_reels: true,
            can_edit_products: true,
            can_delete_products: true,
            restricted_notes: '',
          });
        }
      }
    } catch {
      // ignore — use defaults
    } finally {
      setRestrictionsLoading(false);
    }
  };

  const handleSaveRestrictions = async () => {
    if (!restrictionsModalUser) return;
    setRestrictionsSaving(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/restrictions/${restrictionsModalUser.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          can_upload_products: restrictions.can_upload_products,
          can_upload_reels: restrictions.can_upload_reels,
          can_edit_products: restrictions.can_edit_products,
          can_delete_products: restrictions.can_delete_products,
          restricted_notes: restrictions.restricted_notes,
        }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to save restrictions');
      }
      setRestrictionsModalUser(null);
      Alert.alert('Success', 'Merchant restrictions updated');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setRestrictionsSaving(false);
    }
  };

  const handleCreateUser = async () => {
    if (!createForm.email.trim() || !createForm.password.trim() || !createForm.role) {
      setCreateError('All fields are required');
      return;
    }
    if (createForm.password.length < 6) {
      setCreateError('Password must be at least 6 characters');
      return;
    }
    setCreateLoading(true);
    setCreateError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${ADMIN_API_BASE}/users/create-merchant`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: createForm.email.trim(),
          password: createForm.password,
          full_name: createForm.full_name.trim() || createForm.email.split('@')[0],
          role: createForm.role,
        }),
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || 'Failed to create user');
      }
      setCreateModalVisible(false);
      setCreateForm({ full_name: '', email: '', password: '', role: 'merchant' });
      Alert.alert('Success', `${ROLE_LABELS[createForm.role]} account created successfully`);
      await load();
    } catch (e: any) {
      setCreateError(e.message);
    } finally {
      setCreateLoading(false);
    }
  };

  // ── Filtering ─────────────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    if (filterRole !== 'all' && u.role !== filterRole) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        (u.full_name ?? '').toLowerCase().includes(q) ||
        (u.email ?? '').toLowerCase().includes(q)
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
          <Text style={styles.title}>Manage Users</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Admin Access Required</Text>
          <Text style={styles.accessMsg}>
            You need administrator privileges to manage users.
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
          <Text style={styles.title}>Manage Users</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading users…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (error && users.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Manage Users</Text>
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
        <Text style={styles.title}>Manage Users</Text>
        <TouchableOpacity
          style={styles.addUserBtn}
          onPress={() => { setCreateError(null); setCreateModalVisible(true); }}
        >
          <UserPlus size={20} color={colors.white} />
          <Text style={styles.addUserBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color={colors.neutral[400]} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email…"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <X size={18} color={colors.neutral[400]} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Role filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        <TouchableOpacity
          style={[styles.filterBtn, filterRole === 'all' && styles.filterBtnActive]}
          onPress={() => setFilterRole('all')}
        >
          <Text style={[styles.filterText, filterRole === 'all' && styles.filterTextActive]}>
            All ({users.length})
          </Text>
        </TouchableOpacity>
        {ROLES.map(role => {
          const count = users.filter(u => u.role === role).length;
          return (
            <TouchableOpacity
              key={role}
              style={[styles.filterBtn, filterRole === role && styles.filterBtnActive]}
              onPress={() => setFilterRole(role)}
            >
              <Text style={[styles.filterText, filterRole === role && styles.filterTextActive]}>
                {ROLE_LABELS[role]} ({count})
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Users list */}
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {filteredUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <UsersIcon size={56} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No users found</Text>
            <Text style={styles.emptyMsg}>
              {search ? 'Try a different search term.' : 'No users match this filter.'}
            </Text>
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            {filteredUsers.map(u => (
              <View key={u.id} style={styles.userCard}>
                {/* Top row: avatar + name/email + role badge */}
                <View style={styles.userCardTop}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {u.full_name || 'No name'}
                    </Text>
                    <Text style={styles.userEmail} numberOfLines={1}>
                      {u.email || 'No email'}
                    </Text>
                  </View>
                  <View style={[styles.roleBadge, { backgroundColor: (ROLE_COLORS[u.role] ?? colors.neutral[500]) + '20' }]}>
                    <Text style={[styles.roleBadgeText, { color: ROLE_COLORS[u.role] ?? colors.neutral[600] }]}>
                      {ROLE_LABELS[u.role]}
                    </Text>
                  </View>
                </View>

                {/* Status badges */}
                <View style={styles.statusRow}>
                  {u.is_banned ? (
                    <View style={[styles.statusBadge, styles.statusBanned]}>
                      <Ban size={12} color={colors.error[600]} />
                      <Text style={[styles.statusText, { color: colors.error[600] }]}>Banned</Text>
                    </View>
                  ) : null}
                  {u.is_active ? (
                    <View style={[styles.statusBadge, styles.statusActive]}>
                      <CircleCheck size={12} color={colors.success[600]} />
                      <Text style={[styles.statusText, { color: colors.success[600] }]}>Active</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusBadge, styles.statusInactive]}>
                      <CircleSlash size={12} color={colors.neutral[500]} />
                      <Text style={[styles.statusText, { color: colors.neutral[500] }]}>Inactive</Text>
                    </View>
                  )}
                </View>

                {/* Actions */}
                <View style={styles.actionRow}>
                  {/* Role */}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => setRoleModalUser(u)}
                    disabled={actionLoading === `role-${u.id}`}
                  >
                    <Shield size={16} color={colors.primary[600]} />
                    <Text style={styles.actionBtnText}>Role</Text>
                  </TouchableOpacity>

                  {/* Ban / Unban */}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleBanToggle(u)}
                    disabled={actionLoading === `ban-${u.id}`}
                  >
                    {actionLoading === `ban-${u.id}` ? (
                      <ActivityIndicator size={16} color={colors.error[500]} />
                    ) : u.is_banned ? (
                      <ShieldOff size={16} color={colors.success[600]} />
                    ) : (
                      <Ban size={16} color={colors.error[500]} />
                    )}
                    <Text style={[styles.actionBtnText, { color: u.is_banned ? colors.success[600] : colors.error[500] }]}>
                      {u.is_banned ? 'Unban' : 'Ban'}
                    </Text>
                  </TouchableOpacity>

                  {/* Activate / Deactivate */}
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => handleActiveToggle(u)}
                    disabled={actionLoading === `active-${u.id}`}
                  >
                    {actionLoading === `active-${u.id}` ? (
                      <ActivityIndicator size={16} color={colors.neutral[600]} />
                    ) : u.is_active ? (
                      <XCircle size={16} color={colors.neutral[600]} />
                    ) : (
                      <CheckCircle size={16} color={colors.success[600]} />
                    )}
                    <Text style={[styles.actionBtnText, { color: u.is_active ? colors.neutral[600] : colors.success[600] }]}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </Text>
                  </TouchableOpacity>

                  {/* Merchant restrictions (only for merchants) */}
                  {u.role === 'merchant' ? (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => openRestrictions(u)}
                    >
                      <Settings2 size={16} color={colors.primary[600]} />
                      <Text style={styles.actionBtnText}>Restrict</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Role selection modal ─────────────────────────────────── */}
      <Modal
        visible={roleModalUser !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleModalUser(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Change Role</Text>
              <TouchableOpacity style={styles.modalClose} onPress={() => setRoleModalUser(null)}>
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>
            {roleModalUser ? (
              <>
                <Text style={styles.modalSubtitle}>
                  {roleModalUser.full_name || roleModalUser.email || 'User'}
                </Text>
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  {ROLES.map(role => {
                    const isSelected = roleModalUser.role === role;
                    return (
                      <TouchableOpacity
                        key={role}
                        style={[styles.roleOption, isSelected && styles.roleOptionActive]}
                        onPress={() => handleRoleChange(roleModalUser.id, role)}
                        disabled={actionLoading === `role-${roleModalUser.id}`}
                      >
                        <View style={[styles.roleRadio, isSelected && styles.roleRadioActive]}>
                          {isSelected ? <View style={styles.roleRadioDot} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.roleOptionLabel, isSelected && styles.roleOptionLabelActive]}>
                            {ROLE_LABELS[role]}
                          </Text>
                          <Text style={styles.roleOptionDesc}>
                            {role === 'customer' && 'Can browse and purchase products'}
                            {role === 'publisher' && 'Can publish reels and earn affiliate commissions'}
                            {role === 'merchant' && 'Can upload products and manage inventory'}
                            {role === 'admin' && 'Full administrative access'}
                          </Text>
                        </View>
                        {actionLoading === `role-${roleModalUser.id}` && isSelected ? (
                          <ActivityIndicator size={18} color={colors.primary[600]} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── Merchant restrictions modal ─────────────────────────── */}
      <Modal
        visible={restrictionsModalUser !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRestrictionsModalUser(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Merchant Restrictions</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setRestrictionsModalUser(null)}
                disabled={restrictionsSaving}
              >
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>
            {restrictionsModalUser ? (
              <>
                <Text style={styles.modalSubtitle}>
                  {restrictionsModalUser.full_name || restrictionsModalUser.email || 'Merchant'}
                </Text>
                {restrictionsLoading ? (
                  <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                    <ActivityIndicator size="large" color={colors.primary[600]} />
                    <Text style={styles.loadingText}>Loading restrictions…</Text>
                  </View>
                ) : (
                  <>
                    <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                        <RestrictionToggle
                          icon={<Unlock size={18} color={colors.primary[600]} />}
                          label="Can Upload Products"
                          value={restrictions.can_upload_products}
                          onValueChange={v => setRestrictions(p => ({ ...p, can_upload_products: v }))}
                        />
                        <RestrictionToggle
                          icon={<Video size={18} color={colors.primary[600]} />}
                          label="Can Upload Reels"
                          value={restrictions.can_upload_reels}
                          onValueChange={v => setRestrictions(p => ({ ...p, can_upload_reels: v }))}
                        />
                        <RestrictionToggle
                          icon={<Pencil size={18} color={colors.primary[600]} />}
                          label="Can Edit Products"
                          value={restrictions.can_edit_products}
                          onValueChange={v => setRestrictions(p => ({ ...p, can_edit_products: v }))}
                        />
                        <RestrictionToggle
                          icon={<Trash2 size={18} color={colors.primary[600]} />}
                          label="Can Delete Products"
                          value={restrictions.can_delete_products}
                          onValueChange={v => setRestrictions(p => ({ ...p, can_delete_products: v }))}
                        />
                      </View>

                      <Text style={styles.restrictionLabel}>Restricted Notes</Text>
                      <TextInput
                        style={[styles.restrictionInput, styles.textArea]}
                        placeholder="Add notes about restrictions applied to this merchant…"
                        value={restrictions.restricted_notes}
                        onChangeText={v => setRestrictions(p => ({ ...p, restricted_notes: v }))}
                        multiline
                        numberOfLines={3}
                        textAlignVertical="top"
                      />
                    </ScrollView>
                    <View style={{ marginTop: spacing.md }}>
                      <Button
                        title="Save Restrictions"
                        onPress={handleSaveRestrictions}
                        loading={restrictionsSaving}
                        fullWidth
                      />
                    </View>
                  </>
                )}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── Create User Modal ──────────────────────────────────────── */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !createLoading && setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Account</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !createLoading && setCreateModalVisible(false)}
              >
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            {/* Role selector */}
            <Text style={styles.inputLabel}>Account Type</Text>
            <View style={styles.roleSelectorRow}>
              {([
                { role: 'merchant', label: 'Merchant', icon: <Store size={18} color={colors.primary[600]} /> },
                { role: 'publisher', label: 'Publisher', icon: <Megaphone size={18} color={colors.accent[600]} /> },
                { role: 'admin', label: 'Admin', icon: <ShieldCheck size={18} color={colors.error[600]} /> },
              ]).map(({ role, label, icon }) => (
                <TouchableOpacity
                  key={role}
                  style={[
                    styles.roleOption,
                    createForm.role === role && styles.roleOptionActive,
                  ]}
                  onPress={() => setCreateForm({ ...createForm, role: role as UserRole })}
                >
                  {icon}
                  <Text style={[
                    styles.createRoleOptionText,
                    createForm.role === role && styles.createRoleOptionTextActive,
                  ]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Full name */}
            <Text style={styles.inputLabel}>Full Name</Text>
            <View style={styles.inputRow}>
              <UsersIcon size={18} color={colors.neutral[400]} />
              <TextInput
                style={styles.modalInput}
                placeholder="John Doe"
                value={createForm.full_name}
                onChangeText={(v) => setCreateForm({ ...createForm, full_name: v })}
                autoCapitalize="words"
                editable={!createLoading}
              />
            </View>

            {/* Email */}
            <Text style={styles.inputLabel}>Email Address</Text>
            <View style={styles.inputRow}>
              <Mail size={18} color={colors.neutral[400]} />
              <TextInput
                style={styles.modalInput}
                placeholder="user@example.com"
                value={createForm.email}
                onChangeText={(v) => setCreateForm({ ...createForm, email: v })}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!createLoading}
              />
            </View>

            {/* Password */}
            <Text style={styles.inputLabel}>Password</Text>
            <View style={styles.inputRow}>
              <KeyRound size={18} color={colors.neutral[400]} />
              <TextInput
                style={styles.modalInput}
                placeholder="Min 6 characters"
                value={createForm.password}
                onChangeText={(v) => setCreateForm({ ...createForm, password: v })}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!createLoading}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                {showPassword
                  ? <EyeOff size={18} color={colors.neutral[400]} />
                  : <Eye size={18} color={colors.neutral[400]} />}
              </TouchableOpacity>
            </View>

            {createError ? (
              <View style={styles.createErrorBox}>
                <Text style={styles.createErrorText}>{createError}</Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <View style={{ flex: 1 }}>
                <Button
                  title="Cancel"
                  onPress={() => setCreateModalVisible(false)}
                  variant="outline"
                  disabled={createLoading}
                  fullWidth
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title="Create Account"
                  onPress={handleCreateUser}
                  loading={createLoading}
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

// ── Restriction toggle sub-component ─────────────────────────────
function RestrictionToggle({
  icon,
  label,
  value,
  onValueChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.restrictionToggle}>
      <View style={styles.restrictionToggleLeft}>
        <View style={styles.restrictionToggleIcon}>{icon}</View>
        <Text style={styles.restrictionToggleLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.neutral[300], true: colors.primary[600] }}
        thumbColor={colors.white}
      />
    </View>
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
  // User card
  userCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadows.sm,
  },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  userEmail: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  roleBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  roleBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  // Status badges
  statusRow: {
    flexDirection: 'row',
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
  statusBanned: {
    backgroundColor: colors.error[50],
  },
  statusActive: {
    backgroundColor: colors.success[50],
  },
  statusInactive: {
    backgroundColor: colors.neutral[100],
  },
  statusText: {
    ...typography.caption,
    fontWeight: '600',
  },
  // Actions
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.neutral[50],
  },
  actionBtnText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.primary[600],
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
    marginBottom: spacing.xs,
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
  modalSubtitle: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  // Role options
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  roleOptionActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  createRoleOptionActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  roleRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.neutral[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleRadioActive: {
    borderColor: colors.primary[600],
  },
  roleRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary[600],
  },
  roleOptionLabel: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  },
  roleOptionLabelActive: {
    color: colors.primary[700],
  },
  roleOptionDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  // Restriction toggles
  restrictionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restrictionToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  restrictionToggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  restrictionToggleLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  },
  restrictionLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  restrictionInput: {
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
  // Add user button
  addUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary[600],
    borderRadius: radius.md,
  },
  addUserBtnText: {
    ...typography.bodySmall,
    color: colors.white,
    fontWeight: '600',
  },
  // Create user modal
  inputLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.background,
  },
  modalInput: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: 0,
  },
  roleSelectorRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  createRoleOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  createRoleOptionText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  createRoleOptionTextActive: {
    color: colors.primary[700],
    fontWeight: '700',
  },
  createErrorBox: {
    backgroundColor: colors.error[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  createErrorText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
});
