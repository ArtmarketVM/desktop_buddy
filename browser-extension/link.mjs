export function goalLink(text) {
  if (
    typeof text !== "string" ||
    !text.trim() ||
    [...text.trim()].length > 4000 ||
    text.includes("\0")
  )
    throw new Error("Select between 1 and 4,000 characters.");
  return `desktopbuddy://goal?text=${encodeURIComponent(text.trim())}`;
}
