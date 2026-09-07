import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@heroui/react";
import {
  TUNING,
  formatTime,
  ranked,
  bestFor,
  type CarId,
  type Mode,
  type RecordRun,
} from "./core";
import type { RaceInput } from "./input";
export interface HudState {
  mode: Mode;
  car: CarId | "room";
  time: number;
  speed: number;
  driftCharge?: number;
  drifting?: boolean;
  boost?: number;
  countdown: number;
  gate: number;
  wrongWay: boolean;
  muted: boolean;
  records: RecordRun[];
  board: boolean;
  notice: string;
  previousBest?: number;
  result?: number;
  touch: boolean;
  loadingError: boolean;
}
export interface HudActions {
  drive: () => void;
  retry: () => void;
  garage: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  mute: () => void;
  board: (open: boolean) => void;
  input: RaceInput;
}
function Records({ records }: { records: RecordRun[] }) {
  return (
    <>
      <p className="mc-kicker">PERSONAL RECORDS · THIS DEVICE</p>
      <h2 id="mc-dialog-title">the timing board.</h2>
      <div className="mc-records">
        <div>
          <h3>overall top five</h3>
          {ranked(records).length ? (
            ranked(records).map((r, i) => (
              <div className="mc-record" key={`${r.date}-${i}`}>
                <span>
                  {i + 1}. {TUNING[r.car].name}
                </span>
                <span>{formatTime(r.ms)}</span>
              </div>
            ))
          ) : (
            <p className="mc-muted">your first finish starts the board.</p>
          )}
        </div>
        <div>
          <h3>best in each car</h3>
          {(Object.keys(TUNING) as CarId[]).map((car) => (
            <div className="mc-record" key={car}>
              <span>{TUNING[car].name}</span>
              <span>
                {bestFor(records, car) === undefined
                  ? "—"
                  : formatTime(bestFor(records, car)!)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
function Hud({ s, a }: { s: HudState; a: HudActions }) {
  const panel = useRef<HTMLElement>(null);
  const modal =
    s.board ||
    s.mode === "paused" ||
    s.mode === "results" ||
    s.mode === "loading";
  useEffect(() => {
    if (!modal) return;
    const prior = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => prior?.focus();
  }, [modal, s.mode, s.board]);
  const button = (label: string, fn: () => void, primary = false) => (
    <Button className={`mc-button ${primary ? "mc-primary" : ""}`} onPress={fn}>
      {label}
    </Button>
  );
  const touchButton = (label: string, action: string) => (
    <Button
      aria-label={label}
      className="mc-button mc-pedal"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        a.input.press(e.pointerId, action);
      }}
      onPointerUp={(e) => a.input.release(e.pointerId)}
      onPointerCancel={(e) => a.input.release(e.pointerId, true)}
      onLostPointerCapture={(e) => {
        if (a.input.touches.has(e.pointerId))
          a.input.release(e.pointerId, true);
      }}
    >
      {label}
    </Button>
  );
  return (
    <>
      <div className={`mc-ui mc-mode-${s.mode}`} data-touch={String(s.touch)}>
        {s.mode === "garage" && (
          <div className="mc-garage-actions">
            {s.car !== "room" && (
              <div className="mc-stats">
                {(
                  [
                    ["acceleration", TUNING[s.car].acceleration, 26],
                    ["top speed", TUNING[s.car].maxSpeed, 42],
                    ["grip", TUNING[s.car].grip, 12],
                    ["braking", TUNING[s.car].braking, 24],
                    ["handling", TUNING[s.car].steering, 2.2],
                  ] as [string, number, number][]
                ).map(([label, value, max]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <span className="mc-stat-track">
                      <span style={{ width: `${(value / max) * 100}%` }} />
                    </span>
                  </div>
                ))}
              </div>
            )}
            {s.car !== "room" && button("drive the loop →", a.drive, true)}
            {button("timing board", () => a.board(true))}
            {button(s.muted ? "sound off" : "sound on", a.mute)}
          </div>
        )}
        {(s.mode === "racing" || s.mode === "countdown") && (
          <>
            <div className="mc-hud mc-island">
              <div>
                <p className="mc-kicker">
                  MOUNTAIN LOOP · {s.car === "room" ? "" : TUNING[s.car].name}
                </p>
                <div className="mc-time">{formatTime(s.time * 1000)}</div>
                <p className="mc-muted">
                  {Math.round(s.speed * 3.6)} km/h <span>·</span> checkpoint{" "}
                  {Math.min(15, s.gate)} / 15
                </p>
              </div>
              <div className="mc-hud-actions">
                {button("← garage", a.garage)}
                {button("pause", a.pause)}
                {button("reset +2s", a.reset)}
                {button(s.muted ? "sound off" : "sound on", a.mute)}
              </div>
            </div>
            {s.mode === "countdown" && (
              <div className="mc-countdown" role="status">
                {Math.max(1, Math.ceil(s.countdown))}
              </div>
            )}
            {s.wrongWay && (
              <div className="mc-warning">wrong way · turn around</div>
            )}
            {(s.drifting || (s.boost ?? 0)>0) && (
              <div className="mc-drift" data-stage={(s.boost??0)>0?"boost":(s.driftCharge??0)>=1.5?"gold":"blue"}>
                <span>{(s.boost??0)>0 ? "boost!" : (s.driftCharge??0)>=.75 ? "release drift → boost" : "hold the turn"}</span>
                <div className="mc-charge" role="meter" aria-label="Drift charge" aria-valuemin={0} aria-valuemax={1.5} aria-valuenow={s.driftCharge??0}>
                  <div style={{width:`${Math.min(100,(s.driftCharge??0)/1.5*100)}%`}} />
                </div>
              </div>
            )}
            {s.touch ? (
              <div className="mc-touch">
                <div>
                  {touchButton("←", "left")}
                  {touchButton("→", "right")}
                </div>
                <div>{touchButton("brake", "brake")}{touchButton("drift", "drift")}</div>
              </div>
            ) : (
              <div className="mc-key-hint">
                WASD / arrows · hold Space / Shift + turn to drift · release to boost · R resets · Esc
                pauses
              </div>
            )}
          </>
        )}
        {s.notice && (
          <p className="mc-notice" role="status">
            {s.notice}
          </p>
        )}
        {modal && (
          <div className="mc-scrim">
            <section
              ref={panel}
              className="mc-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="mc-dialog-title"
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === "Escape" && s.board) {
                  e.stopPropagation();
                  a.board(false);
                }
                if (e.key === "Tab") {
                  const items = panel.current?.querySelectorAll<HTMLElement>(
                    "button:not(:disabled)",
                  );
                  if (!items?.length) {
                    e.preventDefault();
                    return;
                  }
                  const first = items[0],
                    last = items[items.length - 1];
                  if (
                    e.shiftKey &&
                    (document.activeElement === first ||
                      document.activeElement === panel.current)
                  ) {
                    e.preventDefault();
                    last.focus();
                  } else if (
                    !e.shiftKey &&
                    (document.activeElement === last ||
                      document.activeElement === panel.current)
                  ) {
                    e.preventDefault();
                    first.focus();
                  }
                }
              }}
            >
              {s.board ? (
                <>
                  <Records records={s.records} />
                  <div className="mc-panel-actions">
                    {button("back to garage", () => a.board(false), true)}
                  </div>
                </>
              ) : s.mode === "loading" ? (
                <>
                  <p className="mc-kicker">OUT THROUGH THE SHUTTER</p>
                  <h2 id="mc-dialog-title">
                    {s.loadingError
                      ? "the road couldn’t load."
                      : "getting the mountain ready…"}
                  </h2>
                  <p className="mc-muted">
                    {s.loadingError
                      ? "you can retry, or head back to your cars."
                      : "one scenic loop. just you and the clock."}
                  </p>
                  {s.loadingError && (
                    <div className="mc-panel-actions">
                      {button("try again", a.retry, true)}
                      {button("garage", a.garage)}
                    </div>
                  )}
                </>
              ) : s.mode === "paused" ? (
                <>
                  <p className="mc-kicker">TAKE A BREATHER</p>
                  <h2 id="mc-dialog-title">paused.</h2>
                  <p className="mc-muted">the clock is stopped.</p>
                  <div className="mc-panel-actions">
                    {button("resume", a.resume, true)}
                    {button("restart run", a.retry)}
                    {button("garage", a.garage)}
                  </div>
                </>
              ) : (
                <>
                  <p className="mc-kicker">BACK AT THE FACTORY</p>
                  <h2 id="mc-dialog-title">
                    {s.previousBest === undefined
                      ? "first time on the board."
                      : s.result! < s.previousBest
                        ? "new personal best."
                        : "one more run?"}
                  </h2>
                  <div className="mc-result-time">
                    {formatTime(s.result ?? 0)}
                  </div>
                  <p className="mc-muted">
                    {s.previousBest === undefined
                      ? "your first record in this car."
                      : `${s.result! < s.previousBest ? "−" : "+"}${formatTime(Math.abs(s.result! - s.previousBest))} against your previous best`}
                  </p>
                  <div className="mc-panel-actions">
                    {button("race again", a.retry, true)}
                    {button("back to garage", a.garage)}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
export function createHud(actions: HudActions) {
  const el = document.createElement("div");
  el.id = "motor-club";
  document.querySelector("main")!.append(el);
  const root = createRoot(el);
  return {
    render(state: HudState) {
      root.render(<Hud s={state} a={actions} />);
    },
    dispose() {
      root.unmount();
      el.remove();
    },
  };
}
