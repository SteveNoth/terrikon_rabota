import Link from "next/link";
import { TerriconLogo } from "@/components/brand/TerriconLogo";
import { cn } from "@/lib/format/cn";

export function BrandLockup({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="Террикон Работа"
      className={cn("flex min-w-0 items-center text-brand no-underline", className)}
    >
      <span className="inline-flex h-8 w-auto">
        <TerriconLogo />
      </span>
    </Link>
  );
}
