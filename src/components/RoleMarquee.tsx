// Static (server-rendered) infinite ticker of example roles under the
// hero. Pure CSS -- the track holds two back-to-back copies of the same
// list and slides exactly -50% (see `.marquee-track` in globals.css), so
// the loop has no seam and needs no JS to drive it.
//
// Content note: these are examples, not a claim about who the product is
// "for" -- deliberately kept broad rather than narrowed to one persona.
const ROLES = [
  "Founder",
  "Parent",
  "Athlete",
  "Student",
  "Manager",
  "Caregiver",
  "Freelancer",
  "Partner",
  "Board member",
  "Mentor",
];

export default function RoleMarquee() {
  return (
    <div
      aria-hidden
      className="marquee-mask w-full overflow-hidden py-1"
    >
      <div className="marquee-track flex w-max items-center gap-3">
        {[...ROLES, ...ROLES].map((role, i) => (
          <span
            key={`${role}-${i}`}
            className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
          >
            {role}
          </span>
        ))}
      </div>
    </div>
  );
}
