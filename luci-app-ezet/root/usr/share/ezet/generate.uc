#!/usr/bin/ucode

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';

import {
	isEmpty, strToBool, strToInt, arrToObj, removeBlankAttrs,
	EZ_DIR, RUN_DIR,
} from 'ezet';

/* UCI config START */
const ubus = connect();
const uci = cursor();

const uciconf = 'ezet';
uci.load(uciconf);

const uciezet = 'config';

const uciglobal = 'global';

const uciinst = 'instance',
      ucipeer = 'peer';

/* Global options */
const machine_id = uci.get(uciconf, uciglobal, 'machine_id') || ubus.call('luci.ezet', 'get_host_info')?.machine_id,
      hostname = uci.get(uciconf, uciglobal, 'hostname') || ubus.call('luci.ezet', 'get_host_info')?.hostname,
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

/* Config helper END */

/* Main */
const configs = [];

uci.foreach(uciconf, uciinst, (cfg) => {
	if (cfg.enabled === '0')
		return;

	const config = {
		/* Global settings */
		// console_log_level: ,
		// file_log_level: ,
		// file_log_dir: ,
		// file_log_size_mb: ,
		// file_log_count: ,
		hostname: hostname,
		instance_name: cfg.label,

		/* Config server settings */
		machine_id: machine_id,
		// config_server: ,
		// state_dir: ,
		// config_file: ,
		// config_dir: ,
		// disable_env_parsing: ,
		// check_config: ,

		/* Network settings */
		network_name: cfg.network_name,
		network_secret: cfg.network_secret,
		ipv4: cfg.ipv4,
		ipv6: cfg.ipv6,
		dhcp: (dhcp === '0') ? false : true,
		dhcpv6: (dhcpv6 === '0') ? false : true,
		ipv6_public_addr_provider: strToBool(cfg.ipv6_public_addr_provider) || false,
		ipv6_public_addr_auto: strToBool(cfg.ipv6_public_addr_auto) || false,
		ipv6_public_addr_prefix: cfg.ipv6_public_addr_prefix || auto_ipv6_gua_prefix,
		peer: filter([...get_peers(cfg.peers), get_peers(cfg.external_node)], v => !isEmpty(v)),

		/* Secure mode settings */
		secure_mode: strToBool(cfg.secure_mode) ? {
			enabled: true,
			local_private_key: cfg.local_private_key,
			local_public_key: cfg.local_public_key,
			// credential: ,
			// credential_file: ,
		} : null,

		/* Flags settings */
		flags: {
			private_mode: strToBool(cfg.private_mode),
		},
	};

	push(configs, arrToObj([[cfg['.name'], config]]));
});

printf('%.J\n', removeBlankAttrs(configs));
