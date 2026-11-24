'use strict';
'require form';
'require ui';
'require uci';
'require view';

'require ezet as ez';

document.querySelector('head').appendChild(E('link', {
	'rel': 'stylesheet',
	'type': 'text/css',
	'href': L.resource('view/ezet/credentials.css')
}));

const CBITimeValue = form.DummyValue.extend({
	__name__: 'CBI.TimeValue',

	renderWidget(section_id, option_index, cfgvalue) {
		const node = form.DummyValue.prototype.renderWidget.apply(this, arguments);

		node.firstChild.innerText = formatTime(cfgvalue);

		return node;
	},

	load(section_id) {
		const section = this.ucisection ?? section_id;
		const option = this.ucioption ?? this.option;
		// JSONMap.data.get() only supports Array, Object, String. Not Number, Boolean
		const value = this.map.data.data[section][option];

		return value ?? Math.floor(Date.now() / 1000);
	},

	textvalue(section_id) {
		return formatTime(this.cfgvalue(section_id));
	},

	epochget(section_id) {
		const UIEl = this.getUIElement(section_id);

		return Number(UIEl.getValue() || 0);
	},

	epochset(section_id, epoch) {
		const UIEl = this.getUIElement(section_id);

		UIEl.node.previousSibling.innerText = formatTime(epoch);
		UIEl.setValue(epoch);
	},

	write(section_id, formvalue) {
		const section = this.ucisection ?? section_id;
		const option = this.ucioption ?? this.option;
		// JSONMap.data.set() only supports Array, Object, String. Not Number, Boolean
		this.map.data.data[section][option] = Number(formvalue ?? Math.floor(Date.now() / 1000));
	},

	remove: form.AbstractValue.prototype.remove
});

const CBIBoolean = form.Flag.extend({
	__name__: 'CBI.Boolean',

	__init__(...args) {
		this.super('__init__', args);

		this.enabled = true;
		this.disabled = false;
		this.default = this.disabled;
	},

	load(section_id) {
		const section = this.ucisection ?? section_id;
		const option = this.ucioption ?? this.option;
		// JSONMap.data.get() only supports Array, Object, String. Not Number, Boolean
		return this.map.data.data[section][option] ?? this.default;
	},

	write(section_id, formvalue) {
		const section = this.ucisection ?? section_id;
		const option = this.ucioption ?? this.option;
		// JSONMap.data.set() only supports Array, Object, String. Not Number, Boolean
		this.map.data.data[section][option] = formvalue ?? this.default;
	},

	remove: this.write
});

// https://github.com/openwrt/luci/blob/master/modules/luci-mod-system/htdocs/luci-static/resources/view/system/system.js
function formatTime(epoch) {
	const date = new Date(epoch * 1000);

	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'short',
		timeStyle: 'short',
	}).format(date);
}

function durationToSecond(str) {
	if (ez.isEmpty(str))
		return null;

	let seconds = 0;
	let arr = str.match(/^(\d+)(s|m|h|d)?$/);
	if (arr) {
		switch (arr[2]) {
			case 's':
				seconds = Number(arr[1]);
				break;
			case 'm':
				seconds = (arr[1]) * 60;
				break;
			case 'h':
				seconds = (arr[1]) * 3600;
				break;
			case 'd':
				seconds = (arr[1]) * 86400;
				break;
			default:
				seconds = Number(arr[1]);
				break;
		}
	}

	return seconds;
}
function secondToDuration(uint) {
	uint = Number(uint);

	if (ez.isEmpty(uint))
		return null;

	if (uint >= 86400)
		return `${Math.floor(uint / 86400)}d`;

	if (uint >= 3600)
		return `${Math.floor(uint / 3600)}h`;

	if (uint >= 60)
		return `${Math.floor(uint / 60)}m`;

	return uint + '';
}

function cloneJSON(value) {
	return value == null ? value : JSON.parse(JSON.stringify(value));
}

