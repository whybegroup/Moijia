import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { Colors } from '../constants/theme';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  // Refetch notifications when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
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
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="event/[id]" />
              <Stack.Screen name="group/[id]" />
              <Stack.Screen name="group/[id]/settings" />
              <Stack.Screen name="group/[id]/invite" />
              <Stack.Screen name="create-event" />
              <Stack.Screen
                name="create-group"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
            </Stack>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ReduxProvider>
  );
}
