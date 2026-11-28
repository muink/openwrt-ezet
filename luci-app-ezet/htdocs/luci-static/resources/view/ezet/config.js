'use strict';
'require form';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

'require ezet as ez';

const callGetHostInfo = rpc.declare({
	object: 'luci.ezet',
	method: 'get_host_info',
	expect: { '': {} }
});

const callGetV6GUAPrefix = rpc.declare({
	object: 'luci.ezet',
	method: 'detect_ipv6_gua_prefix',
	expect: { '': {} }
});

class PeerURI {
	constructor(uri) {
		this.input = uri || `${ez.peers_type[0].types[0][0]}://`;
		this.url = this.input.split(':');
		this.scheme = this.url.shift();
		this.url = new URL('tcp:' + this.url.join(':'));
		this.urlkeys = ['username', 'password', 'hostname', 'port', 'pathname'];
	}

	getKey(key, value) {
		if (this.urlkeys.includes(key))
			return this.url[key];
		else
			return this[key];
	}

	setKey(key, value) {
		if (this.urlkeys.includes(key))
			this.url[key] = value;
		else
			this[key] = value;

		return this;
	}

	toString() {
		return this.scheme + ':' + this.url.toString().replace(/^[^:]*:/, '');
	}
}

function renderURIs(s, uciconfig, isServer = false) {
	let o;

	o = s.option(form.DummyValue, 'uri', _('URI'));
	o.load = function(section_id) {
		const value = this.super('load', section_id);

		this[`${this.option}_${section_id}`] = new PeerURI(value);

		return value;
	}
	o.instget = function(section_id) {return this[`${this.option}_${section_id}`]}
	o.instset = function(section_id, callback = inst => inst) {
		const UIEl = this.getUIElement(section_id);

		const inst = this[`${this.option}_${section_id}`];
		callback(inst);

		UIEl.node.previousSibling.innerText = inst.toString();
		UIEl.setValue(inst.toString());
	}
	o.write = form.AbstractValue.prototype.write;
	o.remove = form.AbstractValue.prototype.remove;
	o.editable = true;

	// common part
	const initPart = function(o, key,
		load_callback = (k, inst) => inst.getKey(k),
		onchange_callback = (k, v, inst) => inst.setKey(k, v)
	) {
		o.load = function(section_id) {
			return load_callback(key, this.section.getOption('uri').instget(section_id));
		}
		o.onchange = function(ev, section_id, value) {
			this.section.getOption('uri').instset(section_id, L.bind(onchange_callback, this, key, value));
		}
		o.write = function() {};
		o.modalonly = true;
	}

	o = s.option(ez.GroupListValue, 'scheme', _('Scheme'));
	o.default = ez.peers_type[0].types[0][0];
	for (const {label, types} of ez.peers_type) {
		types.forEach((res) => o.value.call(o, res, label));
	}
	initPart(o, 'scheme');

	o = s.option(form.Value, 'host', _('Address'));
	o.datatype = 'host';
	if (isServer)
		o.placeholder = '::';
	else
		o.placeholder = 'host';
	initPart(o, 'hostname',
		(k, inst) => inst.getKey(k).replace(/^\[/, '').replace(/\]$/, ''),
		(k, v, inst) => inst.setKey(k, v.match(':') ? `[${v}]` : v)
	);
	o.validate = function(section_id, value) {
		const scheme = this.section.getOption('scheme').formvalue(section_id);

		if (['txt', 'srv'].includes(scheme) && !ez.stubValidator.apply('hostname', value))
			return _('Expecting: %s').format(_('hostname only'));

		return true;
	}
	o.rmempty = false;

	o = s.option(form.Value, 'port', _('Port'));
	o.datatype = 'port';
	o.placeholder = '11010';
	initPart(o, 'port');
	o.validate = function(section_id, value) {
		const widget = this.getUIElement(section_id).node.querySelector('input');
		const scheme = this.section.getOption('scheme').formvalue(section_id);

		// Force disabled
		if (['txt', 'srv'].includes(scheme)) {
			this.onchange(null, section_id, '');
			widget.value = '';
			widget.disabled = true;
		} else {
			widget.removeAttribute('disabled');
			if (!value)
				return _('Expecting: %s').format(_('non-empty value'));
		}

		return true;
	}

	o = s.option(form.Value, 'path', _('Path'));
	o.placeholder = '/';
	initPart(o, 'pathname');
	o.validate = function(section_id, value) {
		const widget = this.getUIElement(section_id).node.querySelector('input');
		const scheme = this.section.getOption('scheme').formvalue(section_id);

		// Force disabled
		if (['ws', 'wss', 'http', 'https'].includes(scheme)) {
			widget.removeAttribute('disabled');
			if (!value)
				return _('Expecting: %s').format(_('non-empty value'));
		} else {
			this.onchange(null, section_id, '');
			widget.value = '';
			widget.disabled = true;
		}

		return true;
	}
}

