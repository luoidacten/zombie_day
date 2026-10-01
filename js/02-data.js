// 4. Các biến trạng thái game tiếp theo giữ nguyên...
const MAP_SIZE = { w: 4000, h: 4000 };
let gameState = 'MENU';

// Các biến trạng thái trước đây chưa từng được khai báo (dùng như biến toàn cục ngầm)
let currentLevel = 1, currentMapType = 1, isSinglePlayer = true;
let score = 0, survivalTime = 0, cameraShake = 0, airdropTimer = 30, zombieTimer = 0, itemTimer = 0, lastTime = 0;
let fireZones = [], decals = [], allyDropTimer = 38;
let showTouchUI = false, lastTouchTime = -99999;
let loopToken = 0, frameDt = 1 / 60, killCount = 0, zombieIdSeq = 0, frameElectricals = [];
let shardGrantedLevel = 0, pendingBattery = 0, levelStartTexts = [];
let shopFlags = { flare: false, mines: 0, herbicide: false, urbanMap: false };
let cam = { x: MAP_SIZE.w / 2, y: MAP_SIZE.h / 2, zoom: 0.9 };
// Trạng thái mạng (Online Co-op). mode: null | 'host' | 'guest'
const NET = { mode: null, role: null, localIdx: 0, peer: null, conn: null, remote: { ptr: false, ang: 0 }, ev: [], seq: 0, lastSeq: 0, lastRecv: 0, ping: 0, sendAcc: 0, slowAcc: 0, inputAcc: 0, sig: {}, zmap: new Map(), applying: false, lastPt: 0, lastPtAt: 0 };

// Hệ thống tiến hóa xe tăng
let globalTankKills = 0;
let thietXaUnlocked = false;

// HỆ THỐNG BỨC PHÁ & ĐỘC TÔN
let breakthroughShards = 0; // Số Mảnh Bức Phá đang có
let activeExclusiveTag = null; // Lưu Tag Độc Tôn đã kích hoạt

const TAG_RULES = {
    'KIẾM SƯ': { reqBreak: 5, exclusive: true },
    'DRONE': { reqBreak: 5, exclusive: true },
    'ĐIỆN': { reqBreak: 5, exclusive: true },
    'KHAN_DOC': { reqBreak: 5, exclusive: true },
    'THOI_KHONG': { reqBreak: 5, exclusive: true },
    'TRIEU_HOI': { reqBreak: 5, exclusive: true },
    'CHIẾN XA': { reqBreak: 5, exclusive: false },
    'CẬN CHIẾN': { reqBreak: 5, exclusive: false },
    'XẠ THỦ': { reqBreak: 5, exclusive: false },
    'TRỰC THĂNG': { reqBreak: 5, exclusive: false }, // Có thể Bức phá cùng với 1 Độc tôn khác
    'NỔ': { reqBreak: 5, exclusive: false },
    'QUAN_DOI': { reqBreak: 5, exclusive: false },
    'DONG_MINH': { reqBreak: 5, exclusive: false }

};

