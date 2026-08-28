"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const checkboxVariants = cva(
  "size-4 shrink-0 rounded-sm border border-border accent-brand " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
    "disabled:opacity-60 disabled:pointer-events-none",
  {
    variants: {
      invalid: {
        false: "border-border",
        true: "border-danger",
      },
    },
    defaultVariants: { invalid: false },
  },
);

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> &
  VariantProps<typeof checkboxVariants> & {
    label?: string;
  };

export function Checkbox({ className, invalid, label, id, ...props }: CheckboxProps) {
  const input = (
    <input
      id={id}
      type="checkbox"
      className={cn(checkboxVariants({ invalid }), className)}
      {...props}
    />
  );

  if (!label) {
    return input;
  }

  return (
    <label htmlFor={id} className="inline-flex min-h-tap cursor-pointer items-center gap-2 text-md">
      {input}
      <span>{label}</span>
    </label>
  );
}
