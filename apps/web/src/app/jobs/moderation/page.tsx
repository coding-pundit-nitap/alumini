import { redirect } from "next/navigation";

/** The queue moved under the admin shell (12C C12-9). Kept for links in sent notifications ("job.submitted"). */
export default function JobModerationPage() {
  redirect("/admin/jobs");
}
