#!/usr/bin/env bash
set -euo pipefail
# Linux x86_64 only. Downloads use normal TLS verification and release SHA-256.
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Unsupported host'; exit 1; }
command -v rustup >/dev/null || { echo 'Install rustup before running this script'; exit 1; }
root=$(cd "$(dirname "$0")/../.." && pwd)
tool_dir="$root/hub/.tools"
mkdir -p "$tool_dir/bin" "$tool_dir/succinct-1.91.1"
fetch() {
  local url=$1 target=$2 digest=$3
  if ! [[ -f "$target" ]] || ! echo "$digest  $target" | sha256sum --check --status; then
    curl --fail --location --retry 2 "$url" -o "$target"
  fi
  echo "$digest  $target" | sha256sum --check
}
fetch https://github.com/succinctlabs/sp1/releases/download/v5.2.4/cargo_prove_v5.2.4_linux_amd64.tar.gz "$tool_dir/cli.tar.gz" c13ec3316a1f0ee1c768e2d85231a043e589d80265a385c83cd57f5cbc0a7eec
fetch https://github.com/succinctlabs/rust/releases/download/succinct-1.91.1/rust-toolchain-x86_64-unknown-linux-gnu.tar.gz "$tool_dir/rust.tar.gz" 9fe2fee01908fccf32ea1837379ce836a24f3dac3a80ca24e33c87a6599c36ec
tar --no-same-owner -xzf "$tool_dir/cli.tar.gz" -C "$tool_dir/bin"
tar --no-same-owner -xzf "$tool_dir/rust.tar.gz" -C "$tool_dir/succinct-1.91.1"
rustup toolchain link succinct "$tool_dir/succinct-1.91.1"
printf 'Add to PATH: %s/bin\n' "$tool_dir"
