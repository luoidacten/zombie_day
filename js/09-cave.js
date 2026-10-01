// ============================================================================
// 09-cave.js — HANG Z (3 tầng, hộ tống Tiến Sĩ), HẦM MỎ (tầng 4-5), hệ sinh thái KIẾN và Boss KIẾN CHÚA
// File này nạp SAU CÙNG; các file khác chỉ gọi vào đây qua vài "móc" (hook) ngắn.
// ============================================================================
const ANT = { MINOR: 40, EXPLODER: 41, HARVESTER: 42, SOLDIER: 43, QUEEN: 45, TENTACLE: 46 };
const CAVE_PROP_T = ['nest', 'tnt', 'cart', 'tntcart', 'c4', 'core', 'det'];

// Hầm Mỏ được mở khoá VĨNH VIỄN (lưu trên máy) sau khi hộ tống Tiến Sĩ thành công
let mineUnlocked = false;
try { mineUnlocked = localStorage.getItem('zs_mine_unlocked') === '1'; } catch (e) { }
let mineRun = { active: false, floor: 4, stage: 'maze', queenPct: 0.3 };
let caveProps = [];
function newCaveRun() {
    return { kind: '', stage: '', timer: 0, plant: 0, sites: [], siteIdx: 0, doctor: null, exit: null, arena: null, waveT: 0, crateT: 8, rockT: 3, spawnT: 6, rockCD: 0,
        endT: 0, result: null, pendingStage: null, stageT: 0, pinned: false, toxicT: 0 };
}
let caveRun = newCaveRun();

function isBossType(t) { return (t >= 30 && t <= 32) || t === 45 || t === 46 || t === 50; }
function isCaveMap() { return currentMapType === 10 || currentMapType === 14; }
function caveSlippery() { return currentMapType === 10 && hangZRun.floor <= 2; }          // trần hang rỉ nước ở tầng 1-2
function mineDarkness() { if (objState === 'QUEEN') return 0.5; if (objState === 'QUEEN_RUN') return 0.74; return mineRun.floor >= 5 ? 0.74 : 0.52; }
function resetCaveState() { mineRun = { active: false, floor: 4, stage: 'maze', queenPct: 0.3 }; caveProps = []; caveRun = newCaveRun(); }
function caveDropCount() { return currentMapType === 14 ? (mineRun.stage === 'maze' ? 16 : 4) : 22; }
function caveSpawnCount(n) {
    if (currentMapType === 14) return 0;                         // Hầm mỏ: quái chỉ chui ra từ Tổ Kiến / kịch bản boss
    if (zombies.length > 55) return 0;
    return Math.min(4, Math.ceil(n * 0.5));
}

// ---------------------------------------------------------------------------
// LƯỚI DẪN ĐƯỜNG: quái (và Tiến Sĩ, Kiến Thợ) biết đi vòng qua vách hang thay vì đâm đầu vào tường
// ---------------------------------------------------------------------------
const NAV = { cs: 80, n: 50, blocked: new Uint8Array(2500), field: new Int16Array(2500), dirty: true, t: 0, spawnCells: [], reach: [] };
const NAV_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function navRebuild() {
    for (let cy = 0; cy < NAV.n; cy++) for (let cx = 0; cx < NAV.n; cx++)
        NAV.blocked[cy * NAV.n + cx] = isBlockedPoint(cx * NAV.cs + NAV.cs / 2, cy * NAV.cs + NAV.cs / 2, 18) ? 1 : 0;
    NAV.dirty = false; NAV.t = 0;
}
function navOpenIdx(x, y) {
    let cx = Math.floor(x / NAV.cs), cy = Math.floor(y / NAV.cs);
    if (cx < 0 || cy < 0 || cx >= NAV.n || cy >= NAV.n) return -1;
    let i = cy * NAV.n + cx;
    if (!NAV.blocked[i]) return i;
    for (let d of NAV_DIRS) { let nx = cx + d[0], ny = cy + d[1]; if (nx < 0 || ny < 0 || nx >= NAV.n || ny >= NAV.n) continue; let j = ny * NAV.n + nx; if (!NAV.blocked[j]) return j; }
    return -1;
}
function navFlood(sources, out) {
    out.fill(-1);
    let q = [], n = NAV.n;
    for (let s of sources) { let i = navOpenIdx(s.x, s.y); if (i >= 0 && out[i] < 0) { out[i] = 0; q.push(i); } }
    for (let h = 0; h < q.length; h++) {
        let i = q[h], cx = i % n, cy = (i - cx) / n, d = out[i] + 1;
        for (let k = 0; k < 8; k++) {
            let dx = NAV_DIRS[k][0], dy = NAV_DIRS[k][1], nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
            let j = ny * n + nx;
            if (NAV.blocked[j] || out[j] >= 0) continue;
            if (k >= 4 && (NAV.blocked[cy * n + nx] || NAV.blocked[ny * n + cx])) continue; // không cắt góc tường
            out[j] = d; q.push(j);
        }
    }
    return out;
}
// Ô kế tiếp trên đường ngắn nhất về nguồn của trường khoảng cách
function navNext(field, x, y) {
    let i = navOpenIdx(x, y);
    if (i < 0 || field[i] <= 0) return null;
    let n = NAV.n, cx = i % n, cy = (i - cx) / n, best = field[i], bi = -1;
    for (let k = 0; k < 8; k++) {
        let dx = NAV_DIRS[k][0], dy = NAV_DIRS[k][1], nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
        let j = ny * n + nx;
        if (field[j] < 0 || field[j] >= best) continue;
        if (k >= 4 && (NAV.blocked[cy * n + nx] || NAV.blocked[ny * n + cx])) continue;
        best = field[j]; bi = j;
    }
    if (bi < 0) return null;
    return { x: (bi % n) * NAV.cs + NAV.cs / 2, y: Math.floor(bi / n) * NAV.cs + NAV.cs / 2 };
}
function navUpdate(dt) {
    if (NAV.dirty) navRebuild();
    NAV.t -= dt;
    if (NAV.t > 0) return;
    NAV.t = 0.35;
    let src = [];
    if (tank.active) src.push(tank); else for (let p of players) if (!p.isDowned) src.push(p);
    if (caveRun.doctor && caveRun.doctor.hp > 0) src.push(caveRun.doctor);
    if (!src.length) src.push(players[0]);
    navFlood(src, NAV.field);
    NAV.spawnCells.length = 0; NAV.reach.length = 0;
    for (let i = 0; i < NAV.field.length; i++) { let d = NAV.field[i]; if (d < 0) continue; if (d >= 4) NAV.reach.push(i); if (d >= 7 && d <= 15) NAV.spawnCells.push(i); }
}
function navCellPoint(i, jitter = 0) { return { x: (i % NAV.n) * NAV.cs + NAV.cs / 2 + (Math.random() - 0.5) * jitter, y: Math.floor(i / NAV.n) * NAV.cs + NAV.cs / 2 + (Math.random() - 0.5) * jitter }; }
function caveSpawnPoint() {
    if (!NAV.spawnCells.length) return null;
    for (let t = 0; t < 6; t++) {
        let p = navCellPoint(NAV.spawnCells[Math.floor(Math.random() * NAV.spawnCells.length)], 20);
        if (!players.some(pl => !pl.isDowned && hasLineOfSight(pl.x, pl.y, p.x, p.y) && Math.hypot(pl.x - p.x, pl.y - p.y) < 520)) return p;
    }
    return navCellPoint(NAV.spawnCells[Math.floor(Math.random() * NAV.spawnCells.length)], 20);
}
function caveRandomOpenPoint() {
    if (!NAV.reach.length) return findSafePoint(MAP_SIZE.w / 2 + (Math.random() - 0.5) * 900, MAP_SIZE.h / 2 + (Math.random() - 0.5) * 900, 18);
    return navCellPoint(NAV.reach[Math.floor(Math.random() * NAV.reach.length)], 26);
}
// Móc trong Zombie.update: không thấy mục tiêu thì đi theo lưới dẫn đường
function caveSteer(z, target, ang, dist) {
    if (z.flying || z.airborne || dist < 110) return ang;
    if (hasLineOfSight(z.x, z.y, target.x, target.y)) return ang;
    let nx = navNext(NAV.field, z.x, z.y);
    return nx ? Math.atan2(nx.y - z.y, nx.x - z.x) : ang;
}
// Di chuyển tới một điểm bất kỳ theo lưới (Tiến Sĩ, Kiến Thợ) — mỗi thực thể giữ trường khoảng cách riêng
function navMoveTo(e, gx, gy, spd, dt) {
    let key = Math.round(gx / 40) + ':' + Math.round(gy / 40);
    e._ft = (e._ft || 0) - dt;
    if (!e._f || e._fg !== key || e._ft <= 0) { e._f = e._f || new Int16Array(NAV.n * NAV.n); navFlood([{ x: gx, y: gy }], e._f); e._fg = key; e._ft = 2.0; }
    let a = Math.atan2(gy - e.y, gx - e.x);
    if (Math.hypot(gx - e.x, gy - e.y) > 90 && !hasLineOfSight(e.x, e.y, gx, gy)) { let nx = navNext(e._f, e.x, e.y); if (nx) a = Math.atan2(nx.y - e.y, nx.x - e.x); }
    e.x += (Math.cos(a) * spd + (e.kbX || 0)) * dt; e.y += (Math.sin(a) * spd + (e.kbY || 0)) * dt;
    resolveCollision(e);
    return a;
}

// ---------------------------------------------------------------------------
// DỰNG MÊ CUNG
// ---------------------------------------------------------------------------
function buildMaze(n, cell, thick, loopChance) {
    const ox = MAP_SIZE.w / 2 - n * cell / 2, oy = MAP_SIZE.h / 2 - n * cell / 2, T2 = thick / 2;
    let g = [];
    for (let y = 0; y < n; y++) { g[y] = []; for (let x = 0; x < n; x++) g[y][x] = { v: false, r: true, b: true }; }
    let m = Math.floor(n / 2), stack = [{ x: m, y: m }];
    g[m][m].v = true;
    while (stack.length) {
        let cur = stack[stack.length - 1], moved = false;
        let dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => Math.random() - 0.5);
        for (let d of dirs) {
            let nx = cur.x + d[0], ny = cur.y + d[1];
            if (nx < 0 || ny < 0 || nx >= n || ny >= n || g[ny][nx].v) continue;
            if (d[0] === 1) g[cur.y][cur.x].r = false; else if (d[0] === -1) g[ny][nx].r = false;
            else if (d[1] === 1) g[cur.y][cur.x].b = false; else g[ny][nx].b = false;
            g[ny][nx].v = true; stack.push({ x: nx, y: ny }); moved = true; break;
        }
        if (!moved) stack.pop();
    }
    // Đục thêm vài lối tắt để mê cung có đường vòng (quái không dồn một hàng, người chơi không bị khoá cứng)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (x < n - 1 && g[y][x].r && Math.random() < loopChance) g[y][x].r = false;
        if (y < n - 1 && g[y][x].b && Math.random() < loopChance) g[y][x].b = false;
    }
    const wall = (x, y, w, h) => obstacles.push({ type: 'cave', x, y, w, h, poly: makePolyBox(x, y, w, h, 18, 8) });
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        if (x < n - 1 && g[y][x].r) wall(ox + (x + 1) * cell - T2, oy + y * cell - T2, thick, cell + thick);
        if (y < n - 1 && g[y][x].b) wall(ox + x * cell - T2, oy + (y + 1) * cell - T2, cell + thick, thick);
    }
    // Khối đá đặc bao quanh mê cung
    let x1 = ox + n * cell - T2, y1 = oy + n * cell - T2;
    obstacles.push({ type: 'rockwall', x: 0, y: 0, w: MAP_SIZE.w, h: oy + T2 });
    obstacles.push({ type: 'rockwall', x: 0, y: y1, w: MAP_SIZE.w, h: MAP_SIZE.h - y1 });
    obstacles.push({ type: 'rockwall', x: 0, y: 0, w: ox + T2, h: MAP_SIZE.h });
    obstacles.push({ type: 'rockwall', x: x1, y: 0, w: MAP_SIZE.w - x1, h: MAP_SIZE.h });

    const open = (x, y, dx, dy) => dx === 1 ? (x < n - 1 && !g[y][x].r) : dx === -1 ? (x > 0 && !g[y][x - 1].r) : dy === 1 ? (y < n - 1 && !g[y][x].b) : (y > 0 && !g[y - 1][x].b);
    const center = (x, y) => ({ x: ox + (x + 0.5) * cell, y: oy + (y + 0.5) * cell });
    const bfs = (sx, sy) => {
        let dist = new Int16Array(n * n).fill(-1), prev = new Int16Array(n * n).fill(-1), q = [sy * n + sx];
        dist[q[0]] = 0;
        for (let h = 0; h < q.length; h++) {
            let i = q[h], x = i % n, y = (i - x) / n;
            for (let d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (!open(x, y, d[0], d[1])) continue;
                let j = (y + d[1]) * n + x + d[0];
                if (dist[j] >= 0) continue;
                dist[j] = dist[i] + 1; prev[j] = i; q.push(j);
            }
        }
        return { dist, prev };
    };
    const degree = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(d => open(x, y, d[0], d[1])).length;
    return { n, cell, thick, ox, oy, m, g, open, center, bfs, degree };
}
function mazePath(mz, bf, ti) {
    let path = [];
    for (let i = ti; i >= 0; i = bf.prev[i]) path.unshift({ x: i % mz.n, y: Math.floor(i / mz.n), i });
    return path;
}
function mazeFarthest(mz, bf) { let bi = 0; for (let i = 0; i < bf.dist.length; i++) if (bf.dist[i] > bf.dist[bi]) bi = i; return bi; }

