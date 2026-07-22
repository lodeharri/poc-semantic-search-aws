#!/usr/bin/env bash
set -euo pipefail

usage() {
  printf '%s\n' \
    'Usage: bash scripts/bootstrap-aws.sh [--confirm-update]' \
    '' \
    'Create or reconcile the AWS resources required by CI/CD.' \
    '' \
    'Options:' \
    '  --confirm-update  Update existing secret values.' \
    '  -h, --help        Show this help.'
}

CONFIRM_UPDATE=false
while (($# > 0)); do
  case "$1" in
    --confirm-update)
      CONFIRM_UPDATE=true
      ;;
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
BOOTSTRAP_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"
DATABASE_SECRET_NAME='poc-semantic-search/database-url'
GEMINI_SECRET_NAME='poc-semantic-search/gemini-api-key'
ROLE_NAME='github-actions-deploy-role'
OIDC_ISSUER='token.actions.githubusercontent.com'
OIDC_THUMBPRINT='6938fd4d98bab03faadb97b34396831e3780aea1'
ADMIN_POLICY_ARN='arn:aws:iam::aws:policy/AdministratorAccess'
ERRORS=()
DATABASE_SECRET_ARN=''
GEMINI_SECRET_ARN=''
OIDC_PROVIDER_ARN=''
ROLE_ARN=''
AWS_ERROR_FILE=''
SECRET_ARN_RESULT=''

record_error() {
  ERRORS+=("$1")
  printf 'ERROR: %s\n' "$1" >&2
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$command_name" >&2
    exit 1
  fi
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
  local hide_input="$3"
  local value="${!variable_name:-}"

  if [[ -z "$value" ]]; then
    value="$(read_env_value "$variable_name" || true)"
  fi

  if [[ -z "$value" && -t 0 ]]; then
    if [[ "$hide_input" == true ]]; then
      read -r -s -p "$prompt" value
      printf '\n' >&2
    else
      read -r -p "$prompt" value
    fi
  fi

  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

derive_github_repository() {
  local remote_url path repository=''

  if remote_url="$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null)"; then
    case "$remote_url" in
      git@github.com:*)
        path="${remote_url#git@github.com:}"
        ;;
      https://github.com/*)
        path="${remote_url#https://github.com/}"
        ;;
      *)
        path=''
        ;;
    esac

    path="${path%.git}"
    path="${path%/}"
    if [[ "$path" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
      repository="$path"
    fi
  fi

  if [[ -z "$repository" && "${GITHUB_REPOSITORY:-}" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
    repository="$GITHUB_REPOSITORY"
  fi

  if [[ -z "$repository" && -t 0 ]]; then
    read -r -p 'GitHub repository (OWNER/REPO): ' repository
  fi

  [[ "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || return 1
  printf '%s' "$repository"
}

secret_preview() {
  local value="$1"
  printf '%s' "${value:0:4}"
}

aws_error() {
  local message
  message="$(<"$AWS_ERROR_FILE")"
  printf '%s' "${message:-Unknown AWS CLI error}"
}

parse_json_field() {
  local json="$1"
  local filter="$2"
  local result

  if ! result="$(jq -r "$filter" <<<"$json")"; then
    return 1
  fi

  [[ -n "$result" && "$result" != null ]] || return 1
  printf '%s' "$result"
}

ensure_secret() {
  local secret_name="$1"
  local secret_value="$2"
  local label="$3"
  local response error_message arn

  : >"$AWS_ERROR_FILE"
  if response="$(aws secretsmanager describe-secret \
    --secret-id "$secret_name" \
    --region "$BOOTSTRAP_REGION" \
    --output json \
    --no-cli-pager 2>"$AWS_ERROR_FILE")"; then
    if ! arn="$(parse_json_field "$response" '.ARN // empty')"; then
      printf 'Could not parse the ARN for existing secret %s.\n' "$secret_name" >&2
      return 1
    fi

    printf '%s exists. Proposed value starts with "%s".\n' "$label" "$(secret_preview "$secret_value")"
    if [[ "$CONFIRM_UPDATE" == true ]]; then
      : >"$AWS_ERROR_FILE"
      if ! response="$(aws secretsmanager update-secret \
        --secret-id "$secret_name" \
        --secret-string "$secret_value" \
        --region "$BOOTSTRAP_REGION" \
        --output json \
        --no-cli-pager 2>"$AWS_ERROR_FILE")"; then
        printf 'Could not update %s: %s\n' "$secret_name" "$(aws_error)" >&2
        return 1
      fi
      if ! arn="$(parse_json_field "$response" '.ARN // empty')"; then
        printf 'Could not parse the updated ARN for %s.\n' "$secret_name" >&2
        return 1
      fi
      printf 'Updated %s.\n' "$label"
    else
      printf 'Existing value left unchanged. Re-run with --confirm-update to replace it.\n'
    fi

    SECRET_ARN_RESULT="$arn"
    return 0
  fi

  error_message="$(aws_error)"
  if [[ "$error_message" != *ResourceNotFoundException* ]]; then
    printf 'Could not inspect %s: %s\n' "$secret_name" "$error_message" >&2
    return 1
  fi

  : >"$AWS_ERROR_FILE"
  if ! response="$(aws secretsmanager create-secret \
    --name "$secret_name" \
    --secret-string "$secret_value" \
    --region "$BOOTSTRAP_REGION" \
    --output json \
    --no-cli-pager 2>"$AWS_ERROR_FILE")"; then
    printf 'Could not create %s: %s\n' "$secret_name" "$(aws_error)" >&2
    return 1
  fi

  if ! arn="$(parse_json_field "$response" '.ARN // empty')"; then
    printf 'Could not parse the created ARN for %s.\n' "$secret_name" >&2
    return 1
  fi

  SECRET_ARN_RESULT="$arn"
  printf 'Created %s.\n' "$label"
}

ensure_oidc_provider() {
  local response arn

  : >"$AWS_ERROR_FILE"
  if ! response="$(aws iam list-open-id-connect-providers \
    --output json \
    --no-cli-pager 2>"$AWS_ERROR_FILE")"; then
    printf 'Could not list IAM OIDC providers: %s\n' "$(aws_error)" >&2
    return 1
  fi

  if ! arn="$(jq -r --arg issuer "/$OIDC_ISSUER" \
    '.OpenIDConnectProviderList[]?.Arn | select(endswith($issuer))' <<<"$response")"; then
    printf 'Could not parse IAM OIDC providers.\n' >&2
    return 1
  fi

  if [[ -n "$arn" ]]; then
    OIDC_PROVIDER_ARN="$arn"
    printf 'GitHub Actions OIDC provider already exists.\n'
    return 0
  fi

  : >"$AWS_ERROR_FILE"
  if ! response="$(aws iam create-open-id-connect-provider \
    --url "https://$OIDC_ISSUER" \
    --client-id-list sts.amazonaws.com \
    --thumbprint-list "$OIDC_THUMBPRINT" \
    --output json \
    --no-cli-pager 2>"$AWS_ERROR_FILE")"; then
    printf 'Could not create the GitHub Actions OIDC provider: %s\n' "$(aws_error)" >&2
    return 1
  fi

  if ! arn="$(parse_json_field "$response" '.OpenIDConnectProviderArn // empty')"; then
    printf 'Could not parse the created OIDC provider ARN.\n' >&2
    return 1
  fi

  OIDC_PROVIDER_ARN="$arn"
  printf 'Created GitHub Actions OIDC provider.\n'
}

ensure_deploy_role() {
  local repository="$1"
  local subject="repo:${repository}:ref:refs/heads/main"
  local trust_policy response error_message arn
  local failed=false

  if [[ -z "$OIDC_PROVIDER_ARN" ]]; then
    printf 'Cannot configure %s without an OIDC provider ARN.\n' "$ROLE_NAME" >&2
    return 1
  fi

  if ! trust_policy="$(jq -n \
    --arg provider "$OIDC_PROVIDER_ARN" \
    --arg subject "$subject" \
    '{
      Version: "2012-10-17",
      Statement: [{
        Effect: "Allow",
        Principal: {Federated: $provider},
        Action: "sts:AssumeRoleWithWebIdentity",
        Condition: {
          StringEquals: {"token.actions.githubusercontent.com:aud": "sts.amazonaws.com"},
          StringLike: {"token.actions.githubusercontent.com:sub": $subject}
        }
      }]
    }')"; then
    printf 'Could not construct the IAM role trust policy.\n' >&2
    return 1
  fi

  : >"$AWS_ERROR_FILE"
  if response="$(aws iam get-role \
    --role-name "$ROLE_NAME" \
    --output json \
    --no-cli-pager 2>"$AWS_ERROR_FILE")"; then
    if ! arn="$(parse_json_field "$response" '.Role.Arn // empty')"; then
      printf 'Could not parse the existing role ARN.\n' >&2
      return 1
    fi
    ROLE_ARN="$arn"

    : >"$AWS_ERROR_FILE"
    if ! aws iam update-assume-role-policy \
      --role-name "$ROLE_NAME" \
      --policy-document "$trust_policy" \
      --no-cli-pager >/dev/null 2>"$AWS_ERROR_FILE"; then
      printf 'Could not update the role trust policy: %s\n' "$(aws_error)" >&2
      failed=true
    else
      printf 'Updated %s trust policy for %s.\n' "$ROLE_NAME" "$subject"
    fi
  else
    error_message="$(aws_error)"
    if [[ "$error_message" != *NoSuchEntity* ]]; then
      printf 'Could not inspect role %s: %s\n' "$ROLE_NAME" "$error_message" >&2
      return 1
    fi

    : >"$AWS_ERROR_FILE"
    if ! response="$(aws iam create-role \
      --role-name "$ROLE_NAME" \
      --description 'GitHub Actions deployment role for Poc Semantic Search' \
      --assume-role-policy-document "$trust_policy" \
      --output json \
      --no-cli-pager 2>"$AWS_ERROR_FILE")"; then
      printf 'Could not create role %s: %s\n' "$ROLE_NAME" "$(aws_error)" >&2
      return 1
    fi

    if ! arn="$(parse_json_field "$response" '.Role.Arn // empty')"; then
      printf 'Could not parse the created role ARN.\n' >&2
      return 1
    fi
    ROLE_ARN="$arn"
    printf 'Created %s for %s.\n' "$ROLE_NAME" "$subject"
  fi

  # PoC only: tighten this policy to least privilege before production use.
  : >"$AWS_ERROR_FILE"
  if ! aws iam attach-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-arn "$ADMIN_POLICY_ARN" \
    --no-cli-pager >/dev/null 2>"$AWS_ERROR_FILE"; then
    printf 'Could not attach AdministratorAccess: %s\n' "$(aws_error)" >&2
    failed=true
  else
    printf 'AdministratorAccess is attached to %s.\n' "$ROLE_NAME"
  fi

  [[ "$failed" == false ]]
}

upsert_env_value() {
  local key="$1"
  local value="$2"
  local temp_file line
  local found=false

  temp_file="$(mktemp)"
  if [[ -f "$ENV_FILE" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      if [[ "$line" =~ ^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*= ]]; then
        printf '%s=%s\n' "$key" "$value" >>"$temp_file"
        found=true
      else
        printf '%s\n' "$line" >>"$temp_file"
      fi
    done <"$ENV_FILE"
  fi

  if [[ "$found" == false ]]; then
    printf '%s=%s\n' "$key" "$value" >>"$temp_file"
  fi

  mv "$temp_file" "$ENV_FILE"
}

print_summary() {
  local database_arn="${DATABASE_SECRET_ARN:-<unavailable>}"
  local gemini_arn="${GEMINI_SECRET_ARN:-<unavailable>}"
  local role_arn="${ROLE_ARN:-<unavailable>}"
  local content_width=55
  local value border

  for value in "  $database_arn" "  $gemini_arn" "  $role_arn"; do
    if ((${#value} > content_width)); then
      content_width=${#value}
    fi
  done
  printf -v border '%*s' "$((content_width + 2))" ''
  border="${border// /─}"

  if ((${#ERRORS[@]} == 0)); then
    printf '\nAWS bootstrap complete.\n'
  else
    printf '\nAWS bootstrap completed with errors.\n'
  fi
  printf '┌%s┐\n' "$border"
  printf '│ %-*s │\n' "$content_width" 'Database URL Secret ARN'
  printf '│ %-*s │\n' "$content_width" "  $database_arn"
  printf '│ %-*s │\n' "$content_width" ''
  printf '│ %-*s │\n' "$content_width" 'Gemini API Key Secret ARN'
  printf '│ %-*s │\n' "$content_width" "  $gemini_arn"
  printf '│ %-*s │\n' "$content_width" ''
  printf '│ %-*s │\n' "$content_width" 'GitHub Actions OIDC Role ARN'
  printf '│ %-*s │\n' "$content_width" "  $role_arn"
  printf '└%s┘\n' "$border"
  printf '\nNext: run `pnpm bootstrap:github` (or `bash scripts/bootstrap-github.sh`) to configure GitHub Variables.\n'
}

require_command aws
require_command jq
require_command git

AWS_ERROR_FILE="$(mktemp)"
trap 'rm -f "$AWS_ERROR_FILE"' EXIT

: >"$AWS_ERROR_FILE"
if ! identity="$(aws sts get-caller-identity \
  --region "$BOOTSTRAP_REGION" \
  --output json \
  --no-cli-pager 2>"$AWS_ERROR_FILE")"; then
  printf 'AWS credentials not configured. Run `aws configure` first.\n' >&2
  exit 1
fi

if ! account_id="$(parse_json_field "$identity" '.Account // empty')"; then
  printf 'Could not determine the AWS account from the configured credentials.\n' >&2
  exit 1
fi
printf 'Bootstrapping AWS account %s in %s.\n' "$account_id" "$BOOTSTRAP_REGION"

DATABASE_URL_VALUE=''
if ! DATABASE_URL_VALUE="$(get_config_value DATABASE_URL 'DATABASE_URL: ' true)"; then
  record_error 'DATABASE_URL could not be obtained. Set it in backend/.env and re-run.'
fi

GEMINI_API_KEY_VALUE=''
if ! GEMINI_API_KEY_VALUE="$(get_config_value GEMINI_API_KEY 'GEMINI_API_KEY: ' true)"; then
  record_error 'GEMINI_API_KEY could not be obtained. Set it in backend/.env and re-run.'
fi

GITHUB_REPOSITORY_VALUE=''
if ! GITHUB_REPOSITORY_VALUE="$(derive_github_repository)"; then
  record_error 'GitHub repository could not be determined. Set GITHUB_REPOSITORY to OWNER/REPO and re-run.'
else
  printf 'GitHub repository: %s\n' "$GITHUB_REPOSITORY_VALUE"
fi

if [[ -n "$DATABASE_URL_VALUE" ]]; then
  if ensure_secret "$DATABASE_SECRET_NAME" "$DATABASE_URL_VALUE" 'Database URL secret'; then
    DATABASE_SECRET_ARN="$SECRET_ARN_RESULT"
  else
    record_error 'Database URL secret setup failed.'
  fi
fi

if [[ -n "$GEMINI_API_KEY_VALUE" ]]; then
  if ensure_secret "$GEMINI_SECRET_NAME" "$GEMINI_API_KEY_VALUE" 'Gemini API key secret'; then
    GEMINI_SECRET_ARN="$SECRET_ARN_RESULT"
  else
    record_error 'Gemini API key secret setup failed.'
  fi
fi

if ! ensure_oidc_provider; then
  record_error 'GitHub Actions OIDC provider setup failed.'
fi

if [[ -n "$GITHUB_REPOSITORY_VALUE" ]]; then
  if ! ensure_deploy_role "$GITHUB_REPOSITORY_VALUE"; then
    record_error 'GitHub Actions deploy role setup failed.'
  fi
else
  record_error 'GitHub Actions deploy role setup was skipped because the repository is unknown.'
fi

if [[ -n "$DATABASE_SECRET_ARN" ]]; then
  if ! upsert_env_value DATABASE_SECRET_ARN "$DATABASE_SECRET_ARN"; then
    record_error 'Could not save DATABASE_SECRET_ARN to backend/.env.'
  fi
fi

if [[ -n "$GEMINI_SECRET_ARN" ]]; then
  if ! upsert_env_value GEMINI_SECRET_ARN "$GEMINI_SECRET_ARN"; then
    record_error 'Could not save GEMINI_SECRET_ARN to backend/.env.'
  fi
fi

print_summary

if ((${#ERRORS[@]} > 0)); then
  printf '\nErrors:\n' >&2
  for error in "${ERRORS[@]}"; do
    printf '  - %s\n' "$error" >&2
  done
  exit 1
fi
