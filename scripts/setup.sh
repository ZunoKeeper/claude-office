#!/usr/bin/env bash
# claude-office 초기 셋업 (Linux/macOS).
# Volta 확보 → Node 22 pin → 공용 셋업(scripts/setup.mjs) 실행.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl이 필요합니다. 패키지 매니저로 설치 후 다시 실행하세요." >&2
  exit 1
fi

if ! command -v volta >/dev/null 2>&1; then
  echo "[setup] Volta가 없어 설치합니다 (https://get.volta.sh)..."
  curl -fsSL https://get.volta.sh | bash
  export VOLTA_HOME="${VOLTA_HOME:-$HOME/.volta}"
  export PATH="$VOLTA_HOME/bin:$PATH"
fi

if ! command -v volta >/dev/null 2>&1; then
  echo "ERROR: Volta 설치에 실패했습니다. https://docs.volta.sh/guide/getting-started 참고 후 다시 실행하세요." >&2
  exit 1
fi

if ! grep -q '"volta"' package.json; then
  echo "[setup] Node 22 LTS를 프로젝트에 pin합니다..."
  volta pin node@22
fi

exec node scripts/setup.mjs "$@"
