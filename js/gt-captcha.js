/*!
 * gt-captcha.js — 极验第四代（GeeTest v4）风格「滑动拼图」验证组件
 *
 * 视觉规格复刻自官方 gcaptcha4.css v1.9.7：
 *   - 面板 340px，标题区 17.752%，图片区 66.7%（3:2），滑轨区 20%，底栏 18.935%
 *   - 轨道 #dee3eb / 圆角 10px，滑块按钮 26.83% x 16.77% / 圆角 36px / 蓝色渐变
 *   - 状态条 #5381fd → 成功 #39c522，提示条 成功 #39c522 / 失败 #ff5d39 / 警示 #ffb800
 *
 * 背景图与拼图块全部由 Canvas 现场生成，不依赖任何外部图片，可直接 file:// 打开。
 * 切块形状走可插拔的形状表（SHAPES），内置 12 种，也可用 GtCaptcha.registerShape 自己加。
 * 注意：组件是前端演示实现，校验在本地完成；生产环境必须由服务端校验。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GtCaptcha = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ======================================================================
     常量：全部对应官方原始像素
     ====================================================================== */
  var NW = 300;        // 背景原图宽（3:2）
  var NH = 200;        // 背景原图高
  /* 拼图块本体边长默认值（原图像素）。
     官方是 80（占图宽 26.7%、高 40%，视觉很压）。
     本项目默认 48（占图宽 16%）—— 正好等于滑块按钮宽度
     （--gt-btn-w 默认 16%），复刻官方「切块与按钮等宽」的设计。
     想完全还原官方：pieceSize: 80 且 shape: 'wedge'。 */
  var PIECE = 48;
  var TAB_RATIO = 13 / 80;  // 凹凸半径占块边长的比例（官方 80px 块配 13px 凹凸）
  /* 拼图块画布留白（容纳投影）。
     实测官方切块投影是 offset 2px + shadowBlur 9px（σ=4.5），
     可见尾部约 offset + 3σ ≈ 15.5px，留白必须大于它，否则远端的
     阴影会被画布边界切掉 —— 10px 时 d=12/13/14 处实测只剩 1.1/0.6/0.3，
     官方是 2.3/1.4/0.9，尾部被削平了。18px 足够。 */
  var PAD = 18;
  var TOL = 6;         // 校验容差（原图像素）
  var MIN_X = 0.32;    // 缺口最小横向位置（占原图宽）

  /* ======================================================================
     工具
     ====================================================================== */
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function canvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /* ======================================================================
     背景图生成器（5 种场景，纯 Canvas 绘制）
     ====================================================================== */
  var PALETTES = [
    ['#a1c4fd', '#c2e9fb'],
    ['#fbc2eb', '#a6c1ee'],
    ['#ffecd2', '#fcb69f'],
    ['#84fab0', '#8fd3f4'],
    ['#e0c3fc', '#8ec5fc'],
    ['#fddb92', '#d1fdff']
  ];

  /* 1. 落日群山 */
  function sceneSunset(ctx, w, h) {
    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#3b2f63');
    sky.addColorStop(0.42, '#b0527a');
    sky.addColorStop(0.72, '#f0876a');
    sky.addColorStop(1, '#f7b267');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    var sx = w * rand(0.35, 0.7);
    var sy = h * 0.46;
    var glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, h * 0.42);
    glow.addColorStop(0, 'rgba(255,240,190,.95)');
    glow.addColorStop(0.45, 'rgba(255,205,130,.45)');
    glow.addColorStop(1, 'rgba(255,180,110,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,246,214,.98)';
    ctx.beginPath();
    ctx.arc(sx, sy, h * 0.115, 0, Math.PI * 2);
    ctx.fill();

    var layers = ['#a04a63', '#77345a', '#4d2350', '#2b1740'];
    for (var i = 0; i < layers.length; i++) {
      var base = h * (0.60 + i * 0.105);
      var amp = h * (0.16 - i * 0.028);
      ctx.fillStyle = layers[i];
      ctx.beginPath();
      ctx.moveTo(-12, h + 2);
      var segs = 6 + i;
      for (var s = 0; s <= segs; s++) {
        var x = -12 + ((w + 24) * s) / segs;
        var y = base - (s % 2 ? amp : amp * 0.35) - rand(0, h * 0.035);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w + 12, h + 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* 2. 海面 */
  function sceneOcean(ctx, w, h) {
    var sky = ctx.createLinearGradient(0, 0, 0, h * 0.56);
    sky.addColorStop(0, '#4fb8e8');
    sky.addColorStop(0.65, '#a8e2f5');
    sky.addColorStop(1, '#e6f7fb');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.56);

    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath();
    ctx.arc(w * rand(0.6, 0.8), h * 0.24, 16, 0, Math.PI * 2);
    ctx.fill();

    var sea = ctx.createLinearGradient(0, h * 0.5, 0, h);
    sea.addColorStop(0, '#1f9ec9');
    sea.addColorStop(1, '#0a4f76');
    ctx.fillStyle = sea;
    ctx.fillRect(0, h * 0.5, w, h * 0.5);

    for (var i = 0; i < 9; i++) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.08 + i * 0.045).toFixed(2) + ')';
      ctx.lineWidth = 1 + (i % 3) * 0.8;
      ctx.beginPath();
      var y = h * 0.54 + i * (h * 0.05);
      for (var x = 0; x <= w; x += 5) {
        ctx.lineTo(x, y + Math.sin(x / 21 + i * 1.4) * 3.2);
      }
      ctx.stroke();
    }
  }

  /* 3. 夜空 */
  function sceneNight(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b1533');
    g.addColorStop(0.55, '#1e3363');
    g.addColorStop(1, '#43639b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (var i = 0; i < 110; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + rand(0.25, 1).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(rand(0, w), rand(0, h * 0.72), rand(0.4, 1.5), 0, Math.PI * 2);
      ctx.fill();
    }

    var mx = w * rand(0.62, 0.85);
    var my = h * 0.24;
    var halo = ctx.createRadialGradient(mx, my, 0, mx, my, 52);
    halo.addColorStop(0, 'rgba(255,250,220,.42)');
    halo.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - 60, my - 60, 120, 120);
    ctx.fillStyle = 'rgba(255,251,228,.96)';
    ctx.beginPath();
    ctx.arc(mx, my, 15, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#101c3a';
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.quadraticCurveTo(w * 0.28, h * 0.63, w * 0.6, h);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#08101f';
    ctx.beginPath();
    ctx.moveTo(w * 0.3, h + 2);
    ctx.quadraticCurveTo(w * 0.7, h * 0.7, w + 2, h * 0.94);
    ctx.lineTo(w + 2, h + 2);
    ctx.closePath();
    ctx.fill();
  }

  /* 4. 抽象渐变光斑 */
  function sceneBlob(ctx, w, h) {
    var p = pick(PALETTES);
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, p[0]);
    g.addColorStop(1, p[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 8; i++) {
      var cx = rand(0, w);
      var cy = rand(0, h);
      var r = rand(38, 92);
      var rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, 'rgba(255,255,255,' + rand(0.25, 0.55).toFixed(2) + ')');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    for (var j = 0; j < 3; j++) {
      ctx.fillStyle = 'rgba(80,60,140,' + rand(0.05, 0.12).toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(rand(0, w), rand(h * 0.5, h), rand(40, 90), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* 5. 城市剪影 */
  function sceneCity(ctx, w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#16203c');
    g.addColorStop(0.5, '#4b3f74');
    g.addColorStop(1, '#e08a6b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(255,236,196,.92)';
    ctx.beginPath();
    ctx.arc(w * rand(0.2, 0.4), h * 0.36, 13, 0, Math.PI * 2);
    ctx.fill();

    var x = -6;
    while (x < w + 6) {
      var bw = rand(15, 33);
      var bh = rand(46, 112);
      ctx.fillStyle = 'rgba(17,21,38,.94)';
      ctx.fillRect(x, h - bh, bw, bh);
      for (var wy = h - bh + 7; wy < h - 7; wy += 11) {
        for (var wx = x + 4; wx < x + bw - 5; wx += 9) {
          if (Math.random() < 0.42) {
            ctx.fillStyle = 'rgba(255,214,120,' + rand(0.35, 0.95).toFixed(2) + ')';
            ctx.fillRect(wx, wy, 3, 4);
          }
        }
      }
      x += bw + rand(3, 9);
    }
  }

  var SCENES = [sceneSunset, sceneOcean, sceneNight, sceneBlob, sceneCity];

  /* ======================================================================
     切块形状表

     每个形状是一个 { label, pad, path } 定义：
       pad(size, tab)               → { l, t, r, b }  形状相对 size×size 方框向外溢出的量
       path(ctx, x, y, size, tab)    在 (x, y) 处画一个 size×size 的闭合路径

     两条硬约束：
       1. path 必须是**确定性的** —— 缺口和拼图块各调用一次，中间不能有随机数，
          否则缺口和块对不上。（想要随机形状，随机在"选形状"这一层，不在画路径这一层。）
       2. pad 要如实申报溢出量，否则缺口会压到图片边缘、块会被画布裁掉。

     加自己的形状：GtCaptcha.registerShape('myShape', { pad, path })
     ====================================================================== */
  /* 圆角多边形：顶点数组 + 圆角半径，画一条闭合路径。
     半径会自动收敛到相邻边长的一半以内，小形状也不会画崩。
     这是写「官方那几种圆角块」最省事的工具，导出给外部复用。 */
  function roundedPolygon(ctx, pts, r) {
    var n = pts.length, i;
    if (!(r > 0)) {
      ctx.beginPath();
      for (i = 0; i < n; i++) {
        if (i) ctx.lineTo(pts[i][0], pts[i][1]);
        else ctx.moveTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();
      return;
    }
    var rs = [];
    for (i = 0; i < n; i++) {
      var pv = pts[(i - 1 + n) % n], cu = pts[i], nx = pts[(i + 1) % n];
      var l1 = Math.sqrt(Math.pow(cu[0] - pv[0], 2) + Math.pow(cu[1] - pv[1], 2));
      var l2 = Math.sqrt(Math.pow(nx[0] - cu[0], 2) + Math.pow(nx[1] - cu[1], 2));
      rs.push(Math.min(r, l1 / 2, l2 / 2));
    }
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var pv2 = pts[(i - 1 + n) % n], cu2 = pts[i], nx2 = pts[(i + 1) % n], rr = rs[i];
      var v1x = pv2[0] - cu2[0], v1y = pv2[1] - cu2[1];
      var v2x = nx2[0] - cu2[0], v2y = nx2[1] - cu2[1];
      var d1 = Math.sqrt(v1x * v1x + v1y * v1y) || 1;
      var d2 = Math.sqrt(v2x * v2x + v2y * v2y) || 1;
      var ax = cu2[0] + (v1x / d1) * rr, ay = cu2[1] + (v1y / d1) * rr; // 入点
      var bx = cu2[0] + (v2x / d2) * rr, by = cu2[1] + (v2y / d2) * rr; // 出点
      if (i) ctx.lineTo(ax, ay); else ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(cu2[0], cu2[1], bx, by);
    }
    ctx.closePath();
  }

  var SHAPES = {};

  /* 1. 经典拼图（官方样式）：左 / 上直边，右 / 下向外凸 */
  SHAPES.jigsaw = {
    label: '经典拼图',
    pad: function (size, tab) { return { l: 0, t: 0, r: tab, b: tab }; },
    path: function (ctx, x, y, size, tab) {
      var r = tab, cx = x + size / 2, cy = y + size / 2, k = r * 1.15;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + size, y);
      // 右边缘：向外凸
      ctx.lineTo(x + size, cy - r);
      ctx.bezierCurveTo(x + size + k, cy - r, x + size + k, cy + r, x + size, cy + r);
      ctx.lineTo(x + size, y + size);
      // 下边缘：向外凸（从右往左）
      ctx.lineTo(cx + r, y + size);
      ctx.bezierCurveTo(cx + r, y + size + k, cx - r, y + size + k, cx - r, y + size);
      ctx.lineTo(x, y + size);
      ctx.closePath();
    }
  };

  /* 2. 反向拼图：右 / 下向内凹 */
  SHAPES['jigsaw-in'] = {
    label: '反向拼图',
    pad: function () { return { l: 0, t: 0, r: 0, b: 0 }; },
    path: function (ctx, x, y, size, tab) {
      var r = tab, cx = x + size / 2, cy = y + size / 2, k = r * 1.15;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + size, y);
      // 右边缘：向内凹
      ctx.lineTo(x + size, cy - r);
      ctx.bezierCurveTo(x + size - k, cy - r, x + size - k, cy + r, x + size, cy + r);
      ctx.lineTo(x + size, y + size);
      // 下边缘：向内凹
      ctx.lineTo(cx + r, y + size);
      ctx.bezierCurveTo(cx + r, y + size - k, cx - r, y + size - k, cx - r, y + size);
      ctx.lineTo(x, y + size);
      ctx.closePath();
    }
  };

  /* 3. 四边凹凸：真正的拼图块 */
  SHAPES['jigsaw-all'] = {
    label: '四边凹凸',
    pad: function (size, tab) { return { l: tab, t: tab, r: tab, b: tab }; },
    path: function (ctx, x, y, size, tab) {
      var r = tab, cx = x + size / 2, cy = y + size / 2, k = r * 1.15;
      ctx.beginPath();
      ctx.moveTo(x, y);
      // 上边：向外凸
      ctx.lineTo(cx - r, y);
      ctx.bezierCurveTo(cx - r, y - k, cx + r, y - k, cx + r, y);
      ctx.lineTo(x + size, y);
      // 右边：向外凸
      ctx.lineTo(x + size, cy - r);
      ctx.bezierCurveTo(x + size + k, cy - r, x + size + k, cy + r, x + size, cy + r);
      ctx.lineTo(x + size, y + size);
      // 下边：向外凸
      ctx.lineTo(cx + r, y + size);
      ctx.bezierCurveTo(cx + r, y + size + k, cx - r, y + size + k, cx - r, y + size);
      ctx.lineTo(x, y + size);
      // 左边：向外凸
      ctx.lineTo(x, cy + r);
      ctx.bezierCurveTo(x - k, cy + r, x - k, cy - r, x, cy - r);
      ctx.closePath();
    }
  };

  /* 4. 圆形 */
  SHAPES.circle = {
    label: '圆形',
    pad: function () { return { l: 0, t: 0, r: 0, b: 0 }; },
    path: function (ctx, x, y, size) {
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
    }
  };

  /* 5. 椭圆（横向） */
  SHAPES.ellipse = {
    label: '椭圆',
    pad: function () { return { l: 0, t: 0, r: 0, b: 0 }; },
    path: function (ctx, x, y, size) {
      ctx.beginPath();
      ctx.ellipse(x + size / 2, y + size / 2, size / 2, size * 0.34, 0, 0, Math.PI * 2);
      ctx.closePath();
    }
  };

  /* 6. 三角形 */
  SHAPES.triangle = {
    label: '三角形',
    pad: function () { return { l: 0, t: 0, r: 0, b: 0 }; },
    path: function (ctx, x, y, size) {
      ctx.beginPath();
      ctx.moveTo(x + size / 2, y);
      ctx.lineTo(x + size, y + size);
      ctx.lineTo(x, y + size);
      ctx.closePath();
    }
  };

  /* 7. 菱形 */
  SHAPES.diamond = {
    label: '菱形',
    pad: function () { return { l: 0, t: 0, r: 0, b: 0 }; },
    path: function (ctx, x, y, size) {
      var h = size / 2;
      ctx.beginPath();
      ctx.moveTo(x + h, y);
      ctx.lineTo(x + size, y + h);
      ctx.lineTo(x + h, y + size);
      ctx.lineTo(x, y + h);
      ctx.closePath();
    }
  };

  /* 8. 正六边形（尖朝上） */
  SHAPES.hexagon = {
    label: '六边形',
    pad: function () { return { l: 0, t: 0, r: 0, b: 0 }; },
    path: function (ctx, x, y, size) {
      var cx = x + size / 2, cy = y + size / 2, R = size / 2;
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = -Math.PI / 2 + (i * Math.PI) / 3;
        var px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
    }
  };

  /* 9. 五角星 */
  SHAPES.star = {
    label: '五角星',
    pad: function () { return { l: 0, t: 0, r: 0, b: 0 }; },
    path: function (ctx, x, y, size) {
      var cx = x + size / 2, cy = y + size / 2, R = size / 2, r = R * 0.42;
      ctx.beginPath();
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI / 2 + (i * Math.PI) / 5;
        var rad = i % 2 ? r : R;
        var px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.closePath();
    }
  };

  /* 10. 不规则圆润形状（控制点写死，保证缺口和块画出来是同一个形状） */
  SHAPES.blob = {
    label: '不规则',
    pad: function () { return { l: 0, t: 0, r: 0, b: 0 }; },
    path: function (ctx, x, y, size) {
      var cx = x + size / 2, cy = y + size / 2, R = size / 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy - R);
      ctx.bezierCurveTo(cx + R * 0.72, cy - R * 0.94, cx + R, cy - R * 0.3, cx + R * 0.88, cy + R * 0.14);
      ctx.bezierCurveTo(cx + R * 0.76, cy + R * 0.6, cx + R * 0.28, cy + R * 0.9, cx, cy + R);
      ctx.bezierCurveTo(cx - R * 0.4, cy + R * 0.92, cx - R * 0.9, cy + R * 0.58, cx - R * 0.94, cy + R * 0.04);
      ctx.bezierCurveTo(cx - R * 0.98, cy - R * 0.44, cx - R * 0.58, cy - R * 0.96, cx, cy - R);
      ctx.closePath();
    }
  };

  /* ----------------------------------------------------------------------
     11 / 12 官方 v4 实测形状
     数据来源：gt4.geetest.com 的 demo（captchaId 54088bb07d2df3c46b79f80300b0abbe）
     用 risk_type=slide 连拉 8 道题，下载服务端下发的 slice PNG（80×80 RGBA），
     取 alpha>=200 的实心轮廓量出来的：
       圆角倒三角   59×52   → 宽:高 ≈ 1.135 : 1
       右向圆角三角 52×59   → 宽:高 ≈ 0.88  : 1
     圆角半径用「本地渲染 vs 官方切片」做轮廓 IoU 扫描定出来的：
     r = 0.18 × size 时两者归一化 IoU ≈ 0.978（0.14 时 0.96，0.22 时 0.95，所以是真的峰）。
     注意：官方切块形状是**按题下发的形状池**（8 道题里出现倒三角 / 正三角 /
     五角星 / 方形带凹口 / 右向三角 等多种），不是固定一种。
     想复刻这个行为，传数组即可：shape: ['wedge','arrow','star','triangle']，
     每题随机取一个（见 pickShape）。
     ---------------------------------------------------------------------- */

  /* 11. 官方楔形：圆角倒三角（官方 slide 最常见的那个） */
  SHAPES.wedge = {
    label: '官方楔形',
    // 形状实心只占 size 宽 × 0.88size 高，底部 12% 留白 → 还原官方 59:52 的比例
    pad: function (size) { return { l: 0, t: 0, r: 0, b: Math.round(size * 0.12) }; },
    path: function (ctx, x, y, size) {
      var h = size * 0.88;
      roundedPolygon(ctx, [
        [x + size / 2, y + h],   // 底点
        [x, y],                  // 左上
        [x + size, y]            // 右上
      ], size * 0.18);
    }
  };

  /* 12. 官方右向三角：左边竖平，右向收尖 */
  SHAPES.arrow = {
    label: '官方右三角',
    // 实心占 0.88size 宽 × size 高，右侧 12% 留白 → 还原官方 52:59
    pad: function (size) { return { l: 0, t: 0, r: Math.round(size * 0.12), b: 0 }; },
    path: function (ctx, x, y, size) {
      var w = size * 0.88;
      roundedPolygon(ctx, [
        [x + w, y + size / 2],   // 右尖
        [x, y],                  // 左上
        [x, y + size]            // 左下
      ], size * 0.18);
    }
  };

  var SHAPE_NAMES = function () { return Object.keys(SHAPES); };

  /* 自定义路径函数无法预知溢出量，保守按四边各一个 tab 留白 */
  function fullPad(size, tab) { return { l: tab, t: tab, r: tab, b: tab }; }

  /* 解析 shape 选项：形状名 / 形状名数组（每题随机取一个）/ 自定义路径函数 */
  function pickShape(spec) {
    if (typeof spec === 'function') {
      return { label: '自定义', pad: fullPad, path: spec };
    }
    if (Array.isArray(spec) && spec.length) {
      return SHAPES[pick(spec)] || SHAPES.jigsaw;
    }
    return SHAPES[spec] || SHAPES.jigsaw;
  }

  /* ======================================================================
     生成一题的「背景图（含缺口）+ 拼图块」
     ====================================================================== */
  /* pieceSize 可调：拼图块本体边长（原图像素）。
     凹凸半径按比例跟着缩放，保证形状比例与官方一致。
     shapeSpec 见 pickShape()。 */
  function buildPuzzle(pieceSize, shapeSpec) {
    var size = pieceSize || PIECE;
    var tab = Math.max(6, Math.round(size * TAB_RATIO));
    var shape = pickShape(shapeSpec);
    var pad = shape.pad(size, tab);
    var boxW = size + pad.l + pad.r;
    var boxH = size + pad.t + pad.b;

    var scene = canvas(NW, NH);
    var sctx = scene.getContext('2d');
    pick(SCENES)(sctx, NW, NH);

    // 缺口位置：保证整个形状（含溢出部分）都落在图内
    var holeX = Math.round(rand(NW * MIN_X + pad.l, NW - size - pad.r));
    var holeY = Math.round(rand(12 + pad.t, NH - size - pad.b - 12));

    /* --- 背景：原图 + 缺口暗影 --- */
    var bg = canvas(NW, NH);
    var bctx = bg.getContext('2d');
    bctx.drawImage(scene, 0, 0);
    bctx.save();
    shape.path(bctx, holeX, holeY, size, tab);
    bctx.fillStyle = 'rgba(0,0,0,.45)';
    bctx.fill();
    bctx.strokeStyle = 'rgba(255,255,255,.5)';
    bctx.lineWidth = 1;
    bctx.stroke();
    bctx.restore();

    /* --- 拼图块：同一块画面 + 投影 + 内侧高光 ---
       投影参数用「8 道官方题联合拟合」定出来的（见 .tmp/fit_shadow2.py）：
       拟合域 = 整幅画布全像素（实心处目标 255），模型 = 实心掩码平移 →
       高斯模糊 → ×A，A 用池化闭式解 Σ(m·t)/Σ(m²)。全组合扫描结果：

         gauss shadowBlur=9  offset(2,2)  A=0.723  → 全像素 RMSE 3.21  ← 最优
         gauss shadowBlur=8  offset(2,2)  A=0.739  → 3.48
         gauss shadowBlur=10 offset(2,2)  A=0.704  → 3.81
         box   radius=7      offset(2,2)  A=0.703  → 4.63（方框模糊更差）

       官方直边实测剖面 108,93,74,57,42,30,21,14,10,8,5,3,2,1
       模型预测         106,91,78,63,50,38,27,19,13,8,4,2,0,0
       偏移方向是右下（官方 sl0 右边缘 d=1 处 108，左边缘只有 33）。
       投影偏移按 size/80 等比缩放，换 pieceSize 时观感才不会跑。 */
    var k = size / 80;
    var cw = boxW + PAD * 2, ch = boxH + PAD * 2;
    var piece = canvas(cw, ch);
    var pctx = piece.getContext('2d');

    /* --- A. 投影：整幅画布不裁剪，让阴影完整铺开 --- */
    pctx.save();
    // 让 path 的 (0,0) 落在画布的 (PAD + pad.l, PAD + pad.t)
    pctx.translate(PAD + pad.l, PAD + pad.t);
    pctx.shadowColor = 'rgba(0,0,0,.72)';
    pctx.shadowBlur = 9 * k;
    pctx.shadowOffsetX = 2 * k;
    pctx.shadowOffsetY = 2 * k;
    shape.path(pctx, 0, 0, size, tab);
    pctx.fillStyle = '#fff';
    pctx.fill();
    pctx.restore();

    /* --- B. 高光掩码：形状内缩约 1px ---
       官方切片的亮线在边缘**往里 1px**（sl2 边缘行亮度 152，次行 212 才是亮线，
       再往里 145/133/121… 逐级衰减）；直接贴着边缘描边会亮在边缘行上，差 1px。
       做法：先铺满形状，再用 destination-out 沿路径描一圈把边界挖掉，
       剩下的就是内缩 lineWidth/2 = 1px 的掩码。 */
    var mask = canvas(cw, ch);
    var mctx = mask.getContext('2d');
    mctx.save();
    mctx.translate(PAD + pad.l, PAD + pad.t);
    shape.path(mctx, 0, 0, size, tab);
    mctx.fillStyle = '#fff';
    mctx.fill();
    mctx.globalCompositeOperation = 'destination-out';
    shape.path(mctx, 0, 0, size, tab);
    mctx.lineWidth = 2 * k;
    mctx.strokeStyle = '#000';
    mctx.stroke();
    mctx.restore();

    /* --- C. 块内容 = 画面 + 内侧高光 --- */
    var inner = canvas(cw, ch);
    var ictx = inner.getContext('2d');
    ictx.save();
    ictx.translate(PAD + pad.l, PAD + pad.t);
    // 画面裁进切块形状
    ictx.save();
    shape.path(ictx, 0, 0, size, tab);
    ictx.clip();
    ictx.drawImage(scene, -holeX, -holeY);
    ictx.restore();
    ictx.restore();
    // 内侧高光：画在独立层，再用内缩掩码收口（否则边缘那一圈会漏出白边）
    var hl = canvas(cw, ch);
    var hctx = hl.getContext('2d');
    hctx.save();
    hctx.translate(PAD + pad.l, PAD + pad.t);
    // 紧贴边缘的那道亮线
    shape.path(hctx, 0, 0, size, tab);
    hctx.strokeStyle = 'rgba(255,255,255,.5)';
    hctx.lineWidth = 2 * k;
    hctx.stroke();
    // 顶部那一道更亮：从顶边往下 12px 的白色渐变
    var grad = hctx.createLinearGradient(0, 0, 0, 12 * k);
    grad.addColorStop(0, 'rgba(255,255,255,.42)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    shape.path(hctx, 0, 0, size, tab);
    hctx.fillStyle = grad;
    hctx.fill();
    hctx.restore();
    hctx.globalCompositeOperation = 'destination-in';
    hctx.drawImage(mask, 0, 0);
    ictx.drawImage(hl, 0, 0);
    // 收口：形状之外（含抗锯齿半透明像素）全部抹掉
    ictx.globalCompositeOperation = 'destination-in';
    ictx.save();
    ictx.translate(PAD + pad.l, PAD + pad.t);
    shape.path(ictx, 0, 0, size, tab);
    ictx.fillStyle = '#fff';
    ictx.fill();
    ictx.restore();

    // 把块内容叠到投影之上
    pctx.drawImage(inner, 0, 0);

    return {
      bgURL: bg.toDataURL('image/png'),
      pieceURL: piece.toDataURL('image/png'),
      holeX: holeX,
      holeY: holeY,
      canvasW: cw,
      canvasH: ch,
      size: size,
      tab: tab,
      shape: shape.label,
      pad: pad
    };
  }

  /* ======================================================================
     图标
     ======================================================================
     底栏两个图标的几何是**从官方雪碧图逐像素拟合**出来的（见 .tmp/gen_icons.py：
     距离场模型 + IoU 网格搜索），不是照着印象画的：

       refresh   IoU 0.832  官方是「两条弧 + 两个实心箭头」的循环箭头
                            （1x 下字形 24×20，圆 cx=12.1 cy=12 R=9.05 线宽 2）
                            注意：不是常见的单弧 reload 图标，别画错
       feedback  IoU 0.948  方角气泡 + 左下尖尾 + 三个实心点
                            （1x 下字形 20×20，气泡 3..20.8 × 3.5..18.5，线宽 2）

     官方底栏按钮尺寸 25×25、margin-right 10px（与 .gt-icon-btn 一致），
     字形在按钮内约留 2px 边距。 */
  var ICONS = {
    arrow:
      '<svg viewBox="0 0 19 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M2 8h14M10.2 2.6 15.6 8l-5.4 5.4" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>',
    refresh:
      '<svg viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      // 两条弧（顺时针），弧端各接一个实心箭头
      '<path d="M4.97 6.43A9.05 9.05 0 0 1 20.92 9.96M19.23 17.57A9.05 9.05 0 0 1 3.25 13.88" ' +
      'stroke="currentColor" stroke-width="2"/>' +
      '<path d="M21.62 12.98 23.06 9.47 18.77 10.46ZM2.6 10.85 1.1 14.34 5.4 13.42Z" ' +
      'fill="currentColor"/></svg>',
    feedback:
      '<svg viewBox="0 0 25 25" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 3.5H20.8V18.5H10L7.2 21.5 4 18.5H3Z" stroke="currentColor" ' +
      'stroke-width="2"/>' +
      '<circle cx="7.5" cy="10.9" r="1.2" fill="currentColor"/>' +
      '<circle cx="12" cy="10.9" r="1.2" fill="currentColor"/>' +
      '<circle cx="16.5" cy="10.9" r="1.2" fill="currentColor"/></svg>',
    check:
      '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M3 8.4 6.1 11.5 13 4.6" stroke="#fff" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round"/></svg>'
  };

  /* ======================================================================
     组件
     ====================================================================== */
  var UID = 0;

  function GtCaptcha(options) {
    options = options || {};
    this.opts = options;
    this.product = options.product === 'popup' ? 'popup' : 'float';
    // 主题：'dark' 给 .gt-box 挂 .gt-dark，配色由 CSS 的那组规则负责
    this.theme = options.theme === 'dark' ? 'dark' : 'light';
    this.title = options.title || '请完成安全验证';
    this.tipText = options.tipText || '点击按钮开始验证';
    this.brand = options.brand || '俱乐部电竞';
    // 反馈按钮跳转地址（默认指向本站）。传 '' 则不跳转。
    this.feedbackURL = options.feedbackURL === undefined
      ? 'https://www.7od.cn'
      : options.feedbackURL;
    // 拼图块本体边长（原图像素）。官方 80，占图宽 26.7% 视觉偏大；
    // 默认收到 60，可按需在 init 时用 pieceSize 调整（建议 48 ~ 80）。
    this.pieceSize = clamp(options.pieceSize || PIECE, 36, 120);
    // 切块形状：形状名 / 形状名数组（每题随机）/ 自定义路径函数。见 SHAPES。
    this.shape = options.shape || 'jigsaw';
    // 验证成功后是否自动把面板收回（官方行为）。传 false 则面板留在原地展示结果。
    this.closeOnSuccess = options.closeOnSuccess !== false;
    // 验证失败后是否换一题（官方行为：失败会重新下发一道随机题）。
    // 传 false 则留在原题上重试，只做回弹复位。
    this.renewOnFail = options.renewOnFail !== false;
    this.onSuccess = options.onSuccess || function () {};
    this.onFail = options.onFail || function () {};
    this.onClose = options.onClose || function () {};

    this.state = 'idle';   // idle | dragging | checking | passed | failed
    this.puzzle = null;
    this.scale = 1;
    this.btnX = 0;
    this.pieceX = 0;       // 拼图块本体在原图坐标系中的 x
    this.maxBtn = 1;
    this.maxPieceX = 0;    // 由 _layout() 按当前 puzzle 尺寸算出
    this._retracting = false;
    this._uid = ++UID;

    this._build();
    this.reset();
  }

  /* ---------- DOM ---------- */
  GtCaptcha.prototype._build = function () {
    var host = typeof this.opts.el === 'string'
      ? document.querySelector(this.opts.el)
      : this.opts.el;
    if (!host) throw new Error('[GtCaptcha] 找不到挂载元素');

    // 触发按钮
    this.el = document.createElement('div');
    this.el.className = 'gt-captcha';
    this.el.setAttribute('role', 'button');
    this.el.setAttribute('tabindex', '0');
    this.el.setAttribute('aria-label', this.tipText);

    this.el.innerHTML =
      '<div class="gt-content">' +
        '<span class="gt-gradient-bar"></span>' +
        '<div class="gt-tip-container">' +
          '<span class="gt-tip">' + this.tipText + '</span>' +
          '<span class="gt-captcha-brand">' + this.brand + '</span>' +
        '</div>' +
      '</div>';

    // 锚点：为 popup 模式提供定位参照
    this.anchor = document.createElement('div');
    this.anchor.className = 'gt-anchor';
    this.anchor.style.cssText = 'position:relative;display:inline-block;';

    host.innerHTML = '';
    host.appendChild(this.anchor);
    this.anchor.appendChild(this.el);

    // 遮罩：独立挂到 body，避免被 .gt-box-wrap 的 transform 影响定位
    this.mask = document.createElement('div');
    this.mask.className = 'gt-mask';
    document.body.appendChild(this.mask);

    // 面板
    this.wrap = document.createElement('div');
    this.wrap.className = 'gt-box-wrap' + (this.product === 'popup' ? ' gt-popup' : '');
    /* 面板是模态：给屏幕阅读器标成 dialog + aria-modal。
       官方 .geetest_box_wrap 本身没有这些属性（官方 a11y 也不完整），
       这里按 WAI-ARIA 的 dialog 模式补上，不影响视觉。 */
    this.wrap.setAttribute('role', 'dialog');
    this.wrap.setAttribute('aria-modal', 'true');
    this.wrap.setAttribute('aria-label', this.title);
    this.wrap.innerHTML =
      // 开合层：官方 .geetest_box_layer / .geetest_box_btn。
      // 里面是个 260×50 的按钮（尺寸正好等于触发按钮），
      // showBox 让它长到 100%×100% —— 面板就是"从按钮长出来"的。
      '<div class="gt-box-layer">' +
        '<div class="gt-box-layer-btn"></div>' +
      '</div>' +
      '<div class="gt-box">' +
        '<div class="gt-header">' +
          '<div class="gt-status-bar"></div>' +
          '<div class="gt-title"><span class="gt-text-tips">' + this.title + '</span></div>' +
        '</div>' +
        '<div class="gt-container">' +
          '<div class="gt-wrap">' +
            '<div class="gt-slide">' +
              '<div class="gt-window">' +
                '<div class="gt-bg"></div>' +
                '<img class="gt-slice" alt="" draggable="false">' +
                '<div class="gt-result-tips"><span class="gt-tips-icon"></span>' +
                  '<span class="gt-tips-text"></span></div>' +
              '</div>' +
              '<div class="gt-slider">' +
                '<div class="gt-track">' +
                  '<div class="gt-btn" role="slider" tabindex="0" aria-label="拖动滑块完成拼图" ' +
                    'aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
                    '<span class="gt-arrow">' + ICONS.arrow + '</span>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="gt-footer">' +
          '<div class="gt-footer-left">' +
            '<button type="button" class="gt-icon-btn gt-refresh" title="刷新">' + ICONS.refresh + '</button>' +
            '<button type="button" class="gt-icon-btn gt-feedback" title="反馈">' + ICONS.feedback + '</button>' +
          '</div>' +
          '<div class="gt-footer-right">' +
            '<span class="gt-box-brand">' + this.brand + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    this.anchor.appendChild(this.wrap);

    // 缓存节点
    this.q = {
      layerBtn: this.wrap.querySelector('.gt-box-layer-btn'),
      box: this.wrap.querySelector('.gt-box'),
      statusBar: this.wrap.querySelector('.gt-status-bar'),
      slide: this.wrap.querySelector('.gt-slide'),
      win: this.wrap.querySelector('.gt-window'),
      bg: this.wrap.querySelector('.gt-bg'),
      slice: this.wrap.querySelector('.gt-slice'),
      tips: this.wrap.querySelector('.gt-result-tips'),
      tipsIcon: this.wrap.querySelector('.gt-tips-icon'),
      tipsText: this.wrap.querySelector('.gt-tips-text'),
      track: this.wrap.querySelector('.gt-track'),
      btn: this.wrap.querySelector('.gt-btn'),
      title: this.wrap.querySelector('.gt-title'),
      refresh: this.wrap.querySelector('.gt-refresh'),
      feedback: this.wrap.querySelector('.gt-feedback')
    };

    if (this.theme === 'dark') this.q.box.classList.add('gt-dark');

    this._bind();
  };

  /* ---------- 事件 ---------- */
  GtCaptcha.prototype._bind = function () {
    var self = this;
    var q = this.q;

    // 打开面板
    function open(e) {
      e.preventDefault();
      self.show();
    }
    this.el.addEventListener('click', open);
    this.el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') open(e);
    });

    // 拖动（Pointer Events 同时覆盖鼠标 / 触摸 / 触控笔）
    q.btn.addEventListener('pointerdown', function (e) { self._onDown(e); });
    q.btn.addEventListener('pointermove', function (e) { self._onMove(e); });
    q.btn.addEventListener('pointerup', function (e) { self._onUp(e); });
    q.btn.addEventListener('pointercancel', function (e) { self._onUp(e); });

    // 键盘无障碍：左右微调，回车校验
    q.btn.addEventListener('keydown', function (e) {
      if (self.state === 'passed') return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        var step = e.shiftKey ? 10 : 2;
        self._setBtn(self.btnX + (e.key === 'ArrowRight' ? step : -step));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        self._verify();
      }
    });

    // 刷新
    q.refresh.addEventListener('click', function () {
      self.refresh();
    });

    // 反馈：跳转到 feedbackURL（默认 https://www.7od.cn），新标签页打开
    q.feedback.addEventListener('click', function () {
      if (self.feedbackURL) window.open(self.feedbackURL, '_blank');
    });

    // 遮罩点击 / ESC 关闭（浮动式）
    this.mask.addEventListener('click', function () { self.close(); });
    this._esc = function (e) {
      if (e.key === 'Escape') self.close();
    };
    document.addEventListener('keydown', this._esc);

    // 尺寸变化时重算缩放
    this._resize = function () { self._layout(); };
    window.addEventListener('resize', this._resize);
  };

  /* ---------- 官方开合动画 ----------
     对应 .geetest_box_btn 上的 geetest_showBox / geetest_hideBox。
     官方不是"缩放淡入"，而是让一个 260×50 的按钮（尺寸正好等于触发按钮）
     长到 100%×100%，同时 :before 的 6px 横线铺开、:after 的 6px 竖线收掉；
     hideBox 就是 showBox 反向。所以收起 = 面板缩回触发按钮。

     面板本体（.gt-box）在动画期间是隐藏的 —— 否则它会盖住开合层，
     动画就白做了。动画结束后加 .gt-box-ready 才把真面板放出来。 */
  var BOX_ANIM_MS = 400;            // 官方 .4s

  GtCaptcha.prototype._boxAnim = function (dir, done) {
    var btn = this.q.layerBtn;
    var settled = false, timer = null;

    btn.classList.remove('gt-showBox', 'gt-hideBox');
    void btn.offsetWidth;           // 强制回流，让同名动画能重新开始
    btn.classList.add(dir === 'show' ? 'gt-showBox' : 'gt-hideBox');

    function finish() {
      if (settled) return;
      settled = true;
      btn.removeEventListener('animationend', onEnd);
      clearTimeout(timer);
      if (done) done();
    }
    function onEnd(e) {
      // :before / :after 的 animationend 也会冒泡上来，只认按钮本身那个
      if (e.target === btn && e.animationName === 'gt-showBox') finish();
    }
    btn.addEventListener('animationend', onEnd);
    // 兜底：prefers-reduced-motion、截图注入 animation:none 时 animationend 不触发。
    // 正常情况下 animationend 会在 400ms 触发，所以余量给到最小，别拖慢收合。
    timer = setTimeout(finish, BOX_ANIM_MS + 40);
  };

  /* ---------- 打开 / 关闭 ---------- */
  GtCaptcha.prototype.show = function () {
    var self = this;
    if (this.wrap.classList.contains('gt-open')) return;

    this.wrap.classList.remove('gt-lock-success', 'gt-box-ready');
    this.el.classList.remove('gt-lock-success');
    this.wrap.classList.add('gt-open');
    this.mask.classList.remove('gt-close');
    if (this.product === 'float') this.mask.classList.add('gt-open');

    // 记住打开前的焦点，关闭时还回去（键盘/读屏用户不会"丢焦点"）
    if (this._prevFocus === undefined) this._prevFocus = document.activeElement;
    if (this.state === 'passed') {   // 已通过：直接展开，不重播开合
      this.wrap.classList.add('gt-box-ready');
      this._layout();
      this._focusPanel();
      return;
    }
    /* 开面板只播开合动画，**不换题**。
       官方只有"换题"才走 mvToLeft → mvToCenter；
       首次显示（或重新打开）直接展示当前这道题 —— 题目在构造期的 reset()
       里已经生成好了。之前这里误调了 refresh()，导致第一次打开也会
       "滑出→换题→滑入"跑一遍，属于实现错误。 */
    this._boxAnim('show', function () {
      self.wrap.classList.add('gt-box-ready');
      self._layout();
      self._focusPanel();
    });
  };

  /* 打开后把焦点交给滑块按钮：键盘用户直接就能左右微调 + 回车校验，不用先 Tab。
     :focus-visible 保证鼠标点击时不会多出一个焦点框。 */
  GtCaptcha.prototype._focusPanel = function () {
    try { this.q.btn.focus({ preventScroll: true }); } catch (e) { /* noop */ }
  };

  /* ---------- 关闭：先播官方收回动画，动画结束再真正隐藏 ---------- */
  GtCaptcha.prototype.close = function () {
    var self = this;
    if (!this.wrap.classList.contains('gt-open') || this._retracting) return;
    this._retract(function () {
      if (self._prevFocus && self._prevFocus.focus) {
        try { self._prevFocus.focus(); } catch (e) { /* noop */ }
      }
      self._prevFocus = undefined;
      self.onClose();
    });
  };

  /* 收回：面板先撤掉（露出开合层），再让开合层按 hideBox 缩回触发按钮。
     成功态下 .gt-lock-success 会把两条描边染成官方绿 #39c522。 */
  GtCaptcha.prototype._retract = function (done) {
    var self = this;
    var wrap = this.wrap;
    if (!wrap.classList.contains('gt-open') || this._retracting) return;
    this._retracting = true;

    // 撤掉真面板 + 露出开合层，同步完成，中间不会闪一帧
    wrap.classList.remove('gt-box-ready');
    this.mask.classList.add('gt-close');

    this._boxAnim('hide', function () {
      self._retracting = false;
      wrap.classList.remove('gt-open', 'gt-lock-success', 'gt-box-ready');
      wrap.querySelector('.gt-box-layer-btn').classList.remove('gt-showBox', 'gt-hideBox');
      self.mask.classList.remove('gt-open', 'gt-close');
      if (done) done();
    });
  };

  /* ---------- 换一题 ---------- */
  GtCaptcha.prototype.reset = function () {
    this.state = 'idle';
    this.btnX = 0;
    this.pieceX = 0;
    this.puzzle = buildPuzzle(this.pieceSize, this.shape);
    this.q.bg.style.backgroundImage = 'url(' + this.puzzle.bgURL + ')';
    this.q.slice.src = this.puzzle.pieceURL;
    this.q.slide.classList.remove('gt-done');
    this.q.box.classList.remove('gt-loading');
    this.el.classList.remove('gt-loading');
    this.q.statusBar.style.backgroundColor = '';
    this._tips('', null, false);
    this.q.btn.style.transition = 'none';
    this.q.slice.style.transition = 'none';
    this._layout();
  };

  GtCaptcha.prototype.refresh = function () {
    var self = this;
    if (this.state === 'checking') return;
    this.state = 'checking';           // 生成期间禁止拖动
    this.q.box.classList.add('gt-loading');       // 状态条彩虹滚动（官方 statusmove）
    this.el.classList.add('gt-loading');          // 触发按钮扫光（官方 mask_layer）
    this.q.refresh.classList.add('gt-spin');
    // 换题走官方的 mvToLeft / mvToCenter：旧题向左滑出 → 换内容 → 新题从右滑入
    this._mv('left', function () {
      self.reset();
      self.q.refresh.classList.remove('gt-spin');
      self._mv('center', null);
    });
  };

  /* 换题切换动画 —— 官方 .geetest_mvToLeft / .geetest_subitem：
       旧题 mvToLeft  .6s cubic-bezier(.65,0,.35,1) forwards
       新题 mvToCenter .6s cubic-bezier(.65,0,.35,1) .1s forwards
     挂载对象是本地 .gt-slide（对应官方 .geetest_subitem，即"一整个子题"）。 */
  var MV_MS = 600, MV_DELAY = 100;

  GtCaptcha.prototype._mv = function (dir, done) {
    var el = this.q.slide;
    var cls = dir === 'left' ? 'gt-mv-left' : 'gt-mv-center';
    var name = dir === 'left' ? 'gt-mvToLeft' : 'gt-mvToCenter';
    var wait = MV_MS + (dir === 'center' ? MV_DELAY : 0) + 40;
    var settled = false, timer = null;

    el.classList.remove('gt-mv-left', 'gt-mv-center');
    void el.offsetWidth;               // 强制回流，让同名动画能重新开始
    el.classList.add(cls);

    function finish() {
      if (settled) return;
      settled = true;
      el.removeEventListener('animationend', onEnd);
      clearTimeout(timer);
      // 收尾必须摘类：.gt-mv-center 的基础样式带 opacity:0（对齐官方
      // .geetest_subitem），留着它一旦动画被打断/被 animation:none 覆盖，
      // 整块内容就会消失。摘类后 forwards 的终态由元素基础样式接管，视觉不变。
      el.classList.remove(cls);
      if (done) done();
    }
    function onEnd(e) {
      if (e.target === el && e.animationName === name) finish();
    }
    el.addEventListener('animationend', onEnd);
    timer = setTimeout(finish, wait);   // 兜底
  };

  /* 换形状：形状名 / 形状名数组 / 自定义路径函数，改完立刻换一题 */
  GtCaptcha.prototype.setShape = function (shape) {
    this.shape = shape;
    this.refresh();
  };

  /* ---------- 布局：把原图坐标换算成实际像素 ---------- */
  GtCaptcha.prototype._layout = function () {
    if (!this.puzzle) return;
    var winW = this.q.win.clientWidth;
    if (!winW) return;                     // 面板还没显示
    this.scale = winW / NW;
    this.q.slice.style.width = this.puzzle.canvasW * this.scale + 'px';
    this.q.slice.style.height = this.puzzle.canvasH * this.scale + 'px';
    // 切块本体最远能推到「右边界贴齐原图右缘」的位置。
    // 注意要减 pad.r —— 像「四边凹凸」这种向右溢出的形状，溢出部分也得留在图内。
    this.maxPieceX = NW - this.puzzle.size - this.puzzle.pad.r;
    this.maxBtn = Math.max(1, this.q.track.clientWidth - this.q.btn.clientWidth);
    this._render();
  };

  /* 位移一律用 transform，不用 left/top。
     left/top 每改一次都会触发布局重排 + 重绘，拖动时逐帧重排在中低端手机上会掉帧；
     transform 走合成器，不碰布局。CSS 里 .gt-btn 是 top:50%;left:0（配 translateY(-50%)），
     .gt-slice 是 top:0;left:0，所以这里只需要给出 translate3d 的偏移量。 */
  GtCaptcha.prototype._render = function () {
    if (!this.puzzle) return;
    var s = this.scale, p = this.puzzle;
    this.q.btn.style.transform = 'translate3d(' + this.btnX + 'px, -50%, 0)';
    // 切块画布左上角 = 形状方框原点 - 留白 - 形状向左/上的溢出量
    var lx = (this.pieceX - PAD - p.pad.l) * s;
    var ly = (p.holeY - PAD - p.pad.t) * s;
    this.q.slice.style.transform = 'translate3d(' + lx + 'px, ' + ly + 'px, 0)';
    // role="slider" 必须有 valuenow，否则屏幕阅读器读不出拖到哪了。
    // 只在整数百分比变化时写属性，别每帧都写。
    var pct = this.maxBtn ? Math.round(this.btnX / this.maxBtn * 100) : 0;
    if (this._ariaPct !== pct) {
      this._ariaPct = pct;
      this.q.btn.setAttribute('aria-valuenow', pct);
    }
  };

  /* 是否该关掉动效。CSS 的 .gt-no-animate / prefers-reduced-motion 只能管 animation，
     管不到 JS 写在行内的 transition —— 这里补上，否则开了「减弱动态效果」的用户
     仍会看到失败回弹在滑动。 */
  GtCaptcha.prototype._noMotion = function () {
    try {
      if (window.matchMedia &&
          window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    } catch (e) { /* noop */ }
    var n = this.wrap;
    while (n && n.nodeType === 1) {
      if (n.classList && n.classList.contains('gt-no-animate')) return true;
      n = n.parentNode;
    }
    return false;
  };

  /* 设置按钮位置。keepPiece=true 时只动按钮、拼图块留在原地
     （内部已不再使用 —— 成功态按官方行为不移动按钮；保留此参数供外部复用）。 */
  GtCaptcha.prototype._setBtn = function (x, keepPiece) {
    this.btnX = clamp(x, 0, this.maxBtn);
    if (!keepPiece) this.pieceX = (this.btnX / this.maxBtn) * this.maxPieceX;
    this._render();
  };

  /* ---------- 拖动 ---------- */
  GtCaptcha.prototype._onDown = function (e) {
    if (this.state === 'passed' || this.state === 'checking') return;
    e.preventDefault();
    this.state = 'dragging';
    this._startX = e.clientX;
    this._startBtn = this.btnX;
    this._moved = false;
    this.q.btn.classList.add('gt-dragging');
    this.q.btn.style.transition = 'none';
    this.q.slice.style.transition = 'none';
    try { this.q.btn.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
  };

  GtCaptcha.prototype._onMove = function (e) {
    if (this.state !== 'dragging') return;
    e.preventDefault();
    var dx = e.clientX - this._startX;
    if (Math.abs(dx) > 1) this._moved = true;
    this._setBtn(this._startBtn + dx);
  };

  GtCaptcha.prototype._onUp = function (e) {
    if (this.state !== 'dragging') return;
    try { this.q.btn.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
    this.q.btn.classList.remove('gt-dragging');
    if (!this._moved) {
      this.state = 'idle';
      return;
    }
    this._verify();
  };

  /* ---------- 校验（演示实现：本地比对缺口位置） ---------- */
  GtCaptcha.prototype._verify = function () {
    var self = this;
    if (this.state === 'checking' || this.state === 'passed') return;
    this.state = 'checking';

    var diff = Math.abs(this.pieceX - this.puzzle.holeX);
    var pass = diff <= TOL;

    setTimeout(function () {
      if (pass) {
        self._pass();
      } else {
        self._fail();
      }
    }, 260);
  };

  GtCaptcha.prototype._pass = function () {
    var self = this;
    this.state = 'passed';
    // 官方 .geetest_lock_success 在成功时只做「换色」，一共 5 处：
    //   ① .geetest_header .geetest_status_bar   → background:#39c522（顶部状态条）
    //   ② .geetest_result_tips                  → background-color:#39c522（结果条）
    //   ③ .geetest_box_layer .geetest_box_btn:before/:after → background:#39c522（开合层描边）
    //   ④ .geetest_btn_svg .geetest_svg_default → stroke:#39c522（触发按钮的图标）
    //   ⑤ .geetest_holder .geetest_content .geetest_gradient_bar → background:#39c522（触发按钮渐变条）
    // ①②③ 已对齐；④⑤ 属于触发按钮（.gt-captcha）那一侧，本项目触发按钮是自绘的，暂未跟进。
    this.wrap.classList.add('gt-lock-success');
    // 官方成功时触发按钮本身也带 .geetest_lock_success，会把左侧渐变条染绿
    this.el.classList.add('gt-lock-success');
    this.q.statusBar.style.backgroundColor = '#39c522';
    this.q.slide.classList.add('gt-done');
    this._tips('验证通过', 'ok', true, ICONS.check);
    this.onSuccess({ lot_number: this._lot() });

    /* 注意：**不要**把滑块按钮滑回起点。
       官方 CSS 里没有任何规则在成功时改动 `.geetest_slide .geetest_btn` 的
       left/transform —— 那些 success 动画都属于绑定手机号（.geetest_bind_box）
       和其他验证类型（.geetest_match / .geetest_winlinze）。
       滑块按钮在成功后就停在用户拖到的位置，只有颜色/描边类的东西在变。
       之前这里自己加了个「300ms 后 _setBtn(0)」，会造出一个矛盾状态：
       按钮弹回起点、拼图块却留在缺口里 —— 已按官方行为移除。 */

    // 停一下让用户看清"验证通过"，然后整个面板收回（官方 .geetest_hideBox）
    if (this.closeOnSuccess) {
      setTimeout(function () { self.close(); }, 1000);
    }
  };

  GtCaptcha.prototype._fail = function () {
    var self = this;
    this.state = 'failed';
    this._tips('验证失败，请重新拖动', 'err', true);
    // 官方 .geetest_captcha.geetest_fail .geetest_header .geetest_status_bar { background:#ff5d39 }
    this.q.statusBar.style.backgroundColor = '#ff5d39';

    setTimeout(function () {
      if (!self.renewOnFail) {
        // 留在原题上重试：只做回弹复位。
        // 位移已经改成 transform（见 _render），过渡属性也要跟着改；
        // 开了「减弱动态效果」或祖先带 .gt-no-animate 时直接不做过渡。
        var t = self._noMotion()
          ? 'none'
          : 'transform .32s cubic-bezier(.65,0,.35,1)';
        self.q.btn.style.transition = t;
        self.q.slice.style.transition = t;
        self.state = 'idle';
        self._setBtn(0);
        setTimeout(function () {
          self._tips('', null, false);
          self.q.statusBar.style.backgroundColor = '';
          self.q.btn.style.transition = 'none';
          self.q.slice.style.transition = 'none';
        }, 340);
        self.onFail();
        return;
      }
      // 官方行为：失败后重新下发一道随机题，切换用 mvToLeft / mvToCenter
      self.state = 'checking';
      self.q.box.classList.add('gt-loading');
      self.el.classList.add('gt-loading');
      self._mv('left', function () {
        self.reset();                  // 换一题：新随机缺口位置
        self.onFail();
        self._mv('center', null);
      });
    }, 900);
  };

  /* ---------- 结果提示条 ---------- */
  GtCaptcha.prototype._tips = function (text, kind, show, icon) {
    var t = this.q.tips;
    t.classList.remove('gt-ok', 'gt-err', 'gt-warn');
    if (kind) t.classList.add('gt-' + kind);
    this.q.tipsText.textContent = text || '';
    this.q.tipsIcon.innerHTML = icon || '';
    t.classList.toggle('gt-show', !!show);
    if (kind === 'err') {
      this.q.slide.classList.add('gt-shake');
      var slide = this.q.slide;
      // 官方 geetest_shake 是 .2s × 2 次 = 400ms，留点余量再摘类
      setTimeout(function () { slide.classList.remove('gt-shake'); }, 440);
    }
  };

  GtCaptcha.prototype._lot = function () {
    return 'xxxxxxxx'.replace(/x/g, function () {
      return ((Math.random() * 16) | 0).toString(16);
    });
  };

  GtCaptcha.prototype.destroy = function () {
    document.removeEventListener('keydown', this._esc);
    window.removeEventListener('resize', this._resize);
    if (this.mask.parentNode) this.mask.parentNode.removeChild(this.mask);
    this.anchor.innerHTML = '';
  };

  /* ======================================================================
     对外接口
     ====================================================================== */
  function init(options) {
    return new GtCaptcha(options);
  }

  return {
    init: init,
    GtCaptcha: GtCaptcha,
    // 切块形状表（可直接读写，也可以用 registerShape 注册新的）
    shapes: SHAPES,
    shapeNames: SHAPE_NAMES,
    // 圆角多边形工具：registerShape 时画圆角块用得上
    // 用法：path: function (ctx,x,y,s) { GtCaptcha.roundedPolygon(ctx, [[...],[...]], s*0.08); }
    roundedPolygon: roundedPolygon,
    registerShape: function (name, def) {
      if (!def || typeof def.path !== 'function') {
        throw new Error('[GtCaptcha] 形状定义必须包含 path 函数');
      }
      if (typeof def.pad !== 'function') def.pad = fullPad;
      if (!def.label) def.label = name;
      SHAPES[name] = def;
      return SHAPES[name];
    },
    version: '1.0.0'
  };
});
