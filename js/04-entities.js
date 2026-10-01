// ---- CHÍ MẠNG & HEADSHOT (nguồn duy nhất, calcDamage dùng trực tiếp) ----
let lastHitInfo = { crit: false, headshot: false };
function isSniper(wep) { return !!wep && wep.name === 'Ngắm'; }

function getPlayerCritStats(p, wep) {
    let critChance = (wep && wep.critCh !== undefined) ? wep.critCh : 0.05;
    let critMult = (wep && wep.critMult) ? wep.critMult : 2.0;
    critChance += p.critBonus || 0;

    // Thẻ nâng cấp
    if (p.perks.p_accuracy) critChance += 0.2;
    if (p.perks.p_sharp && wep && wep.type === 'melee') critChance += 0.2;
    if (p.perks.p_x8 && isSniper(wep)) critChance += 0.2;
    if (p.perks.p_lucLienHoan && wep && wep.name === 'Lục') critChance *= 0.5; // Liên Hoàn: giảm 50% tỉ lệ Crit

    // Link CHUẨN XÁC
    let chuanXacLvl = p.tags['CHUẨN XÁC'] || 0;
    if (chuanXacLvl >= 4) { critChance += 0.3; critMult += 1.0; }
    else if (chuanXacLvl >= 2) { critChance += 0.15; critMult += 0.5; }

    // Link SNIPER
    let sniperLvl = p.tags['SNIPER'] || 0;
    if (isSniper(wep)) {
        if (sniperLvl >= 4) critMult *= 2.0;
        else if (sniperLvl >= 2) critMult *= 1.5;
    }

    return { chance: Math.max(0, Math.min(1.0, critChance)), mult: critMult };
}

function getPlayerHeadshotChance(p, wep) {
    if (!wep) return 0;
    let isBow = wep.name === 'Cung';
    if (wep.type !== 'gun' && !isBow) return 0;
    if (wep.isFlamethrower || wep.isAcidSprayer || wep.isExplosiveProj) return 0;

    let sniper = isSniper(wep);
    let hsChance = (wep.name === 'Lục' || sniper) ? 0.08 : 0.02;

    if (p.perks.p_headhunter) hsChance += 0.15;
    if ((p.tags['XẠ THỦ'] || 0) >= 5) hsChance += 0.1;
    if ((p.tags['CHUẨN XÁC'] || 0) >= 4) hsChance += 0.1;
    if ((p.tags['SNIPER'] || 0) >= 4 && sniper) hsChance += 0.15;

    let standingStill = Math.hypot(p.vx || 0, p.vy || 0) < 10;
    if (p.perks.v_sniper && (sniper || isBow)) hsChance += standingStill ? 0.15 : 0.05;
    // Ngắm Bắn: Đứng yên + Sniper = 100% Headshot
    if (p.perks.p_aim && sniper && standingStill) hsChance = 1.0;

    return Math.min(1.0, hsChance);
}

class Player {
    constructor(id, x, y, color) {
        this.id = id; this.x = x; this.y = y; this.radius = 16; this.color = color;
        this.hp = 100; this.maxHp = 100; this.hunger = 100; this.baseSpeed = 220;
        this.weapon = null; this.lastFireTime = 0; this.facingX = 1; this.facingY = 0; this.heat = 0; this.lastTriggerTap = 0;
        this.pullingPin = false; this.pinTime = 0; this.isDowned = false; this.reviveCount = 0; this.reviveProgress = 0;

        this.level = 1; this.xp = 0; this.pendingUpgrades = 0;
        this.xpShowTimer = 0;

        this.swordKills = 0; this.cKills = 0; this.dCharge = 0; this.skillC_CD = 0;
        this.chargeTime = 0; this.netTimer = 0;

        this.dmgMult = 1.0; this.critBonus = 0; this.armorMult = 1.0;
        this.luckyKills = 0;
        this.tags = {
            // Các hệ phổ thông cũ
            'TRỢ GIÚP': 0, 'HỒI MÁU': 0, 'TIẾN CÔNG': 0, 'ĐẶC BIỆT': 0, 'VẬT PHẨM': 0,
            'ĐẠN': 0, 'CẬN CHIẾN': 0, 'CHỈ SỐ': 0, 'MAY MẮN': 0, 'TRỰC THĂNG': 0,
            'TĂNG TIẾN': 0, 'CHIẾN XA': 0, 'NỔ': 0, 'TẤN CÔNG TỰ ĐỘNG': 0,

            // Đại hệ Độc Tôn cũ
            'KIẾM SƯ': 0, 'DRONE': 0,

            // --- BỔ SUNG CÁC HỆ VÀ ĐẠI HỆ MỚI KHAI BÁO THIẾU ---
            'XẠ THỦ': 0,// Tăng băng đạn, sát thương xạ chiến mốc 2/5/8/10
            'CHUẨN XÁC': 0,// Tăng Crit Chance, Crit Mult và tạo hiệu ứng Thiêu Đốt
            'SNIPER': 0,// Buff sát thương bạo kích tối thượng cho súng Ngắm
            'ĐIỆN': 0,// Đại hệ độc tôn mới (Điện Áp, Chuỗi Sét, Đoản Mạch...)
            'BẬC THẦY': 0,// Hệ quản lý mốc mở khóa tối cao (Dành cho Luyện Kiếm, AI Drone)
            'NHẤT KIẾM': 0// Tag ghi nhận trạng thái Tuyệt Kỹ của Kiếm Sĩ
        };
        this.perks = {
            // Hệ thống thẻ sinh tồn & chiến lược gốc
            adren: false, adrenUsed: false, invulnTimer: 0, instRevive: false, instReviveUsed: false,
            medbox: false, medboxTimer: 0, rain: false, rainStacks: 0, rainTimer: 0, frenzy: false,
            frenzyStacks: 0, frenzyTimer: 0, reload: false, lifesteal: false, meleeTech: false,
            swordArt: false, heartSword: false, evo: false, fastSupply: false, heliFollow: false,
            airstrike: false, fastLearn: false, startSword: false, luyenKiem: false, nhatKiem: false,

            // Hệ thống Chiến Xa & Trực Thăng
            t_enter: false, t_explo: false, t_radio: false, t_auto: false, t_stats: false, t_master: false,
            p_raiBoom: false, p_tinHieu: false, p_hoaLuc: false, p_thoatHiem: false, p_yemTro: false,
            p_miniDrone: false, p_healDrone: false, p_suicideDrone: false,
            v_gunner: false, v_sniper: false, v_spotlight: false, d_scout: false, d_melee: false,
            a_chongAnMon: false, a_matNaLoc: false, a_apSuatCao: false,

            // Hệ Kiếm Sư mở rộng (Đã đồng bộ k_kyThuat khớp với mảng UPGRADES)
            k_kyThuat: false, m_hoi: false, m_thieu: false, m_pha: false, m_diet: false, m_legendary: false,

            // Hệ Chuẩn Xác / Sniper / Súng Lục
            p_headhunter: false, p_aim: false, p_pierceApple: false, p_x8: false, p_sharp: false, p_accuracy: false,
            p_lucOnDinh: false, p_lucLienHoan: false,

            // Hệ Drone Mới 
            d_arti: false, d_laser: false, d_buffer: false, d_learn: false,

            // Hệ Điện Năng bổ sung (Giúp code không bị lỗi undefined khi check điều kiện)
            e_dienAp: false, e_giapNangLuong: false, e_chuoiSet: false, e_thietXaLoiDong: false,
            e_joule: false, e_camUng: false, e_doanMach: false
        };
        this.stunTimer = 0;
        this.stunImmunityTimer = 0;
        this.stunHitCount = 0;       // Đếm số lần ăn choáng
        this.lastStunTime = 0; // Biến bảo hộ mới thêm
        this.swordWaveTimer = 0; // Thời gian hồi chiêu chém sóng kiếm (Mốc 8 và 10)
        this.tempShield = 0;
        this.droneKills = 0;
        this.silenceTimer = 0;
        this.markedTimer = 0;
        this.fearTimer = 0;
        this.perkStacks = {};      // Số lần đã lấy các thẻ cộng dồn (Chuỗi Sét, Cảm Ứng Điện Từ)
        this.status = {};
        this.hurtFlash = 0; this.auraDmg = 0; this.curSpeed = 0; this.energyShieldTimer = 0;
        this.vx = 0; this.vy = 0;


    }


    applyHeal(amount) {
        let healMult = (this.tags['HỒI MÁU'] >= 2) ? 1.5 : 1.0; let finalHeal = amount * healMult * HEALING_MULT;
        this.hp = Math.min(this.maxHp, this.hp + finalHeal); createParticles(this.x, this.y, '#2ecc71', 5, 100);
        Sound.play('heal');
        if (this.tags['TRỢ GIÚP'] >= 3 && !isSinglePlayer) { let partner = players[1 - (this.id - 1)]; if (partner && !partner.isDowned) { partner.hp = Math.min(partner.maxHp, partner.hp + finalHeal * 0.5); createParticles(partner.x, partner.y, '#2ecc71', 5, 100); } }
    }

    getDefenseMult() {
        let m = this.armorMult;
        if (this.tags['ĐẶC BIỆT'] >= 2) m *= 0.8;
        if (this.tags['CHỈ SỐ'] >= 4) m *= 0.9;
        return m;
    }

    goDown() {
        if (this.perks.adren && !this.perks.adrenUsed) {
            this.hp = 1; this.perks.invulnTimer = 3.0; this.perks.adrenUsed = true;
            createParticles(this.x, this.y, '#f1c40f', 50, 200);
            spawnRing(this.x, this.y, '#f1c40f', 120, 0.4);
            vfxList.push({ type: 'text', text: 'ADRENALINE!', x: this.x, y: this.y - 30, life: 1.5, color: '#f1c40f' });
            Sound.play('level');
            return;
        }
        this.hp = 0; this.isDowned = true; this.weapon = null; this.pullingPin = false; this.chargeTime = 0; this.status = {};
        createParticles(this.x, this.y, '#c0392b', 20, 200);
        addDecal(this.x, this.y, '#7b1a12', 26, 0.55);
        Sound.play('down');
    }

    // Sát thương rỉ theo thời gian (đói, acid, vùng điện, tia...): không kích hoạt né / phản đòn / khiên
    takeDot(amount) {
        if (this.isDowned || this.perks.invulnTimer > 0 || !(amount > 0)) return;
        this.hp -= amount * this.getDefenseMult();
        this.hurtFlash = Math.max(this.hurtFlash || 0, 0.1);
        if (this.hp <= 0) this.goDown();
    }

    takeDamage(amount) {
        if (this.isDowned || this.perks.invulnTimer > 0 || !(amount > 0)) return;
        // LOGIC PHẢN ĐÒN & MIỄN ST (KIẾM SƯ)
        let isMelee = this.weapon && this.weapon.type === 'melee';
        let kLvl = this.tags['KIẾM SƯ'] || 0;
        let parryChance = 0;
        if (kLvl >= 10) parryChance = 0.8;
        else if (kLvl >= 8) parryChance = 0.5;
        else if (this.perks.m_kyThuat) parryChance = 0.3;

        if (isMelee && Math.random() < parryChance) {
            vfxList.push({ type: 'text', text: 'PHẢN ĐÒN!', x: this.x, y: this.y - 40, life: 1.0, color: '#00ffff' });
            Sound.play('melee');
            spawnRing(this.x, this.y, '#00ffff', 70, 0.25);
            let z = getNearestZombie(this.x, this.y, 150);
            if (z) { z.hp -= Math.min(amount, 200) * 2; z.lastHitBy = this; createParticles(z.x, z.y, '#00ffff', 10, 200); zombieDown(z, this); }
            return; // Chặn sát thương
        }
        if (this.tags['MAY MẮN'] >= 4 && Math.random() < 0.3) {
            vfxList.push({ type: 'text', text: 'NÉ!', x: this.x, y: this.y - 30, life: 1.0, color: '#ffe359' });
            return;
        }
        if (this.tempShield > 0) { this.tempShield--; createParticles(this.x, this.y, '#3498db', 10, 150); spawnRing(this.x, this.y, '#3498db', 55, 0.25); return; }

        let finalDmg = amount * this.getDefenseMult();

        // San Sẻ Sát Thương: chuyển 20% sang lính Tiên Phong gần nhất
        if (this.perks.a_share_pain) {
            let guard = null, best = 520;
            for (let a of allies) {
                if (a.hp <= 0 || a.kind !== 'vanguard') continue;
                let d = Math.hypot(a.x - this.x, a.y - this.y);
                if (d < best) { best = d; guard = a; }
            }
            if (guard) { guard.takeDamage(finalDmg * 0.2); finalDmg *= 0.8; }
        }

        this.hp -= finalDmg; this.hurtFlash = 0.3;
        vfxList.push({ type: 'scratch', x: this.x, y: this.y, life: 0.2 });
        Sound.play('hit');
        if (this.hp <= 0) this.goDown();
    }

    onKill(zombieType) {
        killCount++;
        recordMissionKill(zombieType);
        if (this.tags['MAY MẮN'] >= 2) {
            this.luckyKills++;
            if (this.luckyKills >= 30) {
                this.luckyKills = 0;
                if (Math.random() < 0.25) spawnDrop(this.x + (Math.random() - 0.5) * 50, this.y + (Math.random() - 0.5) * 50, false, 'MEDKIT');
            }
        }
        if (this.perks.frenzy) { this.perks.frenzyStacks = Math.min(10, this.perks.frenzyStacks + 1); this.perks.frenzyTimer = 5.0; }
        if (this.perks.lifesteal) this.applyHeal(2);
        // Link ĐẠN mốc 2: giết quái có 20% hồi 10% đạn
        if ((this.perks.reload || this.tags['ĐẠN'] >= 2) && this.weapon && this.weapon.type !== 'special' && this.weapon.type !== 'explosive' && Math.random() < 0.20) { let max = this.weapon.maxAmmo || 30; this.weapon.ammo = Math.min(max, this.weapon.ammo + Math.ceil(max * 0.1)); vfxList.push({ type: 'text', text: '+Đạn', x: this.x, y: this.y - 30, life: 0.5, color: '#95a5a6' }); }

        if (this.weapon && this.weapon.type === 'melee') {
            let isKatana = (this.weapon.name === 'Kiếm' || this.weapon.name === 'Katana Huyền Thoại');
            if (isKatana && this.perks.m_hoi) {
                this.weapon.ammo = Math.min(this.weapon.maxAmmo, this.weapon.ammo + 1);
                if (Math.random() < 0.02) this.applyHeal(this.maxHp * 0.01);
            }
            this.swordKills++;
            if (this.perks.luyenKiem && !this.perks.nhatKiem && this.swordKills >= 50) {
                this.perks.nhatKiem = true;
                if (!this.tags['BẬC THẦY']) this.tags['BẬC THẦY'] = 0; this.tags['BẬC THẦY']++;
                if (!this.tags['NHẤT KIẾM']) this.tags['NHẤT KIẾM'] = 0; this.tags['NHẤT KIẾM']++;
                vfxList.push({ type: 'text', text: 'TIẾN HÓA: NHẤT KIẾM!', x: this.x, y: this.y - 50, life: 2.0, color: '#ee5253' });
                createParticles(this.x, this.y, '#ee5253', 50, 300);
            }
            if (this.tags['KIẾM SƯ'] >= 5) {
                this.dCharge = Math.min(50, this.dCharge + 1);
                if (this.swordKills % 20 === 0) {
                    this.dmgMult += 0.05;
                    vfxList.push({ type: 'text', text: '+5% Sát Thương', x: this.x, y: this.y - 30, life: 1.5, color: '#e056fd' });
                }
            }
        }

        let baseXP = 15;
        if (zombieType === 0) baseXP = 10; else if (zombieType === 1) baseXP = 25; else if (zombieType === 4) baseXP = 150; else if (zombieType === 6) baseXP = 50;
        else if (zombieType === 9 || zombieType === 10 || zombieType === 11) baseXP = 30;
        else if (zombieType >= 30 && zombieType <= 32) baseXP = 600;
        else if (zombieType === 27 || zombieType === 28) baseXP = 120;
        else if (zombieType === 13 || zombieType === 14 || zombieType === 15 || zombieType === 20) baseXP = 60;
        let xpMult = 1.0 + (this.tags['TĂNG TIẾN'] * 0.15); if (this.perks.fastLearn) xpMult += 0.5;

        this.xp += baseXP * xpMult;
        this.xpShowTimer = 3.0;
        let reqXp = getXpRequired(this.level);
        if (this.xp >= reqXp) {
            this.xp -= reqXp; this.level++; this.pendingUpgrades++;
            spawnRing(this.x, this.y, '#f1c40f', 140, 0.5);
            vfxList.push({ type: 'text', text: 'CẤP ' + this.level + '!', x: this.x, y: this.y - 50, life: 2.0, color: '#f1c40f' });
            Sound.play('level');
            createParticles(this.x, this.y, '#f1c40f', 30, 200);
        }
    }

