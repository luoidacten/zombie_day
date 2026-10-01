// ======================================================================
// ONLINE CO-OP (WebRTC P2P qua PeerJS)
// Chủ phòng (host) chạy toàn bộ mô phỏng; Khách (guest) gửi input và hiển thị ảnh chụp trạng thái.
// ======================================================================
const NET_PREFIX = 'zsurv-coop-';
const NET_DROP_T = ['FOOD', 'MEDKIT', 'BLINDBOX', 'SUPERBOX', 'SHARD', 'HEAVYBOX'];
const NET_EB_T = ['acid', 'net', 'electric', 'rock', 'rocket', 'arrow', 'shotgun'];
const NET_HZ_T = ['electric', 'slow', 'magnet', 'rock', 'slam', 'artillery', 'strike', 'collapse', 'emp', 'cage', 'beam', 'mine', 'quake', 'rockfall', 'acidbomb', 'quad', 'd_arc', 'd_scythe', 'd_moon'];
const NET_OB_T = ['wall', 'tree', 'rock', 'power', 'ruin', 'cave', 'plant_wall', 'building', 'rubble', 'rockwall'];
const NET_ALLY_T = ['rifleman', 'medic', 'vanguard'];
const NET_STATUS = ['burn', 'electric', 'overload', 'corrosion', 'fear'];
const NET_PHASE2 = { 30: '#e17055', 31: '#ff6b35', 32: '#c0392b' };
let toastTimer = null;

function netToast(msg, ms = 3500) {
    let el = document.getElementById('toast');
    el.textContent = msg; el.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = 'none'; }, ms);
}
function netSetStatus(msg) { document.getElementById('netStatus').textContent = msg; }

function netLoadLib() {
    return new Promise((resolve, reject) => {
        if (window.Peer) return resolve();
        let s = document.createElement('script');
        s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
        s.onload = () => window.Peer ? resolve() : reject(new Error('PeerJS'));
        s.onerror = () => reject(new Error('PeerJS'));
        document.head.appendChild(s);
    });
}

function netLobbyReset() {
    document.getElementById('netLobbyMain').style.display = 'block';
    document.getElementById('netRoomBox').style.display = 'none';
    document.getElementById('netStartBtn').style.display = 'none';
    document.getElementById('netStartBtn').disabled = true;
    netSetStatus('');
}
function netOpenLobby() {
    Sound.resume();
    netTeardown();
    netLobbyReset();
    document.getElementById('onlineModal').style.display = 'flex';
}
function netCloseLobby() {
    document.getElementById('onlineModal').style.display = 'none';
    if (!NET.mode) netTeardown();
}
function netCopyCode() {
    let code = document.getElementById('netRoomCode').textContent.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => netToast('Đã sao chép mã phòng: ' + code, 1500), () => { });
}

function netTeardown() {
    let c = NET.conn, p = NET.peer;
    NET.conn = null; NET.peer = null; NET.mode = null; NET.localIdx = 0; NET.role = null;
    NET.ev = []; NET.remote = { ptr: false, ang: 0 };
    try { if (c) c.close(); } catch (e) { }
    try { if (p) p.destroy(); } catch (e) { }
    UI.p2Stick.active = false; UI.p2Stick.dx = 0; UI.p2Stick.dy = 0;
    for (let n of ['A', 'B', 'C', 'D']) { let b = UI['p2Btn' + n]; b.pressed = false; b.justPressed = false; b.justReleased = false; }
}

function netSend(obj) {
    let c = NET.conn;
    if (!c || !c.open) return false;
    try { c.send(obj); return true; } catch (e) { return false; }
}

function netPeerError(err) {
    let type = err && err.type;
    if (type === 'peer-unavailable') netSetStatus('❌ Không tìm thấy phòng. Kiểm tra lại mã.');
    else if (type === 'unavailable-id') netSetStatus('Mã phòng bị trùng, hãy bấm TẠO PHÒNG lại.');
    else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') netSetStatus('❌ Lỗi mạng: không kết nối được máy chủ ghép phòng.');
    else if (type === 'browser-incompatible') netSetStatus('❌ Trình duyệt không hỗ trợ WebRTC.');
    else netSetStatus('❌ Lỗi kết nối' + (type ? ' (' + type + ')' : '') + '.');
    if (!NET.mode) { let p = NET.peer; NET.peer = null; NET.conn = null; try { if (p) p.destroy(); } catch (e) { } netLobbyResetKeepStatus(); }
}
function netLobbyResetKeepStatus() {
    let msg = document.getElementById('netStatus').textContent;
    netLobbyReset(); netSetStatus(msg);
}

// ---------------- CHỦ PHÒNG ----------------
async function netHost() {
    Sound.resume();
    netTeardown();
    netSetStatus('Đang tạo phòng...');
    document.getElementById('netLobbyMain').style.display = 'none';
    try { await netLoadLib(); } catch (e) { netLobbyReset(); netSetStatus('❌ Không tải được thư viện mạng (cần Internet).'); return; }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = ''; for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    let peer = new Peer(NET_PREFIX + code, { debug: 0 });
    NET.peer = peer; NET.role = 'host';

    peer.on('open', () => {
        if (NET.peer !== peer) return;
        document.getElementById('netRoomCode').textContent = code;
        document.getElementById('netRoomBox').style.display = 'block';
        document.getElementById('netStartBtn').style.display = 'block';
        netSetStatus('Gửi mã cho bạn của bạn. Đang chờ người chơi 2...');
    });
    peer.on('connection', (c) => {
        if (NET.peer !== peer) return;
        if (NET.conn) { c.on('open', () => { try { c.send({ t: 'full' }); } catch (e) { } setTimeout(() => { try { c.close(); } catch (e) { } }, 400); }); return; }
        NET.conn = c;
        c.on('open', () => {
            if (NET.conn !== c) return;
            netSetStatus('✅ Người chơi 2 đã vào phòng! Bấm BẮT ĐẦU TRẬN.');
            document.getElementById('netStartBtn').disabled = false;
            Sound.play('level');
        });
        c.on('data', (d) => { if (NET.conn === c) netOnData(d); });
        c.on('close', () => { if (NET.conn === c) netOnPeerLost(); });
        c.on('error', () => { if (NET.conn === c) netOnPeerLost(); });
    });
    peer.on('disconnected', () => { try { if (NET.peer === peer && !peer.destroyed) peer.reconnect(); } catch (e) { } });
    peer.on('error', (err) => { if (NET.peer === peer) netPeerError(err); });
}

