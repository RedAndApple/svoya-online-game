import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.svoyaigra.online',
  appName: 'Своя Игра Онлайн',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#080914',
      showSpinner: false
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#080914'
    }
  },
  ios: {
    contentInset: 'automatic',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false
  }
};

export default config;
