#!/usr/bin/env bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/scripts/stop-dev.sh"
printf '\n可以关闭此窗口。\n'
read -r _
