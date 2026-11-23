// repair.js — Dữ liệu Offline: Mã lỗi Bếp từ (E0–E8), Bệnh kinh điển Máy hàn & Hướng dẫn đo Sống/Chết (Đồng hồ Số + Kim)

export const INDUCTION_ERRORS = [
  {
    code: 'E0', title: 'Không nhận nồi / Nồi không phù hợp (Mất tín hiệu đồng bộ)',
    cause: 'Chưa đặt nồi nhiễm từ, hoặc mạch phát hiện nồi / đường hồi tiếp điện áp mâm từ bị sai.',
    check: [
      'Thử bằng nồi đáy từ phẳng chuẩn trước để loại trừ nồi.',
      'Đo trị số các điện trở công suất lớn đường đồng bộ (240kΩ – 470kΩ – 820kΩ, 1W/2W nối từ 2 đầu mâm từ về IC LM339) — cực hay bị đứt hoặc tăng trị số!',
      'Đo tụ cộng hưởng 0.27–0.33µF 1200V (giảm dung lượng làm lệch tần số không nhận nồi).',
      'Đo tụ lọc 5µF 400V (khô tụ gây sụt áp 310V khi phát xung dò nồi).',
      'Kiểm tra IC LM339 và nguồn 18V / 5V nuôi mạch.',
    ],
  },
  {
    code: 'E1', title: 'Quá áp đầu vào / Lỗi mạch bảo vệ quá áp (hoặc lỗi cảm biến tùy hãng)',
    cause: 'Điện lưới > 250–260VAC, hoặc mạch chia áp báo điện áp lưới về VXL bị sai (đứt trở kéo xuống mass / tăng trị số trở nối từ cầu diode).',
    check: [
      'Đo điện áp lưới AC thực tế (chuẩn 210–235VAC).',
      'Đo cầu phân áp báo điện áp lưới (thường 2–3 con trở 100k–330kΩ nối nối tiếp từ 2 diode chỉnh lưu riêng về chân VXL) — kiểm tra đứt/rò tụ lọc nhỏ song song.',
      'Lưu ý: Một số bếp Midea/Kangaroo dùng E1 để báo hở cảm biến mâm từ (kiểm tra cảm biến 100kΩ giữa mâm từ).',
    ],
  },
  {
    code: 'E2', title: 'Điện áp lưới quá thấp (< 170VAC) hoặc Quá nhiệt mâm từ',
    cause: 'Nguồn điện yếu, chập chờn, hoặc trở đường báo điện áp đầu vào tăng trị số làm VXL tưởng điện yếu.',
    check: [
      'Đo điện áp AC ngay tại 2 cọc vào bo mạch khi bếp đang bật.',
      'Kiểm tra các điện trở chia áp báo nguồn AC (rất hay bị tăng trị số từ 240kΩ lên >500kΩ).',
      'Nếu bếp báo E2 sau khi nấu vài phút: kiểm tra cảm biến nhiệt giữa mặt kính (100kΩ @ 25°C) và quạt tản nhiệt.',
    ],
  },
  {
    code: 'E3', title: 'Điện áp quá cao (> 260V) hoặc Cảm biến nhiệt IGBT quá nóng',
    cause: 'Quạt tản nhiệt chết/quay chậm, khe gió bít bụi, keo tản nhiệt lưng IGBT khô, hoặc cảm biến nhiệt gắn lưng IGBT sai trị số.',
    check: [
      'Kiểm tra quạt 18V có quay mạnh không; kiểm tra transistor kích quạt (S8050) và nguồn 18V.',
      'Đo cảm biến nhiệt NTC gắn sát lưng IGBT (thường 100kΩ ở 25°C; nếu chập còn vài trăm Ω sẽ báo quá nhiệt ngay khi bật).',
      'Vệ sinh khe gió và bôi lại keo tản nhiệt cho IGBT + cầu diode.',
    ],
  },
  {
    code: 'E4', title: 'Đứt / Hở mạch cảm biến nhiệt mặt kính (Mâm từ)',
    cause: 'Dây cảm biến giữa mâm từ bị đứt, giắc cắm lỏng/oxy hóa, hoặc điện trở phân áp / tụ lọc song song chân cảm biến bị hỏng.',
    check: [
      'Rút giắc cảm biến giữa mâm từ đo nguội: ở 25°C phải đạt ~90–110 kΩ (nếu OL / vô cực là đứt cảm biến).',
      'Kiểm tra chân cắm CN trên bo xem có bị đen, hở mối hàn không.',
      'Đo điện áp tại chân cảm biến trên bo khi cắm giắc: chuẩn khoảng 2.2V–2.8V.',
    ],
  },
  {
    code: 'E5', title: 'Chập cảm biến nhiệt IGBT hoặc Quá nhiệt nặng IGBT',
    cause: 'Cảm biến NTC lưng IGBT bị chập (điện trở giảm sâu), tụ gốm 104 song song chân cảm biến bị rò, hoặc IGBT nóng thật.',
    check: [
      'Rút giắc cảm biến lưng IGBT đo nguội: chuẩn ~100 kΩ @ 25°C (nếu < 10 kΩ khi nguội là chập cảm biến).',
      'Đo trực tiếp 2 lỗ cắm cảm biến trên bo (đã rút giắc): nếu bị chập thấp là rò tụ gốm lọc 104 hoặc chết chân ADC của VXL.',
    ],
  },
  {
    code: 'E6', title: 'Cảm biến mặt kính quá nóng (Đáy nồi khô / Cạn nước) hoặc Lỗi quạt',
    cause: 'Nồi đun cạn nước, quạt tản nhiệt kẹt không quay, hoặc cảm biến mặt kính giảm trị số bất thường.',
    check: [
      'Để bếp nguội hẳn 15 phút rồi bật lại.',
      'Kiểm tra quạt 18V (đo điện áp cấp quạt khi nhấn mở bếp; kiểm tra transistor S8050 lái quạt).',
      'Đo lại cảm biến giữa mâm từ ở nhiệt độ phòng (~100 kΩ).',
    ],
  },
  {
    code: 'E7 / E8', title: 'Lỗi cảm biến nhiệt / Mất giao tiếp bo phím hoặc Lỗi nguồn phụ',
    cause: 'Tùy hãng (Midea/Sunhouse/Bosch): hở cảm biến IGBT, ẩm bo phím cảm ứng, hoặc sụt áp nguồn 5V/18V.',
    check: [
      'Vệ sinh, sấy khô bo phím hiển thị và dây cáp nối lên bo công suất.',
      'Đo chuẩn 2 mức nguồn phụ từ VIPER12A/22A: +18V (không sụt dưới 16.5V) và +5.0V ổn định.',
      'Kiểm tra cả 2 cảm biến nhiệt (mâm từ và IGBT) ở 25°C đều ~100 kΩ.',
    ],
  },
];

