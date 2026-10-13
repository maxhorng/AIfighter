/* global Phaser */

const WIDTH = 1280;
const HEIGHT = 720;
const FLOOR = 568;
const LEFT_EDGE = 115;
const RIGHT_EDGE = WIDTH - 115;
const FRAME_MS = 1000 / 60;
let soundEnabled = true;

const PALETTES = {
  player: { main: 0x24d8d0, light: 0xc0fffb, dark: 0x087c91, accent: 0xffd166 },
  rival: { main: 0xff4e83, light: 0xffc0d3, dark: 0x982c63, accent: 0xffcb69 }
};

const ATTACKS = {
  light: { label: 'JAB', damage: 6, reach: 92, frames: { startup: 6, active: 6, recovery: 11 }, stun: 200, knockback: 22, meter: 5, color: 0xc0fffb },
  medium: { label: 'CROSS', damage: 11, reach: 112, frames: { startup: 11, active: 7, recovery: 16 }, stun: 330, knockback: 38, meter: 8, color: 0x61f4ef },
  heavy: { label: 'CRUSH', damage: 18, reach: 130, frames: { startup: 19, active: 9, recovery: 27 }, stun: 560, knockback: 65, meter: 12, color: 0xffd166 },
  rising: { label: 'RISING BREAK', damage: 24, reach: 108, frames: { startup: 5, active: 22, recovery: 31 }, stun: 650, knockback: 78, meter: 0, color: 0xff9a61 }
};

const CROUCH_ATTACKS = {
  light: { label: 'LOW JAB', damage: 5, reach: 88, frames: { startup: 5, active: 6, recovery: 11 }, stun: 180, knockback: 18, meter: 4, color: 0xc0fffb },
  medium: { label: 'LOW CROSS', damage: 9, reach: 103, frames: { startup: 8, active: 7, recovery: 15 }, stun: 280, knockback: 31, meter: 7, color: 0x61f4ef },
  heavy: { label: 'SWEEP', damage: 15, reach: 118, frames: { startup: 13, active: 8, recovery: 22 }, stun: 430, knockback: 52, meter: 10, color: 0xffd166 }
};

const AIR_ATTACKS = {
  light: { label: 'JUMP JAB', damage: 7, reach: 90, frames: { startup: 5, active: 8, recovery: 11 }, stun: 210, knockback: 24, meter: 5, verticalReach: 190, color: 0xc0fffb },
  medium: { label: 'CROSS-UP KICK', damage: 13, reach: 110, frames: { startup: 6, active: 10, recovery: 14 }, stun: 350, knockback: 44, meter: 8, verticalReach: 210, crossUp: true, color: 0x61f4ef },
  heavy: { label: 'JUMP CRUSH', damage: 17, reach: 116, frames: { startup: 9, active: 9, recovery: 18 }, stun: 430, knockback: 58, meter: 11, verticalReach: 205, color: 0xffd166 }
};

const NORMAL_FRAME_RULES = {
  light: { onBlock: 3, onHit: 12 },
  medium: { onBlock: -8, onHit: 11, pushDistance: 14 },
  heavy: { onBlock: -12, launchY: 620 }
};

const MOTION_ATTACKS = {
  '236': { label: 'RISING PALM', damage: 15, reach: 155, frames: { startup: 8, active: 8, recovery: 16 }, stun: 700, launchY: 650, knockback: 100, meter: 8, verticalReach: 300, color: 0x72fff1 },
  '214': { label: 'REVERSE LIFT', damage: 17, reach: 130, frames: { startup: 10, active: 10, recovery: 18 }, stun: 750, launchY: 700, knockback: 80, meter: 9, verticalReach: 330, color: 0xb99cff },
  '623': { ...ATTACKS.rising, launchY: 720, verticalReach: 400 }
};

function useAttackFrames(spec) {
  const { startup, active, recovery } = spec.frames;
  return {
    ...spec,
    startup: startup * FRAME_MS,
    active: active * FRAME_MS,
    recovery: recovery * FRAME_MS
  };
}

class Fighter {
  constructor(scene, x, palette, isPlayer, name) {
    this.scene = scene;
    this.x = x;
    this.y = FLOOR;
    this.palette = palette;
    this.isPlayer = isPlayer;
    this.name = name;
    this.facing = isPlayer ? 1 : -1;
    this.health = 100;
    this.meter = isPlayer ? 45 : 0;
    this.velocityX = 0;
    this.jumpHeight = 0;
    this.velocityY = 0;
    this.jumpDirection = 0;
    this.jumpOnAttack = false;
    this.attack = null;
    this.attackCooldown = 0;
    this.stunUntil = 0;
    this.stunType = '';
    this.guardLow = false;
    this.launched = false;
    this.launchVelocityX = 0;
    this.invulnerableUntil = 0;
    this.guardHeld = false;
    this.isGuarding = false;
    this.isCrouching = false;
    this.isWalking = false;
    this.lastHitAt = 0;
    this.lastAttack = '';
    this.comboCount = 0;
    this.comboUntil = 0;
    this.displayState = 'IDLE';

    this.shadow = scene.add.ellipse(x, FLOOR - 4, 94, 22, 0x040712, 0.42).setDepth(4);
    this.root = scene.add.container(x, FLOOR).setDepth(10);
    this.parts = {};
    this.buildBody();
  }

  buildBody() {
    const addRect = (key, x, y, w, h, color) => {
      const part = this.scene.add.rectangle(x, y, w, h, color);
      this.parts[key] = part;
      this.root.add(part);
      return part;
    };
    const addCircle = (key, x, y, radius, color) => {
      const part = this.scene.add.circle(x, y, radius, color);
      this.parts[key] = part;
      this.root.add(part);
      return part;
    };
    const p = this.palette;

    addRect('backLeg', -13, -24, 19, 43, p.dark);
    addRect('frontLeg', 12, -24, 20, 43, p.main);
    addRect('backBoot', -15, -4, 31, 10, 0x10182b);
    addRect('frontBoot', 14, -4, 32, 10, 0x10182b);
    addRect('hips', 0, -47, 44, 18, 0x172139);
    addRect('torso', 0, -76, 48, 48, p.main);
    addRect('chest', 4, -80, 32, 25, p.light);
    addRect('belt', 0, -54, 47, 8, p.accent);
    addRect('backArm', -29, -73, 16, 37, p.dark);
    addCircle('backFist', -30, -54, 10, p.light);
    addRect('frontArm', 29, -72, 17, 38, p.main);
    addCircle('frontFist', 30, -50, 11, p.light);
    addCircle('head', 2, -114, 22, p.light);
    addRect('hair', 2, -132, 43, 10, p.dark);
    addRect('headband', 2, -124, 48, 6, p.accent);
    addRect('visor', 12, -114, 18, 5, 0x12253b);
    addRect('scarf', -23, -90, 20, 8, p.accent);

    this.parts.frontFist.setStrokeStyle(2, p.dark, 0.8);
    this.parts.backFist.setStrokeStyle(2, p.dark, 0.8);
    this.parts.head.setStrokeStyle(3, p.dark, 1);
    this.parts.torso.setStrokeStyle(2, p.light, 0.6);
  }

