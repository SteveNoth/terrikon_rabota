import {
  ANY_SPHERE_LABEL,
  CALLBACK,
  REPLY_BUTTONS,
} from "@/lib/telegram/constants";
import { getSelectableCities } from "@/lib/geo";
import { spheresForButtons } from "@/lib/telegram/texts";

export type InlineButton = {
  text: string;
  callback_data?: string;
  url?: string;
};

export type ReplyMarkup =
  | { keyboard: { text: string }[][]; resize_keyboard: true; is_persistent: true }
  | { inline_keyboard: InlineButton[][] }
  | { remove_keyboard: true };

export function mainReplyKeyboard(): ReplyMarkup {
  return {
    keyboard: [
      [{ text: REPLY_BUTTONS.subscribe }, { text: REPLY_BUTTONS.latest }],
      [{ text: REPLY_BUTTONS.city }, { text: REPLY_BUTTONS.unsubscribe }],
      [{ text: REPLY_BUTTONS.help }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function startInlineKeyboard(): ReplyMarkup {
  return {
    inline_keyboard: [
      [
        { text: REPLY_BUTTONS.subscribe, callback_data: CALLBACK.cmdSubscribe },
        { text: REPLY_BUTTONS.latest, callback_data: CALLBACK.cmdLatest },
      ],
      [
        { text: REPLY_BUTTONS.city, callback_data: CALLBACK.cmdCity },
        { text: "Привязать кабинет", callback_data: CALLBACK.cmdLink },
      ],
    ],
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    rows.push(items.slice(i, i + size));
  }
  return rows;
}

export function cityInlineKeyboard(): ReplyMarkup {
  const buttons = getSelectableCities().map((city) => ({
    text: city.status === "active" ? city.name.nom : `${city.name.nom} · скоро`,
    callback_data: `${CALLBACK.cityPrefix}${city.slug}`,
  }));
  return { inline_keyboard: chunk(buttons, 2) };
}

export function sphereInlineKeyboard(): ReplyMarkup {
  const buttons = spheresForButtons().map((sphere) => ({
    text: sphere.name,
    callback_data: `${CALLBACK.spherePrefix}${sphere.slug}`,
  }));
  const rows = chunk(buttons, 2);
  rows.push([{ text: ANY_SPHERE_LABEL, callback_data: CALLBACK.anySphere }]);
  return { inline_keyboard: rows };
}

export function vacancyOpenKeyboard(url: string): ReplyMarkup {
  return {
    inline_keyboard: [[{ text: "Открыть на сайте", url }]],
  };
}
