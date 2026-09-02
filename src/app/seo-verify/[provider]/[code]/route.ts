import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function expectedCode(provider: string): string | undefined {
  if (provider === "yandex") {
    return process.env.NEXT_PUBLIC_YANDEX_VERIFICATION?.trim();
  }
  if (provider === "google") {
    return process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
  }
  return undefined;
}

function fileBody(provider: string, code: string): string {
  if (provider === "google") {
    return `google-site-verification: ${code}\n`;
  }
  return `<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
    </head>
    <body>Verification: ${code}</body>
</html>
`;
}

/** HTML-файлы Вебмастера/GSC. Браузерный `/` у нас редирект, файл робот качает напрямую. */
export async function GET(
  _request: Request,
  context: { params: Promise<{ provider: string; code: string }> },
) {
  const { provider, code } = await context.params;
  const expected = expectedCode(provider);
  if (!expected || code !== expected) {
    return new NextResponse("Not Found", { status: 404 });
  }
  const google = provider === "google";
  return new NextResponse(fileBody(provider, code), {
    headers: {
      "Content-Type": google ? "text/plain; charset=utf-8" : "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
