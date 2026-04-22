import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';

export type NoGroupForActionVariant = 'event' | 'poll';

type Props = {
  visible: boolean;
  variant: NoGroupForActionVariant;
  onDismiss: () => void;
};

export function NoGroupForActionModal({ visible, variant, onDismiss }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <Text style={styles.title}>No Groups</Text>
          <Text style={styles.message}>
            {variant === 'poll'
              ? 'You need to join or create a group before creating a poll.'
              : 'You need to join or create a group before creating an event.'}
          </Text>
          <TouchableOpacity onPress={onDismiss} style={styles.button}>
            <Text style={styles.buttonText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  box: {
    backgroundColor: Colors.surface,
    borderRadius: Radius['2xl'],
    padding: 24,
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
  },
  title: { fontSize: 18, fontFamily: Fonts.bold, color: Colors.text, marginBottom: 12 },
  message: {
    fontSize: 14,
    fontFamily: Fonts.regular,
    color: Colors.textSub,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  button: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    backgroundColor: Colors.accent,
    width: '100%',
  },
  buttonText: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.accentFg, textAlign: 'center' },
});
