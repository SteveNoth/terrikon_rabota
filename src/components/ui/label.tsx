import { cva, type VariantProps } from "class-variance-authority";
import type { LabelHTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const labelVariants = cva("inline-flex min-h-tap items-center text-sm font-medium text-text", {
  variants: {
    tone: {
      default: "text-text",
      muted: "text-muted font-normal",
      danger: "text-danger",
    },
  },
  defaultVariants: { tone: "default" },
});

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement> &
  VariantProps<typeof labelVariants>;

export function Label({ className, tone, ...props }: LabelProps) {
  return <label className={cn(labelVariants({ tone }), className)} {...props} />;
}
