// ======================================================================
// HIỆU ỨNG (VFX) & RENDER
// ======================================================================
const lightCanvas = document.createElement('canvas');
const lightCtx = lightCanvas.getContext('2d');
const BOSS_NAMES = { 30: 'KHỔNG LỒ', 31: 'LÕI QUÁ TẢI', 32: 'THE LEADER', 45: 'KIẾN CHÚA', 46: 'XÚC TU', 50: 'THE DEAD' };

function localPlayer() { return players[NET.mode ? NET.localIdx : 0] || players[0]; }
function soloControls() { return isSinglePlayer || !!NET.mode; }

function spawnRing(x, y, color, radius, life = 0.35, width = 4) {
    vfxList.push({ type: 'ring', x, y, color, r: radius, life, max: life, w: width });
}

function addDecal(x, y, color, r, alpha = 0.5) {
    if (NET.mode === 'guest' && !NET.applying) return;
    decals.push({ x, y, c: color, r, a: alpha, life: 45, rot: Math.random() * Math.PI });
    if (decals.length > 140) decals.shift();
    if (NET.mode === 'host' && NET.ev.length < 90) NET.ev.push(['d', Math.round(x), Math.round(y), color, Math.round(r), alpha]);
}

function drawShadow(x, y, r) { ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); }
function drawMiniBar(x, y, w, h, cur, max, c) { ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2, y, w, h); ctx.fillStyle = c; ctx.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, cur / (max || 1))), h); ctx.strokeStyle = '#222'; ctx.lineWidth = 1; ctx.strokeRect(x - w / 2, y, w, h); }
function outlinedText(text, x, y, fill, font, strokeW = 3) {
    ctx.font = font; ctx.lineJoin = 'round'; ctx.lineWidth = strokeW; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}

// Loại đạn dùng chung cho vẽ & đồng bộ online
function bulletKind(b) {
    if (b.kind !== undefined) return b.kind;
    if (b.isLaserBeam) return 10;
    if (b.isSwordWave) return 1;
    if (b.isBomb) return 2;
    if (b.isAcid) return 5;
    if (b.isFire) return 4;
    if (b.isTankShell) return 7;
    if (b.isExplosiveProj) return 8;
    if (b.wepData && b.wepData.type === 'charge') return b.wepData.isElectric ? 11 : 3;
    if (b.isHeli) return 6;
    if (b.wepData && b.wepData.isElectric) return 9;
    if (b.wepData && b.wepData.name === 'Minigun') return 12; // vẽ như đạn thường, dùng để bật tiếng minigun lặp
    return 0;
}

// Cập nhật hạt, chữ nổi, vệt máu... (dùng cho cả chủ phòng lẫn khách)
function updateFx(dt) {
    const fr = Math.pow(0.06, dt);
    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= fr; p.vy *= fr;
        p.life -= dt * 2.5;
        if (p.life <= 0) { particles[i] = particles[particles.length - 1]; particles.pop(); }
    }
    for (let i = vfxList.length - 1; i >= 0; i--) {
        let v = vfxList[i]; v.life -= dt;
        if (v.type === 'text') v.y -= 20 * dt;
        else if (v.type === 'dmg') v.y -= 48 * dt;
        if (v.life <= 0) vfxList.splice(i, 1);
    }
    for (let i = decals.length - 1; i >= 0; i--) { decals[i].life -= dt; if (decals[i].life <= 0) decals.splice(i, 1); }
    for (let p of players) if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (levelStartTimer > 0) levelStartTimer -= dt;
    if (towerAlertTimer > 0) towerAlertTimer -= dt;
    if (mapIntro.timer > 0) mapIntro.timer -= dt;
    if (cameraShake > 0) cameraShake *= Math.pow(0.002, dt);
    if (cameraShake < 0.3) cameraShake = 0;
}

function updateCamera(dt, snap = false) {
    let tx = cam.x, ty = cam.y, tz = 0.9;
    const solo = soloControls();
    if (tank.active) {
        tx = tank.x; ty = tank.y;
        if (!solo) tz = Math.min(1.3, Math.max(0.6, (Math.min(W, H) * 0.7) / 400));
    } else if (solo) {
        let p = localPlayer();
        if (p) { tx = p.x; ty = p.y; }
    } else if (players.length >= 2) {
        let a = players[0], b = players[1];
        let aAlive = !a.isDowned, bAlive = !b.isDowned;
        if (aAlive && !bAlive) { tx = a.x; ty = a.y; }
        else if (!aAlive && bAlive) { tx = b.x; ty = b.y; }
        else { tx = (a.x + b.x) / 2; ty = (a.y + b.y) / 2; }
        // Một người gục: khóa khoảng cách về 0 để camera không bị kéo giãn
        let pDist = (aAlive && bAlive) ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
        tz = Math.min(1.3, Math.max(0.5, (Math.min(W, H) * 0.7) / (pDist + 300)));
    }
    if (solo && Math.min(W, H) < 480) tz = 0.78; // màn hình điện thoại nhỏ: lùi camera một chút
    let k = snap ? 1 : Math.min(1, dt * 14);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    cam.zoom += (tz - cam.zoom) * (snap ? 1 : Math.min(1, dt * 5));
}

// Khoảng cách từ tâm người chơi tới ĐẦU NÒNG của từng loại súng (khớp với hình vẽ trong drawGun)
function gunMuzzleDist(w, r) {
    const M = { PISTOL: 18, PISTOL_ELECTRO: 20, SMG: 29, AR: 40, SHOTGUN: 36, SNIPER: 56, GLAUNCHER: 37, MINIGUN: 42, FLAMETHROWER: 38, ACID_SPRAYER: 38,
        PLASMA_RAPID: 33, ELECTRON_FLUX: 33, TESLA_CARBINE: 39, ELECTRO_CANNON: 41, BOW: 22 };
    return r + ((w && M[w.key]) || 18);
}

// Hiệu ứng chém: mỗi vũ khí một kiểu (v.st)
//  katana: vệt trăng khuyết mảnh, sắc   | axe: cung dày nặng màu đỏ + lưỡi to     | hammer: sóng chấn động nện đất
//  knife: hai nhát chéo chữ X nhanh     | spear: mũi đâm thẳng                    | saber: cung sáng hai lớp
//  legend: vòng vàng kép + tia lửa      | whip: vòng sét gãy khúc
function drawSweep(v) {
    let k = 1 - Math.max(0, v.life / v.max), st = v.st || 'katana', R = v.r;
    // Hiệu ứng bám theo người ra đòn (trước đây đứng yên tại chỗ nên lệch khi nhân vật lao tới)
    let own = v.pi !== undefined ? players[v.pi] : null, vx = own && !own.isDowned ? own.x : v.x, vy = own && !own.isDowned ? own.y : v.y;
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(v.angle);
    ctx.globalCompositeOperation = 'lighter';

    if (st === 'hammer') {
        // Nện xuống: vòng chấn động lan ra + các vết nứt toả tròn
        let e = 1 - (1 - k) * (1 - k), rr = R * (0.25 + 0.75 * e), a = 1 - k;
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${v.col},${0.75 * a})`; ctx.lineWidth = 10 * a + 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, rr * 0.62, 0, Math.PI * 2); ctx.strokeStyle = `rgba(255,255,255,${0.35 * a})`; ctx.lineWidth = 4; ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fillStyle = `rgba(${v.col},${0.14 * a})`; ctx.fill();
        ctx.strokeStyle = `rgba(60,45,30,${0.8 * a})`; ctx.lineWidth = 3; ctx.globalCompositeOperation = 'source-over'; ctx.beginPath();
        for (let i = 0; i < 9; i++) { let aa = i * 0.698 + (v.dir > 0 ? 0.2 : 0.5), r0 = R * 0.18, r1 = rr * (0.7 + (i % 3) * 0.14); ctx.moveTo(Math.cos(aa) * r0, Math.sin(aa) * r0); ctx.lineTo(Math.cos(aa + 0.12) * (r0 + r1) / 2, Math.sin(aa + 0.12) * (r0 + r1) / 2); ctx.lineTo(Math.cos(aa - 0.05) * r1, Math.sin(aa - 0.05) * r1); }
        ctx.stroke();
    } else if (st === 'spear') {
        // Đâm thẳng: mũi nhọn phóng ra rồi mờ dần, kèm hai vệt gió
        let prog = Math.min(1, k / 0.35), a = k < 0.35 ? 1 : Math.max(0, 1 - (k - 0.35) / 0.65), tip = R * (0.3 + 0.7 * prog);
        let tk = v.thin ? 0.6 : 1; // dao: mũi đâm gọn hơn giáo
        ctx.lineCap = 'round';
        ctx.strokeStyle = `rgba(${v.col},${0.35 * a})`; ctx.lineWidth = 16 * tk; ctx.beginPath(); ctx.moveTo(R * 0.15, 0); ctx.lineTo(tip, 0); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * a})`; ctx.lineWidth = 4 * tk; ctx.beginPath(); ctx.moveTo(R * 0.15, 0); ctx.lineTo(tip, 0); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.moveTo(tip + 16 * tk, 0); ctx.lineTo(tip - 8 * tk, -8 * tk); ctx.lineTo(tip - 8 * tk, 8 * tk); ctx.fill();
        ctx.strokeStyle = `rgba(${v.col},${0.5 * a})`; ctx.lineWidth = 2; ctx.beginPath();
        for (let s = -1; s <= 1; s += 2) { ctx.moveTo(tip * 0.35, s * 9); ctx.lineTo(tip * 0.85, s * 14); }
        ctx.stroke();
    } else if (st === 'knife') {
        // Hai nhát chéo chữ X, nhát sau trễ một nhịp
        ctx.lineCap = 'round';
        for (let n = 0; n < 2; n++) {
            let kk = Math.max(0, Math.min(1, (k - n * 0.25) / 0.6)); if (kk <= 0) continue;
            let a = 1 - kk, s = n === 0 ? v.dir : -v.dir, x0 = R * 0.35, x1 = R * 1.0, yy = R * 0.42 * s;
            let px = x0 + (x1 - x0) * Math.min(1, kk * 2.2), py = -yy + 2 * yy * Math.min(1, kk * 2.2);
            ctx.strokeStyle = `rgba(${v.col},${0.4 * a})`; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(x0, -yy); ctx.lineTo(px, py); ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${0.95 * a})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x0, -yy); ctx.lineTo(px, py); ctx.stroke();
        }
    } else if (st === 'whip') {
        // Roi điện: vòng sét gãy khúc nhấp nháy
        let a = 1 - k, half = Math.min(Math.PI, v.spread / 2), n = 22;
        for (let pass = 0; pass < 2; pass++) {
            ctx.beginPath();
            for (let i = 0; i <= n; i++) { let aa = -half + 2 * half * i / n, rr = R * (0.82 + k * 0.15) + (Math.random() - 0.5) * 26; if (i) ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); else ctx.moveTo(Math.cos(aa) * rr, Math.sin(aa) * rr); }
            ctx.strokeStyle = pass ? `rgba(255,255,255,${0.9 * a})` : `rgba(${v.col},${0.7 * a})`; ctx.lineWidth = pass ? 2 : 7; ctx.stroke();
        }
    } else {
        // Các kiểu cung quét: katana (mảnh, sắc), axe (dày, chậm), saber (hai lớp sáng), legend (vòng vàng kép)
        const P = st === 'axe' ? { sw: 0.6, w: 0.72, in: 0.6, edge: 5, blade: 9, alpha: 0.11 }
            : st === 'saber' ? { sw: 0.4, w: 0.42, in: 0.74, edge: 5, blade: 7, alpha: 0.12 }
                : st === 'legend' ? { sw: 0.4, w: 0.5, in: 0.7, edge: 4, blade: 6, alpha: 0.1 }
                    : { sw: 0.4, w: 0.26, in: 0.82, edge: 2.5, blade: 4, alpha: 0.1 };
        let prog = Math.min(1, k / P.sw), ease = 1 - (1 - prog) * (1 - prog);
        let fade = k < P.sw ? 1 : Math.max(0, 1 - (k - P.sw) / (1 - P.sw));
        let half = Math.min(Math.PI, v.spread / 2), dir = v.dir || 1;
        let start = -half * dir, total = 2 * half * ease, lead = start + dir * total;
        const SEG = 14;
        ctx.lineCap = 'butt';
        // Các lớp cung chồng lên nhau, lớp sau ngắn dần về phía mũi lưỡi -> đuôi mờ, mũi sáng
        for (let s = 0; s < SEG; s++) {
            let from = start + dir * total * (s / SEG), lo = Math.min(from, lead), hi = Math.max(from, lead);
            if (hi - lo < 0.001) continue;
            ctx.beginPath(); ctx.arc(0, 0, R * (P.in + 0.012 * s), lo, hi);
            ctx.strokeStyle = `rgba(${v.col},${P.alpha * fade})`; ctx.lineWidth = Math.max(2, R * (P.w - 0.02 * s)); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, R * 0.97, lo, hi);
            ctx.strokeStyle = `rgba(255,255,255,${0.10 * fade})`; ctx.lineWidth = P.edge; ctx.stroke();
            if (st === 'saber' || st === 'legend') { ctx.beginPath(); ctx.arc(0, 0, R * 0.55, lo, hi); ctx.strokeStyle = `rgba(${v.col},${0.05 * fade})`; ctx.lineWidth = 4; ctx.stroke(); }
        }
        if (st === 'legend') { // tia lửa vàng bắn ra theo vành
            ctx.fillStyle = `rgba(255,236,170,${fade})`;
            for (let i = 0; i < 10; i++) { let aa = start + dir * total * (i / 10), rr = R * (1.0 + k * 0.25 + (i % 3) * 0.04); ctx.beginPath(); ctx.arc(Math.cos(aa) * rr, Math.sin(aa) * rr, 2.5 * fade + 0.5, 0, Math.PI * 2); ctx.fill(); }
        }
        if (prog < 1) { // lưỡi đang quét + tia sáng đầu mũi
            ctx.lineCap = 'round';
            ctx.strokeStyle = `rgba(${v.col},0.9)`; ctx.lineWidth = P.blade + 1; ctx.beginPath(); ctx.moveTo(Math.cos(lead) * R * 0.25, Math.sin(lead) * R * 0.25); ctx.lineTo(Math.cos(lead) * R, Math.sin(lead) * R); ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(2, P.blade * 0.4); ctx.stroke();
            if (st === 'axe') { // đầu rìu to bản
                ctx.fillStyle = `rgba(${v.col},0.85)`; ctx.beginPath(); ctx.arc(Math.cos(lead) * R * 0.86, Math.sin(lead) * R * 0.86, R * 0.16, lead - 1.2 * dir, lead + 1.2 * dir, dir < 0); ctx.fill();
            } else { ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(Math.cos(lead) * R, Math.sin(lead) * R, 4, 0, Math.PI * 2); ctx.fill(); }
        }
    }
    ctx.restore(); ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
}

