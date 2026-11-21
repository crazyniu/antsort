# 上架文案（三端）

规矩见 `docs/06` 第 7 节。只写游戏里真有的东西，不提任何别的游戏；数字跟着配置改（关卡数 `levels.json` 的 `total`、收藏卡数 `cards.json`）。
字数上限按各商店当时的规定，提交前在后台再核一次。App 的每种语言一份（`game.json` 的 `languages.app`），按当地休闲游戏的说法写，不直译。

`store/app-ads.txt`：把 `pub-0000000000000000` 换成自己的 AdMob 发布商 ID，放到开发者网站根目录；两个商店后台的「开发者网站」填同一个网站。

---

## App Store（只上海外，不选中国大陆）

### English (U.S.) — 主语言

| 字段 | 内容 | 上限 |
|---|---|---|
| Name | TODO | 30 |
| Subtitle | TODO | 30 |
| Keywords | TODO（逗号分隔，不加空格） | 100 |
| Promotional Text | TODO | 170 |

**Description**（上限 4000）

```
TODO：第一段一句话卖点；HOW TO PLAY 三四条；FEATURES 四五条（关卡数、收藏、每日挑战……）
```

（其余语言照这个格式各一份）

---

## Google Play

| 字段 | 内容 | 上限 |
|---|---|---|
| 应用名称 | TODO | 30 |
| 简短说明 | TODO | 80 |
| 完整说明 | 同 App Store 的 Description | 4000 |

---

## 微信小游戏

| 字段 | 内容 |
|---|---|
| 名称 | TODO（先在后台查重名） |
| 简介 | TODO（120 字以内） |
| 类目 | 休闲游戏 |
