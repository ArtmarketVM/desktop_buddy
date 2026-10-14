import type { CSSProperties } from "react";
import type { AvatarPreferences, AvatarState } from "../types";

const INK = "#1E2A23";
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
      </g>
      {(state === "completed" || state === "success") && (
        <path
          d="m47 -8 5 5 10-11"
          stroke="#3E6B48"
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
        />
      )}
      {state === "sleeping" && (
        <text x="52" y="-2" fill={INK} fontSize="11">
          z
        </text>
      )}
      {(state === "thinking" || state === "attention") && (
        <text x="52" y="0" fill={INK} fontSize="14" fontWeight="700">
          {state === "thinking" ? "…" : "?"}
        </text>
      )}
      {state === "stretching" && (
        <g className="avatar-stretch-arms" {...line}>
          <path d="M4 46 -6 40 -8 30M56 46 66 40 68 30" />
        </g>
      )}
      {state === "listening" && (
        <g {...line} strokeWidth={1.8}>
          <path d="M-2 22q-6 8 0 16M-7 18q-9 12 0 24" />
        </g>
      )}
    </svg>
  );
}
