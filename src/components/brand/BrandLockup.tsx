import Link from "next/link";
import { TerriconMark } from "@/components/brand/TerriconMark";

export function BrandLockup({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-2 text-brand no-underline"
    >
      <TerriconMark />
      <span className="whitespace-nowrap font-display text-xl font-semibold leading-tight tracking-tight">
        Террикон Работа
      </span>
    </Link>
  );
}
