// 彈射的物理：只在地面（x, z）上算，角色、敵人、道具都當成圓。
// 不碰 Three.js，所以機器人測試可以複製一份狀態先「試射」看看會撞幾下。
export const FRICTION = { decel: 3, drag: 0.45, stop: 0.5 };
export const MAX_SPEED = 30; // 拉滿彈出去的速度（公尺／秒），再乘角色的 power

// ball：{ x, z, vx, vz, r, pierce, inside: Set, touched: Set }
// world：{ w, d, enemies: [{ x, z, r, alive }], allies: [...], items: [...] }
// events：撞到東西會推進去 { type: 'wall'|'hit'|'ally'|'item', target, x, z }
// 回傳 true＝還在動
export function stepBall(ball, dt, world, events) {
  const speed = Math.hypot(ball.vx, ball.vz);
  const steps = Math.max(1, Math.ceil((speed * dt) / (ball.r * 0.5))); // 一小步不超過半徑的一半，才不會穿過去
  const h = dt / steps;
  const hw = world.w / 2 - ball.r, hd = world.d / 2 - ball.r;
  for (let s = 0; s < steps; s++) {
    ball.x += ball.vx * h; ball.z += ball.vz * h;
    if (ball.x < -hw) { ball.x = -hw; ball.vx = Math.abs(ball.vx); events.push({ type: 'wall', x: ball.x - ball.r, z: ball.z }); }
    if (ball.x > hw) { ball.x = hw; ball.vx = -Math.abs(ball.vx); events.push({ type: 'wall', x: ball.x + ball.r, z: ball.z }); }
    if (ball.z < -hd) { ball.z = -hd; ball.vz = Math.abs(ball.vz); events.push({ type: 'wall', x: ball.x, z: ball.z - ball.r }); }
    if (ball.z > hd) { ball.z = hd; ball.vz = -Math.abs(ball.vz); events.push({ type: 'wall', x: ball.x, z: ball.z + ball.r }); }
    for (const e of world.enemies) {
      if (!e.alive) { ball.inside.delete(e); continue; }
      const dx = ball.x - e.x, dz = ball.z - e.z, rr = ball.r + e.r, d2 = dx * dx + dz * dz;
      const inside = d2 < rr * rr;
      if (ball.pierce) {
        // 貫穿型：進去的那一刻打一下，出來之後再進去才算下一下
        if (inside && !ball.inside.has(e)) { ball.inside.add(e); events.push({ type: 'hit', target: e, x: ball.x, z: ball.z }); }
        else if (!inside) ball.inside.delete(e);
      } else if (inside) {
        // 反彈型：推到圓外面，速度沿法線反射
        const d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d;
        ball.x = e.x + nx * rr; ball.z = e.z + nz * rr;
        const dot = ball.vx * nx + ball.vz * nz;
        if (dot < 0) { ball.vx -= 2 * dot * nx; ball.vz -= 2 * dot * nz; }
        events.push({ type: 'hit', target: e, x: e.x + nx * e.r, z: e.z + nz * e.r });
      }
    }
    for (const a of world.allies) {
      if (!a.alive || ball.touched.has(a)) continue;
      const rr = ball.r + a.r;
      if ((ball.x - a.x) ** 2 + (ball.z - a.z) ** 2 < rr * rr) { ball.touched.add(a); events.push({ type: 'ally', target: a, x: a.x, z: a.z }); }
    }
    for (const it of world.items) {
      if (it.taken) continue;
      const rr = ball.r + it.r;
      if ((ball.x - it.x) ** 2 + (ball.z - it.z) ** 2 < rr * rr) { it.taken = true; events.push({ type: 'item', target: it, x: it.x, z: it.z }); }
    }
  }
  // 摩擦：固定減速＋和速度成正比的阻力
  const sp = Math.hypot(ball.vx, ball.vz);
  const next = sp - (FRICTION.decel + FRICTION.drag * sp) * dt;
  if (next < FRICTION.stop) { ball.vx = 0; ball.vz = 0; return false; }
  ball.vx *= next / sp; ball.vz *= next / sp;
  return true;
}

// 試射：照同樣的規則跑完，回傳會撞到幾下敵人、碰到幾位隊友（敵人不會死，所以是估計）
export function simulate(start, world, maxTime = 8) {
  const ball = { ...start, inside: new Set(), touched: new Set() };
  const items = world.items.map((it) => ({ ...it }));
  const w = { ...world, items };
  const events = [];
  let t = 0;
  while (t < maxTime && stepBall(ball, 1 / 60, w, events)) t += 1 / 60;
  return { hits: events.filter((e) => e.type === 'hit').length, allies: events.filter((e) => e.type === 'ally').length, walls: events.filter((e) => e.type === 'wall').length, end: [ball.x, ball.z], time: t };
}

// 瞄準線：從 (x, z) 往 (dx, dz) 走，碰牆反射，回傳折線（只算牆，最多 bounces 次）
export function guidePath(x, z, dx, dz, length, r, w, d, bounces = 2) {
  const pts = [[x, z]];
  const hw = w / 2 - r, hd = d / 2 - r;
  let left = length;
  for (let i = 0; i <= bounces && left > 0; i++) {
    let tx = Infinity, tz = Infinity;
    if (dx > 0) tx = (hw - x) / dx; else if (dx < 0) tx = (-hw - x) / dx;
    if (dz > 0) tz = (hd - z) / dz; else if (dz < 0) tz = (-hd - z) / dz;
    const t = Math.min(tx, tz, left);
    x += dx * t; z += dz * t; left -= t;
    pts.push([x, z]);
    if (t === tx) dx = -dx;
    if (t === tz) dz = -dz;
  }
  return pts;
}