export const WELDER_FAULTS = [
  {
    code: 'OC (Đèn đỏ)', title: 'Báo đèn vàng/đỏ OC (Quá dòng / Quá nhiệt) — Không hàn được',
    cause: 'Chập dàn diode xung đầu ra (D92-02), hỏng công tắc nhiệt 75–85°C, chết 1 nhánh IGBT/MOSFET, hoặc lỗi mạch bảo vệ quá dòng kéo chân Shutdown (chân 10 SG3525 / chân 16 UC3846) lên mức cao.',
    check: [
      'Rút giắc công tắc nhiệt (gắn trên tản nhiệt diode/IGBT) để loại trừ lỗi quá nhiệt giả.',
      'Đo nguội cọc hàn (+ / -) bằng thang Diode: nếu chập thông 2 chiều (0.00V) → tháo kiểm tra ngay dàn diode xung đầu ra D92-02 / MUR3020!',
      'Đo chân 16 SG3525 (phải có +5.1V Vref) và chân 10 Shutdown (chuẩn 0V; nếu > 0.7V là mạch bảo vệ OC đang kích khóa xung).',
      'Kiểm tra biến dòng (CT) và cầu diode 4148 chỉnh lưu tín hiệu quá dòng trên bo khiển.',
    ],
  },
  {
    code: 'NO-OUT', title: 'Bật máy quạt chạy bình thường nhưng Không có điện áp ra cọc hàn (0V)',
    cause: 'Mất xung PWM từ bo khiển (SG3525/UC3846), hỏng cặp MOSFET kích chia xung (IRFZ24N/IRF9Z24N), đứt cuộn dây biến áp chia xung, hoặc mất nguồn 310VDC (hỏng rơ-le khởi động mềm / đứt trở PTC).',
    check: [
      'Đo điện áp 310VDC trên tụ lọc nguồn chính (cẩn thận giật!). Nếu 0V: kiểm tra công tắc nguồn, cầu diode GBJ2510/KBPC3510, điện trở mồi PTC và rơ-le 24V.',
      'Đo nguồn nuôi bo khiển: +15V / -15V (từ 7815/7915) và +24V từ nguồn xung UC3842/3843.',
      'Đo xung ra chân 11 & 14 của SG3525 (đồng hồ số thang VAC/DC đo được ~5.5–6.5VDC mỗi chân nếu có xung).',
      'Kiểm tra 4 con MOSFET kích chia xung IRFZ24N / IRF9Z24N (rất hay chết rò/chập).',
    ],
  },
  {
    code: 'BLOW-IGBT', title: 'Đóng điện 220V là Nổ IGBT / MOSFET công suất ngay lập tức',
    cause: 'Xung kích 4 nhánh cực Gate bị lệch pha/mất xung 1 nhánh (cháy trở Gate 5.1–22Ω, chập diode 4148, chập biến áp chia xung), hoặc chập thứ cấp (dàn diode D92-02 / biến áp chính chập vòng).',
    check: [
      'TUYỆT ĐỐI chưa hàn IGBT mới vội! Cấp nguồn 24V nuôi riêng bo khiển trước.',
      'Đo kiểm tra tất cả điện trở cực Gate (5.1Ω – 22Ω), diode xung 4148/SS14 và tụ lọc trên cả 4 cụm kích Gate — phải cân trị số tuyệt đối.',
      'Dùng Oscilloscope (hoặc đồng hồ đo tần số/điện áp) kiểm tra xung ra tại 4 cặp chân G–E phải ĐỀU NHAU (biên độ ±12–15V, tần số 40–100 kHz, dạng xung vuông đẹp không méo).',
      'Đo kiểm tra không chập dàn diode D92-02 và biến áp chính trước khi hàn IGBT và thử qua bóng đèn sợi đốt 100–200W nối tiếp.',
    ],
  },
  {
    code: 'WEAK', title: 'Hàn rất yếu, dính que, không chỉnh được dòng hàn',
    cause: 'Chiết áp chỉnh dòng (1kΩ / 10kΩ) bị mòn/đứt, hỏng nguồn phụ ±15V, hỏng IC Op-Amp TL084/LM324, hoặc tụ lọc nguồn 310V (470µF 400V) bị khô sụt áp mạnh khi kéo hồ quang.',
    check: [
      'Đo chiết áp chỉnh dòng hàn (xoay đều từ 0 đến max xem có bị nhảy/đứt quãng không).',
      'Đo dung lượng dàn tụ lọc 470µF/400V (nếu máy dùng lâu tụ khô còn < 150µF sẽ hàn cực yếu).',
      'Kiểm tra cọc nối cáp hàn, kẹp mass có bị lỏng/oxy hóa gây nóng và sụt áp không.',
      'Kiểm tra điện áp chân điều khiển về TL084 / CA3140 khi vặn chiết áp.',
    ],
  },
  {
    code: 'NO-24V', title: 'Mất nguồn hoàn toàn (Quạt không quay, đèn không sáng)',
    cause: 'Chết mạch nguồn phụ 24V (IC UC3842/3843/VIPER22A/TOP224, MOSFET 4N90/K3878), đứt điện trở cầu chì 22Ω 2W hoặc điện trở mồi khởi động 100k–200kΩ.',
    check: [
      'Đo điện áp 310VDC đã tới đầu biến áp nguồn phụ 24V chưa.',
      'Kiểm tra điện trở cầu chì (10–22Ω), MOSFET nguồn phụ (thường 4N90 / 2N60), trở cảm biến dòng chân S (1–2.2Ω).',
      'Đo chân 7 VCC của UC3843 (phải có ~12–16V) và chân 8 Vref (= 5.0V). Nếu chân 7 nhấp nháy 8–12V là tải đầu ra 24V bị chập (kiểm tra rơ-le, quạt, diode chỉnh lưu đầu ra 24V).',
    ],
  },
];

