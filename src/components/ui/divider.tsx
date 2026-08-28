import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const dividerVariants = cva("border-border", {
  variants: {
    orientation: {
      horizontal: "block w-full border-t",
      vertical: "inline-block min-h-tap self-stretch border-l",
    },
    tone: {
      default: "border-border",
      strong: "border-border-strong",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
    tone: "default",
  },
});

export type DividerProps = HTMLAttributes<HTMLHRElement> &
  VariantProps<typeof dividerVariants>;

export function Divider({ className, orientation, tone, ...props }: DividerProps) {
  return (
    <hr
      className={cn(dividerVariants({ orientation, tone }), className)}
      {...props}
    />
  );
}
