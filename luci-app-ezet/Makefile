# SPDX-License-Identifier: GPL-2.0
#
# Copyright (C) 2026 Anya Lin <hukk1996@gmail.com>

include $(TOPDIR)/rules.mk

LUCI_TITLE:=EasyTier on OpenWrt.
LUCI_PKGARCH:=all
LUCI_DEPENDS:= \
	+easytier-core \
	+easytier-cli \
	+firewall4 \
	+ucode-mod-digest +openssl-util \
	+yq +ip-full \
	#+ucode-mod-netaddr # @less_26_??

PKG_NAME:=luci-app-ezet

define Package/luci-app-ezet/conffiles
/etc/config/ezet
/etc/ezet/config/
/etc/ezet/instance/
endef

define Package/luci-app-ezet/prerm
#!/bin/sh
endef

# Disable CSStidy for compilation
#CONFIG_LUCI_CSSTIDY:=

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
