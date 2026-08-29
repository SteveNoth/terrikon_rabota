/**
 * Переходник уведомлений (Закон 6).
 *
 * По умолчанию NOTIFY_DRIVER=telegram. На этом этапе в сеть не ходим: бот
 * и рассылка появятся позже. Важно, что страницы будут звать `notify.send`,
 * а не Telegram API напрямую.
 */

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
    void message;
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return { ok: false };
    }
    return { ok: false };
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
