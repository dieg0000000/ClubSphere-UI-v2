import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'cloud.clubsphere.app',
  appName: 'ClubSphère',
  webDir: 'native-shell/dist',
  appendUserAgent: 'ClubSphereApp/1.0',
  server: {
    androidScheme: 'https',
    // Capacitor host masks match a single label per '*', so the test sub-domain needs its own entry.
    allowNavigation: ['*.clubsphere.cloud', 'clubsphere.cloud', '*.test.clubsphere.cloud'],
  },
}

export default config
