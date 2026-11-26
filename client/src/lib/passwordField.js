/** Temporary passwords for staff accounts. Meets both the dev and production policies. */

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = UPPER + LOWER + DIGITS;

function randomValues(count) {
  const values = new Uint32Array(count);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    for (let i = 0; i < count; i += 1) values[i] = Math.floor(Math.random() * 0xffffffff);
  }
  return values;
}

function pick(set, roll) {
  return set[roll % set.length];
}

/** 12+ characters with upper, lower, and a digit so both password policies pass. */
export function generatePassword(length = 12) {
  const size = Math.max(12, length);
  const rolls = randomValues(size);
  const chars = new Array(size);
  chars[0] = pick(UPPER, rolls[0]);
  chars[1] = pick(LOWER, rolls[1]);
  chars[2] = pick(DIGITS, rolls[2]);
  for (let i = 3; i < size; i += 1) chars[i] = pick(ALPHABET, rolls[i]);
  const order = randomValues(size);
  for (let i = size - 1; i > 0; i -= 1) {
    const j = order[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
