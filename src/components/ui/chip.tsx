"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const chipVariants = cva(
  "inline-flex items-center gap-2 rounded-pill min-h-tap px-3 text-sm font-medium " +
    "transition-colors duration-normal " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
    "disabled:opacity-60 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-surface-muted text-text hover:bg-border",
        outline: "border border-border bg-surface text-text hover:bg-surface-muted",
        accent: "bg-accent text-accent-text",
        active: "bg-brand text-brand-text",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof chipVariants> & {
    pressed?: boolean;
  };

export function Chip({
  className,
  variant,
  pressed,
  type = "button",
  ...props
}: ChipProps) {
  const resolved = pressed ? "active" : variant;

  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={cn(chipVariants({ variant: resolved }), className)}
      {...props}
    />
  );
}
