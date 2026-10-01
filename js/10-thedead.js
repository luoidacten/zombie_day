// ============================================================================
// 10-thedead.js — BOSS ẨN "THE DEAD" (TỬ THẦN) và quái "TẾ PHẨM"
// Lững thững, cực trâu, chiêu nào cũng đánh KHÔNG PHÂN BIỆT địch ta (cả người chơi lẫn zombie/cướp).
// Lưu ý: type 16/17 đã thuộc về zombie Điện Quang / Cú Sốc nên The Dead dùng type 50, Tế Phẩm dùng type 51.
// ============================================================================
const DEAD_T = 50, OFFERING_T = 51;
let theDeadSpawnChance = 0.0;                    // +5% mỗi màn không gặp boss, về 0 khi Tử Thần xuất hiện
let deadState = { timer: -1, warned: false };
let deadWarnT = 0;                               // thời gian còn lại của dòng cảnh báo đỏ giữa màn hình

function theDeadEligible() {
    if (currentLevel < 3) return false;
    if ([4, 5, 6, 10, 14].includes(currentMapType)) return false;                    // thành trì, thị trấn cướp, nhà máy điện, hang động, hầm mỏ
    if (['BOSS', 'CITY_BOSS', 'POWER_BOSS', 'DEFEND', 'RESCUE'].includes(mission.type)) return false;
    return true;
}
// Gọi ở đầu mỗi màn (sau khi dựng map)
function theDeadLevelStart() {
    deadState = { timer: -1, warned: false };
    deadWarnT = 0;
    if (!theDeadEligible()) return;
    if (Math.random() < theDeadSpawnChance) { theDeadSpawnChance = 0.0; deadState.timer = 20 + Math.random() * 12; }
    else theDeadSpawnChance = Math.min(1, theDeadSpawnChance + 0.05);
}
function deadWarn() {
    deadWarnT = 3.2;
    if (NET.mode === 'host') NET.ev.push(['dw']);
    Sound.play('boss_intro');
}
function spawnTheDead() {
    // Góc khuất: góc bản đồ xa người chơi nhất
    let best = null, bd = -1;
    for (let c of [[320, 320], [MAP_SIZE.w - 320, 320], [320, MAP_SIZE.h - 320], [MAP_SIZE.w - 320, MAP_SIZE.h - 320]]) {
        let d = Math.min(...players.filter(p => !p.isDowned).map(p => Math.hypot(p.x - c[0], p.y - c[1])).concat([1e9]));
        if (d > bd) { bd = d; best = c; }
    }
    let sp = findSafePoint(best[0], best[1], 44);
    let z = new Zombie(sp.x, sp.y, DEAD_T);
    zombies.push(z);
    createParticles(z.x, z.y, '#c0392b', 60, 420); spawnRing(z.x, z.y, '#ff3838', 300, 0.8, 8);
    addScreenShake(16); Sound.play('roar');
    for (let p of players) vfxList.push({ type: 'text', text: 'TỬ THẦN ĐÃ XUẤT HIỆN!', x: p.x, y: p.y - 90, life: 3.0, color: '#ff3838' });
}

// Gọi mỗi khung hình trong gameLoop
function updateTheDead(dt) {
    if (deadState.timer > 0 && objState !== 'WAITING' && objState !== 'EVAC') {
        deadState.timer -= dt;
        if (deadState.timer <= 3 && !deadState.warned) { deadState.warned = true; deadWarn(); }
        if (deadState.timer <= 0) { deadState.timer = -1; spawnTheDead(); }
    }
    updateDeadHazards(dt);
}

// Điểm có nằm trong cung chém không
function deadInArc(h, x, y, extra = 0) {
    let d = Math.hypot(x - h.x, y - h.y);
    if (d > h.radius + extra) return false;
    let a = Math.atan2(y - h.y, x - h.x);
    return Math.abs(Math.atan2(Math.sin(a - h.angle), Math.cos(a - h.angle))) <= (h.spread || 2.1) / 2;
}
function deadPush(p, ang, dist) { for (let s = 0; s < 10; s++) { p.x += Math.cos(ang) * dist / 10; p.y += Math.sin(ang) * dist / 10; resolveCollision(p); } }

