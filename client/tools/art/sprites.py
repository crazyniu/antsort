#!/usr/bin/env python3
"""把 Codex 画的素材图（品红底，一张图里几个东西）切开、去底、缩到规格，写进 assets/resources/ui/kit/。

来源在 art/raw/sprites/（出图需求见 art/briefs/game_sprites.md）：
  worker.png  小人 4 个姿势排成一行：走路两帧、举着手走两帧。帽子和衣服是白的，局内按小队的颜色染色，
              所以每帧切成两张：*_body（白衣服白帽子，灰度）和 *_top（脸、手、鞋、描边，不染色）
  train.png   车头、空车厢
  props.png   小桥、草丛两种、小花、灌木、小石子（3×2 排）

去底：背景是纯品红，按「有多品红」算透明度再把颜色还原（不是硬阈值，边缘不出锯齿和粉边，docs/03 第 5 节）。
用法：python3 client/tools/art/sprites.py，然后 ./run.sh art-compress、./run.sh meta
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


def worker() -> None:
    a = unkey(RAW / 'worker.png')
    bs = rows(boxes(a[..., 3]))
    if len(bs) != 4:
        raise SystemExit(f'worker.png 里要 4 个小人，认出来 {len(bs)} 个')
    # 四帧放进一样大的画布：底边对齐、左右居中
    W = max(b[2] - b[0] for b in bs)
    H = max(b[3] - b[1] for b in bs)
    for i, b in enumerate(bs):
        c = crop(a, b)
        canvas = np.zeros((H, W, 4))
        x = (W - c.shape[1]) // 2
        canvas[H - c.shape[0] :, x : x + c.shape[1]] = c
        rgb, alpha = canvas[..., :3], canvas[..., 3]
        mx, mn = rgb.max(-1), rgb.min(-1)
        sat = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)
        # 白衣服白帽子：不带颜色、够亮。其余（脸、手、鞋、描边）不染色
        cloth = (sat < 0.2) & (mx > 0.5)
        body = np.zeros_like(canvas)
        v = np.clip(mx / 0.97, 0, 1)
        body[..., 0] = body[..., 1] = body[..., 2] = v
        body[..., 3] = alpha * cloth
        top = canvas.copy()
        top[..., 3] = alpha * ~cloth
        save(body, f'worker_body_{i}', 48)
        save(top, f'worker_top_{i}', 48)


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
    names = [('bridge', 150), ('deco_tuft1', 26), ('deco_tuft2', 26), ('deco_flower', 34), ('deco_bush', 46), ('deco_pebble', 16)]
    if len(bs) != len(names):
        raise SystemExit(f'props.png 里要 {len(names)} 个东西，认出来 {len(bs)} 个')
    for b, (name, h) in zip(bs, names):
        save(crop(a, b), name, h)


# 车厢图从上往下多少比例是斗口（看图定的）
WAGON_RIM = 0.30

if __name__ == '__main__':
    which = sys.argv[1:] or ['worker', 'train', 'props']
    for k in which:
        {'worker': worker, 'train': train, 'props': props}[k]()
