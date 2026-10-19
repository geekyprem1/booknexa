import { redirect } from "next/navigation";

// Landing page removed — root goes straight to login.
export default function Home() {
  redirect("/login");
}
