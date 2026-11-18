// A headline word set in the melting face, with drips running off the
// bottoms of its letters. The letterforms waste away on a loop
// (`.melt-loop`, the font's YEAR axis) while the drips lengthen in step
// (`.melt-drip`), so the word reads as actually melting rather than just
// changing weight. Both animations live in globals.css and share one
// duration; change them together.
//
// `drips` maps a letter's index to where its drip hangs: `x` is the offset
// from the letter's left edge and `len` the drip's full length, both in em
// so they scale with whatever size the headline is set at. The positions
// are eyeballed against Climate Crisis's stems -- if the word or the font
// changes, they need re-placing.
type DripSpec = { x: number; len: number };

export default function MeltWord({
  text,
  drips,
  className = "",
}: {
  text: string;
  drips: Record<number, DripSpec>;
  className?: string;
}) {
  return (
    <span className={`melt melt-loop inline-block ${className}`}>
      {Array.from(text).map((ch, i) => {
        const drip = drips[i];
        return (
          <span key={i} className="relative inline-block">
            {ch}
            {drip && (
              <span
                aria-hidden
                className="melt-drip"
                style={{ left: `${drip.x}em`, height: `${drip.len}em` }}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}
