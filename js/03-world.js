function ensureStatusBag(target) {
    if (!target.status) target.status = {};
    return target.status;
}

function getStatus(target, id) {
    return target && target.status ? target.status[id] : null;
}

function applyStatus(target, id, opts = {}) {
    if (!target || target.hp <= 0) return null;
    let bag = ensureStatusBag(target);
    let cur = bag[id];
    let dur = opts.duration || 1;
    let stacks = opts.stacks || 1;

    if (id === STATUS.ELECTRIC && ELECTRIC_IMMUNE_ZOMBIES.has(target.type)) return null;
    if (id === STATUS.BURN) {
        // Dot khong cong don: giu DPS cao hon va thoi gian lau hon.
        let dpsPercent = opts.dpsPercent || 0.012;
        bag[id] = {
            id,
            timer: cur ? Math.max(cur.timer, dur) : dur,
            dpsPercent: cur ? Math.max(cur.dpsPercent || 0, dpsPercent) : dpsPercent,
            source: opts.source || (cur && cur.source) || null
        };
        return bag[id];
    }

    if (id === STATUS.ELECTRIC || id === STATUS.CORROSION || id === STATUS.FEAR) {
        let maxStacks = opts.maxStacks || 8;
        bag[id] = {
            id,
            timer: cur ? Math.max(cur.timer, dur) : dur,
            stacks: Math.min(maxStacks, (cur ? cur.stacks || 0 : 0) + stacks),
            dps: Math.max(opts.dps || 0, cur ? cur.dps || 0 : 0),
            dpsPercent: Math.max(opts.dpsPercent || 0, cur ? cur.dpsPercent || 0 : 0),
            source: opts.source || (cur && cur.source) || null
        };
        return bag[id];
    }

    if (id === STATUS.OVERLOAD) {
        bag[id] = {
            id,
            timer: cur ? Math.max(cur.timer, dur) : dur,
            stacks: Math.min(opts.maxStacks || 5, Math.max(cur ? cur.stacks || 1 : 1, stacks)),
            source: opts.source || (cur && cur.source) || null
        };
        return bag[id];
    }
    return null;
}

function applyPlayerStatus(p, id, opts = {}) {
    if (!p || p.isDowned) return;
    // Mặt Nạ Lọc chỉ rút ngắn Nhiễm Điện & Sợ Hãi; Kháng Ăn Mòn rút ngắn Ăn Mòn
    let mult = 1;
    if ((id === STATUS.ELECTRIC || id === STATUS.FEAR) && p.perks && p.perks.a_matNaLoc) mult = 0.55;
    if (id === STATUS.CORROSION && p.perks && p.perks.a_chongAnMon) mult = 0.65;
    opts = { ...opts, duration: (opts.duration || 1) * mult };
    return applyStatus(p, id, opts);
}

function updateStatusEffects(target, dt, isPlayer = false) {
    if (!target || !target.status) return;
    for (let id of Object.keys(target.status)) {
        let s = target.status[id];
        s.timer -= dt;
        // Người chơi nhận sát thương rỉ qua takeDot (để có thể gục ngã đúng cách); quái trừ máu trực tiếp
        const dot = (amt) => { if (isPlayer) target.takeDot(amt); else { target.hp -= amt; if (s.source instanceof Player) target.lastHitBy = s.source; } };
        if (id === STATUS.BURN) {
            // Boss chỉ chịu 1/4 thiêu đốt theo % máu
            dot(target.maxHp * (s.dpsPercent || 0) * dt * (!isPlayer && isBossType(target.type) ? 0.25 : 1));
            if (Math.random() < 0.12) createParticles(target.x, target.y, '#e67e22', 1, 50);
        } else if (id === STATUS.ELECTRIC) {
            let dps = (s.dps || 6) * Math.max(1, s.stacks || 1);
            dot(dps * dt);
            if (Math.random() < 0.18) createParticles(target.x, target.y, '#00d2d3', 1, 70);
            if (!isPlayer && !ELECTRIC_IMMUNE_ZOMBIES.has(target.type)) target.stunTimer = Math.max(target.stunTimer || 0, 0.08);
        } else if (id === STATUS.CORROSION) {
            let resist = isPlayer && target.perks && target.perks.a_chongAnMon ? 0.65 : 1;
            dot(target.maxHp * (s.dpsPercent || 0.006) * Math.max(1, s.stacks || 1) * resist * dt * (!isPlayer && isBossType(target.type) ? 0.25 : 1));
            if (Math.random() < 0.15) createParticles(target.x, target.y, '#2ecc71', 1, 60);
        } else if (id === STATUS.OVERLOAD) {
            if (!isPlayer) target.stunTimer = 0;
            if (Math.random() < 0.16) createParticles(target.x, target.y, '#ff6b35', 1, 90);
        } else if (id === STATUS.FEAR) {
            if (Math.random() < 0.10) createParticles(target.x, target.y, '#ff007f', 1, 45);
        }
        if (s.timer <= 0) delete target.status[id];
    }
}

function getStatusMoveMult(target) {
    let mult = 1;
    let corrosion = getStatus(target, STATUS.CORROSION);
    let fear = getStatus(target, STATUS.FEAR);
    let overload = getStatus(target, STATUS.OVERLOAD);
    if (corrosion && (corrosion.stacks || 0) >= 5) mult *= 0.7;
    if (fear) mult *= Math.max(0.45, 1 - 0.10 * (fear.stacks || 1));
    if (overload) mult *= 1.25 + 0.05 * (overload.stacks || 1);
    return mult;
}

function getPlayerFireRateMult(p) {
    let fear = getStatus(p, STATUS.FEAR);
    return fear ? 1 + 0.12 * (fear.stacks || 1) : 1;
}

function drawStatusEffects(entity) {
    if (!entity || !entity.status) return;
    let active = Object.values(entity.status).filter(s => s.timer > 0);
    if (!active.length) return;
    let startX = entity.x - (active.length - 1) * 7;
    for (let i = 0; i < active.length; i++) {
        let s = active[i], st = STATUS_STYLE[s.id] || STATUS_STYLE.burn;
        let x = startX + i * 14, y = entity.y - entity.radius - 22;
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = st.color;
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1;
        ctx.stroke();
        if ((s.stacks || 0) > 1) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(s.stacks, x, y + 3);
        }
    }
}

function addScreenFlash(amount, cdMs = 180) {
    let now = Date.now();
    // Thay đổi điều kiện: Nếu chưa đủ 5000ms (5 giây) kể từ lần chớp trước, ép Alpha về 0 (bỏ chớp)
    if (window.lastScreenFlashTime && now - window.lastScreenFlashTime < 5000) {
        flashAlpha = 0;
        return;
    }

    if (!window.lastScreenFlashTime || now - window.lastScreenFlashTime > cdMs) {
        flashAlpha = Math.max(flashAlpha || 0, amount);
        window.lastScreenFlashTime = now;
    }
}

function getXpRequired(level) {
    let base = Math.floor(140 + Math.pow(level, 2.05) * 95 + Math.pow(level, 1.35) * 45);
    return isSinglePlayer ? base : base * 1.5;
}

// Helpers cho hệ thống Tag dùng chung
function getTeamTagLevel(tagName) {
    let p1 = players[0] ? (players[0].tags[tagName] || 0) : 0;
    let p2 = players[1] ? (players[1].tags[tagName] || 0) : 0;
    return p1 + p2;
}
function getPerkStacks(perkId) {
    let n = 0;
    for (let p of players) n += (p.perkStacks && p.perkStacks[perkId]) || 0;
    return n;
}
function hasTeamPerk(perkId) {
    let p1 = players[0] ? players[0].perks[perkId] : false;
    let p2 = players[1] ? players[1].perks[perkId] : false;
    return p1 || p2;
}
function getMapName(type = currentMapType) {
    const names = {
        1: 'Khu Phố Bỏ Hoang', 2: 'Rừng', 3: 'Sông Lớn', 4: 'Thành Trì',
        5: 'Thị Trấn Cướp', 6: 'Nhà Máy Điện', 7: 'Rừng Đêm', 8: 'Thành Phố Tàn Phá',
        9: 'Rừng Mưa', 10: 'Hang Z', 11: 'Rừng Cây Cao', 12: 'Vườn Thực Vật', 13: 'Thành Phố N', 14: 'Hầm Mỏ'
    };
    return names[type] || ('Map ' + type);
}

function getMissionName(type = objState) {
    const names = {
        TOWERS: 'Chiếm tháp tín hiệu', COLLECT: 'Thu thập vật phẩm', KILL: 'Tiêu diệt mục tiêu',
        BOSS: 'Hạ boss', DEFEND: 'Tử thủ', POWER_LOCKS: 'Phá khóa điện', POWER_KILL: 'Thanh lọc nhà máy',
        POWER_BOSS: 'Boss điện', CITY_BOSS: 'Thành phố nguy hiểm', HANGZ_ESCAPE: 'Trốn thoát Hang Z',
        POWER_CHARGE: 'Nạp điện', RESCUE: 'Giải cứu người sống sót',
        CAVE_ESCORT: 'Hộ tống Tiến Sĩ đặt 3 ngòi nổ C4', CAVE_RUN: 'Chạy ra cửa hầm', MINE_NESTS: 'Phá toàn bộ tổ kiến', MINE_EXIT: 'Xuống tầng 5',
        MINE_BOMB: 'Gài bom phá sập lõi tổ kiến', QUEEN: 'Boss: Kiến Chúa', QUEEN_RUN: 'Cuộc đào tẩu 45 giây'
    };
    return names[type] || type;
}