function renderCredential(s, isGenModal = false, global) {
	let o;

	// Required
	o = s.option(form.Value, '.name', _('Credential ID'));
	o.readonly = true;
	o.rmempty = false;
	o.validate = ez.validateUUID;

	if (!isGenModal) {
		// Required
		o = s.option(ez.CopyValue, 'secret', _('Credential secret'),
			_('Base64 encoded X25519 private key.'));
		o.password = true;
		o.ez_options = {
			type: 'wg-keypair',
			callback: function(result) {
				return [
					[this.option, result.private_key],
					['pubkey', result.public_key]
				]
			}
		}
		o.validate = function(section_id, value) {
			if (!value)
				ez.handleGenKey.call(this, section_id, this.ez_options || this.option);

			return ez.validateBase64Key.call(this, 44, section_id, value);
		}

		// Required
		o = s.option(form.Value, 'pubkey', _('Credential pubkey'),
			_('Base64 encoded X25519 public key.'));
		o.readonly = true;
		o.validate = L.bind(ez.validateBase64Key, o, 44);
		o.modalonly = true;

		// Required
		o = s.option(CBITimeValue, 'created_at_unix', _('Created'));
		o.rmempty = false;
		o.modalonly = true;

		// Required
		o = s.option(CBITimeValue, 'expiry_unix', _('Expires'));
		o.rmempty = false;
		o.textvalue = function(section_id) {
			const expiry = Number(this.cfgvalue(section_id));
			const valid = expiry > Math.floor(Date.now() / 1000);

			return E('span', {
				class: `expiry-status expiry-status-${valid ? 'valid' : 'expired'}`,
				title: _('Expires: %s').format(formatTime(expiry))
			}, [ valid ? _('Valid') : _('Expired') ]);
		}

		// Required
		o = s.option(form.Value, '_validity', _('Validity'));
		o.default = '1d';
		ez.validity_preset.forEach((res) => {
			o.value.apply(o, res);
		})
		o.load = function(section_id) {
			const created = this.map.data.get(this.section.config, section_id, 'created_at_unix');
			const expiry = this.map.data.get(this.section.config, section_id, 'expiry_unix');
			const seconds = expiry - created;

			return seconds ? secondToDuration(seconds) : this.default;
		}
		o.validate = function(section_id, value) {
			const result = ez.validateTimeDuration.apply(this, arguments);

			if (result !== true)
				return result;

			const created = this.section.getOption('created_at_unix').epochget(section_id);
			const expiryOpt = this.section.getOption('expiry_unix')
			const oldexpiry = expiryOpt.epochget(section_id);
			const newexpiry = created + durationToSecond(value);

			if (!(oldexpiry == newexpiry))
				expiryOpt.epochset(section_id, newexpiry);

			return true;
		}
		o.write = form.DummyValue.prototype.write;
		o.remove = form.DummyValue.prototype.remove;
		o.rmempty = false;
		o.modalonly = true;
	}

	if (isGenModal) {
		// Required
		o = s.option(form.Value, 'ttl', _('Validity'));
		o.default = '1d';
		ez.validity_preset.forEach((res) => {
			o.value.apply(o, res);
		})
		o.validate = ez.validateTimeDuration;
		o.rmempty = false;
		o.modalonly = true;
	}

	// Optional, but keep default value when empty
	o = s.option(form.DynamicList, 'groups', _('ACL groups'));
	o.default = [];
	o.remove = function(section_id) {
		this.super('write', section_id, this.default);
	}

	// Required
	o = s.option(CBIBoolean, 'allow_relay', _('Allow relay'),
		_('Allow ephemeral nodes that join using this credential %s.')
		.format(_('to relay data traffic for other peers')));
	o.default = o.disabled;
	o.rmempty = false;

	// Optional, but keep default value when empty
	o = s.option(form.MultiValue, 'allowed_proxy_cidrs', _('Allowed proxy cidrs'),
		_('Allow ephemeral nodes that join using this credential %s.')
		.format(_('to advertise the specified CIDR ranges used for <code>%s</code>').format(_('Subnet proxy'))));
	o.create = true;
	o.custom_placeholder = '192.168.1.0/24';
	o.placeholder = '192.168.1.0/24';
	o.default = [];
	o.value('', _('-- Please choose --'));
	o.load = function(section_id) {
		return ez.loadChoices.call(this, [
			['', _('-- Please choose --')],
			...global.localSubnets.filter(e => e.device !== 'lo')
				.map(e => [e.cidr, E([], [ e.cidr, ' (', E('strong', {}, [e.interface]), ')' ]) ])
		], section_id);
	}
	o.validate = function(section_id, value) {
		const values = value.split(' ');

		for (value of values) {
			if (ez.isEmpty(value))
				return true;

			if (!ez.stubValidator.apply('cidr4', value))
				return _('Expecting: %s').format(_('valid IPv4 CIDR'));
		}

		return true;
	}
	o.remove = function(section_id) {
		this.super('write', section_id, this.default);
	}

	// Required
	o = s.option(CBIBoolean, 'reusable', _('Reusable'),
		_('Allows multiple ephemeral nodes to be online simultaneously.'));
	o.default = o.enabled;
	o.rmempty = false;
}

