import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, H2, P, UL } from "@/components/LegalLayout";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — RizzGod AI" },
      {
        name: "description",
        content:
          "How RizzGod AI collects, uses, stores, and protects your personal information, uploads, and AI conversations.",
      },
      { property: "og:title", content: "Privacy Policy — RizzGod AI" },
      { property: "og:description", content: "How RizzGod AI handles your data." },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/privacy" },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: "Privacy Policy — RizzGod AI" },
      { name: "twitter:description", content: "How RizzGod AI handles your data." },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/privacy" }],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="July 3, 2026">
      <P>
        This Privacy Policy explains how RizzGod AI ("we", "us") collects, uses, and shares
        information when you use our Service. By using RizzGod AI, you agree to this Policy.
      </P>

      <H2>1. Information We Collect</H2>
      <UL>
        <li>
          <strong>Account Information:</strong> email address, display name, password hash, and
          profile preferences set during onboarding.
        </li>
        <li>
          <strong>Authentication Data:</strong> session tokens and OAuth identifiers managed via our
          authentication provider.
        </li>
        <li>
          <strong>Uploaded Files & Images:</strong> screenshots, photos, and other media you upload
          for AI review (e.g. DM roasts, style checks).
        </li>
        <li>
          <strong>Conversations:</strong> the messages you send to and receive from AI coaches,
          including roleplay sessions.
        </li>
        <li>
          <strong>AI Memory:</strong> long-term memory entries the system extracts from your
          conversations to personalize responses. You can view and delete these at any time in
          Memory settings.
        </li>
        <li>
          <strong>Usage & Progress Data:</strong> XP, levels, badges, streaks, mission completions,
          entitlement usage.
        </li>
        <li>
          <strong>Device & Log Information:</strong> IP address, browser type, operating system,
          referrer, and event timestamps.
        </li>
        <li>
          <strong>Cookies & Analytics:</strong> essential cookies for authentication and session
          management, and analytics cookies to measure usage.
        </li>
        <li>
          <strong>Payment Information:</strong> handled by Lemon Squeezy (see Section 4). We do not
          store full payment card details.
        </li>
      </UL>

      <H2>2. How We Use Information</H2>
      <UL>
        <li>
          Provide, personalize, and improve the Service, including AI coaching and memory-driven
          responses.
        </li>
        <li>Authenticate you and secure your account.</li>
        <li>Enforce entitlements, rate limits, and acceptable-use rules.</li>
        <li>Process subscription payments and prevent fraud.</li>
        <li>Send transactional emails (account, billing, security).</li>
        <li>Analyze usage in aggregate to improve product performance.</li>
        <li>Comply with legal obligations.</li>
      </UL>

      <H2>3. Legal Bases (GDPR)</H2>
      <P>
        If you are in the European Economic Area or United Kingdom, we process your data on the
        following bases: performance of a contract (providing the Service), legitimate interests
        (security, product improvement), consent (optional analytics, marketing), and legal
        obligation.
      </P>

      <H2>4. Payment Processing — Lemon Squeezy</H2>
      <P>
        Subscription payments are processed by Lemon Squeezy, LLC, which acts as the Merchant of
        Record and independent data controller for billing data. Lemon Squeezy collects your name,
        billing address, tax identifiers, and payment card details directly and handles fraud
        prevention, tax collection, and refunds. Their privacy policy is available at{" "}
        <a href="https://www.lemonsqueezy.com/privacy" className="text-gold underline">
          lemonsqueezy.com/privacy
        </a>
        .
      </P>

      <H2>5. Third-Party Services</H2>
      <UL>
        <li>
          <strong>Cloud infrastructure & database:</strong> hosts our application, database,
          storage, and edge functions.
        </li>
        <li>
          <strong>AI model providers:</strong> your prompts and uploads may be sent to third-party
          AI providers to generate responses. Providers process this data under their own terms and
          do not train foundation models on your data by default.
        </li>
        <li>
          <strong>Analytics providers:</strong> aggregate usage measurement.
        </li>
        <li>
          <strong>Email delivery:</strong> transactional email provider.
        </li>
      </UL>

      <H2>6. Data Retention</H2>
      <UL>
        <li>
          Account data: retained while your account is active and up to 12 months after deletion
          request for legal/audit purposes.
        </li>
        <li>Conversations & memory: retained until you delete them or delete your account.</li>
        <li>Uploaded images: retained until you delete them or delete your account.</li>
        <li>
          Billing records: retained as required by tax and accounting law (typically 7 years).
        </li>
        <li>Logs: typically 30–90 days.</li>
      </UL>

      <H2>7. Your Rights</H2>
      <P>
        Depending on your jurisdiction, you may have the right to access, correct, export, delete,
        restrict, or object to processing of your personal data, and to withdraw consent. You can
        exercise most of these directly in Settings (delete conversations, memory, or account). For
        other requests, contact thebrotherhood469@gmail.com. You also have the right to lodge a
        complaint with your local supervisory authority.
      </P>

      <H2>8. Security</H2>
      <P>
        We use industry-standard measures including TLS in transit, encryption at rest for stored
        files, hashed passwords, row-level security in our database, scoped access tokens, and
        least-privilege service roles. No system is 100% secure; you use the Service at your own
        risk.
      </P>

      <H2>9. Children</H2>
      <P>
        The Service is not intended for anyone under 18. We do not knowingly collect data from
        children. If you believe a child has provided us data, contact thebrotherhood469@gmail.com.
      </P>

      <H2>10. International Transfers</H2>
      <P>
        Your data may be processed in countries other than your own. Where required, we use
        appropriate safeguards such as Standard Contractual Clauses.
      </P>

      <H2>11. Changes to This Policy</H2>
      <P>
        We may update this Policy from time to time. Material changes will be communicated via the
        Service or email.
      </P>

      <H2>12. Contact</H2>
      <P>
        Privacy inquiries: thebrotherhood469@gmail.com
        <br />
        RizzGod AI, [MY CURRENT BUSINESS ADDRESS IN BOTSWANA].
      </P>
    </LegalLayout>
  );
}
