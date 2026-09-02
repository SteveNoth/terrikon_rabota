/**
 * Переходник уведомлений (Закон 6).
 *
 * Страницы зовут `notify.send`, а не Telegram API напрямую.
 * NOTIFY_DRIVER=telegram | none.
 */
import { sendTelegramMessage } from "@/lib/telegram/api";

export type NotifyMessage = {
  text: string;
  chatId?: string;
};

export type NotifyResult = {
  ok: boolean;
};

export interface NotifyAdapter {
  send(message: NotifyMessage): Promise<NotifyResult>;
}

class TelegramNotify implements NotifyAdapter {
  async send(message: NotifyMessage): Promise<NotifyResult> {
    if (!message.chatId) {
      return { ok: false };
    }
    const result = await sendTelegramMessage(message.chatId, message.text);
    return { ok: result.ok };
  }
}

class NoneNotify implements NotifyAdapter {
  async send(message: NotifyMessage): Promise<NotifyResult> {
    void message;
    return { ok: true };
  }
}

function createNotify(): NotifyAdapter {
  const driver = (process.env.NOTIFY_DRIVER ?? "telegram").toLowerCase();
  if (driver === "none") {
    return new NoneNotify();
  }
  return new TelegramNotify();
}

export const notify = createNotify();
