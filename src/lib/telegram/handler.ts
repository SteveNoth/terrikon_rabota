import { getCity, getDefaultCity, isActiveCity, isCitySlug, resolveCityFromText } from "@/lib/geo";
import { getSphere, listSpheres } from "@/lib/professions";
import {
  CALLBACK,
  TELEGRAM_DIALOGS,
} from "@/lib/telegram/constants";
import { answerCallbackQuery, sendTelegramMessage } from "@/lib/telegram/api";
import { formatVacancyMessage, vacancyPublicUrl } from "@/lib/telegram/format";
import {
  cityInlineKeyboard,
  mainReplyKeyboard,
  sphereInlineKeyboard,
  vacancyOpenKeyboard,
  type ReplyMarkup,
} from "@/lib/telegram/keyboards";
import { isAnySphereToken, parseKeywords } from "@/lib/telegram/match";
import { parseUpdate, type TelegramUpdate } from "@/lib/telegram/parse";
import { isTelegramLinkCode } from "@/lib/seeker/link-code";
import {
  askKeywordsText,
  askLinkCodeText,
  askSphereText,
  cityActiveSetText,
  cityInactiveText,
  cityListText,
  cityUnknownText,
  helpText,
  latestEmptyText,
  latestIntroText,
  linkBadCodeText,
  linkAlreadyText,
  linkOkText,
  startText,
  subscribedText,
  unsubscribedText,
  alreadyUnsubscribedText,
  unknownText,
} from "@/lib/telegram/texts";
import {
  deactivateSubscription,
  ensureTelegramUser,
  linkTelegramToUser,
  listLatestForChat,
  saveSubscription,
  setTelegramCity,
  setTelegramDialog,
  type TelegramSubscriber,
} from "@/lib/repo/telegram";

async function reply(chatId: string, text: string, markup?: ReplyMarkup): Promise<void> {
  let result = await sendTelegramMessage(chatId, text, markup);
  if (!result.ok && markup) {
    result = await sendTelegramMessage(chatId, text);
  }
  if (!result.ok) {
    console.error("[telegram] sendMessage", result.description ?? "fail");
  }
}

async function ack(callbackId: string | undefined): Promise<void> {
  if (!callbackId) {
    return;
  }
  await answerCallbackQuery(callbackId);
}

function sphereFromText(text: string): string[] | null {
  if (isAnySphereToken(text)) {
    return [];
  }
  const needle = text.trim().toLocaleLowerCase("ru-RU");
  const hit = listSpheres().find(
    (sphere) => sphere.name.toLocaleLowerCase("ru-RU") === needle || sphere.slug === needle,
  );
  return hit ? [hit.slug] : null;
}

async function beginSubscribe(chatId: string, user: TelegramSubscriber): Promise<void> {
  await setTelegramDialog(user.id, TELEGRAM_DIALOGS.keywords, []);
  await reply(chatId, askKeywordsText(), mainReplyKeyboard());
}

async function finishSubscribe(
  chatId: string,
  user: TelegramSubscriber,
  keywords: string[],
  spheres: string[],
): Promise<void> {
  const saved = await saveSubscription(user.id, {
    citySlug: user.citySlug,
    keywords,
    spheres,
  });
  await reply(chatId, subscribedText(saved), mainReplyKeyboard());
}

async function handleLatest(chatId: string, user: TelegramSubscriber): Promise<void> {
  const citySlug = isActiveCity(user.citySlug) ? user.citySlug : getDefaultCity().slug;
  const items = await listLatestForChat(citySlug);
  if (items.length === 0) {
    await reply(chatId, latestEmptyText(citySlug), mainReplyKeyboard());
    return;
  }
  await reply(chatId, latestIntroText(citySlug, items.length), mainReplyKeyboard());
  for (const item of items) {
    await sendTelegramMessage(
      chatId,
      formatVacancyMessage(item),
      vacancyOpenKeyboard(vacancyPublicUrl(item.citySlug, item.slug)),
    );
  }
}

async function handleCityChoice(chatId: string, user: TelegramSubscriber, slug: string): Promise<void> {
  const city = getCity(slug);
  if (!city) {
    await reply(chatId, cityUnknownText(), cityInlineKeyboard());
    return;
  }
  if (city.status !== "active") {
    const fallback = getDefaultCity();
    await setTelegramCity(user.id, fallback.slug);
    await reply(chatId, cityInactiveText(city), mainReplyKeyboard());
    return;
  }
  await setTelegramCity(user.id, city.slug);
  await reply(chatId, cityActiveSetText(city), mainReplyKeyboard());
}

