// A melting edge, lifted from the app icon's drips. Fills with
// `currentColor`, so set the color with a `text-*` class: it should match
// the section the drip hangs *from*, and it's positioned over the top of
// the section it drips *into*.
export default function Drip({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 56"
      preserveAspectRatio="none"
      className={`pointer-events-none h-8 w-full sm:h-12 ${className ?? ""}`}
    >
      <path
        fill="currentColor"
        d="M0 0h1200v14c-22 0-24 0-44 0-26 0-22 30-46 30s-20-30-46-30H842c-24 0-20 20-40 20s-16-20-40-20H470c-26 0-22 42-48 42s-22-42-48-42H196c-22 0-18 24-38 24s-16-24-38-24H0Z"
      />
    </svg>
  );
}
