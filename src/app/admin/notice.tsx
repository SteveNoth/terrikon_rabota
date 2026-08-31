export function AdminNotice({
  query,
}: {
  query: Record<string, string | string[] | undefined>;
}) {
  const notice = first(query.notice);
  const error = first(query.error);
  const warn = first(query.warn);
  if (!notice && !error && !warn) {
    return null;
  }
  return (
    <>
      {notice ? <p className="admin-notice">{notice}</p> : null}
      {warn ? <p className="admin-notice admin-notice-error">{warn}</p> : null}
      {error ? <p className="admin-notice admin-notice-error">{error}</p> : null}
    </>
  );
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function first(value: string | string[] | undefined): string | undefined {
  return firstParam(value);
}
