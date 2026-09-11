/**
 * Duck hunt heads-up display for the shared island: round number, three
 * ammunition marks, ten hit/miss marks and one short message. Pure DOM so the
 * live game and the state gallery paint the same thing. Repaints only when the
 * rendered model changes.
 */
export type DuckTallyMark = 'hit' | 'miss' | 'pending';
export interface DuckHudModel {
  round: number;
  /** Shots remaining in the current wave, 0–3. */
  shots: number;
  /** Ten marks, one per duck of the round, in flight order. */
  tally: readonly DuckTallyMark[];
  /** Hits needed to clear the round. */
  quota: number;
  message: string;
}

export const DUCK_HUD_SHOTS = 3;
export const DUCK_HUD_MARKS = 10;

/** Screen-reader sentence for the whole display; the message itself is announced live. */
export function describeDuckHud(model: DuckHudModel) {
  const hits = model.tally.filter(mark => mark === 'hit').length;
  const misses = model.tally.filter(mark => mark === 'miss').length;
  return `Round ${model.round}. ${model.shots} of ${DUCK_HUD_SHOTS} shots. ${hits} hit, ${misses} flew away, need ${model.quota}.`;
}

export function createDuckHud(host: HTMLElement) {
  host.replaceChildren();
  host.classList.add('duck-hud');
  const round = document.createElement('span'); round.className = 'duck-hud-round';
  const ammo = document.createElement('span'); ammo.className = 'duck-hud-ammo'; ammo.setAttribute('aria-hidden', 'true');
  const shells = Array.from({ length: DUCK_HUD_SHOTS }, () => { const shell = document.createElement('i'); ammo.append(shell); return shell; });
  const tally = document.createElement('span'); tally.className = 'duck-hud-tally'; tally.setAttribute('aria-hidden', 'true');
  const marks = Array.from({ length: DUCK_HUD_MARKS }, () => { const mark = document.createElement('i'); tally.append(mark); return mark; });
  const message = document.createElement('span'); message.className = 'duck-hud-message'; message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  host.append(round, ammo, tally, message);
  let signature = '';
  return {
    paint(model: DuckHudModel) {
      const next = JSON.stringify([model.round, model.shots, model.tally, model.quota, model.message]);
      if (next === signature) return false;
      signature = next;
      round.textContent = `R${model.round}`;
      shells.forEach((shell, index) => shell.className = index < model.shots ? 'is-loaded' : '');
      marks.forEach((mark, index) => {
        const state = model.tally[index] ?? 'pending';
        mark.className = state === 'pending' ? '' : `is-${state}`;
        // The quota line sits after the mark that clears the round.
        mark.classList.toggle('is-quota', index === model.quota - 1);
      });
      if (message.textContent !== model.message) message.textContent = model.message;
      host.setAttribute('aria-label', describeDuckHud(model));
      return true;
    },
    dispose() { host.replaceChildren(); host.classList.remove('duck-hud'); host.removeAttribute('aria-label'); signature = ''; },
  };
}
