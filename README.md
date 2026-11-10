# 英语方块岛 · English Island

[![CI](https://github.com/peterzhang0528/english-island/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/peterzhang0528/english-island/actions/workflows/ci.yml)

在一个小小的方块世界里，通过行动学英语：砍树、收集材料、做蛋糕，再和新朋友说一声 “Thank you!”。

欢迎叶老师、杨老师和同学们一起建设这座小岛。你可以提出新故事、纠正一句英文、体验手机操作，或者亲手制作下一关。一个清楚的反馈，也是一次有价值的贡献。

**[在线试玩](https://english-island-zhang-1109.lulabs.chatgpt.site) · [第一关](https://english-island-zhang-1109.lulabs.chatgpt.site/?level=1) · [第二关](https://english-island-zhang-1109.lulabs.chatgpt.site/?level=2)**

[参与贡献](CONTRIBUTING.md) · [开发新关卡](docs/ADDING_LEVELS.md) · [配音维护](docs/AUDIO.md) · [更新记录](CHANGELOG.md) · [素材与许可说明](THIRD_PARTY_NOTICES.md)

[查看 Issues](https://github.com/peterzhang0528/english-island/issues) · [反馈问题或提出新关卡](https://github.com/peterzhang0528/english-island/issues/new/choose) · [查看 Pull Requests](https://github.com/peterzhang0528/english-island/pulls)

## 先来玩一关

| 关卡 | 小小的任务 | 会遇到的英语 |
| --- | --- | --- |
| 01 · 第一把斧头 | 推门、收集木材与石头、合成石斧、砍树 | TREE、LOG、PLANK、STICK、STONE、AXE |
| 02 · 给僵尸做蛋糕 | 鸡蛋、牛奶、三束麦子，做蛋糕送给友善的新朋友 | CHICKEN、EGG、COW、MILK、WHEAT、CAKE、FRIEND |

听 JJ 的英文，看中文提示，点击金色光圈中的目标。也可以按空格或点击动作按钮；拖动画面可以环顾。单词可以反复点读，通关后可以保存自己的冒险卡片。第二关使用小岛的简化蛋糕配方。

## 五分钟开始贡献

1. **有想法或发现问题？** 打开[新建 Issue](https://github.com/peterzhang0528/english-island/issues/new/choose)，选择「新关卡提案」或「问题反馈」。新关卡先写故事、单词和几个动作，就可以开始讨论。
2. **想改代码？** Fork 本仓库，将自己的 Fork 克隆到电脑，然后运行下面的命令。
3. **完成一次小改动后**，按 [贡献指南](CONTRIBUTING.md) [提交 Pull Request](https://github.com/peterzhang0528/english-island/compare)，让大家一起体验和检查。

### 完整网站

需要 **Node.js 22.13.0 或更新版本**及 npm。仓库的 `.nvmrc` 指定最低开发版本；CI 使用 Node.js 22。普通克隆默认使用 portable 运行方式，不需要登录 Sites，也不需要云服务密钥。

在已克隆的 `english-island` 目录中运行：

```sh
npm ci
npm run dev
```

默认打开 [本地首页](http://localhost:5173/)，也可以直达 [第一关](http://localhost:5173/?level=1) 或 [第二关](http://localhost:5173/?level=2)。若端口占用，以终端实际输出的地址为准。

### 只研究游戏场景

安装了 Python 3 的同学可以直接启动静态游戏，不必安装网站依赖：

```sh
python3 -m http.server 8080 --directory public
```

打开 [森林关卡](http://localhost:8080/game/index.html) 或 [农场关卡](http://localhost:8080/game/day2.html)。静态入口不包含外层网站的完整关卡菜单与进度栏；不要直接双击 HTML，模块和音频需要通过 HTTP 加载。

## 改动后的检查

```sh
npm run typecheck
npm test
npm run build
```

GitHub Actions 会对提交到 `main` 的代码和 Pull Request 执行安装、类型检查、自动测试和构建。CI 不会自动发布网站。

`npm test` 检查本地资源与音频清单、语音队列／取消／暂停／回退、第二关动作保护与收割计数，以及真实 Three.js 场景在不同视口下的射线命中。语音测试使用替代音频接口；这些检查没有启动真实浏览器。

自动检查之外，请亲自玩过受影响的关卡，检查手机布局、声音、静音、帮助暂停、连续点击与通关卡片。没有运行的检查请在 PR 中直说；构建成功不等于浏览器完整通关。[具体检查方法](docs/ADDING_LEVELS.md#验证你的关卡)

## 从哪里开始读代码

| 路径 | 内容 |
| --- | --- |
| `app/page.tsx`、`app/globals.css` | 网站入口、关卡菜单、进度与设置 |
| `components/IslandGame.tsx` | iframe 加载与网站／游戏消息桥 |
| `public/game/index.html`、`js/world.js` | 第一关页面与场景 |
| `public/game/day2.html`、`js/world2.js` | 第二关页面与场景 |
| `public/game/js/voice.js`、`sfx.js` | 共享配音队列、静音、暂停与音效 |
| `public/game/audio/voice.json` | 英文文本到本地音频的索引 |
| `public/game/js/textures.js`、`vendor/` | 贴图生成与本地 Three.js |
| `tests/` | 自动检查；以 `npm test` 为统一入口 |
| `docs/ADDING_LEVELS.md` | 第三关及后续关卡的接入方法 |
| `docs/AUDIO.md` | JJ 参考声线、音频清单与试听验收 |

网站外层使用 React、TypeScript 和 vinext/Vite；游戏本体使用浏览器 ES 模块和 Three.js。两者通过消息通信，开发一个关卡时不必把场景改写成 React 组件。

## 关于 JJ 的声音

第一关原有 32 段配音保留，第二关 27 段按第一关参考声音重新生成。由于原始 voice ID 不可得，声线属于近似匹配，不承诺完全一致。新关卡请按 [配音维护指南](docs/AUDIO.md) 延续同一参考声音，避免提示句突然切换成设备的系统声音。

## 一起把小岛做大

我们欢迎完整的新关卡，也欢迎小贡献：让一个目标更容易点中、修正一条字幕、补充一个语音测试，或写清楚一次复现步骤。请保持讨论友善，反馈作品本身，并在引用素材时保留来源。

本项目第一关改编自提供的外部参考站点，后续关卡和工程化工作在此基础上继续开发。**公开仓库不代表全部素材都采用 MIT 许可**；外部代码、素材、AI 配音和第三方库的来源及适用范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
