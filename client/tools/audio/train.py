#!/usr/bin/env python3
"""这款游戏自己的音效（合成的，不用任何现成素材）：火车鸣笛 whistle、火车开动 chug、磁铁 magnet。
写进 assets/resources/audio/，之后跑 ./run.sh meta 补 .meta。

用法：python3 client/tools/audio/train.py
依赖：numpy
"""
import wave
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parent.parent.parent / 'assets/resources/audio'
RATE = 22050


def save(name: str, a: np.ndarray, peak: float = 0.8) -> None:
    a = a / max(1e-9, np.max(np.abs(a))) * peak
    with wave.open(str(OUT / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((a * 32767).astype(np.int16).tobytes())
    print(f'✓ {name}.wav {len(a) / RATE:.2f}s')


def env(n: int, attack: float, release: float) -> np.ndarray:
    """起音、收尾各多少秒的包络"""
    e = np.ones(n)
    a = max(1, int(attack * RATE))
    r = max(1, int(release * RATE))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def toot(sec: float) -> np.ndarray:
    """一声汽笛：三个音叠成的和弦，带一点颤音和气声"""
    n = int(sec * RATE)
    t = np.arange(n) / RATE
    vib = 1 + 0.006 * np.sin(2 * np.pi * 6 * t)
    a = np.zeros(n)
    for f, g in ((622, 1.0), (740, 0.8), (932, 0.6)):
        ph = 2 * np.pi * np.cumsum(f * vib) / RATE
        a += g * (np.sin(ph) + 0.35 * np.sin(2 * ph) + 0.12 * np.sin(3 * ph))
    rng = np.random.default_rng(7)
    a += 0.25 * np.convolve(rng.standard_normal(n), np.ones(8) / 8, mode='same')
    return a * env(n, 0.03, 0.12)


def whistle() -> np.ndarray:
    gap = np.zeros(int(0.07 * RATE))
    return np.concatenate([toot(0.16), gap, toot(0.42)])


def chug() -> np.ndarray:
    """「哧—哧—哧哧哧」：一下下的气声，越来越快、越来越轻"""
    rng = np.random.default_rng(11)
    out = np.zeros(int(1.05 * RATE))
    at = 0.0
    step = 0.2
    vol = 1.0
    while at < 0.95:
        n = int(0.11 * RATE)
        noise = rng.standard_normal(n)
        # 低通一下：气声闷一点
        noise = np.convolve(noise, np.ones(14) / 14, mode='same')
        puff = noise * env(n, 0.006, 0.09) * vol
        thump = np.sin(2 * np.pi * 70 * np.arange(n) / RATE) * env(n, 0.004, 0.08) * vol * 0.5
        i = int(at * RATE)
        out[i : i + n] += (puff + thump)[: len(out) - i]
        at += step
        step = max(0.085, step * 0.84)
        vol *= 0.9
    return out


def magnet() -> np.ndarray:
    """磁铁：一声往上扬的「嗡——」加一串细碎的叮"""
    n = int(0.6 * RATE)
    t = np.arange(n) / RATE
    f = 180 + 520 * (t / 0.6) ** 2
    ph = 2 * np.pi * np.cumsum(f) / RATE
    a = (np.sin(ph) + 0.4 * np.sin(2 * ph)) * env(n, 0.05, 0.2)
    for k, at in enumerate(np.linspace(0.12, 0.5, 6)):
        m = int(0.09 * RATE)
        tone = np.sin(2 * np.pi * (1320 + 180 * k) * np.arange(m) / RATE) * np.exp(-np.arange(m) / (0.02 * RATE))
        i = int(at * RATE)
        a[i : i + m] += 0.5 * tone[: n - i]
    return a


save('whistle', whistle(), 0.7)
save('chug', chug(), 0.6)
save('magnet', magnet(), 0.6)
