import Link from "next/link";
import { TerriconLogo } from "@/components/brand/TerriconLogo";

export function BrandLockup({ href }: { href: string }) {
  return (
    <Link
      href={href}
      aria-label="Террикон Работа"
      className="flex min-w-0 items-center text-brand no-underline"
    >
      <TerriconLogo />
    </Link>
  );
}