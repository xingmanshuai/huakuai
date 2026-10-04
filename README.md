# 滑动拼图验证组件（极验 v4 风格）

纯原生 JavaScript + Canvas 实现的「极验第四代（GeeTest v4）风格」滑动拼图验证组件。
零依赖、零外部图片，克隆后直接用浏览器打开 `index.html` 即可运行。

> ⚠️ **重要**：本项目仅用于前端技术学习与演示。组件在浏览器本地完成校验，**生产环境必须**把 `lot_number` 等参数交由服务端二次校验，前端只负责采集行为轨迹 —— 否则任何滑块验证都可以被一行 JS 绕过。

## 特性

- **零依赖、零外部图片** —— 背景图与拼图块全部由 Canvas 现场生成，不需要任何图片资源，`file://` 直接可开。
- **视觉规格对标官方** —— 面板 340px、图片区 3:2、滑轨 / 滑块按钮 / 状态条等尺寸，逐项对齐官方 `gcaptcha4.css` v1.9.7（数值全部使用官方原始百分比，可等比缩放）。
- **可插拔切块形状** —— 内置 12 种形状；传入数组即「每题随机取一个」，复刻官方按题下发的形状池；也可用 `registerShape` 注册自定义形状。
- **动画还原** —— 面板开合（`showBox` / `hideBox`）、换题横滑（`mvToLeft` / `mvToCenter`）、失败抖动等，均沿用官方缓动与关键帧。
- **深色主题与无障碍** —— `theme: 'dark'`、`prefers-reduced-motion` 自动降级、`role="dialog"` / `aria-valuenow`、键盘焦点进出管理。
- **尺寸可调** —— `pieceSize` 与 CSS 变量 `--gt-btn-w` / `--gt-btn-h` 可调；默认 48px（官方 80px）。

## 快速开始

### 本地体验

直接用浏览器打开仓库根目录的 `index.html`：

```
index.html          # 在线体验 + 规格对照 + 接入示例
```

无需构建，也无需启动本地服务器。

### 引入到自己的页面

```html
<link rel="stylesheet" href="css/gt-captcha.css">
<script src="js/gt-captcha.js"></script>

<div id="captcha"></div>

<script>
  var captcha = GtCaptcha.init({
    el: '#captcha',            // 触发按钮挂载点（选择器或元素）
    title: '请完成安全验证',
    brand: '你的品牌',
    onSuccess: function (res) {
      // res.lot_number 需连同业务参数一起发给后端二次校验
    },
    onFail: function () { /* 验证失败 */ }
  });
</script>
```

## 配置项

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `el` | `string \| Element` | — | 触发按钮的挂载点。 |
| `product` | `'float' \| 'popup'` | `'float'` | `float` 居中弹窗 + 遮罩；`popup` 跟随触发按钮弹出。 |
| `theme` | `'light' \| 'dark'` | `'light'` | `dark` 给面板挂 `.gt-dark`，配深色主题。 |
| `title` | `string` | `'请完成安全验证'` | 面板标题。 |
| `tipText` | `string` | `'点击按钮开始验证'` | 触发按钮上的提示文案。 |
| `brand` | `string` | `'俱乐部电竞'` | 品牌字，替代原 GEETEST 字标。 |
| `feedbackURL` | `string` | `'https://www.7od.cn'` | 反馈按钮跳转地址；传 `''` 则不跳转。 |
| `pieceSize` | `number` | `48` | 拼图块本体边长（原图像素），范围 36 ~ 120，建议 48 ~ 80。 |
| `shape` | `string \| string[] \| Function` | `'jigsaw'` | 切块形状：单个形状名 / 形状名数组（每题随机）/ 自定义路径函数。 |
| `closeOnSuccess` | `boolean` | `true` | 验证成功后自动收回面板；`false` 则留在原地展示结果。 |
| `renewOnFail` | `boolean` | `true` | 失败后换一题（官方行为）；`false` 则留在原题重试。 |
| `onSuccess` | `(res) => void` | — | 验证通过回调，`res.lot_number` 需交服务端校验。 |
| `onFail` | `() => void` | — | 验证失败回调。 |
| `onClose` | `() => void` | — | 面板关闭回调（收回动画结束后触发）。 |

## 实例方法

