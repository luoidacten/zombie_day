const PC_BUTTON_KEYS = { Space: 'A', KeyE: 'B', KeyQ: 'C', KeyR: 'D', };
const PC_MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

function initControls() {
    let baseH = window.innerHeight;
    UI.p1Stick.baseX = 80; UI.p1Stick.baseY = baseH - 80;
    UI.p1BtnA.x = W - 70; UI.p1BtnA.y = baseH - 70;
    UI.p1BtnB.x = W - 130; UI.p1BtnB.y = baseH - 50;
    UI.p1BtnC.x = W - 70; UI.p1BtnC.y = baseH - 130;
    UI.p1BtnD.x = W - 120; UI.p1BtnD.y = baseH - 100;

    if (!soloControls()) {
        UI.p2Stick.baseX = W - 80; UI.p2Stick.baseY = 80;
        UI.p2BtnA.x = 70; UI.p2BtnA.y = 70;
        UI.p2BtnB.x = 130; UI.p2BtnB.y = 50;
        UI.p2BtnC.x = 70; UI.p2BtnC.y = 130;
        UI.p2BtnD.x = 120; UI.p2BtnD.y = 100;
    }
}

function getButtonObject(name) {
    return name === 'A' ? UI.p1BtnA : (name === 'B' ? UI.p1BtnB : (name === 'C' ? UI.p1BtnC : UI.p1BtnD));
}

function setButtonInput(button, down) {
    if (down && !button.pressed) button.justPressed = true;
    if (!down && button.pressed) button.justReleased = true;
    button.pressed = down;
}

function setPcButton(name, source, down) {
    const sources = PC_INPUT.buttons[name];
    if (!sources) return;
    if (down) sources.add(source); else sources.delete(source);
    setButtonInput(getButtonObject(name), sources.size > 0);
}

function clearPcInputs() {
    PC_INPUT.keys.clear();
    for (let name of Object.keys(PC_INPUT.buttons)) {
        PC_INPUT.buttons[name].clear();
        const button = getButtonObject(name);
        button.pressed = false; button.justPressed = false; button.justReleased = false; button.id = null;
    }
    UI.p1Stick.active = false; UI.p1Stick.dx = 0; UI.p1Stick.dy = 0; UI.p1Stick.id = null;
    if (NET.mode !== 'host') {
        UI.p2Stick.active = false; UI.p2Stick.dx = 0; UI.p2Stick.dy = 0; UI.p2Stick.id = null;
        for (let n of ['A', 'B', 'C', 'D']) { let b = UI['p2Btn' + n]; b.pressed = false; b.justPressed = false; b.justReleased = false; b.id = null; }
    }
}

function syncPcControls() {
    let dx = 0, dy = 0;
    if (PC_INPUT.keys.has('KeyA') || PC_INPUT.keys.has('ArrowLeft')) dx -= 1;
    if (PC_INPUT.keys.has('KeyD') || PC_INPUT.keys.has('ArrowRight')) dx += 1;
    if (PC_INPUT.keys.has('KeyW') || PC_INPUT.keys.has('ArrowUp')) dy -= 1;
    if (PC_INPUT.keys.has('KeyS') || PC_INPUT.keys.has('ArrowDown')) dy += 1;

    if (dx !== 0 || dy !== 0) {
        const len = Math.hypot(dx, dy);
        dx /= len; dy /= len;
        UI.p1Stick.active = true;
        UI.p1Stick.dx = dx; UI.p1Stick.dy = dy;
        UI.p1Stick.cx = UI.p1Stick.baseX + dx * 40;
        UI.p1Stick.cy = UI.p1Stick.baseY + dy * 40;
    } else if (UI.p1Stick.id === null) {
        UI.p1Stick.active = false;
        UI.p1Stick.dx = 0; UI.p1Stick.dy = 0;
        UI.p1Stick.cx = UI.p1Stick.baseX; UI.p1Stick.cy = UI.p1Stick.baseY;
    }
}

