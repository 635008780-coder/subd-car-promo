#!/usr/bin/env bash
# 环境准备(Debian / Ubuntu)。在项目根目录执行:bash pipeline/setup.sh
# 装好之后即可运行 node build.mjs all。
set -euo pipefail

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

echo "==> ffmpeg、字体(Inter 是网站字体栈首选;Noto Sans CJK SC 用于中文和包装大字)、pip"
$SUDO apt-get update -qq
$SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
  ffmpeg fontconfig fonts-noto-cjk fonts-noto-cjk-extra fonts-inter python3-pip
fc-cache -f

echo "==> Node 依赖与 Playwright Chromium"
npm install
npx playwright install --with-deps chromium

echo "==> 口播合成用的 edge-tts(微软 Edge 在线神经语音;用你自己的录音时不需要)"
python3 -m pip install --break-system-packages -q edge-tts || python3 -m pip install -q edge-tts

echo "==> 克隆产品仓库(用于源码交叉核对)"
FORM_SRC="${FORM_SRC:-/tmp/form-cc-studio}"
if [ ! -d "$FORM_SRC/.git" ]; then
  git clone --depth 1 https://github.com/635008780-coder/form-cc-studio "$FORM_SRC"
fi

echo "==> 检查"
ffmpeg -hide_banner -encoders 2>/dev/null | grep -E " libx264 | aac " || { echo "ffmpeg 缺少 libx264 或 aac"; exit 1; }
fc-match "sans-serif:lang=zh-cn"
fc-match "Inter"
npx playwright --version
python3 -c "import edge_tts; print('edge-tts ok')"
echo "环境就绪。"
