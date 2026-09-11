import { createMountainClimbers } from './factory25dClimbers';
import { createLakeCanoe } from './factory25dCanoe';
import { landscapeVisitors } from './factory25dVisitors';
import * as THREE from 'three';
import { setAtmosphereHaze } from './factory25dAtmosphere';
import { CLEAR_WEATHER } from '../sky/weather';
import type { WeatherVisualState } from '../sky/weather';
import { paletteForElevation } from '../sky/skyPhase';
import type { SkyPalette } from '../sky/skyPhase';
import { weatherLighting } from './factory25dWeatherState';
import { createUtahLandscape } from './factory25dLandscape';
import { createRidgeBear } from './factory25dBear';
import { createValleyBirds } from './factory25dBirds';
import { createMeadowElk } from './factory25dElk';
import type { TeamMember } from '@shared/team';

/** A solid, separately lit landscape viewed through the factory glass. */
export function createMountainView(renderer: THREE.WebGLRenderer, viewHeight: number) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-7.92, 7.92, viewHeight / 2, -viewHeight / 2, 0.1, 50);
  camera.position.set(0, viewHeight / 2 + 1.15, 14);
  camera.lookAt(0, viewHeight / 2, 0);
  const portalCamera=new THREE.PerspectiveCamera();
  const landscape = createUtahLandscape();
  const originalLandscape = landscape;
  scene.add(landscape.group);
  const bear = createRidgeBear(scene, originalLandscape.hazeColor, (x, z) => landscape.heightAt(x, z));
  const elk = createMeadowElk(scene, originalLandscape.hazeColor, (x, z) => landscape.heightAt(x, z));
  const climbers = createMountainClimbers(scene, (x, z) => landscape.heightAt(x, z), originalLandscape.hazeColor);
  const canoe = createLakeCanoe(scene, originalLandscape.hazeColor);
  let visitorIds: { climbers: string[]; canoe: string[] } = { climbers: [], canoe: [] };
  const birds = createValleyBirds(scene, landscape.hazeColor);
  const fill = new THREE.HemisphereLight('#c8d5e5', '#7b8998', 1.35);
  const sunlight = new THREE.DirectionalLight('#fff1d9', 2.2);
  sunlight.target.position.set(0, 0.5, 0);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunlight.shadow.camera, { left: -12, right: 12, top: 10, bottom: -8, near: 0.1, far: 35 });
  sunlight.shadow.bias = -0.0005;
  scene.add(fill, sunlight, sunlight.target);
  const lightningLight=new THREE.DirectionalLight('#bdd6ff',0);
  lightningLight.position.set(-2,8,3);lightningLight.target.position.set(0,0,-1);
  scene.add(lightningLight,lightningLight.target);
  const target = new THREE.WebGLRenderTarget(800, Math.round(800 * viewHeight / 15.84), {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    generateMipmaps: false, depthBuffer: true,
  });
  let dirty = true;
  let currentArc = -3;
  let isNight = false;
  let moonlight = 1;
  let currentWeather = CLEAR_WEATHER;
  let currentPalette = paletteForElevation(45, true);
  let lastWindFrame = -1;
  let previousElapsed = 0,lastPerspectiveRender=-Infinity;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const haze = new THREE.Color();
  const fog = new THREE.Fog(haze, 10, 80);
  scene.fog = fog;
  function applyEnvironment() {
    const horizon = Math.pow(Math.abs(currentArc) / 7, 1.35);
    const lighting = weatherLighting(currentWeather);
    sunlight.position.set(currentArc * 1.7, THREE.MathUtils.lerp(10, 3.2, horizon), 5);
    sunlight.color.set('#fff4e5').lerp(new THREE.Color(currentArc > 0 ? '#ffbd8d' : '#ffdfb5'), horizon);
    sunlight.intensity = (isNight ? 0.24 * moonlight : THREE.MathUtils.lerp(2.2, 1.65, horizon)) * lighting.direct;
    if (isNight) sunlight.color.set('#a9bde8');
    sunlight.castShadow = lighting.direct > 0.02;
    fill.color.set('#c8d5e5').lerp(new THREE.Color('#b4aaca'), horizon * 0.4 * (1 - currentWeather.cloud01));
    fill.intensity = (isNight ? 0.34 : 1.35) * lighting.ambient;
    if (isNight) fill.color.set('#8399c5');
    // Distant air takes the blue above the horizon, while sunset and storm
    // palettes still supply the color. Nearby greens keep their contrast.
    setAtmosphereHaze(haze, currentPalette, isNight);
    fog.color.copy(haze);
    landscape.hazeColor.value.copy(haze);
    originalLandscape.hazeColor.value.copy(haze);
    const obscurity = THREE.MathUtils.clamp(currentWeather.fog01 + currentWeather.snow01 * 0.3, 0, 1);
    fog.far = obscurity > 0 ? THREE.MathUtils.lerp(65, 17, obscurity) : 95;
    landscape.snow.value = currentWeather.snow01;
    landscape.windStrength.value = 0.012 + currentWeather.rain01 * 0.014;
    dirty = true;
  }
  applyEnvironment();
  const previousClearColor = new THREE.Color();
  return {
    texture: target.texture,
    dispose() { climbers.dispose(); canoe.dispose(); elk.dispose(); birds.dispose(); target.dispose(); },
    setLightning(pulse:number){const intensity=THREE.MathUtils.clamp(pulse,0,1)*2.4;if(Math.abs(intensity-lightningLight.intensity)>.002){lightningLight.intensity=intensity;dirty=true;}},
    setVisitors(members: readonly TeamMember[]) {
      const cast = landscapeVisitors(members, visitorIds);
      visitorIds = { climbers: cast.climbers.map(member => member.id), canoe: cast.canoe.map(member => member.id) };
      climbers.setVisitors(cast.climbers); canoe.setVisitors(cast.canoe); dirty = true;
    },
    setDetail(immersive: boolean) {
      const width = immersive ? 1440 : 800;
      target.setSize(width, Math.round(width * viewHeight / 15.84));
      dirty = true;
    },
    setEnvironment(arc: number, weather: WeatherVisualState, palette: SkyPalette, night = false, lunarLight = 1) {
      currentArc = arc; currentWeather = weather; currentPalette = palette; isNight = night;
      moonlight = THREE.MathUtils.clamp(lunarLight, 0, 1);
      applyEnvironment();
    },
    render(elapsed = 0, visible = true, roomView?: THREE.Camera, windowCenterY = viewHeight/2) {
      const dt = elapsed - previousElapsed;
      previousElapsed = elapsed;
      if (!visible || document.hidden) return;
      bear.update(dt, reducedMotion.matches);
      elk.update(dt, currentWeather, isNight, reducedMotion.matches);
      birds.update(dt, currentWeather, isNight, reducedMotion.matches);
      climbers.update(dt, isNight, reducedMotion.matches);
      canoe.update(dt, currentWeather, isNight, reducedMotion.matches);
      const windFrame = Math.floor(elapsed * 30);
      if (!reducedMotion.matches && windFrame !== lastWindFrame) {
        landscape.windTime.value = elapsed;
        lastWindFrame = windFrame;
        dirty = true;
      }
      const perspective=roomView instanceof THREE.PerspectiveCamera;
      if(perspective){const frame=Math.floor(elapsed*30);if(frame===lastPerspectiveRender)return;lastPerspectiveRender=frame;dirty=true;}
      if (!dirty) return;
      const previousTarget = renderer.getRenderTarget();
      const previousAlpha = renderer.getClearAlpha();
      renderer.getClearColor(previousClearColor);
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(target);
      if(perspective){
        // Off-axis window projection: render the actual terrain from the viewer,
        // with the window edges as the frustum, rather than tilting a fixed photo.
        const eye=roomView.position,depth=Math.max(.1,eye.z+4.55),near=.1;
        portalCamera.position.set(eye.x,eye.y-windowCenterY+viewHeight/2,depth);
        portalCamera.quaternion.identity();
        portalCamera.near=near;portalCamera.far=depth+150;
        const y=portalCamera.position.y;
        portalCamera.projectionMatrix.makePerspective((-7.92-eye.x)*near/depth,(7.92-eye.x)*near/depth,
          (viewHeight-y)*near/depth,-y*near/depth,near,portalCamera.far);
        portalCamera.projectionMatrixInverse.copy(portalCamera.projectionMatrix).invert();
        portalCamera.updateMatrixWorld();
        // The nearest meadow ends at z=5.4: place it just outside the glass.
        scene.position.z=-6;
        renderer.render(scene,portalCamera);
        scene.position.z=0;
        dirty=true;
      }else renderer.render(scene, camera);
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousClearColor, previousAlpha);
      dirty = perspective;
    },
  };
}
