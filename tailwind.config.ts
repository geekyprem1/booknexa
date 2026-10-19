import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── BookNexa brand (blue → purple) ──
        // NOTE: token keys kept as `gold*` for backwards-compat with existing
        // `brand-gold*` utility classes; the values are the blue brand palette.
        brand: {
          dark: "#0B1E3B", // deep navy — sidebar / headers
          gold: "#2563EB", // primary accent, CTAs, active states (blue-600)
          "gold-dark": "#1D4ED8", // hover end (blue-700)
          "gold-soft": "#DBEAFE", // accent tints (badges, chips) (blue-100)
          cream: "#E8F0FB", // page background (light blue)
          // Explicit blue aliases for new code.
          blue: "#2563EB",
          "blue-dark": "#1D4ED8",
          "blue-soft": "#DBEAFE",
          navy: "#0B1E3B",
          // Logo gradient end + tints (BookNexa blue → purple).
          purple: "#7C3AED",
          "purple-dark": "#6D28D9",
          "purple-soft": "#EDE9FE",
        },
        // Amazon KDP accent — use ONLY on "Publish to KDP" / Amazon-facing actions.
        kdp: {
          DEFAULT: "#FF9900",
          dark: "#E88B00",
        },
        // ── "Press" identity (dashboard v2) — colours taken from the BookNexa logo ──
        // Navy ink (the "book" letters), cool paper surfaces, and the logo's
        // cyan → blue → violet → magenta spectrum for actions and highlights.
        paper: {
          DEFAULT: "#F4F6FB", // page background
          deep: "#E7EBF5", // muted surfaces, hover fills
          card: "#FFFFFF", // raised cards
        },
        ink: {
          DEFAULT: "#0A1630", // logo navy — primary text, dark surfaces
          soft: "#2E3A5C", // secondary text
          muted: "#5A6585", // tertiary text (≥4.5:1 on paper)
          faint: "#9AA3BC", // decorative separators / arrows only (not body text)
        },
        marker: {
          DEFAULT: "#22C1FF", // logo cyan — highlights on dark surfaces (navy text on top)
          deep: "#00A8F5", // hover
          soft: "#E3EBFF", // active / selected fill on light surfaces
        },
        nexa: {
          cyan: "#00B8FF",
          blue: "#1463FF",
          indigo: "#3B2BEF",
          violet: "#7B2CF5",
          magenta: "#B83CF6",
        },
        forest: {
          DEFAULT: "#047857", // success (emerald)
          soft: "#D1FAE5",
        },
        clay: {
          DEFAULT: "#D9324A", // needs attention (rose)
          soft: "#FDE3E7",
        },
        rule: {
          DEFAULT: "#D9DFEC", // hairline borders
          strong: "#B9C2D6", // inputs, secondary buttons
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        ui: ["var(--font-ui)", "ui-sans-serif", "system-ui", "sans-serif"],
        ledger: ["var(--font-ledger)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
        press: "4px 4px 0 0 #0A1630", // offset "letterpress" shadow
        "press-sm": "2px 2px 0 0 #0A1630",
        glow: "0 10px 30px -10px rgb(20 99 255 / 0.55)",
      },
    },
  },
  plugins: [],
};

export default config;
