import { test } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
const window = new Window({ url: "http://localhost:5186" });
for (const key of [
  "CSS",
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "Element",
  "Node",
  "SVGElement",
  "Event",
  "PointerEvent",
  "MouseEvent",
  "KeyboardEvent",
  "MutationObserver",
  "ResizeObserver",
  "HTMLAnchorElement",
  "HTMLFormElement",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const) {
  Object.defineProperty(globalThis, key, {
    value:
      key === "window"
        ? window
        : typeof window[key] === "function" &&
            [
              "getComputedStyle",
              "requestAnimationFrame",
              "cancelAnimationFrame",
            ].includes(key)
          ? window[key].bind(window)
          : window[key],
    configurable: true,
  });
}
Object.defineProperty(globalThis, "matchMedia", {
  value: window.matchMedia.bind(window),
  configurable: true,
});
Object.defineProperty(globalThis, "addEventListener", {
  value: window.addEventListener.bind(window),
  configurable: true,
});
Object.defineProperty(globalThis, "removeEventListener", {
  value: window.removeEventListener.bind(window),
  configurable: true,
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: false,
  configurable: true,
});
const { RaceInput } = await import("../src/racing/input");
const { createHud } = await import("../src/racing/hud");
const { flushSync } = await import("react-dom");
test("keyboard release, multi-touch, interruptions and reverse intent", () => {
  let paused = 0,
    resets = 0;
  const input = new RaceInput(
    () => paused++,
    () => resets++,
  );
  input.enabled = true;
  input.touchMode = false;
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "w" }));
  window.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "ArrowLeft" }),
  );
  assert.deepEqual(input.read(), {
    steer: 1,
    throttle: 1,
    brake: 0,
    reverse: true,
    drift: false,
  });
  window.dispatchEvent(new window.KeyboardEvent("keyup", { key: "w" }));
  assert.equal(input.read().throttle, 0);
  input.clear();
  window.dispatchEvent(new window.KeyboardEvent("keydown", {key:"Shift"}));
  assert.equal(input.read().drift,true);assert.equal(input.read().brake,0);
  window.dispatchEvent(new window.KeyboardEvent("keyup", {key:"Shift"}));
  assert.equal(input.read().drift,false);
  input.press(3, "drift");
  assert.equal(input.read().drift,true);
  assert.equal(input.read().throttle,1);
  assert.equal(input.read().brake,0);
  input.release(3);
  assert.equal(input.read().drift,false);
  input.press(1, "left");
  input.press(2, "brake");
  assert.equal(input.read().steer, 1);
  assert.equal(input.read().brake, 1);
  assert.equal(input.read().reverse, false);
  input.release(1);
  assert.equal(input.read().brake, 1);
  input.release(2, true);
  assert.equal(paused, 1);
  assert.equal(input.read().brake, 0);
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "r" }));
  assert.equal(resets, 1);
  window.dispatchEvent(new window.Event("blur"));
  assert.equal(paused, 2);
  assert.equal(input.keys.size, 0);
  input.dispose();
});
test("garage, countdown, pause, results and records render through real UI components", () => {
  window.document.body.innerHTML = "<main></main>";
  const input = new RaceInput(
    () => {},
    () => {},
  );
  const hud = createHud({
    drive() {},
    retry() {},
    garage() {},
    pause() {},
    resume() {},
    reset() {},
    mute() {},
    board() {},
    input,
  });
  const base = {
    mode: "garage" as const,
    car: "mini" as const,
    time: 0,
    speed: 0,
    countdown: 3,
    gate: 0,
    wrongWay: false,
    muted: false,
    records: [],
    board: false,
    notice: "",
    touch: true,
    loadingError: false,
  };
  flushSync(() => hud.render(base));
  assert.ok(window.document.body.textContent.includes("drive the loop"));
  assert.ok(window.document.querySelector("button.mc-primary"));
  flushSync(() => hud.render({ ...base, mode: "countdown" }));
  assert.equal(
    window.document.querySelector(".mc-countdown")?.textContent,
    "3",
  );
  assert.equal(window.document.querySelectorAll(".mc-pedal").length, 4);
  assert.equal(window.document.querySelector(".mc-ui")?.getAttribute("data-touch"),"true");
  flushSync(() => hud.render({...base,mode:"racing",drifting:true,driftCharge:1.5}));
  assert.equal(window.document.querySelector('[role="meter"]')?.getAttribute('aria-valuenow'),'1.5');
  assert.ok(window.document.body.textContent.includes('release drift'));
  flushSync(() => hud.render({...base,mode:"racing",boost:.5}));
  assert.ok(window.document.body.textContent.includes('boost!'));
  flushSync(() => hud.render({ ...base, mode: "paused" }));
  assert.equal(
    window.document
      .querySelector('[role="dialog"]')
      ?.getAttribute("aria-modal"),
    "true",
  );
  assert.ok(window.document.body.textContent.includes("resume"));
  flushSync(() =>
    hud.render({
      ...base,
      mode: "results",
      result: 78900,
      previousBest: 80000,
    }),
  );
  assert.ok(window.document.body.textContent.includes("new personal best"));
  assert.ok(window.document.body.textContent.includes("1:18.900"));
  flushSync(() => hud.render({ ...base, board: true }));
  assert.ok(window.document.body.textContent.includes("best in each car"));
  flushSync(() => hud.dispose());
  input.dispose();
});