function netStartGame() {
    if (NET.role !== 'host' || !NET.conn || !NET.conn.open) return;
    NET.mode = 'host'; NET.localIdx = 0; NET.seq = 0; NET.ev = []; NET.sendAcc = 0; NET.slowAcc = 0;
    NET.remote = { ptr: false, ang: 0 };
    document.getElementById('onlineModal').style.display = 'none';
    netSend({ t: 'start' });
    beginRun('online');
}

// Khách rời phòng giữa trận: chủ phòng chơi tiếp một mình
function netOnPeerLost() {
    let wasHost = NET.mode === 'host';
    if (NET.mode === 'guest' || NET.role === 'guest') {
        let inGame = NET.mode === 'guest';
        netTeardown();
        if (inGame) {
            gameState = 'MENU';
            document.getElementById('upgradeScreen').style.display = 'none';
            document.getElementById('netWait').style.display = 'none';
            document.getElementById('menu').style.display = 'flex';
            Sound.music('theme');
            netToast('Mất kết nối với chủ phòng.');
        } else { netLobbyReset(); netSetStatus('❌ Mất kết nối với chủ phòng.'); }
        return;
    }
    if (wasHost && gameState === 'GAMEOVER') { netTeardown(); return; } // trận đã kết thúc: đóng kết nối trong im lặng
    if (!wasHost) {
        // Đang ở sảnh: chờ người khác vào lại
        NET.conn = null;
        document.getElementById('netStartBtn').disabled = true;
        netSetStatus('Người chơi 2 đã rời phòng. Đang chờ người chơi khác...');
        return;
    }
    netTeardown();
    netToast('Người chơi 2 đã rời trận. Bạn tiếp tục chơi một mình.');
    if (players.length > 1 && (gameState === 'PLAYING' || gameState === 'UPGRADE' || gameState === 'SHOP')) {
        let p1 = players[0];
        players.length = 1;
        isSinglePlayer = true;
        drones = drones.filter(d => d.owner === 1);
        slashes = slashes.filter(s => s.source === p1);
        for (let a of allies) if (a.owner !== p1) a.owner = p1;
        initControls();
        if (gameState === 'UPGRADE') {
            document.getElementById('p2Half').style.display = 'none';
            p2Confirmed = true;
            if (p1Confirmed) checkAndTriggerUpgrade();
        }
    }
}

function netHostGameOver() {
    netSend({ t: 'over', lvl: currentLevel, time: Math.floor(survivalTime), kills: killCount });
    setTimeout(netTeardown, 600);
}

// ---------------- KHÁCH ----------------
async function netJoin() {
    Sound.resume();
    let code = (document.getElementById('netCodeInput').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 5) { netSetStatus('Mã phòng gồm 5 ký tự.'); return; }
    netTeardown();
    netSetStatus('Đang kết nối...');
    document.getElementById('netLobbyMain').style.display = 'none';
    try { await netLoadLib(); } catch (e) { netLobbyReset(); netSetStatus('❌ Không tải được thư viện mạng (cần Internet).'); return; }

    let peer = new Peer(undefined, { debug: 0 });
    NET.peer = peer; NET.role = 'guest';
    let opened = false;
    peer.on('open', () => {
        if (NET.peer !== peer) return;
        let c = peer.connect(NET_PREFIX + code, { reliable: true, serialization: 'json' });
        NET.conn = c;
        c.on('open', () => { if (NET.conn !== c) return; opened = true; netSetStatus('✅ Đã vào phòng ' + code + '. Chờ chủ phòng bắt đầu...'); Sound.play('level'); });
        c.on('data', (d) => { if (NET.conn === c) netOnData(d); });
        c.on('close', () => { if (NET.conn === c) netOnPeerLost(); });
        c.on('error', () => { if (NET.conn === c) netOnPeerLost(); });
        setTimeout(() => {
            if (NET.peer === peer && !opened) { netTeardown(); netLobbyReset(); netSetStatus('❌ Không kết nối được tới phòng (hết thời gian chờ). Hai máy có thể đang bị tường lửa/NAT chặn.'); }
        }, 15000);
    });
    peer.on('error', (err) => { if (NET.peer === peer) netPeerError(err); });
}

function netGuestStart() {
    NET.mode = 'guest'; NET.localIdx = 1; NET.lastSeq = 0; NET.zmap = new Map(); NET.inputAcc = 0; NET.lastRecv = performance.now(); NET.sig = {};
    Sound.startAmbience(); Sound.play('start');
    clearPcInputs();
    resetRunState();
    isSinglePlayer = false;
    players = [new Player(1, MAP_SIZE.w / 2, MAP_SIZE.h / 2 + 60, '#3498db'), new Player(2, MAP_SIZE.w / 2, MAP_SIZE.h / 2 - 60, '#e74c3c')];
    document.getElementById('onlineModal').style.display = 'none';
    document.getElementById('menu').style.display = 'none';
    document.getElementById('netWaitText').textContent = 'Đang tải bản đồ...';
    document.getElementById('netWait').style.display = 'flex';
    gameState = 'NETWAIT';
}

