import * as THREE from 'three';
import { createBasketballFloorMarker } from './factory25dFloorMarker';
import { BasketballChallengeBook, HORSE_RELEASE_Y, describeChallenge, horseActive, horseCanShoot, horseLetters, horseOpponent, horseSide, readChallenge, simulateChallengeShot, validHorseSpot,
  type ChallengeRequest, type ChallengeResult, type ChallengeState, type HorseGame } from '@shared/basketball-challenge';
import type { TeamMember } from '@shared/team';
import { VISITOR_BALL_RIM, visitorShotVelocity, stepVisitorBall, type FlyingBall, type BallVector } from '@shared/visitor-basketball';
import { isControlPreview, onFactoryConnection, onFactoryMessage, sendFactoryCommand } from './factory25dBoardData';
import type { createVisitorBasketball } from './factory25dVisitorBasketball';
import './factory25dBasketballChallenge.css';
import { miniBall } from './factory25dBasketball';
import { avatarSheet } from './factory25dAvatar';
import { DEFAULT_AVATAR } from '@shared/constants';
import { createProfilePortrait } from './factory25dPortrait';

type Basketball = ReturnType<typeof createVisitorBasketball>;
type Principal = { ownerId: string; username: string } | undefined;


/** A chalk ring on the floor where the standing shot was made, with a hit target to match it from. */
function createFloorMark(parent: THREE.Group, canvas: HTMLCanvasElement, onMatch: () => void) {
  const ring = createBasketballFloorMarker(parent); ring.name = 'horse-floor-mark';
  const sweepMaterial = ring.material.clone(); sweepMaterial.color.set('#ffe3a0');
  const sweep = new THREE.Mesh(new THREE.RingGeometry(.228, .252, 8, 1, 0, Math.PI / 3), sweepMaterial);
  sweep.name = 'horse-ring-highlight'; sweep.position.z = .001; sweep.renderOrder = 2; ring.add(sweep);
  // Share the ring material so the glyph has exactly the same color/opacity pulse.
  const attention = new THREE.Group(); attention.name = 'horse-turn-exclamation'; attention.visible = false;
  const stem = new THREE.Mesh(new THREE.PlaneGeometry(.045, .13), ring.material);
  const dot = new THREE.Mesh(new THREE.PlaneGeometry(.045, .045), ring.material);
  stem.position.y = .055; dot.position.y = -.06; attention.add(stem, dot); parent.add(attention);
  const parentRotation = new THREE.Quaternion(), cameraRotation = new THREE.Quaternion();
  const ghost = miniBall(parent); ghost.visible = false;
  const reducedMarkerMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const markerWarm = new THREE.Color('#f3a644'), markerBright = new THREE.Color('#ffd16c'), markerNeutral = new THREE.Color('#f1efe4');
  ghost.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = false; for (const material of Array.isArray(object.material) ? object.material : [object.material]) { material.transparent = false; material.opacity = 1; material.depthWrite = true; } } });
  const hotspot = document.createElement('button'); hotspot.type = 'button'; hotspot.className = 'horse-spot-hotspot'; hotspot.hidden = true;
  hotspot.innerHTML = '<span class="horse-accept-thought" aria-hidden="true"><span class="factory-thought-body">accept game</span><span class="factory-thought-dot dot-0"></span><span class="factory-thought-dot dot-1"></span></span>';
  hotspot.addEventListener('click', onMatch); canvas.parentElement!.append(hotspot);
  let canvasWidth = canvas.clientWidth, canvasHeight = canvas.clientHeight;
  const canvasSize = new ResizeObserver(() => {
    canvasWidth = canvas.clientWidth; canvasHeight = canvas.clientHeight;
  });
  canvasSize.observe(canvas);
  const point = new THREE.Vector3();
  return {
    set(spot: { x: number; z: number } | undefined, matchable: boolean, label: string, accepting = false) {
      ghost.visible = !!spot && (accepting || matchable);
      if (spot) ghost.position.set(spot.x, .073, spot.z);
      ring.visible = !!spot; hotspot.dataset.matchable = String(matchable || accepting);
      hotspot.dataset.accepting = String(accepting);
      if (spot) { ring.position.x = spot.x; ring.position.z = spot.z; hotspot.setAttribute('aria-label', accepting ? 'Accept game' : label); }
      if (!spot) hotspot.hidden = true;
    },
    place(camera: THREE.Camera, visible: boolean) {
      const invitation = hotspot.dataset.accepting === 'true';
      const active = invitation || hotspot.dataset.matchable === 'true';
      const pulse = reducedMarkerMotion.matches ? .5 : (Math.sin(performance.now() / 650) + 1) / 2;
      ring.scale.setScalar(active ? .66 + pulse * .06 : 1);
      ring.material.color.copy(active ? markerWarm : markerNeutral);
      if (active) ring.material.color.lerp(markerBright, pulse);
      ring.material.opacity = active ? .5 + pulse * .22 : .55;
      sweep.visible = active && visible && !reducedMarkerMotion.matches;
      sweep.rotation.z = performance.now() / 4800 * Math.PI * 2;
      sweepMaterial.opacity = .16 + pulse * .08;
      ghost.visible = active && ring.visible && visible;
      attention.visible = active && ring.visible && visible;
      if (attention.visible) {
        attention.position.set(ring.position.x, .34, ring.position.z);
        attention.scale.setScalar(.94 + pulse * .06);
        parent.getWorldQuaternion(parentRotation); camera.getWorldQuaternion(cameraRotation);
        attention.quaternion.copy(parentRotation.invert().multiply(cameraRotation));
      }
      if (!ring.visible || !visible || hotspot.dataset.matchable !== 'true') { if (!hotspot.hidden) hotspot.hidden = true; return; }
      parent.localToWorld(point.copy(ring.position)).project(camera);
      const hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.05 || Math.abs(point.y) > 1.05;
      if (hotspot.hidden !== hidden) hotspot.hidden = hidden;
      if (!hotspot.hidden) Object.assign(hotspot.style, { left: `${(point.x + 1) * canvasWidth / 2 - 22}px`, top: `${(1 - point.y) * canvasHeight / 2 - 22}px` });
    },
    dispose() { canvasSize.disconnect(); sweep.geometry.dispose(); sweepMaterial.dispose(); attention.removeFromParent(); stem.geometry.dispose(); dot.geometry.dispose(); ghost.removeFromParent(); ghost.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } }); ring.removeFromParent(); ring.geometry.dispose(); ring.material.dispose(); hotspot.remove(); },
  };
}

