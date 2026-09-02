import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";
import { avatarToneClass, initialsFromName } from "@/lib/images/avatar";

const avatarVariants = cva(
  "inline-flex items-center justify-center overflow-hidden rounded-pill font-medium uppercase",
  {
    variants: {
      size: {
        sm: "size-5 text-xs",
        md: "min-h-tap min-w-tap text-sm",
        lg: "size-8 text-md",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type AvatarProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof avatarVariants> & {
    name: string;
  };

export function Avatar({ className, size, name, ...props }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={`Аватар: ${name}`}
      className={cn(avatarVariants({ size }), avatarToneClass(name), className)}
      {...props}
    >
      {initialsFromName(name)}
    </span>
  );
}