function getWeatherName(w = currentWeather) {
    const names = { 1: 'Trời đẹp', 2: 'Mưa', 3: 'Gió mạnh', 4: 'Bão sét', 5: 'Nhiều mây', 6: 'Sương mù', 7: 'Nắng nóng', 9: 'Bão tuyết', 10: 'Mưa acid', 11: 'Bóng tối', 12: 'Bão điện từ' };
    return names[w] || 'Bất ổn';
}
let mapIntro = { timer: 0, map: '', mission: '', weather: '' };
function showMapIntro() {
    mapIntro = {
        timer: 4.0,
        map: getMapName(),
        mission: getMissionName(objState),
        weather: getWeatherName()
    };
}

function updateMoodMusic() {
    // Chọn nhạc nền theo bối cảnh: điện -> mưa bão -> tối/sương mù -> ban ngày
    let electric = currentMapType === 6 || currentWeather === 12;
    let dark = currentMapType === 7 || currentMapType === 10 || currentMapType === 11 || currentMapType === 14 || currentWeather === 11 || currentWeather === 6;
    let key = currentMapType <= 3 ? 'map_am' : 'map_random';
    let dead = zombies.find(z => z.type === 50 && z.hp > 0);
    if (dead) key = dead.hp < dead.maxHp * 0.5 ? 'dead2' : 'dead1';
    else if (zombies.some(z => z.type === 45 && z.hp > 0)) key = 'boss_insect';
    else if (zombies.some(z => z.type >= 30 && z.type <= 32 && z.hp > 0)) key = electric ? 'boss_electric' : (dark || isRainyWeather() ? 'boss_pm' : 'boss');
    else if (electric) key = 'map_electric';
    else if (isRainyWeather() || currentMapType === 9) key = 'map_rain';
    else if (dark) key = 'map_pm';
    Sound.music(key);
}
function isRainyWeather() { return currentWeather === 2 || currentWeather === 10 || (currentWeather === 4 && currentMapType !== 6); }

// Tiếng lặp & tiếng nền theo trạng thái game (chạy ở cả chủ phòng lẫn khách)
let moodTimer = 0, groanTimer = 10;
function updateLoopSounds(dt) {
    moodTimer -= dt;
    if (moodTimer <= 0) { moodTimer = 1; updateMoodMusic(); }
    let fire = false, mg = false;
    for (let b of bullets) { let k = bulletKind(b); if (k === 4) fire = true; else if (k === 12) mg = true; }
    Sound.loop('flame', fire, 0.33);
    Sound.loop('minigun', mg, 0.38);
    Sound.loop('heli', heliSupport.active, 0.26);
    // Tiếng mưa nền: bão to hơn mưa thường, mưa acid nhỏ hơn
    // Hang động / hầm mỏ: tiếng nước nhỏ giọt vang trong hang
    Sound.loop('cave', isCaveMap(), caveSlippery() ? 0.5 : 0.3);
    if (isCaveMap() && Math.random() < dt * (caveSlippery() ? 0.5 : 0.15)) Sound.play('waterdrop');
    Sound.loop('rain', isRainyWeather(), currentWeather === 4 ? 0.5 : (currentWeather === 10 ? 0.28 : 0.36));
    // Tiếng zombie gầm gừ khi bầy quái áp sát
    groanTimer -= dt;
    if (groanTimer <= 0) {
        groanTimer = 11 + Math.random() * 14;
        let lp = localPlayer(), near = 0;
        if (lp) for (let z of zombies) if (!z.hidden && Math.abs(z.x - lp.x) < 600 && Math.abs(z.y - lp.y) < 600) near++;
        if (near >= 5) Sound.playExternal('zombie_groan', Math.min(1.3, 0.55 + near * 0.04));
    }
}
// Tiếng zombie gục: càng xa người chơi càng nhỏ, quá xa thì không phát
function playKillSound(x, y, insect = 0) {
    if (NET.mode === 'host' && NET.ev.length < 100) NET.ev.push(['sk', Math.round(x), Math.round(y), insect]);
    let lp = tank.active ? tank : localPlayer();
    let d = lp ? Math.hypot(x - lp.x, y - lp.y) : 0;
    if (d > 1300) return;
    Sound.kill(d < 220 ? 1 : Math.max(0.1, 1 - (d - 220) / 1000), !!insect);
}
// Bảng chỉnh âm lượng ở menu: 3 nhóm âm thanh + bật/tắt tiếng hét khi zombie chết
function setAudioVolume(group, pct) {
    Sound.setVolume(group, pct / 100);
    let t = document.getElementById('vol_' + group + '_txt');
    if (t) t.textContent = Math.round(pct) + '%';
}
function setKillScream(on) { Sound.setKillMuted(!on); }
function initAudioPanel() {
    for (let g of ['music', 'sfx', 'amb']) {
        let el = document.getElementById('vol_' + g), pct = Math.round(Sound.getVolume(g) * 100);
        if (el) el.value = pct;
        let t = document.getElementById('vol_' + g + '_txt');
        if (t) t.textContent = pct + '%';
    }
    let ks = document.getElementById('killScream');
    if (ks) ks.checked = !Sound.isKillMuted();
}
initAudioPanel();
function toggleMute() {
    Sound.setMuted(!Sound.isMuted());
    let btn = document.getElementById('muteBtn');
    if (btn) btn.textContent = Sound.isMuted() ? '🔇 Âm thanh: TẮT (phím M)' : '🔊 Âm thanh: BẬT (phím M)';
}
window.addEventListener('keydown', e => { if (e.code === 'KeyM' && !(e.target && e.target.tagName === 'INPUT')) toggleMute(); });

function queueRadio(text, audioKey = null, life = 5) {
    radioDialogs.push({ text, audioKey, life, maxLife: life });
    if (NET.mode === 'host') NET.ev.push(['r', text]);
    if (audioKey) Sound.playExternal(audioKey, 0.9);
}

function updateRadioDialogs(dt) {
    radioDialogTimer -= dt;
    for (let i = radioDialogs.length - 1; i >= 0; i--) {
        radioDialogs[i].life -= dt;
        if (radioDialogs[i].life <= 0) radioDialogs.splice(i, 1);
    }
    if (radioDialogTimer <= 0 && currentLevel > 1) {
        radioDialogTimer = 55;
        let lines = [
            'Bộ đàm: Tín hiệu Z đang mạnh hơn. Đừng ở lại quá lâu.',
            'Bộ đàm: Có người sống sót gần đây. Hãy tìm vùng cứu hộ.',
            'Bộ đàm: Thời tiết đang xấu đi. Chuẩn bị vũ khí cận chiến.'
        ];
        queueRadio(lines[Math.floor(Math.random() * lines.length)], null, 5);
    }
}

function pickMissionType(level) {
    if (currentMapType === 10 || currentMapType === 14 || hangZRun.active) return 'HANGZ_ESCAPE';
    if (currentMapType === 6) {
        if (powerPlantRun.active && powerPlantRun.floor >= powerPlantRun.total) return 'POWER_BOSS';
        return 'POWER_CHARGE';
    }
    if (currentMapType === 4) return 'DEFEND';
    if (level % 8 === 0) return 'BOSS';
    if (nextMissionPreference) return nextMissionPreference;
    if (level === 1) return 'TOWERS';
    const pool = ['TOWERS', 'COLLECT', 'KILL'];
    return pool[Math.floor(Math.random() * pool.length)];
}

function setupMission(type, level) {
    mission = { type, progress: 0, required: 0, complete: false };
    missionItems = [];

    if (type === 'TOWERS') {
        mission.required = currentMapType === 5 ? 2 : 4;
    } else if (type === 'COLLECT') {
        mission.required = Math.min(12, 5 + Math.floor(level * 0.75));
    } else if (type === 'KILL') {
        mission.required = 28 + level * 7;
    } else if (type === 'BOSS') {
        mission.required = 1;
    } else if (type === 'DEFEND') {
        mission.required = Math.ceil(fortressTimer);
    } else if (type === 'HANGZ_ESCAPE') {
        mission.required = hangZRun.total;
        mission.progress = hangZRun.floor;
    } else if (type === 'RESCUE') {
        mission.required = Math.min(10, 3 + Math.floor(level / 2));
        mission.progress = 0;
        rescueMission = {
            total: mission.required,
            aliveRequired: Math.ceil(mission.required / 2),
            timer: 0,
            heliArrived: false,
            allRescued: false
        };
    } else if (type === 'POWER_CHARGE') {
        mission.required = 3 + Math.min(2, powerPlantRun.floor);
        powerCellsHeld = pendingBattery; pendingBattery = 0; // Pin dự phòng mua ở cửa hàng
    } else if (type === 'POWER_LOCKS') {
        mission.required = 3 + Math.min(2, powerPlantRun.floor);
    } else if (type === 'POWER_KILL') {
        mission.required = 32 + powerPlantRun.floor * 12;
    } else if (type === 'POWER_BOSS') {
        mission.required = 1;
    }
    objState = type;
}

function spawnMissionItems(count) {
    for (let i = 0; i < count; i++) {
        missionItems.push({
            x: 350 + Math.random() * (MAP_SIZE.w - 700),
            y: 350 + Math.random() * (MAP_SIZE.h - 700),
            radius: 14,
            taken: false
        });
    }
}