export const MULTIMETER_GUIDES = [
  {
    name: 'IGBT Công suất (H20R1203, FGH40N60, FGA25N120)',
    pinout: 'Nhìn mặt chữ: 1: Gate (G) · 2: Collector (C, lưng) · 3: Emitter (E)',
    digital: [
      'Bật thang Diode. Chạm chung 3 chân G–C–E để xả hết điện tích cực Gate.',
      'Đo E–C: Que ĐỎ vào E, que ĐEN vào C → hiện ~0.35V – 0.55V (diode bảo vệ nội). Đảo ngược (Đỏ vào C, Đen vào E) → OL (vô cực). Nếu kêu bíp 0.00V là CHẬP C–E (chết).',
      'Đo G–E và G–C cả 2 chiều: đều phải OL (nếu có trị số hoặc bíp là rò/thủng cực Gate — vứt ngay!).',
      'Lưu ý: Đồng hồ số thường có điện áp thang diode thấp (~2.5–3V) nên khó kích mở hoàn toàn IGBT (cần Vge > 5V); để test đóng/mở hãy dùng đồng hồ kim thang ×10k hoặc cấp thử pin 9V vào G(+)–E(-).',
    ],
    analog: [
      '⚠️ NHỚ QUY TẮC VÀNG ĐỒNG HỒ KIM: Ở thang đo Ω (×1, ×10, ×10k), que ĐEN nối cực DƯƠNG (+) pin trong đồng hồ (thang ×10k xuất 9V–12V!), que ĐỎ là cực ÂM (-).',
      'Bước 1 (Xả khóa): Bật thang ×10k, chập nhanh G–E. Đo Đen vào C, Đỏ vào E → kim KHÔNG lên (∞). Đảo Đỏ vào C, Đen vào E → kim lên khoảng 1/2 thang (diode nội).',
      'Bước 2 (Kích mở IGBT): Để que ĐỎ ở E, chấm que ĐEN vào G (cấp +9V kích mở cực Gate) rồi đưa que ĐEN về lại C → kim PHẢI LÊN KỊCH (0 Ω) và giữ nguyên!',
      'Bước 3 (Xả tắt IGBT): Vẫn giữ que ĐEN ở C, chấm que ĐỎ vào G (hoặc dùng tay chạm G–E) rồi đưa que ĐỎ về E → kim PHẢI TỤT VỀ ∞ ngay lập tức. Đạt đủ 3 bước là IGBT SỐNG 100%!',
    ],
  },
  {
    name: 'MOSFET Kênh N (K2611, 23N50E, IRFZ44N, IRLZ44N)',
    pinout: 'Nhìn mặt chữ: 1: Gate (G) · 2: Drain (D, lưng) · 3: Source (S)',
    digital: [
      'Bật thang Diode. Xả cực G bằng cách chạm chung G–S.',
      'Đo D–S: Que ĐỎ vào S, que ĐEN vào D → hiện ~0.45V – 0.65V (diode ký sinh). Đảo ngược (Đỏ vào D, Đen vào S) → OL.',
      'Kích mở: Chấm que ĐỎ vào G, que ĐEN vào S (nạp +3V vào tụ Gate), rồi đưa que ĐỎ về D → nếu là Logic-Level (IRLZ44N) máy sẽ hiện ~0.00V–0.1V (thông mạch D–S).',
      'Xả tắt: Chấm que ĐEN vào G (Đỏ ở S) → đo lại Đỏ vào D, Đen vào S phải về OL.',
    ],
    analog: [
      'Bật thang ×10k (xuất 9V ở que ĐEN). Xả G–S trước.',
      'Đo khóa: Que ĐEN vào D, que ĐỎ vào S → kim KHÔNG lên (∞). Đảo ngược (Đỏ vào D, Đen vào S) → kim lên (diode nội).',
      'Kích mở: Giữ que ĐỎ ở S, chấm que ĐEN vào G rồi đưa que ĐEN về D → kim lên kịch (0 Ω) và đứng yên!',
      'Xả tắt: Chạm ngón tay vào G–S (hoặc chấm que ĐỎ vào G) → đo lại Đen-D / Đỏ-S kim về ∞ ngay là MOSFET NGON 100%!',
    ],
  },
  {
    name: 'Transistor BJT (S8050 NPN & S8550 PNP)',
    pinout: 'Nhìn mặt phẳng: 1: E · 2: B · 3: C (chú ý BC547 ngược lại: C–B–E)',
    digital: [
      'Thang Diode. Với NPN (S8050): Que ĐỎ cố định ở B, đo với E và C đều hiện ~0.60V – 0.72V (thường B–E nhỉnh hơn B–C vài mV). Đảo que ĐEN ở B → cả 2 đều OL.',
      'Với PNP (S8550): ngược lại — que ĐEN cố định ở B, đo với E và C đều hiện ~0.60V – 0.72V.',
      'Đo C–E cả 2 chiều phải là OL (nếu có số hoặc kêu bíp là chết chập/rò).',
    ],
    analog: [
      'Bật thang ×10 (hoặc ×1): Với NPN (S8050), que ĐEN (+) cố định ở B, que ĐỎ (-) vào E và C → kim lên đều ~5–10 Ω. Đảo que ĐỎ ở B → kim không lên.',
      'Với PNP (S8550): que ĐỎ (-) cố định ở B, que ĐEN (+) vào E và C → kim lên đều.',
      'Kiểm tra rò C–E (quan trọng trên bếp từ!): Bật thang ×10k đo giữa C và E cả 2 chiều — kim TUYỆT ĐỐI KHÔNG ĐƯỢC NHÍCH. Nếu nhích nhẹ là bị rò → thay ngay!',
    ],
  },
  {
    name: 'Cầu Diode 4 chân (GBJ2510 / KBPC3510)',
    pinout: 'Chân vát góc (+), 2 chân giữa (~ ~ AC), chân ngoài cùng (-)',
    digital: [
      'Thang Diode. Que ĐEN vào chân (+), lần lượt đặt que ĐỎ vào 2 chân (~) → đều hiện ~0.45V – 0.55V. Đảo lại phải OL.',
      'Que ĐỎ vào chân (-), lần lượt đặt que ĐEN vào 2 chân (~) → đều hiện ~0.45V – 0.55V. Đảo lại phải OL.',
      'Đo giữa (+) và (-): Đỏ ở (-), Đen ở (+) hiện ~0.9V – 1.1V; đảo lại phải OL. Nếu bất kỳ cặp nào 0.00V là chết cầu!',
    ],
    analog: [
      'Bật thang ×10. Que ĐỎ (-) vào chân (+), lần lượt chấm que ĐEN (+) vào 2 chân (~) → kim lên đều (~5–10 Ω). Đảo que kim không lên.',
      'Que ĐEN (+) vào chân (-), lần lượt chấm que ĐỎ (-) vào 2 chân (~) → kim lên đều. Đảo que kim không lên.',
      'Bật thang ×10k kiểm tra ngược giữa (+) và (-) xem có bị rò không (kim không được nhích).',
    ],
  },
  {
    name: 'Diode xung kép Máy hàn (D92-02 / MUR3020PT)',
    pinout: 'Nhìn mặt chữ: 1: Anode 1 · 2: Cathode chung (Tab) · 3: Anode 2',
    digital: [
      'Thang Diode. Que ĐEN cố định vào chân giữa (2 - Cathode).',
      'Chạm que ĐỎ lần lượt vào chân 1 và chân 3 → cả 2 đều hiện ~0.30V – 0.45V (diode xung áp rơi thấp hơn 1N4007).',
      'Đảo que ĐỎ vào chân giữa, ĐEN vào 1 và 3 → cả 2 đều OL. Đo giữa chân 1 và 3 cả 2 chiều đều OL.',
    ],
    analog: [
      'Bật thang ×1 hoặc ×10. Que ĐỎ (-) vào chân giữa (2). Chấm que ĐEN (+) vào chân 1 và chân 3 → kim lên đều nhau.',
      'Đảo que ĐEN vào chân giữa, ĐỎ vào 1 và 3 → kim không lên.',
      'Chuyển thang ×10k đo ngược (Đen ở chân 2, Đỏ ở 1 và 3): kim không được rò quá 1–2 vạch nhỏ.',
    ],
  },
  {
    name: 'Optocoupler cách ly quang (PC817)',
    pinout: 'Chấm tròn chân 1: 1 (Anode +) · 2 (Cathode -) · 3 (Emitter) · 4 (Collector)',
    digital: [
      'Đo chân 1–2 (LED phát hồng ngoại) bằng thang Diode: Đỏ ở 1, Đen ở 2 hiện ~1.0V – 1.2V; đảo lại OL.',
      'Đo chân 3–4 (Transistor thu) cả 2 chiều phải OL (nếu có số là chập/rò).',
      'Test sống chuẩn 100%: dùng 1 viên pin 1.5V (hoặc đồng hồ kim thang ×1) cấp vào chân 1(+)–2(-), đồng thời dùng đồng hồ số đo thang Diode chân 4(Đỏ)–3(Đen) phải sụt xuống < 0.2V (thông mạch)!',
    ],
    analog: [
      'Thang ×10 đo 1–2: Đen ở 1, Đỏ ở 2 kim lên; đảo lại không lên.',
      'Thang ×10k đo 3–4 cả 2 chiều: kim không lên (∞).',
      'Test kích quang bằng 2 đồng hồ kim (cách thợ chuẩn nhất): Đồng hồ A bật ×1 đặt Đen vào 1, Đỏ vào 2 (phát sáng LED nội). Đồng hồ B bật ×10 đặt Đen vào 4, Đỏ vào 3 → khi chạm Đồng hồ A thì kim Đồng hồ B PHẢI LÊN MẠNH; nhả ra kim tụt về ∞ là PC817 SỐNG 100%!',
    ],
  },
  {
    name: 'Tụ hóa lọc nguồn (400V) & Tụ cộng hưởng Bếp từ (0.3µF 1200V)',
    pinout: 'Tụ hóa có sọc trắng là cực Âm (-); tụ 0.3µF/5µF bếp từ không phân cực',
    digital: [
      '⚠️ NHỚ XẢ SẠCH ĐIỆN TỤ 400V qua bóng đèn/điện trở 1kΩ 5W trước khi đo (nổ đồng hồ nếu tụ còn tích 310V!).',
      'Bật thang đo Điện dung (nF/µF): tụ tốt phải nằm trong ±10–15% trị số ghi trên thân. Tụ 0.3µF bếp từ tụt xuống < 0.24µF là PHẢI THAY ngay kẻo nổ IGBT!',
      'Bật thang Ω cao kiểm tra rò: điện trở phải tăng dần lên OL (nếu dừng ở vài kΩ là tụ rò).',
    ],
    analog: [
      'Xả sạch điện tụ trước khi đo!',
      'Tụ hóa lớn (100µF–1000µF): bật thang ×10 hoặc ×100. Chạm 2 que vào 2 chân tụ → kim PHÓNG LÊN rồi TỤT TỪ TỪ VỀ ∞. Đảo 2 que kim phóng mạnh hơn rồi lại về ∞. Nếu kim không nhích (đứt/khô) hoặc lên kịch không tụt về (chập) là tụ HỎNG.',
      'Tụ nhỏ (0.3µF – 5µF bếp từ): bật thang ×1k hoặc ×10k → chạm 2 que kim nhích phóng nhẹ rồi tụt hẳn về ∞ (không được dừng lưng chừng).',
    ],
  },
];