// ---------------- NHẬN DỮ LIỆU ----------------
function netOnData(d) {
    if (!d || typeof d !== 'object') return;
    NET.lastRecv = performance.now();
    if (NET.mode === 'host') {
        if (d.t === 'i') {
            const num = (v) => (typeof v === 'number' && isFinite(v)) ? v : 0;
            let st = UI.p2Stick;
            st.active = !!d.a; st.dx = Math.max(-1, Math.min(1, num(d.dx))); st.dy = Math.max(-1, Math.min(1, num(d.dy)));
            let b = Array.isArray(d.b) ? d.b : [];
            setButtonInput(UI.p2BtnA, !!b[0]); setButtonInput(UI.p2BtnB, !!b[1]); setButtonInput(UI.p2BtnC, !!b[2]); setButtonInput(UI.p2BtnD, !!b[3]);
            NET.remote.ptr = !!d.ptr; NET.remote.ang = num(d.ang);
            NET.lastPt = num(d.pt); NET.lastPtAt = performance.now();
        } else if (d.t === 'upg') {
            if (gameState !== 'UPGRADE' || p2Confirmed || typeof d.id !== 'string' || !players[1]) return;
            let upg = UPGRADES.find(u => u.id === d.id);
            if (!upg || !canOfferUpgrade(players[1], upg)) { netSendSync(true); return; }
            p2SelectedUpg = d.id;
            if (!confirmUpgrade(2)) netSendSync(true);
        } else if (d.t === 'pause') setPaused(!!d.on, true);
        return;
    }
    // --- phía khách ---
    if (d.t === 'full') { netTeardown(); netLobbyReset(); netSetStatus('❌ Phòng đã đủ 2 người.'); return; }
    if (d.t === 'start') { netGuestStart(); return; }
    if (NET.mode !== 'guest') return;
    if (d.t === 'pause') { setPaused(!!d.on, true); return; }
    if (d.t === 'map') netApplyMap(d);
    else if (d.t === 'sync') netApplySync(d);
    else if (d.t === 's') { if (gameState === 'PLAYING') netApplySnapshot(d); }
    else if (d.t === 'over') { killCount = d.kills | 0; showGameOver(d.lvl | 0, d.time | 0); netTeardown(); }
}

// ---------------- CHỦ PHÒNG: GỬI TRẠNG THÁI ----------------
function netSendMap() {
    const R = Math.round;
    netSend({
        t: 'map', lvl: currentLevel, mt: currentMapType, bg: bgMapColor, w: currentWeather,
        ob: obstacles.map(o => [Math.max(0, NET_OB_T.indexOf(o.type)), R(o.x), R(o.y), R(o.w), R(o.h)]),
        sz: slowZones.map(z => [R(z.x), R(z.y), R(z.w), R(z.h), z.type]),
        bu: bushes.map(b => [R(b.x), R(b.y), R(b.rx), R(b.ry), +(b.rot || 0).toFixed(2), b.alpha]),
        fl: lightFlowers.map(f => [R(f.x), R(f.y)]),
        co: powerCoils.map(c => [R(c.x), R(c.y), R(c.radius)]),
        intro: [mapIntro.map, mapIntro.mission, mapIntro.weather, mapIntro.timer]
    });
    NET.sig = {};
}

function netSendSync(reject = false) {
    if (NET.mode !== 'host') return;
    netSend({
        t: 'sync', gs: gameState, lvl: currentLevel, scrap: shopScrap, sh: breakthroughShards, ex: activeExclusiveTag,
        cpf: currentPowerFloorCleared, rej: reject ? 1 : 0, p2c: p2Confirmed ? 1 : 0,
        pl: players.map(p => ({ tags: p.tags, perks: p.perks, st: p.perkStacks, pend: p.pendingUpgrades, lvl: p.level }))
    });
}

function netEncodePlayer(p) {
    const R = Math.round;
    let flags = (p.isDowned ? 1 : 0) | (p.perks.invulnTimer > 0 ? 2 : 0) | (p.stunTimer > 0 ? 4 : 0);
    let st = [];
    if (p.status) for (let id in p.status) { let s = p.status[id]; if (s && s.timer > 0) st.push([NET_STATUS.indexOf(id), s.stacks || 1]); }
    return [R(p.x), R(p.y), +p.facingX.toFixed(2), +p.facingY.toFixed(2), +p.hp.toFixed(1), R(p.maxHp), R(p.hunger), flags,
    p.weapon ? p.weapon.key : 0, p.weapon ? p.weapon.ammo : 0, R((p.chargeTime || 0) * 100), p.pullingPin ? Math.max(1, p.pinTime - Date.now()) : 0,
    p.tempShield || 0, R(p.xp), p.level, R((p.reviveProgress || 0) * 100), p.reviveCount || 0, R(Math.max(0, p.skillC_CD || 0) * 10), p.dCharge || 0,
    p.perks.frenzyStacks || 0, p.perks.rainStacks || 0, st, R(p.curSpeed || 0), p.pendingUpgrades, R(Math.max(0, p.xpShowTimer || 0) * 10)];
}