function recordMissionKill(zombieType) {
    if (mission.complete) return;
    if (mission.type === 'KILL') {
        mission.progress++;
        if (mission.progress >= mission.required) completeMission();
    } else if (mission.type === 'POWER_KILL') {
        mission.progress++;
        if (mission.progress >= mission.required) completeMission();
    } else if (mission.type === 'BOSS' && zombieType === 30) {
        mission.progress = 1;
        completeMission();
    } else if (mission.type === 'POWER_BOSS' && zombieType === 31) {
        mission.progress = 1;
        completeMission();
    } else if (mission.type === 'CITY_BOSS' && zombieType === 32) {
        mission.progress = 1;
        completeMission();
    }
}

function completeMission() {
    if (mission.complete) return;
    mission.complete = true;
    let bossMission = mission.type === 'BOSS' || mission.type === 'POWER_BOSS' || mission.type === 'CITY_BOSS' || mission.type === 'HANGZ_ESCAPE';
    let reward = bossMission ? 45 + currentLevel * 2 : 12 + currentLevel * 3;
    shopScrap += reward;
    Sound.play(bossMission ? 'level' : 'upgrade');
    for (let p of players) {
        vfxList.push({ type: 'text', text: 'NHIỆM VỤ HOÀN THÀNH!', x: p.x, y: p.y - 80, life: 2.0, color: '#f1c40f' });
        vfxList.push({ type: 'text', text: `+${reward} ⚙ Phế liệu`, x: p.x, y: p.y - 58, life: 2.0, color: '#cbd5e1' });
        spawnRing(p.x, p.y, '#f1c40f', 160, 0.6);
    }
    if (currentMapType === 6) beginRooftopEscape();
    else beginEvacCountdown();
}

function beginRooftopEscape() {
    objState = 'ROOFTOP';
    evacTimer = 0;
    evacZone = { x: MAP_SIZE.w / 2, y: 240, progress: 0 };
    vfxList.push({ type: 'text', text: 'CHẠY LÊN SÂN THƯỢNG!', x: players[0].x, y: players[0].y - 100, life: 2.5, color: '#00d2d3' });
    Sound.play('level');
}

function beginEvacCountdown() {
    if (objState === 'WAITING' || objState === 'EVAC') return;
    let heliTag = getTeamTagLevel('TRỰC THĂNG');
    let timeRed = heliTag >= 5 ? 0.5 : (heliTag >= 3 ? 0.8 : (heliTag >= 2 ? 0.9 : 1.0));
    evacTimer = EVAC_SUPPORT_TIME * timeRed;
    if (hasTeamPerk('p_yemTro')) evacTimer -= 5;                                    // Yểm Trợ Hỏa Lực: trực thăng đến sớm 5s
    if (shopFlags.flare && mission.type === 'RESCUE') { evacTimer -= 8; shopFlags.flare = false; } // Pháo sáng cứu hộ
    evacTimer = Math.max(4.0, evacTimer);
    objState = 'WAITING';
    if (mission.type === 'RESCUE') rescueMission.heliArrived = true;

    // ĐÃ SỬA: Ép buộc Trực thăng cứu hộ hạ cánh chính xác tại giữa Map tâm bản đồ
    evacZone = {
        x: MAP_SIZE.w / 2,
        y: MAP_SIZE.h / 2,
        progress: 0
    };

    heliSupport.active = true;
    heliSupport.x = evacZone.x;
    heliSupport.y = evacZone.y;
    heliSupport.fireTimer = 0;
}

function updateMission(dt) {
    if (mission.complete || isCaveMap()) return; // Hang Z / Hầm Mỏ do updateCaveWorld (09-cave.js) điều khiển
    if (mission.type === 'COLLECT') {
        for (let item of missionItems) {
            if (item.taken) continue;
            for (let p of players) {
                if (!p.isDowned && Math.hypot(p.x - item.x, p.y - item.y) < p.radius + item.radius + 12) {
                    item.taken = true;
                    mission.progress++;
                    Sound.play('pickup');
                    createParticles(item.x, item.y, '#00d2d3', 20, 140);
                    if (mission.progress >= mission.required) completeMission();
                    break;
                }
            }
        }
    } else if (mission.type === 'POWER_LOCKS') {
        for (let item of missionItems) {
            if (item.taken) continue;
            for (let p of players) {
                if (!p.isDowned && Math.hypot(p.x - item.x, p.y - item.y) < p.radius + item.radius + 12) {
                    item.taken = true;
                    mission.progress++;
                    Sound.play('shard');
                    createParticles(item.x, item.y, '#00d2d3', 25, 170);
                    vfxList.push({ type: 'text', text: 'PHÁ KHÓA!', x: item.x, y: item.y - 30, life: 1.0, color: '#00d2d3' });
                    if (mission.progress >= mission.required) completeMission();
                    break;
                }
            }
        }
    } else if (mission.type === 'POWER_CHARGE') {
        for (let item of missionItems) {
            if (item.taken) continue;
            for (let p of players) {
                if (!p.isDowned && Math.hypot(p.x - item.x, p.y - item.y) < p.radius + item.radius + 12) {
                    item.taken = true;
                    powerCellsHeld++;
                    Sound.play('pickup');
                    createParticles(item.x, item.y, '#f1c40f', 22, 150);
                    vfxList.push({ type: 'text', text: 'PIN +' + powerCellsHeld, x: item.x, y: item.y - 28, life: 1.0, color: '#f1c40f' });
                    break;
                }
            }
        }
        for (let t of towers) {
            if (t.active) continue;
            let inZone = players.some(p => !p.isDowned && Math.hypot(p.x - t.x, p.y - t.y) < 150);
            if (inZone && powerCellsHeld > 0) {
                t.progress += dt;
                if (t.progress >= 8.0) {
                    t.active = true;
                    powerCellsHeld--;
                    mission.progress++;
                    Sound.play('level');
                    createParticles(t.x, t.y, '#00d2d3', 60, 330);
                    if (mission.progress >= mission.required) completeMission();
                }
            } else {
                t.progress = Math.max(0, t.progress - dt * 0.35);
            }
        }
    } else if (mission.type === 'RESCUE') {
        let alive = rescueNPCs.filter(n => n.hp > 0).length;
        if (alive <= 0) {
            // Thất bại: mất phế liệu, vẫn được rút lui
            shopScrap = Math.max(0, shopScrap - 30);
            mission.complete = true;
            vfxList.push({ type: 'text', text: 'GIẢI CỨU THẤT BẠI! -30 ⚙', x: players[0].x, y: players[0].y - 80, life: 2.5, color: '#ff4757' });
            beginEvacCountdown();
            return;
        }

        // Xong khi mọi NPC còn sống đều đã được cứu
        let rescuedAlive = rescueNPCs.filter(n => n.hp > 0 && n.rescued).length;
        if (!rescueMission.allRescued && rescuedAlive >= alive) {
            rescueMission.allRescued = true;
            vfxList.push({ type: 'text', text: 'ĐÃ CỨU HẾT - ĐỢI MÁY BAY!', x: players[0].x, y: players[0].y - 104, life: 2.0, color: '#2ecc71' });
            completeMission();
            return;
        }
    } else if (mission.type === 'HANGZ_ESCAPE') {
        hangZRun.timer -= dt;
        mission.progress = hangZRun.floor;
        if (hangZRun.timer <= 0) {
            for (let p of players) if (!p.isDowned) p.takeDot(55 * dt * (1 - (p.caveToxinResist || 0)));
            if (Math.random() < dt * 6) createParticles(players[0].x + (Math.random() - 0.5) * 240, players[0].y + (Math.random() - 0.5) * 180, '#7f8c8d', 1, 30);
        }
        if (hangZRun.stairs) {
            let allNear = players.every(p => p.isDowned || Math.hypot(p.x - hangZRun.stairs.x, p.y - hangZRun.stairs.y) < hangZRun.stairs.radius + 35);
            if (allNear && !tank.active) advanceHangZFloor();
        }
    } else if (mission.type === 'BOSS' && !bossSpawned) {
        zombies.push(new Zombie(MAP_SIZE.w / 2, MAP_SIZE.h / 2 - 500, 30));
        bossSpawned = true;
        vfxList.push({ type: 'text', text: 'BOSS: KHỔNG LỒ!', x: MAP_SIZE.w / 2, y: MAP_SIZE.h / 2 - 560, life: 3.0, color: '#ff9f43' });
        Sound.play('roar'); Sound.play('tank');
    } else if (mission.type === 'POWER_BOSS' && !bossSpawned) {
        zombies.push(new Zombie(MAP_SIZE.w / 2, MAP_SIZE.h / 2 - 520, 31));
        bossSpawned = true;
        vfxList.push({ type: 'text', text: 'BOSS: LÕI QUÁ TẢI!', x: MAP_SIZE.w / 2, y: MAP_SIZE.h / 2 - 580, life: 3.0, color: '#00d2d3' });
        Sound.play('roar'); Sound.play('tank');
    } else if (mission.type === 'CITY_BOSS' && !bossSpawned) {
        zombies.push(new Zombie(MAP_SIZE.w / 2, MAP_SIZE.h / 2 - 520, 32));
        bossSpawned = true;
        vfxList.push({ type: 'text', text: 'BOSS: THE LEADER!', x: MAP_SIZE.w / 2, y: MAP_SIZE.h / 2 - 580, life: 3.0, color: '#ff4757' });
        Sound.play('roar'); Sound.play('tank');
    }
}

