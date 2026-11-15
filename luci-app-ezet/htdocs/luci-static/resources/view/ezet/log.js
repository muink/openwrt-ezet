'use strict';
'require dom';
'require form';
'require fs';
'require poll';
'require rpc';
'require uci';
'require ui';
'require view';

'require ezet as ez';

document.querySelector('head').appendChild(E('style', [
	'\
	#log_textarea {\
		padding: 10px;\
		text-align: left;\
	}\
	#log_textarea pre {\
		padding: .5rem;\
		word-break: break-all;\
		margin: 0;\
	}\
	'
]));

const RUN_DIR = '/var/run/ezet';

function getRuntimeLog(name, option_index, section_id, in_table) {
	const filename = this.option.split('_')[1];

	let section, option, log_level_el;
	switch (filename) {
		case 'ezet':
			section = null;
			option = null;
			break;
		case 'easytier-core':
			section = 'global';
			option = 'file_log_level';
			break;
		case 'easytier-web':
			section = 'web';
			option = 'file_log_level';
			break;
	}

	if (section) {
		const selected = uci.get('ezet', section, option) || 'warning';

		log_level_el = E('select', {
			'id': this.cbid(section_id),
			'class': 'cbi-input-select',
			'style': 'margin-left: 4px; width: 6em;',
			'change': ui.createHandlerFn(this, (ev) => {
				uci.set('ezet', section, option, ev.target.value);
				return this.map.save(null, true).then(() => {
					ui.changes.apply(true);
				});
			})
		});

		ez.log_levels.forEach(([k, v]) => {
			log_level_el.appendChild(E('option', {
				'value': k,
				'selected': (k === selected) ? '' : null
			}, [ v ]));
		});
	}

	const callLogClean = rpc.declare({
		object: 'luci.ezet',
		method: 'log_clean',
		params: ['type'],
		expect: { '': {} }
	});

	const log_textarea = E('div', { 'id': 'log_textarea' },
		E('pre', {
			'class': 'spinning'
		}, _('Collecting data...'))
	);

	let log;
	poll.add(function() {
		return fs.read_direct(String.format('%s/%s.log', RUN_DIR, filename), 'text')
		.then((res) => {
			log = E('pre', { 'wrap': 'pre' }, [
				res.trim() || _('Log is empty.')
			]);

			dom.content(log_textarea, log);
		}).catch((err) => {
			if (err.toString().includes('NotFoundError'))
				log = E('pre', { 'wrap': 'pre' }, [
					_('Log file does not exist.')
				]);
			else
				log = E('pre', { 'wrap': 'pre' }, [
					_('Unknown error: %s').format(err)
				]);

			dom.content(log_textarea, log);
		});
	});

	return E([
		E('div', {'class': 'cbi-map'}, [
			E('h3', {'name': 'content', 'style': 'align-items: center; display: flex;'}, [
				_('%s log').format(name),
				log_level_el || '',
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'style': 'margin-left: 4px;',
					'click': ui.createHandlerFn(this, () => {
						return L.resolveDefault(callLogClean(filename), {});
					})
				}, [ _('Clean log') ])
			]),
			E('div', {'class': 'cbi-section'}, [
				log_textarea,
				E('div', {'style': 'text-align:right'},
					E('small', {}, _('Refresh every %s seconds.').format(L.env.pollinterval))
				)
			])
		])
	]);
}

return view.extend({
	render(data) {
		let m, s, o, ss, so;

		m = new form.Map('ezet');

		s = m.section(form.NamedSection, 'config', 'ezet');

		/* Eztier START */
		s.tab('ezet', _('Eztier'));
		o = s.taboption('ezet', form.SectionValue, '_ezet', form.NamedSection, 'config', 'ezet');
		ss = o.subsection;

		so = ss.option(form.DummyValue, '_ezet_logview');
		so.render = L.bind(getRuntimeLog, so, _('Eztier'));
		/* Eztier END */

		/* Easytier core START */
		s.tab('easytier_core', _('Easytier core'));
		o = s.taboption('easytier_core', form.SectionValue, '_easytier_core', form.NamedSection, 'config', 'ezet');
		ss = o.subsection;

		so = ss.option(form.DummyValue, '_easytier-core_logview');
		so.render = L.bind(getRuntimeLog, so, _('Easytier core'));
		/* Easytier core END */

		/* Easytier web START */
		s.tab('easytier_web', _('Easytier web'));
		o = s.taboption('easytier_web', form.SectionValue, '_easytier_web', form.NamedSection, 'config', 'ezet');
		ss = o.subsection;

		so = ss.option(form.DummyValue, '_easytier-web_logview');
		so.render = L.bind(getRuntimeLog, so, _('Easytier web'));
		/* Easytier web END */

		return m.render();
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