// Gọi từ generateMap() cho map 10 (Hang Z) và 14 (Hầm Mỏ)
function generateCaveMap(level) {
    caveProps = []; caveRun = newCaveRun();
    obstacles = [];
    if (currentMapType === 10) genHangZ(level); else genMine(level);
    navRebuild();
    let sp = caveStartPos();
    navFlood([sp], NAV.field);
    NAV.reach.length = 0; NAV.spawnCells.length = 0;
    for (let i = 0; i < NAV.field.length; i++) if (NAV.field[i] >= 4) NAV.reach.push(i);
    NAV.t = 0;
}
function caveStartPos() {
    if (currentMapType === 14 && mineRun.stage === 'arena') return { x: MAP_SIZE.w / 2, y: MAP_SIZE.h / 2 + 330 };
    if (currentMapType === 14 && mineRun.stage === 'tunnel') return { x: 780, y: 1400 };
    return { x: MAP_SIZE.w / 2, y: MAP_SIZE.h / 2 };
}

function genHangZ(level) {
    bgMapColor = '#101214';
    darknessBattery = Math.max(darknessBattery || 0, 55);
    if (!hangZRun.active) hangZRun = { active: true, floor: 1, total: 3, timer: 210, stairs: null };
    let mz = buildMaze(13, 240, 80, 0.06), bf = mz.bfs(mz.m, mz.m), ei = mazeFarthest(mz, bf);
    let ec = mz.center(ei % mz.n, Math.floor(ei / mz.n));
    caveRun.exit = { x: ec.x, y: ec.y, radius: 46 };
    missionItems = [];
    if (hangZRun.floor < 3) {
        caveRun.kind = 'descend';
        mission = { type: 'HANGZ_ESCAPE', progress: hangZRun.floor, required: hangZRun.total, complete: false };
        objState = 'HANGZ_ESCAPE';
        hangZRun.stairs = caveRun.exit;
        return;
    }
    // ---- TẦNG 3: HỘ TỐNG TIẾN SĨ ĐẶT 3 NGÒI NỔ C4 ----
    caveRun.kind = 'escort'; caveRun.stage = 'escort';
    mission = { type: 'CAVE_ESCORT', progress: 0, required: 3, complete: false };
    objState = 'CAVE_ESCORT';
    hangZRun.stairs = null;
    let path = mazePath(mz, bf, ei), L = path.length;
    let idx = [Math.round(L * 0.3), Math.round(L * 0.6), Math.round(L * 0.88)].map(v => Math.max(2, Math.min(L - 2, v)));
    for (let k = 1; k < 3; k++) if (idx[k] <= idx[k - 1]) idx[k] = Math.min(L - 1, idx[k - 1] + 1);
    caveRun.sites = idx.map((v, k) => { let c = mz.center(path[v].x, path[v].y); let s = { kind: 'c4', x: c.x, y: c.y, r: 58, state: 0, idx: k }; caveProps.push(s); return s; });
    let doc = new Doctor(MAP_SIZE.w / 2 + 44, MAP_SIZE.h / 2);
    caveRun.doctor = doc; rescueNPCs.push(doc);
    queueRadio('Tiến Sĩ: Hộ tống tôi tới 3 mạch nổ. Mỗi điểm tôi cần 10 giây để đặt C4!', null, 6);
}

function genMine(level) {
    mineRun.active = true;
    missionItems = []; hangZRun.stairs = null;
    const cx = MAP_SIZE.w / 2, cy = MAP_SIZE.h / 2;
    if (mineRun.stage === 'arena') return genQueenArena(cx, cy);
    if (mineRun.stage === 'tunnel') return genQueenTunnel();

    bgMapColor = mineRun.floor >= 5 ? '#16120e' : '#231d16';
    darknessBattery = 100;
    let mz = buildMaze(9, 300, 64, 0.12), bf = mz.bfs(mz.m, mz.m), ei = mazeFarthest(mz, bf);
    let ec = mz.center(ei % mz.n, Math.floor(ei / mz.n));
    caveRun.exit = { x: ec.x, y: ec.y, radius: 48 };
    caveRun.kind = 'mine';

    // Tổ Kiến: ưu tiên ngõ cụt, cách xa điểm xuất phát và cách nhau
    let cells = [];
    for (let i = 0; i < mz.n * mz.n; i++) { let x = i % mz.n, y = Math.floor(i / mz.n); if (i !== ei && bf.dist[i] >= 3 && Math.abs(x - mz.m) + Math.abs(y - mz.m) >= 2) cells.push({ x, y, i, dead: mz.degree(x, y) === 1 }); }
    cells.sort((a, b) => (b.dead - a.dead) || (Math.random() - 0.5));
    let nests = [];
    for (let c of cells) { if (nests.length >= 3) break; if (nests.some(o => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) < 3)) continue; nests.push(c); }
    for (let c of nests) { let p = mz.center(c.x, c.y), hp = 650 + currentLevel * 110; caveProps.push({ kind: 'nest', x: p.x, y: p.y, r: 44, hp, maxHp: hp, t: 2, awake: false }); }

    // Đá chặn đường chính + thùng thuốc nổ / xe thuốc nổ gần đó để phá nhanh
    let path = mazePath(mz, bf, ei), L = path.length;
    let picks = [Math.round(L * 0.4), Math.round(L * 0.75)].filter((v, k, arr) => v >= 2 && v < L - 1 && arr.indexOf(v) === k);
    for (let v of picks) {
        let a = path[v], b = path[v + 1], dx = b.x - a.x, dy = b.y - a.y, ac = mz.center(a.x, a.y), rect;
        if (dx !== 0) rect = { x: mz.ox + Math.max(a.x, b.x) * mz.cell - 36, y: mz.oy + a.y * mz.cell + mz.thick / 2, w: 72, h: mz.cell - mz.thick };
        else rect = { x: mz.ox + a.x * mz.cell + mz.thick / 2, y: mz.oy + Math.max(a.y, b.y) * mz.cell - 36, w: mz.cell - mz.thick, h: 72 };
        obstacles.push({ type: 'rubble', x: rect.x, y: rect.y, w: rect.w, h: rect.h, hp: 700, maxHp: 700 });
        caveProps.push({ kind: 'tnt', x: ac.x + dx * 55 - dy * 70, y: ac.y + dy * 55 + dx * 70, r: 16, hp: 30, maxHp: 30 });
        caveProps.push({ kind: 'tntcart', x: ac.x - dx * 40, y: ac.y - dy * 40, r: 22, hp: 60, maxHp: 60, vx: 0, vy: 0, moving: false });
    }
    // Thùng thuốc nổ & xe mỏ rải rác
    let free = cells.filter(c => !nests.includes(c)).sort(() => Math.random() - 0.5);
    for (let k = 0; k < 7 && k < free.length; k++) { let p = mz.center(free[k].x, free[k].y); caveProps.push({ kind: 'tnt', x: p.x + (Math.random() - 0.5) * 130, y: p.y + (Math.random() - 0.5) * 130, r: 16, hp: 30, maxHp: 30 }); }
    for (let k = 7; k < 10 && k < free.length; k++) { let p = mz.center(free[k].x, free[k].y); caveProps.push({ kind: 'cart', x: p.x, y: p.y, r: 22, vx: 0, vy: 0, moving: false }); }

    if (mineRun.floor <= 4) {
        mission = { type: 'MINE_NESTS', progress: 0, required: nests.length, complete: false };
        objState = 'MINE_NESTS';
    } else {
        caveProps.push({ kind: 'core', x: ec.x, y: ec.y, r: 62 });
        mission = { type: 'MINE_BOMB', progress: 0, required: 1, complete: false };
        objState = 'MINE_BOMB';
        queueRadio('Bộ đàm: Lõi tổ kiến nằm ở cuối tầng. Đứng cạnh nó 8 giây để gài bom phá sập trần!', null, 6);
    }
}

function genQueenArena(cx, cy) {
    bgMapColor = '#1c1712'; darknessBattery = 100;
    const RA = 740;
    caveRun.kind = 'queen'; caveRun.arena = { x: cx, y: cy, r: RA };
    for (let k = 0; k < 44; k++) {
        let a = k / 44 * Math.PI * 2, bx = cx + Math.cos(a) * (RA + 78) - 80, by = cy + Math.sin(a) * (RA + 78) - 80;
        obstacles.push({ type: 'cave', x: bx, y: by, w: 160, h: 160, poly: makePolyBox(bx, by, 160, 160, 26, 8) });
    }
    let q = new Zombie(cx, cy - 420, ANT.QUEEN);
    zombies.push(q);
    mission = { type: 'QUEEN', progress: 1, required: 3, complete: false };
    objState = 'QUEEN';
    queueRadio('Bộ đàm: KIẾN CHÚA! Nó đang bay — đạn chỉ gây nửa sát thương. Chờ nó kiệt sức rồi dồn hoả lực!', null, 6);
}

function genQueenTunnel() {
    bgMapColor = '#120f0c'; darknessBattery = 100;
    caveRun.kind = 'run'; caveRun.timer = 45;
    const rock = (x, y, w, h) => obstacles.push({ type: 'rockwall', x, y, w, h });
    rock(0, 0, MAP_SIZE.w, 1250); rock(0, 2750, MAP_SIZE.w, MAP_SIZE.h - 2750);
    rock(0, 1250, 300, 1500); rock(3550, 1250, MAP_SIZE.w - 3550, 1500); rock(300, 1550, 2950, 900);
    const pillar = (x, y, w, h) => obstacles.push({ type: 'cave', x, y, w, h, poly: makePolyBox(x, y, w, h, 14, 8) });
    const tnt = (x, y) => caveProps.push({ kind: 'tnt', x, y, r: 16, hp: 30, maxHp: 30 });
    let k = 0;
    for (let x = 1150; x <= 3000; x += 430, k++) { let top = k % 2 === 0; pillar(x, top ? 1250 : 1440, 100, 110); if (k % 2 === 1) tnt(x + 50, 1295); }
    pillar(3250, 1820, 120, 100); pillar(3430, 2160, 120, 100); tnt(3500, 1900);
    k = 0;
    for (let x = 2950; x >= 1000; x -= 430, k++) { let top = k % 2 === 1; pillar(x, top ? 2450 : 2640, 100, 110); if (k % 2 === 0) tnt(x + 50, 2495); }
    caveRun.exit = { x: 560, y: 2600, radius: 60 };
    hangZRun.stairs = caveRun.exit;
    caveProps.push({ kind: 'det', x: 420, y: 2600, r: 20 });
    let q = new Zombie(430, 1400, ANT.QUEEN);
    q.phase = 3; q.phase2Done = true; q.airborne = false; q.hp = q.maxHp * (mineRun.queenPct || 0.3); q._hpPrev = q.hp;
    zombies.push(q);
    mission = { type: 'QUEEN_RUN', progress: 3, required: 3, complete: false };
    objState = 'QUEEN_RUN';
    queueRadio('Bộ đàm: Hang đang sập! Chạy tới cửa hầm trong 45 giây — bắn để làm Kiến Chúa khựng lại, nổ thùng TNT để chôn chân nó!', null, 7);
}

// Dựng lại bản đồ cho tầng / giai đoạn kế tiếp mà không đổi "map" của lượt chơi
function caveRegenerate() {
    zombies.length = 0; bullets.length = 0; enemyBullets.length = 0; fireZones.length = 0; hazards.length = 0; thrownItems.length = 0; decals.length = 0;
    rescueNPCs = []; airdropMarkers.length = 0; radioDialogs.length = 0;
    nextMapPreference = currentMapType;
    generateMap(currentLevel);
    let sp = caveStartPos();
    players.forEach((p, i) => { p.x = sp.x + (players.length > 1 ? (i ? 30 : -30) : 0); p.y = sp.y; p.slipX = 0; p.slipY = 0; p.stunTimer = 0; p.netTimer = 0; });
    if (tank.active) { tank.x = sp.x; tank.y = sp.y; }
    allies.forEach((a, i) => { a.x = sp.x + (i % 2 ? 40 : -40); a.y = sp.y + 44; });
    showMapIntro();
    updateCamera(0, true);
    if (NET.mode === 'host') netSendMap();
}