function generateMap(level) {
    obstacles = []; drops = []; slowZones = []; towers = []; bushes = []; GROUND_DOTS.length = 0; fireZones = [];
    let margin = 500;

    // Logic chọn Map
    let availableMaps = level >= 9 ? [1, 2, 3, 7, 8, 9, 11, 12, 13] : (level >= 5 ? [1, 2, 3, 7, 11, 12] : [1, 2, 3]);
    if (powerPlantRun.active) {
        currentMapType = 6;
    } else if (nextMapPreference) {
        currentMapType = nextMapPreference;
    } else if (level >= 5 && level % 5 === 0) {
        currentMapType = Math.random() > 0.5 ? 4 : 5;
    } else {
        currentMapType = availableMaps[Math.floor(Math.random() * availableMaps.length)];
    }
    nextMapPreference = null;
    if (currentMapType === 4 || currentMapType === 5) lastSpecialMapLevel = level;

    let missionType = pickMissionType(level);
    // Vườn Thực Vật / Thành Phố N đôi khi là nhiệm vụ Giải Cứu (quyết định TRƯỚC khi dựng nhiệm vụ để NPC được sinh ra đúng)
    if (!nextMissionPreference && ['TOWERS', 'COLLECT', 'KILL'].includes(missionType) &&
        ((currentMapType === 12 && Math.random() < 0.35) || (currentMapType === 13 && Math.random() < 0.3))) missionType = 'RESCUE';
    setupMission(missionType, level);
    if (mission.type === 'POWER_CHARGE') {
        let need = mission.required;
        for (let i = 0; i < need; i++) {
            let a = (i / need) * Math.PI * 2;
            towers.push({
                x: MAP_SIZE.w / 2 + Math.cos(a) * 720,
                y: MAP_SIZE.h / 2 + Math.sin(a) * 520,
                progress: 0,
                active: false,
                needsBattery: true
            });
        }
    }
    nextMissionPreference = null;
    if (mission.type === 'RESCUE') spawnRescueNPCs(mission.required);

    // Tháp tín hiệu chỉ xuất hiện khi nhiệm vụ là chiếm tháp.
    if (mission.type === 'TOWERS') {
        towers.push({ x: margin, y: margin, progress: 0, active: false });
        towers.push({ x: MAP_SIZE.w - margin, y: MAP_SIZE.h - margin, progress: 0, active: false });
        if (currentMapType !== 5) {
            towers.push({ x: MAP_SIZE.w - margin, y: margin, progress: 0, active: false });
            towers.push({ x: margin, y: MAP_SIZE.h - margin, progress: 0, active: false });
        }
    }

    if (currentMapType === 1) { bgMapColor = '#2c3e50'; for (let i = 0; i < 60 + level * 5; i++) { let isVert = Math.random() > 0.5; obstacles.push({ type: 'wall', x: Math.random() * (MAP_SIZE.w - 200) + 100, y: Math.random() * (MAP_SIZE.h - 200) + 100, w: isVert ? 30 + Math.random() * 20 : 120 + Math.random() * 150, h: isVert ? 120 + Math.random() * 150 : 30 + Math.random() * 20 }); } }
    else if (currentMapType === 2) { bgMapColor = '#273c2a'; for (let i = 0; i < 15; i++) slowZones.push({ x: Math.random() * MAP_SIZE.w, y: Math.random() * MAP_SIZE.h, w: 300 + Math.random() * 300, h: 300 + Math.random() * 300, type: 'mud' }); for (let i = 0; i < 80 + level * 10; i++) obstacles.push({ type: 'tree', x: Math.random() * (MAP_SIZE.w - 100), y: Math.random() * (MAP_SIZE.h - 100), w: 60 + Math.random() * 40, h: 60 + Math.random() * 40 }); }
    else if (currentMapType === 3) { bgMapColor = '#5e6b43'; slowZones.push({ x: 0, y: MAP_SIZE.h / 2 - 250, w: MAP_SIZE.w, h: 500, type: 'river' }); for (let i = 0; i < 40 + level * 5; i++) obstacles.push({ type: 'rock', x: Math.random() * (MAP_SIZE.w - 100), y: Math.random() * (MAP_SIZE.h - 100), w: 50 + Math.random() * 50, h: 50 + Math.random() * 50 }); }
    else if (currentMapType === 4) { // Thành trì
        turretMode = { active: true, x: MAP_SIZE.w / 2, y: MAP_SIZE.h / 2, hp: 600 + currentLevel * 120, maxHp: 600 + currentLevel * 120, fireCD: 0 };
        bgMapColor = '#4a4a4a'; objState = 'DEFEND';
        // Xây tường thành ở giữa
        obstacles.push({ type: 'wall', x: MAP_SIZE.w / 2 - 400, y: MAP_SIZE.h / 2 - 400, w: 800, h: 40 });
        obstacles.push({ type: 'wall', x: MAP_SIZE.w / 2 - 400, y: MAP_SIZE.h / 2 + 360, w: 800, h: 40 });
        obstacles.push({ type: 'wall', x: MAP_SIZE.w / 2 - 400, y: MAP_SIZE.h / 2 - 400, w: 40, h: 300 });
        obstacles.push({ type: 'wall', x: MAP_SIZE.w / 2 + 360, y: MAP_SIZE.h / 2 - 400, w: 40, h: 300 });
        obstacles.push({ type: 'wall', x: MAP_SIZE.w / 2 - 400, y: MAP_SIZE.h / 2 + 100, w: 40, h: 300 });
        obstacles.push({ type: 'wall', x: MAP_SIZE.w / 2 + 360, y: MAP_SIZE.h / 2 + 100, w: 40, h: 300 });
        // Sinh Linh Đồng Minh
        allies.push(new Ally(MAP_SIZE.w / 2 - 200, MAP_SIZE.h / 2 - 200));
        allies.push(new Ally(MAP_SIZE.w / 2 + 200, MAP_SIZE.h / 2 - 200));
        allies.push(new Ally(MAP_SIZE.w / 2 - 200, MAP_SIZE.h / 2 + 200));
        allies.push(new Ally(MAP_SIZE.w / 2 + 200, MAP_SIZE.h / 2 + 200));
    }
    else if (currentMapType === 5) { // Thị trấn cướp
        bgMapColor = '#8d6e63';
        outposts.push(new Outpost(MAP_SIZE.w / 2 - 75, MAP_SIZE.h / 2 - 75)); // Tiền đồn giữa map
        for (let i = 0; i < 40 + level * 3; i++) { obstacles.push({ type: 'wall', x: Math.random() * (MAP_SIZE.w - 200) + 100, y: Math.random() * (MAP_SIZE.h - 200) + 100, w: 100 + Math.random() * 100, h: 100 + Math.random() * 100 }); }
    }
    else if (currentMapType === 6) { // Nhà máy điện
        bgMapColor = '#263238';
        currentWeather = 4;
        for (let i = 0; i < 26 + level * 2; i++) {
            let isVert = Math.random() > 0.45;
            obstacles.push({ type: 'power', x: Math.random() * (MAP_SIZE.w - 220) + 110, y: Math.random() * (MAP_SIZE.h - 220) + 110, w: isVert ? 36 : 170 + Math.random() * 160, h: isVert ? 170 + Math.random() * 160 : 36 });
        }
        for (let i = 0; i < 8 + powerPlantRun.floor; i++) {
            powerCoils.push({ x: 260 + Math.random() * (MAP_SIZE.w - 520), y: 260 + Math.random() * (MAP_SIZE.h - 520), radius: 120, cd: Math.random() * 2, pulse: 0 });
        }
        for (let i = 0; i < 12; i++) {
            slowZones.push({ x: Math.random() * (MAP_SIZE.w - 320), y: Math.random() * (MAP_SIZE.h - 320), w: 240 + Math.random() * 180, h: 120 + Math.random() * 170, type: 'electric' });
        }
    }
    else if (currentMapType === 7) { // Rừng đêm
        bgMapColor = '#101820';
        darknessBattery = 100;
        for (let i = 0; i < 120 + level * 8; i++) obstacles.push({ type: 'tree', x: Math.random() * (MAP_SIZE.w - 100), y: Math.random() * (MAP_SIZE.h - 100), w: 50 + Math.random() * 60, h: 50 + Math.random() * 60 });
        for (let i = 0; i < 14; i++) lightFlowers.push({ x: 240 + Math.random() * (MAP_SIZE.w - 480), y: 240 + Math.random() * (MAP_SIZE.h - 480), radius: 24, charge: 100 });
    }
    else if (currentMapType === 8) { // Thành phố tàn phá
        bgMapColor = '#3b3b3b';
        for (let i = 0; i < 50 + level * 4; i++) obstacles.push({ type: 'ruin', x: Math.random() * (MAP_SIZE.w - 220) + 100, y: Math.random() * (MAP_SIZE.h - 220) + 100, w: 90 + Math.random() * 180, h: 80 + Math.random() * 160 });
        outposts.push(new Outpost(MAP_SIZE.w / 2 - 75, MAP_SIZE.h / 2 - 75));
        if (level % 8 === 0) {
            mission.type = 'CITY_BOSS';
            mission.required = 1;
            mission.progress = 0;
            mission.complete = false;
            objState = 'CITY_BOSS';
        }
    }
    else if (currentMapType === 9) { // Map 9: Rừng Mưa
        bgMapColor = '#1e3822';
        currentWeather = 4; // Ép buộc thời tiết BÃO MƯA SÉT
        darknessBattery = 100; // Để quản lý giảm tầm nhìn
        for (let i = 0; i < 90 + level * 6; i++) obstacles.push({ type: 'tree', x: Math.random() * (MAP_SIZE.w - 100), y: Math.random() * (MAP_SIZE.h - 100), w: 55 + Math.random() * 50, h: 55 + Math.random() * 50 });
        // Sinh thêm hoa soi sáng hỗ trợ tầm nhìn trong rừng rậm
        for (let i = 0; i < 10; i++) lightFlowers.push({ x: 240 + Math.random() * (MAP_SIZE.w - 480), y: 240 + Math.random() * (MAP_SIZE.h - 480), radius: 24, charge: 100 });
    }
    else if (currentMapType === 10 || currentMapType === 14) generateCaveMap(level); // Hang Z / Hầm Mỏ (09-cave.js)
    else if (currentMapType === 11) { // Rung cay cao
        bgMapColor = '#172316';
        darknessBattery = 75;
        for (let i = 0; i < 135 + level * 10; i++) {
            obstacles.push({ type: 'tree', x: Math.random() * (MAP_SIZE.w - 100), y: Math.random() * (MAP_SIZE.h - 100), w: 70 + Math.random() * 70, h: 70 + Math.random() * 90 });
        }
        buildBushesForMap(level);
        for (let i = 0; i < 8; i++) lightFlowers.push({ x: 240 + Math.random() * (MAP_SIZE.w - 480), y: 240 + Math.random() * (MAP_SIZE.h - 480), radius: 24, charge: 100 });
    }
    else if (currentMapType === 12) { // Vuon Thuc Vat
        bgMapColor = '#16351f';
        currentWeather = 5;
        let vineCount = shopFlags.herbicide ? 28 : 48;
        shopFlags.herbicide = false;
        for (let i = 0; i < vineCount; i++) {
            let isVert = Math.random() > 0.5;
            obstacles.push({ type: 'plant_wall', x: 120 + Math.random() * (MAP_SIZE.w - 240), y: 120 + Math.random() * (MAP_SIZE.h - 240), w: isVert ? 45 + Math.random() * 50 : 160 + Math.random() * 260, h: isVert ? 160 + Math.random() * 260 : 45 + Math.random() * 50 });
        }
        for (let i = 0; i < 18; i++) slowZones.push({ x: Math.random() * (MAP_SIZE.w - 360), y: Math.random() * (MAP_SIZE.h - 360), w: 240 + Math.random() * 180, h: 180 + Math.random() * 160, type: 'spore' });
    }
    else if (currentMapType === 13) { // Thanh Pho N
        bgMapColor = '#2d3436';
        let gapBonus = shopFlags.urbanMap ? 70 : 25;
        shopFlags.urbanMap = false;
        let blockSize = 180;
        for (let gx = 180; gx < MAP_SIZE.w - 220; gx += blockSize + gapBonus) {
            for (let gy = 180; gy < MAP_SIZE.h - 220; gy += blockSize + gapBonus) {
                if (Math.random() < 0.16) continue;
                obstacles.push({ type: 'building', x: gx + Math.random() * 18, y: gy + Math.random() * 18, w: blockSize + Math.random() * 50, h: blockSize + Math.random() * 70 });
            }
        }
    }

    for (let t of towers) obstacles = obstacles.filter(o => Math.hypot((o.x + o.w / 2) - t.x, (o.y + o.h / 2) - t.y) > 200);
    // Tránh đè lên tiền đồn
    if (currentMapType === 5) obstacles = obstacles.filter(o => Math.hypot((o.x + o.w / 2) - MAP_SIZE.w / 2, (o.y + o.h / 2) - MAP_SIZE.h / 2) > 300);
    if (mission.type === 'COLLECT' || mission.type === 'POWER_LOCKS') spawnMissionItems(mission.required + 2);
    if (mission.type === 'POWER_CHARGE') {
        spawnMissionItems(mission.required + 3);
        for (let it of missionItems) it.kind = 'battery';
    }
    if (currentMapType !== 11) buildBushesForMap(level);

    for (let i = 0; i < 600; i++) GROUND_DOTS.push({ x: Math.random() * MAP_SIZE.w, y: Math.random() * MAP_SIZE.h, r: Math.random() * 2.5 + 0.5 });
    for (let i = 0, dropN = isCaveMap() ? caveDropCount() : 30; i < dropN; i++) {
        let p = isCaveMap() ? caveRandomOpenPoint() : findSafePoint(Math.random() * MAP_SIZE.w, Math.random() * MAP_SIZE.h, 18);
        spawnDrop(p.x, p.y);
    }
    // Bộ mìn phòng tuyến mua ở cửa hàng: rải quanh điểm xuất phát
    if (shopFlags.mines > 0) {
        for (let i = 0; i < shopFlags.mines; i++) {
            let a = (i / shopFlags.mines) * Math.PI * 2;
            let mp = findSafePoint(MAP_SIZE.w / 2 + Math.cos(a) * 260, MAP_SIZE.h / 2 + Math.sin(a) * 260, 14);
            hazards.push({ type: 'mine', x: mp.x, y: mp.y, radius: 70, life: 9999, friendly: true, source: players[0] });
        }
        shopFlags.mines = 0;
    }
    // Giải cứu: NPC không bị kẹt trong vật cản
    for (let n of rescueNPCs) { let sp = findSafePoint(n.x, n.y, 20); n.x = sp.x; n.y = sp.y; }
    pickWeatherForMap(true);
    weatherTimer = 45 + Math.random() * 30;
}
function spawnRescueNPCs(count) {
    rescueNPCs = [];
    // Pháo sáng cứu hộ: NPC xuất hiện gần điểm xuất phát hơn
    let spread = shopFlags.flare ? 1100 : (MAP_SIZE.w - 700) / 2;
    for (let i = 0; i < count; i++) {
        rescueNPCs.push(new RescueNPC(
            MAP_SIZE.w / 2 + (Math.random() - 0.5) * 2 * spread,
            MAP_SIZE.h / 2 + (Math.random() - 0.5) * 2 * spread
        ));
    }
}

