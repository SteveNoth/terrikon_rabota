import type { Metadata } from "next";
import { isAdminRequest } from "@/lib/admin/auth";
import { queueSummary } from "@/lib/admin/queue";
import { employerQueueSummary } from "@/lib/admin/employer-queue";
import { AdminNav } from "@/app/admin/nav";
import { log } from "@/lib/log";
import "./admin.css";

export const metadata: Metadata = {
  title: "Админка | Террикон Работа",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ok = await isAdminRequest();
  if (!ok) {
    return <div className="admin">{children}</div>;
  }

  let queueSize = 0;
  let employerQueueSize = 0;
  try {
    const [parser, cabinet] = await Promise.all([queueSummary(), employerQueueSummary()]);
    queueSize = parser.total;
    employerQueueSize = cabinet.total;
  } catch (cause) {
    log.error("admin", "очередь", cause);
  }

  return (
    <div className="admin">
      <div className="admin-shell">
        <AdminNav queueSize={queueSize} employerQueueSize={employerQueueSize} />
        <div className="admin-main">{children}</div>
      </div>
    </div>
  );
}
