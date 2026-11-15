/* 🐈‍⬛ MUN – mèo mun mascot của MyBit. Cùng phong cách hình học với app icon (khối đen góc cạnh, đường cắt sáng).
   Tính cách: kiêu kì, đủng đỉnh, lạnh lùng, chiến lược – nói ít, nhắc kỷ luật, KHÔNG BAO GIỜ khuyên mua / bán.
   Sống ở mép dưới màn hình (điện thoại: ngồi trên thanh điều hướng dưới), đi tới đi lui, ngồi liếm lông khi có thông báo, ngủ khi anh để yên.
   Tải khi cần (lazyJs) – tắt trong Tài khoản › Mèo Mun. Bộ đồ: Cổ điển · Kính râm (miễn phí) · Mũ phớt (gói Pro). */
(function () {
  if (window.MUN) return;
  const NS = 'xmlns="http://www.w3.org/2000/svg"';
  const P = (pts) => pts.map((p) => p.join(",")).join(" ");
  // ---------------------------------------------------------------- dáng (mặt hướng phải; đi sang trái thì lật ngang)
  // NGỒI – thẳng lưng, đầu ngẩng, đuôi quấn trước chân
  const SIT = { vb: [100, 100], eye: [72.5, 23.6], hat: [66, 15, -6, 1], svg: (A = "") => `
    <g class="mb">
      <polygon class="f" points="${P([[34, 96], [24, 92], [20, 80], [22, 64], [30, 50], [40, 40], [50, 33], [52, 24], [55, 19], [57, 6], [63, 15], [69, 15], [76, 7], [75, 19], [79, 25], [83, 30], [80, 33], [75, 36], [69, 38], [67, 48], [68, 60], [69, 90], [74, 92], [75, 96], [60, 96], [59, 88], [56, 96]])}"/>
      <path class="cut" d="M40 58 L50 64 L53 80 L51 96 M58 44 L63 58 L62.5 92 M44 50 L51 55"/>
      <polygon class="e" points="${P([[69.6, 23.4], [76, 22], [75, 25], [70, 25.4]])}"/>${A}
    </g>
    <g class="tl"><polygon class="f" points="${P([[24, 86], [14, 90], [9, 96.5], [17, 96.5], [26, 91]])}"/><polygon class="f" points="${P([[15, 97.5], [68, 97.5], [79, 95], [84, 96], [72, 99.6], [15, 99.6]])}"/></g>` };
  // LIẾM LÔNG – chính là app icon
  const ICON = "M143.0 1013.9C122.4 1007.9 99.0 1000.9 91.0 998.4C83.0 995.8 73.8 993.1 70.5 992.3C67.2 991.6 61.5 990.0 57.8 988.8L51.0 986.7L40.1 969.6C34.1 960.2 22.6 942.4 14.6 930.1C6.6 917.8 0.0 907.1 0.0 906.5C0.0 905.9 4.4 899.3 9.8 891.9C26.4 869.2 47.8 840.1 58.0 826.5C63.3 819.4 70.8 809.3 74.5 804.1L81.3 794.6L78.6 748.1C74.8 682.2 73.4 655.7 70.0 587.6L67.0 527.8L82.1 499.1C90.4 483.4 101.2 463.1 106.0 454.0C110.8 444.9 119.8 427.8 126.0 416.0C132.2 404.2 145.1 379.9 154.5 362.0C164.0 344.1 177.3 318.8 184.0 305.7C190.8 292.7 196.9 282.0 197.6 282.0C198.3 282.0 212.3 277.0 228.7 270.9C257.3 260.2 323.8 235.9 402.5 207.4C422.9 200.0 444.5 192.1 450.7 189.8L461.9 185.7L484.2 168.5C496.5 159.1 517.9 142.6 531.8 131.8L557.1 112.3L581.2 111.7C594.5 111.3 618.9 111.0 635.4 111.0L665.5 111.0L670.5 109.6C673.2 108.8 692.6 103.0 713.5 96.6C734.4 90.1 770.6 79.0 794.0 71.9L836.5 58.9L858.5 59.3L880.5 59.7L935.5 32.7C996.7 2.7 1003.1 -0.3 1003.8 0.5C1004.3 0.9 992.0 91.0 990.4 98.7L990.0 100.8L1004.8 114.1C1036.0 142.4 1043.5 149.4 1044.4 150.8C1044.9 151.7 1046.6 156.7 1048.1 161.9C1053.0 178.3 1062.6 211.8 1067.5 229.2L1072.2 245.8L1059.9 270.1L1047.6 294.5L1049.4 318.0C1050.3 330.9 1051.4 344.0 1051.7 347.1L1052.3 352.7L1043.2 357.8C1038.2 360.6 1028.4 366.6 1021.3 371.1L1008.5 379.3L998.6 380.4L988.7 381.5L987.3 388.4C985.9 395.1 983.4 401.0 978.9 407.8C977.8 409.5 977.2 411.0 977.7 411.0C978.1 411.0 983.3 410.1 989.2 409.0L1000.0 407.1L1032.7 418.1C1050.8 424.2 1066.0 429.6 1066.6 430.1C1067.2 430.6 1068.2 432.7 1068.8 434.7C1069.5 436.8 1074.0 448.6 1078.9 461.0L1087.8 483.5L1086.2 484.8C1085.3 485.4 1073.7 491.8 1060.5 498.9L1036.3 511.9L1002.9 500.9C984.5 494.9 968.8 490.0 968.0 490.0C967.2 490.0 948.6 498.3 926.5 508.4C884.8 527.7 831.3 552.0 798.0 567.0C776.4 576.7 718.9 602.8 706.6 608.4C702.3 610.4 699.0 611.4 699.3 610.7C702.5 602.9 714.0 575.7 718.5 565.5C721.6 558.4 739.0 518.1 757.0 476.0C775.1 433.9 791.2 396.6 792.9 393.0L796.0 386.5L795.4 407.0C795.1 418.3 794.5 433.3 794.2 440.3C793.8 447.4 793.8 453.3 794.1 453.5C794.4 453.7 804.0 451.6 815.6 448.9C839.2 443.3 882.3 433.2 913.4 426.0L934.2 421.2L938.2 417.3C945.3 410.4 952.0 397.1 952.0 389.8L952.0 387.8L938.0 388.5L924.0 389.3L922.4 387.9C921.5 387.2 913.8 376.5 905.2 364.2C896.6 351.9 888.7 341.4 887.5 341.0C886.4 340.6 877.0 338.8 866.5 337.1C856.0 335.3 839.2 332.3 829.1 330.4C819.0 328.5 810.6 327.1 810.5 327.2C810.3 327.4 784.5 378.8 753.1 441.5C721.7 504.2 691.6 564.0 686.3 574.5L676.7 593.5L676.8 596.5C676.9 599.5 686.3 665.5 693.9 716.5C696.1 731.4 700.9 763.5 704.5 788.0C712.0 839.6 714.9 858.4 715.6 862.2L716.2 865.0L723.8 864.9C728.0 864.9 738.9 864.3 748.0 863.6C757.1 862.8 765.2 862.6 766.0 863.0C767.5 863.8 781.7 893.5 792.7 918.5L797.9 930.5L729.8 930.8C692.3 930.9 661.3 930.7 661.0 930.3C660.6 929.8 648.9 894.9 635.1 852.5C621.2 810.1 602.2 752.5 593.0 724.5C574.3 668.0 550.4 594.6 544.1 574.5L540.0 561.5L525.1 471.5C516.9 422.0 509.6 377.0 508.9 371.5L507.5 361.5L506.9 375.0C506.5 382.4 505.5 419.6 504.5 457.5C503.5 495.4 502.5 527.0 502.1 527.6L501.5 528.8L460.0 509.6C437.2 499.0 407.0 485.1 393.0 478.6C379.0 472.1 366.2 466.6 364.5 466.3L361.5 465.8L355.5 469.1C352.2 470.8 336.7 480.2 321.0 490.0C305.3 499.7 276.4 517.3 256.8 529.0C237.2 540.8 221.2 550.6 221.4 550.7C221.5 550.9 231.5 547.4 243.6 542.9C255.6 538.5 284.9 527.9 308.5 519.3C332.1 510.8 355.9 502.3 361.2 500.3L370.8 496.8L415.2 520.8C439.6 534.0 472.7 551.8 488.7 560.5L518.0 576.2L521.9 588.8C524.1 595.8 528.1 608.7 530.8 617.5C533.5 626.3 540.6 648.5 546.4 666.9C552.2 685.3 557.3 702.0 557.6 703.9L558.1 707.5L549.0 729.5C544.0 741.6 535.4 762.5 529.8 776.0C524.3 789.5 517.2 806.8 513.9 814.5L508.0 828.5L482.8 843.6C468.9 852.0 449.2 863.6 439.1 869.6C429.0 875.5 421.2 880.6 421.8 880.8C422.4 881.0 430.2 880.0 439.2 878.6C448.2 877.2 474.3 873.3 497.4 870.0C520.4 866.6 541.5 863.5 544.3 862.9C547.0 862.4 550.7 862.0 552.4 862.0L555.5 862.0L576.3 876.1C587.7 883.9 597.5 891.0 598.0 891.9C598.8 893.4 602.6 908.3 606.0 923.0C606.7 926.0 607.5 929.1 607.7 929.8L608.2 931.0L398.0 931.0L187.7 931.0L184.1 928.3C182.1 926.8 171.1 918.1 159.5 909.0C147.9 899.8 137.4 891.6 136.0 890.7L133.4 889.0L116.0 902.1C106.4 909.3 98.4 915.6 98.2 916.0C98.0 916.4 113.6 924.8 132.7 934.6C151.8 944.4 171.7 954.5 176.9 957.2L186.3 962.0L345.6 962.0L504.9 962.0L473.2 983.3L441.5 1004.6L422.8 1005.8C412.5 1006.4 368.4 1009.9 324.8 1013.5C281.2 1017.1 231.8 1021.1 215.0 1022.5C198.2 1023.9 183.6 1025.0 182.5 1024.9C181.4 1024.9 163.6 1019.9 143.0 1013.9ZM1010.9 268.7C1013.9 259.8 1016.1 252.0 1015.9 251.3C1015.5 250.0 980.7 225.9 980.2 226.5C980.0 226.7 983.4 235.1 987.8 245.2C999.7 272.4 1004.0 282.8 1004.0 283.9C1004.0 287.7 1006.2 282.9 1010.9 268.7ZM1029.4 119.2C1021.6 111.1 1012.9 101.9 1010.0 98.7L1004.7 92.9L1006.9 78.8C1008.1 71.0 1009.2 64.6 1009.3 64.5C1009.4 64.4 1013.3 63.2 1018.0 61.8C1022.7 60.4 1040.2 54.7 1057.0 49.2C1073.8 43.7 1087.7 39.3 1087.9 39.5C1088.1 39.7 1084.6 47.7 1080.2 57.2C1075.7 66.7 1068.6 82.2 1064.2 91.5C1046.8 129.0 1044.5 133.9 1044.0 133.9C1043.7 133.9 1037.1 127.3 1029.4 119.2Z";
  const GROOM = { vb: [1090, 1026], eye: [1000, 252], hat: [1000, 128, 22, 9], svg: (A = "") => `
    <g class="mb gr"><path class="f" fill-rule="evenodd" d="${ICON}"/><polygon class="tg" points="${P([[958, 398], [985, 404], [964, 416]])}"/>${A}</g>` };
  // ĐI – khung xương: chân trước / sau xoay quanh hông, đuôi vẫy, thân nhấp nhô
  const leg = (x, y, back) => back
    ? P([[x - 8, y - 6], [x + 8, y - 4], [x + 6, y + 8], [x - 1, y + 18], [x + 2, y + 30], [x + 6, y + 32], [x + 6, y + 34], [x - 3, y + 34], [x - 6, y + 20], [x - 6, y + 8]])
    : P([[x - 4, y - 2], [x + 5, y - 2], [x + 3, y + 18], [x + 4, y + 30], [x + 8, y + 32], [x + 8, y + 34], [x - 1, y + 34], [x, y + 18]]);
  const WALK = { vb: [120, 80], eye: [100.8, 21.6], hat: [97, 15.5, -3, 0.95], svg: (A = "") => `
    <g class="tl wt"><polygon class="f" points="${P([[26, 36], [16, 32], [10, 24], [9, 14], [12, 7], [17, 5.5], [16, 9], [13.5, 14.5], [14.5, 23], [20, 29.5], [27, 40]])}"/></g>
    <g class="lg l2"><polygon class="f2" points="${leg(31, 44, 1)}"/></g>
    <g class="lg l1"><polygon class="f2" points="${leg(77, 44)}"/></g>
    <g class="wb">
      <polygon class="f" points="${P([[22, 47], [23, 39], [30, 32], [52, 34], [74, 29], [84, 27], [90, 39], [85, 49], [64, 50], [46, 52], [32, 54]])}"/>
      <g class="hd"><polygon class="f" points="${P([[82, 31], [85, 21], [89, 16], [91, 6], [95, 14.5], [99, 14.5], [104, 7], [104, 18], [108, 23], [112, 27], [108, 30], [101, 33], [92, 35], [84, 36]])}"/>
        <polygon class="e" points="${P([[97.8, 21.4], [104, 20], [103, 23], [98, 23.4]])}"/></g>
      <path class="cut" d="M74 32 L79 44 M41 35 L37 47"/>${A}
    </g>
    <g class="lg l3"><polygon class="f" points="${leg(34, 44, 1)}"/></g>
    <g class="lg l4"><polygon class="f" points="${leg(80, 44)}"/></g>` };
  // NGỦ – nằm khoanh tròn, mắt nhắm
  const SLEEP = { vb: [100, 60], eye: [76, 32], hat: [71.5, 24.5, -4, 0.82], svg: (A = "") => `
    <g class="mb sl">
      <polygon class="f" points="${P([[8, 58], [6, 50], [10, 40], [20, 32], [36, 28], [52, 29], [60, 32], [62, 28], [64, 25], [65.5, 16.5], [70, 23], [74, 23], [79.5, 16], [79.5, 26], [83, 31], [86.5, 36], [83, 39], [78, 41], [77, 46], [80, 52], [86, 55], [86, 58]])}"/>
      <path class="cut" d="M30 40 L44 44 L50 58 M64 42 L71 47 L73 58 M73 32.6 L78.4 33.6"/>${A}
    </g>
    <polygon class="f tlb" points="${P([[4, 57], [70, 57], [90, 55.5], [93, 57], [72, 59.8], [4, 59.8]])}"/>` };
  const POSES = { sit: SIT, groom: GROOM, walk: WALK, sleep: SLEEP };
  // ---------------------------------------------------------------- bộ đồ (vẽ trong ô 20×20, đặt theo mắt / đỉnh đầu của từng dáng)
  const SKINS = [
    { k: "classic", vi: "Cổ điển", en: "Classic", tier: "free" },
    { k: "shades", vi: "Kính râm", en: "Shades", tier: "free" },
    { k: "fedora", vi: "Mũ phớt", en: "Fedora", tier: "pro" },
  ];
  const acc = (skin, ps) => {
    if (skin === "shades") { const [x, y] = ps.eye, s = ps.hat[3]; return `<g class="acc" transform="translate(${x} ${y}) scale(${s})"><path class="glr" d="M-6 -1.8 L-10.5 -2.8"/><polygon class="gl" points="-6.2,-1.9 4.4,-3.3 4,1.9 0.6,3 -5,2.3"/><path class="glh" d="M-3.6 1.2 L-0.6 -2.2 M-1.4 1.6 L1.2 -1.4"/></g>`; }
    if (skin === "fedora") { const [x, y, r, s] = ps.hat; return `<g class="acc" transform="translate(${x} ${y}) rotate(${r}) scale(${s})"><polygon class="ht" points="-13,1.6 13,0.4 14,2.6 -14,3.8"/><polygon class="ht" points="-8.5,1.4 -7,-7 -1,-9.2 2,-7.4 7.6,-7.8 8.5,0.8"/><polygon class="hb" points="-8.3,0.4 8.4,-0.4 8.1,-2.6 -7.9,-1.8"/></g>`; }
    return "";
  };
  const poseSvg = (k, skin) => { const ps = POSES[k]; return `<svg ${NS} class="mun-p p-${k}" data-p="${k}" viewBox="0 0 ${ps.vb[0]} ${ps.vb[1]}" aria-hidden="true">${ps.svg(acc(skin, ps))}</svg>`; };
  window.MUN_ART = { poseSvg, POSES, SKINS };

  // ================================================================ lời thoại – ngắn, lạnh, chiến lược; KHÔNG nói mua / bán / coin nào
  const L = (vi, en) => (typeof EN !== "undefined" && EN ? en : vi);
  const T = {
    gen: [["Bình tĩnh. Thị trường không chạy mất đâu.", "Relax. The market isn't going anywhere."], ["Tôi không đoán. Tôi chờ.", "I don't guess. I wait."], ["Kế hoạch trước. Lệnh sau.", "Plan first. Orders later."],
      ["Thua một lệnh là chuyện nhỏ. Phá luật mới là chuyện lớn.", "Losing a trade is small. Breaking your rules is not."], ["Ngồi yên cũng là một vị thế.", "Sitting still is a position too."], ["Kẻ vội vàng luôn trả học phí.", "The hasty always pay tuition."],
      ["Đừng nhìn nến 1 phút quá lâu. Nó nhìn lại đấy.", "Don't stare at the 1-minute chart. It stares back."], ["Tôi liếm lông. Anh xem lại luật cắt lỗ.", "I groom. You review your stop rules."], ["Người khôn không cần ồn ào.", "Smart money doesn't need noise."],
      ["Cơ hội không đi một mình. Luôn có cái sau.", "Opportunities never come alone. There's always a next one."], ["Cắt lỗ là phép lịch sự với chính mình.", "A stop-loss is good manners toward yourself."], ["Đừng trả thù thị trường. Nó không nhớ anh là ai.", "Don't take revenge on the market. It doesn't know you."],
      ["Ít lệnh, lệnh tốt. Như tôi: ít nói, nói đúng.", "Fewer trades, better trades. Like me: few words, right words."], ["Ghi nhật ký đi. Trí nhớ hay nói dối.", "Keep a journal. Memory lies."], ["Kiên nhẫn là lợi thế duy nhất không ai sao chép được.", "Patience is the one edge nobody can copy."]],
    bot: [["Bot đang làm việc. Đừng đứng sau lưng nó.", "The bot is working. Don't hover behind it."], ["Luật đã đặt thì để luật chạy.", "Rules are set. Let them run."], ["Can thiệp tay ít thôi. Bảng so sánh có ghi hết đấy.", "Easy on the manual moves. The comparison table remembers."],
      ["Sàn thử trước, tiền thật sau. Tôi cũng nếm sữa trước khi uống.", "Paper first, real money later. I taste the milk first too."]],
    night: [["Khuya rồi. Mèo còn biết đi ngủ.", "It's late. Even cats sleep."], ["Quyết định lúc 2 giờ sáng hiếm khi là quyết định hay.", "2 a.m. decisions are rarely good ones."]],
    long: [["Ngồi lâu rồi. Đứng dậy duỗi lưng đi – như tôi.", "You've been sitting long. Stretch – like me."], ["Uống nước đi. Tôi không nhắc lần hai.", "Drink some water. I won't say it twice."]],
    back: [["Về rồi à. Tôi vẫn ở đây.", "Back already. I'm still here."], ["Vắng anh, mọi thứ vẫn yên.", "All quiet while you were gone."]],
    morn: [["Chào buổi sáng. Cà phê trước, lệnh sau.", "Morning. Coffee first, orders later."]],
    poke: [["Chuyện gì?", "What is it?"], ["Tôi đang bận… liếm lông.", "I'm busy… grooming."], ["Đừng vuốt ngược lông.", "Not against the fur."], ["Prrr… thôi được rồi.", "Prrr… fine."], ["Có việc thì nói. Không thì để tôi yên.", "Speak if you need something. Otherwise, let me be."], ["Tôi là Mun. Nhớ chưa?", "I'm Mun. Remember that."]],
    wake: [["…Hửm?", "…Hm?"], ["Tôi không ngủ. Tôi đang suy nghĩ.", "I wasn't asleep. I was thinking."]],
    err: [["Có chuyện. Bình tĩnh mà xử.", "Something's off. Handle it calmly."], ["Lỗi thì sửa. Không cần hoảng.", "Errors get fixed. No panic needed."]],
    ok: [["Gọn.", "Clean."], ["Được.", "Good."], ["Ổn.", "Fine."]],
    enough: [["Đủ rồi.", "Enough."]],
    hi: [["Tôi là Mun. Tôi trông chừng kỷ luật của anh – không hơn.", "I'm Mun. I keep an eye on your discipline – nothing more."]],
    hi2: [["Cần gì thì giữ lâu vào tôi.", "Press and hold me if you need anything."]],
  };
  const recent = [];
  const pick = (k) => { const A = T[k] || T.gen, fresh = A.filter((x) => !recent.includes(x[0])), x = (fresh.length ? fresh : A)[Math.floor(Math.random() * (fresh.length || A.length))]; recent.push(x[0]); if (recent.length > 8) recent.shift(); return L(x[0], x[1]); };

  // ================================================================ hành vi
  const RM = matchMedia("(prefers-reduced-motion: reduce)");
  const S = { el: null, x: -1, face: 1, pose: "sit", tm: 0, walkTm: 0, sayTm: 0, act: Date.now(), t0: Date.now(), hidAt: 0, pokes: [], away: false, cfg: {}, said: {}, nextTalk: 0, k: 0.5 };
  const now = () => Date.now(), rnd = (a, b) => a + Math.random() * (b - a);
  const cfgOf = () => { const u = (typeof UIP !== "undefined" && UIP.mun) || {}; const pro = typeof can === "function" ? can("mascot_pro") || (typeof ME !== "undefined" && ME?.eff_plan === "pro") : false;
    let skin = u.skin || "classic"; if (SKINS.find((x) => x.k === skin)?.tier === "pro" && !pro) skin = "classic"; return { on: u.on !== false, talk: u.talk || "n", skin }; };
  const mob = () => matchMedia("(max-width:979px)").matches;
  // đường đi: điện thoại = mép trên thanh điều hướng nổi ở dưới; máy tính = mép dưới cửa sổ, phần nội dung (bên phải thanh bên)
  function track() {
    const tb = document.getElementById("tabs"), r = tb?.getBoundingClientRect(), W = innerWidth, cw = 120 * S.k;
    const fab = document.querySelector(".pnfab"), fr = fab && fab.offsetParent ? fab.getBoundingClientRect() : null;      // nút "Bảng phụ" nổi → Mun không đi xuyên qua
    if (mob() && r && r.height > 0 && r.height < 140 && r.bottom > innerHeight - 60) { let rr = r.right - 14 - cw; if (fr && fr.bottom > r.top - 40 && fr.left > innerWidth / 2) rr = Math.min(rr, fr.left - 8 - cw); return { b: Math.round(innerHeight - r.top - 2), l: r.left + 14, r: rr }; }
    let l = r && r.width < 400 && r.height > innerHeight * 0.6 ? r.right + 12 : 12; if (fr && fr.bottom > innerHeight - 80 && fr.left < innerWidth / 2) l = Math.max(l, fr.right + 12);
    return { b: 0, l, r: W - 12 - cw };
  }
  function place(x, dur) {
    const tr = track(); x = Math.max(tr.l, Math.min(tr.r, x)); S.x = x;
    S.el.style.bottom = tr.b + "px"; S.el.style.transition = dur ? `transform ${dur}ms linear` : "none"; S.el.style.transform = `translate3d(${Math.round(x)}px,0,0)`;
  }
  function pose(p) { S.pose = p; S.el.dataset.pose = p; }
  function face(d) { S.face = d; S.el.dataset.face = d > 0 ? "r" : "l"; }
  const hiddenNow = () => !!(document.hidden || document.getElementById("iosSheet") || (document.getElementById("iosMenu") && !document.getElementById("munMenu")) || document.querySelector(".cz-full, .cv-fs, #ocChart, .lb-on") || document.body.classList.contains("cmdk-on") || document.body.classList.contains("typing")
    || (mob() && document.activeElement?.matches?.("input, textarea, select, [contenteditable]")));
  function sched(fn, ms) { clearTimeout(S.tm); S.tm = setTimeout(fn, ms); }
  function walkTo(x, then) {
    const tr = track(); x = Math.max(tr.l, Math.min(tr.r, x)); const dx = x - S.x;
    if (RM.matches || Math.abs(dx) < 24) { place(x, 0); then?.(); return; }
    face(dx > 0 ? 1 : -1); pose("walk"); const v = mob() ? 30 : 40, ms = Math.round(Math.abs(dx) / v * 1000);      // đủng đỉnh: ~30–40 px/giây
    place(x, ms); clearTimeout(S.walkTm); S.walkTm = setTimeout(() => { pose("sit"); then?.(); }, ms);
  }
  function idle() {      // vòng đời: ngồi → liếm lông → đi dạo → … ; để yên lâu thì ngủ
    if (!S.el) return;
    if (S.away || S.napTill > now()) { sched(idle, 1500); return; }
    if (now() - S.act > 80e3) { if (S.pose !== "sleep") pose("sleep"); sched(idle, 4000); return; }
    talkMaybe();
    const r = Math.random(), tr = track();
    if (r < 0.34) { pose("sit"); sched(idle, rnd(5e3, 11e3)); }
    else if (r < 0.6) { pose("groom"); sched(idle, rnd(3.5e3, 6.5e3)); }
    else { let x = rnd(tr.l, tr.r); if (Math.abs(x - S.x) < 70) x = S.x + (S.x - tr.l > tr.r - S.x ? -1 : 1) * rnd(80, 180); walkTo(x, () => sched(idle, rnd(3e3, 7e3))); }
  }
  // ---------------------------------------------------------------- nói
  function say(text, ms = 5200, prio = 0) {
    if (!S.el || S.away || hiddenNow()) return false;
    const b = S.el.querySelector(".mun-say"); if (!b.hidden && prio < (b._p || 0)) return false;
    b._p = prio; b.querySelector("span").textContent = text; b.hidden = false; b.classList.remove("out");
    requestAnimationFrame(() => {      // giữ bóng thoại trong màn hình
      const cw = 120 * S.k, bw = b.offsetWidth, cx = S.x + cw / 2, left = Math.max(8, Math.min(innerWidth - bw - 8, cx - bw / 2));
      b.style.left = (left - S.x) + "px"; b.style.setProperty("--tx", Math.max(12, Math.min(bw - 12, cx - left)) + "px");
    });
    clearTimeout(S.sayTm); S.sayTm = setTimeout(() => { b.classList.add("out"); setTimeout(() => { if (b.classList.contains("out")) { b.hidden = true; b._p = 0; } }, 220); }, ms);
    return true;
  }
  function talkMaybe() {
    if (S.cfg.talk === "q" || now() < S.nextTalk || (typeof userBusy === "function" && userBusy(4000))) return;
    const h = new Date().getHours(), d = new Date().toDateString(), hs = location.hash;
    let k = "gen";
    if ((h >= 23 || h < 5) && !S.said.night) { k = "night"; S.said.night = 1; }
    else if (h >= 5 && h < 10 && lsGet("mun_morn", "") !== d) { k = "morn"; lsSet("mun_morn", d); }
    else if (now() - S.t0 > 50 * 60e3 && !S.said.long) { k = "long"; S.said.long = 1; setTimeout(() => (S.said.long = 0), 50 * 60e3); }
    else if (/^#\/bot/.test(hs) && Math.random() < 0.5) k = "bot";
    if (say(pick(k))) S.nextTalk = now() + rnd(7, 14) * 60e3;
  }
  // ---------------------------------------------------------------- chạm / giữ lâu
  function poke() {
    if (S.pose === "sleep") { S.act = now(); pose("sit"); say(pick("wake"), 3500, 2); sched(idle, 5000); return; }
    S.pokes = S.pokes.filter((t) => now() - t < 6000); S.pokes.push(now()); navigator.vibrate?.(6);
    S.el.classList.remove("hop"); void S.el.offsetWidth; S.el.classList.add("hop");
    if (S.pokes.length >= 5) { S.pokes = []; say(pick("enough"), 2600, 2); const tr = track(); walkTo(S.x - tr.l > tr.r - S.x ? tr.l : tr.r, () => { pose("groom"); sched(idle, 6000); }); return; }
    clearTimeout(S.walkTm); if (S.pose === "walk") { const m = new DOMMatrix(getComputedStyle(S.el).transform); place(m.m41, 0); }      // đang đi → dừng ngay tại chỗ
    pose(Math.random() < 0.5 ? "sit" : "groom"); say(pick("poke"), 3800, 2); sched(idle, 7000);
  }
  function menu() {
    if (typeof iosMenuClose === "function" && document.getElementById("iosMenu")) iosMenuClose();
    const R = S.el.querySelector(".mun-c").getBoundingClientRect(), vw = document.documentElement.clientWidth, W = Math.min(260, vw - 16), left = Math.max(8, Math.min(vw - W - 8, R.left + R.width / 2 - W / 2));
    const m = document.createElement("div"); m.id = "iosMenu"; m.className = "ios-menu";
    const it = (k, ic, t, sub) => `<button type="button" data-mun="${k}"><span class="ios-t">${t}${sub ? `<small>${sub}</small>` : ""}</span><span class="ios-ic">${ic}</span></button>`;
    m.innerHTML = `<div class="ios-menu-bg" data-x></div><div class="ios-menu-in" id="munMenu" role="menu" aria-label="Mun" style="left:${left}px;width:${W}px;bottom:${Math.round(innerHeight - R.top + 8)}px;transform-origin:${Math.round(R.left + R.width / 2 - left)}px calc(100% + 8px)">
      <div class="ios-menu-h">🐈‍⬛ Mun</div>
      ${it("sleep", "😴", L("Cho đi ngủ 30 phút", "Nap for 30 min"), L("không đi, không nói", "no walking, no talking"))}
      ${it("quiet", S.cfg.talk === "q" ? "💬" : "🤫", S.cfg.talk === "q" ? L("Nói chuyện bình thường", "Talk normally") : L("Ít nói thôi", "Talk less"), S.cfg.talk === "q" ? "" : L("chỉ đáp khi anh gọi", "only answers when poked"))}
      ${it("skin", "🎩", L("Đổi bộ đồ…", "Change outfit…"), L("Tài khoản › Mèo Mun", "Account › Mun"))}
      ${it("off", "🙈", L("Cất Mun đi", "Hide Mun"), L("bật lại trong Tài khoản", "turn back on in Account"))}</div>`;
    document.body.appendChild(m);
    m.querySelector("[data-x]").onclick = () => iosMenuClose();
    m.querySelectorAll("[data-mun]").forEach((b) => (b.onclick = async () => { const k = b.dataset.mun; iosMenuClose();
      if (k === "sleep") { S.napTill = now() + 30 * 60e3; pose("sleep"); clearTimeout(S.tm); S.el.querySelector(".mun-say").hidden = true; }
      else if (k === "quiet" || k === "off") { const u = { ...(UIP.mun || {}) }; if (k === "quiet") u.talk = S.cfg.talk === "q" ? "n" : "q"; else u.on = false; UIP = { ...UIP, mun: u }; await uiSave(); MUN.apply(); if (k === "off") toast(L("Đã cất Mun – bật lại trong Tài khoản › Mèo Mun", "Mun is hidden – turn back on in Account › Mun")); else say(u.talk === "q" ? L("Được. Tôi im.", "Fine. I'll be quiet.") : L("Tôi vẫn ở đây.", "Still here."), 3000, 2); }
      else if (k === "skin") location.hash = "#/account";
    }));
    const kd = (e) => { if (e.key === "Escape") { iosMenuClose(); removeEventListener("keydown", kd); } }; addEventListener("keydown", kd);
  }
  // ---------------------------------------------------------------- thông báo: Mun ngồi liếm lông cạnh thông báo (máy tính: đi tới góc phải, dưới chồng thông báo)
  function onToast(msg, o = {}) {
    if (!S.el || S.away || S.napTill > now()) return;
    const tp = o.type || (/^(⛔|❌|Lỗi|Error)/i.test(msg) ? "err" : /^(✅|Đã)/.test(msg) ? "ok" : "info");
    const react = () => { pose("groom"); sched(idle, rnd(5e3, 8e3)); if (S.cfg.talk !== "q" && (tp === "err" ? Math.random() < 0.6 : tp === "ok" ? Math.random() < 0.25 : false)) setTimeout(() => say(pick(tp), 3200, 1), 700); };
    clearTimeout(S.tm);
    if (!mob()) { const tb = document.getElementById("toasts")?.getBoundingClientRect(); walkTo(tb ? tb.left - 120 * S.k - 6 : track().r, react); } else react();
  }
  // ---------------------------------------------------------------- dựng / bật / tắt
  function build() {
    const el = document.createElement("div"); el.id = "mun"; el.className = "mun";
    el.innerHTML = `<div class="mun-say" hidden role="status"><b>Mun</b><span></span></div><div class="mun-c" role="button" tabindex="0" aria-label="${L("Mun – mèo trợ lý. Chạm để nói chuyện, giữ lâu để mở menu", "Mun – assistant cat. Tap to talk, hold for menu")}"><div class="mun-f">${Object.keys(POSES).map((k) => poseSvg(k, S.cfg.skin)).join("")}</div><i class="mun-z">z</i></div>`;
    document.body.appendChild(el); S.el = el; S.k = mob() ? 0.5 : 0.58; el.style.setProperty("--k", S.k);
    const c = el.querySelector(".mun-c"); let lp = 0, longed = false;
    c.addEventListener("pointerdown", (e) => { longed = false; clearTimeout(lp); lp = setTimeout(() => { longed = true; navigator.vibrate?.(10); menu(); }, 520); });
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => c.addEventListener(ev, () => clearTimeout(lp)));
    c.addEventListener("click", (e) => { if (longed) { longed = false; return; } poke(); });
    c.addEventListener("contextmenu", (e) => { e.preventDefault(); clearTimeout(lp); menu(); });
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); poke(); } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) { e.preventDefault(); menu(); } });
    face(1); pose("sit");
  }
  let started = false;
  function start() {
    S.cfg = cfgOf(); if (!S.cfg.on) return stop();
    if (S.el) { // đổi bộ đồ → vẽ lại dáng
      S.el.querySelector(".mun-f").innerHTML = Object.keys(POSES).map((k) => poseSvg(k, S.cfg.skin)).join(""); return;
    }
    build(); const tr = track(); const fromL = Math.random() < 0.5;
    place(fromL ? tr.l - 140 : tr.r + 140, 0); S.el.style.opacity = "0";
    requestAnimationFrame(() => { S.el.style.opacity = ""; walkTo(rnd(tr.l + (tr.r - tr.l) * 0.2, tr.l + (tr.r - tr.l) * 0.6), () => {
      if (!lsGet("mun_hi", 0)) { lsSet("mun_hi", 1); say(pick("hi"), 6500, 1); setTimeout(() => say(pick("hi2"), 4500, 1), 7000); S.nextTalk = now() + 8 * 60e3; }
      else S.nextTalk = now() + rnd(2, 5) * 60e3;
      pose("groom"); sched(idle, 5000); }); });
    if (started) return; started = true;
    ["pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach((ev) => addEventListener(ev, () => { S.act = now(); if (S.el && S.pose === "sleep" && !(S.napTill > now())) { pose("sit"); sched(idle, 2500); } }, { passive: true, capture: true }));
    document.addEventListener("visibilitychange", () => { if (document.hidden) { S.hidAt = now(); return; } if (S.el && S.hidAt && now() - S.hidAt > 15 * 60e3 && S.cfg.talk !== "q") setTimeout(() => say(pick("back"), 4000, 1), 900); });
    // ẩn khi đang mở bảng / menu / biểu đồ toàn màn hình / đang gõ (điện thoại); hiện lại khi xong
    setInterval(() => { if (!S.el) return; const h = hiddenNow(); if (h !== S.away) { S.away = h; S.el.classList.toggle("away", h); } if (S.napTill && S.napTill < now()) { S.napTill = 0; pose("sit"); sched(idle, 3000); } }, 400);
    addEventListener("resize", () => { if (!S.el) return; S.k = mob() ? 0.5 : 0.58; S.el.style.setProperty("--k", S.k); place(S.x, 0); });
    // nháy mắt ngẫu nhiên
    (function blink() { setTimeout(() => { if (S.el) { S.el.classList.add("blink"); setTimeout(() => S.el?.classList.remove("blink"), 160); } blink(); }, rnd(2500, 7000)); })();
    // thông báo: bọc hàm toast của app
    if (typeof window.toast === "function" && !window.toast.__mun) { const t0 = window.toast; window.toast = function (msg, o) { const r = t0.apply(this, arguments); try { onToast(String(msg ?? ""), o || {}); } catch (e) { /* bỏ qua */ } return r; }; window.toast.__mun = 1; }
  }
  function stop() { clearTimeout(S.tm); clearTimeout(S.walkTm); if (S.el) { const el = S.el; S.el = null; el.classList.add("away"); setTimeout(() => el.remove(), 300); } }
  window.MUN = { start, stop, apply: () => { const c = cfgOf(); if (!c.on) stop(); else if (!S.el || c.skin !== S.cfg.skin || c.talk !== S.cfg.talk) { S.cfg = c; start(); } S.cfg = c; }, say: (t, ms) => say(t, ms, 2), SKINS, poseSvg };
  // ---------------------------------------------------------------- giao diện
  const st = document.createElement("style"); st.id = "munCss";
  st.textContent = `
.mun{position:fixed;left:0;bottom:0;z-index:40;width:calc(120px*var(--k,.5));height:calc(100px*var(--k,.5));pointer-events:none;will-change:transform;transition:opacity .25s}
.mun.away{opacity:0!important;visibility:hidden;transition:opacity .2s,visibility 0s .2s}
.mun-c{position:absolute;inset:0;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;outline:none}
.mun-c:focus-visible{outline:2px solid var(--brand);outline-offset:2px;border-radius:8px}
.mun-f{position:absolute;inset:0;transform-origin:50% 100%}
.mun[data-face=l] .mun-f{transform:scaleX(-1)}
.mun.hop .mun-f{animation:munHop .32s cubic-bezier(.3,.7,.4,1)}
.mun[data-face=l].hop .mun-f{animation-name:munHopL}
@keyframes munHop{40%{transform:translateY(-6px) scaleY(1.03)}}
@keyframes munHopL{0%,100%{transform:scaleX(-1)}40%{transform:scaleX(-1) translateY(-6px) scaleY(1.03)}}
.mun-p{position:absolute;bottom:0;left:50%;transform:translateX(-50%);display:none;overflow:visible;
  --f:#0c0c0e;--f2:#26272b;--cut:var(--bg,#ECEEF1);filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.18))}
:root[data-theme=dark] .mun-p{--f:#07080a;--f2:#1b1d22;--cut:#4b515d;filter:drop-shadow(0 0 .7px rgba(255,255,255,.62)) drop-shadow(0 2px 4px rgba(0,0,0,.55))}
.mun[data-pose=sit] .p-sit,.mun[data-pose=groom] .p-groom,.mun[data-pose=walk] .p-walk,.mun[data-pose=sleep] .p-sleep{display:block}
.p-sit{height:calc(100px*var(--k))}.p-groom{height:calc(94px*var(--k))}.p-walk{height:calc(80px*var(--k))}.p-sleep{height:calc(60px*var(--k))}
.mun-p .f{fill:var(--f)}.mun-p .f2{fill:var(--f2)}.mun-p .e{fill:#E9B23C;transform-box:fill-box;transform-origin:center;transition:transform .08s}.mun-p .tg{fill:#D9667A}
.mun-p .cut{fill:none;stroke:var(--cut);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.mun.blink .e{transform:scaleY(.12)}
.mun-p .gl{fill:#2a2e36;stroke:#cfd3da;stroke-width:.55;stroke-linejoin:round}.mun-p .glh{stroke:#fff;stroke-width:.45;stroke-linecap:round;opacity:.55}.mun-p .glr{stroke:#cfd3da;stroke-width:.6}
.mun-p .ht{fill:#141417;stroke:#5a5e66;stroke-width:.35}.mun-p .hb{fill:#C9A227}
/* chuyển động – chỉ transform, chạy trên GPU */
.p-sit .mb{transform-origin:50px 97px;animation:munBr 3.4s ease-in-out infinite}
.p-sit .tl{transform-origin:24px 92px;animation:munTl 4.2s ease-in-out infinite}
.p-sleep .mb{transform-origin:50px 58px;animation:munBr2 4s ease-in-out infinite}
.p-groom .gr{transform-origin:560px 1000px;animation:munLk .62s ease-in-out infinite}
.p-groom .tg{animation:munTg .62s steps(1) infinite}
.p-walk .lg{animation:munLa .72s ease-in-out infinite}
.p-walk .l1{transform-origin:77px 43px}.p-walk .l4{transform-origin:80px 43px;animation-name:munLb}
.p-walk .l2{transform-origin:31px 40px;animation-name:munLb}.p-walk .l3{transform-origin:34px 40px}
.p-walk .wb,.p-walk .tl{animation:munBob .36s ease-in-out infinite}
.p-walk .wt{transform-origin:26px 38px;animation:munWt 1.44s ease-in-out infinite}
@keyframes munBr{50%{transform:scaleY(1.015)}}
@keyframes munBr2{50%{transform:scaleY(1.035)}}
@keyframes munTl{0%,70%,100%{transform:none}80%{transform:rotate(-5deg)}90%{transform:rotate(2deg)}}
@keyframes munLk{50%{transform:rotate(-1.4deg)}}
@keyframes munTg{0%{opacity:0}35%{opacity:1}70%{opacity:0}}
@keyframes munLa{0%,100%{transform:rotate(16deg)}50%{transform:rotate(-16deg)}}
@keyframes munLb{0%,100%{transform:rotate(-16deg)}50%{transform:rotate(16deg)}}
@keyframes munBob{50%{transform:translateY(-.9px)}}
@keyframes munWt{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(6deg)}}
.mun-z{position:absolute;left:calc(50% + 30px*var(--k));bottom:calc(52px*var(--k));font:italic 700 11px/1 system-ui;color:var(--ink-3);display:none;pointer-events:none}
.mun[data-pose=sleep] .mun-z{display:block;animation:munZ 2.6s ease-in infinite}
@keyframes munZ{0%{opacity:0;transform:translate(0,4px) scale(.7)}30%{opacity:.9}100%{opacity:0;transform:translate(8px,-14px) scale(1.15)}}
/* bóng thoại – kính mờ như menu */
.mun-say{position:absolute;bottom:calc(100% + 8px);left:0;width:max-content;max-width:min(240px,calc(100vw - 16px));padding:7px 11px 8px;border-radius:var(--mn-r,10px);
  background:var(--mn-bg,var(--surface));box-shadow:var(--mn-sh,0 6px 24px rgba(0,0,0,.18));-webkit-backdrop-filter:saturate(1.6) blur(18px);backdrop-filter:saturate(1.6) blur(18px);
  font:500 .78125rem/1.4 "Be Vietnam Pro",system-ui,sans-serif;color:var(--ink);pointer-events:auto;animation:munIn .22s cubic-bezier(.2,.8,.2,1);transform-origin:var(--tx,50%) 100%}
.mun-say b{display:block;font-size:.65625rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink-3);margin-bottom:1px}
.mun-say::after{content:"";position:absolute;top:100%;left:var(--tx,50%);margin-left:-6px;border:6px solid transparent;border-top-color:var(--mn-bg,var(--surface));filter:drop-shadow(0 1px 0 rgba(0,0,0,.05))}
.mun-say.out{opacity:0;transform:translateY(4px) scale(.96);transition:opacity .2s,transform .2s}
@keyframes munIn{from{opacity:0;transform:translateY(6px) scale(.94)}}
@media (prefers-reduced-motion:reduce){.mun-p *,.mun-z,.mun-say{animation:none!important}}
@media print{.mun{display:none}}`;
  document.head.appendChild(st);

})();