const ucinst = 'instance';
function get_filename(sectiontype) {
	return sectiontype + '/credentials.json';
}
function get_filepath(sectiontype) {
	return `${ez.EZ_DIR}/${ucinst}/` + get_filename(sectiontype);
}

return view.extend({
	load() {
		return Promise.all([
			uci.load('ezet'),
			ez.getServiceStatus('easytier-core', 'running'),
			ez.getLocalSubnets(),
		]);
	},

	async render(data) {
		const isRunning = data[1];
		const localSubnets = data[2];

		let m, s, o;

		const valid_insts = (uci.sections('ezet', ucinst) || [])
			.filter(cfg => cfg.enabled !== '0' && !cfg.credential && cfg.secure_mode === '1');
		if (!valid_insts.length)
			return E('div', { class: 'cbi-map' }, [
				E('h2', {}, _('Managed Credentials')),
				E('p', {}, _('No matched EasyTier instances are configured.'))
			]);

		const jsonData = {};
		const titles = {};
		try {
			for (const inst of valid_insts) {
				const sid_as_styp = inst['.name'];
				const raw = await L.resolveDefault(ez.readFile(ucinst, get_filename(sid_as_styp)), '{}');

				titles[sid_as_styp] = inst.label;
				jsonData[sid_as_styp] = Object.entries(JSON.parse(raw.trim())).map(e => Object.assign({'.name': e[0]}, e[1]));
			}
		} catch (e) {
			return E('div', { class: 'cbi-map' }, [
				E('h2', {}, _('Managed Credentials')),
				E('p', { class: 'alert-message error' },
					_('Unable to load credential files: %s').format(e.message || e))
			]);
		}

		//console.log(jsonData, titles);

		m = new form.JSONMap(cloneJSON(jsonData), _('Managed Credentials'),
			_('Each tab manages the persistent <code>credential_file</code> of one EasyTier room.'));
		m.readonly = isRunning ? true : false;
		m.tabbed = true;

		for (const sectionType in jsonData) {
			/* Credentials START */
			/* Credentials settings */
			s = m.section(form.GridSection, sectionType, _('Instance (%s)').format(titles[sectionType]),
				_('Raw data in: <code>%s</code>')
				.format(get_filepath(sectionType)));
			s.anonymous = true;
			s.addremove = true;
			s.rowcolors = true;
			s.nodescriptions = true;
			s.modaltitle = _('Edit credential');
			//s.ez_modaltitle = [ _('Credential'), _('Add a credential') ];
			/* Runtime credential generate/revoke start */
			s.handleAdd = function(ev, name) {
				return form.GridSection.prototype.handleAdd.call(this, ev, name || ez.generateRand('uuid'));
			}
			s.handleGenerate = function() {
				let m, s;

				const section_id = ez.generateRand('uuid');
				m = new form.JSONMap({
					[section_id]: {}
				});

				s = m.section(form.NamedSection, section_id, this.sectiontype);

				renderCredential(s, true, {
					localSubnets
				});

				return m.render().then(node => {
					const generate = async function() {
						try {
							// Parse and validate all modal fields first.
							await m.parse();

							const cfg = m.data.data[section_id];

							const res = await ez.cliWrapper([
								'--instance-name', titles[this.sectiontype],
								'credential', 'generate',
								'--ttl', durationToSecond(cfg.ttl),
								'--credential-id', section_id,
								...(ez.isEmpty(cfg.groups) ? [] : ['--groups', cfg.groups.join(',')]),
								...(cfg.allow_relay ? ['--allow-relay'] : []),
								...(ez.isEmpty(cfg.allowed_proxy_cidrs) ? []
									: ['--allowed-proxy-cidrs', cfg.allowed_proxy_cidrs.join(',')]
								),
								'--reusable', cfg.reusable,
							]);

							//console.log(res);

							if (res.result) {
								if (res.result.exitcode == 0) {
									const raw = await ez.readFile(ucinst, get_filename(this.sectiontype));
									const credential = JSON.parse(raw.trim())[section_id];

									if (credential) {
										const config_name = this.uciconfig ?? this.map.config;
										this.map.data.add(config_name, this.sectiontype, section_id);

										const section = this.map.data.data[section_id];
										Object.assign(section, credential);
									}

									//console.log(this.map.data.data);

									return this.map.load()
										.then(L.bind(this.map.reset, this.map))
										.then(ui.hideModal)
										.catch(() => {});
								} else
									ui.addNotification(null, E('p', _('Failed to generate credential, error: %s.')
										.format(res.result.stderr)), 'error');
							} else
								ui.addNotification(null, E('p', _('Failed to generate credential, error: %s.')
									.format(res.error)), 'error');
						} catch (e) {
							ui.addNotification(null, E('p', _('Failed to generate credential: %s')
								.format(e.message || e)), 'error');
						}
					};

					ui.showModal(_('Generate credential'), [
						node,
						E('div', { class: 'button-row' }, [
							E('button', {
								class: 'btn cbi-button',
								click: ui.hideModal
							}, [ _('Dismiss') ]),
							' ',
							E('button', {
								class: 'btn cbi-button cbi-button-positive important',
								click: ui.createHandlerFn(this, generate)
							}, [ _('Generate') ])
						])
					], 'cbi-modal');
				});
			}
			s.handleRevoke = function(section_id) {
				const revoke = function(section_id) {
					return ez.cliWrapper([
						'--instance-name', titles[this.sectiontype],
						'credential', 'revoke', section_id
					]).then((res) => {
						if (res.result) {
							if (res.result.exitcode == 0) {
								const config_name = this.uciconfig ?? this.map.config;
								this.map.data.remove(config_name, section_id);
								return this.map.load()
									.then(L.bind(this.map.reset, this.map))
									.then(ui.hideModal)
									.catch(() => {});
							} else
								ui.addNotification(null, E('p', _('Failed to revoke %s, error: %s.').format(section_id, res.result.stderr)), 'error');
						} else
							ui.addNotification(null, E('p', _('Failed to revoke %s, error: %s.').format(section_id, res.error)), 'error');
					});
				};

				ui.showModal(_('Revoke credential'), [
					E('p', {}, _('Are you sure you want to revoke credential: <code>%s</code>?').format(section_id)),
					E('div', { class: 'right' }, [
						E('button', {
							class: 'btn cbi-button',
							click: ui.hideModal
						}, [ _('Cancel') ]),
						' ',
						E('button', {
							class: 'btn cbi-button cbi-button-negative important',
							click: ui.createHandlerFn(this, revoke, section_id)
						}, [ _('Revoke') ])
					])
				]);
			}
			s.renderSectionAdd = function(/* ... */) {
				const node = form.GridSection.prototype.renderSectionAdd.apply(this, arguments);

				node.appendChild(E('button', {
					class: 'cbi-button cbi-button-add',
					title: _('Generate credential'),
					click: ui.createHandlerFn(this, 'handleGenerate'),
					disabled: !this.map.readonly || null
				}, [ _('Generate credential') ]));

				return node;
			}
			s.renderRowActions = function(section_id, more_label, trEl) {
				const node = form.GridSection.prototype.renderRowActions.apply(this, arguments);
				const actions = node.querySelector('div');
				const runtime = this.map.readonly;

				if (actions) {
					if (runtime)
						actions.lastChild.classList.add('hidden');
					actions.appendChild(E('button', {
						class: 'btn cbi-button cbi-button-remove' + (runtime ? '' : ' hidden'),
						title: _('Revoke credential'),
						click: ui.createHandlerFn(this, 'handleRevoke', section_id)
					}, [ _('Revoke') ]));
				}

				return node;
			}
			/* Runtime credential generate/revoke end */

			renderCredential(s, false, {
				isRunning,
				localSubnets,
			});
			/* Credentials END */
		}

		m.data.save = async function() {
			function deJSONMap(section) {
				const row = {};

				for (const key in section) {
					if (!Object.prototype.hasOwnProperty.call(section, key) || key.startsWith('.'))
						continue;

					row[key] = section[key];
				}

				return row;
			}

			const orders = [];
			for (const sid_as_styp in jsonData) {
				const tabData = jsonData[sid_as_styp]; // Original records
				const records = this.sections('json', sid_as_styp); // Current records

				// Index original records by credential ID
				const stored = new Map(
					tabData.map(record => [
						record['.name'],
						deJSONMap(record)
					])
				);

				// Index current records by credential ID
				const cached = new Map(
					records.map(record => [
						record['.name'],
						deJSONMap(record)
					])
				);

				// Detect modifications and creations
				for (const [id, record] of cached) {
					const action = !stored.has(id) ? 'add' :
						JSON.stringify(stored.get(id)) !== JSON.stringify(record) ? 'set' : null;

					if (!action)
						continue;

					console.log(`${sid_as_styp} ${id} ${action === 'add' ? 'created' : 'modified'}.`);

					orders.push({
						action,
						sid_as_styp,
						id,
						record
					});
				}

				// Detect deletions
				for (const id of stored.keys()) {
					if (cached.has(id))
						continue;

					console.log(`${sid_as_styp} ${id} deleted.`);

					orders.push({
						action: 'del',
						sid_as_styp,
						id,
						record: {}
					});
				}
			}

			if (!orders.length)
				return;

			//console.log(orders);

			for (const o of orders) {
				const filename = get_filename(o.sid_as_styp);
				const key = JSON.stringify(o.id);

				const tabData = jsonData[o.sid_as_styp]; // Original records

				switch (o.action) {
					case 'set': {
						await ez.yqReadFile(ucinst, filename, '-i -oj',
							`.[${key}] = ${JSON.stringify(o.record)}`);

						const index = tabData.findIndex(record => record['.name'] === o.id);
						if (index >= 0)
							tabData[index] = Object.assign({'.name': o.id}, cloneJSON(o.record));

						break;
					}
					case 'add': {
						await ez.yqReadFile(ucinst, filename, '-i -oj',
							`.[${key}] = ${JSON.stringify(o.record)}`);

						tabData.push(Object.assign({'.name': o.id}, cloneJSON(o.record)));

						break;
					}
					case 'del': {
						await ez.yqReadFile(ucinst, filename, '-i -oj',
							`del(.[${key}])`);

						const index = tabData.findIndex(record => record['.name'] === o.id);
						if (index >= 0)
							tabData.splice(index, 1);

						break;
					}
					default:
						break;
				}
			}
		}

		return m.render();
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
