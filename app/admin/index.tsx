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
} from 'react-native';
import { router } from 'expo-router';
import {
  ChevronLeft,
  Users,
  ShoppingBag,
  DollarSign,
  Wallet,
  Store,
  Megaphone,
  UserCircle,
  Package,
  TrendingUp,
  ArrowRight,
  Shield,
  Banknote,
  PlusCircle,
  BarChart3,
  Ban,
  AlertTriangle,
  UserCheck,
  Layers,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/Button';

type Stats = {
  totalUsers: number;
  totalOrders: number;
  totalProducts: number;
  totalRevenue: string;
  pendingWithdrawals: string;
  totalPaidOut: string;
  totalWalletBalance: string;
  totalMerchantEarnings: string;
  recentRevenue: string;
  recentOrdersCount: number;
  ordersByStatus: Record<string, number>;
  merchants: number;
  publishers: number;
  customers: number;
  admins: number;
  bannedUsers: number;
  inactiveUsers: number;
};

const ADMIN_API_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/admin-api`;

export default function AdminDashboardScreen() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated');
        return;
      }
      const response = await fetch(`${ADMIN_API_BASE}/stats`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }
      const data = await response.json();
      setStats(data.stats as Stats);
    } catch (e: any) {
      setError(e.message || 'Failed to load stats');
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

  if (!user || !isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Admin</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Admin Access Required</Text>
          <Text style={styles.accessMsg}>
            You need administrator privileges to view this dashboard.
          </Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button title="Back to Home" onPress={() => router.replace('/(tabs)/index')} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Admin Dashboard</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading dashboard…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error && !stats) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Admin Dashboard</Text>
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

  const fmt = (v: string | undefined) =>
    v ? `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';

  // Revenue highlight cards
  const revenueCards = [
    { label: 'Total Revenue', value: fmt(stats?.totalRevenue), icon: <DollarSign size={22} color={colors.success[700]} />, bg: colors.success[50], iconBg: colors.success[100] },
    { label: 'Last 7 Days', value: fmt(stats?.recentRevenue), icon: <TrendingUp size={22} color={colors.primary[700]} />, bg: colors.primary[50], iconBg: colors.primary[100] },
    { label: 'Pending Withdrawals', value: fmt(stats?.pendingWithdrawals), icon: <Wallet size={22} color={colors.warning[600]} />, bg: colors.warning[50], iconBg: colors.warning[100] },
    { label: 'Total Paid Out', value: fmt(stats?.totalPaidOut), icon: <Banknote size={22} color={colors.accent[600]} />, bg: colors.accent[50], iconBg: colors.accent[100] },
    { label: 'Wallet Balances', value: fmt(stats?.totalWalletBalance), icon: <Wallet size={22} color={colors.primary[700]} />, bg: colors.primary[50], iconBg: colors.primary[100] },
    { label: 'Merchant Earnings', value: fmt(stats?.totalMerchantEarnings), icon: <Store size={22} color={colors.success[700]} />, bg: colors.success[50], iconBg: colors.success[100] },
  ];

  const userCards = [
    { label: 'Total Users', value: stats ? String(stats.totalUsers) : '—', icon: <Users size={22} color={colors.primary[700]} />, bg: colors.primary[50], iconBg: colors.primary[100] },
    { label: 'Merchants', value: stats ? String(stats.merchants) : '—', icon: <Store size={22} color={colors.primary[700]} />, bg: colors.primary[50], iconBg: colors.primary[100] },
    { label: 'Publishers', value: stats ? String(stats.publishers) : '—', icon: <Megaphone size={22} color={colors.accent[600]} />, bg: colors.accent[50], iconBg: colors.accent[100] },
    { label: 'Customers', value: stats ? String(stats.customers) : '—', icon: <UserCircle size={22} color={colors.neutral[700]} />, bg: colors.neutral[100], iconBg: colors.neutral[200] },
    { label: 'Admins', value: stats ? String(stats.admins) : '—', icon: <Shield size={22} color={colors.error[600]} />, bg: colors.error[50], iconBg: colors.error[100] },
    { label: 'Banned', value: stats ? String(stats.bannedUsers) : '—', icon: <Ban size={22} color={colors.error[500]} />, bg: colors.error[50], iconBg: colors.error[100] },
  ];

  const orderCards = [
    { label: 'Total Orders', value: stats ? String(stats.totalOrders) : '—', icon: <ShoppingBag size={22} color={colors.success[700]} />, bg: colors.success[50], iconBg: colors.success[100] },
    { label: 'Recent (7d)', value: stats ? String(stats.recentOrdersCount) : '—', icon: <TrendingUp size={22} color={colors.primary[700]} />, bg: colors.primary[50], iconBg: colors.primary[100] },
    { label: 'Products', value: stats ? String(stats.totalProducts) : '—', icon: <Package size={22} color={colors.accent[600]} />, bg: colors.accent[50], iconBg: colors.accent[100] },
    { label: 'Inactive Users', value: stats ? String(stats.inactiveUsers) : '—', icon: <UserCheck size={22} color={colors.neutral[600]} />, bg: colors.neutral[100], iconBg: colors.neutral[200] },
  ];

  const quickLinks = [
    { label: 'Manage Users', description: 'Roles, bans, activation & restrictions', icon: <Users size={24} color={colors.primary[600]} />, onPress: () => router.push('/admin/users'), color: colors.primary[50] },
    { label: 'Manage Withdrawals', description: 'Approve, reject & pay withdrawal requests', icon: <Wallet size={24} color={colors.primary[600]} />, onPress: () => router.push('/admin/withdrawals'), color: colors.warning[50] },
    { label: 'All Orders', description: 'View and manage all platform orders', icon: <ShoppingBag size={24} color={colors.primary[600]} />, onPress: () => router.push('/admin/orders'), color: colors.success[50] },
    { label: 'All Products', description: 'Moderate and manage all products', icon: <Package size={24} color={colors.primary[600]} />, onPress: () => router.push('/admin/products'), color: colors.accent[50] },
  ];

  const orderStatusLabels: Record<string, string> = {
    pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled', completed: 'Completed',
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Admin Dashboard</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Welcome banner */}
        <View style={styles.welcomeBanner}>
          <View style={styles.welcomeLeft}>
            <Text style={styles.welcomeGreeting}>Welcome back,</Text>
            <Text style={styles.welcomeName}>{profile?.full_name || 'Admin'}</Text>
            <View style={styles.welcomeStats}>
              <View style={styles.welcomeStatItem}>
                <Text style={styles.welcomeStatValue}>{stats?.totalUsers ?? '—'}</Text>
                <Text style={styles.welcomeStatLabel}>Users</Text>
              </View>
              <View style={styles.welcomeStatDivider} />
              <View style={styles.welcomeStatItem}>
                <Text style={styles.welcomeStatValue}>{stats?.totalOrders ?? '—'}</Text>
                <Text style={styles.welcomeStatLabel}>Orders</Text>
              </View>
              <View style={styles.welcomeStatDivider} />
              <View style={styles.welcomeStatItem}>
                <Text style={styles.welcomeStatValue}>{fmt(stats?.totalRevenue)}</Text>
                <Text style={styles.welcomeStatLabel}>Revenue</Text>
              </View>
            </View>
          </View>
          <View style={styles.welcomeIcon}>
            <Shield size={28} color={colors.primary[600]} />
          </View>
        </View>

        {error && stats ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{error}</Text>
          </View>
        ) : null}

        {/* Revenue section */}
        <Text style={styles.sectionTitle}>Revenue Overview</Text>
        <View style={styles.statsGrid}>
          {revenueCards.map((card, idx) => (
            <View key={idx} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: card.iconBg }]}>
                {card.icon}
              </View>
              <Text style={styles.statValue}>{card.value}</Text>
              <Text style={styles.statLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        {/* Users section */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Users Overview</Text>
        <View style={styles.statsGrid}>
          {userCards.map((card, idx) => (
            <View key={idx} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: card.iconBg }]}>
                {card.icon}
              </View>
              <Text style={styles.statValue}>{card.value}</Text>
              <Text style={styles.statLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        {/* Orders section */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Orders & Products</Text>
        <View style={styles.statsGrid}>
          {orderCards.map((card, idx) => (
            <View key={idx} style={styles.statCard}>
              <View style={[styles.statIcon, { backgroundColor: card.iconBg }]}>
                {card.icon}
              </View>
              <Text style={styles.statValue}>{card.value}</Text>
              <Text style={styles.statLabel}>{card.label}</Text>
            </View>
          ))}
        </View>

        {/* Orders by status breakdown */}
        {stats?.ordersByStatus && Object.keys(stats.ordersByStatus).length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Orders by Status</Text>
            <View style={styles.statusBreakdownCard}>
              {Object.entries(stats.ordersByStatus).map(([status, count]) => (
                <View key={status} style={styles.statusBreakdownRow}>
                  <View style={[styles.statusDot, { backgroundColor: getStatusColor(status) }]} />
                  <Text style={styles.statusBreakdownLabel}>
                    {orderStatusLabels[status] || status}
                  </Text>
                  <Text style={styles.statusBreakdownCount}>{count}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Quick actions */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Quick Actions</Text>
        {quickLinks.map((link, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.quickLinkCard}
            onPress={link.onPress}
            activeOpacity={0.7}
          >
            <View style={[styles.quickLinkIcon, { backgroundColor: link.color }]}>
              {link.icon}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickLinkLabel}>{link.label}</Text>
              <Text style={styles.quickLinkDesc}>{link.description}</Text>
            </View>
            <ArrowRight size={20} color={colors.neutral[400]} />
          </TouchableOpacity>
        ))}

        {/* Sign out */}
        <View style={{ marginTop: spacing.xl }}>
          <Button
            title="Sign Out"
            onPress={() => {
              signOut();
              router.replace('/(tabs)/index');
            }}
            variant="outline"
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending': return colors.warning[500];
    case 'confirmed': return colors.primary[600];
    case 'shipped': return colors.accent[500];
    case 'delivered': return colors.success[600];
    case 'completed': return colors.success[600];
    case 'cancelled': return colors.error[500];
    default: return colors.neutral[400];
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, backgroundColor: colors.surface,
  },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h4, color: colors.text, fontWeight: '700' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.textSecondary },
  accessGuard: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  accessTitle: { ...typography.h3, color: colors.text, marginTop: spacing.md },
  accessMsg: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  errorEmoji: { fontSize: 48 },
  errorTitle: { ...typography.h3, color: colors.text },
  errorMsg: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  errorBanner: {
    backgroundColor: colors.error[50], borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.error[100],
  },
  errorBannerText: { ...typography.bodySmall, color: colors.error[700] },
  welcomeBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary[600], borderRadius: radius.lg, padding: spacing.lg,
    marginBottom: spacing.lg, ...shadows.md,
  },
  welcomeLeft: { flex: 1 },
  welcomeGreeting: { ...typography.bodySmall, color: colors.primary[100] },
  welcomeName: { ...typography.h3, color: colors.white, fontWeight: '700' },
  welcomeStats: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  welcomeStatItem: { alignItems: 'center' },
  welcomeStatValue: { ...typography.h4, color: colors.white, fontWeight: '700' },
  welcomeStatLabel: { ...typography.caption, color: colors.primary[100], marginTop: 2 },
  welcomeStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: spacing.md },
  welcomeIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { ...typography.h4, color: colors.text, fontWeight: '700', marginBottom: spacing.md },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  statCard: {
    width: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.lg,
    padding: spacing.md, ...shadows.sm,
  },
  statIcon: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  statValue: { ...typography.h2, color: colors.text, fontWeight: '700' },
  statLabel: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  statusBreakdownCard: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, ...shadows.sm,
  },
  statusBreakdownRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  statusBreakdownLabel: { ...typography.bodySmall, color: colors.text, flex: 1 },
  statusBreakdownCount: { ...typography.bodySmall, fontWeight: '700', color: colors.text },
  quickLinkCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md,
    marginBottom: spacing.sm, ...shadows.sm,
  },
  quickLinkIcon: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  quickLinkLabel: { ...typography.body, fontWeight: '600', color: colors.text },
  quickLinkDesc: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
});
