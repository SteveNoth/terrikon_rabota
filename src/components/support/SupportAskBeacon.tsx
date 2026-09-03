import { SUPPORT_SHOWN_PATH } from "@/lib/support/ask";

/** Ставит cookie «уже просили» без JavaScript: браузер сам запрашивает адрес. */
export function SupportAskBeacon() {
  return (
    <iframe
      src={SUPPORT_SHOWN_PATH}
      title=""
      className="sr-only"
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
