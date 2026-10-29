/**
 * What things are paid in: gold, and the currencies of the systems to come, each paid out by its own (sea monsters,
 * bosses, treasure maps, the arena, events, guild battles) and doubloons, bought. Only gold is earned so far, and
 * doubloons spent on forgetting the captain's mastery (account/mastery.ts) and a ship's talents (economy/shop.ts); the
 * shipyard already prices ships in the rest (ships/shipLines.ts)
 */
export type CurrencyId = 'gold' | 'pearls' | 'seals' | 'relics' | 'glory' | 'tokens' | 'honour' | 'doubloons';

export interface Currency {
  readonly id: CurrencyId;
  readonly name: string;
  /** An amount of it as the HUD writes it: `{n}`, in forms by count (`one|many`) where it has them */
  readonly count: string;
}

export const CURRENCIES: Readonly<Record<CurrencyId, Currency>> = {
  gold: { id: 'gold', name: 'Gold', count: '{n} gold' },
  // From sea monsters, the bigger the more
  pearls: { id: 'pearls', name: 'Abyssal pearls', count: '{n} pearl|{n} pearls' },
  // From bosses: a seal off the flag of each one sunk
  seals: { id: 'seals', name: 'Warlord seals', count: '{n} seal|{n} seals' },
  // Dug up where treasure maps lead: what the shipwright builds a ship of with gold
  relics: { id: 'relics', name: 'Ancient relics', count: '{n} relic|{n} relics' },
  glory: { id: 'glory', name: 'Arena glory', count: '{n} glory' },
  tokens: { id: 'tokens', name: 'Event tokens', count: '{n} token|{n} tokens' },
  honour: { id: 'honour', name: 'Guild honour', count: '{n} honour' },
  doubloons: { id: 'doubloons', name: 'Doubloons', count: '{n} doubloon|{n} doubloons' },
};
