'use strict';
'require form';
'require rpc';
'require uci';
'require view';
'require validation';

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

const stubValidator = {
	factory: validation,
	apply(type, value, args) {
		if (value != null)
			this.value = value;

		return validation.types[type].apply(this, args || []);
	},
	assert(condition) {
		return !!condition;
	}
};

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

function ipv6CidrToRange(cidr) {
	const [addr, prefix] = cidr.split('/');
	const words = validation.parseIPv6(addr);

	const start = [];
	const end = [];

	for (let i = 0; i < 8; i++) {
		const bits = prefix - i * 16;
		const mask = bits <= 0 ? 0 :
			bits >= 16 ? 0xffff :
			(0xffff << (16 - bits)) & 0xffff;

		start.push(words[i] & mask);
		end.push((words[i] & mask) | (0xffff ^ mask));
	}

	const format = words => words
		.map(word => word.toString(16))
		.join(':');

	return [format(start), format(end)];
}

function ipv6RangeContains(outer, inner) {
	return stubValidator.apply('iprange6', `${outer[0]}-${inner[0]}`) &&
		stubValidator.apply('iprange6', `${inner[1]}-${outer[1]}`);
}

function renderURIs(s, uciconfig, isServer = false) {
	let o;

	o = s.option(form.DummyValue, 'uri', _('URI'));
	o.write = form.AbstractValue.prototype.write;
	o.remove = form.AbstractValue.prototype.remove;
	o.editable = true;

	o = s.option(ez.GroupListValue, 'scheme', _('Scheme'));
	o.default = ez.peers_type[0].types[0][0];
	for (const {label, types} of ez.peers_type) {
		types.forEach((res) => o.value.call(o, res, label));
	}
	o.load = function(section_id) {
		return new PeerURI(uci.get(uciconfig, section_id, 'uri')).getKey('scheme');
	}
	o.onchange = function(ev, section_id, value) {
		const UIEl = this.section.getUIElement(section_id, 'uri');

		let newvalue = new PeerURI(UIEl.getValue()).setKey('scheme', value).toString();

		UIEl.node.previousSibling.innerText = newvalue;
		UIEl.setValue(newvalue);
	}
	o.write = function() {};
	o.modalonly = true;

	o = s.option(form.Value, 'host', _('Address'));
	o.datatype = 'host';
	if (isServer)
		o.placeholder = '::';
	else
		o.placeholder = 'host';
	o.load = function(section_id) {
		return new PeerURI(uci.get(uciconfig, section_id, 'uri')).getKey('hostname').replace(/^\[/, '').replace(/\]$/, '') || this.default;
	}
	o.onchange = function(ev, section_id, value) {
		const UIEl = this.section.getUIElement(section_id, 'uri');

		let newvalue = new PeerURI(UIEl.getValue()).setKey('hostname', value.match(':') ? `[${value}]` : value).toString();

		UIEl.node.previousSibling.innerText = newvalue;
		UIEl.setValue(newvalue);
	}
	o.write = function() {};
	o.rmempty = false;
	o.modalonly = true;

	o = s.option(form.Value, 'port', _('Port'));
	o.datatype = 'port';
	o.placeholder = '11010';
	o.load = function(section_id) {
		return new PeerURI(uci.get(uciconfig, section_id, 'uri')).getKey('port');
	}
	o.onchange = function(ev, section_id, value) {
		const UIEl = this.section.getUIElement(section_id, 'uri');

		let newvalue = new PeerURI(UIEl.getValue()).setKey('port', value).toString();

		UIEl.node.previousSibling.innerText = newvalue;
		UIEl.setValue(newvalue);
	}
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
	o.write = function() {};
	o.modalonly = true;

	o = s.option(form.Value, 'path', _('Path'));
	o.placeholder = '/';
	o.load = function(section_id) {
		return new PeerURI(uci.get(uciconfig, section_id, 'uri')).getKey('pathname');
	}
	o.onchange = function(ev, section_id, value) {
		const UIEl = this.section.getUIElement(section_id, 'uri');

		let newvalue = new PeerURI(UIEl.getValue()).setKey('pathname', value).toString();

		UIEl.node.previousSibling.innerText = newvalue;
		UIEl.setValue(newvalue);
	}
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
	o.write = function() {};
	o.modalonly = true;
}

