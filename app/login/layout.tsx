import { PRESS_FONT_VARS } from "@/lib/fonts";

// Auth pages share the dashboard's "Press" type stack.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className={PRESS_FONT_VARS}>{children}</div>;
}
