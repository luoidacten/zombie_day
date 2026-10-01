document.addEventListener('touchmove', e => {
    if (e.cancelable) e.preventDefault();
}, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

// --- 1. KHAI BÁO UI NGHỆ THUẬT LÊN ĐẦU ---
const UI = {
    p1Stick: { active: false, cx: 0, cy: 0, id: null, dx: 0, dy: 0, baseX: 0, baseY: 0 },
    p1BtnA: { pressed: false, justPressed: false, justReleased: false, id: null, x: 0, y: 0 },
    p1BtnB: { pressed: false, justPressed: false, justReleased: false, id: null, x: 0, y: 0 },
    p1BtnC: { pressed: false, justPressed: false, justReleased: false, id: null, x: 0, y: 0 },
    p1BtnD: { pressed: false, justPressed: false, justReleased: false, id: null, x: 0, y: 0 },
    p2Stick: { active: false, cx: 0, cy: 0, id: null, dx: 0, dy: 0, baseX: 0, baseY: 0 },
    p2BtnA: { pressed: false, justPressed: false, justReleased: false, id: null, x: 0, y: 0 },
    p2BtnB: { pressed: false, justPressed: false, justReleased: false, id: null, x: 0, y: 0 },
    p2BtnC: { pressed: false, justPressed: false, justReleased: false, id: null, x: 0, y: 0 },
    p2BtnD: { pressed: false, justPressed: false, justReleased: false, id: null, x: 0, y: 0 }
};

// --- 2. KHAI BÁO PC_INPUT LÊN ĐẦU ---
const PC_INPUT = {
    keys: new Set(),
    pointer: { active: false, x: window.innerWidth / 2, y: window.innerHeight / 2 },
    buttons: { A: new Set(), B: new Set(), C: new Set(), D: new Set() }
};

// --- 3. KHAI BÁO CANVAS & CONTEXT ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let W = canvas.width = window.innerWidth;
let H = canvas.height = window.innerHeight;
window.addEventListener('resize', () => {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    if (gameState === 'PLAYING') initControls();
});
// 3. Khai báo Module Sound lên đầu (Đưa toàn bộ đoạn const Sound = ... lên đây)
const Sound = (() => {
    let ctx = null, master = null, sfxGain = null, ambienceGain = null;
    const lastPlayed = {};
    // ---- ÂM THANH TỪ FILE (thư mục Audio-SoundEffect) ----
    // File nào thiếu/lỗi thì tự động dùng lại âm tổng hợp cũ.
    const AUDIO_DIR = 'Audio-SoundEffect/';

    // Nhạc nền theo bối cảnh
    const MUSIC = {
        theme: 'menu_OST (2).mp3',                // menu / màn tử trận
        map_am: 'map-AM.mp3',                     // map ban ngày
        map_pm: 'map-PM.mp3',                     // map tối, sương mù
        map_rain: 'Map-PM2-Rain.mp3',             // mưa, bão sét, mưa acid
        map_electric: 'map-Electric.mp3',         // Nhà Máy Điện, bão điện từ
        map_random: 'map_ngẫunhieen.mp3',         // các map còn lại
        boss: 'Boss_ost1.mp3',
        boss_electric: 'Boss_ost_Electric.mp3',
        boss_pm: 'Boss_ost_PM_MAP.mp3',
        boss_insect: 'Insetboss.mp3',             // Kiến Chúa
        dead1: 'theDead_1.mp3',                   // The Dead
        dead2: 'theDead_2.mp3'                    // The Dead dưới 50% máu
    };
    const MUSIC_VOL = 0.24;

    // Hiệu ứng một lần. s/e = điểm bắt đầu/kết thúc (giây) đã đo trên sóng âm để bỏ khoảng lặng đầu file,
    // v = âm lượng (đã cân theo độ to thật của từng file), gap = giãn cách tối thiểu (ms),
    // keep = không cắt ngang tiếng đang phát, rate = khoảng cao độ ngẫu nhiên, segs = nhiều đoạn chọn ngẫu nhiên.
    const SFX = {
        kill: { f: 'zombie-die.mp3', s: 0.34, e: 1.32, v: 0.6, gap: 380, voices: 2, keep: true, rate: [0.9, 1.12] },
        zombie_groan: { f: 'dragon-studio-zombie-sound-2-357976.mp3', g: 'amb', s: 0.5, e: 7.9, v: 0.3, gap: 4000, voices: 1, keep: true },
        witch: { f: '-female-zombie-screams-witch.mp3', g: 'amb', segs: [[0.3, 7.4], [8.4, 15.4], [16.3, 24.0], [25.0, 28.7]], v: 0.5, gap: 6000, voices: 1, keep: true },
        sniper: { f: 'gun-Sniper.mp3', s: 0.06, e: 1.3, v: 0.55, gap: 200, voices: 2 },
        ar: { f: 'Ar_gun.mp3', s: 0, e: 0.9, v: 0.4, gap: 95, voices: 4, rate: [0.97, 1.03] },
        smg: { f: 'SMG_gun.mp3', s: 0, e: 0.34, v: 0.42, gap: 75, voices: 4, rate: [0.96, 1.05] },
        bow: { f: 'bow_shoot.mp3', s: 0.42, e: 0.9, v: 0.85, gap: 120, voices: 2 },
        laser: { f: 'voicebosch-laser-gun-174976.mp3', s: 0.5, e: 1.5, v: 0.4, gap: 150, voices: 3 },
        plasma: { f: 'lordsonny-plasma-gun-fire-162136.mp3', s: 0.34, e: 1.45, v: 0.2, gap: 220, voices: 2 },
        charge_up: { f: 'yodguard-energy-charge-2-482499.mp3', s: 0.06, e: 2.85, v: 0.5, gap: 500, voices: 1 },
        reload_small: { f: 'reaload_smallsgun.mp3', s: 0.54, e: 1.1, v: 0.6, gap: 150, voices: 2 },
        reload_big: { f: 'reload_bigGun.mp3', s: 0.14, e: 1.2, v: 0.6, gap: 150, voices: 2 },
        heal: { f: 'heal_medkit.mp3', s: 0.14, e: 1.5, v: 1.0, gap: 900, voices: 1, keep: true },
        levelup: { f: 'sunovia-level-up-289723.mp3', s: 0.22, e: 1.2, v: 1.0, gap: 400, voices: 1 },
        pick: { f: 'shoping-pick_lõi.mp3', s: 0.12, e: 0.75, v: 1.0, gap: 120, voices: 2 },
        explosion: { f: 'soundreality-explosion-fx-343683.mp3', s: 0.12, e: 2.5, v: 0.4, gap: 140, voices: 4 },
        lightning: { f: 'dragon-studio-lightning-strike-386161.mp3', g: 'amb', s: 0.1, e: 1.1, v: 0.55, gap: 300, voices: 3, rate: [0.92, 1.08] },
        thunder: { f: 'freesound_community-thunder-big-30291.mp3', g: 'amb', s: 0.7, e: 11.4, v: 0.55, gap: 9000, voices: 1, keep: true },
        // Cận chiến: mỗi nhóm vũ khí một tiếng chém
        slash: { f: 'chém1.mp3', s: 0.12, e: 0.42, v: 0.5, gap: 90, voices: 3, rate: [0.94, 1.08] },
        slash_heavy: { f: 'chém2.mp3', s: 0.22, e: 0.78, v: 0.6, gap: 140, voices: 2, rate: [0.9, 1.05] },
        stab: { f: 'freesound_community-sword-sound-2-36274.mp3', s: 0.14, e: 0.42, v: 1.0, gap: 80, voices: 3, rate: [0.95, 1.1] },
        saber: { f: 'lightsaber3-chém.mp3', s: 0.2, e: 0.95, v: 0.32, gap: 120, voices: 3, rate: [0.95, 1.06] },
        pick_melee: { f: 'lấy vũ khi cận chiện.mp3', s: 0.28, e: 0.72, v: 0.9, gap: 150, voices: 2 },
        insect: { f: 'yodguard-giant-insect-hurts-580963.mp3', s: 0.02, e: 0.46, v: 0.4, gap: 260, voices: 2, keep: true, rate: [0.9, 1.25] },
        waterdrop: { f: 'dragon-studio-waterdrop-406639.mp3', g: 'amb', s: 0, e: 0.4, v: 1.0, gap: 500, voices: 2, rate: [0.8, 1.3] },
        boss_intro: { f: 'freesound_community-boss-intro-02-72039.mp3', g: 'amb', s: 0, e: 8.2, v: 0.5, gap: 8000, voices: 1, keep: true },
        dead_offering: { f: 'skillTheDead_tế phẩm.mp3', s: 0.16, e: 3.2, v: 1.0, gap: 1500, voices: 1 },
        dead_sacrifice: { f: 'Skill_hiến tế của Dead.mp3', s: 0.38, e: 2.7, v: 0.6, gap: 1500, voices: 1 },
        heli_arrive: { f: 'dragon-studio-helicopter-sound-8d-372463.mp3', g: 'amb', s: 0.2, e: 8.7, v: 0.45, gap: 3000, voices: 1, keep: true }
    };

    // Tiếng lặp: ls/le = vùng lặp (bỏ phần mở đầu & đuôi im lặng), fade = tốc độ tắt/mở mỗi 50ms
    const LOOPS = {
        flame: { f: 'alex_jauk-flamethrower-sound-effect-421402.mp3', ls: 1.0, le: 6.2, fade: 0.06 },
        minigun: { f: 'galling.mp3', ls: 0.62, le: 4.4, fade: 0.12 },
        spray: { f: 'gun-các_sung_xấy_khác.mp3', ls: 0.6, le: 4.38, fade: 0.12, rate: 1.18 },
        heli: { f: 'gd_salman-helicopter-ambience-353004.mp3', g: 'amb', ls: 0.5, le: 19.5, fade: 0.03 },
        rain: { f: 'lofivision-rain-and-thunder-321270.mp3', g: 'amb', ls: 1.0, fade: 0.015 },
        cave: { f: 'dragon-studio-droplets-in-a-cave-482871.mp3', g: 'amb', ls: 0.6, le: 5.9, fade: 0.02 }
    };

    const broken = {}, pools = {}, lastFile = {}, loops = {}, fading = [], holdUntil = {};
    let muted = false, music = null, musicKey = null, wantMusic = 'theme', unlocked = false;
    // 3 nhóm âm lượng chỉnh riêng (0..1): nhạc nền / hiệu ứng (súng, nổ, giao diện) / môi trường (mưa, sấm, trực thăng, tiếng zombie)
    const vol = { music: 1, sfx: 1, amb: 1 };
    let killMuted = false;
    try { let sv = JSON.parse(localStorage.getItem('zs_audio') || '{}'); for (let k in vol) if (typeof sv[k] === 'number') vol[k] = Math.max(0, Math.min(1, sv[k])); killMuted = !!sv.killMuted; } catch (e) { }
    function saveSettings() { try { localStorage.setItem('zs_audio', JSON.stringify({ music: vol.music, sfx: vol.sfx, amb: vol.amb, killMuted })); } catch (e) { } }
    function setVolume(group, v) {
        if (!(group in vol)) return;
        vol[group] = Math.max(0, Math.min(1, +v || 0));
        if (group === 'music' && music) music._target = MUSIC_VOL * vol.music;
        if (group === 'sfx' && sfxGain) sfxGain.gain.value = 0.9 * vol.sfx;
        saveSettings();
    }
    function setKillMuted(b) { killMuted = !!b; saveSettings(); }

    function makeAudio(file, key) {
        let a = new Audio(AUDIO_DIR + file);
        a.preload = 'auto';
        a.addEventListener('error', () => { broken[key] = true; });
        return a;
    }

    function startAt(a, t) {
        const go = () => { try { a.currentTime = t; } catch (e) { } a.play().catch(() => { }); };
        if (a.readyState >= 1) go(); else a.addEventListener('loadedmetadata', go, { once: true });
    }

    function sfxFile(key, volMult = 1) {
        let d = SFX[key];
        if (!d || broken[key]) return false;
        if (muted) return true;
        let t = performance.now();
        if (lastFile[key] && t - lastFile[key] < d.gap) return true;
        let pool = pools[key] || (pools[key] = []);
        let a = pool.find(x => x.paused || x.ended || t >= x._end);
        if (!a) {
            if (pool.length < (d.voices || 2)) { a = makeAudio(d.f, key); pool.push(a); }
            else if (d.keep) return true;                      // đang phát đủ tiếng: bỏ qua thay vì cắt ngang
            else { a = pool.shift(); pool.push(a); }
        }
        lastFile[key] = t;
        let seg = d.segs ? d.segs[Math.floor(Math.random() * d.segs.length)] : [d.s, d.e];
        let rate = d.rate ? d.rate[0] + Math.random() * (d.rate[1] - d.rate[0]) : 1;
        a.preservesPitch = false; a.playbackRate = rate;
        a._vol = Math.max(0, Math.min(1, d.v * volMult * vol[d.g || 'sfx'])); a.volume = a._vol;
        if (a._vol <= 0.004) return true;
        a._end = t + (seg[1] - seg[0]) * 1000 / rate;
        startAt(a, seg[0]);
        return true;
    }
    function sfxStop(key) { let pool = pools[key]; if (pool) for (let a of pool) a._end = 0; }

    // Tiếng lặp: bật/tắt mềm theo trạng thái game
    function setLoop(key, on, volume = 0.4) {
        let d = LOOPS[key];
        if (!d || broken[key]) return;
        let L = loops[key];
        if (on && !muted && unlocked) {
            if (!L) { L = loops[key] = makeAudio(d.f, key); L.loop = true; L.volume = 0; L.preservesPitch = false; L.playbackRate = d.rate || 1; }
            L._target = volume * vol[d.g || 'sfx'];
            if (L.paused && L._target > 0) startAt(L, d.ls || 0);
        } else if (L) L._target = 0;
    }

    // Nhạc nền: chuyển bài có làm mờ dần
    function playMusic(key) {
        wantMusic = key;
        if (!unlocked || muted) return;
        if (musicKey === key && music && !music.paused) return;
        if (musicKey === key && broken[key]) return;
        if (music) { music._target = 0; fading.push(music); }
        music = null; musicKey = key;
        if (!key || broken[key] || !MUSIC[key]) return;
        music = makeAudio(MUSIC[key], key); music.loop = true; music.volume = 0; music._target = MUSIC_VOL * vol.music;
        music.play().catch(() => { });
    }

    setInterval(() => {
        const stepTo = (a, st) => { let tg = a._target || 0; a.volume = Math.abs(a.volume - tg) < st ? tg : Math.max(0, Math.min(1, a.volume + (tg > a.volume ? st : -st))); };
        let now = performance.now();
        if (music) stepTo(music, 0.02);
        for (let i = fading.length - 1; i >= 0; i--) { stepTo(fading[i], 0.02); if (fading[i].volume <= 0.001) { fading[i].pause(); fading.splice(i, 1); } }
        let playing = typeof gameState !== 'undefined' && gameState === 'PLAYING';
        if (holdUntil.spray) setLoop('spray', now < holdUntil.spray, 0.3);
        for (let k in loops) {
            let L = loops[k], d = LOOPS[k];
            if (!playing) L._target = 0;
            stepTo(L, d.fade || 0.04);
            if (L.volume <= 0.001 && !L._target) { if (!L.paused) L.pause(); }
            else if (d.le && L.currentTime >= d.le) { try { L.currentTime = d.ls || 0; } catch (e) { } }
        }
        // Cắt đuôi hiệu ứng đúng điểm kết thúc (mờ nhanh để không bị "tách")
        for (let k in pools) for (let a of pools[k]) {
            if (a.paused) continue;
            if (now >= a._end) { if (a.volume > 0.06) a.volume *= 0.45; else a.pause(); }
        }
    }, 50);

    // Trình duyệt chỉ cho phát tiếng sau thao tác đầu tiên của người chơi
    function unlock() { if (unlocked) return; unlocked = true; resume(); if (wantMusic) playMusic(wantMusic); }
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => window.addEventListener(ev, unlock, { passive: true }));

    function setMuted(m) {
        muted = !!m;
        if (master) master.gain.value = muted ? 0 : 0.75;
        if (muted) {
            if (music) music.pause();
            for (let k in loops) loops[k].pause();
            for (let k in pools) for (let a of pools[k]) a.pause();
        } else if (wantMusic) { musicKey = null; playMusic(wantMusic); }
    }

    function playSfxExternal(key, volume = 1) { sfxFile(key, volume); }
    function init() {
        if (ctx) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;

        ctx = new AudioContext();
        master = ctx.createGain();
        sfxGain = ctx.createGain();
        ambienceGain = ctx.createGain();

        master.gain.value = muted ? 0 : 0.75;
        sfxGain.gain.value = 0.9 * vol.sfx;
        ambienceGain.gain.value = 0.06;

        sfxGain.connect(master);
        ambienceGain.connect(master);
        master.connect(ctx.destination);
    }

    function resume() {
        init();
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    function now() {
        return ctx ? ctx.currentTime : 0;
    }

    function shouldPlay(name, cooldown = 0.04) {
        if (!ctx) return false;
        const t = now();
        if (lastPlayed[name] && t - lastPlayed[name] < cooldown) return false;
        lastPlayed[name] = t;
        return true;
    }

    function tone(freq, duration, opts = {}) {
        if (!ctx) return;
        const t = now();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = opts.filter ? ctx.createBiquadFilter() : null;

        osc.type = opts.type || 'sine';
        osc.frequency.setValueAtTime(freq, t);
        if (opts.toFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.toFreq), t + duration);
        if (opts.detune) osc.detune.setValueAtTime(opts.detune, t);

        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(opts.volume || 0.18, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

        if (filter) {
            filter.type = opts.filter.type || 'lowpass';
            filter.frequency.setValueAtTime(opts.filter.freq || 1000, t);
            osc.connect(filter);
            filter.connect(gain);
        } else {
            osc.connect(gain);
        }
        gain.connect(sfxGain);
        osc.start(t);
        osc.stop(t + duration + 0.03);
    }

    function noise(duration, opts = {}) {
        if (!ctx) return;
        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);

        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const t = now();

        filter.type = opts.type || 'bandpass';
        filter.frequency.setValueAtTime(opts.freq || 900, t);
        filter.Q.value = opts.q || 0.8;
        gain.gain.setValueAtTime(opts.volume || 0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

        src.buffer = buffer;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(sfxGain);
        src.start(t);
        src.stop(t + duration + 0.02);
    }

    function startAmbience() { resume(); }
    function stopAmbience() { for (let k in loops) loops[k]._target = 0; }
    function play(name) {
        // Âm thanh từ file (nếu file lỗi/thiếu thì rơi xuống âm tổng hợp bên dưới)
        if (name === 'sniper' || name === 'ar' || name === 'smg' || name === 'laser') { if (sfxFile(name)) return; name = 'shoot'; }
        else if (name === 'auto') { if (!broken.spray) { holdUntil.spray = performance.now() + 240; return; } name = 'shoot'; }
        else if (name === 'bow') { sfxStop('charge_up'); if (sfxFile('bow')) return; name = 'charge'; }
        else if (name === 'plasma') { sfxStop('charge_up'); if (sfxFile('plasma')) return; name = 'charge'; }
        else if (name === 'charge_up') { sfxFile('charge_up'); return; }
        else if (name === 'reload' || name === 'reload_big') { if (sfxFile('reload_big')) return; name = 'pickup'; }
        else if (name === 'reload_small') { if (sfxFile('reload_small')) return; name = 'pickup'; }
        else if (name === 'heal') { if (sfxFile('heal')) return; }
        else if (name === 'upgrade') { if (sfxFile('pick')) return; }
        else if (name === 'level') sfxFile('levelup');
        else if (name === 'heli_arrive') { sfxFile('heli_arrive'); return; }
        else if (name === 'witch') { if (sfxFile('witch')) return; name = 'melee'; }
        else if (name === 'roar') { if (sfxFile('zombie_groan', 2.2)) return; name = 'tank'; }
        else if (name === 'thunder') { sfxFile('thunder'); return; }
        else if (name === 'slash' || name === 'slash_heavy' || name === 'stab' || name === 'saber') { if (sfxFile(name)) return; name = 'melee'; }
        else if (name === 'pick_melee') { if (sfxFile('pick_melee')) return; name = 'pickup'; }
        else if (name === 'boss_intro') { if (sfxFile('boss_intro')) return; name = 'tank'; }
        else if (name === 'dead_offering' || name === 'dead_sacrifice') { if (sfxFile(name)) return; name = 'tank'; }
        else if (name === 'waterdrop') { sfxFile('waterdrop', 0.5 + Math.random() * 0.5); return; }
        else if (name === 'insect') { if (sfxFile('insect')) return; name = 'hit'; }
        else if (name === 'lightning') { if (sfxFile('lightning')) return; name = 'explode'; }
        else if (name === 'explode') { if (sfxFile('explosion')) { resume(); if (ctx && shouldPlay(name, 0.08)) tone(65, 0.3, { type: 'sawtooth', volume: 0.12, toFreq: 32 }); return; } }
        else if (name === 'kill') {
            // Tiếng zombie gục: file thật + một nhịp "thụp" trầm cho có lực
            playKill(1); return;
        }
        resume();
        if (!ctx) return;

        if (name === 'start') { tone(196, 0.10, { type: 'triangle', volume: 0.16 }); tone(392, 0.18, { type: 'triangle', volume: 0.14 }); }
        else if (name === 'shoot' && shouldPlay(name, 0.045)) { noise(0.06, { volume: 0.15, freq: 1500, q: 0.4 }); tone(130, 0.07, { type: 'square', volume: 0.05, toFreq: 70 }); }
        else if (name === 'shotgun' && shouldPlay(name, 0.09)) { noise(0.13, { volume: 0.28, freq: 900, q: 0.5 }); tone(80, 0.11, { type: 'sawtooth', volume: 0.08, toFreq: 40 }); }
        else if (name === 'melee' && shouldPlay(name, 0.08)) { noise(0.09, { volume: 0.12, freq: 2300, q: 1.3 }); tone(520, 0.08, { type: 'triangle', volume: 0.07, toFreq: 180 }); }
        else if (name === 'charge') { tone(220, 0.13, { type: 'sawtooth', volume: 0.12, toFreq: 620 }); }
        else if (name === 'grenade') { tone(780, 0.09, { type: 'square', volume: 0.08, toFreq: 420 }); }
        else if (name === 'throw') { noise(0.10, { volume: 0.10, freq: 650, q: 0.7 }); }
        else if (name === 'explode' && shouldPlay(name, 0.08)) { noise(0.42, { volume: 0.42, freq: 180, type: 'lowpass' }); tone(65, 0.34, { type: 'sawtooth', volume: 0.22, toFreq: 32 }); }
        else if (name === 'hit' && shouldPlay(name, 0.16)) { noise(0.08, { volume: 0.13, freq: 520, q: 0.8 }); tone(115, 0.09, { type: 'triangle', volume: 0.08, toFreq: 75 }); }
        else if (name === 'down') { tone(120, 0.30, { type: 'sawtooth', volume: 0.16, toFreq: 45 }); noise(0.18, { volume: 0.16, freq: 220, type: 'lowpass' }); }
        else if (name === 'kill' && shouldPlay(name, 0.07)) { noise(0.07, { volume: 0.08, freq: 300, q: 0.6 }); }
        else if (name === 'pickup' && shouldPlay(name, 0.04)) { tone(660, 0.06, { type: 'triangle', volume: 0.11 }); tone(990, 0.08, { type: 'triangle', volume: 0.08 }); }
        else if (name === 'heal' && shouldPlay(name, 0.22)) { tone(523, 0.08, { type: 'sine', volume: 0.10 }); tone(784, 0.11, { type: 'sine', volume: 0.09 }); }
        else if (name === 'shard') { tone(740, 0.08, { type: 'triangle', volume: 0.12 }); tone(1175, 0.20, { type: 'sine', volume: 0.10 }); }
        else if (name === 'level') { tone(392, 0.08, { type: 'triangle', volume: 0.09 }); setTimeout(() => tone(523, 0.10, { type: 'triangle', volume: 0.09 }), 80); setTimeout(() => tone(784, 0.18, { type: 'triangle', volume: 0.09 }), 170); }
        else if (name === 'upgrade') { tone(440, 0.07, { type: 'triangle', volume: 0.10 }); tone(880, 0.12, { type: 'triangle', volume: 0.08 }); }
        else if (name === 'select') { tone(520, 0.05, { type: 'sine', volume: 0.07 }); }
        else if (name === 'tank') { noise(0.22, { volume: 0.22, freq: 160, type: 'lowpass' }); tone(70, 0.30, { type: 'sawtooth', volume: 0.16, toFreq: 95 }); }
        else if (name === 'gameover') { stopAmbience(); tone(220, 0.18, { type: 'sawtooth', volume: 0.12, toFreq: 160 }); setTimeout(() => tone(110, 0.55, { type: 'sawtooth', volume: 0.16, toFreq: 40 }), 140); }
    }

    // Tiếng zombie gục: m = hệ số theo khoảng cách (xa thì nhỏ). Có thể tắt riêng tiếng hét, khi đó chỉ còn nhịp "thụp" trầm.
    function playKill(m = 1, insect = false) {
        if (m <= 0.02) return;
        let screamed = !killMuted && sfxFile(insect ? 'insect' : 'kill', m);
        resume();
        if (ctx && shouldPlay('kill', 0.12)) {
            let k = screamed ? 0.07 : 0.1;
            noise(0.09, { volume: k * m, freq: 260, type: 'lowpass' }); tone(95, 0.12, { type: 'sine', volume: k * m, toFreq: 48 });
        }
    }

    return { play, resume, startAmbience, stopAmbience, playExternal: playSfxExternal, music: playMusic, loop: setLoop, setMuted, isMuted: () => muted,
        kill: playKill, setVolume, getVolume: (g) => vol[g], setKillMuted, isKillMuted: () => killMuted };
})();