// ---------------------------------------------------------------------------
// TIẾN SĨ (NPC hộ tống)
// ---------------------------------------------------------------------------
class Doctor {
    constructor(x, y) {
        this.x = x; this.y = y; this.radius = 13; this.hp = this.maxHp = 260 + currentLevel * 30;
        this.rescued = true; this.rescueProgress = 0; this.isDoctor = true; this.state = 'wait'; this.plant = 0; this.hurt = 0;
    }
    takeDamage(dmg) {
        if (this.hp <= 0) return;
        this.hp -= dmg; this.hurt = 0.25;
        if (this.hp <= 0) { createParticles(this.x, this.y, '#c0392b', 20, 180); addDecal(this.x, this.y, '#7b1a12', 24, 0.5); Sound.play('down'); }
    }
    update(dt) {
        if (this.hp <= 0) return;
        if (this.hurt > 0) this.hurt -= dt;
        this.state = 'wait';
        if (caveRun.stage === 'run') {
            if (Math.hypot(caveRun.exit.x - this.x, caveRun.exit.y - this.y) > 30) { navMoveTo(this, caveRun.exit.x, caveRun.exit.y, 170, dt); this.state = 'move'; }
            return;
        }
        if (caveRun.stage !== 'escort') return;
        let site = caveRun.sites[caveRun.siteIdx];
        if (!site) return;
        if (Math.hypot(site.x - this.x, site.y - this.y) < 34) { this.state = 'plant'; return; }
        // Chỉ tiến lên khi có người hộ tống ở gần
        if (players.some(p => !p.isDowned && Math.hypot(p.x - this.x, p.y - this.y) < 460) || tank.active) { navMoveTo(this, site.x, site.y, 135, dt); this.state = 'move'; }
    }
    draw(ctx) {
        if (this.hp <= 0) return;
        drawShadow(this.x, this.y, this.radius);
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.hurt > 0 ? '#ffb3b3' : '#f5f6fa'; ctx.fill(); ctx.strokeStyle = '#2f3640'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(this.x, this.y - 2, 7, 0, Math.PI * 2); ctx.fillStyle = '#f8c291'; ctx.fill();                    // đầu
        ctx.strokeStyle = '#2f3640'; ctx.lineWidth = 1.5; ctx.strokeRect(this.x - 6, this.y - 5, 5, 4); ctx.strokeRect(this.x + 1, this.y - 5, 5, 4); // kính
        ctx.fillStyle = '#e74c3c'; ctx.fillRect(this.x - 2, this.y + 5, 4, 6);                                                    // cà vạt
        drawMiniBar(this.x, this.y - 30, 44, 5, this.hp, this.maxHp, '#2ecc71');
        outlinedText('TIẾN SĨ', this.x, this.y - 40, '#dff9fb', 'bold 11px Arial');
        if (this.state === 'plant') drawMiniBar(this.x, this.y + 22, 50, 6, caveRun.plant, 1, '#f1c40f');
        else if (this.state === 'wait' && objState === 'CAVE_ESCORT') outlinedText('ĐỢI HỘ TỐNG...', this.x, this.y + 26, '#f1c40f', 'bold 10px Arial');
    }
}

// ---------------------------------------------------------------------------
// VÒNG CẬP NHẬT CHÍNH CỦA HANG / HẦM MỎ — trả về true nếu màn vừa kết thúc
// ---------------------------------------------------------------------------
function updateCaveWorld(dt) {
    navUpdate(dt);
    caveRun.rockCD -= dt;
    updateCaveProps(dt);
    updateCaveHazards(dt);
    if (caveRun.endT > 0) { caveRun.endT -= dt; if (caveRun.endT <= 0) { caveFinish(); return true; } return false; }
    if (caveRun.pendingStage) {
        caveRun.stageT -= dt;
        if (Math.random() < dt * 14) addScreenShake(6);
        if (caveRun.stageT <= 0) { mineRun.stage = caveRun.pendingStage; caveRegenerate(); }
        return false;
    }
    const allAt = (pt, r) => !tank.active && players.some(p => !p.isDowned) && players.every(p => p.isDowned || Math.hypot(p.x - pt.x, p.y - pt.y) < r);

    if (objState === 'HANGZ_ESCAPE') {
        hangZRun.timer -= dt; mission.progress = hangZRun.floor;
        if (hangZRun.timer <= 0) caveToxic(dt);
        if (hangZRun.stairs && allAt(hangZRun.stairs, hangZRun.stairs.radius + 35)) {
            hangZRun.floor++; hangZRun.timer = Math.max(hangZRun.timer, 60) + 30;
            caveRegenerate();
            vfxList.push({ type: 'text', text: 'TẦNG ' + hangZRun.floor + '/' + hangZRun.total, x: players[0].x, y: players[0].y - 70, life: 2.0, color: '#95a5a6' });
        }
    } else if (objState === 'CAVE_ESCORT') {
        let d = caveRun.doctor;
        if (!d || d.hp <= 0) {
            caveRun.result = { reward: 0, text: 'TIẾN SĨ ĐÃ HY SINH — nhiệm vụ thất bại, cả đội rút lui.', penalty: 30 };
            caveRun.endT = 3; objState = 'CAVE_FAIL';
            vfxList.push({ type: 'text', text: 'TIẾN SĨ ĐÃ HY SINH!', x: players[0].x, y: players[0].y - 80, life: 2.5, color: '#ff4757' });
            return false;
        }
        let site = caveRun.sites[caveRun.siteIdx];
        if (d.state === 'plant' && site) {
            site.state = 1;
            caveRun.plant = Math.min(1, caveRun.plant + dt / 10);
            // Quái tràn ra quấy phá suốt lúc đặt bom
            caveRun.waveT -= dt;
            if (caveRun.waveT <= 0 && zombies.length < 50) {
                caveRun.waveT = 2.2;
                for (let k = 0; k < 2 + Math.floor(currentLevel / 3); k++) { let sp = caveSpawnPoint(); if (sp) zombies.push(new Zombie(sp.x, sp.y)); }
            }
            if (caveRun.plant >= 1) {
                site.state = 2; caveRun.plant = 0; caveRun.siteIdx++; mission.progress = caveRun.siteIdx;
                Sound.play('level'); spawnRing(site.x, site.y, '#f1c40f', 140, 0.5);
                vfxList.push({ type: 'text', text: `C4 ${caveRun.siteIdx}/3 ĐÃ GÀI!`, x: site.x, y: site.y - 50, life: 1.8, color: '#f1c40f' });
                if (caveRun.siteIdx >= 3) {
                    caveRun.stage = 'run'; caveRun.timer = 30; objState = 'CAVE_RUN'; mission.type = 'CAVE_RUN';
                    hangZRun.stairs = caveRun.exit;
                    queueRadio('Tiến Sĩ: Kíp nổ đã kích hoạt! 30 GIÂY — CHẠY RA CỬA HẦM!', null, 5);
                    Sound.play('roar');
                }
            }
        }
    } else if (objState === 'CAVE_RUN') {
        caveRun.timer -= dt;
        let d = caveRun.doctor, docOk = d && d.hp > 0;
        if (allAt(caveRun.exit, caveRun.exit.radius + 60) && (!docOk || Math.hypot(d.x - caveRun.exit.x, d.y - caveRun.exit.y) < 170)) {
            caveBigBlast();
            caveRun.result = docOk
                ? { reward: 55 + currentLevel * 2, unlock: true, text: 'THOÁT HIỂM THÀNH CÔNG! Đã mở khoá vĩnh viễn tuyến HẦM MỎ.' }
                : { reward: 25, text: 'Đã thoát nhưng Tiến Sĩ không qua khỏi — chưa mở được Hầm Mỏ.' };
            caveRun.endT = 2.2; objState = 'CAVE_DONE';
        } else if (caveRun.timer <= 0) {
            caveBigBlast();
            for (let p of players) if (!p.isDowned) p.takeDamage(p.maxHp * 0.7);
            if (docOk) d.takeDamage(9999);
            caveRun.result = { reward: 10, text: 'Không kịp thoát trước vụ nổ! Chưa mở được Hầm Mỏ.' };
            caveRun.endT = 2.5; objState = 'CAVE_FAIL';
        }
    } else if (objState === 'MINE_NESTS') {
        let left = caveProps.filter(p => p.kind === 'nest').length;
        mission.progress = mission.required - left;
        if (left === 0) {
            objState = 'MINE_EXIT'; mission.type = 'MINE_EXIT'; hangZRun.stairs = caveRun.exit;
            Sound.play('level');
            for (let p of players) vfxList.push({ type: 'text', text: 'ĐÃ PHÁ HẾT TỔ KIẾN — XUỐNG TẦNG 5!', x: p.x, y: p.y - 80, life: 2.5, color: '#f1c40f' });
        }
    } else if (objState === 'MINE_EXIT') {
        if (allAt(caveRun.exit, caveRun.exit.radius + 35)) { mineRun.floor = 5; caveRegenerate(); }
    } else if (objState === 'MINE_BOMB') {
        let core = caveProps.find(p => p.kind === 'core');
        if (core) {
            let near = !tank.active && players.some(p => !p.isDowned && Math.hypot(p.x - core.x, p.y - core.y) < 130);
            caveRun.plant = near ? Math.min(1, caveRun.plant + dt / 8) : Math.max(0, caveRun.plant - dt * 0.08);
            if (caveRun.plant >= 1) {
                caveBigBlast(core.x, core.y);
                caveProps = caveProps.filter(p => p !== core);
                for (let p of players) vfxList.push({ type: 'text', text: 'TRẦN TỔ KIẾN SẬP! CÓ THỨ GÌ ĐÓ ĐANG TRỒI LÊN...', x: p.x, y: p.y - 90, life: 2.6, color: '#e056fd' });
                caveRun.pendingStage = 'arena'; caveRun.stageT = 2.4; objState = 'MINE_COLLAPSE';
            }
        }
    } else if (objState === 'QUEEN') {
        let q = zombies.find(z => z.type === ANT.QUEEN && z.hp > 0);
        if (q) mission.progress = q.phase;
        // Hòm Tiếp Tế Hạng Nặng rơi từ trần hang
        caveRun.crateT -= dt;
        if (caveRun.crateT <= 0) {
            caveRun.crateT = (q && q.phase >= 2) ? 9 : 14;
            if (drops.filter(d => d.type === 'HEAVYBOX').length < 4) {
                let a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 440, A = caveRun.arena;
                let x = A.x + Math.cos(a) * r, y = A.y + Math.sin(a) * r;
                drops.push({ type: 'HEAVYBOX', x, y, radius: 17, lifeTime: 900 });
                createParticles(x, y, '#ecf0f1', 26, 280); spawnRing(x, y, '#e67e22', 90, 0.4); addScreenShake(5);
                vfxList.push({ type: 'text', text: 'HÒM TIẾP TẾ HẠNG NẶNG!', x, y: y - 34, life: 1.6, color: '#e67e22' });
            }
        }
    } else if (objState === 'QUEEN_RUN') {
        updateQueenRunStage(dt, allAt);
    }
    return false;
}
function caveToxic(dt) {
    for (let p of players) if (!p.isDowned) p.takeDot(55 * dt * (1 - (p.caveToxinResist || 0)));
    if (Math.random() < dt * 6) createParticles(players[0].x + (Math.random() - 0.5) * 240, players[0].y + (Math.random() - 0.5) * 180, '#7f8c8d', 1, 30);
}
function caveBigBlast(x, y) {
    let c = x === undefined ? pickAlivePlayer() : { x, y };
    Sound.play('explode'); addScreenShake(24); addScreenFlash(0.7, 100);
    for (let k = 0; k < 5; k++) { let px = c.x + (Math.random() - 0.5) * 500, py = c.y + (Math.random() - 0.5) * 500; createParticles(px, py, '#e67e22', 30, 500); vfxList.push({ type: 'flash', x: px, y: py, r: 200, life: 0.3, max: 0.3 }); }
}
function caveFinish() {
    let r = caveRun.result || {};
    shopScrap = Math.max(0, shopScrap + (r.reward || 0) - (r.penalty || 0));
    if (r.unlock) { mineUnlocked = true; try { localStorage.setItem('zs_mine_unlocked', '1'); } catch (e) { } }
    if (r.bonusUpg) for (let p of players) { p.level++; p.pendingUpgrades++; }
    hangZRun.active = false; hangZRun.stairs = null;
    mineRun.active = false; mineRun.stage = 'maze'; mineRun.floor = 4;
    mission.complete = true;
    if (r.text) netToast(r.text + (r.reward ? `  (+${r.reward} ⚙)` : ''), 4500);
    Sound.play(r.unlock || r.bonusUpg ? 'level' : 'upgrade');
    openRouteShop();
}

