import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const cardVariants = cva("rounded-lg border p-4", {
  variants: {
    variant: {
      default: "border-border bg-surface shadow-1",
      muted: "border-border bg-surface-muted",
      outline: "border-border-strong bg-transparent",
      inverse: "border-transparent bg-surface-inverse text-text-inverse",
      interactive:
        "border-border bg-surface shadow-1 transition duration-normal hover:border-brand hover:bg-surface-muted hover:shadow-2 group-focus-visible:border-brand group-focus-visible:bg-surface-muted group-focus-visible:shadow-2",
    },
    padding: {
      sm: "p-3",
      md: "p-4",
      lg: "p-6",
    },
  },
  defaultVariants: {
    variant: "default",
    padding: "md",
  },
});

export type CardProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof cardVariants>;

export function Card({ className, variant, padding, ...props }: CardProps) {
  return <div className={cn(cardVariants({ variant, padding }), className)} {...props} />;
}
