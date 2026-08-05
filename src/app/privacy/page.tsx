import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy | Sundae",
  description: "How Sundae collects, uses, and protects your data.",
};

export default function PrivacyPolicy() {
  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="w-full max-w-3xl px-6 py-16 sm:px-10">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Privacy Policy
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Effective date: August 5, 2026
        </p>

        <div className="mt-10 space-y-10 text-zinc-700 dark:text-zinc-300">
          <section className="space-y-3">
            <p>
              Sundae (&quot;Sundae,&quot; &quot;we,&quot; &quot;us,&quot; or
              &quot;our&quot;) is a sole proprietorship that operates the
              Sundae web application (the &quot;Service&quot;), an
              AI-guided weekly planning tool that helps you set priorities
              and turns them into calendar blocks on your behalf. This
              Privacy Policy explains what information we collect, how we
              use it, and the choices you have.
            </p>
            <p>
              By using the Service, you agree to the collection and use of
              information in accordance with this policy. If you don&apos;t
              agree, please don&apos;t use the Service.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              1. Information We Collect
            </h2>
            <h3 className="text-base font-medium text-black dark:text-zinc-50">
              Account information
            </h3>
            <p>
              When you sign in with Google, we receive your name, email
              address, and profile picture as provided by Google.
            </p>
            <h3 className="text-base font-medium text-black dark:text-zinc-50">
              Google Calendar data
            </h3>
            <p>
              With your permission, Sundae connects to your Google Calendar
              to (a) read your existing events so it can propose realistic
              time blocks, and (b) create or update events on your primary
              calendar — but only after you&apos;ve reviewed and confirmed
              the proposed change. Sundae never writes to your calendar
              without an explicit confirmation step from you.
            </p>
            <h3 className="text-base font-medium text-black dark:text-zinc-50">
              Planning content you provide
            </h3>
            <p>
              This includes the roles you define (e.g. &quot;founder,&quot;
              &quot;parent,&quot; &quot;athlete&quot;), your goals, your
              answers during guided weekly sessions, and your responses to
              daily follow-up check-ins.
            </p>
            <h3 className="text-base font-medium text-black dark:text-zinc-50">
              Payment information
            </h3>
            <p>
              Subscription payments are processed by Stripe. Sundae does
              not receive or store your full card number — Stripe handles
              that directly and shares with us only what&apos;s needed to
              manage your subscription (e.g. plan status, trial dates).
            </p>
            <h3 className="text-base font-medium text-black dark:text-zinc-50">
              Usage and log data
            </h3>
            <p>
              Like most web services, our hosting and infrastructure
              providers automatically log standard technical data (IP
              address, browser type, pages visited, timestamps) for
              security and reliability purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              2. How We Use Information
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>To run your guided weekly planning sessions</li>
              <li>
                To propose and, once you confirm, create calendar events
              </li>
              <li>
                To send you daily brief and follow-up emails about your
                plan
              </li>
              <li>To process your subscription and free trial via Stripe</li>
              <li>To maintain, secure, and improve the Service</li>
              <li>To respond to support requests</li>
            </ul>
            <p>We do not sell your personal information.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              3. Google User Data &amp; Limited Use
            </h2>
            <p>
              Sundae&apos;s use and transfer to any other app of information
              received from Google APIs will adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                className="font-medium text-zinc-950 underline dark:text-zinc-50"
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. Your Google
              Calendar data is used solely to provide and improve the
              calendar-planning features of the Service described above —
              it is never used for advertising, and it is never sold or
              shared with third parties for their own purposes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              4. Third-Party Services
            </h2>
            <p>
              We rely on a small number of trusted providers to run
              Sundae, each of which processes data on our behalf under
              their own security and privacy commitments:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium">Google</span> — sign-in and
                Calendar API access
              </li>
              <li>
                <span className="font-medium">Supabase</span> — database
                hosting and authentication
              </li>
              <li>
                <span className="font-medium">Vercel</span> — application
                hosting
              </li>
              <li>
                <span className="font-medium">Stripe</span> — subscription
                billing and payment processing
              </li>
              <li>
                <span className="font-medium">
                  Our transactional email provider
                </span>{" "}
                — delivering your daily brief and follow-up emails
              </li>
            </ul>
            <p>
              As Sundae adds features (for example, SMS notifications),
              this list and this policy will be updated accordingly before
              those features launch.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              5. Data Retention
            </h2>
            <p>
              We retain your account and planning data for as long as your
              account is active. If you delete your account, we delete
              your personal data within 30 days, except where we&apos;re
              required to retain records (for example, payment records) to
              comply with law.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              6. Your Rights &amp; Choices
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium">Revoke calendar access</span>{" "}
                at any time from your{" "}
                <a
                  href="https://myaccount.google.com/permissions"
                  className="font-medium text-zinc-950 underline dark:text-zinc-50"
                >
                  Google Account permissions
                </a>{" "}
                page.
              </li>
              <li>
                <span className="font-medium">Delete your account</span>{" "}
                and associated data from your account settings or by
                emailing us.
              </li>
              <li>
                <span className="font-medium">Opt out</span> of
                non-essential emails via the unsubscribe link in any email
                we send.
              </li>
              <li>
                <span className="font-medium">
                  Request a copy or correction
                </span>{" "}
                of your data by contacting us.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              7. Data Security
            </h2>
            <p>
              We use industry-standard safeguards — including encryption
              in transit, row-level security on our database, and
              access-controlled infrastructure — to protect your data. No
              method of transmission or storage is 100% secure, but we
              work to protect your information to a high standard.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              8. Children&apos;s Privacy
            </h2>
            <p>
              The Service is not directed to, and we do not knowingly
              collect personal information from, anyone under 18. If you
              believe a child has provided us personal information, please
              contact us and we will delete it.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              9. Changes to This Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. If we
              make material changes, we&apos;ll notify you by email or
              through the Service before the changes take effect.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-black dark:text-zinc-50">
              10. Contact Us
            </h2>
            <p>
              Questions about this policy or your data? Reach us at{" "}
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