// Hàm sinh vật phẩm DUY NHẤT (trước đây có 2 bản trùng tên với tỉ lệ khác nhau)
const MAX_GROUND_DROPS = 150;
function spawnDrop(x, y, isSuper = false, typeOverride = null) {
    if (typeOverride === 'MEDKIT') { drops.push({ type: 'MEDKIT', x, y, radius: 15, lifeTime: 900.0 }); return; }
    if (isSuper) { drops.push({ type: 'SUPERBOX', x, y, radius: 16, lifeTime: 900.0 }); return; }
    if (drops.length >= MAX_GROUND_DROPS) return;

    // Hộp cứu thương chỉ rơi ngẫu nhiên khi có thẻ Cứu Thương (s_medbox)
    let hasMedboxUpgrade = players.some(p => p && p.perks && p.perks.s_medbox);
    let r = Math.random();
    if (hasMedboxUpgrade && r < 0.12) drops.push({ type: 'MEDKIT', x, y, radius: 15, lifeTime: 900.0 });
    else if (r < 0.55) drops.push({ type: 'FOOD', x, y, radius: 12, lifeTime: 900.0 });
    else drops.push({ type: 'BLINDBOX', x, y, radius: 16, lifeTime: 1200.0 });
}


function applyRandomStat(p) {
    let r = Math.random();
    if (r < 0.33) { p.dmgMult += 0.1; vfxList.push({ type: 'text', text: '+Sát Thương', x: p.x, y: p.y - 50, life: 1.5, color: '#e74c3c' }); }
    else if (r < 0.66) { p.maxHp += 20; p.hp += 20; vfxList.push({ type: 'text', text: '+Máu', x: p.x, y: p.y - 50, life: 1.5, color: '#2ecc71' }); }
    else { p.baseSpeed += 15; vfxList.push({ type: 'text', text: '+Tốc Độ', x: p.x, y: p.y - 50, life: 1.5, color: '#3498db' }); }
}

function resolveCollision(entity) {
    for (let obs of obstacles) { let testX = entity.x, testY = entity.y; if (entity.x < obs.x) testX = obs.x; else if (entity.x > obs.x + obs.w) testX = obs.x + obs.w; if (entity.y < obs.y) testY = obs.y; else if (entity.y > obs.y + obs.h) testY = obs.y + obs.h; let distX = entity.x - testX, distY = entity.y - testY; let dist = Math.hypot(distX, distY); if (dist < entity.radius) { let overlap = entity.radius - dist; if (dist === 0) entity.y -= entity.radius; else { entity.x += (distX / dist) * overlap; entity.y += (distY / dist) * overlap; } } }
    entity.x = Math.max(entity.radius, Math.min(MAP_SIZE.w - entity.radius, entity.x)); entity.y = Math.max(entity.radius, Math.min(MAP_SIZE.h - entity.radius, entity.y));
}
function isBlockedPoint(x, y, radius = 16) {
    for (let obs of obstacles) {
        let testX = Math.max(obs.x, Math.min(x, obs.x + obs.w));
        let testY = Math.max(obs.y, Math.min(y, obs.y + obs.h));
        if (Math.hypot(x - testX, y - testY) < radius) return true;
    }
    return x < radius || y < radius || x > MAP_SIZE.w - radius || y > MAP_SIZE.h - radius;
}

