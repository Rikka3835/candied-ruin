"""
石门摩擦音 v3 —— 按用户提供参考录音（3.86s / 48k / 中频为主）的频谱反推重建。
目标频段占比：20-120:0.3%  120-400:1.3%  400-1200:38.6%  1200-3000:40.6%  3000-8000:12.3%  8000+:6.9%
做法：四层噪声（中低/中高/砂砾/空气）+ 极轻低频垫，用最小二乘式迭代把各层增益校准到目标占比。
"""

import wave
import sys
import numpy as np

SR = 48000
TARGETS = [(20, 120, 0.3), (120, 400, 1.3), (400, 1200, 38.6),
           (1200, 3000, 40.6), (3000, 8000, 12.3), (8000, 16000, 6.9)]


def bandpass(x, lo, hi, order=2.0):
    n = len(x)
    spec = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    lo_m = 1.0 - np.exp(-((f / max(lo, 1.0)) ** (2 * order)))
    hi_m = 1.0 / (1.0 + (f / hi) ** (2 * order))
    return np.fft.irfft(spec * lo_m * hi_m, n=n)


def jitter(n, rate_hz, depth, seed):
    rng = np.random.default_rng(seed)
    k = max(12, int(n / SR * rate_hz * 5))
    pts = rng.random(k)
    pts = np.convolve(pts, np.ones(5) / 5, mode="same")
    base = np.interp(np.linspace(0, k - 1, n), np.arange(k), pts)
    base = (base - base.min()) / (np.ptp(base) + 1e-9)
    return (1 - depth) + depth * base


def swell(n, points, seed):
    """几个缓慢起伏，营造“磨一下、停一下、再磨”的呼吸。"""
    rng = np.random.default_rng(seed)
    k = max(24, int(points * 6))
    env = rng.random(k) ** 1.4
    env = np.convolve(env, np.ones(7) / 7, mode="same")
    e = np.interp(np.linspace(0, k - 1, n), np.arange(k), env)
    e = (e - e.min()) / (np.ptp(e) + 1e-9)
    return 0.35 + 0.65 * e


def fade(n, in_s=0.08, out_s=0.7, curve=1.5):
    e = np.ones(n)
    a = int(in_s * SR)
    r = int(out_s * SR)
    e[:a] = np.linspace(0, 1, a) ** 0.8
    e[-r:] = np.linspace(1, 0, r) ** curve
    return e


def bands_share(x):
    spec = np.abs(np.fft.rfft(x)) ** 2
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    out = []
    for lo, hi, _ in TARGETS:
        m = (f >= lo) & (f < hi)
        out.append(spec[m].sum())
    tot = sum(out) + 1e-12
    return np.array(out) / tot * 100


