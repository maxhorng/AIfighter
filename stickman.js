/* Connected joint poses and shaded, code-drawn 2.5D stick fighters. */

function solveLimb(start, target, upperLength, lowerLength, bend) {
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const rawDistance = Math.hypot(dx, dy);
  const distance = Math.max(Math.abs(upperLength - lowerLength) + 0.001, Math.min(upperLength + lowerLength - 0.001, rawDistance));
  const direction = Math.atan2(dy, dx);
  const cosine = Math.max(-1, Math.min(1, (upperLength ** 2 + distance ** 2 - lowerLength ** 2) / (2 * upperLength * distance)));
  const angle = direction + bend * Math.acos(cosine);
  return {
    start: { ...start },
    joint: { x: start.x + Math.cos(angle) * upperLength, y: start.y + Math.sin(angle) * upperLength },
    end: { x: start.x + Math.cos(direction) * distance, y: start.y + Math.sin(direction) * distance }
  };
}

function attackExtension(attack) {
  if (!attack?.data.frames) return 0;
  const { startup, active, recovery } = attack.data.frames;
  const frame = attack.frame || 0;
  if (frame < startup) return -0.12 * (frame + 1) / startup;
  if (frame < startup + active) return Math.min(1, (frame - startup + 1) / 2);
  return Math.max(0, 1 - (frame - startup - active + 1) / recovery);
}

function computeStickPose(fighter, now) {
  const attack = fighter.attack;
  const hit = now < fighter.stunUntil && fighter.stunType !== 'block';
  const crouch = !hit && (attack?.stance === 'crouch' || (fighter.isCrouching && !attack));
  const airborne = fighter.jumpHeight > 0 || fighter.velocityY > 0;
  const dashing = !hit && !attack && now < fighter.dashUntil;
  const pelvis = { x: crouch ? -8 : 0, y: crouch ? -38 : -65 };
  const shoulder = { x: crouch ? 6 : 0, y: crouch ? -76 : -112 };
  let frontFoot = { x: 25, y: -5 };
  let backFoot = { x: -25, y: -5 };
  let state = crouch ? 'CROUCH' : airborne ? 'AIR' : 'IDLE';
  let angle = 0;

  if (airborne) {
    frontFoot = { x: 29, y: -22 };
    backFoot = { x: -28, y: -30 };
  } else if (fighter.isWalking && !crouch && !attack && !hit) {
    const step = Math.sin(now / (dashing ? 40 : 80));
    frontFoot = { x: 25 + step * 9, y: -5 - Math.max(0, step) * 9 };
    backFoot = { x: -25 - step * 9, y: -5 - Math.max(0, -step) * 9 };
    state = 'MOVE';
  }
  if (dashing) {
    const localDirection = fighter.dashDirection * fighter.facing;
    shoulder.x += localDirection * 18;
    pelvis.x -= localDirection * 4;
    state = 'DASH';
  }
  if (hit) {
    shoulder.x -= 14;
    shoulder.y += 5;
    state = fighter.launched ? 'AIR HIT' : 'HIT';
    if (fighter.launched) angle = Math.sign(fighter.launchVelocityX) * fighter.facing * 24;
  }

  const extension = attackExtension(attack);
  if (attack && !crouch) shoulder.x += Math.max(0, extension) * 8;
  const frontShoulder = { x: shoulder.x + 8, y: shoulder.y + 2 };
  const backShoulder = { x: shoulder.x - 8, y: shoulder.y + 3 };
  let frontHand = { x: shoulder.x + 36, y: shoulder.y + 28 };
  let backHand = { x: shoulder.x - 17, y: shoulder.y + 33 };

  if (fighter.isGuarding && !attack && !hit) {
    frontHand = { x: shoulder.x + 34, y: shoulder.y - 12 };
    backHand = { x: shoulder.x + 14, y: shoulder.y + 1 };
    state = crouch ? 'LOW GUARD' : fighter.isWalking ? 'BACK GUARD' : 'GUARD';
  }
  if (dashing) {
    frontHand = { x: shoulder.x - 15, y: shoulder.y + 43 };
    backHand = { x: shoulder.x - 30, y: shoulder.y + 27 };
  }
  if (hit) {
    frontHand = { x: shoulder.x + 38, y: shoulder.y - 10 };
    backHand = { x: shoulder.x - 27, y: shoulder.y + 17 };
  }
  if (attack) {
    state = attack.label;
    if (attack.kind === 'fireball') {
      frontHand = { x: shoulder.x + 65, y: shoulder.y + 16 };
      backHand = { x: shoulder.x + 50, y: shoulder.y + 21 };
    } else if (attack.kind === 'rising') {
      frontHand = { x: shoulder.x + 23, y: shoulder.y - 67 };
      backHand = { x: shoulder.x + 12, y: shoulder.y + 16 };
    } else if (attack.stance === 'air' && attack.baseKind !== 'light') {
      frontFoot = { x: 30 + Math.max(0, extension) * 39, y: -44 - Math.max(0, extension) * 19 };
      frontHand = { x: shoulder.x + 26, y: shoulder.y - 8 };
    } else {
      frontHand = { x: frontShoulder.x + 26 + extension * 49, y: frontShoulder.y + (crouch ? 19 : 23 - extension * 26) };
      backHand = { x: shoulder.x + 4, y: shoulder.y + 14 };
    }
  }

  // All visible parts share these joint endpoints, including during crouching.
  const head = { x: shoulder.x + 3, y: shoulder.y - 31 };
  const neck = { x: shoulder.x + 2, y: shoulder.y - 9 };
  const frontHip = { x: pelvis.x + 5, y: pelvis.y };
  const backHip = { x: pelvis.x - 5, y: pelvis.y + 1 };
  return {
    pelvis, shoulder, frontShoulder, backShoulder, head, neck, angle, state, crouch,
    frontArm: solveLimb(frontShoulder, frontHand, 40, 43, 1),
    backArm: solveLimb(backShoulder, backHand, 37, 40, -1),
    frontLeg: solveLimb(frontHip, frontFoot, 39, 40, -1),
    backLeg: solveLimb(backHip, backFoot, 39, 40, 1)
  };
}