function validateTotalPeers(section_id, value) {
	const peers = this.section.getOption('peers').formvalue(section_id);
	const external_node = this.section.getOption('external_node').formvalue(section_id);
	value = peers.concat(external_node).filter(Boolean);

	if (value.length == 0)
		return _('Expecting: %s').format(_('least one peer required'));

	return true;
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

		s = m.section(form.NamedSection, 'config', 'ezet');

		/* General START */
		s.tab('general', _('General'));

		/* Global settings */
		o = s.taboption('general', form.SectionValue, '_global', form.NamedSection, 'global', 'core', _('Global settings'));
		ss = o.subsection;

		so = ss.option(form.Flag, 'enable', _('Enable'));
		so.ucisection = 'config';
		so.default = so.disabled;

		so = ss.option(form.ListValue, 'console_log_level', _('Console log level'));
		so.default = 'info';
		ez.log_levels.forEach((res) => {
			so.value.apply(so, res);
		})

		so = ss.option(form.ListValue, 'file_log_level', _('File log level'));
		so.default = 'warn';
		ez.log_levels.forEach((res) => {
			so.value.apply(so, res);
		})

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
			const external_node = this.section.getOption('external_node').formvalue(section_id);
			const peers_public_key = peers.concat(external_node).filter(Boolean)
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
		so.datatype = 'ip4addr';
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
		so.rmempty = false;
		so.depends('dhcp', '0');

		so = ss.taboption('field_Base', form.Flag, 'dhcpv6', _('DHCPv6'));
		so.default = so.enabled;
		so.modalonly = true;

		so = ss.taboption('field_Base', form.Value, 'ipv6', _('Virtual IPv6 address'));
		so.datatype = 'ip6ula';
		so.placeholder = 'fd12:3456:789a::1/64';
		so.textvalue = function(section_id) {
			let cval = this.cfgvalue(section_id) || this.default;
			let dhcp = function() {
				let cval = this.cfgvalue(section_id) || this.default;
				return (cval == this.enabled) ? true : false;
			}.call(this.section.getOption('dhcpv6'));
			return dhcp ? _('DHCPv6') : cval;
		}
		so.rmempty = false;
		so.depends('dhcpv6', '0');

		so = ss.taboption('field_Base', form.Flag, 'ipv6_public_addr_auto', _('IPv6 GUA'),
			_('Auto-obtain a IPv6 GUA from a peer that shares its IPv6 subnet.'));
		so.default = so.disabled;

		so = ss.taboption('field_Base', form.MultiValue, 'peers', _('Trusted peers'));
		so.value('', _('-- Please choose --'));
		so.load = function(section_id) {
			return ez.loadLabel.call(this, [
				['', _('-- Please choose --')],
				...ez.loadLabelValues(this.config, 'peer', {type: 'private'})
			], section_id);
		}
		so.validate = validateTotalPeers;
		so.modalonly = true;

		so = ss.taboption('field_Base', form.ListValue, 'external_node', _('Public shared node'),
			_('Use a public shared node to discover peers.'));
		so.value('', _('none'));
		so.load = function(section_id) {
			return ez.loadLabel.call(this, [
				['', _('none')],
				...ez.loadLabelValues(this.config, 'peer', {type: 'public'})
			], section_id);
		}
		so.validate = validateTotalPeers;
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
		so.depends('secure_mode', '1');
		so.modalonly = true;

		so = ss.taboption('field_secure', ez.CopyValue, 'local_public_key', _('Client public key'),
			_('Base64 encoded X25519 public key.'));
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
				if (stubValidator.apply('cidr6', value)) {
					const UIEl = this.getUIElement(section_id);

					const fmtValue = `${ipv6CidrToRange(value)[0].replace(/(:0)+/, '::')}/${value.split('/')[1]}`;
					UIEl.setValue(fmtValue);

					this.super('validate', section_id, fmtValue);
				}
			}
			so.validate = function(section_id, value) {
				const UIEl = this.getUIElement(section_id);
				value = UIEl.getValue();

				if (!value)
					return true;

				const outer = ipv6CidrToRange(pd);
				const inner = ipv6CidrToRange(value);

				if (!ipv6RangeContains(outer, inner))
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
			return ez.loadLabel.call(this, [
				['', _('-- Please choose --')],
				...ez.loadLabelValues(this.config, 'listener', {type: 'listeners'})
			], section_id);
		}
		so.retain = true;
		so.depends({no_listener: '1', '!reverse': true});
		so.modalonly = true;

		so = ss.taboption('field_server', form.MultiValue, 'mapped_listeners', _('Mapped-listeners'));
		so.value('', _('-- Please choose --'));
		so.load = function(section_id) {
			return ez.loadLabel.call(this, [
				['', _('-- Please choose --')],
				...ez.loadLabelValues(this.config, 'listener', {type: 'mapped_listeners'})
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

		so = ss.option(form.ListValue, 'type', _('Type'));
		so.value('private', _('Private trusted'));
		so.value('public', _('Publicly shared'));
		so.textvalue = ez.textvalue2Value;

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
			if (value === 'mapped_listeners') {
				const host = this.section.getOption('host').formvalue(section_id);

				if (stubValidator.apply('hostname', host) === true)
					return true;

				if (stubValidator.apply('ip4addr', host) === true) {
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
