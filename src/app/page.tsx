import { redirect } from "next/navigation";

// The proxy sends signed-out visitors to /login; signed-in visitors continue
// to the dashboard.
export default function Home() {
  redirect("/dashboard");
}