// Mọi chiêu vùng của The Dead quét cả players lẫn zombies (trừ chính nó)
function updateDeadHazards(dt) {
    for (let h of hazards) {
        if (h.type === 'd_arc') {
            if (h.done || h.timer > 0) continue;
            h.done = true; h.life = 0;
            if (!tank.active) for (let p of players) {
                if (p.isDowned || !deadInArc(h, p.x, p.y, p.radius)) continue;
                p.takeDamage(h.dmg); deadPush(p, Math.atan2(p.y - h.y, p.x - h.x), h.push || 180);
            } else if (deadInArc(h, tank.x, tank.y, tank.radius) && tank.p2InvulnTimer <= 0) tank.hp -= h.dmg;
            for (let z of zombies) {
                if (z.type === DEAD_T || z.hp <= 0 || z.flying || !deadInArc(h, z.x, z.y, z.radius)) continue;
                z.hp -= h.zdmg || 600; let a = Math.atan2(z.y - h.y, z.x - h.x); z.knockback(Math.cos(a) * 900, Math.sin(a) * 900);
                createParticles(z.x, z.y, '#c0392b', 8, 260);
            }
            for (let n of rescueNPCs) if (n.hp > 0 && deadInArc(h, n.x, n.y, n.radius)) n.takeDamage(h.dmg);
            for (let a of allies) if (a.hp > 0 && deadInArc(h, a.x, a.y, a.radius)) a.takeDamage(h.dmg);
            vfxList.push({ type: 'sweep', st: 'axe', x: h.x, y: h.y, angle: h.angle, r: h.radius, spread: h.spread || 2.1, dir: 1, col: '255,56,56', life: 0.4, max: 0.4 });
            addScreenShake(9); Sound.play('slash_heavy');
        } else if (h.type === 'd_scythe') {
            if (h.timer > 0) continue;
            if (!h.started) { h.started = true; Sound.play('slash_heavy'); addScreenShake(6); }
            h.tick = (h.tick || 0) - dt;
            if (h.tick <= 0) { h.tick = 0.5; Sound.play('slash'); createParticles(h.x, h.y, '#ff3838', 6, 240); }
            if (!tank.active) for (let p of players) if (!p.isDowned && Math.hypot(p.x - h.x, p.y - h.y) < h.radius + p.radius) p.takeDot(h.dmg * dt);
            if (tank.active && tank.p2InvulnTimer <= 0 && Math.hypot(tank.x - h.x, tank.y - h.y) < h.radius + tank.radius) tank.hp -= h.dmg * 0.5 * dt;
            for (let z of zombies) if (z.type !== DEAD_T && z.hp > 0 && !z.flying && Math.hypot(z.x - h.x, z.y - h.y) < h.radius + z.radius) { z.hp -= 450 * dt; if (Math.random() < dt * 6) createParticles(z.x, z.y, '#c0392b', 3, 200); }
            for (let n of rescueNPCs) if (n.hp > 0 && Math.hypot(n.x - h.x, n.y - h.y) < h.radius) n.takeDamage(h.dmg * dt);
            for (let a of allies) if (a.hp > 0 && Math.hypot(a.x - h.x, a.y - h.y) < h.radius) a.takeDamage(h.dmg * dt);
        } else if (h.type === 'd_moon') {
            // Lãnh Địa Huyết Nguyệt: bước RA NGOÀI vòng máu sẽ bị rút máu + làm chậm; quái bên ngoài tiến vào cũng dính
            if (!tank.active) for (let p of players) {
                if (p.isDowned || Math.hypot(p.x - h.x, p.y - h.y) <= h.radius) continue;
                p.takeDot(24 * dt); p.netTimer = Math.max(p.netTimer || 0, 0.3);
                if (Math.random() < dt * 8) createParticles(p.x, p.y, '#c0392b', 2, 80);
            }
            for (let z of zombies) {
                if (z.type === DEAD_T || z.type === OFFERING_T || z.hp <= 0) continue;
                let d = Math.hypot(z.x - h.x, z.y - h.y);
                if (d > h.radius - 30 && d < h.radius + 260) z.hp -= 140 * dt;
            }
        }
    }
}

