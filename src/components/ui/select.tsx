"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const selectVariants = cva(
  "block w-full min-h-tap rounded-md border bg-surface px-3 text-md text-text " +
    "transition-colors duration-normal " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
    "disabled:opacity-60 disabled:pointer-events-none",
  {
    variants: {
      invalid: {
        false: "border-border",
        true: "border-danger",
      },
      size: {
        sm: "min-h-tap px-2 text-sm",
        md: "min-h-tap px-3 text-md",
        lg: "min-h-tap px-4 text-lg",
      },
    },
    defaultVariants: {
      invalid: false,
      size: "md",
    },
  },
);

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> &
  VariantProps<typeof selectVariants>;

export function Select({ className, invalid, size, children, ...props }: SelectProps) {
  return (
    <select className={cn(selectVariants({ invalid, size }), className)} {...props}>
      {children}
    </select>
  );
}
