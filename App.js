import { NavigationContainer } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import RootNavigator from './navigation';
import { UnitsProvider } from './context/UnitsContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { colors } from './utils/theme';

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

export default function App() {
  return (
    <AuthProvider>
      <UnitsProvider>
        <Root />
      </UnitsProvider>
    </AuthProvider>
  );
}