// AI của The Dead (50) và Tế Phẩm (51) — móc trong updateSpecialZombie
function updateDeadFamily(z, target, dist, ang, dt, speed) {
    const move = (a, spd) => { z.x += (Math.cos(a) * spd + z.kbX) * dt; z.y += (Math.sin(a) * spd + z.kbY) * dt; resolveCollision(z); };
    if (z.type === OFFERING_T) { move(ang, speed); antBite(z, 10, 1.0); return true; }

    z.kbX = z.kbY = 0; z.face = ang;
    z.downed = false;
    // Aura Framing: đứng im hoàn toàn trong lúc ra đòn / liềm đang bay
    if (z.frame > 0) { z.frame -= dt; return true; }
    if (z.cast) {
        z.downed = true; z.cast.t -= dt;
        if (Math.random() < dt * 20) createParticles(z.x, z.y, '#8e1b1b', 2, 120);
        if (z.cast.t <= 0) { let c = z.cast; z.cast = null; c.fn(); }
        return true;
    }

    if (z.spCD <= 0) {
        let near = zombies.filter(e => e !== z && e.hp > 0 && !isBossType(e.type) && e.type !== OFFERING_T && !e.hidden && !e.flying && Math.hypot(e.x - z.x, e.y - z.y) < 400);
        let offerings = zombies.filter(e => e.type === OFFERING_T && e.hp > 0);
        let opts = ['shadow', 'harvest', 'destruction'];
        if (!hazards.some(h => h.type === 'd_moon')) opts.push('moon');
        if (near.length >= 1 || Math.random() < 0.15) opts.push('art');    // không có zombie quanh thì chiêu này xịt
        if (offerings.length) opts.push('life', 'life');
        if (dist > 420) opts.push('shadow');
        let skill = dist > 900 ? 'shadow' : pickBossSkill(z, opts);          // ở quá xa: luôn Huyết Ảnh để áp sát
        z.lastSkill = skill;
        z.spCD = 4 + Math.random();

        if (skill === 'shadow') {
            // Huyết Ảnh: dịch chuyển tới cạnh người chơi
            createParticles(z.x, z.y, '#c0392b', 40, 360); vfxList.push({ type: 'flash', x: z.x, y: z.y, r: 120, life: 0.25, max: 0.25 });
            let a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 50;
            let sp = findSafePoint(target.x + Math.cos(a) * r, target.y + Math.sin(a) * r, z.radius);
            z.x = sp.x; z.y = sp.y;
            createParticles(z.x, z.y, '#ff3838', 50, 420); spawnRing(z.x, z.y, '#ff3838', 150, 0.4, 6);
            vfxList.push({ type: 'laser_beam', x: z.x, y: z.y - 260, tx: z.x, ty: z.y, life: 0.25, jag: true });
            bossSay(z, 'HUYẾT ẢNH!', '#ff3838'); Sound.play('saber'); addScreenShake(8);
            z.frame = 0.5; z.spCD = 1.6;
        } else if (skill === 'harvest') {
            // Gặt: quét lưỡi liềm hình cung phía trước, đẩy lùi mạnh
            hazards.push({ type: 'd_arc', x: z.x, y: z.y, angle: ang, radius: 280, spread: 2.1, timer: 0.8, life: 1.0, dmg: 70, zdmg: 700, push: 200 });
            z.frame = 1.0; bossSay(z, 'GẶT!', '#ff3838');
        } else if (skill === 'destruction') {
            // Hủy Diệt: ném liềm thành vùng xoay 5 giây; Boss đứng im ngửa mặt suốt thời gian đó
            hazards.push({ type: 'd_scythe', x: target.x, y: target.y, radius: 135, timer: 0.8, life: 5.8, dmg: 90 });
            z.frame = 5.8; z.throwing = 5.8; bossSay(z, 'HỦY DIỆT!', '#ff3838'); Sound.play('throw');
        } else if (skill === 'art') {
            // Trỗi Dậy - Nghệ Thuật Máu: giết tối đa 5 zombie quanh mình, xác biến thành Tế Phẩm
            let victims = near.sort((a, b) => Math.hypot(a.x - z.x, a.y - z.y) - Math.hypot(b.x - z.x, b.y - z.y)).slice(0, 5);
            if (!victims.length) { bossSay(z, '...', '#7f8c8d'); z.spCD = 1.5; }
            else {
                for (let v of victims) {
                    vfxList.push({ type: 'laser_beam', x: z.x, y: z.y, tx: v.x, ty: v.y, life: 0.3 });
                    createParticles(v.x, v.y, '#8e1b1b', 24, 260);
                    v.hp = 0; v._credited = true; v.noLoot = true;
                    zombies.push(new Zombie(v.x, v.y, OFFERING_T));
                }
                z.frame = 0.9; bossSay(z, 'NGHỆ THUẬT MÁU!', '#ff3838'); Sound.play('dead_offering'); addScreenShake(8);
            }
        } else if (skill === 'life') {
            // Thu Hoạch Sinh Mệnh: gồng 1.6s (kịp dọn Tế Phẩm) rồi hút hết Tế Phẩm còn sống để hồi máu
            bossSay(z, 'THU HOẠCH SINH MỆNH! DIỆT TẾ PHẨM NGAY!', '#ff3838'); Sound.play('dead_sacrifice');
            z.cast = {
                t: 1.6, fn: () => {
                    let heal = 0;
                    for (let o of zombies) {
                        if (o.type !== OFFERING_T || o.hp <= 0) continue;
                        heal += z.maxHp * 0.04;
                        vfxList.push({ type: 'laser_beam', x: o.x, y: o.y, tx: z.x, ty: z.y, life: 0.35 });
                        createParticles(o.x, o.y, '#c0392b', 30, 320); spawnRing(o.x, o.y, '#ff3838', 90, 0.3);
                        hurtPlayersInRadius(o.x, o.y, 90, 30);
                        o.hp = 0; o._credited = true; o.noLoot = true;
                    }
                    if (heal > 0) {
                        z.hp = Math.min(z.maxHp, z.hp + heal); z._hpPrev = z.hp; z._hpSeen = z.hp;
                        vfxList.push({ type: 'text', text: '+' + Math.round(heal) + ' MÁU', x: z.x, y: z.y - z.radius - 60, life: 1.8, color: '#2ecc71' });
                        spawnRing(z.x, z.y, '#2ecc71', 160, 0.5, 6); Sound.play('heal');
                    } else bossSay(z, 'HỤT!', '#7f8c8d');
                }
            };
        } else {
            // Lãnh Địa Huyết Nguyệt: vòng máu 600px trong 10 giây, nhốt người chơi cùng Boss
            hazards.push({ type: 'd_moon', x: z.x, y: z.y, radius: 600, life: 10 });
            z.frame = 0.8; bossSay(z, 'LÃNH ĐỊA HUYẾT NGUYỆT!', '#ff3838'); Sound.play('roar'); addScreenShake(12);
            spawnRing(z.x, z.y, '#ff3838', 600, 0.7, 8);
        }
        return true;
    }

    // Đòn thường: vung liềm khi con mồi lại gần
    if (dist < 190 && z.atkCD <= 0) {
        hazards.push({ type: 'd_arc', x: z.x, y: z.y, angle: ang, radius: 200, spread: 1.6, timer: 0.55, life: 0.75, dmg: 35, zdmg: 350, push: 110 });
        z.atkCD = 2.4; z.frame = 0.7;
        return true;
    }
    // Không bao giờ chạy: lững thững tiến tới, cách dưới 150px thì đứng im gây áp lực
    if (dist > 150) move(ang, speed);
    return true;
}

