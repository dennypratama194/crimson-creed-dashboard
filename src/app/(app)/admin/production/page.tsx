import { redirect } from "next/navigation";

export default function AdminProductionIndex() {
  redirect("/admin/production/logs");
}
