// Run with: node combat-check.cjs. Headless combat checks; no browser rendering.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {
  Phaser: { Scene: class {}, Game: class {}, Math: { Clamp: (v, min, max) => Math.min(max, Math.max(min, v)) }, Scale: {} },
  document: { querySelector: () => null }
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'main.js'), 'utf8') + '\nglobalThis.combat = { NeonClash, FRAME_MS };', context);
const { NeonClash, FRAME_MS: F } = context.combat;
let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const close = (actual, expected, message) => check(Math.abs(actual - expected) < 1e-7, message);

function fighter(x, facing, isPlayer) {
  return {
    x, facing, isPlayer, health: 100, meter: 45, velocityX: 0, velocityY: 0,
    jumpHeight: 0, jumpDirection: 0, attack: null, attackCooldown: 0,
    stunUntil: 0, stunType: '', invulnerableUntil: 0, isGuarding: false,
    guardLow: false, launched: false, launchVelocityX: 0, comboCount: 0,
    setFacing(direction) { this.facing = direction; }, setPose() {}
  };
}

function setup() {
  const scene = new NeonClash();
  scene.time = { now: 1000 };
  scene.player = fighter(420, 1, true);
  scene.rival = fighter(480, -1, false);
  scene.keys = { guard: { isDown: false }, up: { isDown: false }, down: { isDown: false }, arrowDown: { isDown: false } };
  scene.getMoveAxes = () => ({ horizontal: 0, up: false, down: false });
  scene.cameras = { main: { shake() {} } };
  scene.tweens = { add() {} };
  scene.comboText = { setText() { return this; }, setAlpha() { return this; }, setScale() { return this; } };
  scene.spawnBurst = scene.playTone = scene.showMessage = () => {};
  return scene;
}

// Early and late contact must have the same specified advantage, on both sides.
for (const facing of [1, -1]) {
  for (const [kind, blocked, advantage] of [
    ['light', true, 3], ['light', false, 12],
    ['medium', true, -8], ['medium', false, 11], ['heavy', true, -12]
  ]) {
    for (const late of [false, true]) {
      const s = setup();
      s.player.facing = facing;
      s.rival.x = s.player.x + facing * 60;
      s.rival.facing = -facing;
      s.rival.isGuarding = blocked;
      check(s.startMelee(s.player, kind), 'normal attack starts');
      const move = s.player.attack.data;
      s.time.now += move.startup + (late ? move.active - F : 0);
      s.updateAttack(s.player, s.rival, F, s.time.now);
      check(s.player.attack.hit, 'normal attack connects');
      close((s.rival.stunUntil - s.player.attackCooldown) / F, advantage, `${kind} advantage ${advantage}F`);
      const defenderReady = s.rival.stunUntil;
      s.time.now = defenderReady - 0.1;
      check(!s.startMelee(s.rival, 'light'), 'defender cannot act before stun expires');
      s.time.now = defenderReady;
      check(s.startMelee(s.rival, 'light'), 'defender acts exactly when stun expires');
    }
  }
}

for (const lowGuard of [false, true]) {
  const s = setup();
  s.rival.isGuarding = true;
  s.rival.guardLow = lowGuard;
  s.startMelee(s.player, 'light', 'crouch');
  s.time.now += s.player.attack.data.startup;
  s.updateAttack(s.player, s.rival, F, s.time.now);
  check(s.rival.stunType === (lowGuard ? 'block' : 'hit'), 'low attack requires crouching guard');
}

{
  const s = setup();
  const gap = s.rival.x - s.player.x;
  s.startMelee(s.player, 'medium');
  s.time.now += s.player.attack.data.startup;
  s.updateAttack(s.player, s.rival, F, s.time.now);
  close(s.rival.x - s.player.x, gap + 28, 'K pushes both fighters apart by 14 pixels');
}

// A real J -> K link waits for J recovery, then hits within the original hitstun.
{
  const s = setup();
  s.startMelee(s.player, 'light');
  s.time.now += s.player.attack.data.startup;
  s.updateAttack(s.player, s.rival, F, s.time.now);
  const originalStun = s.rival.stunUntil;
  s.time.now = s.player.attackCooldown;
  check(s.startMelee(s.player, 'medium'), 'K can link after J recovery');
  s.time.now += s.player.attack.data.startup;
  check(s.time.now < originalStun, 'K contact occurs before J hitstun ends');
  s.updateAttack(s.player, s.rival, F, s.time.now);
  check(s.player.comboCount === 2, 'true link increments the combo counter');
}