| 方法 | 说明 |
| --- | --- |
| `captcha.show()` | 打开面板（带动画）。 |
| `captcha.close()` | 关闭面板（带收回动画，动画结束才触发 `onClose`）。 |
| `captcha.refresh()` | 换一题（旧题滑出、新题滑入）。 |
| `captcha.reset()` | 重置当前题目的拖动状态。 |
| `captcha.setShape(shape)` | 切换切块形状并换一题。 |
| `captcha.destroy()` | 销毁实例，移除 DOM 与事件监听。 |

## 切块形状

内置 12 种形状（`GtCaptcha.shapeNames()` 可取全部名称）：

| 名称 | 名称 | 名称 |
| --- | --- | --- |
| `jigsaw` 经典拼图 | `jigsaw-in` 反向拼图 | `jigsaw-all` 四边凹凸 |
| `circle` 圆形 | `ellipse` 椭圆 | `triangle` 三角形 |
| `diamond` 菱形 | `hexagon` 六边形 | `star` 五角星 |
| `blob` 不规则 | `wedge` 官方楔形 | `arrow` 官方右三角 |

```js
// 单个形状
GtCaptcha.init({ shape: 'wedge' });

// 数组 = 每题随机取一个（复刻官方「按题下发形状池」）
GtCaptcha.init({ shape: ['wedge', 'arrow', 'star', 'triangle', 'jigsaw'] });
```

### 注册自定义形状

形状表就是一个 `{ label, pad, path }`：

```js
GtCaptcha.registerShape('heart', {
  label: '爱心',
  // 形状相对 size×size 方框向外溢出的量。溢出多少就报多少，
  // 报少了缺口会压到图片边缘、切块会被画布裁掉。
  pad: function (size, tab) { return { l: 0, t: 0, r: 0, b: 0 }; },
  // 在 (x, y) 处画一个 size×size 的闭合路径
  path: function (ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x + size / 2, y + size * 0.82);
    ctx.bezierCurveTo(x - size * 0.2, y + size * 0.5, x + size * 0.12, y - size * 0.16, x + size / 2, y + size * 0.24);
    ctx.bezierCurveTo(x + size * 0.88, y - size * 0.16, x + size * 1.2, y + size * 0.5, x + size / 2, y + size * 0.82);
    ctx.closePath();
  }
});

GtCaptcha.init({ shape: 'heart' });
```

**两条硬约束：**

1. `path` 必须是**确定性**的 —— 缺口和切块各调用一次，中间不能有随机数，否则两者画出来不是同一个形状、缺口会露边。想要随机形状，随机在「选形状」那一层（传数组），别在画路径那一层。
2. `pad` 要**如实申报**溢出量。

画圆角块不用手算贝塞尔，组件导出了工具函数：

```js
// 顶点数组 + 圆角半径 → 一条带圆角的闭合路径（半径会自动收敛到相邻边长一半以内）
GtCaptcha.roundedPolygon(ctx, [[x + size / 2, y + size * 0.88], [x, y], [x + size, y]], size * 0.18);
```

## 尺寸调整

滑块按钮与拼图块都可通过 CSS 变量 / 配置项调整：

```css
:root {
  --gt-btn-w: 16%;    /* 滑块按钮宽（相对图片宽度） */
  --gt-btn-h: 10%;    /* 滑块按钮高 */
  --gt-track-h: 6%;   /* 轨道高 */
}
```

```js
GtCaptcha.init({ pieceSize: 48 });   // 拼图块本体边长（原图像素）
```

想完全还原官方：`--gt-btn-w: 26.83%; --gt-btn-h: 16.77%`，并传 `pieceSize: 80`、`shape: 'wedge'`。

## 目录结构

```
huakuai/
├── index.html           # 演示页：在线体验 + 规格对照 + 接入示例
├── css/
│   └── gt-captcha.css   # 组件样式
├── js/
│   └── gt-captcha.js    # 组件逻辑（含 Canvas 背景图 / 拼图块生成）
└── README.md
```

## 兼容性

- 现代浏览器（Chrome / Edge / Firefox / Safari）及移动端 WebView。
- 依赖 Canvas 2D、Pointer Events、CSS 自定义属性与 `@keyframes`。
- 不依赖任何构建工具或框架，可直接以 `<script>` 引入。

## 免责声明

- 本项目为前端技术学习 / 演示项目，与极验（GeeTest）官方**无任何关联**，未使用其任何图片素材；视觉规格为参考其公开 CSS 实现。
- 组件校验在浏览器本地完成，**生产环境必须由服务端校验 `lot_number`**，否则可被轻易绕过。
- 相关商标归各自权利人所有，请勿将本项目用于任何违法用途。
