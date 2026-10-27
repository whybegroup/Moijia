import { type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import {
  LEGAL_CONTACT_EMAIL,
  PRIVACY_PATH,
  PRIVACY_URL,
} from '../constants/legal';
import {
  LegalDocumentScreen,
  LegalHeading,
  LegalLink,
  LegalP,
} from '../components/LegalDocumentScreen';

export function TermsOfServiceContent({ onOpenPrivacy }: { onOpenPrivacy: () => void }) {
  return (
    <>
      <LegalP>
        These Terms of Service (“Terms”) are an agreement between you and moijia (“moijia,”
        “we,” “us”) for use of the moijia apps, website, and related services (the “Service”).
        By creating an account or using the Service, you agree to these Terms.
      </LegalP>

      <LegalHeading>The Service</LegalHeading>
      <LegalP>
        moijia is a group workspace for events, polls, posts, comments, and shared media
        storage. Features may change as we improve the product.
      </LegalP>

      <LegalHeading>Accounts</LegalHeading>
      <LegalP>
        You may sign in with Apple, Google, or email. You must provide accurate information
        and keep your account secure. You are responsible for activity under your account.
        We may suspend or close accounts that violate these Terms or that we reasonably
        believe are abusive, fraudulent, or unlawful.
      </LegalP>

      <LegalHeading>Groups and content</LegalHeading>
      <LegalP>
        You retain ownership of content you post (text, photos, videos, files, and similar
        material). You grant moijia a limited license to host, store, display, and transmit
        that content so we can operate the Service, including sharing it with other members
        of groups you join or create.
      </LegalP>
      <LegalP>
        Do not post content you do not have the right to share, or that is illegal,
        harassing, or infringes someone else’s rights. Group owners and admins may remove
        members or content from their groups. We may remove content or restrict access when
        required by law or to protect the Service and other users.
      </LegalP>

      <LegalHeading>Storage</LegalHeading>
      <LegalP>
        Free accounts can create up to 2 Small groups (1 GB each). Pro is $19.99 per month
        and includes up to 10 Medium groups (10 GB each). Enterprise group counts and sizes
        are arranged with us. Storage is a digital service: unused space has no cash value,
        and we may refuse or remove files that exceed a group’s cap or that violate these Terms.
      </LegalP>

      <LegalHeading>Subscriptions and billing</LegalHeading>
      <LegalP>
        Pro is an auto-renewing monthly subscription through the Apple App Store, Google Play,
        or other storefronts we enable (including via RevenueCat). The price is shown in the
        store and on the paywall before you purchase. Enterprise is not sold in the app.
      </LegalP>
      <LegalP>
        Payment is charged to your Apple, Google, or other store account at confirmation of
        purchase. The subscription renews each month unless you cancel at least 24 hours
        before the end of the current period. After purchase, you manage or cancel in your
        device’s store account settings (or the customer portal, for web purchases).
        Deleting the app does not cancel a subscription.
      </LegalP>
      <LegalP>
        Refunds, billing disputes, and free-trial conversions (if offered) are handled by
        the store that charged you, under that store’s rules and applicable law. We do not
        set Apple or Google refund policy.
      </LegalP>

      <LegalHeading>Acceptable use</LegalHeading>
      <LegalP>
        You may not misuse the Service, including by attempting to break into accounts or
        systems, scraping at a scale that harms the Service, uploading malware, or using
        moijia to send spam. We may rate-limit or block traffic that threatens the Service.
      </LegalP>

      <LegalHeading>Intellectual property</LegalHeading>
      <LegalP>
        The Service, including the moijia name, design, and software, is owned by us or our
        licensors. These Terms do not give you a right to copy or resell the Service.
      </LegalP>

      <LegalHeading>Disclaimer</LegalHeading>
      <LegalP>
        The Service is provided “as is.” We do not warrant that it will be uninterrupted,
        error-free, or that files will never be lost. To the fullest extent allowed by law,
        we disclaim implied warranties of merchantability, fitness for a particular purpose,
        and non-infringement.
      </LegalP>

      <LegalHeading>Limitation of liability</LegalHeading>
      <LegalP>
        To the fullest extent allowed by law, moijia is not liable for indirect, incidental,
        special, consequential, or punitive damages, or for lost data, profits, or goodwill.
        Our total liability for any claim relating to the Service is limited to the greater
        of (a) the amounts you paid us for the Service in the 12 months before the claim or
        (b) twenty U.S. dollars. Some places do not allow these limits, so they may not
        apply to you.
      </LegalP>

      <LegalHeading>Changes</LegalHeading>
      <LegalP>
        We may update these Terms. The “Effective” date at the top will change when we do.
        Continued use after an update means you accept the new Terms. If you do not agree,
        stop using the Service and cancel any subscription in your store settings.
      </LegalP>

      <LegalHeading>Contact</LegalHeading>
      <LegalP>
        Questions about these Terms: {LEGAL_CONTACT_EMAIL}. Our Privacy Policy is at{' '}
        <LegalLink onPress={onOpenPrivacy}>{PRIVACY_URL}</LegalLink>
        .
      </LegalP>
    </>
  );
}

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <LegalDocumentScreen title="Terms of Service">
      <TermsOfServiceContent onOpenPrivacy={() => router.push(PRIVACY_PATH as Href)} />
    </LegalDocumentScreen>
  );
}
