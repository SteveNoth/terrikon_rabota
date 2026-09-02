import { Alert } from "@/components/ui/alert";
import { firstQuery } from "@/lib/auth/next-path";

export function AuthNotice({
  query,
}: {
  query: Record<string, string | string[] | undefined>;
}) {
  const notice = firstQuery(query.notice);
  const review = firstQuery(query.review);
  const error = firstQuery(query.error);
  if (!notice && !review && !error) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {review ? <Alert tone="info">{review}</Alert> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}
    </div>
  );
}
