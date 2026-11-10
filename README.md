# 英语方块岛 · English Island

[![CI](https://github.com/peterzhang0528/english-island/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/peterzhang0528/english-island/actions/workflows/ci.yml)

十天，一起把小岛变成家。用一个个小动作学英语：做工具、分享蛋糕、照顾花园，再带着朋友和前一天的发现走向下一段故事。

欢迎叶老师、杨老师和同学们一起共创。你可以提出一个故事、纠正一句英语、试玩后记录一个不容易操作的地方，也可以亲手制作下一关。

**[在线试玩已发布版本](https://english-island-zhang-1109.lulabs.chatgpt.site) · [正式版本与源码下载](https://github.com/peterzhang0528/english-island/releases) · [问题和关卡提案](https://github.com/peterzhang0528/english-island/issues/new/choose)**

本仓库包含十关连续故事。线上运行版本以部署记录与公网验收结果为准；合并、上线与版本记录按[开发与发布流程](docs/DEVELOPMENT.md)执行。

[贡献指南](CONTRIBUTING.md) · [十关故事线](docs/STORY.md) · [开发关卡](docs/ADDING_LEVELS.md) · [配音维护](docs/AUDIO.md) · [反馈协作](docs/FEEDBACK_LOOP.md) · [更新记录](CHANGELOG.md) · [素材与许可](THIRD_PARTY_NOTICES.md)

## 十段相连的冒险

| 关卡 | 今天的故事 | 带到下一段旅途的发现 |
| --- | --- | --- |
| 01 | 第一把斧头 | 学会制作工具，为建设小岛迈出第一步 |
| 02 | 给僵尸做蛋糕 | 用食物认识一位友善的新朋友 |
| 03 | 和新朋友种花园 | 一起照顾花园，准备把鲜花送出去 |
| 04 | 把花送过小桥 | 把第三关种出的花，送到第五关的集市。 |
| 05 | 集市里的小委托 | 地图通向第六关的牧场，也画着远处的海湾。 |
| 06 | 跟着脚印找小羊 | 第七关会把这份谢礼变成小船的白帆。 |
| 07 | 白帆带我们出发 | 小船会停靠在第八关的灯塔码头。 |
| 08 | 让灯塔亮起来 | 第九关里，这束光会陪朋友们度过雨天。 |
| 09 | 雨天也要互相照顾 | 第十关，所有旅途中认识的朋友都会出现。 |
| 10 | 我们一起建成的小岛 | 记住每一位朋友，也欢迎和大家一起共创下一段故事。 |

前情回顾会解释我们为什么来到这里；结尾会把下一关的故事接起来。花园里的花、修好的桥、牧场送的羊毛、白帆小船和点亮的灯塔会反复出现，最后成为庆典的一部分。关卡可自由选择，收藏只记录已完成的冒险，不会把新玩家挡在后面的故事外。

每关提供双语提示、单词点读、点击／动作按钮／空格操作，以及可下载的冒险卡。拖动可以环顾，打开帮助会暂停场景和旁白。

## 一起探索 AI 可以放在哪里

同学们可以直接口头或在约定的群里反馈，由维护者整理、查重后登记；不需要先学会 GitHub。有代码改动的贡献者按[贡献指南](CONTRIBUTING.md)提交 PR。

目前游戏没有接入实时 AI 服务。我们想和老师、同学、开发者一起讨论：AI 能在哪一个具体时刻，让开口说英语、理解故事或设计关卡变得更有趣？

你可以描述一小段体验，比如「找到小羊后，我想用自己的英语问候它」，再写出希望游戏怎样回应，以及怎样判断这个帮助有用。通过 [AI 共创点子表单](https://github.com/peterzhang0528/english-island/issues/new?template=ai_idea.yml) 分享，或者先在 PR 中讨论。普通新关卡想法仍使用「新关卡提案」。

## 本地开始

需要 Node.js 22.13.0 或更新版本及 npm。普通克隆默认使用 portable 运行方式，不需要云服务密钥或登录 Sites。

```sh
npm ci
npm run dev
```

默认打开 [本地首页](http://localhost:5173/)。用 `?level=1` 至 `?level=10` 直达关卡，例如 [第四关](http://localhost:5173/?level=4) 或 [第十关](http://localhost:5173/?level=10)。若端口被占用，以终端输出为准。

只研究游戏场景时，也可以用 Python 3 启动静态资源：

```sh
python3 -m http.server 8080 --directory public
```

前三关分别位于 `/game/index.html`、`/game/day2.html`、`/game/day3.html`；第四至十关使用 `/game/story.html?level=4` 等入口。静态入口不包含完整网站的外层菜单与进度条。请通过 HTTP 加载，不要直接双击 HTML。

## 检查与提交

```sh
npm run typecheck
npm test
npm run build
```

自动检查覆盖本地资源、全体文案录音、十关入口、语音队列与暂停、任务重复操作保护、剧情阶段顺序，以及真实 Three.js 几何在桌面和手机尺寸下的点击目标。测试中的浏览器和音频边界使用替代接口；几何测试不能代替真实浏览器的画面、听感和完整通关。

请实际试玩受影响的关卡，并在 PR 中如实记录设备、验证步骤、没有验证的部分。GitHub Actions 负责检查和构建，不会自动部署。自动反馈任务最多对明确、可复现的问题提交修复 PR，合并与发布由维护者逐次确认。

## 从哪里读代码

| 路径 | 内容 |
| --- | --- |
| `lib/chapters.ts` | 十关菜单、有效关卡与入口路径 |
| `app/page.tsx`、`components/IslandGame.tsx` | 网站菜单、进度和 iframe 消息桥 |
| `public/game/index.html`、`day2.html`、`day3.html` | 前三关的独立场景 |
| `public/game/story-chapters.json` | 第四至十关的故事、五步任务、双语词句和纪念物 |
| `public/game/js/world-story.js` | 共享故事流程、输入、暂停、配音和冒险卡 |
| `public/game/js/story-scenes.js` | 七个不同的方块场景和实际动作动画 |
| `public/game/js/voice.js`、`sfx.js` | 共享配音和音效 |
| `public/game/audio/voice.json` | 全部英语文本到本地配音的索引 |
| `tests/` | 以 `npm test` 运行的自动检查 |

## JJ 的声音

第一关原有 32 段配音保留。第二、三关及故事续篇以第一关声音为参考生成，并复用已有词句。因为原始 voice ID 不可得，这是近似声线匹配，不能保证完全一致。已有文件不会因增加关卡而重新编码。新增配音请遵循 [配音维护指南](docs/AUDIO.md)。

## 反馈与共创

游戏右上角的反馈按钮会带入当前关卡、阶段和版本。没有 GitHub 账号的同学，可以把反馈交给老师整理。每条 Issue 关联修复 PR 和发布版本，避免同一条反馈反复开工。WorkBuddy 与企业微信的接力方法见 [反馈协作](docs/FEEDBACK_LOOP.md)；仓库内容不代表通知通道已经由代码自动接通。

本项目第一关改编自提供的外部参考站点，后续实现包含 AI 辅助开发。公开仓库不代表全部素材都采用 MIT 许可；来源和使用范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
