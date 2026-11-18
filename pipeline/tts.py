#!/usr/bin/env python3
"""口播语音合成:微软 Edge 在线神经语音(AI 合成,不是真人录音)。

用法:python3 pipeline/tts.py <输出目录> [vo_lines.json]
每句输出 <id>.mp3 和 <id>.json(词边界时间,用于字幕逐句对齐)。
环境变量:PROMO_VOICE(默认 zh-CN-YunxiNeural)、PROMO_VOICE_RATE(默认 +8%)、PROMO_VOICE_ONLY(只合成指定 id,逗号分隔)。
"""
import asyncio
import json
import os
import sys

import edge_tts

VOICE = os.environ.get("PROMO_VOICE", "zh-CN-YunxiNeural")
RATE = os.environ.get("PROMO_VOICE_RATE", "+8%")
out_dir = sys.argv[1]
lines_file = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "vo_lines.json")
os.makedirs(out_dir, exist_ok=True)
with open(lines_file, encoding="utf-8") as fh:
    lines = json.load(fh)


async def synth(item):
    kwargs = dict(voice=VOICE, rate=RATE)
    try:
        com = edge_tts.Communicate(item["say"], boundary="WordBoundary", **kwargs)
    except TypeError:  # 旧版本没有 boundary 参数,默认就给词边界
        com = edge_tts.Communicate(item["say"], **kwargs)
    words = []
    path = os.path.join(out_dir, item["id"] + ".mp3")
    with open(path, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"t": chunk["offset"] / 1e7, "d": chunk["duration"] / 1e7, "w": chunk["text"]})
    with open(os.path.join(out_dir, item["id"] + ".json"), "w", encoding="utf-8") as f:
        json.dump({"id": item["id"], "voice": VOICE, "rate": RATE, "say": item["say"], "words": words}, f, ensure_ascii=False)
    return os.path.getsize(path), len(words)


async def main():
    only = set(os.environ.get("PROMO_VOICE_ONLY", "").split(",")) - {""}
    for item in lines:
        if only and item["id"] not in only:
            continue
        for attempt in range(4):
            try:
                size, count = await synth(item)
                if size < 2000:
                    raise RuntimeError("empty audio")
                print(item["id"], size, "bytes", count, "words", flush=True)
                break
            except Exception as error:  # 网络抖动时重试
                print(item["id"], "retry", attempt, repr(error)[:160], flush=True)
                if attempt == 3:
                    raise
                await asyncio.sleep(2 + attempt * 2)


asyncio.run(main())