const TAG_DEFS = {
    'TRỢ GIÚP': { max: 3, color: '#3498db' }, 'TRO_GIUP': { max: 3, color: '#3498db' },
    'HỒI MÁU': { max: 4, color: '#2ecc71' }, 'HOI_MAU': { max: 4, color: '#2ecc71' },
    'TIẾN CÔNG': { max: 4, color: '#e74c3c' }, 'TIEN_CONG': { max: 4, color: '#e74c3c' },
    'ĐẶC BIỆT': { max: 2, color: '#9b59b6' }, 'DAC_BIET': { max: 2, color: '#9b59b6' },
    'VẬT PHẨM': { max: 4, color: '#f1c40f' },
    'ĐẠN': { max: 2, color: '#95a5a6' }, 'DAN': { max: 2, color: '#95a5a6' },
    'KIẾM SƯ': { max: 10, color: '#e056fd' },
    'CẬN CHIẾN': { max: 5, color: '#eb4d4b' }, 'CAN_CHIEN': { max: 5, color: '#eb4d4b' },
    'CHỈ SỐ': { max: 4, color: '#f0932b' },
    'MAY MẮN': { max: 4, color: '#f6e58d' },
    'TRỰC THĂNG': { max: 5, color: '#16a085' },
    'TĂNG TIẾN': { max: 3, color: '#d35400' }, 'TANG_TIEN': { max: 3, color: '#d35400' },
    'CHIẾN XA': { max: 5, color: '#34495e' }, 'CHIEN_XA': { max: 5, color: '#34495e' },
    'NỔ': { max: 6, color: '#c0392b' },
    'TẤN CÔNG TỰ ĐỘNG': { max: 2, color: '#e67e22' },
    'BẬC THẦY': { max: 1, color: '#ff9f43' }, 'BAC_THAY': { max: 1, color: '#ff9f43' },
    'NHẤT KIẾM': { max: 1, color: '#ee5253' },
    'DRONE': { max: 10, color: '#00cec9' },
    'TẦM NHÌN': { max: 3, color: '#f5f6fa' },
    'XẠ THỦ': { max: 6, color: '#dcdde1' },
    'CHUẨN XÁC': { max: 4, color: '#00cec9' }, 'CHUAN_XAC': { max: 4, color: '#00cec9' },
    'SNIPER': { max: 4, color: '#2c3e50' },
    'ĐIỆN': { max: 15, color: '#00d2d3' },
    'NÉM': { max: 5, color: '#fab1a0' },
    'KHAN_DOC': { max: 10, color: '#2ecc71' },
    'THOI_KHONG': { max: 10, color: '#8e44ad' },
    'TRIEU_HOI': { max: 6, color: '#00cec9', label: 'TRIỆU HỒI' },
    'QUAN_DOI': { max: 6, color: '#95a5a6', label: 'QUÂN ĐỘI' },
    'DONG_MINH': { max: 3, color: '#3498db', label: 'ĐỒNG MINH' },
};
const UPGRADES = [
    { id: 'p_hp', type: 'Sức Mạnh', name: 'Máu Trâu', desc: '+50 Máu Tối đa & hồi một phần máu', tags: [] },
    { id: 'p_spd', type: 'Sức Mạnh', name: 'Điền Kinh', desc: '+40 Tốc độ chạy', tags: [] },
    { id: 'p_dmg', type: 'Sức Mạnh', name: 'Thợ Săn', desc: '+25% Sát thương gốc', tags: [] },
    { id: 't_stats', type: 'Chiến Lược', name: 'Xe Tank', desc: 'Xe tăng cực trâu, dame to và chạy cực nhanh.', tags: ['CHIẾN XA', 'CHỈ SỐ'] },
    { id: 'p_learn', type: 'Chiến Lược', name: 'Học Hỏi', desc: 'Tăng 50% kinh nghiệm (Điểm) nhận được.', tags: [] },

    { id: 's_adren', type: 'Chiến Lược', name: 'Adrenaline', desc: 'Bất tử 3s khi nhận sát thương chí tử.', tags: ['ĐẶC BIỆT'] },
    { id: 's_revive', type: 'Chiến Lược', name: 'Cấp Cứu', desc: 'Cứu thương tức thì 1 lần/map.', tags: ['TRỢ GIÚP', 'HỒI MÁU'] },
    { id: 's_medbox', type: 'Chiến Lược', name: 'Cứu Thương', desc: 'Thi thoảng rơi Hộp Cứu Thương hồi máu.', tags: ['TRỢ GIÚP', 'HỒI MÁU', 'VẬT PHẨM'] },
    { id: 's_rain', type: 'Chiến Lược', name: 'Mưa Đạn', desc: 'Bắn trúng mục tiêu liên tục tăng sát thương.', tags: ['TIẾN CÔNG', 'ĐẠN', 'TĂNG TIẾN'] },
    { id: 's_frenzy', type: 'Chiến Lược', name: 'Cuồng Sát', desc: 'Giết quái tăng damage (Cộng dồn).', tags: ['TIẾN CÔNG', 'ĐẶC BIỆT', 'TĂNG TIẾN'] },
    { id: 'm_tech', type: 'Kỹ Năng', name: 'Kỹ Thuật Cận Chiến', desc: '+30% Dame & Tầm đánh Cận chiến.', tags: ['CẬN CHIẾN', 'CHỈ SỐ'] },
    { id: 'm_sword', type: 'Kỹ Năng', name: 'Kiếm Thuật', desc: 'Đòn cận chiến chém đứt đạn của địch.', tags: ['CẬN CHIẾN', 'KIẾM SƯ'] },
    { id: 'm_heart', type: 'Tuyệt Kỹ', name: 'Kiếm Làm Tâm', desc: 'Tự động cản đạn bay tới khi cầm Kiếm.', tags: ['KIẾM SƯ', 'ĐẶC BIỆT'] },
    { id: 'st_rain', type: 'Tuyệt Kỹ', name: 'Cơn Mưa Chỉ Số', desc: 'Nhận ngay 3 lần buff chỉ số ngẫu nhiên.', tags: ['CHỈ SỐ', 'MAY MẮN'] },
    { id: 'st_evo', type: 'Chiến Lược', name: 'Tiến Hoá', desc: 'Mỗi khi qua Map mới, nhận 1 buff.', tags: ['CHỈ SỐ', 'MAY MẮN', 'ĐẶC BIỆT', 'TĂNG TIẾN'] },
    { id: 'h_supply', type: 'Chiến Lược', name: 'Hộp Tiếp Tế', desc: 'Giảm thời gian chờ hộp mù/hòm thính.', tags: ['TRỰC THĂNG', 'VẬT PHẨM', 'MAY MẮN'] },
    { id: 'h_strike', type: 'Chiến Lược', name: 'Không Kích', desc: 'Máy bay ném bom định kỳ quét bản đồ.', tags: ['TRỰC THĂNG', 'TIẾN CÔNG'] },
    { id: 'm_startSword', type: 'Kỹ Năng', name: 'Đạo Của Kiếm', desc: 'Nhận Katana độ bền x2 ngay, và mỗi đầu map nếu đang tay không.', tags: ['KIẾM SƯ'] },
    { id: 'm_luyenKiem', type: 'Tuyệt Kỹ', name: 'Luyện Kiếm', desc: 'Chỉ rớt Cận chiến. Giết 50 quái mở Nhất Kiếm.', tags: ['KIẾM SƯ'] },
    { id: 'p_raiBoom', type: 'Kỹ Năng', name: 'Rải Boom', desc: 'Thi thoảng xuất hiện vụ nổ ngẫu nhiên.', tags: ['NỔ', 'TẤN CÔNG TỰ ĐỘNG'] },
    { id: 'p_tinHieu', type: 'Hỗ Trợ', name: 'Tín Hiệu', desc: 'Có chỉ dẫn mũi tên đến Hộp tiếp tế.', tags: ['TRỰC THĂNG', 'VẬT PHẨM'] },
    { id: 'p_hoaLuc', type: 'Chiến Thuật', name: 'Hỏa Lực Gia Cường', desc: 'Trực thăng bắn đạn xuyên tường.', tags: ['TRỰC THĂNG', 'TIẾN CÔNG'] },
    { id: 'p_thoatHiem', type: 'Chiến Thuật', name: 'Thoát Hiểm', desc: 'Tăng tốc khi có trực thăng. Lên 1 Cấp khi thoát.', tags: ['TRỰC THĂNG', 'TĂNG TIẾN'] },
    { id: 'p_yemTro', type: 'Chiến Thuật', name: 'Yểm Trợ Hỏa Lực', desc: 'Trực thăng đến sớm 5s, bắn mạnh hơn.', tags: ['TRỰC THĂNG', 'TIẾN CÔNG'] },
    { id: 'p_miniDrone', type: 'Kỹ Năng', name: 'Mini Drone', desc: 'Drone bay theo bắn phụ.', tags: ['TẤN CÔNG TỰ ĐỘNG', 'DRONE'] },
    { id: 'p_healDrone', type: 'Kỹ Năng', name: 'Heal Drone', desc: 'Hồi máu. Cứu sống đồng đội.', tags: ['TRỢ GIÚP', 'DRONE'] },
    { id: 'p_suicideDrone', type: 'Kỹ Năng', name: 'Kamikaze Drone', desc: 'Drone tự động lao vào quái phát nổ.', tags: ['DRONE', 'NỔ'] },
    { id: 't_enter', type: 'Chiến Thuật', name: 'Chiến Xa', desc: 'Xe tăng +100 máu. Gọi ra sẽ gây nổ.', tags: ['CHIẾN XA', 'NỔ'] },
    { id: 't_explo', type: 'Kỹ Năng', name: 'Bậc Thầy Nổ', desc: 'Giảm ST nổ bản thân, tăng ST và phạm vi.', tags: ['NỔ', 'ĐẶC BIỆT'] },
    { id: 't_radio', type: 'Hỗ Trợ', name: 'Tank Yểm Trợ', desc: 'Tăng tỉ lệ nhặt Bộ Đàm.', tags: ['CHIẾN XA', 'MAY MẮN'] },
    { id: 't_auto', type: 'Kỹ Năng', name: 'Súng Phụ', desc: 'Xe tăng có ụ súng tự động đẩy lùi.', tags: ['CHIẾN XA', 'TẤN CÔNG TỰ ĐỘNG'] },
    { id: 't_master', type: 'Tuyệt Kỹ', name: 'Thiết Xa', desc: 'Giết 50 quái bằng Tank -> Mở Thiết Xa.', tags: ['CHIẾN XA', 'BẬC THẦY'] },

    // DRONE MỚI
    { id: 'd_arti', type: 'Kỹ Năng', name: 'Pháo Kích Drone', desc: 'Bắn pháo chậm nhưng sát thương cực lớn.', tags: ['DRONE', 'NỔ'] },
    { id: 'd_laser', type: 'Kỹ Năng', name: 'Laser Drone', desc: 'Tụ năng lượng bắn tia laser xuyên thấu.', tags: ['DRONE'] },
    { id: 'd_buffer', type: 'Hỗ Trợ', name: 'Tiến Công Drone', desc: 'Drone buff +12% tốc độ và +15% sát thương cho bạn.', tags: ['DRONE', 'TRỢ GIÚP', 'CHỈ SỐ'] },
    { id: 'd_learn', type: 'Tuyệt Kỹ', name: 'Học Tập (Nhiệm vụ)', desc: 'Drone nhặt đồ giúp bạn. Drone giết 200 quái -> Tiến hóa AI (tự bắn).', tags: ['DRONE', 'BẬC THẦY'] },

    // --- HỆ KIẾM SƯ MỞ RỘNG ---
    { id: 'k_kyThuat', type: 'Kỹ Năng', name: 'Kỹ Thuật Cản Phá', desc: 'Cận chiến: 30% tỷ lệ phản đòn và miễn sát thương.', tags: ['CẬN CHIẾN', 'KIẾM SƯ'] },
    { id: 'k_hoi', type: 'Kỹ Năng', name: 'Kiếm Hồi Phục', desc: 'Katana: Giết quái hồi độ bền, 2% tỷ lệ hồi 1% Máu.', tags: ['HỒI MÁU', 'KIẾM SƯ'] },
    { id: 'k_thieu', type: 'Kỹ Năng', name: 'Kiếm Hỏa', desc: 'Katana: Đòn chém gây hiệu ứng Thiêu Đốt.', tags: ['KIẾM SƯ'] },
    { id: 'k_pha', type: 'Kỹ Năng', name: 'Phá Trảm', desc: 'Katana: 10% tỷ lệ tạo ra đòn chém xoay vòng tròn.', tags: ['KIẾM SƯ'] },
    { id: 'k_diet', type: 'Tuyệt Kỹ', name: 'Tuyệt Diệt (Bí thuật)', desc: 'Katana: 5% gọi 2 Phân ảnh chữ V khi giết địch (Có thể lan truyền).', tags: ['ĐẶC BIỆT', 'KIẾM SƯ'] },
    { id: 'm_legendary', type: 'Hỗ Trợ', name: 'Thanh Kiếm Truyền Thuyết', desc: 'Mở khóa Katana Huyền Thoại trong Hòm Thính (Superbox).', tags: ['KIẾM SƯ', 'MAY MẮN', 'VẬT PHẨM'] },
    { id: 'p_headhunter', name: 'Thợ Săn Đầu', desc: 'Tăng mạnh tỉ lệ Headshot.', type: 'Kỹ Năng', tags: ['XẠ THỦ', 'CHUẨN XÁC'] },
    { id: 'p_aim', name: 'Ngắm Bắn', desc: 'Đứng yên + Ngắm = 100% Headshot. Tầm ngắm x2.', type: 'Kỹ Năng', tags: ['XẠ THỦ', 'CHUẨN XÁC', 'SNIPER'] },
    { id: 'p_pierceApple', name: 'Xuyên Táo', desc: 'Headshot xuyên mục tiêu. Sniper xuyên vô hạn.', type: 'Kỹ Năng', tags: ['CHUẨN XÁC', 'SNIPER'] },
    { id: 'p_x8', name: 'Ống Ngắm x8', desc: 'Sniper: Tầm đánh x2, Tỉ lệ Crit +20%.', type: 'Kỹ Năng', tags: ['CHUẨN XÁC', 'SNIPER'] },
    { id: 'p_sharp', name: 'Sắc Bén', desc: 'Cận chiến: Tăng sát thương và tỉ lệ Crit.', type: 'Kỹ Năng', tags: ['CẬN CHIẾN', 'CHUẨN XÁC'] },
    { id: 'p_accuracy', name: 'Chuẩn Xác', desc: '+20% Tỉ lệ Chí mạng.', type: 'Chỉ Số', tags: ['CHUẨN XÁC'] },
    { id: 'p_lucOnDinh', name: 'Ổn Định', desc: 'Súng Lục: Headshot x2 Sát thương gốc, nhưng bị giảm tốc độ chạy.', type: 'Kỹ Năng', tags: ['XẠ THỦ', 'CHUẨN XÁC'] },
    { id: 'p_lucLienHoan', name: 'Liên Hoàn', desc: 'Súng Lục: Đạn x3, Bắn cực nhanh, nhưng giảm tỉ lệ Chí mạng.', type: 'Kỹ Năng', tags: ['XẠ THỦ', 'ĐẠN'] },
    // PERK MỚI
    { id: 'v_gunner', type: 'Kỹ Năng', name: 'Xạ Thủ', desc: 'Tầm nhìn +100 khi dùng vũ khí tầm xa.', tags: ['TẦM NHÌN', 'XẠ THỦ'] },
    { id: 'v_sniper', type: 'Tuyệt Kỹ', name: 'Thiện Xạ', desc: 'Tầm nhìn +250 khi cầm Cung & Sniper.', tags: ['TẦM NHÌN'] },
    { id: 'v_spotlight', type: 'Chiến Thuật', name: 'Soi Rọi', desc: 'Tầm nhìn +100 khi có Trực Thăng.', tags: ['TẦM NHÌN', 'TRỰC THĂNG'] },
    { id: 'd_scout', type: 'Hỗ Trợ', name: 'Drone Do Thám', desc: 'Drone tự bay đi kích hoạt tháp tín hiệu.', tags: ['DRONE', 'TRỰC THĂNG'] },
    { id: 'd_melee', type: 'Kỹ Năng', name: 'Drone Cận Chiến', desc: 'Drone chém vòng tròn mỗi 5s.', tags: ['DRONE', 'CẬN CHIẾN', 'TẤN CÔNG TỰ ĐỘNG'] },
    // Thêm vào cuối mảng UPGRADES
    { id: 't_canQuet', type: 'Kỹ Năng', name: '🚜 Càn Quét', desc: 'Mở khóa kỹ năng Lướt Tông Húc cực mạnh cho Xe Tăng (chạm nhanh nút B / phím E), hồi chiêu 10s.', tags: ['CHIẾN XA'] },
    { id: 't_bomLua', type: 'Kỹ Năng', name: '🔥 Bom Lửa', desc: 'Đạn pháo chính của Xe Tăng gây cháy thiêu đốt và phạm vi nổ to hơn.', tags: ['CHIẾN XA'] },
    // --- HỆ THỐNG NÂNG CẤP MỚI VỀ SNIPER, XUYÊN PHÁ VÀ NỔ ---
    { id: 'v_xuyenPha', type: 'Kỹ Năng', name: 'Xuyên Phá Gia Cường', desc: '+1 mục tiêu xuyên thấu cho tất cả vũ khí tầm xa.', tags: ['XẠ THỦ', 'CHUẨN XÁC'] },
    { id: 'v_xuyenThung', type: 'Tuyệt Kỹ', name: 'Xuyên Thủng Vô Hạn', desc: 'Sniper: Nếu bắn Chí mạng hoặc Headshot sẽ xuyên mục tiêu vô hạn.', tags: ['SNIPER', 'CHUẨN XÁC'] },
    { id: 'v_danNoSniper', type: 'Kỹ Năng', name: 'Đạn Phá Kích', desc: 'Sniper: Phát bắn của Sniper khi trúng mục tiêu hoặc vật cản sẽ gây nổ diện rộng.', tags: ['SNIPER', 'NỔ'] },

    // --- HỆ THỐNG NÂNG CẤP MỚI CHO CUNG TÊN ---
    { id: 'v_muaTen', type: 'Kỹ Năng', name: 'Mưa Tên Cổ Đại', desc: 'Cung: Tụ lực Full (Max) tạo ra vùng bão tên gây sát thương liên tục trong 2 giây tại mục tiêu.', tags: ['ĐẶC BIỆT'] },
    { id: 'v_tenNo', type: 'Tuyệt Kỹ', name: 'Trận Địa Tên Nổ', desc: 'Cung: Mưa Tên tăng 50% phạm vi, sát thương và liên tục kích nổ liên hoàn.', tags: ['ĐẶC BIỆT', 'NỔ'] },
    { id: 'v_cungMaster', type: 'Kỹ Năng', name: 'Đại Sư Khúc Xạ', desc: 'Cung: Tăng mạnh tốc độ tụ lực và +40% sát thương gốc của cung tên.', tags: ['CHỈ SỐ'] },
    // perks DOT
    { id: 'a_chongAnMon', type: 'Phong Thu', name: 'Kháng Ăn Mòn', desc: 'Giảm 35% sát thương ăn mòn và vũng acid gây lên người chơi.', tags: ['ĐẶC BIỆT'] },
    { id: 'a_matNaLoc', type: 'Phong Thu', name: 'Mặt Nạ Lọc', desc: 'Giảm mạnh thời gian hiệu ứng Nhiễm Điện và Sợ Hãi.', tags: ['ĐẶC BIỆT', 'TRỢ GIÚP'] },
    { id: 'a_apSuatCao', type: 'Kỹ Năng', name: 'Áp Suất Cao', desc: 'Súng phun lửa và phun acid bắn xa hơn, tia ổn định hơn.', tags: ['TIẾN CÔNG', 'CHỈ SỐ'] },

    // CÁC NÂNG CẤP ĐẶC CHẾ CHỈ XUẤT HIỆN KHI QUA 3 TẦNG ĐIỆN (Sẽ được xử lý bộ lọc ở hàm render)
    { id: 'e_dienAp', type: 'Điện Năng', name: '⚡ Điện Áp', desc: 'Tạo trường điện quanh cơ thể gây sát thương điện liên tục lên quái vật xung quanh.', tags: ['ĐIỆN'] },
    { id: 'e_giapNangLuong', type: 'Phòng Thủ', name: '🛡️ Giáp Năng Lượng', desc: 'Cứ mỗi 5 giây nhận 1 lớp khiên điện bảo vệ chặn hoàn toàn đòn đánh kế tiếp.', tags: ['ĐIỆN'] },
    { id: 'e_chuoiSet', type: 'Tuyệt Kỹ', name: '⚡ Chuỗi Sét', desc: 'Vũ khí nhóm Điện giật lan thêm +5 mục tiêu mỗi cấp. Lấy tối đa 5 lần.', tags: ['ĐIỆN'] },
    { id: 'e_thietXaLoiDong', type: 'Tuyệt Kỹ', name: '⚡ Thiết Xa Lôi Động', desc: 'Xe tăng tăng tốc. Vụ nổ tạo vùng điện. Kỹ năng Càn Quét để lại vệt điện kéo dài.', tags: ['CHIẾN XA', 'ĐIỆN'] },
    { id: 'e_joule', type: 'Kỹ Năng', name: '🔥 Hiệu Ứng Joule', desc: 'Tất cả các tia điện giật lan từ mọi nguồn gây thêm hiệu ứng Thiêu Đốt lên quái vật.', tags: ['ĐIỆN'] },
    { id: 'e_camUng', type: 'Chỉ Số', name: '🧲 Cảm Ứng Điện Từ', desc: 'Sát thương giật sét bỏ qua giáp quái và tăng mạnh damage (30%/50%/80%/100%/200%). Lấy tối đa 5 lần.', tags: ['ĐIỆN'] },
    { id: 'e_doanMach', type: 'Tuyệt Kỹ', name: '💥 Đoản Mạch Kép', desc: 'Quái dính điện đồng thời gánh ST phóng điện. Quái chết bởi ST điện sẽ nổ tung tạo vùng điện.', tags: ['ĐIỆN'] },

    // --- HỆ NÉM (ném vũ khí bằng nút B / chuột phải / phím E) ---
    { id: 'n_power', type: 'Kỹ Năng', name: 'Tay Ném Thép', desc: 'Ném xa và nhanh hơn 30%, sát thương ném +60%.', tags: ['NÉM', 'CHỈ SỐ'] },
    { id: 'n_pierce', type: 'Kỹ Năng', name: 'Phi Đao Xuyên Thấu', desc: 'Vũ khí ném xuyên qua thêm 2 mục tiêu rồi mới biến mất.', tags: ['NÉM', 'CẬN CHIẾN'] },
    { id: 'n_boomerang', type: 'Tuyệt Kỹ', name: 'Boomerang', desc: 'Vũ khí cận chiến ném đi sẽ bay về tay (tốn 3 độ bền), chém cả lượt về.', tags: ['NÉM', 'ĐẶC BIỆT'] },
    { id: 'n_explode', type: 'Kỹ Năng', name: 'Ném Nổ', desc: 'Vũ khí ném phát nổ khi chạm mục tiêu, không gây hại cho phe ta.', tags: ['NÉM', 'NỔ'] },
    { id: 'n_multi', type: 'Kỹ Năng', name: 'Ném Chùm', desc: 'Mỗi lần ném văng thêm 2 bản sao hình quạt (50% sát thương).', tags: ['NÉM', 'TIẾN CÔNG'] },

    // --- HỆ TRIỆU HỒI / QUÂN ĐỘI / ĐỒNG MINH ---
    { id: 'a_call_rifleman', type: 'Triệu Hồi', name: 'Gọi: Lính Đột Kích', desc: 'Mỗi map có 1 lính AI cầm AR đi theo bạn và tự động xả đạn.', tags: ['TRIEU_HOI'] },
    { id: 'a_call_medic', type: 'Triệu Hồi', name: 'Gọi: Lính Quân Y', desc: 'Mỗi map có 1 lính y tế, mỗi 12s hồi 15 máu cho người bị thương nhất.', tags: ['TRIEU_HOI', 'HỒI MÁU'] },
    { id: 'a_call_vanguard', type: 'Triệu Hồi', name: 'Gọi: Lính Tiên Phong', desc: 'Mỗi map có 1 lính khiên rìu chịu đòn, đẩy lùi quái và hút aggro.', tags: ['TRIEU_HOI', 'CẬN CHIẾN'] },
    { id: 'a_elite_squad', type: 'Tuyệt Kỹ', name: 'Tiểu Đội Tinh Nhuệ', desc: 'Toàn bộ lính thành đặc nhiệm: x2 HP, +60% sát thương.', tags: ['TRIEU_HOI', 'BẬC THẦY'] },
    { id: 'a_fire_discipline', type: 'Quân Đội', name: 'Kỷ Luật Khai Hỏa', desc: 'Lính bắn không còn lệch tâm.', tags: ['QUAN_DOI', 'CHUẨN XÁC'] },
    { id: 'a_piercing_rounds', type: 'Quân Đội', name: 'Đạn Xuyên Phá', desc: 'Đạn của lính xuyên thêm 1 mục tiêu.', tags: ['QUAN_DOI', 'ĐẠN'] },
    { id: 'a_tactical_reload', type: 'Quân Đội', name: 'Thay Đạn Cấp Tốc', desc: 'Lính bắn nhanh hơn 40%.', tags: ['QUAN_DOI'] },
    { id: 'a_suppressive_fire', type: 'Quân Đội', name: 'Bắn Áp Chế', desc: 'Đạn của lính có 25% tỷ lệ gây choáng 0.5s.', tags: ['QUAN_DOI', 'ĐẶC BIỆT'] },
    { id: 'a_synchronized_fire', type: 'Tuyệt Kỹ', name: 'Đồng Loạt Khai Hỏa', desc: 'Bạn bắn trúng quái nào, lính lập tức tập trung hỏa lực vào mục tiêu đó.', tags: ['QUAN_DOI', 'TIẾN CÔNG'] },
    { id: 'a_inspire', type: 'Đồng Minh', name: 'Truyền Cảm Hứng', desc: 'Đứng gần lính hoặc có Drone: +10% tốc độ và +15% sát thương.', tags: ['DONG_MINH', 'TRỢ GIÚP'] },
    { id: 'a_share_pain', type: 'Đồng Minh', name: 'San Sẻ Sát Thương', desc: 'Chuyển 20% sát thương bạn nhận sang lính Tiên Phong gần nhất.', tags: ['DONG_MINH', 'ĐẶC BIỆT'] },
    { id: 'a_overdrive_matrix', type: 'Đồng Minh', name: 'Trận Địa Quá Tải', desc: 'Lính chạy nhanh hơn 25% và gây thêm 25% sát thương.', tags: ['DONG_MINH', 'TĂNG TIẾN'] },
    { id: 'a_heavy_artillery', type: 'Chiến Lược', name: 'Pháo Kích Hiệp Lực', desc: 'Tank bắn pháo thì lính ném lựu đạn theo hướng nòng pháo.', tags: ['QUAN_DOI', 'CHIẾN XA'] },
    { id: 'a_drone_link_protocol', type: 'Tuyệt Kỹ', name: 'Giao Thức Đồng Bộ Drone', desc: 'Khi bạn có Drone: lính tự hồi 4 máu/giây và bắn nhanh hơn 15%.', tags: ['TRIEU_HOI', 'DRONE', 'BẬC THẦY'] },
    { id: 'u_drone_carrier', type: 'Tuyệt Kỹ', name: 'Mẫu Hạm Drone Chỉ Huy', desc: 'Cần Link 3 Drone + 3 Triệu Hồi. Mỗi lính có Mini Drone bắn phụ.', tags: ['TRIEU_HOI', 'DRONE'] },

];