function getPcAimAngle(worldX, worldY, fallbackAngle) {
    if (!PC_INPUT.pointer.active) return fallbackAngle;
    // Đổi vị trí chuột trên màn hình -> toạ độ thế giới theo camera THẬT (đúng cả khi zoom thay đổi)
    const targetX = cam.x + (PC_INPUT.pointer.x - W / 2) / cam.zoom;
    const targetY = cam.y + (PC_INPUT.pointer.y - H / 2) / cam.zoom;
    const dx = targetX - worldX;
    const dy = targetY - worldY;
    if (Math.hypot(dx, dy) < 4) return fallbackAngle;
    return Math.atan2(dy, dx);
}

// Người chơi này có đang ngắm bằng chuột không? (P2 online lấy từ máy khách; P2 chung máy thì không)
function playerUsesPointer(p) {
    if (NET.mode === 'host' && p.id === 2) return NET.remote.ptr;
    return p.id === 1 && PC_INPUT.pointer.active;
}

function applyAim(player) {
    if (!playerUsesPointer(player)) return;
    const fallbackAngle = Math.atan2(player.facingY, player.facingX);
    const angle = (NET.mode === 'host' && player.id === 2) ? NET.remote.ang : getPcAimAngle(player.x, player.y, fallbackAngle);
    player.facingX = Math.cos(angle);
    player.facingY = Math.sin(angle);
}

window.addEventListener('keydown', e => {
    if (gameState !== 'PLAYING') return;
    const mappedButton = PC_BUTTON_KEYS[e.code];
    if (PC_MOVE_KEYS.has(e.code) || mappedButton) e.preventDefault();
    if (PC_MOVE_KEYS.has(e.code)) PC_INPUT.keys.add(e.code);
    if (mappedButton) setPcButton(mappedButton, `key:${e.code}`, true);
});

window.addEventListener('keyup', e => {
    const mappedButton = PC_BUTTON_KEYS[e.code];
    if (PC_MOVE_KEYS.has(e.code) || mappedButton) e.preventDefault();
    if (PC_MOVE_KEYS.has(e.code)) PC_INPUT.keys.delete(e.code);
    if (mappedButton) setPcButton(mappedButton, `key:${e.code}`, false);
});

// Trình duyệt di động bắn thêm sự kiện chuột giả sau khi chạm -> bỏ qua để không phá chế độ tự ngắm
const isFakeMouse = () => performance.now() - lastTouchTime < 1200;
canvas.addEventListener('mousemove', e => {
    if (isFakeMouse()) return;
    PC_INPUT.pointer.active = true;
    PC_INPUT.pointer.x = e.clientX;
    PC_INPUT.pointer.y = e.clientY;
});

canvas.addEventListener('mousedown', e => {
    if (gameState !== 'PLAYING' || isFakeMouse()) return;
    PC_INPUT.pointer.active = true;
    PC_INPUT.pointer.x = e.clientX;
    PC_INPUT.pointer.y = e.clientY;
    if (e.button === 0) { e.preventDefault(); setPcButton('A', 'mouse:left', true); }
    if (e.button === 2) { e.preventDefault(); setPcButton('B', 'mouse:right', true); }
});

window.addEventListener('mouseup', e => {
    if (e.button === 0) setPcButton('A', 'mouse:left', false);
    if (e.button === 2) setPcButton('B', 'mouse:right', false);
});

window.addEventListener('blur', clearPcInputs);

canvas.addEventListener('touchstart', handleTouch, { passive: false }); canvas.addEventListener('touchmove', handleTouch, { passive: false }); canvas.addEventListener('touchend', handleTouchEnd); canvas.addEventListener('touchcancel', handleTouchEnd); document.addEventListener('touchend', cleanUpStuckTouches); document.addEventListener('touchcancel', cleanUpStuckTouches);

