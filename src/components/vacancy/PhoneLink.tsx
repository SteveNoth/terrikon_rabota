import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { VacancyPhoneView } from "@/lib/vacancy/view";

export function PhoneLink({ phone }: { phone: VacancyPhoneView }) {
  return (
    <a
      href={phone.telHref}
      className={cn(buttonVariants({ variant: "primary" }), "min-w-0 justify-start")}
    >
      <span className="sr-only">Позвонить {phone.readable}</span>
      <span className="phone-obf" aria-hidden="true">
        <span className="phone-bait">0</span>
        {phone.reversed}
        <span className="phone-bait">8</span>
      </span>
    </a>
  );
}
