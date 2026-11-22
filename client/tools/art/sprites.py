#!/usr/bin/env python3
"""把 Codex 画的素材图（品红底，一张图里几个东西）切开、去底、缩到规格，写进 assets/resources/ui/kit/。

来源在 art/raw/sprites/（出图需求见 art/briefs/game_sprites.md）：
  walk2.png  小人空手走路：4 列 × 3 行（正面、侧面朝右、背面各 4 帧）。照效果图的画风：圆滚滚、连帽衫整身一个颜色、没有黑描边
  carry2.png 小人双手伸在身前走路（抱着豆，豆由代码画）：同样 4 列 × 3 行
             帽子和衣服是白的，局内按小队的颜色染色，所以每帧切成两张：
             kit/wk_<姿势>_<帧>b（白衣帽，染色）和 kit/wk_<姿势>_<帧>t（脸、手、鞋，不染色）；
             姿势 f 正面（往下走）/ s 侧面（朝右）/ b 背面（往上走），抱着豆的前面加 c（cf、cs、cb）
  train.png  车头、空车厢
  boat.png   睡莲、芦苇、涟漪圈（2×2 排；里面那条横着的船不用了）
  boat_moored.png  小船（上场位）：船头朝上、船头有木桩的空木船，一张图一条
  props.png  小桥（已不用，跳过）、草丛两种、小花、灌木、小石子（3×2 排）

去底：背景是纯品红，按「有多品红」算透明度再把颜色还原（不是硬阈值，边缘不出锯齿和粉边，docs/03 第 5 节）。
用法：python3 client/tools/art/sprites.py [walk carry train boat moored props]，然后 ./run.sh art-compress、./run.sh meta
依赖：numpy、Pillow
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from import_art import resize  # noqa: E402

REPO = HERE.parent.parent.parent
RAW = REPO / 'art/raw/sprites'
OUT = HERE.parent.parent / 'assets/resources/ui/kit'
RES = 3


def unkey(path: Path) -> np.ndarray:
    """品红底 → 透明：返回 RGBA（0–1）"""
    a = np.asarray(Image.open(path).convert('RGB'), dtype=np.float64) / 255.0
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # 品红 = 红蓝都高、绿低。key：这个像素里掺了多少品红
    key = np.clip(np.minimum(r, b) - g, 0, 1)
    alpha = np.clip(1 - key / 0.92, 0, 1)
    alpha = np.where(alpha < 0.06, 0, alpha)
    safe = np.where(alpha > 1e-3, alpha, 1)[..., None]
    bg = np.array([1.0, 0.0, 1.0])
    rgb = np.clip((a - (1 - alpha[..., None]) * bg) / safe, 0, 1)
    return np.concatenate([rgb, alpha[..., None]], -1)


def boxes(alpha: np.ndarray, min_area: int = 900) -> list[tuple[int, int, int, int]]:
    """连在一起的每一块的外框（x0, y0, x1, y1），太小的碎点不要"""
    k = 4
    h, w = alpha.shape
    m = alpha[: h - h % k, : w - w % k].reshape(h // k, k, w // k, k).max(axis=(1, 3)) > 0.3
    H, W = m.shape
    label = np.zeros((H, W), dtype=np.int32)
    out = []
    cur = 0
    for sy in range(H):
        for sx in range(W):
            if not m[sy, sx] or label[sy, sx]:
                continue
            cur += 1
            stack = [(sy, sx)]
            label[sy, sx] = cur
            x0 = x1 = sx
            y0 = y1 = sy
            n = 0
            while stack:
                y, x = stack.pop()
                n += 1
                x0, x1, y0, y1 = min(x0, x), max(x1, x), min(y0, y), max(y1, y)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not label[yy, xx]:
                            label[yy, xx] = cur
                            stack.append((yy, xx))
            if n * k * k >= min_area:
                out.append((max(0, x0 * k - 6), max(0, y0 * k - 6), min(w, (x1 + 1) * k + 6), min(h, (y1 + 1) * k + 6)))
    return out


def rows(bs: list[tuple[int, int, int, int]]) -> list[tuple[int, int, int, int]]:
    """按「从上到下一行行、每行从左到右」排"""
    bs = sorted(bs, key=lambda b: (b[1] + b[3]) / 2)
    out: list[list[tuple[int, int, int, int]]] = []
    for b in bs:
        cy = (b[1] + b[3]) / 2
        if out and abs((out[-1][0][1] + out[-1][0][3]) / 2 - cy) < (b[3] - b[1]) * 0.6:
            out[-1].append(b)
        else:
            out.append([b])
    return [b for row in out for b in sorted(row, key=lambda b: b[0])]


def save(a: np.ndarray, name: str, height: float) -> None:
    """a：RGBA（0–1）；height：显示多高（设计单位），按 3 倍存"""
    im = Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
    h = round(height * RES)
    w = max(1, round(im.width * h / im.height))
    resize(im, w, h).save(OUT / f'{name}.png', optimize=True)
    print(f'✓ kit/{name}.png {w}×{h}')


def crop(a: np.ndarray, b: tuple[int, int, int, int]) -> np.ndarray:
    return a[b[1] : b[3], b[0] : b[2]]


def split_cloth(canvas: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """一帧切成两张：白衣帽（灰度，局内染色）和不染色的部分"""
    rgb, alpha = canvas[..., :3], canvas[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)
    # 白衣帽：不带颜色、够亮的像素。阈值放宽一点（软阴影里会带一点点暖色），肤色的饱和度在 0.3 以上，不会被算进来
    cloth = (sat < 0.22) & (mx > 0.42)
    body = np.zeros_like(canvas)
    v = np.clip(mx / 0.97, 0, 1)
    body[..., 0] = body[..., 1] = body[..., 2] = v
    body[..., 3] = alpha * cloth
    top = canvas.copy()
    top[..., 3] = alpha * ~cloth
    return body, top


def sheet12(file: str, poses: tuple[str, str, str]) -> None:
    """4 列 × 3 行的小人图：一行一个方向，行内 4 帧。每行用同一块画布（底边对齐、左右居中）"""
    a = unkey(RAW / file)
    bs = rows(boxes(a[..., 3], 2500))
    if len(bs) != 12:
        raise SystemExit(f'{file} 里要 12 个小人（4 列 × 3 行），认出来 {len(bs)} 个')
    for r, pose in enumerate(poses):
        frames = bs[r * 4 : (r + 1) * 4]
        W = max(b[2] - b[0] for b in frames)
        H = max(b[3] - b[1] for b in frames)
        for i, b in enumerate(frames):
            c = crop(a, b)
            canvas = np.zeros((H, W, 4))
            x = (W - c.shape[1]) // 2
            canvas[H - c.shape[0] :, x : x + c.shape[1]] = c
            body, top = split_cloth(canvas)
            save(body, f'wk_{pose}_{i}b', 48)
            save(top, f'wk_{pose}_{i}t', 48)


def walk() -> None:
    sheet12('walk2.png', ('f', 's', 'b'))


def carry() -> None:
    sheet12('carry2.png', ('cf', 'cs', 'cb'))


def boat() -> None:
    """boat.png 里只用睡莲、芦苇、涟漪圈；船换成 boat_moored.png 那条船头朝上的"""
    a = unkey(RAW / 'boat.png')
    bs = rows(boxes(a[..., 3], 1500))
    names = [('deco_lily', 30), ('deco_reed', 40), ('ripple', 36)]
    if len(bs) != len(names) + 1:
        raise SystemExit(f'boat.png 里要 {len(names) + 1} 个东西，认出来 {len(bs)} 个')
    # 最大的那个是旧的船，不要
    bs.sort(key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))
    for b, (name, h) in zip(rows(bs[1:]), names):
        save(crop(a, b), name, h)


def moored() -> None:
    """boat_moored.png：一条船头朝上、船头有拴船木桩的空木船（照我们效果图里的船画的）。存两张：
    kit/boat 整条船（垫在方块下面）、kit/boat_front 靠近我们这一侧的船帮（盖在方块前面，方块看着是坐在船舱里的）"""
    a = unkey(RAW / 'boat_moored.png')
    bs = boxes(a[..., 3], 4000)
    if len(bs) != 1:
        raise SystemExit(f'boat_moored.png 里要一条船，认出来 {len(bs)} 个')
    hull = crop(a, bs[0])
    save(hull, 'boat', BOAT_H)
    front = hull.copy()
    front[: int(front.shape[0] * BOAT_RIM)] = 0
    save(front, 'boat_front', BOAT_H)
    print(f'  kit/boat 的宽高比（宽 / 高）：{hull.shape[1] / hull.shape[0]:.4f}')


def train() -> None:
    a = unkey(RAW / 'train.png')
    bs = rows(boxes(a[..., 3], 4000))
    if len(bs) != 2:
        raise SystemExit(f'train.png 里要车头和车厢，认出来 {len(bs)} 个')
    # 宽的那个是车头还是车厢说不准：有烟囱的（高的）是车头
    bs.sort(key=lambda b: b[3] - b[1], reverse=True)
    save(crop(a, bs[0]), 'loco', 96)
    wagon = crop(a, bs[1])
    save(wagon, 'wagon_back', 66)
    # 前挡板：车厢图去掉上面一截（斗口以上），盖在装进去的小方块前面
    front = wagon.copy()
    front[: int(front.shape[0] * WAGON_RIM)] = 0
    save(front, 'wagon_front', 66)


def props() -> None:
    a = unkey(RAW / 'props.png')
    bs = rows(boxes(a[..., 3], 1500))
    names = [(None, 0), ('deco_tuft1', 26), ('deco_tuft2', 26), ('deco_flower', 34), ('deco_bush', 46), ('deco_pebble', 16)]
    if len(bs) != len(names):
        raise SystemExit(f'props.png 里要 {len(names)} 个东西，认出来 {len(bs)} 个')
    for b, (name, h) in zip(bs, names):
        if name:
            save(crop(a, b), name, h)


RAW3 = REPO / 'art/raw/sprites_v3'


def shine(a: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """白色的立体小件切成两张：灰度本体（局内染色）和不染色的高光。
    本体：亮度按「正面那一片」（亮度的六成分位）拉到 1，正面染出来正好是色板上的颜色，侧面、阴影按比例暗下去；
    高光：只取最亮的那 3%（真正的反光点），白的、按亮度给透明度。高光取多了整颗豆会蒙一层白、颜色发灰"""
    rgb, alpha = a[..., :3], a[..., 3]
    v = rgb.max(-1)
    solid = v[alpha > 0.9]
    face = float(np.percentile(solid, 60))
    spec = float(np.percentile(solid, 97))
    body = np.zeros_like(a)
    body[..., 0] = body[..., 1] = body[..., 2] = np.clip(v / face, 0, 1)
    body[..., 3] = alpha
    hi = np.zeros_like(a)
    hi[..., :3] = 1
    hi[..., 3] = alpha * np.clip((v - spec) / max(1e-3, 1 - spec), 0, 1) * 0.7
    return body, hi


def v3() -> None:
    """简洁版（效果图 H，docs/01 第 3 节）的素材，art/raw/sprites_v3/：
    beads.png  左：带一个圆凸点的积木豆；右：带盖的数字方块。都是白的，切成本体（染色）+ 高光（不染色）
    train.png  左：车头（青色，不染色）；右：空车厢（白的，按装的颜色染色）
    bridge.png 右边那段铁轨（横着平铺）；bridge2.png 竖着跨过铁轨的人行天桥"""
    a = unkey(RAW3 / 'beads.png')
    bs = rows(boxes(a[..., 3], 4000))
    if len(bs) != 2:
        raise SystemExit(f'beads.png 里要豆和方块，认出来 {len(bs)} 个')
    bead, block = (crop(a, b) for b in bs)
    body, hi = shine(bead)
    save(body, 'stud', STUD_H)
    save(hi, 'stud_hi', STUD_H)
    print(f'  kit/stud 宽 / 高：{bead.shape[1] / bead.shape[0]:.4f}')
    body, hi = shine(block)
    save(body, 'box', BOX_H)
    save(hi, 'box_hi', BOX_H)
    print(f'  kit/box 宽 / 高：{block.shape[1] / block.shape[0]:.4f}')
    a = unkey(RAW3 / 'train.png')
    bs = rows(boxes(a[..., 3], 4000))
    if len(bs) != 2:
        raise SystemExit(f'train.png（v3）里要车头和车厢，认出来 {len(bs)} 个')
    loco, wagon = (crop(a, b) for b in bs)
    save(loco, 'loco', LOCO_H)
    print(f'  kit/loco 宽 / 高：{loco.shape[1] / loco.shape[0]:.4f}')
    body = np.zeros_like(wagon)
    rgb = wagon[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    # 车厢的白身子染色（上半截的斗里斗外都算；下半截只算很亮的，轮毂是浅灰的不算）；轮子、挂钩留在不染色的那张
    rowk = (np.arange(wagon.shape[0]) / wagon.shape[0])[:, None]
    shell = ((mx - mn) < 0.12) & ((rowk < 0.5) | (mx > 0.8))
    body[..., 0] = body[..., 1] = body[..., 2] = np.clip(mx / 0.96, 0, 1)
    body[..., 3] = wagon[..., 3] * shell
    rest = wagon.copy()
    rest[..., 3] = wagon[..., 3] * ~shell
    save(body, 'wagon_body', WAGON3_H)
    save(rest, 'wagon_wheels', WAGON3_H)
    front = body.copy()
    front[: int(front.shape[0] * WAGON3_RIM)] = 0
    save(front, 'wagon_front', WAGON3_H)
    print(f'  kit/wagon_body 宽 / 高：{wagon.shape[1] / wagon.shape[0]:.4f}')
    a = unkey(RAW3 / 'bridge.png')
    bs = sorted(boxes(a[..., 3], 4000), key=lambda b: b[0])
    track = crop(a, bs[-1])
    save(track, 'rail', RAIL_H)
    print(f'  kit/rail 宽 / 高：{track.shape[1] / track.shape[0]:.4f}')
    a = unkey(RAW3 / 'bridge2.png')
    bs = boxes(a[..., 3], 4000)
    if len(bs) != 1:
        raise SystemExit(f'bridge2.png 里要一座桥，认出来 {len(bs)} 个')
    b = crop(a, bs[0])
    save(b, 'bridge', BRIDGE_H)
    print(f'  kit/bridge 宽 / 高：{b.shape[1] / b.shape[0]:.4f}')


# 简洁版素材显示多高（设计单位，按 3 倍存）；车厢图从上往下多少比例是斗口
STUD_H = 48
BOX_H = 96
LOCO_H = 120
WAGON3_H = 84
WAGON3_RIM = 0.34
RAIL_H = 40
BRIDGE_H = 300

# 车厢图从上往下多少比例是斗口（看图定的）
WAGON_RIM = 0.30
# 船显示多高（设计单位，按 3 倍存，留一点余量）；船图从上往下多少比例是靠近我们这一侧船帮的上沿（看图定的）
BOAT_H = 132
BOAT_RIM = 0.79

if __name__ == '__main__':
    which = sys.argv[1:] or ['walk', 'carry', 'v3']
    for k in which:
        {'walk': walk, 'carry': carry, 'train': train, 'boat': boat, 'moored': moored, 'props': props, 'v3': v3}[k]()
