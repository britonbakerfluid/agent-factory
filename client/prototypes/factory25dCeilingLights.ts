import * as THREE from 'three';
import { propPart, standard } from './factory25dProps';
import type { SceneLightSwitch } from './factory25dLightSwitches';

/** The cutaway keeps the soft downward night light, without a visible fixture. */
export function createCeilingLights(parent: THREE.Group, night: boolean) {
  const frame = new THREE.Group(); frame.name = 'workspace-night-lighting';
  frame.position.set(0, 2.4, -0.35); parent.add(frame);
  const width = 8.8, depth = 3.2, bar = 0.055;
  const lights: THREE.RectAreaLight[] = [];
  let warmth = Number(night), currentNight = night, manual: boolean | undefined;
  // A small rocker on the rear mullion controls the cutaway's invisible ceiling fixtures.
  const control = new THREE.Group(); control.name = 'workspace-light-switch';
  control.position.set(-2.66, 1.55, -4.2); parent.add(control);
  propPart(control, [.16, .25, .045], [0, 0, 0], standard('#353e50', .8));
  const rocker = propPart(control, [.10, .16, .025], [0, 0, .033], standard('#c1c8b6', .75));
  const indicatorMaterial = standard('#9cdac0', 1, '#9cdac0');
  propPart(control, [.044, .017, .01], [0, -.061, .051], indicatorMaterial);
  const isOn = () => manual ?? currentNight;
  const lightSwitches: SceneLightSwitch[] = [{ id: 'workspace-ceiling', label: 'Workspace ceiling lights', kind: 'light', target: control,
    isOn, setOn(on) { manual = on; warmth = Number(on); paint(); } }];

  function segment(w: number, d: number, x: number, z: number) {
    const stripWidth = w > bar ? w : bar + 0.03;
    const stripDepth = d > bar ? d : bar + 0.03;
    const light = new THREE.RectAreaLight('#f1e4cf', 0, stripWidth, stripDepth);
    light.name = 'workspace-ceiling-wash'; light.position.set(x, -0.045, z);
    light.rotation.x = -Math.PI / 2; // RectAreaLight emits along its local -Z axis.
    frame.add(light); lights.push(light);
  }
  for (const sign of [-1, 1]) {
    segment(width, bar, 0, sign * (depth - bar) / 2);
    segment(bar, depth - bar * 2, sign * (width - bar) / 2, 0);
  }
  function paint() {
    for (const light of lights) light.intensity = warmth * 50;
    indicatorMaterial.emissiveIntensity = isOn() ? .6 : 0;
    indicatorMaterial.color.set(isOn() ? '#9cdac0' : '#4b5558'); rocker.rotation.x = isOn() ? -.12 : .12;
  }
  paint();
  return { lightSwitches, update(dt: number, night: boolean) {
    currentNight = night; const requested = Number(isOn());
    let next = THREE.MathUtils.damp(warmth, requested, 2, Math.min(dt, 0.1));
    if (Math.abs(next - requested) < 0.0001) next = requested;
    if (next === warmth) return;
    warmth = next; paint();
  } };
}