    onHitEnemy() { if (this.perks.rain) { this.perks.rainStacks = Math.min(50, this.perks.rainStacks + 2); this.perks.rainTimer = 2.0; } }
    getTotalDamageMult() {
        let mult = this.dmgMult;
        if (this.tags['TIẾN CÔNG'] >= 2) mult += 0.15;
        if (this.perks.frenzy) mult += (this.perks.frenzyStacks * 0.03);
        if (this.perks.rain) mult += (this.perks.rainStacks * 0.01);

        // THÊM LOGIC XẠ THỦ TẠI ĐÂY
        let xaThu = this.tags['XẠ THỦ'] || 0;
        // Mốc XẠ THỦ đã hiệu chỉnh theo số thẻ thật sự có (tối đa 6): 1/2/4/5/6
        if (xaThu >= 6) mult += 1.0;
        else if (xaThu >= 5) mult += 0.5;
        else if (xaThu >= 4) mult += 0.3;
        else if (xaThu >= 2) mult += 0.1;
        else if (xaThu >= 1) mult += 0.05;

        // Link CHỈ SỐ
        let chiSo = this.tags['CHỈ SỐ'] || 0;
        if (chiSo >= 4) mult += 0.15; else if (chiSo >= 2) mult += 0.08;
        // Buff từ Drone Tiến Công / Truyền Cảm Hứng
        mult += this.auraDmg || 0;

        return mult;
    }
    update(dt) {
        if (this.swordWaveTimer > 0) this.swordWaveTimer -= dt;
        if (this.xpShowTimer > 0) this.xpShowTimer -= dt;
        if (this.perks.invulnTimer > 0) this.perks.invulnTimer -= dt;
        if (this.perks.frenzyTimer > 0) { this.perks.frenzyTimer -= dt; if (this.perks.frenzyTimer <= 0) this.perks.frenzyStacks = 0; }
        if (this.perks.rainTimer > 0) { this.perks.rainTimer -= dt; if (this.perks.rainTimer <= 0) this.perks.rainStacks = 0; }
        if (this.skillC_CD > 0) this.skillC_CD -= dt;
        if (this.stunTimer > 0) this.stunTimer -= dt;
        if (this.stunImmunityTimer > 0) this.stunImmunityTimer -= dt;
        if (this.silenceTimer > 0) this.silenceTimer -= dt;
        if (this.markedTimer > 0) this.markedTimer -= dt;
        if (this.fearTimer > 0) this.fearTimer -= dt;
        if (!this.isDowned) updateStatusEffects(this, dt, true);
        if (this.tags['HỒI MÁU'] >= 4 && !this.isDowned && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.01 * HEALING_MULT * dt);

        if (this.perks.heartSword && !this.isDowned && this.weapon && (this.weapon.name === 'Kiếm' || this.weapon.name === 'Katana Huyền Thoại')) {
            for (let b of enemyBullets) { if (b.active && Math.hypot(b.x - this.x, b.y - this.y) < this.radius + 30) { b.active = false; createParticles(b.x, b.y, '#00ffff', 5, 100); } }
        }

        if (this.perks.medbox && !this.isDowned) { this.perks.medboxTimer -= dt; if (this.perks.medboxTimer <= 0) { spawnDrop(this.x + (Math.random() - 0.5) * 100, this.y + (Math.random() - 0.5) * 100, false, 'MEDKIT'); this.perks.medboxTimer = 20.0; } }
        if (this.isDowned) { if (!isSinglePlayer) this.updateDownedState(dt); return; }

        let joy = getJoystickState(this.id);
        // Buff hào quang: Drone Tiến Công (+12% tốc, +15% ST) & Truyền Cảm Hứng (+10% tốc, +15% ST)
        let auraSpd = 1; this.auraDmg = 0;
        if (this.perks.d_buffer && drones.some(d => d.owner === this.id && d.type === 'buffer')) { auraSpd *= 1.12; this.auraDmg += 0.15; }
        if (this.perks.a_inspire && (drones.some(d => d.owner === this.id) || allies.some(a => a.hp > 0 && Math.hypot(a.x - this.x, a.y - this.y) < 240))) { auraSpd *= 1.1; this.auraDmg += 0.15; }

        let speed = this.baseSpeed * checkSlowZone(this.x, this.y) * getWeatherSpeedMult() * auraSpd; speed *= getStatusMoveMult(this);
        if (this.perks.p_thoatHiem && heliSupport.active) speed *= 1.3; // Tăng tốc khi gọi trực thăng
        if (this.weapon && this.weapon.slowDown) speed *= this.weapon.slowDown;
        if (this.weapon && this.weapon.speedBoost) speed *= this.weapon.speedBoost; // Dao tăng tốc
        if (this.netTimer > 0) { this.netTimer -= dt; speed *= 0.4; }
        if (this.stunTimer > 0) speed = 0;
        if (this.perks.p_lucOnDinh && this.weapon && this.weapon.name === 'Lục') {
            speed *= 0.7; // Băng chậm hơn 30%
        }
        this.heat = Math.max(0, (this.heat || 0) - dt * 0.55);
        this.curSpeed = speed;

        let vx = 0, vy = 0;
        if (joy.active) {
            vx = joy.dx * speed;
            vy = joy.dy * speed;

            let visionRange = (this.weapon && this.weapon.range) ? this.weapon.range : 400;
            if (pointInBush(this.x, this.y)) visionRange *= 0.62;
            let autoAimRange = Math.min(visionRange, this.weapon ? 320 : 220);
            let autoTarget = playerUsesPointer(this) ? null : getNearestZombie(this.x, this.y, autoAimRange, true);

            if (autoTarget) {
                let autoAngle = Math.atan2(autoTarget.y - this.y, autoTarget.x - this.x);
                this.facingX = Math.cos(autoAngle);
                this.facingY = Math.sin(autoAngle);
            } else if (joy.dx !== 0 || joy.dy !== 0) {
                this.facingX = joy.dx;
                this.facingY = joy.dy;
            }
        }
        if (caveSlippery()) {
            // Sàn hang ướt: giảm độ bám khi đổi hướng (vận tốc bám theo hướng điều khiển một cách từ từ)
            let k = Math.min(1, dt * 4.2);
            this.slipX = (this.slipX || 0) + (vx - (this.slipX || 0)) * k; this.slipY = (this.slipY || 0) + (vy - (this.slipY || 0)) * k;
            vx = this.slipX; vy = this.slipY;
        } else { this.slipX = vx; this.slipY = vy; }
        this.vx = vx; this.vy = vy;
        this.x += vx * dt; this.y += vy * dt; resolveCollision(this);
        applyAim(this);
        for (let i = drops.length - 1; i >= 0; i--) {
            let d = drops[i];
            if (Math.hypot(this.x - d.x, this.y - d.y) < this.radius + d.radius + 15) {

                if (d.type === 'FOOD') {
                    this.hunger = Math.min(100, this.hunger + 40);
                    this.applyHeal(20);
                    Sound.play('pickup');
                    drops.splice(i, 1);
                }
                else if (d.type === 'MEDKIT') {
                    this.applyHeal(this.maxHp * 0.5);
                    Sound.play('pickup');
                    drops.splice(i, 1);
                    vfxList.push({ type: 'text', text: '+Cứu Thương', x: this.x, y: this.y - 30, life: 1.0, color: '#2ecc71' });
                }
                else if (d.type === 'SHARD') {
                    breakthroughShards++;
                    Sound.play('shard');
                    vfxList.push({ type: 'text', text: '+1 MẢNH BỨC PHÁ', x: this.x, y: this.y - 50, life: 2.0, color: '#ff9f43' });
                    drops.splice(i, 1);
                }
                else if (d.type === 'HEAVYBOX') { if (caveTakeHeavyBox(this)) drops.splice(i, 1); }
                else if (d.type === 'BLINDBOX' || d.type === 'SUPERBOX') {
                    if (!this.weapon) {
                        let pool = d.type === 'SUPERBOX' ? SUPER_WEAPONS : NORMAL_WEAPONS;
                        if (currentMapType === 6) pool = d.type === 'SUPERBOX' ? SUPER_WEAPONS.concat(ELECTRO_WEAPONS, ELECTRO_WEAPONS) : NORMAL_WEAPONS.concat(ELECTRO_WEAPONS, ELECTRO_WEAPONS, ELECTRO_WEAPONS);
                        if (this.perks.luyenKiem) pool = MELEE_ONLY_POOL;
                        let wepName = pool[Math.floor(Math.random() * pool.length)];

                        // [ĐÃ SỬA] Thay 'p.tags' thành 'this.tags'
                        let sniperLvl = (this.tags && this.tags['SNIPER']) ? this.tags['SNIPER'] : 0;
                        if (sniperLvl > 0) {
                            let boostChance = sniperLvl >= 4 ? 0.4 : 0.2;
                            if (Math.random() < boostChance) {
                                wepName = 'SNIPER'; // Khóa đúng của súng Ngắm trong WEAPON_TYPES
                            }
                        }
                        let dienLvl = this.tags['ĐIỆN'] || 0;
                        if (d.type === 'BLINDBOX') {
                            if (dienLvl >= 1 && Math.random() < 0.3) wepName = 'PISTOL_ELECTRO';
                            if (dienLvl >= 2 && Math.random() < 0.25) wepName = 'PLASMA_RAPID';
                            if (dienLvl >= 3 && Math.random() < 0.2) wepName = 'ELECTRON_FLUX';
                        }
                        if (d.type === 'SUPERBOX') {
                            if (dienLvl >= 5 && Math.random() < 0.15) wepName = 'TESLA_CARBINE';
                        }

                        if (d.type === 'SUPERBOX' && this.perks.m_legendary && Math.random() < 0.3) {
                            wepName = 'LEGENDARY_KATANA';
                        }
                        if (hasTeamPerk('t_radio') && !tank.active && Math.random() < 0.2) {
                            wepName = 'RADIO';
                        }
                        // Nếu có Link Kiếm Sư và nhặt Hộp Mù (Blindbox)
                        if (d.type === 'BLINDBOX' && this.tags && this.tags['KIẾM SƯ'] >= 1 && Math.random() < 0.6 && !this.perks.luyenKiem && wepName !== 'RADIO') {
                            wepName = 'KATANA';
                        }

                        // [BẢO VỆ CRASH] Kiểm tra xem vũ khí wepName có thực sự tồn tại trong WEAPON_TYPES không
                        if (WEAPON_TYPES && WEAPON_TYPES[wepName]) {
                            this.weapon = { ...WEAPON_TYPES[wepName] };

                            if (this.weapon.name === 'Lục' && this.perks.p_lucLienHoan) {
                                this.weapon.maxAmmo *= 3;
                                this.weapon.ammo = this.weapon.maxAmmo;
                            }

                            // BUFF CẬN CHIẾN MỐC 3 (Tăng 50% độ bền)
                            if (this.weapon.type === 'melee' && this.tags && this.tags['CẬN CHIẾN'] >= 3) {
                                this.weapon.maxAmmo = Math.floor(this.weapon.maxAmmo * 1.5);
                                this.weapon.ammo = this.weapon.maxAmmo;
                            }

                            // BUFF ĐẠN XẠ THỦ MỐC 2/5/8/10
                            let xaThu = (this.tags && this.tags['XẠ THỦ']) ? this.tags['XẠ THỦ'] : 0;
                            if ((this.weapon.type === 'gun' || this.weapon.type === 'charge' || this.weapon.name === 'Ngắm') && xaThu >= 2) {
                                let ammoMult = xaThu >= 6 ? 3.0 : (xaThu >= 5 ? 2.0 : (xaThu >= 4 ? 1.75 : 1.25));
                                this.weapon.maxAmmo = Math.floor(this.weapon.maxAmmo * ammoMult);
                                this.weapon.ammo = this.weapon.maxAmmo;
                            }

                            vfxList.push({ type: 'text', text: this.weapon.name, x: this.x, y: this.y - 40, life: 1.5, color: d.type === 'SUPERBOX' ? '#f1c40f' : '#fff' });
                            let smallGun = ['PISTOL', 'SMG', 'PISTOL_ELECTRO', 'PLASMA_RAPID'].includes(this.weapon.key);
                            Sound.play(this.weapon.type === 'gun' ? (smallGun ? 'reload_small' : 'reload_big') : (this.weapon.type === 'melee' ? 'pick_melee' : 'pickup'));
                            createParticles(this.x, this.y, d.type === 'SUPERBOX' ? '#f1c40f' : '#bdc3c7', 20, 150);
                            drops.splice(i, 1);
                        } else {
                            // Nếu lỗi chính tả trong mảng vũ khí, bỏ qua hộp này và log ra Console để dev biết
                            console.error("LỖI GAME: Không tìm thấy vũ khí tên là [" + wepName + "] trong từ điển WEAPON_TYPES.");
                        }
                    }
                    // THÊM: Logic VẬT PHẨM cấp 4 (Nạp đạn) khi người chơi đã có súng
                    else if (d.type === 'BLINDBOX' && this.weapon && this.tags && this.tags['VẬT PHẨM'] >= 4) {
                        // Kiểm tra có biến SUPER_WEAPONS hay không, phòng lỗi undefined
                        let isSuperWeapon = SUPER_WEAPONS.includes(this.weapon.key);

                        if (!isSuperWeapon && this.weapon.name !== 'Bộ Đàm') {
                            let restoreAmt = Math.ceil((this.weapon.maxAmmo || 30) * 0.25);
                            this.weapon.ammo = Math.min(this.weapon.maxAmmo, (this.weapon.ammo || 0) + restoreAmt);
                            vfxList.push({ type: 'text', text: '+Nạp Đạn', x: this.x, y: this.y - 40, life: 1.0, color: '#f1c40f' });
                            Sound.play('pickup');
                            drops.splice(i, 1);
                        }
                    }
                }
            }
        }

        this.hunger -= 1.0 * dt;
        if (this.hunger <= 0) {
            this.hunger = 0;
            this.takeDot(2 * dt);
        }

        // Lựu đạn nổ trên tay nếu quá giờ
        if (this.pullingPin && Date.now() >= this.pinTime) {
            explode(this.x, this.y, 250, 200, this);
            this.pullingPin = false;
            // Nếu là lựu đạn thì mất 1 viên, hết thì vứt
            if (this.weapon && this.weapon.name === 'Lựu Đạn') {
                this.weapon.ammo--;
                if (this.weapon.ammo <= 0) this.weapon = null;
            } else {
                this.weapon = null;
            }
        }

        let isPressedA = getButtonState(this.id, 'A', 'pressed');
        let justReleasedA = getButtonState(this.id, 'A', 'released');
        let isPressedC = getButtonState(this.id, 'C', 'justPressed');
        let isPressedD = getButtonState(this.id, 'D', 'justPressed');
        let canUseWeapon = this.silenceTimer <= 0 && this.stunTimer <= 0;

        if (isSinglePlayer && this.perks.instRevive && !this.perks.instReviveUsed && this.hp < this.maxHp * 0.2) { if (getButtonState(this.id, 'B', 'justPressed')) { this.applyHeal(this.maxHp); this.perks.instReviveUsed = true; vfxList.push({ type: 'text', text: 'CẤP CỨU!', x: this.x, y: this.y - 30, life: 1.5, color: '#2ecc71' }); return; } }

        let isKatanas = this.weapon && (this.weapon.name === 'Kiếm' || this.weapon.name === 'Katana Huyền Thoại');
        if (canUseWeapon && isPressedC && this.perks.nhatKiem && isKatanas && this.skillC_CD <= 0) {
            this.cKills++;
            let isGiantWave = (this.cKills % 5 === 0);
            let kLvl = this.tags['KIẾM SƯ'] || 0;

            if (kLvl >= 10) explode(this.x, this.y, 250, 500, this); // Mốc 10 Nổ lúc lướt đi

            this.x += this.facingX * (kLvl >= 10 ? 250 : 180);
            this.y += this.facingY * (kLvl >= 10 ? 250 : 180);
            resolveCollision(this);

            if (kLvl >= 10) explode(this.x, this.y, 250, 500, this); // Mốc 10 Nổ lúc đến

            let angle = Math.atan2(this.facingY, this.facingX);
            bullets.push(new Bullet(this.x, this.y, angle, { range: isGiantWave ? 900 : 450, dmg: this.weapon.dmg * (isGiantWave ? 5 : 2), isSwordWave: true, pierce: 99 }, this));
            this.skillC_CD = 3.0;
            createParticles(this.x, this.y, '#00ffff', 20, 400);
            addScreenShake(isGiantWave ? 15 : 5);
        }

        if (canUseWeapon && isPressedD && this.tags['KIẾM SƯ'] >= 5 && this.dCharge >= 50 && isKatanas) {
            addScreenShake(20); createParticles(this.x, this.y, '#e056fd', 100, 800);
            spawnRing(this.x, this.y, '#e056fd', 400, 0.5, 8);
            vfxList.push({ type: 'text', text: 'NỘ: KIẾM CƯỜNG!', x: this.x, y: this.y - 50, life: 1.5, color: '#e056fd' });
            for (let z of zombies) {
                if (Math.hypot(this.x - z.x, this.y - z.y) < 400) {
                    if (z.hp <= 0) continue;
                    z.hp -= Math.min(this.weapon.dmg, 150) * 10 * this.getTotalDamageMult();
                    z.lastHitBy = this;
                    z.knockback(Math.cos(Math.atan2(z.y - this.y, z.x - this.x)) * 1000, Math.sin(Math.atan2(z.y - this.y, z.x - this.x)) * 1000);
                    createParticles(z.x, z.y, '#e74c3c', 10, 300);
                    zombieDown(z, this);
                }
            }
            this.dCharge = 0;
        }

        if (canUseWeapon && this.weapon) {
            if (this.weapon.type === 'explosive') {
                if (isPressedA && !this.pullingPin) {
                    this.pullingPin = true;
                    this.pinTime = Date.now() + this.weapon.fuseTime;
                    Sound.play('grenade');
                }
            }
            else if (this.weapon.type === 'special') {
                if (isPressedA) { this.weapon = null; activateTank(this.x, this.y); }
            }
            else if (this.weapon.type === 'charge') {
                if (isPressedA) {
                    let chargeSpeed = this.perks.v_cungMaster ? dt * 2.0 : dt; // Đại Sư Khúc Xạ tích lực nhanh gấp đôi
                    if (this.chargeTime === 0 && this.weapon.isElectric) Sound.play('charge_up');
                    this.chargeTime = Math.min(1.5, this.chargeTime + chargeSpeed);
                    if (Math.random() < 0.3) createParticles(this.x + this.facingX * 25, this.y + this.facingY * 25, '#9b59b6', 1, 30);
                } else if (justReleasedA && this.chargeTime > 0) {
                    this.shootCharge(this.chargeTime);
                    this.chargeTime = 0;
                }
            }
            else {
                if (isPressedA) this.shoot();
            }
        }
        if (canUseWeapon && this.perks.v_autoMelee && this.weapon && this.weapon.type === 'gun' && this.skillC_CD <= 0) {
            let closeZ = getNearestZombie(this.x, this.y, 100);
            if (closeZ) {
                let ang = Math.atan2(closeZ.y - this.y, closeZ.x - this.x);
                slashes.push(new Slash(this.x, this.y, ang, { range: 100, dmg: 80 * this.getTotalDamageMult(), spread: 1.5, kb: 200, name: 'Dao' }, this));
                createParticles(this.x, this.y, '#bdc3c7', 10, 150);
                this.skillC_CD = 1.0; // Dùng chung mốc CD C cho đỡ lag
            }
        }

        // Nhấn B để ném lựu đạn hoặc vứt vũ khí
        if (canUseWeapon && getButtonState(this.id, 'B', 'justPressed')) {
            if (this.weapon && this.weapon.name === 'Lựu Đạn' && this.pullingPin) {
                this.throwGrenade();
            } else if (!this.weapon || this.weapon.name !== 'Lựu Đạn') {
                this.throwWeapon();
            }
        }
    }

    updateDownedState(dt) {
        if (isSinglePlayer) return; let partner = players[1 - (this.id - 1)]; let reqTime = 2.0 + this.reviveCount * 1.5;
        if (!partner) return;
        if (!partner.isDowned && partner.perks.instRevive && !partner.perks.instReviveUsed && Math.hypot(this.x - partner.x, this.y - partner.y) < 80) {
            if (getButtonState(partner.id, 'B', 'justPressed')) { this.isDowned = false; this.hp = this.maxHp * 0.5; partner.perks.instReviveUsed = true; createParticles(this.x, this.y, '#2ecc71', 50, 300); vfxList.push({ type: 'text', text: 'CẤP CỨU MẠNH!', x: this.x, y: this.y - 30, life: 1.5, color: '#2ecc71' }); return; }
        }
        if (!partner.isDowned && !tank.active) {
            let dist = Math.hypot(this.x - partner.x, this.y - partner.y);
            if (dist < 60) {
                let speedMod = partner.tags['TRỢ GIÚP'] >= 1 ? 1.3 : 1.0; this.reviveProgress += dt * speedMod;
                if (this.reviveProgress >= reqTime) { this.isDowned = false; this.hp = this.maxHp * 0.3; this.reviveCount++; this.reviveProgress = 0; if (partner.tags['TRỢ GIÚP'] >= 2) this.tempShield = 3; createParticles(this.x, this.y, '#2ecc71', 30, 200); }
            } else { this.reviveProgress = Math.max(0, this.reviveProgress - dt * 0.8); }
        } else { this.reviveProgress = Math.max(0, this.reviveProgress - dt * 0.8); }
    }

    shootCharge(time) {
        if (!this.weapon) return;
        if (empStorm.active) {
            vfxList.push({ type: 'text', text: 'BỊ NHIỄU ĐIỆN TỪ!', x: this.x, y: this.y - 35, life: 0.4, color: '#48dbfb' });
            return;
        }
        let now = Date.now();
        if (now - this.lastFireTime < this.weapon.fireRate * getPlayerFireRateMult(this)) return;

        // Không dùng chuột thì tự khóa mục tiêu gần nhất trong tầm
        let target = playerUsesPointer(this) ? null : getNearestZombie(this.x, this.y, 800, true);
        let angle = Math.atan2(this.facingY, this.facingX);
        if (target) angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.facingX = Math.cos(angle);
        this.facingY = Math.sin(angle);

        let chargePct = Math.min(1, time / 1.5);
        let isMax = chargePct >= 0.95;
        let isBow = this.weapon.name === 'Cung';

        // Mỗi phát bắn dùng BẢN SAO chỉ số -> không cộng dồn vĩnh viễn vào vũ khí đang cầm
        let shot = { ...this.weapon };
        shot.dmg = this.weapon.dmg * (0.6 + 1.4 * chargePct);              // Tụ càng lâu càng mạnh (x0.6 -> x2.0)
        if (isBow && this.perks.v_cungMaster) shot.dmg *= 1.4;              // Đại Sư Khúc Xạ: +40% sát thương cung

        if (isMax) {
            shot.pierce = 99;
            shot.wallPiercing = true;
            shot.critCh = 1.0;

            if (isBow && this.perks.v_muaTen) {
                let dist = Math.min(this.weapon.range, 480);
                let targetX = target ? target.x : this.x + this.facingX * dist;
                let targetY = target ? target.y : this.y + this.facingY * dist;

                let arrowRadius = 130;
                let arrowDmg = shot.dmg;      // sát thương mỗi giây của vùng bão tên
                let arrowLife = 2.0;

                // Trận Địa Tên Nổ: +50% phạm vi & sát thương, kích nổ liên hoàn (không gây hại cho phe ta)
                if (this.perks.v_tenNo) {
                    arrowRadius *= 1.5;
                    arrowDmg *= 1.5;
                    hazards.push({ type: 'slam', x: targetX, y: targetY, radius: arrowRadius, timer: 0.3, life: 0.5, dmg: shot.dmg * 1.5, friendly: true, source: this });
                    hazards.push({ type: 'slam', x: targetX + 40, y: targetY - 40, radius: arrowRadius * 0.8, timer: 0.6, life: 0.8, dmg: shot.dmg, friendly: true, source: this });
                }

                fireZones.push({ kind: 'arrow', x: targetX, y: targetY, life: arrowLife, dmg: arrowDmg, source: this, radius: arrowRadius });
                vfxList.push({ type: 'text', text: this.perks.v_tenNo ? 'TRẬN ĐỊA TÊN NỔ!' : 'MƯA TÊN CỔ ĐẠI!', x: targetX, y: targetY - 40, life: 1.5, color: '#e056fd' });
            }

            if (this.weapon.isElectric) {
                shot.isExplosiveProj = true;
                shot.dmg *= 1.4;
            }
            vfxList.push({ type: 'text', text: 'MAX POWER!', x: this.x, y: this.y - 50, life: 1.0, color: '#8e44ad' });
            spawnRing(this.x, this.y, '#9b59b6', 80, 0.3);
            addScreenShake(8);
        } else {
            shot.pierce = Math.max(this.weapon.pierce || 0, Math.floor(chargePct * 3));
        }
        applyRangedPerks(this, shot);

        bullets.push(new Bullet(this.x, this.y, angle, shot, this));
        vfxList.push({ type: 'muzzle', x: this.x + this.facingX * gunMuzzleDist(this.weapon, this.radius), y: this.y + this.facingY * gunMuzzleDist(this.weapon, this.radius), life: 0.1, angle: angle, color: this.weapon.isElectric ? '72,219,251' : '200,150,255' });
        Sound.play(this.weapon.isElectric ? 'plasma' : 'bow');
        this.lastFireTime = now;
        this.weapon.ammo--;
        if (this.weapon.ammo <= 0) this.throwWeapon();
    }

