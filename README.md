# game-scaffold：竖屏休闲手游开发底座

竖屏休闲手游的开发底座。**所有新游戏都从这里克隆开始**：界面、外围系统、平台层、三端打包、文档全部现成，新游戏只换玩法、美术、数值和文案。

- **做新游戏**：复制 [`PROMPT.md`](PROMPT.md) 里的提示词给 AI，填上游戏名和玩法即可。
- **AI 的工作规则**：[`CLAUDE.md`](CLAUDE.md)（Codex 等读 [`AGENTS.md`](AGENTS.md)）。
- **开工步骤**：[`docs/00-新游戏开工清单.md`](docs/00-新游戏开工清单.md)。

## 里面有什么

| 部分 | 内容 |
|---|---|
| 引擎 | Cocos Creator 3.8.8 + TypeScript 严格模式，界面全部由代码生成 |
| 三端 | 微信小游戏（资源放云开发、加载页下载）、iOS、Android（AdMob + UMP + ATT）、网页版；一个仓库一个主干，差异只在平台层和 `game.json` |
| 界面（`docs/09`） | 平面纯色设计系统：配色、字体、部件库 `ui/kit.ts`；主页（顶栏 + 左右入口 + 展示区 + 开始键）、商城、地图、选关、每日任务、每日挑战、转盘、收藏、签到、个人资料、锁页、设置 / 暂停、生命、金币不足、开奖、新卡翻面、加载页 |
| 局内外壳 | 顶栏（进度、关卡号 / 倒计时、设置）、暂存槽、技能栏（数量角标、购买、强制教学、救场小手）、连击满屏特效（光框、放射光、夸奖词、烟花）、难关横幅、提示圈、过关庆祝、复活、失败、结算（星级、宝箱、翻倍）、机器人代打、难度调试页 |
| 外围系统（`docs/01`） | 金币、生命、技能、星级、过关宝箱、七日签到、每日 / 每周任务、转盘、收藏册、每日挑战、连击、关卡类型、章节、功能开放、广告位与频控、存档 |
| 示例玩法 | 三消取块（`core/demo/`）：保证可解的关卡生成、规则、测试；换玩法见 `docs/02` |
| 多语言 | 12 种语言（App）/ 简中 + 英文（微信），按系统语言选、设置里可换；字体裁剪 |
| 工具 | 一键试玩 `./run.sh`、打包 `./package.sh`、检查 `./run.sh check`、关卡校验、金币模拟、`.meta` 生成、包体压缩、应用图标、上架图导出、微信资源上云 |

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

## 占位内容

示例卡面、背景、logo、应用图标都是程序生成的占位图，游戏名是「My Game」，`game.json` 里的广告位是 Google 官方测试 ID、包名是 `com.example.mygame`。做新游戏时按 `docs/00` 第 1、5 步全部换掉。

## 许可

字体：荆南麦圆体（SIL OFL，`client/licenses/`）；韩文字体：资源圆体（OFL）。音效：自合成、FluidR3_GM（MIT）、Kenney（CC0），许可在 `client/tools/audio/`。
