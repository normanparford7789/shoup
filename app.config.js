// app.config.js — يحل محل app.json
// يضمن تضمين متغيرات Supabase في APK دائماً حتى لو لم تُحمَّل من .env
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://uiajhhqjyntjpoenhcnx.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpYWpoaHFqeW50anBvZW5oY254Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3MjQ2MTcsImV4cCI6MjEwMTMwMDYxN30.m1JvtvDxTjV0sguHl78hPMu6tv5gmzOGTuBK7VfI_rw';

export default {
  expo: {
    name: 'Style',
    slug: 'style',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'style',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    splash: {
      image: './assets/images/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#0a0a0a',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.style.app',
    },
    android: {
      package: 'com.style.app',
      versionCode: 1,
      adaptiveIcon: {
        foregroundImage: './assets/images/icon.png',
        backgroundColor: '#d4af37',
      },
      permissions: ['INTERNET'],
    },
    web: {
      bundler: 'metro',
      output: 'single',
      favicon: './assets/images/favicon.png',
    },
    plugins: ['expo-router', 'expo-font', 'expo-web-browser'],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      // هذه القيم تُضمَّن في APK عبر expo-constants — أكثر موثوقية من process.env
      supabaseUrl: SUPABASE_URL,
      supabaseAnonKey: SUPABASE_ANON_KEY,
      eas: {
        projectId: '',
      },
    },
  },
};
