/** A small pixel "?" that shows one sentence on hover or focus. */
export function Hint({ text }: { text: string }) {
  return (
    <span className="hint" role="img" tabIndex={0} aria-label={text}>
      ?
    </span>
  );
}
