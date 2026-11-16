# SPDX-License-Identifier: LGPL-3.0
#
# Copyright (C) 2026 Anya Lin <hukk1996@gmail.com>

include $(TOPDIR)/rules.mk

PKG_NAME:=easytier
PKG_UPSTREAM_VERSION:=2.7.0
PKG_UPSTREAM_GITHASH:=0009db4c226b3c34b0ec5350ec9dfba83252f5da
PKG_VERSION:=$(PKG_UPSTREAM_VERSION)$(if $(PKG_UPSTREAM_GITHASH),~$(call version_abbrev,$(PKG_UPSTREAM_GITHASH)))
PKG_RELEASE:=1

PKG_SOURCE_SUBDIR:=$(PKG_NAME)-$(PKG_UPSTREAM_VERSION)
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_SOURCE_SUBDIR)

ifeq ($(PKG_UPSTREAM_GITHASH),)
PKG_SOURCE_URL:=https://codeload.github.com/EasyTier/EasyTier/tar.gz/refs/tags
PKG_SOURCE_URL_FILE:=v$(PKG_VERSION)
PKG_HASH:=2a911ef9661398a71f85e0336f786e7e6d8a8058b1c6061454cfafb18f9c3b83

PKG_SOURCE:=$(PKG_SOURCE_SUBDIR).tar.gz
else
PKG_SOURCE_PROTO:=git
PKG_SOURCE_URL:=https://github.com/EasyTier/EasyTier.git
PKG_SOURCE_VERSION:=$(PKG_UPSTREAM_GITHASH)
PKG_MIRROR_HASH:=acb99f7f917a123ae32f421586362d2e9d92544a4e03e1e1d0e4601c6cc46303

PKG_SOURCE:=$(PKG_SOURCE_SUBDIR)-$(PKG_SOURCE_VERSION).tar.gz
endif

PKG_MAINTAINER:=Anya Lin <hukk1996@gmail.com>
PKG_LICENSE:=LGPL-3.0
PKG_LICENSE_FILES:=LICENSE

PKG_BUILD_DEPENDS:= \
	rust/host \
	protobuf/host \
	EASYTIER_WEB_EMBED:node/host \
	EASYTIER_WEB_EMBED:node-pnpm/host #<-- Included in immortalwrt/packages
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

PKG_CONFIG_DEPENDS+= \
	CONFIG_PACKAGE_easytier \
	CONFIG_PACKAGE_easytier-web \
	CONFIG_EASYTIER_ALLOCATOR_MIMALLOC \
	CONFIG_EASYTIER_ALLOCATOR_JEMALLOC \
	CONFIG_EASYTIER_WEB_EMBED \

EASYTIER_CORE_FEATURES:=$(subst $(space),$(comma),$(strip \
	$(if $(CONFIG_EASYTIER_ALLOCATOR_MIMALLOC),mimalloc) \
	$(if $(CONFIG_EASYTIER_ALLOCATOR_JEMALLOC),jemalloc) \
))

EASYTIER_WEB_FEATURES:=$(subst $(space),$(comma),$(strip \
	$(if $(CONFIG_EASYTIER_WEB_EMBED),embed) \
))

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/rust/rust-package.mk

CARGO_PKG_VARS+= \
	PROTOC=$(STAGING_DIR_HOSTPKG)/bin/protoc \
	EASYTIER_GIT_HASH=$(shell printf '%.8s' '$(PKG_UPSTREAM_GITHASH)')

# GitHub codeload archives contain a single top-level EasyTier-<version>
# directory. Strip it so the source is placed directly in PKG_BUILD_DIR.
TAR_OPTIONS+= --strip-components=1
TAR_CMD=$(HOST_TAR) -C $(1) $(TAR_OPTIONS)

define Package/easytier/config
	menu "Features configuration"
		depends on PACKAGE_easytier

		choice
			prompt "Memory Allocator Type"
			depends on !mips && !mipsel
			default EASYTIER_ALLOCATOR_MIMALLOC if (riscv64||loongarch64||aarch64)
			default EASYTIER_ALLOCATOR_JEMALLOC

			config EASYTIER_ALLOCATOR_MIMALLOC
				bool "mimalloc"

			config EASYTIER_ALLOCATOR_JEMALLOC
				bool "jemalloc"
		endchoice
	endmenu
endef

define Package/easytier-web/config
	menu "Features configuration"
		depends on PACKAGE_easytier-web

		config EASYTIER_WEB_EMBED
			bool "Embed Frontend"
			default y
	endmenu
endef

# Host pnpm store path
PNPM_STORE_DIR:=$(DL_DIR)/pnpm-store
# Host WASM toolchain
WASM_HOME:=$(DL_DIR)/easytier-wasm
WASM_CARGO_HOME:=$(WASM_HOME)/cargo
WASM_RUSTUP_HOME:=$(WASM_HOME)/rustup
# Build EasyTier frontend using Host Node.js and pnpm.
# node/host and node-pnpm/host install their executables into STAGING_DIR_HOSTPKG.
define Build/Compile/Frontend
	$(CURDIR)/.prepare-pnpm.sh "$(CURDIR)" "$(PKG_BUILD_DIR)"
	$(CURDIR)/.prepare-wasm.sh "$(CURDIR)" "$(PKG_BUILD_DIR)" "$(WASM_CARGO_HOME)" "$(WASM_RUSTUP_HOME)"

	# https://github.com/EasyTier/EasyTier/blob/v2.7.0/.github/actions/prepare-pnpm/action.yml#L57
	@set -eu; \
	cd "$(PKG_BUILD_DIR)"; \
	. toolchain.env; \
	\
	echo "Installing EasyTier Web dependencies..."; \
	pnpm -r \
		--store-dir "$(PNPM_STORE_DIR)" \
		--filter "{./$(1)/**}..." \
		install --frozen-lockfile; \
	\
	echo "Building EasyTier Web frontend..."; \
	pnpm -r \
		--workspace-concurrency=1 \
		--filter "{./$(1)/**}..." \
		--if-present run build; \
	\
	echo "Bundle config-generator with Web frontend..."; \
	if [ -f easytier-web/frontend/dist/index.html ] && [ -f easytier-web/config-generator/dist/index.html ]; then \
		mkdir -p easytier-web/frontend/dist/config-generator; \
		cp -R easytier-web/config-generator/dist/. easytier-web/frontend/dist/config-generator/; \
	fi
