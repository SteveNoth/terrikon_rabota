import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const skeletonVariants = cva("animate-pulse bg-surface-muted", {
  variants: {
    shape: {
      line: "h-4 w-full rounded-md",
      title: "h-6 w-2/3 rounded-md",
      circle: "size-6 rounded-pill",
      block: "h-8 w-full rounded-md",
    },
  },
  defaultVariants: { shape: "line" },
});

export type SkeletonProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof skeletonVariants>;

export function Skeleton({ className, shape, ...props }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(skeletonVariants({ shape }), className)}
      {...props}
    />
  );
}