const WEAPON_TYPES = {
    PISTOL: { id: 1, name: 'Lục', color: '#bdc3c7', ammo: 50, range: 1000, fireRate: 300, dmg: 140, critCh: 0.8, critMult: 2.0, type: 'gun', maxAmmo: 50, pierce: 5 },
    SMG: { id: 2, name: 'Tiểu Liên', color: '#f39c12', ammo: 240, range: 700, fireRate: 60, dmg: 20, critCh: 0.05, type: 'gun', maxAmmo: 240 },
    AR: { id: 9, name: 'AR', color: '#2ecc71', ammo: 120, range: 850, fireRate: 120, dmg: 60, critCh: 0.15, type: 'gun', maxAmmo: 120, pierce: 3 },
    SHOTGUN: { id: 3, name: 'Súng Săn', color: '#8e44ad', ammo: 50, range: 350, fireRate: 800, dmg: 200, bullets: 10, spread: 0.5, type: 'gun', maxAmmo: 50 },
    SNIPER: { id: 4, name: 'Ngắm', color: '#57606f', ammo: 20, range: 1500, fireRate: 1500, dmg: 350, critCh: 0.5, armorPiercing: true, type: 'gun', maxAmmo: 20, pierce: 10 },
    BOW: { id: 16, name: 'Cung', color: '#e056fd', ammo: 25, range: 1500, fireRate: 300, dmg: 60, type: 'charge', maxAmmo: 25 },
    KATANA: { id: 6, name: 'Kiếm', color: '#ecf0f1', ammo: 80, range: 100, fireRate: 200, dmg: 100, critCh: 0.4, type: 'melee', spread: 1.2, kb: 150, maxAmmo: 80 },
    AXE: { id: 7, name: 'Rìu', color: '#c0392b', ammo: 85, range: 90, fireRate: 500, dmg: 200, type: 'melee', spread: 5.0, kb: 300, maxAmmo: 85 },
    HAMMER: { id: 8, name: 'Búa', color: '#34495e', ammo: 50, range: 120, fireRate: 1100, dmg: 500, type: 'melee', spread: Math.PI * 2, kb: 600, maxAmmo: 50 },
    // VŨ KHÍ MỚI
    KNIFE: { id: 17, name: 'Dao Quân Sự', color: '#7f8c8d', ammo: 50, range: 90, fireRate: 150, dmg: 200, type: 'melee', spread: 0.8, kb: 50, speedBoost: 1.5, isThrust: true, maxAmmo: 50 }, // Dao: đâm thẳng
    SPEAR: { id: 18, name: 'Giáo', color: '#e67e22', ammo: 40, range: 160, fireRate: 400, dmg: 75, type: 'melee', spread: 0.3, kb: 250, isThrust: true, maxAmmo: 40 },
    GRENADE: { id: 19, name: 'Lựu Đạn', color: '#27ae60', ammo: 1, type: 'explosive', fuseTime: 2500, maxAmmo: 1 },

    GLAUNCHER: { id: 13, name: 'Phóng Lựu', color: '#16a085', ammo: 8, range: 1000, fireRate: 900, dmg: 120, type: 'gun', isExplosiveProj: true, maxAmmo: 8 },
    MINIGUN: { id: 10, name: 'Minigun', color: '#d35400', ammo: 250, range: 650, fireRate: 20, dmg: 50, wallPiercing: true, type: 'gun', slowDown: 0.65, maxAmmo: 550 },
    FLAMETHROWER: { id: 15, name: 'Phun Lửa', color: '#e67e22', ammo: 140, range: 760, fireRate: 50, dmg: 80, type: 'gun', isFlamethrower: true, pierce: 99, maxAmmo: 350 },
    ACID_SPRAYER: { id: 27, name: 'Phun Acid', color: '#2ecc71', ammo: 160, range: 680, fireRate: 55, dmg: 40, type: 'gun', isAcidSprayer: true, pierce: 99, maxAmmo: 320 },
    LIGHTSABER: { id: 11, name: 'Laser', color: '#00ffff', ammo: 50, range: 180, fireRate: 200, dmg: 180, critCh: 1.0, type: 'melee', spread: 2.0, kb: 500, speedBoost: 1.2, armorPiercing: true, maxAmmo: 50 },
    RADIO: { id: 12, name: 'Bộ Đàm', color: '#000', ammo: 1, type: 'special', maxAmmo: 1 },
    LEGEND_KATANA: { id: 20, name: 'Katana Huyền Thoại', color: '#ff9f43', ammo: 200, range: 260, fireRate: 150, dmg: 600, critCh: 1.0, type: 'melee', spread: Math.PI * 2, kb: 300, maxAmmo: 200, isLegendary: true },
    LEGENDARY_KATANA: { id: 20, name: 'Katana Huyền Thoại', color: '#ff9f43', ammo: 200, range: 260, fireRate: 150, dmg: 600, critCh: 1.0, type: 'melee', spread: Math.PI * 2, kb: 300, maxAmmo: 200, isLegendary: true },
    ELECTRO_WHIP: { id: 21, name: 'Roi Điện', color: '#00d2d3', ammo: 140, range: 135, fireRate: 160, dmg: 115, type: 'melee', spread: Math.PI * 2, kb: 180, maxAmmo: 140, isElectric: true },
    ELECTRO_CANNON: { id: 22, name: 'Pháo Điện Năng', color: '#48dbfb', ammo: 70, range: 1500, fireRate: 220, dmg: 75, type: 'charge', maxAmmo: 70, isElectric: true, pierce: 1 },
    // Thêm vào trong WEAPON_TYPES
    PISTOL_ELECTRO: { id: 23, name: 'Lục Điện', color: '#00d2d3', ammo: 60, range: 900, fireRate: 350, dmg: 85, type: 'gun', maxAmmo: 60, isElectric: true },
    PLASMA_RAPID: { id: 24, name: 'Plasma Rapid-Pulser', color: '#48dbfb', ammo: 180, range: 850, fireRate: 100, dmg: 45, type: 'gun', maxAmmo: 180, isElectric: true },
    ELECTRON_FLUX: { id: 25, name: 'Electron Flux', color: '#10ac84', ammo: 200, range: 500, fireRate: 40, dmg: 15, type: 'gun', maxAmmo: 200, isElectric: true, isFluxBeam: true },
    TESLA_CARBINE: { id: 26, name: 'Tesla Carbine', color: '#ff9f43', ammo: 80, range: 1000, fireRate: 600, dmg: 350, type: 'charge', maxAmmo: 80, isElectric: true, isTesla: true }
};
for (const k in WEAPON_TYPES) WEAPON_TYPES[k].key = k; // mỗi vũ khí nhớ khóa của mình (dùng cho đồng bộ online & kiểm tra loại)
const NORMAL_WEAPONS = ['PISTOL', 'SMG', 'AR', 'SHOTGUN', 'SNIPER', 'BOW', 'KATANA', 'AXE', 'HAMMER', 'GLAUNCHER', 'KNIFE', 'SPEAR', 'GRENADE'];
const SUPER_WEAPONS = ['MINIGUN', 'FLAMETHROWER', 'ACID_SPRAYER', 'LIGHTSABER', 'RADIO'];
const ELECTRO_WEAPONS = ['ELECTRO_WHIP', 'ELECTRO_CANNON'];
const MELEE_ONLY_POOL = ['KATANA', 'AXE', 'HAMMER', 'LIGHTSABER', 'KNIFE', 'SPEAR'];