// ---- GIAI ĐOẠN 3 CỦA BOSS: CUỘC ĐÀO TẨU 45 GIÂY ----
function updateQueenRunStage(dt, allAt) {
    let q = zombies.find(z => z.type === ANT.QUEEN);
    if (!caveRun.pinned) {
        caveRun.timer -= dt;
        // Đá rơi chặn phía trước người dẫn đầu
        caveRun.rockT -= dt;
        if (caveRun.rockT <= 0) {
            caveRun.rockT = 1.7;
            if (!caveRun._exitField) { caveRun._exitField = new Int16Array(NAV.n * NAV.n); navFlood([caveRun.exit], caveRun._exitField); }
            let lead = pickAlivePlayer(), pt = { x: lead.x, y: lead.y };
            for (let k = 0; k < 4; k++) { let nx = navNext(caveRun._exitField, pt.x, pt.y); if (!nx) break; pt = nx; }
            hazards.push({ type: 'rockfall', x: pt.x + (Math.random() - 0.5) * 120, y: pt.y + (Math.random() - 0.5) * 120, radius: 74, timer: 1.0, life: 1.2, dmg: 30 });
        }
        if (caveRun.timer <= 0) { caveToxic(dt * 1.2); if (Math.random() < dt * 3) { let p = pickAlivePlayer(); hazards.push({ type: 'rockfall', x: p.x + (Math.random() - 0.5) * 260, y: p.y + (Math.random() - 0.5) * 200, radius: 70, timer: 0.9, life: 1.1, dmg: 35 }); } }
        if (allAt(caveRun.exit, 190)) {
            caveRun.pinned = true; mission.progress = 9;
            if (q) { q.pinned = true; q.downed = true; createParticles(q.x, q.y, '#7f8c8d', 60, 420); spawnRing(q.x, q.y, '#bdc3c7', 200, 0.5, 8); }
            addScreenShake(20); Sound.play('tank'); Sound.play('roar');
            for (let p of players) vfxList.push({ type: 'text', text: 'VÁCH ĐÁ KẸP CHẶT KIẾN CHÚA! TỚI KÍP NỔ VÀ BẤM BẮN!', x: p.x, y: p.y - 90, life: 3.0, color: '#f1c40f' });
        }
    } else {
        let det = caveProps.find(p => p.kind === 'det');
        let hero = det && players.find(p => !p.isDowned && Math.hypot(p.x - det.x, p.y - det.y) < 95 && getButtonState(p.id, 'A', 'pressed'));
        if (hero) {
            caveProps = caveProps.filter(p => p !== det);
            if (q) {
                caveBigBlast(q.x, q.y);
                explode(q.x, q.y, 320, 3000, hero, true);
                q.phase = 4; q.invuln = false; q._hpPrev = q.hp; q.hp = 0; zombieDown(q, hero);
            }
            caveRun.result = { reward: 70 + currentLevel * 3, bonusUpg: true, text: 'ĐÃ THỔI BAY KIẾN CHÚA! Cả đội được +1 cấp.' };
            caveRun.endT = 3.2; objState = 'QUEEN_DEAD';
        }
    }
}

// ---------------------------------------------------------------------------
// VẬT THỂ TRONG HẦM MỎ: tổ kiến, thùng thuốc nổ, xe mỏ, xe thuốc nổ
// ---------------------------------------------------------------------------
function updateCaveProps(dt) {
    for (let i = caveProps.length - 1; i >= 0; i--) {
        let p = caveProps[i];
        if (p.kind === 'nest') {
            if (p.hp <= 0) {
                caveProps.splice(i, 1);
                createParticles(p.x, p.y, '#6d4c41', 50, 360); createParticles(p.x, p.y, '#2ecc71', 20, 240); spawnRing(p.x, p.y, '#a1887f', 150, 0.45, 6);
                addDecal(p.x, p.y, '#2a1d14', 50, 0.5); addScreenShake(10); Sound.play('explode');
                vfxList.push({ type: 'text', text: 'TỔ KIẾN BỊ PHÁ!', x: p.x, y: p.y - 50, life: 1.6, color: '#f1c40f' });
                shopScrap += 3; spawnDrop(p.x, p.y);
                continue;
            }
            if (!p.awake) {
                if (players.some(pl => !pl.isDowned && Math.hypot(pl.x - p.x, pl.y - p.y) < 560) || p.hp < p.maxHp) {
                    p.awake = true; p.t = 4.5;
                    antSpawn(p, ANT.MINOR, 10 + Math.floor(Math.random() * 4));   // đàn kiến con đầu tiên
                    Sound.playExternal('zombie_groan', 1.2);
                }
                continue;
            }
            p.t -= dt;
            if (p.t <= 0) {
                p.t = objState === 'MINE_BOMB' && caveRun.plant > 0 ? 3.2 : 5.0;
                if (zombies.length < 55) {
                    let r = Math.random();
                    if (r < 0.5) antSpawn(p, ANT.MINOR, 4 + Math.floor(Math.random() * 2));
                    else if (r < 0.72) antSpawn(p, ANT.EXPLODER, 1 + (currentLevel >= 6 ? 1 : 0));
                    else if (r < 0.88 && drops.length > 0 && zombies.filter(z => z.type === ANT.HARVESTER).length < 3) antSpawn(p, ANT.HARVESTER, 1);
                    else antSpawn(p, ANT.SOLDIER, 1);
                }
            }
        } else if (p.kind === 'tnt') {
            if (p.hp <= 0) { p.fuse = (p.fuse === undefined ? 0.12 : p.fuse) - dt; if (p.fuse <= 0) { caveProps.splice(i, 1); explode(p.x, p.y, 210, 300); } }
        } else if (p.kind === 'cart' || p.kind === 'tntcart') {
            if (p.kind === 'tntcart' && p.hp <= 0) { caveProps.splice(i, 1); explode(p.x, p.y, 235, 420); continue; }
            p.cd = (p.cd || 0) - dt;
            if (!p.moving) {
                if (p.cd > 0 || tank.active) continue;
                for (let pl of players) {
                    if (pl.isDowned || Math.hypot(pl.x - p.x, pl.y - p.y) > p.r + pl.radius + 6) continue;
                    let sp = Math.hypot(pl.vx || 0, pl.vy || 0);
                    if (sp < 40 || (p.x - pl.x) * pl.vx + (p.y - pl.y) * pl.vy <= 0) continue;
                    // Đẩy: xe lao thẳng theo trục gần nhất với hướng đẩy
                    if (Math.abs(pl.vx) >= Math.abs(pl.vy)) { p.vx = Math.sign(pl.vx) * 640; p.vy = 0; } else { p.vx = 0; p.vy = Math.sign(pl.vy) * 640; }
                    p.moving = true; p.pusher = pl; p.hitSet = new Set(); Sound.play('tank');
                    break;
                }
            } else {
                let nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
                if (isBlockedPoint(nx + Math.sign(p.vx) * 8, ny + Math.sign(p.vy) * 8, p.r - 4)) {
                    p.moving = false; p.cd = 0.6; p.vx = p.vy = 0;
                    createParticles(p.x, p.y, '#95a5a6', 14, 200); addScreenShake(5); Sound.play('hit');
                    if (p.kind === 'tntcart') { caveProps.splice(i, 1); explode(p.x, p.y, 235, 420); }
                    continue;
                }
                p.x = nx; p.y = ny;
                if (Math.random() < dt * 30) createParticles(p.x, p.y, '#f1c40f', 1, 60);
                for (let z of zombies) {
                    if (z.hp <= 0 || z.flying || p.hitSet.has(z) || Math.hypot(z.x - p.x, z.y - p.y) > p.r + z.radius + 8) continue;
                    p.hitSet.add(z); z.hp -= 420; z.lastHitBy = p.pusher;
                    z.knockback(p.vx * 0.6 + p.vy * 0.5, p.vy * 0.6 + p.vx * 0.5);
                    createParticles(z.x, z.y, '#c0392b', 8, 260);
                    zombieDown(z, p.pusher);
                }
                for (let o of caveProps) if (o.kind === 'nest' && !p.hitSet.has(o) && Math.hypot(o.x - p.x, o.y - p.y) < o.r + p.r) { p.hitSet.add(o); o.hp -= 350; }
            }
        }
    }
}
function antSpawn(nest, type, count) {
    for (let k = 0; k < count; k++) {
        let a = Math.random() * Math.PI * 2;
        let z = new Zombie(nest.x + Math.cos(a) * (nest.r || 30), nest.y + Math.sin(a) * (nest.r || 30), type);
        z.home = { x: nest.x, y: nest.y };
        zombies.push(z);
    }
    createParticles(nest.x, nest.y, '#6d4c41', 10, 140);
}
function antRandomType() { let r = Math.random(); return r < 0.6 ? ANT.MINOR : (r < 0.8 ? ANT.EXPLODER : (r < 0.9 ? ANT.HARVESTER : ANT.SOLDIER)); }

function caveHurtProp(p, dmg, viaExplosion = false) {
    if (p.kind === 'nest') { p.hp -= dmg; p.flash = 0.08; }
    else if (p.kind === 'tnt') { p.hp -= dmg; if (viaExplosion) p.fuse = 0.12 + Math.random() * 0.15; }
    else if (p.kind === 'tntcart') { p.hp -= dmg; }
}
// Móc trong Bullet.update: đạn trúng tổ kiến / thùng thuốc nổ / xe thuốc nổ
function caveBulletProps(b) {
    for (let p of caveProps) {
        if (p.kind !== 'nest' && p.kind !== 'tnt' && p.kind !== 'tntcart') continue;
        if (b.hitSet.has(p)) continue;
        let d = b.px !== undefined ? distancePointToSegment(p.x, p.y, b.px, b.py, b.x, b.y) : Math.hypot(b.x - p.x, b.y - p.y);
        if (d > p.r + 4) continue;
        b.hitSet.add(p);
        let mult = (b.source && b.source.getTotalDamageMult) ? b.source.getTotalDamageMult() : 1;
        caveHurtProp(p, b.dmg * mult * (b.isFire || b.isAcid ? 0.3 : 1));
        createParticles(b.x, b.y, p.kind === 'nest' ? '#8d6e63' : '#e67e22', 4, 160);
        if (b.isFire || b.isAcid) continue;
        if (b.isTankShell || b.isExplosiveProj || b.isBomb) { b.triggerHit(); return true; }
        if (b.pierce > 0) { b.pierce--; continue; }
        b.triggerHit(); return true;
    }
    return false;
}
// Móc trong Slash.update: chém trúng tổ kiến / thùng thuốc nổ
function caveSlashProps(s) {
    for (let p of caveProps) {
        if ((p.kind !== 'nest' && p.kind !== 'tnt' && p.kind !== 'tntcart') || s.hitTargets.has(p)) continue;
        if (Math.hypot(p.x - s.x, p.y - s.y) >= s.range + p.r) continue;
        let a = Math.atan2(p.y - s.y, p.x - s.x), diff = Math.atan2(Math.sin(a - s.angle), Math.cos(a - s.angle));
        if (Math.abs(diff) > s.spread / 2) continue;
        s.hitTargets.add(p);
        caveHurtProp(p, s.dmg * (s.source && s.source.getTotalDamageMult ? s.source.getTotalDamageMult() : 1));
        createParticles(p.x, p.y, '#8d6e63', 8, 220);
    }
    for (let o of obstacles) {
        if (o.hp === undefined || s.hitTargets.has(o)) continue;
        let ox = o.x + o.w / 2, oy = o.y + o.h / 2;
        if (Math.hypot(ox - s.x, oy - s.y) >= s.range + Math.max(o.w, o.h) / 2) continue;
        s.hitTargets.add(o); caveHitRubble(o, s.dmg * 0.6);
    }
}
function caveHitRubble(o, dmg) {
    o.hp -= dmg; o.flash = 0.08;
    if (o.hp > 0) return;
    let i = obstacles.indexOf(o);
    if (i >= 0) obstacles.splice(i, 1);
    NAV.dirty = true;
    createParticles(o.x + o.w / 2, o.y + o.h / 2, '#95a5a6', 40, 320); addScreenShake(6); Sound.play('hit');
    vfxList.push({ type: 'text', text: 'THÔNG ĐƯỜNG!', x: o.x + o.w / 2, y: o.y + o.h / 2 - 20, life: 1.2, color: '#ecf0f1' });
}
// Móc trong explode(): nổ lan sang thùng thuốc nổ, phá đá chặn đường, làm lở đá trần hang, chôn chân Kiến Chúa
function caveOnExplosion(x, y, radius, dmg) {
    if (!isCaveMap()) return;
    for (let p of caveProps) {
        let d = Math.hypot(p.x - x, p.y - y);
        if (d < radius + (p.r || 0)) caveHurtProp(p, dmg * Math.max(0.3, 1 - d / radius) * (p.kind === 'nest' ? 1.5 : 1), true);
    }
    for (let i = obstacles.length - 1; i >= 0; i--) {
        let o = obstacles[i];
        if (o.hp === undefined) continue;
        let cx = Math.max(o.x, Math.min(x, o.x + o.w)), cy = Math.max(o.y, Math.min(y, o.y + o.h));
        if (Math.hypot(cx - x, cy - y) < radius) caveHitRubble(o, dmg * 6);
    }
    let q = objState === 'QUEEN_RUN' ? zombies.find(z => z.type === ANT.QUEEN && z.phase === 3) : null;
    if (q && !q.pinned && !(q.trapCD > 0) && Math.hypot(q.x - x, q.y - y) < radius + q.radius + 40) {
        q.trapT = 2.6; q.trapCD = 5;
        createParticles(q.x, q.y, '#7f8c8d', 50, 380); spawnRing(q.x, q.y, '#bdc3c7', 170, 0.4, 6);
        vfxList.push({ type: 'text', text: 'ĐÁ ĐÈ CHÂN KIẾN CHÚA!', x: q.x, y: q.y - q.radius - 30, life: 1.6, color: '#f1c40f' });
    }
    // Lở đá: báo trước rồi mới rơi, đôi khi để lại đá chặn đường (bắn hoặc nổ để phá)
    if (caveRun.rockCD > 0 || objState === 'QUEEN_RUN' || Math.random() > 0.6) return;
    caveRun.rockCD = 1.3;
    let n = 1 + (Math.random() < 0.4 ? 1 : 0);
    for (let k = 0; k < n; k++) {
        let a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 220;
        let pt = findSafePoint(x + Math.cos(a) * r, y + Math.sin(a) * r, 30);
        hazards.push({ type: 'rockfall', x: pt.x, y: pt.y, radius: 84, timer: 1.2, life: 1.4, dmg: 55, leave: objState !== 'QUEEN' && Math.random() < 0.3 });
    }
}

