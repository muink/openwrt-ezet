'use strict';
'require form';
'require ui';
'require uci';
'require view';

'require ezet as ez';

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
		this.map.data.data[section][option] = Number(formvalue ?? this.default);
	},

	remove: form.AbstractValue.prototype.remove
});

const CBIBoolean = form.Flag.extend({
	__name__: 'CBI.Boolean',

	load(section_id) {
		const section = this.ucisection ?? section_id;
		const option = this.ucioption ?? this.option;
		// JSONMap.data.get() only supports Array, Object, String. Not Number, Boolean
		const value = this.map.data.data[section][option] ?? this.default

		return boolToFlag(value);
	},

	write(section_id, formvalue) {
		const section = this.ucisection ?? section_id;
		const option = this.ucioption ?? this.option;
		// JSONMap.data.set() only supports Array, Object, String. Not Number, Boolean
		this.map.data.data[section][option] = flagToBool(formvalue ?? this.default);
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

function boolToFlag(boolean) {
	if (typeof(boolean) !== 'boolean')
		return null;

	switch(boolean) {
	case true:
		return '1';
	case false:
		return '0';
	default:
		return null;
	}
}
function flagToBool(flag) {
	if (!flag)
		return null;

	switch(flag) {
	case '1':
		return true;
	case '0':
		return false;
	default:
		return null;
	}
}

const ucinst = 'instance';
const CREDENTIAL_FILENAME = 'credentials.json';

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
		if (!instances.length)
			return E('div', { 'class': 'cbi-map' }, [
				E('h2', {}, _('Managed Credentials')),
				E('p', {}, _('No matched EasyTier instances are configured.'))
			]);

		const jsonData = {};
		const titles = {};
		try {
			for (const inst of valid_insts) {
				const sid_as_styp = inst['.name'];
				const raw = await L.resolveDefault(ez.readFile(inst['.type'], sid_as_styp + `/${CREDENTIAL_FILENAME}`), '{}');

				titles[sid_as_styp] = _('Room (%s)').format(inst.label);
				jsonData[sid_as_styp] = Object.entries(JSON.parse(raw.trim())).map(e => Object.assign(e[1], {".name":e[0]}));
			}
		} catch (e) {
			return E('div', { 'class': 'cbi-map' }, [
				E('h2', {}, _('Managed Credentials')),
				E('p', { 'class': 'alert-message error' },
					_('Unable to load credential files: %s').format(e.message || e))
			]);
		}

		//console.log(jsonData, titles);

		m = new form.JSONMap(jsonData, _('Managed Credentials'),
			_('Each tab manages the persistent <code>credential_file</code> of one EasyTier room.'));
		m.readonly = isRunning ? true : false;
		m.tabbed = true;

		for (const sectionType in jsonData) {
			/* Credentials START */
			/* Credentials settings */
			s = m.section(form.GridSection, sectionType, titles[sectionType],
				_('Raw data in: <code>%s</code>')
				.format(ez.EZ_DIR + `/${ucinst}/${sectionType}/${CREDENTIAL_FILENAME}`));
			s.anonymous = true;
			s.addremove = true;
			s.sortable = true;
			s.rowcolors = true;
			s.nodescriptions = true;
			s.modaltitle = _('Edit credential');
			//s.ez_modaltitle = [ _('Credential'), _('Add a credential') ];
			/* Runtime credential generate/revoke start */
			/* s.handleGenerate = function() {
				const section_type = this.sectiontype;
				const o = new ez.HandleImport(this.map, this, _('Import rule-set links'),
					_('Supports rule-set links of type: <code>%s</code> and format: <code>%s</code>.</br>')
						.format('file, http, inline', 'text, yaml, mrs') +
						_('Please refer to <a href="%s" target="_blank">%s</a> for link format standards.')
							.format(rulesetdoc, _('Ruleset-URI-Scheme')));
				o.placeholder = 'https://github.com/ACL4SSR/ACL4SSR/raw/refs/heads/master/Clash/Providers/BanAD.yaml?fmt=yaml&behav=classical&	rawq=good%3Djob#BanAD\n' +
								'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/cn.mrs?fmt=mrs&behav=domain&	bpath=geo%2Fgeosite%2Fcn.mrs&hdr=eyJVc2VyLUFnZW50IjpbIm1paG9tby8xLjE4LjMiXX0K#CN-Site\n' +
								'file:///example.txt?fmt=text&behav=domain&fill=LmNuCg#CN%20TLD\n' +
								'inline://LSAnLmhrJwoK?behav=domain#HK%20TLD\n' +
								'inline://H4sIAAAAAAACA9NVUNcrKVcHANszKpEHAAAA?behav=domain#TW%20TLD\n';
				o.handleFn = async function(textarea) {
					let input_links = textarea.getValue().trim().split('\n');
					if (!input_links[0]) return ui.hideModal();

					let imported_count = 0;
					input_links = [...new Set(input_links)]; // Remove duplicate lines
					for (const link of input_links) {
						let config = await parseRulesetLink(section_type, link);
						if (config) {
							this.write(config);
							imported_count++;
						}
					}

					if (imported_count === 0)
						ui.addNotification(null, E('p', _('No valid rule-set link found.')));
					else
						ui.addNotification(null, E('p', _('Successfully imported %s %s of total %s.')
							.format(imported_count, _('rule-set'), input_links.length)), 'info');

					if (imported_count)
						return this.save();
					else
						return ui.hideModal();
				}

				return o.render();
			}*/
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
			s.handleAdd = function(ev, name) {
				return form.GridSection.prototype.handleAdd.call(this, ev, ez.generateRand('uuid'));
			}
			s.handleRevoke = function(section_id) {
				ui.showModal(_('Revoke credential'), [
					E('p', {}, _('Are you sure you want to revoke credential <code>%s</code>?').format(section_id)),
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn cbi-button',
							'click': ui.hideModal
						}, [ _('Cancel') ]),
						' ',
						E('button', {
							'class': 'btn cbi-button cbi-button-negative important',
							'click': ui.createHandlerFn(this, (section_id) => {
								this.map.data.remove(this.map.config, section_id);
								ui.hideModal();
								return this.map.save();
							}, section_id)
						}, [ _('Revoke') ])
					])
				], 'cbi-modal');
			}
			s.renderRowActions = function(section_id) {
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

			o = s.option(form.Value, '.name', _('Credential ID'));
			o.readonly = true;
			o.rmempty = false;
			o.validate = ez.validateUUID;

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
			o.editable = true;

			o = s.option(form.Value, 'pubkey', _('Credential pubkey'),
				_('Base64 encoded X25519 public key.'));
			o.readonly = true;
			o.validate = L.bind(ez.validateBase64Key, o, 44);
			o.modalonly = true;

			o = s.option(CBITimeValue, 'created_at_unix', _('Created'));
			o.rmempty = false;
			o.modalonly = true;

			o = s.option(CBITimeValue, 'expiry_unix', _('Expires'));
			o.rmempty = false;

			o = s.option(form.Value, '_validity', _('Validity'));
			o.default = '1d';
			o.value('1h', _('1 hour'));
			o.value('1d', _('1 day'));
			o.value('7d', _('7 days'));
			o.value('30d', _('30 days'));
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

			o = s.option(form.DynamicList, 'groups', _('ACL groups'));
			o.default = [];

			o = s.option(CBIBoolean, 'allow_relay', _('Allow relay'),
				_('Allow ephemeral nodes that join using this credential %s.')
				.format(_('to relay data traffic for other peers')));
			o.default = o.disabled;
			o.rmempty = false;

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
					...localSubnets.filter(e => e.device !== 'lo')
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

			o = s.option(CBIBoolean, 'reusable', _('Reusable'),
				_('Allows multiple ephemeral nodes to be online simultaneously.'));
			o.default = o.enabled;
			o.rmempty = false;
			/* Credentials END */
		}

		return m.render();
	}
});
