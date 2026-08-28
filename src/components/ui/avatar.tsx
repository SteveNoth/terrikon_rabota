import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/format/cn";

const AVATAR_TONES = [
  "bg-brand text-brand-text",
  "bg-accent text-accent-text",
  "bg-success text-text-inverse",
  "bg-info text-text-inverse",
  "bg-warning text-accent-text",
  "bg-danger text-text-inverse",
  "bg-surface-inverse text-text-inverse",
  "bg-chart-6 text-text-inverse",
] as const;

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

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return "?";
}

function toneFromName(name: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

export type AvatarProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof avatarVariants> & {
    name: string;
  };

export function Avatar({ className, size, name, ...props }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={`Аватар: ${name}`}
      className={cn(avatarVariants({ size }), toneFromName(name), className)}
      {...props}
    >
      {initialsFromName(name)}
    </span>
  );
}
