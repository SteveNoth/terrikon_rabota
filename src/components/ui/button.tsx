"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";
import { buttonVariants, type ButtonVariantProps } from "@/components/ui/button-variants";

export { buttonVariants } from "@/components/ui/button-variants";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonVariantProps;

export function Button({
  className,
  variant,
  size,
  full,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size, full }), className)}
      {...props}
    />
  );
}
