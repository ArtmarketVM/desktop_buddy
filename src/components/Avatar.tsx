import type { CSSProperties } from "react";
import type { AvatarPreferences, AvatarState } from "../types";

const INK = "#1E2A23";
// Marks drawn outside the body sit on the page, so they follow the theme's text colour.
const MARK = "var(--text, #1E2A23)";
// Eye shapes from the sumi site mascot: sleepy, alert and happy.
const CELL = 7.5;
// An 8 x 8 sprite: 1 is body, 0 is empty. Corners are clipped so it reads as a rounded block.
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
// Eye glyphs as cells on the same grid: alert is a 1 x 2 bar, sleepy a 2 x 1 bar, happy a small ^.
const EYES: Record<"sleepy" | "alert" | "happy", [number, number][]> = {
  alert: [
    [0, 0],
    [0, 1],
  ],
  sleepy: [
    [-0.5, 0.5],
    [0.5, 0.5],
  ],
  happy: [
    [-0.5, 0.5],
    [0, 0],
    [0.5, 0.5],
  ],
};
function mood(state: AvatarState): keyof typeof EYES {
  if (state === "sleeping" || state === "paused") return "sleepy";
  if (state === "completed" || state === "success" || state === "fun")
    return "happy";
  return "alert";
}

export function Avatar({
  appearance,
  state = "working",
}: {
  appearance: AvatarPreferences;
  state?: AvatarState;
}) {
  if (!appearance.visible) return null;
  const eyes = EYES[mood(state)];
  const line = {
    fill: "none",
    stroke: INK,
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <svg
      className={`avatar avatar-${appearance.character} avatar-${state}`}
      style={{ "--avatar-color": appearance.color } as CSSProperties}
      viewBox="-10 -12 80 76"
      role="img"
      aria-label={`sumi companion, ${state}`}
    >
      {(state === "completed" || state === "success") && (
        <g className="avatar-confetti" aria-hidden="true">
          <g
            fill="none"
            stroke="var(--accent, #3E6B48)"
            strokeWidth={1.6}
            strokeLinecap="round"
            opacity={0.55}
          >
            <path d="M30-8v-10M60 4l6-7M70 30h10M60 56l7 7M30 68v10M0 56l-7 7M-10 30h-10M0 4l-7-7" />
          </g>
          <g fill="var(--avatar-color)">
            <circle cx="30" cy="-24" r="3" />
            <rect
              x="66"
              y="64"
              width="5"
              height="5"
              rx="1"
              transform="rotate(-25 68 66)"
            />
            <circle cx="-24" cy="30" r="2.6" />
            <circle cx="8" cy="78" r="1.8" />
          </g>
          <g fill="var(--accent, #3E6B48)">
            <rect
              x="68"
              y="-8"
              width="5"
              height="5"
              rx="1"
              transform="rotate(20 70 -6)"
            />
            <circle cx="30" cy="84" r="3" />
            <rect
              x="-12"
              y="-10"
              width="5"
              height="5"
              rx="1"
              transform="rotate(-15 -10 -8)"
            />
            <circle cx="52" cy="-18" r="1.8" />
            <circle cx="-18" cy="8" r="1.8" />
          </g>
          <g fill={MARK} opacity={0.8}>
            <circle cx="84" cy="30" r="2.6" />
            <rect
              x="-12"
              y="64"
              width="5"
              height="5"
              rx="1"
              transform="rotate(30 -10 66)"
            />
            <circle cx="78" cy="52" r="1.8" />
          </g>
        </g>
      )}
      {state === "stretching" && (
        <g
          className="avatar-stretch-arms"
          fill="none"
          stroke="color-mix(in srgb, var(--avatar-color) 70%, #1E2A23)"
          strokeWidth={4.5}
          strokeLinecap="round"
        >
          <path
            className="avatar-arm avatar-arm-left"
            d="M9 40C-3 36-7 26-3 15"
          />
          <path
            className="avatar-arm avatar-arm-right"
            d="M51 40c12-4 16-14 12-25"
          />
        </g>
      )}
      <g className="pet__body" shapeRendering="crispEdges">
        {BODY.map((row, y) =>
          row
            .split("")
            .map((cell, x) =>
              cell === "1" ? (
                <rect
                  key={`${x}-${y}`}
                  className="pet__fill"
                  x={x * CELL}
                  y={y * CELL}
                  width={CELL}
                  height={CELL}
                  fill="var(--avatar-color)"
                />
              ) : null,
            ),
        )}
        <g className="avatar-eyes pet__eyes" fill={INK}>
          {[2, 5].map((column) =>
            eyes.map(([dx, dy], i) => (
              <rect
                key={`${column}-${i}`}
                x={(column + dx) * CELL + CELL * 0.25}
                y={(3 + dy) * CELL + CELL * 0.25}
                width={CELL * 0.5}
                height={CELL * 0.5}
              />
            )),
          )}
        </g>
        {state === "stretching" && (
          <rect
            className="avatar-breath avatar-breath-fast"
            x="28"
            y="41"
            width="4"
            height="4"
            fill={INK}
          />
        )}
        {mood(state) === "sleepy" && (
          <rect
            className="avatar-breath"
            x="28"
            y="41"
            width="4"
            height="4"
            fill={INK}
          />
        )}
        {(state === "completed" || state === "success") && (
          <g className="avatar-smile" fill={INK}>
            <rect
              x={3 * CELL}
              y={5 * CELL}
              width={CELL * 0.5}
              height={CELL * 0.5}
            />
            <rect
              x={3.5 * CELL}
              y={5.4 * CELL}
              width={CELL}
              height={CELL * 0.5}
            />
            <rect
              x={4.5 * CELL}
              y={5 * CELL}
              width={CELL * 0.5}
              height={CELL * 0.5}
            />
          </g>
        )}
      </g>
      {state === "sleeping" && (
        <g
          fill="none"
          stroke={MARK}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="avatar-mark"
        >
          <path className="avatar-zz" d="M61 -9h6l-6 6h6" />
          <path className="avatar-zz" d="M71 -18h4l-4 4h4" strokeWidth={1.6} />
        </g>
      )}
      {state === "thinking" && (
        <g fill={MARK} className="avatar-mark">
          <circle className="avatar-dot" cx="52" cy="-4" r="1.7" />
          <circle className="avatar-dot" cx="58" cy="-8" r="2.3" />
          <circle className="avatar-dot" cx="65" cy="-13" r="3" />
        </g>
      )}
      {state === "attention" && (
        <text
          x="51"
          y="0"
          fill={MARK}
          fontSize="16"
          fontWeight="700"
          className="avatar-mark"
        >
          ?
        </text>
      )}
      {state === "listening" && (
        <g
          className="avatar-mark"
          fill="none"
          stroke={MARK}
          strokeWidth={2.2}
          strokeLinecap="round"
        >
          <path className="avatar-wave" d="M-3 24q-5 7 0 14" />
          <path
            className="avatar-wave avatar-wave-outer"
            d="M-9 20q-9 11 0 22"
          />
          <path className="avatar-wave" d="M63 24q5 7 0 14" />
          <path
            className="avatar-wave avatar-wave-outer"
            d="M69 20q9 11 0 22"
          />
        </g>
      )}
    </svg>
  );
}
