function toggleGuideModal(show) {
    document.getElementById('guideModal').style.display = show ? 'flex' : 'none';
}

// Đặt lại toàn bộ trạng thái của MỘT lượt chơi (tránh rò rỉ dữ liệu từ ván trước)
function resetRunState() {
    currentLevel = 1;
    shopScrap = 0;
    hasPowerPlantMap = false;
    nextRoute = 'balanced';
    nextMapPreference = null;
    nextMissionPreference = null;
    pendingShopDrop = false;
    powerPlantRun = { active: false, floor: 0, total: 3 };
    hangZRun = { active: false, floor: 0, total: 3, timer: 180, stairs: null };
    resetCaveState();
    theDeadSpawnChance = 0.0;
    shopOpenedForLevel = 0;
    breakthroughShards = 0;
    activeExclusiveTag = null;
    currentPowerFloorCleared = 0;
    globalTankKills = 0;
    shardGrantedLevel = 0;
    pendingBattery = 0;
    killCount = 0;
    lastSpecialMapLevel = 0;
    shopFlags = { flare: false, mines: 0, herbicide: false, urbanMap: false };
    levelStartTexts = [];
    currentWeather = 1; weatherTimer = 0;
    ashZones = []; decals = [];
    radioDialogs = []; radioDialogTimer = 40;
    allyDropTimer = 38;
    tank.active = false; turretMode.active = false;
    window.armySniperTimer = 0;
    showTagsP1 = false; showTagsP2 = false;
}

// mode: 'pc' | 'mobile' | 'local2' | 'online'
function beginRun(mode) {
    Sound.startAmbience();
    Sound.play('start');
    clearPcInputs();
    document.getElementById('menu').style.display = 'none';
    document.getElementById('routeShop').style.display = 'none';
    document.getElementById('upgradeScreen').style.display = 'none';
    document.getElementById('netWait').style.display = 'none';
    resetRunState();

    isSinglePlayer = (mode === 'pc' || mode === 'mobile');
    showTouchUI = (mode === 'mobile' || mode === 'local2');
    if (showTouchUI) PC_INPUT.pointer.active = false;

    players = [];
    if (isSinglePlayer) {
        players.push(new Player(1, MAP_SIZE.w / 2, MAP_SIZE.h / 2 + 60, '#3498db'));
    } else {
        players.push(new Player(1, MAP_SIZE.w / 2, MAP_SIZE.h / 2 + 140, '#3498db'));
        players.push(new Player(2, MAP_SIZE.w / 2, MAP_SIZE.h / 2 - 140, '#e74c3c'));
    }

    if (thietXaUnlocked) {
        players[0].weapon = { ...WEAPON_TYPES['RADIO'] };
        levelStartTexts.push({ text: 'THIẾT XA BÁO CÁO!', color: '#f39c12' });
    }

    startLevel();
}

function startCampaign(pcMode) { beginRun(pcMode ? 'pc' : 'local2'); }
function startCampaignMobileSingle() { beginRun('mobile'); }

function showGameOver(level, seconds) {
    gameState = 'GAMEOVER';
    Sound.play('gameover');
    Sound.music('theme');
    clearPcInputs();
    document.getElementById('menu').style.display = 'flex';
    document.getElementById('upgradeScreen').style.display = 'none';
    document.getElementById('routeShop').style.display = 'none';
    document.getElementById('netWait').style.display = 'none';
    document.getElementById('exclusiveWarningDialog').style.display = 'none';
    document.getElementById('menuTitle').innerText = 'TỬ TRẬN';
    document.getElementById('menuInfo').innerHTML = `Kỷ lục sinh tồn: Map <span class="highlight">${level}</span>.<br>Bạn đã trụ được <span class="highlight">${Math.floor(seconds)}s</span> ở map cuối và hạ <span class="highlight">${killCount}</span> zombie.<br><span class="text-xs text-gray-400">Chọn chế độ để chơi lại.</span>`;
}

// Gọi lính theo các thẻ Triệu Hồi mỗi đầu map (lính không còn biến mất khi qua map)
function spawnSquad() {
    let bonus = (getTeamTagLevel('TRIEU_HOI') >= 5 ? 1 : 0) + (getTeamTagLevel('QUAN_DOI') >= 5 ? 1 : 0);
    for (let p of players) {
        if (p.perks.a_call_rifleman) for (let i = 0; i < 1 + bonus; i++) summonAlly('rifleman', p);
        if (p.perks.a_call_vanguard) for (let i = 0; i < 1 + bonus; i++) summonAlly('vanguard', p);
        if (p.perks.a_call_medic) summonAlly('medic', p);
    }
}

