import type { Metadata } from "next";
import { isAdminRequest } from "@/lib/admin/auth";
import { queueSummary } from "@/lib/admin/queue";
import { AdminNav } from "@/app/admin/nav";
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

  const summary = await queueSummary();

  return (
    <div className="admin">
      <div className="admin-shell">
        <AdminNav queueSize={summary.total} />
        <div className="admin-main">{children}</div>
      </div>
    </div>
  );
}
