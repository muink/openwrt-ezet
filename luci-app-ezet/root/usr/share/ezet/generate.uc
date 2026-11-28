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
const config_server = uci.get(uciconf, uciglobal, 'config_server'),
      machine_id = uci.get(uciconf, uciglobal, 'machine_id') || ubus.call('luci.ezet', 'get_host_info')?.machine_id,
      hostname = uci.get(uciconf, uciglobal, 'hostname') || ubus.call('luci.ezet', 'get_host_info')?.hostname,
      console_log_level = uci.get(uciconf, uciglobal, 'console_log_level') || 'warn',
      file_log_level = uci.get(uciconf, uciglobal, 'file_log_level') || 'off',
      file_log_size = strToInt(uci.get(uciconf, uciglobal, 'file_log_size')) ?? 5,
      file_log_count = strToInt(uci.get(uciconf, uciglobal, 'file_log_count')) ?? 1,
	  rpc_portal = uci.get(uciconf, uciglobal, 'rpc_portal') || '127.0.0.1:15888',
	  rpc_portal_whitelist = uci.get(uciconf, uciglobal, 'rpc_portal_whitelist') || [],
      auto_ipv6_gua_prefix = ubus.call('luci.ezet', 'detect_ipv6_gua_prefix').result?.pd,
      override_stun = strToBool(uci.get(uciconf, uciglobal, 'override_stun'));

/* All STUN server array */
const stunservers = [];
uci.foreach(uciconf, ucistun, (cfg) => {
	if (cfg.enabled === '0')
		return;

	push(stunservers, {
		host: cfg.host,
		...arrToObj(map(split(cfg.l3, ','), e => [e, true])),
		...arrToObj(map(split(cfg.capabilities, ','), e => [e, true])),
	});
});

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


function get_proxy_networks(cfg) {
	if (isEmpty(cfg))
		return null;

	const cfg_type = type(cfg);
	if (cfg_type === 'string') {
		const parts = split(cfg, '->');

		return {
			// Real LAN subnet advertised by this node.
			cidr: parts[0],
			// Optional. remap when the real LAN subnet overlaps another network.
			mapped_cidr: parts[1],
			// Optional. allow-list; leave omitted unless you need to constrain access.
			// allow: ["10.126.126.0/24"] // Not currently in use.
		};
	} else if (cfg_type === 'array')
		return filter(map(cfg, c => get_proxy_networks(c)), v => !isEmpty(v));
	else
		die(sprintf("unsupported type %s of proxy_networks %J.", cfg_type, cfg));
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
	"config-server": config_server,
	"machine-id": machine_id,
	"state-dir": EZ_DIR,
	// "config-file": ,
	"config-dir": `${EZ_DIR}/config`,
	"shared-runtime": true, // and disable multi_thread & multi_thread_count
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
	"rpc-portal": rpc_portal,
	"rpc-portal-whitelist": join(',', rpc_portal_whitelist),
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
			network_secret: cfg.credential ? null : cfg.network_secret,
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
		...((cfg.credential || strToBool(cfg.secure_mode)) ? {
			credential_file: cfg.credential ? null : `${EZ_DIR}/${uciinst}/${cfg['.name']}/credentials.json`,
			secure_mode: {
				enabled: true,
				local_private_key: cfg.credential || cfg.local_private_key,
				local_public_key: cfg.credential ? null : cfg.local_public_key,
			}
		} : {}),

		/* STUN settings */
		...(strToBool(override_stun) ? {
			stun_servers: map(filter(stunservers, e => e.udp), e => e.host),
			stun_servers_v6: map(filter(stunservers, e => e.ipv6), e => e.host),
			tcp_stun_servers: map(filter(stunservers, e => e.tcp), e => e.host),
		} : {}),

		/* Peers settings */
		peer: filter(get_peers(cfg.peers) || [], v => !isEmpty(v)),

		/* Routes settings */
		proxy_network: filter(get_proxy_networks(cfg.proxy_networks) || [], v => !isEmpty(v)),
		routes: cfg.routes || [],
		exit_nodes: cfg.exit_nodes || [],

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
			enable_exit_node: strToBool(cfg.enable_exit_node),
			private_mode: strToBool(cfg.private_mode),
		},
	});

	push(configs, arrToObj([[cfg['.name'], config]]));
});

printf('%.J\n', {options: options, configs: configs});