function handleTouch(e) {
    lastTouchTime = performance.now();
    if (gameState !== 'PLAYING') return;
    if (e.cancelable) e.preventDefault();
    showTouchUI = true; PC_INPUT.pointer.active = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if (soloControls() || t.clientY > H / 2) {
            if (t.clientX < W / 2 && (!UI.p1Stick.active || UI.p1Stick.id === t.identifier)) { UI.p1Stick.active = true; UI.p1Stick.id = t.identifier; if (e.type === 'touchstart') { UI.p1Stick.baseX = t.clientX; UI.p1Stick.baseY = t.clientY; } updateJoystick(UI.p1Stick, t.clientX, t.clientY); }
            else if (Math.hypot(t.clientX - UI.p1BtnA.x, t.clientY - UI.p1BtnA.y) < 45) { if (e.type === 'touchstart' && !UI.p1BtnA.pressed) UI.p1BtnA.justPressed = true; UI.p1BtnA.pressed = true; UI.p1BtnA.id = t.identifier; }
            else if (Math.hypot(t.clientX - UI.p1BtnB.x, t.clientY - UI.p1BtnB.y) < 40) { if (e.type === 'touchstart' && !UI.p1BtnB.pressed) UI.p1BtnB.justPressed = true; UI.p1BtnB.pressed = true; UI.p1BtnB.id = t.identifier; }
            else if (Math.hypot(t.clientX - UI.p1BtnC.x, t.clientY - UI.p1BtnC.y) < 35) { if (e.type === 'touchstart' && !UI.p1BtnC.pressed) UI.p1BtnC.justPressed = true; UI.p1BtnC.pressed = true; UI.p1BtnC.id = t.identifier; }
            else if (Math.hypot(t.clientX - UI.p1BtnD.x, t.clientY - UI.p1BtnD.y) < 35) { if (e.type === 'touchstart' && !UI.p1BtnD.pressed) UI.p1BtnD.justPressed = true; UI.p1BtnD.pressed = true; UI.p1BtnD.id = t.identifier; }
        }
        else {
            if (t.clientX > W / 2 && (!UI.p2Stick.active || UI.p2Stick.id === t.identifier)) { UI.p2Stick.active = true; UI.p2Stick.id = t.identifier; if (e.type === 'touchstart') { UI.p2Stick.baseX = t.clientX; UI.p2Stick.baseY = t.clientY; } updateJoystick(UI.p2Stick, t.clientX, t.clientY); }
            else if (Math.hypot(t.clientX - UI.p2BtnA.x, t.clientY - UI.p2BtnA.y) < 45) { if (e.type === 'touchstart' && !UI.p2BtnA.pressed) UI.p2BtnA.justPressed = true; UI.p2BtnA.pressed = true; UI.p2BtnA.id = t.identifier; }
            else if (Math.hypot(t.clientX - UI.p2BtnB.x, t.clientY - UI.p2BtnB.y) < 40) { if (e.type === 'touchstart' && !UI.p2BtnB.pressed) UI.p2BtnB.justPressed = true; UI.p2BtnB.pressed = true; UI.p2BtnB.id = t.identifier; }
            else if (Math.hypot(t.clientX - UI.p2BtnC.x, t.clientY - UI.p2BtnC.y) < 35) { if (e.type === 'touchstart' && !UI.p2BtnC.pressed) UI.p2BtnC.justPressed = true; UI.p2BtnC.pressed = true; UI.p2BtnC.id = t.identifier; }
            else if (Math.hypot(t.clientX - UI.p2BtnD.x, t.clientY - UI.p2BtnD.y) < 35) { if (e.type === 'touchstart' && !UI.p2BtnD.pressed) UI.p2BtnD.justPressed = true; UI.p2BtnD.pressed = true; UI.p2BtnD.id = t.identifier; }
        }
    }
}
function handleTouchEnd(e) {
    lastTouchTime = performance.now();
    if (gameState !== 'PLAYING') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if (UI.p1Stick.id === t.identifier) { UI.p1Stick.active = false; UI.p1Stick.id = null; }
        if (UI.p1BtnA.id === t.identifier) { UI.p1BtnA.pressed = false; UI.p1BtnA.justReleased = true; UI.p1BtnA.id = null; }
        if (UI.p1BtnB.id === t.identifier) { UI.p1BtnB.pressed = false; UI.p1BtnB.justReleased = true; UI.p1BtnB.id = null; }
        if (UI.p1BtnC.id === t.identifier) { UI.p1BtnC.pressed = false; UI.p1BtnC.justReleased = true; UI.p1BtnC.id = null; }
        if (UI.p1BtnD.id === t.identifier) { UI.p1BtnD.pressed = false; UI.p1BtnD.justReleased = true; UI.p1BtnD.id = null; }

        if (!soloControls()) {
            if (UI.p2Stick.id === t.identifier) { UI.p2Stick.active = false; UI.p2Stick.id = null; }
            if (UI.p2BtnA.id === t.identifier) { UI.p2BtnA.pressed = false; UI.p2BtnA.justReleased = true; UI.p2BtnA.id = null; }
            if (UI.p2BtnB.id === t.identifier) { UI.p2BtnB.pressed = false; UI.p2BtnB.justReleased = true; UI.p2BtnB.id = null; }
            if (UI.p2BtnC.id === t.identifier) { UI.p2BtnC.pressed = false; UI.p2BtnC.justReleased = true; UI.p2BtnC.id = null; }
            if (UI.p2BtnD.id === t.identifier) { UI.p2BtnD.pressed = false; UI.p2BtnD.justReleased = true; UI.p2BtnD.id = null; }
        }
    }
}
function cleanUpStuckTouches(e) {
    lastTouchTime = performance.now();
    if (e.touches.length === 0) {
        UI.p1Stick.active = false; UI.p1Stick.id = null;
        if (UI.p1BtnA.pressed) UI.p1BtnA.justReleased = true; UI.p1BtnA.pressed = false;
        if (UI.p1BtnB.pressed) UI.p1BtnB.justReleased = true; UI.p1BtnB.pressed = false;
        if (UI.p1BtnC.pressed) UI.p1BtnC.justReleased = true; UI.p1BtnC.pressed = false;
        if (UI.p1BtnD.pressed) UI.p1BtnD.justReleased = true; UI.p1BtnD.pressed = false;
        if (soloControls()) return; // Online: nút của P2 do máy khách điều khiển, không đụng tới
        UI.p2Stick.active = false; UI.p2Stick.id = null;

        if (UI.p2BtnA.pressed) UI.p2BtnA.justReleased = true; UI.p2BtnA.pressed = false;
        if (UI.p2BtnB.pressed) UI.p2BtnB.justReleased = true; UI.p2BtnB.pressed = false;
        if (UI.p2BtnC.pressed) UI.p2BtnC.justReleased = true; UI.p2BtnC.pressed = false;
        if (UI.p2BtnD.pressed) UI.p2BtnD.justReleased = true; UI.p2BtnD.pressed = false;
    }
}
function updateJoystick(stick, tx, ty) { let dx = tx - stick.baseX, dy = ty - stick.baseY, dist = Math.hypot(dx, dy), maxDist = 40; if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; } stick.cx = stick.baseX + dx; stick.cy = stick.baseY + dy; stick.dx = dx / maxDist; stick.dy = dy / maxDist; }
function getJoystickState(id) { return id === 1 ? UI.p1Stick : UI.p2Stick; }
function getButtonState(id, btn, type = 'pressed') {
    let b;
    if (id === 1) b = (btn === 'A' ? UI.p1BtnA : (btn === 'B' ? UI.p1BtnB : (btn === 'C' ? UI.p1BtnC : UI.p1BtnD)));
    else b = (btn === 'A' ? UI.p2BtnA : (btn === 'B' ? UI.p2BtnB : (btn === 'C' ? UI.p2BtnC : UI.p2BtnD)));

    if (type === 'justPressed') { let r = b.justPressed; b.justPressed = false; return r; }
    if (type === 'released') { let r = b.justReleased; b.justReleased = false; return r; }
    return b.pressed;
}