function netBuildSnapshot(slow) {
    const R = Math.round;
    const g = players[1] || players[0];
    const gx = tank.active ? tank.x : g.x, gy = tank.active ? tank.y : g.y;
    const near = (x, y, m = 0) => Math.abs(x - gx) < 1500 + m && Math.abs(y - gy) < 1150 + m;
    let s = { t: 's', n: ++NET.seq, pt: NET.lastPt || 0, pd: NET.lastPtAt ? R(performance.now() - NET.lastPtAt) : 0 };

    s.g = [objState, R(evacTimer * 10), evacZone ? [R(evacZone.x), R(evacZone.y), R(evacZone.progress * 100)] : 0, R(fortressTimer), currentWeather,
        R(darknessBattery), R(flashAlpha * 100), R(cameraShake), shopScrap, breakthroughShards, killCount, powerCellsHeld, empStorm.active ? 1 : 0,
        R(darknessFlash * 100), thietXaUnlocked ? 1 : 0, R(tankExitTimer * 100)];
    s.m = [mission.type, mission.progress, mission.required];
    if (isCaveMap()) {
        // Hang Z / Hầm Mỏ: tầng, đồng hồ, tiến độ gài bom, lối ra, vật thể và đá chặn đường
        let st = hangZRun.stairs;
        s.cv = [hangZRun.floor, hangZRun.total, R(hangZRun.timer), R(caveRun.timer * 10), R(caveRun.plant * 100), mineRun.floor, st ? [R(st.x), R(st.y), st.radius] : 0];
        s.pr = caveProps.map(p => [CAVE_PROP_T.indexOf(p.kind), R(p.x), R(p.y), p.maxHp ? R(Math.max(0, p.hp) / p.maxHp * 100) : 100, p.kind === 'nest' ? (p.awake ? 1 : 0) : (p.kind === 'c4' ? p.state * 10 + p.idx : (p.moving ? 1 : 0))]);
        s.rb = [];
        for (let o of obstacles) if (o.type === 'rubble') s.rb.push([R(o.x), R(o.y), R(o.w), R(o.h), R(Math.max(0, o.hp) / o.maxHp * 100)]);
    }
    if (heliSupport.active) s.h = [R(heliSupport.x), R(heliSupport.y)];
    if (tank.active) s.tk = [R(tank.x), R(tank.y), +(tank.hullAngle || 0).toFixed(2), +(tank.turretAngle || 0).toFixed(2), R(tank.hp), R(tank.maxHp), tank.p2InvulnTimer > 0 ? 1 : 0, R(Math.max(0, tank.cSkillCD) * 10), R(Math.max(0, tank.dashCooldown || 0) * 10), tank.dashTimer > 0 ? 1 : 0];
    if (objState === 'DEFEND' && turretMode.active) s.tu = [R(turretMode.x), R(turretMode.y), R(turretMode.hp), R(turretMode.maxHp)];

    s.p = players.map(netEncodePlayer);

    s.z = [];
    for (let z of zombies) {
        if (z.hp <= 0) continue;
        if (!near(z.x, z.y) && !isBossType(z.type)) continue;
        let mask = 0;
        if (z.status) for (let id in z.status) { let i = NET_STATUS.indexOf(id); if (i >= 0 && z.status[id].timer > 0) mask |= (1 << i); }
        let beam = z.warnBeamTimer > 0; // vạch báo đòn: E.L, Witch, Crusher, Boomer, Điện Quang, Khổng Lồ
        let flags = (z.hidden ? 1 : 0) | (z.isFrenzied > 0 ? 2 : 0) | (beam ? 4 : 0) | (z.phase2Done ? 8 : 0) | (z.hitFlash > 0 ? 16 : 0) | ((z.flying || z.airborne) ? 32 : 0) | (z.downed ? 64 : 0) | (z.carry ? 128 : 0);
        let e = [z.nid, R(z.x), R(z.y), z.type, Math.max(1, R(z.hp / z.maxHp * 100)), flags, mask];
        if (beam) e.push(R(z.targetX), R(z.targetY));
        s.z.push(e);
    }

    s.b = [];
    for (let b of bullets) {
        if (!b.active || !near(b.x, b.y)) continue;
        let k = bulletKind(b);
        if (k === 10) continue;
        let e = [R(b.x), R(b.y), R(b.vx), R(b.vy), k];
        if (k === 4 || k === 5) e.push(R(Math.max(0, b.lifeTime / (b.maxLife || 1)) * 100));
        s.b.push(e);
        if (s.b.length > 140) break;
    }
    s.eb = [];
    for (let a of enemyBullets) if (a.active && near(a.x, a.y)) s.eb.push([R(a.x), R(a.y), R(a.vx), R(a.vy), NET_EB_T.indexOf(a.type)]);

    // Vật phẩm: chỉ gửi khi thay đổi
    let dsig = drops.length;
    for (let d of drops) dsig = (dsig * 31 + (d.x | 0) + (d.y | 0) * 7) | 0;
    if (dsig !== NET.sig.d || slow) { NET.sig.d = dsig; s.d = drops.map(d => [R(d.x), R(d.y), NET_DROP_T.indexOf(d.type)]); }

    s.tw = towers.map(t => [R(t.x), R(t.y), R(t.progress * 100), t.active ? 1 : 0, t.needsBattery ? 1 : 0]);
    s.mi = missionItems.map(i => [R(i.x), R(i.y), i.taken ? 1 : 0, i.kind === 'battery' ? 1 : 0]);
    s.fz = [];
    for (let f of fireZones) { if (near(f.x, f.y, f.radius)) s.fz.push([R(f.x), R(f.y), R(f.radius), R(f.life * 10), f.kind === 'acid' ? 1 : (f.kind === 'arrow' ? 2 : 0)]); if (s.fz.length > 70) break; }
    s.hzd = [];
    for (let h of hazards) {
        let e = [NET_HZ_T.indexOf(h.type), R(h.x || 0), R(h.y || 0), R(h.radius || 0), h.timer === undefined ? -1 : R(h.timer * 100), R(h.life * 100), h.friendly ? 1 : 0, R((h.t0 || h.timer || 0) * 100)];
        if (h.type === 'beam' || h.type === 'quad' || h.type === 'd_arc') e.push(+h.angle.toFixed(2));
        else if (h.type === 'cage') e.push(h.points.map(p => [R(p.x), R(p.y)]));
        s.hzd.push(e);
        if (s.hzd.length > 60) break;
    }
    s.dr = drones.map(d => [R(d.x), R(d.y), d.color]);
    s.al = [];
    for (let a of allies) if (a.hp > 0) s.al.push([R(a.x), R(a.y), NET_ALLY_T.indexOf(a.kind), R(a.hp / a.maxHp * 100), a.elite ? 1 : 0, +a.facingX.toFixed(2), +a.facingY.toFixed(2)]);
    s.np = rescueNPCs.map(n => [R(n.x), R(n.y), R(Math.max(0, n.hp) / n.maxHp * 100), n.rescued ? 1 : 0, R((n.rescueProgress || 0) * 10), n.isDoctor ? 1 : 0, n.state === 'plant' ? 1 : (n.state === 'wait' ? 2 : 0)]);
    s.op = [];
    for (let o of outposts) if (!o.dead) s.op.push([R(o.x), R(o.y), R(Math.max(0, o.hp) / o.maxHp * 100), R(Math.max(0, o.destroyTimer) * 10)]);
    s.th = thrownItems.map(t => [R(t.x), R(t.y), t.isGrenade ? Math.max(1, t.expTime - Date.now()) : 0, (t.wepData && t.wepData.color) || '#bdc3c7', R(t.vx), R(t.vy)]);
    s.am = airdropMarkers.map(m => [R(m.x), R(m.y), R(m.time * 100), R(m.maxTime * 100)]);
    if (powerCoils.length) { s.cp = []; powerCoils.forEach((c, i) => { if (c.pulse > 0) s.cp.push(i); }); }

    if (slow) {
        if (bushes.length) s.bs = bushes.map(b => b.burnedOut ? 2 : (b.burning ? 1 : 0)).join('');
        if (lightFlowers.length) s.fc = lightFlowers.map(f => R(f.charge));
    }

    // Sự kiện: hạt, chữ nổi, âm thanh, vết máu, nhát chém
    let ev = NET.ev.splice(0, 110); NET.ev.length = 0;
    let nv = 0;
    for (let v of vfxList) {
        if (v._s) continue;
        v._s = 1;
        if (nv < 45 && (v.x === undefined || near(v.x, v.y))) { ev.push(['v', v]); nv++; }
    }
    if (ev.length) s.e = ev;
    return s;
}

