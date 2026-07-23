import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Mail, Lock, User, Eye, EyeOff, ShoppingBag, Megaphone } from 'lucide-react-native';
import { GoogleSign } from '@/components/GoogleSign';
import { colors, spacing, radius, typography } from '@/lib/theme';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/Button';
import type { UserRole } from '@/lib/supabase';

export default function SignupScreen() {
  const { signUp, signInWithGoogle } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accountType, setAccountType] = useState<UserRole>('customer');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');
    const { error } = await signUp(email.trim(), password, fullName.trim(), accountType);
    setLoading(false);
    if (error) {
      setError(error);
      return;
    }
    router.replace('/(tabs)/account');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
              <ChevronLeft size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <View style={styles.content}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Join STYLE for the best shopping experience</Text>

            <Text style={styles.sectionLabel}>Account Type</Text>
            <View style={styles.accountTypeRow}>
              <TouchableOpacity
                style={[styles.accountTypeCard, accountType === 'customer' && styles.accountTypeCardActive]}
                onPress={() => setAccountType('customer')}
                activeOpacity={0.8}
              >
                <View style={[styles.accountTypeIcon, accountType === 'customer' && styles.accountTypeIconActive]}>
                  <ShoppingBag size={24} color={accountType === 'customer' ? colors.white : colors.primary[600]} />
                </View>
                <Text style={[styles.accountTypeTitle, accountType === 'customer' && styles.accountTypeTitleActive]}>
                  Personal
                </Text>
                <Text style={styles.accountTypeDesc}>Shop and browse products</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.accountTypeCard, accountType === 'publisher' && styles.accountTypeCardActive]}
                onPress={() => setAccountType('publisher')}
                activeOpacity={0.8}
              >
                <View style={[styles.accountTypeIcon, accountType === 'publisher' && styles.accountTypeIconActive]}>
                  <Megaphone size={24} color={accountType === 'publisher' ? colors.white : colors.primary[600]} />
                </View>
                <Text style={[styles.accountTypeTitle, accountType === 'publisher' && styles.accountTypeTitleActive]}>
                  Publisher
                </Text>
                <Text style={styles.accountTypeDesc}>Earn from affiliate links</Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <View style={styles.inputWrap}>
                <User size={20} color={colors.neutral[400]} />
                <TextInput
                  style={styles.input}
                  placeholder="John Doe"
                  value={fullName}
                  onChangeText={setFullName}
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <View style={styles.inputWrap}>
                <Mail size={20} color={colors.neutral[400]} />
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrap}>
                <Lock size={20} color={colors.neutral[400]} />
                <TextInput
                  style={styles.input}
                  placeholder="At least 6 characters"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff size={20} color={colors.neutral[400]} /> : <Eye size={20} color={colors.neutral[400]} />}
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Confirm Password</Text>
              <View style={styles.inputWrap}>
                <Lock size={20} color={colors.neutral[400]} />
                <TextInput
                  style={styles.input}
                  placeholder="Re-enter password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </View>
            </View>
            <View style={{ height: spacing.md }} />
            <Button title={loading ? 'Creating Account...' : 'Sign Up'} onPress={handleSignup} loading={loading} fullWidth size="lg" />
            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.divider} />
            </View>
            <GoogleSign onPress={signInWithGoogle} />
            <View style={{ height: spacing.md }} />
            <TouchableOpacity
              style={styles.signinBtn}
              onPress={() => router.push('/auth/login')}
            >
              <Text style={styles.signinText}>
                Already have an account? <Text style={styles.signinLink}>Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  sectionLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  accountTypeRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  accountTypeCard: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountTypeCardActive: {
    borderColor: colors.primary[600],
    backgroundColor: colors.primary[50],
  },
  accountTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary[50],
  },
  accountTypeIconActive: {
    backgroundColor: colors.primary[600],
  },
  accountTypeTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  },
  accountTypeTitleActive: {
    color: colors.primary[700],
  },
  accountTypeDesc: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: colors.error[50],
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  signinBtn: {
    alignItems: 'center',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  signinText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  signinLink: {
    color: colors.primary[600],
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.md,
    gap: spacing.sm,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    ...typography.bodySmall,
    color: colors.textMuted,
    fontWeight: '600',
  },
});