  setFacing(direction) {
    if (direction !== 0) this.facing = Math.sign(direction);
    this.root.setScale(this.facing, 1);
  }

  setPose(now) {
    const parts = this.parts;
    const isHit = now < this.stunUntil && this.stunType !== 'block';
    const isAttacking = Boolean(this.attack);
    const bob = this.isWalking && !isAttacking ? Math.sin(now / 65) * 2 : Math.sin(now / 250) * 1.5;
    this.root.setPosition(this.x, FLOOR - this.jumpHeight + bob);
    this.root.setDepth(10 + this.x / 10000);
    this.shadow.setPosition(this.x, FLOOR - 4).setScale(1 - Math.min(this.jumpHeight / 250, 0.45), 1 - Math.min(this.jumpHeight / 300, 0.35));

    parts.frontArm.setPosition(29, -72).setAngle(0);
    parts.frontFist.setPosition(30, -50);
    parts.backArm.setPosition(-29, -73).setAngle(0);
    parts.backFist.setPosition(-30, -54);
    parts.frontLeg.setPosition(12, -24);
    parts.backLeg.setPosition(-13, -24);
    parts.frontLeg.setAngle(0);
    parts.backLeg.setAngle(0);
    this.root.setAngle(0);
    parts.torso.setAngle(0);
    parts.head.setX(2);
    parts.frontBoot.setPosition(14, -4).setAngle(0);
    parts.backBoot.setPosition(-15, -4).setAngle(0);
    parts.torso.setY(-76);
    parts.head.setY(-114);
    parts.scarf.setX(-23);

    if (this.isCrouching && !isAttacking && !isHit) {
      parts.torso.setY(-61);
      parts.head.setY(-93);
      parts.frontLeg.setPosition(18, -18).setAngle(-18);
      parts.backLeg.setPosition(-13, -17).setAngle(18);
      parts.frontArm.setPosition(33, -53).setAngle(-60);
      parts.frontFist.setPosition(44, -40);
    } else if (this.isGuarding && !isHit) {
      parts.frontArm.setPosition(19, -82).setAngle(-58);
      parts.frontFist.setPosition(38, -91);
      parts.backArm.setPosition(-4, -78).setAngle(-25);
      parts.backFist.setPosition(15, -85);
    }

    if (isHit) {
      if (this.launched) this.root.setAngle(-Math.sign(this.launchVelocityX) * 24);
      parts.torso.setAngle(-this.facing * 12);
      parts.head.setX(-this.facing * 4);
      parts.frontArm.setPosition(35, -86).setAngle(-75);
      parts.frontFist.setPosition(43, -99);
      this.displayState = this.launched ? 'AIR HIT' : 'HIT';
    }

    if (this.attack) {
      const a = this.attack;
      const reach = a.data.reach;
      if (a.kind === 'fireball') {
        parts.frontArm.setPosition(32, -83).setAngle(-38);
        parts.frontFist.setPosition(51, -91);
        this.displayState = a.label;
      } else if (a.kind === 'rising') {
        const lift = Math.min(a.age / 140, 1);
        this.root.setAngle(-this.facing * Math.sin(a.age / 460) * 8);
        parts.frontArm.setPosition(30, -90 - lift * 10).setAngle(-65);
        parts.frontFist.setPosition(41, -108 - lift * 10);
        parts.backLeg.setPosition(-12, -20).setAngle(24);
      } else if (a.stance === 'air') {
        parts.frontArm.setPosition(20, -88).setAngle(-42);
        parts.frontFist.setPosition(36, -105);
        const startup = a.data.frames.startup;
        const activeEnd = startup + a.data.frames.active;
        const kickAngle = a.frame < startup ? -25 : a.frame < activeEnd ? -64 : -20;
        parts.frontLeg.setPosition(42, -42).setAngle(kickAngle);
        parts.frontBoot.setPosition(63, -29).setAngle(kickAngle);
        this.displayState = a.label;
      } else if (a.stance === 'crouch') {
        parts.torso.setY(-61);
        parts.head.setY(-93);
        parts.frontLeg.setPosition(18, -18).setAngle(-18);
        parts.backLeg.setPosition(-13, -17).setAngle(18);
        const { startup, active, recovery } = a.data.frames;
        const activeEnd = startup + active;
        const extension = a.frame < startup
          ? -0.12 * (a.frame + 1) / startup
          : a.frame < activeEnd
            ? Math.min(1, (a.frame - startup + 1) / 2)
            : Math.max(0, 1 - (a.frame - activeEnd + 1) / recovery);
        parts.frontArm.setPosition(31 + extension * reach * 0.35, -48).setAngle(-4);
        parts.frontFist.setPosition(42 + extension * reach * 0.68, -51);
        this.displayState = a.label;
      } else {
        const { startup, active, recovery } = a.data.frames;
        const activeEnd = startup + active;
        const reachPose = a.frame < startup
          ? -0.1 * (a.frame + 1) / startup
          : a.frame < activeEnd
            ? Math.min(1, (a.frame - startup + 1) / 2)
            : Math.max(0.08, 1 - (a.frame - activeEnd + 1) / recovery);
        parts.frontArm.setPosition(29 + reachPose * (reach * 0.42), -73).setAngle(-7);
        parts.frontFist.setPosition(39 + reachPose * (reach * 0.8), -76);
        parts.torso.setAngle(-this.facing * reachPose * 4);
        this.displayState = a.label;
      }
    } else if (!isHit && this.isGuarding && this.isWalking) {
      this.displayState = 'BACK GUARD';
      const step = Math.sin(now / 72) * 5;
      parts.frontLeg.setY(-24 + step).setAngle(step * 0.45);
      parts.backLeg.setY(-24 - step).setAngle(-step * 0.45);
    } else if (!isHit && this.isGuarding) {
      this.displayState = 'GUARD';
    } else if (!isHit && this.isCrouching) {
      this.displayState = 'CROUCH';
    } else if (!isHit && this.isWalking) {
      this.displayState = 'MOVE';
      const step = Math.sin(now / 65) * 9;
      parts.frontLeg.setY(-24 + step).setAngle(step * 0.8);
      parts.backLeg.setY(-24 - step).setAngle(-step * 0.8);
      parts.frontArm.setY(-72 - step * 0.4).setAngle(-step * 0.6);
      parts.backArm.setY(-73 + step * 0.4).setAngle(step * 0.6);
    } else if (!isHit) {
      this.displayState = this.jumpHeight > 0 ? 'AIR' : 'IDLE';
    }
  }