// Hiểm hoạ riêng của hang: đá rơi, bom axit của Kiến Chúa, tia quét 1/4 sàn của xúc tu
function updateCaveHazards(dt) {
    for (let h of hazards) {
        if (h.done) continue;
        if (h.type === 'rockfall' && h.timer <= 0) {
            h.done = true; h.life = 0;
            hurtPlayersInRadius(h.x, h.y, h.radius, h.dmg || 50, { stun: 0.35 });
            for (let z of zombies) if (z.hp > 0 && !z.flying && z.type < 45 && Math.hypot(z.x - h.x, z.y - h.y) < h.radius + z.radius) { z.hp -= 180; z.stunTimer = Math.max(z.stunTimer || 0, 0.6); }
            for (let n of rescueNPCs) if (n.hp > 0 && Math.hypot(n.x - h.x, n.y - h.y) < h.radius) n.takeDamage(25);
            if (tank.active && tank.p2InvulnTimer <= 0 && Math.hypot(tank.x - h.x, tank.y - h.y) < h.radius + tank.radius) tank.hp -= (h.dmg || 50) * 0.5;
            createParticles(h.x, h.y, '#95a5a6', 36, 320); createParticles(h.x, h.y, '#5d5d5d', 14, 160);
            spawnRing(h.x, h.y, '#bdc3c7', h.radius * 1.2, 0.35, 5); addDecal(h.x, h.y, '#2b2b2b', h.radius * 0.5, 0.4);
            addScreenShake(9); Sound.play('tank');
            if (h.leave && caveRun.exit && Math.hypot(h.x - caveRun.exit.x, h.y - caveRun.exit.y) > 200 && !caveProps.some(p => Math.hypot(p.x - h.x, p.y - h.y) < 110)) {
                obstacles.push({ type: 'rubble', x: h.x - 44, y: h.y - 44, w: 88, h: 88, hp: 260, maxHp: 260 });
                NAV.dirty = true;
            }
        } else if (h.type === 'acidbomb' && h.timer <= 0) {
            h.done = true; h.life = 0;
            hurtPlayersInRadius(h.x, h.y, h.radius, h.dmg || 26);
            for (let p of players) if (!p.isDowned && Math.hypot(p.x - h.x, p.y - h.y) < h.radius) applyPlayerStatus(p, STATUS.CORROSION, { duration: 3, stacks: 1, dpsPercent: 0.003, maxStacks: 6 });
            fireZones.push({ kind: 'acid', x: h.x, y: h.y, life: 2.5, dmg: 12, source: null, radius: h.radius * 0.9 });
            createParticles(h.x, h.y, '#2ecc71', 26, 260); spawnRing(h.x, h.y, '#2ecc71', h.radius, 0.3);
            Sound.play('hit');
        } else if (h.type === 'quad' && h.timer <= 0) {
            if (!h.fired) { h.fired = true; addScreenShake(12); Sound.play('plasma'); }
            for (let p of players) {
                if (p.isDowned) continue;
                let d = Math.hypot(p.x - h.x, p.y - h.y), a = Math.atan2(p.y - h.y, p.x - h.x);
                if (d < h.radius && d > 90 && Math.abs(Math.atan2(Math.sin(a - h.angle), Math.cos(a - h.angle))) < Math.PI / 4) p.takeDot((h.dmg || 110) * dt);
            }
        }
    }
}

// Hòm Tiếp Tế Hạng Nặng (đấu trường Kiến Chúa): tay không -> vũ khí nổ; đang cầm súng -> nạp đầy đạn
function caveTakeHeavyBox(p) {
    if (!p.weapon) {
        let key = Math.random() < 0.7 ? 'GLAUNCHER' : 'GRENADE';
        p.weapon = { ...WEAPON_TYPES[key] };
        vfxList.push({ type: 'text', text: p.weapon.name + ' (VŨ KHÍ NỔ)', x: p.x, y: p.y - 40, life: 1.6, color: '#e67e22' });
        Sound.play('reload_big');
    } else {
        p.weapon.ammo = p.weapon.maxAmmo; p.applyHeal(20);
        vfxList.push({ type: 'text', text: 'ĐẦY ĐẠN!  (vứt súng [B] để nhặt vũ khí nổ)', x: p.x, y: p.y - 40, life: 1.8, color: '#e67e22' });
        Sound.play('reload_big');
    }
    createParticles(p.x, p.y, '#e67e22', 20, 160);
    return true;
}

// ---------------------------------------------------------------------------
// LOÀI KIẾN
// ---------------------------------------------------------------------------
function antBite(z, dmg, cd) {
    if (z.atkCD > 0) return;
    if (tank.active) { if (tank.p2InvulnTimer <= 0 && Math.hypot(z.x - tank.x, z.y - tank.y) < z.radius + tank.radius + 5) { tank.hp -= dmg * 0.5; z.atkCD = cd; } return; }
    for (let p of players) if (!p.isDowned && Math.hypot(z.x - p.x, z.y - p.y) < z.radius + p.radius + 6) { p.takeDamage(dmg); z.atkCD = cd; }
    for (let n of rescueNPCs) if (n.hp > 0 && Math.hypot(z.x - n.x, z.y - n.y) < z.radius + n.radius + 6) { n.takeDamage(dmg); z.atkCD = cd; }
    for (let a of allies) if (a.hp > 0 && Math.hypot(z.x - a.x, z.y - a.y) < z.radius + a.radius + 6) { a.takeDamage(dmg); z.atkCD = cd; }
}

// Móc trong updateSpecialZombie cho mọi loại >= 40
function updateAnt(z, target, dist, ang, dt, speed) {
    const move = (a, spd) => { z.x += (Math.cos(a) * spd + z.kbX) * dt; z.y += (Math.sin(a) * spd + z.kbY) * dt; resolveCollision(z); };

    if (z.type === ANT.MINOR) {                    // KIẾN CON: nhỏ, cực nhanh, đi theo đàn
        move(ang + Math.sin(survivalTime * 6 + z.nid) * 0.3, speed);
        antBite(z, 6, 0.6);
        return true;
    }
    if (z.type === ANT.EXPLODER) {                 // KIẾN NỔ: áp sát là tự kích nổ
        if (dist < z.radius + (target.radius || 15) + 24) { z.hp = 0; return true; }
        move(ang, speed);
        return true;
    }
    if (z.type === ANT.HARVESTER) {                // KIẾN THỢ: không tấn công, chỉ tha vật phẩm về tổ
        z.reT = (z.reT || 0) - dt;
        if (!z.carry) {
            if (z.reT <= 0 || !z.goal || drops.indexOf(z.goal) < 0) {
                z.reT = 1.0;
                let best = null, bd = 1e9;
                for (let d of drops) { if (d.type === 'SHARD') continue; let dd = Math.hypot(d.x - z.x, d.y - z.y); if (dd < bd) { bd = dd; best = d; } }
                z.goal = best;
            }
            if (!z.goal) { move(ang + Math.PI, speed * 0.5); return true; }
            if (Math.hypot(z.goal.x - z.x, z.goal.y - z.y) < z.radius + 16) {
                z.carry = z.goal.type; drops.splice(drops.indexOf(z.goal), 1); z.goal = null;
                vfxList.push({ type: 'text', text: 'KIẾN THỢ CƯỚP ĐỒ!', x: z.x, y: z.y - 26, life: 1.2, color: '#f1c40f' });
                Sound.play('pickup');
                return true;
            }
            navMoveTo(z, z.goal.x, z.goal.y, speed, dt);
        } else {
            let h = z.home || { x: z.x, y: z.y };
            if (Math.hypot(h.x - z.x, h.y - z.y) < 48) {
                vfxList.push({ type: 'text', text: 'ĐỒ BỊ THA MẤT!', x: z.x, y: z.y - 26, life: 1.4, color: '#ff7675' });
                z.carry = null; z.gone = true; z.noLoot = true; z._credited = true; z.hp = 0;
                return true;
            }
            navMoveTo(z, h.x, h.y, speed * 0.8, dt);
        }
        return true;
    }
    if (z.type === ANT.SOLDIER) {                  // KIẾN LÍNH: bay lượn (không thể bị nhắm) rồi sà xuống tấn công
        z.sT -= dt;
        if (z.sState === 'ground') {
            move(ang, speed); antBite(z, 20, 0.8);
            if (z.sT <= 0 && dist < 700) { z.sState = 'fly'; z.sT = 3.0 + Math.random(); z.flying = true; z.flyAng = Math.atan2(z.y - target.y, z.x - target.x); createParticles(z.x, z.y, '#dff9fb', 10, 120); }
        } else if (z.sState === 'fly') {
            z.flyAng += dt * 1.7;
            let gx = target.x + Math.cos(z.flyAng) * 220, gy = target.y + Math.sin(z.flyAng) * 220;
            let d = Math.hypot(gx - z.x, gy - z.y), a = Math.atan2(gy - z.y, gx - z.x), sp = Math.min(290, d * 4);
            z.x += Math.cos(a) * sp * dt; z.y += Math.sin(a) * sp * dt;
            if (z.sT <= 0) { z.sState = 'dive'; z.warnBeamTimer = 0.55; z.diveX = z.targetX = target.x; z.diveY = z.targetY = target.y; }
        } else {
            if (z.warnBeamTimer > 0) { z.warnBeamTimer -= dt; return true; }
            let d = Math.hypot(z.diveX - z.x, z.diveY - z.y), a = Math.atan2(z.diveY - z.y, z.diveX - z.x), stp = 720 * dt;
            if (d <= stp + 6) {
                z.x = z.diveX; z.y = z.diveY; z.flying = false; resolveCollision(z);
                z.sState = 'ground'; z.sT = 3.5; z.atkCD = 0.5;
                hurtPlayersInRadius(z.x, z.y, 72, 22);
                for (let n of rescueNPCs) if (n.hp > 0 && Math.hypot(n.x - z.x, n.y - z.y) < 72) n.takeDamage(16);
                spawnRing(z.x, z.y, '#c0392b', 80, 0.25); createParticles(z.x, z.y, '#95a5a6', 12, 180); addScreenShake(4);
            } else { z.x += Math.cos(a) * stp; z.y += Math.sin(a) * stp; }
        }
        return true;
    }
    if (z.type === ANT.TENTACLE) {                 // XÚC TU: đứng yên ở góc, hết giờ thì quét sạch 1/4 sàn đấu
        z.kbX = z.kbY = 0; if (z.homeX !== undefined) { z.x = z.homeX; z.y = z.homeY; }
        z.beamT -= dt;
        let A = caveRun.arena;
        if (z.beamT <= 0 && A) {
            z.beamT = 20;
            hazards.push({ type: 'quad', x: A.x, y: A.y, angle: z.quadAng, radius: A.r, timer: 1.8, life: 2.7, dmg: 110 });
            vfxList.push({ type: 'text', text: 'XÚC TU QUÉT SÀN! RỜI KHỎI GÓC NÀY!', x: z.x, y: z.y - 60, life: 1.8, color: '#ff4757' });
            Sound.play('roar');
        }
        if (z.atkCD <= 0 && players.some(p => !p.isDowned && Math.hypot(p.x - z.x, p.y - z.y) < 130)) {
            hazards.push({ type: 'quake', x: z.x, y: z.y, radius: 135, timer: 0.7, life: 0.9, dmg: 28, stun: 0.3 });
            z.atkCD = 3.2;
        }
        return true;
    }
    if (z.type === ANT.QUEEN) return updateQueen(z, target, dist, ang, dt);
    move(ang, speed);
    return true;
}

