import { useEffect, useState, type CSSProperties } from "react";
import type { AvatarPreferences, AvatarState } from "../types";

// sumi is a frame animation. The 8 x 8 body sits on a 12 x 12 cell grid (columns and
// rows 2-9); eyes, mouth and the marks in the margin are drawn on a quarter-cell grid,
// which keeps the narrow eyes. Every motion is a whole-step jump between frames.
const CELL = 7.5;
const Q = CELL / 4;
const INK = "#1E2A23";
// Marks outside the body sit on the page, so they follow the theme's text colour.
const MARK = "var(--text, #1E2A23)";
const ACCENT = "var(--accent, #6c5fff)";
const ARM = "color-mix(in srgb, var(--avatar-color) 70%, #1E2A23)";
const FRAME_MS = 500;

type Paint = "body" | "eye" | "ink" | "mark" | "accent" | "arm";
// A rectangle in quarter cells: x, y, width, height, paint.
type Px = [number, number, number, number, Paint];
type Frame = Px[];

const FILL: Record<Paint, string> = {
  body: "var(--avatar-color)",
  eye: INK,
  ink: INK,
  mark: MARK,
  accent: ACCENT,
  arm: ARM,
};

const BODY = [
  "00111100",
  "01111110",
  "11111111",
  "11111111",
  "11111111",
  "11111111",
  "01111110",
  "00111100",
];
// Settled one row flatter, for resting.
const FLAT = [
  "00111100",
  "01111110",
  "11111111",
  "11111111",
  "11111111",
  "11111111",
  "01111110",
];
// One row taller, for the stretch.
const TALL = [
  "00111100",
  "01111110",
  "11111111",
  "11111111",
  "11111111",
  "11111111",
  "11111111",
  "01111110",
  "00111100",
];

function body(ox: number, oy: number, rows = BODY): Frame {
  const out: Frame = [];
  rows.forEach((row, y) =>
    row.split("").forEach((cell, x) => {
      if (cell === "1") out.push([(x + ox) * 4, (y + oy) * 4, 4, 4, "body"]);
    }),
  );
  return out;
}
// A half-cell square centred in cell (cx, cy); halves are allowed.
const dot = (cx: number, cy: number, paint: Paint = "mark"): Px => [
  cx * 4 + 1,
  cy * 4 + 1,
  2,
  2,
  paint,
];

type EyeKind = "alert" | "sleepy" | "up";
// Eyes as on the original mascot: two half-cell squares per eye.
function eyes(kind: EyeKind, ox: number, oy: number, shift = 0): Frame {
  const out: Frame = [];
  for (const col of [ox + 2 + shift, ox + 5 + shift]) {
    const r = oy + 3;
    if (kind === "alert") out.push(dot(col, r, "eye"), dot(col, r + 1, "eye"));
    if (kind === "sleepy")
      out.push(dot(col - 0.5, r + 0.5, "eye"), dot(col + 0.5, r + 0.5, "eye"));
    if (kind === "up") out.push(dot(col, r - 1, "eye"), dot(col, r, "eye"));
  }
  return out;
}
type Mouth = (ox: number, oy: number) => Frame;
const mouthDot: Mouth = (ox, oy) => [dot(ox + 3.5, oy + 5.5, "ink")];
const mouthO: Mouth = (ox, oy) => [
  [(ox + 3) * 4 + 2, (oy + 5) * 4 + 2, 4, 4, "ink"],
];
const smile: Mouth = (ox, oy) => [
  dot(ox + 2.5, oy + 5, "ink"),
  [(ox + 3) * 4 + 2, (oy + 5) * 4 + 3, 4, 2, "ink"],
  dot(ox + 4.5, oy + 5, "ink"),
];

function face(
  kind: EyeKind,
  mouth: Mouth | null = null,
  ox = 2,
  oy = 2,
  rows = BODY,
  shift = 0,
): Frame {
  return [
    ...body(ox, oy, rows),
    ...eyes(kind, ox, oy, shift),
    ...(mouth ? mouth(ox, oy) : []),
  ];
}

// Marks in the margin, half a cell thick.
const trail = (n: number): Frame =>
  [dot(9, 2), dot(10, 1), dot(11, 0)].slice(0, n);
