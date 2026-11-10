# A/B 试玩：第二关剧情 vs 第三关开放小岛

这是 2026-11-10 晚 AI小学课后的对照改动说明。本文件不授权合并到 `main`，也不等于已经发布到 chatgpt.site。

## 两关分别怎么玩

- **第二关保持线性剧情**：听／看 → 做 → 进入下一步。任务仍是为友善的僵尸朋友做蛋糕。本分支纳入了 [PR #4](https://github.com/peterzhang0528/english-island/pull/4) 的月夜农场视觉（夜空、月亮、星星和暖灯），玩法、坐标、台词和原有配音都没有改成开放世界。
- **第三关改为开放小岛**：可以自由走动（WASD／方向键，手机用左下角摇杆），左上角任务板会一直显示。松果和木头、观察动物可以按自己的顺序做；做鸟屋要先收齐 3 个松果和 2 根木头，邀请小鸟要先有鸟屋。不是一条锁死的单线路，也不是没有目标的闲逛。角色和玩法是小岛自己的设定，没有按英语帆或 Maizen-JJ 的素材复制。

第三关开始后，会先有一句探索说明和任务提醒，然后把镜头交给玩家。走近金色光圈再点击或按空格。点右下角「问问朋友」或按 H，会听到一句英语提示；这只是轻量挂钩，不是完整对话，也没有真人联机。

## 如何本地预览

仓库约定：合并到 `main` 与发布网站是两件分开的事。GitHub Actions 只做安装、类型检查、测试和构建，**不会自动发布**。

在本分支目录中：

```sh
npm ci
npm run dev
```

然后打开终端里的地址，或直达 [第二关](http://localhost:5173/?level=2)、[第三关](http://localhost:5173/?level=3)。只看场景也可以：

```sh
python3 -m http.server 8080 --directory public
```

打开 `/game/day2.html` 或 `/game/day3.html`。不要用 `file://` 直接打开。

## 十关预览为什么还不能当线上版

[PR #2](https://github.com/peterzhang0528/english-island/pull/2)（Draft）里已经有第四至少第十关的代码、共享故事引擎和 118 段新配音，CI 曾通过；作者自己写明浏览器全流程试玩未完成，因此保持 Draft。[PR #3](https://github.com/peterzhang0528/english-island/pull/3) 是基于 PR #2 的第十关彩蛋，真实模型尚未接通。Issue [#5](https://github.com/peterzhang0528/english-island/issues/5) 也写明：这些候选都还需要维护者针对具体改动确认，并且和月夜农场存在文案／菜单冲突，不能把「CI 通过」说成已经上线。

本 A/B 分支没有把十关预览合并进来，也没有改 PR #2／#3／#4 的分支。

## 怎样发布到 chatgpt.site

线上试玩地址 https://english-island-zhang-1109.lulabs.chatgpt.site 是 ChatGPT Sites 的生产地址。仓库里的 `.openai/hosting.json` 把本地项目连到站点 `appgprj_6af1ccbc1804819199d744483d2a39f8`。发布分两步，需要站点所有者在 ChatGPT 的 Sites 里操作：

1. **保存一个版本**（Save a version）：为当前要发布的 Git 提交构建可部署版本，这一步还不会替换线上页面。
2. **部署该版本**（Deploy a version）：成功后才会更新上面的生产网址。没有单独的预发布链接，部署即上线。

部署后请立刻核对该网址的关卡数量、第二关是否仍是月夜剧情、第三关是否已是开放小岛。本环境的数据中心 IP 会被 chatgpt.site 的 Cloudflare 拦截（403），所以这里不能代替你做线上验收。
