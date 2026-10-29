import { RU } from './ru';
import { UK } from './uk';

/** The languages the player can pick in the settings. English is the code's own, with no dictionary */
export type Lang = 'en' | 'uk' | 'ru';
export const LANGS: readonly { readonly id: Lang; readonly name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'uk', name: 'Українська' },
  { id: 'ru', name: 'Русский' },
];
const DICTIONARIES: Readonly<Record<Lang, Readonly<Record<string, string>> | null>> = { en: null, uk: UK, ru: RU };

let current: Lang = 'en';

export function isLang(value: unknown): value is Lang {
  return LANGS.some(({ id }) => id === value);
}

/** The language kept from an earlier visit; English on the first one */
export function startingLang(kept: unknown): Lang {
  return isLang(kept) ? kept : 'en';
}

/** Picks the language: before the HUD is made, as its texts are put together once (a change reloads the page) */
export function setLang(picked: Lang) {
  current = picked;
  document.documentElement.lang = picked;
}

export function lang() {
  return current;
}

const warned = new Set<string>();

/** In development, a text with no translation is named once in the console: add it to uk.ts and ru.ts */
function warnMissing(text: string) {
  const key = `${current}:${text}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`No ${current} translation for ${JSON.stringify(text)}`);
}

/** The plural form a count takes in Ukrainian and Russian: one (21), few (22–24) or many (25, 11–14) */
function slavicForm(n: number) {
  const abs = Math.abs(Math.trunc(n));
  const ten = abs % 10;
  const hundred = abs % 100;
  if (ten === 1 && hundred !== 11) return 0;
  if (ten >= 2 && ten <= 4 && (hundred < 12 || hundred > 14)) return 1;
  return 2;
}

/**
 * The player's text in the language picked. `text` is the English one in the code, the key of the dictionaries; a
 * text missing from them stays English. `{name}` is filled from `params`. A text with forms by count is written
 * "one|many" in English and "one|few|many" in a dictionary, picked by `params.n`
 */
export function t(text: string, params?: Readonly<Record<string, string | number>>): string {
  const dictionary = DICTIONARIES[current];
  const translated = dictionary?.[text];
  if (import.meta.env.DEV && dictionary && translated === undefined) warnMissing(text);
  let out = translated ?? text;
  if (out.includes('|')) {
    const forms = out.split('|');
    const n = Number(params?.n ?? 1);
    const index = translated === undefined ? (n === 1 ? 0 : 1) : slavicForm(n);
    out = forms[Math.min(index, forms.length - 1)];
  }
  if (!params) return out;
  return out.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
