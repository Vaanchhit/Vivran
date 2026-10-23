/** Vivran's loading indicator: an open book with pages turning.
 * Drop-in for a spinning icon — size it with the same w-/h- classes; it
 * draws in currentColor, so it follows the text colour it sits in. */
export function BookLoader({ className = "w-4 h-4", label }: { className?: string; label?: string }) {
  return (
    <span
      className={`book-loader ${className}`}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="bl-half bl-left" />
      <span className="bl-half bl-right" />
      <span className="bl-half bl-right bl-flip" />
      <span className="bl-half bl-right bl-flip bl-flip-2" />
    </span>
  );
}

/** Full-screen loading: a large book turning its pages, with a line under it. */
export function PageLoader({ text = "Opening your workspace…" }: { text?: string }) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-muted">
      <BookLoader className="book-loader-lg w-16 h-16 text-foreground" label="Loading Vivran" />
      <span className="text-xs tracking-wide">{text}</span>
    </div>
  );
}
