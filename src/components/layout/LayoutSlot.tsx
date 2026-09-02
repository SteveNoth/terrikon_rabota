import { cn } from "@/lib/format/cn";
import type { ReactNode } from "react";

export function LayoutSlot({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  if (!children) {
    return <span className={cn("contents", className)} />;
  }

  return <span className={cn("contents", className)}>{children}</span>;
}
