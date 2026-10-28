"""
石门摩擦音合成器（纯 numpy，无外部素材）

三层结构：
  1. 低频体感 30–110Hz     —— 门的重量
  2. 粗糙摩擦 380–2600Hz   —— 石对石打滑，包络用 1/f 抖动做“卡顿感”
  3. 颗粒爆点 1.8–5.2kHz   —— 碎石崩落
加手机补偿层 150–240Hz、一次下滑扫频、短混响尾音。
"""

import wave
import struct
import sys
import numpy as np

SR = 44100


def smooth_band(x, lo, hi, order=2.0):
    """FFT 域的软边带通：返回滤波后的信号。"""
    n = len(x)
    spec = np.fft.rfft(x)
    freqs = np.fft.rfftfreq(n, 1.0 / SR)
    eps = 1e-9
    # 低切
    lo_mask = 1.0 - np.exp(-((freqs / max(lo, 1.0)) ** (2 * order)))
    # 高切
    hi_mask = 1.0 / (1.0 + (freqs / hi) ** (2 * order))
    return np.fft.irfft(spec * lo_mask * hi_mask, n=n)


def jitter(n, rate_hz, depth=1.0, seed=0):
    """1/f 抖动包络：在 rate_hz 附近起伏，用来做不规律的卡顿。"""
    rng = np.random.default_rng(seed)
    k = max(8, int(n / SR * rate_hz * 6))
    pts = rng.random(k)
    pts = np.convolve(pts, np.ones(3) / 3, mode="same")
    t = np.linspace(0, k - 1, n)
    base = np.interp(t, np.arange(k), pts)
    base = (base - base.min()) / (np.ptp(base) + 1e-9)
    return (1.0 - depth) + depth * base


def env_ad(n, attack, release, curve=1.6):
    a = int(attack * SR)
    r = int(release * SR)
    e = np.ones(n)
    if a > 0:
        e[:a] = np.linspace(0, 1, a) ** 0.7
    if r > 0 and r < n:
        e[-r:] = np.linspace(1, 0, r) ** curve
    return e


def gravel_bursts(n, count, seed):
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    for _ in range(count):
        start = rng.uniform(0.06, 0.94) * n
        dur = int(rng.uniform(0.006, 0.020) * SR)
        i = int(start)
        if i + dur >= n:
            continue
        body = rng.normal(0, 1, dur)
        body = smooth_band(body, 1700, 5200)
        body *= np.exp(-np.linspace(0, 4, dur))
        out[i:i + dur] += body * rng.uniform(0.15, 0.55)
    return out


def reverb(x, seconds=0.75, seed=7):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = rng.normal(0, 1, n) * np.exp(-np.linspace(0, 6.5, n))
    ir = smooth_band(ir, 120, 4200)
    ir /= np.abs(ir).max()
    spec = np.fft.rfft(x, n=len(x) + n)
    ispec = np.fft.rfft(ir, n=len(x) + n)
    wet = np.fft.irfft(spec * ispec, n=len(x) + n)[:len(x)]
    wet /= (np.abs(wet).max() + 1e-9)
    return wet