return view.extend({
	load() {
		return Promise.all([
			uci.load('ezet'),
			callGetHostInfo(),
			ez.getLocalSubnets(),
			callGetV6GUAPrefix(),
		]);
	},

	render(data) {
		const hostInfo = data[1];
		const localSubnets = data[2];
		const ip6guaPrefix = data[3];

		let m, s, o, ss, so;

		m = new form.Map('ezet', _('EasyTier') + ' ' + _('Configuration'),
			_('A simple, decentralized mesh VPN with WireGuard support.'));

		s = m.section(form.TypedSection);
		s.render = function () {
			poll.add(function() {
				return ez.getServiceStatus('easytier-core', 'running').then((isRunning) => {
					ez.updateStatus(document.getElementById('_core_bar'), isRunning, 'easytier-core', true);
				});
			});

			return E('div', { class: 'cbi-section' }, [
				E('p', [
					ez.renderStatus('_core_bar', false, 'easytier-core', true)
				])
			]);
		}

		s = m.section(form.NamedSection, 'config', 'ezet');

		/* General START */
		s.tab('general', _('General'));

		/* Global settings */
		o = s.taboption('general', form.SectionValue, '_global', form.NamedSection, 'global', 'core', _('Global settings'));
		ss = o.subsection;

		/* Client switch */
		so = ss.option(form.Button, '_reload_core', _('Quick Reload'));
		so.ucisection = 'config';
		so.inputtitle = _('Reload');
		so.inputstyle = 'apply';
		so.onclick = L.bind(ez.handleReload, so, 'easytier-core');

		so = ss.option(form.Flag, 'core_enabled', _('Enable'));
		so.ucisection = 'config';
		so.default = so.disabled;

		so = ss.option(form.ListValue, 'console_log_level', _('Console log level'));
		so.default = 'warn';
		ez.log_levels.forEach((res) => {
			so.value.apply(so, res);
		})

		so = ss.option(form.Value, 'config_server', _('Config server'),
			_('Retrieve configuration distributed by the config-server.'));
		so.placeholder = 'udp://example.lan:22020/admin';
		so.validate = ez.validateUrl;

		so = ss.option(form.Value, 'machine_id', _('Machine ID'));
		so.placeholder = hostInfo.machine_id;
		so.default = hostInfo.machine_id;
		so.validate = ez.validateUUID;

		so = ss.option(form.Value, 'hostname', _('Hostname'));
		so.datatype = 'hostname';
		so.placeholder = hostInfo.hostname;

		so = ss.option(form.Value, 'rpc_portal', _('RPC portal'),
			_('RPC portal address to listen for management.'));
		so.datatype = 'hostport';
		so.placeholder = '127.0.0.1:15888';

		so = ss.option(form.DynamicList, 'rpc_portal_whitelist', _('RPC portalr whitelist'),
			_('Only allow these addresses to access rpc portal.'));
		so.datatype = 'ipaddr';
		so.placeholder = '127.0.0.0/8';
		so.default = ['127.0.0.1', '127.0.0.0/8', '::1/128'];
		so.rmempty = false;

		/* Instances management */
		o = s.taboption('general', form.SectionValue, '_instance', ez.GridSection, 'instance', _('Instances management'));
		ss = o.subsection;
		ss.addremove = true;
		ss.rowcolors = true;
		ss.sortable = true;
		ss.nodescriptions = true;
		ss.ez_modaltitle = [ _('Instance'), _('Add a instance') ];
		ss.ez_prefmt = ez.glossary[ss.sectiontype].prefmt;
		ss.ez_lowcase_only = true;
		/* Remove idle files start */
		ss.renderSectionAdd = function(/* ... */) {
			const node = ez.GridSection.prototype.renderSectionAdd.apply(this, arguments);

			node.appendChild(E('button', {
				'class': 'cbi-button cbi-button-add',
				'title': _('Remove idles'),
				'click': ui.createHandlerFn(this, ez.handleRemoveIdles)
			}, [ _('Remove idles') ]));

			return node;
		}
		/* Remove idle files end */

		ss.tab('field_Base', _('Base fields'));
		ss.tab('field_advanced', _('Advanced fields'));
		ss.tab('field_route', _('Route fields'));
		ss.tab('field_server', _('Server fields'));

		/** Base fields **/
		so = ss.taboption('field_Base', form.Value, 'label', _('Label'));
		so.load = ez.loadDefaultLabel;
		so.validate = ez.validateUniqueValue;
		so.modalonly = true;

		so = ss.taboption('field_Base', form.Flag, 'enabled', _('Enable'));
		so.default = so.enabled;
		so.editable = true;

		so = ss.taboption('field_Base', form.Value, 'network_name', _('Room name'));
		so.rmempty = false;

		so = ss.taboption('field_Base', ez.GenValue, 'network_secret', _('Room secret'));
		so.password = true;
		so.modalonly = true;
		so.depends({credential: ''});

		so = ss.taboption('field_Base', form.Value, 'credential', _('Temporary credential'),
			_('Base64 encoded X25519 private key.'));
		so.password = true;
		so.validate = L.bind(ez.validateBase64Key, so, 44);
		so.modalonly = true;

		so = ss.taboption('field_Base', form.Flag, 'secure_mode', _('🔒Secure mode'));
		so.default = so.disabled;
		so.validate = function(section_id, value) {
			const secure_mode = this.getUIElement(section_id).node.querySelector('input');
			const credential = this.section.getOption('credential').formvalue(section_id);
			const peers = this.section.getOption('peers').formvalue(section_id);
			const peers_public_key = peers.filter(Boolean)
				.map(sid => uci.get(this.config, sid, 'peer_public_key')).filter(Boolean);

			// Force enabled
			if (credential || peers_public_key.length > 0) {
				secure_mode.checked = true;
				secure_mode.disabled = true;
			} else
				secure_mode.removeAttribute('disabled');

			return true;
		}

		so = ss.taboption('field_Base', form.Flag, 'dhcp', _('DHCP'));
		so.default = so.enabled;
		so.modalonly = true;

		so = ss.taboption('field_Base', form.Value, 'ipv4', _('Virtual IPv4 address'));
		so.datatype = 'cidr4';
		so.placeholder = '10.11.12.1/24';
		so.validate = function(section_id, value) {
			value = this.formvalue(section_id); // Required. Otherwise, the value will contain only the mask part.

			return ez.validateIPv4Privnet.call(this, section_id, value);
		}
		so.textvalue = function(section_id) {
			let cval = this.cfgvalue(section_id) || this.default;
			let dhcp = function() {
				let cval = this.cfgvalue(section_id) || this.default;
				return (cval == this.enabled) ? true : false;
			}.call(this.section.getOption('dhcp'));
			return dhcp ? _('DHCP') : cval;
		}

		so = ss.taboption('field_Base', form.Flag, 'dhcpv6', _('DHCPv6'));
		so.default = so.enabled;
		so.modalonly = true;

		so = ss.taboption('field_Base', form.Value, 'ipv6', _('Virtual IPv6 address'));
		so.datatype = 'cidr6';
		so.placeholder = 'fd12:3456:789a::1/64';
		so.validate = function(section_id, value) {
			value = this.formvalue(section_id); // Required. Otherwise, the value will contain only the mask part.

			if (!value)
				return true;

			const result = ez.stubValidator.apply('ip6ula', value);
			if (result !== true)
				return _('Expecting: %s').format(_('valid IPv6 ULA address'));

			return true;
		}
		so.textvalue = function(section_id) {
			let cval = this.cfgvalue(section_id) || this.default;
			let dhcp = function() {
				let cval = this.cfgvalue(section_id) || this.default;
				return (cval == this.enabled) ? true : false;
			}.call(this.section.getOption('dhcpv6'));
			return dhcp ? _('DHCPv6') : cval;
		}

		so = ss.taboption('field_Base', form.Flag, 'ipv6_public_addr_auto', _('IPv6 GUA'),
			_('Auto-obtain a IPv6 GUA from a peer that shares its IPv6 subnet.'));
		so.default = so.disabled;

		so = ss.taboption('field_Base', form.MultiValue, 'peers', _('Peers'),
			_('Bootstrap peers.'));
		so.value('', _('-- Please choose --'));
		so.load = function(section_id) {
			return ez.loadChoices.call(this, [
				['', _('-- Please choose --')],
				...ez.loadChoicesGetMap(this.config, 'peer')
			], section_id);
		}
		so.rmempty = false;
		so.modalonly = true;

		/** Advanced fields **/
		so = ss.taboption('field_advanced', form.Flag, 'private_mode', _('Serve members only'),
			_('This node perform handshake or relay traffic only with nodes that:') + '</br>' +
			_('Node use the same %s and %s as this network.')
				.format(_('Room name'), _('Room secret')) + '</br>' +
			_('Or temporary-credential node is already trusted via admin-issued credential propagation.'));
		so.default = so.disabled;
		so.editable = true;

		so = ss.taboption('field_advanced', ez.GenValue, 'local_private_key', _('Client private key'),
			_('Base64 encoded X25519 private key.'));
		so.password = true;
		so.ez_options = {
			type: 'wg-keypair',
			callback: function(result) {
				return [
					[this.option, result.private_key],
					['local_public_key', result.public_key]
				]
			}
		}
		so.validate = L.bind(ez.validateBase64Key, so, 44);
		so.rmempty = false;
		so.retain = true;
		so.depends({secure_mode: '1', credential: ''});
		so.modalonly = true;

		so = ss.taboption('field_advanced', ez.CopyValue, 'local_public_key', _('Client public key'),
			_('Base64 encoded X25519 public key.'));
		so.retain = true;
		so.depends({secure_mode: '1', credential: ''});
		so.modalonly = true;

		so = ss.taboption('field_advanced', form.Value, 'socks5_proxy', _('Socks5 server'),
			_('Allow socks5 client to access virtual network via this server.'));
		so.datatype = 'ipaddrport(1)';
		so.placeholder = '0.0.0.0:1080';

		/** Route fields **/
		so = ss.taboption('field_route', form.MultiValue, 'proxy_networks', _('Subnet proxy'),
			_('Open local IPv4 subnets to other peers via this node in the virtual network.') + '</br>' +
			_('Or mapping the local subnet to a non-overlapping IPv4 subnet in the virtual network.') + '</br>' +
			_('Other peers can access the local devices through the mapped addresses.'));
		so.create = true;
		so.custom_placeholder = '192.168.1.0/24[->198.18.1.0/24]';
		so.placeholder = '192.168.1.0/24[->198.18.1.0/24]';
		so.value('', _('-- Please choose --'));
		so.load = function(section_id) {
			return ez.loadChoices.call(this, [
				['', _('-- Please choose --')],
				...localSubnets.filter(e => e.device !== 'lo')
					.map(e => [e.cidr, E([], [ e.cidr, ' (', E('strong', {}, [e.interface]), ')' ]) ])
			], section_id);
		}
		so.validate = function(section_id, value) {
			const values = value.split(' ');

			for (value of values) {
				if (ez.isEmpty(value))
					return true;

				const parts = value.split('->');

				if (parts.length > 2)
					return _('Expecting: %s').format(_('IPv4 CIDR or IPv4 CIDR mapping (real->mapped).'));
				else if (parts.length === 2) {
					if (!ez.stubValidator.apply('cidr4', parts[1]))
						return _('Expecting: %s').format(_('valid mapped IPv4 CIDR.'));

					const prefix = cidr => cidr.split('/')[1];

					if (prefix(parts[0]) !== prefix(parts[1]))
						return _('Expecting: %s').format(_('mapped CIDR must have the same prefix length as the original CIDR.'));
				} else if (!ez.stubValidator.apply('cidr4', parts[0]))
					return _('Expecting: %s').format(_('valid real IPv4 CIDR.'));
			}

			return true;
		}
		so.modalonly = true;

		so = ss.taboption('field_route', form.MultiValue, 'routes', _('Manual route'),
			_('Manually specify the IPv4 subnets to be accessed via the virtual network.') + '</br>' +
			_('%s and %s will no longer be automatically installed.')
			.format(_('Subnet proxy'), _('Wireguard routes propagated from peers')));
		so.create = true;
		so.custom_placeholder = '192.168.0.0/16';
		so.placeholder = '192.168.0.0/16';
		so.value('', _('-- Please choose --'));
		so.validate = function(section_id, value) {
			const values = value.split(' ');

			for (value of values) {
				if (ez.isEmpty(value))
					return true;

				if (!ez.stubValidator.apply('cidr4', value, [1]))
					return _('Expecting: %s').format(_('valid IPv4 CIDR.'));
			}

			return true;
		}
		so.modalonly = true;

		so = ss.taboption('field_route', form.MultiValue, 'exit_nodes', _('Exit gateway'),
			_('Exit nodes are used to forward traffic destined for outside the virtual network.') + '</br>' +
			_('Allows %s').format(_('Virtual IPv4 address') + '/' + _('Virtual IPv6 address') + '/' + _('IPv6 GUA')));
		so.create = true;
		so.custom_placeholder = '10.11.12.3';
		so.placeholder = '10.11.12.3';
		so.value('', _('-- Please choose --'));
		so.validate = function(section_id, value) {
			const values = value.split(' ');

			for (value of values) {
				if (ez.isEmpty(value))
					return true;

				if (!ez.stubValidator.apply('ipaddr', value, [1]))
					return _('Expecting: %s').format(_('valid IP address.'));
			}

			return true;
		}
		so.modalonly = true;

		/** Server fields **/
		so = ss.taboption('field_server', form.Flag, 'ipv6_public_addr_provider', _('Share IPv6 GUA subnet'),
			_('Share this node\'s IPv6 GUA subnet with other peers so they can obtain IPv6 GUA.'));
		so.default = so.disabled;
		so.modalonly = true;

		so = ss.taboption('field_server', form.Value, 'ipv6_public_addr_prefix', _('Shared IPv6 GUA subnet'),
			_('Manually specify the IPv6 GUA subnet to share, instead of auto-detecting from system routes.'));
		so.datatype = 'cidr6';
		if (ip6guaPrefix.result) {
			const pd = ip6guaPrefix.result.pd;
			const delegated = ip6guaPrefix.result.delegated || [];
			so.placeholder = pd;
			so.onchange = function(ev, section_id, value) {
				if (ez.stubValidator.apply('cidr6', value)) {
					const UIEl = this.getUIElement(section_id);

					const fmtValue = `${ez.ipv6CidrToRange(value)[0].replace(/(:0)+/, '::')}/${value.split('/')[1]}`;
					UIEl.setValue(fmtValue);

					this.super('validate', section_id, fmtValue);
				}
			}
			so.validate = function(section_id, value) {
				const UIEl = this.getUIElement(section_id);
				value = UIEl.getValue();

				if (!value)
					return true;

				const outer = ez.ipv6CidrToRange(pd);
				const inner = ez.ipv6CidrToRange(value);

				if (!ez.ipv6RangeContains(outer, inner))
					return _('Expecting: %s').format(_('IPv6 subnet within the %s range').format(pd));

				for (let route of delegated)
					if (route.dst && route.dst === value)
						return _('Expecting: %s').format(_('IPv6 subnet %s has been delegated').format(route.dst));

				return true;
			}
		} else {
			const errmsg = ip6guaPrefix.error || '';
			so.placeholder = errmsg;
			so.validate = function(section_id, value) {
				if (value)
					return _('Expecting: %s').format(errmsg);

				return true;
			}
		}
		so.depends('ipv6_public_addr_provider', '1');
		so.modalonly = true;

		so = ss.taboption('field_server', form.Flag, 'enable_exit_node', _('As exit gateway'),
			_('Allow this node to be an exit gateway.'));
		so.default = so.disabled;

		so = ss.taboption('field_server', form.Flag, 'no_listener', _('No listener'));
		so.default = so.disabled;

		so = ss.taboption('field_server', form.MultiValue, 'listeners', _('Listeners'));
		so.value('', _('-- Please choose --'));
		so.load = function(section_id) {
			return ez.loadChoices.call(this, [
				['', _('-- Please choose --')],
				...ez.loadChoicesGetMap(this.config, 'listener', {type: 'listeners'})
			], section_id);
		}
		so.retain = true;
		so.depends({no_listener: '1', '!reverse': true});
		so.modalonly = true;

		so = ss.taboption('field_server', form.MultiValue, 'mapped_listeners', _('Mapped-listeners'),
			_('Manually specify the public address of the listener.'));
		so.value('', _('-- Please choose --'));
		so.load = function(section_id) {
			return ez.loadChoices.call(this, [
				['', _('-- Please choose --')],
				...ez.loadChoicesGetMap(this.config, 'listener', {type: 'mapped_listeners'})
			], section_id);
		}
		so.retain = true;
		so.depends({no_listener: '1', '!reverse': true});
		so.modalonly = true;
		/* General END */

		/* STUN START */
		s.tab('stun', _('STUN'));

		/* Global settings */
		o = s.taboption('stun', form.SectionValue, '_stun', form.NamedSection, 'global', 'core', _('Global settings'));
		ss = o.subsection;

		so = ss.option(form.Flag, 'override_stun', _('Custom STUN'),
			_('Override default STUN servers.'));
		so.default = so.disabled;
		so.validate = function(section_id, value) {
			const widget = this.getUIElement(section_id).node.querySelector('input');
			const capabilities = {ipv4: new Set, ipv6: new Set};

			this.map.data.sections(this.config, 'stun_server', cfg => {
				if (cfg.enabled === '0')
					return;

				for (const l3 of cfg.l3.split(','))
					cfg.capabilities.split(',').forEach(e => capabilities[l3].add(e));
			});

			const ipv4valid = ['udp', 'tcp'].every(e => capabilities['ipv4'].has(e));
			const ipv6valid = ['udp'].every(e => capabilities['ipv6'].has(e));

			// Force disabled
			if (ipv4valid || ipv6valid)
				widget.removeAttribute('disabled');
			else {
				widget.checked = false;
				widget.disabled = true;
			}

			if (!ipv4valid)
				return _('Expecting: %s').format(_('collection of %s STUN servers that support %s')
				.format(_('IPv4'), _('UDP/TCP')));

			if (!ipv6valid)
				return _('Expecting: %s').format(_('collection of %s STUN servers that support %s')
				.format(_('IPv6'), _('UDP')));

			return true;
		}

		/* STUN grid */
		o = s.taboption('stun', form.SectionValue, '_stun_server', ez.GridSection, 'stun_server', _('Alternative STUN server'));
		ss = o.subsection;
		ss.anonymous = true;
		ss.addremove = true;
		ss.rowcolors = true;
		ss.sortable = true;
		ss.nodescriptions = true;
		ss.ez_modaltitle = [ _('STUN'), _('Add a STUN server') ];
		//ss.ez_prefmt = ez.glossary[ss.sectiontype].prefmt;
		//ss.ez_lowcase_only = false;
		ss.renderSectionAdd = form.GridSection.prototype.renderSectionAdd;
		ss.handleAdd = form.GridSection.prototype.handleAdd;

		so = ss.option(form.Value, 'label', _('Label'));
		so.load = ez.loadDefaultLabel;
		so.validate = ez.validateUniqueValue;
		so.modalonly = true;

		so = ss.option(form.Flag, 'enabled', _('Enable'));
		so.default = so.enabled;
		so.editable = true;

		so = ss.option(form.Value, 'host', _('Server address'));
		so.datatype = 'or(host, hostport, ipaddrport(1))';
		so.placeholder = 'stun.hot-chilli.net[:3478]';
		so.rmempty = false;

		so = ss.option(form.MultiValue, 'l3', _('L3 protocol'));
		so.default = 'ipv4';
		so.value('ipv4', _('IPv4'));
		so.value('ipv6', _('IPv6'));
		so.load = function(section_id) {
			return this.super('load', section_id)?.split(',');
		}
		so.write = function(section_id, formvalue) {
			return this.super('write', section_id, formvalue.join(','));
		}
		so.rmempty = false;

		so = ss.option(form.MultiValue, 'capabilities', _('Capabilities'));
		so.default = 'udp';
		so.value('udp', _('UDP'));
		so.value('tcp', _('TCP'));
		so.value('tls', _('TLS'));
		so.load = function(section_id) {
			return this.super('load', section_id)?.split(',');
		}
		so.write = function(section_id, formvalue) {
			return this.super('write', section_id, formvalue.join(','));
		}
		so.rmempty = false;
		/* STUN END */

		/* Peers START */
		s.tab('peers', _('Peers'));

		/* Peers grid */
		o = s.taboption('peers', form.SectionValue, '_peer', ez.GridSection, 'peer', _('Peers management'));
		ss = o.subsection;
		ss.addremove = true;
		ss.rowcolors = true;
		ss.sortable = true;
		ss.nodescriptions = true;
		ss.ez_modaltitle = [ _('Peer'), _('Add a peer') ];
		ss.ez_prefmt = ez.glossary[ss.sectiontype].prefmt;
		ss.ez_lowcase_only = false;

		so = ss.option(form.Value, 'label', _('Label'));
		so.load = ez.loadDefaultLabel;
		so.validate = ez.validateUniqueValue;
		so.modalonly = true;

		so = ss.option(form.Flag, 'enabled', _('Enable'));
		so.default = so.enabled;
		so.editable = true;

		so = ss.option(form.Value, 'peer_public_key', _('Peer public key'),
			_('Base64 encoded X25519 public key.'));
		so.validate = L.bind(ez.validateBase64Key, so, 44);
		so.textvalue = function(section_id) {
			return this.cfgvalue(section_id) ? _('🔑') : _('none');
		}

		renderURIs(ss, data[0]);
		/* Peers END */

		/* Listeners START */
		s.tab('listeners', _('Listeners'));

		/* Listeners grid */
		o = s.taboption('listeners', form.SectionValue, '_listener', ez.GridSection, 'listener', _('Listeners management'));
		ss = o.subsection;
		ss.addremove = true;
		ss.rowcolors = true;
		ss.sortable = true;
		ss.nodescriptions = true;
		ss.ez_modaltitle = [ _('Listener'), _('Add a listener') ];
		ss.ez_prefmt = ez.glossary[ss.sectiontype].prefmt;
		ss.ez_lowcase_only = false;

		so = ss.option(form.Value, 'label', _('Label'));
		so.load = ez.loadDefaultLabel;
		so.validate = ez.validateUniqueValue;
		so.modalonly = true;

		so = ss.option(form.Flag, 'enabled', _('Enable'));
		so.default = so.enabled;
		so.editable = true;

		so = ss.option(form.Flag, 'auto_firewall', _('Firewall'),
			_('Auto configure firewall'));
		so.default = so.enabled;
		so.editable = true;

		so = ss.option(form.ListValue, 'type', _('Type'));
		so.value('listeners', _('Listeners'));
		so.value('mapped_listeners', _('Mapped-listeners'));
		so.textvalue = ez.textvalue2Value;
		so.validate = function(section_id, value) {
			const scheme = this.section.getOption('scheme').formvalue(section_id);
			const UIEl = this.section.getUIElement(section_id, 'host');
			const hostEl = UIEl.node.querySelector('input');
			const host = UIEl.getValue();

			if (value === 'listeners') {
				hostEl.placeholder = '::';
				if (ez.peers_type.filter(t => t.id === 'discovery')[0].types.map(e => e[0]).includes(scheme))
					return _('Expecting: %s').format(_('Not is ') + _('Service discovery URI'));
				if (ez.stubValidator.apply('hostname', host) === true)
					return _('Expecting: %s').format(_('valid IPv4/IPv6 address'));
			} else if (value === 'mapped_listeners') {
				hostEl.placeholder = 'host';
				if (ez.stubValidator.apply('hostname', host) === true)
					return true;

				if (ez.stubValidator.apply('ip4addr', host) === true) {
					if (ez.validateIPv4Privnet.call(this, section_id, host) === true)
						return _('Expecting: %s').format(_('valid IPv4 global routable address'));
					else
						return true;
				} else if (ez.stubValidator.apply('ip6addr', host) === true)
					return ez.validateIPv6Guanet.call(this, section_id, host);
			}

			return true;
		}

		renderURIs(ss, data[0], true);
		/* Listeners END */

		return m.render();
	}
});