    shoot() {
        if (!this.weapon) return;
        if (empStorm.active && this.weapon.type !== 'melee') {
            if (!(this.empTextCD > Date.now())) { this.empTextCD = Date.now() + 500; vfxList.push({ type: 'text', text: 'BỊ NHIỄU ĐIỆN TỪ!', x: this.x, y: this.y - 35, life: 0.5, color: '#48dbfb' }); }
            return;
        }
        let now = Date.now();
        let actualFireRate = this.weapon.fireRate;
        if (this.perks.p_lucLienHoan && this.weapon.name === 'Lục') {
            actualFireRate /= 2; // Giảm một nửa thời gian chờ -> Bắn nhanh gấp đôi
        }
        if (now - this.lastFireTime < actualFireRate * getPlayerFireRateMult(this)) return;
        let tapGap = now - (this.lastTriggerTap || 0);
        this.lastTriggerTap = now;
        if (this.weapon.type === 'gun' || this.weapon.type === 'charge') {
            let heatGain = tapGap < this.weapon.fireRate * 0.85 ? 0.18 : 0.10;
            this.heat = Math.min(1.5, (this.heat || 0) + heatGain);
        }

        let visionRange = 225;
        let canSeeThroughWalls = false;
        let visionLevel = this.tags['TẦM NHÌN'] || 0;
        if (visionLevel >= 1) visionRange = 450;
        if (visionLevel >= 3) { visionRange = 600; canSeeThroughWalls = true; }
        if (this.perks.v_gunner && this.weapon.type === 'gun') visionRange += 100;
        if (this.perks.v_sniper && (this.weapon.name === 'Cung' || this.weapon.name === 'Ngắm')) visionRange += 250;
        if (this.perks.v_spotlight && heliSupport.active) visionRange += 100;
        if (this.perks.p_aim && this.weapon.name === 'Ngắm') visionRange *= 2; // Ngắm Bắn: tầm ngắm x2

        // NHẮM BẮN (v_snipeFocus)
        if (this.perks.v_snipeFocus && this.weapon.name === 'Ngắm') {
            visionRange += 400; canSeeThroughWalls = true;
        }

        // TỰ ĐỘNG KHÓA MỤC TIÊU CHO MOBILE SINGLEPLAYER THEO TẦM NHÌN
        let target = null;
        if (!playerUsesPointer(this)) {
            // Tầm tự khóa mục tiêu = Tầm Nhìn (không vượt quá tầm vũ khí; cận chiến tối đa 260)
            let closeAimRange = this.weapon.type === 'melee' ? Math.min(visionRange, 260) : Math.min(visionRange, this.weapon.range || visionRange);
            target = getNearestZombie(this.x, this.y, closeAimRange, !canSeeThroughWalls);
        }
        let angle = Math.atan2(this.facingY, this.facingX);
        if (this.weapon && (this.weapon.type === 'gun' || this.weapon.type === 'charge')) {
            let spreadHeat = Math.max(0, (this.heat || 0) - 0.35);
            angle += (Math.random() - 0.5) * spreadHeat * 0.45;
        }
        if (target) angle = Math.atan2(target.y - this.y, target.x - this.x);
        this.facingX = Math.cos(angle); this.facingY = Math.sin(angle);

        let wepClone = { ...this.weapon }; // Copy để biến đổi không dính lỗi

        // Xuyên Phá / Bức phá Xạ Thủ / Ống ngắm x8 ...
        let xaThu = this.tags['XẠ THỦ'] || 0;
        applyRangedPerks(this, wepClone);

        if (this.weapon.type === 'melee') {
            let wep = wepClone;
            if (this.perks.meleeTech) { wep.dmg *= 1.3; wep.range *= 1.3; }
            let kLvl = this.tags['KIẾM SƯ'] || 0;
            let isKatana = (wep.name === 'Kiếm' || wep.name === 'Katana Huyền Thoại');

            // THIÊU ĐỐT
            if (isKatana && (this.perks.m_thieu || wep.name === 'Katana Huyền Thoại')) {
                wep.isFire = true;
            }
            // CHÉM VÒNG TRÒN (PHÁ)
            if (isKatana && this.perks.m_pha && Math.random() < 0.10) {
                wep.spread = Math.PI * 2;
            }
            // NHÁT CẮT THẾ GIỚI
            if (wep.name === 'Katana Huyền Thoại' && Math.random() < 0.10) {
                wep.spread = Math.PI * 2;
                wep.range *= 3.0; // Phạm vi khổng lồ
                addScreenShake(20);
                vfxList.push({ type: 'text', text: 'NHÁT CẮT THẾ GIỚI!', x: this.x, y: this.y - 60, life: 1.5, color: '#ff9f43' });
            }

            // SÓNG KIẾM (Mốc 8 và 10)
            if (kLvl >= 8 && this.swordWaveTimer <= 0 && isKatana) {
                let numWaves = kLvl >= 10 ? 5 : 3;
                this.swordWaveTimer = kLvl >= 10 ? 3.0 : 5.0;
                for (let i = 0; i < numWaves; i++) {
                    let angOffset = (i - Math.floor(numWaves / 2)) * 0.25;
                    bullets.push(new Bullet(this.x, this.y, angle + angOffset, { range: 1200, dmg: wep.dmg * 2, isSwordWave: true, pierce: 99 }, this));
                }
                addScreenShake(15);
            }

            let isThrust = wep.isThrust || false;
            if (wep.name === 'Kiếm' && this.tags['KIẾM SƯ'] >= 2) {
                isThrust = Math.random() > 0.5;
                bullets.push(new Bullet(this.x, this.y, angle, { range: 450, dmg: wep.dmg * 0.8, isSwordWave: true, pierce: 3 }, this));
            }
            if (wep.name === 'Kiếm' && this.tags['KIẾM SƯ'] >= 5) {
                bullets.push(new Bullet(this.x, this.y, angle + (Math.random() - 0.5) * 0.3, { range: 500, dmg: wep.dmg * 1.2, isFire: true, pierce: 1 }, this));
            }
            if (wep.isLegendary || wep.name === 'Laser') spawnRing(this.x, this.y, wep.color, wep.range, 0.2, 3);

            if (isThrust) { wep.range *= 1.5; wep.spread = 0.4; let lunge = wep.name === 'Giáo' ? 10 : (wep.name === 'Dao Quân Sự' ? 12 : 25); this.x += this.facingX * lunge; this.y += this.facingY * lunge; }
            else { this.x += this.facingX * 10; this.y += this.facingY * 10; }

            slashes.push(new Slash(this.x, this.y, angle, wep, this));
            Sound.play(wep.name === 'Laser' || wep.isElectric ? 'saber' : (wep.name === 'Rìu' || wep.name === 'Búa') ? 'slash_heavy' : isThrust ? 'stab' : 'slash');
            if (wep.name === 'Búa') addScreenShake(5); if (wep.name === 'Laser') addScreenShake(2);
        } else {
            let mz = gunMuzzleDist(this.weapon, this.radius); // chớp lửa nằm đúng đầu nòng của từng loại súng
            vfxList.push({ type: 'muzzle', x: this.x + this.facingX * mz, y: this.y + this.facingY * mz, life: 0.1, angle: angle, k: this.weapon.key });
            if (this.weapon.name === 'Súng Săn') { for (let i = 0; i < this.weapon.bullets; i++) bullets.push(new Bullet(this.x, this.y, angle - this.weapon.spread / 2 + Math.random() * this.weapon.spread, wepClone, this)); Sound.play('shotgun'); addScreenShake(4); }
            else if (this.weapon.isFlamethrower || this.weapon.isAcidSprayer) {
                let boosted = this.perks.a_apSuatCao ? 1.18 : 1;
                let spread = this.weapon.isAcidSprayer ? 0.42 : 0.48;
                for (let i = 0; i < 3; i++) {
                    bullets.push(new Bullet(this.x, this.y, angle + (Math.random() - 0.5) * spread, {
                        ...wepClone,
                        range: wepClone.range * boosted,
                        isFire: !!this.weapon.isFlamethrower,
                        isAcid: !!this.weapon.isAcidSprayer
                    }, this));
                }
                if (!this.weapon.isFlamethrower) Sound.play('shoot'); // súng phun lửa dùng tiếng lặp riêng
            }
            else if (this.perks.v_miniRain && this.weapon.name === 'Minigun') {
                // MINIGUN MƯA ĐẠN
                for (let i = 0; i < 4; i++) {
                    bullets.push(new Bullet(this.x, this.y, angle + (Math.random() - 0.5) * 0.8, wepClone, this));
                }
                addScreenShake(3);
            }
            else {
                bullets.push(new Bullet(this.x, this.y, angle, wepClone, this));
                // Sniper có tiếng nổ riêng; Minigun dùng tiếng lặp; súng điện bắn chậm dùng tiếng plasma
                let wk = this.weapon.key;
                if (wk === 'SNIPER') Sound.play('sniper');
                else if (wk === 'MINIGUN') { /* loop */ }
                else if (wk === 'AR') Sound.play('ar');
                else if (wk === 'SMG') Sound.play('smg');
                else if (wk === 'PISTOL_ELECTRO') Sound.play('laser');
                else if (wk === 'PLASMA_RAPID' || wk === 'ELECTRON_FLUX') Sound.play('auto'); // súng xả nhanh: tiếng lặp
                else if (this.weapon.isElectric && this.weapon.fireRate >= 300) Sound.play('plasma');
                else Sound.play('shoot');
                if (this.weapon.name === 'Ngắm') addScreenShake(8);
            }

            // HỒI ĐẠN XẠ THỦ MỐC 4, 5, 6
            if (xaThu >= 4) {
                let chance = xaThu >= 6 ? 0.35 : (xaThu >= 5 ? 0.2 : 0.1);
                let regenPct = xaThu >= 6 ? 0.1 : (xaThu >= 5 ? 0.08 : 0.05);
                if (Math.random() < chance) {
                    this.weapon.ammo = Math.min(this.weapon.maxAmmo, this.weapon.ammo + Math.ceil(this.weapon.maxAmmo * regenPct) + 1); // +1 để bù viên vừa bắn
                    vfxList.push({ type: 'text', text: '+Đạn (Xạ Thủ)', x: this.x, y: this.y - 40, life: 0.5, color: '#dcdde1' });
                }
            }
        }
        this.lastFireTime = now; this.weapon.ammo--; if (this.weapon.ammo <= 0) this.throwWeapon();
    }
    throwWeapon() {
        if (!this.weapon) return;
        let throwDx = this.facingX, throwDy = this.facingY; let target = playerUsesPointer(this) ? null : getNearestZombie(this.x, this.y, 400); if (target) { let ang = Math.atan2(target.y - this.y, target.x - this.x); throwDx = Math.cos(ang); throwDy = Math.sin(ang); }
        Sound.play('throw');
        let asGrenade = this.pullingPin;
        thrownItems.push(new ThrownItem(this.x, this.y, throwDx, throwDy, this.weapon, asGrenade, this.pinTime, this));
        // Ném Chùm: thêm 2 bản sao bay hình quạt (50% sát thương)
        if (this.perks.n_multi && !asGrenade) {
            let base = Math.atan2(throwDy, throwDx);
            for (let s = -1; s <= 1; s += 2) thrownItems.push(new ThrownItem(this.x, this.y, Math.cos(base + s * 0.3), Math.sin(base + s * 0.3), { ...this.weapon }, false, 0, this, { ghost: true }));
        }
        this.weapon = null; this.pullingPin = false;
    }
    throwGrenade() {
        let throwDx = this.facingX, throwDy = this.facingY; let target = playerUsesPointer(this) ? null : getNearestZombie(this.x, this.y, 400); if (target) { let ang = Math.atan2(target.y - this.y, target.x - this.x); throwDx = Math.cos(ang); throwDy = Math.sin(ang); }
        Sound.play('throw');
        thrownItems.push(new ThrownItem(this.x, this.y, throwDx, throwDy, { ...this.weapon }, true, this.pinTime, this));
        this.pullingPin = false;
        this.weapon.ammo--;
        if (this.weapon.ammo <= 0) this.weapon = null;
    }
}

// Cộng dồn các thẻ/Link tầm xa lên bản sao chỉ số của MỘT phát bắn
function applyRangedPerks(p, w) {
    if (w.type !== 'gun' && w.type !== 'charge') return;
    let xaThu = p.tags['XẠ THỦ'] || 0;
    if (p.perks.v_xuyenPha) w.pierce = (w.pierce || 0) + 1;                       // Xuyên Phá Gia Cường
    if (xaThu >= 5) { w.range += 250; w.pierce = (w.pierce || 0) + 2; }           // Bức phá Xạ Thủ
    if (p.perks.v_highVel && w.type === 'gun') w.range += 300;
    if (p.perks.p_x8 && isSniper(w)) w.range *= 2;                                // Ống ngắm x8
}

// Gọi sau mỗi lần trừ máu quái: xử lý hồi sinh (type 11) và ghi nhận hạ gục ĐÚNG 1 LẦN.
// Trả về true nếu quái vừa bị hạ gục thật sự trong lần gọi này.
function zombieDown(z, source = null) {
    if (z && z.type >= 45) antDamageFilter(z); // Kiến Chúa / Xúc Tu: lọc sát thương trước khi xét hạ gục
    if (!z || z.hp > 0) return false;
    if (z.type === 11 && !z.hasRevived) {
        z.hasRevived = true; z.hp = z.maxHp * 0.5;
        createParticles(z.x, z.y, '#2ecc71', 20, 100);
        vfxList.push({ type: 'text', text: 'HỒI SINH!', x: z.x, y: z.y - 30, life: 1.0, color: '#2ecc71' });
        return false;
    }
    if (z._credited) return false;
    z._credited = true;
    playKillSound(z.x, z.y, z.type >= 40 && z.type <= 46 ? 1 : 0); // âm lượng giảm dần theo khoảng cách; kiến có tiếng riêng
    let src = (source && typeof source.onKill === 'function') ? source : (z.lastHitBy || players.find(p => !p.isDowned) || players[0]);
    if (src && typeof src.onKill === 'function') src.onKill(z.type);
    return true;
}

function calcDamage(baseDmg, wepData, x, y, playerSource, targetZombie = null) {
    lastHitInfo.crit = false; lastHitInfo.headshot = false;
    let hasMult = playerSource && typeof playerSource.getTotalDamageMult === 'function';
    let finalDmg = baseDmg * (hasMult ? playerSource.getTotalDamageMult() : 1);
    let tags = playerSource ? playerSource.tags : null;
    let perks = playerSource ? playerSource.perks : null;

    // Buff CẬN CHIẾN (mốc 2/3/4/5)
    if (wepData && wepData.type === 'melee' && tags) {
        let meleeLvl = tags['CẬN CHIẾN'] || 0;
        if (meleeLvl >= 5) finalDmg *= 2.0;        // +100% (Bức phá)
        else if (meleeLvl >= 4) finalDmg *= 1.5;   // +50%
        else if (meleeLvl >= 3) finalDmg *= 1.25;  // +25%
        else if (meleeLvl >= 2) finalDmg *= 1.1;   // +10%
        if (perks && perks.p_sharp) finalDmg *= 1.2; // Sắc Bén
    }

    // Buff TIẾN CÔNG
    if (tags && tags['TIẾN CÔNG'] >= 4 && Math.random() < 0.15) {
        finalDmg *= 2.0;
        vfxList.push({ type: 'text', text: 'X2 CHUẨN!', x: x, y: y - 35, life: 0.8, color: '#e74c3c' });
    }

    // Giáp của Zombie loại 4 (Tanker)
    if (targetZombie && targetZombie.type === 4 && (!wepData || !wepData.armorPiercing)) {
        finalDmg *= 0.3;
    }

    // --- HEADSHOT & CHÍ MẠNG ---
    if (tags && perks && wepData) {
        let isRealWeapon = !!wepData.type;
        let stats = isRealWeapon ? getPlayerCritStats(playerSource, wepData) : { chance: wepData.critCh || 0, mult: 2.0 };
        let hsChance = isRealWeapon ? getPlayerHeadshotChance(playerSource, wepData) : 0;

        if (hsChance > 0 && Math.random() < hsChance) {
            lastHitInfo.headshot = true;
            finalDmg *= isSniper(wepData) ? 4.0 : 3.0;
            // Ổn Định: Súng lục x2 Sát thương Headshot
            if (wepData.name === 'Lục' && perks.p_lucOnDinh) finalDmg *= 2.0;
            vfxList.push({ type: 'text', text: 'HEADSHOT!', x: x + (Math.random() - 0.5) * 20, y: y - 40, life: 0.9, color: '#ff3f34' });
        }
        else if (stats.chance > 0 && Math.random() < stats.chance) {
            lastHitInfo.crit = true;
            finalDmg *= stats.mult;
            if (targetZombie) {
                // LÍNH CỨU HỎA: Đột tử khi dính bạo kích
                if (targetZombie.type === 13) finalDmg = Math.max(finalDmg, targetZombie.maxHp * 2);
                // Link Chuẩn Xác 4: chí mạng gây Thiêu Đốt
                if (tags['CHUẨN XÁC'] >= 4) applyStatus(targetZombie, STATUS.BURN, { duration: 3.0, dpsPercent: 0.018, source: playerSource });
            }
        }
        if (targetZombie) {
            if (lastHitInfo.headshot) targetZombie._crit = 2;
            else if (lastHitInfo.crit) targetZombie._crit = Math.max(targetZombie._crit || 0, 1);
        }
    }

    if (targetZombie && playerSource instanceof Player) targetZombie.lastHitBy = playerSource;
    return finalDmg;
}