let players = [], zombies = [], bullets = [], enemyBullets = [], slashes = [];
let thrownItems = [], drops = [], obstacles = [], particles = [], vfxList = [];
let airdropMarkers = [], slowZones = [], towers = [];
let tank = { active: false, hp: 0, maxHp: 100, autoGunTimer: 0, halfHpExploded: false, p1DUsed: false, p2DUsed: false, p2InvulnTimer: 0, p2SpeedBoost: false, cSkillCD: 0 };
let heliSupport = { active: false, fireTimer: 0, x: 0, y: 0 };
let objState = 'TOWERS'; let evacTimer = 0; let evacZone = null;
const HEALING_MULT = 0.55;
const EVAC_SUPPORT_TIME = 15.0;
let mission = { type: 'TOWERS', progress: 0, required: 4, complete: false };
let missionItems = [];
let rescueNPCs = [];
let rescueMission = { total: 0, aliveRequired: 0, timer: 0, heliArrived: false };
let bushes = [];
let ashZones = [];
let radioDialogs = [];
let radioDialogTimer = 0;
let testMode = false;
let empStorm = { cd: 20, timer: 0, active: false };
let turretMode = { active: false, x: 0, y: 0, hp: 0, maxHp: 600, fireCD: 0 };
let weaponSlots = [];
let activeWeaponSlot = 0;
let hangZRun = { active: false, floor: 0, total: 3, timer: 180, stairs: null };
let powerCellsHeld = 0;
let shopScrap = 0;
let nextRoute = 'balanced';
let nextMapPreference = null;
let nextMissionPreference = null;
let pendingShopDrop = false;
let hasPowerPlantMap = false;
let powerPlantRun = { active: false, floor: 0, total: 3 };
let hazards = [];
let powerCoils = [];
let lightFlowers = [];
let darknessBattery = 100;
let darknessFlash = 0;
let cityCollapseTimer = 8.0;
let shopOpenedForLevel = 0;
let bossSpawned = false;
let airstrikeTimer = 15.0;
// BIẾN MAP MỚI
let lastSpecialMapLevel = 0;
let fortressTimer = 120.0; // 2 phút cho map Thành trì
let allies = []; // Đồng minh (Linh)
let outposts = []; // Tiền đồn cướp
let levelStartTimer = 0; let towerAlertTimer = 0; // Thời gian hiển thị thông báo
let bgMapColor = '#2c3e50'; const GROUND_DOTS = [];
let drones = []; let raiBoomTimer = 0;
let lastFocusedTarget = null;

