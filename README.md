# 挖豆小火车（antsort）

竖屏休闲益智手游：上面是一幅上下两层的拼豆像素画，下面是排队的彩色车厢。点车厢进站，同色的小挖机自动去挖露在外面的豆、装进车厢，装满发车；叫错车会占住装车位，站台堵死就输。出微信小游戏、iOS、Android 三端。

- **玩法和难度**：[`docs/01-玩法与外围系统.md`](docs/01-玩法与外围系统.md) 第 1–3 节、[`docs/02-玩法接入与关卡.md`](docs/02-玩法接入与关卡.md) 第 4–6 节。
- **开发顺序**：[`docs/07-里程碑.md`](docs/07-里程碑.md)。
- **AI 的工作规则**：[`CLAUDE.md`](CLAUDE.md)（Codex 等读 [`AGENTS.md`](AGENTS.md)）。
- **底座**：从 [game-scaffold](https://github.com/crazyniu/game-scaffold) 开工，界面、外围系统、平台层、打包照用；本仓库的 `scaffold` 远程指向它，底座修的通用问题可以挑着合过来。

## 快速开始

```bash
cd client && npm ci && cd ..
./run.sh check            # Linux / Mac：类型检查 + 测试 + 资源检查
./run.sh                  # Mac（装了 Cocos Creator 3.8.8）：构建网页版并在浏览器里试玩
./run.sh lan              # 同上，服务开在内网，手机扫地址就能玩
./package.sh              # Mac：打包微信 / iOS / Android / 网页版
```

界面层的类型检查需要 Cocos 的类型声明（不进仓库）：从 Mac 的 Cocos 3.8.8 或 npm 的 `@cocos/creator-types@3.8.8` 取 `cc.d.ts` 放到 `client/.cc-types/`，`cc.env.d.ts` 声明 `cc/env` 的 `DEBUG` 等常量，`cc.custom-macro.d.ts` 写 `export {}`。没有时 `./run.sh check` 跳过这一项。

## 目录

```
CLAUDE.md  AGENTS.md  PROMPT.md     # AI 规则、新游戏提示词
game.json                           # 游戏身份（名字、包名、广告位、appid、语言）
run.sh  package.sh                  # 一键运行 / 打包
docs/                               # 00 开工清单 … 10 开发底座
i18n/strings.csv                    # 文案（每种语言一列）
client/                             # Cocos 工程（scripts：core / services / platform / ui / game / pages / devtools）
tools/                              # .meta、原生工程改写、图标、微信资源上云、上架图
store/                              # 上架文案和上架图需求（模板）
art/                                # 出图需求、风格样张、应用图标源图
```

## 还是占位的内容

示例卡面、背景、logo、应用图标都是程序生成的占位图，`game.json` 里的广告位是 Google 官方测试 ID、包名是 `com.example.antsort`（等用户给域名前缀）。按 `docs/00` 第 5、8 步换掉。局内的车厢、小挖机、三个技能图标也是代码画的占位图（`client/tools/art/proto.mjs`）。现在做好了前 10 关（原型，`docs/07` 的 M1）。

## 许可

字体：荆南麦圆体（SIL OFL，`client/licenses/`）；韩文字体：资源圆体（OFL）。音效：自合成、FluidR3_GM（MIT）、Kenney（CC0），许可在 `client/tools/audio/`。