class Bullet {
    constructor(x, y, angle, wepData, sourcePlayer) {
        this.x = x; this.y = y; this.startX = x; this.startY = y; this.wepData = wepData; this.source = sourcePlayer;
        let speed = 1500;
        if (wepData.isTankShell) speed = 1000;
        else if (wepData.isExplosiveProj) speed = 800;
        else if (wepData.isSwordWave) speed = 900;
        else if (wepData.type === 'charge') speed = 2500;
        else if (wepData.isFire || wepData.isAcid) {
            let boosted = sourcePlayer && sourcePlayer.perks && sourcePlayer.perks.a_apSuatCao;
            speed = (wepData.isAcid ? 520 : 560) + Math.random() * (boosted ? 280 : 220);
        }

        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
        this.range = wepData.range; this.dmg = wepData.dmg; this.armorPiercing = wepData.armorPiercing;
        this.isTankShell = wepData.isTankShell; this.isExplosiveProj = wepData.isExplosiveProj; this.isSwordWave = wepData.isSwordWave; this.isHeli = wepData.isHeli; this.isBomb = wepData.isBomb; this.isFire = wepData.isFire; this.isAcid = wepData.isAcid;
        this.pierce = wepData.pierce || 0; this.wallPiercing = wepData.wallPiercing || false; this.active = true; this.hitSet = new Set();
        this.angle = angle;

        this.maxLife = (wepData.isFire || wepData.isAcid) ? (0.78 + Math.random() * 0.35) : -1;
        this.lifeTime = this.maxLife;
    }
    update(dt) {
        this.px = this.x; this.py = this.y; // vị trí trước khi bay (để xét va chạm quét, đạn nhanh không xuyên qua quái)
        if (this.isFire || this.isAcid) {
            let drag = Math.pow(0.965, dt * 60);
            this.vx *= drag;
            this.vy *= drag;
            this.lifeTime -= dt;
            if (this.lifeTime <= 0) { this.active = false; return; }
            if (fireZones.length > 110) { /* đủ nhiều vùng lửa rồi */ }
            else if (this.wepData.isFlamethrower && Math.random() < dt * 2.4) {
                fireZones.push({ x: this.x + (Math.random() - 0.5) * 20, y: this.y + (Math.random() - 0.5) * 20, life: 1.5, dmg: this.dmg * 0.4, source: this.source, radius: 25 + Math.random() * 15 });
            }
            else if (this.wepData.isAcidSprayer && Math.random() < dt * 3) {
                fireZones.push({ kind: 'acid', x: this.x + (Math.random() - 0.5) * 24, y: this.y + (Math.random() - 0.5) * 24, life: 2.6, dmg: this.dmg * 0.15, source: this.source, radius: 22 + Math.random() * 18 });
            }
        }

        this.x += this.vx * dt; this.y += this.vy * dt;

        if (!this.isFire && Math.hypot(this.x - this.startX, this.y - this.startY) > this.range) { this.triggerHit(); return; }

        if (!this.wallPiercing && !this.isHeli && !this.isSwordWave && !this.isBomb) {
            for (let obs of obstacles) {
                if (this.x > obs.x && this.x < obs.x + obs.w && this.y > obs.y && this.y < obs.y + obs.h) {
                    if (obs.hp !== undefined) caveHitRubble(obs, this.dmg * (this.isFire || this.isAcid ? 0.2 : 1)); // đá chặn đường: bắn để phá
                    if (this.isFire) this.active = false;
                    else this.triggerHit();
                    return;
                }
            }
        }
        if (caveProps.length && !this.isHeli && !this.isBomb) caveBulletProps(this);
    }
    triggerHit() {
        if (this.isTankShell || this.isExplosiveProj || this.isBomb) {
            let expRadius = this.isTankShell || this.isBomb ? 250 : 150;
            let expDmg = this.dmg * ((this.source && this.source.getTotalDamageMult) ? this.source.getTotalDamageMult() : 1);

            // Nếu có nâng cấp Bom Lửa -> Nổ to hơn và gây cháy
            if (hasTeamPerk('t_bomLua') && this.isTankShell) {
                expRadius *= 1.4;
                fireZones.push({ x: this.x, y: this.y, life: 3.0, dmg: expDmg * 0.3, source: this.source, radius: expRadius * 0.6 });
            }

            // Thiết Xa Lôi Động kết hợp Bom Lửa để lại vùng điện cực rộng
            if (hasTeamPerk('e_thietXaLoiDong') && this.isTankShell) {
                hazards.push({ type: 'electric', x: this.x, y: this.y, radius: expRadius * 0.8, life: 4.0, dmg: 80, friendly: true, source: this.source });
            }

            explode(this.x, this.y, expRadius, expDmg, this.source, !!this.wepData.friendly);
            this.active = false;
            return;
        }
        else createParticles(this.x, this.y, this.isHeli ? '#f1c40f' : (this.isSwordWave ? '#00ffff' : (this.isFire ? '#e67e22' : (this.wepData.isElectric ? '#00d2d3' : (this.wepData.type === 'charge' ? '#8e44ad' : '#bdc3c7')))), 4, 150);
        this.active = false;
    }
    hitEnemy(z) {
        if (this.hitSet.has(z) || z.hp <= 0) return;
        this.hitSet.add(z);

        // Nếu là đạn nổ (tank, lựu đạn) thì kích nổ ngay lập tức
        if (this.isTankShell || this.isExplosiveProj || this.isBomb) {
            this.triggerHit();
            return;
        }

        let src = this.source;
        let isPlayerSrc = src instanceof Player;
        let wd = this.wepData || {};

        // 1. TÍNH TOÁN SÁT THƯƠNG (Crit, Headshot, Giáp Tanker đều tự tính trong calcDamage)
        lastHitInfo.crit = false; lastHitInfo.headshot = false;
        let actualDmg = this.isHeli ? this.dmg : calcDamage(this.dmg, wd, z.x, z.y, src, z);
        let wasCrit = lastHitInfo.crit, wasHeadshot = lastHitInfo.headshot;
        z.hp -= actualDmg;

        // Chỉ đạn do CHÍNH người chơi bắn mới đánh dấu mục tiêu cho lính
        if (isPlayerSrc && !wd.fromAlly && !wd.fromDrone) {
            lastFocusedTarget = z;
            if (src.perks.a_synchronized_fire) for (let a of allies) a.atkCD = Math.min(a.atkCD, 0.15);
        }
        if (z.type === 34) {
            let heavyHit = wd.id === 3 || wd.id === 8;
            if (heavyHit) {
                explode(z.x, z.y, 170, 150, src);
                z.hp = 0; zombieDown(z, src);
                return;
            }
        }

        // 2. HIỆU ỨNG TRẠNG THÁI
        if (wd.isFire) applyStatus(z, STATUS.BURN, { duration: 3.0, dpsPercent: 0.014, source: src });
        if (wd.isElectric) applyStatus(z, STATUS.ELECTRIC, { duration: 2.2, stacks: 1, dps: Math.max(4, this.dmg * 0.06), maxStacks: 8, source: src });
        if (wd.isAcid) applyStatus(z, STATUS.CORROSION, { duration: 3.0, stacks: 1, dpsPercent: 0.0045, maxStacks: 8, source: src });

        // 3. GIẬT SÉT LAN (chỉ vũ khí nhóm Điện)
        if (wd.isElectric) {
            let teamDien = getTeamTagLevel('ĐIỆN');
            let maxTargets = 2;
            if (wd.name === 'Lục Điện') maxTargets = 5;
            else if (wd.name === 'Plasma Rapid-Pulser') maxTargets = 2;
            else if (wd.name === 'Electron Flux') maxTargets = 6;
            else if (wd.name === 'Tesla Carbine') maxTargets = 12;
            else if (wd.name === 'Pháo Điện Năng') maxTargets = 3;

            maxTargets += getPerkStacks('e_chuoiSet') * 5;   // Chuỗi Sét: +5 mục tiêu mỗi cấp
            if (teamDien >= 4) maxTargets += 3;
            if (teamDien >= 5) maxTargets += 5;
            if (teamDien >= 15) maxTargets += 10;
            maxTargets = Math.min(40, maxTargets);

            // Cảm Ứng Điện Từ: 30% / 50% / 80% / 100% / 200% theo số lần lấy
            const CAM_UNG = [1.0, 1.3, 1.5, 1.8, 2.0, 3.0];
            let camUngMult = CAM_UNG[Math.min(5, getPerkStacks('e_camUng'))];

            let lastZ = z, chainCount = 0;
            let hitZombiesInChain = new Set([z]);
            while (chainCount < maxTargets) {
                let nextZ = null, closestDist = 250; // Phạm vi nhảy xích sét giữa các con quái
                for (let potentialZ of zombies) {
                    if (hitZombiesInChain.has(potentialZ) || potentialZ.hp <= 0 || potentialZ.hidden || potentialZ.flying || ELECTRIC_IMMUNE_ZOMBIES.has(potentialZ.type)) continue;
                    let dChain = Math.hypot(potentialZ.x - lastZ.x, potentialZ.y - lastZ.y);
                    if (dChain < closestDist) { closestDist = dChain; nextZ = potentialZ; }
                }
                if (!nextZ) break; // Hết quái trong tầm nhảy sét -> Gãy chuỗi

                hitZombiesInChain.add(nextZ);
                chainCount++;
                nextZ.hp -= (this.dmg * 0.6) * camUngMult;
                if (isPlayerSrc) nextZ.lastHitBy = src;

                // Hiệu Ứng Joule: Đốt cháy mục tiêu bị giật điện
                if (hasTeamPerk('e_joule')) applyStatus(nextZ, STATUS.BURN, { duration: 2.5, dpsPercent: 0.012, source: src });

                if (nextZ.hp <= 0) {
                    // Đoản Mạch Kép: quái chết bởi điện sẽ nổ & để lại vùng điện (không hại phe ta)
                    if (hasTeamPerk('e_doanMach') && !nextZ._credited) {
                        explode(nextZ.x, nextZ.y, 120, 100, src, true);
                        hazards.push({ type: 'electric', x: nextZ.x, y: nextZ.y, radius: 100, life: 1.5, dmg: 60, friendly: true, source: src });
                    }
                    zombieDown(nextZ, src);
                }
                vfxList.push({ type: 'laser_beam', x: lastZ.x, y: lastZ.y, tx: nextZ.x, ty: nextZ.y, life: 0.15, jag: true });
                lastZ = nextZ;
            }
        }

        // 4. HIỆU ỨNG VÀ LOGIC PHỤ
        if (!this.isFire) z.knockback(this.vx * 0.08, this.vy * 0.08);
        if (wd.isElectric) {
            z.stunTimer = Math.max(z.stunTimer || 0, 0.65);
            createParticles(z.x, z.y, '#00d2d3', 12, 180);
        }
        if (!this.isHeli && src && typeof src.onHitEnemy === 'function' && !wd.fromAlly && !wd.fromDrone) src.onHitEnemy();

        if (!this.isFire) createParticles(z.x, z.y, (z.type === 4 && !this.armorPiercing) ? '#95a5a6' : '#c0392b', 5, 250);
        else if (Math.random() < 0.2) createParticles(z.x, z.y, '#e67e22', 2, 100);

        // 5. KIỂM TRA ZOMBIE CHẾT (ghi nhận đúng 1 lần)
        if (z.hp <= 0 && zombieDown(z, this.isHeli ? null : src)) {
            if (tank.active && isPlayerSrc) globalTankKills++;
            if (wd.fromDrone && isPlayerSrc) src.droneKills = (src.droneKills || 0) + 1;
            if (wd.isCloneWave && Math.random() < 0.05) { // Lây lan
                bullets.push(new Bullet(z.x, z.y, this.angle - 0.6, wd, src));
                bullets.push(new Bullet(z.x, z.y, this.angle + 0.6, wd, src));
            }
        }

        // 6. XUYÊN THẤU & CÁC THẺ SNIPER
        let sniperShot = isSniper(wd);
        if (isPlayerSrc && sniperShot && src.perks.v_danNoSniper) {
            // Đạn Phá Kích: nổ AOE tại vị trí trúng đạn (không gây hại cho người bắn)
            explode(z.x, z.y, 140, this.dmg * 0.4, src, true);
        }
        if (isPlayerSrc && sniperShot && src.perks.v_xuyenThung && (wasCrit || wasHeadshot)) {
            this.pierce = 99; // Xuyên mục tiêu vô hạn
            this.wallPiercing = true;
        }
        if (isPlayerSrc && src.perks.p_pierceApple && wasHeadshot) {
            // Xuyên Táo: Headshot xuyên mục tiêu, Sniper xuyên vô hạn
            if (sniperShot) this.pierce = 99; else this.pierce = Math.max(this.pierce, 1) + 1;
        }

        if (this.pierce > 0) {
            this.pierce--;
            this.dmg *= (sniperShot ? 0.85 : 0.5); // Sniper giữ lực tốt hơn khi xuyên qua vật thể
        } else {
            this.active = false;
        }
    }
}

class Slash {
    constructor(x, y, angle, wepData, sourcePlayer) {
        this.x = x; this.y = y; this.angle = angle; this.wepData = wepData; this.source = sourcePlayer;
        this.range = wepData.range; this.spread = wepData.spread; this.dmg = wepData.dmg; this.kbForce = wepData.kb;
        this.isSaber = (wepData.name === 'Laser'); this.isFire = !!wepData.isFire;
        this.life = 0.15; this.active = true; this.hitTargets = new Set();
        // VFX quét: lưỡi chém quét qua cung đánh rồi để lại vệt trăng khuyết mờ dần (đồng bộ sang máy khách qua vfxList)
        let sweepCol = this.isSaber ? '0,255,255' : (this.isFire ? '255,159,67' : (wepData.isElectric ? '72,219,251' : (wepData.isLegendary ? '255,200,90' : '236,240,241')));
        // Mỗi vũ khí một kiểu chém riêng (vẽ ở drawSweep)
        let nm = wepData.name, st = nm === 'Rìu' ? 'axe' : nm === 'Búa' ? 'hammer' : nm === 'Laser' ? 'saber' : wepData.isLegendary ? 'legend' : wepData.isElectric ? 'whip' : 'katana';
        if ((this.spread || 1) <= 0.45 || nm === 'Giáo') st = 'spear';
        if (st === 'axe') sweepCol = '255,140,110'; else if (st === 'hammer') sweepCol = '214,196,170';
        let swLife = st === 'hammer' ? 0.45 : (st === 'axe' ? 0.38 : (st === 'knife' || st === 'spear' ? 0.22 : 0.3));
        vfxList.push({ type: 'sweep', st, pi: sourcePlayer && sourcePlayer.id ? sourcePlayer.id - 1 : undefined, thin: nm === 'Dao Quân Sự' ? 1 : 0, x, y, angle, r: this.range, spread: Math.min(Math.PI * 2, this.spread || 1), dir: Math.random() < 0.5 ? 1 : -1, col: sweepCol, life: swLife, max: swLife });
        if (NET.mode === 'host') NET.ev.push(['sl', sourcePlayer && sourcePlayer.id === 2 ? 2 : 1, +angle.toFixed(2), Math.round(this.range), +(+this.spread).toFixed(2), this.isSaber ? 1 : 0, this.isFire ? 1 : 0]);
    }
    update(dt, pX, pY) {
        this.x = pX; this.y = pY; this.life -= dt; if (this.life <= 0) this.active = false;
        if (this.source.perks.swordArt) { for (let b of enemyBullets) { if (b.active && Math.hypot(b.x - this.x, b.y - this.y) < this.range) { let angZ = Math.atan2(b.y - this.y, b.x - this.x); let diff = Math.atan2(Math.sin(angZ - this.angle), Math.cos(angZ - this.angle)); if (Math.abs(diff) <= this.spread / 2) { b.active = false; createParticles(b.x, b.y, '#ecf0f1', 5, 100); } } } }
        if (isCaveMap()) caveSlashProps(this);
        for (let z of zombies) {
            if (z.hp <= 0 || z.flying || z.airborne || this.hitTargets.has(z)) continue; // đang bay: miễn nhiễm cận chiến
            if (Math.hypot(z.x - this.x, z.y - this.y) >= this.range + z.radius) continue;
            let angZ = Math.atan2(z.y - this.y, z.x - this.x);
            let diff = Math.atan2(Math.sin(angZ - this.angle), Math.cos(angZ - this.angle));
            if (Math.abs(diff) > this.spread / 2) continue;

            let finalDmg = calcDamage(this.dmg, this.wepData, z.x, z.y, this.source, z);
            z.hp -= finalDmg;
            z.knockback(Math.cos(this.angle) * this.kbForce, Math.sin(this.angle) * this.kbForce);
            if (typeof this.source.onHitEnemy === 'function') this.source.onHitEnemy();
            this.hitTargets.add(z);
            createParticles(z.x, z.y, this.isSaber ? '#00ffff' : '#e74c3c', 12, 300);
            // Kiếm Hỏa: đòn chém gây Thiêu Đốt
            if (this.isFire) applyStatus(z, STATUS.BURN, { duration: 3.0, dpsPercent: 0.016, source: this.source });

            if (z.hp <= 0 && zombieDown(z, this.source)) {
                // TUYỆT DIỆT: TẠO PHÂN ẢNH CHỮ V
                let isKatana = (this.wepData.name === 'Kiếm' || this.wepData.name === 'Katana Huyền Thoại');
                if (isKatana && this.source.perks.m_diet && Math.random() < 0.05) {
                    bullets.push(new Bullet(z.x, z.y, this.angle - 0.6, { range: 600, dmg: this.wepData.dmg, isSwordWave: true, pierce: 99, isCloneWave: true }, this.source));
                    bullets.push(new Bullet(z.x, z.y, this.angle + 0.6, { range: 600, dmg: this.wepData.dmg, isSwordWave: true, pierce: 99, isCloneWave: true }, this.source));
                    vfxList.push({ type: 'text', text: 'DIỆT!', x: z.x, y: z.y - 30, life: 1.0, color: '#e056fd' });
                }
            }
        }
    }
    draw(ctx) {
        let a = Math.max(0, Math.min(1, this.life / 0.15));
        let col = this.isSaber ? '0,255,255' : (this.isFire ? '255,159,67' : '236,240,241');
        let half = Math.min(Math.PI, this.spread / 2);
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        // Chỉ tô nhẹ vùng trúng đòn; phần lưỡi quét do VFX 'sweep' vẽ
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, this.range, -half, half); ctx.closePath();
        ctx.fillStyle = `rgba(${col},${0.10 * a})`; ctx.fill();
        ctx.restore();
    }
}

class ThrownItem {
    constructor(x, y, dx, dy, wepData, isGrenade, expTime, sourcePlayer, opts = {}) {
        let len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
        let perks = (sourcePlayer && sourcePlayer.perks) || {}, tags = (sourcePlayer && sourcePlayer.tags) || {};
        let nemLvl = tags['NÉM'] || 0;
        this.isGrenade = isGrenade; this.isMelee = !!wepData && wepData.type === 'melee';
        this.ghost = !!opts.ghost; // bản sao của thẻ Ném Chùm
        // Lực ném ban đầu (Tay Ném Thép +30%); lựu đạn giữ quỹ đạo lăn cũ
        this.speed = isGrenade ? 800 : (this.isMelee ? 1250 : 1100) * (perks.n_power ? 1.3 : 1);
        this.v0 = this.speed;
        this.dirX = dx; this.dirY = dy;
        this.x = x + dx * 18; this.y = y + dy * 18; this.px = x; this.py = y;
        this.vx = dx * this.speed; this.vy = dy * this.speed;
        this.wepData = wepData; this.expTime = expTime; this.source = sourcePlayer;
        this.radius = 12; this.rotation = Math.atan2(dy, dx); this.active = true; this.age = 0;
        this.spin = (isGrenade ? 15 : (this.isMelee ? 26 : 18)) * (Math.random() < 0.5 ? 1 : -1);
        this.friction = 1050;           // ma sát mặt đất (px/s²): vật ném chậm dần đều rồi dừng hẳn
        this.state = 'fly'; this.rest = 0; this.alpha = 1;
        this.hitSet = new Set();
        this.pierceLeft = (!isGrenade && perks.n_pierce) ? 2 : 0;
        this.boomerang = !isGrenade && !this.ghost && this.isMelee && !!perks.n_boomerang;
        this.explosive = !isGrenade && !!perks.n_explode;
        this.stunBonus = nemLvl >= 4 ? 0.35 : 0;
        this.dmgMult = (perks.n_power ? 1.6 : 1) * (nemLvl >= 4 ? 1.6 : (nemLvl >= 2 ? 1.25 : 1)) * (this.ghost ? 0.5 : 1);
    }

    hitZombie(z, scale = 1) {
        let src = this.source, tags = (src && src.tags) || {};
        let col = (this.wepData && this.wepData.color) || '#bdc3c7';
        // Vũ khí cận chiến ném đau hơn hẳn: tính theo sát thương của chính vũ khí đó
        let base = this.isMelee ? Math.max(160, (this.wepData.dmg || 100) * 1.6) : 60;
        if (this.isMelee && tags['CẬN CHIẾN'] >= 3) base *= 1.5;
        if (z.type === 4 && !(this.wepData && this.wepData.armorPiercing)) base *= this.isMelee ? 0.6 : 0.3;
        let dmg = base * this.dmgMult * scale * (src && src.getTotalDamageMult ? src.getTotalDamageMult() : 1);
        z.hp -= dmg; z._crit = Math.max(z._crit || 0, this.isMelee ? 1 : 0);
        if (src instanceof Player) z.lastHitBy = src;
        // Đẩy lùi nhẹ theo hướng bay + khựng lại một nhịp
        let kb = this.isMelee ? 340 : 240;
        z.knockback(this.dirX * kb, this.dirY * kb);
        if (z.type < 30) z.stunTimer = Math.max(z.stunTimer || 0, (this.isMelee ? 0.25 : 0.12) + this.stunBonus);
        createParticles(z.x, z.y, '#e74c3c', 10, 240); createParticles(z.x, z.y, col, 6, 180);
        spawnRing(z.x, z.y, col, this.isMelee ? 60 : 42, 0.22, 3);
        addScreenShake(this.isMelee ? 5 : 3);
        Sound.play('hit');
        zombieDown(z, src);
    }

    update(dt) {
        this.age += dt;
        this.px = this.x; this.py = this.y;

        if (this.isGrenade) {
            this.x += this.vx * dt; this.y += this.vy * dt; this.rotation += this.spin * dt;
            let drag = Math.pow(0.025, dt); this.vx *= drag; this.vy *= drag;
            if (Date.now() >= this.expTime) { explode(this.x, this.y, 250, 250, this.source); this.active = false; }
            return;
        }
        let col = (this.wepData && this.wepData.color) || '#bdc3c7';

        // --- Nằm yên trên đất rồi mờ dần ---
        if (this.state === 'rest') {
            this.vx = this.vy = 0;
            this.rest -= dt; this.alpha = Math.max(0, Math.min(1, this.rest / 0.4));
            if (this.rest <= 0) this.active = false;
            return;
        }

        // --- Boomerang bay về tay chủ ---
        if (this.state === 'return') {
            let s = this.source;
            if (!s || s.isDowned || this.age > 5) { createParticles(this.x, this.y, col, 6, 140); this.active = false; return; }
            let ax = s.x - this.x, ay = s.y - this.y, d = Math.hypot(ax, ay) || 1;
            this.dirX = ax / d; this.dirY = ay / d;
            this.speed = Math.min(1250, this.speed + 2600 * dt);
            this.vx = this.dirX * this.speed; this.vy = this.dirY * this.speed;
            this.x += this.vx * dt; this.y += this.vy * dt; this.rotation += this.spin * 1.3 * dt;
            for (let z of zombies) {
                if (z.hp <= 0 || z.hidden || z.flying || this.hitSet.has(z)) continue;
                if (distancePointToSegment(z.x, z.y, this.px, this.py, this.x, this.y) > this.radius + z.radius) continue;
                this.hitSet.add(z); this.hitZombie(z, 0.6);
            }
            if (d < 30) {
                // Về tới tay: nhận lại vũ khí (tốn 3 độ bền) nếu đang tay không
                if (!s.weapon && this.wepData && this.wepData.ammo > 3) { this.wepData.ammo -= 3; s.weapon = this.wepData; Sound.play('pickup'); }
                this.active = false;
            }
            return;
        }

        // --- Đang bay: chậm dần đều do ma sát ---
        this.speed = Math.max(0, this.speed - this.friction * dt);
        this.vx = this.dirX * this.speed; this.vy = this.dirY * this.speed;
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.rotation += this.spin * (0.15 + 0.85 * this.speed / this.v0) * dt; // quay chậm dần theo tốc độ

        const endFlight = () => {
            if (this.boomerang) { this.state = 'return'; this.hitSet = new Set(); this.speed = 200; }
            else { this.state = 'rest'; this.rest = 0.7; this.speed = 0; this.vx = this.vy = 0; }
        };

        // Trúng vật cản / ra khỏi bản đồ
        let hitWall = this.x < 0 || this.y < 0 || this.x > MAP_SIZE.w || this.y > MAP_SIZE.h;
        if (!hitWall) for (let obs of obstacles) { if (this.x > obs.x && this.x < obs.x + obs.w && this.y > obs.y && this.y < obs.y + obs.h) { hitWall = true; break; } }
        if (hitWall) {
            createParticles(this.x, this.y, col, 6, 140);
            this.x = this.px; this.y = this.py;
            if (this.boomerang) endFlight(); else this.active = false;
            return;
        }
        if (this.speed <= 0) { endFlight(); return; }
        if (this.speed < 180) return; // quá chậm: chỉ trượt nốt, không còn gây sát thương

        // Va chạm kiểu quét theo quãng đường vừa bay -> không bay xuyên qua quái
        for (let z of zombies) {
            if (z.hp <= 0 || z.hidden || z.flying || this.hitSet.has(z)) continue;
            if (distancePointToSegment(z.x, z.y, this.px, this.py, this.x, this.y) > this.radius + z.radius) continue;
            this.hitSet.add(z);
            this.hitZombie(z);
            // Ném Nổ: phát nổ ở lần chạm đầu tiên
            if (this.explosive) {
                this.explosive = false;
                let boom = (this.isMelee ? 220 : 140) * this.dmgMult * (this.source && this.source.getTotalDamageMult ? this.source.getTotalDamageMult() : 1);
                explode(this.x, this.y, 140, boom, this.source, true);
            }
            if (this.pierceLeft > 0) { this.pierceLeft--; this.speed *= 0.85; continue; }   // Phi Đao Xuyên Thấu
            if (this.boomerang) { endFlight(); return; }
            this.active = false; // chạm mục tiêu là biến mất
            return;
        }
    }
}