  destroy() {
    this.shadow.destroy();
    this.root.destroy(true);
  }
}

class NeonClash extends Phaser.Scene {
  constructor() {
    super('NeonClash');
    this.soundEnabled = true;
    this.audioContext = null;
    this.projectiles = [];
    this.effects = [];
    this.inputTrail = [];
    this.lastDirection = '';
    this.comboMessageUntil = 0;
    this.roundOver = false;
    this.roundTimer = 60;
    this.elapsed = 0;
    this.cpuAttackAt = 0;
    this.cpuGuardUntil = 0;
    this.cpuNextDecision = 0;
  }

  create() {
    // Phaser reuses the Scene instance on restart; reset each round's state here.
    this.roundOver = false;
    this.roundTimer = 60;
    this.elapsed = 0;
    this.projectiles = [];
    this.effects = [];
    this.inputTrail = [];
    this.attackTrail = [];
    this.lastDirection = '';
    this.comboMessageUntil = 0;
    this.cpuAttackAt = 0;
    this.cpuGuardUntil = 0;
    this.cpuGuardLow = false;
    this.cpuNextDecision = 0;
    this.soundEnabled = soundEnabled;
    this.drawArena();
    this.player = new Fighter(this, 420, PALETTES.player, true, 'CYAN STRIKER');
    this.rival = new Fighter(this, 860, PALETTES.rival, false, 'ROSE RONIN');
    this.player.setFacing(1);
    this.rival.setFacing(-1);
    this.createHud();
    this.createInput();
    this.createTouchControls();
    this.updateHud();
    this.cameras.main.setBackgroundColor('#080d1a');
    this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
    this.cameras.main.fadeIn(350, 3, 10, 25);
    this.events.on('shutdown', this.shutdown, this);
  }

  drawArena() {
    const bg = this.add.graphics().setDepth(0);
    bg.fillGradientStyle(0x0b1330, 0x0b1330, 0x151c3a, 0x091424, 1);
    bg.fillRect(0, 0, WIDTH, HEIGHT);
    bg.fillStyle(0x101a35, 1);
    bg.fillRect(0, 330, WIDTH, FLOOR - 330);

    for (let i = 0; i < 14; i++) {
      const x = i * 102 - 20;
      const h = 85 + ((i * 47) % 150);
      bg.fillStyle(i % 2 ? 0x111c38 : 0x16203d, 1);
      bg.fillRect(x, FLOOR - h - 72, 75, h);
      bg.fillStyle(i % 3 ? 0x46d8e8 : 0xff568e, 0.35);
      for (let row = 0; row < 4; row++) {
        bg.fillRect(x + 12, FLOOR - h - 58 + row * 19, 5, 7);
        bg.fillRect(x + 31, FLOOR - h - 58 + row * 19, 5, 7);
        bg.fillRect(x + 50, FLOOR - h - 58 + row * 19, 5, 7);
      }
    }

    bg.fillStyle(0x45e9ed, 0.1);
    bg.fillRect(0, 360, WIDTH, 3);
    bg.fillStyle(0x101729, 1);
    bg.fillRect(0, FLOOR - 14, WIDTH, HEIGHT - FLOOR + 14);
    bg.fillStyle(0x42dfe7, 0.75);
    bg.fillRect(0, FLOOR - 14, WIDTH, 2);
    bg.fillStyle(0x182541, 1);
    bg.fillRect(0, FLOOR + 43, WIDTH, 3);

    bg.lineStyle(1, 0x35cbd9, 0.18);
    for (let i = 0; i < 18; i++) {
      const x = i * 80;
      bg.lineBetween(WIDTH / 2, FLOOR - 1, x, HEIGHT);
    }
    for (let y = 590; y < HEIGHT + 70; y += 26) {
      bg.lineBetween(0, y, WIDTH, y);
    }

    const glow = this.add.graphics().setDepth(1);
    glow.fillStyle(0x27e8de, 0.07);
    glow.fillEllipse(365, 530, 330, 88);
    glow.fillStyle(0xff4f91, 0.07);
    glow.fillEllipse(910, 530, 330, 88);
    glow.lineStyle(2, 0x62f4ef, 0.4);
    glow.lineBetween(65, FLOOR - 11, WIDTH - 65, FLOOR - 11);
    this.arenaGlow = glow;
  }

