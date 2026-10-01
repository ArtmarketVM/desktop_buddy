import type { CSSProperties } from "react";
import type { AvatarPreferences, AvatarState } from "../types";

export function Avatar({
  appearance,
  state = "working",
}: {
  appearance: AvatarPreferences;
  state?: AvatarState;
}) {
  if (!appearance.visible) return null;
  return (
    <svg
      className={`avatar avatar-${appearance.character} avatar-${state}`}
      style={{ "--avatar-color": appearance.color } as CSSProperties}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`${appearance.character} companion, ${state}`}
    >
      <g
        fill="var(--avatar-color)"
        stroke="#344333"
        strokeWidth="2.5"
        strokeLinejoin="round"
      >
        {appearance.character === "cat" && (
          <>
            <path d="M27 49 23 16 47 31M73 31 97 16 93 49" />
            <ellipse cx="60" cy="66" rx="39" ry="37" />
          </>
        )}
        {appearance.character === "dog" && (
          <>
            <ellipse cx="60" cy="65" rx="35" ry="36" />
            <path d="M29 35C5 24 6 77 24 78L36 40M91 35C115 24 114 77 96 78L84 40" />
          </>
        )}
        {appearance.character === "seal" && (
          <>
            <ellipse cx="60" cy="64" rx="38" ry="37" />
            <path d="M27 78 7 99 38 94M93 78 113 99 82 94" />
          </>
        )}
        {appearance.character === "bird" && (
          <>
            <ellipse cx="60" cy="62" rx="35" ry="40" />
            <path d="M29 54 13 79 32 87M91 54 107 79 88 87M54 25 60 10 66 25" />
          </>
        )}
      </g>
      {state === "sleeping" || state === "paused" ? (
        <g stroke="#344333" strokeWidth="3" fill="none">
          <path d="M39 57q6 7 12 0M69 57q6 7 12 0" />
        </g>
      ) : (
        <g className="avatar-eyes" fill="#344333">
          <ellipse cx="45" cy="58" rx="4" ry="6" />
          <ellipse cx="75" cy="58" rx="4" ry="6" />
        </g>
      )}
      {appearance.character === "bird" ? (
        <path
          d="m53 70 14 0-7 12z"
          fill="#D8A459"
          stroke="#344333"
          strokeWidth="2"
        />
      ) : (
        <g stroke="#344333" strokeWidth="2" fill="none">
          <path d="M56 70h8l-4 5z" fill="#344333" />
          <path d="M49 79q11 10 22 0" />
          {appearance.character === "cat" && (
            <path d="M37 71 21 68M36 77 20 80M83 71 99 68M84 77 100 80" />
          )}
        </g>
      )}
      {state === "completed" && (
        <path
          d="m86 12 8 8 15-17"
          stroke="#497044"
          strokeWidth="6"
          fill="none"
        />
      )}
      {state === "sleeping" && (
        <text x="89" y="23" fill="#344333" fontSize="14">
          z
        </text>
      )}
    </svg>
  );
}
