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
		/* General END */

		return m.render();
	}
});
