import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/format/cn";
import { TELEGRAM_CHANNEL_URL, telegramChannelTitle } from "@/lib/site";

export function TelegramChannelLink({ className }: { className?: string }) {
  const title = telegramChannelTitle();

  return (
    <a
      href={TELEGRAM_CHANNEL_URL}
      className={cn(
        "tr-tg-pulse inline-flex shrink-0 items-center justify-center rounded-pill bg-accent text-accent-text shadow-1",
        "min-h-tap min-w-tap transition-colors duration-normal hover:bg-accent-hover",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        className,
      )}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={title}
      title={title}
    >
      <Icon name="telegram" size="md" decorative />
    </a>
  );
}
