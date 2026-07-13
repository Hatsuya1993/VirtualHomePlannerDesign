import * as Sentry from '@sentry/react-native';
import { vexo } from 'vexo-analytics';
import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, LogBox, View } from 'react-native';
import RootNavigator from './navigation';
import { UnitsProvider } from './context/UnitsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { EntitlementsProvider } from './context/EntitlementsContext';
import { colors } from './utils/theme';

// Dev-only safety net: a null/empty image uri surfaces as a RedBox
// ("No suitable image URL loader found for (null)"). It's harmless (the image
// just doesn't render, and it's silent in production), so don't let it block
// the dev flow. Our own images already go through <SafeImage>.
LogBox.ignoreLogs(['No suitable image URL loader found']);

// Sentry (crash/error monitoring) — only initialized when a DSN is provided.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    // Turn on only in a small % for perf tracing; keep errors always on.
    tracesSampleRate: 0.2,
    sendDefaultPii: false,
  });
}

// Vexo (product analytics) — auto-tracks screens/sessions once initialized.
const VEXO_API_KEY = process.env.EXPO_PUBLIC_VEXO_API_KEY;
if (VEXO_API_KEY) {
  vexo(VEXO_API_KEY);
}

// Wait for Firebase to report the persisted auth state before rendering the
// navigator, so we don't flash onboarding to an already-signed-in user.
function Root() {
  const { initializing } = useAuth();
  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}

function App() {
  return (
    <AuthProvider>
      <EntitlementsProvider>
        <UnitsProvider>
          <Root />
        </UnitsProvider>
      </EntitlementsProvider>
    </AuthProvider>
  );
}

export default Sentry.wrap(App);
