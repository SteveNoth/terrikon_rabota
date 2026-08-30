import { navigatorAnchorAttrs } from "@/lib/maps/points";

export function NavigatorLink({
  href,
  className = "text-brand underline-offset-2 hover:underline",
}: {
  href: string;
  className?: string;
}) {
  return (
    <a href={href} className={className} {...navigatorAnchorAttrs(href)}>
      Открыть в навигаторе
    </a>
  );
}