function drawStickman(graphics, pose, palette) {
  graphics.clear();
  const circle = (point, radius, color, alpha = 1) => {
    graphics.fillStyle(color, alpha);
    graphics.fillCircle(point.x, point.y, radius);
  };
  const stroke = (start, end, width, color, alpha = 1, offset = 0) => {
    graphics.lineStyle(width, color, alpha);
    graphics.beginPath();
    graphics.moveTo(start.x + offset, start.y + offset);
    graphics.lineTo(end.x + offset, end.y + offset);
    graphics.strokePath();
    circle({ x: start.x + offset, y: start.y + offset }, width / 2, color, alpha);
    circle({ x: end.x + offset, y: end.y + offset }, width / 2, color, alpha);
  };
  const capsule = (start, end, width, far = false) => {
    stroke(start, end, width + 4, 0x040b19, 0.8, 2);
    stroke(start, end, width + 1, palette.dark);
    stroke(start, end, width - 2, far ? palette.dark : palette.main, 1, -0.7);
    stroke(start, end, Math.max(1.5, width * 0.23), far ? palette.main : palette.light, far ? 0.5 : 0.82, -2);
  };
  const sphere = (point, radius, far = false) => {
    circle({ x: point.x + 1, y: point.y + 1 }, radius + 1.7, 0x07101f);
    circle(point, radius, palette.dark);
    circle({ x: point.x - radius * 0.15, y: point.y - radius * 0.17 }, radius * 0.86, far ? palette.dark : palette.main);
    circle({ x: point.x - radius * 0.3, y: point.y - radius * 0.35 }, radius * 0.48, far ? palette.main : palette.light, 0.7);
    circle({ x: point.x - radius * 0.37, y: point.y - radius * 0.44 }, radius * 0.19, 0xffffff, far ? 0.25 : 0.85);
  };
  const limb = (joints, width, far = false, hand = false) => {
    capsule(joints.start, joints.joint, width, far);
    capsule(joints.joint, joints.end, width - 1, far);
    sphere(joints.joint, width * 0.52, far);
    if (hand) sphere(joints.end, width * 0.77, far);
    else capsule({ x: joints.end.x - 4, y: joints.end.y }, { x: joints.end.x + 9, y: joints.end.y }, 8, far);
  };

  limb(pose.backLeg, 9, true);
  limb(pose.backArm, 8, true, true);
  capsule(pose.pelvis, pose.shoulder, 12);
  capsule(pose.backShoulder, pose.frontShoulder, 10);
  sphere(pose.pelvis, 8);
  limb(pose.frontLeg, 10);
  limb(pose.frontArm, 9, false, true);
  capsule(pose.shoulder, pose.neck, 8);
  capsule(pose.neck, { x: pose.head.x, y: pose.head.y + 15 }, 7);
  sphere(pose.head, 19);
  // The face and accent follow the head joint instead of moving independently.
  stroke({ x: pose.head.x + 3, y: pose.head.y + 1 }, { x: pose.head.x + 14, y: pose.head.y + 1 }, 3.4, 0x071a28);
  stroke({ x: pose.head.x - 9, y: pose.head.y - 10 }, { x: pose.head.x + 11, y: pose.head.y - 10 }, 2, palette.accent, 0.85);
}
