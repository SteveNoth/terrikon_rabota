"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";
import { Icon, type IconName } from "@/components/ui/icon";

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-md min-h-tap min-w-tap " +
    "transition-colors duration-normal " +
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus " +
    "disabled:opacity-60 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-brand text-brand-text hover:bg-brand-hover",
        accent: "bg-accent text-accent-text hover:bg-accent-hover",
        outline: "border border-border bg-surface text-text hover:bg-surface-muted",
        ghost: "bg-transparent text-text hover:bg-surface-muted",
        danger: "bg-danger text-text-inverse",
      },
      size: {
        sm: "min-h-tap min-w-tap",
        md: "min-h-tap min-w-tap",
        lg: "min-h-tap min-w-tap p-1",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  },
);

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> &
  VariantProps<typeof iconButtonVariants> & {
    name: IconName;
    "aria-label": string;
  };

export function IconButton({
  className,
  variant,
  size,
  name,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    >
      <Icon name={name} size={size === "lg" ? "lg" : "md"} decorative />
    </button>
  );
}
