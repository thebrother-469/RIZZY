import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, H2, P, UL } from "@/components/LegalLayout";

export const Route = createFileRoute("/refund-policy")({
  head: () => ({
    meta: [
      { title: "Refund Policy — RizzGod AI" },
      {
        name: "description",
        content:
          "Refund and cancellation policy for RizzGod AI subscriptions, processed by Lemon Squeezy as Merchant of Record.",
      },
      { property: "og:title", content: "Refund Policy — RizzGod AI" },
      { property: "og:description", content: "Refund and cancellation terms for RizzGod AI." },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/refund-policy" },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: "Refund Policy — RizzGod AI" },
      { name: "twitter:description", content: "Refund and cancellation terms for RizzGod AI." },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/refund-policy" }],
  }),
  component: Refund,
});

function Refund() {
  return (
    <LegalLayout title="Refund Policy" updated="July 3, 2026">
      <P>
        This Refund Policy applies to all paid subscriptions to RizzGod AI. Payments are processed
        by Lemon Squeezy (operated by Lemon Squeezy, LLC, "Lemon Squeezy"), which acts as the
        Merchant of Record for all transactions.
      </P>

      <H2>1. Monthly Subscriptions</H2>
      <P>
        Monthly subscriptions are billed in advance for the upcoming 30-day period. You may cancel
        at any time; cancellation takes effect at the end of the current billing period, and no
        partial refunds are issued for unused days once a billing period has begun, except where
        required by law.
      </P>

      <H2>2. Annual Subscriptions</H2>
      <P>
        Annual subscriptions may be refunded on a pro-rata basis within fourteen (14) days of the
        initial purchase or renewal date if you have not made substantial use of paid features
        during that period. After 14 days, annual subscriptions are non-refundable except where
        required by law.
      </P>

      <H2>3. Cancellation Process</H2>
      <P>
        You can cancel your subscription at any time from your account Settings, or by contacting
        thebrotherhood469@gmail.com. You retain access to paid features until the end of the paid
        period.
      </P>

      <H2>4. Renewal Policy</H2>
      <P>
        All subscriptions renew automatically at the end of each billing period at the then-current
        price until cancelled. Lemon Squeezy will notify you before annual renewals as required by
        applicable law.
      </P>

      <H2>5. Refund Eligibility</H2>
      <P>Refunds may be granted in the following cases:</P>
      <UL>
        <li>Duplicate payments caused by a technical error.</li>
        <li>Billing errors or incorrect charges.</li>
        <li>Failure of the Service to function as described for reasons attributable to us.</li>
        <li>
          Statutory rights under consumer protection laws in your jurisdiction (e.g. EU right of
          withdrawal, where applicable).
        </li>
      </UL>
      <P>Refunds are generally not granted for:</P>
      <UL>
        <li>Change of mind after substantial use of the Service.</li>
        <li>
          Dissatisfaction with AI-generated content quality, subjective coaching outcomes, or dating
          results.
        </li>
        <li>Failure to cancel before automatic renewal.</li>
        <li>Accounts terminated for violation of our Terms of Service or Acceptable Use Policy.</li>
      </UL>

      <H2>6. Duplicate Payments and Billing Errors</H2>
      <P>
        If you notice a duplicate charge or a billing error, contact thebrotherhood469@gmail.com
        within 60 days of the charge. Verified duplicates and errors will be refunded to the
        original payment method.
      </P>

      <H2>7. Lemon Squeezy as Merchant of Record</H2>
      <P>
        Because Lemon Squeezy is the Merchant of Record, refunds are issued by Lemon Squeezy on our
        instruction. Refunds are returned to the original payment method and typically appear within
        5–10 business days, depending on your bank or card issuer.
      </P>

      <H2>8. Support Process</H2>
      <P>
        To request a refund, email thebrotherhood469@gmail.com with your account email, order or
        receipt ID, and the reason for the request. We aim to respond within 2 business days. If the
        request is approved, we will instruct Lemon Squeezy to process the refund promptly.
      </P>

      <H2>9. Contact</H2>
      <P>
        Refund and billing questions: thebrotherhood469@gmail.com
        <br />
        RizzGod AI, [MY CURRENT BUSINESS ADDRESS IN BOTSWANA].
      </P>
    </LegalLayout>
  );
}
