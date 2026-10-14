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
      viewBox="-10 -14 80 80"
      role="img"
      aria-label={`${appearance.character} companion, ${state}`}
    >
      <g className="pet__body">
        {appearance.character === "cat" && (
          <path
            {...line}
            d="M9 9 11 -6 21 5ZM51 9 49 -6 39 5Z"
            fill="var(--avatar-color)"
          />
        )}
        {appearance.character === "dog" && (
          <path d="M7 10C-4 14 -4 32 6 36M53 10C64 14 64 32 54 36" {...line} />
        )}
        <path
          className="pet__fill"
          d="M6 6C20 4 40 4 54 6 56 20 56 40 54 54 40 56 20 56 6 54 4 40 4 20 6 6Z"
          fill="var(--avatar-color)"
        />
        <g className="avatar-eyes pet__eyes" fill={INK}>
          <path transform="translate(22 31)" d={eyes} />
          <path transform="translate(38 31)" d={eyes} />
        </g>
        {appearance.character === "seal" && (
          <path
            d="M2 36 -8 34M2 40 -8 42M58 36 68 34M58 40 68 42"
            {...line}
            strokeWidth={1.6}
          />
        )}
        {appearance.character === "bird" && (
          <path
            d="M27 40h6l-3 5z"
            fill="#D8A459"
            stroke={INK}
            strokeWidth={1.5}
          />
        )}
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
