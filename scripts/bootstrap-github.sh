#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage: bash scripts/bootstrap-github.sh' \
    '' \
    'Configure the GitHub repository variables required by CI/CD.' \
    '' \
    'Options:' \
    '  -h, --help  Show this help.'
}

while (($# > 0)); do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/backend/.env"
ERRORS=()

record_error() {
  ERRORS+=("$1")
  printf 'ERROR: %s\n' "$1" >&2
}

read_env_value() {
  local key="$1"
  local line value first last

  [[ -f "$ENV_FILE" ]] || return 1

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*# ]] && continue

    if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=(.*)$ ]]; then
      value="${BASH_REMATCH[2]}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"

      if ((${#value} >= 2)); then
        first="${value:0:1}"
        last="${value: -1}"
        if [[ "$first" == '"' && "$last" == '"' ]] || [[ "$first" == "'" && "$last" == "'" ]]; then
          value="${value:1:${#value}-2}"
        fi
      fi

      printf '%s' "$value"
      return 0
    fi
  done <"$ENV_FILE"

  return 1
}

get_config_value() {
  local variable_name="$1"
  local prompt="$2"
  local value="${!variable_name:-}"

  if [[ -z "$value" ]]; then
    value="$(read_env_value "$variable_name" || true)"
  fi

  if [[ -z "$value" && -t 0 ]]; then
    read -r -p "$prompt" value
  fi

  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

if ! command -v gh >/dev/null 2>&1; then
  printf 'Required command not found: gh\n' >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  printf 'Run `gh auth login` first.\n' >&2
  exit 1
fi

cd "$ROOT_DIR"

DATABASE_SECRET_ARN_VALUE=''
if ! DATABASE_SECRET_ARN_VALUE="$(get_config_value DATABASE_SECRET_ARN 'DATABASE_SECRET_ARN: ')"; then
  record_error 'DATABASE_SECRET_ARN could not be obtained. Set it in backend/.env and re-run.'
fi

GEMINI_SECRET_ARN_VALUE=''
if ! GEMINI_SECRET_ARN_VALUE="$(get_config_value GEMINI_SECRET_ARN 'GEMINI_SECRET_ARN: ')"; then
  record_error 'GEMINI_SECRET_ARN could not be obtained. Set it in backend/.env and re-run.'
fi

if [[ -n "$DATABASE_SECRET_ARN_VALUE" ]]; then
  if gh variable set DATABASE_SECRET_ARN --body "$DATABASE_SECRET_ARN_VALUE"; then
    printf 'Set DATABASE_SECRET_ARN.\n'
  else
    record_error 'Could not set DATABASE_SECRET_ARN.'
  fi
fi

if [[ -n "$GEMINI_SECRET_ARN_VALUE" ]]; then
  if gh variable set GEMINI_SECRET_ARN --body "$GEMINI_SECRET_ARN_VALUE"; then
    printf 'Set GEMINI_SECRET_ARN.\n'
  else
    record_error 'Could not set GEMINI_SECRET_ARN.'
  fi
fi

printf '\nGitHub Variables:\n'
if ! gh variable list; then
  record_error 'Could not verify GitHub Variables.'
fi

printf '\nGitHub Secrets:\n'
if ! gh secret list; then
  record_error 'Could not verify GitHub Secrets.'
fi

if ((${#ERRORS[@]} > 0)); then
  printf '\nGitHub bootstrap completed with errors:\n' >&2
  for error in "${ERRORS[@]}"; do
    printf '  - %s\n' "$error" >&2
  done
  exit 1
fi

printf '\nGitHub bootstrap complete.\n'
printf 'DATABASE_SECRET_ARN and GEMINI_SECRET_ARN are configured as repository Variables.\n'
