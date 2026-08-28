import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  // База всех кнопок сайта. Тень всем кнопкам = одна правка здесь (например, добавить shadow-1).
  "inline-flex items-center justify-center gap-2 font-medium rounded-md min-h-tap px-4 text-md " +
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
        sm: "min-h-tap px-3 text-sm",
        md: "min-h-tap px-4 text-md",
        lg: "min-h-tap px-6 text-lg",
      },
      full: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
