#!/usr/bin/env python3
"""Decode QQTang QQF\\x1aDIMG files (versions 0 and 1) to RGBA PNG.

Version 0 stores a 16-bit RGB565 plane followed by one alpha byte per pixel.
Version 1 stores straight ARGB bytes.
"""
from __future__ import annotations

import argparse
import struct
from pathlib import Path

from PIL import Image


def _u32(d: bytes, at: int) -> int:
    return struct.unpack_from("<I", d, at)[0]


def _i32(d: bytes, at: int) -> int:
    return struct.unpack_from("<i", d, at)[0]


def decode(data: bytes) -> list[Image.Image]:
    if data[:8] != b"QQF\x1aDIMG":
        raise ValueError("not a QQF DIMG file")
    version = struct.unpack_from("<h", data, 8)[0]
    nframes = _u32(data, 16)
    ndirs = _u32(data, 20)
    if nframes <= 0 or ndirs <= 0:
        return []
    pos = 40
    frames: list[Image.Image] = []
    for _ in range(nframes):
        pos += 4
        _fx, _fy = _i32(data, pos), _i32(data, pos + 4)
        pos += 8
        pos += 4
        w, h = _i32(data, pos), _i32(data, pos + 4)
        pos += 8
        pos += 4
        if w <= 0 or h <= 0:
            break
        if version == 0:
            need = w * h * 3
            raw = data[pos:pos + need]
            pos += need
            if len(raw) < need:
                break
            plane = raw[: w * h * 2]
            alpha = raw[w * h * 2:]
            im = Image.new("RGBA", (w, h))
            px = im.load()
            for idx in range(w * h):
                v = plane[2 * idx] | (plane[2 * idx + 1] << 8)
                r = ((v >> 11) & 31) * 255 // 31
                g = ((v >> 5) & 63) * 255 // 63
                b = (v & 31) * 255 // 31
                a = min(255, alpha[idx] * 255 // 32) if idx < len(alpha) else 0
                px[idx % w, idx // w] = (r, g, b, a)
            frames.append(im)
        elif version == 1:
            need = w * h * 4
            raw = data[pos:pos + need]
            pos += need
            if len(raw) < need:
                break
            frames.append(Image.frombytes("RGBA", (w, h), raw).transpose(Image.FLIP_TOP_BOTTOM))
        else:
            raise ValueError(f"unsupported DIMG version {version}")
    return frames


def decode_file(path: Path, out_dir: Path, scale: int = 1) -> int:
    frames = decode(path.read_bytes())
    out_dir.mkdir(parents=True, exist_ok=True)
    for i, im in enumerate(frames):
        if scale != 1:
            im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        im.save(out_dir / f"{path.stem}_f{i}.png")
    return len(frames)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("output", type=Path)
    ap.add_argument("--scale", type=int, default=1)
    args = ap.parse_args()
    count = decode_file(args.input, args.output, args.scale)
    print(f"{args.input.name}: {count} frame(s)")


if __name__ == "__main__":
    main()
