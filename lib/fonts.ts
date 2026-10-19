import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";

// "Press" identity type stack: editorial serif headlines, neutral UI sans,
// monospace for ledgers / labels / numbers. Shared by the dashboard and auth pages.
const displayFont = Playfair_Display({ subsets: ["latin"], variable: "--font-display", display: "swap", weight: ["600", "700", "800"] });
const uiFont = Inter({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const ledgerFont = JetBrains_Mono({ subsets: ["latin"], variable: "--font-ledger", display: "swap", weight: ["400", "500", "600"] });

export const PRESS_FONT_VARS = `${displayFont.variable} ${uiFont.variable} ${ledgerFont.variable}`;
