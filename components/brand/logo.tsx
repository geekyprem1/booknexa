interface LogoProps {
  /** Sizing classes (e.g. "h-9 text-[15px]"). Height drives the mark; text-* sets the wordmark size. */
  className?: string;
  /** "dark" for dark surfaces (white wordmark), "light" for light surfaces (navy wordmark). */
  variant?: "dark" | "light";
  /** Hide the "booknexa" wordmark and render only the mark. */
  showWordmark?: boolean;
}

/**
 * BookNexa brand logo.
 *
 * Renders the open-book + pen-nib mark from /public/booknexa-mark.png plus a
 * live-text wordmark — "book" in navy (white on dark) + "nexa" in the logo's
 * cyan → blue → violet → magenta gradient — so the lockup stays crisp at any
 * size and adapts to dark/light surfaces. The full raster lockup lives at
 * /public/booknexa-logo.png for places that need a single image.
 */
export function Logo({ className = "", variant = "dark", showWordmark = true }: LogoProps) {
  const isDark = variant === "dark";
  return (
    <span
      role="img"
      aria-label="BookNexa"
      className={`inline-flex items-center gap-2 whitespace-nowrap ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/booknexa-mark.png" alt="" className="h-full w-auto shrink-0 object-contain" />
      {showWordmark && (
        <span className={`brand-wordmark leading-none ${isDark ? "text-white" : "text-[#0A1630]"}`}>
          book
          <span className={`brand-gradient-text ${isDark ? "brand-gradient-text-bright" : ""}`}>nexa</span>
        </span>
      )}
    </span>
  );
}