let tankExitTimer = 0;
function activateTank(x, y) {
    Sound.play('tank');
    tank.dashCooldown = 0;
    tank.active = true;
    tank.maxHp = 500;

    let isEnterBoom = hasTeamPerk('t_enter');
    let isStatsBuff = hasTeamPerk('t_stats');
    let isMaster = thietXaUnlocked;

    if (isStatsBuff) tank.maxHp += 150;
    if (isEnterBoom) tank.maxHp += 100;
    if (isMaster) tank.maxHp += 250;
    tank.radius = 40; tank.autoGunTimer = 0;

    tank.hp = tank.maxHp;
    tank.x = x; tank.y = y; tank.hullAngle = 0; tank.turretAngle = 0; tank.dashTimer = 0; tank.shootTimer = 0; tankExitTimer = 0;
    tank.halfHpExploded = false; tank.p1DUsed = false; tank.p2DUsed = false; tank.p2InvulnTimer = 0; tank.p2SpeedBoost = false; tank.cSkillCD = 0;

    addScreenShake(20); createParticles(x, y, '#7f8c8d', 50, 500);
    spawnRing(x, y, '#bdc3c7', 220, 0.5, 6);

    if (isEnterBoom) {
        explode(x, y, 300, 300, players[0], true); // P1 là source nổ, không gây hại cho phe ta
    }
}
function updateDefendTurret(dt) {
    turretMode.fireCD -= dt;
    let p = players[0];
    p.x = turretMode.x;
    p.y = turretMode.y;
    let angle = Math.atan2(p.facingY, p.facingX);
    if (PC_INPUT.pointer.active) angle = getPcAimAngle(turretMode.x, turretMode.y, angle);
    else { let tz = getNearestZombie(turretMode.x, turretMode.y, 900); if (tz) angle = Math.atan2(tz.y - turretMode.y, tz.x - turretMode.x); }
    p.facingX = Math.cos(angle); p.facingY = Math.sin(angle);
    if ((getButtonState(1, 'A', 'pressed') || PC_INPUT.pointer.active) && turretMode.fireCD <= 0) {
        bullets.push(new Bullet(turretMode.x, turretMode.y, angle, { range: 900, dmg: 95, pierce: 2, type: 'gun', critCh: 0.05 }, p));
        turretMode.fireCD = 0.12;
        Sound.play('shoot');
        vfxList.push({ type: 'muzzle', x: turretMode.x + Math.cos(angle) * 40, y: turretMode.y + Math.sin(angle) * 40, life: 0.08, angle: angle });
    }
    for (let z of zombies) {
        if (z.x > MAP_SIZE.w / 2 - 430 && z.x < MAP_SIZE.w / 2 + 430 && z.y > MAP_SIZE.h / 2 - 430 && z.y < MAP_SIZE.h / 2 + 430) {
            turretMode.hp -= 8 * dt;
        }
    }
    if (turretMode.hp <= 0) {
        turretMode.hp = 0;
        for (let p of players) { p.perks.invulnTimer = 0; p.tempShield = 0; p.perks.adrenUsed = true; p.hp = 0; if (!p.isDowned) p.goDown(); }
    }
}

function updateTank(dt) {
    if (tank.dashTimer > 0) tank.dashTimer -= dt;
    if (tank.shootTimer > 0) tank.shootTimer -= dt;
    if (tank.cSkillCD > 0) tank.cSkillCD -= dt;
    if (tank.p2InvulnTimer > 0) tank.p2InvulnTimer -= dt; else tank.p2SpeedBoost = false;
    if (tank.dashCooldown > 0) tank.dashCooldown -= dt;

    let tankLvl = getTeamTagLevel('CHIẾN XA');
    if (tank.halfHpExploded && tank.hp < tank.maxHp) tank.hp = Math.min(tank.maxHp, tank.hp + 5 * dt);

    // Xử lý nổ nửa máu cũ...
    if (tankLvl >= 2 && !tank.halfHpExploded && tank.hp <= tank.maxHp * 0.5) {
        tank.halfHpExploded = true;
        explode(tank.x, tank.y, 400, 500, players[0], true);
    }
    // Mở khóa Thiết Xa: tính mọi kiểu hạ gục bằng xe tăng (húc, pháo, nổ)
    if (!thietXaUnlocked && globalTankKills >= 50 && hasTeamPerk('t_master')) {
        thietXaUnlocked = true;
        vfxList.push({ type: 'text', text: 'THIẾT XA MỞ KHÓA!', x: tank.x, y: tank.y - 100, life: 3.0, color: '#f39c12' });
        spawnRing(tank.x, tank.y, '#f39c12', 260, 0.7, 8);
        Sound.play('level');
    }

    // Giữ B 1 giây để rời xe; chạm nhanh B (phím E) để Càn Quét
    let p1HoldB = getButtonState(1, 'B', 'pressed');
    let holdExit = isSinglePlayer ? p1HoldB : (p1HoldB && getButtonState(2, 'B', 'pressed'));
    let tapDash = false;
    if (p1HoldB) tank.bHold = (tank.bHold || 0) + dt;
    else { if (tank.bHold > 0 && tank.bHold < 0.3) tapDash = true; tank.bHold = 0; }
    if (holdExit) { tankExitTimer += dt; if (tankExitTimer >= 1.0) { tank.active = false; tankExitTimer = 0; getButtonState(1, 'B', 'justPressed'); getButtonState(2, 'B', 'justPressed'); return; } } else { tankExitTimer = 0; }

    let joy1 = UI.p1Stick; let envMult = checkSlowZone(tank.x, tank.y);
    let baseSpeed = hasTeamPerk('t_stats') ? 250 : 150;
    if (tankLvl >= 1) baseSpeed *= 1.3;
    if (tank.p2SpeedBoost) baseSpeed *= 1.8;
    if (hasTeamPerk('e_thietXaLoiDong')) baseSpeed *= 1.25; // Thiết Xa Lôi Động tăng tốc xe tăng

    let speed = (tank.dashTimer > 0 ? (tankLvl >= 5 ? 900 : 650) : baseSpeed) * envMult;
    let vx = 0, vy = 0;

    if (joy1.active && tank.dashTimer <= 0) {
        tank.hullAngle = Math.atan2(joy1.dy, joy1.dx);
        vx = joy1.dx * speed; vy = joy1.dy * speed;
    } else if (tank.dashTimer > 0) {
        vx = Math.cos(tank.hullAngle) * speed;
        vy = Math.sin(tank.hullAngle) * speed;

        // Thiết Xa Lôi Động: Khi lướt để lại vệt điện gây sát thương
        if (hasTeamPerk('e_thietXaLoiDong')) {
            tank.trailCD = (tank.trailCD || 0) - dt;
            if (tank.trailCD <= 0) { tank.trailCD = 0.08; hazards.push({ type: 'electric', x: tank.x, y: tank.y, radius: 60, life: 2.5, dmg: 90, friendly: true, source: players[0] }); }
        }
    }

    // Kỹ năng CÀN QUÉT: chạm nhanh nút B (phím E trên PC)
    if (tapDash && tank.dashTimer <= 0 && tank.dashCooldown <= 0 && hasTeamPerk('t_canQuet')) {
        tank.dashTimer = 0.6; // Thời gian lướt húc
        tank.dashCooldown = 10.0; // Hồi chiêu chuẩn 10 giây
        addScreenShake(8);
        Sound.play('tank');
    }
    if (getButtonState(1, 'A', 'justPressed') && tank.dashTimer <= 0 && !isSinglePlayer) { tank.dashTimer = 0.5; addScreenShake(5); }

    // P1 D Skill (Link 5) - Siêu pháo
    if (tankLvl >= 5 && getButtonState(1, 'D', 'justPressed') && !tank.p1DUsed) {
        tank.p1DUsed = true;
        let shellData = { range: 1200, dmg: 1000, armorPiercing: true, isTankShell: true };
        bullets.push(new Bullet(tank.x, tank.y, tank.turretAngle, shellData, players[0]));
        Sound.play('shotgun');
        addScreenShake(25);
        vfxList.push({ type: 'text', text: 'SIÊU PHÁO!', x: tank.x, y: tank.y - 80, life: 2.0, color: '#f1c40f' });
    }

    // P1 C Skill (Thiết Xa) - Tên lửa phụ
    if (thietXaUnlocked && getButtonState(1, 'C', 'justPressed') && tank.cSkillCD <= 0) {
        tank.cSkillCD = 3.0;
        for (let i = 0; i < 3; i++) {
            bullets.push(new Bullet(tank.x, tank.y, tank.turretAngle + (i - 1) * 0.3, { range: 600, dmg: 150, isExplosiveProj: true }, players[0]));
        }
        Sound.play('shoot');
    }

    if (!isSinglePlayer) {
        // P2 D Skill (Link 5) - Bất tử
        if (tankLvl >= 5 && getButtonState(2, 'D', 'justPressed') && !tank.p2DUsed) {
            tank.p2DUsed = true;
            tank.p2InvulnTimer = 5.0;
            tank.p2SpeedBoost = true;
            vfxList.push({ type: 'text', text: 'BẤT TỬ 5s!', x: tank.x, y: tank.y - 80, life: 2.0, color: '#3498db' });
        }
        // P2 C Skill (Thiết Xa) - Vùng chắn (Khiển tạm bất tử 2s cho lẹ)
        if (thietXaUnlocked && getButtonState(2, 'C', 'justPressed') && tank.cSkillCD <= 0) {
            tank.cSkillCD = 4.0;
            tank.p2InvulnTimer = Math.max(tank.p2InvulnTimer, 2.0);
            vfxList.push({ type: 'text', text: 'VÙNG CHẮN!', x: tank.x, y: tank.y - 80, life: 1.5, color: '#00ffff' });
        }
    }

    tank.x += vx * dt; tank.y += vy * dt; tank.radius = 40; resolveCollision(tank);

    let joy2 = isSinglePlayer ? UI.p1Stick : UI.p2Stick;
    let gunBaseDmg = hasTeamPerk('t_stats') ? 350 : 200;
    // Pháo Kích Hiệp Lực: lính ném lựu theo hướng nòng pháo mỗi khi tank khai hỏa
    const squadVolley = () => {
        if (!hasTeamPerk('a_heavy_artillery')) return;
        for (let a of allies) if (a.hp > 0 && a.kind !== 'medic') bullets.push(new Bullet(a.x, a.y, tank.turretAngle + (Math.random() - 0.5) * 0.2, { range: 520, dmg: 110, isExplosiveProj: true, friendly: true, fromAlly: true }, players[0]));
    };

    if (isSinglePlayer) {
        tank.turretAngle = getPcAimAngle(tank.x, tank.y, tank.hullAngle);
        if (getButtonState(1, 'A', 'pressed') && tank.shootTimer <= 0) {
            bullets.push(new Bullet(tank.x, tank.y, tank.turretAngle, { range: 800, dmg: gunBaseDmg, armorPiercing: true, isTankShell: true }, players[0]));
            Sound.play('shotgun'); squadVolley();
            tank.shootTimer = 1.0; addScreenShake(12); vfxList.push({ type: 'muzzle', x: tank.x + Math.cos(tank.turretAngle) * 50, y: tank.y + Math.sin(tank.turretAngle) * 50, life: 0.3, angle: tank.turretAngle });
        }
    } else {
        // Online: người chơi 2 dùng chuột để xoay pháo; chung máy: dùng joystick P2
        if (NET.mode === 'host' && NET.remote.ptr) tank.turretAngle = NET.remote.ang;
        else if (joy2.active) tank.turretAngle = Math.atan2(joy2.dy, joy2.dx); else tank.turretAngle = tank.hullAngle;
        if (getButtonState(2, 'A', 'pressed') && tank.shootTimer <= 0) {
            bullets.push(new Bullet(tank.x, tank.y, tank.turretAngle, { range: 800, dmg: gunBaseDmg, armorPiercing: true, isTankShell: true }, players[1]));
            Sound.play('shotgun'); squadVolley();
            tank.shootTimer = 1.2; addScreenShake(12); vfxList.push({ type: 'muzzle', x: tank.x + Math.cos(tank.turretAngle) * 50, y: tank.y + Math.sin(tank.turretAngle) * 50, life: 0.3, angle: tank.turretAngle });
        }
    }


    // Súng phụ tự động (ĐÃ SỬA LỖI & THÊM HIỆU ỨNG)
    if (hasTeamPerk('t_auto')) {
        tank.autoGunTimer -= dt;
        if (tank.autoGunTimer <= 0) {
            let target = getNearestZombie(tank.x, tank.y, 400);
            if (target) {
                let ang = Math.atan2(target.y - tank.y, target.x - tank.x);
                bullets.push(new Bullet(tank.x, tank.y, ang, { range: 400, dmg: 40, armorPiercing: true, isTankShell: false }, players[0]));
                tank.autoGunTimer = getTeamTagLevel('TẤN CÔNG TỰ ĐỘNG') >= 2 ? 0.33 : 0.5;
                Sound.play('shoot');
                vfxList.push({ type: 'muzzle', x: tank.x + Math.cos(ang) * 40, y: tank.y + Math.sin(ang) * 40, life: 0.1, angle: ang });
            } else {
                tank.autoGunTimer = 0; // Fix: Khóa ở mức 0 nếu không có quái
            }
        }
    }

    let meleeDmgReduction = tankLvl >= 5 ? 0.2 : 1.0; // Link 5 giảm rất nhiều dame cận chiến

    for (let z of zombies) {
        if (z.hp > 0 && Math.hypot(tank.x - z.x, tank.y - z.y) < tank.radius + z.radius) {
            z.hp -= tank.dashTimer > 0 ? 300 : 50;
            z.lastHitBy = players[0];
            z.knockback(Math.cos(tank.hullAngle) * 800, Math.sin(tank.hullAngle) * 800);
            createParticles(z.x, z.y, '#c0392b', 10, 200);

            if (z.hp <= 0) {
                if (zombieDown(z, players[0])) globalTankKills++;
            } else {
                if (z.atkCD <= 0 && tank.p2InvulnTimer <= 0) {
                    tank.hp -= (z.type === 1 ? 30 : 10) * meleeDmgReduction;
                    z.atkCD = 1.0;
                }
            }
        }
    }
    players[0].x = tank.x; players[0].y = tank.y; if (!isSinglePlayer) { players[1].x = tank.x; players[1].y = tank.y; }

    if (tank.hp <= 0) {
        tank.active = false; explode(tank.x, tank.y, 350, 400, players[0], true); // xe nổ không giết luôn tổ lái
        players[0].x = Math.max(16, tank.x - 40); players[0].y = tank.y;
        if (!isSinglePlayer) { players[1].x = Math.min(MAP_SIZE.w - 16, tank.x + 40); players[1].y = tank.y; }
    }
}

class EnemyBullet {
    constructor(x, y, tx, ty, type) {
        this.x = x; this.y = y; this.type = type;
        let ang = Math.atan2(ty - y, tx - x);
        // Đã Nerf tốc độ đạn: Độc 250, Lưới 200, Nỏ/Đạn 450 (Cũ là 400/300/700)
        let speed = type === 'acid' ? 250 : (type === 'net' ? 200 : (type === 'electric' ? 520 : (type === 'rock' ? 650 : (type === 'rocket' ? 420 : 450))));
        this.vx = Math.cos(ang) * speed; this.vy = Math.sin(ang) * speed;
        this.active = true;
        // Đã Nerf thời gian tồn tại của đạn để tầm bay ngắn lại (Cũ là 2.5s)
        this.life = 1.5;
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt; this.life -= dt; if (this.life <= 0) this.active = false;
        for (let obs of obstacles) { if (this.x > obs.x && this.x < obs.x + obs.w && this.y > obs.y && this.y < obs.y + obs.h) { this.active = false; createParticles(this.x, this.y, this.type === 'acid' ? '#2ecc71' : (this.type === 'net' ? '#8e44ad' : '#ecf0f1'), 5, 80); return; } }
        if (tank.active && tank.p2InvulnTimer <= 0 && Math.hypot(this.x - tank.x, this.y - tank.y) < tank.radius + 5) { if (this.type === 'rocket') explode(this.x, this.y, 150, 120); else tank.hp -= (this.type === 'acid' ? 10 : (this.type === 'rock' ? 35 : 5)); this.active = false; createParticles(this.x, this.y, this.type === 'acid' ? '#2ecc71' : (this.type === 'electric' ? '#00d2d3' : '#ecf0f1'), 10, 100); return; }
        for (let p of players) {
            if (!p.isDowned && !tank.active && Math.hypot(this.x - p.x, this.y - p.y) < p.radius + 5) {
                if (this.type === 'net') { p.netTimer = 2.0; createParticles(p.x, p.y, '#8e44ad', 15, 100); vfxList.push({ type: 'text', text: 'CHẬM!', x: p.x, y: p.y - 30, life: 1.0, color: '#8e44ad' }); }
                else if (this.type === 'electric') {
                    p.takeDamage(16);
                    stunPlayer(p, 0.85);
                    applyPlayerStatus(p, STATUS.ELECTRIC, { duration: 2.0, stacks: 1, dps: 5, maxStacks: 6 });
                    electricBurst(p.x, p.y, 70, 4, 0.35);
                }
                else if (this.type === 'rock') { p.takeDamage(45); stunPlayer(p, 0.5); addScreenShake(6); }
                else if (this.type === 'rocket') { explode(this.x, this.y, 150, 120); }
                else {
                    p.takeDamage(this.type === 'acid' ? 20 : (this.type === 'shotgun' ? 10 : 15));
                    if (this.type === 'acid') applyPlayerStatus(p, STATUS.CORROSION, { duration: 3.2, stacks: 1, dpsPercent: 0.003, maxStacks: 6 });
                }
                this.active = false; break;
            }
        }
    }
}
function getAllyLimit(type) {
    let summon = getTeamTagLevel('TRIEU_HOI');
    let army = getTeamTagLevel('QUAN_DOI');
    let base = type === 'medic' ? 1 : 2;
    if (summon >= 5) base++;
    if (army >= 5) base++;
    return base;
}

function summonAlly(type = 'rifleman', owner = players[0]) {
    let same = allies.filter(a => a.kind === type && a.hp > 0).length;
    if (same >= getAllyLimit(type)) return false;
    allies.push(new Ally(owner.x + (Math.random() - 0.5) * 80, owner.y + (Math.random() - 0.5) * 80, type, owner));
    return true;
}

class Ally {
    constructor(x, y, kind = 'rifleman', owner = players[0]) {
        this.x = x; this.y = y; this.kind = kind; this.owner = owner;
        this.radius = kind === 'vanguard' ? 19 : 15;
        this.maxHp = kind === 'vanguard' ? 240 : (kind === 'medic' ? 130 : 150);
        if (getTeamTagLevel('QUAN_DOI') >= 5) this.maxHp *= 1.5;
        this.hp = this.maxHp; this.atkCD = Math.random(); this.skillCD = 3; this.facingX = 1; this.facingY = 0;
        this.elite = false; this.tempShield = 0; this.shieldTimer = 0; this.noDamageTimer = 0; this.droneCD = 0;
        if (hasTeamPerk('a_elite_squad')) this.promoteElite();
    }
    promoteElite() { this.elite = true; this.maxHp *= 2; this.hp = this.maxHp; }
    update(dt) {
        if (this.hp <= 0) {
            if (this.respawnTimer > 0) {
                this.respawnTimer -= dt;
                if (this.respawnTimer <= 0) {
                    let o = this.owner && !this.owner.isDowned ? this.owner : players[0];
                    this.x = o.x + (Math.random() - 0.5) * 80; this.y = o.y + (Math.random() - 0.5) * 80; this.hp = this.maxHp;
                    createParticles(this.x, this.y, '#ecf0f1', 25, 220);
                }
            }
            return;
        }
        let army = getTeamTagLevel('QUAN_DOI'), summon = getTeamTagLevel('TRIEU_HOI'), allyTag = getTeamTagLevel('DONG_MINH');
        this.atkCD -= dt; this.skillCD -= dt; this.shieldTimer -= dt; this.noDamageTimer += dt;
        if (allyTag >= 1 && this.shieldTimer <= 0) { this.tempShield = 1; this.shieldTimer = 8; }
        if (summon >= 1 && this.noDamageTimer > 10 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 5 * dt);
        // Giao Thức Đồng Bộ Drone: có Drone thì lính tự hồi máu
        let droneLink = hasTeamPerk('a_drone_link_protocol') && drones.length > 0;
        if (droneLink && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 4 * dt);

        // Đồng Loạt Khai Hỏa: ưu tiên mục tiêu người chơi vừa bắn (trong tầm)
        let focus = (hasTeamPerk('a_synchronized_fire') && lastFocusedTarget && lastFocusedTarget.hp > 0 && Math.hypot(lastFocusedTarget.x - this.x, lastFocusedTarget.y - this.y) < 760) ? lastFocusedTarget : null;
        let target = focus || getNearestZombie(this.x, this.y, this.kind === 'vanguard' ? 260 : 680, true);

        // Mẫu Hạm Drone: mỗi lính có Mini Drone bắn phụ
        if (hasTeamPerk('u_drone_carrier')) {
            this.droneCD -= dt;
            if (this.droneCD <= 0 && target) {
                let da = Math.atan2(target.y - this.y, target.x - this.x);
                bullets.push(new Bullet(this.x, this.y - 22, da, { range: 520, dmg: 22, fromAlly: true }, players[0]));
                this.droneCD = 0.6;
            }
        }
        let anchor = this.owner && !this.owner.isDowned ? this.owner : players[0];
        let desiredDist = this.kind === 'vanguard' ? 85 : 145;
        if (target && this.kind === 'vanguard') anchor = target;
        let a = Math.atan2(anchor.y - this.y, anchor.x - this.x);
        let distAnchor = Math.hypot(anchor.x - this.x, anchor.y - this.y);
        let speed = 115 * (summon >= 5 ? 1.4 : 1) * (hasTeamPerk('a_overdrive_matrix') ? 1.25 : 1);
        if (distAnchor > desiredDist) { this.x += Math.cos(a) * speed * dt; this.y += Math.sin(a) * speed * dt; resolveCollision(this); }

        if (this.kind === 'medic') {
            let hurt = [...players, ...allies].filter(e => e && !e.isDowned && e.hp > 0 && e.hp < e.maxHp).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0];
            if (hurt && this.skillCD <= 0 && Math.hypot(hurt.x - this.x, hurt.y - this.y) < 220) {
                hurt.hp = Math.min(hurt.maxHp, hurt.hp + 15);
                createParticles(hurt.x, hurt.y, '#2ecc71', 12, 100);
                this.skillCD = 12;
            }
            return;
        }

