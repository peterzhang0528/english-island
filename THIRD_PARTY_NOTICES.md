# 素材来源与第三方许可

本项目包含参考站点的改编内容、新增实现、AI 配音和第三方依赖。下面按来源说明适用范围。**本仓库没有将全部代码、配音和视觉素材统一声明为 MIT；一个依赖的 MIT 许可不能扩展到其他来源的内容。**

## 游戏与参考素材

| 范围 | 来源及说明 |
| --- | --- |
| 第一关场景、玩法及共享视觉／音效基础 | 改编自任务提供的 [英语帆参考站点](https://yingyufan.com/) 的公开前端资源；本仓库加入了独立页面、网站适配和交互改进。涉及 `public/game/js/world.js`、共享贴图／音效基础与相关页面素材。 |
| 第二至十关与网站工程化 | 在上述基础上新增农场、花园及第四至十关连贯故事、关卡接入、自动检查和协作文件；开发过程有 AI 辅助。复用的第三方基础仍受各自许可约束。 |
| `public/game/audio/` | 保留第一关 32 段参考项目配音；第二关 27 段和第三关 23 段以第一关声音为参考重新合成，采用近似声线匹配。十关故事预览另新增第四至十关 118 段，沿用同一参考声音与处理设置；原有 82 个文件及清单条目保持不变，新增后共 200 条。过程与限制见 [配音维护](docs/AUDIO.md)。`voice.json` 是文本与文件索引，不是授权证明；新增音频需要保留其来源与使用依据。 |
| 方块世界风格与名称 | 项目描述中的 Minecraft 仅用于说明风格；本项目不是 Mojang 或 Microsoft 的官方产品，也不由其背书。 |

当前仓库未附参考站点整体内容的统一开源授权文件。相关原始代码、图片、配音及名称的权利仍属于各自权利人；本项目的公开展示或修改不等于对这些内容新增再许可。需要进一步转载、商业使用或单独分发相关素材时，应核实对应授权范围。

请勿把外部素材重新标为原创，或因为它出现在公开网页中就推定可以任意再分发。贡献新素材时，在 PR 中注明来源链接、作者（若公开提供）、适用许可和必要的修改说明；只提供与素材权利有关的信息，不加入个人账号、密钥或私人录音。

## Three.js

本地分发文件：

- `public/game/js/vendor/three.module.min.js`
- `public/game/js/vendor/three.core.min.js`

文件头记录的来源是 npm 包 **three@0.186.1**，经 jsDelivr 压缩，并保留了 Three.js 的版权与 SPDX MIT 声明。上游项目为 [Three.js](https://github.com/mrdoob/three.js)，以下许可文本对应 [r186 的 LICENSE](https://github.com/mrdoob/three.js/blob/r186/LICENSE)，仅适用于 Three.js 内容。

```text
The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## 网站依赖与工具

- shadcn 的相关样式许可保留于 [vendor/shadcn-tailwind-4.13.0.LICENSE.md](vendor/shadcn-tailwind-4.13.0.LICENSE.md)。
- Sites Vite 插件的许可保留于 [scripts/vite/sites-vite-plugin.LICENSE](scripts/vite/sites-vite-plugin.LICENSE)。
- React、vinext/Vite、Next.js、Cloudflare 工具及其他 npm 依赖由 `package.json` 和 `package-lock.json` 记录版本；各依赖的许可见其发布包及上游项目。本说明不替代这些许可，也不将依赖许可合并为全仓库许可。

更新或移除第三方文件时请同步这份清单，并保留仍在分发内容所要求的版权声明。
