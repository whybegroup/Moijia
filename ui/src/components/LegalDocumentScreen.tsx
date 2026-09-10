import { type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import { Colors, Fonts } from '../constants/theme';
import { LEGAL_EFFECTIVE_DATE } from '../constants/legal';
import { NavBar } from './ui';

export function LegalDocumentScreen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <NavBar
        title={title}
        centerTitle
        onClose={router.canGoBack() ? () => router.back() : undefined}
      />
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.updated}>Effective {LEGAL_EFFECTIVE_DATE}</Text>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function LegalHeading({ children }: { children: string }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function LegalP({ children }: { children: ReactNode }) {
  return <Text style={styles.p}>{children}</Text>;
}

export function LegalLink({
  children,
  onPress,
}: {
  children: string;
  onPress: () => void;
}) {
  return (
    <Text style={styles.link} onPress={onPress}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
  },
  updated: {
    fontFamily: Fonts.regular,
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 20,
  },
  heading: {
    fontFamily: Fonts.bold,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  p: {
    fontFamily: Fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
    marginBottom: 12,
  },
  link: {
    fontFamily: Fonts.medium,
    color: Colors.text,
    textDecorationLine: 'underline',
  },
});