        if (target && this.atkCD <= 0) {
            let ang = Math.atan2(target.y - this.y, target.x - this.x);
            this.facingX = Math.cos(ang); this.facingY = Math.sin(ang);
            let dmg = (this.kind === 'vanguard' ? 55 : 38) * (army >= 5 ? 1.35 : 1) * (this.elite ? 1.6 : 1) * (hasTeamPerk('a_overdrive_matrix') ? 1.25 : 1);
            if (this.kind === 'vanguard' && Math.hypot(target.x - this.x, target.y - this.y) < 95) {
                target.hp -= dmg * players[0].getTotalDamageMult();
                target.lastHitBy = players[0];
                target.knockback(Math.cos(ang) * 320, Math.sin(ang) * 320);
                this.atkCD = 0.9;
            } else {
                let spread = hasTeamPerk('a_fire_discipline') || army >= 2 ? 0 : 0.16;
                let pierce = hasTeamPerk('a_piercing_rounds') || army >= 3 ? 1 : 0;
                bullets.push(new Bullet(this.x, this.y, ang + (Math.random() - 0.5) * spread, { range: 720, dmg, pierce, critCh: army >= 6 ? 0.15 : 0, fromAlly: true }, players[0]));
                if (hasTeamPerk('a_suppressive_fire') && Math.random() < 0.25 && target.type < 30) target.stunTimer = Math.max(target.stunTimer || 0, 0.5);
                this.atkCD = (army >= 2 ? 0.85 : 1.1) * (hasTeamPerk('a_tactical_reload') ? 0.6 : 1) * (droneLink ? 0.85 : 1);
            }
        }
        separateFriendly(this, allies, dt, 38, 160);
        separateFriendly(this, rescueNPCs, dt, 32, 110);
    }
    takeDamage(dmg) {
        this.noDamageTimer = 0;
        if (this.hp <= 0) return;
        if (this.tempShield > 0) { this.tempShield--; return; }
        this.hp -= dmg;
        if (this.hp <= 0) {
            createParticles(this.x, this.y, '#3498db', 16, 180);
            // Triệu Hồi mốc 4: lính ngã xuống phát nổ (chỉ hại quái)
            if (getTeamTagLevel('TRIEU_HOI') >= 4) explode(this.x, this.y, 110, 200, players[0], true);
            // Triệu Hồi mốc 5: lính quay lại sau 20s
            if (getTeamTagLevel('TRIEU_HOI') >= 5) this.respawnTimer = 20; else this.noRespawn = true;
        }
    }
    draw(ctx) {
        if (this.hp <= 0) return;
        drawShadow(this.x, this.y, this.radius);
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.kind === 'medic' ? '#2ecc71' : (this.kind === 'vanguard' ? '#95a5a6' : '#3498db');
        ctx.fill(); ctx.strokeStyle = this.elite ? '#f1c40f' : '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(Math.atan2(this.facingY, this.facingX));
        ctx.fillStyle = '#bdc3c7'; ctx.fillRect(this.radius, -3, this.kind === 'vanguard' ? 14 : 22, 6); ctx.restore();
        drawMiniBar(this.x, this.y - 27, 34, 4, this.hp, this.maxHp, '#2ecc71');
    }

}
function separateFriendly(entity, list, dt, minDist = 34, force = 140) {
    for (let other of list) {
        if (!other || other === entity || other.hp <= 0) continue;
        let dx = entity.x - other.x, dy = entity.y - other.y;
        let d = Math.hypot(dx, dy);
        if (d > 0 && d < minDist) {
            let push = (minDist - d) / minDist;
            entity.x += (dx / d) * force * push * dt;
            entity.y += (dy / d) * force * push * dt;
        }
    }
}
class RescueNPC {
    constructor(x, y) {
        this.x = x; this.y = y; this.radius = 13; this.hp = 80 + currentLevel * 10; this.maxHp = this.hp;
        this.atkCD = Math.random(); this.facingX = 1; this.facingY = 0; this.rescueProgress = 0;
        this.rescued = false;
        this.safe = false;
    }
    takeDamage(dmg) { if (this.hp > 0) { this.hp -= dmg; if (this.hp <= 0) createParticles(this.x, this.y, '#c0392b', 16, 160); } }
    update(dt) {
        if (this.hp <= 0) return;
        if (!this.rescued) {
            let rescuers = players.filter(p => !p.isDowned && Math.hypot(p.x - this.x, p.y - this.y) < 95);
            if (rescuers.length > 0) {
                this.rescueProgress += dt;
                if (this.rescueProgress >= 5.0) {
                    this.rescued = true;
                    mission.progress++;
                    createParticles(this.x, this.y, '#2ecc71', 25, 160);
                    spawnRing(this.x, this.y, '#2ecc71', 95, 0.4);
                    Sound.play('heal');
                    vfxList.push({ type: 'text', text: 'ĐÃ CỨU!', x: this.x, y: this.y - 35, life: 1.0, color: '#2ecc71' });
                }
            } else {
                this.rescueProgress = Math.max(0, this.rescueProgress - dt * 0.5);
            }
            return;
        }
        this.atkCD -= dt;
        let target = getNearestZombie(this.x, this.y, 420, true);
        let follow = rescueMission.heliArrived && evacZone ? evacZone : (players.filter(p => !p.isDowned).sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y))[0] || players[0]);
        let fleeAng = target ? Math.atan2(this.y - target.y, this.x - target.x) : 0;
        let followAng = Math.atan2(follow.y - this.y, follow.x - this.x);
        let speed = 95;
        let dx = Math.cos(followAng), dy = Math.sin(followAng);
        if (target && Math.hypot(target.x - this.x, target.y - this.y) < 150) {
            dx = Math.cos(fleeAng); dy = Math.sin(fleeAng); speed = 130;
        }
        if (Math.hypot(follow.x - this.x, follow.y - this.y) > 90) {
            this.x += dx * speed * dt; this.y += dy * speed * dt; resolveCollision(this);
        }
        if (target && this.atkCD <= 0) {
            let a = Math.atan2(target.y - this.y, target.x - this.x);
            this.facingX = Math.cos(a); this.facingY = Math.sin(a);
            bullets.push(new Bullet(this.x, this.y, a, { range: 420, dmg: 22, pierce: getTeamTagLevel('QUAN_DOI') >= 3 ? 1 : 0, fromAlly: true }, players[0]));
            this.atkCD = 1.4;
        }
        separateFriendly(this, rescueNPCs, dt, 30, 120);
        separateFriendly(this, allies, dt, 32, 100);
    }
    draw(ctx) {
        if (!this.rescued) {
            ctx.beginPath();
            ctx.arc(this.x, this.y, 95, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(46,204,113,0.35)';
            ctx.lineWidth = 2;
            ctx.stroke();
            drawMiniBar(this.x, this.y + 22, 42, 5, this.rescueProgress || 0, 5, '#2ecc71');
        }
        if (this.hp <= 0) return;
        drawShadow(this.x, this.y, this.radius);
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#f8c291'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        drawMiniBar(this.x, this.y - 23, 28, 4, this.hp, this.maxHp, '#2ecc71');
    }
}

class Outpost {
    constructor(x, y) {
        this.x = x; this.y = y; this.w = 150; this.h = 150;
        this.hp = 3000 + currentLevel * 500; this.maxHp = this.hp;
        this.spawnTimer = 2.0; this.destroyTimer = 0;
    }
    update(dt) {
        if (this.dead) return;
        if (this.destroyTimer > 0) {
            this.destroyTimer -= dt;
            if (this.destroyTimer <= 0) {
                this.dead = true;
                explode(this.x + this.w / 2, this.y + this.h / 2, 240, 600);
                beginEvacCountdown();
            }
            return;
        }
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) { // Đẻ cướp, càng lâu càng đông
            let count = 1 + Math.floor(survivalTime / 80) + Math.floor(currentLevel / 4);
            for (let i = 0; i < count; i++) zombies.push(new Zombie(this.x + this.w / 2 + (Math.random() - 0.5) * 220, this.y + this.h / 2 + (Math.random() - 0.5) * 220, 12));
            this.spawnTimer = Math.max(0.9, 3.0 - survivalTime / 180);
        }
    }
    draw(ctx) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(this.x + 5, this.y + 5, this.w, this.h);
        ctx.fillStyle = '#c0392b'; ctx.fillRect(this.x, this.y, this.w, this.h);
        ctx.strokeStyle = '#2c3e50'; ctx.lineWidth = 4; ctx.strokeRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.fillText('TIỀN ĐỒN CƯỚP', this.x + this.w / 2, this.y + this.h / 2);
        drawMiniBar(this.x + this.w / 2, this.y - 20, 100, 8, this.hp, this.maxHp, '#2ecc71');
        if (this.destroyTimer > 0) {
            ctx.fillStyle = '#ff4757';
            ctx.font = 'bold 22px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(Math.ceil(this.destroyTimer), this.x + this.w / 2, this.y + this.h / 2 + 34);
        }
    }
}

class Zombie {
    constructor(x, y, forcedType = -1) {
        this.x = x; this.y = y;

        let specialCount = zombies.filter(z => z.type !== 0).length;
        let maxSpecial = 15 + currentLevel * 2; // Tăng giới hạn quái đặc biệt

        if (forcedType === -1 && currentMapType === 14) forcedType = antRandomType(); // Hầm Mỏ: chỉ có loài kiến
        if (forcedType !== -1) {
            this.type = forcedType;
        } else {
            if (specialCount >= maxSpecial) {
                this.type = 0;
            } else {
                let pool = [0, 8];
                if (currentLevel >= 5) {
                    pool.push(2, 5, 1, 7, 3, 4, 6);
                    if (currentMapType === 1) pool.push(10, 10);
                    if (currentMapType === 2) pool.push(9, 9);
                    if (currentMapType === 3) pool.push(11, 11);
                    if (currentMapType === 6) pool.push(16, 16, 17, 17);
                    if (currentMapType === 7) pool.push(21, 21, 22, 22);
                    if (currentMapType === 8) pool.push(12, 12, 20);
                    if (currentMapType === 5) pool.push(13, 13); // Map thành phố: Lính cứu hỏa
                    if (currentLevel >= 6) pool.push(14, 14); // Map 6+: Bọc thép
                    if (currentLevel >= 8) pool.push(15, 15); // Map 8+: Nhầy nhụa
                    if (currentLevel >= 5) pool.push(34);
                    if (currentLevel >= 4) pool.push(18, 18);
                    // Các loại quái đã có AI nhưng trước đây không bao giờ xuất hiện
                    if (currentLevel >= 6) pool.push(26);                       // Witch
                    if (currentLevel >= 7) pool.push(27);                       // Crusher
                    if (currentLevel >= 6) pool.push(33);                       // Miner
                    if (currentMapType === 6) pool.push(28, 29, 29);            // Electrical, E.L
                    if (currentMapType === 10) pool.push(33, 33, 21);           // Hang Z: thợ mỏ, bóng đen
                }
                this.type = pool[Math.floor(Math.random() * pool.length)];
            }
        }

        this.nid = ++zombieIdSeq; this.hitFlash = 0;
        this.kbX = 0; this.kbY = 0; this.atkCD = 0; this.spCD = 0; this.isDashing = false;
        this.stunTimer = 0; this.isFrenzied = 0; this.shieldBoss = null; this.status = {}; this.phase2Done = false; this.skillTimer = 2.0 + Math.random() * 2.0; this.chargeTimer = 0; this.skillState = null;

        // HỆ THỐNG ĐỘT BIẾN:
        // Tăng sức mạnh cơ bản theo level (Map 5+ bùng nổ)
        let diffMult = 1.0 + (currentLevel - 1) * (currentLevel >= 5 ? 0.6 : 0.3);
        // Cứ 3 map đột biến 1 lần: x1.5 Máu, x1.2 Tốc độ, Cơ thể bất hoại (kháng KB)
        let mutationTier = Math.floor(currentLevel / 3);
        let mutationHpMult = Math.pow(1.5, mutationTier);
        let mutationSpdMult = Math.min(1.5, Math.pow(1.15, mutationTier)); // Giới hạn tốc độ x1.5
        let antMult = 1 + (currentLevel - 1) * 0.22;

        switch (this.type) {
            case 0: this.radius = 16; this.color = '#27ae60'; this.maxHp = (50 + survivalTime * 0.8) * diffMult; this.baseSpeed = 80 + Math.random() * 40; break;
            case 1: this.radius = 24; this.color = '#e67e22'; this.maxHp = (100 + survivalTime * 1.2) * diffMult; this.baseSpeed = 60; break;

            // NERF: Quái tầm xa kích thước rất bé (Base 8), to dần nhưng max là 14
            case 2: this.radius = 16; this.color = '#9b59b6'; this.maxHp = (40 + survivalTime * 0.6) * diffMult; this.baseSpeed = 90 + Math.random() * 30; break;

            case 3: this.radius = 12; this.color = '#d35400'; this.maxHp = (30 + survivalTime * 0.5) * diffMult; this.baseSpeed = 150 + Math.random() * 40; break;
            case 4: this.radius = 32; this.color = '#555555'; this.maxHp = (350 + survivalTime * 2.0) * diffMult; this.baseSpeed = 45; break;
            case 5: this.radius = 16; this.color = 'rgba(236, 240, 241, 0.4)'; this.maxHp = (40 + survivalTime * 0.5) * diffMult; this.baseSpeed = 100; break;
            case 6: this.radius = 20; this.color = '#8e44ad'; this.maxHp = (150 + survivalTime * 1.0) * diffMult; this.baseSpeed = 50; this.spCD = 4.0; break;
            case 7: this.radius = 14; this.color = '#bdc3c7'; this.maxHp = (25 + survivalTime * 0.4) * diffMult; this.baseSpeed = 130; break;

            // NERF: Cung thủ bé
            case 8: this.radius = 16; this.color = '#7f8c8d'; this.maxHp = (25 + survivalTime * 0.4) * diffMult; this.baseSpeed = 70; break;

            // NERF: Shotgun bé
            case 9: this.radius = 20; this.color = '#10ac84'; this.maxHp = (80 + survivalTime * 1.0) * diffMult; this.baseSpeed = 110; break;

            case 10: this.radius = 15; this.color = '#ff9f43'; this.maxHp = (60 + survivalTime * 0.8) * diffMult; this.baseSpeed = 130; break;
            case 11: this.radius = 20; this.color = '#576574'; this.maxHp = (180 + survivalTime * 1.5) * diffMult; this.baseSpeed = 65; this.hasRevived = false; break;
            case 12: this.radius = 16; this.color = '#c0392b'; this.maxHp = (80 + survivalTime * 1.0) * diffMult; this.baseSpeed = 100; break; // Cướp
            // --- ZOMBIE MỚI ---
            case 13: this.radius = 18; this.color = '#d35400'; this.maxHp = (250 + survivalTime * 1.5); this.baseSpeed = 75; break; // Lính cứu hỏa
            case 14: this.radius = 22; this.color = '#2c3e50'; this.maxHp = (400 + survivalTime * 2.0); this.baseSpeed = 55; break; // Bọc thép (Kháng nổ)
            case 15: this.radius = 26; this.color = '#2ecc71'; this.maxHp = (300 + survivalTime * 1.0); this.baseSpeed = 60; this.spCD = 5.0; break; // Nhầy nhụa (Sinh đệ)
            case 16: this.radius = 18; this.color = '#00d2d3'; this.maxHp = (130 + survivalTime * 1.0) * diffMult; this.baseSpeed = 160; this.spCD = 2.5; break; // Dien Quang
            case 17: this.radius = 16; this.color = '#54a0ff'; this.maxHp = (95 + survivalTime * 0.8) * diffMult; this.baseSpeed = 95; this.atkCD = 1.6; break; // Cu Soc
            case 18: this.radius = 19; this.color = '#2ecc71'; this.maxHp = (170 + survivalTime * 1.1) * diffMult; this.baseSpeed = 70; this.atkCD = 1.8; this.spCD = 3.0; break; // Acidier
            case 20: this.radius = 17; this.color = '#2d3436'; this.maxHp = (240 + survivalTime * 1.5) * diffMult; this.baseSpeed = 70; break; // Ke Lang Thang
            case 21: this.radius = 15; this.color = '#0b0f1a'; this.maxHp = (75 + survivalTime * 0.6) * diffMult; this.baseSpeed = 190; break; // Bong Den
            case 22: this.radius = 14; this.color = '#dff9fb'; this.maxHp = (90 + survivalTime * 0.7) * diffMult; this.baseSpeed = 210; this.spCD = 2.2; break; // Mong Vuot
            // --- ĐẶC CHẾ SÁT THỦ TRONG SWITCH CASE ---
            case 26: // WITCH (Siêu nhanh - Siêu nhỏ - Máu giấy)
                this.radius = 11;
                this.color = '#ff007f'; // Hồng neon phát sáng
                this.maxHp = 15 + survivalTime * 0.3;
                this.baseSpeed = 240;
                this.witchCooldown = 0;
                break;

            case 27: // CRUSHER (To lớn, Máu trâu, Dậm đất AOE, Húc đẩy quái gạt tường thành)
                this.radius = 35;
                this.color = '#2c3e50';
                this.maxHp = 600 + survivalTime * 3.5;
                this.baseSpeed = 50;
                this.firstSightTimer = 2.0; // Sau 2 giây phát hiện người chơi sẽ lao nhanh
                this.isCharging = false;
                this.armorShield = 250; // Thanh giáp chặn đạn khi bắt đầu lao húc
                break;

            case 28: // ELECTRICAL (Zombie sấm sét cấp điện tăng tốc cho quái khác)
                this.radius = 30;
                this.color = '#00d2d3';
                this.maxHp = 500 + survivalTime * 2.5;
                this.baseSpeed = 60;
                break;

            case 29: // E.L (Bắn tia điện định hướng gây choáng diện rộng)
                this.radius = 20;
                this.color = '#ffeaa7';
                this.maxHp = 180 + survivalTime * 1.0;
                this.baseSpeed = 80;
                this.warnBeamTimer = 0;
                break;
            case 30: this.radius = 62; this.color = '#ff9f43'; this.maxHp = 10000 + currentLevel * 850; this.baseSpeed = 52; this.spCD = 3.0; break; // Khong Lo
            case 31: this.radius = 48; this.color = '#00d2d3'; this.maxHp = 7450 + currentLevel * 780; this.baseSpeed = 76; this.spCD = 2.4; break; // Loi Qua Tai
            case 32: this.radius = 34; this.color = '#ff4757'; this.maxHp = 5000 + currentLevel * 720; this.baseSpeed = 68; this.spCD = 2.6; break; // The Leader
            case 33: // Miner
                this.radius = 15;
                this.color = '#6b5b45';
                this.maxHp = (120 + survivalTime * 0.9) * diffMult;
                this.baseSpeed = 105;
                this.burrowed = true;
                this.emergeTimer = 0;
                break;
            // --- LOÀI KIẾN (Hầm Mỏ) — AI nằm ở 09-cave.js ---
            case 40: this.radius = 10; this.color = '#a0522d'; this.maxHp = 20 * antMult; this.baseSpeed = 195 + Math.random() * 30; break;                 // Kiến Con: nhỏ, nhanh gấp đôi
            case 41: this.radius = 14; this.color = '#1e272e'; this.maxHp = 55 * antMult; this.baseSpeed = 125; break;                                       // Kiến Nổ
            case 42: this.radius = 13; this.color = '#d4a373'; this.maxHp = 85 * antMult; this.baseSpeed = 150; break;                                       // Kiến Thợ
            case 43: this.radius = 19; this.color = '#7b241c'; this.maxHp = 300 * antMult; this.baseSpeed = 95; this.sState = 'ground'; this.sT = 1.5; break; // Kiến Lính
            case 45: this.radius = 58; this.color = '#8e44ad'; this.maxHp = 9000 + currentLevel * 900; this.baseSpeed = 150; this.phase = 1; this.spCD = 2.5; this.airborne = true; break; // Kiến Chúa
            case 46: this.radius = 32; this.color = '#6ab04c'; this.maxHp = 1500 + currentLevel * 120; this.baseSpeed = 0; this.beamT = 20; break;            // Xúc Tu
            case 50: this.radius = 40; this.color = '#c0392b'; this.maxHp = 14000 + currentLevel * 1600; this.baseSpeed = 34; this.spCD = 3.0; break; // THE DEAD (boss ẩn)
            case 51: this.radius = 16; this.color = '#8e1b1b'; this.maxHp = 120 * antMult; this.baseSpeed = 62; break;                              // Tế Phẩm
            case 34: // Boomer bien the
                this.radius = 17;
                this.color = '#badc58';
                this.maxHp = (95 + survivalTime * 0.7) * diffMult;
                this.baseSpeed = 145;
                this.spCD = 4.5;
                this.dashWarn = 0;
                this.dashTimer = 0;
                break;
        }
        this.hp = this.maxHp;
    }
    knockback(vx, vy) { if (this.type >= 45 && this.type !== 51) return; if (this.type === 4 || this.type === 6) { vx *= 0.2; vy *= 0.2; } this.kbX = vx; this.kbY = vy; }
    update(dt) {
        this.kbX *= 0.85; this.kbY *= 0.85; this.atkCD -= dt; this.spCD -= dt;
        let target = players[0];
        if (this.lockTarget && (this.lockTarget.isDowned || this.lockTarget.hp <= 0)) this.lockTarget = null;
        if (!isSinglePlayer && !tank.active) { let d0 = players[0].isDowned ? Infinity : Math.hypot(this.x - players[0].x, this.y - players[0].y); let d1 = players[1].isDowned ? Infinity : Math.hypot(this.x - players[1].x, this.y - players[1].y); if (d0 !== Infinity || d1 !== Infinity) target = (d0 < d1) ? players[0] : players[1]; } else if (tank.active) { target = tank; }
        // Người chơi bị The Leader đánh dấu: cả bầy dồn vào người đó
        let marked = tank.active ? null : players.find(p => p.markedTimer > 0 && !p.isDowned);
        if (marked) this.lockTarget = marked;

        if (!this.lockTarget) {
            let candidates = [];
            for (let p of players) if (!p.isDowned) candidates.push(p);
            for (let n of rescueNPCs) if (n.hp > 0) candidates.push(n);
            for (let a of allies) if (a.hp > 0) candidates.push(a);
            candidates.sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
            for (let c of candidates) {
                if (Math.hypot(c.x - this.x, c.y - this.y) < 650 && hasLineOfSight(this.x, this.y, c.x, c.y)) {
                    this.lockTarget = c;
                    break;
                }
            }
        }
        if (this.lockTarget) target = this.lockTarget;

        let dist = Math.hypot(target.x - this.x, target.y - this.y); let ang = Math.atan2(target.y - this.y, target.x - this.x);
        let envMult = checkSlowZone(this.x, this.y);
        if (this.type === 9) envMult = 1.0;
        // Thêm vào hàm update(dt) của class Zombie
        updateStatusEffects(this, dt, false);

        let speed = this.baseSpeed * envMult;
        speed *= getStatusMoveMult(this);
        if (isBossType(this.type)) this.stunTimer = 0; // Boss miễn choáng
        if (this.stunTimer > 0 && !getStatus(this, STATUS.OVERLOAD)) {
            // Choáng thật sự: không di chuyển, không đánh, huỷ luôn đòn đang gồng
            this.stunTimer -= dt;
            if (Math.random() < dt * 20) createParticles(this.x, this.y, '#00d2d3', 1, 30);
            this.warnBeamTimer = 0; this.isLeaping = false; this.isCharging = false; this.dashTimer = 0; this.chargeTimer = 0;
            this.x += this.kbX * dt; this.y += this.kbY * dt; resolveCollision(this);
            return;
        }
        if (this.isFrenzied > 0) { this.isFrenzied -= dt; speed *= 1.5; } // màu đỏ cuồng nộ do phần vẽ xử lý, hết cuồng nộ tự về màu gốc
        if (this.shieldBoss && this.shieldBoss.hp > 0) {
            let slot = this.shieldSlot || 0;
            let a = Math.atan2(target.y - this.shieldBoss.y, target.x - this.shieldBoss.x) + (slot - 1) * 0.35;
            this.x = this.shieldBoss.x + Math.cos(a) * (this.shieldBoss.radius + this.radius + 12);
            this.y = this.shieldBoss.y + Math.sin(a) * (this.shieldBoss.radius + this.radius + 12);
            return;
        }
        if (isCaveMap()) ang = caveSteer(this, target, ang, dist); // trong hang: đi vòng qua vách đá theo lưới dẫn đường
        if (updateSpecialZombie(this, target, dist, ang, dt, speed)) return;

        // ĐÃ NERF QUÁI TẦM XA Ở CÁC DÒNG BÊN DƯỚI
        if (this.type === 2) {
            if (dist < 200) speed = 0; // Cũ: 300
            if (dist < 250 && this.atkCD <= 0) { // Tầm bắn: Cũ 450 -> Mới 250
                enemyBullets.push(new EnemyBullet(this.x, this.y, target.x, target.y, 'acid'));
                this.atkCD = 4.0; // Tốc độ bắn: Cũ 2.5s -> Mới 4.0s
            }
        }
        else if (this.type === 8) {
            if (dist < 200) speed = 0; // Cũ: 350
            if (dist < 280 && this.atkCD <= 0) { // Tầm bắn: Cũ 500 -> Mới 280
                enemyBullets.push(new EnemyBullet(this.x, this.y, target.x, target.y, 'arrow'));
                this.atkCD = 5.0; // Tốc độ bắn: Cũ 3.0s -> Mới 5.0s
            }
        }
        else if (this.type === 12) { // Cướp bắn đạn
            if (dist < 300) speed = 0;
            if (dist < 400 && this.atkCD <= 0) {
                enemyBullets.push(new EnemyBullet(this.x, this.y, target.x, target.y, 'arrow')); // Dùng lại đạn nỏ cho nhanh
                this.atkCD = 2.0;
            }
        }
        else if (this.type === 6) {
            if (dist < 400) speed = -30;
            if (this.spCD <= 0) {
                // Kiểm tra giới hạn đệ
                let summonCount = zombies.filter(z => z.type === 7 || z.type === 8).length;
                let maxSummons = 10 + currentLevel; // VD: Tối đa đệ trên bản đồ

                if (summonCount < maxSummons) {
                    zombies.push(new Zombie(this.x + 30, this.y + 30, 7));
                    zombies.push(new Zombie(this.x - 30, this.y - 30, 8));
                } else if (zombies.length < 120) {
                    // Nếu full đệ, gọi zombie thường (có trần để không tràn bản đồ)
                    zombies.push(new Zombie(this.x + 30, this.y + 30, 0));
                }

                this.spCD = 6.0;
                createParticles(this.x, this.y, '#8e44ad', 30, 200);
                spawnRing(this.x, this.y, '#9b59b6', 90, 0.4);
            }
        }
        else if (this.type === 3) {
            if (dist < 250 && this.spCD <= 0 && !this.isDashing) { this.isDashing = true; this.spCD = 3.0; this.knockback(Math.cos(ang) * 700, Math.sin(ang) * 700); }
            if (this.spCD > 2.5) createParticles(this.x, this.y, '#e67e22', 1, 0); else this.isDashing = false;
        }
        else if (this.type === 15) { // Nhầy nhụa sinh đệ nhỏ
            if (this.spCD <= 0) {
                if (zombies.filter(z => z.type === 7).length < 8 + currentLevel) zombies.push(new Zombie(this.x + 20, this.y + 20, 7)); // Đẻ zombie nhỏ (có trần)
                this.spCD = 4.0;
                createParticles(this.x, this.y, '#2ecc71', 20, 100);
            }
        }
        else if (this.type === 9) {
            if (dist < 150) speed = -50; // Cũ: 250
            if (dist < 250 && this.atkCD <= 0) { // Tầm bắn: Cũ 450 -> Mới 250
                for (let i = 0; i < 3; i++) enemyBullets.push(new EnemyBullet(this.x, this.y, target.x + (Math.random() - 0.5) * 150, target.y + (Math.random() - 0.5) * 150, 'shotgun'));
                if (Math.random() < 0.3) enemyBullets.push(new EnemyBullet(this.x, this.y, target.x, target.y, 'net'));
                this.atkCD = 3.5; // Tốc độ bắn: Cũ 2.0s -> Mới 3.5s
                addScreenShake(2);
            }
        }
        else if (this.type === 10) {
            if (dist < 400) speed *= 1.6;
            if (dist < 200 && this.spCD <= 0 && !this.isDashing) { this.isDashing = true; this.spCD = 4.0; this.knockback(Math.cos(ang) * 800, Math.sin(ang) * 800); }
            if (this.spCD > 3.5) createParticles(this.x, this.y, '#ff9f43', 1, 0); else this.isDashing = false;
        }

        this.x += (Math.cos(ang) * speed + this.kbX) * dt; this.y += (Math.sin(ang) * speed + this.kbY) * dt; resolveCollision(this);
        if (this.type !== 2 && this.type !== 6 && this.type !== 8 && this.type !== 9 && this.atkCD <= 0) {
            if (tank.active && dist < this.radius + tank.radius + 5 && tank.p2InvulnTimer <= 0) {
                let meleeDmgReduction = getTeamTagLevel('CHIẾN XA') >= 5 ? 0.2 : 1.0;
                tank.hp -= (this.type === 1 ? 30 : 10) * meleeDmgReduction;
                this.atkCD = 1.0;
            }
            else if (!tank.active) { for (let p of players) { if (!p.isDowned && Math.hypot(this.x - p.x, this.y - p.y) < this.radius + p.radius + 5) { p.takeDamage(this.type === 1 ? 25 : this.type === 4 ? 40 : 15); this.atkCD = 0.6; } } }

            if (typeof rescueNPCs !== 'undefined') {
                for (let n of rescueNPCs) {
                    if (n.hp > 0 && Math.hypot(this.x - n.x, this.y - n.y) < this.radius + n.radius + 5) {
                        n.takeDamage(this.type === 1 ? 22 : 10);
                        this.atkCD = 0.8;
                    }
                }
            }
            // Lính đồng minh cũng bị cắn (Tiên Phong mới thực sự "chịu đòn")
            for (let a of allies) {
                if (a.hp > 0 && this.atkCD <= 0 && Math.hypot(this.x - a.x, this.y - a.y) < this.radius + a.radius + 5) {
                    a.takeDamage(this.type === 1 ? 22 : (this.type === 4 ? 30 : 10));
                    this.atkCD = 0.8;
                }
            }
        }
    }
}

