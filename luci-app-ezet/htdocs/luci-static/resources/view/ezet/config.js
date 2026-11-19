'use strict';
'require form';
'require poll';
'require rpc';
'require uci';
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
			callGetV6GUAPrefix(),
		]);
	},

	render(data) {
		const hostInfo = data[1];
		const ip6guaPrefix = data[2];

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
		so.validate = ez.validateUUID;

		so = ss.option(form.Value, 'hostname', _('Hostname'));
		so.datatype = 'hostname';
		so.placeholder = hostInfo.hostname;

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

		ss.tab('field_Base', _('Base fields'));
		ss.tab('field_secure', _('🔒Secure fields'));
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
		so.editable = true;

		so = ss.taboption('field_Base', form.Flag, 'private_mode', _('Private room'),
			_('Only nodes using the same %s and %s as this network are permitted to perform a handshake or relay traffic through this node.')
			.format(_('Room name'), _('Room secret')));
		so.default = so.disabled;
		so.editable = true;

		so = ss.taboption('field_Base', form.Flag, 'secure_mode', _('🔒Secure mode'));
		so.default = so.disabled;
		so.validate = function(section_id, value) {
			const secure_mode = this.getUIElement(section_id).node.querySelector('input');
			const peers = this.section.getOption('peers').formvalue(section_id);
			const peers_public_key = peers.filter(Boolean)
				.map(sid => uci.get(this.config, sid, 'peer_public_key')).filter(Boolean);

			// Force enabled
			if (peers_public_key.length > 0) {
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

		/** Secure fields **/
		so = ss.taboption('field_secure', ez.GenValue, 'local_private_key', _('Client private key'),
			_('Base64 encoded X25519 private key.'));
		so.ez_options = {
			type: 'wg-keypair',
			callback: function(result) {
				return [
					[this.option, result.private_key],
					['local_public_key', result.public_key]
				]
			}
		}
		so.password = true;
		so.validate = L.bind(ez.validateBase64Key, so, 44);
		so.rmempty = false;
		so.retain = true;
		so.depends('secure_mode', '1');
		so.modalonly = true;

		so = ss.taboption('field_secure', ez.CopyValue, 'local_public_key', _('Client public key'),
			_('Base64 encoded X25519 public key.'));
		so.retain = true;
		so.depends('secure_mode', '1');
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

		/* Peers START */
		s.tab('peers', _('Peers'));

		/* Peers grid */
		o = s.taboption('peers', form.SectionValue, '_peer', ez.GridSection, 'peer', null);
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
		o = s.taboption('listeners', form.SectionValue, '_listener', ez.GridSection, 'listener', null);
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