// --- HỆ THỐNG THỜI TIẾT KHỞI TẠO ĐỒNG BỘ ---
let currentWeather = 1; // 1: Trời Đẹp, 2: Mưa, 3: Gió, 4: Bão Sét, 5: Nhiều Mây, 6: Sương Mù, 7: Nắng Nóng
let weatherTimer = 0;
// Thêm biến chặn thời gian chớp sáng sấm sét liên tục
let lastScreenFlashTimeGlobal = 0;
let thunderTimer = 0;
let flashAlpha = 0;
let rainLines = [];

// --- QUẢN LÝ COOLDOWN CHO TIẾNG THÉT CỦA WITCH ---
let lastWitchScreamTime = 0;
const WITCH_SCREAM_COOLDOWN = 4000;
let currentPowerFloorCleared = 0; // Đếm số tầng map điện đã vượt qua ở kiếp chơi này
let hasEnergyShield = false; // Quản lý perk giáp năng lượng
let energyShieldTimer = 0;
// efffect Status
const STATUS = {
    BURN: 'burn',
    ELECTRIC: 'electric',
    OVERLOAD: 'overload',
    CORROSION: 'corrosion',
    FEAR: 'fear'
};

const STATUS_STYLE = {
    burn: { color: '#e67e22', label: 'LUA' },
    electric: { color: '#00d2d3', label: 'DIEN' },
    overload: { color: '#ff6b35', label: 'QUA TAI' },
    corrosion: { color: '#2ecc71', label: 'ACID' },
    fear: { color: '#ff007f', label: 'SO' }
};

const ELECTRIC_IMMUNE_ZOMBIES = new Set([16, 17, 28, 31]);
