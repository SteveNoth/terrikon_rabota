import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button-variants";
import { cn } from "@/lib/format/cn";
import type { MapPoint } from "@/lib/maps/types";
import Link from "next/link";

export function MapSelectedCard({
  point,
  onClose,
}: {
  point: MapPoint;
  onClose: () => void;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-2" padding="md">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 font-display text-lg font-medium">{point.title}</p>
        <button
          type="button"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          onClick={onClose}
        >
          Закрыть
        </button>
      </div>
      <p className="font-medium">{point.salary}</p>
      {point.districtName ? <p className="text-sm text-muted">{point.districtName}</p> : null}
      {point.address ? <p className="min-w-0 break-words text-sm">{point.address}</p> : null}
      {point.accuracyNote ? <p className="text-sm text-muted">{point.accuracyNote}</p> : null}
      <p>
        <Link href={point.href} className="text-brand underline-offset-2 hover:underline">
          Открыть вакансию
        </Link>
      </p>
    </Card>
  );
}
