import type { DrivingInput } from "./core";
export class RaceInput {
  keys = new Set<string>();
  touches = new Map<number, string>();
  touchMode = matchMedia("(pointer: coarse)").matches;
  enabled = false;
  constructor(
    private pause: () => void,
    private reset: () => void,
  ) {
    addEventListener("keydown", this.down);
    addEventListener("keyup", this.up);
    addEventListener("blur", this.interrupt);
    document.addEventListener("visibilitychange", this.visibility);
  }
  down = (e: KeyboardEvent) => {
    if (
      !this.enabled ||
      e.target instanceof HTMLInputElement ||
      (e.key === " " &&
        e.target instanceof HTMLElement &&
        e.target.closest("button"))
    )
      return;
    if (
      [
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "w",
        "a",
        "s",
        "d",
        "W",
        "A",
        "S",
        "D",
        "r",
        "R",
        "Escape",
        "Shift",
        " ",
      ].includes(e.key)
    ) {
      e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      if (!e.repeat && e.key.toLowerCase() === "r") this.reset();
      if (!e.repeat && e.key === "Escape") this.pause();
    }
  };
  up = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  interrupt = () => {
    this.clear();
    if (this.enabled) this.pause();
  };
  visibility = () => {
    if (document.hidden) this.interrupt();
  };
  clear() {
    this.keys.clear();
    this.touches.clear();
  }
  press(id: number, action: string) {
    this.touchMode = true;
    this.touches.set(id, action);
  }
  release(id: number, cancelled = false) {
    this.touches.delete(id);
    if (cancelled) this.interrupt();
  }
  read(): DrivingInput {
    const held = (a: string, ...keys: string[]) =>
      [...this.touches.values()].includes(a) ||
      keys.some((k) => this.keys.has(k));
    const brake = held("brake", "s", "arrowdown") ? 1 : 0;
    return {
      steer:
        Number(held("left", "a", "arrowleft")) -
        Number(held("right", "d", "arrowright")),
      throttle: this.touchMode
        ? brake
          ? 0
          : 1
        : Number(held("gas", "w", "arrowup")),
      brake,
      drift: held("drift", " ", "shift"),
      reverse: !this.touchMode,
    };
  }
  dispose() {
    removeEventListener("keydown", this.down);
    removeEventListener("keyup", this.up);
    removeEventListener("blur", this.interrupt);
    document.removeEventListener("visibilitychange", this.visibility);
    this.clear();
  }
}
