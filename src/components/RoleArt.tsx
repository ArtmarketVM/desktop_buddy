import {
  Code2,
  Rocket,
  LayoutDashboard,
  PenTool,
  Megaphone,
  Handshake,
  Network,
  Workflow,
  Palette,
} from "lucide-react";

const symbols = [
  Code2,
  Rocket,
  LayoutDashboard,
  PenTool,
  Megaphone,
  Handshake,
  Network,
  Workflow,
  Palette,
];

export function RoleArt({ index }: { index: number }) {
  const Symbol = symbols[index] ?? Palette;
  return (
    <span className="role-art" aria-hidden="true">
      <svg className="role-orbits" viewBox="0 0 200 150" fill="none">
        <rect
          x="42"
          y="20"
          width="116"
          height="110"
          rx="24"
          transform="rotate(-12 100 75)"
        />
        <rect
          x="54"
          y="30"
          width="96"
          height="92"
          rx="22"
          transform="rotate(12 100 75)"
        />
        <circle cx="161" cy="30" r="5" />
        <circle cx="36" cy="115" r="3" />
        <path d="M172 100v12m-6-6h12M29 43v8m-4-4h8" />
      </svg>
      <Symbol size={54} strokeWidth={1.1} />
    </span>
  );
}
