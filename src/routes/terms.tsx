import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout, H2, P, UL } from "@/components/LegalLayout";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — RizzGod AI" },
      {
        name: "description",
        content:
          "The Terms of Service governing your use of RizzGod AI — accounts, subscriptions, acceptable use, and liability.",
      },
      { property: "og:title", content: "Terms of Service — RizzGod AI" },
      { property: "og:description", content: "Terms governing your use of RizzGod AI." },
      { property: "og:url", content: "https://rizzgod-ai.vercel.app/terms" },
      { property: "og:type", content: "article" },
      { name: "twitter:title", content: "Terms of Service — RizzGod AI" },
      { name: "twitter:description", content: "Terms governing your use of RizzGod AI." },
    ],
    links: [{ rel: "canonical", href: "https://rizzgod-ai.vercel.app/terms" }],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalLayout title="Terms of Service" updated="July 3, 2026">
      <H2>1. Service Overview</H2>
      <P>
        RizzGod AI ("RizzGod AI", "we", "us", or "our") provides an AI-powered dating and confidence
        coaching platform, including AI chat, roleplay scenarios, message and photo reviews,
        missions, and related features (the "Service"). By accessing or using the Service, you agree
        to be bound by these Terms of Service ("Terms"). If you do not agree, do not use the
        Service.
      </P>

      <H2>2. Eligibility</H2>
      <P>
        You must be at least 18 years old (or the age of majority in your jurisdiction, whichever is
        higher) to use the Service. By using RizzGod AI, you represent and warrant that you meet
        this requirement and have the legal capacity to enter into these Terms.
      </P>

      <H2>3. User Accounts</H2>
      <P>
        You are responsible for maintaining the confidentiality of your account credentials and for
        all activity that occurs under your account. You agree to provide accurate and complete
        registration information and to keep it current. Notify us immediately at
        thebrotherhood469@gmail.com of any unauthorized use of your account.
      </P>

      <H2>4. Acceptable Use Policy</H2>
      <P>You agree not to:</P>
      <UL>
        <li>Use the Service to harass, threaten, stalk, or harm any person.</li>
        <li>
          Upload content depicting minors, non-consensual intimate imagery, or unlawful material.
        </li>
        <li>Attempt to reverse engineer, scrape, or resell the Service or its outputs.</li>
        <li>Impersonate any person or misrepresent your affiliation with any entity.</li>
        <li>
          Use the Service for spam, mass messaging, catfishing, romance scams, or deceptive
          practices.
        </li>
        <li>
          Interfere with the integrity or performance of the Service or attempt to bypass rate
          limits, entitlements, or security controls.
        </li>
      </UL>
      <P>We may suspend or terminate access for any violation.</P>

      <H2>5. AI-Generated Content Disclaimer</H2>
      <P>
        The Service generates content using large language models. Outputs are for entertainment and
        informational purposes only, may be inaccurate, offensive, or inappropriate, and do not
        constitute professional, legal, medical, psychological, or relationship advice. You are
        solely responsible for how you use AI-generated content, including any messages you send to
        third parties.
      </P>

      <H2>6. User Responsibilities and Submitted Content</H2>
      <P>
        You retain ownership of content you submit (screenshots, photos, messages). By submitting
        content, you grant us a worldwide, non-exclusive, royalty-free license to host, process, and
        use that content to operate, improve, and secure the Service. You represent that you have
        all necessary rights and consents to submit any content, including any depicting third
        parties.
      </P>

      <H2>7. Intellectual Property</H2>
      <P>
        The Service, including its software, design, branding, prompts, and coach personas, is owned
        by RizzGod AI and protected by intellectual property laws. Except for the limited rights
        expressly granted, no rights are transferred to you.
      </P>

      <H2>8. Subscriptions, Billing, and Auto-Renewal</H2>
      <P>
        Paid plans (Pro, Elite) are billed in advance on a recurring basis (monthly or annual)
        through our payment processor, Lemon Squeezy (operated by Lemon Squeezy, LLC, "Lemon
        Squeezy"), which acts as the Merchant of Record. By subscribing, you authorize Lemon Squeezy
        to charge your payment method on each renewal date at the then-current price until you
        cancel. Prices exclude applicable taxes, which Lemon Squeezy may collect.
      </P>

      <H2>9. Cancellation</H2>
      <P>
        You may cancel your subscription at any time from your account settings or by contacting
        thebrotherhood469@gmail.com. Cancellation takes effect at the end of the current billing
        period; you retain access to paid features until then. See our{" "}
        <a href="/refund-policy" className="text-gold underline">
          Refund Policy
        </a>{" "}
        for refund terms.
      </P>

      <H2>10. Account Suspension and Termination</H2>
      <P>
        We may suspend or terminate your account, with or without notice, for violation of these
        Terms, suspected fraud, non-payment, or any conduct we deem harmful to the Service or other
        users. Upon termination, your right to use the Service ceases immediately.
      </P>

      <H2>11. Disclaimer of Warranties</H2>
      <P>
        THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS
        OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
        NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR
        THAT AI OUTPUTS WILL BE ACCURATE OR SUITABLE.
      </P>

      <H2>12. Limitation of Liability</H2>
      <P>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, RIZZGOD AI SHALL NOT BE LIABLE FOR ANY INDIRECT,
        INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, DATA, OR
        RELATIONSHIPS, ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. OUR AGGREGATE LIABILITY
        SHALL NOT EXCEED THE AMOUNTS YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR
        USD $100, WHICHEVER IS GREATER.
      </P>

      <H2>13. Indemnification</H2>
      <P>
        You agree to indemnify and hold harmless RizzGod AI and its affiliates from any claim,
        damage, or expense arising from your use of the Service, your content, or your violation of
        these Terms or any third-party right.
      </P>

      <H2>14. Changes to the Service and Terms</H2>
      <P>
        We may modify the Service or these Terms at any time. Material changes will be communicated
        via the Service or email. Continued use after changes take effect constitutes acceptance.
      </P>

      <H2>15. Governing Law</H2>
      <P>
        These Terms are governed by the laws of Botswana, without regard to conflict-of-laws
        principles. You agree to the exclusive jurisdiction of the courts located in Botswana for
        any dispute arising out of or relating to these Terms.
      </P>

      <H2>16. Contact</H2>
      <P>
        Questions about these Terms: thebrotherhood469@gmail.com
        <br />
        RizzGod AI, [MY CURRENT BUSINESS ADDRESS IN BOTSWANA].
      </P>
    </LegalLayout>
  );
}
