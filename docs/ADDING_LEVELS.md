# 为小岛添加下一段故事

先让一个短故事完整地跑通，再增加场景细节。第四至十关共用故事流程，关卡文案与场景各自维护；不要复制整套音频、贴图和 Three.js。

## 1. 先写一段接得上的故事

在新关卡提案中说明：上一关留下了什么、本关为什么需要行动、孩子会学哪些英语、最后把什么带到下一关。参考 [十关故事线](STORY.md)。

每关目前有一个开场和五个任务。英文短而具体，让动作解释词义；中文帮助理解。前情回顾支持从任意关卡开始，纪念物提供联系，不作为强制解锁条件。

## 2. 添加双语关卡数据

第四至十关的数据位于 `public/game/story-chapters.json`。每项包括：

| 字段 | 内容 |
| --- | --- |
| `id`、`title`、`subtitle`、`description` | 编号与菜单文案 |
| `recap` | 简短中文前情回顾 |
| `opening`、`ending`、`next` | 含 `en` 和 `zh` 的开场、完成、后续故事 |
| `stages` | 五项任务，各有 `id`、`label`、大写 `word`、双语 `instruction` 和 `result` |
| `coreWords` | 可点读的双语词汇，大写 `en` 与中文 `zh` |
| `reward` | 纪念物的 `name` 和 `description` |
| `palette` | 场景与页面使用的 `sky`、`accent`、`paper` 色彩 |

改动英文意味着需要同步配音索引。先确定文案，再生成录音。不要用未配音的临时文本替代正式旁白。

当前共享入口是 `/game/story.html?level=4` 至 `level=10`。前三关保留各自的 `index.html`、`day2.html`、`day3.html`。通过 HTTP 加载，直接双击 HTML 不属于支持的运行方式。

## 3. 制作真正能操作的场景

`public/game/js/story-scenes.js` 中的工厂按编号创建场景，返回：

```js
{
  root,             // THREE.Group
  hotspots,         // 探索点读对象
  targets,          // 五个任务对象，顺序对应 stages
  intro,            // { pos, look, fov }
  shots,            // 五组任务镜头
  finishShot,
  async perform(index, { tween, burst }) {},
  tick(time, delta) {}
}
```

每个任务对象通过 `userData.stageIndex` 和 `userData.word` 与流程连接。`perform` 接受从零开始的任务序号：拒绝乱序、重复和并发动作；成功后留下明确的世界变化。使用传入的 `tween` 推进动画，让暂停和减少动态的设置继续有效。

为场景安排有辨识度的地形、人物和道具。重复地面使用实例化几何，当前每关不超过 2,000 格。检查镜头到目标的遮挡，不能仅证明目标在相机范围内。手机纵向也必须能点到目标，并提供动作按钮作为另一种输入。

前三关的独立实现可用于参考复杂机制，但常规五步任务优先使用共享流程，避免为每关复制状态机。

## 4. 接入网站与流程边界

当前有效关卡明确限定为 `1` 至 `10`，**只追加数据不会自动开放第十一关**。新增编号时同步检查：

| 文件 | 需要检查 |
| --- | --- |
| `lib/chapters.ts` | `Level`、`chapterNumbers`、中文编号和入口路径 |
| `components/ChapterArtwork.tsx` | 菜单插画 |
| `app/page.tsx` | 关卡总数、菜单介绍、完成数量与反馈信息 |
| `public/game/js/bootstrap-story.js`、`world-story.js` | 支持编号、数据验证、上一关／下一关、最终章逻辑 |
| `public/game/js/story-scenes.js` | 新场景工厂与有效编号 |
| 测试与文档 | 编号边界、全部文案配音、真实动作与菜单入口 |

`components/IslandGame.tsx` 使用统一目录选择 iframe。页面支持 `?level=N`，本地保存最近关卡和完成徽章。切换关卡从头开始，不恢复未完成的材料进度。新关卡纪念物保存在 `island-story-rewards-v1`；存储不可用时仍应正常通关。

共享流程使用 `step: 0` 表示开场、`1` 至 `5` 表示任务、`6` 表示完成。进入异步动作前同步设置忙碌状态；帮助、页面隐藏和外部暂停各有独立原因，关闭帮助不能解除仍然有效的其他暂停。图形动画与旁白都要暂停。

只记录事实，例如完成了哪些阶段。词袋、按钮和当前目标由这些事实推导。场景动作成功而后续讲解失败时，重试应接着讲解，不能重复消耗材料；最后对白失败也不能重新执行最后动作。

## 5. 父页面与 iframe 消息协议

网站外层不直接操作 Three.js 场景。双方都检查同源和发送窗口，`targetOrigin` 使用 `location.origin`，不能使用 `"*"`。

```js
// 游戏 → 网站
parent.postMessage({
  type: 'island-status', level: 4,
  ready: true, step: 1, busy: false,
  words: ['PLANKS'], muted: false, completed: false,
}, location.origin);

// 游戏 → 网站：切换到已支持的关卡
parent.postMessage({ type: 'island-navigate', level: 5 }, location.origin);
```

`words` 只含已发现的词，真实完成后才发送 `completed: true`。错误提示面向玩家，不包含原始堆栈或个人路径。独立入口中 `parent === window`，导航需要直接跳转，不能只发消息。

网站转发的动作格式是 `{ type: 'island-command', command, word? }`。支持 `start`、`act`、`mute`、`restart`、`help`、`summary`、`speak`、`pause` 和 `resume`；`fullscreen` 由外层处理。点击、空格与动作按钮使用同一个受状态保护的入口。

```js
if (event.origin !== location.origin ||
    event.source !== parent ||
    event.data?.type !== 'island-command') return;
```

父页面也必须确认消息来自当前 iframe，旧关卡的迟到消息不能覆盖新关卡状态。

## 6. 保持 JJ 的声音

沿用 [配音维护](AUDIO.md) 中的第一关参考声音。第一关 32 段和所有已发布录音保持不变，已有词句直接复用。新增录音登记在 `public/game/audio/voice.json`，键与实际文本经过 `trim().toLowerCase()` 后完全一致，包括标点。时长必须测量最终成品。

共享流程只播放已登记的本地录音；缺失时保留字幕等待，不临时换用系统音色。这个保护不代表允许漏配音，自动检查必须覆盖所有开场、任务、结果、结尾、衔接和可点读词。

## 7. 验证与提交

```sh
npm run typecheck
npm test
npm run build
```

自动测试覆盖资源、DOM 标识、目录与数据契约、配音完整性、真实流程声明、真实场景动作、输入锁、异常重试、存储失败、跨关导航，以及 Three.js 射线与遮挡。测试中的音频、计时和界面边界经过替代，不能当作真实浏览器完整通关。

还需要在支持 WebGL 的浏览器试玩：

- 独立入口与网站 iframe、桌面与手机纵向均正常，所有菜单项可到达。
- 通过点击、动作按钮与空格完成任务，连续输入不会跳步或重复取物。
- 旁白与动作对应，静音、重听、帮助与后台切换正常。
- 通关、冒险卡、纪念物、换关和重玩正常。

在 PR 中写明复现或体验步骤、验证结果和未验证部分。无法完成浏览器验收时提交 Draft PR，请大家协助试玩。**自动任务可以修复并提 PR；合并、网站发布和版本发布都等待维护者针对这次改动的确认。**
