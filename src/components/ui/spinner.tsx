import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/format/cn";

const spinnerVariants = cva(
  "tr-spin inline-block rounded-pill border-2 border-border border-t-brand",
  {
    variants: {
      size: {
        sm: "size-4",
        md: "size-5",
        lg: "size-6",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type SpinnerProps = VariantProps<typeof spinnerVariants> & {
  className?: string;
  label?: string;
};

export function Spinner({ className, size, label = "Загрузка" }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(spinnerVariants({ size }), className)}
    />
  );
}
