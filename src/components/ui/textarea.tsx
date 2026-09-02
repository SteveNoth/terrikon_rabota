"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const textareaVariants = cva(
  "block w-full min-h-tap rounded-md border bg-surface px-3 py-2 text-md text-text " +
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
        sm: "min-h-7 px-2 py-2 text-sm",
        md: "min-h-8 px-3 py-2 text-md",
        lg: "min-h-8 px-4 py-3 text-lg",
      },
    },
    defaultVariants: {
      invalid: false,
      size: "md",
    },
  },
);

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> &
  VariantProps<typeof textareaVariants>;

export function Textarea({ className, invalid, size, ...props }: TextareaProps) {
  return (
    <textarea className={cn(textareaVariants({ invalid, size }), className)} {...props} />
  );
}