// Kiến chết: Kiến Nổ để lại vệt axit 2 giây, Kiến Thợ làm rơi lại món đồ đang tha
function antDeath(z) {
    if (z.gone) return;
    if (z.type === ANT.EXPLODER) {
        fireZones.push({ kind: 'acid', x: z.x, y: z.y, life: 2.0, dmg: 16, source: null, radius: 78 });
        hurtPlayersInRadius(z.x, z.y, 78, 14);
        for (let n of rescueNPCs) if (n.hp > 0 && Math.hypot(n.x - z.x, n.y - z.y) < 78) n.takeDamage(10);
        createParticles(z.x, z.y, '#2ecc71', 30, 280); spawnRing(z.x, z.y, '#2ecc71', 78, 0.3);
        Sound.play('hit');
    } else {
        createParticles(z.x, z.y, z.type === ANT.QUEEN ? '#8e44ad' : '#6d4c41', z.type === ANT.MINOR ? 6 : 14, 200);
        if (z.type === ANT.HARVESTER && z.carry) {
            drops.push({ type: z.carry, x: z.x, y: z.y, radius: z.carry === 'FOOD' ? 12 : 16, lifeTime: 900 });
            vfxList.push({ type: 'text', text: 'LẤY LẠI ĐỒ!', x: z.x, y: z.y - 24, life: 1.0, color: '#2ecc71' });
        }
    }
}

// Lọc sát thương cho Kiến Chúa & Xúc Tu (gọi trong zombieDown và mỗi khung hình)
function antDamageFilter(z) {
    if (z._hpPrev === undefined) z._hpPrev = z.maxHp;
    let delta = z._hpPrev - z.hp;
    if (delta > 0) {
        let s = 1;
        if (z.type === ANT.TENTACLE) s = z._expHit ? 3 : 0.3;                      // chỉ vũ khí nổ mới gây sát thương lớn
        else if (z.phase === 1) s = z.exhaust > 0 ? 2 : (z.airborne ? 0.5 : 1);    // đang bay: đạn giảm nửa; kiệt sức: x2
        else if (z.phase === 2) s = 0;                                             // phòng thủ tuyệt đối
        else if (z.phase === 3) { s = 0; if (!z.pinned) z.staggerT = 0.45; }       // đào tẩu: trúng đạn chỉ làm nó khựng lại
        z.hp = z._hpPrev - delta * s;
        if (z.type === ANT.QUEEN && z.phase === 1) z.hp = Math.max(z.hp, z.maxHp * 0.5);
    }
    z._hpPrev = z.hp; z._expHit = false;
}

// ---------------------------------------------------------------------------
// BOSS: KIẾN CHÚA
// ---------------------------------------------------------------------------
function queenClamp(z) {
    let A = caveRun.arena; if (!A) return;
    let d = Math.hypot(z.x - A.x, z.y - A.y), lim = A.r - z.radius - 20;
    if (d > lim) { z.x = A.x + (z.x - A.x) / d * lim; z.y = A.y + (z.y - A.y) / d * lim; }
}
function queenAcid(x, y, timer, radius = 85) { hazards.push({ type: 'acidbomb', x, y, radius, timer, life: timer + 0.2, dmg: 26 }); }

function updateQueen(z, target, dist, ang, dt) {
    z.kbX = z.kbY = 0;
    const A = caveRun.arena;
    if (z.phase === 3) return updateQueenChase(z, target, dist, ang, dt);
    if (z.phase >= 4 || !A) return true;

    if (z.phase === 1) {
        // ---- PHASE 1: THỐNG LĨNH BẦU TRỜI ----
        if (z.exhaust > 0) {
            z.exhaust -= dt; z.airborne = false; z.downed = true;
            if (z.exhaust <= 0) { z.downed = false; z.airborne = true; z.skillN = 0; z.spCD = 1.6; bossSay(z, 'CẤT CÁNH!'); createParticles(z.x, z.y, '#dff9fb', 30, 260); }
            return true;
        }
        if (z.hp <= z.maxHp * 0.55 && !z.isCharging && !(z.warnBeamTimer > 0) && !(z.barrageT > 0)) return queenStartPhase2(z, A);
        z.airborne = true;
        if (z.barrageT > 0) {
            z.barrageT -= dt;
            if (z.barrageT <= 0) {
                z.exhaust = 4.0; z.airborne = false; z.downed = true;
                bossSay(z, 'KIỆT SỨC! SÁT THƯƠNG x2', '#f1c40f'); addScreenShake(12); spawnRing(z.x, z.y, '#f1c40f', 160, 0.5, 6); Sound.play('tank');
            }
            return true;
        }
        if (updateZombieCharge(z, dt, { speed: 600, time: 1.2, dmg: 38, stun: 0.6, push: 160, selfStun: 1.2 })) { queenClamp(z); return true; }
        if (z.spCD <= 0) {
            if ((z.skillN || 0) >= 3) {
                // Xả axit diện rộng toàn sàn đấu -> sau đó rơi xuống kiệt sức 4 giây
                for (let k = 0; k < 18; k++) { let a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (A.r - 80); queenAcid(A.x + Math.cos(a) * r, A.y + Math.sin(a) * r, 0.9 + k * 0.13, 92); }
                for (let p of players) if (!p.isDowned) queenAcid(p.x, p.y, 1.4);
                z.barrageT = 3.5; bossSay(z, 'MƯA AXIT TOÀN SÀN!', '#2ecc71'); Sound.play('roar');
            } else {
                let skill = pickBossSkill(z, ['spit', 'spit', 'swoop']);
                if (skill === 'spit') {
                    for (let k = 0; k < 6; k++) queenAcid(target.x + (k ? (Math.random() - 0.5) * 380 : 0), target.y + (k ? (Math.random() - 0.5) * 380 : 0), 0.9 + k * 0.18);
                    bossSay(z, 'CHÙM AXIT!', '#2ecc71');
                } else { startZombieCharge(z, target, 0.9, 700); bossSay(z, 'SÀ XUỐNG!'); }
                z.skillN = (z.skillN || 0) + 1;
            }
            z.spCD = 2.7;
        }
        // Lượn vòng quanh người chơi, giữ khoảng cách
        let want = dist > 380 ? ang : (dist < 250 ? ang + Math.PI : ang + Math.PI / 2);
        z.x += Math.cos(want) * z.baseSpeed * dt; z.y += Math.sin(want) * z.baseSpeed * dt;
        queenClamp(z);
        return true;
    }

    // ---- PHASE 2: PHÒNG THỦ TUYỆT ĐỐI & 4 XÚC TU ----
    z.airborne = false;
    let dc = Math.hypot(A.x - z.x, A.y - z.y);
    if (dc > 8) { let a = Math.atan2(A.y - z.y, A.x - z.x), st = Math.min(dc, 320 * dt); z.x += Math.cos(a) * st; z.y += Math.sin(a) * st; }
    if (z.breaking > 0) {
        z.breaking -= dt;
        if (Math.random() < dt * 12) { let a = Math.random() * Math.PI * 2, r = Math.random() * A.r; vfxList.push({ type: 'bolt', x: A.x + Math.cos(a) * r, y: A.y + Math.sin(a) * r, life: 0.25, max: 0.25, seed: Math.random() * 1000 }); addScreenShake(10); }
        if (z.breaking <= 0 && !caveRun.pendingStage) { mineRun.queenPct = 0.3; caveRun.pendingStage = 'tunnel'; caveRun.stageT = 0.4; }
        return true;
    }
    if (!zombies.some(e => e.type === ANT.TENTACLE && e.hp > 0)) {
        z.breaking = 2.4;
        bossSay(z, 'SÀN ĐẤU SỤP ĐỔ!', '#48dbfb'); Sound.play('lightning'); Sound.play('explode'); addScreenFlash(0.7, 100);
        for (let e of zombies) if (e !== z && e.type < 45) e.hp = 0;
        return true;
    }
    // Trần hang sụp từng mảng
    caveRun.rockT -= dt;
    if (caveRun.rockT <= 0) {
        caveRun.rockT = 2.3;
        let p = pickAlivePlayer(), x = p.x + (Math.random() - 0.5) * 360, y = p.y + (Math.random() - 0.5) * 360;
        let d = Math.hypot(x - A.x, y - A.y); if (d > A.r - 90) { x = A.x + (x - A.x) / d * (A.r - 90); y = A.y + (y - A.y) / d * (A.r - 90); }
        hazards.push({ type: 'rockfall', x, y, radius: 80, timer: 1.1, life: 1.3, dmg: 45 });
    }
    // Kiến Lính & Kiến Thợ tràn ra cướp hòm tiếp tế
    caveRun.spawnT -= dt;
    if (caveRun.spawnT <= 0) {
        caveRun.spawnT = 8;
        let a = Math.random() * Math.PI * 2, edge = { x: A.x + Math.cos(a) * (A.r - 70), y: A.y + Math.sin(a) * (A.r - 70), r: 20 };
        if (zombies.filter(e => e.type === ANT.SOLDIER).length < 4) antSpawn(edge, ANT.SOLDIER, 1);
        if (drops.length > 0 && zombies.filter(e => e.type === ANT.HARVESTER).length < 3) antSpawn(edge, ANT.HARVESTER, 1);
        if (zombies.filter(e => e.type === ANT.MINOR).length < 12) antSpawn(edge, ANT.MINOR, 4);
    }
    return true;
}
function queenStartPhase2(z, A) {
    z.phase = 2; z.phase2Done = true; z.airborne = false; z.downed = false; z.exhaust = 0;
    bossSay(z, 'PHÒNG THỦ TUYỆT ĐỐI!', '#48dbfb'); Sound.play('roar'); addScreenShake(16);
    for (let k = 0; k < 4; k++) {
        let a = Math.PI / 4 + k * Math.PI / 2;
        let t = new Zombie(A.x + Math.cos(a) * 520, A.y + Math.sin(a) * 520, ANT.TENTACLE);
        t.homeX = t.x; t.homeY = t.y; t.quadAng = a; t.beamT = 16 + k * 5;
        zombies.push(t);
        createParticles(t.x, t.y, '#6ab04c', 30, 260);
        caveProps.push({ kind: 'tnt', x: A.x + Math.cos(a + 0.22) * 410, y: A.y + Math.sin(a + 0.22) * 410, r: 16, hp: 30, maxHp: 30 });
    }
    caveRun.crateT = 2; caveRun.spawnT = 6; caveRun.rockT = 3;
    queueRadio('Bộ đàm: Nó bất tử rồi! Phá 4 XÚC TU ở bốn góc bằng VŨ KHÍ NỔ (hòm hạng nặng, thùng TNT) trước khi chúng quét sàn!', null, 7);
    return true;
}
// PHASE 3: rách cánh, bò đuổi sát lưng trong đường hầm
function updateQueenChase(z, target, dist, ang, dt) {
    z.trapCD = (z.trapCD || 0) - dt;
    if (z.pinned) { z.downed = true; return true; }
    if (z.trapT > 0) { z.trapT -= dt; z.downed = true; if (Math.random() < dt * 10) createParticles(z.x, z.y, '#7f8c8d', 2, 120); return true; }
    z.downed = false;
    if (z.staggerT > 0) z.staggerT -= dt;
    let fast = 220; for (let p of players) if (!p.isDowned) fast = Math.max(fast, p.curSpeed || 0);
    let sp = Math.max(250, fast * 1.12);
    if (dist > 900) sp *= 1.4;
    if (z.staggerT > 0) sp *= 0.3;
    z.x += Math.cos(ang) * sp * dt; z.y += Math.sin(ang) * sp * dt; resolveCollision(z);
    if (Math.random() < dt * 20) createParticles(z.x, z.y, '#5d4037', 1, 120);
    antBite(z, 40, 0.8);
    return true;
}