endef

# MIPS/MIPSel follows upstream's special build-std path.
# Upstream does not produce easytier-web binaries for these targets.
ifneq ($(filter mips mips64 mips64el mipsel,$(ARCH)),)
# https://github.com/EasyTier/EasyTier/blob/v2.7.0/.github/workflows/core.yml#L223
define Build/Compile
	$(if $(CONFIG_PACKAGE_easytier),\
		RUSTC_BOOTSTRAP=1 $(CARGO_PKG_VARS) CARGO_PROFILE_RELEASE_PANIC=abort \
		cargo build -v --release \
			--manifest-path "$(PKG_BUILD_DIR)/Cargo.toml" \
			--target "$(RUSTC_TARGET_ARCH)" \
			-Z build-std=std$(comma)panic_abort \
			--package=easytier --features=jemalloc $(CARGO_PKG_ARGS) && \
		$(INSTALL_DIR) "$(PKG_INSTALL_DIR)/bin" && \
		$(INSTALL_BIN) "$(PKG_BUILD_DIR)/target/$(RUSTC_TARGET_ARCH)/release/easytier-core" "$(PKG_INSTALL_DIR)/bin/" && \
		$(INSTALL_BIN) "$(PKG_BUILD_DIR)/target/$(RUSTC_TARGET_ARCH)/release/easytier-cli" "$(PKG_INSTALL_DIR)/bin/" \
	)
endef
else
# https://github.com/EasyTier/EasyTier/blob/v2.7.0/.github/workflows/core.yml#L197
define Build/Compile
	$(if $(CONFIG_PACKAGE_easytier),\
		$(call Build/Compile/Cargo,easytier,--bins --features="$(EASYTIER_CORE_FEATURES)") \
	)

	$(if $(and $(CONFIG_PACKAGE_easytier-web),$(CONFIG_EASYTIER_WEB_EMBED)),\
		$(call Build/Compile/Frontend,easytier-web) \
	)

	$(if $(CONFIG_PACKAGE_easytier-web),\
		$(call Build/Compile/Cargo,easytier-web,$(if $(EASYTIER_WEB_FEATURES),--features="$(EASYTIER_WEB_FEATURES)")) \
	)
endef
endif

# Platform-specific features
# $(TOPDIR)/feeds/packages/lang/rust/rust-values.mk
# RUST_ARCH_DEPENDS:=@(aarch64||arm||i386||loongarch64||mips||mips64||mips64el||mipsel||powerpc||powerpc64||riscv64||x86_64)
EASYTIER_WEB_RUST_ARCH_DEPENDS:=@(aarch64||arm||i386||loongarch64||powerpc||powerpc64||riscv64||x86_64)

define Package/easytier/Default
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=VPN
  URL:=https://github.com/EasyTier/EasyTier
  DEPENDS:=$(RUST_ARCH_DEPENDS)
endef

define Package/easytier
  $(call Package/easytier/Default)
  TITLE:=A simple, decentralized mesh VPN with WireGuard support.
  DEPENDS+= +kmod-tun
  PROVIDES:=easytier-core easytier-cli
  ALTERNATIVES:=\
    100:/usr/bin/easytier-core:/usr/libexec/easytier-core \
    100:/usr/bin/easytier-cli:/usr/libexec/easytier-cli
  USERID:=easytier=11010:easytier=11010
endef

define Package/easytier-web
  $(call Package/easytier/Default)
  TITLE:=Web console for easytier. easytier-core gets config from this and web frontend use it as restful api server.
  DEPENDS:=$(EASYTIER_WEB_RUST_ARCH_DEPENDS) +ca-bundle
  PROVIDES:=$(if $(CONFIG_EASYTIER_WEB_EMBED),easytier-web-embed)
  ALTERNATIVES:=\
    100:/usr/bin/easytier-web:/usr/libexec/easytier-web
endef

define Package/easytier/install
	$(CURDIR)/.prepare-upx.sh $(PKG_INSTALL_DIR)/bin/easytier-core
	$(CURDIR)/.prepare-upx.sh $(PKG_INSTALL_DIR)/bin/easytier-cli
	$(INSTALL_DIR) $(1)/usr/libexec/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/bin/easytier-core $(1)/usr/libexec/easytier-core
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/bin/easytier-cli $(1)/usr/libexec/easytier-cli
endef

define Package/easytier-web/install
	$(CURDIR)/.prepare-upx.sh $(PKG_INSTALL_DIR)/bin/easytier-web
	$(INSTALL_DIR) $(1)/usr/libexec/
	$(INSTALL_BIN) $(PKG_INSTALL_DIR)/bin/easytier-web $(1)/usr/libexec/easytier-web
endef

$(eval $(call BuildPackage,easytier))
$(eval $(call BuildPackage,easytier-web))
