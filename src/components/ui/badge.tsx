import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-pill px-2 py-1 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-surface-muted text-text",
        brand: "bg-brand text-brand-text",
        accent: "bg-accent text-accent-text",
        success: "bg-success text-text-inverse",
        warning: "bg-warning text-accent-text",
        danger: "bg-danger text-text-inverse",
        info: "bg-info text-text-inverse",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
