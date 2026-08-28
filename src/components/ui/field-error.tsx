import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const fieldErrorVariants = cva("text-sm", {
  variants: {
    tone: {
      danger: "text-danger",
      warning: "text-warning",
    },
  },
  defaultVariants: { tone: "danger" },
});

export type FieldErrorProps = HTMLAttributes<HTMLParagraphElement> &
  VariantProps<typeof fieldErrorVariants>;

export function FieldError({ className, tone, children, ...props }: FieldErrorProps) {
  if (!children) {
    return null;
  }

  return (
    <p role="alert" className={cn(fieldErrorVariants({ tone }), className)} {...props}>
      {children}
    </p>
  );
}
