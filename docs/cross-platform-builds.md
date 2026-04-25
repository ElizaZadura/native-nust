# Cross-Platform Build Guide

This guide explains how to build native binaries for Linux, Windows, and macOS.

## Quick Start

### Option 1: Use GitHub Actions (Easiest)
1. Push a tag: `git tag v0.1.0 && git push origin v0.1.0`
2. Check the Actions tab - binaries will be built automatically
3. Download artifacts for each platform

### Option 2: Build Locally

#### On Linux (build for Linux)
```bash
cargo build --release
# Binary: target/release/nust
```

#### On Windows (build for Windows)
```powershell
cargo build --release
# Binary: target/release/nust.exe
```

#### On macOS (build for macOS)
```bash
cargo build --release
# Binary: target/release/nust
```

## Cross-Compilation (Advanced)

### Linux → Windows
```bash
# Install Windows target
rustup target add x86_64-pc-windows-gnu

# Install mingw-w64 (Ubuntu/Debian)
sudo apt install gcc-mingw-w64-x86-64

# Build
cargo build --release --target x86_64-pc-windows-gnu
# Binary: target/x86_64-pc-windows-gnu/release/nust.exe
```

### Linux → macOS (requires macOS SDK)
Cross-compiling to macOS from Linux is complex and not recommended. Use a macOS machine or CI.

### Windows → Linux (WSL)
```powershell
# In WSL
cargo build --release
# Binary: target/release/nust
```

## Testing Native Binaries

### On Windows (Native)
1. Download or build `nust.exe`
2. Double-click or run from PowerShell
3. Test keyboard shortcuts (Ctrl+Shift+P should work!)
4. Test file dialogs (native Windows dialogs)

### On Linux (Native)
1. Download or build `nust`
2. Make executable: `chmod +x nust`
3. Run: `./nust`
4. Test keyboard shortcuts
5. Test file dialogs (native Linux dialogs)

### On macOS (Native)
1. Download or build `nust`
2. Make executable: `chmod +x nust`
3. Run: `./nust`
4. May need to allow in Security & Privacy settings

## Platform-Specific Notes

### Windows
- Uses native Windows file dialogs (via `rfd`)
- Keyboard shortcuts work natively
- No WSL quirks or workarounds needed
- Best performance

### Linux
- Uses native Linux file dialogs (via `rfd`)
- Keyboard shortcuts work natively
- Works with Wayland or X11
- Best performance

### macOS
- Uses native macOS file dialogs (via `rfd`)
- Keyboard shortcuts work natively
- May need code signing for distribution
- Best performance

## WSL vs Native Comparison

| Feature | WSL (Windows) | Native Windows | Native Linux |
|---------|---------------|----------------|--------------|
| Keyboard shortcuts | Sometimes broken | ✅ Works | ✅ Works |
| File dialogs | Fallback only | ✅ Native | ✅ Native |
| Performance | Slower | ✅ Fast | ✅ Fast |
| GPU acceleration | Limited | ✅ Full | ✅ Full |
| Debugging | Complex | ✅ Straightforward | ✅ Straightforward |

## Recommended Workflow

1. **Development**: Use WSL if you prefer Linux tooling (accept the quirks)
2. **Testing**: Build native binaries and test on each platform
3. **CI/CD**: Use GitHub Actions to build all platforms automatically
4. **Distribution**: Provide platform-specific binaries

## Troubleshooting

### "linker not found" during cross-compilation
Install the appropriate cross-compilation toolchain for your platform.

### "cannot find -lX11" (Linux → Windows)
This is expected - Windows doesn't use X11. The build should still work.

### Binary doesn't run on target platform
- Check architecture (x86_64 vs ARM)
- Check dependencies (may need DLLs on Windows)
- Check permissions (Linux/macOS)