function getObjectiveText() {
    if (isCaveMap()) { let ct = caveObjectiveText(); if (ct) return ct; }
    const fmt = (s) => { s = Math.max(0, s); let m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
    switch (objState) {
        case 'TOWERS': return [`THÁP TÍN HIỆU: ${towers.filter(t => t.active).length}/${towers.length}`, '#f1c40f'];
        case 'COLLECT': return [`THU THẬP: ${mission.progress}/${mission.required}`, '#00d2d3'];
        case 'KILL': return [`TIÊU DIỆT: ${mission.progress}/${mission.required}`, '#f1c40f'];
        case 'BOSS': case 'POWER_BOSS': case 'CITY_BOSS': return ['HẠ GỤC BOSS!', '#ff9f43'];
        case 'DEFEND': return [`TỬ THỦ: ${fmt(fortressTimer)}`, '#f1c40f'];
        case 'HANGZ_ESCAPE': return [`HANG Z ${hangZRun.floor}/${hangZRun.total} - ${fmt(hangZRun.timer)}`, hangZRun.timer <= 30 ? '#ff4757' : '#ecf0f1'];
        case 'POWER_CHARGE': return [`NẠP ĐIỆN: ${mission.progress}/${mission.required} | PIN: ${powerCellsHeld}`, '#00d2d3'];
        case 'POWER_LOCKS': return [`PHÁ KHÓA ĐIỆN: ${mission.progress}/${mission.required}`, '#00d2d3'];
        case 'POWER_KILL': return [`THANH LỌC: ${mission.progress}/${mission.required}`, '#00d2d3'];
        case 'RESCUE': return [`GIẢI CỨU: ${mission.progress}/${mission.required}`, '#2ecc71'];
        case 'ROOFTOP': return ['CHẠY LÊN SÂN THƯỢNG!', '#00d2d3'];
        case 'WAITING': return [`TRỰC THĂNG ĐẾN SAU ${Math.ceil(evacTimer)}s`, '#f1c40f'];
        case 'EVAC': return ['LÊN TRỰC THĂNG!', '#2ecc71'];
    }
    return null;
}

// Vẽ súng chi tiết theo từng loại. Hệ toạ độ cục bộ: +x là hướng nòng, gốc ở tâm người chơi (r = bán kính thân).
function drawGun(w, r, T) {
    const key = w.key || '';
    const B = (x, y, ww, hh, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, ww, hh); };
    const O = (x, y, ww, hh) => { ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, ww - 1, hh - 1); };
    const dot = (x, y, rad, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); };
    const glow = (x, y, rad, rgb) => { ctx.globalCompositeOperation = 'lighter'; dot(x, y, rad, `rgba(${rgb},${0.35 + 0.2 * Math.sin(T * 10)})`); ctx.globalCompositeOperation = 'source-over'; };
    const METAL = '#3d4450', DARK = '#1e272e', WOOD = '#8d5a2b', SKIN = '#f5cba7';
    let x = r - 2, handFront = 16;

    if (key === 'PISTOL' || key === 'PISTOL_ELECTRO') {
        B(x + 4, -3, 15, 6, key === 'PISTOL' ? '#bdc3c7' : '#1e6f78'); O(x + 4, -3, 15, 6);
        B(x + 15, -1.5, 5, 3, DARK);
        B(x + 6, -3, 9, 2, 'rgba(255,255,255,0.35)');
        if (key === 'PISTOL_ELECTRO') glow(x + 20, 0, 4, '0,210,211');
        handFront = 0;
    } else if (key === 'SMG') {
        B(x - 4, -2, 8, 4, DARK);                                  // báng gập
        B(x + 2, -4, 20, 8, '#c27c0e'); O(x + 2, -4, 20, 8);
        B(x + 22, -2, 9, 4, DARK);                                 // nòng
        B(x + 10, 3, 5, 9, '#2d3436');                             // băng đạn
        B(x + 5, -4, 12, 2, 'rgba(255,255,255,0.25)');
        handFront = 12;
    } else if (key === 'AR') {
        B(x - 8, -3, 11, 6, '#2d3436');                            // báng
        B(x + 2, -4.5, 24, 9, '#3f6b4a'); O(x + 2, -4.5, 24, 9);   // thân
        B(x + 26, -2, 14, 4, DARK); B(x + 38, -3, 4, 6, '#636e72'); // nòng + loa che lửa
        B(x + 12, 4, 6, 10, '#2d3436');                            // băng đạn cong
        B(x + 8, -7, 10, 3, DARK);                                 // thước ngắm
        handFront = 20;
    } else if (key === 'SHOTGUN') {
        B(x - 8, -3.5, 13, 7, WOOD); O(x - 8, -3.5, 13, 7);        // báng gỗ
        B(x + 5, -4, 12, 8, METAL);
        B(x + 16, -4, 22, 3.2, DARK); B(x + 16, 0.8, 22, 3.2, DARK); // 2 nòng
        B(x + 20, -5, 9, 10, WOOD); O(x + 20, -5, 9, 10);          // ốp bơm
        handFront = 22;
    } else if (key === 'SNIPER') {
        B(x - 10, -3.5, 14, 7, '#4b5320'); O(x - 10, -3.5, 14, 7); // báng
        B(x + 4, -4, 20, 8, '#57606f'); O(x + 4, -4, 20, 8);
        B(x + 24, -1.6, 30, 3.2, DARK);                            // nòng dài
        B(x + 52, -3.5, 6, 7, '#636e72');                          // chụp giảm giật
        B(x + 8, -8, 16, 4, DARK); dot(x + 24, -6, 3, '#74b9ff');  // ống ngắm
        B(x + 30, 1.6, 2, 8, '#636e72');                           // chân chống
        handFront = 24;
    } else if (key === 'GLAUNCHER') {
        B(x - 6, -3, 9, 6, '#2d3436');
        B(x + 3, -6.5, 20, 13, '#16a085'); O(x + 3, -6.5, 20, 13); // ổ đạn to
        B(x + 23, -5, 12, 10, DARK); dot(x + 35, 0, 4, '#0b0f12');
        B(x + 8, -6.5, 3, 13, 'rgba(0,0,0,0.3)'); B(x + 15, -6.5, 3, 13, 'rgba(0,0,0,0.3)');
        handFront = 18;
    } else if (key === 'MINIGUN') {
        B(x - 4, 4, 14, 10, '#6d4c1b'); O(x - 4, 4, 14, 10);       // hộp đạn
        B(x, -7, 20, 14, '#d35400'); O(x, -7, 20, 14);
        let spin = (T * 40) % 6;                                   // cụm nòng xoay
        for (let k = 0; k < 3; k++) { let yy = -6 + ((k * 4 + spin) % 12); B(x + 20, yy, 22, 2.4, DARK); }
        B(x + 40, -7, 4, 14, '#636e72');
        handFront = 14;
    } else if (key === 'FLAMETHROWER' || key === 'ACID_SPRAYER') {
        let acid = key === 'ACID_SPRAYER';
        B(x - 6, 4, 18, 9, acid ? '#27ae60' : '#c0392b'); O(x - 6, 4, 18, 9); // bình nhiên liệu
        B(x - 2, 5, 3, 7, 'rgba(255,255,255,0.3)');
        B(x, -4, 22, 8, acid ? '#1e8449' : '#e67e22'); O(x, -4, 22, 8);
        B(x + 22, -2.5, 14, 5, DARK); B(x + 34, -4, 4, 8, '#636e72');          // vòi phun
        if (!acid) glow(x + 40, 0, 4 + Math.random() * 2, '255,170,60');       // lửa mồi
        else dot(x + 40, 0, 2.5, '#7dffa0');
        handFront = 18;
    } else if (key === 'PLASMA_RAPID' || key === 'ELECTRON_FLUX' || key === 'TESLA_CARBINE' || key === 'ELECTRO_CANNON') {
        let rgb = key === 'TESLA_CARBINE' ? '255,159,67' : (key === 'ELECTRON_FLUX' ? '16,220,150' : '72,219,251');
        let len = key === 'ELECTRO_CANNON' ? 30 : (key === 'TESLA_CARBINE' ? 28 : 22);
        B(x - 6, -3, 9, 6, '#2d3436');
        B(x + 2, -5, len, 10, '#34495e'); O(x + 2, -5, len, 10);
        for (let k = 0; k < 3; k++) B(x + 6 + k * (len / 3.6), -6.5, 3, 13, `rgba(${rgb},0.9)`); // cuộn dây năng lượng
        B(x + 2 + len, -2, 9, 4, DARK);
        glow(x + 13 + len, 0, key === 'ELECTRO_CANNON' || key === 'TESLA_CARBINE' ? 6 : 4, rgb);
        dot(x + 13 + len, 0, 2, '#fff');
        handFront = 16;
    } else {
        B(x + 2, -4, 18, 8, w.color || '#bdc3c7'); O(x + 2, -4, 18, 8);
        handFront = 10;
    }
    // Hai bàn tay cầm súng
    dot(x + 5, 3, 3.6, SKIN);
    if (handFront) dot(x + handFront, 4, 3.6, SKIN);
}

