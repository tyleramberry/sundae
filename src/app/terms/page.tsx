import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service | Sundae",
  description: "The terms that govern your use of Sundae.",
};

export default function TermsOfService() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-3xl px-6 py-16 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Terms of Service
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Effective date: August 5, 2026
        </p>

        <div className="mt-10 space-y-10 text-zinc-700 dark:text-zinc-300">
          <section className="space-y-3">
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your access
              to and use of Sundae (&quot;Sundae,&quot; &quot;we,&quot;
              &quot;us,&quot; or &quot;our&quot;), an AI-guided weekly
              planning application operated as a sole proprietorship under
              the legal name Sundae. By creating an account or using the
              Service, you agree to these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              1. Description of the Service
            </h2>
            <p>
              Sundae helps you run a guided weekly planning session — you
              define your roles and priorities, Sundae asks a few
              questions per role, surfaces your top priorities for the
              week, and proposes calendar blocks. Sundae only creates or
              modifies events on your Google Calendar after you review and
              confirm the proposal. Sundae also sends you daily brief and
              follow-up emails summarizing your plan.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              2. Eligibility &amp; Accounts
            </h2>
            <p>
              You must be at least 18 years old to use Sundae. You sign in
              using your Google account, and you&apos;re responsible for
              maintaining the security of that account and for all
              activity that occurs under it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              3. Free Trial &amp; Billing
            </h2>
            <p>
              Sundae is offered on a subscription basis through Stripe
              Checkout, with a 7-day free trial. Your payment card is
              collected at signup, and if you don&apos;t cancel before the
              trial ends, your subscription begins automatically and your
              card is charged. You can cancel at any time from your
              account settings; cancellation takes effect at the end of
              your current billing period, and you won&apos;t be charged
              again after that.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              4. Calendar Access &amp; the Confirm-First Model
            </h2>
            <p>
              When you connect Google Calendar, you grant Sundae
              permission to read your events and to propose new ones.
              Sundae will never create, modify, or delete a calendar event
              without you explicitly confirming that specific change
              first. You can revoke calendar access at any time from your
              Google Account permissions, though doing so will limit
              Sundae&apos;s core functionality.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              5. Acceptable Use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Use the Service for any unlawful purpose or in violation of
                any applicable law
              </li>
              <li>
                Attempt to gain unauthorized access to Sundae&apos;s
                systems or another user&apos;s account or data
              </li>
              <li>
                Reverse engineer, scrape, or interfere with the normal
                operation of the Service
              </li>
              <li>
                Use the Service to send spam or unsolicited communications
                through any connected account
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              6. Your Content
            </h2>
            <p>
              You retain ownership of the planning content you provide
              (your roles, goals, and responses). You grant Sundae a
              limited license to use that content solely to operate and
              improve the Service for you — for example, remembering your
              stated roles and last week&apos;s goals so future sessions
              can build on them.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              7. Intellectual Property
            </h2>
            <p>
              Sundae and its original content, features, and functionality
              are owned by Sundae and are protected by applicable
              intellectual property laws. These Terms don&apos;t grant you
              any rights to Sundae&apos;s trademarks or branding.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              8. Third-Party Services
            </h2>
            <p>
              Sundae depends on third-party services — including Google
              Calendar, Stripe, Supabase, and Vercel — to function. We
              aren&apos;t responsible for outages, changes, or issues
              originating from those third-party services that are outside
              our control.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              9. Disclaimer of Warranties
            </h2>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as
              available,&quot; without warranties of any kind, express or
              implied. We don&apos;t guarantee that the Service will be
              uninterrupted, error-free, or that scheduling suggestions
              will always be accurate or conflict-free — you&apos;re
              responsible for reviewing proposed calendar changes before
              confirming them.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              10. Limitation of Liability
            </h2>
            <p>
              To the fullest extent permitted by law, Sundae will not be
              liable for any indirect, incidental, special, or
              consequential damages arising from your use of the Service.
              Sundae&apos;s total liability for any claim relating to the
              Service is limited to the amount you paid us in the 3 months
              before the claim arose.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              11. Termination
            </h2>
            <p>
              You may stop using the Service and cancel your subscription
              at any time. We may suspend or terminate your access if you
              violate these Terms. Upon termination, your right to use the
              Service ends immediately; provisions that by their nature
              should survive (such as limitation of liability) will
              continue to apply.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              12. Governing Law
            </h2>
            <p>
              These Terms are governed by the laws of the State of Utah,
              without regard to its conflict of law principles.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              13. Changes to These Terms
            </h2>
            <p>
              We may update these Terms from time to time. If we make
              material changes, we&apos;ll notify you by email or through
              the Service before the changes take effect. Continued use of
              the Service after changes take effect constitutes acceptance
              of the updated Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              14. Contact Us
            </h2>
            <p>
              Questions about these Terms? Reach us at{" "}
              <a
                href="mailto:tyleramberry@gmail.com"
                className="font-medium text-zinc-950 underline dark:text-zinc-50"
              >
                tyleramberry@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
