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

return view.extend({
	load() {
		return Promise.all([
			uci.load('ezet'),
			callGetHostInfo(),
		]);
	},

	render(data) {
		const hostInfo = data[1];

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
		/* General END */

		return m.render();
	}
});