function netHostTick(dt) {
    if (NET.mode !== 'host' || !NET.conn || !NET.conn.open) return;
    NET.sendAcc += dt; NET.slowAcc += dt;
    if (NET.sendAcc < 1 / 15) return;
    NET.sendAcc = 0;
    let dc = NET.conn.dataChannel;
    if (dc && dc.bufferedAmount > 300000) return; // mạng nghẽn: bỏ bớt khung
    let slow = NET.slowAcc >= 1;
    if (slow) NET.slowAcc = 0;
    netSend(netBuildSnapshot(slow));
}

// ---------------- KHÁCH: ÁP DỤNG TRẠNG THÁI ----------------
function netApplyMap(m) {
    const num = (v, d = 0) => (typeof v === 'number' && isFinite(v)) ? v : d;
    currentLevel = num(m.lvl, 1); currentMapType = num(m.mt, 1); currentWeather = num(m.w, 1);
    bgMapColor = (typeof m.bg === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(m.bg)) ? m.bg : '#2c3e50';
    obstacles = (m.ob || []).map(o => {
        let ob = { type: NET_OB_T[o[0]] || 'wall', x: num(o[1]), y: num(o[2]), w: num(o[3]), h: num(o[4]) };
        if (ob.type === 'cave') ob.poly = makePolyBox(ob.x, ob.y, ob.w, ob.h, 18, 8);
        else if (ob.type === 'rubble') { ob.hp = 100; ob.maxHp = 100; }
        return ob;
    });
    slowZones = (m.sz || []).map(z => ({ x: num(z[0]), y: num(z[1]), w: num(z[2]), h: num(z[3]), type: String(z[4]) }));
    bushes = (m.bu || []).map(b => ({ x: num(b[0]), y: num(b[1]), rx: num(b[2], 60), ry: num(b[3], 40), rot: num(b[4]), alpha: num(b[5], 0.3) }));
    lightFlowers = (m.fl || []).map(f => ({ x: num(f[0]), y: num(f[1]), radius: 24, charge: 100 }));
    powerCoils = (m.co || []).map(c => ({ x: num(c[0]), y: num(c[1]), radius: num(c[2], 120), pulse: 0 }));
    GROUND_DOTS.length = 0;
    for (let i = 0; i < 600; i++) GROUND_DOTS.push({ x: Math.random() * MAP_SIZE.w, y: Math.random() * MAP_SIZE.h, r: Math.random() * 2.5 + 0.5 });

    zombies = []; bullets = []; enemyBullets = []; slashes = []; thrownItems = []; drops = []; particles = []; vfxList = []; airdropMarkers = []; fireZones = [];
    decals = []; hazards = []; drones = []; allies = []; rescueNPCs = []; outposts = []; towers = []; missionItems = [];
    evacZone = null; heliSupport.active = false; tank.active = false; turretMode.active = false; hangZRun.stairs = null; caveProps = []; NAV.dirty = true;
    NET.zmap = new Map(); NET.lastSeq = 0;
    for (let p of players) { p._init = false; p.isDowned = false; }
    let it = Array.isArray(m.intro) ? m.intro : [];
    mapIntro = { timer: num(it[3], 4), map: String(it[0] || ''), mission: String(it[1] || ''), weather: String(it[2] || '') };
    levelStartTimer = 3;

    document.getElementById('netWait').style.display = 'none';
    document.getElementById('upgradeScreen').style.display = 'none';
    document.getElementById('exclusiveWarningDialog').style.display = 'none';
    initControls();
    if (gameState !== 'PLAYING') {
        gameState = 'PLAYING';
        const token = ++loopToken;
        lastTime = performance.now();
        const run = (time) => {
            if (token !== loopToken || gameState !== 'PLAYING' || NET.mode !== 'guest') return;
            try { guestLoop(time); } catch (err) { console.error('[guestLoop]', err); }
            requestAnimationFrame(run);
        };
        requestAnimationFrame(run);
    }
}

