import { CALLBACK, REPLY_BUTTONS } from "@/lib/telegram/constants";
import { isTelegramLinkCode } from "@/lib/seeker/link-code";

export type TelegramCommand =
  | "start"
  | "help"
  | "subscribe"
  | "unsubscribe"
  | "latest"
  | "city"
  | "link";

export type IncomingUpdate =
  | { kind: "command"; chatId: string; command: TelegramCommand; args: string; callbackId?: string }
  | { kind: "callback"; chatId: string; data: string; callbackId: string }
  | { kind: "text"; chatId: string; text: string }
  | { kind: "ignore" };

type TelegramUserRef = { id?: number | string };
type TelegramChatRef = { id?: number | string };
type TelegramMessage = {
  chat?: TelegramChatRef;
  from?: TelegramUserRef;
  text?: string;
};
type TelegramCallback = {
  id?: string;
  data?: string;
  from?: TelegramUserRef;
  message?: TelegramMessage;
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallback;
};

const COMMANDS = new Set<TelegramCommand>([
  "start",
  "help",
  "subscribe",
  "unsubscribe",
  "latest",
  "city",
  "link",
]);

function chatIdFrom(value: number | string | undefined): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function stripBotSuffix(token: string): string {
  const at = token.indexOf("@");
  return at === -1 ? token : token.slice(0, at);
}

function commandFromSlash(text: string): { command: string; args: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const [head, ...rest] = trimmed.split(/\s+/);
  if (!head) {
    return null;
  }
  return { command: stripBotSuffix(head.slice(1)).toLowerCase(), args: rest.join(" ").trim() };
}

function commandFromButton(text: string): TelegramCommand | null {
  const trimmed = text.trim();
  if (trimmed === REPLY_BUTTONS.subscribe) return "subscribe";
  if (trimmed === REPLY_BUTTONS.latest) return "latest";
  if (trimmed === REPLY_BUTTONS.city) return "city";
  if (trimmed === REPLY_BUTTONS.unsubscribe) return "unsubscribe";
  if (trimmed === REPLY_BUTTONS.help) return "help";
  return null;
}

function commandFromCallback(data: string): TelegramCommand | null {
  if (data === CALLBACK.cmdSubscribe) return "subscribe";
  if (data === CALLBACK.cmdUnsubscribe) return "unsubscribe";
  if (data === CALLBACK.cmdLatest) return "latest";
  if (data === CALLBACK.cmdCity) return "city";
  if (data === CALLBACK.cmdHelp) return "help";
  if (data === CALLBACK.cmdLink) return "link";
  return null;
}

export function parseUpdate(update: TelegramUpdate | null | undefined): IncomingUpdate {
  if (!update) {
    return { kind: "ignore" };
  }

  const callback = update.callback_query;
  if (callback) {
    const chatId =
      chatIdFrom(callback.message?.chat?.id) ?? chatIdFrom(callback.from?.id);
    const data = typeof callback.data === "string" ? callback.data : "";
    const callbackId = typeof callback.id === "string" ? callback.id : "";
    if (!chatId || !callbackId) {
      return { kind: "ignore" };
    }
    const asCommand = commandFromCallback(data);
    if (asCommand) {
      return { kind: "command", chatId, command: asCommand, args: "", callbackId };
    }
    return { kind: "callback", chatId, data, callbackId };
  }

  const message = update.message;
  if (!message) {
    return { kind: "ignore" };
  }
  const chatId = chatIdFrom(message.chat?.id);
  const text = typeof message.text === "string" ? message.text : "";
  if (!chatId || !text.trim()) {
    return { kind: "ignore" };
  }

  const slash = commandFromSlash(text);
  if (slash && COMMANDS.has(slash.command as TelegramCommand)) {
    return {
      kind: "command",
      chatId,
      command: slash.command as TelegramCommand,
      args: slash.args,
    };
  }

  const fromButton = commandFromButton(text);
  if (fromButton) {
    return { kind: "command", chatId, command: fromButton, args: "" };
  }

  if (isTelegramLinkCode(text.trim().toUpperCase())) {
    return { kind: "command", chatId, command: "link", args: text.trim().toUpperCase() };
  }

  return { kind: "text", chatId, text };
}
