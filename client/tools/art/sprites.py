#!/usr/bin/env python3
"""把 Codex 画的素材图（品红底，一张图里几个东西）切开、去底、缩到规格，写进 assets/resources/ui/kit/。

来源在 art/raw/sprites/（出图需求见 art/briefs/game_sprites.md）：
  walk.png   小人空手走路：4 列 × 3 行（正面、侧面朝右、背面各 4 帧）
  carry.png  小人双手举过头走路（举着豆）：同样 4 列 × 3 行
             帽子和衣服是白的，局内按小队的颜色染色，所以每帧切成两张：
             kit/wk_<姿势>_<帧>b（白衣帽，染色）和 kit/wk_<姿势>_<帧>t（脸、手、鞋，不染色）；
             姿势 f 正面（往下走）/ s 侧面（朝右）/ b 背面（往上走），举着豆的前面加 c（cf、cs、cb）
  train.png  车头、空车厢
  boat.png   睡莲、芦苇、涟漪圈（2×2 排；里面那条横着的船不用了）
  boat_open.png  小船（上场位）：船头朝上的空木船
  boat_canopy.png  同一条船搭着白篷子、旁边一面白旗：只取篷布和旗（局内按小队的颜色染色）
  props.png  小桥（已不用，跳过）、草丛两种、小花、灌木、小石子（3×2 排）

去底：背景是纯品红，按「有多品红」算透明度再把颜色还原（不是硬阈值，边缘不出锯齿和粉边，docs/03 第 5 节）。
用法：python3 client/tools/art/sprites.py [walk carry train boat canopy boat_open props]，然后 ./run.sh art-compress、./run.sh meta
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
    cloth = (sat < 0.2) & (mx > 0.5)
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
    sheet12('walk.png', ('f', 's', 'b'))


def carry() -> None:
    sheet12('carry.png', ('cf', 'cs', 'cb'))


def boat() -> None:
    """boat.png 里只用睡莲、芦苇、涟漪圈；船换成 boat_canopy.png 的篷船"""
    a = unkey(RAW / 'boat.png')
    bs = rows(boxes(a[..., 3], 1500))
    names = [('deco_lily', 30), ('deco_reed', 40), ('ripple', 36)]
    if len(bs) != len(names) + 1:
        raise SystemExit(f'boat.png 里要 {len(names) + 1} 个东西，认出来 {len(bs)} 个')
    # 最大的那个是旧的船，不要
    bs.sort(key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))
    for b, (name, h) in zip(rows(bs[1:]), names):
        save(crop(a, b), name, h)


def canopy() -> None:
    """boat_canopy.png：一条搭着白篷子的船和一面白旗。只要篷布和旗：篷布、旗面是白的，局内按小队的颜色染色。
    kit/boat_roof（篷布，叠在 kit/boat 上面，两张图是同一条船、同一个位置）；kit/flag_pole（旗杆）+ kit/flag（旗面）"""
    a = unkey(RAW / 'boat_canopy.png')
    bs = boxes(a[..., 3], 1500)
    if len(bs) != 2:
        raise SystemExit(f'boat_canopy.png 里要一条船和一面旗，认出来 {len(bs)} 个')
    bs.sort(key=lambda b: -(b[2] - b[0]) * (b[3] - b[1]))
    save(split_cloth(crop(a, bs[0]))[0], 'boat_roof', BOAT_H)
    cloth, pole = split_cloth(crop(a, bs[1]))
    save(cloth, 'flag', FLAG_H)
    save(pole, 'flag_pole', FLAG_H)


def boat_open() -> None:
    """boat_open.png：同一条船不带篷子的样子（Codex 照 boat_canopy.png 重画的，位置大小对得上）。存成 kit/boat：
    空着的上场位就是它；有小队时上面叠 kit/boat_roof"""
    a = unkey(RAW / 'boat_open.png')
    bs = boxes(a[..., 3], 4000)
    if len(bs) != 1:
        raise SystemExit(f'boat_open.png 里要一条船，认出来 {len(bs)} 个')
    save(crop(a, bs[0]), 'boat', BOAT_H)
    print(f'  kit/boat 的宽高比（宽 / 高）：{(bs[0][2] - bs[0][0]) / (bs[0][3] - bs[0][1]):.4f}')


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


# 车厢图从上往下多少比例是斗口（看图定的）
WAGON_RIM = 0.30
# 篷船、旗子显示多高（设计单位）
BOAT_H = 156
FLAG_H = 56

if __name__ == '__main__':
    which = sys.argv[1:] or ['walk', 'carry', 'train', 'boat', 'canopy', 'boat_open', 'props']
    for k in which:
        {'walk': walk, 'carry': carry, 'train': train, 'boat': boat, 'canopy': canopy, 'boat_open': boat_open, 'props': props}[k]()