function startLevel() {
    gameState = 'PLAYING'; initControls();
    document.getElementById('upgradeScreen').style.display = 'none';
    zombies = []; bullets = []; enemyBullets = []; slashes = []; thrownItems = []; drops = []; particles = []; vfxList = []; airdropMarkers = []; fireZones = [];
    decals = []; ashZones = []; rescueNPCs = [];
    lastFocusedTarget = null;
    tank.active = false; heliSupport.active = false;
    score = 0; survivalTime = 0; cameraShake = 0; airdropTimer = 30; zombieTimer = 0; itemTimer = 0; objState = 'TOWERS'; evacTimer = 0; evacZone = null; drones = []; raiBoomTimer = 0; missionItems = []; bossSpawned = false; hazards = []; powerCoils = []; lightFlowers = []; darknessBattery = 100; darknessFlash = 0; cityCollapseTimer = 8.0;
    allies = []; outposts = []; fortressTimer = 120.0;
    airstrikeTimer = 15.0;
    levelStartTimer = 3.0; // Hiện Map 3 giây
    towerAlertTimer = 0;
    flashAlpha = 0; thunderTimer = 3; empStorm = { cd: 20, timer: 0, active: false };
    turretMode.active = false;

    for (let p of players) {
        let wasDowned = p.isDowned;
        p.stunHitCount = 0; p.lastStunTime = 0; p.stunTimer = 0; p.silenceTimer = 0; p.netTimer = 0; p.markedTimer = 0; p.status = {};
        p.pullingPin = false; p.chargeTime = 0; p.reviveProgress = 0; p.hurtFlash = 0;
        p.x = MAP_SIZE.w / 2; p.y = MAP_SIZE.h / 2 + (p.id === 1 ? 60 : -60); p.isDowned = false;
        if (currentLevel === 1) p.hp = p.maxHp;
        else if (wasDowned) p.hp = Math.max(1, p.maxHp * 0.3);   // Đồng đội gục được cứu khi qua map
        else p.hp = Math.max(1, Math.min(p.hp, p.maxHp));
        p.hunger = Math.max(p.hunger, 35);
        p.perks.adrenUsed = false; p.perks.instReviveUsed = false; p.perks.invulnTimer = 0;
        if (currentLevel > 1) {
            p.pendingUpgrades++;
            if (p.perks.evo) applyRandomStat(p);
        }
        // Đạo Của Kiếm: bắt đầu MỖI map với Katana độ bền x2 nếu đang tay không
        if (p.perks.startSword && !p.weapon) {
            p.weapon = { ...WEAPON_TYPES['KATANA'] };
            p.weapon.maxAmmo *= 2; p.weapon.ammo = p.weapon.maxAmmo;
        }
    }

    generateMap(currentLevel);
    theDeadLevelStart(); // quay tỉ lệ xuất hiện boss ẩn The Dead
    spawnSquad();
    showMapIntro();
    updateMoodMusic();
    if (pendingShopDrop) {
        spawnDrop(MAP_SIZE.w / 2 + 90, MAP_SIZE.h / 2, true);
        pendingShopDrop = false;
    }
    let teamDien = getTeamTagLevel('ĐIỆN');
    if (teamDien >= 15 && players[0]) {
        players[0].weapon = { ...WEAPON_TYPES['TESLA_CARBINE'] };
        levelStartTexts.push({ text: '⚡ TESLA CARBINE KHỞI ĐẦU 15 ĐIỆN!', color: '#ff9f43' });
    }
    // Các thông báo dồn lại từ màn nâng cấp / cửa hàng
    levelStartTexts.forEach((t, i) => vfxList.push({ type: 'text', text: t.text, x: players[0].x, y: players[0].y - 70 - i * 24, life: 3.0, color: t.color }));
    levelStartTexts = [];

    updateCamera(0, true);
    if (NET.mode === 'host') { netSendMap(); netSendSync(); }

    // Vòng lặp game: mỗi lần startLevel tạo 1 token mới -> không bao giờ chạy trùng 2 vòng lặp
    const token = ++loopToken;
    lastTime = performance.now();
    const run = (time) => {
        if (token !== loopToken || gameState !== 'PLAYING') return;
        try { gameLoop(time); }
        catch (err) { console.error('[gameLoop]', err); }
        if (token === loopToken && gameState === 'PLAYING') requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
}

// ---------------- TẠM DỪNG GIỮA TRẬN ----------------
// Phím P / Esc hoặc nút ⏸. Online: một người dừng thì cả hai cùng dừng (và cùng tiếp tục).
let pauseStartedAt = 0;
function runMainLoop() {
    const token = ++loopToken, guest = NET.mode === 'guest';
    lastTime = performance.now();
    const run = (time) => {
        if (token !== loopToken || gameState !== 'PLAYING') return;
        try { if (guest) guestLoop(time); else gameLoop(time); }
        catch (err) { console.error('[loop]', err); }
        if (token === loopToken && gameState === 'PLAYING') requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
}
function setPaused(on, fromNet = false) {
    let ov = document.getElementById('pauseOverlay');
    if (on) {
        if (gameState !== 'PLAYING') return;
        gameState = 'PAUSED'; loopToken++; pauseStartedAt = Date.now();
        clearPcInputs();
        document.getElementById('pauseWho').textContent = fromNet ? 'Đồng đội đã tạm dừng trận đấu.' : (NET.mode ? 'Cả hai máy đều đang dừng.' : '');
        ov.style.display = 'flex';
    } else {
        if (gameState !== 'PAUSED') return;
        ov.style.display = 'none';
        // Các bộ đếm dùng đồng hồ thật (chốt lựu đạn, lựu đạn đang bay) được dời đi đúng bằng thời gian đã dừng
        let delta = Date.now() - pauseStartedAt;
        for (let p of players) if (p.pullingPin && p.pinTime) p.pinTime += delta;
        for (let t of thrownItems) if (t.expTime) t.expTime += delta;
        gameState = 'PLAYING';
        runMainLoop();
    }
    if (NET.mode && !fromNet) netSend({ t: 'pause', on: on ? 1 : 0 });
}
function togglePause() { if (gameState === 'PLAYING') setPaused(true); else if (gameState === 'PAUSED') setPaused(false); }
function quitToMenu() {
    if (gameState !== 'PAUSED') return;
    document.getElementById('pauseOverlay').style.display = 'none';
    if (NET.mode === 'host') netHostGameOver();
    if (NET.mode) netTeardown();
    showGameOver(currentLevel, survivalTime);
}
window.addEventListener('keydown', e => {
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat && !(e.target && e.target.tagName === 'INPUT') && (gameState === 'PLAYING' || gameState === 'PAUSED')) { e.preventDefault(); togglePause(); }
});
setInterval(() => { let b = document.getElementById('pauseBtn'); if (b) b.style.display = gameState === 'PLAYING' ? 'block' : 'none'; }, 250);

function gameLoop(time) {
    if (gameState !== 'PLAYING') return;
    let dt = Math.min((time - lastTime) / 1000, 0.1); lastTime = time;
    frameDt = dt;
    survivalTime += dt; score += dt * 10;

    let allDead = players.every(p => p.isDowned);
    if (allDead && !tank.active) {
        if (NET.mode === 'host') netHostGameOver();
        showGameOver(currentLevel, survivalTime);
        return;
    }

    frameElectricals = zombies.filter(z => z.type === 28 && z.hp > 0);
    syncPcControls();
    if (tank.active) updateTank(dt); else for (let p of players) p.update(dt);
    if (objState === 'DEFEND' && turretMode.active) updateDefendTurret(dt);
    updateBushFire(dt);
    updateRadioDialogs(dt);
    updateEmpStorm(dt);

    let droneTag = getTeamTagLevel('DRONE');
    let heliTag = getTeamTagLevel('TRỰC THĂNG');
    let isPermaHeli = (droneTag >= 5 && heliTag >= 5); // Hiệu ứng yểm trợ cả trận

    // Tách logic hoạt động của Trực thăng ra ngoài để bám theo ngay lập tức
    if (isPermaHeli && objState !== 'WAITING' && objState !== 'EVAC') {
        heliSupport.active = true;
        let tx = isSinglePlayer ? players[0].x : (players[0].x + players[1].x) / 2;
        let ty = isSinglePlayer ? players[0].y : (players[0].y + players[1].y) / 2;
        heliSupport.x += (tx - heliSupport.x) * dt * 1.5;
        heliSupport.y += (ty - heliSupport.y) * dt * 1.5;

        heliSupport.fireTimer -= dt;
        if (heliSupport.fireTimer <= 0) {
            heliSupport.fireTimer = hasTeamPerk('p_yemTro') ? 0.1 : 0.2;
            let dmgHeli = 100 + heliTag * 40;
            if (hasTeamPerk('p_yemTro')) dmgHeli *= 1.5;
            let targetZ = getNearestZombie(heliSupport.x, heliSupport.y, 800);
            if (targetZ) {
                let ang = Math.atan2(targetZ.y - heliSupport.y, targetZ.x - heliSupport.x);
                let isPierce = hasTeamPerk('p_hoaLuc');
                bullets.push(new Bullet(heliSupport.x, heliSupport.y, ang, { range: 800, dmg: dmgHeli, armorPiercing: true, isHeli: true, wallPiercing: isPierce, pierce: isPierce ? 99 : 0 }, null));
            }
        }
    }

    if (isCaveMap() && updateCaveWorld(dt)) return; // Hang Z / Hầm Mỏ / Boss Kiến Chúa
    updateTheDead(dt);

    if (objState === 'DEFEND') {
        fortressTimer -= dt;
        if (fortressTimer <= 0) {
            completeMission(); // Thắng map Thành trì
            return;
        }
    }

    else if (objState === 'COLLECT' || objState === 'KILL' || objState === 'BOSS' || objState === 'POWER_LOCKS' || objState === 'POWER_KILL' || objState === 'POWER_BOSS' || objState === 'CITY_BOSS' || objState === 'HANGZ_ESCAPE' || objState === 'POWER_CHARGE' || objState === 'RESCUE') {
        updateMission(dt); // (RESCUE trước đây bị thiếu trong danh sách -> nhiệm vụ Giải Cứu không bao giờ hoàn thành)
    }

    else if (objState === 'ROOFTOP') {
        let allIn = true; for (let p of players) { if (!p.isDowned && Math.hypot(p.x - evacZone.x, p.y - evacZone.y) > 180) allIn = false; }
        if (allIn && !tank.active && players.some(p => !p.isDowned)) {
            evacZone.progress += dt;
            if (evacZone.progress >= 3.0) {
                currentPowerFloorCleared++; // tính cả tầng Boss cuối -> đủ 3 tầng để mở thẻ hệ ĐIỆN
                if (powerPlantRun.active && powerPlantRun.floor < powerPlantRun.total) {
                    powerPlantRun.floor++;
                    nextMapPreference = 6;
                    currentLevel++;
                    startLevel();
                } else {
                    powerPlantRun = { active: false, floor: 0, total: 3 };
                    hasPowerPlantMap = false;
                    nextRoute = 'balanced';
                    nextMapPreference = null;
                    openRouteShop();
                }
                return;
            }
        } else { evacZone.progress = Math.max(0, evacZone.progress - dt); }
    }

    else if (objState === 'TOWERS') {
        let activeCount = 0;
        for (let t of towers) {
            if (t.active) { activeCount++; continue; }

            let playersInZone = 0;
            for (let p of players) {
                if (!p.isDowned && Math.hypot(p.x - t.x, p.y - t.y) < 150) playersInZone++;
            }

            // Kiểm tra xem có Drone Do Thám nào đang đứng giữ tháp không
            let droneInZone = drones.some(d => d.type === 'scout' && Math.hypot(d.x - t.x, d.y - t.y) < 150);

            if (playersInZone > 0) {
                // Tốc độ chiếm tháp mặc định
                let captureSpeed = 1.0;

                // LOGIC CO-OP: 2 người mới nhanh, 1 người thì tốc độ chỉ còn một nửa
                if (!isSinglePlayer) {
                    captureSpeed = (playersInZone === 1) ? 0.5 : 1.0;
                }

                t.progress += dt * captureSpeed;

                // Chốt sổ 100% (5.0)
                if (t.progress >= 5.0) {
                    t.active = true;
                    towerAlertTimer = 3.0;
                    createParticles(t.x, t.y, '#f1c40f', 50, 300); addScreenShake(10);
                }
            } else if (!droneInZone) {
                // Chỉ tụt tiến độ nếu KHÔNG CÓ người chơi VÀ KHÔNG CÓ Drone ở trong
                t.progress = Math.max(0, t.progress - dt * 0.5);
            }
        }
        if (activeCount === towers.length && towers.length > 0) {
            mission.progress = activeCount;
            completeMission();
        }
    } else if (objState === 'WAITING') {
        evacTimer -= dt;

        let isSupportHeli = hasTeamPerk('p_yemTro') ? 20.0 : 15.0; // Yểm trợ tới sớm 5s
        // Thêm heliTag >= 3 để gọi trực thăng yểm trợ
        let heliCondition = isPermaHeli || heliTag >= 3 || (evacTimer <= isSupportHeli && evacTimer > 0) || (droneTag >= 2);

        if (heliCondition) {
            heliSupport.active = true; heliSupport.fireTimer -= dt;

            let hasFollow = isPermaHeli || droneTag >= 2 || players.some(p => p.perks.heliFollow);
            if (hasFollow) {
                let tx = isSinglePlayer ? players[0].x : (players[0].x + players[1].x) / 2;
                let ty = isSinglePlayer ? players[0].y : (players[0].y + players[1].y) / 2;
                heliSupport.x += (tx - heliSupport.x) * dt * 1.5;
                heliSupport.y += (ty - heliSupport.y) * dt * 1.5;
            } else {
                heliSupport.x += (evacZone.x - heliSupport.x) * dt * 2;
                heliSupport.y += (evacZone.y - heliSupport.y) * dt * 2;
            }

            if (heliSupport.fireTimer <= 0) {
                heliSupport.fireTimer = hasTeamPerk('p_yemTro') ? 0.1 : 0.2; // Bắn nhanh hơn
                let dmgHeli = 100 + heliTag * 40;
                if (hasTeamPerk('p_yemTro')) dmgHeli *= 1.5; // Dame to hơn

                let targetZ = getNearestZombie(heliSupport.x, heliSupport.y, 800);
                if (targetZ) {
                    let ang = Math.atan2(targetZ.y - heliSupport.y, targetZ.x - heliSupport.x);
                    let isPierce = hasTeamPerk('p_hoaLuc'); // Đạn xuyên
                    bullets.push(new Bullet(heliSupport.x, heliSupport.y, ang, { range: 800, dmg: dmgHeli, armorPiercing: true, isHeli: true, wallPiercing: isPierce, pierce: isPierce ? 99 : 0 }, null));
                    if (isPierce) { // Đa mục tiêu
                        bullets.push(new Bullet(heliSupport.x, heliSupport.y, ang + 0.2, { range: 800, dmg: dmgHeli, armorPiercing: true, isHeli: true, wallPiercing: true, pierce: 99 }, null));
                        bullets.push(new Bullet(heliSupport.x, heliSupport.y, ang - 0.2, { range: 800, dmg: dmgHeli, armorPiercing: true, isHeli: true, wallPiercing: true, pierce: 99 }, null));
                    }
                }
            }
        } else { heliSupport.active = false; }

        if (evacTimer <= 0) {
            objState = 'EVAC';
            Sound.play('heli_arrive');
            createParticles(evacZone.x, evacZone.y, '#3498db', 100, 500);
            addScreenShake(20);
            // Mốc 3 giữ trực thăng ở lại bắn tiếp!
            if (!isPermaHeli && heliTag < 3) heliSupport.active = false;
        }
    } else if (objState === 'EVAC') {
        let allIn = true; for (let p of players) { if (!p.isDowned && Math.hypot(p.x - evacZone.x, p.y - evacZone.y) > 200) allIn = false; }
        let anyoneAlive = players.some(p => !p.isDowned);

        if (allIn && !tank.active && anyoneAlive) {
            let evacSpeed = heliTag >= 5 ? 3.0 : (heliTag >= 3 ? 2.0 : 1.0); // Link 3/5 Evac x2/x3
            evacZone.progress += dt * evacSpeed;
            if (evacZone.progress >= 3.0) {
                // Xử lý Lên Cấp thưởng
                for (let p of players) {
                    if (heliTag >= 5) { p.level += 2; p.pendingUpgrades += 2; }
                    else if (p.perks.p_thoatHiem) { p.level += 1; p.pendingUpgrades += 1; }
                }
                openRouteShop(); return;
            }
        } else { evacZone.progress = Math.max(0, evacZone.progress - dt); }
    }

    if (players.some(p => p.perks.airstrike)) {
        airstrikeTimer -= dt;
        if (airstrikeTimer <= 0) {
            airstrikeTimer = 18.0;
            // Rải thảm 6 quả bom quét ngang khu vực quanh người chơi (không gây hại cho phe ta)
            let center = tank.active ? tank : pickAlivePlayer();
            let startY = center.y + (Math.random() - 0.5) * 400, startX = center.x - 900;
            let lvl = currentLevel, tok = loopToken;
            for (let i = 0; i < 6; i++) {
                setTimeout(() => {
                    if (gameState !== 'PLAYING' || lvl !== currentLevel || tok !== loopToken) return;
                    let bomX = startX + i * 360 + Math.random() * 120;
                    bullets.push(new Bullet(bomX, startY - 800, Math.PI / 2, { range: 800, dmg: 400, isBomb: true, isExplosiveProj: false, friendly: true }, players.find(p => p.perks.airstrike) || players[0]));
                }, i * 300);
            }
        }
    }


    zombieTimer -= dt;
    if (zombieTimer <= 0) {
        let spawnRate = 2.25;
        let zCount = 1 + (currentLevel >= 3 ? 1 : 0);

        // Dời mốc bùng nổ bầy đàn sang map 6
        let swarmMult = currentLevel >= 6 ? 2 : 1;

        if (objState === 'WAITING' || objState === 'EVAC') {
            // --- 30s CUỐI LÚC EVAC ---
            if (objState === 'EVAC' || (objState === 'WAITING' && evacTimer <= 30.0)) {
                if (currentLevel <= 3) {
                    // Map 1-4: Dồn dập hơn bình thường một chút nhưng vẫn đủ thở
                    spawnRate = 2.0;
                    zCount = 5;
                } else if (currentLevel <= 5) {
                    // Map 5: Căng thẳng dần
                    spawnRate = 1.0;
                    zCount = 5;
                } else if (currentLevel <= 8) {
                    // Map 6+: Tốc độ bàn thờ, bầy đàn cực đông (Như code cũ của bạn)
                    spawnRate = 1;
                    zCount = (1 + Math.floor((currentLevel - 5) * 1.5)) * swarmMult;
                }
                else {
                    spawnRate = 0.5
                    zCount = (3 + Math.floor((currentLevel - 10) * 1.5)) * swarmMult;
                }
            }
            else {
                // --- SINH TỒN BÌNH THƯỜNG (NORMAL SURVIVAL) ---
                // Áp lực thời gian: Cứ mỗi 100 giây sinh tồn, thời gian chờ đẻ quái sẽ giảm đi 1 giây
                let timePressure = survivalTime / 500;

                if (currentLevel <= 2) {
                    // Map 1-2: Khởi đầu 2.5s (nhanh hơn cũ là 4s), tạo áp lực nhẹ. Max tốc độ là 1.0s.
                    spawnRate = Math.max(1.5, 2.5 - timePressure);
                    // Ban đầu 1 con, sau 90s ra 2 con, sau 180s ra 3 con
                    zCount = 1 + (survivalTime > 180 ? 1 : 0) + (survivalTime > 300 ? 1 : 0);
                }
                else if (currentLevel <= 3) {
                    // Map 1-2: Khởi đầu 2.5s (nhanh hơn cũ là 4s), tạo áp lực nhẹ. Max tốc độ là 1.0s.
                    spawnRate = Math.max(1, 2.0 - timePressure);
                    // Ban đầu 1 con, sau 90s ra 2 con, sau 180s ra 3 con
                    zCount = 1 + (survivalTime > 90 ? 1 : 0) + (survivalTime > 300 ? 1 : 0);
                }
                else if (currentLevel <= 5) {
                    // Map 4-5: Khởi đầu khoảng 1.8s, giảm dần theo thời gian. Max tốc độ là 0.6s.
                    spawnRate = Math.max(0.6, 1.5 - ((currentLevel - 2) * 0.2) - timePressure);
                    // Cơ bản là 2 con, cứ mỗi 90 giây sinh tồn sẽ đẻ thêm 1 con mỗi đợt
                    zCount = 2 + Math.floor(survivalTime / 90);
                } else {
                    // Map 6+: Nhịp độ tử thần, ép sân cực mạnh
                    spawnRate = Math.max(0.2, 1.2 - ((currentLevel - 5) * 0.1) - timePressure);
                    // Số lượng cao, tăng liên tục mỗi 60 giây và nhân với hệ số bầy đàn (swarmMult)
                    zCount = (2 + Math.floor((currentLevel - 5) / 2) + Math.floor(survivalTime / 60)) * swarmMult;
                }

            }

        }
        let isHeavyMission = ['DEFEND', 'COLLECT', 'KILL', 'POWER_LOCKS', 'POWER_KILL'].includes(objState);
        if (isHeavyMission) {
            zCount = Math.ceil(zCount * 2.0); // Đông hơn đáng kể
            spawnRate *= 0.8; // Đẻ nhanh hơn 20%
        }
        else if (currentMapType === 4) {
            // --- CHẾ ĐỘ TỬ THỦ ---
            if (currentLevel <= 2) {
                spawnRate = Math.max(1, 5 - (120 - fortressTimer) / 100);
                zCount = 1;
            } else {
                spawnRate = Math.max(2, 4 - (120 - fortressTimer) / 200);
                zCount = (1 + Math.floor((120 - fortressTimer) / 15)) * swarmMult;
            }
        }
        else if (currentMapType === 5) {
            spawnRate = currentLevel <= 2 ? 3.0 : 1.5;
            zCount = 1 * swarmMult;
        }
        if (!['WAITING', 'EVAC', 'DEFEND'].includes(objState)) {
            zCount = Math.ceil(zCount * 1.18);
            spawnRate *= 0.92;
        }

        // Giới hạn tổng số quái để giữ khung hình ổn định
        if (zombies.length > 240) zCount = 0;
        if (isCaveMap()) zCount = caveSpawnCount(zCount);
        for (let i = 0; i < zCount; i++) {
            // Sinh quanh MỘT người chơi còn sống bất kỳ (không chỉ người chơi 1), ngoài tầm an toàn
            let anchor = tank.active ? tank : pickAlivePlayer();
            let angle = Math.random() * Math.PI * 2;
            let distance = 450 + Math.random() * 250;
            let spawnX = Math.max(20, Math.min(MAP_SIZE.w - 20, anchor.x + Math.cos(angle) * distance));
            let spawnY = Math.max(20, Math.min(MAP_SIZE.h - 20, anchor.y + Math.sin(angle) * distance));
            if (isCaveMap()) { let cp = caveSpawnPoint(); if (!cp) continue; spawnX = cp.x; spawnY = cp.y; } // trong hang: sinh ở ngách khuất, đi được tới người chơi
            // Không sinh sát mặt người chơi còn lại
            if (players.some(p => !p.isDowned && Math.hypot(p.x - spawnX, p.y - spawnY) < 380)) continue;
            zombies.push(new Zombie(spawnX, spawnY));
        }

        zombieTimer = spawnRate;
    }

    for (let i = drops.length - 1; i >= 0; i--) { if (drops[i].lifeTime > 0) { drops[i].lifeTime -= dt; if (drops[i].lifeTime <= 0) drops.splice(i, 1); } }

    let itemSpd = players.some(p => p.perks.fastSupply) ? 1.5 : 2.0;
    // BUFF VẬT PHẨM (Cấp 2): Spawn nhanh hơn
    if (getTeamTagLevel('VẬT PHẨM') >= 2) itemSpd *= 0.7;
    itemTimer -= dt; if (itemTimer <= 0) { itemTimer = itemSpd; let dp = isCaveMap() ? caveRandomOpenPoint() : findSafePoint(Math.random() * MAP_SIZE.w, Math.random() * MAP_SIZE.h, 18); spawnDrop(dp.x, dp.y); }

    let airSpd = players.some(p => p.perks.fastSupply) ? 20 : 30;
    airdropTimer -= dt; if (airdropTimer <= 0) { airdropTimer = airSpd; let ap = isCaveMap() ? caveRandomOpenPoint() : findSafePoint(Math.random() * (MAP_SIZE.w - 400) + 200, Math.random() * (MAP_SIZE.h - 400) + 200, 24); airdropMarkers.push({ x: ap.x, y: ap.y, time: 3.0, maxTime: 3.0 }); }

    for (let i = airdropMarkers.length - 1; i >= 0; i--) { airdropMarkers[i].time -= dt; if (airdropMarkers[i].time <= 0) { spawnDrop(airdropMarkers[i].x, airdropMarkers[i].y, true); createParticles(airdropMarkers[i].x, airdropMarkers[i].y, '#ecf0f1', 30, 300); spawnRing(airdropMarkers[i].x, airdropMarkers[i].y, '#f1c40f', 90, 0.4); addScreenShake(8); airdropMarkers.splice(i, 1); } }

    // UPDATE FIRE ZONES (lửa / acid / mưa tên)
    for (let i = fireZones.length - 1; i >= 0; i--) {
        let fz = fireZones[i]; fz.life -= dt;
        let srcMult = (fz.source && fz.source.getTotalDamageMult) ? fz.source.getTotalDamageMult() : 1;
        for (let z of zombies) {
            if (z.hp <= 0 || !fz.source) continue; // vũng của quái không làm hại chính bầy quái
            if (Math.hypot(z.x - fz.x, z.y - fz.y) < fz.radius + z.radius) {
                if (fz.kind === 'acid') {
                    applyStatus(z, STATUS.CORROSION, { duration: 2.2, stacks: 1, dpsPercent: 0.0035, maxStacks: 8, source: fz.source });
                    z.hp -= (fz.dmg || 0) * dt * srcMult;
                    if (Math.random() < 0.25) createParticles(z.x, z.y, '#2ecc71', 1, 50);
                } else if (fz.kind === 'arrow') {
                    z.hp -= fz.dmg * dt * srcMult;
                    if (Math.random() < 0.3) createParticles(z.x, z.y, '#e056fd', 1, 60);
                } else {
                    applyStatus(z, STATUS.BURN, { duration: 1.2, dpsPercent: 0.010, source: fz.source });
                    z.hp -= fz.dmg * dt * srcMult;
                    if (Math.random() < 0.25) createParticles(z.x, z.y, '#e67e22', 1, 50);
                }
                if (fz.source instanceof Player) z.lastHitBy = fz.source;
                if (z.hp <= 0) zombieDown(z, fz.source);
            }
        }
        // Vũng lửa/acid của QUÁI (source = null) gây hại cho người chơi đứng trong đó
        if (!fz.source && !tank.active) {
            for (let pl of players) {
                if (pl.isDowned || Math.hypot(pl.x - fz.x, pl.y - fz.y) > fz.radius) continue;
                pl.takeDot((fz.dmg || 10) * 0.5 * dt);
                if (fz.kind === 'acid') { fz.tick = (fz.tick || 0) - dt; if (fz.tick <= 0) { fz.tick = 0.6; applyPlayerStatus(pl, STATUS.CORROSION, { duration: 2.5, stacks: 1, dpsPercent: 0.003, maxStacks: 6 }); } }
            }
        }
        if (fz.life <= 0) fireZones.splice(i, 1);
    }
    updateHazards(dt);
    // LOGIC RẢI BOOM (có vòng cảnh báo 1.2 giây, không gây hại cho phe ta)
    if (hasTeamPerk('p_raiBoom')) {
        raiBoomTimer -= dt;
        if (raiBoomTimer <= 0) {
            let owner = players.find(p => p.perks.p_raiBoom && !p.isDowned) || players.find(p => p.perks.p_raiBoom) || players[0];
            let autoLvl = getTeamTagLevel('TẤN CÔNG TỰ ĐỘNG');
            raiBoomTimer = (3.0 + Math.random() * 3.0) * (autoLvl >= 2 ? 0.7 : 1); // Link TẤN CÔNG TỰ ĐỘNG 2: rải nhanh hơn 30%
            // Ưu tiên rơi vào chỗ có quái gần chủ nhân
            let tz = getNearestZombie(owner.x + (Math.random() - 0.5) * 500, owner.y + (Math.random() - 0.5) * 500, 520);
            let bx = tz ? tz.x : owner.x + (Math.random() - 0.5) * 900;
            let by = tz ? tz.y : owner.y + (Math.random() - 0.5) * 900;
            hazards.push({ type: 'artillery', x: bx, y: by, radius: 200, timer: 1.2, life: 1.5, dmg: 300, friendly: true, source: owner });
        }
    }

    let droneCountBuff = 1; // Mặc định có 1
    if (droneTag >= 4) droneCountBuff = 2; // Neft 4: Chỉ tăng tổng lên 2
    let isDroneBuffed = droneTag >= 2; // Neft 2: Không tăng số lượng, chỉ buff sức mạnh
    let isDroneSuper = droneTag >= 5;
    let isDroneGod = droneTag >= 8; // Mốc 8: Tự động có Drone Sao Chép

    for (let p of players) {
        if (p.isDowned) continue;
        let spawnDrone = (type, color) => {
            if (drones.filter(d => d.owner === p.id && d.type === type).length < droneCountBuff) {
                drones.push({ owner: p.id, type: type, x: p.x, y: p.y - 50, cd: 0, color: color, weapon: null });
            }
        };

        if (p.perks.p_miniDrone) spawnDrone('mini', '#00cec9');
        if (p.perks.p_healDrone) spawnDrone('heal', '#2ecc71');
        if (p.perks.p_suicideDrone) spawnDrone('boom', '#e74c3c');
        if (p.perks.d_scout) spawnDrone('scout', '#f1c40f');
        if (p.perks.d_melee) spawnDrone('melee', '#eb4d4b');
        if (p.perks.d_arti) spawnDrone('arti', '#d35400');
        if (p.perks.d_laser) spawnDrone('laser', '#9b59b6');
        if (p.perks.d_buffer) spawnDrone('buffer', '#fd79a8');
        if (p.perks.d_learn) spawnDrone('learn', '#ecf0f1');

        // MỐC 8: Tự động có Drone Copy
        if (isDroneGod) spawnDrone('copy', '#2d3436');
    }

    for (let i = drones.length - 1; i >= 0; i--) {
        let d = drones[i];
        let p = players[d.owner - 1];
        if (!p || p.isDowned) { drones.splice(i, 1); continue; }

        d.cd -= dt;

        // Drone Tăng Cường (Buff)
        if (d.type === 'buffer') {
            // Buff tốc độ/sát thương cố định được tính trong Player.update (không còn cộng dồn vô hạn vào baseSpeed)
            if (d.cd <= 0) {
                d.cd = 4.0;
                createParticles(p.x, p.y, '#fd79a8', 6, 90);
            }
            d.x += (p.x - 40 - d.x) * dt * 3; d.y += (p.y - 40 - d.y) * dt * 3;
            continue;
        }
        if (d.type === 'learn') {
            let isEvolved = (p.droneKills >= 200 && p.tags['BẬC THẦY'] > 0);
            if (isEvolved) d.color = '#ff9f43'; // AI color
            // Chủ nhân tay không thì drone trao luôn vũ khí đang giữ
            if (d.weapon && !p.weapon) { p.weapon = d.weapon; d.weapon = null; vfxList.push({ type: 'text', text: 'DRONE TẶNG QUÀ!', x: p.x, y: p.y - 40, life: 1.5, color: '#f1c40f' }); }

            if (!d.weapon) {
                // Đi nhặt hộp gần chủ nhân nhất (trong tầm 900)
                let targetBox = null, bestBox = 900;
                for (let j = 0; j < drops.length; j++) {
                    if (drops[j].type === 'BLINDBOX' || drops[j].type === 'SUPERBOX') {
                        let bd = Math.hypot(drops[j].x - p.x, drops[j].y - p.y);
                        if (bd < bestBox) { bestBox = bd; targetBox = drops[j]; }
                    }
                }
                if (targetBox) {
                    let a = Math.atan2(targetBox.y - d.y, targetBox.x - d.x);
                    d.x += Math.cos(a) * 250 * dt; d.y += Math.sin(a) * 250 * dt;
                    if (Math.hypot(d.x - targetBox.x, d.y - targetBox.y) < 30) {
                        let pool = targetBox.type === 'SUPERBOX' ? SUPER_WEAPONS : NORMAL_WEAPONS;
                        if (currentMapType === 6) pool = targetBox.type === 'SUPERBOX' ? SUPER_WEAPONS.concat(ELECTRO_WEAPONS) : NORMAL_WEAPONS.concat(ELECTRO_WEAPONS, ELECTRO_WEAPONS);
                        let wepName = pool[Math.floor(Math.random() * pool.length)];
                        let newWep = { ...WEAPON_TYPES[wepName] };

                        if (!p.weapon) {
                            p.weapon = newWep; // Tặng vũ khí cho người chơi
                            vfxList.push({ type: 'text', text: 'DRONE TẶNG QUÀ!', x: p.x, y: p.y - 40, life: 1.5, color: '#f1c40f' });
                        } else {
                            d.weapon = newWep; // Drone giữ vũ khí lại
                        }
                        drops.splice(drops.indexOf(targetBox), 1);
                    }
                } else {
                    d.x += (p.x + 40 - d.x) * dt * 3; d.y += (p.y - 40 - d.y) * dt * 3;
                }
            } else {
                // AI Bắn
                d.x += (p.x + 40 - d.x) * dt * 3; d.y += (p.y - 40 - d.y) * dt * 3;
                if (isEvolved && d.cd <= 0 && d.weapon.type === 'gun') {
                    let target = getNearestZombie(d.x, d.y, Math.min(d.weapon.range || 400, 700), true);
                    if (target) {
                        let a = Math.atan2(target.y - d.y, target.x - d.x);
                        bullets.push(new Bullet(d.x, d.y, a, { ...d.weapon, fromDrone: true }, p));
                        d.cd = Math.max(0.12, d.weapon.fireRate / 1000); // (đặt hồi chiêu TRƯỚC khi có thể xoá vũ khí -> hết lỗi null)
                        d.weapon.ammo--;
                        if (d.weapon.ammo <= 0) d.weapon = null; // Hết đạn đi nhặt tiếp
                    }
                }
            }
            continue;
        }

        if (d.type === 'boom') {
            if (d.state === 'cooldown') {
                d.color = '#7f8c8d'; // Màu xám khi nạp năng lượng
                d.x += (p.x - 30 - d.x) * dt * 2; d.y += (p.y - 30 - d.y) * dt * 2;
                if (d.cd <= 0) { d.state = 'idle'; d.color = '#e74c3c'; }
            } else if (d.state === 'priming') {
                // Đứng im, nhấp nháy chớp tắt
                d.color = (Math.floor(Date.now() / 150) % 2 === 0) ? '#fff' : '#e74c3c';
                if (d.cd <= 0) {
                    // NỔ
                    let safeSource = {
                        id: 'drone', tags: p.tags, perks: p.perks,
                        getTotalDamageMult: () => p.getTotalDamageMult(),
                        onKill: (t) => { p.droneKills = (p.droneKills || 0) + 1; p.onKill(t); }
                    };
                    explode(d.x, d.y, isDroneSuper ? 300 : (isDroneBuffed ? 200 : 150), p.getTotalDamageMult() * 500, safeSource, true); // không hại phe ta
                    d.state = 'cooldown';
                    d.cd = isDroneSuper ? 15.0 : 20.0; // Cooldown 20s (15s nếu có mốc 5)
                }
            } else { // Idle/Chasing
                let target = getNearestZombie(d.x, d.y, 400);
                if (target) {
                    let a = Math.atan2(target.y - d.y, target.x - d.x);
                    d.x += Math.cos(a) * 400 * dt; d.y += Math.sin(a) * 400 * dt;
                    if (Math.hypot(d.x - target.x, d.y - target.y) < 20) {
                        d.state = 'priming';
                        d.cd = isDroneSuper ? 1.0 : 2.0; // Chớp tắt 2s (1s nếu mốc 5)
                    }
                } else {
                    d.x += (p.x - 30 - d.x) * dt * 3; d.y += (p.y - 30 - d.y) * dt * 3;
                }
            }
            continue;
        }

        else if (d.type === 'scout') {
            let targetTower = towers.find(t => !t.active);
            let attackTarget = isDroneSuper ? getNearestZombie(d.x, d.y, 300) : null;

            if (targetTower) {
                let a = Math.atan2(targetTower.y - d.y, targetTower.x - d.x);
                d.x += Math.cos(a) * (isDroneSuper ? 250 : 150) * dt;
                d.y += Math.sin(a) * (isDroneSuper ? 250 : 150) * dt;

                if (Math.hypot(d.x - targetTower.x, d.y - targetTower.y) < 150) {
                    // DRONE CHỈ ĐẨY TIẾN ĐỘ ĐẾN 99% (4.95 trên 5.0)
                    if (targetTower.progress < 4.95) {
                        targetTower.progress = Math.min(4.95, targetTower.progress + dt * (isDroneSuper ? 1.0 : 0.5));
                        createParticles(targetTower.x, targetTower.y, '#f1c40f', 1, 50);
                    }
                    // Nếu đã 99%, Drone đứng im giữ tháp chờ chủ nhân tới
                }
            } else {
                d.x += (p.x - 50 - d.x) * dt * 3;
                d.y += (p.y - 50 - d.y) * dt * 3;
            }

            // Mốc 5: Do thám biết bắn
            if (isDroneSuper && attackTarget && d.cd <= 0) {
                let a = Math.atan2(attackTarget.y - d.y, attackTarget.x - d.x);
                bullets.push(new Bullet(d.x, d.y, a, { range: 300, dmg: 15, fromDrone: true }, p));
                d.cd = 0.8;
            }
        } else {
            let offsetAng = (i * Math.PI) / (drones.length / 2 || 1);
            let tX = p.x + Math.cos(Date.now() / 800 + offsetAng) * 60;
            let tY = p.y + Math.sin(Date.now() / 800 + offsetAng) * 60;
            d.x += (tX - d.x) * dt * (isDroneGod ? 6 : 4);
            d.y += (tY - d.y) * dt * (isDroneGod ? 6 : 4);

            if (d.type === 'mini' && d.cd <= 0) {
                let target = getNearestZombie(d.x, d.y, isDroneGod ? 600 : 400);
                if (target) {
                    let a = Math.atan2(target.y - d.y, target.x - d.x);
                    // (hệ số sát thương của chủ nhân đã được calcDamage nhân sẵn -> không nhân 2 lần nữa)
                    bullets.push(new Bullet(d.x, d.y, a, { range: isDroneGod ? 600 : 400, dmg: 20 * (isDroneBuffed ? 1.5 : 1.0) * (getTeamTagLevel('TẤN CÔNG TỰ ĐỘNG') >= 2 ? 1.3 : 1), fromDrone: true }, p));
                    d.cd = isDroneSuper ? 0.25 : 0.5; // Mốc 5 bắn nhanh gấp đôi
                }
            }
            if (d.type === 'melee' && d.cd <= 0) {
                let radius = isDroneSuper ? 200 : 120; // Mốc 5: Chém rộng hơn
                slashes.push(new Slash(p.x, p.y, 0, { range: radius, dmg: 150 * (isDroneGod ? 2 : 1), spread: Math.PI * 2, kb: isDroneSuper ? 500 : 300, name: 'Búa' }, p));

                // GIẢM ĐỘ BÃO HÒA: Dùng màu đỏ nhạt/pastel (#e89393), giảm số hạt (12) và tốc độ bay (100)
                createParticles(p.x, p.y, '#e89393', 12, 100);
                d.cd = isDroneSuper ? 3.5 : 5.0; // Chém lẹ hơn
            }
            if (d.type === 'arti' && d.cd <= 0) {
                let target = getNearestZombie(d.x, d.y, 500);
                if (target) {
                    let a = Math.atan2(target.y - d.y, target.x - d.x);
                    bullets.push(new Bullet(d.x, d.y, a, { range: 500, dmg: 120, isExplosiveProj: true, friendly: true, fromDrone: true }, p));
                    d.cd = 2.5;
                }
            }
            if (d.type === 'laser' && d.cd <= 0) {
                let target = getNearestZombie(d.x, d.y, 600);
                if (target) {
                    let a = Math.atan2(target.y - d.y, target.x - d.x);

                    // Tạo đạn để xử lý sát thương (xuyên thấu)
                    let laserBullet = new Bullet(d.x, d.y, a, { range: 600, dmg: 80, pierce: 99, fromDrone: true }, p);
                    laserBullet.isLaserBeam = true; // Gắn cờ để tí nữa ẩn viên đạn tròn đi (nếu muốn)
                    bullets.push(laserBullet);

                    d.cd = 3.0;
                    // TẠO TIA LASER: Truyền tọa độ đích (tx, ty) để vẽ một đường thẳng tuyệt đẹp
                    vfxList.push({ type: 'laser_beam', x: d.x, y: d.y, tx: target.x, ty: target.y, life: 0.4 });
                }
            }
            if (d.type === 'special') {
                // Nhặt vũ khí từ hộp mù (Mốc 8)
                if (!d.weapon) {
                    for (let j = drops.length - 1; j >= 0; j--) {
                        if (drops[j].type === 'BLINDBOX' || drops[j].type === 'SUPERBOX') {
                            if (Math.hypot(d.x - drops[j].x, d.y - drops[j].y) < 30) {
                                let pool = drops[j].type === 'SUPERBOX' ? SUPER_WEAPONS : NORMAL_WEAPONS;
                                if (currentMapType === 6) pool = drops[j].type === 'SUPERBOX' ? SUPER_WEAPONS.concat(ELECTRO_WEAPONS) : NORMAL_WEAPONS.concat(ELECTRO_WEAPONS, ELECTRO_WEAPONS);
                                let wepName = pool[Math.floor(Math.random() * pool.length)];
                                d.weapon = { ...WEAPON_TYPES[wepName] };
                                drops.splice(j, 1);
                                break;
                            } else {
                                // Di chuyển đến hộp mù
                                let a = Math.atan2(drops[j].y - d.y, drops[j].x - d.x);
                                d.x += Math.cos(a) * 200 * dt; d.y += Math.sin(a) * 200 * dt;
                            }
                        }
                    }
                } else if (d.cd <= 0) {
                    let target = getNearestZombie(d.x, d.y, d.weapon.range);
                    if (target && d.weapon.type === 'gun') {
                        let a = Math.atan2(target.y - d.y, target.x - d.x);
                        bullets.push(new Bullet(d.x, d.y, a, { ...d.weapon, fromDrone: true }, p));
                        d.cd = d.weapon.fireRate / 1000;
                        d.weapon.ammo--;
                        if (d.weapon.ammo <= 0) d.weapon = null;
                    }
                }
            }
            if (d.type === 'copy' && d.cd <= 0 && p.lastFireTime > Date.now() - 100) {
                // Copy: Bắn khi người chơi bắn
                if (p.weapon && p.weapon.type === 'gun') {
                    bullets.push(new Bullet(d.x, d.y, Math.atan2(p.facingY, p.facingX), { ...p.weapon, fromDrone: true, isExplosiveProj: false }, p));
                    d.cd = Math.max(0.1, p.weapon.fireRate / 1000);
                }
            }
            if (d.type === 'heal' && d.cd <= 0) {
                if (p.hp < p.maxHp) p.applyHeal((isDroneBuffed ? 10 : 5) * (isDroneSuper ? 2 : 1)); // Mốc 5 hồi mạnh
                d.cd = isDroneSuper ? 1.0 : 2.0; // Hồi liên tục
                let partner = isSinglePlayer ? null : players[1 - (p.id - 1)];
                if (partner) {
                    if (isDroneSuper && !partner.isDowned && partner.hp < partner.maxHp && Math.hypot(d.x - partner.x, d.y - partner.y) < 200) {
                        partner.applyHeal(10); // Hồi diện rộng
                    }
                    if (partner.isDowned && Math.hypot(d.x - partner.x, d.y - partner.y) < 150) {
                        let reqTime = 2.0 + partner.reviveCount * 1.5;
                        partner.reviveProgress += (isDroneBuffed ? 1.5 : 0.8) * (isDroneSuper ? 1.5 : 1);
                        createParticles(partner.x, partner.y, '#2ecc71', 5, 100);
                        if (partner.reviveProgress >= reqTime) {
                            partner.isDowned = false; partner.hp = partner.maxHp * 0.3; partner.reviveCount++; partner.reviveProgress = 0;
                            createParticles(partner.x, partner.y, '#2ecc71', 50, 200);
                        }
                    }
                }
            }
        }
    }


    for (let i = zombies.length - 1; i >= 0; i--) {
        let z = zombies[i];
        if (z.hp > 0) {
            z.update(dt);
            // Va chạm đạn kiểu "quét" theo đoạn đường đạn vừa bay -> đạn nhanh (cung, sniper) không còn xuyên qua quái
            for (let j = bullets.length - 1; j >= 0 && z.hp > 0 && !z.flying; j--) { // kiến đang bay: đạn không trúng
                let b = bullets[j];
                if (!b.active || b.hitSet.has(z)) continue;
                let br = (b.isFire || b.isAcid) ? 14 : 3;
                let hit = b.px !== undefined
                    ? distancePointToSegment(z.x, z.y, b.px, b.py, b.x, b.y) < z.radius + br
                    : Math.hypot(b.x - z.x, b.y - z.y) < z.radius + br;
                if (hit) b.hitEnemy(z);
            }
        }

        if (z.type >= 45) antDamageFilter(z); // Kiến Chúa / Xúc Tu: giảm, nhân đôi hoặc vô hiệu sát thương theo pha
        // Nháy trắng khi trúng đòn + số sát thương nổi
        if (z.hitFlash > 0) z.hitFlash -= dt;
        if (z._hpSeen === undefined) z._hpSeen = z.maxHp;
        if (z.hp < z._hpSeen - 0.5) {
            let delta = z._hpSeen - Math.max(0, z.hp);
            if (delta > Math.max(2, z.maxHp * 0.01)) z.hitFlash = 0.08;
            z._dmgAcc = (z._dmgAcc || 0) + delta;
        }
        z._hpSeen = Math.max(0, z.hp);
        z._dmgT = (z._dmgT || 0) - dt;
        if (z._dmgAcc >= 1 && (z._dmgT <= 0 || z.hp <= 0)) {
            if (vfxList.length < 200 && !z.hidden && players.some(p => Math.abs(p.x - z.x) < 1100 && Math.abs(p.y - z.y) < 800)) {
                vfxList.push({ type: 'dmg', text: String(Math.round(z._dmgAcc)), x: z.x + (Math.random() - 0.5) * 18, y: z.y - z.radius - 8, life: 0.65, max: 0.65, crit: z._crit || 0 });
            }
            z._dmgAcc = 0; z._crit = 0; z._dmgT = 0.2;
        }

        if (z.hp <= 0) {
            // Quái chết vì thiêu đốt / vùng điện / lính bắn... vẫn được ghi nhận (XP + tiến độ nhiệm vụ), Zombie hồi sinh vẫn hồi sinh
            if (z.type === 11 && !z.hasRevived) { zombieDown(z, null); continue; }
            if (!z._credited) zombieDown(z, null);

            if (z.type === 34) explode(z.x, z.y, 145, 100);
            else if (z.type === 1) explode(z.x, z.y, 180, 100);
            else if (z.type === 13) { // Lính cứu hỏa để lại bãi lửa
                explode(z.x, z.y, 150, 200);
                fireZones.push({ x: z.x, y: z.y, life: 4.0, dmg: 50, source: null, radius: 100 });
            }
            else if (z.type === 28) { // Zombie ELECTRICAL nổ tung diện rộng
                electricBurst(z.x, z.y, 300, 45, 1.0);
            }
            else if (z.type === 15) { // Nhầy nhụa chết tách ra 1 bầy zombie thường
                createParticles(z.x, z.y, '#2ecc71', 50, 300);
                for (let k = 0; k < 6 + Math.floor(currentLevel / 2); k++) {
                    zombies.push(new Zombie(z.x + (Math.random() - 0.5) * 40, z.y + (Math.random() - 0.5) * 40, 0));
                }
            }
            else if (z.type >= 50) deadFamilyDeath(z);
            else if (z.type >= 40) antDeath(z);
            else createParticles(z.x, z.y, z.color, 12, 200);

            createParticles(z.x, z.y, '#8e1b1b', 6, 160);
            addDecal(z.x, z.y, '#5c1010', z.radius * (0.9 + Math.random() * 0.5), 0.42);
            if ((z.type >= 30 && z.type <= 32) || z.type === 45 || z.type === 50) {
                spawnRing(z.x, z.y, z.color, 420, 0.8, 10);
                vfxList.push({ type: 'flash', x: z.x, y: z.y, r: 300, life: 0.4, max: 0.4 });
                addScreenShake(22);
                for (let s = 0; s < 3; s++) drops.push({ type: 'SUPERBOX', x: z.x + (s - 1) * 60, y: z.y + 40, radius: 16, lifeTime: 900.0 });
            }

            score += 50;
            if (!z.noLoot && Math.random() < (z.type === 40 ? 0.05 : 0.25)) spawnDrop(z.x, z.y);
            zombies.splice(i, 1);
        }
    }
    for (let a of allies) a.update(dt);

    if (getTeamTagLevel('QUAN_DOI') >= 6) {
        window.armySniperTimer = (window.armySniperTimer || 0) - dt;
        if (window.armySniperTimer <= 0) {
            window.armySniperTimer = 2.0;
            // Bắn tỉa yểm trợ: hạ 2 mục tiêu xa nhất trong tầm 900
            let sp = players.find(p => !p.isDowned) || players[0];
            let far = zombies.filter(z => z.hp > 0 && !z.hidden && Math.hypot(z.x - sp.x, z.y - sp.y) < 900).sort((a, b) => Math.hypot(b.x - sp.x, b.y - sp.y) - Math.hypot(a.x - sp.x, a.y - sp.y)).slice(0, 2);
            for (let z of far) {
                z.hp -= 500; z.lastHitBy = sp;
                z.knockback(Math.sign(z.x - sp.x) * 520, Math.sign(z.y - sp.y) * 520);
                vfxList.push({ type: 'laser_beam', x: sp.x, y: sp.y, tx: z.x, ty: z.y, life: 0.12 });
            }
        }
    }

    if (getTeamTagLevel('QUAN_DOI') >= 3 && getTeamTagLevel('TRIEU_HOI') < 5) {
        allyDropTimer -= dt;
        if (allyDropTimer <= 0 && allies.filter(a => a.hp > 0).length < 2) {
            allyDropTimer = 38;
            let owner = players.find(p => !p.isDowned) || players[0];
            if (summonAlly(Math.random() < 0.5 ? 'rifleman' : 'vanguard', owner)) {
                let a = allies[allies.length - 1];
                createParticles(a.x, a.y, '#ecf0f1', 35, 260); vfxList.push({ type: 'text', text: 'NHẢY DÙ!', x: a.x, y: a.y - 45, life: 1.2, color: '#ecf0f1' });
            }
        }
    }
    for (let n of rescueNPCs) n.update(dt);
    for (let i = outposts.length - 1; i >= 0; i--) {
        let op = outposts[i]; op.update(dt);
        if (op.dead) continue;
        for (let j = bullets.length - 1; j >= 0; j--) {
            let b = bullets[j];
            if (b.active && b.x > op.x && b.x < op.x + op.w && b.y > op.y && b.y < op.y + op.h) {
                if (b.isTankShell || b.isExplosiveProj || b.isBomb) { op.hp -= b.dmg; b.triggerHit(); }
                else { op.hp -= b.dmg; b.active = false; createParticles(b.x, b.y, '#c0392b', 5, 100); }
                if (op.hp <= 0 && op.destroyTimer <= 0) {
                    op.destroyTimer = 10;
                    vfxList.push({ type: 'text', text: 'CĂN CỨ TỰ HỦY - 10S!', x: op.x + op.w / 2, y: op.y - 30, life: 2.0, color: '#ff4757' });
                    break;
                }
            }
        }
    }

    for (let i = bullets.length - 1; i >= 0; i--) { bullets[i].update(dt); if (!bullets[i].active) bullets.splice(i, 1); }
    for (let i = enemyBullets.length - 1; i >= 0; i--) { enemyBullets[i].update(dt); if (!enemyBullets[i].active) enemyBullets.splice(i, 1); }
    for (let i = thrownItems.length - 1; i >= 0; i--) { thrownItems[i].update(dt); if (!thrownItems[i].active) thrownItems.splice(i, 1); }
    for (let i = slashes.length - 1; i >= 0; i--) {
        let owner = players.find(p => p === slashes[i].source || p.id === slashes[i].source.id);
        if (owner) slashes[i].update(dt, owner.x, owner.y); else slashes[i].active = false;
        if (!slashes[i].active) slashes.splice(i, 1);
    }

    updateFx(dt);
    updateCamera(dt);
    draw();
    updateLoopSounds(dt);
    netHostTick(dt);
}

let p1SelectedUpg = null, p2SelectedUpg = null; let p1Confirmed = false, p2Confirmed = false;

// Hàm tính toán mốc nhận mảnh: 4, 12, 22, 34, 48...
function isShardLevel(level) {
    let target = 4;
    let gap = 8;
    while (target <= level) {
        if (target === level) return true;
        target += gap;
        gap += 2; // Khoảng cách tăng dần: 8, 10, 12, 14...
    }
    return false;
}
function predictNextMission() {
    if (nextRoute === 'power') return 'POWER_CHARGE';
    if (nextRoute === 'hangz' || nextRoute === 'mine') return 'HANGZ_ESCAPE';
    if (nextRoute === 'hunt') return 'KILL';
    if (nextRoute === 'rescue') return 'RESCUE';
    return nextMissionPreference || 'TOWERS';
}

// Giá DUY NHẤT cho mỗi món (trước đây bảng giá hiển thị và bảng giá trừ tiền lệch nhau)
const SHOP_COSTS = { heal: 18, ammo: 14, box: 24, factoryMap: 35, flare: 20, minekit: 22, batteryPack: 16, rebreather: 28, herbicide: 20, urbanMap: 18 };
// Tuyến đường: min = map kế tiếp tối thiểu để mở
const ROUTE_DEFS = {
    balanced: { el: 'routeBalanced', min: 1 }, hunt: { el: 'routeHunt', min: 1 }, rescue: { el: 'routeRescue', min: 1 },
    power: { el: 'routePower', min: 1 }, hangz: { el: 'routeHangz', min: 3 }, mine: { el: 'routeMine', min: 3 }, botanical: { el: 'routeBotanical', min: 4 }, cityn: { el: 'routeCityn', min: 4 }
};
function routeLocked(route) {
    let def = ROUTE_DEFS[route];
    if (!def) return true;
    if (currentLevel + 1 < def.min) return true;
    if (route === 'power' && !hasPowerPlantMap) return true;
    if (route === 'mine' && !mineUnlocked) return true;
    return false;
}

function getDynamicShopItems() {
    let nextMission = predictNextMission();
    let nextMap = nextRoute === 'power' ? 6 : (nextRoute === 'hangz' ? 10 : nextRoute === 'mine' ? 14 : (nextRoute === 'botanical' ? 12 : (nextRoute === 'cityn' ? 13 : null)));
    let list = [
        { id: 'heal', name: 'Tiếp tế máu', desc: 'Cả đội hồi 45% máu tối đa.' },
        { id: 'ammo', name: 'Hộp đạn', desc: 'Hồi 40% độ bền/đạn vũ khí đang cầm.' },
        { id: 'box', name: 'Thùng vũ khí', desc: 'Rơi 1 hòm thính ở đầu map sau.' }
    ];
    if (!hasPowerPlantMap) list.push({ id: 'factoryMap', name: 'Bản đồ Nhà Máy Điện', desc: 'Mở tuyến Nhà Máy Điện (3 tầng + Boss, mở thẻ hệ ĐIỆN).' });
    if (nextMission === 'RESCUE' && !shopFlags.flare) list.push({ id: 'flare', name: 'Pháo sáng cứu hộ', desc: 'NPC ở gần bạn hơn và trực thăng đến nhanh hơn 8s.' });
    if (nextMission === 'KILL') list.push({ id: 'minekit', name: 'Bộ mìn phòng tuyến', desc: 'Đầu map sau rải 3 quả mìn quanh điểm xuất phát.' });
    if (nextMap === 6) list.push({ id: 'batteryPack', name: 'Pin dự phòng', desc: 'Bắt đầu map điện với +1 pin cầm tay.' });
    if (nextMap === 10) list.push({ id: 'rebreather', name: 'Mặt nạ lọc khí', desc: 'Giảm 35% sát thương khí độc khi hang sập.' });
    if (nextMap === 12 && !shopFlags.herbicide) list.push({ id: 'herbicide', name: 'Thuốc diệt dây leo', desc: 'Giảm mật độ cây độc trong Vườn Thực Vật.' });
    if (nextMap === 13 && !shopFlags.urbanMap) list.push({ id: 'urbanMap', name: 'Bản đồ ngõ hẻm', desc: 'Thành Phố N có nhiều lối thoát hơn.' });
    for (let it of list) it.cost = SHOP_COSTS[it.id];
    return list.slice(0, 6);
}

function renderDynamicShopItems() {
    let wrap = document.getElementById('dynamicShopItems');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (let item of getDynamicShopItems()) {
        let afford = shopScrap >= item.cost;
        let btn = document.createElement('button');
        btn.className = 'p-3 text-left bg-slate-900/80 border border-slate-600 rounded-xl hover:border-emerald-400 transition' + (afford ? '' : ' opacity-50');
        btn.innerHTML = `<div class="text-sm font-bold text-white">${item.name} <span class="${afford ? 'text-yellow-400' : 'text-red-400'}">⚙ ${item.cost}</span></div><div class="text-[11px] text-slate-300 mt-1">${item.desc}</div>`;
        btn.onclick = () => buyShopItem(item.id);
        wrap.appendChild(btn);
    }
}

function updateRouteShopUI() {
    document.getElementById('shopScrapText').innerHTML = `Map vừa qua: <span class="highlight">${currentLevel}</span> · Phế liệu: <span class="highlight">⚙ ${shopScrap}</span> · Mảnh Bức Phá: <span class="highlight">◆ ${breakthroughShards}</span> · Bản đồ Nhà Máy Điện: <span class="highlight">${hasPowerPlantMap ? 'ĐÃ CÓ' : 'CHƯA CÓ'}</span>`;

    for (let route in ROUTE_DEFS) {
        let el = document.getElementById(ROUTE_DEFS[route].el);
        if (!el) continue;
        el.classList.remove('border-emerald-500', 'ring-4', 'ring-emerald-500/50', 'bg-emerald-950/20', 'border-gray-600', 'bg-gray-800', 'route-locked');
        if (route === nextRoute) el.classList.add('border-emerald-500', 'ring-4', 'ring-emerald-500/50', 'bg-emerald-950/20');
        else el.classList.add('border-gray-600', 'bg-gray-800');
        if (routeLocked(route)) el.classList.add('route-locked');
    }
    renderDynamicShopItems();
}

function selectRoute(route) {
    if (!ROUTE_DEFS[route]) return;
    if (routeLocked(route)) {
        Sound.play('hit');
        netToast(route === 'power' ? 'Cần mua Bản đồ Nhà Máy Điện trước!' : (route === 'mine' && !mineUnlocked) ? 'Hộ tống Tiến Sĩ thoát khỏi Hang Z (tầng 3) để mở Hầm Mỏ!' : `Tuyến này mở từ Map ${ROUTE_DEFS[route].min}.`, 2000);
        return;
    }
    nextRoute = route;
    if (route === 'power') nextMapPreference = 6;
    else if (route === 'botanical') nextMapPreference = 12;
    else if (route === 'cityn') nextMapPreference = 13;
    else nextMapPreference = null; // (Hang Z được thiết lập khi bấm TIẾP TỤC)
    nextMissionPreference = route === 'hunt' ? 'KILL' : (route === 'rescue' ? 'RESCUE' : null);

    Sound.play('select');
    updateRouteShopUI();
}

function buyShopItem(item) {
    let cost = SHOP_COSTS[item];
    if (cost === undefined) return;
    if (shopScrap < cost) { Sound.play('hit'); netToast('Không đủ phế liệu!', 1500); return; }
    const refuse = (msg) => { Sound.play('hit'); netToast(msg, 1800); };

    if (item === 'heal') {
        if (players.every(p => p.hp >= p.maxHp)) return refuse('Cả đội đang đầy máu.');
        for (let p of players) { p.hp = Math.min(p.maxHp, Math.max(0, p.hp) + p.maxHp * 0.45); }
    } else if (item === 'ammo') {
        let any = false;
        for (let p of players) {
            if (p.weapon && (p.weapon.type === 'gun' || p.weapon.type === 'melee' || p.weapon.type === 'charge') && p.weapon.ammo < p.weapon.maxAmmo) {
                p.weapon.ammo = Math.min(p.weapon.maxAmmo, p.weapon.ammo + Math.ceil(p.weapon.maxAmmo * 0.4));
                any = true;
            }
        }
        if (!any) return refuse('Không có vũ khí nào cần nạp.');
    } else if (item === 'box') {
        if (pendingShopDrop) return refuse('Đã đặt 1 thùng vũ khí cho map sau.');
        pendingShopDrop = true;
    } else if (item === 'factoryMap') {
        if (hasPowerPlantMap) return refuse('Đã có bản đồ.');
        hasPowerPlantMap = true;
        shopScrap -= cost; Sound.play('upgrade');
        selectRoute('power');
        return;
    } else if (item === 'flare') {
        if (shopFlags.flare) return refuse('Đã có pháo sáng.');
        shopFlags.flare = true;
    } else if (item === 'minekit') {
        if (shopFlags.mines >= 6) return refuse('Đã mang tối đa mìn.');
        shopFlags.mines += 3;
    } else if (item === 'batteryPack') {
        if (pendingBattery >= 2) return refuse('Chỉ mang được tối đa 2 pin dự phòng.');
        pendingBattery++;
    } else if (item === 'rebreather') {
        if (players.every(p => p.caveToxinResist)) return refuse('Đã có mặt nạ.');
        for (let pl of players) pl.caveToxinResist = 0.35;
    } else if (item === 'herbicide') {
        shopFlags.herbicide = true;
    } else if (item === 'urbanMap') {
        shopFlags.urbanMap = true;
    }
    shopScrap -= cost;
    Sound.play('upgrade');
    updateRouteShopUI();
}

function openRouteShop() {
    if (shopOpenedForLevel === currentLevel) {
        checkAndTriggerUpgrade();
        return;
    }
    gameState = 'SHOP';
    clearPcInputs();
    shopOpenedForLevel = currentLevel;
    // Mỗi lần vào cửa hàng bắt đầu lại từ tuyến An Toàn
    nextRoute = 'balanced'; nextMapPreference = null; nextMissionPreference = null;
    document.getElementById('routeShop').style.display = 'flex';
    updateRouteShopUI();
    netSendSync();
}

function continueAfterShop() {
    document.getElementById('routeShop').style.display = 'none';
    if (nextRoute === 'power' && hasPowerPlantMap && !powerPlantRun.active) {
        powerPlantRun = { active: true, floor: 1, total: 3 };
        nextMapPreference = 6;
        nextMissionPreference = null;
    } else if (nextRoute === 'hangz') {
        hangZRun = { active: true, floor: 1, total: 3, timer: 210, stairs: null };
        nextMapPreference = 10;
        nextMissionPreference = null;
    } else if (nextRoute === 'mine' && mineUnlocked) {
        mineRun = { active: true, floor: 4, stage: 'maze', queenPct: 0.3 };
        nextMapPreference = 14;
        nextMissionPreference = null;
    }
    Sound.play('start');
    checkAndTriggerUpgrade();
}

function checkAndTriggerUpgrade() {
    // Tự động cấp Mảnh Bức Phá theo mốc - ĐÚNG 1 LẦN mỗi map (trước đây mỗi vòng chọn thẻ lại được thêm 1 mảnh)
    if (isShardLevel(currentLevel) && shardGrantedLevel !== currentLevel) {
        shardGrantedLevel = currentLevel;
        breakthroughShards++;
        Sound.play('shard');
        netToast('◆ +1 MẢNH BỨC PHÁ!', 2500);
    }

    let p1HasUpg = players[0].pendingUpgrades > 0;
    let p2HasUpg = players.length > 1 && players[1].pendingUpgrades > 0;

    if (p1HasUpg || p2HasUpg) {
        triggerUpgradeScreen(p1HasUpg, p2HasUpg);
    } else {
        currentLevel++;
        startLevel();
    }
}

function triggerUpgradeScreen(p1HasUpg, p2HasUpg) {
    gameState = 'UPGRADE';
    clearPcInputs();
    p1SelectedUpg = null; p2SelectedUpg = null;
    p1Confirmed = false; p2Confirmed = false;

    document.getElementById('upgradeScreen').style.display = 'flex';
    document.getElementById('p1Half').style.display = 'flex';

    if (p1HasUpg) {
        document.getElementById('p1Status').style.display = 'none'; document.getElementById('p1ConfirmBtn').disabled = true; document.getElementById('p1ConfirmBtn').style.display = 'block'; document.getElementById('p1UpgCount').innerText = `LƯỢT CHỌN: ${players[0].pendingUpgrades}`;
        updateTagBar(1); renderCards(1, 'p1Cards');
    } else {
        p1Confirmed = true;
        setUpgradeHalfDone(1, NET.mode === 'host' ? 'HẾT LƯỢT CHỌN (chờ đồng đội...)' : 'HẾT LƯỢT CHỌN');
    }

    let p2Half = document.getElementById('p2Half');
    if (players.length < 2) {
        p2Half.style.display = 'none'; p2Confirmed = true;
    } else if (NET.mode === 'host') {
        // Online: người chơi 2 tự chọn thẻ trên máy của họ
        p2Half.style.display = 'none';
        p2Confirmed = !p2HasUpg;
    } else {
        p2Half.style.display = 'flex';
        p2Half.style.transform = 'rotate(180deg)'; // chung 1 máy: xoay ngược cho người ngồi đối diện
        if (p2HasUpg) {
            document.getElementById('p2Status').style.display = 'none'; document.getElementById('p2ConfirmBtn').disabled = true; document.getElementById('p2ConfirmBtn').style.display = 'block'; document.getElementById('p2UpgCount').innerText = `LƯỢT CHỌN: ${players[1].pendingUpgrades}`;
            updateTagBar(2); renderCards(2, 'p2Cards');
        } else {
            p2Confirmed = true;
            setUpgradeHalfDone(2, 'HẾT LƯỢT CHỌN');
        }
    }
    netSendSync();
}

// Biến lưu trạng thái bật/tắt tag của 2 người chơi (Mặc định ẩn)
let showTagsP1 = false;
let showTagsP2 = false;

function toggleTags(pid) {
    if (pid === 1) showTagsP1 = !showTagsP1;
    if (pid === 2) showTagsP2 = !showTagsP2;
    updateTagBar(pid); // Load lại giao diện ngay lập tức
}

function updateTagBar(pid) {
    let p = players[pid - 1];
    let container = document.getElementById(`p${pid}Tags`);

    if (!p) return;
    let exclusiveText = activeExclusiveTag ? ` <span style="color:#e74c3c">(Độc Tôn: ${tagLabel(activeExclusiveTag)})</span>` : '';

    // Kiểm tra xem người chơi này đang bật hay tắt xem Tag
    let isShowing = (pid === 1) ? showTagsP1 : showTagsP2;
    let toggleText = isShowing ? "▲ Ẩn" : "▼ Xem Link";

    // 1. Render Dòng thông tin Mảnh Bức Phá + Nút Bật/Tắt
    let html = `
        <div style="display: flex; justify-content: center; align-items: center; gap: 8px; width: 100%; margin-bottom: 2px;">
            <div style="color: #f39c12; font-weight: bold; font-size: 1.1em;">MẢNH BỨC PHÁ: ${breakthroughShards}${exclusiveText}</div>
            <button onclick="toggleTags(${pid})" style="background: #2c3e50; color: #fff; border: 1px solid #7f8c8d; border-radius: 4px; padding: 2px 6px; font-size: 1em; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">
                ${toggleText}
            </button>
        </div>
    `;

    // 2. Render Danh sách Tag (Chỉ hiện khi isShowing = true)
    if (isShowing) {
        // Đưa thanh cuộn (overflow-y) vào khung danh sách này để không đẩy nút Xác Nhận
        html += `<div style="display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; width: 100%; max-height: 45px; overflow-y: auto; padding: 2px 0;">`;
        let hasTag = false;
        for (let tag in p.tags) {
            if (p.tags[tag] > 0 && TAG_DEFS[tag]) {
                let max = TAG_DEFS[tag].max;
                let c = TAG_DEFS[tag].color;
                html += `<div class="tag-badge" style="border-color:${c}; color:${c}">${tagLabel(tag)} ${p.tags[tag]}/${max}</div>`;
                hasTag = true;
            }
        }
        if (!hasTag) html += '<span style="color:#7f8c8d;">Chưa có Link</span>';
        html += `</div>`;
    }

    container.innerHTML = html;
}

const STACKABLE_PERKS = { e_chuoiSet: 5, e_camUng: 5 };          // Thẻ lấy được nhiều lần
const REPEATABLE_UPGRADES = ['p_hp', 'p_spd', 'p_dmg'];           // Thẻ chỉ số cơ bản, lấy vô hạn
const ELECTRIC_CARDS = ['e_dienAp', 'e_giapNangLuong', 'e_chuoiSet', 'e_thietXaLoiDong', 'e_joule', 'e_camUng', 'e_doanMach'];
function tagLabel(t) { return (TAG_DEFS[t] && TAG_DEFS[t].label) || t; }

// Số Mảnh Bức Phá cần cho 1 thẻ: mỗi Link của thẻ chạm đúng mốc bức phá tốn 1 mảnh
function getShardCost(upg) {
    let cost = 0, blocked = false, exclusiveBreak = false;
    for (let t of upg.tags) {
        let rule = TAG_RULES[t];
        if (!rule) continue;
        if (getTeamTagLevel(t) + 1 === rule.reqBreak) {
            cost++;
            if (rule.exclusive) {
                exclusiveBreak = true;
                if (activeExclusiveTag && activeExclusiveTag !== t) blocked = true;
            }
        }
    }
    return { cost, blocked, exclusiveBreak };
}

function canOfferUpgrade(p, upg) {
    let maxStacks = STACKABLE_PERKS[upg.id];
    if (maxStacks) { if ((p.perkStacks[upg.id] || 0) >= maxStacks) return false; }
    else if (!REPEATABLE_UPGRADES.includes(upg.id) && p.perks[upg.id]) return false;

    if (upg.tags.includes('BẬC THẦY') && p.tags['BẬC THẦY'] > 0) return false;
    if (upg.id === 'k_diet' && (!p.perks.m_hoi || !p.perks.m_thieu || !p.perks.m_pha)) return false;
    if (upg.id === 'm_legendary' && !p.perks.m_diet) return false;
    if (upg.id === 'v_tenNo' && !p.perks.v_muaTen) return false;
    if (upg.id === 'a_elite_squad' && getTeamTagLevel('TRIEU_HOI') < 2) return false;
    if (upg.id === 'a_drone_link_protocol' && (getTeamTagLevel('TRIEU_HOI') < 2 || getTeamTagLevel('DRONE') < 1)) return false;
    if (upg.id === 'u_drone_carrier' && (getTeamTagLevel('DRONE') < 3 || getTeamTagLevel('TRIEU_HOI') < 3)) return false;
    if (upg.id === 'a_heavy_artillery' && getTeamTagLevel('CHIẾN XA') < 1) return false;
    // Thẻ hệ ĐIỆN chỉ xuất hiện sau khi vượt 3 tầng Nhà Máy Điện
    if (ELECTRIC_CARDS.includes(upg.id) && currentPowerFloorCleared < 3) return false;

    let sc = getShardCost(upg);
    if (sc.blocked || sc.cost > breakthroughShards) return false;
    return true;
}

function renderCards(pid, containerId) {
    let container = document.getElementById(containerId);
    container.innerHTML = '';
    let p = players[pid - 1];
    let weightedPool = [];

    for (let upg of UPGRADES) {
        if (!canOfferUpgrade(p, upg)) continue;
        let weight = 1;
        for (let t of upg.tags) { if (p.tags[t] && p.tags[t] > 0) weight += 3; }
        for (let i = 0; i < weight; i++) weightedPool.push(upg);
    }

    let choices = [];
    while (choices.length < 3 && weightedPool.length > 0) {
        let pick = weightedPool[Math.floor(Math.random() * weightedPool.length)];
        if (!choices.find(c => c.id === pick.id)) choices.push(pick);
        weightedPool = weightedPool.filter(u => u.id !== pick.id);
    }

    choices.forEach((upg, index) => {
        let sc = getShardCost(upg);
        let isExclusiveBreak = sc.exclusiveBreak; // Thẻ sắp đột phá Độc Tôn (Mốc tím bậc 5)

        let card = document.createElement('div');
        card.className = `animate-card-open flex-1 h-full max-w-[32%] bg-gray-800 rounded-xl p-2 text-center flex flex-col justify-between border-2 shadow-lg cursor-pointer transition transform active:scale-95 ${isExclusiveBreak ? 'border-purple-600 bg-purple-950/30' : (sc.cost > 0 ? 'border-amber-500' : 'border-gray-700')}`;
        card.id = `p${pid}Card${index}`;

        let tagsHtml = '';
        if (upg.tags.length > 0) {
            tagsHtml = '<div class="flex gap-1 flex-wrap justify-center mt-1">';
            for (let t of upg.tags) tagsHtml += `<span class="text-[8px] px-1 py-0.5 rounded bg-black font-semibold" style="color:${TAG_DEFS[t] ? TAG_DEFS[t].color : '#fff'}">${tagLabel(t)} ${(p.tags[t] || 0) + 1}</span>`;
            tagsHtml += '</div>';
        }
        let extra = '';
        if (sc.cost > 0) extra += `<div class="text-[9px] font-bold text-amber-400">◆ BỨC PHÁ: -${sc.cost} Mảnh</div>`;
        let maxStacks = STACKABLE_PERKS[upg.id];
        if (maxStacks) extra += `<div class="text-[9px] font-bold text-cyan-300">Cấp ${(p.perkStacks[upg.id] || 0) + 1}/${maxStacks}</div>`;

        card.innerHTML = `
            <div>
                <div class="text-[9px] font-bold uppercase tracking-wider ${isExclusiveBreak ? 'text-purple-400' : 'text-yellow-500'}">${upg.type}</div>
                <div class="text-xs font-bold text-white mt-0.5 truncate">${upg.name}</div>
                <div class="text-[9px] text-gray-400 leading-tight mt-1 h-12 overflow-hidden text-ellipsis">${upg.desc}</div>
                ${extra}
            </div>
            ${tagsHtml}
        `;
        card.onclick = () => selectCard(pid, upg.id, index, isExclusiveBreak);
        container.appendChild(card);
    });

    if (choices.length === 0) {
        container.innerHTML = '<div class="text-xs text-gray-400">Không còn thẻ phù hợp.</div>';
        // Không còn gì để chọn: bỏ qua lượt để không kẹt màn hình
        p.pendingUpgrades = 0;
    }
}

function selectCard(pid, upgId, index, isExclusiveBreak) {
    if (pid === 1 && p1Confirmed) return;
    if (pid === 2 && p2Confirmed) return;
    Sound.play('select');

    if (pid === 1) p1SelectedUpg = upgId;
    if (pid === 2) p2SelectedUpg = upgId;

    // Đổi màu viền thẻ khi chọn
    let activeClasses = (pid === 1) ? ['!border-emerald-400', 'ring-4', 'ring-emerald-500/50'] : ['!border-red-400', 'ring-4', 'ring-red-500/50'];
    const allActive = ['!border-emerald-400', '!border-red-400', 'ring-4', 'ring-emerald-500/50', 'ring-red-500/50'];

    for (let i = 0; i < 3; i++) {
        let el = document.getElementById(`p${pid}Card${i}`);
        if (el) {
            // Gỡ highlight cũ rồi mới tô thẻ đang chọn -> đổi lựa chọn bao nhiêu lần cũng hiển thị đúng
            el.classList.remove(...allActive);
            el.style.transform = '';
            if (i === index) { el.classList.add(...activeClasses); el.style.transform = 'scale(1.04)'; }
        }
    }
    document.getElementById(`p${pid}ConfirmBtn`).disabled = false;

    // Nếu chạm trúng thẻ sắp Bức Phá hệ Độc Tôn -> Bung cảnh báo
    if (isExclusiveBreak) {
        document.getElementById('exclusiveWarningDialog').style.display = 'flex';
    }
}

function closeExclusiveWarning() {
    document.getElementById('exclusiveWarningDialog').style.display = 'none';
    Sound.play('select');
}

// ID thẻ -> cờ perk mà code gameplay thực sự kiểm tra (trước đây nhiều thẻ lệch ID nên không có tác dụng)
const PERK_FLAG_ALIASES = {
    s_adren: 'adren', s_revive: 'instRevive', s_medbox: 'medbox', s_rain: 'rain', s_frenzy: 'frenzy',
    m_tech: 'meleeTech', m_sword: 'swordArt', m_heart: 'heartSword', st_evo: 'evo',
    h_supply: 'fastSupply', h_support: 'heliFollow', h_strike: 'airstrike', p_learn: 'fastLearn',
    m_luyenKiem: 'luyenKiem', m_startSword: 'startSword',
    k_kyThuat: 'm_kyThuat', k_hoi: 'm_hoi', k_thieu: 'm_thieu', k_pha: 'm_pha', k_diet: 'm_diet'
};

function applyUpgrade(p, upgId) {
    if (upgId === 'p_hp') { p.maxHp += 50; p.hp = Math.min(p.maxHp, p.hp + 50); }
    else if (upgId === 'p_spd') p.baseSpeed += 40;
    else if (upgId === 'p_dmg') p.dmgMult += 0.25;
    else if (upgId === 'st_rain') { applyRandomStat(p); applyRandomStat(p); applyRandomStat(p); }
    else if (upgId === 'st_value') { p.dmgMult *= 1.2; p.maxHp += 30; p.hp = p.maxHp; p.baseSpeed += 10; p.critBonus += 0.1; }
    else if (upgId === 'm_startSword') { p.weapon = { ...WEAPON_TYPES['KATANA'] }; p.weapon.maxAmmo *= 2; p.weapon.ammo = p.weapon.maxAmmo; }
    else if (upgId === 'p_lucLienHoan') {
        if (p.weapon && p.weapon.name === 'Lục') { p.weapon.maxAmmo *= 3; p.weapon.ammo = p.weapon.maxAmmo; }
    }
    else if (upgId === 'a_elite_squad') { for (let a of allies) if (!a.elite) a.promoteElite(); }

    if (PERK_FLAG_ALIASES[upgId]) p.perks[PERK_FLAG_ALIASES[upgId]] = true;
    p.perks[upgId] = true;
    if (STACKABLE_PERKS[upgId]) p.perkStacks[upgId] = (p.perkStacks[upgId] || 0) + 1;
}

function setUpgradeHalfDone(pid, text) {
    document.getElementById(`p${pid}Cards`).innerHTML = '';
    document.getElementById(`p${pid}ConfirmBtn`).style.display = 'none';
    document.getElementById(`p${pid}Status`).innerText = text;
    document.getElementById(`p${pid}Status`).style.display = 'block';
    document.getElementById(`p${pid}UpgCount`).innerText = '';
    updateTagBar(pid);
}

function confirmUpgrade(pid) {
    let upgId = pid === 1 ? p1SelectedUpg : p2SelectedUpg; if (!upgId) return false;

    // KHÁCH ONLINE: chỉ gửi lựa chọn, chủ phòng mới là nơi áp dụng
    if (NET.mode === 'guest') {
        if (p2Confirmed) return false;
        p2Confirmed = true;
        netSend({ t: 'upg', id: upgId });
        Sound.play('upgrade');
        setUpgradeHalfDone(2, 'ĐÃ GỬI - CHỜ ĐỒNG ĐỘI...');
        return true;
    }

    if ((pid === 1 && p1Confirmed) || (pid === 2 && p2Confirmed)) return false;
    let p = players[pid - 1]; let upgData = UPGRADES.find(u => u.id === upgId);

    // Kiểm tra lại (vd: đồng đội vừa dùng mất Mảnh Bức Phá / vừa khóa Độc Tôn)
    if (!p || !upgData || !canOfferUpgrade(p, upgData)) {
        Sound.play('hit');
        if (pid === 1) p1SelectedUpg = null; else p2SelectedUpg = null;
        document.getElementById(`p${pid}ConfirmBtn`).disabled = true;
        updateTagBar(pid); renderCards(pid, `p${pid}Cards`);
        return false;
    }

    Sound.play('upgrade');
    let sc = getShardCost(upgData);
    applyUpgrade(p, upgId);

    for (let t of upgData.tags) {
        let rule = TAG_RULES[t];
        // Ghi nhận Bức Phá / Độc Tôn
        if (rule && getTeamTagLevel(t) + 1 === rule.reqBreak) {
            if (rule.exclusive) activeExclusiveTag = t;
            levelStartTexts.push({ text: `BỨC PHÁ: ${tagLabel(t)}!`, color: '#ff9f43' });
        }

        p.tags[t] = (p.tags[t] || 0) + 1;
        // Mốc 10 Kiếm Sư khởi đầu với Huyền thoại
        if (t === 'KIẾM SƯ' && p.tags[t] === 10) {
            p.weapon = { ...WEAPON_TYPES['LEGENDARY_KATANA'] };
            levelStartTexts.push({ text: 'THỨC TỈNH KIẾM SƯ!', color: '#ff9f43' });
        }
    }
    breakthroughShards = Math.max(0, breakthroughShards - sc.cost);
    p.pendingUpgrades--;

    let waiting = NET.mode === 'host' && !(pid === 1 ? p2Confirmed : p1Confirmed);
    if (pid === 1) p1Confirmed = true; else p2Confirmed = true;
    setUpgradeHalfDone(pid, waiting ? 'ĐÃ SẴN SÀNG! (chờ đồng đội...)' : 'ĐÃ SẴN SÀNG!');
    // Mảnh/Độc Tôn có thể vừa đổi -> làm mới thanh Link của người còn lại
    if (!isSinglePlayer) updateTagBar(pid === 1 ? 2 : 1);

    if (p1Confirmed && p2Confirmed) { setTimeout(() => { if (gameState === 'UPGRADE') checkAndTriggerUpgrade(); }, 500); }
    return true;
}
