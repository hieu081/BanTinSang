// parts.js — Kho tra nhanh thứ tự chân (nhìn từ mặt chữ) & mã thay thế chuyên Bếp từ, Máy hàn điện tử & Cơ điện tử
export const PARTS = [
  // ===================== BẾP TỪ & MÁY HÀN: IGBT CÔNG SUẤT =====================
  {
    name: 'H20R1203', type: 'IGBT Bếp từ (có Diode nội)', pkg: 'TO-247',
    pins: 'Mặt chữ hướng về mình: 1: Gate (G) · 2: Collector (C, lưng tản nhiệt) · 3: Emitter (E)',
    spec: '1200V · 20A (@100°C) / 40A (@25°C) · Vce(sat) 1.75V · chuyên mạch cộng hưởng 20–30 kHz',
    equiv: 'FGA25N120ANTD (khỏe hơn), H20R1202, H20PR5, IHW20N120R3, FGA20N120',
    note: 'Trước khi thay IGBT bếp từ mới, BẮT BUỘC kiểm tra tụ cộng hưởng 0.27–0.33µF 1200V, tụ lọc 5µF 400V, cầu diode GBJ2510 và cặp S8050/S8550 + Zener 18V chân G!',
  },
  {
    name: 'FGA25N120', type: 'IGBT Bếp từ công suất lớn', pkg: 'TO-3P / TO-247',
    pins: 'Mặt chữ hướng về mình: 1: Gate (G) · 2: Collector (C, Tab) · 3: Emitter (E)',
    spec: '1200V · 25A (@100°C) / 50A (@25°C) · Vce(sat) ~2.0V · Có diode nội',
    equiv: 'H20R1203, H25R1202, H30R1602 (1600V), IKW25N120T2, FGA30N120',
    note: 'Mã "quốc dân" nâng cấp cho hầu hết bếp từ đơn/đôi 2000–2200W. Nhớ bôi keo tản nhiệt mỏng đều và siết chặt ốc.',
  },
  {
    name: 'FGH40N60SFD', type: 'IGBT Máy hàn điện tử', pkg: 'TO-247',
    pins: 'Mặt chữ hướng về mình: 1: Gate (G) · 2: Collector (C, Tab) · 3: Emitter (E)',
    spec: '600V · 40A (@100°C) / 80A (@25°C) · Tần số cao 40–100 kHz · Có diode hồi phục nhanh',
    equiv: 'FGH60N60SMD (khỏe hơn), IKW40N60H3, K40T60, G40N60, STGW40H60DFB',
    note: 'Rất phổ biến trong máy hàn que mini (ZX7-200/250). Khi nổ IGBT, phải kiểm tra kỹ 4 mạch kích cực G (điện trở 5.1–22Ω, diode 4148, biến áp chia xung) và cân xung bằng Oscilloscope trước khi đóng điện 310V!',
  },
  {
    name: 'FGH60N60SMD', type: 'IGBT Máy hàn công suất lớn', pkg: 'TO-247',
    pins: 'Mặt chữ hướng về mình: 1: Gate (G) · 2: Collector (C, Tab) · 3: Emitter (E)',
    spec: '600V · 60A (@100°C) / 120A (@25°C) · Vce(sat) 1.9V · Đóng cắt siêu nhanh',
    equiv: 'IKW60N60H3, K60T60, FGH75N60, SGT60N60',
    note: 'Thay nâng cấp cực bền cho FGH40N60 trong máy hàn ARC/MIG/TIG 200–315A. Lưu ý mua đúng hàng zin, tránh hàng mài lưng.',
  },

  // ===================== MÁY HÀN: MOSFET CÔNG SUẤT & CẶP KÍCH =====================
  {
    name: 'K2611 (2SK2611)', type: 'MOSFET Máy hàn 3 bo (ZX7)', pkg: 'TO-3P',
    pins: 'Mặt chữ hướng về mình: 1: Gate (G) · 2: Drain (D, Tab) · 3: Source (S)',
    spec: '900V · 9A · Rds(on) 1.4 Ω · Kênh N',
    equiv: '2SK3878 (chạy mát hơn), 2SK2698, 2SK4108, 12N90, 11N90',
    note: 'Hay gặp trong máy hàn 3 bo 12 MOSFET (chạy ở tần số ~100 kHz). Thay đồng bộ cùng lô/cùng hãng để chia dòng đều giữa các nhánh.',
  },
  {
    name: 'K3878 (2SK3878)', type: 'MOSFET Máy hàn cao áp', pkg: 'TO-3P',
    pins: 'Mặt chữ hướng về mình: 1: Gate (G) · 2: Drain (D, Tab) · 3: Source (S)',
    spec: '900V · 9A · Rds(on) 1.3 Ω · Tốc độ đóng cắt nhanh',
    equiv: '2SK2611, 2SK4108, 12N90, FQA11N90C',
    note: 'Kiểm tra kỹ diode dập xung và điện trở cực G (thường 4.7–10 Ω) + tụ 470pF–1nF trước khi đóng tải.',
  },
  {
    name: '23N50E', type: 'MOSFET Máy hàn cầu H', pkg: 'TO-247 / TO-3P',
    pins: 'Mặt chữ hướng về mình: 1: Gate (G) · 2: Drain (D, Tab) · 3: Source (S)',
    spec: '500V · 23A · Rds(on) 0.22 Ω · Kênh N',
    equiv: 'IRFP460 (20A 500V), 20N50, 24N50, FQA24N50, 2SK2698',
    note: 'Thường chạy theo dàn 4/8/12 con trong máy hàn MOSFET. Luôn kiểm tra điện áp kích G-S cân đều 4 nhánh trước khi cấp nguồn 310V.',
  },
  {
    name: 'IRFZ24N / IRF9Z24N', type: 'Cặp MOSFET kích chia xung Máy hàn', pkg: 'TO-220',
    pins: 'Mặt chữ hướng về mình: 1: Gate (G) · 2: Drain (D, Tab) · 3: Source (S)',
    spec: '55V · IRFZ24N (kênh N, 17A) + IRF9Z24N (kênh P, -12A)',
    equiv: 'IRFZ34N + IRF9Z34N, IRFZ44N + IRF9540N (khỏe hơn, dùng rất bền!)',
    note: 'Nằm trên bo điều khiển máy hàn (cầu H nhỏ lái biến áp chia xung 15:15:15:15). Nếu chết 1 con nên thay cả bộ 4 con (2N + 2P) cho cân xung.',
  },
  {
    name: 'S8050 / S8550', type: 'Cặp BJT Driver kích IGBT Bếp từ', pkg: 'TO-92 / SOT-23',
    pins: 'Mặt phẳng hướng về mình: 1: E · 2: B · 3: C (S8050 = NPN, S8550 = PNP)',
    spec: '25V · 500 mA (bản SS8050/SS8550 = 1.5A, 40V)',
    equiv: 'SS8050 + SS8550 (nên dùng bản SS chịu dòng cao hơn cho bếp từ), 2N2222 + 2N2907',
    note: 'Khi bếp từ nổ IGBT, 80% trường hợp cặp S8050/S8550 đẩy-kéo cực G bị rò/chập — nên thay mới cả cặp cùng Zener 18V.',
  },

  // ===================== IC NGUỒN, IC DAO ĐỘNG & SO SÁNH BẾP TỪ / MÁY HÀN =====================
  {
    name: 'VIPER12A', type: 'IC Nguồn xung Bếp từ (18V / 5V)', pkg: 'DIP-8 / SO-8',
    pins: '1,2: Source (GND) · 3: FB · 4: VDD (14–38V) · 5,6,7,8: Drain (310V)',
    spec: '730V · Công suất ~8–13W · Tần số 60 kHz',
    equiv: 'VIPER22A (chân giống hệt, khỏe hơn tới 20W — thay rất bền!), AP8012 (cần xem lại chân FB)',
    note: 'Khi VIPER12A nổ, kiểm tra điện trở cầu chì 22Ω 2W, diode chỉnh lưu đầu vào, tụ lọc 4.7–10µF 450V và Zener 18V đường hồi tiếp.',
  },
  {
    name: 'VIPER22A', type: 'IC Nguồn xung công suất 20W', pkg: 'DIP-8 / SO-8',
    pins: '1,2: Source · 3: FB · 4: VDD · 5,6,7,8: Drain (310V)',
    spec: '730V · 12–20W · Tần số 60 kHz',
    equiv: 'VIPER12A (yếu hơn, chỉ dùng cho bếp từ đơn), thay ngược VIPER22A cho VIPER12A rất tốt',
    note: 'Chú ý điện áp ra phải ổn định 18V (nuôi quạt & kích IGBT) và qua 78L05 ra 5V (nuôi vi xử lý).',
  },
  {
    name: 'LM339', type: 'IC 4 bộ So sánh (Bếp từ)', pkg: 'DIP-14 / SOP-14',
    pins: '3: VCC (+18V) · 12: GND · 4 kênh so sánh (OUT kiểu Open-Collector)',
    spec: 'Nguồn đơn 2–36V · Chuyên tạo xung răng cưa, dò nồi, bảo vệ quá áp/quá dòng trong bếp từ',
    equiv: 'LM339N, LM339D (SMD), LM2901',
    note: 'Bếp từ báo lỗi không nhận nồi (E0) hoặc nổ IGBT lặp lại rất hay do LM339 lỗi hoặc điện trở lớn (240k–820kΩ) đường dò áp bị tăng trị số.',
  },
  {
    name: 'SG3525 / KA3525', type: 'IC Dao động PWM Máy hàn', pkg: 'DIP-16 / SOP-16',
    pins: '1: INV · 2: NI · 5: CT · 6: RT · 8: Soft-Start · 10: Shutdown (bảo vệ OC) · 11,14: OUT A/B · 12: GND · 13,15: VCC (+15V) · 16: VREF (+5.1V)',
    spec: '8–35V · 2 ngõ ra đẩy-kéo lệch pha 180° · Tần số tới 400 kHz',
    equiv: 'KA3525A, UC3525A (chú ý SG3524 khác chân!)',
    note: 'Kiểm tra nhanh máy hàn báo đèn OC (quá dòng): đo chân 16 phải có 5.1V, chân 10 (Shutdown) phải ở 0V (nếu lên >0.7V là mạch bảo vệ đang khóa xung).',
  },
  {
    name: 'UC3846', type: 'IC Điều khiển dòng PWM Máy hàn', pkg: 'DIP-16 / SOP-16',
    pins: '2: VREF (5.1V) · 4: CS+ · 5: E/A+ · 8: CT · 9: RT · 11,14: OUT A/B · 12: GND · 13,15: VCC · 16: Shutdown',
    spec: '8–40V · Điều khiển chế độ dòng (Current Mode) · Dùng nhiều trong máy hàn công nghiệp/MIG/TIG',
    equiv: 'KA3846, SG3846, UC2846',
    note: 'Đo chân 2 (Vref = 5.1V) và chân 16 (Shutdown = 0V) trước khi nghi chết IC.',
  },
  {
    name: 'UC3842 / UC3843', type: 'IC Nguồn xung 24V Máy hàn', pkg: 'DIP-8 / SOP-8',
    pins: '1: COMP · 2: VFB · 3: ISENSE · 4: RT/CT · 5: GND · 6: OUT · 7: VCC · 8: VREF (5.0V)',
    spec: 'UC3842: mở nguồn 16V, Duty max 96% | UC3843: mở 8.4V | UC3844/3845: Duty max 50%',
    equiv: 'KA3842/3843, UC2842/2843 (KHÔNG lắp nhầm 3842 sang 3844/3845 khi mạch cần duty >50% và ngược lại!)',
    note: 'Dùng lái MOSFET 4N90/K3878 tạo nguồn phụ 24V nuôi quạt, rơ-le và bo khiển máy hàn.',
  },
  {
    name: 'TL084 / LM324', type: 'IC 4 Op-Amp Máy hàn', pkg: 'DIP-14 / SOP-14',
    pins: '4: VCC+ · 11: VCC- (hoặc GND) · 4 bộ Op-Amp đối xứng',
    spec: 'TL084 (JFET input, nguồn đôi ±15V) | LM324 (nguồn đơn 3–32V)',
    equiv: 'TL084 ↔ TL074, MC34074 | LM324 ↔ LM2902 (không thay lẫn TL084 và LM324 nếu mạch cần tốc độ cao)',
    note: 'Xử lý tín hiệu chiết áp chỉnh dòng hàn và mạch bảo vệ quá dòng/quá nhiệt trên máy hàn.',
  },

  // ===================== DIODE CẦU & DIODE XUNG CÔNG SUẤT =====================
  {
    name: 'GBJ2510 / KBJ2510', type: 'Cầu Diode 25A Bếp từ & Máy hàn', pkg: 'GBJ-4 (dẹt 4 chân)',
    pins: 'Chân vát góc bên trái là (+), 2 chân giữa là (~ ~ AC), chân phải cùng là (-)',
    spec: '1000V · 25A · Dùng chỉnh lưu 220VAC → 310VDC',
    equiv: 'GBJ3510 (35A khỏe hơn), KBPC3510 (vỏ vuông bắt ốc), D25XB80/100',
    note: 'Đo nguội bằng thang Diode: nếu chập giữa chân (+) và (-) hoặc AC với (+/-) là chết cầu.',
  },
  {
    name: 'D92-02', type: 'Diode xung kép đầu ra Máy hàn', pkg: 'TO-3P / TO-247',
    pins: 'Mặt chữ hướng về mình: 1: Anode 1 · 2: Cathode chung (Tab) · 3: Anode 2',
    spec: '200V · 20A (10A × 2) · Siêu nhanh (t_rr ~35 ns)',
    equiv: 'ESAD92-02, FFPF20U20DN, MUR3020PT (30A khỏe hơn), STTH3002CW, D92M-02',
    note: 'Nằm thành dàn 4–12 con ở tầng chỉnh lưu thứ cấp máy hàn. Chập 1 con sẽ làm máy hàn báo đèn đỏ OC hoặc nổ IGBT!',
  },
  {
    name: 'MUR1560 / RHRP1560', type: 'Diode siêu nhanh 600V', pkg: 'TO-220AC (2 chân)',
    pins: '1: Cathode (Tab) · 2: Anode',
    spec: '600V · 15A · Ultrafast t_rr ~35–60 ns',
    equiv: 'MUR1560G, RHRP1560, STTH15R06, BYV29-600, FFP15S60S',
    note: 'Hay dùng làm diode dập xung / chỉnh lưu cao áp trong máy hàn và bộ nguồn công suất.',
  },

  // ===================== CƠ ĐIỆN TỬ & VI ĐIỀU KHIỂN PHỔ BIẾN =====================
  {
    name: 'IRFZ44N / IRLZ44N', type: 'MOSFET kênh N (10V / 5V)', pkg: 'TO-220',
    pins: 'Mặt chữ hướng về mình: 1: Gate (G) · 2: Drain (D, Tab) · 3: Source (S)',
    spec: '55V · 47–49A · IRFZ44N kích 10V | IRLZ44N Logic-Level kích 5V',
    equiv: 'IRF3205 (55V 110A), STP55NF06, IRL540N',
    note: 'Luôn gắn trở 10 kΩ kéo G xuống S.',
  },
  {
    name: 'L7805 / L7812 / L7815', type: 'IC Ổn áp dương cố định', pkg: 'TO-220',
    pins: 'Mặt chữ hướng về mình: 1: IN · 2: GND (Tab) · 3: OUT',
    spec: '7805 (+5V), 7812 (+12V), 7815 (+15V) · Imax 1.5A',
    equiv: 'LM7805/12/15, KA7805/12/15 (lưu ý 79xx ổn áp âm có thứ tự chân 1:GND · 2:IN · 3:OUT!)',
    note: 'Rất hay dùng tạo nguồn +15V nuôi bo khiển máy hàn SG3525/UC3846 và +5V nuôi VXL bếp từ.',
  },
  {
    name: 'LM317', type: 'IC Ổn áp chỉnh áp 1.25–37V', pkg: 'TO-220',
    pins: 'Mặt chữ hướng về mình: 1: ADJ · 2: VOUT (Tab) · 3: VIN',
    spec: '1.25–37V · 1.5A · Vout = 1.25 × (1 + R2/R1)',
    equiv: 'LM317T, KA317, LM338 (5A)',
    note: 'KHÁC HẲN 7805: chân giữa (Tab) là VOUT, không phải GND!',
  },
  {
    name: 'AMS1117-3.3', type: 'LDO 3.3V SMD', pkg: 'SOT-223',
    pins: '1 (trái): GND · 2 (giữa & Tab trên): VOUT 3.3V · 3 (phải): VIN',
    spec: '3.3V · 1A (thực tế ≤ 500 mA với Vin=5V)',
    equiv: 'LM1117-3.3, LD1117S33',
    note: 'Cần tụ lọc 10–22 µF ở ngõ ra VOUT.',
  },
  {
    name: 'PC817', type: 'Optocoupler hồi tiếp nguồn xung', pkg: 'DIP-4 / SMD-4',
    pins: 'Chấm tròn chân 1: 1: Anode (+) · 2: Cathode (-) · 3: Emitter · 4: Collector',
    spec: 'Cách ly 5 kV · Vce 35–80V · Ic 50 mA',
    equiv: 'EL817, LTV-817, TLP521, FL817',
    note: 'Kết hợp với TL431 trong mạch hồi tiếp ổn áp nguồn xung máy hàn và bếp từ.',
  },
  {
    name: 'TL431', type: 'IC Ổn áp tham chiếu 2.5V', pkg: 'TO-92 / SOT-23',
    pins: 'TO-92 mặt phẳng hướng về mình: 1: REF · 2: Anode (GND) · 3: Cathode',
    spec: 'Vref = 2.5V · Dòng 1–100 mA · Chịu áp 36V',
    equiv: 'KA431, AZ431, LM431',
    note: 'Đi cặp với PC817; nếu nguồn xung máy hàn bị dâng áp cao bất thường, kiểm tra ngay TL431 và PC817!',
  },
];
