import type { DrivingInput, Track, VehicleState } from "./core";
import {STEP} from "./core";
/** Development-only test driver. The public game never enables this input source. */
export function scriptedInput(s: VehicleState, track: Track): DrivingInput {
  const look = Math.max(8, s.speed * 0.9),
    advance = Math.round((look / track.length) * track.samples.length);
  const target =
    track.samples[(s.contact.index + advance) % track.samples.length].p;
  const heading = Math.atan2(target.x - s.position.x, target.z - s.position.z);
  const error = Math.atan2(
    Math.sin(heading - s.heading),
    Math.cos(heading - s.heading),
  );
  const future =
    track.samples[(s.contact.index + advance * 2) % track.samples.length]
      .tangent;
  const angle = Math.acos(
    Math.max(-1, Math.min(1, s.contact.tangent.dot(future))),
  );
  const desired = Math.min(30, Math.max(11, 30 - angle * 22));
  return {
    steer: Math.max(-1, Math.min(1, error * 2.4)),
    throttle: s.speed < desired ? 1 : 0,
    brake: s.speed > desired + 2 ? 0.5 : 0,
  };
}

/** Short, repeatable tire-trail preview; deliberately separate from the lap check. */
export function createDriftCheckInput() {
  let elapsed = 0, direction = 1;
  return (s: VehicleState, track: Track): DrivingInput => {
    const normal = scriptedInput(s, track), phase = elapsed % 8;
    elapsed += STEP;
    if (phase < 2 || phase >= 2.24 || s.speed < 9 || Math.abs(s.contact.lateral) > 1.4 || normal.brake) return normal;
    if (!s.driftDirection) direction = Math.abs(s.contact.lateral) > 0.3 ? -Math.sign(s.contact.lateral) : (Math.floor(elapsed / 8) % 2 ? -1 : 1);
    return {...normal, steer: direction * 0.32, brake: 0, drift: true};
  };
}