for (const facing of [1, -1]) {
  for (const [motion, inputs] of [
    ['236', [[0, true], [1, true], [1, false]]],
    ['214', [[0, true], [-1, true], [-1, false]]],
    ['623', [[1, false], [0, true], [1, true]]]
  ]) {
    const s = setup();
    s.player.facing = facing;
    s.inputTrail = inputs.map(([h, down], i) => ({ horizontal: h * facing, down, up: false, time: 900 + i * 40 }));
    check(s.detectMotion(1000) === motion, `${motion} mirrors with facing ${facing}`);
    check(s.detectMotion(1800) === null, 'expired motion cannot trigger');
    check(s.startMotionAttack(motion, 'light'), 'motion special starts');
    check(s.player.meter === 45, 'manual motions do not spend shortcut meter');
    const inputScene = setup();
    inputScene.player.facing = facing;
    for (const [h, down] of inputs) {
      inputScene.time.now += 40;
      inputScene.getMoveAxes = () => ({ horizontal: h * facing, down, up: false });
      inputScene.keys.down.isDown = down;
      inputScene.sampleMotionInput(inputScene.time.now);
    }
    inputScene.recordAttackInput('light');
    check(inputScene.player.attack?.kind === (motion === '623' ? 'rising' : 'launcher'), 'real direction sampling dispatches the intended special');
  }
}

{
  const s = setup();
  s.inputTrail = [{ horizontal: 0, down: true, time: 900 }, { horizontal: 1, down: false, time: 980 }];
  check(s.detectMotion(1000) === null, 'missing diagonal does not count as 236');
}

{
  const s = setup();
  s.inputTrail = [[1, false], [0, true], [1, true], [1, false]].map(([h, down], i) => ({ horizontal: h, down, time: 860 + i * 40 }));
  check(s.detectMotion(1000) === '623', '623 has priority over overlapping 236');
  s.rival.jumpHeight = 165;
  s.startMotionAttack('623', 'light');
  s.time.now += s.player.attack.data.startup;
  s.updateAttack(s.player, s.rival, F, s.time.now);
  check(s.rival.launched && s.player.attack.hit, '623 hits and launches an airborne opponent');
}

{
  const s = setup();
  s.rival.isGuarding = true;
  s.startMotionAttack('623', 'light');
  s.time.now += s.player.attack.data.startup;
  s.updateAttack(s.player, s.rival, F, s.time.now);
  s.time.now += 15 * F;
  s.player.attack.age += 15 * F;
  check(!s.startMelee(s.player, 'heavy', 'air'), 'blocked dragon punch cannot cancel its recovery into a normal');
}

{
  const s = setup();
  s.startMelee(s.player, 'heavy');
  s.time.now += s.player.attack.data.startup;
  s.updateAttack(s.player, s.rival, F, s.time.now);
  check(s.rival.launched && s.rival.velocityY > 0, 'unblocked L launches');
  check(!s.startMelee(s.rival, 'light'), 'launched target cannot attack');
  check(s.startMotionAttack('236', 'light'), 'heavy hit cancels into launcher');
  const specialStartup = s.player.attack.data.startup;
  for (let i = 0; i < 9; i++) {
    s.time.now += F;
    s.updateFighter(s.rival, s.player, F, s.time.now, false);
  }
  check(specialStartup < 9 * F, 'launcher reaches its active window');
  s.updateAttack(s.player, s.rival, F, s.time.now);
  check(s.player.comboCount === 2 && s.rival.launched, 'launcher hits and continues the air juggle');
  let ticks = 0;
  while (s.rival.launched && ticks++ < 180) {
    s.time.now += F;
    s.updateFighter(s.rival, s.player, F, s.time.now, false);
  }
  check(!s.rival.launched && s.rival.jumpHeight === 0, 'launched target falls and lands');
}

{
  const s = setup();
  s.getMoveAxes = () => ({ horizontal: -1, up: true, down: false });
  s.updateFighter(s.player, s.rival, F, s.time.now, true);
  check(s.player.jumpDirection === -1 && s.player.jumpHeight > 0, 'back jump overrides automatic retreat guard');
  s.getMoveAxes = () => ({ horizontal: 1, up: false, down: false });
  s.time.now += F;
  s.updateFighter(s.player, s.rival, F, s.time.now, true);
  check(s.player.velocityX < 0, 'air movement stays locked despite opposite input');
}

{
  const s = setup();
  s.roundOver = true;
  s.elapsed = 60000;
  s.roundTimer = 0;
  s.inputTrail = [{ direction: 'f', horizontal: 1, time: 1000 }];
  const shape = () => ({
    setDepth() { return this; }, setScale() { return this; },
    setStrokeStyle() { return this; }, add() { return this; }
  });
  s.add = { ellipse: shape, container: shape, rectangle: shape, circle: shape };
  s.drawArena = s.createHud = s.createInput = s.createTouchControls = s.updateHud = () => {};
  s.cameras.main.setBackgroundColor = s.cameras.main.setBounds = s.cameras.main.fadeIn = () => {};
  s.events = { on() {} };
  s.create();
  check(!s.roundOver && s.roundTimer === 60 && s.elapsed === 0, 'restarting an ended Scene restores a full playable round');
  check(s.inputTrail.length === 0, 'restart clears old motion inputs');
  check(s.startMelee(s.player, 'light'), 'a new round accepts attacks after a prior knockout');
}

console.log(`Passed ${checks} combat checks.`);