export function createBasketballChallenges(parent: THREE.Group, canvas: HTMLCanvasElement, basketball: Basketball,
  options: { principal(): Principal; members(): readonly TeamMember[]; replayEffects?: { rim(energy: number): void; swish(): void; bounce(energy: number): void; result(made: boolean): void } }) {
  const abort = new AbortController(), events = { signal: abort.signal };
  const preview = isControlPreview() ? new BasketballChallengeBook() : undefined;
  const games = new Map<string, HorseGame>();
  let roomVisible = false, toolbarVisible = false;
  let pendingSend: { id: string; resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> } | undefined;
  let acceptedSpot: { id: string; revision: number; spot: BallVector } | undefined;
  let serverOffset = 0, connected = !!preview, feedback = '', feedbackUntil = 0, pendingFeedback = '', flightLetters = '';
  let playing: { id: string; revision: number } | undefined, armedFor: string | undefined, startSpot: string | undefined, startDeadline = 0;
  const replayBall = miniBall(parent); replayBall.visible = false;
  replayBall.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = false;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.transparent = true; material.opacity = .65; material.depthWrite = false;
      }
    }
  });
  let replay: { ball: FlyingBall; resultShown: boolean; endAt: number; elapsed: number; delay: number; accumulator: number; at: number; gameId: string; revision: number; next: boolean } | undefined;
  const actorCanvas = document.createElement('canvas'); actorCanvas.width = actorCanvas.height = 32;
  const actorInk = actorCanvas.getContext('2d')!; actorInk.imageSmoothingEnabled = false;
  const actorTexture = new THREE.CanvasTexture(actorCanvas); actorTexture.magFilter = actorTexture.minFilter = THREE.NearestFilter; actorTexture.colorSpace = THREE.SRGBColorSpace;
  const actorMaterial = new THREE.SpriteMaterial({ map: actorTexture, transparent: true, opacity: .65, depthWrite: false });
  const replayActor = new THREE.Sprite(actorMaterial); replayActor.scale.set(.85, .85, 1); replayActor.visible = false; parent.add(replayActor);
  let actorSheet: ReturnType<typeof avatarSheet> | undefined, actorFrame = '';
  function paintActor(preparing: boolean, time: number) {
    if (!actorSheet) return;
    const row = preparing || time < .35 ? 0 : 1, frame = Math.min(3, Math.floor(time * 8));
    const key = `${row}:${frame}`; if (key === actorFrame) return; actorFrame = key;
    actorInk.clearRect(0, 0, 32, 32); actorInk.drawImage(actorSheet.canvas, frame * 32, row * 32, 32, 32, 0, 0, 32, 32); actorTexture.needsUpdate = true;
  }
  const watched = new Set<string>();
  function startReplay(game: HorseGame, next: boolean) {
    const release = game.lastShot?.release;
    if (!release || game.lastShot!.shooter === me() || !roomVisible || basketball.shooting) return false;
    replay = { ball: { position: { ...release.position }, velocity: { ...release.velocity }, room: 'factory', scored: false }, resultShown: false, endAt: 4, elapsed: 0, delay: .65, accumulator: 0, at: performance.now(), gameId: game.id, revision: game.revision, next };
    replayBall.position.copy(new THREE.Vector3(release.position.x, release.position.y, release.position.z)); replayBall.visible = true;
    const member = options.members().find(member => member.id === game.lastShot!.shooter);
    const avatar = member?.avatar ?? (preview ? { ...DEFAULT_AVATAR, color: '#cf945f', shirtColor: '#cf945f', hairStyle: 2 } : undefined);
    actorSheet = avatar ? avatarSheet(avatar, ['basketball_throw', 'idle'], [undefined], true, true) : undefined; actorFrame = '';
    replayActor.visible = !!actorSheet; replayActor.position.set(release.position.x, .425, release.position.z + .22); paintActor(true, 0);
    basketball.showReplayView(release.position);
    paint(); return true;
  }
  function finishReplay(continueTurn: boolean) {
    const previous = replay; replay = undefined; replayBall.visible = false; replayActor.visible = false; basketball.showReplayView();
    if (previous) {
      watched.add(`${previous.gameId}:${previous.revision}`);
      const game = games.get(previous.gameId);
      if (continueTurn && previous.next && roomVisible && game?.revision === previous.revision && horseCanShoot(game, me()!)) { beginTurn(game); return; }
    }
    paint();
  }
  const now = () => Date.now() + serverOffset;
  const me = () => options.principal()?.ownerId ?? (preview ? 'preview-owner' : undefined);
  let viewSignature = '';
  const mark = createFloorMark(parent, canvas, () => {
    const game = focus(); if (!game || replay) return;
    if (game.status === 'pending' && game.challengee.ownerId === me()) turnButton.click();
    else if (horseCanShoot(game, me()!) && game.turn.role === 'match') beginTurn(game);
  });
  // The island carries the turn: one line inside the shared toolbar, no second card.
  const turnButton = document.createElement('button'); turnButton.type = 'button'; turnButton.className = 'horse-turn'; turnButton.hidden = true;
  turnButton.addEventListener('click', () => {
    if (replay) { finishReplay(true); return; }
    const game = focus(); if (!game) return;
    if (horseCanShoot(game, me()!)) beginTurn(game);
    else if (game.status === 'pending' && game.challengee.ownerId === me()) send({ type: 'challenge', action: 'respond', id: game.id, accept: true });
    else if (!horseActive(game)) { send({ type: 'challenge', action: 'seen', id: game.id }); game.seenBy.push(`${me()}:result`); paint(); }
  }, events);
  const challengePicker = document.createElement('details'); challengePicker.className = 'basketball-challenge-picker'; challengePicker.hidden = true;
  const pickerSummary = document.createElement('summary');
  pickerSummary.innerHTML = '<span class="horse-picker-closed-label">challenge to HORSE</span><span class="horse-picker-open-label">cancel</span>';
  challengePicker.addEventListener('toggle', () => {
    pickerSummary.setAttribute('aria-label', challengePicker.open ? 'Cancel choosing an opponent' : 'Challenge to HORSE');
  }, events);
  const pickerList = document.createElement('div'); challengePicker.append(pickerSummary, pickerList); document.body.append(challengePicker);
  let pickerSignature = '';
  function updatePicker() {
    challengePicker.hidden = !roomVisible || !basketball.shooting || basketball.armedShot || !!replay;
    if (challengePicker.hidden) challengePicker.open = false;
    const mine = me(), members = options.members().filter(member => member.id !== mine && !member.id.startsWith('legacy:'));
    const signature = JSON.stringify([mine, connected, members.map(member => [member.id, member.name, member.avatar]), [...games.values()].map(game => [game.id, game.revision])]);
    if (signature === pickerSignature) return; pickerSignature = signature; pickerList.replaceChildren();
    if (!mine || !connected || !members.length) { pickerList.textContent = !mine ? 'Connect your account to challenge someone.' : !connected ? 'Reconnecting…' : 'No opponents available yet.'; return; }
    for (const member of members) {
      const active = [...games.values()].find(game => horseActive(game) && horseSide(game, mine) && horseSide(game, member.id));
      const button = document.createElement('button'); button.type = 'button'; button.disabled = !!active;
      const name = document.createElement('span'); name.className = 'horse-opponent-name';
      name.textContent = member.name + (active ? ' · game in progress' : '');
      button.append(createProfilePortrait(member.avatar), name);
      button.onclick = () => { if (!connected) return; send({ type: 'challenge', action: 'create', challengeeId: member.id }); startSpot = 'created'; startDeadline = performance.now() + 8000; challengePicker.open = false; };
      pickerList.append(button);
    }
  }

  function send(request: ChallengeRequest) {
    if (preview) { local(request); return true; }
    return sendFactoryCommand(request);
  }
  /** The game that matters most right now: my turn first, then anything active, then the freshest result from the last two days. */
  const RESULT_ON_GLASS_MS = 48 * 3600 * 1000;
  function focus(): HorseGame | undefined {
    const mine = me(); if (!mine) return undefined;
    const list = [...games.values()].filter(g => horseSide(g, mine));
    return list.find(g => horseCanShoot(g, mine)) ?? list.find(g => g.status === 'pending' && g.challengee.ownerId === mine)
      ?? list.find(horseActive) ?? list.filter(g => g.status !== 'cancelled' && now() - g.updatedAt < RESULT_ON_GLASS_MS).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }
  function receiveState(state: ChallengeState) {
    serverOffset = state.serverTime - Date.now();
    const mine = me();
    for (const game of state.challenges) {
      if (readChallenge(game) && games.get(game.id)?.status === 'pending' && game.status === 'playing' && game.challengee.ownerId === mine && game.turn.shooter === mine && game.turn.role === 'match' && game.turn.spot) {
        acceptedSpot = { id: game.id, revision: game.revision, spot: { ...game.turn.spot, y: HORSE_RELEASE_Y } };
      }
    }
    games.clear();
    for (const game of state.challenges) if (readChallenge(game)) games.set(game.id, game);
    if (playing) {
      const game = games.get(playing.id);
      if (!game || !horseCanShoot(game, mine!) || game.revision !== playing.revision) { basketball.disarm(); playing = undefined; }
    }
    if (armedFor && !(games.get(armedFor) && horseCanShoot(games.get(armedFor)!, mine!))) { basketball.disarm(); armedFor = undefined; }
    paint();
  }
  function receiveResult(result: ChallengeResult) {
    const sentPlacement = !!pendingSend && result.id === pendingSend.id && result.action === 'shot';
    if (pendingSend && result.id === pendingSend.id && result.action === 'shot') {
      const pending = pendingSend; pendingSend = undefined; clearTimeout(pending.timer);
      if (result.success) pending.resolve(); else pending.reject(new Error(result.error ?? 'Could not send. Try again.'));
    }
    if (result.success && result.action === 'shot') {
      const message = result.letter ? `miss · you take ${result.letter}` : result.made ? 'shot made' : 'no good · they set next';
      if (basketball.shotInFlight) pendingFeedback = message;
      else { feedback = message; feedbackUntil = performance.now() + 6500; }
    } else if (!result.success) { feedback = result.error ?? 'That did not go through.'; feedbackUntil = performance.now() + 4000; }
    if (sentPlacement && result.success) { feedback = ''; pendingFeedback = ''; feedbackUntil = 0; }
    paint();
  }
  /** Start my turn: matching enters shooting mode on the mark; setting arms the next shot from wherever I carry the ball. */
  function beginTurn(game: HorseGame) {
    const mine = me()!; if (!horseCanShoot(game, mine)) return;
    if (!watched.has(`${game.id}:${game.revision}`) && startReplay(game, true)) return;
    const hooks: Parameters<typeof basketball.armShot>[0] = {
      shot: (position: BallVector, velocity: BallVector) => {
        flightLetters = horseLetters(horseSide(game, mine)!);
        if (game.turn.role === 'set' && simulateChallengeShot(position, velocity)) {
          hooks.placement = { name: horseOpponent(game, mine).name, spot: { ...position }, send: (targetSpot) => new Promise<void>((resolve, reject) => {
            if (!validHorseSpot(targetSpot)) { reject(new Error('Choose a clear spot on the floor.')); return; }
            const timer = setTimeout(() => { pendingSend = undefined; reject(new Error('No confirmation yet. Try again.')); }, 10000);
            pendingSend = { id: game.id, resolve, reject, timer };
            if (!send({ type: 'challenge', action: 'shot', id: game.id, revision: game.revision, position, velocity, targetSpot })) { clearTimeout(timer); pendingSend = undefined; reject(new Error('Disconnected. Reconnect and try again.')); }
          }) };
        } else send({ type: 'challenge', action: 'shot', id: game.id, revision: game.revision, position, velocity });
      },
      done: () => { playing = undefined; armedFor = undefined; paint(); },
    };
    if (game.turn.role === 'match') {
      const spot = game.turn.spot!;
      if (basketball.armShot(hooks, { x: spot.x, y: HORSE_RELEASE_Y, z: spot.z })) { playing = { id: game.id, revision: game.revision }; startSpot = undefined; }
      else { startSpot = game.id; startDeadline = performance.now() + 4000; }
    } else { if (basketball.armShot(hooks)) { armedFor = game.id; playing = { id: game.id, revision: game.revision }; } else { startSpot = game.id; startDeadline = performance.now() + 4000; } }
    paint();
  }
  function paint() {
    const mine = me(), game = focus();
    const standing = game && horseActive(game) && game.turn.role === 'match' ? game.turn.spot : undefined;
    const other = game && mine ? horseOpponent(game, mine) : undefined;
    mark.set(standing, !!(game && mine && horseCanShoot(game, mine) && game.turn.role === 'match'), other ? `Match ${other.name}'s shot from this spot` : 'Match the shot from this spot', !!(game && game.status === 'pending' && game.challengee.ownerId === mine));
    const showFeedback = feedback && performance.now() < feedbackUntil;
    if (game && mine) {
      const text = showFeedback ? feedback : horseCanShoot(game, mine) ? (game.turn.role === 'match' ? `Match ${other!.name}'s shot` : `Set a shot for ${other!.name}`)
        : game.status === 'pending' && game.challengee.ownerId === mine ? `Accept HORSE from ${other!.name}` : describeChallenge(game, mine);
      const playable = horseCanShoot(game, mine) || (game.status === 'pending' && game.challengee.ownerId === mine);
      turnButton.classList.toggle('horse-play', playable && !showFeedback);
      if (playable && !showFeedback) turnButton.innerHTML = '<span class="horse-play-ball" aria-hidden="true"><svg viewBox="0 0 24 24" shape-rendering="crispEdges"><path fill="#f78a24" d="M7 1h10v2h4v4h2v10h-2v4h-4v2H7v-2H3v-4H1V7h2V3h4z"/><path fill="#ffb44c" d="M7 1h10v2H7zM3 3h4v4H3zM1 7h2v4H1z"/><path fill="#c75417" d="M21 12h2v5h-2v4h-4v2H7v-2h10v-2h2v-4h2z"/><path fill="#663016" d="M11 1h2v10h10v2H13v10h-2V13H1v-2h10zM5 3h2v4H5zM7 7h2v10H7zM5 17h2v4H5zM17 3h2v4h-2zM15 7h2v10h-2zM17 17h2v4h-2z"/></svg></span><span class="horse-action-label"></span>';
      else turnButton.textContent = showFeedback ? feedback : game.status === 'pending' ? 'invite sent' : horseActive(game) ? `Waiting for ${other!.name}` : text;
      const actionLabel = turnButton.querySelector('.horse-action-label');
      if (actionLabel) actionLabel.textContent = basketball.placingChallenge ? 'confirm challenge' : game.status === 'pending' ? 'accept game' : 'your turn';
      turnButton.setAttribute('aria-label', text);
      const resultUnseen = !horseActive(game) && !game.seenBy.includes(mine) && !game.seenBy.includes(`${mine}:result`);
      turnButton.disabled = basketball.placingChallenge || (!(horseCanShoot(game, mine) || (game.status === 'pending' && game.challengee.ownerId === mine) || resultUnseen)) || (!!playing && !showFeedback);
      turnButton.hidden = !toolbarVisible || !(horseActive(game) || showFeedback || resultUnseen);
      const inFlight = basketball.shotInFlight && (playing || pendingFeedback);
      basketball.setHint(inFlight ? 'shot away' : showFeedback && basketball.shooting ? feedback : playing ? (basketball.shooting ? `your turn · ${(basketball.shotDistance * 3.28084).toFixed(0)} ft` : 'your turn · choose a spot') : undefined, inFlight ? flightLetters : playing || (showFeedback && basketball.shooting) ? horseLetters(horseSide(game, mine)!) : undefined);
    } else { turnButton.hidden = true; basketball.setHint(undefined); }
    turnButton.classList.toggle('horse-replay-progress', !!replay);
    if (replay) {
      turnButton.style.setProperty('--replay-progress', `${Math.min(100, replay.elapsed / replay.endAt * 100)}%`);
      turnButton.hidden = false; turnButton.disabled = false; turnButton.textContent = 'watching shot · skip';
      turnButton.setAttribute('aria-label', 'Watching opponent shot. Skip replay');
    }
  }
  basketball.onExit(() => { if (playing && !basketball.armedShot) { playing = undefined; armedFor = undefined; } paint(); });
  const stopMessages = onFactoryMessage(message => {
    if (message.type === 'challenge_state') receiveState(message);
    else if (message.type === 'challenge_result') receiveResult(message);
  });
  const stopConnection = onFactoryConnection(state => { connected = state; if (!state && !preview) { games.clear(); paint(); } });

  // Local preview: an isolated book. The teammate has set a shot; after each of your shots they answer in kind.
  function local(request: ChallengeRequest) {
    const mine = me()!, t = now();
    let result: ChallengeResult;
    if (request.action === 'create') {
      const member = options.members().find(m => m.id === request.challengeeId);
      result = preview!.create({ ownerId: mine, name: 'you · preview' }, { ownerId: request.challengeeId, name: member?.name ?? 'teammate · preview' }, t);
    } else if (request.action === 'cancel') result = preview!.cancel(request.id, mine, t);
    else if (request.action === 'respond') result = preview!.respond(request.id, mine, request.accept, t);
    else if (request.action === 'seen') result = preview!.seen(request.id, mine, t);
    else result = preview!.shot(request.id, mine, request.revision, request.position, request.velocity, t, request.targetSpot);
    const publish = () => receiveState({ type: 'challenge_state', serverTime: now(), challenges: preview!.forOwner(mine) });
    setTimeout(() => { receiveResult(result); publish(); }, 60);
    // The teammate answers a moment later: accepting an invite, matching (missing one in three), then setting from a fixed spot.
    if (result.success && (request.action === 'shot' || request.action === 'create')) setTimeout(() => {
      const first = preview!.get(result.id!); if (!first || !horseActive(first)) return;
      const them = horseOpponent(first, mine).ownerId;
      if (first.status === 'pending' && first.challengee.ownerId === them) preview!.respond(first.id, them, true, now());
      for (let guard = 0; guard < 2; guard++) {
        const game = preview!.get(result.id!); if (!game || !horseActive(game) || game.turn.shooter !== them) break;
        const spot = game.turn.role === 'match' ? { x: game.turn.spot!.x, y: HORSE_RELEASE_Y, z: game.turn.spot!.z } : { x: 2.4, y: HORSE_RELEASE_Y, z: -3.0 };
        const missIt = game.revision % 3 === 0;
        preview!.shot(game.id, them, game.revision, spot, missIt ? visitorShotVelocity(spot, { ...VISITOR_BALL_RIM, x: VISITOR_BALL_RIM.x + 1.2 }) : visitorShotVelocity(spot), now());
      }
      publish();
    }, 2600);
  }
  if (preview) {
    const teammate = { ownerId: 'preview-teammate', name: 'teammate · preview' };
    const created = preview.create(teammate, { ownerId: 'preview-owner', name: 'you · preview' }, now() - 3600_000);
    if (created.id) {
      const spot = { x: 2.4, y: HORSE_RELEASE_Y, z: -3.0 };
      preview.shot(created.id, teammate.ownerId, preview.get(created.id)!.revision, spot, visitorShotVelocity(spot), now() - 3500_000);
      // Preview starts a fresh game; one missed match earns H, not an instant loss.
    }
    setTimeout(() => receiveState({ type: 'challenge_state', serverTime: now(), challenges: preview.forOwner('preview-owner') }), 1500);
  }

  return {
    update(visible: boolean, camera: THREE.Camera, showToolbar = visible) {
      if (toolbarVisible !== showToolbar) { toolbarVisible = showToolbar; paint(); }
      if (roomVisible !== visible) { roomVisible = visible; if (!visible && replay) finishReplay(false); paint(); }
      if (replay) {
        const current = games.get(replay.gameId);
        if (current?.revision !== replay.revision) finishReplay(false);
        else {
          const time = performance.now(); const delta = Math.min(.1, (time - replay.at) / 1000); replay.at = time;
          if (replay.delay > 0) replay.delay = Math.max(0, replay.delay - delta); else replay.accumulator += delta;
          while (replay.accumulator >= 1 / 120 && replay.elapsed < 4) { const contact = stepVisitorBall(replay.ball, 1 / 120);
            if (contact.rimImpact > 0) options.replayEffects?.rim(contact.rimImpact);
            if (contact.swish) options.replayEffects?.swish();
            if (contact.bounce > .12) options.replayEffects?.bounce(contact.bounce);
            if (!replay.resultShown && (contact.swish || contact.floorHit)) {
              const made = contact.swish || replay.ball.scored;
              replay.resultShown = true; replay.endAt = Math.min(4, replay.elapsed + (made ? .45 : .65));
              options.replayEffects?.result(made);
            }
            replay.accumulator -= 1 / 120; replay.elapsed += 1 / 120; }
          replayBall.position.set(replay.ball.position.x, replay.ball.position.y, replay.ball.position.z);
          replayBall.rotation.x = replay.elapsed * 5;
          paintActor(replay.delay > 0, replay.elapsed);
          replayActor.position.y = .425 + (replay.delay > 0 ? 0 : Math.max(0, Math.sin(Math.min(1, replay.elapsed / .45) * Math.PI)) * .09);
          turnButton.style.setProperty('--replay-progress', `${Math.min(100, (replay.elapsed + replay.accumulator) / replay.endAt * 100)}%`);
          if (replay.elapsed >= replay.endAt) finishReplay(true);
        }
      }
      // Entering basketball is already the player's intent to play. Arm a ready
      // turn here, while leaving invitations and people elsewhere in the room alone.
      if (visible && connected && basketball.shooting && !basketball.shotInFlight
        && !basketball.armedShot && !basketball.placingChallenge && !replay && !playing && !startSpot) {
        const game = focus(), mine = me();
        if (game && mine && horseCanShoot(game, mine)) beginTurn(game);
      }
      updatePicker();
      if (acceptedSpot) {
        const game = games.get(acceptedSpot.id);
        if (!game || game.revision !== acceptedSpot.revision) acceptedSpot = undefined;
        else if (visible && basketball.placeMatchBall(acceptedSpot.spot)) { acceptedSpot = undefined; beginTurn(game); }
      }
      const toolbar = document.querySelector<HTMLElement>('.factory-toolbar');
      if (toolbar && turnButton.parentElement !== toolbar) toolbar.querySelector('.factory-toolbar-actions')?.after(turnButton);
      if (toolbar && challengePicker.parentElement !== toolbar) turnButton.after(challengePicker);
      if (toolbar && challengePicker.open) toolbar.style.setProperty('--challenge-height', `${pickerList.offsetHeight + 24}px`);
      if (startSpot) {
        if (performance.now() > startDeadline) startSpot = undefined;
        else {
          const mine = me();
          const game = startSpot === 'created' ? [...games.values()].find(g => g.status === 'pending' && g.challenger.ownerId === mine && g.turn.shooter === mine) : games.get(startSpot);
          if (game && mine && horseCanShoot(game, mine) && visible) { startSpot = undefined; beginTurn(game); }
        }
      }
      if (pendingFeedback && !basketball.shotInFlight) { feedback = pendingFeedback; pendingFeedback = ''; feedbackUntil = performance.now() + 6500; paint(); }
      if (feedback && performance.now() >= feedbackUntil) { feedback = ''; paint(); }
      const signature=JSON.stringify([basketball.shooting,basketball.placingChallenge,Math.round(basketball.shotDistance*3.28084),feedback]);
      if(signature!==viewSignature){viewSignature=signature;paint();}
      mark.place(camera, visible && !basketball.shooting && !replay);
    },
    dispose() { if (pendingSend) { clearTimeout(pendingSend.timer); pendingSend.reject(new Error('Challenge closed.')); pendingSend = undefined; } abort.abort(); stopMessages(); stopConnection(); basketball.showReplayView(); basketball.disarm(); mark.dispose(); replayActor.removeFromParent(); actorMaterial.dispose(); actorTexture.dispose(); replayBall.removeFromParent(); replayBall.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose(); } }); challengePicker.remove(); turnButton.remove(); },
  };
}
