# Sundae — 30-Day Launch Calendar (Aug 1 – Sep 1, 2026)

Goal: 50 paying free-trial users by September 1 — counted once a user has started the card-backed 7-day trial, completed onboarding, and completed their first guided weekly planning session.

Day numbering starts Aug 1 (Day 1); today is Day 3 (Aug 3).

**Operating principle:** Every Sunday is a full rest day — no development, content, or ad-ops work. Tasks originally scheduled on Sundays have been redistributed across other days that week (noted inline as "moved from original Sunday plan" so nothing is lost, just relocated).

---

## WEEK 1: Foundation (Aug 1–7)

### Day 1 — Sat 8/1 — Idea capture & competitive scan
**Development**
- Write a raw brain-dump doc of the concept (no editing, just get it all down)
- List 3-5 direct competitors (Motion, Reclaim, Sunsama, Akiflow, Clockwise) and note what each does well/poorly
- Identify your one differentiator in a single sentence
- Set up a Google Form waitlist mechanism: email + "what's your biggest planning frustration?" *(moved from original Sunday plan, Day 2)*
- *Outcome:* A doc with the concept in your own words + a competitor table you can reference all month, plus a live waitlist link ready to share

**Content**
- LinkedIn + X: "Kicking off a 30-day challenge: build an AI agentic weekly planner and get my first users by Sept 1. Following along?"
- **Waitlist CTA #1**: "Want early beta access? Drop your email here: [form link]" *(moved from original Sunday plan, Day 2)*
- Film: 60-90 second phone-selfie video — why you're doing this, what "agentic not autonomous" means to you
- *Outcome:* First public commitment post live, waitlist link already collecting emails

**Meta Ads:** —

---

### Day 2 — Sun 8/2 — REST DAY
No development, content, or ad work. Full day off.

---

### Day 3 — Mon 8/3 — Lock the plan
**Development**
- Finalize name (Sundae), register domain *(this also covers the name/domain step originally on Sunday Day 2 — no need to duplicate it)*
- Write MVP spec v2
- Lock tech stack: Next.js + Supabase + Vercel
- Finalize the 30-day calendar
- *Outcome:* No more open decisions — spec, name, stack, and plan are all locked before any code is written

**Content**
- Post: "Here's the exact 30-day plan I'm holding myself to" — share a simplified graphic/summary of the roadmap
- Film: talking-head walking through the plan phases (build → test → launch → grow)
- *Outcome:* Sets public expectation for the whole month

**Meta Ads:** —

---

