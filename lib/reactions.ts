import type { Outcome } from "./store";

// One line, PG-13, in-character. Kept short so it stamps under the outcome pill.
const bank: Record<Exclude<Outcome, "unconfirmed">, string[]> = {
  walked_away: [
    "Look at you, walking. I almost respect that.",
    "Fine. Grown behavior. Do it again.",
    "That's the spine I was looking for.",
  ],
  took_swap: [
    "Smart pick. Cheap and it works. Approved.",
    "See? The cheap one had it in her all along.",
    "Now that is how you shop, nerd.",
  ],
  bought_anyway: [
    "You bought it anyway. I am deeply disappointed and taking notes.",
    "So the bully talks and the wallet cries. Cool cool cool.",
    "I told you. You did it. We are not speaking today.",
  ],
};

export function reactionFor(outcome: Exclude<Outcome, "unconfirmed">): string {
  const options = bank[outcome];
  return options[Math.floor(Math.random() * options.length)];
}
