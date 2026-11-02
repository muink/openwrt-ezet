# openwrt-ezet

## Requirements

- OpenWrt >= 24.10
- firewall4

+ Build Phase:
  - https://openwrt.org/docs/guide-developer/toolchain/install-buildsystem#debianubuntumint
  + OpenWrt >= 25.12.6 ?
    - rust >= 1.95
    - node.js >= 22
    - node-pnpm >= 10
  - upx (Optional)


## Build

``` bash
# Take the x86_64 platform as an example
tar --zstd -xf openwrt-sdk-25.12.6-x86-64_gcc-14.3.0_musl.Linux-x86_64.tar.zst
# Go to the SDK root dir
cd openwrt-sdk-*-x86_64_*
# Dependency Requirements
echo -e "\nsrc-git immortalwrt_packages https://github.com/immortalwrt/packages.git;openwrt-25.12" >> feeds.conf.default # Require: node-pnpm
# Get Makefile
echo -e "\nsrc-git openwrt-ezet https://github.com/muink/openwrt-ezet.git" >> feeds.conf.default
# First run to generate a .config file
make defconfig
./scripts/feeds update -a
./scripts/feeds install -a
# Select the package Network -> VPM -> {easytier,easytier-web}
# Select the package LuCI -> Applications -> luci-app-ezet
make menuconfig
# Start compiling
make package/easytier/compile V=s BUILD_LOG=y -j$(nproc)
make package/luci-app-ezet/compile V=s BUILD_LOG=y -j$(nproc)
```