  createHud() {
    this.hud = this.add.graphics().setDepth(40).setScrollFactor(0);
    this.playerName = this.add.text(44, 28, 'CYAN STRIKER', { fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: '#cafffc', letterSpacing: 2 }).setDepth(41).setScrollFactor(0);
    this.rivalName = this.add.text(WIDTH - 44, 28, 'ROSE RONIN', { fontFamily: 'Arial', fontSize: '20px', fontStyle: 'bold', color: '#ffd2df', letterSpacing: 2 }).setOrigin(1, 0).setDepth(41).setScrollFactor(0);
    this.roundText = this.add.text(WIDTH / 2, 30, 'ROUND 01', { fontFamily: 'Arial', fontSize: '13px', fontStyle: 'bold', color: '#a7b4d1', letterSpacing: 3 }).setOrigin(0.5, 0).setDepth(41).setScrollFactor(0);
    this.timerText = this.add.text(WIDTH / 2, 49, '60', { fontFamily: 'Arial', fontSize: '36px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5, 0).setDepth(41).setScrollFactor(0);
    this.playerMeterText = this.add.text(44, 74, '氣量', { fontFamily: 'Arial', fontSize: '11px', fontStyle: 'bold', color: '#64eee8' }).setDepth(41).setScrollFactor(0);
    this.rivalMeterText = this.add.text(WIDTH - 44, 74, '氣量', { fontFamily: 'Arial', fontSize: '11px', fontStyle: 'bold', color: '#ff75a0' }).setOrigin(1, 0).setDepth(41).setScrollFactor(0);
    this.stateText = this.add.text(WIDTH / 2, 104, 'FIGHT!', { fontFamily: 'Arial', fontSize: '21px', fontStyle: 'bold', color: '#ffffff', letterSpacing: 5 }).setOrigin(0.5).setDepth(41).setScrollFactor(0).setAlpha(0);
    this.inputText = this.add.text(44, HEIGHT - 24, '', { fontFamily: 'Arial', fontSize: '13px', fontStyle: 'bold', color: '#7ffaf0', letterSpacing: 1 }).setOrigin(0, 1).setDepth(41).setScrollFactor(0);
    this.cpuText = this.add.text(WIDTH - 44, HEIGHT - 24, 'CPU  ·  NOVICE', { fontFamily: 'Arial', fontSize: '11px', fontStyle: 'bold', color: '#8894b3', letterSpacing: 2 }).setOrigin(1, 1).setDepth(41).setScrollFactor(0);
    this.comboText = this.add.text(WIDTH / 2, 177, '', { fontFamily: 'Arial', fontSize: '19px', fontStyle: 'bold', color: '#ffd46e', letterSpacing: 2, stroke: '#1a1830', strokeThickness: 5 }).setOrigin(0.5).setDepth(42).setScrollFactor(0).setAlpha(0);
    this.resultPanel = this.add.container(WIDTH / 2, HEIGHT / 2).setDepth(80).setScrollFactor(0).setVisible(false);
    const panel = this.add.rectangle(0, 0, 520, 220, 0x080d1a, 0.94).setStrokeStyle(2, 0x69ebe6, 0.8);
    const panelTitle = this.add.text(0, -40, '', { fontFamily: 'Arial', fontSize: '52px', fontStyle: 'bold', color: '#ffffff', letterSpacing: 5 }).setOrigin(0.5);
    const panelHint = this.add.text(0, 42, '按 R 再戰一場', { fontFamily: 'Arial', fontSize: '16px', color: '#aab7d2', letterSpacing: 2 }).setOrigin(0.5);
    this.resultPanel.add([panel, panelTitle, panelHint]);
    this.resultTitle = panelTitle;
  }

  createInput() {
    const input = this.input.keyboard;
    this.keys = input.addKeys({
      left: 'A', right: 'D', up: 'W', down: 'S', guard: 'SHIFT',
      light: 'J', medium: 'K', heavy: 'L', projectile: 'U', rising: 'I',
      arrowLeft: 'LEFT', arrowRight: 'RIGHT', arrowUp: 'UP', arrowDown: 'DOWN'
    });
    this.keyDownHandler = (event) => {
      this.resumeAudio();
      if (event.code === 'KeyR') {
        this.scene.restart();
      }
    };
    input.on('keydown', this.keyDownHandler);
    this.input.keyboard.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
    this.input.keyboard.on('keydown-SPACE', (event) => event.preventDefault());
  }

  createTouchControls() {
    this.touchButtons = [];
    const addTouchButton = (x, label, action, color) => {
      const group = this.add.container(x, HEIGHT - 76).setDepth(55).setScrollFactor(0).setAlpha(0.5);
      const circle = this.add.circle(0, 0, 31, color, 0.32).setStrokeStyle(2, color, 0.9);
      const text = this.add.text(0, 0, label, { fontFamily: 'Arial', fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5);
      group.add([circle, text]);
      const zone = this.add.zone(x, HEIGHT - 76, 66, 66).setOrigin(0.5).setScrollFactor(0).setDepth(56).setInteractive();
      zone.on('pointerdown', () => { this.resumeAudio(); action(); group.setAlpha(0.95); });
      zone.on('pointerup', () => group.setAlpha(0.5));
      zone.on('pointerout', () => group.setAlpha(0.5));
      this.touchButtons.push(group, zone);
    };
    addTouchButton(68, '◀', () => { this.player.x = Math.max(LEFT_EDGE, this.player.x - 38); }, 0x61f4ef);
    addTouchButton(144, '▶', () => { this.player.x = Math.min(RIGHT_EDGE, this.player.x + 38); }, 0x61f4ef);
    addTouchButton(WIDTH - 210, '輕', () => this.tryAttack('light'), 0x61f4ef);
    addTouchButton(WIDTH - 140, '中', () => this.tryAttack('medium'), 0x93a7ff);
    addTouchButton(WIDTH - 70, '重', () => this.tryAttack('heavy'), 0xffd166);
  }

  getMoveAxes() {
    const left = this.keys.left.isDown || this.keys.arrowLeft.isDown;
    const right = this.keys.right.isDown || this.keys.arrowRight.isDown;
    return { horizontal: Number(right) - Number(left), down: this.keys.down.isDown || this.keys.arrowDown.isDown, up: this.keys.up.isDown || this.keys.arrowUp.isDown };
  }

  sampleMotionInput(now) {
    const axes = this.getMoveAxes();
    const fwd = axes.horizontal * this.player.facing;
    let direction = '';
    if (axes.down && fwd > 0) direction = 'df';
    else if (axes.down && fwd < 0) direction = 'db';
    else if (axes.down) direction = 'd';
    else if (axes.up && fwd > 0) direction = 'uf';
    else if (axes.up && fwd < 0) direction = 'ub';
    else if (axes.up) direction = 'u';
    else if (fwd > 0) direction = 'f';
    else if (fwd < 0) direction = 'b';
    if (direction !== this.lastDirection) {
      this.inputTrail.push({ direction, horizontal: axes.horizontal, down: axes.down, up: axes.up, time: now });
    }
    this.inputTrail = this.inputTrail.filter((item) => now - item.time < 700).slice(-20);
    this.lastDirection = direction;
  }

  recordAttackInput(kind) {
    const now = this.time.now;
    this.attackTrail = this.attackTrail || [];
    this.attackTrail.push({ kind, time: now });
    this.attackTrail = this.attackTrail.filter((item) => now - item.time < 900).slice(-5);
    if (this.roundOver) return;
    const airborne = this.player.jumpHeight > 0 || this.player.velocityY > 0;
    const jumpAttackInput = this.keys.up.isDown && this.player.jumpHeight === 0 && now > (this.player.nextJumpAt || 0);
    const crouching = !airborne && (this.keys.down.isDown || this.keys.arrowDown.isDown);
    const stance = airborne || jumpAttackInput ? 'air' : crouching ? 'crouch' : 'standing';
    const motion = !airborne && this.detectMotion(now);
    if (motion) {
      if (this.startMotionAttack(motion, kind)) {
        this.inputTrail = [];
        this.lastDirection = '';
      }
    } else {
      const started = this.tryAttack(kind, stance);
      if (started && jumpAttackInput) this.player.jumpOnAttack = true;
    }
  }

  detectMotion(now) {
    const facing = this.player.facing;
    const recent = this.inputTrail.filter((item) => now - item.time <= 600).map((item) => {
      const h = item.horizontal * facing;
      const direction = item.up ? 'u' : item.down ? (h > 0 ? 'df' : h < 0 ? 'db' : 'd') : (h > 0 ? 'f' : h < 0 ? 'b' : '');
      return { direction, time: item.time };
    }).filter((item) => item.direction);
    // Check 623 first so a forward input before 236 resolves to a dragon punch.
    for (const [motion, sequence] of [['623', ['f', 'd', 'df']], ['236', ['d', 'df', 'f']], ['214', ['d', 'db', 'b']]]) {
      for (let i = recent.length - 3; i >= 0; i--) {
        if (now - recent[i + 2].time > 160) continue;
        if (sequence.every((direction, index) => recent[i + index].direction === direction)) return motion;
      }
    }
    return null;
  }

  tryAttack(kind, stance = 'standing') {
    if (this.roundOver || this.player.health <= 0 || this.player.meter < 0) return;
    return this.startMelee(this.player, kind, stance);
  }

  startMelee(attacker, kind, stance = 'standing') {
    const now = this.time.now;
    if (now < attacker.stunUntil || attacker.launched || attacker.health <= 0) return false;
    if (attacker.attack && now >= attacker.attackCooldown) attacker.attack = null;
    if (attacker.attack) {
      const nextRank = { light: 1, medium: 2, heavy: 3 }[kind] || 4;
      const oldRank = { light: 1, medium: 2, heavy: 3 }[attacker.attack.baseKind || attacker.attack.kind] || 4;
      const cancelAt = attacker.attack.data.startup + attacker.attack.data.active * 0.45;
      const isSpecial = ['launcher', 'rising'].includes(attacker.attack.kind);
      if (!attacker.attack.hit || attacker.attack.age < cancelAt || (isSpecial ? attacker.attack.connection !== 'hit' : nextRank <= oldRank)) return false;
    } else if (now < attacker.attackCooldown) {
      return false;
    }
    const spec = stance === 'air' ? AIR_ATTACKS[kind] : stance === 'crouch' ? CROUCH_ATTACKS[kind] : ATTACKS[kind];
    const data = { ...useAttackFrames(spec), ...NORMAL_FRAME_RULES[kind], low: stance === 'crouch' };
    attacker.attack = { kind, baseKind: kind, stance, direction: attacker.facing, label: data.label, data, startedAt: now, age: 0, frame: 0, hit: false };
    attacker.attackCooldown = now + data.startup + data.active + data.recovery;
    attacker.isGuarding = false;
    this.playTone(kind === 'heavy' ? 125 : kind === 'medium' ? 185 : 280, 0.07, 'sawtooth');
    return true;
  }

  launchFireball(kind, fromMotion) {
    const now = this.time.now;
    const cost = kind === 'heavy' ? 35 : kind === 'medium' ? 27 : 20;
    if (this.roundOver || this.player.launched || this.player.meter < cost || now < this.player.stunUntil || now < this.player.attackCooldown) {
      this.showMessage('氣量不足', 700, '#ff8ba8');
      return false;
    }
    this.player.meter -= cost;
    this.player.attack = { kind: 'fireball', stance: 'standing', direction: this.player.facing, label: 'HADOUKEN', data: { startup: 70, active: 230, recovery: 350 }, startedAt: now, age: 0, hit: true };
    this.player.attackCooldown = now + 650;
    const palette = { light: { damage: 13, speed: 540, radius: 17, color: 0x69fff5 }, medium: { damage: 18, speed: 630, radius: 23, color: 0x73a8ff }, heavy: { damage: 25, speed: 740, radius: 29, color: 0xffd166 } }[kind];
    const orb = this.add.container(this.player.x + this.player.facing * 60, FLOOR - 87).setDepth(12);
    const aura = this.add.circle(0, 0, palette.radius + 8, palette.color, 0.15);
    const core = this.add.circle(0, 0, palette.radius, palette.color, 0.95).setStrokeStyle(3, 0xffffff, 0.8);
    const spark = this.add.circle(-this.player.facing * 10, -3, palette.radius * 0.42, 0xffffff, 0.85);
    orb.add([aura, core, spark]);
    this.projectiles.push({ x: orb.x, y: orb.y, direction: this.player.facing, vx: this.player.facing * palette.speed, data: palette, owner: this.player, target: this.rival, graphic: orb, life: 2500, hit: false });
    this.spawnBurst(this.player.x + this.player.facing * 46, FLOOR - 82, palette.color, 12);
    this.playTone(330, 0.14, 'sine');
    this.showMessage(fromMotion ? `${kind.toUpperCase()} MOTION!` : 'HADOUKEN!', 650, '#80fff3');
    return true;
  }

  startMotionAttack(motion, strength = 'medium', cost = 0) {
    const now = this.time.now;
    const fighter = this.player;
    if (this.roundOver || fighter.health <= 0 || fighter.launched || now < fighter.stunUntil || fighter.jumpHeight > 0) return false;
    if (fighter.meter < cost) {
      this.showMessage('氣量不足', 700, '#ff8ba8');
      return false;
    }
    if (fighter.attack && now >= fighter.attackCooldown) fighter.attack = null;
    if (fighter.attack) {
      if (!fighter.attack.hit || fighter.attack.age < fighter.attack.data.startup) return false;
      if (['launcher', 'rising'].includes(fighter.attack.kind) && fighter.attack.connection !== 'hit') return false;
    } else if (now < fighter.attackCooldown) return false;
    const power = { light: 0, medium: 1, heavy: 2 }[strength];
    const attack = useAttackFrames({ ...MOTION_ATTACKS[motion], damage: MOTION_ATTACKS[motion].damage + power * 2 });
    fighter.meter -= cost;
    fighter.attack = { kind: motion === '623' ? 'rising' : 'launcher', baseKind: strength, stance: 'standing', direction: fighter.facing, label: attack.label, data: attack, startedAt: now, age: 0, frame: 0, hit: false };
    fighter.attackCooldown = now + attack.startup + attack.active + attack.recovery;
    fighter.isGuarding = false;
    if (motion === '623') {
      fighter.velocityY = 690;
      fighter.jumpDirection = 0;
    }
    this.playTone(95, 0.24, 'sawtooth');
    this.showMessage(`${motion} ${attack.label}`, 750, '#ffc36e');
    return true;
  }

  risingStrike() {
    return this.startMotionAttack('623', 'medium', 35);
  }

  update(time, delta) {
    const dt = Math.min(delta, 34);
    const now = time;
    if (this.roundOver) {
      this.player.setPose(now);
      this.rival.setPose(now);
      return;
    }
    this.elapsed += dt;
    this.roundTimer = Math.max(0, 60 - Math.floor(this.elapsed / 1000));
    if (this.roundTimer === 0) this.endRound(this.player.health >= this.rival.health ? 'YOU WIN' : 'CPU WINS');

    if (!this.player.attack) this.player.setFacing(this.rival.x >= this.player.x ? 1 : -1);
    this.sampleMotionInput(now);
    if (Phaser.Input.Keyboard.JustDown(this.keys.light)) this.recordAttackInput('light');
    if (Phaser.Input.Keyboard.JustDown(this.keys.medium)) this.recordAttackInput('medium');
    if (Phaser.Input.Keyboard.JustDown(this.keys.heavy)) this.recordAttackInput('heavy');
    if (Phaser.Input.Keyboard.JustDown(this.keys.projectile)) this.launchFireball('medium', false);
    if (Phaser.Input.Keyboard.JustDown(this.keys.rising)) this.risingStrike();

    this.updateFighter(this.player, this.rival, dt, now, true);
    this.updateFighter(this.rival, this.player, dt, now, false);
    if (this.player.attack) this.updateAttack(this.player, this.rival, dt, now);
    if (this.rival.attack) this.updateAttack(this.rival, this.player, dt, now);
    this.updateProjectiles(dt, now);
    this.updateEffects(dt);
    this.keepSeparated();
    this.player.setPose(now);
    this.rival.setPose(now);
    this.updateHud();
  }

  updateFighter(fighter, opponent, dt, now, isPlayer) {
    fighter.setFacing(fighter.attack?.direction ?? (opponent.x >= fighter.x ? 1 : -1));
    fighter.isCrouching = false;
    fighter.isGuarding = false;
    fighter.isWalking = false;
    const canAct = now >= fighter.stunUntil && !fighter.launched && fighter.health > 0;

    if (!canAct) {
      fighter.isGuarding = fighter.stunType === 'block' && !fighter.launched;
      fighter.isCrouching = fighter.isGuarding && fighter.guardLow;
      fighter.velocityX = fighter.launched ? fighter.launchVelocityX : fighter.velocityX * 0.75;
    } else if (isPlayer) {
      const axes = this.getMoveAxes();
      fighter.guardHeld = this.keys.guard.isDown;
      const airborne = fighter.jumpHeight > 0 || fighter.velocityY > 0;
      if (airborne) {
        fighter.isWalking = Boolean(fighter.jumpDirection);
        if (canAct && (!fighter.attack || fighter.attack.stance === 'air')) {
          fighter.velocityX = fighter.jumpDirection * 215;
        } else {
          fighter.velocityX *= 0.6;
        }
      } else if (canAct && !fighter.attack) {
        fighter.isCrouching = axes.down;
        const backingAway = axes.horizontal !== 0 && axes.horizontal * fighter.facing < 0;
        const autoBackGuard = backingAway && fighter.jumpHeight === 0;
        const stationaryGuard = fighter.guardHeld && fighter.jumpHeight === 0;
        fighter.isGuarding = autoBackGuard || stationaryGuard;
        fighter.guardLow = fighter.isGuarding && fighter.isCrouching;
        const horizontal = stationaryGuard || axes.down ? 0 : axes.horizontal;
        fighter.isWalking = Boolean(horizontal);
        const moveSpeed = fighter.isCrouching ? 100 : (autoBackGuard ? 165 : 260);
        fighter.velocityX = horizontal * moveSpeed;
        if (axes.up && fighter.jumpHeight === 0 && now > (fighter.nextJumpAt || 0)) {
          fighter.velocityY = 510;
          fighter.jumpDirection = axes.horizontal;
          fighter.velocityX = fighter.jumpDirection * 215;
          fighter.isWalking = Boolean(fighter.jumpDirection);
          fighter.isGuarding = false;
          fighter.nextJumpAt = now + 170;
          this.playTone(420, 0.06, 'triangle');
        }
      } else if (fighter.attack?.stance === 'crouch') {
        fighter.isCrouching = true;
        fighter.velocityX = 0;
      } else if (canAct && fighter.jumpOnAttack && fighter.attack?.stance === 'air') {
        fighter.velocityY = 510;
        fighter.jumpDirection = axes.horizontal;
        fighter.velocityX = fighter.jumpDirection * 215;
        fighter.isWalking = Boolean(fighter.jumpDirection);
        fighter.jumpOnAttack = false;
        fighter.nextJumpAt = now + 170;
        this.playTone(420, 0.06, 'triangle');
      } else {
        fighter.velocityX *= 0.6;
      }
    } else {
      if (now < this.cpuGuardUntil && !fighter.attack) {
        fighter.isGuarding = true;
        fighter.isCrouching = Boolean(this.cpuGuardLow);
        fighter.guardLow = fighter.isCrouching;
        fighter.velocityX = 0;
      } else if (canAct && !fighter.attack) {
        const distance = Math.abs(opponent.x - fighter.x);
        if (distance > 115) {
          fighter.velocityX = -Math.sign(fighter.x - opponent.x) * 150;
          fighter.isWalking = true;
        } else {
          fighter.velocityX *= 0.45;
          if (now >= this.cpuNextDecision) {
            const roll = Math.random();
            if (roll < 0.22) {
              this.cpuGuardUntil = now + 420;
              this.cpuGuardLow = Math.random() < 0.3;
            } else {
              const attack = roll < 0.65 ? 'light' : roll < 0.9 ? 'medium' : 'heavy';
              this.startMelee(fighter, attack);
            }
            this.cpuNextDecision = now + 700 + Math.random() * 650;
          }
        }
        const incoming = opponent.attack && opponent.attack.age >= opponent.attack.data.startup * 0.65;
        if (incoming && distance < 132 && Math.random() < 0.025) this.cpuGuardUntil = now + 450;
      }
    }

    if (!fighter.attack || fighter.attack.stance === 'air' || fighter.launched) fighter.x += fighter.velocityX * dt / 1000;
    fighter.x = Phaser.Math.Clamp(fighter.x, LEFT_EDGE, RIGHT_EDGE);

    if (fighter.jumpHeight > 0 || fighter.velocityY > 0) {
      fighter.jumpHeight += fighter.velocityY * dt / 1000;
      fighter.velocityY -= 1450 * dt / 1000;
      if (fighter.jumpHeight <= 0) {
        fighter.jumpHeight = 0;
        fighter.velocityY = 0;
        fighter.jumpDirection = 0;
        if (fighter.launched) {
          fighter.launched = false;
          fighter.launchVelocityX = 0;
          fighter.stunUntil = Math.max(fighter.stunUntil, now + 8 * FRAME_MS);
        }
        this.playTone(74, 0.035, 'triangle');
      }
    }

  }

  updateAttack(attacker, defender, dt, now) {
    const attack = attacker.attack;
    attack.age = now - attack.startedAt;
    attack.frame = Math.floor((attack.age + 1e-6) / FRAME_MS);
    const data = attack.data;
    if (!attack.hit && data.frames && attack.frame >= data.frames.startup && attack.frame < data.frames.startup + data.frames.active) {
      attack.hit = this.tryHit(attacker, defender, data, now);
    }
    const fullDuration = (data.startup || 0) + (data.active || 0) + (data.recovery || 0);
    if (attack.age + 1e-6 >= fullDuration) attacker.attack = null;
  }

  tryHit(attacker, defender, data, now) {
    if (defender.health <= 0 || now < defender.invulnerableUntil) return false;
    const dx = defender.x - attacker.x;
    const direction = attacker.attack?.direction ?? attacker.facing;
    const behindTarget = Math.sign(dx) !== direction;
    const backHit = Boolean(attacker.attack?.data.crossUp && behindTarget);
    const inFront = Math.sign(dx) === direction || backHit;
    const close = Math.abs(dx) <= data.reach + 28;
    const verticalReach = data.verticalReach || (defender.launched ? 185 : 70);
    const sameHeight = Math.abs(attacker.jumpHeight - defender.jumpHeight) < verticalReach;
    if (!inFront || !close || !sameHeight) {
      return false;
    }
    const blocked = !backHit && !defender.launched && defender.isGuarding && defender.facing === -direction && (!data.low || defender.guardLow);
    attacker.attack.connection = blocked ? 'block' : 'hit';
    const continuingCombo = attacker.comboTarget === defender && defender.stunType === 'hit' && (now < defender.stunUntil || defender.launched);
    const impactDirection = Math.sign(dx) || direction;
    const damage = blocked ? Math.max(1, Math.ceil(data.damage * 0.1)) : Math.round(data.damage * (backHit ? 1.2 : 1));
    defender.health = Math.max(0, defender.health - damage);
    // A move already records its contact, so a short immunity permits distinct juggle hits.
    defender.invulnerableUntil = now + 2 * FRAME_MS;
    const advantage = blocked ? data.onBlock : data.onHit;
    defender.stunUntil = advantage === undefined
      ? now + (blocked ? 12 * FRAME_MS : data.stun)
      : attacker.attackCooldown + advantage * FRAME_MS;
    defender.stunType = blocked ? 'block' : 'hit';
    defender.attackCooldown = now;
    defender.jumpOnAttack = false;
    defender.velocityX = impactDirection * (blocked ? data.knockback * 0.18 : data.knockback);
    if (!blocked && data.pushDistance) {
      attacker.x = Phaser.Math.Clamp(attacker.x - impactDirection * data.pushDistance, LEFT_EDGE, RIGHT_EDGE);
      defender.x = Phaser.Math.Clamp(defender.x + impactDirection * data.pushDistance, LEFT_EDGE, RIGHT_EDGE);
    }
    if (!blocked && (data.launchY || defender.launched)) {
      defender.launched = true;
      defender.jumpHeight = Math.max(defender.jumpHeight, 12);
      defender.velocityY = data.launchY || Math.max(defender.velocityY, 180);
      defender.launchVelocityX = impactDirection * Math.max(90, data.knockback);
      const flightSeconds = (defender.velocityY + Math.sqrt(defender.velocityY ** 2 + 2900 * defender.jumpHeight)) / 1450;
      defender.stunUntil = now + flightSeconds * 1000 + 8 * FRAME_MS;
    }
    attacker.meter = Math.min(100, attacker.meter + data.meter);
    if (!blocked) defender.meter = Math.min(100, defender.meter + Math.ceil(data.meter * 0.45));
    defender.attack = null;
    this.spawnBurst(defender.x - direction * 13, FLOOR - defender.jumpHeight - 79, blocked ? 0x7ce5ff : data.color || 0xffffff, blocked ? 11 : 18);
    this.cameras.main.shake(blocked ? 45 : 95, blocked ? 0.0012 : 0.0024);
    this.playTone(blocked ? 170 : 82 + data.damage * 4, blocked ? 0.09 : 0.13, blocked ? 'triangle' : 'sawtooth');
    if (attacker.isPlayer) {
      const displayedAdvantage = Math.round((defender.stunUntil - attacker.attackCooldown) / FRAME_MS);
      const text = !blocked && defender.launched ? 'LAUNCH / JUGGLE' : `${blocked ? 'ON BLOCK' : 'ON HIT'} ${displayedAdvantage >= 0 ? '+' : ''}${displayedAdvantage}F`;
      this.showMessage(backHit ? `CROSS-UP! ${text}` : text, 1000, blocked ? '#80dfff' : '#ffd46e');
    }
    if (attacker.isPlayer && !blocked) {
      attacker.comboCount = continuingCombo ? attacker.comboCount + 1 : 1;
      attacker.comboTarget = defender;
      attacker.comboUntil = defender.stunUntil;
      if (attacker.comboCount >= 2) {
        this.comboText.setText(`${attacker.comboCount} HIT  COMBO`).setAlpha(1).setScale(1.2);
        this.comboMessageUntil = now + 900;
        this.tweens.add({ targets: this.comboText, scale: 1, duration: 160, ease: 'Back.Out' });
      }
    }
    if (defender.health <= 0) this.endRound(attacker.isPlayer ? 'YOU WIN' : 'CPU WINS');
    return true;
  }

  keepSeparated() {
    if (this.player.jumpHeight > 30 || this.rival.jumpHeight > 30) return;
    const dx = this.rival.x - this.player.x;
    const minDistance = 52;
    if (Math.abs(dx) < minDistance) {
      const correction = (minDistance - Math.abs(dx)) / 2;
      const sign = Math.sign(dx || 1);
      this.player.x -= correction * sign;
      this.rival.x += correction * sign;
    }
  }

  updateProjectiles(dt, now) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const projectile = this.projectiles[i];
      projectile.x += projectile.vx * dt / 1000;
      projectile.life -= dt;
      projectile.graphic.setPosition(projectile.x, projectile.y);
      projectile.graphic.setRotation(Math.sin(now / 35) * 0.07);
      const target = projectile.target;
      const hitDistance = Math.abs(projectile.x - target.x);
      const sameLane = Math.abs(projectile.y - (FLOOR - target.jumpHeight - 78)) < 88;
      if (!projectile.hit && target.health > 0 && now >= target.invulnerableUntil && hitDistance < projectile.data.radius + 30 && sameLane) {
        projectile.hit = true;
        const blocked = !target.launched && target.isGuarding && target.facing === -projectile.direction;
        const damage = blocked ? Math.max(1, Math.ceil(projectile.data.damage * 0.1)) : projectile.data.damage;
        target.health = Math.max(0, target.health - damage);
        target.stunUntil = now + (blocked ? 100 : 320);
        target.stunType = blocked ? 'block' : 'hit';
        target.attackCooldown = now;
        target.jumpOnAttack = false;
        target.invulnerableUntil = now + 2 * FRAME_MS;
        target.velocityX = projectile.direction * (blocked ? 10 : 55);
        target.attack = null;
        projectile.owner.meter = Math.min(100, projectile.owner.meter + 8);
        this.spawnBurst(projectile.x, projectile.y, projectile.data.color, 24);
        this.cameras.main.shake(110, 0.0028);
        this.playTone(blocked ? 160 : 96, 0.16, 'sawtooth');
        projectile.graphic.destroy(true);
        this.projectiles.splice(i, 1);
        if (target.health <= 0) this.endRound(projectile.owner.isPlayer ? 'YOU WIN' : 'CPU WINS');
        continue;
      }
      if (projectile.life <= 0 || projectile.x < 32 || projectile.x > WIDTH - 32) {
        projectile.graphic.destroy(true);
        this.projectiles.splice(i, 1);
      }
    }
  }

  spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const size = Phaser.Math.Between(3, 8);
      const piece = this.add.circle(x, y, size, color, Phaser.Math.FloatBetween(0.45, 0.95)).setDepth(35);
      const angle = Phaser.Math.FloatBetween(-Math.PI, Math.PI);
      const distance = Phaser.Math.Between(20, 90);
      const duration = Phaser.Math.Between(160, 420);
      this.tweens.add({
        targets: piece,
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.1,
        duration,
        ease: 'Cubic.Out',
        onComplete: () => piece.destroy()
      });
    }
  }

  updateEffects(dt) {
    if (this.time.now > this.comboMessageUntil) this.comboText.setAlpha(Math.max(0, this.comboText.alpha - dt / 200));
    const now = this.time.now;
    if (this.stateText.alpha > 0 && now > (this.stateText.hideAt || 0)) this.stateText.setAlpha(Math.max(0, this.stateText.alpha - dt / 300));
  }

  updateHud() {
    const g = this.hud;
    g.clear();
    const barY = 57;
    const barW = 475;
    const barH = 20;
    const pX = 44;
    const rX = WIDTH - 44 - barW;
    g.fillStyle(0x050917, 0.9);
    g.fillRoundedRect(pX - 3, barY - 3, barW + 6, barH + 6, 5);
    g.fillRoundedRect(rX - 3, barY - 3, barW + 6, barH + 6, 5);
    g.fillStyle(0x18233b, 1);
    g.fillRoundedRect(pX, barY, barW, barH, 3);
    g.fillRoundedRect(rX, barY, barW, barH, 3);
    g.fillStyle(0x63f3e7, 1);
    g.fillRoundedRect(pX, barY, Math.max(0, barW * this.player.health / 100), barH, 3);
    g.fillStyle(0xff558a, 1);
    g.fillRoundedRect(rX + barW * (1 - this.rival.health / 100), barY, Math.max(0, barW * this.rival.health / 100), barH, 3);
    g.fillStyle(0x23304b, 0.9);
    g.fillRoundedRect(pX, barY + 25, barW, 5, 2);
    g.fillRoundedRect(rX, barY + 25, barW, 5, 2);
    g.fillStyle(0x61f4ef, 0.95);
    g.fillRoundedRect(pX, barY + 25, barW * this.player.meter / 100, 5, 2);
    g.fillStyle(0xff7ba3, 0.95);
    g.fillRoundedRect(rX + barW * (1 - this.rival.meter / 100), barY + 25, barW * this.rival.meter / 100, 5, 2);
    g.fillStyle(0xffffff, 0.7);
    g.fillRect(WIDTH / 2 - 1, 42, 2, 5);
    this.timerText.setText(String(this.roundTimer).padStart(2, '0')).setColor(this.roundTimer <= 10 ? '#ff697f' : '#ffffff');
    const directions = this.inputTrail.filter((entry) => entry.direction).slice(-5).map((entry) => ({ d: '↓', df: '↘', f: '→', b: '←', db: '↙', u: '↑', uf: '↗', ub: '↖' }[entry.direction] || '')).join(' ');
    this.inputText.setText(`INPUT  ${directions}`);
  }

  showMessage(message, duration, color) {
    this.stateText.setText(message).setColor(color).setAlpha(1).setScale(1.15);
    this.stateText.hideAt = this.time.now + duration;
    this.tweens.add({ targets: this.stateText, scale: 1, duration: 150, ease: 'Back.Out' });
  }

  endRound(winner) {
    if (this.roundOver) return;
    this.roundOver = true;
    this.player.velocityX = 0;
    this.rival.velocityX = 0;
    this.player.attack = null;
    this.rival.attack = null;
    this.resultTitle.setText(winner).setColor(winner === 'YOU WIN' ? '#75fff2' : '#ff789e');
    this.resultPanel.setVisible(true).setAlpha(0).setScale(0.85);
    this.tweens.add({ targets: this.resultPanel, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' });
    this.cameras.main.flash(180, 45, 230, 220, false);
    this.playTone(winner === 'YOU WIN' ? 620 : 180, 0.38, 'triangle');
  }

  resumeAudio() {
    if (!this.soundEnabled) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx && !this.audioContext) this.audioContext = new AudioCtx();
    if (this.audioContext?.state === 'suspended') this.audioContext.resume();
  }

  playTone(frequency, duration, type) {
    if (!this.soundEnabled) return;
    this.resumeAudio();
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    const oscillator = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency * 0.6), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.015);
  }

  shutdown() {
    this.input.keyboard?.off('keydown', this.keyDownHandler);
    this.audioContext?.close();
    this.audioContext = null;
    this.projectiles.forEach((item) => item.graphic.destroy(true));
    this.projectiles = [];
    this.player?.destroy();
    this.rival?.destroy();
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: '#080d1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: WIDTH,
    height: HEIGHT
  },
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false
  },
  scene: [NeonClash]
});

const soundButton = document.querySelector('#sound-toggle');
soundButton?.addEventListener('click', () => {
  const scene = game.scene.getScene('NeonClash');
  scene.soundEnabled = !scene.soundEnabled;
  soundEnabled = scene.soundEnabled;
  soundButton.querySelector('b').textContent = scene.soundEnabled ? '開' : '關';
  soundButton.querySelector('b').style.color = scene.soundEnabled ? '#61f4ef' : '#ff789e';
});