// ---------------------------------------------------------------------------
// PHẦN VẼ
// ---------------------------------------------------------------------------
function caveObjectiveText() {
    const fmt = (s) => { s = Math.max(0, s); let m = Math.floor(s / 60), ss = Math.floor(s % 60); return `${m}:${ss < 10 ? '0' : ''}${ss}`; };
    switch (objState) {
        case 'HANGZ_ESCAPE': return [`HANG Z ${hangZRun.floor}/${hangZRun.total} - ${fmt(hangZRun.timer)}`, hangZRun.timer <= 30 ? '#ff4757' : '#ecf0f1'];
        case 'CAVE_ESCORT': return [`HỘ TỐNG TIẾN SĨ - C4: ${mission.progress}/3` + (caveRun.plant > 0 ? `  (ĐANG GÀI ${Math.floor(caveRun.plant * 100)}%)` : ''), '#f1c40f'];
        case 'CAVE_RUN': return [`CHẠY RA CỬA HẦM! ${Math.ceil(Math.max(0, caveRun.timer))}s`, '#ff4757'];
        case 'CAVE_DONE': return ['THOÁT HIỂM!', '#2ecc71'];
        case 'CAVE_FAIL': return ['NHIỆM VỤ THẤT BẠI', '#ff4757'];
        case 'MINE_NESTS': return [`HẦM MỎ T4 - PHÁ TỔ KIẾN: ${mission.progress}/${mission.required}`, '#e67e22'];
        case 'MINE_EXIT': return ['TÌM LỐI XUỐNG TẦNG 5', '#ecf0f1'];
        case 'MINE_BOMB': return [caveRun.plant > 0 ? `ĐANG GÀI BOM LÕI TỔ: ${Math.floor(caveRun.plant * 100)}%` : 'HẦM MỎ T5 - GÀI BOM VÀO LÕI TỔ KIẾN', '#e67e22'];
        case 'MINE_COLLAPSE': return ['TRẦN HANG ĐANG SẬP...', '#e056fd'];
        case 'QUEEN':
            if (mission.progress >= 2) return [`PHÁ XÚC TU BẰNG VŨ KHÍ NỔ: ${4 - zombies.filter(z => z.type === ANT.TENTACLE && z.hp > 0).length}/4`, '#48dbfb'];
            return ['KIẾN CHÚA - CHỜ NÓ KIỆT SỨC RỒI DỒN HOẢ LỰC', '#e056fd'];
        case 'QUEEN_RUN':
            if (mission.progress >= 9) return ['TỚI KÍP NỔ VÀ BẤM BẮN!', '#f1c40f'];
            return [caveRun.timer > 0 ? `CHẠY TỚI CỬA HẦM! ${Math.ceil(caveRun.timer)}s` : 'HANG ĐANG SẬP - CHẠY!', '#ff4757'];
        case 'QUEEN_DEAD': return ['KIẾN CHÚA ĐÃ BỊ TIÊU DIỆT!', '#2ecc71'];
    }
    return null;
}
function cavePointers(ptr) {
    if (hangZRun.stairs) ptr(hangZRun.stairs.x, hangZRun.stairs.y, '#ecf0f1');
    for (let n of rescueNPCs) if (n.isDoctor && n.hp > 0) ptr(n.x, n.y, '#2ecc71');
    for (let p of caveProps) {
        if (p.kind === 'c4' && p.state < 2 && p.idx === mission.progress && objState === 'CAVE_ESCORT') ptr(p.x, p.y, '#f1c40f');
        else if (p.kind === 'nest' && objState === 'MINE_NESTS') ptr(p.x, p.y, '#e67e22');
        else if (p.kind === 'core') ptr(p.x, p.y, '#e056fd');
        else if (p.kind === 'det' && mission.progress >= 9) ptr(p.x, p.y, '#f1c40f');
    }
    for (let z of zombies) { if (z.type === ANT.QUEEN) ptr(z.x, z.y, '#e056fd'); else if (z.type === ANT.TENTACLE) ptr(z.x, z.y, '#48dbfb'); }
    if (objState === 'QUEEN') for (let d of drops) if (d.type === 'HEAVYBOX') ptr(d.x, d.y, '#e67e22');
}
function caveLights(hole) {
    for (let p of caveProps) {
        if (p.kind === 'c4') hole(p.x, p.y, 120, p.state === 2 ? 0.55 : 0.35);
        else if (p.kind === 'core') hole(p.x, p.y, 190, 0.5);
        else if (p.kind === 'nest') hole(p.x, p.y, 110, 0.25);
        else if (p.kind === 'det') hole(p.x, p.y, 150, 0.6);
        else if (p.kind === 'tnt' || p.kind === 'tntcart') hole(p.x, p.y, 60, 0.3);
    }
    for (let n of rescueNPCs) if (n.isDoctor && n.hp > 0) hole(n.x, n.y, 150, 0.7);
    for (let d of drops) if (d.type === 'HEAVYBOX') hole(d.x, d.y, 90, 0.5);
    for (let h of hazards) if (h.type === 'acidbomb' || h.type === 'rockfall') hole(h.x, h.y, h.radius * 1.2, 0.35);
    for (let z of zombies) if (z.type === ANT.EXPLODER) hole(z.x, z.y, 55, 0.4); else if (z.type >= 45) hole(z.x, z.y, z.radius * 3.2, 0.5);
}