function deadFamilyDeath(z) {
    if (z.type === OFFERING_T) { createParticles(z.x, z.y, '#8e1b1b', 18, 220); return; }
    createParticles(z.x, z.y, '#c0392b', 80, 520); createParticles(z.x, z.y, '#111', 40, 300);
    hazards = hazards.filter(h => h.type !== 'd_arc' && h.type !== 'd_scythe' && h.type !== 'd_moon');
    for (let o of zombies) if (o.type === OFFERING_T) { o.hp = 0; o._credited = true; o.noLoot = true; }
    shopScrap += 40;
    drops.push({ type: 'SHARD', x: z.x, y: z.y - 50, radius: 16, lifeTime: 900 });
    for (let p of players) vfxList.push({ type: 'text', text: 'ĐÃ HẠ TỬ THẦN!  +40 ⚙  +1 ◆', x: p.x, y: p.y - 90, life: 3.0, color: '#f1c40f' });
    Sound.play('level');
}

// ---------------------------------------------------------------------------
// PHẦN VẼ
// ---------------------------------------------------------------------------
function drawDeadEntity(z, T, ang, flash) {
    const r = z.radius;
    if (z.type === OFFERING_T) {
        // Tế Phẩm: cục máu thịt bầy nhầy
        let n = z.nid || 0;
        for (let k = 0; k < 5; k++) {
            let a = k * 1.256 + n, rr = r * (0.55 + 0.12 * Math.sin(T * 5 + k + n));
            ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * r * 0.42, z.y + Math.sin(a) * r * 0.42, rr, 0, Math.PI * 2);
            ctx.fillStyle = flash ? '#fff' : (k % 2 ? '#8e1b1b' : '#b03a2e'); ctx.fill(); ctx.strokeStyle = '#3d0c0c'; ctx.lineWidth = 2; ctx.stroke();
        }
        ctx.fillStyle = '#f5e6c8'; ctx.beginPath(); ctx.arc(z.x - 4, z.y - 3, 3.2, 0, Math.PI * 2); ctx.arc(z.x + 5, z.y + 2, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(z.x - 4, z.y - 3, 1.4, 0, Math.PI * 2); ctx.arc(z.x + 5, z.y + 2, 1.1, 0, Math.PI * 2); ctx.fill();
        return;
    }
    let thrown = hazards.some(h => h.type === 'd_scythe');     // liềm đang bay: Boss ngửa mặt, tay không
    let casting = z.downed;
    // Vòng áp lực 150px
    ctx.beginPath(); ctx.arc(z.x, z.y, 150, 0, Math.PI * 2); ctx.strokeStyle = `rgba(192, 57, 43, ${0.18 + 0.1 * Math.sin(T * 3)})`; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.stroke(); ctx.setLineDash([]);
    if (thrown) { ctx.beginPath(); ctx.arc(z.x, z.y, r + 26 + Math.sin(T * 5) * 5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255, 56, 56, 0.55)'; ctx.lineWidth = 4; ctx.stroke(); }
    if (casting) for (let o of zombies) if (o.type === OFFERING_T) { ctx.strokeStyle = `rgba(255, 56, 56, ${0.4 + 0.3 * Math.sin(T * 20)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(o.x, o.y); ctx.stroke(); }

    ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(ang);
    // Áo choàng rách phía sau
    ctx.fillStyle = flash ? '#fff' : '#0d0d12';
    ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.95);
    for (let k = 0; k <= 6; k++) { let yy = -r * 0.95 + k * r * 1.9 / 6; ctx.lineTo(-r * (1.25 + (k % 2 ? 0.28 : 0) + 0.06 * Math.sin(T * 4 + k)), yy); }
    ctx.lineTo(r * 0.5, r * 0.95); ctx.closePath(); ctx.fill();
    // Thân + mũ trùm
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = flash ? '#fff' : '#1b1b24'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(r * 0.18, 0, r * 0.62, 0, Math.PI * 2); ctx.fillStyle = '#050507'; ctx.fill();
    // Mắt đỏ
    let ey = thrown ? 0.5 : 1;
    ctx.shadowColor = '#ff3838'; ctx.shadowBlur = 12; ctx.fillStyle = '#ff3838';
    ctx.beginPath(); ctx.ellipse(r * 0.42, -r * 0.2, r * 0.1, r * 0.07 * ey, 0, 0, Math.PI * 2); ctx.ellipse(r * 0.42, r * 0.2, r * 0.1, r * 0.07 * ey, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    // Tay xương
    ctx.fillStyle = '#d5d8dc'; ctx.beginPath(); ctx.arc(r * 0.75, r * 0.78, r * 0.17, 0, Math.PI * 2); ctx.arc(r * 0.75, -r * 0.78, r * 0.17, 0, Math.PI * 2); ctx.fill();
    // Lưỡi liềm
    if (!thrown) {
        ctx.strokeStyle = '#5d4037'; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-r * 0.9, r * 0.95); ctx.lineTo(r * 1.9, r * 0.62); ctx.stroke();
        ctx.save(); ctx.translate(r * 1.9, r * 0.62);
        ctx.fillStyle = '#dfe6e9'; ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 0.2, -r * 1.3, -r * 1.25, -r * 1.55); ctx.quadraticCurveTo(-r * 0.3, -r * 0.9, -r * 0.16, r * 0.1); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.restore(); ctx.lineCap = 'butt';
    }
    ctx.restore();
}

function drawDeadHazard(h, T) {
    if (h.type === 'd_arc') {
        let sp = h.spread || (h.radius > 230 ? 2.1 : 1.6), t0 = h.t0 || 0.8, pct = Math.max(0, Math.min(1, 1 - h.timer / t0));
        ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.arc(h.x, h.y, h.radius, h.angle - sp / 2, h.angle + sp / 2); ctx.closePath();
        ctx.fillStyle = `rgba(231, 76, 60, ${0.12 + 0.08 * Math.sin(T * 18)})`; ctx.fill(); ctx.strokeStyle = 'rgba(255, 71, 87, 0.8)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.arc(h.x, h.y, h.radius * pct, h.angle - sp / 2, h.angle + sp / 2); ctx.closePath();
        ctx.fillStyle = 'rgba(255, 56, 56, 0.22)'; ctx.fill();
    } else if (h.type === 'd_scythe') {
        if (h.timer > 0) {
            if (h.t0 === undefined) h.t0 = Math.max(h.timer, 0.01);
            let pct = Math.max(0, Math.min(1, h.timer / h.t0));
            ctx.beginPath(); ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2); ctx.fillStyle = 'rgba(231, 76, 60, 0.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(255, 71, 87, 0.7)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(h.x, h.y, h.radius * pct, 0, Math.PI * 2); ctx.strokeStyle = '#ff4757'; ctx.lineWidth = 3; ctx.stroke();
            return;
        }
        ctx.beginPath(); ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2); ctx.fillStyle = `rgba(160, 20, 20, ${0.22 + 0.06 * Math.sin(T * 20)})`; ctx.fill();
        ctx.strokeStyle = 'rgba(255, 56, 56, 0.8)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(T * 13);
        for (let k = 0; k < 3; k++) {
            ctx.rotate(Math.PI * 2 / 3);
            ctx.fillStyle = '#dfe6e9'; ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(10, 0); ctx.quadraticCurveTo(h.radius * 0.6, -h.radius * 0.55, h.radius * 0.95, -h.radius * 0.1); ctx.quadraticCurveTo(h.radius * 0.55, -h.radius * 0.2, 10, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fillStyle = '#5d4037'; ctx.fill();
        ctx.restore();
    } else if (h.type === 'd_moon') {
        let a = Math.min(1, h.life) * (0.75 + 0.25 * Math.sin(T * 4));
        ctx.beginPath(); ctx.arc(h.x, h.y, h.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(120, 10, 10, ${0.10 * a})`; ctx.fill();
        ctx.strokeStyle = `rgba(255, 40, 40, ${0.85 * a})`; ctx.lineWidth = 8; ctx.stroke();
        ctx.strokeStyle = `rgba(255, 150, 150, ${0.5 * a})`; ctx.lineWidth = 2; ctx.setLineDash([18, 14]);
        ctx.beginPath(); ctx.arc(h.x, h.y, h.radius - 16, T * 0.3, T * 0.3 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        outlinedText(`HUYẾT NGUYỆT ${Math.ceil(Math.max(0, h.life))}s — ĐỪNG BƯỚC RA NGOÀI`, h.x, h.y - h.radius + 30, '#ff7675', 'bold 13px Arial');
    }
}

// Dòng cảnh báo đỏ giữa màn hình (vẽ trong HUD)
function drawDeadWarning(T) {
    if (deadWarnT <= 0) return;
    deadWarnT -= frameDt;
    let a = Math.min(1, deadWarnT) * (0.7 + 0.3 * Math.sin(T * 10));
    ctx.fillStyle = `rgba(120, 0, 0, ${0.22 * a})`; ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = a;
    outlinedText('TỬ THẦN ĐANG ĐẾN...', W / 2, H * 0.4, '#ff2d2d', `bold ${Math.round(Math.min(46, W / 14))}px Arial`, 6);
    ctx.globalAlpha = 1;
}