function findSafePoint(x, y, radius = 16) {
    if (!isBlockedPoint(x, y, radius)) return { x, y };
    for (let r = 60; r <= 520; r += 60) {
        for (let i = 0; i < 18; i++) {
            let a = (i / 18) * Math.PI * 2 + Math.random() * 0.2;
            let nx = Math.max(radius, Math.min(MAP_SIZE.w - radius, x + Math.cos(a) * r));
            let ny = Math.max(radius, Math.min(MAP_SIZE.h - radius, y + Math.sin(a) * r));
            if (!isBlockedPoint(nx, ny, radius)) return { x: nx, y: ny };
        }
    }
    return { x: MAP_SIZE.w / 2, y: MAP_SIZE.h / 2 };
}
// THÊM HÀM NÀY VÀO DƯỚI resolveCollision
function hasLineOfSight(x1, y1, x2, y2) {
    for (let obs of obstacles) {
        if (obs.type === 'tree') continue; // Cây có thể nhìn xuyên mờ mờ, tường/đá thì không
        // Kiểm tra giao cắt đoạn thẳng (x1,y1)->(x2,y2) với hình chữ nhật (obs)
        let minX = obs.x, maxX = obs.x + obs.w, minY = obs.y, maxY = obs.y + obs.h;
        if ((x1 < minX && x2 < minX) || (x1 > maxX && x2 > maxX) || (y1 < minY && y2 < minY) || (y1 > maxY && y2 > maxY)) continue;

        let t1 = (minX - x1) / (x2 - x1), t2 = (maxX - x1) / (x2 - x1);
        let t3 = (minY - y1) / (y2 - y1), t4 = (maxY - y1) / (y2 - y1);
        let tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
        let tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4));
        if (tmax >= Math.max(0, tmin) && tmin <= 1) return false; // Có vật cản
    }
    return true; // Không có vật cản
}
function makePolyBox(x, y, w, h, jitter = 18, points = 7) {
    let poly = [];
    for (let i = 0; i < points; i++) {
        let a = (i / points) * Math.PI * 2;
        let rx = w * 0.5 + (Math.random() - 0.5) * jitter;
        let ry = h * 0.5 + (Math.random() - 0.5) * jitter;
        poly.push({ x: x + w / 2 + Math.cos(a) * rx, y: y + h / 2 + Math.sin(a) * ry });
    }
    return poly;
}

function pointInBush(x, y) {
    for (let b of bushes) {
        if (b.burnedOut) continue;
        let dx = (x - b.x) / Math.max(1, b.rx);
        let dy = (y - b.y) / Math.max(1, b.ry);
        if (dx * dx + dy * dy <= 1) return b;
    }
    return null;
}
function igniteBush(bush, source = null) {
    if (!bush || bush.burnedOut) return;
    bush.burning = true;
    bush.burnTime = Math.max(bush.burnTime || 0, 10.0);
    bush.source = source || bush.source || null;
}

function createBushCluster(cx, cy, count, radius, dense = false) {
    for (let i = 0; i < count; i++) {
        let a = Math.random() * Math.PI * 2;
        let d = Math.random() * radius;
        bushes.push({
            x: cx + Math.cos(a) * d,
            y: cy + Math.sin(a) * d,
            rx: dense ? 95 + Math.random() * 55 : 70 + Math.random() * 45,
            ry: dense ? 70 + Math.random() * 45 : 48 + Math.random() * 35,
            rot: Math.random() * Math.PI,
            alpha: dense ? 0.42 : 0.30
        });
    }
}

function buildBushesForMap(level) {
    bushes = [];
    if (currentMapType === 8 || currentMapType === 5 || currentMapType === 6 || currentMapType === 10 || currentMapType === 14) return;
    if (currentMapType === 3) {
        for (let i = 0; i < 6; i++) createBushCluster(250 + Math.random() * (MAP_SIZE.w - 500), 250 + Math.random() * (MAP_SIZE.h - 500), 4, 120, false);
    } else if (currentMapType === 11) {
        for (let i = 0; i < 42; i++) createBushCluster(180 + Math.random() * (MAP_SIZE.w - 360), 180 + Math.random() * (MAP_SIZE.h - 360), 7, 150, true);
    } else if (currentMapType === 2 || currentMapType === 7 || currentMapType === 9) {
        for (let i = 0; i < 18 + Math.floor(level * 0.8); i++) createBushCluster(180 + Math.random() * (MAP_SIZE.w - 360), 180 + Math.random() * (MAP_SIZE.h - 360), 5, 135, false);
    }
}

function beginHangZRun() {
    hangZRun = { active: true, floor: 1, total: 3, timer: 210, stairs: null };
    nextMapPreference = 10;
    startLevel();
}

function advanceHangZFloor() {
    if (!hangZRun.active) return;
    if (hangZRun.floor >= hangZRun.total) {
        hangZRun.active = false;
        completeMission();
        return;
    }
    hangZRun.floor++;
    nextMapPreference = 10;
    generateMap(currentLevel);
    for (let p of players) {
        if (!p.isDowned) {
            p.x = MAP_SIZE.w / 2 + (p.id === 1 ? -28 : 28);
            p.y = MAP_SIZE.h / 2;
        }
    }
    zombies.length = 0;
    bullets.length = 0;
    enemyBullets.length = 0;
    fireZones.length = 0; hazards.length = 0; thrownItems.length = 0; decals.length = 0; allies.forEach(a => { a.x = MAP_SIZE.w / 2; a.y = MAP_SIZE.h / 2 + 40; });
    vfxList.push({ type: 'text', text: 'TẦNG ' + hangZRun.floor + '/' + hangZRun.total, x: players[0].x, y: players[0].y - 70, life: 2.0, color: '#95a5a6' });
    hangZRun.timer = Math.max(hangZRun.timer, 60) + 30; // thưởng thêm thời gian mỗi tầng
    updateCamera(0, true);
    if (NET.mode === 'host') netSendMap();
}
function checkSlowZone(x, y) {
    let speedMult = 1.0;
    for (let sz of slowZones) {
        if (x > sz.x && x < sz.x + sz.w && y > sz.y && y < sz.y + sz.h) {
            speedMult = Math.min(speedMult, sz.type === 'mud' ? 0.6 : (sz.type === 'electric' ? 0.55 : (sz.type === 'boss' ? 0.45 : 0.4)));

            speedMult = Math.min(speedMult, sz.type === 'spore' ? 0.65 : speedMult);
        }
    }
    if (pointInBush(x, y)) speedMult = Math.min(speedMult, 0.72);
    return speedMult;
}
function updateEmpStorm(dt) {
    if (currentWeather !== 12) {
        empStorm.active = false;
        empStorm.cd = 20;
        empStorm.timer = 0;
        return;
    }
    if (empStorm.active) {
        empStorm.timer -= dt;
        if (empStorm.timer <= 0) {
            empStorm.active = false;
            empStorm.cd = 20;
        }
    } else {
        empStorm.cd -= dt;
        if (empStorm.cd <= 0) {
            empStorm.active = true;
            empStorm.timer = 5;
            addScreenShake(6);
            for (let p of players) vfxList.push({ type: 'text', text: 'BÃO ĐIỆN TỪ - SÚNG BỊ KHÓA 5s!', x: p.x, y: p.y - 80, life: 1.6, color: '#48dbfb' });
        }
    }
}
function updateBushFire(dt) {
    for (let fz of fireZones) {
        for (let b of bushes) {
            if (!b.burnedOut && Math.hypot(b.x - fz.x, b.y - fz.y) < (fz.radius || 40) + Math.max(b.rx, b.ry) * 0.65) {
                igniteBush(b, fz.source);
            }
        }
    }
    for (let b of bushes) {
        if (!b.burning || b.burnedOut) continue;
        b.burnTime -= dt;
        if (Math.random() < dt * 9) createParticles(b.x + (Math.random() - 0.5) * b.rx, b.y + (Math.random() - 0.5) * b.ry, '#e67e22', 1, 70);
        for (let other of bushes) {
            if (other !== b && !other.burnedOut && !other.burning && Math.hypot(other.x - b.x, other.y - b.y) < Math.max(b.rx, b.ry) + Math.max(other.rx, other.ry) + 40) {
                if (Math.random() < dt * 0.55) igniteBush(other, b.source);
            }
        }
        for (let z of zombies) {
            if (Math.hypot(z.x - b.x, z.y - b.y) < Math.max(b.rx, b.ry)) {
                z.hp -= z.maxHp * 0.012 * dt;
            }
        }
        if (b.burnTime <= 0) {
            b.burning = false;
            b.burnedOut = true;
            ashZones.push({ x: b.x, y: b.y, rx: b.rx, ry: b.ry, rot: b.rot || 0, life: 9999 });
        }
    }
}
function stunPlayer(p, dur = 0.8) {
    if (!p || p.isDowned) return;

    // 1. Kiểm tra nếu đang có bảo hộ miễn choáng -> Thoát ngay
    if (p.stunImmunityTimer > 0) return;

    let now = Date.now();

    // 2. Logic kiểm tra giãn cách giữa 2 phát choáng
    // Nếu phát choáng này cách phát choáng trước BÉ HƠN HOẶC BẰNG 500 mili-giây (0.5 giây)
    if (now - p.lastStunTime <= 500) {
        p.stunHitCount++; // Tăng bộ đếm vì dính liên tục
    } else {
        p.stunHitCount = 1; // Quá 0.5s rồi mới dính lại -> Reset bộ đếm về 1 phát đầu tiên
    }

    // Cập nhật mốc thời gian dính choáng mới nhất
    p.lastStunTime = now;

    // 3. Nếu bộ đếm đạt từ 2 phát liên tiếp trở lên trong vòng 0.5s -> Kích hoạt MIỄN CHOÁNG 1s
    if (p.stunHitCount >= 2) {
        p.stunTimer = 0;              // Hủy bỏ thời gian choáng hiện tại
        p.stunImmunityTimer = 1.0;    // Cấp 1 giây miễn nhiễm choáng hoàn toàn
        p.stunHitCount = 0;           // Reset bộ đếm đòn

        // VFX Cảnh báo kích hoạt bảo hộ thành công
        vfxList.push({ type: 'text', text: 'KHÁNG CHOÁNG!', x: p.x, y: p.y - 55, life: 1.0, color: '#3498db' });
        createParticles(p.x, p.y, '#3498db', 20, 150);
        return; // Thoát ra, không dính choáng nữa
    }

    // 4. Nếu không thỏa mãn điều kiện ăn combo choáng liên tục -> Dính choáng bình thường như cũ
    p.stunTimer = Math.max(p.stunTimer || 0, dur);

    createParticles(p.x, p.y, '#00d2d3', 12, 120);
    vfxList.push({ type: 'text', text: 'CHOÁNG!', x: p.x, y: p.y - 35, life: 0.8, color: '#00d2d3' });
}
function hurtPlayersInRadius(x, y, radius, dmg, opts = {}) {
    for (let p of players) {
        if (!p || p.isDowned) continue;
        let d = Math.hypot(p.x - x, p.y - y);
        if (d > radius + p.radius) continue;
        let amount = dmg * Math.max(0.25, 1 - d / Math.max(radius, 1));
        if (opts.dot) p.takeDot(amount); else p.takeDamage(amount);
        if (opts.stun) stunPlayer(p, opts.stun);
        if (opts.silence) p.silenceTimer = Math.max(p.silenceTimer || 0, opts.silence);
        if (opts.fear) p.fearTimer = Math.max(p.fearTimer || 0, opts.fear);
    }
}
function damageZombiesInRadius(x, y, radius, dmg, skipElectric = false, opts = {}) {
    for (let z of zombies) {
        if (z.hp <= 0) continue;
        if (skipElectric && ELECTRIC_IMMUNE_ZOMBIES.has(z.type)) continue;
        let d = Math.hypot(z.x - x, z.y - y);
        if (d < radius + z.radius) {
            z.hp -= dmg * Math.max(0.25, 1 - d / Math.max(radius, 1));
            if (opts.source) z.lastHitBy = opts.source;
            if (!opts.noKb) { let a = Math.atan2(z.y - y, z.x - x); z.knockback(Math.cos(a) * 260, Math.sin(a) * 260); }
        }
    }
}
function electricBurst(x, y, radius, dmg, stun = 0.6) {
    createParticles(x, y, '#00d2d3', 35, 360);
    spawnRing(x, y, '#00d2d3', radius, 0.3);
    addScreenShake(6);
    addScreenFlash(0.28, 220);
    hurtPlayersInRadius(x, y, radius, dmg, { stun });
    damageZombiesInRadius(x, y, radius, dmg * 0.45, true);
}
function distancePointToSegment(px, py, ax, ay, bx, by) {
    let vx = bx - ax, vy = by - ay, wx = px - ax, wy = py - ay;
    let c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - ax, py - ay);
    let c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - bx, py - by);
    let t = c1 / c2;
    return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}
