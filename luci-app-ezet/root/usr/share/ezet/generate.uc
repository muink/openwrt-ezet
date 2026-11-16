#!/usr/bin/ucode

'use strict';

const less_26 = true;

import { connect } from 'ubus';
import { cursor } from 'uci';
//import * as netaddr from 'netaddr'; // @less_26_??

import {
	isEmpty, strToBool, strToInt, arrToObj, removeBlankAttrs,
	IPv4CIDR, IPv6CIDR, // @less_26_??
	EZ_DIR, RUN_DIR
} from 'ezet';

/* UCI config START */
const ubus = connect();
const uci = cursor();

const uciconf = 'ezet';
uci.load(uciconf);

const uciezet = 'config';

const uciglobal = 'global';

const uciinst = 'instance',
      ucipeer = 'peer',
      ucilser = 'listener',
      ucistun = 'stun_server';

/* Global options */
const machine_id = uci.get(uciconf, uciglobal, 'machine_id') || ubus.call('luci.ezet', 'get_host_info')?.machine_id,
      hostname = uci.get(uciconf, uciglobal, 'hostname') || ubus.call('luci.ezet', 'get_host_info')?.hostname,
      console_log_level = uci.get(uciconf, uciglobal, 'console_log_level') || 'warn',
      file_log_level = uci.get(uciconf, uciglobal, 'file_log_level') || 'off',
      file_log_size = strToInt(uci.get(uciconf, uciglobal, 'file_log_size')) ?? 5,
      file_log_count = strToInt(uci.get(uciconf, uciglobal, 'file_log_count')) ?? 1,
      auto_ipv6_gua_prefix = ubus.call('luci.ezet', 'detect_ipv6_gua_prefix').result?.pd;

/* UCI config END */

/* Config helper START */
function get_peers(cfg) {
	if (isEmpty(cfg))
		return null;

	const cfg_type = type(cfg);
	if (cfg_type === 'string') {
		const uri = uci.get(uciconf, cfg, 'uri');
		return uri ? {
			uri: uri,
			peer_public_key: uci.get(uciconf, cfg, 'peer_public_key'),
		} : null;
	} else if (cfg_type === 'array')
		return filter(map(cfg, c => get_peers(c)), v => !isEmpty(v));
	else
		die(sprintf("unsupported type %s of peers %J.", cfg_type, cfg));
}

function get_listeners(cfg) {
	if (isEmpty(cfg))
		return null;

	const cfg_type = type(cfg);
	if (cfg_type === 'string')
		return uci.get(uciconf, cfg, 'uri');
	else if (cfg_type === 'array')
		return filter(map(cfg, c => get_listeners(c)), v => !isEmpty(v));
	else
		die(sprintf("unsupported type %s of listeners %J.", cfg_type, cfg));
}

/* Config helper END */

/* Main */
const options = removeBlankAttrs({
	/* Config settings */
	//// "config-server": ,
	"machine-id": machine_id,
	"state-dir": `${EZ_DIR}/${uciinst}`,
	//// "config-file": ,
	"config-dir": `${EZ_DIR}/config`,
	//// "shared-runtime": ,
	//// "check-config": ,
	//// "daemon": ,
	//// "generate-completions": ,
	//// "disable-env-parsing": ,

	/* Logging settings */
	"console-log-level": console_log_level,
	"file-log-level": file_log_level,
	"file-log-dir": RUN_DIR,
	"file-log-size": file_log_size,
	"file-log-count": file_log_count,

	/* RPC settings */
	//// "rpc-portal": ,
	//// "rpc-portal-whitelist": ,
});

const configs = [];

uci.foreach(uciconf, uciinst, (cfg) => {
	if (cfg.enabled === '0')
		return;

	if (length(ARGV) > 0 && !(cfg['.name'] in ARGV)) {
		push(configs, cfg['.name']);
		return;
	}

	const config = removeBlankAttrs({
		/* General settings */
		hostname: hostname,
		instance_name: cfg.label,
		// instance_id: "11111111-2222-4333-8444-555555555555", # Optional UUID
		// netns: 'easytier',                                   # Optional Linux network namespace

		/* Network settings */
		network_identity: {
			network_name: cfg.network_name,
			network_secret: cfg.network_secret,
		},
		ipv4: cfg.ipv4,
		ipv6: cfg.ipv6,
		dhcp: (cfg.dhcp === '0') ? false : cfg.ipv4
			? ((cidr) => {
				let prefix = less_26 ? IPv4CIDR(cidr) : netaddr.new(cidr); // @less_26_??

				return less_26 // @less_26_??
					? IPv4CIDR(`${prefix.network().tostring()}/${prefix.bits}`).tostring()
					: netaddr.new(prefix.network().tostring(), prefix.bits).tostring();
			})(cfg.ipv4)
			: true,
		dhcpv6: (cfg.dhcpv6 === '0') ? false : cfg.ipv6
			? ((cidr) => {
				let prefix = less_26 ? IPv6CIDR(cidr) : netaddr.new(cidr); // @less_26_??

				return less_26 // @less_26_??
					? IPv6CIDR(`${prefix.network().tostring()}/${prefix.bits}`).tostring()
					: netaddr.new(prefix.network().tostring(), prefix.bits).tostring();
			})(cfg.ipv6)
			: true,
		ipv6_public_addr_provider: strToBool(cfg.ipv6_public_addr_provider) || false,
		ipv6_public_addr_auto: strToBool(cfg.ipv6_public_addr_auto) || false,
		ipv6_public_addr_prefix: cfg.ipv6_public_addr_prefix, // || auto_ipv6_gua_prefix,

		/* Secure mode settings */
		secure_mode: strToBool(cfg.secure_mode) ? {
			enabled: true,
			local_private_key: cfg.local_private_key,
			local_public_key: cfg.local_public_key,
			//// credential: ,
			//// credential_file: ,
		} : null,

		/* Peers settings */
		peer: filter(get_peers(cfg.peers) || [], v => !isEmpty(v)),
		//// proxy_network: cfg.proxy_networks,

		/* Listener settings */
		...(strToBool(cfg.no_listener) ? {
			listeners: [],
		} : {
			listeners: get_listeners(cfg.listeners) || [],
			// ipv6_listener: , // Deprecated
			mapped_listeners: get_listeners(cfg.mapped_listeners),
		}),

		/* Flags settings */
		flags: {
			private_mode: strToBool(cfg.private_mode),
		},
	});

	push(configs, arrToObj([[cfg['.name'], config]]));
});

printf('%.J\n', {options: options, configs: configs});
