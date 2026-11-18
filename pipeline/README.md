# 宣传片制作流水线

第五版(节奏重调)的说明见根目录 [`README.md`](../README.md);第四版的完整说明在 [`output/README_v4.md`](../output/README_v4.md)。

```bash
bash pipeline/setup.sh    # 环境:ffmpeg、字体、Playwright Chromium、edge-tts
node build.mjs all        # 录制 → 口播合成 → 时间表 → 混音 → 打包开场动画 → 渲染 → 封装 → 抽帧 → 内嵌到页面
npm run build             # 生成成片页面 dist/index.html
node pipeline/check_site.mjs   # 构建后自检:视频能否从文本分片还原并播放
```

| 脚本 | 作用 |
| --- | --- |
| `record.mjs A` / `record.mjs B` | 录制 R0、R2、R3、R1 / R6、R7、R8(两路并行) |
| `tts.py` | 口播合成(AI 神经网络语音,不是真人录音);分段见 `vo_lines.json` |
| `schedule.mjs` | 生成时间表与 `output/captions.srt` |
| `audio.mjs` | 合成音乐与音效、混入口播、响度归一 |
| `render.mjs` | 逐帧渲染合成页 `timeline/index.html`(`seek(t)`) |
| `embed.mjs` | 把成片和图片切成 base64 文本分片写入 `src/generated/` |
| `stage0_probe.mjs` | 真实界面清单探测,产出 `src/data/stage0.json` |
