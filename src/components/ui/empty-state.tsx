"use client";

import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format/cn";
import { Icon, type IconName } from "@/components/ui/icon";

const emptyStateVariants = cva("flex flex-col items-center justify-center gap-3 text-center", {
  variants: {
    size: {
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    },
  },
  defaultVariants: { size: "md" },
});

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof emptyStateVariants> & {
    icon?: IconName;
    title: string;
    description?: string;
    action?: ReactNode;
  };

export function EmptyState({
  className,
  size,
  icon = "search",
  title,
  description,
  action,
  children,
  ...props
}: EmptyStateProps) {
  return (
    <div className={cn(emptyStateVariants({ size }), className)} {...props}>
      <Icon name={icon} size="lg" decorative />
      <p className="text-lg font-medium">{title}</p>
      {description ? <p className="max-w-container text-md text-muted">{description}</p> : null}
      {children}
      {action}
    </div>
  );
}