function netApplySync(m) {
    currentLevel = m.lvl | 0 || currentLevel; shopScrap = m.scrap | 0; breakthroughShards = m.sh | 0;
    activeExclusiveTag = (typeof m.ex === 'string' && TAG_RULES[m.ex]) ? m.ex : null;
    currentPowerFloorCleared = m.cpf | 0;
    (m.pl || []).forEach((src, i) => {
        let p = players[i]; if (!p || !src) return;
        // Chỉ nhận các khóa hợp lệ (tên Link/thẻ đã biết) với giá trị đúng kiểu
        for (let t in TAG_DEFS) p.tags[t] = (src.tags && typeof src.tags[t] === 'number') ? src.tags[t] : (p.tags[t] || 0);
        if (src.perks) for (let k in src.perks) { let v = src.perks[k]; if (/^[a-zA-Z_]\w{0,40}$/.test(k) && (typeof v === 'boolean' || typeof v === 'number')) p.perks[k] = v; }
        p.perkStacks = {};
        if (src.st) for (let k in STACKABLE_PERKS) if (typeof src.st[k] === 'number') p.perkStacks[k] = src.st[k];
        p.pendingUpgrades = src.pend | 0; p.level = src.lvl | 0 || 1;
    });

    if (m.gs === 'SHOP') {
        gameState = 'NETWAIT';
        document.getElementById('upgradeScreen').style.display = 'none';
        document.getElementById('netWaitText').textContent = 'Chủ phòng đang chọn tuyến đường & mua tiếp tế...';
        document.getElementById('netWait').style.display = 'flex';
    } else if (m.gs === 'UPGRADE') {
        if (m.rej) netToast('Thẻ vừa chọn không còn hợp lệ, hãy chọn lại.');
        gameState = 'UPGRADE';
        document.getElementById('netWait').style.display = 'none';
        document.getElementById('upgradeScreen').style.display = 'flex';
        document.getElementById('p1Half').style.display = 'none';
        let half = document.getElementById('p2Half');
        half.style.display = 'flex'; half.style.transform = 'none';
        p2SelectedUpg = null; p2Confirmed = false;
        if (players[1].pendingUpgrades > 0) {
            document.getElementById('p2Status').style.display = 'none';
            document.getElementById('p2ConfirmBtn').disabled = true;
            document.getElementById('p2ConfirmBtn').style.display = 'block';
            document.getElementById('p2UpgCount').innerText = `LƯỢT CHỌN: ${players[1].pendingUpgrades}`;
            updateTagBar(2); renderCards(2, 'p2Cards');
        } else {
            p2Confirmed = true;
            setUpgradeHalfDone(2, 'HẾT LƯỢT CHỌN - CHỜ ĐỒNG ĐỘI...');
        }
    }
}

function netDecodePlayer(p, e, isLocal) {
    p.sx = e[0]; p.sy = e[1];
    if (!p._init || Math.hypot(p.x - p.sx, p.y - p.sy) > 420) { p.x = p.sx; p.y = p.sy; p._init = true; }
    if (!(isLocal && PC_INPUT.pointer.active)) { p.facingX = e[2]; p.facingY = e[3]; }
    let prevHp = p.hp;
    p.hp = e[4]; p.maxHp = e[5]; p.hunger = e[6];
    if (p.hp < prevHp - 0.5) p.hurtFlash = Math.max(p.hurtFlash || 0, 0.25);
    let f = e[7];
    p.isDowned = !!(f & 1); p.perks.invulnTimer = (f & 2) ? 1 : 0; p.stunTimer = (f & 4) ? 1 : 0;
    if (e[8] && WEAPON_TYPES[e[8]]) {
        if (!p.weapon || p.weapon.key !== e[8]) p.weapon = { ...WEAPON_TYPES[e[8]] };
        p.weapon.ammo = e[9];
    } else p.weapon = null;
    p.chargeTime = e[10] / 100;
    p.pullingPin = e[11] > 0; if (p.pullingPin) p.pinTime = Date.now() + e[11];
    p.tempShield = e[12]; p.xp = e[13]; p.level = e[14]; p.reviveProgress = e[15] / 100; p.reviveCount = e[16];
    p.skillC_CD = e[17] / 10; p.dCharge = e[18]; p.perks.frenzyStacks = e[19]; p.perks.rainStacks = e[20];
    p.status = {};
    for (let st of (e[21] || [])) { let id = NET_STATUS[st[0]]; if (id) p.status[id] = { id, timer: 1, stacks: st[1] }; }
    p.spd = e[22]; p.pendingUpgrades = e[23]; p.xpShowTimer = e[24] / 10;
}

