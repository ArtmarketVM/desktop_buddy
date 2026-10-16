import type { CSSProperties } from "react";
import type { AvatarPreferences, AvatarState } from "../types";

const INK = "#1E2A23";
// Marks drawn outside the body sit on the page, so they follow the theme's text colour.
const MARK = "var(--text, #1E2A23)";
// Eye shapes from the sumi site mascot: sleepy, alert and happy.
const EYES = {
  sleepy:
    "M-5 0.3Q0 -0.5 3.2 -0.6L4.5 -2.1 5.8 0.3 4.7 1.2Q0 1.3-5 1.3Q-5.6 0.8-5 0.3Z",
  alert: "M-1.5-4.8 1.3-5.4Q1.7 0 1.2 3.9 0 5.8-1.3 3.9-1.7 0-1.5-4.8Z",
  happy:
    "M-5.2 1.6Q-2.6-2.8 0-2.6 2.2-2.4 5.4 1.9 5.5 2.8 4.7 2.5 2.1-0.5 0-0.9-2.4-0.9-4.3 2.3-5.1 2.6-5.2 1.6Z",
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
      <g className="pet__body">
        <path
          className="pet__fill"
          d="M6 6C20 4 40 4 54 6 56 20 56 40 54 54 40 56 20 56 6 54 4 40 4 20 6 6Z"
          fill="var(--avatar-color)"
        />
        <g className="avatar-eyes pet__eyes" fill={INK}>
          <path transform="translate(22 31)" d={eyes} />
          <path transform="translate(38 31)" d={eyes} />
        </g>
        {state === "stretching" && (
          <circle
            className="avatar-breath avatar-breath-fast"
            cx="30"
            cy="43"
            r="2.4"
            fill={INK}
          />
        )}
        {mood(state) === "sleepy" && (
          <circle
            className="avatar-breath"
            cx="30"
            cy="43"
            r="2.6"
            fill={INK}
          />
        )}
        {(state === "completed" || state === "success") && (
          <path
            className="avatar-smile"
            d="M24 41q6 5.5 12 0"
            fill="none"
            stroke={INK}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
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
