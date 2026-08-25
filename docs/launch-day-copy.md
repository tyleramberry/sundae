# Launch-day copy

CTA for every piece: **https://sundaeplanner.com**  
Offer: **Try it free for 7 days, cancel anytime.** After the trial, **$7.99/month**.

---

## LinkedIn

Sundae is live.

You already know the roles you play — founder, parent, athlete, whatever the week actually asks of you. Sundae turns those roles into a real week on your Google Calendar. One guided session. Nothing gets scheduled until you confirm it.

Try it free for 7 days, cancel anytime. After that it's $7.99/month.

https://sundaeplanner.com

---

## X / Twitter

Sundae is live — AI-guided weekly planning that lands on your real Google Calendar.

One session a week. You confirm before anything is written.

Try it free for 7 days, cancel anytime. Then $7.99/month.

https://sundaeplanner.com

---

## Waitlist email

**Subject:** Sundae is live — try it free for 7 days

Hi,

Sundae is open.

Define the roles you actually wear, plan the week against them, and confirm the blocks onto Google Calendar. Daily follow-up keeps the scorecard honest.

Try it free for 7 days, cancel anytime. After the trial it's $7.99/month.

Get started: https://sundaeplanner.com

— Sundae

---

## Landing review (no rewrite)

`MONTHLY_PRICE` in `src/app/page.tsx` is `"$7.99"`. Hero, closing CTA, and FAQ interpolate that string:

- Hero: “7-day free trial, then $7.99/month.”
- FAQ “Do I need a credit card to start?”: first charge is **$7.99/month**.

Onboarding no longer dates the first charge from account `created_at`. It now says the card isn’t charged until **7 days after you start your trial**, which stays true before Stripe Checkout.
