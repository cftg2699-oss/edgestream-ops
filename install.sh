#!/usr/bin/env bash
# EdgeStream OPS — One-Command Installer
# curl -sL https://install.edgestream.sh | bash

set -e

REPO_URL="${EDGESTREAM_REPO:-https://github.com/edgestream/edgestream-ops}"
INSTALL_DIR="${EDGESTREAM_DIR:-$HOME/.edgestream}"
CYAN='\033[0;36m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

banner() {
  echo ""
  echo -e "${CYAN}  ╔═══════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}  ║   ⚡  EdgeStream OPS  —  Installer v2.1      ║${NC}"
  echo -e "${CYAN}  ╚═══════════════════════════════════════════════╝${NC}"
  echo ""
}

check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo -e "${RED}  ✗ $1 is not installed.${NC}"
    echo -e "    Please install $1 and re-run this script."
    echo -e "    → https://nodejs.org/en/download"
    exit 1
  fi
  local ver
  ver=$("$1" --version 2>&1)
  echo -e "${GREEN}  ✓ $1 found:${NC} $ver"
}

check_node_version() {
  local ver
  ver=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
  if [ "$ver" -lt 18 ]; then
    echo -e "${RED}  ✗ Node.js >= 18 required (found v$ver)${NC}"
    echo -e "    → https://nodejs.org/en/download"
    exit 1
  fi
}

banner

echo -e "${YELLOW}  Checking requirements...${NC}"
check_cmd node
check_cmd npm
check_node_version
echo ""

# Clone or pull
if [ -d "$INSTALL_DIR/.git" ]; then
  echo -e "${YELLOW}  Updating existing install at $INSTALL_DIR ...${NC}"
  git -C "$INSTALL_DIR" pull --quiet
else
  echo -e "${YELLOW}  Installing EdgeStream to $INSTALL_DIR ...${NC}"
  if command -v git &>/dev/null; then
    git clone --quiet "$REPO_URL" "$INSTALL_DIR"
  else
    echo -e "${RED}  ✗ git is not installed. Cannot clone repository.${NC}"
    echo -e "    Please install git or download the repo manually."
    exit 1
  fi
fi

echo ""
echo -e "${YELLOW}  Installing dependencies...${NC}"
cd "$INSTALL_DIR"
npm install --silent

echo ""
echo -e "${GREEN}  ✓ EdgeStream installed successfully!${NC}"
echo ""
echo -e "  ${CYAN}Quick start:${NC}"
echo -e "    cd $INSTALL_DIR"
echo -e "    npm run demo"
echo ""
echo -e "  ${CYAN}All commands:${NC}"
echo -e "    npm run demo:trading    # Trading events at 5000 ev/s"
echo -e "    npm run demo:soc        # Security events"
echo -e "    npm run demo:telecom    # Telecom network events"
echo -e "    npm run benchmark       # Performance benchmark"
echo -e "    npm run record          # Record as .asciicast"
echo ""
echo -e "  ${CYAN}Shadow Mode (connect to your own stream):${NC}"
echo -e "    npm run shadow -- --url=ws://your-host:port"
echo ""
