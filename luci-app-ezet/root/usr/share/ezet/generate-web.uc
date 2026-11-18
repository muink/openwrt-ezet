#!/usr/bin/ucode

'use strict';

import { connect } from 'ubus';
import { cursor } from 'uci';

import {
	isEmpty, strToBool, strToInt, arrToObj, removeBlankAttrs,
	EZ_DIR, RUN_DIR
} from 'ezet';

/* UCI config START */
const ubus = connect();
const uci = cursor();

const uciconf = 'ezet';
uci.load(uciconf);

const uciezet = 'config';

const uciconsole = 'console';

function getConsole(option) {
	if (isEmpty(option))
		return null;

	return uci.get(uciconf, uciconsole, option);
}

/* Global options */
const console_log_level = getConsole('console_log_level') || 'warn',
      api_server_addr = getConsole('api_server_addr') || '::', // 0.0.0.0
      api_server_port = strToInt(getConsole('api_server_port')) || 11211,
      web_server_addr = getConsole('web_server_addr') || '::', // 0.0.0.0
      web_server_port = strToInt(getConsole('web_server_port')), // same with api_server_port
      api_host = getConsole('api_host') || `http://localhost:${api_server_port}`, // http://127.0.0.1:11211
      file_log_level = getConsole('file_log_level') || 'off';

/* UCI config END */

/* Main */
const options = removeBlankAttrs({
	/* General settings */
	"db": getConsole('db') || `${EZ_DIR}/et.db`,
	"geoip-db": getConsole('geoip_db'),

	/* Logging settings */
	"console-log-level": console_log_level,
	"file-log-level": file_log_level,
	"file-log-dir": RUN_DIR,

	/* Config server settings */
	"config-server-protocol": getConsole('config_server_protocol') || 'udp',
	"config-server-port": strToInt(getConsole('config_server_port')) || 22020,
	"heartbeat-min-response-ms": strToInt(getConsole('heartbeat_min_response_ms')) || 3500,
	"heartbeat-timeout-ms": strToInt(getConsole('heartbeat_timeout_ms')) || 15000,
	...(strToBool(getConsole('as_gateway')) ? {
		"gateway-peer-url": getConsole('gateway_peer_url'),
		"gateway-relay-data": strToBool(getConsole('gateway_relay_data')),
	} : {}),

	/* Webhook settings */
	/*
	...(getConsole('webhook_url') ? {
		"webhook-url": getConsole('webhook_url'),
		"webhook-secret": getConsole('webhook_secret'),
		"internal-auth-token": getConsole('internal_auth_token'),
		"web-instance-id": getConsole('web_instance_id'),
		"web-instance-api-base-url": getConsole('web_instance_api_base_url'),
	} : {}),
	*/

	/* Web server settings */
	"api-server-addr": api_server_addr,
	"api-server-port": api_server_port,
	...(!ubus.call('luci.ezet', 'get_features')?.embed_frontend || strToBool(getConsole('no_web')) ? {
		"no-web": true,
	} : {
		"web-server-addr": web_server_addr,
		"web-server-port": web_server_port,
		"api-host": api_host,
	}),

	/* Authentication settings */
	...(strToBool(getConsole('disable_registration')) ? {
		"disable-registration": true,
	} : {
		"allow-auto-create-user": strToBool(getConsole('allow_auto_create_user')),
		...(getConsole('oidc_issuer_url') ? {
			"oidc-issuer-url": getConsole('oidc_issuer_url'),
			"oidc-client-id": getConsole('oidc_client_id'),
			"oidc-client-secret": getConsole('oidc_client_secret'),
			"oidc-username-claim": getConsole('oidc_username_claim'), // preferred_username
			"oidc-scopes": join(',', getConsole('oidc_scopes')), // openid,profile
			"oidc-disable-pkce": strToBool(getConsole('oidc_disable_pkce')),
			"oidc-redirect-url": getConsole('oidc_redirect_url'), // http://api.my-domain.lan:11211/api/v1/auth/oidc/callback
			"oidc-frontend-base-url": getConsole('oidc_frontend_base_url'), // http://dash.my-domain.lan:11211/
		} : {}),
	}),
});

printf('%.J\n', {options: options});
