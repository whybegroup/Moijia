import { Modal, Platform, StyleSheet, View } from 'react-native';
import { PrivacyPolicyContent } from '../app/privacy';
import { TermsOfServiceContent } from '../app/terms';
import { WEB_APP_MAX_WIDTH } from '../constants/webAppMaxWidth';
import { Colors } from '../constants/theme';
import { edgeToEdgeModalProps } from './edgeToEdgeModalProps';
import { LegalDocumentScreen } from './LegalDocumentScreen';

export type LegalDocumentId = 'terms' | 'privacy';

export function LegalDocumentModal({
  document,
  onClose,
  onChange,
}: {
  document: LegalDocumentId | null;
  onClose: () => void;
  onChange: (document: LegalDocumentId) => void;
}) {
  const title = document === 'privacy' ? 'Privacy Policy' : 'Terms of Service';

  return (
    <Modal
      visible={document != null}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
      {...edgeToEdgeModalProps}
    >
      <View style={styles.frame}>
        <View style={styles.page}>
          <LegalDocumentScreen title={title} onClose={onClose}>
            {document === 'privacy' ? (
              <PrivacyPolicyContent onOpenTerms={() => onChange('terms')} />
            ) : (
              <TermsOfServiceContent onOpenPrivacy={() => onChange('privacy')} />
            )}
          </LegalDocumentScreen>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#E4E4E7' : Colors.bg,
  },
  page: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    maxWidth: Platform.OS === 'web' ? WEB_APP_MAX_WIDTH : undefined,
    alignSelf: 'center',
    backgroundColor: Colors.bg,
  },
});
