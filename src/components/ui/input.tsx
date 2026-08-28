"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const inputVariants = cva(
  "block w-full min-h-tap rounded-md border bg-surface px-3 text-md text-text " +
    "placeholder:text-muted transition-colors duration-normal " +
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

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> &
  VariantProps<typeof inputVariants>;

export function Input({ className, invalid, size, ...props }: InputProps) {
  return (
    <input className={cn(inputVariants({ invalid, size }), className)} {...props} />
  );
}