const zee = (cx: number, cy: number): Frame => [
  [cx * 4, cy * 4, 6, 2, "mark"],
  [cx * 4 + 2, cy * 4 + 2, 2, 2, "mark"],
  [cx * 4, cy * 4 + 4, 6, 2, "mark"],
];
const armsUp: Frame = [1.5, 2.5, 3.5].flatMap((y) => [
  dot(1, y, "arm"),
  dot(10, y, "arm"),
]);
const armsDown: Frame = [
  dot(0.5, 4.5, "arm"),
  dot(1, 5, "arm"),
  dot(1, 6, "arm"),
  dot(10.5, 4.5, "arm"),
  dot(10, 5, "arm"),
  dot(10, 6, "arm"),
];
const confetti: Frame[] = [
  [dot(0.5, 1, "accent"), dot(11, 2.5), dot(1, 10.5), dot(10.5, 10, "accent")],
  [
    dot(1.5, 0),
    dot(10, 0.5, "accent"),
    dot(0, 9, "accent"),
    dot(11, 9.5),
    dot(5.5, 0, "accent"),
  ],
  [dot(0, 0.5), dot(11, 0), dot(0.5, 11, "accent"), dot(10.5, 11, "accent")],
];
const question: Frame = [
  [9 * 4, 0, 6, 2, "mark"],
  [11 * 4, 2, 2, 2, "mark"],
  [10 * 4, 4, 4, 2, "mark"],
  dot(10, 1.5),
  dot(10, 2.75),
];

type Mood =
  | "working"
  | "listening"
  | "thinking"
  | "done"
  | "resting"
  | "stretching"
  | "attention";

const FRAMES: Record<Mood, Frame[]> = {
  // Still; the eyes blink through CSS as before.
  working: [face("alert")],
  // Eyes follow you: left, centre, right, centre.
  listening: [
    face("alert", null, 2, 2, BODY, -1),
    face("alert"),
    face("alert", null, 2, 2, BODY, 1),
    face("alert"),
  ],
  // Eyes up while a trail of squares climbs out of the corner.
  thinking: [
    [...face("up"), ...trail(1)],
    [...face("up"), ...trail(2)],
    [...face("up"), ...trail(3)],
  ],
  // Smiling; one hop while fine confetti pops around it.
  done: [
    [...face("alert", smile), ...confetti[0]],
    [...face("alert", smile, 2, 1), ...confetti[1]],
    [...face("alert", smile), ...confetti[2]],
  ],
  // Settled a row flatter, eyes shut, a Z drifting; the mouth opens and closes slowly.
  resting: [
    [...face("sleepy", mouthDot, 2, 3, FLAT), ...zee(9, 0)],
    [...face("sleepy", mouthDot, 2, 3, FLAT), ...zee(9, 1)],
    face("sleepy", mouthO, 2, 3, FLAT),
    face("sleepy", mouthO, 2, 3, FLAT),
  ],
  // Grows a row taller as thin arms swing up, mouth open in a yawn.
  stretching: [
    [...face("sleepy", mouthO), ...armsDown],
    [...face("sleepy", mouthO, 2, 1, TALL), ...armsUp],
    [...face("sleepy", mouthO, 2, 1, TALL), ...armsUp],
    [...face("sleepy", mouthO), ...armsDown],
  ],
  attention: [[...face("alert"), ...question]],
};

function moodOf(state: AvatarState): Mood {
  switch (state) {
    case "listening":
      return "listening";
    case "thinking":
      return "thinking";
    case "completed":
    case "success":
    case "fun":
      return "done";
    case "sleeping":
    case "paused":
      return "resting";
    case "stretching":
      return "stretching";
    case "attention":
      return "attention";
    default:
      return "working";
  }
}

function useFrame(count: number) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    setFrame(0);
    if (count < 2) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timer = window.setInterval(
      () => setFrame((f) => (f + 1) % count),
      FRAME_MS,
    );
    return () => window.clearInterval(timer);
  }, [count]);
  return frame % count;
}

export function Avatar({
  appearance,
  state = "working",
}: {
  appearance: AvatarPreferences;
  state?: AvatarState;
}) {
  const frames = FRAMES[moodOf(state)];
  const frame = useFrame(frames.length);
  if (!appearance.visible) return null;
  const cells = frames[frame];
  const rect = ([x, y, w, h, paint]: Px, i: number) => (
    <rect
      key={`${i}-${x}-${y}`}
      className={paint === "body" ? "pet__fill" : undefined}
      x={(x - 8) * Q}
      y={(y - 8) * Q}
      width={w * Q}
      height={h * Q}
      fill={FILL[paint]}
    />
  );
  return (
    <svg
      className={`avatar avatar-${appearance.character} avatar-${state}`}
      style={{ "--avatar-color": appearance.color } as CSSProperties}
      // Twelve cells, with the body's top-left corner at 0 0 as before.
      viewBox={`${-2 * CELL} ${-2 * CELL} ${12 * CELL} ${12 * CELL}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`sumi companion, ${state}`}
    >
      <g className="pet__body">
        {cells.filter((c) => c[4] !== "eye").map(rect)}
        <g className="avatar-eyes pet__eyes">
          {cells.filter((c) => c[4] === "eye").map(rect)}
        </g>
      </g>
    </svg>
  );
}
