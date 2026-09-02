"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";
import { chipVariants, type ChipVariantProps } from "@/components/ui/chip-variants";

export { chipVariants } from "@/components/ui/chip-variants";

export type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> &
  ChipVariantProps & {
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
