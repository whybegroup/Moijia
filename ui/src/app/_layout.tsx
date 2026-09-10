import { useEffect } from 'react';
import { Stack, useSegments, usePathname, useGlobalSearchParams, type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppToastMount } from '../components/AppToastMount';
import { UploadProgressBanner } from '../components/UploadProgressBanner';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { Provider as ReduxProvider } from 'react-redux';
import { QueryClientProvider } from '@tanstack/react-query';
import { store } from '../store';
import { queryClient } from '../config/queryClient';
import { refreshAppOnResume } from '../utils/refreshAppOnResume';
import { prefetchTwemojiAssets } from '../services/twemojiCache';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { PurchasesProvider } from '../contexts/PurchasesContext';
import { CurrentUserProvider } from '../contexts/CurrentUserContext';
import { PushNotificationsRegistrar } from '../components/PushNotificationsRegistrar';
import { ForegroundNotificationBanner } from '../components/ForegroundNotificationBanner';
import { WebAppFrame } from '../components/WebAppFrame';
import { OverflowMenuHostProvider } from '../components/OverflowMenuHost';
import { NavigationGuardReset } from '../components/NavigationGuardReset';
import { firstSearchParam, parseReturnToParam, withReturnTo } from '../utils/navigationReturn';
import { isPublicAppSegment } from '../constants/legal';
import { needsEmailVerification } from '../config/firebase';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, emailVerified, loading } = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const searchParams = useGlobalSearchParams<{ returnTo?: string | string[] }>();
  const router = useRouter();

  useEffect(() => {
    if (loading) {
      return;
    }

    const publicScreen = isPublicAppSegment(segments[0]);
    const inAuthGroup = segments[0] === 'login';
    const onVerifyEmail = segments[0] === 'verify-email';
    const returnTo = parseReturnToParam(firstSearchParam(searchParams.returnTo));

    // Small delay to ensure navigation is ready
    const timeout = setTimeout(() => {
      if (!user && !publicScreen) {
        const returnPath =
          onVerifyEmail && returnTo
            ? returnTo
            : pathname && pathname !== '/' && !onVerifyEmail
              ? pathname
              : undefined;
        router.replace(returnPath ? withReturnTo('/login', returnPath) : '/login');
        return;
      }
      const allowUnverified =
        onVerifyEmail || segments[0] === 'terms' || segments[0] === 'privacy';
      if (user && needsEmailVerification(user) && !allowUnverified) {
        const returnPath = inAuthGroup ? returnTo : pathname && pathname !== '/' ? pathname : returnTo;
        router.replace(returnPath ? withReturnTo('/verify-email', returnPath) : '/verify-email');
        return;
      }
      if (user && !needsEmailVerification(user) && (inAuthGroup || onVerifyEmail)) {
        router.replace((returnTo ?? '/(tabs)/groups') as Href);
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [user, emailVerified, loading, segments, router, pathname, searchParams.returnTo]);

  // Always mount Stack — returning null here unmounts the navigator and can trigger
  // "Rendered fewer hooks than expected" in expo-router / React Navigation during sign-out.
  return (
    <>
    <NavigationGuardReset />
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="verify-email" options={{ headerShown: false }} />
      <Stack.Screen name="terms" options={{ headerShown: false }} />
      <Stack.Screen name="privacy" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="event/[id]" />
      <Stack.Screen
        name="create-event"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="create-group"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="create-poll"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="poll/[id]"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen name="join/[code]" />
      <Stack.Screen name="groups/[id]" />
    </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (Platform.OS === 'web') return;
    focusManager.setEventListener((handleFocus) => {
      const sub = AppState.addEventListener('change', (state) => {
        handleFocus(state === 'active');
      });
      handleFocus(AppState.currentState === 'active');
      return () => sub.remove();
    });
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    prefetchTwemojiAssets();
  }, []);

  // Refetch visible data when returning from background (native only).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let prevState = AppState.currentState;
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      const wasBackground =
        prevState === 'background' || prevState === 'inactive' || prevState === 'unknown';
      if (wasBackground && nextAppState === 'active') {
        refreshAppOnResume();
      }
      prevState = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PurchasesProvider>
            <CurrentUserProvider>
            {Platform.OS !== 'web' ? <PushNotificationsRegistrar /> : null}
            <GestureHandlerRootView style={{ flex: 1 }}>
              <OverflowMenuHostProvider>
              <WebAppFrame>
              <SafeAreaProvider>
                <StatusBar style="dark" />
                <RootLayoutNav />
                <AppToastMount />
                <UploadProgressBanner />
                {Platform.OS !== 'web' ? <ForegroundNotificationBanner /> : null}
              </SafeAreaProvider>
              </WebAppFrame>
              </OverflowMenuHostProvider>
            </GestureHandlerRootView>
            </CurrentUserProvider>
          </PurchasesProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ReduxProvider>
  );
}