function drawCaveProps(T, vis) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let p of caveProps) {
        if (!vis(p.x, p.y, 120)) continue;
        if (p.kind === 'nest') {
            let pul = 1 + Math.sin(T * 3 + p.x) * 0.04;
            ctx.beginPath(); ctx.ellipse(p.x, p.y + 6, p.r * 1.25 * pul, p.r * 0.95 * pul, 0, 0, Math.PI * 2); ctx.fillStyle = '#3e2a1c'; ctx.fill();
            ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * pul, p.r * 0.8 * pul, 0, 0, Math.PI * 2); ctx.fillStyle = p.flash > 0 ? '#fff' : '#6d4c41'; ctx.fill(); ctx.strokeStyle = '#2a1d14'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#120c08';
            for (let k = 0; k < 5; k++) { let a = k * 1.256 + 0.4; ctx.beginPath(); ctx.ellipse(p.x + Math.cos(a) * p.r * 0.5, p.y + Math.sin(a) * p.r * 0.38, 8, 6, a, 0, Math.PI * 2); ctx.fill(); }
            ctx.beginPath(); ctx.ellipse(p.x, p.y, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
            if (p.awake) { ctx.fillStyle = `rgba(46, 204, 113, ${0.25 + 0.2 * Math.sin(T * 6)})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 9, 6, 0, 0, Math.PI * 2); ctx.fill(); }
            drawMiniBar(p.x, p.y - p.r - 14, 60, 6, p.hp, p.maxHp, '#e67e22');
            outlinedText('TỔ KIẾN', p.x, p.y - p.r - 24, '#e67e22', 'bold 11px Arial');
            if (p.flash > 0) p.flash -= 0.016;
        } else if (p.kind === 'tnt') {
            drawShadow(p.x, p.y, p.r);
            let blink = p.hp <= 0 && Math.floor(T * 20) % 2;
            ctx.fillStyle = blink ? '#fff' : '#c0392b'; ctx.fillRect(p.x - 13, p.y - 16, 26, 32);
            ctx.fillStyle = '#7b241c'; ctx.fillRect(p.x - 13, p.y - 10, 26, 3); ctx.fillRect(p.x - 13, p.y + 7, 26, 3);
            ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 13, p.y - 16, 26, 32);
            ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 9px Arial'; ctx.fillText('TNT', p.x, p.y);
        } else if (p.kind === 'cart' || p.kind === 'tntcart') {
            drawShadow(p.x, p.y, p.r);
            ctx.fillStyle = '#2d3436'; ctx.fillRect(p.x - 24, p.y - 22, 8, 10); ctx.fillRect(p.x + 16, p.y - 22, 8, 10); ctx.fillRect(p.x - 24, p.y + 12, 8, 10); ctx.fillRect(p.x + 16, p.y + 12, 8, 10);
            ctx.fillStyle = '#636e72'; ctx.fillRect(p.x - 20, p.y - 17, 40, 34); ctx.strokeStyle = '#1e272e'; ctx.lineWidth = 2.5; ctx.strokeRect(p.x - 20, p.y - 17, 40, 34);
            ctx.fillStyle = '#2d3436'; ctx.fillRect(p.x - 15, p.y - 12, 30, 24);
            if (p.kind === 'tntcart') {
                ctx.fillStyle = '#c0392b'; ctx.fillRect(p.x - 13, p.y - 10, 11, 20); ctx.fillRect(p.x + 2, p.y - 10, 11, 20);
                ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 8px Arial'; ctx.fillText('TNT', p.x, p.y);
            } else { ctx.fillStyle = '#7f8c8d'; ctx.beginPath(); ctx.arc(p.x - 5, p.y - 2, 6, 0, Math.PI * 2); ctx.arc(p.x + 6, p.y + 3, 5, 0, Math.PI * 2); ctx.fill(); }
            if (!p.moving) outlinedText(p.kind === 'tntcart' ? 'XE THUỐC NỔ — ĐẨY!' : 'XE MỎ — ĐẨY!', p.x, p.y - 32, p.kind === 'tntcart' ? '#ff7675' : '#dfe6e9', 'bold 10px Arial');
        } else if (p.kind === 'c4') {
            ctx.setLineDash(p.state === 2 ? [] : [8, 8]);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.strokeStyle = p.state === 2 ? '#e74c3c' : 'rgba(241,196,15,0.7)'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
            ctx.fillStyle = p.state === 2 ? `rgba(231,76,60,${0.12 + 0.1 * Math.sin(T * 10)})` : 'rgba(241,196,15,0.08)'; ctx.fill();
            if (p.state === 2) { ctx.fillStyle = '#2d3436'; ctx.fillRect(p.x - 12, p.y - 8, 24, 16); ctx.fillStyle = Math.floor(T * 6) % 2 ? '#ff3838' : '#7b241c'; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); }
            outlinedText(p.state === 2 ? 'C4 ĐÃ GÀI' : `MẠCH NỔ ${p.idx + 1}`, p.x, p.y - p.r - 12, p.state === 2 ? '#ff7675' : '#f1c40f', 'bold 12px Arial');
        } else if (p.kind === 'core') {
            let pul = 1 + Math.sin(T * 4) * 0.06;
            ctx.beginPath(); ctx.arc(p.x, p.y, 130, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(224,86,253,0.35)'; ctx.setLineDash([10, 10]); ctx.lineWidth = 2; ctx.stroke(); ctx.setLineDash([]);
            ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * pul, p.r * 0.85 * pul, 0, 0, Math.PI * 2); ctx.fillStyle = '#4a235a'; ctx.fill(); ctx.strokeStyle = '#e056fd'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = 'rgba(224,86,253,0.35)';
            for (let k = 0; k < 7; k++) { let a = k * 0.9 + T * 0.3; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * p.r * 0.5, p.y + Math.sin(a) * p.r * 0.42, 9, 0, Math.PI * 2); ctx.fill(); }
            if (caveRun.plant > 0) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * caveRun.plant); ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 6; ctx.stroke(); }
            outlinedText('LÕI TỔ KIẾN — ĐỨNG GẦN ĐỂ GÀI BOM', p.x, p.y - p.r - 26, '#e056fd', 'bold 12px Arial');
        } else if (p.kind === 'det') {
            drawShadow(p.x, p.y, 18);
            ctx.fillStyle = '#2d3436'; ctx.fillRect(p.x - 18, p.y - 12, 36, 26); ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 18, p.y - 12, 36, 26);
            ctx.fillStyle = '#c0392b'; ctx.fillRect(p.x - 4, p.y - 26, 8, 16); ctx.fillRect(p.x - 12, p.y - 30, 24, 6);
            let armed = mission.progress >= 9;
            if (armed) { ctx.beginPath(); ctx.arc(p.x, p.y, 95, 0, Math.PI * 2); ctx.strokeStyle = `rgba(241,196,15,${0.4 + 0.3 * Math.sin(T * 8)})`; ctx.lineWidth = 3; ctx.stroke(); }
            outlinedText(armed ? 'KÍP NỔ — BẤM BẮN!' : 'KÍP NỔ', p.x, p.y - 44, '#f1c40f', 'bold 12px Arial');
        }
    }
}
function drawRubble(o, T) {
    let cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(o.x + 5, o.y + 5, o.w, o.h);
    ctx.fillStyle = o.flash > 0 ? '#dfe6e9' : '#5f6a6a'; ctx.fillRect(o.x, o.y, o.w, o.h);
    if (o.flash > 0) o.flash -= 0.016;
    // các tảng đá lổn nhổn
    let seed = (o.x * 13 + o.y * 7) | 0, cols = Math.max(1, Math.round(o.w / 44)), rows = Math.max(1, Math.round(o.h / 44));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        let h = Math.sin(seed + i * 12.9 + j * 78.2) * 43758.5; h -= Math.floor(h);
        let rx = o.x + (i + 0.5) * o.w / cols, ry = o.y + (j + 0.5) * o.h / rows;
        ctx.beginPath(); ctx.ellipse(rx + (h - 0.5) * 8, ry + (h - 0.5) * 6, o.w / cols * 0.52, o.h / rows * 0.5, h * 3, 0, Math.PI * 2);
        ctx.fillStyle = h > 0.5 ? '#7f8c8d' : '#6c7a7a'; ctx.fill(); ctx.strokeStyle = '#2d3436'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (o.hp < o.maxHp) drawMiniBar(cx, o.y - 10, Math.min(70, Math.max(o.w, 40)), 5, o.hp, o.maxHp, '#bdc3c7');
}
function drawQuadHazard(h, T) {
    let firing = h.timer <= 0;
    ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.arc(h.x, h.y, h.radius, h.angle - Math.PI / 4, h.angle + Math.PI / 4); ctx.closePath();
    ctx.fillStyle = firing ? `rgba(120, 255, 160, ${0.45 + 0.2 * Math.sin(T * 40)})` : `rgba(231, 76, 60, ${0.12 + 0.1 * Math.sin(T * 14)})`; ctx.fill();
    ctx.strokeStyle = firing ? '#dfffe9' : 'rgba(255,71,87,0.8)'; ctx.lineWidth = firing ? 5 : 3; ctx.setLineDash(firing ? [] : [14, 10]); ctx.stroke(); ctx.setLineDash([]);
}

function drawAnt(z, T, ang, flash) {
    const r = z.radius, ty = z.type;
    if (ty === ANT.TENTACLE) return drawTentacle(z, T, flash);
    // Hướng nhìn theo hướng di chuyển thật (đúng cả ở máy khách)
    if (z._lx !== undefined) { let dx = z.x - z._lx, dy = z.y - z._ly; if (dx * dx + dy * dy > 0.2) z._fa = Math.atan2(dy, dx); }
    z._lx = z.x; z._ly = z.y;
    let face = (ty === ANT.QUEEN || z._fa === undefined) ? ang : z._fa;
    let air = z.flying || z.airborne, lift = air ? (ty === ANT.QUEEN ? 26 + Math.sin(T * 5) * 4 : 16) : 0;
    let moving = !z.downed && !(z.stunTimer > 0);
    let walk = moving ? Math.sin(T * 20 + (z.nid || 0)) : 0;
    const col = flash ? '#ffffff' : z.color, dark = '#161616';
    ctx.save(); ctx.translate(z.x, z.y - lift); ctx.rotate(face); if (air) ctx.scale(1.1, 1.1);
    ctx.lineCap = 'round';
    // 6 chân
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1.4, r * 0.13); ctx.beginPath();
    for (let s = -1; s <= 1; s += 2) for (let k = -1; k <= 1; k++) {
        let lx = k * r * 0.42, sw = (k === 0 ? -walk : walk) * r * 0.28 * s;
        ctx.moveTo(lx, s * r * 0.3); ctx.lineTo(lx + k * r * 0.25 + sw * 0.5, s * r * 0.8); ctx.lineTo(lx + k * r * 0.45 + sw, s * r * 1.25);
    }
    ctx.stroke();
    // Cánh (Kiến Lính, Kiến Chúa)
    if (ty === ANT.SOLDIER || ty === ANT.QUEEN) {
        let torn = ty === ANT.QUEEN && objState === 'QUEEN_RUN';
        let flap = air ? Math.abs(Math.sin(T * 38)) : 0.12, wl = r * (torn ? 0.8 : (air ? 1.9 : 1.3));
        ctx.fillStyle = `rgba(223, 249, 251, ${air ? 0.5 : 0.28})`; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        for (let s = -1; s <= 1; s += 2) {
            ctx.save(); ctx.rotate(s * (air ? 1.15 : 0.35));
            ctx.beginPath(); ctx.ellipse(-wl * 0.45, s * r * 0.15, wl, r * (0.2 + flap * 0.4), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            if (torn) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-wl * 0.9, s * r * 0.05 - 2, wl * 0.5, 4); ctx.fillStyle = 'rgba(223, 249, 251, 0.28)'; }
            ctx.restore();
        }
    }
    const blob = (x, y, rx, ry, fill) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1.5, r * 0.1); ctx.stroke(); };
    // Bụng
    let abW = ty === ANT.QUEEN ? 1.15 : (ty === ANT.EXPLODER ? 0.95 : 0.78), abH = ty === ANT.QUEEN ? 0.8 : (ty === ANT.EXPLODER ? 0.8 : 0.58);
    if (ty === ANT.EXPLODER) {
        let g = 0.65 + 0.35 * Math.sin(T * 9 + (z.nid || 0));
        ctx.beginPath(); ctx.arc(-r * 0.85, 0, r * 1.5, 0, Math.PI * 2); ctx.fillStyle = `rgba(46, 204, 113, ${0.18 * g})`; ctx.fill();
        blob(-r * 0.85, 0, r * abW, r * abH, flash ? '#fff' : `rgb(${Math.round(40 + 60 * g)}, ${Math.round(190 + 60 * g)}, ${Math.round(90 + 40 * g)})`);
    } else {
        blob(-r * (ty === ANT.QUEEN ? 1.0 : 0.82), 0, r * abW, r * abH, col);
        if (ty === ANT.QUEEN) { ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(-r * (0.6 + k * 0.4), 0, r * 0.12, r * (0.7 - k * 0.12), 0, -1.3, 1.3); ctx.stroke(); } }
    }
    blob(0, 0, r * 0.46, r * 0.4, ty === ANT.SOLDIER && !flash ? '#922b21' : col);                 // ngực
    if (ty === ANT.SOLDIER) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(-r * 0.3, -r * 0.4, r * 0.18, r * 0.8); ctx.fillRect(r * 0.05, -r * 0.4, r * 0.18, r * 0.8); } // giáp
    blob(r * 0.62, 0, r * 0.4, r * 0.36, col);                                                      // đầu
    // Râu & hàm
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1.2, r * 0.09); ctx.beginPath();
    for (let s = -1; s <= 1; s += 2) { ctx.moveTo(r * 0.82, s * r * 0.16); ctx.quadraticCurveTo(r * 1.25, s * r * 0.5, r * 1.4 + walk * r * 0.06, s * r * 0.3); }
    ctx.stroke();
    let jaw = ty === ANT.HARVESTER || ty === ANT.QUEEN ? 0.5 : 0.3;
    ctx.fillStyle = ty === ANT.QUEEN ? '#f1c40f' : '#2d1b12';
    for (let s = -1; s <= 1; s += 2) { ctx.beginPath(); ctx.moveTo(r * 0.92, s * r * 0.14); ctx.lineTo(r * (1.0 + jaw), s * r * 0.26); ctx.lineTo(r * (1.02 + jaw * 0.9), s * r * 0.04); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = ty === ANT.QUEEN || ty === ANT.EXPLODER ? '#ff3838' : '#111';
    ctx.beginPath(); ctx.arc(r * 0.74, -r * 0.18, Math.max(1.2, r * 0.08), 0, Math.PI * 2); ctx.arc(r * 0.74, r * 0.18, Math.max(1.2, r * 0.08), 0, Math.PI * 2); ctx.fill();
    if (ty === ANT.QUEEN) { ctx.fillStyle = '#f1c40f'; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(r * 0.5, k * r * 0.16 - r * 0.07); ctx.lineTo(r * 0.3 - Math.abs(k) * r * 0.04, k * r * 0.2); ctx.lineTo(r * 0.5, k * r * 0.16 + r * 0.07); ctx.fill(); } } // vương miện
    if (ty === ANT.HARVESTER && z.carry) { ctx.fillStyle = z.carry === 'FOOD' ? '#f1c40f' : (z.carry === 'MEDKIT' ? '#ecf0f1' : (z.carry === 'BLINDBOX' ? '#8e44ad' : '#e67e22')); ctx.fillRect(r * 1.1, -r * 0.45, r * 0.9, r * 0.9); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.strokeRect(r * 1.1, -r * 0.45, r * 0.9, r * 0.9); }
    ctx.restore();
    ctx.lineCap = 'butt';
    if (ty === ANT.QUEEN && z.downed) {
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let k = 0; k < 3; k++) { let a = T * 4 + k * 2.09; ctx.fillStyle = '#f1c40f'; ctx.font = 'bold 16px Arial'; ctx.fillText('★', z.x + Math.cos(a) * 30, z.y - r - 6 + Math.sin(a) * 8); }
        if (objState === 'QUEEN') outlinedText('KIỆT SỨC — x2 SÁT THƯƠNG', z.x, z.y + r + 20, '#f1c40f', 'bold 13px Arial');
    } else if (ty === ANT.QUEEN && z.phase2Done && objState === 'QUEEN') {
        ctx.beginPath(); ctx.arc(z.x, z.y, r + 22 + Math.sin(T * 6) * 3, 0, Math.PI * 2); ctx.strokeStyle = `rgba(72, 219, 251, ${0.6 + 0.3 * Math.sin(T * 8)})`; ctx.lineWidth = 5; ctx.stroke();
        ctx.textAlign = 'center'; outlinedText('BẤT TỬ', z.x, z.y + r + 34, '#48dbfb', 'bold 13px Arial');
    }
}
function drawTentacle(z, T, flash) {
    const r = z.radius;
    ctx.beginPath(); ctx.ellipse(z.x, z.y + r * 0.5, r * 1.3, r * 0.6, 0, 0, Math.PI * 2); ctx.fillStyle = '#0d0a08'; ctx.fill();
    for (let k = 0; k < 7; k++) {
        let f = k / 6, sway = Math.sin(T * 2.4 + f * 3 + (z.nid || 0)) * 16 * f;
        ctx.beginPath(); ctx.arc(z.x + sway, z.y + r * 0.4 - f * r * 2.4, r * (1 - f * 0.55), 0, Math.PI * 2);
        ctx.fillStyle = flash ? '#fff' : (k % 2 ? '#6ab04c' : '#4b7b2f'); ctx.fill(); ctx.strokeStyle = '#1e3311'; ctx.lineWidth = 2.5; ctx.stroke();
    }
    let tipX = z.x + Math.sin(T * 2.4 + 3 + (z.nid || 0)) * 16, tipY = z.y + r * 0.4 - r * 2.4;
    ctx.beginPath(); ctx.arc(tipX, tipY, r * 0.24, 0, Math.PI * 2); ctx.fillStyle = `rgba(120, 255, 160, ${0.6 + 0.4 * Math.sin(T * 8)})`; ctx.fill();
    if (z.beamT !== undefined) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; outlinedText(`QUÉT SAU ${Math.max(0, Math.ceil(z.beamT))}s`, z.x, z.y + r + 16, z.beamT < 6 ? '#ff4757' : '#dff9fb', 'bold 11px Arial'); }
}

// ---------------------------------------------------------------------------
// DẪN ĐƯỜNG KHI LẠC: ở lâu một chỗ mà chưa tới mục tiêu thì hiện vệt mũi tên sáng trên nền hang
// ---------------------------------------------------------------------------
const CAVE_GUIDE = { key: '', since: 0, field: new Int16Array(NAV.n * NAV.n), fkey: '', ft: 0, pfield: new Int16Array(NAV.n * NAV.n) };
const CAVE_GUIDE_WAIT = 25000; // ms
function caveGuideGoal(lp) {
    if (hangZRun.stairs) return hangZRun.stairs;
    if (objState === 'CAVE_ESCORT') return caveProps.find(p => p.kind === 'c4' && p.idx === mission.progress) || null;
    if (objState === 'MINE_BOMB') return caveProps.find(p => p.kind === 'core') || null;
    if (objState === 'MINE_NESTS') {
        let best = null, bd = 1e9;
        for (let p of caveProps) if (p.kind === 'nest') { let d = Math.hypot(p.x - lp.x, p.y - lp.y); if (d < bd) { bd = d; best = p; } }
        return best;
    }
    return null;
}
function drawCaveGuide(T) {
    let lp = tank.active ? tank : localPlayer();
    if (!lp || lp.isDowned) return;
    let goal = caveGuideGoal(lp);
    if (!goal) return;
    let now = performance.now(), G = CAVE_GUIDE;
    let key = objState + ':' + hangZRun.floor + ':' + mineRun.floor + ':' + mission.progress;
    if (key !== G.key) { G.key = key; G.since = now; }
    let urgent = objState === 'CAVE_RUN' || objState === 'QUEEN_RUN';   // đang chạy đua với thời gian: chỉ đường ngay
    if (!urgent && now - G.since < CAVE_GUIDE_WAIT) return;
    if (Math.hypot(goal.x - lp.x, goal.y - lp.y) < 150) return;
    if (NAV.dirty) navRebuild();
    let fkey = Math.round(goal.x / 40) + ':' + Math.round(goal.y / 40);
    if (G.fkey !== fkey || now - G.ft > 700) {
        navFlood([goal], G.field); G.fkey = fkey; G.ft = now; G.blocked = null;
        // Mục tiêu bị đá chặn: dẫn tới đống đá gần nhất còn tới được
        let pi = navOpenIdx(lp.x, lp.y);
        if (pi >= 0 && G.field[pi] < 0) {
            navFlood([lp], G.pfield);
            let best = null, bd = 1e9;
            for (let o of obstacles) {
                if (o.type !== 'rubble') continue;
                let cx = o.x + o.w / 2, cy = o.y + o.h / 2;
                for (let s of [[o.w / 2 + 60, 0], [-o.w / 2 - 60, 0], [0, o.h / 2 + 60], [0, -o.h / 2 - 60]]) {
                    let i = navOpenIdx(cx + s[0], cy + s[1]);
                    if (i >= 0 && G.pfield[i] >= 0 && G.pfield[i] < bd) { bd = G.pfield[i]; best = { x: cx + s[0], y: cy + s[1], ox: cx, oy: cy }; }
                }
            }
            if (best) { navFlood([best], G.field); G.blocked = best; }
        }
    }
    let pts = [], pt = { x: lp.x, y: lp.y };
    for (let k = 0; k < 18; k++) { let nx = navNext(G.field, pt.x, pt.y); if (!nx) break; pts.push(nx); pt = nx; }
    if (pts.length < 2) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < pts.length; i++) {
        let a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
        let al = 0.18 + 0.55 * Math.max(0, Math.sin(T * 6 - i * 0.7));
        ctx.save(); ctx.translate(pts[i - 1].x, pts[i - 1].y); ctx.rotate(a);
        ctx.strokeStyle = G.blocked ? `rgba(255, 190, 90, ${al})` : `rgba(120, 255, 190, ${al})`; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(-9, -11); ctx.lineTo(7, 0); ctx.lineTo(-9, 11); ctx.stroke();
        ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'butt';
    if (G.blocked) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; outlinedText('ĐÁ CHẶN ĐƯỜNG — BẮN HOẶC CHO NỔ', G.blocked.ox, G.blocked.oy - 60, '#ffbe5a', 'bold 12px Arial'); }
}