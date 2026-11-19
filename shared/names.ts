// Generated names like `orbit_otter` (decision 17: generated names only at launch). Devices get one
// when they first visit; an account picks one of three offers. Account names are unique, so a
// taken name gets a number on the end (`orbit_otter_42`). Only names of this shape are accepted.

export const ADJECTIVES = [
  "orbit", "lunar", "solar", "comet", "nova", "astro", "cosmic", "stellar", "meteor", "rocket",
  "pulsar", "quasar", "nebula", "zenith", "apogee", "perigee", "ion", "plasma", "photon", "radar",
  "beacon", "crater", "dusty", "frosty", "polar", "rusty", "swift", "steady", "brave", "plucky",
];

export const ANIMALS = [
  "otter", "badger", "falcon", "fox", "lynx", "heron", "puffin", "gecko", "koala", "lemur",
  "marmot", "newt", "owl", "panda", "quokka", "raven", "seal", "tapir", "walrus", "wombat",
  "yak", "zebra", "beaver", "bison", "crane", "dingo", "egret", "ferret", "hare", "ibis",
];

function pick<T>(list: T[]): T {
  return list[crypto.getRandomValues(new Uint32Array(1))[0] % list.length];
}

/** A friendly generated name like `orbit_otter`, or with a number (2 to 999) when asked. */
export function generateName(withNumber = false): string {
  const base = `${pick(ADJECTIVES)}_${pick(ANIMALS)}`;
  return withNumber ? `${base}_${2 + (crypto.getRandomValues(new Uint32Array(1))[0] % 998)}` : base;
}

/** True for names the generator could have made (with or without a number). */
export function isGeneratedName(name: string): boolean {
  const m = /^([a-z]+)_([a-z]+)(?:_([2-9]|[1-9]\d{1,2}))?$/.exec(name);
  return !!m && ADJECTIVES.includes(m[1]) && ANIMALS.includes(m[2]);
}