// Bắt đầu gồng lao húc: khoá hướng và hiện vạch cảnh báo (warnBeamTimer được đồng bộ sang khách)
function startZombieCharge(z, target, windup, reach = 520) {
    z.warnBeamTimer = windup;
    z.chargeAng = Math.atan2(target.y - z.y, target.x - z.x);
    z.targetX = z.x + Math.cos(z.chargeAng) * reach; z.targetY = z.y + Math.sin(z.chargeAng) * reach;
    createParticles(z.x, z.y, '#f9ca24', 14, 120);
}
// Đòn lao húc dùng chung (Crusher, Khổng Lồ): gồng -> lao thẳng theo hướng đã khoá -> đâm tường thì tự choáng.
// Trả về true khi zombie đang bận gồng/lao.
function updateZombieCharge(z, dt, cfg) {
    if (!z.isCharging) {
        if (!(z.warnBeamTimer > 0)) return false;
        z.warnBeamTimer -= dt;
        if (Math.random() < dt * 25) createParticles(z.x, z.y, '#f9ca24', 1, 90);
        if (z.warnBeamTimer <= 0) { z.isCharging = true; z.chargeLeft = cfg.time; Sound.play('tank'); }
        return true;
    }
    z.chargeLeft -= dt;
    let ox = z.x, oy = z.y, ca = Math.cos(z.chargeAng), sa = Math.sin(z.chargeAng);
    z.x += ca * cfg.speed * dt; z.y += sa * cfg.speed * dt;
    resolveCollision(z);
    let moved = Math.hypot(z.x - ox, z.y - oy);
    if (Math.random() < dt * 40) createParticles(z.x, z.y, '#95a5a6', 2, 120);
    // Gạt quái khác sang hai bên
    for (let other of zombies) {
        if (other !== z && !isBossType(other.type) && Math.hypot(z.x - other.x, z.y - other.y) < z.radius + other.radius + 20) {
            let side = Math.atan2(other.y - z.y, other.x - z.x);
            other.x += Math.cos(side) * 220 * dt; other.y += Math.sin(side) * 220 * dt;
        }
    }
    let hit = false;
    if (tank.active) {
        if (tank.p2InvulnTimer <= 0 && Math.hypot(z.x - tank.x, z.y - tank.y) < z.radius + tank.radius + 8) { tank.hp -= cfg.dmg; hit = true; }
    } else {
        for (let p of players) {
            if (p.isDowned || Math.hypot(z.x - p.x, z.y - p.y) > z.radius + p.radius + 10) continue;
            p.takeDamage(cfg.dmg); stunPlayer(p, cfg.stun);
            // Hất văng từng bước nhỏ để không bị đẩy xuyên tường / ra ngoài bản đồ
            for (let s = 0; s < 10; s++) { p.x += ca * cfg.push / 10; p.y += sa * cfg.push / 10; resolveCollision(p); }
            hit = true;
        }
    }
    for (let a of allies) if (a.hp > 0 && Math.hypot(z.x - a.x, z.y - a.y) < z.radius + a.radius + 8) { a.takeDamage(cfg.dmg * 0.6); hit = true; }
    for (let n of rescueNPCs) if (n.hp > 0 && Math.hypot(z.x - n.x, z.y - n.y) < z.radius + n.radius + 8) { n.takeDamage(cfg.dmg * 0.5); hit = true; }
    if (hit) {
        z.isCharging = false; z.atkCD = 0.8;
        addScreenShake(12); spawnRing(z.x, z.y, '#f39c12', z.radius + 80, 0.3);
    } else if (dt > 0 && moved < cfg.speed * dt * 0.35) {
        // Đâm vào tường: tự choáng, là lúc để người chơi phản công
        z.isCharging = false; z.chargeStun = cfg.selfStun;
        addScreenShake(10); createParticles(z.x, z.y, '#95a5a6', 26, 260); spawnRing(z.x, z.y, '#bdc3c7', z.radius + 60, 0.35);
        vfxList.push({ type: 'text', text: 'ĐÂM TƯỜNG - CHOÁNG!', x: z.x, y: z.y - z.radius - 20, life: 1.2, color: '#f1c40f' });
        Sound.play('hit');
    } else if (z.chargeLeft <= 0) z.isCharging = false;
    return true;
}
// Boss không tung liên tiếp cùng một chiêu
function pickBossSkill(z, opts) {
    let pool = opts.filter(s => s !== z.lastSkill);
    let s = pool[Math.floor(Math.random() * pool.length)] || opts[0];
    z.lastSkill = s;
    return s;
}
function bossSay(z, text, color) {
    vfxList.push({ type: 'text', text, x: z.x, y: z.y - z.radius - 44, life: 1.4, color: color || z.color });
}