def build(dur=3.86, seed=5):
    n = int(dur * SR)
    rng = np.random.default_rng(seed)

    def noise():
        return rng.normal(0, 1, n)

    layers = {}
    # 中低摩擦（主体）
    a = bandpass(noise(), 400, 1200)
    layers["mid1"] = a / np.abs(a).max() * jitter(n, 4.0, 0.55, seed + 1) * swell(n, 5, seed + 2)
    # 中高摩擦（主体）
    b = bandpass(noise(), 1150, 2950)
    layers["mid2"] = b / np.abs(b).max() * jitter(n, 5.5, 0.6, seed + 3) * swell(n, 6, seed + 4)
    # 砂砾
    c = bandpass(noise(), 2950, 7800)
    layers["grit"] = c / np.abs(c).max() * jitter(n, 7.0, 0.7, seed + 5)
    # 空气感（极轻）
    d = bandpass(noise(), 7500, 15500)
    layers["air"] = d / np.abs(d).max() * jitter(n, 9.0, 0.7, seed + 6)
    # 低频垫（只占零点几）
    e = bandpass(noise(), 28, 118)
    layers["sub"] = e / np.abs(e).max()

    gains = {"mid1": 1.0, "mid2": 1.0, "grit": 0.45, "air": 0.22, "sub": 0.02}
    env = fade(n, in_s=0.42, out_s=1.35, curve=2.6)
    # 两次“卡住”的短暂停顿：石头压到凸起，磨一下停一下
    for c, w in [(0.46, 0.06), (0.74, 0.05)]:
        i = int(n * c)
        ww = int(n * w)
        if i + 2 * ww < n:
            env[i:i + ww] *= np.linspace(1, 0.4, ww) ** 1.2
            env[i + ww:i + 2 * ww] *= np.linspace(0.4, 1, ww) ** 1.2
    # 迭代校准各层增益，让频段占比贴近参考
    for _ in range(9):
        mix = sum(gains[k] * layers[k] for k in layers) * env
        share = bands_share(mix)
        norm = share / np.array([t for _, _, t in TARGETS])
        # 400-1200 由 mid1 主导，1200-3000 由 mid2 主导，其余按比例
        gains["mid1"] *= (norm[2]) ** -0.35
        gains["mid2"] *= (norm[3]) ** -0.35
        gains["grit"] *= (norm[4]) ** -0.35
        gains["air"] *= (norm[5]) ** -0.35
        gains["sub"] *= (norm[0] / norm[2] + 1e-6) ** -0.2
        gains = {k: float(np.clip(v, 0.002, 4.0)) for k, v in gains.items()}

    mix = sum(gains[k] * layers[k] for k in layers) * env

    # 两下“门压到石子”的瞬态
    for t0, amp in [(0.16, 0.5), (2.42, 0.34)]:
        i = int(t0 * SR)
        dur = int(0.035 * SR)
        click = rng.normal(0, 1, dur) * np.exp(-np.linspace(0, 7, dur))
        click = bandpass(click, 900, 5200)
        mix[i:i + dur] += click / (np.abs(click).max() + 1e-9) * amp

    # 短混响（石头房间）
    ir_n = int(0.6 * SR)
    ir = rng.normal(0, 1, ir_n) * np.exp(-np.linspace(0, 7, ir_n))
    ir = bandpass(ir, 300, 6000)
    ir /= np.abs(ir).max()
    wet = np.fft.irfft(np.fft.rfft(mix, n=len(mix) + ir_n) * np.fft.rfft(ir, n=len(mix) + ir_n), n=len(mix) + ir_n)[:len(mix)]
    wet /= np.abs(wet).max() + 1e-9
    mix = mix + 0.10 * wet

    # 响度：对齐参考的 RMS -30dBFS，保留动态
    rms = np.sqrt(np.mean(mix ** 2)) + 1e-9
    mix *= 10 ** (-30 / 20) / rms
    pk = np.abs(mix).max()
    if pk > 0.25:
        mix *= 0.25 / pk
    return mix, gains


def write_wav(path, mono, width=0.6):
    n = len(mono)
    d = int(0.003 * SR)
    shifted = np.concatenate([np.zeros(d), mono[:-d]])
    left = mono * (1 - width * 0.5) + shifted * (width * 0.3)
    right = mono * (1 - width * 0.5) - shifted * (width * 0.3)
    st = np.clip(np.stack([left, right], axis=1), -1, 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((st * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    outdir = sys.argv[1].rstrip("\\/")
    sig, gains = build()
    p = outdir + "\\stone-grind-v3.wav"
    write_wav(p, sig)
    share = bands_share(sig)
    print("gains:", {k: round(v, 3) for k, v in gains.items()})
    for (lo, hi, t), v in zip(TARGETS, share):
        print(f"{lo:5d}-{hi:5d}Hz  目标 {t:5.1f}%  实测 {v:5.1f}%")
    print(f"dur={len(sig)/SR:.2f}s  peak={np.abs(sig).max():.3f}  rms={20*np.log10(np.sqrt((sig**2).mean())):.1f}dBFS")