async function handleLink(chatId: string, user: TelegramSubscriber, code: string): Promise<void> {
  if (!code) {
    await setTelegramDialog(user.id, TELEGRAM_DIALOGS.link, []);
    await reply(chatId, askLinkCodeText(), mainReplyKeyboard());
    return;
  }
  const already = Boolean(user.userId);
  const result = await linkTelegramToUser(user.id, code);
  if (!result.ok) {
    await reply(chatId, linkBadCodeText(), mainReplyKeyboard());
    return;
  }
  await reply(chatId, already ? linkAlreadyText() : linkOkText(), mainReplyKeyboard());
}

async function handleCommand(
  chatId: string,
  user: TelegramSubscriber,
  command: string,
  args: string,
): Promise<void> {
  switch (command) {
    case "start": {
      await setTelegramDialog(user.id, TELEGRAM_DIALOGS.idle, []);
      await reply(chatId, startText(), mainReplyKeyboard());
      if (args && isTelegramLinkCode(args.trim().toUpperCase())) {
        await handleLink(chatId, user, args);
      }
      return;
    }
    case "help":
      await setTelegramDialog(user.id, TELEGRAM_DIALOGS.idle, []);
      await reply(chatId, helpText(), mainReplyKeyboard());
      return;
    case "subscribe":
      await beginSubscribe(chatId, user);
      return;
    case "unsubscribe":
      if (!user.isActive) {
        await reply(chatId, alreadyUnsubscribedText(), mainReplyKeyboard());
        return;
      }
      await deactivateSubscription(user.id);
      await reply(chatId, unsubscribedText(), mainReplyKeyboard());
      return;
    case "latest":
      await setTelegramDialog(user.id, TELEGRAM_DIALOGS.idle, []);
      await handleLatest(chatId, user);
      return;
    case "city":
      await setTelegramDialog(user.id, TELEGRAM_DIALOGS.idle, []);
      await reply(chatId, cityListText(), cityInlineKeyboard());
      return;
    case "link":
      await handleLink(chatId, user, args);
      return;
    default:
      await reply(chatId, unknownText(), mainReplyKeyboard());
  }
}

export async function handleTelegramUpdate(raw: TelegramUpdate): Promise<void> {
  const incoming = parseUpdate(raw);
  if (incoming.kind === "ignore") {
    return;
  }

  const user = await ensureTelegramUser(incoming.chatId);
  const chatId = incoming.chatId;

  if (incoming.kind === "command") {
    await ack(incoming.callbackId);
    await handleCommand(chatId, user, incoming.command, incoming.args);
    return;
  }

  if (incoming.kind === "callback") {
    await ack(incoming.callbackId);
    const data = incoming.data;
    if (data.startsWith(CALLBACK.cityPrefix)) {
      const slug = data.slice(CALLBACK.cityPrefix.length);
      if (isCitySlug(slug)) {
        await handleCityChoice(chatId, user, slug);
      } else {
        await reply(chatId, cityUnknownText(), cityInlineKeyboard());
      }
      return;
    }
    if (data === CALLBACK.anySphere || data.startsWith(CALLBACK.spherePrefix)) {
      const token = data === CALLBACK.anySphere ? "*" : data.slice(CALLBACK.spherePrefix.length);
      const spheres = isAnySphereToken(token) ? [] : getSphere(token) ? [token] : null;
      if (spheres === null) {
        await reply(chatId, askSphereText(user.pendingKeywords), sphereInlineKeyboard());
        return;
      }
      const keywords = user.pendingKeywords.length ? user.pendingKeywords : user.keywords;
      await finishSubscribe(chatId, user, keywords, spheres);
      return;
    }
    await reply(chatId, unknownText(), mainReplyKeyboard());
    return;
  }

  const text = incoming.text.trim();

  if (user.dialog === TELEGRAM_DIALOGS.keywords) {
    const keywords = parseKeywords(text);
    if (keywords.length === 0) {
      await reply(chatId, askKeywordsText(), mainReplyKeyboard());
      return;
    }
    await setTelegramDialog(user.id, TELEGRAM_DIALOGS.sphere, keywords);
    await reply(chatId, askSphereText(keywords), sphereInlineKeyboard());
    return;
  }

  if (user.dialog === TELEGRAM_DIALOGS.sphere) {
    const spheres = sphereFromText(text);
    if (spheres === null) {
      await reply(chatId, askSphereText(user.pendingKeywords), sphereInlineKeyboard());
      return;
    }
    await finishSubscribe(chatId, user, user.pendingKeywords, spheres);
    return;
  }

  if (user.dialog === TELEGRAM_DIALOGS.link) {
    await handleLink(chatId, user, text);
    return;
  }

  const fromGeo = resolveCityFromText(text);
  if (fromGeo) {
    await handleCityChoice(chatId, user, fromGeo);
    return;
  }

  await reply(chatId, unknownText(), mainReplyKeyboard());
}
