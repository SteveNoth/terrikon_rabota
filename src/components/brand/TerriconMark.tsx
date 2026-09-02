import { cn } from "@/lib/format/cn";

export function TerriconMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-8 shrink-0 text-brand", className)}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 25 14 13l4 6 4-8 7 14Z" className="fill-current opacity-30" />
      <path
        d="M3 25 13 9l4 7 4-9 10 18Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="21" cy="7.2" r="1.7" className="fill-accent" />
      <path
        d="M2 26h28"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
