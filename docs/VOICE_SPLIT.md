# 给须翊恒的配音拆分说明

课上反馈：从第二关起，JJ 的声音和僵尸朋友／蛋糕相关对白太像，需要分开。这里只做审查，**没有替换或删除任何原有录音**，避免和须翊恒（GitHub：`william-0724`）即将提交的声音分支冲突。

当前播放架构的关键点：`say()` 只会更换头像和字幕上的说话人，真正出声一律走 `public/game/js/voice.js`，并且 `voice.json` **只按英文文本**索引文件。所以第二关里小僵尸说的话，录音文件名仍是 `l2-jj-*.mp3`，听感与 JJ 相同。

## 必须换成朋友声线的句子

这些是第二关里 `speaker: 'friend'` 的对白，孩子会看到僵尸在说话，但听到的是 JJ 的参考声线：

| 文本 | 当前文件 | 出现位置 |
| --- | --- | --- |
| `i'm hungry.` | `public/game/audio/l2-jj-s-hungry.mp3` | 开场，小僵尸说自己饿了；场景气泡也写了同一句 |
| `yummy! thank you!` | `public/game/audio/l2-jj-s-yummy.mp3` | 收到蛋糕后，小僵尸道谢 |

建议：**不要改这两句英文**，以免改动关卡脚本。用明显不同的朋友声线重录后，可以仍写入上述文件名，或改成例如 `l2-friend-s-hungry.mp3` / `l2-friend-s-yummy.mp3`，并只更新 `voice.json` 里对应两条的 `f` 与实测 `d`。不要动其他 `l2-jj-*` 或第一关原文件。

朋友声线建议比 JJ 略低、略慢、更软，和 JJ 的轻快讲解分开。同一位朋友在第三关提示里也应沿用这个声音。

## 请保持 JJ 声线的第二关句子

下面这些虽然也提到蛋糕、朋友或饥饿，但是 **JJ 的旁白或点读**，不要和僵尸对白混成一个声音：

- 旁白：`hello, my friend!`、`let's make a cake!`、`a cake! we made a cake!`、`give the cake to our hungry friend.`、`you're welcome, my friend!`，以及做蛋糕过程中的食材提示（`l2-jj-s-look-chicken.mp3` 等到 `l2-jj-s-mix.mp3`）。
- 单词点读（始终是 JJ 教单词，不是角色对白）：`l2-jj-w-zombie.mp3`、`l2-jj-w-hungry.mp3`、`l2-jj-w-cake.mp3`、`l2-jj-w-friend.mp3`，以及其他食材单词。

第一关的 `s-tomorrow.mp3`（`tomorrow, let's make a cake for the zombie!`）也是 JJ 的预告，可先不动。

## 第三关已分开文件名前缀，便于你替换

本分支为开放小岛新增的录音是**临时占位**，不是最终 JJ／朋友声线：

- JJ 任务句、单词：`public/game/audio/l3-open-*.mp3`，用 edge-tts `en-US-GuyNeural`（语速 `-8%`）生成，再转成单声道 24 kHz／48 kbps MP3。请按 [配音维护指南](AUDIO.md) 以第一关 `s-hi.mp3`、`s-look-tree.mp3` 为参考重做。
- 朋友提示句：`public/game/audio/l3-friend-s-*.mp3`，用 `en-GB-RyanNeural` 生成，有意与 JJ 占位声不同。请改成与第二关僵尸朋友**同一条**朋友声线（不必保留英音）。

对应清单条目已写入 `voice.json`。这些文本目前互不重复，所以仍可按句子索引；如果以后 JJ 和朋友要说同一句英文，需要再给 `voice.js` 增加按说话人查找的能力。本次没有改 `voice.js`，以免和你的声音工作打架。

## 建议验收

1. 交替播放 `l2-jj-s-hello-friend.mp3` 与重录后的 `i'm hungry.`，应能立刻听出两个人。
2. 再听 `l2-jj-s-give-cake.mp3` 与重录后的 `yummy! thank you!`，蛋糕情节里也不应再像同一个人。
3. 第三关点「问问朋友」时，提示句应跟第二关的僵尸朋友是同一个声音，并与 JJ 的任务句分开。
4. 运行 `npm test`，不要改已有 82 条原清单的文本键；若只换文件，更新对应的 `f` 和时长 `d`。
