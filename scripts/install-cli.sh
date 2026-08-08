#!/usr/bin/env bash
# DevDash CLI installer — one command, any terminal.
#
#   curl -fsSL https://raw.githubusercontent.com/akshat-lakhera/DevDash/main/scripts/install-cli.sh | sh
#
# Override:
#   DEVDASH_INSTALL_DIR=$HOME/.local/bin
#   DEVDASH_REPO=akshat-lakhera/DevDash
#   DEVDASH_VERSION=v1.0.2
set -euo pipefail

REPO="${DEVDASH_REPO:-akshat-lakhera/DevDash}"
INSTALL_DIR="${DEVDASH_INSTALL_DIR:-${HOME}/.devdash/bin}"
VERSION="${DEVDASH_VERSION:-latest}"
BIN_NAME="devdash"

say() { printf '==> %s\n' "$*"; }
err() { printf 'error: %s\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || err "missing required command: $1"
}

detect_target() {
  local os arch
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) arch="x86_64" ;;
    arm64|aarch64) arch="aarch64" ;;
    *) err "unsupported architecture: $arch" ;;
  esac
  case "$os" in
    darwin) echo "${arch}-apple-darwin" ;;
    linux) echo "${arch}-unknown-linux-gnu" ;;
    mingw*|msys*|cygwin*) echo "${arch}-pc-windows-msvc" ;;
    *) err "unsupported OS: $os" ;;
  esac
}

download_release() {
  local target asset url tmp
  target="$(detect_target)"
  if [[ "$VERSION" == "latest" ]]; then
    url="https://github.com/${REPO}/releases/latest/download/devdash-${target}.tar.gz"
  else
    url="https://github.com/${REPO}/releases/download/${VERSION}/devdash-${target}.tar.gz"
  fi
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" EXIT
  say "trying prebuilt binary: $url"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$tmp/devdash.tgz" || return 1
  else
    wget -qO "$tmp/devdash.tgz" "$url" || return 1
  fi
  mkdir -p "$INSTALL_DIR"
  tar -xzf "$tmp/devdash.tgz" -C "$tmp"
  if [[ -f "$tmp/$BIN_NAME" ]]; then
    install -m 0755 "$tmp/$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
  elif [[ -f "$tmp/bin/$BIN_NAME" ]]; then
    install -m 0755 "$tmp/bin/$BIN_NAME" "$INSTALL_DIR/$BIN_NAME"
  else
    return 1
  fi
  return 0
}

script_dir() {
  local src="${BASH_SOURCE[0]:-$0}"
  cd "$(dirname "$src")" && pwd
}

install_from_path() {
  local manifest="$1"
  need cargo
  say "building DevDash CLI from $manifest (C/C++ compiler required for bundled DuckDB)"
  cargo install \
    --path "$(dirname "$manifest")" \
    --bin devdash \
    --locked \
    --no-default-features \
    --features cli \
    --root "${DEVDASH_CARGO_ROOT:-$HOME/.devdash}" \
    --force
  mkdir -p "$INSTALL_DIR"
  ln -sf "${DEVDASH_CARGO_ROOT:-$HOME/.devdash}/bin/devdash" "$INSTALL_DIR/devdash"
}

install_from_source() {
  local here crate
  here="$(script_dir)"
  crate="$(cd "$here/.." && pwd)/src-tauri/Cargo.toml"
  if [[ -f "$crate" ]]; then
    install_from_path "$crate"
    return
  fi
  need cargo
  need git
  say "cloning ${REPO} and building from source"
  local tmp
  tmp="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" RETURN
  git clone --depth 1 "https://github.com/${REPO}.git" "$tmp/devdash"
  install_from_path "$tmp/devdash/src-tauri/Cargo.toml"
}

main() {
  say "DevDash CLI installer"
  mkdir -p "$INSTALL_DIR"
  if download_release; then
    say "installed prebuilt binary"
  else
    say "prebuilt asset not published yet"
    install_from_source
  fi

  if ! echo ":$PATH:" | grep -q ":$INSTALL_DIR:"; then
    local rc
    rc="${SHELL##*/}"
    case "$rc" in
      zsh) rc="$HOME/.zshrc" ;;
      bash) rc="$HOME/.bashrc" ;;
      *) rc="$HOME/.profile" ;;
    esac
    if ! grep -qs '\.devdash/bin' "$rc" 2>/dev/null; then
      printf '\n# DevDash CLI\nexport PATH="%s:$PATH"\n' "$INSTALL_DIR" >> "$rc"
      say "added $INSTALL_DIR to PATH via $rc  (open a new terminal or: source $rc)"
    fi
  fi

  if [[ -x "$INSTALL_DIR/devdash" ]]; then
    say "done → $INSTALL_DIR/devdash"
    "$INSTALL_DIR/devdash" version || true
    echo
    echo "Next:"
    echo "  devdash doctor"
    echo "  devdash connect add --name local --url postgres://user@localhost:5432/app"
    echo "  devdash sql 'select 1'"
    echo "  devdash repl"
  else
    err "install finished but $INSTALL_DIR/devdash is missing"
  fi
}

main "$@"