function spawnAtEdge(type, count = 1) {
    for (let i = 0; i < count; i++) {
        let edge = Math.floor(Math.random() * 4), x, y;
        if (edge === 0) { x = Math.random() * MAP_SIZE.w; y = -40; }
        else if (edge === 1) { x = Math.random() * MAP_SIZE.w; y = MAP_SIZE.h + 40; }
        else if (edge === 2) { x = -40; y = Math.random() * MAP_SIZE.h; }
        else { x = MAP_SIZE.w + 40; y = Math.random() * MAP_SIZE.h; }
        zombies.push(new Zombie(x, y, type));
    }
}
// Thời tiết chỉ NHÂN tốc độ tạm thời, không ghi đè baseSpeed (giữ nguyên các nâng cấp Tốc độ)
function getWeatherSpeedMult() {
    if (currentWeather === 2) return 0.73;                           // Mưa: trơn trượt
    if (currentWeather === 3) return 1.2;                            // Gió đẩy
    if (currentWeather === 4 && currentMapType === 9) return 0.64;   // Bão sét rừng mưa
    if (currentWeather === 9) return 0.6;                            // Bão tuyết
    return 1;
}

function pickWeatherForMap(initial = false) {
    if (currentMapType === 14) currentWeather = 1;
    else if (currentMapType === 10) currentWeather = 1; // trong hang không có sương mù, chỉ có bóng tối
    else if (currentMapType === 7 || currentMapType === 11) currentWeather = 11;
    else if (currentMapType === 9) currentWeather = 4;
    else if (currentMapType === 6) currentWeather = initial ? 4 : 1;
    else if (currentMapType === 1 || currentMapType === 2 || currentMapType === 3) currentWeather = 1;
    else if (currentMapType === 12) currentWeather = Math.random() < 0.5 ? 5 : 10;
    else if (currentMapType === 13) currentWeather = Math.random() < 0.6 ? 6 : 1;
    else {
        let wPool = initial ? [1, 1, 2, 3, 5, 7] : [1, 2, 3, 5, 6, 7, 9, 10, 11, 12];
        currentWeather = wPool[Math.floor(Math.random() * wPool.length)];
    }
}

function pickAlivePlayer() {
    let alive = players.filter(p => !p.isDowned);
    return alive.length ? alive[Math.floor(Math.random() * alive.length)] : players[0];
}

// Phóng điện của phe ta: chỉ gây sát thương lên quái
function friendlyZap(x, y, radius, dmg, source = null) {
    createParticles(x, y, '#00d2d3', 18, 260);
    spawnRing(x, y, '#00d2d3', radius, 0.3);
    for (let z of zombies) {
        if (z.hp <= 0 || ELECTRIC_IMMUNE_ZOMBIES.has(z.type)) continue;
        let d = Math.hypot(z.x - x, z.y - y);
        if (d < radius + z.radius) {
            z.hp -= dmg * Math.max(0.4, 1 - d / Math.max(radius, 1));
            z.stunTimer = Math.max(z.stunTimer || 0, 0.4);
            if (source) z.lastHitBy = source;
        }
    }
}

