#!/bin/bash
# Build Windows binary from Linux/WSL
# Requires: rustup target add x86_64-pc-windows-gnu
#          sudo apt install gcc-mingw-w64-x86-64

set -e

echo "Building Windows binary..."
cargo build --release --target x86_64-pc-windows-gnu

echo "✅ Windows binary built: target/x86_64-pc-windows-gnu/release/nust.exe"
echo "Copy to Windows and run natively for testing!"
