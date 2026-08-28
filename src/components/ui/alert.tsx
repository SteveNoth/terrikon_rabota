import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const alertVariants = cva("rounded-md border p-4 text-md", {
  variants: {
    tone: {
      info: "border-info bg-surface text-text",
      success: "border-success bg-surface text-text",
      warning: "border-warning bg-surface text-text",
      danger: "border-danger bg-surface text-text",
    },
  },
  defaultVariants: { tone: "info" },
});

export type AlertProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>;

export function Alert({ className, tone, role, ...props }: AlertProps) {
  return (
    <div
      role={role ?? (tone === "danger" ? "alert" : "status")}
      className={cn(alertVariants({ tone }), className)}
      {...props}
    />
  );
}
