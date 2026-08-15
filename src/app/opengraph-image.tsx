import { ImageResponse } from "next/og";

// Generated rather than a checked-in PNG so the copy stays editable in one
// place. Applies to the whole app (root of src/app), so any route without
// its own opengraph-image inherits this one.
//
// Kept to system fonts and flat color on purpose: ImageResponse renders in
// a Satori environment with no access to the Geist webfont the site uses,
// and fetching a font file at render time is a failure mode that only ever
// shows up as a broken unfurl. Close enough is the right call here.

export const alt = "Sundae — AI-guided weekly planning";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#fafafa",
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 8,
            color: "#18181b",
          }}
        >
          SUNDAE
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: -2,
              color: "#000000",
              maxWidth: 900,
            }}
          >
            Set the vision. Sundae handles the busywork.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              lineHeight: 1.4,
              color: "#52525b",
              maxWidth: 860,
            }}
          >
            Define the roles you play. One guided session a week turns them
            into a real week on your calendar.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 26,
            color: "#71717a",
          }}
        >
          <div
            style={{
              display: "flex",
              width: 12,
              height: 12,
              borderRadius: 12,
              background: "#10b981",
            }}
          />
          AI-guided weekly planning
        </div>
      </div>
    ),
    size,
  );
}
