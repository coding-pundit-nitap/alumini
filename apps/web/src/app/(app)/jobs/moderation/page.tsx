import { redirect } from "next/navigation";

/** The queue moved under the admin shell. Kept for links in sent notifications ("job.submitted"). */
export default function JobModerationPage() {
  redirect("/admin/jobs");
}
