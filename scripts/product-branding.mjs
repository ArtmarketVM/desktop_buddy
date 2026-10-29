// Published compatibility assets keep their original names; new releases use sumi.
export function assetPrefix(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error("Invalid asset version");
  const [major, minor, patch] = version.split(".").map(Number);
  return major > 0 || minor > 49 || (minor === 49 && patch >= 2)
    ? "sumi"
    : "Desktop.Buddy";
}
