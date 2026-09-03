import Link from "next/link";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import { methodAriaLabel, type SupportMethod } from "@/lib/support";
import { SUPPORT_QR_BUTTON } from "@/lib/support/copy";
import type { QualityMode } from "@/lib/quality/types";

export function SupportMethodCard({
  method,
  mode,
  revealQr,
}: {
  method: SupportMethod;
  mode: QualityMode;
  revealQr: boolean;
}) {
  const showQr = Boolean(method.qrFile) && (mode === "full" || (mode === "lite" && revealQr));
  const qrButton = Boolean(method.qrFile) && mode === "lite" && revealQr === false;
  const external = Boolean(method.url);

  return (
    <Card variant="outline" className="flex min-w-0 flex-col gap-3">
      <h3 className="font-medium">{method.name}</h3>
      {method.caption ? <p className="text-sm text-muted">{method.caption}</p> : null}
      {method.requisite ? (
        <p className="min-w-0 break-all font-medium">{method.requisite}</p>
      ) : null}
      {external ? (
        <p>
          <a
            href={method.url}
            className={cn(buttonVariants({ variant: "outline" }))}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={methodAriaLabel(method)}
          >
            Открыть {method.name}
          </a>
        </p>
      ) : null}
      {qrButton ? (
        <p>
          <Link
            href={`/support?qr=${encodeURIComponent(method.id)}`}
            className={cn(buttonVariants({ variant: "ghost" }))}
          >
            {SUPPORT_QR_BUTTON}
          </Link>
        </p>
      ) : null}
      {showQr ? (
        // QR только после решения на сервере: в Lite без ?qr= тега нет, запроса нет.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={method.qrFile}
          alt={`QR-код: ${method.name}`}
          width={120}
          height={120}
          className="h-auto w-32 max-w-full border border-border"
          loading={mode === "full" ? "lazy" : "eager"}
          decoding="async"
        />
      ) : null}
    </Card>
  );
}