function updateSpecialZombie(z, target, dist, ang, dt, speed) {
    // Tự choáng sau khi đâm tường (áp dụng cả với boss)
    if (z.chargeStun > 0) {
        z.chargeStun -= dt;
        if (Math.random() < dt * 20) createParticles(z.x, z.y - z.radius, '#f1c40f', 1, 40);
        z.x += z.kbX * dt; z.y += z.kbY * dt; resolveCollision(z);
        return true;
    }
    if (z.type >= 50) return updateDeadFamily(z, target, dist, ang, dt, speed); // The Dead & Tế Phẩm (10-thedead.js)
    if (z.type >= 40) return updateAnt(z, target, dist, ang, dt, speed); // loài kiến & Kiến Chúa (09-cave.js)
    const moveToward = (spd) => {
        z.x += (Math.cos(ang) * spd + z.kbX) * dt;
        z.y += (Math.sin(ang) * spd + z.kbY) * dt;
        resolveCollision(z);
    };
    const meleeHit = (dmg, cd = 0.8, stun = 0) => {
        if (z.atkCD > 0 || tank.active) return;
        for (let p of players) {
            if (!p.isDowned && Math.hypot(z.x - p.x, z.y - p.y) < z.radius + p.radius + 8) {
                p.takeDamage(dmg);
                if (stun) stunPlayer(p, stun);
                z.atkCD = cd;
            }
        }
    };
    // --- XỬ LÝ HIỆU ỨNG NHIỄM ĐIỆN CHO QUÁI VẬT HOẶC QUÁ TẢI SÉT ---
    let overload = getStatus(z, STATUS.OVERLOAD);
    if (overload) z.stunTimer = 0; // (hệ số tốc độ Quá Tải đã được nhân sẵn ở Zombie.update)

    // Check nếu đứng cạnh con Electrical (ID 28) dính nhiễm điện cấp tốc
    if (z.type !== 28) {
        for (let electrical of frameElectricals) {
            if (electrical.type === 28 && electrical.hp > 0 && Math.hypot(z.x - electrical.x, z.y - electrical.y) < 200) {
                applyStatus(z, STATUS.OVERLOAD, { duration: 1.0, stacks: 1, maxStacks: 5 });
            }
        }
    }

    // --- AI ĐỘC QUYỀN: WITCH (ID 26) ---
    // Thét khi phát hiện con mồi -> thu mình lấy đà (có vạch báo) -> vồ. Chỉ cú vồ mới gây SỢ HÃI.
    if (z.type === 26) {
        if (z.witchCooldown > 0) z.witchCooldown -= dt;

        if (!z.screamed && dist < 560) {
            z.screamed = true;
            if (Date.now() - lastWitchScreamTime > WITCH_SCREAM_COOLDOWN) {
                lastWitchScreamTime = Date.now();
                Sound.play('witch');
                spawnRing(z.x, z.y, '#ff007f', 150, 0.5);
                vfxList.push({ type: 'text', text: 'WITCH!', x: z.x, y: z.y - 30, life: 1.4, color: '#ff007f' });
            }
        }

        // Lấy đà: đứng yên, hướng vồ đã khoá nên có thể né ngang
        if (z.warnBeamTimer > 0) {
            z.warnBeamTimer -= dt;
            if (z.warnBeamTimer <= 0) { z.isLeaping = true; z.leapTimer = 0.45; createParticles(z.x, z.y, '#ff007f', 15, 120); }
            z.x += z.kbX * dt; z.y += z.kbY * dt; resolveCollision(z);
            return true;
        }

        if (z.isLeaping) {
            z.leapTimer -= dt;
            z.x += Math.cos(z.leapTargetAng) * 720 * dt;
            z.y += Math.sin(z.leapTargetAng) * 720 * dt;
            resolveCollision(z);
            createParticles(z.x, z.y, '#ff007f', 1, 10); // Hạt vệt bóng mờ theo sau
            for (let p of players) {
                if (!tank.active && !p.isDowned && Math.hypot(z.x - p.x, z.y - p.y) < z.radius + p.radius + 10) {
                    p.takeDamage(25);
                    applyPlayerStatus(p, STATUS.FEAR, { duration: 3.0, stacks: 1, maxStacks: 6 });
                    p.netTimer = Math.max(p.netTimer || 0, 1.0); // bị ghì chậm 1 giây
                    z.isLeaping = false; z.atkCD = 0.5;
                }
            }
            if (z.leapTimer <= 0) { z.isLeaping = false; z.atkCD = 0.6; } // vồ hụt: khựng lại một nhịp
            return true;
        }

        if (dist < 330 && dist > 70 && z.witchCooldown <= 0) {
            z.warnBeamTimer = 0.45; z.witchCooldown = 4.5;
            z.leapTargetAng = ang;
            z.targetX = z.x + Math.cos(ang) * 330; z.targetY = z.y + Math.sin(ang) * 330;
            return true;
        }

        moveToward(speed);
        meleeHit(10, 0.45);
        return true;
    }

    // --- AI ĐỘC QUYỀN: CRUSHER (ID 27) ---
    // Lao húc theo đường thẳng đã báo trước (đâm tường thì tự choáng) + dậm đất có vòng cảnh báo.
    if (z.type === 27) {
        if (updateZombieCharge(z, dt, { speed: 430, time: 1.3, dmg: 35, stun: 1.2, push: 150, selfStun: 1.6 })) return true;

        z.firstSightTimer -= dt;
        if (z.firstSightTimer <= 0 && dist < 520 && dist > 170 && hasLineOfSight(z.x, z.y, target.x, target.y)) {
            startZombieCharge(z, target, 0.8);
            z.firstSightTimer = 6.5;
            return true;
        }

        if (z.rootTimer > 0) { z.rootTimer -= dt; speed = 0; }
        else if (dist < 150 && z.atkCD <= 0) {
            hazards.push({ type: 'quake', x: z.x, y: z.y, radius: 165, timer: 0.6, life: 0.8, dmg: 30, stun: 0.5 });
            z.atkCD = 2.6; z.rootTimer = 0.6; speed = 0;
        }
        moveToward(speed);
        return true;
    }

    // --- AI ĐỘC QUYỀN: ELECTRICAL (ID 28) ---
    // Tích điện 0.55s (vòng báo) rồi phóng sét quanh mình; quái đứng gần được nạp QUÁ TẢI.
    if (z.type === 28) {
        moveToward(speed);
        if (dist < 170 && z.atkCD <= 0) {
            hazards.push({ type: 'strike', x: z.x, y: z.y, radius: 180, timer: 0.55, life: 0.8, dmg: 25, stun: 0.6 });
            z.atkCD = 3.0;
        }
        return true;
    }

    // --- AI ĐỘC QUYỀN: E.L (ID 29) ---
    if (z.type === 29) {
        if (z.warnBeamTimer > 0) {
            z.warnBeamTimer -= dt;
            speed = 0; // Đứng yên gồng tụ tia điện phóng
            if (z.warnBeamTimer <= 0) {
                // Khai hỏa bắn tia sét điện thẳng tắp gây choáng khống chế cứng
                enemyBullets.push(new EnemyBullet(z.x, z.y, z.targetX, z.targetY, 'electric'));
                z.atkCD = 3.5;
            }
        } else {
            if (dist < 400 && z.atkCD <= 0) {
                z.warnBeamTimer = 1.2; // Hiện đường thẳng cảnh báo trước 1.2s
                z.targetX = target.x;
                z.targetY = target.y;
            }
            moveToward(speed);
        }
        return true;
    }
    if (z.type === 33) {
        if (z.burrowed) {
            speed *= 0.85;
            z.hidden = true;
            if (dist < 120) {
                z.burrowed = false;
                z.hidden = false;
                z.emergeTimer = 0.5;
                z.stunTimer = 0.5;
                Sound.play('hit');
                createParticles(z.x, z.y, '#6b5b45', 28, 160);
                vfxList.push({ type: 'text', text: 'TRỒI LÊN!', x: z.x, y: z.y - 32, life: 0.7, color: '#d2b48c' });
            }
            moveToward(speed);
            return true;
        }
        if (z.emergeTimer > 0) {
            z.emergeTimer -= dt;
            speed = 0;
        }
        moveToward(speed);
        meleeHit(18, 0.75, 0);
        return true;
    }

    // Boomer biến thể: gồng 0.5s (vạch báo) -> lao thẳng -> nổ khi chạm; lao hụt thì loạng choạng
    if (z.type === 34) {
        if (z.warnBeamTimer > 0) {
            z.warnBeamTimer -= dt;
            createParticles(z.x, z.y, '#badc58', 1, 50);
            if (z.warnBeamTimer <= 0) z.dashTimer = 0.42;
            return true;
        }
        if (z.dashTimer > 0) {
            z.dashTimer -= dt;
            z.x += Math.cos(z.dashAng) * 760 * dt;
            z.y += Math.sin(z.dashAng) * 760 * dt;
            resolveCollision(z);
            createParticles(z.x, z.y, '#badc58', 2, 80);
            let boom = tank.active && Math.hypot(z.x - tank.x, z.y - tank.y) < z.radius + tank.radius + 8;
            for (let p of players) if (!tank.active && !p.isDowned && Math.hypot(z.x - p.x, z.y - p.y) < z.radius + p.radius + 10) boom = true;
            for (let a of allies) if (a.hp > 0 && Math.hypot(z.x - a.x, z.y - a.y) < z.radius + a.radius + 8) boom = true;
            if (boom) { explode(z.x, z.y, 150, 120); z.hp = 0; z.dashTimer = 0; }
            else if (z.dashTimer <= 0) z.stunTimer = 0.9;
            return true;
        }
        if (z.spCD <= 0 && dist < 260) {
            z.warnBeamTimer = 0.5; z.dashAng = ang;
            z.targetX = z.x + Math.cos(ang) * 320; z.targetY = z.y + Math.sin(ang) * 320;
            z.spCD = 4.6 + Math.random() * 0.6;
            createParticles(z.x, z.y, '#f9ca24', 14, 110);
            return true;
        }
        moveToward(speed);
        meleeHit(14, 0.65, 0);
        return true;
    }

    if (z.type === 16) {
        if (z.spCD <= 0 && dist < 420) {
            z.chargeTimer = 0.5; z.spCD = 3.4; z.dashAng = ang; createParticles(z.x, z.y, '#00d2d3', 18, 90);
            z.warnBeamTimer = 0.5; z.targetX = z.x + Math.cos(ang) * 300; z.targetY = z.y + Math.sin(ang) * 300; // vạch báo hướng lướt
        }
        if (z.warnBeamTimer > 0) z.warnBeamTimer -= dt;
        if (z.chargeTimer > 0) { z.chargeTimer -= dt; if (z.chargeTimer <= 0) z.knockback(Math.cos(z.dashAng) * 1100, Math.sin(z.dashAng) * 1100); return true; }
        moveToward(speed * 1.15);
        meleeHit(18, 0.9, 0.75);
        return true;
    }
    if (z.type === 17) {
        if (dist < 260) speed = -45;
        if (dist < 620 && z.atkCD <= 0) { enemyBullets.push(new EnemyBullet(z.x, z.y, target.x, target.y, 'electric')); z.atkCD = 2.6; createParticles(z.x, z.y, '#54a0ff', 8, 80); }
        moveToward(speed);
        return true;
    }
    if (z.type === 18) {
        if (dist < 230) speed = -35;
        if (dist < 560 && z.atkCD <= 0) {
            enemyBullets.push(new EnemyBullet(z.x, z.y, target.x, target.y, 'acid'));
            z.atkCD = 2.1;
        }
        if (dist < 420 && z.spCD <= 0) {
            fireZones.push({ kind: 'acid', x: target.x, y: target.y, life: 4.5, dmg: 12, source: null, radius: 95 });
            z.spCD = 5.0;
            createParticles(z.x, z.y, '#2ecc71', 20, 120);
        }
        moveToward(speed);
        return true;
    }
    if (z.type === 20) {
        moveToward(speed * 0.9);
        if (z.atkCD <= 0 && !tank.active) {
            for (let p of players) if (!p.isDowned && Math.hypot(z.x - p.x, z.y - p.y) < z.radius + p.radius + 6) { p.takeDamage(9999); z.atkCD = 2.5; addScreenShake(12); }
        }
        return true;
    }
    if (z.type === 21) {
        moveToward(speed * (darknessBattery < 35 ? 1.4 : 1.0));
        if (dist < z.radius + target.radius + 12 && !tank.active) {
            if (typeof target.takeDamage === 'function') target.takeDamage(22);
            if (target instanceof Player) applyPlayerStatus(target, STATUS.FEAR, { duration: 2.0, stacks: 1, maxStacks: 6 });
            darknessFlash = 1.0; z.hp = 0; z._credited = true; addScreenShake(10);
        }
        return true;
    }
    if (z.type === 22) {
        if (z.spCD <= 0 && dist < 360) { z.spCD = 2.6; z.knockback(Math.cos(ang) * 760, Math.sin(ang) * 760); createParticles(z.x, z.y, '#dff9fb', 8, 60); }
        moveToward(speed * 1.2);
        meleeHit(20, 0.55, 0);
        return true;
    }
    // ================== BOSS: KHỔNG LỒ (30) ==================
    // Chọn chiêu theo khoảng cách: gần thì dậm đất, xa thì ném đá / lao húc. Pha 2 thêm mưa đá và ra chiêu nhanh hơn.
    if (z.type === 30) {
        if (!z.phase2Done && z.hp < z.maxHp * 0.5) {
            z.phase2Done = true; z.color = '#e17055'; z.spCD = 1.4; z.isCharging = false; z.warnBeamTimer = 0;
            spawnAtEdge(0, 8);
            hazards.push({ type: 'quake', x: z.x, y: z.y, radius: 270, timer: 0.9, life: 1.1, dmg: 60, stun: 0.6 });
            z.rootTimer = 0.9;
            bossSay(z, 'CUỒNG NỘ!', '#ff4757'); Sound.play('roar'); addScreenShake(14);
        }
        if (updateZombieCharge(z, dt, { speed: 520, time: 1.5, dmg: 70, stun: 1.0, push: 200, selfStun: 2.2 })) return true;
        if (z.rootTimer > 0) { z.rootTimer -= dt; z.x += z.kbX * dt; z.y += z.kbY * dt; resolveCollision(z); return true; }
        if (z.spCD <= 0) {
            let opts = dist < 300 ? ['slam', 'slam', 'rocks', 'summon'] : ['throw', 'throw', 'rocks', 'charge', 'summon', 'mud'];
            if (z.phase2Done) opts.push('charge', 'rain');
            let skill = pickBossSkill(z, opts);
            if (skill === 'summon' && zombies.length > 90) skill = dist < 300 ? 'slam' : 'throw';
            if (skill === 'slam') {
                hazards.push({ type: 'quake', x: z.x, y: z.y, radius: 250, timer: 0.9, life: 1.1, dmg: 85, stun: 0.8 });
                z.rootTimer = 0.9; bossSay(z, 'DẬM ĐẤT!');
            } else if (skill === 'throw') {
                let n = z.phase2Done ? 5 : 3;
                for (let k = 0; k < n; k++) { let a = ang + (k - (n - 1) / 2) * 0.2; enemyBullets.push(new EnemyBullet(z.x, z.y, z.x + Math.cos(a) * 100, z.y + Math.sin(a) * 100, 'rock')); }
                z.rootTimer = 0.35; Sound.play('throw'); bossSay(z, 'NÉM ĐÁ!');
            } else if (skill === 'rocks') {
                // Một tảng rơi vào chỗ đang đứng, hai tảng chặn hai bên
                hazards.push({ type: 'rock', x: target.x, y: target.y, radius: 140, timer: 0.9, life: 1.1, dmg: 110 });
                for (let k = -1; k <= 1; k += 2) hazards.push({ type: 'rock', x: target.x + Math.cos(ang + k * 1.57) * 230, y: target.y + Math.sin(ang + k * 1.57) * 230, radius: 120, timer: 1.25, life: 1.45, dmg: 100 });
                bossSay(z, 'ĐÁ RƠI!');
            } else if (skill === 'charge') {
                startZombieCharge(z, target, 0.9, 700); bossSay(z, 'LAO HÚC!');
            } else if (skill === 'summon') {
                spawnAtEdge(7, 5 + Math.floor(currentLevel / 2)); Sound.play('roar'); bossSay(z, 'GỌI BẦY!');
                spawnRing(z.x, z.y, z.color, 260, 0.6, 6);
            } else if (skill === 'mud') {
                hazards.push({ type: 'slow', x: target.x, y: target.y, radius: 220, life: 5.0, dmg: 10 });
                bossSay(z, 'BÙN LẦY!');
            } else { // rain: mưa đá rải quanh mục tiêu
                for (let k = 0; k < 6; k++) hazards.push({ type: 'rock', x: target.x + (Math.random() - 0.5) * 640, y: target.y + (Math.random() - 0.5) * 640, radius: 115, timer: 0.8 + k * 0.25, life: 2.6, dmg: 100 });
                bossSay(z, 'MƯA ĐÁ!');
            }
            z.spCD = z.phase2Done ? 2.4 : 3.4;
        }
        moveToward(speed * (z.phase2Done ? 1.2 : 1));
        meleeHit(55, 1.1, 0.35);
        return true;
    }

    // ================== BOSS: LÕI QUÁ TẢI (31) ==================
    if (z.type === 31) {
        if (!z.phase2Done && z.hp < z.maxHp * 0.5) {
            z.phase2Done = true; z.color = '#ff6b35'; z.spCD = 1.5;
            hazards.push({ type: 'emp', x: z.x, y: z.y, radius: 420, timer: 1.2, life: 1.4, dmg: 22 });
            bossSay(z, 'QUÁ TẢI!', '#ff6b35'); Sound.play('roar'); addScreenShake(14);
        }
        if (z.spCD <= 0) {
            let opts = ['zone', 'bolt', 'cage', 'emp', 'strikes'];
            if (dist > 240) opts.push('magnet');
            if (z.phase2Done) { opts.push('beam', 'strikes'); if (zombies.length > 4) opts.push('overcharge'); }
            let skill = pickBossSkill(z, opts);
            if (skill === 'zone') {
                hazards.push({ type: 'electric', x: target.x, y: target.y, radius: 95, life: 2.2, dmg: 18, stun: 0.35 });
                if (z.phase2Done) for (let k = 0; k < 2; k++) { let a = Math.random() * Math.PI * 2; hazards.push({ type: 'electric', x: target.x + Math.cos(a) * 210, y: target.y + Math.sin(a) * 210, radius: 85, life: 2.2, dmg: 18, stun: 0.35 }); }
                bossSay(z, 'VÙNG ĐIỆN!');
            } else if (skill === 'bolt') {
                let n = z.phase2Done ? 5 : 3;
                for (let k = 0; k < n; k++) { let a = ang + (k - (n - 1) / 2) * 0.24; enemyBullets.push(new EnemyBullet(z.x, z.y, z.x + Math.cos(a) * 100, z.y + Math.sin(a) * 100, 'electric')); }
                Sound.play('plasma'); bossSay(z, 'CẦU SÉT!');
            } else if (skill === 'magnet') {
                hazards.push({ type: 'magnet', x: z.x, y: z.y, radius: z.radius + 30, range: 700, life: 2.0, power: 300 });
                bossSay(z, 'HÚT TỪ TRƯỜNG!');
            } else if (skill === 'cage') {
                let pts = []; for (let i = 0; i < 4; i++) pts.push({ x: target.x + Math.cos(i * Math.PI / 2) * 150, y: target.y + Math.sin(i * Math.PI / 2) * 150 });
                hazards.push({ type: 'cage', points: pts, timer: 0.9, life: 4.0, dmg: 12 });
                bossSay(z, 'LỒNG ĐIỆN!');
            } else if (skill === 'emp') {
                hazards.push({ type: 'emp', x: z.x, y: z.y, radius: 380, timer: 1.4, life: 1.6, dmg: 18 });
                bossSay(z, 'XUNG EMP!');
            } else if (skill === 'strikes') {
                // Chuỗi sét đuổi theo: mỗi tia đánh vào vị trí hiện tại, phải chạy liên tục
                for (let k = 0; k < 5; k++) hazards.push({ type: 'strike', x: target.x + (Math.random() - 0.5) * 110, y: target.y + (Math.random() - 0.5) * 110, radius: 88, timer: 0.6 + k * 0.28, life: 2.2, dmg: 38 });
                bossSay(z, 'CHUỖI SÉT!');
            } else if (skill === 'overcharge') {
                let targets = zombies.filter(e => e !== z && e.hp > 0).sort(() => Math.random() - 0.5).slice(0, 5);
                for (let e of targets) {
                    hazards.push({ type: 'strike', x: e.x, y: e.y, radius: 80, timer: 0.45, life: 1.5, dmg: 0, stun: 0 });
                    applyStatus(e, 'overload', { duration: 8.0, stacks: 2, maxStacks: 5 });
                    e.isFrenzied = Math.max(e.isFrenzied || 0, 5.0);
                }
                bossSay(z, 'SÉT CƯỜNG HOÁ!');
            } else { // beam: tia quét bắt đầu lệch 90 độ so với mục tiêu để kịp né
                hazards.push({ type: 'beam', x: z.x, y: z.y, angle: ang - Math.PI / 2, rot: 1.8, life: 2.2, dmg: 95 });
                bossSay(z, 'TIA QUÉT!');
            }
            z.spCD = z.phase2Done ? 1.9 : 2.7;
        }
        moveToward(speed * (z.phase2Done ? 1.15 : 0.9));
        meleeHit(34, 0.8, 0.6);
        return true;
    }

    // ================== BOSS: THE LEADER (32) ==================
    if (z.type === 32) {
        if (!z.phase2Done && z.hp < z.maxHp * 0.5) {
            z.phase2Done = true; z.color = '#c0392b'; z.spCD = 1.5;
            spawnAtEdge(20, 1); spawnAtEdge(4, 2);
            bossSay(z, 'TỔNG TẤN CÔNG!', '#ff4757'); Sound.play('roar'); addScreenShake(12);
        }
        if (z.spCD <= 0) {
            let opts = ['frenzy', 'mark', 'firewall'];
            if (zombies.length < 90) opts.push('reinforce', 'reinforce');
            if (zombies.length > 3) opts.push('guard');
            if (z.phase2Done) { opts.push('artillery', 'artillery'); if (zombies.length < 90) opts.push('elite'); }
            let skill = pickBossSkill(z, opts);
            if (skill === 'reinforce') {
                spawnAtEdge(12, 4 + Math.floor(Math.random() * 3)); spawnAtEdge(0, 6);
                bossSay(z, 'TIẾP VIỆN!');
            } else if (skill === 'frenzy') {
                for (let e of zombies) if (e !== z && Math.hypot(e.x - z.x, e.y - z.y) < 900) e.isFrenzied = 5.0;
                spawnRing(z.x, z.y, '#ff4757', 420, 0.6, 6); Sound.play('roar');
                bossSay(z, 'CUỒNG NỘ!');
            } else if (skill === 'mark') {
                let mp = (target instanceof Player) ? target : players.find(p => !p.isDowned);
                if (mp) { mp.markedTimer = 5.0; vfxList.push({ type: 'text', text: 'BỊ ĐÁNH DẤU!', x: mp.x, y: mp.y - 45, life: 1.3, color: '#ff4757' }); spawnRing(mp.x, mp.y, '#ff4757', 90, 0.5); }
            } else if (skill === 'guard') {
                let guards = zombies.filter(e => e !== z && !isBossType(e.type) && !e.hidden).sort((a, b) => Math.hypot(a.x - z.x, a.y - z.y) - Math.hypot(b.x - z.x, b.y - z.y)).slice(0, 3);
                guards.forEach((g, idx) => { g.shieldBoss = z; g.shieldSlot = idx; });
                bossSay(z, 'LÁ CHẮN SỐNG!');
            } else if (skill === 'firewall') {
                // Vòng lửa vây quanh (không rơi thẳng vào người) để ép hướng di chuyển
                let base = Math.random() * Math.PI * 2;
                for (let k = 0; k < 4; k++) { let a = base + k * Math.PI / 2, r = 190 + Math.random() * 70; fireZones.push({ x: target.x + Math.cos(a) * r, y: target.y + Math.sin(a) * r, life: 7.0, dmg: 36, source: null, radius: 100 }); }
                bossSay(z, 'VÒNG LỬA!');
            } else if (skill === 'elite') {
                spawnAtEdge(20, 1); spawnAtEdge(14, 2);
                bossSay(z, 'ĐỘI TINH NHUỆ!');
            } else {
                for (let k = 0; k < 5; k++) hazards.push({ type: 'artillery', x: target.x + (Math.random() - 0.5) * 140, y: target.y + (Math.random() - 0.5) * 140, radius: 145, timer: 1.0 + k * 0.35, life: 2.5, dmg: 140 });
                bossSay(z, 'PHÁO KÍCH!');
            }
            z.spCD = z.phase2Done ? 2.2 : 3.0;
        }
        if (dist < 360) speed = -25;
        if (dist < 580 && z.atkCD <= 0) { enemyBullets.push(new EnemyBullet(z.x, z.y, target.x, target.y, z.phase2Done ? 'rocket' : 'arrow')); z.atkCD = z.phase2Done ? 2.0 : 1.25; }
        moveToward(speed);
        meleeHit(24, 0.9, 0);
        return true;
    }
    return false;
}

function getNearestZombie(x, y, range, checkWall = false) {
    let near = null, min = range;
    for (let z of zombies) {
        let d = Math.hypot(z.x - x, z.y - y);
        if (z.hidden || z.flying) continue;
        if (pointInBush(z.x, z.y) && !pointInBush(x, y) && d > 95) continue;
        if (z.type === 5 && d > 120) continue;
        if (d < min) {
            // Nếu có yêu cầu check tường và hàm trả về false (có tường) thì bỏ qua quái này
            if (checkWall && !hasLineOfSight(x, y, z.x, z.y)) continue;
            min = d; near = z;
        }
    }
    return near;
}
// THAY THẾ TOÀN BỘ HÀM explode BẰNG HÀM NÀY
// friendly = true: vụ nổ của phe ta, không gây sát thương lên người chơi / xe tăng
function explode(x, y, radius, dmg, source = null, friendly = false) {
    Sound.play('explode');
    let finalRadius = radius;
    let selfDmgMult = 0.4;
    let dmgMult = 1.0;

    // Logic Tag NỔ
    let expTagLvl = (source && source.tags) ? (source.tags['NỔ'] || 0) : getTeamTagLevel('NỔ');
    if (expTagLvl >= 1) { selfDmgMult -= 0.10; dmgMult += 0.10; } // Giảm 10%, Tăng 10%
    if (expTagLvl >= 2) { selfDmgMult -= 0.10; dmgMult += 0.05; } // Tổng Giảm 20%, Tăng 15%
    if (expTagLvl >= 4) { selfDmgMult -= 0.20; dmgMult += 0.15; } // Tổng Giảm 40%, Tăng 30%
    if (expTagLvl >= 6) { selfDmgMult -= 0.20; dmgMult += 0.20; finalRadius *= 1.5; } // Tổng Giảm 60%, Tăng 50%, Phạm vi +50%

    // Ngăn chặn selfDmgMult bị âm
    selfDmgMult = Math.max(0, selfDmgMult);

    if (source && source.perks && source.perks.t_explo) {
        finalRadius *= 1.5;
        selfDmgMult *= 0.25;
    }

    if (tank.active) {
        if (getTeamTagLevel('CHIẾN XA') >= 1) selfDmgMult = 0;
        else selfDmgMult *= 0.5;
    }

    createParticles(x, y, '#e67e22', 40, 600); createParticles(x, y, '#e74c3c', 22, 400); createParticles(x, y, '#636e72', 14, 220);
    spawnRing(x, y, '#ffd28a', finalRadius, 0.35, 6);
    vfxList.push({ type: 'flash', x, y, r: finalRadius * 0.85, life: 0.2, max: 0.2 });
    addDecal(x, y, '#111111', finalRadius * 0.38, 0.4);
    addScreenShake(Math.min(18, 6 + finalRadius / 25));

    let finalDmg = dmg * dmgMult;
    caveOnExplosion(x, y, finalRadius, finalDmg); // hang/hầm mỏ: nổ lan thùng thuốc nổ, phá đá chặn, lở đá

    // Tag Nổ Cấp 4: Nổ để lại vệt lửa
    if (expTagLvl >= 4 && Math.random() < 0.5) {
        fireZones.push({ x: x, y: y, life: 2.0, dmg: finalDmg * 0.2, source: source, radius: finalRadius * 0.5 });
    }

    if (tank.active && getTeamTagLevel('CHIẾN XA') >= 5 && Math.random() < 0.5) {
        // Đã neft vùng lửa mốc 5 nhỏ hơn (0.6 -> 0.3)
        fireZones.push({ x: x, y: y, life: 3.0, dmg: 100, source: source, radius: finalRadius * 0.2 });
    }

    for (let z of zombies) {
        if (z.type === 14 || z.hp <= 0 || z.flying) continue; // Bọc thép: MIỄN NHIỄM NỔ 100%; kiến đang bay: không trúng
        z._expHit = true;
        let d = Math.hypot(z.x - x, z.y - y); if (d < finalRadius + z.radius) {
            z.hp -= finalDmg * Math.max(0.15, 1 - d / finalRadius); z.knockback(Math.cos(Math.atan2(z.y - y, z.x - x)) * 1000, Math.sin(Math.atan2(z.y - y, z.x - x)) * 1000);
            if (source instanceof Player) z.lastHitBy = source;
            if (z.hp <= 0 && zombieDown(z, source) && tank.active) globalTankKills++;
        }
    }
    if (friendly) return;
    if (!tank.active) {
        for (let p of players) {
            if (!p.isDowned) {
                let d = Math.hypot(p.x - x, p.y - y);
                if (d < finalRadius) {
                    // Tag Nổ Cấp 6: Không sát thương đồng minh
                    if (expTagLvl >= 6 && source && p.id !== source.id) continue;
                    p.takeDamage((dmg * selfDmgMult) * (1 - d / finalRadius));
                }
            }
        }
    }
    else if (tank.p2InvulnTimer <= 0) {
        let d = Math.hypot(tank.x - x, tank.y - y);
        if (d < finalRadius) tank.hp -= (dmg * selfDmgMult) * (1 - d / finalRadius);
    }
}
const GLOW_COLORS = new Set(['#00d2d3', '#00ffff', '#f1c40f', '#e67e22', '#ff9f43', '#f9ca24', '#48dbfb', '#ff007f', '#e056fd', '#feca57', '#54a0ff', '#9b59b6', '#ff6b35', '#2ecc71', '#3498db', '#dff9fb']);
const MAX_PARTICLES = 700;
function createParticles(x, y, c, count, spd) {
    if (NET.mode === 'guest' && !NET.applying) return;
    if (NET.mode === 'host' && count >= 3 && NET.ev.length < 80) NET.ev.push(['p', Math.round(x), Math.round(y), c, Math.min(count, 40), spd]);
    if (particles.length > MAX_PARTICLES) count = Math.ceil(count / 4);
    let glow = GLOW_COLORS.has(c);
    for (let i = 0; i < count; i++) {
        let a = Math.random() * Math.PI * 2, s = Math.random() * spd * 1.5;
        particles.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.7 + Math.random() * 0.5, c: c, sz: Math.random() * 3 + 2, g: glow });
    }
}
