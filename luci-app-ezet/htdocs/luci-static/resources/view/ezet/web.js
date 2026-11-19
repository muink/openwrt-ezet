'use strict';
'require form';
'require poll';
'require uci';
'require view';

'require ezet as ez';

return view.extend({
	load() {
		return Promise.all([
			uci.load('ezet'),
			ez.getFeatures(),
		]);
	},

	render(data) {
		const features = data[1];

		let m, s, o;

		m = new form.Map('ezet', _('Web Console'));

		s = m.section(form.TypedSection);
		s.render = function () {
			poll.add(function() {
				return ez.getServiceStatus('easytier-web', 'running').then((isRunning) => {
					ez.updateStatus(document.getElementById('_web_bar'), isRunning, 'easytier-web', true);
				});
			});

			return E('div', { class: 'cbi-section' }, [
				E('p', [
					ez.renderStatus('_web_bar', false, 'easytier-web', true)
				])
			]);
		}

		s = m.section(form.NamedSection, 'console', 'web');

		/* Tabs */
		s.tab('field_general', _('General'));
		s.tab('field_cfgserv', _('Config server'));
		s.tab('field_webhook', _('Webhook'));
		s.tab('field_webserv', _('Web server'));
		s.tab('field_authent', _('Authentication'));

		/* Server switch */
		o = s.taboption('field_general', form.Button, '_reload_web', _('Quick Reload'));
		o.ucisection = 'config';
		o.inputtitle = _('Reload');
		o.inputstyle = 'apply';
		o.onclick = L.bind(ez.handleReload, o, 'easytier-web');

		o = s.taboption('field_general', form.Flag, 'web_enabled', _('Enable'));
		o.ucisection = 'config';
		o.default = o.disabled;
		if (!features.web_version){
			o.description = _('To enable, you need to install %s.')
				.format('<code>easytier-web</code>');
			o.readonly = true;
			uci.set(data[0], o.section.section, o.option, '');
			uci.save()
				.then(L.bind(o.map.reset, o.map));
		}

		o = s.taboption('field_general', form.MultiValue, 'web_firewall', _('Firewall'),
			_('Auto configure firewall') + '</br>' +
			_('For HTTP, recommended to use a reverse proxy.'));
		o.ucisection = 'config';
		o.value('config_server', _('Config server'));
		o.value('api_server', _('API server'));
		if (features.embed_frontend)
			o.value('web_server', _('Frontend server'));
		else {
			uci.set(data[0], o.section.section, o.option,
				(uci.get(data[0], o.section.section, o.option) || []).filter(e => e !== 'web_server')
			);
			uci.save()
				.then(L.bind(o.map.reset, o.map));
		}

		/* General fields */
		o = s.taboption('field_general', form.ListValue, 'console_log_level', _('Console log level'));
		o.default = 'warn';
		ez.log_levels.forEach((res) => {
			o.value.apply(o, res);
		})

		o = s.taboption('field_general', form.Value, 'db', _('Database path'),
			_('Path to the SQLite database file.'));
		o.datatype = 'file';
		o.placeholder = `${ez.EZ_DIR}/` + 'et.db';

		o = s.taboption('field_general', form.Value, 'geoip_db', _('GeoIP database path'),
			_('Path to the GeoIP2 database file.') + '</br>' +
			_('Leave empty to use the embedded database.'));
		o.datatype = 'file';
		o.placeholder = '/path/to/GeoLite.mmdb';

		/* Config server fields */
		o = s.taboption('field_cfgserv', form.ListValue, 'config_server_protocol', _('Config server listen protocol'));
		o.default = 'udp';
		ez.peers_type.filter(t => t.id === 'protocol')[0].types
			.filter(e => ['udp', 'tcp', 'ws'].includes(e[0]))
			.forEach((res) => o.value.apply(o, res));

		o = s.taboption('field_cfgserv', form.Value, 'config_server_port', _('Config server listen port'),
			_('Port used for <code>easytier-core</code> connect to.'));
		o.datatype = 'port';
		o.placeholder = '22020';
		o.rmempty = false;

		o = s.taboption('field_cfgserv', form.Value, 'heartbeat_min_response_ms', _('Heartbeat minimum response interval'),
			_('Config-server heartbeat interval.') + '</br>' +
			_('In milliseconds.'));
		o.datatype = 'uinteger';
		o.placeholder = '3500';

		o = s.taboption('field_cfgserv', form.Value, 'heartbeat_timeout_ms', _('Heartbeat timeout'),
			_('Config-server heartbeat RPC timeout.') + '</br>' +
			_('In milliseconds.'));
		o.datatype = 'uinteger';
		o.placeholder = '15000';

		o = s.taboption('field_cfgserv', form.Flag, 'as_gateway', _('As gateway'));
		o.default = o.disabled;

		o = s.taboption('field_cfgserv', form.Value, 'gateway_peer_url', _('Gateway peer URL'),
			_('This gateway address used for core nodes to connect to.') + '</br>' +
			_('Use a LAN, VPN, or public address reachable by the nodes.') + '</br>' +
			_('Must match the %s&%s.').format(_('Config server listen protocol'), _('port')));
		o.placeholder = 'udp://cfg.my-domain.lan:22020';
		o.validate = function(section_id, value) {
			const widget = this.getUIElement(section_id).node.querySelector('input');
			const config_server_protocol = this.section.getOption('config_server_protocol').formvalue(section_id);
			const config_server_port = this.section.getOption('config_server_port').formvalue(section_id);

			widget.placeholder = `${config_server_protocol}://cfg.my-domain.lan:${config_server_port}`;

			if (!value)
				return _('Expecting: %s').format(_('non-empty value'));

			return ez.validateUrl.apply(this, arguments);
		}
		o.depends('as_gateway', '1');

		o = s.taboption('field_cfgserv', form.Flag, 'gateway_relay_data', _('Gateway relay data'),
			_('Allow the gateway to relay data traffic for other peers.'));
		o.default = o.disabled;
		o.depends('as_gateway', '1');

		/* Webhook & instance fields */ // Conflict with Gateway
		/*
		o = s.taboption('field_webhook', form.Value, 'webhook_url', _('Webhook URL'),
			_('Base URL of the webhook endpoint for token validation and event delivery.') + '</br>' +
			_('When set, incoming tokens are validated via this webhook before local fallback.'));
		o.placeholder = 'https://auth.example.com';
		o.validate = ez.validateUrl;

		o = s.taboption('field_webhook', ez.GenValue, 'webhook_secret', _('Webhook secret'),
			_('Shared secret used to authenticate outbound webhook calls.'));
		o.password = true;
		o.retain = true;
		o.rmempty = false;
		o.depends({webhook_url: /.+/});

		o = s.taboption('field_webhook', form.Value, 'internal_auth_token', _('Internal auth token'),
			_('API requests with this <code>X-Internal-Auth</code> token header bypass session authentication.'));
		o.password = true;
		o.retain = true;
		o.depends({webhook_url: /.+/});

		o = s.taboption('field_webhook', form.Value, 'web_instance_id', _('Web instance ID'),
			_('Stable identifier for this <code>easytier-web</code> instance when routing webhook callbacks.'));
		o.placeholder = 'web-server-02';
		o.retain = true;
		o.depends({webhook_url: /.+/});

		o = s.taboption('field_webhook', form.Value, 'web_instance_api_base_url', _('Web instance API base URL'),
			_('Reachable base URL for this <code>easytier-web</code> instance\'s internal REST API.'));
		o.placeholder = 'http://api.my-domain.lan:11211/';
		o.validate = function(section_id, value) {
			const widget = this.getUIElement(section_id).node.querySelector('input');
			const api_server_port = this.section.getOption('api_server_port').formvalue(section_id);

			widget.placeholder = `http://api.my-domain.lan:${api_server_port}/`;

			return ez.validateUrl.apply(this, arguments);
		}
		o.depends({webhook_url: /.+/});
		*/

		/* Web server fields */
		// Backend
		o = s.taboption('field_webserv', form.Value, 'api_server_addr', _('API listen address'),
			_('Listen address of the RESTful API server.'));
		o.datatype = 'ipaddr(1)';
		o.placeholder = '::';

		o = s.taboption('field_webserv', form.Value, 'api_server_port', _('API listen port'),
			_('Port used by the RESTful API server.'));
		o.datatype = 'port';
		o.placeholder = '11211';
		o.rmempty = false;

		// Frontend
		o = s.taboption('field_webserv', form.Value, 'api_host', _('Preset API host'),
			_('Preset API server URL used by the web frontend to connect to.'));
		o.placeholder = 'http://api.my-domain.lan:11211';
		o.validate = function(section_id, value) {
			const widget = this.getUIElement(section_id).node.querySelector('input');
			const api_server_port = this.section.getOption('api_server_port').formvalue(section_id);

			widget.placeholder = `http://api.my-domain.lan:${api_server_port}`;

			if (!value)
				return _('Expecting: %s').format(_('non-empty value'));

			return ez.validateUrl.apply(this, arguments);
		}
		o.depends({no_web: '1', '!reverse': true});

		o = s.taboption('field_webserv', form.Flag, 'no_web', _('Disable web dashboard'),
			_('Disable web frontend.'));
		o.default = o.disabled;
		if (!features.embed_frontend) {
			o.description = _('To enable, you need to install %s with %s feature.')
				.format('<code>easytier-web</code>', '<code>embed</code>');
			o.readonly = true;
			uci.set(data[0], o.section.section, o.option, '1');
			uci.save()
				.then(L.bind(o.map.reset, o.map));
		}

		o = s.taboption('field_webserv', form.Value, 'web_server_addr', _('Frontend listen address'),
			_('Only effective when the %s/%s differs from the API listen.')
		.format(_('Frontend listen address'), _('port')));
		o.datatype = 'ipaddr(1)';
		o.placeholder = '::';
		o.retain = true;
		o.depends({no_web: '1', '!reverse': true});

		o = s.taboption('field_webserv', form.Value, 'web_server_port', _('Frontend listen port'),
			_('Leave empty to use the %s.').format(_('API listen port')));
		o.datatype = 'port';
		o.retain = true;
		o.depends({no_web: '1', '!reverse': true});

		/* Authentication fields */
		o = s.taboption('field_authent', form.Flag, 'disable_registration', _('Disable user registration'));
		o.default = o.disabled;

		o = s.taboption('field_authent', form.Flag, 'allow_auto_create_user', _('Allow automatic user creation'),
			_('Auto-creating local user when <code>easytier-core</code> connects with an unknown username.'));
		o.default = o.disabled;
		o.retain = true;
		o.depends({disable_registration: '1', '!reverse': true});

		/*
		 * OIDC
		 *
		 * https://docs.gitlab.com/integration/openid_connect_provider/
		 * https://developers.google.com/identity/openid-connect/openid-connect
		 */
		o = s.taboption('field_authent', form.Flag, 'oidc_enabled', _('OIDC'));
		o.default = o.disabled;
		o.retain = true;
		o.depends({disable_registration: '1', '!reverse': true});

		o = s.taboption('field_authent', form.Value, 'oidc_issuer_url', _('OIDC issuer URL'),
			_('OIDC issuer URL for single sign-on authentication.'));
		o.placeholder = _('Obtain from OIDC issuer');
		o.validate = ez.validateUrl;
		o.retain = true;
		o.rmempty = false;
		o.depends('oidc_enabled', '1');

		o = s.taboption('field_authent', form.Value, 'oidc_client_id', _('OIDC client ID'));
		o.placeholder = _('Obtain from OIDC issuer');
		o.retain = true;
		o.rmempty = false;
		o.depends('oidc_enabled', '1');

		o = s.taboption('field_authent', form.Value, 'oidc_client_secret', _('OIDC client secret'));
		o.placeholder = _('Obtain from OIDC issuer');
		o.password = true;
		o.retain = true;
		o.rmempty = false;
		o.depends('oidc_enabled', '1');

		o = s.taboption('field_authent', form.ListValue, 'oidc_username_claim', _('OIDC claim'),
			_('Which OIDC claim used as the local username.'));
		o.default = 'preferred_username';
		o.value('sub');
		o.value('preferred_username');
		o.value('email');
		o.retain = true;
		o.depends('oidc_enabled', '1');

		o = s.taboption('field_authent', form.DynamicList, 'oidc_scopes', _('OIDC scopes'),
			_('OIDC scopes to request during login.'));
		o.default = ['openid', 'profile'];
		o.value('openid');
		o.value('profile');
		o.value('email');
		o.value('offline_access');
		o.retain = true;
		o.rmempty = false;
		o.depends('oidc_enabled', '1');

		o = s.taboption('field_authent', form.Flag, 'oidc_disable_pkce', _('Disable OIDC PKCE'));
		o.default = o.disabled;
		o.retain = true;
		o.depends('oidc_enabled', '1');

		o = s.taboption('field_authent', form.Value, 'oidc_redirect_url', _('OIDC callback URL'),
			_('Must exactly match the callback URL registered with the identity provider.'));
		o.placeholder = 'http://api.my-domain.lan:11211/api/v1/auth/oidc/callback';
		o.validate = function(section_id, value) {
			const widget = this.getUIElement(section_id).node.querySelector('input');
			const api_server_port = this.section.getOption('api_server_port').formvalue(section_id);

			widget.placeholder = `http://api.my-domain.lan:${api_server_port}/api/v1/auth/oidc/callback`;

			if (!value)
				return _('Expecting: %s').format(_('non-empty value'));

			return ez.validateUrl.apply(this, arguments);
		}
		o.depends('oidc_enabled', '1');

		// Frontend
		o = s.taboption('field_authent', form.Value, 'oidc_frontend_base_url', _('Web frontend base URL'),
			_('The frontend URL to redirect to after backend successful authentication.') + '</br>' +
			_('Required when the frontend and API are deployed separately.'));
		o.placeholder = 'http://dash.my-domain.lan:11211/';
		o.validate = function(section_id, value) {
			const widget = this.getUIElement(section_id).node.querySelector('input');
			const api_server_port = this.section.getOption('api_server_port').formvalue(section_id);
			const web_server_port = this.section.getOption('web_server_port').formvalue(section_id);

			widget.placeholder = `http://dash.my-domain.lan:${web_server_port || api_server_port}/`;

			if (!value)
				return _('Expecting: %s').format(_('non-empty value'));

			return ez.validateUrl.apply(this, arguments);
		}
		o.depends({oidc_enabled: '1', no_web: '1'});
		o.depends({oidc_enabled: '1', web_server_addr: /.+/});
		o.depends({oidc_enabled: '1', web_server_port: /.+/});

		return m.render();
	}
});