function updateHazards(dt) {
    let dienLvl = getTeamTagLevel('ĐIỆN');
    for (let pl of players) {
        if (pl.isDowned) continue;

        // 1. Perk Điện Áp: Giật sát thương xung quanh
        if (pl.perks.e_dienAp) {
            damageZombiesInRadius(pl.x, pl.y, 150, 40 * pl.getTotalDamageMult() * dt, false, { noKb: true, source: pl });
            if (Math.random() < 0.1) createParticles(pl.x + (Math.random() - 0.5) * 160, pl.y + (Math.random() - 0.5) * 160, '#00d2d3', 2, 80);
        }

        // 2. Perk Giáp Năng Lượng: mỗi 5s nhận 1 lớp khiên (tối đa 3), bộ đếm riêng từng người
        if (pl.perks.e_giapNangLuong) {
            pl.energyShieldTimer = (pl.energyShieldTimer || 0) + dt;
            if (pl.energyShieldTimer >= 5.0) {
                pl.energyShieldTimer = 0;
                if (pl.tempShield < 3) {
                    pl.tempShield++;
                    vfxList.push({ type: 'text', text: '🛡️ +1 GIÁP ĐIỆN', x: pl.x, y: pl.y - 50, life: 1.0, color: '#00cec9' });
                }
            }
        }

        if (currentWeather === 7) pl.hunger -= 1.5 * dt;   // Nắng nóng: đói nhanh gấp 2.5
        if (currentWeather === 10) pl.takeDot(0.25 * dt);  // Mưa acid: rút máu ngầm
    }

    // 3. Mốc 4 ĐIỆN: Tháp đã kích hoạt tự phóng sét phòng thủ
    if (dienLvl >= 4) {
        for (let t of towers) {
            if (!t.active) continue;
            t.laserCD = (t.laserCD || 0) - dt;
            if (t.laserCD <= 0) {
                let tz = getNearestZombie(t.x, t.y, 400);
                if (tz) {
                    friendlyZap(tz.x, tz.y, 100, 150, players[0]);
                    vfxList.push({ type: 'laser_beam', x: t.x, y: t.y - 35, tx: tz.x, ty: tz.y, life: 0.2, jag: true });
                    t.laserCD = 1.5;
                }
            }
        }
    }

    // Đổi thời tiết theo chu kỳ 45s - 75s
    weatherTimer -= dt;
    if (weatherTimer <= 0) {
        weatherTimer = 45 + Math.random() * 30;
        pickWeatherForMap(false);
    }

    let p = pickAlivePlayer();

    // Bão Mưa Sét (Thiên tai đánh ngẫu nhiên)
    if (currentWeather === 4) {
        thunderTimer -= dt;
        if (thunderTimer <= 0) {
            if (currentMapType === 9) thunderTimer = 0.8 + Math.random() * 1.0;
            else if (currentMapType === 6) thunderTimer = 1.5 + Math.random() * 1.0;
            else thunderTimer = 4 + Math.random() * 2;

            let strikeDmg = 50, strikeRadius = 90;
            if (currentMapType === 6) { strikeDmg = 90; strikeRadius = 180; }

            hazards.push({
                type: 'strike',
                x: p.x + (Math.random() - 0.5) * 600,
                y: p.y + (Math.random() - 0.5) * 600,
                radius: strikeRadius,
                timer: currentMapType === 9 ? 0.8 : 1.5,
                life: 3.2,
                dmg: strikeDmg,
                stun: 1.5
            });
        }
    }
    flashAlpha = Math.max(0, flashAlpha - dt * 4);

    if (currentMapType === 6) {
        for (let coil of powerCoils) {
            coil.cd -= dt; coil.pulse = Math.max(0, (coil.pulse || 0) - dt);
            if (coil.cd <= 0) {
                coil.cd = 2.2 + Math.random() * 1.6;
                coil.pulse = 0.55;
                electricBurst(coil.x, coil.y, coil.radius, 10 + powerPlantRun.floor * 2, 0.45);
            }
        }
    }
    if (currentMapType === 7 || currentMapType === 9 || currentMapType === 10 || currentMapType === 11 || currentWeather === 11) {
        let darkDrain = currentMapType === 10 ? 2.2 : (currentMapType === 11 ? 3.2 : 4.0);
        darknessBattery = Math.max(0, darknessBattery - dt * darkDrain);
        for (let flower of lightFlowers) {
            flower.charge = Math.min(100, flower.charge + dt * 4);
            if (flower.charge > 20 && players.some(pl => !pl.isDowned && Math.hypot(pl.x - flower.x, pl.y - flower.y) < 70)) {
                darknessBattery = Math.min(100, darknessBattery + 45);
                flower.charge = 0;
                createParticles(flower.x, flower.y, '#f9ca24', 22, 180);
                spawnRing(flower.x, flower.y, '#f9ca24', 160, 0.5);
                Sound.play('pickup');
            }
        }
        if (darknessBattery <= 5 && Math.random() < dt * 0.8) darknessFlash = 0.45;
    }
    darknessFlash = Math.max(0, darknessFlash - dt);
    if (currentMapType === 8) {
        cityCollapseTimer -= dt;
        if (cityCollapseTimer <= 0) {
            cityCollapseTimer = 8 + Math.random() * 10;
            hazards.push({ type: 'collapse', x: p.x + (Math.random() - 0.5) * 700, y: p.y + (Math.random() - 0.5) * 700, radius: 135, timer: 1.2, life: 1.6 });
        }
    }

    for (let i = hazards.length - 1; i >= 0; i--) {
        let h = hazards[i];
        h.life -= dt;
        if (h.stunCD > 0) h.stunCD -= dt;
        if (h.timer !== undefined) {
            let oldTimer = h.timer;
            h.timer -= dt;
            if (oldTimer > 0 && h.timer <= 0 && h.type === 'strike') {
                addScreenFlash(0.55, 260);
                vfxList.push({ type: 'bolt', x: h.x, y: h.y, life: 0.25, max: 0.25, seed: Math.random() * 1000 });
                Sound.play('lightning');
                if (currentWeather === 4) Sound.play('thunder'); // tiếng sấm rền (tự giãn cách ~9s)
                // Sét đánh trúng quái sẽ nạp QUÁ TẢI cho chúng
                for (let z of zombies) {
                    if (Math.hypot(z.x - h.x, z.y - h.y) < h.radius) applyStatus(z, STATUS.OVERLOAD, { duration: 6.0, stacks: 2, maxStacks: 5 });
                }
            }
        }

        if (h.type === 'electric') {
            if (h.friendly) {
                // Vùng điện của phe ta (Thiết Xa Lôi Động, Đoản Mạch): chỉ giật quái
                for (let z of zombies) {
                    if (z.hp <= 0 || ELECTRIC_IMMUNE_ZOMBIES.has(z.type)) continue;
                    if (Math.hypot(z.x - h.x, z.y - h.y) < h.radius + z.radius) {
                        z.hp -= (h.dmg || 30) * dt;
                        z.stunTimer = Math.max(z.stunTimer || 0, 0.1);
                        if (h.source) z.lastHitBy = h.source;
                    }
                }
            } else {
                let canStun = !(h.stunCD > 0);
                hurtPlayersInRadius(h.x, h.y, h.radius, (h.dmg || 12) * dt, { dot: true, stun: canStun ? (h.stun || 0.25) : 0 });
                if (canStun) h.stunCD = 1.2;
            }
            if (Math.random() < dt * 12) createParticles(h.x + (Math.random() - 0.5) * h.radius * 1.4, h.y + (Math.random() - 0.5) * h.radius * 1.4, '#00d2d3', 1, 60);
        } else if (h.type === 'slow') {
            hurtPlayersInRadius(h.x, h.y, h.radius, (h.dmg || 8) * dt, { dot: true });
            for (let pl of players) if (!pl.isDowned && Math.hypot(pl.x - h.x, pl.y - h.y) < h.radius) pl.netTimer = Math.max(pl.netTimer || 0, 0.25);
        } else if (h.type === 'magnet') {
            for (let pl of players) {
                if (pl.isDowned) continue;
                if (h.range && Math.hypot(pl.x - h.x, pl.y - h.y) > h.range) continue; // ngoài tầm hút
                let a = Math.atan2(h.y - pl.y, h.x - pl.x);
                pl.x += Math.cos(a) * (h.power || 280) * dt;
                pl.y += Math.sin(a) * (h.power || 280) * dt;
                if (!(h.stunCD > 0) && Math.hypot(pl.x - h.x, pl.y - h.y) < h.radius) { stunPlayer(pl, 0.8); h.stunCD = 1.5; }
            }
        } else if (h.type === 'mine') {
            if (zombies.some(z => z.hp > 0 && !z.hidden && Math.hypot(z.x - h.x, z.y - h.y) < 70 + z.radius)) {
                explode(h.x, h.y, 230, 380, h.source || null, true);
                h.life = 0;
            }
        } else if ((h.type === 'rock' || h.type === 'slam' || h.type === 'artillery' || h.type === 'strike' || h.type === 'collapse') && h.timer <= 0) {
            if (h.friendly) explode(h.x, h.y, h.radius || 130, h.dmg || 90, h.source || null, true);
            else if (h.type === 'strike') electricBurst(h.x, h.y, h.radius || 90, h.dmg || 32, h.stun === undefined ? 0.8 : h.stun);
            else if (h.type === 'collapse') {
                hurtPlayersInRadius(h.x, h.y, h.radius, 9999);
                damageZombiesInRadius(h.x, h.y, h.radius, 9999);
                createParticles(h.x, h.y, '#95a5a6', 80, 520);
                spawnRing(h.x, h.y, '#95a5a6', h.radius * 1.3, 0.45);
                addDecal(h.x, h.y, '#3d3d3d', h.radius * 0.8, 0.5);
                addScreenShake(20);
                Sound.play('explode');
            } else explode(h.x, h.y, h.radius || 130, h.dmg || 90);
            h.life = 0;
        } else if (h.type === 'quake' && h.timer <= 0) {
            // Dậm đất của quái: chỉ hại phe người chơi, không làm bị thương quái khác
            hurtPlayersInRadius(h.x, h.y, h.radius, h.dmg || 30, { stun: h.stun || 0 });
            if (tank.active && tank.p2InvulnTimer <= 0 && Math.hypot(tank.x - h.x, tank.y - h.y) < h.radius + tank.radius) tank.hp -= (h.dmg || 30) * 0.5;
            for (let a of allies) if (a.hp > 0 && Math.hypot(a.x - h.x, a.y - h.y) < h.radius) a.takeDamage((h.dmg || 30) * 0.5);
            createParticles(h.x, h.y, '#7f8c8d', 40, 300);
            spawnRing(h.x, h.y, '#bdc3c7', h.radius, 0.35, 6);
            addDecal(h.x, h.y, '#2d2d2d', h.radius * 0.35, 0.3);
            addScreenShake(Math.min(16, 6 + h.radius / 30));
            Sound.play('tank');
            h.life = 0;
        } else if (h.type === 'emp' && h.timer <= 0) {
            hurtPlayersInRadius(h.x, h.y, h.radius, h.dmg || 18, { silence: 2.0 });
            createParticles(h.x, h.y, '#ff6b6b', 70, 420);
            spawnRing(h.x, h.y, '#ff6b6b', h.radius, 0.4);
            addScreenShake(12);
            h.life = 0;
        } else if (h.type === 'cage' && h.timer <= 0) {
            for (let pl of players) {
                if (pl.isDowned) continue;
                for (let j = 0; j < h.points.length; j++) {
                    let a = h.points[j], b = h.points[(j + 1) % h.points.length];
                    if (distancePointToSegment(pl.x, pl.y, a.x, a.y, b.x, b.y) < pl.radius + 12) {
                        pl.takeDot((h.dmg || 10) * dt);
                        if (!(h.stunCD > 0)) { stunPlayer(pl, 0.35); h.stunCD = 1.0; }
                    }
                }
            }
        } else if (h.type === 'beam') {
            let len = 1600, bx = h.x + Math.cos(h.angle) * len, by = h.y + Math.sin(h.angle) * len;
            h.angle += (h.rot || 1.6) * dt;
            for (let pl of players) if (!pl.isDowned && distancePointToSegment(pl.x, pl.y, h.x, h.y, bx, by) < pl.radius + 14) pl.takeDot((h.dmg || 70) * dt);
        }
        if (h.life <= 0) hazards.splice(i, 1);
    }
}
function addScreenShake(amt) { cameraShake = Math.max(cameraShake, amt); }