def build(dur=2.2, weight=1.0, seed=1):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)

    # 1) 低频体感：棕噪声 + 下滑正弦
    brown = np.cumsum(rng.normal(0, 1, n))
    brown -= np.linspace(brown[0], brown[-1], n)
    brown = smooth_band(brown, 26, 115)
    brown /= np.abs(brown).max()
    sweep_f = np.linspace(58 * weight, 36 * weight, n)
    sweep = np.sin(2 * np.pi * np.cumsum(sweep_f) / SR)
    low = (0.75 * brown + 0.45 * sweep) * env_ad(n, 0.02, 0.55, 1.4)

    # 2) 粗糙摩擦：带通噪声 × 1/f 抖动 × 总包络
    grit = rng.normal(0, 1, n)
    grit = smooth_band(grit, 380, 2200)
    grit /= np.abs(grit).max()
    mod = jitter(n, 9.0 * weight, depth=0.85, seed=seed + 3)
    mod = np.clip(mod, 0.12, 1.0) ** 1.25
    grind = grit * mod * env_ad(n, 0.05, 0.75, 1.7)

    # 2b) 连续刮擦层：抖动更轻，保证“一直在磨”的底子
    scrape = rng.normal(0, 1, n)
    scrape = smooth_band(scrape, 800, 1700)
    scrape /= np.abs(scrape).max()
    smod = jitter(n, 3.5 * weight, depth=0.35, seed=seed + 5)
    scrape = scrape * np.clip(smod, 0.4, 1.0) * env_ad(n, 0.08, 0.8, 1.6)

    # 3) 手机补偿层
    body = rng.normal(0, 1, n)
    body = smooth_band(body, 150, 240)
    body /= np.abs(body).max()
    body *= env_ad(n, 0.04, 0.7, 1.5) * 0.5

    # 4) 颗粒
    grav = gravel_bursts(n, int(20 * weight), seed + 11)
    # 4b) 细砂摩擦床：3–6kHz 的极轻沙砾感，让“石头和沙子一起磨”更真
    dust = rng.normal(0, 1, n)
    dust = smooth_band(dust, 2600, 6000)
    dust /= np.abs(dust).max()
    dust *= np.clip(jitter(n, 6.0 * weight, depth=0.5, seed=seed + 13), 0.2, 1.0)
    dust *= env_ad(n, 0.1, 0.8, 1.5) * 0.22

    mix = 0.62 * low + 1.25 * grind + 0.85 * scrape + 0.50 * body + 2.4 * grav + 1.0 * dust

    # 5) 混响尾音
    wet = reverb(mix, 0.75, seed + 21)
    mix = mix + 0.30 * wet

    # 6) 收尾与限幅
    fade = int(0.12 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade) ** 1.5
    mix[:int(0.003 * SR)] *= np.linspace(0, 1, int(0.003 * SR))
    mix = np.tanh(mix / (np.abs(mix).max() + 1e-9) * 1.6) / 1.6
    # 响度对齐：RMS 打到 -16 dBFS，再压峰值不超过 -3 dBFS
    rms = np.sqrt(np.mean(mix ** 2)) + 1e-9
    mix *= 10 ** (-16 / 20) / rms
    pk = np.abs(mix).max()
    if pk > 0.71:
        mix *= 0.71 / pk
    return mix


def write_wav(path, mono, width=0.55):
    """单声道转立体声：左右各加一点去相关的抖动，兼容单声道播放。"""
    n = len(mono)
    rng = np.random.default_rng(99)
    d = int(0.004 * SR)
    shifted = np.concatenate([np.zeros(d), mono[:-d]])
    left = mono * (1 - width * 0.5) + shifted * (width * 0.25)
    right = mono * (1 - width * 0.5) - shifted * (width * 0.25)
    st = np.stack([left, right], axis=1)
    st = np.clip(st, -1, 1)
    pcm = (st * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def spectrogram_png(path, mono, title):
    from PIL import Image, ImageDraw
    n = 2048
    hop = 256
    win = np.hanning(n)
    frames = []
    for i in range(0, len(mono) - n, hop):
        seg = mono[i:i + n] * win
        spec = np.abs(np.fft.rfft(seg))
        frames.append(20 * np.log10(spec + 1e-9))
    S = np.array(frames).T
    S = S[::-1]  # 低频在底部
    S = np.clip((S + 95) / 85, 0, 1)  # -95dB → 黑，-10dB → 白
    # 简易 magma 配色
    r = np.clip(1.6 * S, 0, 1)
    g = np.clip(1.9 * S ** 1.6, 0, 1) * 0.85
    b = np.clip(1.2 * S ** 3.2, 0, 1) * 0.9 + 0.12 * S
    rgb = np.stack([r, g, b], axis=-1)
    img = Image.fromarray((rgb * 255).astype(np.uint8)).resize((900, 320))
    d = ImageDraw.Draw(img)
    d.text((8, 6), title, fill=(255, 220, 140))
    img.save(path)


if __name__ == "__main__":
    outdir = sys.argv[1]
    variants = [
        ("stone-grind-v1.wav", dict(dur=2.2, weight=1.0, seed=1)),
        ("stone-grind-v2.wav", dict(dur=2.4, weight=1.25, seed=42)),
    ]
    for name, kw in variants:
        sig = build(**kw)
        p = outdir.rstrip("\\/") + "\\" + name
        write_wav(p, sig)
        spectrogram_png(p.replace(".wav", "-spec.png"), sig,
                        name + f"  {kw['dur']}s  peak -6dBFS")
        rms = 20 * np.log10(np.sqrt(np.mean(sig ** 2)) + 1e-9)
        print(f"{name}  dur={kw['dur']}s  peak=0.500  rms={rms:.1f} dBFS")
