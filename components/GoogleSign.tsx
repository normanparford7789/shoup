import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { colors, spacing, radius, typography } from '@/lib/theme';

export function GoogleSign({ onPress }: { onPress: () => Promise<{ error: string | null }> }) {
  const [loading, setLoading] = useState(false);

  const handlePress = async () => {
    setLoading(true);
    const result = await onPress();
    if (result.error) {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.googleBtn}
      onPress={handlePress}
      disabled={loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.text} />
      ) : (
        <View style={styles.googleIcon}>
          <Text style={styles.googleIconText}>G</Text>
        </View>
      )}
      <Text style={styles.googleText}>
        {loading ? 'Connecting...' : 'Continue with Google'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  googleIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  googleIconText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4285F4',
  },
  googleText: {
    ...typography.button,
    color: colors.text,
    fontWeight: '600',
  },
});