### Day 4 — Tue 8/4 — Infrastructure
**Development**
- Create Next.js repo, connect to Vercel for auto-deploy on push
- Set up Supabase project (DB + Auth), configure Google OAuth client in Google Cloud Console
- Set up basic CI (lint + build check on push)
- Kick off Twilio A2P 10DLC registration (background task for Phase 2 SMS — non-blocking, do it today so it's clearing in the background)
- **Draft a privacy policy + terms of service, and submit for Google OAuth verification (Calendar scope)** — approval can take 1-4+ weeks, and an unverified app either caps you at 100 manually-added test users or shows new users a "Google hasn't verified this app" warning that will hurt conversion at launch. Submit this in parallel with the OAuth integration itself, starting now.
- *Outcome:* Empty app deploys successfully end-to-end; Google login works; Twilio registration and Google OAuth verification both submitted and clearing in the background

**Content**
- Post: "Repo's live, auth is working" + one real hurdle you hit
- **Waitlist CTA #2**
- Film: whiteboard shot of name options with pros/cons *(moved from original Sunday plan, Day 2)*
- *Outcome:* Normalizes the slow, unglamorous days

**Meta Ads:** —

---

### Day 5 — Wed 8/5 — Calendar integration
**Development**
- Implement Google Calendar OAuth scope request + token storage (Supabase)
- Build read function: pull user's events for current week
- Build write function: create a test event via API
- *Outcome:* You can programmatically read and write to your own Google Calendar from the app

**Content**
- Post: "First real feature working — pulling my own calendar into the app" + short technical takeaway
- Film: screen recording showing calendar events populating in a raw JSON/debug view
- *Outcome:* First tangible proof-of-concept clip

**Meta Ads:** —

---

### Day 6 — Thu 8/6 — Onboarding flow design + engine architecture
**Development**
- Draft the full onboarding question tree on paper/Figma: roles → per-role big three → confirmation
- Architect the planning engine as a channel-agnostic service (input = user message + conversation state, output = next question/action)
- *Outcome:* A written question flow, plus a defined engine interface in code (even if stubbed)

**Content**
- Post: share the actual onboarding questions, ask audience "what would you add/change?"
- **Waitlist CTA #3**
- Film: you role-playing the onboarding conversation out loud, unscripted
- *Outcome:* Real product feedback before you've built the UI

**Meta Ads:** —

---

### Day 7 — Fri 8/7 — Onboarding UI v1
**Development**
- Build the onboarding screen(s): role input, per-role question flow, confirmation step
- Wire it to save roles + answers to Supabase
- *Outcome:* A user can go through onboarding and their roles/answers persist in the DB (UI can be ugly)

**Content**
- Light day: engage with 2-3 other builders' posts
- Film: short weekend-build clip, casual tone
- *Outcome:* Maintain presence without burning a full content cycle

**Meta Ads:** —

---

## WEEK 2: Core build (Aug 8–14)

### Day 8 — Sat 8/8 — Block-proposal logic
**Development**
- Build the logic that takes stated big three per role and proposes specific calendar time blocks based on existing calendar gaps
- *Outcome:* Given a list of goals, the system outputs proposed calendar slots (not yet written to calendar)

**Content**
- Dogfood manually: run your own weekly plan by hand on paper using the Day 6 question flow
- Post: what you learned doing it manually
- **Waitlist CTA #4**
- *Outcome:* Real insight into whether the question flow produces a usable plan

**Meta Ads:** —

---

### Day 9 — Sun 8/9 — REST DAY
No development, content, or ad work. Full day off.

---

### Day 10 — Mon 8/10 — End-to-end wiring
**Development**
- Connect onboarding → guided session → block proposal → confirmation screen → calendar write, all through the channel-agnostic engine
- **Build the daily follow-up email v1** (Resend or Supabase functions), listing yesterday's items marked done/not done *(moved from original Sunday plan, Day 9)*
- *Outcome:* A single user can go from account creation to a real event on their Google Calendar, fully within the app; first version of the daily email exists

**Content**
- Post: teaser demo GIF of the flow working (blur any personal calendar details)
- **Waitlist CTA #5**
- Film: talking-head "Week 1 recap" — what got built, what's next, one honest struggle *(moved from original Sunday plan, Day 9)*
- *Outcome:* First "wow" content moment, plus the week 1 recap becomes a recurring content format

**Meta Ads:** —

---

### Day 11 — Tue 8/11 — Polish the core moment
**Development**
- Improve UI/UX specifically on the guided session screen
- **Set up the cron trigger (Vercel Cron) for the daily follow-up email**, fixed morning send time *(moved from original Sunday plan, Day 9)*
- *Outcome:* The guided session feels conversational and smooth, and the daily email now sends automatically on schedule

**Content**
- Post: "What would you want an AI planner to ask you?" — open question to audience
- *Outcome:* Direct input to fold into the question flow before public launch

**Meta Ads:** —

---

### Day 12 — Wed 8/12 — Daily brief
**Development**
- Build the "today" half of the daily email: today's big three + carryover tasks
- *Outcome:* Daily email now shows yesterday's recap and today's focus in one send

**Content**
- Film: screen-record the daily brief email rendering with real (your own) data
- **Waitlist CTA #6**
- *Outcome:* Concrete proof-of-value clip

**Meta Ads:** —

---

### Day 13 — Thu 8/13 — Bug bash
**Development**
- Run the full flow yourself 5+ times end to end, log every break, glitch, or confusing moment
- *Outcome:* A prioritized bug list ranked by how much it blocks the core loop

**Content**
- Post: "5 bugs I found testing my own app today"
- *Outcome:* Zero-extra-effort content, just narrating today's dev work

**Meta Ads:** —

---

### Day 14 — Fri 8/14 — Bug fixes + Week 2 recap + beta spots open
**Development**
- Fix the top 3-5 bugs from yesterday's list, prioritizing anything that breaks the core loop
- *Outcome:* End-to-end flow works reliably enough for a stranger to use without your help

**Content**
- Post: "Week 2 recap + opening 10 beta spots" *(moved from original Sunday plan, Day 16 — replaces the original light-day screenshot share)*
- **Waitlist CTA #7** (the beta-spots opening serves as this week's ask)
- Note for tomorrow's outreach: DM script — "First week's free to try, cancel anytime if it's not for you — just want your honest feedback." *(moved from original Sunday plan, Day 16)*
- *Outcome:* Week 2 recap and beta recruitment announced a day earlier than originally planned, freeing Sunday entirely

**Meta Ads:** —

---

## WEEK 3: Beta testing + ads setup (Aug 15–21)

### Day 15 — Sat 8/15 — Dogfood #2 + beta recruitment
**Development**
- Buffer day — catch up on anything slipping from week 2
- **DM 10-15 people in your network to recruit 5-10 committed beta testers; prepare a short beta-tester instructions doc**, using yesterday's DM script *(moved from original Sunday plan, Day 16)*
- *Outcome:* Week 2 scope fully closed out, and 5-10 beta testers committed ahead of Monday's onboarding

**Content**
- Run your own weekly session inside the real app now (not paper)
- Post + film the real walkthrough (can blur specifics)
- *Outcome:* First "real" demo content using the actual product

**Meta Ads:** —

---

### Day 16 — Sun 8/16 — REST DAY
No development, content, or ad work. Full day off.

---

### Day 17 — Mon 8/17 — Live beta onboarding
**Development**
- Onboard beta testers 1-on-1 (recruited on Day 15), watch where they hesitate or get confused, take detailed notes
- *Outcome:* A running doc of real friction points, in testers' own words

**Content**
- Post: share one honest friction moment you observed (with permission/anonymized)
- *Outcome:* Builds trust — shows real testing, not a vacuum

**Meta Ads**
- Set up Meta Business Manager + ad account
- Install Meta Pixel / Conversions API on the current landing/waitlist page
- *Outcome:* Ad infrastructure exists and ready to track events

---

### Day 18 — Tue 8/18 — Fix friction
**Development**
- Fix the top 3 friction points identified from beta onboarding
- *Outcome:* Rough edges beta testers actually hit are smoothed over

**Content**
- Post: "Here's what beta users are telling me to fix"
- **Waitlist CTA #8**
- *Outcome:* Signals responsiveness, builds trust with waitlist audience

**Meta Ads**
- Verify pixel is firing correctly on a test signup event
- Create a Custom Audience source from current site visitors
- *Outcome:* Tracking confirmed working before spending money

---

### Day 19 — Wed 8/19 — Real landing page
**Development**
- Build a proper landing page with a real waitlist/signup form, replacing the Google Form
- Migrate existing Google Form emails into the new system
- *Outcome:* A permanent, presentable landing page — becomes your ad destination going forward

**Content**
- Film: landing page walkthrough, share draft copy and ask for feedback
- *Outcome:* Free copy/design feedback before paid traffic

**Meta Ads**
- Draft 3-4 ad creative variants using existing film clips
- *Outcome:* Creative assets ready ahead of campaign launch

---

### Day 20 — Thu 8/20 — Trial/billing + copy + targeting
**Development**
- Integrate Stripe Checkout with a subscription product; 7-day trial period built into the Stripe subscription (card collected at signup, first charge fires automatically on day 7 unless canceled)
- Set up a day-6 reminder email: "Your trial ends tomorrow — cancel anytime here"
- Fix remaining bugs, tighten onboarding copy based on real beta language
- *Outcome:* Signup collects payment once, Stripe manages the trial-to-paid lifecycle automatically; onboarding copy validated against real reactions

**Content**
- Post: share a testimonial/quote from a beta user (get explicit permission first)
- **Waitlist CTA #9**
- *Outcome:* Social proof enters the content mix

**Meta Ads**
- Write ad copy: 3 angles (pain-point, curiosity, social-proof)
- Set up ad sets targeting founders / productivity-interest audiences
- *Outcome:* Campaign structurally ready to go live

---

### Day 21 — Fri 8/21 — Analytics + first ad spend
**Development**
- Set up basic product analytics: signups, onboarding completion rate, session completion rate, follow-up email open rate
- *Outcome:* You can answer "how many people actually activate" starting today

**Content**
- Light day: repost/share a beta user's organic reaction if one exists
- *Outcome:* Low-effort day to offset ad-ops workload

**Meta Ads**
- Launch a small pre-launch waitlist campaign ($10-20/day), driving to the landing page signup, not the live app yet
- *Outcome:* First real ad dollars spent, early CPC/CTR data starts coming in

---

## WEEK 4: Public launch (Aug 22–Sep 1)

### Day 22 — Sat 8/22 — Metrics check + verification status + feature freeze
**Development**
- Run your own weekly session #3 in-app; review analytics from the week
- Check Twilio A2P registration status **and Google OAuth verification status** (no action needed if still pending, not blocking anything else this week)
- **Declare feature freeze — polish and bug-fixes only from here** *(moved from original Sunday plan, Day 23)*
- **Write launch-day copy: post copy, landing page hero copy, email announcement** *(moved from original Sunday plan, Day 23)*
- *Outcome:* Clear read on whether beta activation numbers look healthy before public launch, and feature freeze in effect a day earlier — nothing new gets built that could introduce late-breaking bugs before launch

**Content**
- Post: first numbers, fully transparent (signups, completion rate, whatever they are)
- **Waitlist CTA #10**
- *Outcome:* Transparency posts consistently perform well

**Meta Ads**
- Check CPC/CTR on the waitlist campaign; kill any ad set under 1% CTR
- **Build a retargeting audience (site visitors who didn't sign up), ready to activate on launch day** *(moved from original Sunday plan, Day 23)*
- *Outcome:* Budget concentrated on what's working, retargeting pool primed so launch-day ads aren't starting cold

---

### Day 23 — Sun 8/23 — REST DAY
No development, content, or ad work. Full day off. (Feature freeze from Day 22 continues automatically — there's nothing to actively do about it today.)

---

### Day 24 — Mon 8/24 — Final prep
**Development**
- Final bug pass, deploy production build
- Smoke-test the entire flow one more time end to end
- *Outcome:* Production stable and deployed, nothing left to change before go-live

**Content**
- Post: "Launching tomorrow" countdown, combined with the launch-hype trailer clip *(merged with original Sunday plan's "launching this week" hype post + trailer, Day 23)*
- **Waitlist CTA #11** — last call before the waitlist converts to a live product
- *Outcome:* Maximum anticipation right before the CTA changes, hype and countdown landing in one push

**Meta Ads**
- Prep campaign to switch destination from waitlist to live signup
- Set launch-week budget (highest spend of the month)
- *Outcome:* Campaign infrastructure ready to flip live the moment the app is public

---

### Day 25 — Tue 8/25 — PUBLIC LAUNCH
**Development**
- Monitor closely all day, hotfix anything that breaks under real traffic
- *Outcome:* App stays up and usable through its first real traffic spike

**Content**
- Big launch post on LinkedIn + X: "Try it free for 7 days, cancel anytime." Demo GIF, clear CTA, link
- Film: launch-day reaction video
- *Outcome:* Highest-visibility content moment of the month

**Meta Ads**
- Turn on the launch campaign (broad + retargeting audiences combined)
- *Outcome:* Paid traffic starts flowing to the live product on day one

---

### Day 26 — Wed 8/26 — Stabilize
**Development**
- Fix anything that broke under launch-day load, personally respond to every new signup
- *Outcome:* Early users get a personal touch, drives word-of-mouth disproportionately

**Content**
- Post: "24 hours in" — share real numbers
- *Outcome:* Momentum content while launch is still fresh

**Meta Ads**
- Check cost-per-signup, reallocate budget toward the best-performing ad
- *Outcome:* Spend efficiency improves within 24 hours of launch

---

### Day 27 — Thu 8/27 — Quick win + polish push
**Development**
- Ship one fast, visible improvement users have already asked for
- **Additional polish push based on the first week of live feedback** *(moved from original Sunday plan, Day 30)*
- *Outcome:* Signals responsiveness to the first wave of real users, product in its best state this early into launch week

**Content**
- Post: testimonial #2 (a second real user quote)
- *Outcome:* Reinforces social proof while it's most credible

**Meta Ads**
- Add a lookalike audience seeded from actual signups (once 20-30+)
- *Outcome:* Ad targeting starts using real conversion data instead of interest guesses

---

### Day 28 — Fri 8/28 — Light day
**Development**
- Monitor only, no new dev work — protect against burnout mid-launch-week
- *Outcome:* Sustainable pace maintained into the final push

**Content**
- Content batching day: film 2-3 short clips to have ready for remaining days
- *Outcome:* Buffer content so the final week doesn't require same-day filming under pressure

**Meta Ads**
- Let the campaign run, light monitoring only (don't pause over the weekend)
- *Outcome:* Consistent ad delivery through the weekend without unnecessary interference

---

### Day 29 — Sat 8/29 — Retention check
**Development**
- Run weekly session #4 on yourself; check early retention numbers
- *Outcome:* First real signal on whether the product retains, not just acquires

**Content**
- Post: "One week post-launch" numbers — full transparency
- *Outcome:* Continues the build-in-public transparency thread

**Meta Ads**
- Review total spend vs. signups (know your CAC); decide whether to scale or hold budget
- **Retarget landing-page visitors who never signed up with a fresh creative/offer angle** *(moved from original Sunday plan, Day 30)*
- *Outcome:* Clear go/no-go call on ad spend for the final days, plus a fresh push at non-converters

---

### Day 30 — Sun 8/30 — REST DAY
No development, content, or ad work. Full day off.

---

### Day 31 — Mon 8/31 — Personal outreach
**Development**
- Light monitoring only
- *Outcome:* No dev distraction from the final push

**Content**
- Personal outreach: DM everyone in your network not yet using it — "First week's free to try, cancel anytime if it's not for you — just want your honest feedback."
- Post: countdown — "X/50 users, [N] more to hit 50 by Sept 1" *(merged with original Sunday plan's urgency-ask post, Day 30 — same message, one post)*
- *Outcome:* Personal asks often convert better than public posts in the final hours

**Meta Ads**
- Final budget push on the best-performing ad set if close to 50
- *Outcome:* Maximum spend efficiency on the single day it matters most

---

### Day 32 — Tue 9/1 — Final count
**Development**
- Final count of users who completed a card-backed trial + onboarding + first weekly session; pull all metrics (activation rate, retention, CAC)
- *Outcome:* A clear, honest picture of where the 30-day challenge landed against the actual goal definition

**Content**
- Recap post: the full journey, final numbers, what you learned, what's next regardless of outcome
- *Outcome:* Closes the narrative arc — often gets outsized engagement

**Meta Ads**
- Pause or scale down campaigns, pull final spend/CAC/conversion metrics for the recap post
- *Outcome:* Clean data set to reference in the final post and in your own retro

---

## Phase 2 Roadmap (post-30-day-challenge)

- SMS as an interface (text the agent to run a planning session)
- Voice notes over SMS (transcription pipeline)
- Live conversational voice agent — type or talk, agent talks back
- Apple Calendar / Outlook integration
- Adaptive personalization that actually sharpens over time
- Native mobile app
- Auto-accept/auto-send calendar invites, once trust is established