function drawPlayerEntity(p, idx, T) {
    drawShadow(p.x, p.y, p.radius);
    if (p.perks.invulnTimer > 0) { ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 6 + Math.sin(T * 14) * 2, 0, Math.PI * 2); ctx.fillStyle = 'rgba(241,196,15,0.4)'; ctx.fill(); }
    if (p.tempShield > 0) {
        ctx.strokeStyle = '#3498db'; ctx.lineWidth = 3;
        for (let s = 0; s < p.tempShield; s++) { ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 4 + s * 4, T * 2 + s, T * 2 + s + Math.PI * 1.5); ctx.stroke(); }
    }
    let hasKatana = p.weapon && (p.weapon.name === 'Kiếm' || p.weapon.name === 'Katana Huyền Thoại');
    if (p.perks.heartSword && hasKatana) { ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 30, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(155,89,182,0.4)'; ctx.lineWidth = 2; ctx.stroke(); }
    if (p.perks.e_dienAp && !p.isDowned) { ctx.beginPath(); ctx.arc(p.x, p.y, 150, 0, Math.PI * 2); ctx.strokeStyle = `rgba(0,210,211,${0.12 + 0.06 * Math.sin(T * 8)})`; ctx.lineWidth = 2; ctx.stroke(); }

    // Vòng nhận diện người chơi của mình (online)
    if (NET.mode && idx === NET.localIdx && !p.isDowned) { ctx.beginPath(); ctx.ellipse(p.x, p.y + p.radius * 0.6, p.radius + 6, (p.radius + 6) * 0.5, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.stroke(); }

    let g = ctx.createRadialGradient(p.x - 5, p.y - 6, 2, p.x, p.y, p.radius);
    if (p.isDowned) { g.addColorStop(0, '#aab7b8'); g.addColorStop(1, '#616a6b'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, p.color); g.addColorStop(1, p.color); }
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = p.hurtFlash > 0 ? '#ff4757' : '#fff'; ctx.lineWidth = p.hurtFlash > 0 ? 4 : 2; ctx.stroke();
    drawStatusEffects(p);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    if (p.isDowned) {
        ctx.fillStyle = '#fff'; ctx.font = '20px Arial'; ctx.fillText('💀', p.x, p.y);
        if (!isSinglePlayer) {
            outlinedText('CỨU!', p.x, p.y - 30, '#2ecc71', 'bold 12px Arial');
            if (p.reviveProgress > 0) { let reqTime = 2.0 + p.reviveCount * 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 10, -Math.PI / 2, -Math.PI / 2 + Math.min(1, p.reviveProgress / reqTime) * Math.PI * 2); ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 4; ctx.stroke(); }
        }
        return;
    }

    let ang = Math.atan2(p.facingY, p.facingX);
    // Tia ngắm mờ cho súng (người dùng chuột)
    if (p.weapon && (p.weapon.type === 'gun' || p.weapon.type === 'charge') && idx === (NET.mode ? NET.localIdx : 0) && PC_INPUT.pointer.active) {
        let len = Math.min(p.weapon.range || 300, 420);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]);
        ctx.beginPath(); ctx.moveTo(p.x + p.facingX * 30, p.y + p.facingY * 30); ctx.lineTo(p.x + p.facingX * len, p.y + p.facingY * len); ctx.stroke(); ctx.setLineDash([]);
    }

    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
    if (p.weapon) {
        ctx.fillStyle = p.weapon.color;
        if (p.weapon.type === 'melee') {
            if (p.weapon.name === 'Búa') { ctx.fillRect(p.radius, -3, 15, 6); ctx.fillRect(p.radius + 10, -8, 12, 16); }
            else if (p.weapon.name === 'Rìu') { ctx.fillRect(p.radius, -2, 15, 4); ctx.beginPath(); ctx.arc(p.radius + 12, -4, 6, 0, Math.PI); ctx.fill(); }
            else if (p.weapon.name === 'Dao Quân Sự') { ctx.fillRect(p.radius, -2, 12, 3); ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.moveTo(p.radius + 12, -2); ctx.lineTo(p.radius + 18, -0.5); ctx.lineTo(p.radius + 12, 1); ctx.fill(); }
            else if (p.weapon.name === 'Giáo') { ctx.fillStyle = '#8e44ad'; ctx.fillRect(p.radius, -1.5, 30, 3); ctx.fillStyle = '#bdc3c7'; ctx.beginPath(); ctx.moveTo(p.radius + 30, -2); ctx.lineTo(p.radius + 40, 0); ctx.lineTo(p.radius + 30, 2); ctx.fill(); }
            else if (p.weapon.name === 'Laser' || p.weapon.isElectric || p.weapon.isLegendary) {
                ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35; ctx.fillRect(p.radius, -5, 34, 10);
                ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillRect(p.radius, -2, 34, 4);
                ctx.fillStyle = '#fff'; ctx.fillRect(p.radius + 2, -0.8, 30, 1.6);
            }
            else ctx.fillRect(p.radius, -2, 30, 4);
        }
        else if (p.weapon.name === 'Lựu Đạn') { ctx.beginPath(); ctx.arc(p.radius + 5, 0, 6, 0, Math.PI * 2); ctx.fillStyle = '#27ae60'; ctx.fill(); }
        else if (p.weapon.type === 'gun' || (p.weapon.type === 'charge' && p.weapon.id !== 16)) drawGun(p.weapon, p.radius, T);
        else if (p.weapon.id === 10) { ctx.fillRect(p.radius, -6, 25, 12); ctx.fillStyle = '#333'; ctx.fillRect(p.radius + 25, -4, 5, 8); }
        else if (p.weapon.id === 15) { ctx.fillRect(p.radius, -5, 22, 10); ctx.fillStyle = '#c0392b'; ctx.fillRect(p.radius + 5, -8, 12, 6); }
        else if (p.weapon.id === 27) { ctx.fillRect(p.radius, -5, 22, 10); ctx.fillStyle = '#27ae60'; ctx.fillRect(p.radius + 4, -7, 14, 14); }
        else if (p.weapon.id === 16) { // Cung
            ctx.beginPath(); ctx.arc(p.radius + 5, 0, 15, -Math.PI / 2, Math.PI / 2); ctx.lineWidth = 2; ctx.strokeStyle = p.weapon.color; ctx.stroke();
            let pull = Math.min(1, (p.chargeTime || 0) / 1.5) * 10;
            ctx.beginPath(); ctx.moveTo(p.radius + 5, -15); ctx.lineTo(p.radius + 5 - pull, 0); ctx.lineTo(p.radius + 5, 15); ctx.strokeStyle = '#fff'; ctx.stroke();
            if (p.chargeTime > 0) { ctx.fillStyle = '#ecf0f1'; ctx.fillRect(p.radius + 5 - pull, -1, 22, 2); }
        }
        else if (p.weapon.id === 12) { ctx.fillStyle = '#2d3436'; ctx.fillRect(p.radius, -4, 10, 8); ctx.fillStyle = '#e74c3c'; ctx.fillRect(p.radius + 8, -1, 8, 2); }
        else ctx.fillRect(p.radius, -4, p.weapon.name === 'Ngắm' ? 25 : 18, p.weapon.name === 'Ngắm' ? 6 : 8);
    } else {
        ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.arc(p.radius, -6, 4, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(p.radius, 6, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Hào quang tụ lực
    if (p.chargeTime > 0) {
        let c = Math.min(1, p.chargeTime / 1.5);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius + 18 - c * 10, 0, Math.PI * 2);
        ctx.strokeStyle = c >= 0.95 ? `rgba(255,255,255,${0.6 + 0.4 * Math.sin(T * 30)})` : `rgba(155,89,182,${0.3 + c * 0.5})`; ctx.lineWidth = 2 + c * 2; ctx.stroke();
    }

    if (p.pullingPin) { ctx.fillStyle = (p.pinTime - Date.now()) % 200 < 100 ? '#e74c3c' : '#f1c40f'; ctx.beginPath(); ctx.arc(p.x, p.y - 30, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (p.weapon) {
        let showAmmo = p.weapon.type === 'gun' || p.weapon.type === 'melee' || p.weapon.type === 'charge' || p.weapon.type === 'explosive';
        outlinedText(`${p.weapon.name}${showAmmo ? ` (${p.weapon.ammo})` : ''}`, p.x, p.y - 40, '#ecf0f1', 'bold 11px Arial');
    }
    if (NET.mode) outlinedText(idx === 0 ? 'P1' : 'P2', p.x, p.y - 53, idx === 0 ? '#74b9ff' : '#ff7675', 'bold 10px Arial');
    drawMiniBar(p.x, p.y - 30, 40, 5, p.hp, p.maxHp, '#e74c3c');
    drawMiniBar(p.x, p.y - 24, 40, 3, p.hunger, 100, '#f39c12');
    if (p.chargeTime > 0) drawMiniBar(p.x, p.y + 22, 40, 4, p.chargeTime, 1.5, '#9b59b6');
    if (p.stunTimer > 0) outlinedText('💫', p.x, p.y - 2, '#fff', '16px Arial', 1);

    ctx.textAlign = 'center';
    if (p.perks.frenzyStacks > 0) { ctx.fillStyle = '#e74c3c'; ctx.font = 'bold 10px Arial'; ctx.fillText(`🔪x${p.perks.frenzyStacks}`, p.x + 34, p.y - 26); }
    if (p.perks.rainStacks > 0) { ctx.fillStyle = '#95a5a6'; ctx.font = 'bold 10px Arial'; ctx.fillText(`🔫x${Math.floor(p.perks.rainStacks / 2)}`, p.x - 34, p.y - 26); }
    if (p.perks.nhatKiem) outlinedText(`LƯỚT C: ${p.skillC_CD > 0 ? p.skillC_CD.toFixed(1) + 's' : 'SẴN SÀNG'}`, p.x, p.y + 34, '#ee5253', 'bold 11px Arial');
    if ((p.tags['KIẾM SƯ'] || 0) >= 5) outlinedText(`NỘ D: ${p.dCharge}/50`, p.x, p.y + 47, '#e056fd', 'bold 11px Arial');
}

// Vẽ zombie: thân + HAI TAY vươn ra trước mặt + chi tiết đặc trưng theo từng loại.
// Vẽ trong hệ toạ độ cục bộ: trục +x là hướng zombie đang nhìn (về phía con mồi).
function drawZombieBody(z, T, ang, rage, boss, inBush) {
    const r = z.radius, ty = z.type, id = z.nid || 0;
    const flash = z.hitFlash > 0;
    const body = flash ? '#ffffff' : (rage ? (ty === 32 ? '#ff4757' : '#ff3838') : z.color);
    const outline = inBush ? 'rgba(255,255,255,0.35)' : '#111';
    if (ty >= 50) { drawDeadEntity(z, T, ang, flash); return; } // The Dead & Tế Phẩm (10-thedead.js)
    if (ty >= 40) { drawAnt(z, T, ang, flash); return; } // loài kiến (09-cave.js)
    const stunned = z.stunTimer > 0;
    const walk = stunned ? 0 : Math.sin(T * 8 + id * 1.7);
    const circle = (x, y, rad, fill) => { ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); };

    ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(ang);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // ---- Chi tiết phía SAU thân ----
    if (ty === 3 || ty === 10 || ty === 22) { // loại lao nhanh: gai tốc độ sau lưng
        ctx.fillStyle = outline;
        for (let s = -1; s <= 1; s++) { ctx.beginPath(); ctx.moveTo(-r * 0.7, s * r * 0.45 - r * 0.18); ctx.lineTo(-r * (1.5 + 0.15 * walk), s * r * 0.5); ctx.lineTo(-r * 0.7, s * r * 0.45 + r * 0.18); ctx.fill(); }
    } else if (ty === 13) { // lính cứu hỏa: đeo BÌNH KHÍ GA đỏ phía sau lưng (nổ khi chết)
        let tw = r * 1.15, th = r * 0.5; // bình nằm ngang sau lưng
        ctx.strokeStyle = outline; ctx.lineWidth = th * 2 + 4; ctx.beginPath(); ctx.moveTo(-r * 1.15, -tw * 0.42); ctx.lineTo(-r * 1.15, tw * 0.42); ctx.stroke();
        ctx.strokeStyle = flash ? '#fff' : '#c0392b'; ctx.lineWidth = th * 2; ctx.beginPath(); ctx.moveTo(-r * 1.15, -tw * 0.42); ctx.lineTo(-r * 1.15, tw * 0.42); ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = th * 2; ctx.beginPath(); ctx.moveTo(-r * 1.15, -tw * 0.08); ctx.lineTo(-r * 1.15, tw * 0.08); ctx.stroke(); // đai cảnh báo vàng
        ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(-r * 1.15 - th * 0.75, -tw * 0.5, th * 0.35, tw);                               // vệt bóng kim loại
        ctx.fillStyle = '#95a5a6'; ctx.fillRect(-r * 1.15 - th * 0.3, -tw * 0.42 - th - r * 0.28, th * 0.6, r * 0.3);                         // van bình
        ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(-r * 1.15, -tw * 0.42 - th - r * 0.3, r * 0.16, 0, Math.PI * 2); ctx.fill();       // tay van
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 1.15, -tw * 0.42 - th); ctx.quadraticCurveTo(-r * 0.2, -r * 1.5, r * 0.55, -r * 0.55); ctx.stroke(); // ống dẫn tới mặt nạ
    } else if (ty === 18 || ty === 2) { // phun acid: túi độc phập phồng
        circle(-r * 0.75, 0, r * (0.55 + 0.06 * walk), flash ? '#fff' : 'rgba(120, 255, 120, 0.85)'); ctx.strokeStyle = outline; ctx.lineWidth = 2; ctx.stroke();
    } else if (ty === 26) { // Witch: tóc dài bay phía sau
        ctx.strokeStyle = flash ? '#fff' : '#b3005a'; ctx.lineWidth = 3;
        for (let s = -2; s <= 2; s++) { ctx.beginPath(); ctx.moveTo(-r * 0.6, s * r * 0.3); ctx.quadraticCurveTo(-r * 1.6, s * r * 0.5 + walk * 4, -r * 2.3, s * r * 0.35 - walk * 5); ctx.stroke(); }
    } else if (ty === 32 || ty === 20) { // Leader / Kẻ lang thang: áo choàng
        ctx.fillStyle = ty === 32 ? '#7b0f1a' : '#111418';
        ctx.beginPath(); ctx.moveTo(-r * 0.2, -r * 1.05); ctx.lineTo(-r * (1.9 + 0.1 * walk), -r * 0.8); ctx.lineTo(-r * 1.6, 0); ctx.lineTo(-r * (1.9 - 0.1 * walk), r * 0.8); ctx.lineTo(-r * 0.2, r * 1.05); ctx.fill();
    } else if (ty === 15) { // nhầy nhụa: vũng nhầy kéo theo
        circle(-r * 0.9, r * 0.35, r * 0.4, 'rgba(46,204,113,0.5)'); circle(-r * 1.3, -r * 0.2, r * 0.26, 'rgba(46,204,113,0.4)');
    }

    // ---- HAI TAY vươn ra trước mặt ----
    if (ty !== 5 && ty !== 31) {
        let reach = 1.5, thick = 0.3, hand = 0.24;
        if (ty === 10 || ty === 22 || ty === 26) { reach = 1.85; thick = 0.2; }       // loại vuốt: tay dài, mảnh
        if (ty === 4 || ty === 27 || ty === 30 || ty === 14) { thick = 0.42; hand = 0.4; } // loại trâu: tay to, nắm đấm lớn
        if (ty === 7) { reach = 1.35; }
        if (ty === 20) { reach = 1.7; }
        const armCol = flash ? '#fff' : (ty === 4 || ty === 14 ? '#3d4651' : body);
        for (let s = -1; s <= 1; s += 2) {
            let sw = stunned ? 0 : Math.sin(T * 8 + id * 1.7 + (s > 0 ? Math.PI : 0)) * r * 0.16; // hai tay lắc so le
            let sx0 = r * 0.25, sy0 = s * r * 0.82;
            let hx = r * reach + sw, hy = s * r * 0.36;
            if (stunned) { hx = r * 0.9; hy = s * r * 1.15; }                                   // choáng: buông thõng hai bên
            ctx.strokeStyle = outline; ctx.lineWidth = r * thick + 3; ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(hx, hy); ctx.stroke();
            ctx.strokeStyle = armCol; ctx.lineWidth = r * thick; ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(hx, hy); ctx.stroke();
            circle(hx, hy, r * hand, armCol); ctx.strokeStyle = outline; ctx.lineWidth = 1.5; ctx.stroke();
            if (ty === 10 || ty === 22 || ty === 26 || ty === 20) { // móng vuốt
                ctx.strokeStyle = flash ? '#fff' : (ty === 20 ? '#c0392b' : '#f5f6fa'); ctx.lineWidth = 2;
                for (let c = -1; c <= 1; c++) { ctx.beginPath(); ctx.moveTo(hx, hy + c * r * 0.14); ctx.lineTo(hx + r * 0.55, hy + c * r * 0.26); ctx.stroke(); }
            } else if (ty !== 4 && ty !== 27 && ty !== 30 && ty !== 14) { // ngón tay quờ quạng
                ctx.strokeStyle = outline; ctx.lineWidth = 1.5;
                for (let c = -1; c <= 1; c++) { ctx.beginPath(); ctx.moveTo(hx + r * 0.1, hy + c * r * 0.12); ctx.lineTo(hx + r * 0.34, hy + c * r * 0.2); ctx.stroke(); }
            }
        }
        // Vũ khí cầm tay của quái tầm xa
        if (ty === 8) { ctx.strokeStyle = '#d4a15a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(r * 1.25, 0, r * 0.75, -1.1, 1.1); ctx.stroke(); ctx.strokeStyle = '#eee'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r * 1.25 + Math.cos(1.1) * r * 0.75, Math.sin(1.1) * r * 0.75); ctx.lineTo(r * 1.25 + Math.cos(1.1) * r * 0.75, -Math.sin(1.1) * r * 0.75); ctx.stroke(); }
        else if (ty === 9 || ty === 12) { ctx.fillStyle = '#2d3436'; ctx.fillRect(r * 0.9, -r * 0.16, r * 1.15, r * 0.32); ctx.fillStyle = '#636e72'; ctx.fillRect(r * 1.9, -r * 0.1, r * 0.2, r * 0.2); }
        else if (ty === 17 || ty === 29) { ctx.strokeStyle = '#ffeaa7'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 1.5, -r * 0.36); ctx.lineTo(r * 1.75, Math.sin(T * 30 + id) * r * 0.2); ctx.lineTo(r * 1.5, r * 0.36); ctx.stroke(); }
    }

    // ---- THÂN ----
    let wob = 1 + walk * 0.05;
    ctx.beginPath();
    if (ty === 5) { // ma: thân lượn sóng
        for (let k = 0; k <= 16; k++) { let a = (k / 16) * Math.PI * 2, rr = r * (1 + 0.12 * Math.sin(a * 5 + T * 6)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath();
    } else if (ty === 15 || ty === 34) { // nhầy / boomer: thân sần sùi phập phồng
        for (let k = 0; k <= 14; k++) { let a = (k / 14) * Math.PI * 2, rr = r * (1 + 0.1 * Math.sin(a * 4 + T * 4 + id)); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath();
    } else ctx.ellipse(0, 0, r * wob, r / wob, 0, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill();
    ctx.strokeStyle = outline; ctx.lineWidth = (ty === 4 || ty === 14 || boss) ? 4 : 2; ctx.stroke();
    circle(-r * 0.25, -r * 0.35, r * 0.34, 'rgba(255,255,255,0.13)');

    if (!flash) {
        // ---- Chi tiết TRÊN thân theo từng loại ----
        if (ty === 0) { circle(-r * 0.35, r * 0.3, r * 0.2, 'rgba(0,0,0,0.22)'); circle(-r * 0.1, -r * 0.5, r * 0.13, 'rgba(120,0,0,0.5)'); }
        else if (ty === 1 || ty === 34) { // phát nổ: lõi phát sáng nhấp nháy + mụn mủ
            let pulse = 0.5 + 0.5 * Math.sin(T * (ty === 34 ? 12 : 6) + id);
            circle(-r * 0.15, 0, r * (0.4 + 0.12 * pulse), `rgba(255, 234, 100, ${0.5 + 0.4 * pulse})`);
            circle(-r * 0.55, r * 0.45, r * 0.16, '#f6e58d'); circle(-r * 0.5, -r * 0.5, r * 0.13, '#f6e58d'); circle(r * 0.1, r * 0.6, r * 0.11, '#f6e58d');
        }
        else if (ty === 4) { // tanker: giáp vai + tấm giáp lưng
            ctx.fillStyle = '#2f3640'; ctx.fillRect(-r * 0.55, -r * 0.95, r * 0.8, r * 0.38); ctx.fillRect(-r * 0.55, r * 0.57, r * 0.8, r * 0.38);
            ctx.strokeStyle = '#95a5a6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.3); ctx.lineTo(-r * 0.6, r * 0.3); ctx.moveTo(-r * 0.3, -r * 0.42); ctx.lineTo(-r * 0.3, r * 0.42); ctx.stroke();
        }
        else if (ty === 6) { // triệu hồi: sừng + vòng phép
            ctx.strokeStyle = `rgba(224, 86, 253, ${0.5 + 0.3 * Math.sin(T * 4)})`; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(0, 0, r * 1.45, T, T + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = '#2d0a3d';
            for (let s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.moveTo(r * 0.1, s * r * 0.6); ctx.lineTo(r * 0.55, s * r * 1.35); ctx.lineTo(r * 0.5, s * r * 0.55); ctx.fill(); }
        }
        else if (ty === 8) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.98, Math.PI * 0.55, Math.PI * 1.45); ctx.fill(); } // mũ trùm cung thủ
        else if (ty === 9) { ctx.strokeStyle = '#0a3d2e'; ctx.lineWidth = r * 0.22; ctx.beginPath(); ctx.arc(0, 0, r * 0.72, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke(); } // mũ lính
        else if (ty === 11) { // hồi sinh: vết khâu chữ thập
            ctx.strokeStyle = z.hasRevived ? '#2ecc71' : '#dfe6e9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-r * 0.7, -r * 0.1); ctx.lineTo(-r * 0.05, -r * 0.1);
            for (let k = 0; k < 4; k++) { ctx.moveTo(-r * 0.62 + k * r * 0.17, -r * 0.24); ctx.lineTo(-r * 0.62 + k * r * 0.17, r * 0.04); }
            ctx.stroke();
        }
        else if (ty === 12) { ctx.fillStyle = '#1e1e1e'; ctx.fillRect(r * 0.28, -r * 0.8, r * 0.34, r * 1.6); } // cướp: khăn bịt mặt
        else if (ty === 13) { ctx.fillStyle = '#f1c40f'; ctx.fillRect(-r * 0.15, -r * 0.95, r * 0.22, r * 1.9); ctx.fillRect(-r * 0.6, -r * 0.82, r * 0.14, r * 1.64); } // sọc phản quang
        else if (ty === 14) { // bọc thép: vòng thép + khe nhìn
            ctx.beginPath(); ctx.arc(0, 0, r * 0.66, 0, Math.PI * 2); ctx.strokeStyle = '#95a5a6'; ctx.lineWidth = 3; ctx.stroke();
            for (let k = 0; k < 6; k++) circle(Math.cos(k * 1.047) * r * 0.84, Math.sin(k * 1.047) * r * 0.84, r * 0.07, '#bdc3c7');
        }
        else if (ty === 15 || ty === 18) { circle(-r * 0.3, r * 0.4, r * 0.18, 'rgba(200,255,200,0.6)'); circle(-r * 0.5, -r * 0.3, r * 0.13, 'rgba(200,255,200,0.6)'); circle(r * 0.05, -r * 0.55, r * 0.1, 'rgba(200,255,200,0.6)'); }
        else if (ty === 16 || ty === 17 || ty === 28) { // hệ điện: tia lửa điện chạy quanh thân
            ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 2; ctx.beginPath();
            for (let k = 0; k < 3; k++) { let a = T * 5 + k * 2.1 + id; ctx.moveTo(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); ctx.lineTo(Math.cos(a + 0.4) * r * 0.85, Math.sin(a + 0.4) * r * 0.85); ctx.lineTo(Math.cos(a + 0.2) * r * 1.2, Math.sin(a + 0.2) * r * 1.2); }
            ctx.stroke();
            if (ty === 28) { ctx.strokeStyle = 'rgba(0,210,211,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, r * 1.35, -T * 2, -T * 2 + 4.2); ctx.stroke(); }
        }
        else if (ty === 20) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.98, Math.PI * 0.5, Math.PI * 1.5); ctx.fill(); }
        else if (ty === 21) { ctx.strokeStyle = `rgba(142, 68, 173, ${0.45 + 0.25 * Math.sin(T * 7 + id)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, r * 1.25, 0, Math.PI * 2); ctx.stroke(); }
        else if (ty === 27) { // Crusher: gai vai
            ctx.fillStyle = '#7f8c8d';
            for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 2; k++) { ctx.beginPath(); ctx.moveTo(-r * 0.4 + k * r * 0.4, s * r * 0.85); ctx.lineTo(-r * 0.25 + k * r * 0.4, s * r * 1.35); ctx.lineTo(-r * 0.05 + k * r * 0.4, s * r * 0.85); ctx.fill(); }
        }
        else if (ty === 30) { // Khổng Lồ: vương miện gai
            ctx.fillStyle = '#7d4a12';
            for (let k = 0; k < 9; k++) { let a = Math.PI * 0.45 + k * (Math.PI * 1.1 / 8); ctx.beginPath(); ctx.moveTo(Math.cos(a - 0.09) * r * 0.95, Math.sin(a - 0.09) * r * 0.95); ctx.lineTo(Math.cos(a) * r * 1.28, Math.sin(a) * r * 1.28); ctx.lineTo(Math.cos(a + 0.09) * r * 0.95, Math.sin(a + 0.09) * r * 0.95); ctx.fill(); }
            ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.2); ctx.lineTo(-r * 0.1, r * 0.1); ctx.lineTo(-r * 0.5, r * 0.45); ctx.stroke();
        }
        else if (ty === 31) { // Lõi Quá Tải: vòng năng lượng xoay + lõi
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.beginPath(); ctx.arc(0, 0, r * 0.68, T * 3 - ang, T * 3 - ang + 4); ctx.stroke();
            ctx.strokeStyle = 'rgba(0,255,255,0.6)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.3, -T * 2 - ang, -T * 2 - ang + 3); ctx.stroke();
            circle(0, 0, r * (0.32 + 0.06 * Math.sin(T * 10)), '#ffffff');
        }
        else if (ty === 32) { ctx.fillStyle = '#2d3436'; ctx.beginPath(); ctx.arc(-r * 0.1, 0, r * 0.72, Math.PI * 0.5, Math.PI * 1.5); ctx.fill(); circle(-r * 0.35, 0, r * 0.16, '#f1c40f'); } // mũ nồi + sao
        else if (ty === 33) { ctx.fillStyle = '#f39c12'; ctx.beginPath(); ctx.arc(0, 0, r * 0.8, Math.PI * 0.5, Math.PI * 1.5); ctx.fill(); } // mũ thợ mỏ
        else if (ty === 2) { ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r * 0.85, r * 0.05); ctx.lineTo(r * (1.05 + 0.1 * walk), r * 0.12); ctx.stroke(); } // dãi độc

        // ---- MẮT (và miệng) ----
        if (ty === 29 || ty === 20) { // một mắt lớn
            circle(r * 0.5, 0, r * 0.3, ty === 20 ? '#1b0000' : '#fff'); circle(r * 0.58, 0, r * 0.15, ty === 20 ? '#ff3838' : '#e17055');
        } else if (ty === 33) { circle(r * 0.62, 0, r * 0.22, '#fff9c4'); circle(r * 0.4, -r * 0.42, r * 0.1, '#000'); circle(r * 0.4, r * 0.42, r * 0.1, '#000'); } // đèn mũ
        else if (ty !== 12 && ty !== 31) {
            let eyeCol = ty === 5 ? '#ffffff' : ((rage || boss || ty === 26 || ty === 21) ? '#ffeb3b' : (ty === 14 ? '#ff7675' : '#000'));
            let er = r * (ty === 7 ? 0.22 : 0.15);
            circle(r * 0.52, -r * 0.33, er, eyeCol); circle(r * 0.52, r * 0.33, er, eyeCol);
            if (ty === 0 || ty === 1 || ty === 3 || ty === 4 || ty === 10 || ty === 11 || ty === 27 || ty === 30) { // miệng há
                ctx.strokeStyle = 'rgba(60,0,0,0.75)'; ctx.lineWidth = Math.max(2, r * 0.12); ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.2, -1.2, 1.2); ctx.stroke();
            }
        } else if (ty === 12) { circle(r * 0.45, -r * 0.33, r * 0.1, '#fff'); circle(r * 0.45, r * 0.33, r * 0.1, '#fff'); }
    }
    ctx.restore();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}

function drawTankEntity(T) {
    drawShadow(tank.x, tank.y, 40); ctx.save(); ctx.translate(tank.x, tank.y); ctx.rotate(tank.hullAngle);

    // VẼ XE TĂNG (Màu xịn hơn nếu là Thiết Xa)
    let mainColor = thietXaUnlocked ? '#2c3e50' : '#27ae60';
    let subColor = thietXaUnlocked ? '#e74c3c' : '#2c3e50';
    ctx.fillStyle = subColor; ctx.fillRect(-35, -30, 70, 15); ctx.fillRect(-35, 15, 70, 15);
    // Xích xe chạy
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    let tread = (T * 60) % 14;
    for (let tx = -35 + tread; tx < 35; tx += 14) { ctx.fillRect(tx, -30, 4, 15); ctx.fillRect(tx, 15, 4, 15); }
    ctx.fillStyle = mainColor; ctx.fillRect(-40, -20, 80, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(-40, -20, 80, 8);
    ctx.rotate(-tank.hullAngle + tank.turretAngle); ctx.fillStyle = '#222'; ctx.fillRect(0, -5, 60, 10); ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fillStyle = subColor; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();

    if (tank.p2InvulnTimer > 0) {
        ctx.beginPath(); ctx.arc(tank.x, tank.y, 50 + Math.sin(T * 10) * 3, 0, Math.PI * 2);
        ctx.strokeStyle = '#3498db'; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = 'rgba(52,152,219,0.12)'; ctx.fill();
    }
    if (tank.dashTimer > 0) { ctx.beginPath(); ctx.arc(tank.x, tank.y, 56, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(241,196,15,0.7)'; ctx.lineWidth = 3; ctx.stroke(); }

    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    drawMiniBar(tank.x, tank.y - 50, 60, 6, tank.hp, tank.maxHp, '#e67e22');
    outlinedText(thietXaUnlocked ? 'THIẾT XA' : 'XE TĂNG', tank.x, tank.y - 62, '#fff', 'bold 14px Arial');
    if (tankExitTimer > 0.35) drawMiniBar(tank.x, tank.y - 78, 50, 5, tankExitTimer, 1.0, '#3498db');
    let info = [];
    if (hasTeamPerk('t_canQuet')) info.push(`[B] HÚC: ${tank.dashCooldown > 0 ? tank.dashCooldown.toFixed(1) : 'OK'}`);
    if (thietXaUnlocked) info.push(`[C]: ${tank.cSkillCD > 0 ? tank.cSkillCD.toFixed(1) : 'OK'}`);
    if (info.length) outlinedText(info.join('   '), tank.x, tank.y + 62, '#f1c40f', 'bold 10px Arial');
}

// Vũng nước đọng trên mặt đất khi mưa (vị trí cố định theo ô lưới của map, có gợn lan)
function drawPuddles(x0, x1, y0, y1, T) {
    const C = 300, acid = currentWeather === 10;
    const rim = acid ? '150, 255, 170' : '170, 200, 225';
    ctx.lineWidth = 1.5;
    for (let gx = Math.floor(x0 / C); gx <= Math.floor(x1 / C); gx++) {
        for (let gy = Math.floor(y0 / C); gy <= Math.floor(y1 / C); gy++) {
            let h = Math.sin(gx * 127.1 + gy * 311.7 + currentLevel * 17.3) * 43758.5453; h -= Math.floor(h);
            if (h > 0.55) continue;
            let h2 = (h * 7.13) % 1, h3 = (h * 13.7) % 1;
            let px = (gx + 0.2 + h2 * 0.6) * C, py = (gy + 0.2 + h3 * 0.6) * C, rx = 38 + h2 * 46, ry = 16 + h3 * 20, rot = (h - 0.27) * 1.6;
            if (px < 0 || py < 0 || px > MAP_SIZE.w || py > MAP_SIZE.h) continue;
            ctx.fillStyle = acid ? 'rgba(60, 170, 90, 0.20)' : 'rgba(16, 28, 44, 0.32)';
            ctx.beginPath(); ctx.ellipse(px, py, rx, ry, rot, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(${rim}, 0.16)`; ctx.stroke();
            for (let k = 0; k < 2; k++) {
                let f = (T * 0.9 + h * 5 + k * 0.5) % 1;
                ctx.strokeStyle = `rgba(${rim}, ${0.34 * (1 - f)})`;
                ctx.beginPath(); ctx.ellipse(px + (h2 - 0.5) * rx * (k ? -0.8 : 0.8), py + (h3 - 0.5) * ry * 0.6, 2 + f * rx * 0.42, 1 + f * ry * 0.42, rot, 0, Math.PI * 2); ctx.stroke();
            }
        }
    }
}

// Mưa (vẽ trên màn hình): 3 lớp hạt xa-gần nghiêng theo gió giật, gợn nước bám theo mặt đất, màn hơi nước khi bão
function drawRain(T, midX, midY, zoom) {
    const acid = currentWeather === 10, storm = currentWeather === 4;
    const rgb = acid ? '130, 255, 165' : '196, 216, 232';
    const wrap = (v, m) => ((v % m) + m) % m;
    const camX = midX * zoom, camY = midY * zoom;
    ctx.fillStyle = acid ? 'rgba(46, 204, 113, 0.08)' : (storm ? 'rgba(18, 30, 50, 0.30)' : 'rgba(38, 56, 78, 0.19)');
    ctx.fillRect(0, 0, W, H);

    // Gợn nước nơi hạt mưa chạm đất
    let nSplash = storm ? 48 : 30, SW = W + 200, SH = H + 200;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < nSplash; i++) {
        let ph = T * (1.5 + (i % 5) * 0.22) + i * 0.618, cyc = Math.floor(ph), f = ph - cyc;
        let h1 = Math.sin(i * 127.1 + cyc * 311.7) * 43758.5453, h2 = Math.sin(i * 269.5 + cyc * 183.3) * 43758.5453;
        h1 -= Math.floor(h1); h2 -= Math.floor(h2);
        let x = wrap(h1 * SW - camX, SW) - 100, y = wrap(h2 * SH - camY, SH) - 100, r = (3 + f * 12) * zoom;
        ctx.strokeStyle = `rgba(${rgb}, ${0.45 * (1 - f)})`;
        ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2); ctx.stroke();
        if (f < 0.3) { // tia nước bắn lên
            let k = 1 - f / 0.3;
            ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x - 5, y - 7 * k); ctx.moveTo(x + 3, y); ctx.lineTo(x + 5, y - 7 * k); ctx.moveTo(x, y); ctx.lineTo(x, y - 9 * k); ctx.stroke();
        }
    }

    // Hạt mưa: gió giật làm đổi độ nghiêng
    let gust = Math.sin(T * 0.45) * 0.5 + Math.sin(T * 1.3 + 1.7) * 0.25;
    let slant = (storm ? 0.42 : 0.18) + gust * (storm ? 0.2 : 0.07);
    const layers = [
        { n: 70, len: 13, spd: 850, a: 0.15, w: 1, par: 0.3 },
        { n: 54, len: 24, spd: 1250, a: 0.25, w: 1.4, par: 0.6 },
        { n: 24, len: 42, spd: 1750, a: 0.36, w: 2.2, par: 1 }
    ];
    const RW = W + 400;
    ctx.lineCap = 'round';
    layers.forEach((L, li) => {
        let n = Math.round(L.n * (storm ? 1.7 : (acid ? 0.75 : 1)) * Math.min(1.6, Math.max(0.6, W * H / 900000)));
        let RH = H + L.len * 2;
        ctx.strokeStyle = `rgba(${rgb}, ${L.a})`; ctx.lineWidth = L.w; ctx.beginPath();
        for (let i = 0; i < n; i++) {
            let y = wrap(i * 371.7 + li * 97 + T * L.spd * (0.85 + (i % 7) * 0.05) - camY * L.par, RH) - L.len;
            let x = wrap(i * 197.3 + li * 53 - y * slant - camX * L.par, RW) - 200;
            ctx.moveTo(x, y); ctx.lineTo(x + slant * L.len, y - L.len);
        }
        ctx.stroke();
    });
    ctx.lineCap = 'butt';

    // Màn hơi nước trôi ngang khi bão, hơi độc khi mưa acid
    if (storm || acid) {
        ctx.fillStyle = acid ? 'rgba(120, 255, 160, 0.035)' : 'rgba(200, 220, 235, 0.05)';
        for (let i = 0; i < 4; i++) {
            let fx = W + 350 - wrap(i * 417 + T * (60 + i * 26), W + 700);
            ctx.beginPath(); ctx.ellipse(fx, H * (0.15 + i * 0.24), 360, 80, -0.12, 0, Math.PI * 2); ctx.fill();
        }
    }
}

function draw() {
    const T = performance.now() / 1000;
    const zoom = cam.zoom, midX = cam.x, midY = cam.y;
    const lp = localPlayer();
    const solo = soloControls();
    let sx = (Math.random() - 0.5) * cameraShake, sy = (Math.random() - 0.5) * cameraShake;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = bgMapColor; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(zoom, zoom); ctx.translate(-midX, -midY);

    // Chỉ vẽ những gì nằm trong khung nhìn
    const vw = W / zoom / 2 + 140, vh = H / zoom / 2 + 140;
    const x0 = midX - vw, x1 = midX + vw, y0 = midY - vh, y1 = midY + vh;
    const vis = (x, y, r) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;
    const visRect = (x, y, w, h) => x + w > x0 && x < x1 && y + h > y0 && y < y1;

    // --- NỀN ---
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let gx = Math.max(0, Math.floor(x0 / 200) * 200); gx <= Math.min(MAP_SIZE.w, x1); gx += 200) { ctx.moveTo(gx, Math.max(0, y0)); ctx.lineTo(gx, Math.min(MAP_SIZE.h, y1)); }
    for (let gy = Math.max(0, Math.floor(y0 / 200) * 200); gy <= Math.min(MAP_SIZE.h, y1); gy += 200) { ctx.moveTo(Math.max(0, x0), gy); ctx.lineTo(Math.min(MAP_SIZE.w, x1), gy); }
    ctx.stroke();
    if (isRainyWeather() || caveSlippery()) drawPuddles(x0, x1, y0, y1, T); // hang tầng 1-2: nước rỉ từ trần đọng thành vũng
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let d of GROUND_DOTS) { if (!vis(d.x, d.y, 5)) continue; ctx.beginPath(); ctx.arc(d.x, d.y, d.r * 1.6, 0, Math.PI * 2); ctx.fill(); }

    for (let sz of slowZones) {
        if (!visRect(sz.x, sz.y, sz.w, sz.h)) continue;
        if (sz.type === 'mud') ctx.fillStyle = 'rgba(139, 69, 19, 0.3)';
        else if (sz.type === 'electric') ctx.fillStyle = `rgba(0, 210, 211, ${0.12 + 0.05 * Math.sin(T * 6 + sz.x)})`;
        else if (sz.type === 'spore') ctx.fillStyle = 'rgba(155, 89, 182, 0.22)';
        else ctx.fillStyle = 'rgba(52, 152, 219, 0.4)';
        ctx.fillRect(sz.x, sz.y, sz.w, sz.h);
        if (sz.type === 'river') {
            ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 3; ctx.beginPath();
            for (let wy = sz.y + 50; wy < sz.y + sz.h; wy += 100) {
                let off = (T * 45 + wy * 0.7) % 260;
                for (let wx = Math.max(sz.x, Math.floor(x0 / 260) * 260) + off; wx < Math.min(sz.x + sz.w, x1); wx += 260) { ctx.moveTo(wx, wy); ctx.lineTo(wx + 70, wy); }
            }
            ctx.stroke();
        }
    }
    ctx.strokeStyle = 'rgba(255,0,0,0.3)'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, MAP_SIZE.w, MAP_SIZE.h);

    // Vệt máu / vết cháy
    for (let d of decals) {
        if (!vis(d.x, d.y, d.r)) continue;
        ctx.globalAlpha = d.a * Math.min(1, d.life / 8); ctx.fillStyle = d.c;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.72, d.rot, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (let b of bushes) {
        if (!vis(b.x, b.y, Math.max(b.rx, b.ry))) continue;
        ctx.beginPath(); ctx.ellipse(b.x, b.y, b.rx, b.ry, b.rot || 0, 0, Math.PI * 2);
        if (b.burnedOut) { ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fill(); continue; }
        ctx.fillStyle = `rgba(25, 96, 43, ${b.alpha})`; ctx.fill();
        ctx.strokeStyle = b.burning ? 'rgba(230,126,34,0.85)' : 'rgba(129, 199, 132, 0.22)'; ctx.lineWidth = b.burning ? 3 : 2; ctx.stroke();
        if (b.burning) { ctx.fillStyle = `rgba(255,140,0,${0.2 + 0.1 * Math.sin(T * 10 + b.x)})`; ctx.fill(); }
    }

    if (isCaveMap()) { drawCaveProps(T, vis); drawCaveGuide(T); }
    if (isCaveMap() && hangZRun.stairs) {
        let st = hangZRun.stairs;
        ctx.beginPath(); ctx.arc(st.x, st.y, st.radius + 8 + Math.sin(T * 4) * 5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(236,240,241,0.3)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.arc(st.x, st.y, st.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(149, 165, 166, 0.35)'; ctx.fill();
        ctx.strokeStyle = '#ecf0f1'; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = '#ecf0f1'; ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('Z', st.x, st.y);
    }

    // Ụ súng Tử Thủ
    if (objState === 'DEFEND' && turretMode.active) {
        ctx.beginPath(); ctx.arc(turretMode.x, turretMode.y, 36, 0, Math.PI * 2); ctx.fillStyle = '#57606f'; ctx.fill(); ctx.strokeStyle = '#2f3542'; ctx.lineWidth = 5; ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        drawMiniBar(turretMode.x, turretMode.y + 48, 90, 8, turretMode.hp, turretMode.maxHp, '#f39c12');
        outlinedText('Ụ SÚNG', turretMode.x, turretMode.y + 66, '#f1c40f', 'bold 12px Arial');
    }

    for (let t of towers) {
        if (!vis(t.x, t.y, 220)) continue;
        let maxProg = t.needsBattery ? 8.0 : 5.0;
        ctx.beginPath(); ctx.arc(t.x, t.y, 150, 0, Math.PI * 2); ctx.fillStyle = t.active ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.1)'; ctx.fill(); ctx.strokeStyle = t.active ? '#2ecc71' : '#e74c3c'; ctx.lineWidth = 4; ctx.stroke();
        if (t.active) { let pr = (T * 0.6 + t.x * 0.01) % 1; ctx.beginPath(); ctx.arc(t.x, t.y, 150 + pr * 60, 0, Math.PI * 2); ctx.strokeStyle = `rgba(46,204,113,${0.5 * (1 - pr)})`; ctx.lineWidth = 3; ctx.stroke(); }
        ctx.fillStyle = '#34495e'; ctx.fillRect(t.x - 10, t.y - 30, 20, 60); ctx.beginPath(); ctx.arc(t.x, t.y - 35, 10, 0, Math.PI * 2); ctx.fillStyle = t.active ? '#2ecc71' : (Math.floor(Date.now() / 500) % 2 === 0 ? '#e74c3c' : '#c0392b'); ctx.fill();
        if (!t.active && t.progress > 0) { ctx.beginPath(); ctx.arc(t.x, t.y, 150, -Math.PI / 2, -Math.PI / 2 + (t.progress / maxProg) * Math.PI * 2); ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 6; ctx.stroke(); }
        drawMiniBar(t.x, t.y + 35, 80, 8, t.progress, maxProg, t.active ? '#2ecc71' : '#f1c40f');
    }

    if (evacZone) {
        let ev = objState === 'EVAC', roof = objState === 'ROOFTOP';
        let col = ev ? '46, 204, 113' : (roof ? '0, 210, 211' : '241, 196, 15');
        let R = roof ? 180 : 200;
        ctx.beginPath(); ctx.arc(evacZone.x, evacZone.y, R, 0, Math.PI * 2); ctx.fillStyle = `rgba(${col}, ${ev ? 0.2 : 0.1})`; ctx.fill();
        ctx.save(); ctx.translate(evacZone.x, evacZone.y); ctx.rotate(T * 0.6); ctx.setLineDash([28, 18]);
        ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.strokeStyle = `rgba(${col}, 0.9)`; ctx.lineWidth = 5; ctx.stroke(); ctx.setLineDash([]); ctx.restore();
        ctx.fillStyle = `rgba(${col}, 0.9)`; ctx.font = 'bold 80px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(roof ? '▲' : 'H', evacZone.x, evacZone.y);
        if (evacZone.progress > 0) { ctx.beginPath(); ctx.arc(evacZone.x, evacZone.y, R, -Math.PI / 2, -Math.PI / 2 + Math.min(1, evacZone.progress / 3.0) * Math.PI * 2); ctx.strokeStyle = '#3498db'; ctx.lineWidth = 10; ctx.stroke(); }
    }

    for (let m of airdropMarkers) {
        let pct = m.time / m.maxTime; drawShadow(m.x, m.y, 20 + (1 - pct) * 20);
        ctx.beginPath(); ctx.arc(m.x, m.y, 34, 0, Math.PI * 2); ctx.strokeStyle = `rgba(241,196,15,${0.4 + 0.3 * Math.sin(T * 12)})`; ctx.lineWidth = 2; ctx.stroke();
        let fallH = 800 * pct; let drawX = m.x; let drawY = m.y - fallH;
        if (pct > 0.05) { ctx.fillStyle = '#e74c3c'; ctx.beginPath(); ctx.arc(drawX, drawY - 30, 40, Math.PI, 0); ctx.fill(); ctx.strokeStyle = '#ecf0f1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(drawX - 40, drawY - 30); ctx.lineTo(drawX - 15, drawY - 10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(drawX + 40, drawY - 30); ctx.lineTo(drawX + 15, drawY - 10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(drawX, drawY - 30); ctx.lineTo(drawX, drawY - 10); ctx.stroke(); }
        ctx.fillStyle = '#f39c12'; ctx.fillRect(drawX - 20, drawY - 20, 40, 40); ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 4; ctx.strokeRect(drawX - 20, drawY - 20, 40, 40); ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', drawX, drawY);
    }

    // --- VẬT PHẨM ---
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let d of drops) {
        if (!vis(d.x, d.y, 40)) continue;
        let y = d.y + Math.sin(T * 3 + d.x * 0.05) * 3;
        drawShadow(d.x, d.y, d.radius);
        if (d.type === 'SUPERBOX' || d.type === 'SHARD' || d.type === 'MEDKIT') {
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = d.type === 'MEDKIT' ? 'rgba(46,204,113,0.16)' : 'rgba(241,196,15,0.18)';
            ctx.beginPath(); ctx.arc(d.x, y, 26 + Math.sin(T * 5 + d.y) * 4, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
        if (d.type === 'FOOD') { ctx.beginPath(); ctx.arc(d.x, y, d.radius, 0, Math.PI * 2); ctx.fillStyle = '#f1c40f'; ctx.fill(); ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = 'bold 11px Arial'; ctx.fillText('Thịt', d.x, y - 18); }
        else if (d.type === 'MEDKIT') { ctx.beginPath(); ctx.arc(d.x, y, d.radius, 0, Math.PI * 2); ctx.fillStyle = '#ecf0f1'; ctx.fill(); ctx.strokeStyle = '#2ecc71'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#e74c3c'; ctx.fillRect(d.x - 6, y - 2, 12, 4); ctx.fillRect(d.x - 2, y - 6, 4, 12); }
        else if (d.type === 'BLINDBOX') { ctx.fillStyle = '#8e44ad'; ctx.fillRect(d.x - 10, y - 10, 20, 20); ctx.strokeStyle = '#9b59b6'; ctx.lineWidth = 2; ctx.strokeRect(d.x - 10, y - 10, 20, 20); ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Arial'; ctx.fillText('?', d.x, y); }
        else if (d.type === 'SUPERBOX') { ctx.fillStyle = '#f39c12'; ctx.fillRect(d.x - 12, y - 12, 24, 24); ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.strokeRect(d.x - 12, y - 12, 24, 24); ctx.fillStyle = '#fff'; ctx.font = 'bold 16px Arial'; ctx.fillText('★', d.x, y + 1); }
        else if (d.type === 'HEAVYBOX') { ctx.fillStyle = '#4b5320'; ctx.fillRect(d.x - 15, y - 12, 30, 24); ctx.strokeStyle = '#e67e22'; ctx.lineWidth = 2.5; ctx.strokeRect(d.x - 15, y - 12, 30, 24); ctx.fillStyle = '#e67e22'; ctx.font = 'bold 15px Arial'; ctx.fillText('✹', d.x, y + 1); ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.fillText('HÒM NỔ', d.x, y - 22); }
        else if (d.type === 'SHARD') { ctx.fillStyle = '#ff9f43'; ctx.beginPath(); ctx.moveTo(d.x, y - 12); ctx.lineTo(d.x + 10, y); ctx.lineTo(d.x, y + 12); ctx.lineTo(d.x - 10, y); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    for (let item of missionItems) {
        if (item.taken || !vis(item.x, item.y, 40)) continue;
        let battery = item.kind === 'battery';
        drawShadow(item.x, item.y, item.radius);
        ctx.beginPath(); ctx.arc(item.x, item.y, 22 + Math.sin(T * 5) * 3, 0, Math.PI * 2); ctx.strokeStyle = battery ? 'rgba(241,196,15,0.5)' : 'rgba(0,210,211,0.5)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(T * 2);
        ctx.fillStyle = battery ? '#f1c40f' : '#00d2d3'; ctx.fillRect(-10, -10, 20, 20);
        ctx.strokeStyle = '#dff9fb'; ctx.lineWidth = 2; ctx.strokeRect(-10, -10, 20, 20);
        ctx.restore();
        outlinedText(battery ? 'PIN' : 'LINH KIỆN', item.x, item.y - 26, '#fff', 'bold 11px Arial');
    }

    // --- VÙNG LỬA / ACID / MƯA TÊN ---
    for (let fz of fireZones) {
        if (!vis(fz.x, fz.y, fz.radius)) continue;
        let a = Math.min(1, fz.life);
        let col = fz.kind === 'acid' ? '46, 204, 113' : (fz.kind === 'arrow' ? '224, 86, 253' : '230, 126, 34');
        let fl = 0.9 + 0.1 * Math.sin(T * 14 + fz.x);
        ctx.beginPath(); ctx.arc(fz.x, fz.y, fz.radius * fl, 0, Math.PI * 2); ctx.fillStyle = `rgba(${col}, ${0.3 * a})`; ctx.fill();
        ctx.beginPath(); ctx.arc(fz.x, fz.y, fz.radius * 0.55 * fl, 0, Math.PI * 2); ctx.fillStyle = fz.kind ? `rgba(${col}, ${0.25 * a})` : `rgba(255, 220, 120, ${0.3 * a})`; ctx.fill();
        if (fz.kind === 'arrow') {
            ctx.strokeStyle = `rgba(255,255,255,${0.7 * a})`; ctx.lineWidth = 2; ctx.beginPath();
            for (let k = 0; k < 7; k++) { let aa = Math.random() * Math.PI * 2, rr = Math.random() * fz.radius; let ax = fz.x + Math.cos(aa) * rr, ay = fz.y + Math.sin(aa) * rr; ctx.moveTo(ax + 6, ay - 26); ctx.lineTo(ax, ay); }
            ctx.stroke();
        }
    }
    for (let flower of lightFlowers) {
        if (!vis(flower.x, flower.y, 50)) continue;
        ctx.beginPath(); ctx.arc(flower.x, flower.y, 28 + Math.sin(T * 3 + flower.x) * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(249, 202, 36, ${0.15 + flower.charge / 250})`; ctx.fill();
        ctx.save(); ctx.translate(flower.x, flower.y); ctx.rotate(T * 0.8);
        ctx.fillStyle = flower.charge > 20 ? '#f9ca24' : '#7f6a1a'; ctx.fillRect(-6, -6, 12, 12); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12); ctx.restore();
    }
    for (let coil of powerCoils) {
        if (!vis(coil.x, coil.y, coil.radius)) continue;
        ctx.beginPath(); ctx.arc(coil.x, coil.y, coil.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 210, 211, ${coil.pulse > 0 ? 0.28 : 0.08})`; ctx.fill();
        ctx.strokeStyle = coil.pulse > 0 ? '#00d2d3' : 'rgba(0,210,211,0.35)'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#95a5a6'; ctx.fillRect(coil.x - 10, coil.y - 36, 20, 72);
        if (coil.pulse > 0) {
            ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
            for (let k = 0; k < 4; k++) { let aa = Math.random() * Math.PI * 2; ctx.moveTo(coil.x, coil.y); let mx = coil.x + Math.cos(aa) * coil.radius * 0.5 + (Math.random() - 0.5) * 30, my = coil.y + Math.sin(aa) * coil.radius * 0.5 + (Math.random() - 0.5) * 30; ctx.lineTo(mx, my); ctx.lineTo(coil.x + Math.cos(aa) * coil.radius, coil.y + Math.sin(aa) * coil.radius); }
            ctx.stroke();
        }
    }

    // --- CẢNH BÁO NGUY HIỂM ---
    for (let h of hazards) {
        if (h.type === 'cage') {
            for (let pnt of h.points) { ctx.fillStyle = '#00d2d3'; ctx.beginPath(); ctx.arc(pnt.x, pnt.y, 10, 0, Math.PI * 2); ctx.fill(); }
            ctx.strokeStyle = h.timer <= 0 ? '#00d2d3' : 'rgba(0,210,211,0.25)'; ctx.lineWidth = h.timer <= 0 ? 5 : 2;
            ctx.beginPath(); ctx.moveTo(h.points[0].x, h.points[0].y); for (let k = 1; k < h.points.length; k++) ctx.lineTo(h.points[k].x, h.points[k].y); ctx.closePath(); ctx.stroke();
        } else if (h.type === 'beam') {
            ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(0,210,211,0.85)'; ctx.lineWidth = 18; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(h.x + Math.cos(h.angle) * 1600, h.y + Math.sin(h.angle) * 1600); ctx.stroke();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke(); ctx.lineCap = 'butt';
        } else if (h.type === 'quad') {
            drawQuadHazard(h, T);
        } else if (h.type === 'd_arc' || h.type === 'd_scythe' || h.type === 'd_moon') {
            drawDeadHazard(h, T);
        } else if (h.type === 'mine') {
            if (!vis(h.x, h.y, 30)) continue;
            ctx.beginPath(); ctx.arc(h.x, h.y, 11, 0, Math.PI * 2); ctx.fillStyle = '#2d3436'; ctx.fill(); ctx.strokeStyle = '#636e72'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.arc(h.x, h.y, 4, 0, Math.PI * 2); ctx.fillStyle = Math.floor(T * 3) % 2 ? '#e74c3c' : '#7b241c'; ctx.fill();
        } else {
            let radius = h.radius || 110;
            if (!vis(h.x, h.y, radius)) continue;
            let warn = h.type === 'electric' || h.type === 'strike' || h.type === 'emp' || h.type === 'magnet';
            let col = h.friendly ? (h.type === 'electric' ? '72, 219, 251' : '241, 196, 15') : (warn ? '0, 210, 211' : '231, 76, 60');
            ctx.beginPath(); ctx.arc(h.x, h.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${col}, ${h.friendly ? 0.08 : 0.12})`; ctx.fill();
            ctx.strokeStyle = `rgba(${col}, 0.45)`; ctx.lineWidth = 2; ctx.stroke();
            // Vòng tiến trình đếm ngược co lại
            if (h.timer !== undefined && h.timer > 0) {
                if (h.t0 === undefined) h.t0 = Math.max(h.timer, 0.01);
                let pct = Math.max(0, Math.min(1, h.timer / h.t0));
                ctx.beginPath(); ctx.arc(h.x, h.y, radius * pct, 0, Math.PI * 2);
                ctx.strokeStyle = h.friendly ? '#f1c40f' : (warn ? '#00d2d3' : '#ff4757'); ctx.lineWidth = 3; ctx.stroke();
                ctx.beginPath(); ctx.arc(h.x, h.y, radius * (1 - pct), 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${col}, ${0.10 + 0.14 * (1 - pct)})`; ctx.fill();
            }
        }
    }

    for (let d of drones) {
        if (!vis(d.x, d.y, 24)) continue;
        ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(d.x, d.y + 18, 8, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(d.x, d.y, 8, 0, Math.PI * 2); ctx.fillStyle = d.color; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        let ra = T * 30; ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(d.x - Math.cos(ra) * 13, d.y - 8 - Math.sin(ra) * 3); ctx.lineTo(d.x + Math.cos(ra) * 13, d.y - 8 + Math.sin(ra) * 3); ctx.stroke();
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let a of allies) if (a.hp > 0 && vis(a.x, a.y, 40)) a.draw(ctx);
    for (let n of rescueNPCs) if (vis(n.x, n.y, 110)) n.draw(ctx);
    ctx.textBaseline = 'middle';
    for (let op of outposts) if (!op.dead) op.draw(ctx);

    // --- VẬT CẢN ---
    for (let obs of obstacles) {
        if (!visRect(obs.x - 6, obs.y - 6, obs.w + 12, obs.h + 12)) continue;
        if (obs.type === 'rubble') { drawRubble(obs, T); continue; }
        if (obs.type === 'tree') {
            let cx = obs.x + obs.w / 2, cy = obs.y + obs.h / 2, r = obs.w / 2;
            drawShadow(cx, cy, r);
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#1e8449'; ctx.fill(); ctx.strokeStyle = '#145a32'; ctx.lineWidth = 3; ctx.stroke();
            ctx.beginPath(); ctx.arc(cx - r * 0.16, cy - r * 0.18, r * 0.62, 0, Math.PI * 2); ctx.fillStyle = '#239b56'; ctx.fill();
            ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.34, r * 0.28, 0, Math.PI * 2); ctx.fillStyle = 'rgba(88, 214, 141, 0.4)'; ctx.fill();
        } else if (obs.poly) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.moveTo(obs.poly[0].x + 5, obs.poly[0].y + 5);
            for (let i = 1; i < obs.poly.length; i++) ctx.lineTo(obs.poly[i].x + 5, obs.poly[i].y + 5);
            ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(obs.poly[0].x, obs.poly[0].y);
            for (let i = 1; i < obs.poly.length; i++) ctx.lineTo(obs.poly[i].x, obs.poly[i].y);
            ctx.closePath();
            ctx.fillStyle = obs.type === 'cave' ? '#3b3f3f' : '#7f8c8d'; ctx.fill();
            ctx.strokeStyle = obs.type === 'cave' ? '#151718' : '#2c3e50'; ctx.lineWidth = 2; ctx.stroke();
        } else {
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(obs.x + 6, obs.y + 6, obs.w, obs.h);
            ctx.fillStyle = obs.type === 'plant_wall' ? '#1f7a3a' : (obs.type === 'building' ? '#596275' : (obs.type === 'power' ? '#4b6584' : (obs.type === 'ruin' ? '#6b6b6b' : (obs.type === 'rockwall' ? '#2a2c2c' : '#7f8c8d'))));
            ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
            ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(obs.x, obs.y, obs.w, Math.min(7, obs.h * 0.25));
            ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(obs.x, obs.y + obs.h - Math.min(7, obs.h * 0.25), obs.w, Math.min(7, obs.h * 0.25));
            if (obs.type === 'power') { ctx.fillStyle = 'rgba(241,196,15,0.55)'; if (obs.w > obs.h) ctx.fillRect(obs.x + 8, obs.y + obs.h / 2 - 2, obs.w - 16, 4); else ctx.fillRect(obs.x + obs.w / 2 - 2, obs.y + 8, 4, obs.h - 16); }
            else if (obs.type === 'building') {
                ctx.fillStyle = 'rgba(255, 234, 167, 0.16)';
                for (let wx = obs.x + 18; wx < obs.x + obs.w - 24; wx += 42) for (let wy = obs.y + 18; wy < obs.y + obs.h - 24; wy += 42) ctx.fillRect(wx, wy, 18, 18);
            }
            ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 2; ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
        }
    }

    // --- ZOMBIE ---
    let aimTargets = tank.active ? [tank] : players.filter(p => !p.isDowned);
    if (!aimTargets.length) aimTargets = players;
    for (let z of zombies) {
        if (z.hidden || !vis(z.x, z.y, z.radius + 34)) continue;
        let alpha = 1;
        let inBush = pointInBush(z.x, z.y);
        if (inBush) {
            if (!players.some(p => !p.isDowned && Math.hypot(p.x - z.x, p.y - z.y) < 95)) continue;
            alpha = 0.4;
        }
        let boss = isBossType(z.type);
        let rage = z.isFrenzied > 0;
        ctx.globalAlpha = alpha;
        drawShadow(z.x, z.y, (z.flying || z.airborne) ? z.radius * 0.7 : z.radius);
        if (boss) {
            ctx.globalAlpha = alpha * 0.35;
            ctx.beginPath(); ctx.arc(z.x, z.y, z.radius + 12 + Math.sin(T * 4) * 5, 0, Math.PI * 2); ctx.strokeStyle = z.color; ctx.lineWidth = 7; ctx.stroke();
            ctx.globalAlpha = alpha;
        }
        let tg = aimTargets[0];
        if (aimTargets.length > 1 && Math.hypot(aimTargets[1].x - z.x, aimTargets[1].y - z.y) < Math.hypot(tg.x - z.x, tg.y - z.y)) tg = aimTargets[1];
        drawZombieBody(z, T, Math.atan2(tg.y - z.y, tg.x - z.x), rage, boss, inBush);
        if (z.hp < z.maxHp) drawMiniBar(z.x, z.y - z.radius - 12, boss ? 80 : 30, boss ? 7 : 4, z.hp, z.maxHp, '#e74c3c');
        if (boss) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; outlinedText(BOSS_NAMES[z.type], z.x, z.y - z.radius - 26, z.color, 'bold 14px Arial'); }
        drawStatusEffects(z);
        ctx.globalAlpha = 1;

        // Đường cảnh báo tia điện của Zombie E.L
        if (z.type === 29 && z.warnBeamTimer > 0) {
            ctx.strokeStyle = 'rgba(255, 118, 117, 0.7)'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]);
            ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.targetX, z.targetY); ctx.stroke(); ctx.setLineDash([]);
        } else if (z.warnBeamTimer > 0 && z.targetX !== undefined) {
            // Vạch báo đòn lao/vồ: dải đỏ rộng bằng thân quái, nhấp nháy, có mũi tên ở đầu
            let a = Math.atan2(z.targetY - z.y, z.targetX - z.x), len = Math.hypot(z.targetX - z.x, z.targetY - z.y);
            ctx.save(); ctx.translate(z.x, z.y); ctx.rotate(a);
            ctx.fillStyle = `rgba(255, 71, 87, ${0.16 + 0.1 * Math.sin(T * 22)})`; ctx.fillRect(0, -z.radius, len, z.radius * 2);
            ctx.strokeStyle = 'rgba(255, 71, 87, 0.75)'; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
            ctx.beginPath(); ctx.moveTo(0, -z.radius); ctx.lineTo(len, -z.radius); ctx.moveTo(0, z.radius); ctx.lineTo(len, z.radius); ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(255, 71, 87, 0.8)'; ctx.beginPath(); ctx.moveTo(len + 18, 0); ctx.lineTo(len - 6, -z.radius - 6); ctx.lineTo(len - 6, z.radius + 6); ctx.closePath(); ctx.fill();
            ctx.restore();
        }
    }
    ctx.globalAlpha = 1;

    for (let t of thrownItems) {
        if (!vis(t.x, t.y, 20)) continue;
        // Vệt gió phía sau vũ khí đang bay
        if (!t.isGrenade && t.vx !== undefined && Math.abs(t.vx) + Math.abs(t.vy) > 200) {
            let tc = t.color || (t.wepData && t.wepData.color) || '#bdc3c7';
            ctx.lineCap = 'round'; ctx.strokeStyle = tc;
            ctx.globalAlpha = 0.22; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(t.x - t.vx * 0.06, t.y - t.vy * 0.06); ctx.lineTo(t.x, t.y); ctx.stroke();
            ctx.globalAlpha = 0.5; ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(t.x - t.vx * 0.035, t.y - t.vy * 0.035); ctx.lineTo(t.x, t.y); ctx.stroke();
            ctx.globalAlpha = 1; ctx.lineCap = 'butt';
        }
        drawShadow(t.x, t.y, 10); ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.rotation);
        if (t.alpha !== undefined) ctx.globalAlpha = t.alpha;
        if (t.isGrenade) {
            ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fillStyle = '#27ae60'; ctx.fill();
            ctx.fillStyle = (t.expTime - Date.now()) % 200 < 100 ? '#e74c3c' : '#f1c40f';
            ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillStyle = t.color || (t.wepData && t.wepData.color) || '#bdc3c7'; ctx.fillRect(-10, -4, 20, 8); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(-10, -4, 20, 8);
        }
        ctx.restore();
    }

    // --- ĐẠN (vệt sáng) ---
    ctx.lineCap = 'round';
    for (let b of bullets) {
        if (!vis(b.x, b.y, 60)) continue;
        let k = bulletKind(b);
        if (k === 10) continue;
        if (k === 1) {
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
            ctx.beginPath(); ctx.arc(-6, 0, 20, -Math.PI / 2.4, Math.PI / 2.4); ctx.strokeStyle = 'rgba(0,255,255,0.35)'; ctx.lineWidth = 9; ctx.stroke();
            ctx.beginPath(); ctx.arc(0, 0, 18, -Math.PI / 2.2, Math.PI / 2.2); ctx.strokeStyle = '#e0ffff'; ctx.lineWidth = 3; ctx.stroke();
            ctx.restore();
        }
        else if (k === 2) { ctx.beginPath(); ctx.arc(b.x, b.y, 8, 0, Math.PI * 2); ctx.fillStyle = '#c0392b'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
        else if (k === 3 || k === 11) {
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
            ctx.fillStyle = k === 11 ? 'rgba(72,219,251,0.35)' : 'rgba(155,89,182,0.35)'; ctx.fillRect(-46, -3, 46, 6);
            ctx.fillStyle = k === 11 ? '#48dbfb' : '#8e44ad'; ctx.fillRect(-15, -2, 30, 4); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(15, -4); ctx.lineTo(25, 0); ctx.lineTo(15, 4); ctx.fill(); ctx.restore();
        }
        else if (k === 4 || k === 5) {
            let lifePct = Math.max(0, b.lifeTime / (b.maxLife || 1));
            let size = 8 + (1 - lifePct) * 30;
            ctx.beginPath(); ctx.arc(b.x, b.y, size, 0, Math.PI * 2);
            if (k === 5) ctx.fillStyle = `rgba(46, 204, 113, ${Math.max(0.12, lifePct * 0.8)})`;
            else if (lifePct > 0.8) ctx.fillStyle = `rgba(255, 255, 150, ${lifePct})`;
            else if (lifePct > 0.4) ctx.fillStyle = `rgba(255, 140, 0, ${lifePct})`;
            else if (lifePct > 0.1) ctx.fillStyle = `rgba(200, 40, 0, ${lifePct * 1.5})`;
            else ctx.fillStyle = `rgba(100, 100, 100, ${lifePct * 2})`;
            ctx.fill();
        }
        else if (k === 7 || k === 8) {
            ctx.strokeStyle = 'rgba(200,200,200,0.35)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.05, b.y - b.vy * 0.05); ctx.lineTo(b.x, b.y); ctx.stroke();
            ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.fillStyle = k === 7 ? '#e67e22' : '#16a085'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
        }
        else {
            let col = k === 6 ? '241,196,15' : (k === 9 ? '72,219,251' : '255,233,168');
            let tl = k === 6 ? 0.03 : 0.022;
            ctx.strokeStyle = `rgba(${col},0.35)`; ctx.lineWidth = k === 6 ? 7 : 5; ctx.beginPath(); ctx.moveTo(b.x - b.vx * tl, b.y - b.vy * tl); ctx.lineTo(b.x, b.y); ctx.stroke();
            ctx.strokeStyle = `rgba(${col},1)`; ctx.lineWidth = k === 6 ? 3 : 2; ctx.beginPath(); ctx.moveTo(b.x - b.vx * tl * 0.5, b.y - b.vy * tl * 0.5); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
    }

    for (let a of enemyBullets) {
        if (!vis(a.x, a.y, 30)) continue;
        drawShadow(a.x, a.y, 6);
        if (a.type === 'net') { ctx.fillStyle = '#8e44ad'; ctx.fillRect(a.x - 8, a.y - 8, 16, 16); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(a.x - 8, a.y - 8, 16, 16); }
        else {
            let ecol = a.type === 'acid' ? '#2ecc71' : (a.type === 'electric' ? '#00d2d3' : (a.type === 'rocket' ? '#ff9f43' : (a.type === 'rock' ? '#95a5a6' : '#ecf0f1')));
            ctx.strokeStyle = ecol; ctx.globalAlpha = 0.4; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(a.x - a.vx * 0.045, a.y - a.vy * 0.045); ctx.stroke(); ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.arc(a.x, a.y, a.type === 'acid' ? 6 : (a.type === 'shotgun' ? 4 : (a.type === 'electric' ? 6 : (a.type === 'rocket' ? 7 : (a.type === 'rock' ? 8 : 3)))), 0, Math.PI * 2); ctx.fillStyle = ecol; ctx.fill();
        }
    }
    ctx.lineCap = 'butt';
    for (let s of slashes) s.draw(ctx);

    // --- NGƯỜI CHƠI / XE TĂNG ---
    if (!tank.active) players.forEach((p, idx) => drawPlayerEntity(p, idx, T));
    else drawTankEntity(T);

    // Trực thăng bay phía trên
    if (heliSupport.active) {
        let hx = heliSupport.x, hy = heliSupport.y;
        ctx.strokeStyle = 'rgba(241,196,15,0.16)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hx, hy, 800, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(hx + 20, hy + 60, 44, 20, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(hx, hy);
        ctx.fillStyle = '#4b6584'; ctx.fillRect(-56, -4, 30, 8); ctx.fillRect(-60, -12, 6, 24);
        ctx.beginPath(); ctx.ellipse(0, 0, 30, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#2f3542'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#a5d8ff'; ctx.beginPath(); ctx.ellipse(15, 0, 10, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.rotate(T * 28); ctx.strokeStyle = 'rgba(236,240,241,0.7)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-52, 0); ctx.lineTo(52, 0); ctx.moveTo(0, -52); ctx.lineTo(0, 52); ctx.stroke();
        ctx.restore();
    }

    // --- HẠT ---
    for (let p of particles) {
        if (!vis(p.x, p.y, 8)) continue;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life)); ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * (0.45 + 0.55 * p.life), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let p of particles) {
        if (!p.g || !vis(p.x, p.y, 12)) continue;
        ctx.globalAlpha = Math.max(0, p.life) * 0.3; ctx.fillStyle = p.c;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * 2.8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

    // --- VFX ---
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let v of vfxList) {
        if (v.type === 'muzzle') {
            let a = Math.min(1, v.life * 10), col = v.color || '255,230,120';
            let msc = v.k === 'SNIPER' ? 1.5 : (v.k === 'SHOTGUN' || v.k === 'GLAUNCHER') ? 1.35 : (v.k === 'SMG' || v.k === 'PISTOL' || v.k === 'FLAMETHROWER' || v.k === 'ACID_SPRAYER') ? 0.75 : 1;
            ctx.save(); ctx.translate(v.x, v.y); ctx.rotate(v.angle); ctx.scale(msc, msc); ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(${col},${0.5 * a})`; ctx.beginPath(); ctx.arc(4, 0, 13, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(24, 0); ctx.lineTo(0, 6); ctx.fill();
            ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.moveTo(0, -2.5); ctx.lineTo(13, 0); ctx.lineTo(0, 2.5); ctx.fill();
            ctx.restore();
        }
        else if (v.type === 'scratch') { ctx.strokeStyle = `rgba(231,76,60,${Math.min(1, v.life * 5)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(v.x - 10, v.y - 10); ctx.lineTo(v.x + 10, v.y + 10); ctx.stroke(); ctx.beginPath(); ctx.moveTo(v.x - 10, v.y + 10); ctx.lineTo(v.x + 10, v.y - 10); ctx.stroke(); }
        else if (v.type === 'text') { ctx.globalAlpha = Math.min(1, v.life * 3); outlinedText(v.text, v.x, v.y, v.color, 'bold 16px Arial', 4); ctx.globalAlpha = 1; }
        else if (v.type === 'dmg') {
            let k = v.life / v.max, size = (v.crit === 2 ? 22 : (v.crit === 1 ? 18 : 13)) * (k > 0.8 ? 1 + (k - 0.8) * 2.5 : 1);
            ctx.globalAlpha = Math.min(1, k * 2.2);
            outlinedText(v.text, v.x, v.y, v.crit === 2 ? '#ff3f34' : (v.crit === 1 ? '#feca57' : '#ffffff'), `bold ${Math.round(size)}px Arial`, 3);
            ctx.globalAlpha = 1;
        }
        else if (v.type === 'laser_beam') {
            ctx.lineCap = 'round';
            if (v.jag) {
                // Tia sét giật: đường gãy khúc ngẫu nhiên
                let dx = v.tx - v.x, dy = v.ty - v.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
                let segs = Math.max(2, Math.min(8, Math.floor(len / 40)));
                ctx.beginPath(); ctx.moveTo(v.x, v.y);
                for (let s = 1; s < segs; s++) { let f = s / segs, off = (Math.random() - 0.5) * 22; ctx.lineTo(v.x + dx * f + nx * off, v.y + dy * f + ny * off); }
                ctx.lineTo(v.tx, v.ty);
                ctx.strokeStyle = `rgba(0, 210, 211, ${Math.min(1, v.life * 5)})`; ctx.lineWidth = 5; ctx.stroke();
                ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, v.life * 7)})`; ctx.lineWidth = 2; ctx.stroke();
            } else {
                ctx.strokeStyle = `rgba(155, 89, 182, ${Math.min(1, v.life * 2.5)})`; ctx.lineWidth = 6;
                ctx.beginPath(); ctx.moveTo(v.x, v.y); ctx.lineTo(v.tx, v.ty); ctx.stroke();
                ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, v.life * 3)})`; ctx.lineWidth = 2; ctx.stroke();
            }
            ctx.lineCap = 'butt';
        }
        else if (v.type === 'sweep') drawSweep(v);
        else if (v.type === 'ring') {
            let k = Math.max(0, v.life / v.max), r = v.r * (1 - k * k);
            ctx.globalAlpha = k; ctx.strokeStyle = v.color; ctx.lineWidth = (v.w || 4) * (0.4 + k);
            ctx.beginPath(); ctx.arc(v.x, v.y, Math.max(1, r), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        }
        else if (v.type === 'flash') {
            let k = Math.max(0, v.life / v.max);
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = `rgba(${v.color || '255,200,120'},${0.55 * k})`; ctx.beginPath(); ctx.arc(v.x, v.y, v.r * (1.1 - 0.4 * k), 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = `rgba(255,255,255,${0.6 * k})`; ctx.beginPath(); ctx.arc(v.x, v.y, v.r * 0.4 * k, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
        }
        else if (v.type === 'bolt') {
            // Sét đánh từ trên trời xuống
            let k = Math.max(0, v.life / v.max);
            ctx.beginPath(); let bx = v.x + 60, by = v.y - 900; ctx.moveTo(bx, by);
            for (let s = 1; s <= 9; s++) { let f = s / 9; ctx.lineTo(v.x + 60 * (1 - f) + Math.sin(v.seed + s * 12.9898) * 34 * (1 - f * 0.6), v.y - 900 * (1 - f)); }
            ctx.strokeStyle = `rgba(120, 220, 255, ${0.8 * k})`; ctx.lineWidth = 10; ctx.stroke();
            ctx.strokeStyle = `rgba(255, 255, 255, ${k})`; ctx.lineWidth = 3; ctx.stroke();
        }
    }
    ctx.restore();

    // ================== LỚP PHỦ MÀN HÌNH ==================
    // Bóng tối: vẽ lên canvas phụ rồi mới phủ lên (không còn xoá mất cảnh game)
    let isDark = currentMapType === 7 || currentMapType === 9 || currentMapType === 10 || currentMapType === 11 || currentMapType === 14 || currentWeather === 11;
    if (isDark) {
        if (lightCanvas.width !== W || lightCanvas.height !== H) { lightCanvas.width = W; lightCanvas.height = H; }
        let darkness = currentMapType === 10 ? 0.9 : (currentMapType === 14 ? mineDarkness() : (currentMapType === 11 ? 0.8 : 0.74));
        darkness = Math.min(0.97, darkness + darknessFlash * 0.25);
        let lightRadius = (170 + Math.max(0, darknessBattery) * 1.4) / 0.9;
        let coneLength = (currentMapType === 10 ? 420 : 360) / 0.9;
        let coneWidth = currentMapType === 10 ? 0.72 : 0.58;

        lightCtx.setTransform(1, 0, 0, 1, 0, 0);
        lightCtx.globalCompositeOperation = 'source-over';
        lightCtx.clearRect(0, 0, W, H);
        lightCtx.fillStyle = `rgba(0, 0, 0, ${darkness})`; lightCtx.fillRect(0, 0, W, H);
        lightCtx.globalCompositeOperation = 'destination-out';
        const hole = (wx, wy, r, strength) => {
            let hx = (wx - midX) * zoom + W / 2 + sx, hy = (wy - midY) * zoom + H / 2 + sy, rr = r * zoom;
            if (hx + rr < 0 || hx - rr > W || hy + rr < 0 || hy - rr > H) return;
            let g = lightCtx.createRadialGradient(hx, hy, rr * 0.12, hx, hy, rr);
            g.addColorStop(0, `rgba(255,255,255,${strength})`); g.addColorStop(0.55, `rgba(255,255,255,${strength * 0.58})`); g.addColorStop(1, 'rgba(255,255,255,0)');
            lightCtx.fillStyle = g; lightCtx.beginPath(); lightCtx.arc(hx, hy, rr, 0, Math.PI * 2); lightCtx.fill();
        };
        const cone = (wx, wy, facing) => {
            let hx = (wx - midX) * zoom + W / 2 + sx, hy = (wy - midY) * zoom + H / 2 + sy, cl = coneLength * zoom;
            lightCtx.save(); lightCtx.translate(hx, hy); lightCtx.rotate(facing);
            let cg = lightCtx.createLinearGradient(0, 0, cl, 0);
            cg.addColorStop(0, 'rgba(255,255,255,0.85)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
            lightCtx.fillStyle = cg; lightCtx.beginPath(); lightCtx.moveTo(0, 0); lightCtx.lineTo(cl, -cl * coneWidth); lightCtx.lineTo(cl, cl * coneWidth); lightCtx.closePath(); lightCtx.fill();
            lightCtx.restore();
        };
        if (tank.active) { hole(tank.x, tank.y, lightRadius, 0.95); cone(tank.x, tank.y, tank.turretAngle || 0); }
        else for (let p of players) {
            if (p.isDowned) { hole(p.x, p.y, 90, 0.5); continue; }
            hole(p.x, p.y, lightRadius, 0.95);
            cone(p.x, p.y, Math.atan2(p.facingY || 0, p.facingX || 1));
        }
        for (let f of lightFlowers) hole(f.x, f.y, 55 + f.charge * 0.9, 0.55);
        for (let i = 0; i < fireZones.length && i < 24; i++) hole(fireZones[i].x, fireZones[i].y, fireZones[i].radius + 70, 0.5);
        for (let v of vfxList) { if (v.type === 'flash') hole(v.x, v.y, v.r * 1.5, 0.8 * (v.life / v.max)); else if (v.type === 'muzzle') hole(v.x, v.y, 120, 0.45); else if (v.type === 'bolt') hole(v.x, v.y, 320, 0.7); }
        for (let t of towers) if (t.active) hole(t.x, t.y, 190, 0.4);
        if (evacZone) hole(evacZone.x, evacZone.y, 240, 0.45);
        if (heliSupport.active) hole(heliSupport.x, heliSupport.y, 300, 0.5);
        if (isCaveMap()) { if (hangZRun.stairs) hole(hangZRun.stairs.x, hangZRun.stairs.y, 130, 0.5); caveLights(hole); }
        ctx.drawImage(lightCanvas, 0, 0);
    }

    // Thời tiết
    if (isRainyWeather()) drawRain(T, midX, midY, zoom);
    if (currentWeather === 9) { // Bão tuyết
        ctx.fillStyle = 'rgba(223, 249, 251, 0.14)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        for (let i = 0; i < 90; i++) {
            let fx = ((i * 97.3 + T * (40 + (i % 5) * 22)) % (W + 40)) - 20;
            let fy = ((i * 53.7 + T * (70 + (i % 7) * 18)) % (H + 40)) - 20;
            ctx.beginPath(); ctx.arc(W - fx + Math.sin(T * 2 + i) * 8, fy, 1.2 + (i % 3), 0, Math.PI * 2); ctx.fill();
        }
    }
    if (currentWeather === 3) { // Gió mạnh
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 2; ctx.beginPath();
        for (let i = 0; i < 16; i++) { let wx = ((i * 211 + T * 900) % (W + 300)) - 150, wy = (i * 137.5) % H; ctx.moveTo(wx, wy); ctx.lineTo(wx + 90 + (i % 4) * 30, wy); }
        ctx.stroke();
    }
    if (currentWeather === 7) { ctx.fillStyle = `rgba(255, 159, 67, ${0.08 + 0.02 * Math.sin(T * 2)})`; ctx.fillRect(0, 0, W, H); } // Nắng nóng
    if (currentWeather === 5) { ctx.fillStyle = 'rgba(45, 52, 54, 0.14)'; ctx.fillRect(0, 0, W, H); } // Nhiều mây
    if (currentWeather === 6) { // Sương mù
        ctx.fillStyle = 'rgba(200, 214, 229, 0.36)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(223, 230, 233, 0.10)';
        for (let i = 0; i < 5; i++) { let fx = ((i * 331 + T * (14 + i * 5)) % (W + 600)) - 300; ctx.beginPath(); ctx.ellipse(fx, H * (0.18 + i * 0.17), 300, 70, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    if (empStorm.active) { // Bão điện từ: nhiễu sọc ngang
        ctx.fillStyle = 'rgba(72, 219, 251, 0.07)'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(72, 219, 251, 0.16)';
        for (let i = 0; i < 6; i++) ctx.fillRect(0, Math.random() * H, W, 1 + Math.random() * 3);
    }
    if (flashAlpha > 0) { ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.8, flashAlpha)})`; ctx.fillRect(0, 0, W, H); }

    // Viền tối + cảnh báo máu thấp / trúng đòn
    let vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.38, W / 2, H / 2, Math.max(W, H) * 0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    if (lp && solo) {
        let low = (!lp.isDowned && lp.hp < lp.maxHp * 0.3) ? (0.18 + 0.12 * Math.sin(T * 6)) : 0;
        let hurt = Math.max(0, lp.hurtFlash || 0) * 1.2;
        let ra = Math.min(0.55, low + hurt);
        if (ra > 0.01) {
            let rg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
            rg.addColorStop(0, 'rgba(231,76,60,0)'); rg.addColorStop(1, `rgba(231,76,60,${ra})`);
            ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
        }
    }

    // ================== GIAO DIỆN ==================
    function drawPointer(worldX, worldY, color) {
        let dx = worldX - midX; let dy = worldY - midY; let dist = Math.hypot(dx, dy); let maxVisibleDist = Math.max(W, H) / zoom / 2;
        if (dist > maxVisibleDist * 0.8) {
            let ang = Math.atan2(dy, dx); let r = Math.min(W, H) / 2 - 40;
            ctx.save(); ctx.translate(W / 2 + Math.cos(ang) * r, H / 2 + Math.sin(ang) * r); ctx.rotate(ang); ctx.fillStyle = color;
            ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-10, -15); ctx.lineTo(-5, 0); ctx.lineTo(-10, 15); ctx.fill();
            ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        }
    }

    if (objState === 'TOWERS') { for (let t of towers) { if (!t.active) drawPointer(t.x, t.y, '#f1c40f'); } }
    else if (objState === 'COLLECT' || objState === 'POWER_LOCKS') { for (let item of missionItems) { if (!item.taken) drawPointer(item.x, item.y, '#00d2d3'); } }
    else if (objState === 'BOSS') { let boss = zombies.find(z => z.type === 30); if (boss) drawPointer(boss.x, boss.y, '#ff9f43'); }
    else if (objState === 'POWER_BOSS') { let boss = zombies.find(z => z.type === 31); if (boss) drawPointer(boss.x, boss.y, '#00d2d3'); }
    else if (objState === 'CITY_BOSS') { let boss = zombies.find(z => z.type === 32); if (boss) drawPointer(boss.x, boss.y, '#ff4757'); }
    else if (objState === 'ROOFTOP' && evacZone) { drawPointer(evacZone.x, evacZone.y, '#00d2d3'); }
    else if ((objState === 'WAITING' || objState === 'EVAC') && evacZone) { drawPointer(evacZone.x, evacZone.y, objState === 'WAITING' ? '#f1c40f' : '#3498db'); }
    else if (isCaveMap()) cavePointers(drawPointer);
    else if (objState === 'POWER_CHARGE') {
        for (let item of missionItems) if (!item.taken) drawPointer(item.x, item.y, '#f1c40f');
        for (let t of towers) if (!t.active) drawPointer(t.x, t.y, '#00d2d3');
    }
    else if (objState === 'RESCUE') { for (let n of rescueNPCs) if (n.hp > 0 && !n.rescued) drawPointer(n.x, n.y, '#2ecc71'); }
    if (hasTeamPerk('p_tinHieu')) {
        for (let m of airdropMarkers) drawPointer(m.x, m.y, '#e74c3c');
        for (let d of drops) if (d.type === 'SUPERBOX') drawPointer(d.x, d.y, '#2ecc71');
    }
    // Mũi tên chỉ đồng đội (online)
    if (NET.mode && players.length > 1 && !tank.active) { let mate = players[1 - NET.localIdx]; if (mate) drawPointer(mate.x, mate.y, mate.isDowned ? '#ff7675' : mate.color); }

    drawHud(T);

    // Phím ảo
    if (!solo) {
        drawVirtualControls(UI.p1Stick, UI.p1BtnA, UI.p1BtnB, UI.p1BtnC, UI.p1BtnD, false);
        drawVirtualControls(UI.p2Stick, UI.p2BtnA, UI.p2BtnB, UI.p2BtnC, UI.p2BtnD, true);
    } else if (showTouchUI) {
        drawVirtualControls(UI.p1Stick, UI.p1BtnA, UI.p1BtnB, UI.p1BtnC, UI.p1BtnD, false);
    }
}

function drawHud(T) {
    const solo = soloControls();
    const p = localPlayer();
    const small = W < 640;
    ctx.textBaseline = 'middle';
    let bannerY = 14;

    if (solo && p) {
        let x = 10, y = 10, w = Math.min(236, W * 0.5), h = 74;
        ctx.fillStyle = 'rgba(8,12,18,0.62)'; ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = 'rgba(148,163,184,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Arial';
        ctx.fillText(`MAP ${currentLevel} · ${getMapName()}`, x + 8, y + 12);
        const bar = (bx, by, bw, bh, pct, col) => { ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, bh); ctx.fillStyle = col; ctx.fillRect(bx, by, bw * Math.max(0, Math.min(1, pct)), bh); };
        let lowHp = p.hp < p.maxHp * 0.3;
        bar(x + 8, y + 22, w - 16, 13, p.hp / p.maxHp, lowHp ? (Math.floor(T * 6) % 2 ? '#ff4757' : '#c0392b') : '#e74c3c');
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
        ctx.fillText(p.isDowned ? 'GỤC NGÃ' : `${Math.max(0, Math.ceil(p.hp))} / ${Math.round(p.maxHp)}`, x + w / 2, y + 29);
        bar(x + 8, y + 38, w - 16, 5, p.hunger / 100, '#f39c12');
        bar(x + 8, y + 46, w - 16, 5, p.xp / getXpRequired(p.level), '#f1c40f');
        ctx.textAlign = 'left'; ctx.font = 'bold 11px Arial';
        ctx.fillStyle = '#f1c40f'; ctx.fillText(`Lv ${p.level}`, x + 8, y + 63);
        ctx.fillStyle = '#cbd5e1'; ctx.fillText(`⚙ ${shopScrap}  ◆ ${breakthroughShards}  ☠ ${killCount}`, x + 50, y + 63);
        if (p.pendingUpgrades > 0) { ctx.textAlign = 'right'; ctx.fillStyle = '#2ecc71'; ctx.fillText(`+${p.pendingUpgrades} thẻ`, x + w - 8, y + 63); }

        if (NET.mode && players.length > 1) {
            let mate = players[1 - NET.localIdx];
            ctx.fillStyle = 'rgba(8,12,18,0.62)'; ctx.fillRect(x, y + h + 4, w, 20);
            ctx.textAlign = 'left'; ctx.fillStyle = mate.color; ctx.font = 'bold 10px Arial';
            ctx.fillText(NET.localIdx === 0 ? 'P2' : 'P1', x + 8, y + h + 14);
            bar(x + 28, y + h + 10, w - 96, 8, mate.isDowned ? 0 : mate.hp / mate.maxHp, '#2ecc71');
            ctx.textAlign = 'right'; ctx.fillStyle = '#94a3b8'; ctx.fillText(`${NET.ping | 0} ms`, x + w - 8, y + h + 14);
            if (mate.isDowned) { ctx.textAlign = 'center'; ctx.fillStyle = '#ff7675'; ctx.fillText('GỤC!', x + 28 + (w - 96) / 2, y + h + 14); }
        }
        if (small) bannerY = y + h + (NET.mode ? 32 : 8);
        drawMinimap(small ? 84 : 128);
    } else if (!solo) {
        // 2 người chung máy: thanh XP dọc ở 2 mép
        if (players[0].xpShowTimer > 0) {
            ctx.save(); ctx.globalAlpha = Math.min(1.0, players[0].xpShowTimer);
            let barH = H * 0.4; let barY = H / 2 + (H * 0.05); let pct = Math.min(1, players[0].xp / getXpRequired(players[0].level));
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(10, barY, 6, barH);
            ctx.fillStyle = '#f1c40f'; ctx.fillRect(10, barY + barH * (1 - pct), 6, barH * pct);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(10, barY, 6, barH);
            ctx.restore();
        }
        if (players[1] && players[1].xpShowTimer > 0) {
            ctx.save(); ctx.globalAlpha = Math.min(1.0, players[1].xpShowTimer);
            let barH = H * 0.4; let barY = H * 0.05; let pct = Math.min(1, players[1].xp / getXpRequired(players[1].level));
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(W - 16, barY, 6, barH);
            ctx.fillStyle = '#f1c40f'; ctx.fillRect(W - 16, barY + barH * (1 - pct), 6, barH * pct);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(W - 16, barY, 6, barH);
            ctx.restore();
        }
        bannerY = H / 2 - 16;
    }

    // 2 người chung máy: băng nhiệm vụ, thanh máu Boss và bộ đàm xoay DỌC ở giữa mép trái
    // (hai người ngồi đối diện đều đọc được, không đè lên vùng chơi hay cụm phím ảo ở 4 góc)
    const side = !solo;
    const BW = side ? H * 0.5 : W;   // bề dài tối đa dành cho băng thông báo
    if (side) { ctx.save(); ctx.translate(26, H / 2); ctx.rotate(-Math.PI / 2); ctx.translate(-W / 2, 0); bannerY = 0; }

    // Băng nhiệm vụ
    let obj = getObjectiveText();
    if (obj) {
        ctx.font = `bold ${small || side ? 14 : 17}px Arial`; ctx.textAlign = 'center';
        let tw = Math.min(BW, ctx.measureText(obj[0]).width + 28), bh = small || side ? 26 : 32;
        let blink = (objState === 'EVAC' || objState === 'ROOFTOP') && Math.floor(T * 4) % 2 === 0;
        ctx.fillStyle = blink ? 'rgba(20,60,40,0.8)' : 'rgba(0,0,0,0.62)'; ctx.fillRect(W / 2 - tw / 2, bannerY, tw, bh);
        ctx.strokeStyle = obj[1]; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - tw / 2 + 0.5, bannerY + 0.5, tw, bh); ctx.globalAlpha = 1;
        ctx.fillStyle = obj[1]; ctx.fillText(obj[0], W / 2, bannerY + bh / 2 + 1, tw - 12);
        bannerY += bh + 6;
    }

    // Thanh máu Boss
    let boss = zombies.find(z => z.type === 50) || zombies.find(z => (z.type >= 30 && z.type <= 32) || z.type === 45);
    if (boss) {
        let bw = Math.min(420, BW * (side ? 1 : 0.6));
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(W / 2 - bw / 2, bannerY, bw, 12);
        ctx.fillStyle = boss.color; ctx.fillRect(W / 2 - bw / 2, bannerY, bw * Math.max(0, Math.min(1, boss.hp / boss.maxHp)), 12);
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - bw / 2 + 0.5, bannerY + 0.5, bw, 12);
        ctx.textAlign = 'center'; outlinedText(BOSS_NAMES[boss.type] || 'BOSS', W / 2, bannerY + 24, boss.color, 'bold 12px Arial');
        bannerY += 38;
    }

    // Bộ đàm
    if (radioDialogs.length > 0) {
        let r = radioDialogs[0];
        let bw = Math.min(560, BW - (side ? 0 : 24));
        ctx.globalAlpha = Math.min(1, r.life * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(W / 2 - bw / 2, bannerY, bw, 30);
        ctx.strokeStyle = '#00d2d3'; ctx.lineWidth = 1; ctx.strokeRect(W / 2 - bw / 2 + 0.5, bannerY + 0.5, bw, 30);
        ctx.fillStyle = '#dff9fb'; ctx.font = `bold ${small ? 10 : 13}px Arial`; ctx.textAlign = 'center';
        ctx.fillText('📻 ' + r.text, W / 2, bannerY + 16, bw - 16);
        ctx.globalAlpha = 1;
    }
    if (side) ctx.restore();

    // Thẻ giới thiệu map đầu màn
    if (mapIntro.timer > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, mapIntro.timer);
        let cw = Math.min(460, W - 24), cy = H * 0.26;
        ctx.fillStyle = 'rgba(8, 12, 16, 0.78)'; ctx.fillRect(W / 2 - cw / 2, cy, cw, 96);
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(W / 2 - cw / 2, cy, cw, 3);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#94a3b8'; ctx.font = 'bold 13px Arial'; ctx.fillText(`MAP ${currentLevel}`, W / 2, cy + 20);
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 26px Arial'; ctx.fillText(mapIntro.map, W / 2, cy + 46, cw - 20);
        ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 14px Arial'; ctx.fillText(mapIntro.mission + '  |  ' + mapIntro.weather, W / 2, cy + 76, cw - 20);
        ctx.restore();
    }

    drawDeadWarning(T);
    if (NET.mode === 'guest' && performance.now() - NET.lastRecv > 2500) {
        ctx.textAlign = 'center'; outlinedText('📡 Đang mất tín hiệu từ chủ phòng...', W / 2, H - 30, '#ff7675', 'bold 14px Arial');
    }
}

function drawMinimap(S) {
    let mx = W - S - 10, my = 10, sc = S / MAP_SIZE.w;
    let dark = currentMapType === 7 || currentMapType === 9 || currentMapType === 10 || currentMapType === 11 || currentMapType === 14 || currentWeather === 11;
    ctx.fillStyle = 'rgba(8,12,18,0.62)'; ctx.fillRect(mx, my, S, S);
    ctx.strokeStyle = 'rgba(148,163,184,0.3)'; ctx.lineWidth = 1; ctx.strokeRect(mx + 0.5, my + 0.5, S, S);
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.fillRect(mx + x * sc - r, my + y * sc - r, r * 2, r * 2); };
    if (!dark) { let n = 0; for (let z of zombies) { if (z.hidden) continue; if (isBossType(z.type)) continue; dot(z.x, z.y, 1, 'rgba(231,76,60,0.75)'); if (++n > 160) break; } }
    for (let z of zombies) if (isBossType(z.type)) dot(z.x, z.y, 3, '#ff9f43');
    for (let t of towers) dot(t.x, t.y, 2.5, t.active ? '#2ecc71' : '#f1c40f');
    for (let it of missionItems) if (!it.taken) dot(it.x, it.y, 1.5, it.kind === 'battery' ? '#f1c40f' : '#00d2d3');
    for (let n of rescueNPCs) if (n.hp > 0) dot(n.x, n.y, 2, n.rescued ? '#2ecc71' : '#f8c291');
    for (let op of outposts) if (!op.dead) dot(op.x + op.w / 2, op.y + op.h / 2, 3, '#c0392b');
    if (hangZRun.stairs && isCaveMap()) dot(hangZRun.stairs.x, hangZRun.stairs.y, 3, '#ecf0f1');
    if (isCaveMap()) for (let cp of caveProps) if (cp.kind === 'nest' || cp.kind === 'core' || (cp.kind === 'c4' && cp.state < 2)) dot(cp.x, cp.y, 2.5, cp.kind === 'c4' ? '#f1c40f' : '#e67e22');
    if (evacZone) { ctx.strokeStyle = objState === 'EVAC' ? '#2ecc71' : '#f1c40f'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx + evacZone.x * sc, my + evacZone.y * sc, 5, 0, Math.PI * 2); ctx.stroke(); }
    if (hasTeamPerk('p_tinHieu')) for (let d of drops) if (d.type === 'SUPERBOX') dot(d.x, d.y, 2, '#f39c12');
    players.forEach((p, i) => {
        let px = tank.active ? tank.x : p.x, py = tank.active ? tank.y : p.y;
        ctx.beginPath(); ctx.arc(mx + px * sc, my + py * sc, 3.2, 0, Math.PI * 2); ctx.fillStyle = p.isDowned ? '#7f8c8d' : p.color; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
    });
}

function drawVirtualControls(stick, btnA, btnB, btnC, btnD, isTopPlayer) {
    ctx.beginPath(); ctx.arc(stick.baseX, stick.baseY, 40, 0, Math.PI * 2); ctx.fillStyle = 'rgba(236,240,241,0.05)'; ctx.fill(); ctx.strokeStyle = 'rgba(236,240,241,0.2)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(stick.active ? stick.cx : stick.baseX, stick.active ? stick.cy : stick.baseY, 20, 0, Math.PI * 2); ctx.fillStyle = 'rgba(236,240,241,0.4)'; ctx.fill();

    let drawBtn = (btn, radius, label, color) => {
        ctx.beginPath(); ctx.arc(btn.x, btn.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = btn.pressed ? color.replace('0.3', '0.6') : color;
        ctx.fill(); ctx.strokeStyle = 'rgba(236,240,241,0.3)'; ctx.lineWidth = 2; ctx.stroke();

        ctx.save(); ctx.translate(btn.x, btn.y);
        if (isTopPlayer) ctx.rotate(Math.PI);
        ctx.fillStyle = '#fff'; ctx.font = `bold ${radius * 0.8}px Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 0);
        ctx.restore();
    };

    drawBtn(btnA, 25, 'A', 'rgba(231,76,60,0.3)');
    drawBtn(btnB, 20, 'B', 'rgba(52,152,219,0.3)');
    drawBtn(btnC, 18, 'C', 'rgba(238,82,83,0.3)');
    drawBtn(btnD, 18, 'D', 'rgba(224,86,253,0.3)');
}
