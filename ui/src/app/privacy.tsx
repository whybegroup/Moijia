import { type Href } from 'expo-router';
import { useAppRouter as useRouter } from '../hooks/useAppRouter';
import {
  LEGAL_CONTACT_EMAIL,
  TERMS_PATH,
  TERMS_URL,
} from '../constants/legal';
import {
  LegalDocumentScreen,
  LegalHeading,
  LegalLink,
  LegalP,
} from '../components/LegalDocumentScreen';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <LegalDocumentScreen title="Privacy Policy">
      <LegalP>
        This Privacy Policy explains how moijia (“moijia,” “we,” “us”) collects, uses, and
        shares information when you use the moijia apps, website, and related services (the
        “Service”).
      </LegalP>

      <LegalHeading>Information we collect</LegalHeading>
      <LegalP>
        Account information. When you sign in with Apple, Google, or email, we receive
        identifiers needed to create and authenticate your account (such as a user id, name
        if the provider shares it, and email address).
      </LegalP>
      <LegalP>
        Content you provide. This includes groups, events, polls, posts, comments, invites,
        and files you upload (photos, videos, documents, and similar media), plus related
        metadata such as timestamps and which group they belong to.
      </LegalP>
      <LegalP>
        Purchases. If you subscribe to extra storage, Apple, Google, or another storefront
        (including RevenueCat) tells us whether your account has an active entitlement and
        which plan it is. We do not receive your full payment-card number.
      </LegalP>
      <LegalP>
        Device and usage. We collect technical data needed to run the Service, such as app
        version, device type, crash or error logs, and push-notification tokens if you allow
        notifications.
      </LegalP>

      <LegalHeading>How we use information</LegalHeading>
      <LegalP>
        We use this information to operate and improve moijia: authenticate you, show your
        groups and content, apply storage limits, process subscriptions, send notifications
        you opt into, keep the Service secure, and comply with law. We do not sell your
        personal information.
      </LegalP>

      <LegalHeading>How we share information</LegalHeading>
      <LegalP>
        Other members. Content you post in a group is visible to members of that group, and
        invite or share links you create may be opened by anyone who has the link.
      </LegalP>
      <LegalP>
        Service providers. We use vendors that process data on our behalf, including Google
        Firebase (authentication), Amazon Web Services (file storage), RevenueCat (in-app
        purchases), and Apple or Google (sign-in and store billing). They may process data
        only as needed to provide those services.
      </LegalP>
      <LegalP>
        Legal. We may disclose information if we believe it is required by law, to protect
        moijia or our users, or in connection with a merger, sale, or similar transaction.
      </LegalP>

      <LegalHeading>Retention</LegalHeading>
      <LegalP>
        We keep account and group data while your account is active. Uploaded files remain
        until you, a group admin, or we delete them, or until a group is removed. We may
        keep limited records (for example billing or security logs) as required by law or
        to resolve disputes.
      </LegalP>

      <LegalHeading>Your choices</LegalHeading>
      <LegalP>
        You can update profile information in the app, leave groups, delete content you
        posted where the product allows it, and turn off push notifications in device
        settings. You can cancel a storage subscription in your Apple, Google, or web
        customer-portal settings. To request access or deletion of your account data, email{' '}
        {LEGAL_CONTACT_EMAIL}.
      </LegalP>

      <LegalHeading>Children</LegalHeading>
      <LegalP>
        The Service is not directed to children under 13, and we do not knowingly collect
        personal information from them. If you believe we have, contact us and we will
        delete it.
      </LegalP>

      <LegalHeading>Security and international processing</LegalHeading>
      <LegalP>
        We use reasonable administrative and technical measures to protect information, but
        no system is completely secure. Your information may be processed in the United
        States or other countries where we or our providers operate.
      </LegalP>

      <LegalHeading>Changes</LegalHeading>
      <LegalP>
        We may update this policy. The “Effective” date at the top will change when we do.
        Continued use of the Service after an update means you accept the revised policy.
      </LegalP>

      <LegalHeading>Contact</LegalHeading>
      <LegalP>
        Privacy questions: {LEGAL_CONTACT_EMAIL}. Our Terms of Service are at{' '}
        <LegalLink onPress={() => router.push(TERMS_PATH as Href)}>
          {TERMS_URL}
        </LegalLink>
        .
      </LegalP>
    </LegalDocumentScreen>
  );
}
