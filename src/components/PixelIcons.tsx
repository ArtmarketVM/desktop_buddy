import type { SVGProps } from "react";

/** Sidebar icons drawn on an 11 x 11 pixel grid so they read at 17px and match the pixel wordmark. */
type Props = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number };

const GRID = 11;

function make(name: string, rows: string[]) {
  const Icon = ({ size = 17, className, ...rest }: Props) => (
    <svg
      viewBox={`0 0 ${GRID} ${GRID}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className ? `pixel-icon ${className}` : "pixel-icon"}
      data-icon={name}
      {...rest}
    >
      {rows.flatMap((row, y) =>
        row
          .split("")
          .map((cell, x) =>
            cell === "1" ? (
              <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
            ) : null,
          ),
      )}
    </svg>
  );
  Icon.displayName = name;
  return Icon;
}

// Today: a compass rose, a diamond with its centre marked.
export const Compass = make("compass", [
  "00000100000",
  "00001110000",
  "00011011000",
  "00110001100",
  "01100000110",
  "11000100011",
  "01100000110",
  "00110001100",
  "00011011000",
  "00001110000",
  "00000100000",
]);

// Progress: three bars of different heights on a baseline.
export const BarChart3 = make("bar-chart", [
  "00000000000",
  "00000001100",
  "00000001100",
  "00000001100",
  "00011001100",
  "00011001100",
  "11011001100",
  "11011001100",
  "11011001100",
  "11011001100",
  "00000000000",
]);

// Goals: two list rows, the first ticked.
export const History = make("goals", [
  "00000000000",
  "11110011111",
  "10010000000",
  "10110000000",
  "11110000000",
  "00000000000",
  "11110011111",
  "10010000000",
  "10010000000",
  "11110000000",
  "00000000000",
]);

// Chats and feedback: a speech bubble with a tail.
export const MessageSquare = make("message", [
  "01111111110",
  "10000000001",
  "10000000001",
  "10000000001",
  "10000000001",
  "10000000001",
  "01111111110",
  "00110000000",
  "00100000000",
  "00000000000",
  "00000000000",
]);

// Settings: a gear, ring with four teeth.
export const Settings = make("settings", [
  "00001110000",
  "00001110000",
  "00111111100",
  "01110001110",
  "11100000111",
  "11100000111",
  "11100000111",
  "01110001110",
  "00111111100",
  "00001110000",
  "00001110000",
]);

// Collapse: a window with its left panel.
export const PanelLeft = make("panel-left", [
  "11111111111",
  "10010000001",
  "10010000001",
  "10010000001",
  "10010000001",
  "10010000001",
  "10010000001",
  "10010000001",
  "10010000001",
  "11111111111",
  "00000000000",
]);

// Theme: sun with rays.
export const Sun = make("sun", [
  "00000100000",
  "01000100010",
  "00100000100",
  "00001110000",
  "00011111000",
  "11011111011",
  "00011111000",
  "00001110000",
  "00100000100",
  "01000100010",
  "00000100000",
]);

// Theme: crescent moon.
export const Moon = make("moon", [
  "00000111100",
  "00011100000",
  "00110000000",
  "01100000000",
  "01100000000",
  "01100000000",
  "01100000000",
  "01100000000",
  "00110000000",
  "00011100000",
  "00000111100",
]);

// Quiet mode: a bell with a slash.
export const BellOff = make("bell-off", [
  "00000100001",
  "00011111010",
  "00110001100",
  "00110001100",
  "00110011100",
  "00110110100",
  "00111100100",
  "01111001110",
  "00010000000",
  "00100111000",
  "01000000000",
]);

// Profile: head and shoulders.
export const UserRound = make("user", [
  "00000000000",
  "00001110000",
  "00011111000",
  "00011111000",
  "00001110000",
  "00000000000",
  "00111111100",
  "01111111110",
  "11111111111",
  "11111111111",
  "00000000000",
]);

// Sign out: a door with an arrow leaving it.
export const LogOut = make("log-out", [
  "11111000000",
  "10000000000",
  "10000000000",
  "10000001000",
  "10000001100",
  "10001111110",
  "10000001100",
  "10000001000",
  "10000000000",
  "10000000000",
  "11111000000",
]);