function netApplySnapshot(s) {
    if (!s || typeof s.n !== 'number' || s.n <= NET.lastSeq || !Array.isArray(s.g) || !Array.isArray(s.p)) return;
    NET.lastSeq = s.n;
    if (s.pt) NET.ping = NET.ping * 0.8 + Math.max(0, performance.now() - s.pt - (s.pd || 0)) * 0.2;

    let g = s.g;
    objState = String(g[0]); evacTimer = g[1] / 10;
    evacZone = g[2] ? { x: g[2][0], y: g[2][1], progress: g[2][2] / 100 } : null;
    fortressTimer = g[3]; currentWeather = g[4]; darknessBattery = g[5]; flashAlpha = g[6] / 100;
    cameraShake = Math.max(cameraShake, g[7] || 0);
    shopScrap = g[8]; breakthroughShards = g[9]; killCount = g[10]; powerCellsHeld = g[11]; empStorm.active = !!g[12];
    darknessFlash = g[13] / 100; thietXaUnlocked = !!g[14]; tankExitTimer = g[15] / 100;
    if (Array.isArray(s.m)) { mission.type = String(s.m[0]); mission.progress = s.m[1]; mission.required = s.m[2]; }
    if (s.cv) {
        let c = s.cv;
        hangZRun.floor = c[0]; hangZRun.total = c[1]; hangZRun.timer = c[2]; caveRun.timer = c[3] / 10; caveRun.plant = c[4] / 100; mineRun.floor = c[5];
        hangZRun.stairs = Array.isArray(c[6]) ? { x: c[6][0], y: c[6][1], radius: c[6][2] } : null;
        caveProps = (s.pr || []).map(e => { let kind = CAVE_PROP_T[e[0]] || 'tnt', p = { kind, x: e[1], y: e[2], hp: e[3], maxHp: 100, r: kind === 'nest' ? 44 : (kind === 'core' ? 62 : (kind === 'c4' ? 58 : 20)) }; if (kind === 'nest') p.awake = !!e[4]; else if (kind === 'c4') { p.state = Math.floor(e[4] / 10); p.idx = e[4] % 10; } else p.moving = !!e[4]; return p; });
        if (Array.isArray(s.rb) && s.rb.length !== obstacles.filter(o => o.type === 'rubble').length) NAV.dirty = true;
        if (Array.isArray(s.rb)) obstacles = obstacles.filter(o => o.type !== 'rubble').concat(s.rb.map(e => ({ type: 'rubble', x: e[0], y: e[1], w: e[2], h: e[3], hp: e[4], maxHp: 100 })));
    } else hangZRun.stairs = null;
    if (s.h) { heliSupport.active = true; heliSupport.x = s.h[0]; heliSupport.y = s.h[1]; } else heliSupport.active = false;
    if (s.tk) {
        let k = s.tk; tank.active = true; tank.x = k[0]; tank.y = k[1]; tank.hullAngle = k[2]; tank.turretAngle = k[3]; tank.hp = k[4]; tank.maxHp = k[5];
        tank.p2InvulnTimer = k[6] ? 1 : 0; tank.cSkillCD = k[7] / 10; tank.dashCooldown = k[8] / 10; tank.dashTimer = k[9] ? 0.1 : 0;
    } else tank.active = false;
    if (s.tu) { turretMode.active = true; turretMode.x = s.tu[0]; turretMode.y = s.tu[1]; turretMode.hp = s.tu[2]; turretMode.maxHp = s.tu[3]; } else turretMode.active = false;

    s.p.forEach((e, i) => { if (players[i] && Array.isArray(e)) netDecodePlayer(players[i], e, i === NET.localIdx); });

    // Zombie (có nội suy vị trí)
    let seen = new Set();
    for (let e of (s.z || [])) {
        let z = NET.zmap.get(e[0]);
        if (!z) {
            z = new Zombie(e[1], e[2], e[3]); z.nid = e[0]; z.maxHp = 100; z.baseColor = z.color;
            NET.zmap.set(e[0], z); zombies.push(z);
        }
        z.tx = e[1]; z.ty = e[2]; z.hp = e[4];
        let f = e[5];
        z.hidden = !!(f & 1); z.isFrenzied = (f & 2) ? 1 : 0; z.flying = z.airborne = !!(f & 32); z.downed = !!(f & 64); z.phase2Done = !!(f & 8);
        if (z.type === 42) z.carry = (f & 128) ? 'BLINDBOX' : null;
        z.color = (f & 8) && NET_PHASE2[z.type] ? NET_PHASE2[z.type] : z.baseColor;
        if (f & 16) z.hitFlash = 0.1;
        if (f & 4) { z.warnBeamTimer = 1; z.targetX = e[7]; z.targetY = e[8]; } else z.warnBeamTimer = 0;
        z.status = {};
        for (let i = 0; i < NET_STATUS.length; i++) if (e[6] & (1 << i)) z.status[NET_STATUS[i]] = { id: NET_STATUS[i], timer: 1 };
        seen.add(e[0]);
    }
    if (zombies.length !== seen.size) {
        zombies = zombies.filter(z => { if (seen.has(z.nid)) return true; NET.zmap.delete(z.nid); return false; });
    }

    bullets = (s.b || []).map(e => ({ x: e[0], y: e[1], vx: e[2], vy: e[3], kind: e[4], angle: Math.atan2(e[3], e[2]), lifeTime: e[5] !== undefined ? e[5] / 100 : 1, maxLife: 1 }));
    enemyBullets = (s.eb || []).map(e => ({ x: e[0], y: e[1], vx: e[2], vy: e[3], type: NET_EB_T[e[4]] || 'arrow' }));
    if (s.d) drops = s.d.map(e => { let type = NET_DROP_T[e[2]] || 'FOOD'; return { x: e[0], y: e[1], type, radius: type === 'FOOD' ? 12 : (type === 'MEDKIT' ? 15 : (type === 'HEAVYBOX' ? 17 : 16)) }; });
    towers = (s.tw || []).map(e => ({ x: e[0], y: e[1], progress: e[2] / 100, active: !!e[3], needsBattery: !!e[4] }));
    missionItems = (s.mi || []).map(e => ({ x: e[0], y: e[1], radius: 14, taken: !!e[2], kind: e[3] ? 'battery' : undefined }));
    fireZones = (s.fz || []).map(e => ({ x: e[0], y: e[1], radius: e[2], life: e[3] / 10, kind: e[4] === 1 ? 'acid' : (e[4] === 2 ? 'arrow' : undefined) }));
    hazards = (s.hzd || []).map(e => {
        let h = { type: NET_HZ_T[e[0]] || 'slow', x: e[1], y: e[2], radius: e[3], timer: e[4] < 0 ? undefined : e[4] / 100, life: e[5] / 100, friendly: !!e[6], t0: e[7] ? e[7] / 100 : undefined };
        if (h.type === 'beam' || h.type === 'quad' || h.type === 'd_arc') h.angle = e[8] || 0;
        else if (h.type === 'cage') h.points = (Array.isArray(e[8]) ? e[8] : []).map(p => ({ x: p[0], y: p[1] }));
        return h;
    }).filter(h => h.type !== 'cage' || h.points.length > 1);
    drones = (s.dr || []).map(e => ({ x: e[0], y: e[1], color: String(e[2]) }));
    allies = (s.al || []).map(e => Object.assign(Object.create(Ally.prototype), { x: e[0], y: e[1], kind: NET_ALLY_T[e[2]] || 'rifleman', radius: e[2] === 2 ? 19 : 15, hp: e[3], maxHp: 100, elite: !!e[4], facingX: e[5], facingY: e[6] }));
    rescueNPCs = (s.np || []).map(e => Object.assign(Object.create(e[5] ? Doctor.prototype : RescueNPC.prototype), { x: e[0], y: e[1], radius: 13, hp: e[2], maxHp: 100, rescued: !!e[3], rescueProgress: e[4] / 10, isDoctor: !!e[5], state: e[6] === 1 ? 'plant' : (e[6] === 2 ? 'wait' : 'move') }));
    outposts = (s.op || []).map(e => Object.assign(Object.create(Outpost.prototype), { x: e[0], y: e[1], w: 150, h: 150, hp: e[2], maxHp: 100, destroyTimer: e[3] / 10 }));
    thrownItems = (s.th || []).map(e => ({ x: e[0], y: e[1], rotation: performance.now() / 70, isGrenade: e[2] > 0, expTime: Date.now() + e[2], color: String(e[3]), vx: +e[4] || 0, vy: +e[5] || 0 }));
    airdropMarkers = (s.am || []).map(e => ({ x: e[0], y: e[1], time: e[2] / 100, maxTime: e[3] / 100 }));
    if (s.cp) for (let i of s.cp) if (powerCoils[i]) powerCoils[i].pulse = 0.3;
    if (typeof s.bs === 'string') for (let i = 0; i < bushes.length && i < s.bs.length; i++) { bushes[i].burning = s.bs[i] === '1'; bushes[i].burnedOut = s.bs[i] === '2'; }
    if (s.fc) s.fc.forEach((c, i) => { if (lightFlowers[i]) lightFlowers[i].charge = c; });

    if (Array.isArray(s.e)) {
        NET.applying = true;
        for (let ev of s.e) {
            if (!Array.isArray(ev)) continue;
            if (ev[0] === 'p') createParticles(ev[1], ev[2], String(ev[3]), Math.min(40, ev[4] | 0), +ev[5] || 0);
            else if (ev[0] === 'v' && ev[1] && typeof ev[1] === 'object' && typeof ev[1].type === 'string') { if (vfxList.length < 260) vfxList.push(ev[1]); }
            else if (ev[0] === 's') Sound.play(String(ev[1]));
            else if (ev[0] === 'dw') { deadWarnT = 3.2; Sound.play('boss_intro'); }
            else if (ev[0] === 'sk') playKillSound(+ev[1] || 0, +ev[2] || 0, ev[3] ? 1 : 0);
            else if (ev[0] === 'd') addDecal(ev[1], ev[2], String(ev[3]), +ev[4] || 10, +ev[5] || 0.4);
            else if (ev[0] === 'r') radioDialogs.push({ text: String(ev[1]), life: 5, maxLife: 5 });
            else if (ev[0] === 'sl') slashes.push(Object.assign(Object.create(Slash.prototype), { src: ev[1] === 2 ? 1 : 0, x: 0, y: 0, angle: +ev[2] || 0, range: +ev[3] || 80, spread: +ev[4] || 1, isSaber: !!ev[5], isFire: !!ev[6], life: 0.15 }));
        }
        NET.applying = false;
    }
}

function netSendInput() {
    let p = players[NET.localIdx];
    const B = (n) => { let b = UI['p1Btn' + n]; let d = b.pressed || b.justPressed; b.justPressed = false; b.justReleased = false; return d ? 1 : 0; };
    let ptr = PC_INPUT.pointer.active;
    let px = tank.active ? tank.x : p.x, py = tank.active ? tank.y : p.y;
    netSend({
        t: 'i', a: UI.p1Stick.active ? 1 : 0, dx: +UI.p1Stick.dx.toFixed(2), dy: +UI.p1Stick.dy.toFixed(2),
        b: [B('A'), B('B'), B('C'), B('D')], ptr: ptr ? 1 : 0, ang: ptr ? +getPcAimAngle(px, py, 0).toFixed(3) : 0, pt: Math.round(performance.now())
    });
}

function guestLoop(time) {
    let dt = Math.min((time - lastTime) / 1000, 0.1); lastTime = time;
    frameDt = dt;
    syncPcControls();
    const k = Math.min(1, dt * 14);

    players.forEach((p, i) => {
        if (p.sx === undefined) return;
        if (i === NET.localIdx && !tank.active && !p.isDowned) {
            // Dự đoán chuyển động của chính mình để điều khiển không bị trễ
            let joy = UI.p1Stick;
            if (joy.active && p.spd > 0) { p.x += joy.dx * p.spd * dt; p.y += joy.dy * p.spd * dt; resolveCollision(p); }
            let ex = p.sx - p.x, ey = p.sy - p.y, err = Math.hypot(ex, ey);
            if (err > 170) { p.x = p.sx; p.y = p.sy; }
            else { let c = Math.min(1, dt * (joy.active ? 3 : 9)); p.x += ex * c; p.y += ey * c; }
            if (PC_INPUT.pointer.active) { let a = getPcAimAngle(p.x, p.y, Math.atan2(p.facingY, p.facingX)); p.facingX = Math.cos(a); p.facingY = Math.sin(a); }
        } else { p.x += (p.sx - p.x) * k; p.y += (p.sy - p.y) * k; }
    });
    for (let z of zombies) {
        if (Math.abs(z.tx - z.x) > 300 || Math.abs(z.ty - z.y) > 300) { z.x = z.tx; z.y = z.ty; }
        else { z.x += (z.tx - z.x) * k; z.y += (z.ty - z.y) * k; }
        if (z.hitFlash > 0) z.hitFlash -= dt;
    }
    for (let b of bullets) { b.x += b.vx * dt; b.y += b.vy * dt; if (b.kind === 4 || b.kind === 5) b.lifeTime -= dt * 1.1; }
    for (let b of enemyBullets) { b.x += b.vx * dt; b.y += b.vy * dt; }
    for (let t of thrownItems) { t.x += t.vx * dt; t.y += t.vy * dt; t.rotation += 22 * dt; }
    for (let m of airdropMarkers) m.time = Math.max(0, m.time - dt);
    for (let h of hazards) { if (h.timer !== undefined) h.timer -= dt; if (h.type === 'beam') h.angle += 1.7 * dt; }
    for (let c of powerCoils) if (c.pulse > 0) c.pulse -= dt;
    updateLoopSounds(dt);
    for (let i = slashes.length - 1; i >= 0; i--) {
        let sl = slashes[i], owner = players[sl.src] || players[0];
        sl.x = owner.x; sl.y = owner.y; sl.life -= dt;
        if (sl.life <= 0) slashes.splice(i, 1);
    }

    NET.inputAcc += dt;
    if (NET.inputAcc >= 1 / 30) { NET.inputAcc = 0; netSendInput(); }

    updateFx(dt);
    updateCamera(dt);
    draw();
}

// Âm thanh phát ở chủ phòng cũng được gửi sang khách
(function () {
    const basePlay = Sound.play;
    let lastQueued = {};
    Sound.play = function (name) {
        if (NET.mode === 'host' && NET.ev.length < 100) {
            let now = performance.now();
            if (!lastQueued[name] || now - lastQueued[name] > 70) { lastQueued[name] = now; NET.ev.push(['s', name]); }
        }
        basePlay(name);
    };
})();
