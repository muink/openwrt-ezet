'use strict';
'require baseclass';
'require form';
'require fs';
'require network';
'require rpc';
'require uci';
'require ui';
'require validation';

/* Member */
const EZ_DIR = "/etc/ezet";

const monospacefonts = [
	'"Cascadia Code"',
	'"Cascadia Mono"',
	'Menlo',
	'Monaco',
	'Consolas',
	'"Liberation Mono"',
	'"Courier New"',
	'monospace'
];

const log_levels = [
	['off', _('OFF')],
	['error', _('Error')],
	['warn', _('Warning')],
	['info', _('Info')],
	['debug', _('Debug')],
	['trace', _('Trace')]
];

const glossary = {
	instance: {
		prefmt: 'instance_%s',
	},
	peer: {
		prefmt: 'peer_%s',
	},
	listener: {
		prefmt: 'listener_%s',
	},
	stun_server: {
		prefmt: 'stun_server_%s',
	},
};

const peers_type = [
	{
		id: 'protocol',
		label: _('Direct transfer protocol'),
		types: [
			['tcp', _('TCP')],
			['udp', _('UDP')],
			['faketcp', _('FakeTCP') + ' - ' + _('TCP')],
			['ws', _('WebSocket') + ' - ' + _('TCP')],
			['wss', _('WebSocket SSL') + ' - ' + _('TCP')],
			['wg', _('WireGuard') + ' - ' + _('UDP')],
			['quic', _('QUIC') + ' - ' + _('UDP')],
		]
	},
	{
		id: 'discovery',
		label: _('Service discovery URI'),
		types: [
			['txt', _('DNS TXT record')],
			['srv', _('DNS SRV record')],
			['http', _('HTTP 302 OR response')],
			['https', _('HTTPS same as HTTP')],
		]
	}
];

/* Prototype */
const CBIGridSection = form.GridSection.extend({
	modaltitle(/* ... */) {
		return loadModalTitle.call(this, ...this.ez_modaltitle || [null,null], ...arguments);
	},

	sectiontitle(/* ... */) {
		return loadDefaultLabel.apply(this, arguments);
	},

	renderSectionAdd(/* ... */) {
		const prefmt = this.ez_prefmt || '%s';
		const LC = this.ez_lowcase_only;

		let node = form.GridSection.prototype.renderSectionAdd.apply(this, arguments),
			nameEl = node.querySelector('.cbi-section-create-name');

		nameEl.placeholder = _('Specify a ID');

		ui.addValidator(nameEl, 'uciname', true, (v) => {
			let button = node.querySelector('.cbi-section-create > .cbi-button-add');

			if (!v) {
				button.disabled = true;
				return true;
			} else if (LC && (v !== v.toLowerCase())) {
				button.disabled = true;
				return _('Expecting: %s').format(_('Lowercase only'));
			} else if (uci.get(this.config, v)) {
				button.disabled = true;
				return _('Expecting: %s').format(_('unique UCI identifier'));
			} else if (uci.get(this.config, prefmt.format(v))) {
				button.disabled = true;
				return _('Expecting: %s').format(_('unique identifier'));
			} else {
				button.removeAttribute('disabled');
				return true;
			}
		}, 'blur', 'keyup');

		return node;
	},

	handleAdd(ev, name) {
		const prefmt = this.ez_prefmt || '%s';

		return form.GridSection.prototype.handleAdd.call(this, ev, prefmt.format(name));
	}
});

const CBIGroupListValue = form.ListValue.extend({
	__name__: 'CBI.GroupListValue',

	renderWidget(section_id, option_index, cfgvalue) {
		const node = form.ListValue.prototype.renderWidget.apply(this, arguments);
		const select = node.querySelector('select');
		const options = Array.from(select.options);

		Object.keys(this.grplist).forEach((label) => {
			const groupEl = E('optgroup', {label: label}, []);
			for (const option of options)
				if (this.grplist[label].includes(option.value))
					groupEl.appendChild(option);
			select.appendChild(groupEl);
		});

		select.value = (cfgvalue != null) ? cfgvalue : this.default;
		return node;
	},

	value(key, val) {
		this.keylist ??= [];
		this.vallist ??= [];
		this.grplist ??= {};

		if (Array.isArray(key)) {
			this.grplist[val] ??= [];
			this.grplist[val].push(key[0]);
			this.super('value', ...key);
		} else
			this.super('value', key, val);
	}
});

const CBITextValue = form.TextValue.extend({
	renderWidget(/* ... */) {
		let node = form.TextValue.prototype.renderWidget.apply(this, arguments);

		node.querySelector('textarea').style.fontFamily = monospacefonts.join(',');

		return node;
	}
});

const CBIGenValue = form.Value.extend({
	__name__: 'CBI.GenValue',

	renderWidget(section_id, option_index, cfgvalue) {
		let node = form.Value.prototype.renderWidget.apply(this, arguments);

		if (!this.password)
			node.classList.add('control-group');

		if (this.section.section) // modalonly
			(node.querySelector('.control-group') || node).appendChild(E('button', {
				class: 'cbi-button cbi-button-add',
				title: _('Generate'),
				click: ui.createHandlerFn(this, handleGenKey, section_id, this.ez_options || this.option)
			}, [ _('Generate') ]));

		return node;
	}
});

const CBIGenText = CBITextValue.extend({
	__name__: 'CBI.GenText',

	renderWidget(section_id, option_index, cfgvalue) {
		let node = CBITextValue.prototype.renderWidget.apply(this, arguments);

		if (this.section.section) // modalonly
			(node.querySelector('.control-group') || node).appendChild(E('button', {
				class: 'cbi-button cbi-button-add',
				title: _('Generate'),
				click: ui.createHandlerFn(this, handleGenKey, section_id, this.ez_options || this.option)
			}, [ _('Generate') ]));

		return node;
	}
});

const CBICopyValue = form.Value.extend({
	__name__: 'CBI.CopyValue',

	readonly: true,

	renderWidget(section_id, option_index, cfgvalue) {
		let node = form.Value.prototype.renderWidget.apply(this, arguments);

		if (!this.password)
			node.classList.add('control-group');

		(node.querySelector('.control-group') || node).lastChild.style.padding = '0 7px';
		(node.querySelector('.control-group') || node).appendChild(E('button', {
			class: 'cbi-button cbi-button-add',
			style: "margin-left: calc(-.2em + -2px); border-radius: 0 3px 3px 0; padding: 0 4px;",
			click: ui.createHandlerFn(this, async (section_id) => {
				try {
					await navigator.clipboard.writeText(this.formvalue(section_id));
					console.log('Content copied to clipboard!');
				} catch (e) {
					console.error('Failed to copy: ', e);
				}
				/* Deprecated
				let inputEl = document.getElementById(this.cbid(section_id)).querySelector('input');
				inputEl.select();
				document.execCommand("copy");
				inputEl.blur();
				*/
				return alert(_('Content copied to clipboard!'));
			}, section_id)
		}, [ _('📋') ]));

		return node;
	}
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

/* Method */
function generateRand(type, length) {
	let byteArr;
	if (['base64', 'hex'].includes(type))
		byteArr = crypto.getRandomValues(new Uint8Array(length));
	switch (type) {
		case 'base64':
			/* Thanks to https://stackoverflow.com/questions/9267899 */
			return btoa(String.fromCharCode.apply(null, byteArr));
		case 'hex':
			return Array.from(byteArr, (byte) =>
				(byte & 255).toString(16).padStart(2, '0')
			).join('');
		case 'uuid':
			/* Thanks to https://stackoverflow.com/a/2117523 */
			return (location.protocol === 'https:') ? crypto.randomUUID() :
			([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, (c) =>
				(c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
			);
		default:
			return null;
	};
}

function isEmpty(res) {
	if (res == null) return true;                                                // null, undefined
	if (typeof res.length === 'number') return res.length === 0;                 // empty String/Array/TypedArray
	if (res instanceof ArrayBuffer) return res.byteLength === 0;                 // empty ArrayBuffer
	if (typeof res === 'object') {
		if (res instanceof Map || res instanceof Set) return res.size === 0;     // empty Map/Set
		return Object.keys(res).length === 0;                                    // empty Object
	}
	return false;
}

function getFeatures() {
	const callGetFeatures = rpc.declare({
		object: 'luci.ezet',
		method: 'get_features',
		expect: { '': {} }
	});

	return L.resolveDefault(callGetFeatures(), {});
}

function getServiceStatus(instance, key) {
	const conf = 'ezet';
	const callServiceList = rpc.declare({
		object: 'service',
		method: 'list',
		params: ['name'],
		expect: { '': {} }
	});

	return L.resolveDefault(callServiceList(conf), {})
		.then((res) => {
			let value;
			try {
				value = res[conf]['instances'][instance][key];
			} catch (e) {}
			return value;
		});
}

function getDashURL(instance) {
	return getServiceStatus(instance, 'command').then((cmd) => {
		if (isEmpty(cmd))
			return '';

		cmd = Object.assign({}, ...cmd.join(' ').split('--')
			.map((s) => {
				const match = s.match(/^(no-web|api-server-addr|api-server-port|web-server-addr|web-server-port) (\S+)?/)

				if (match)
					return Object.fromEntries([[match[1], match[2] ?? true]]);
				else
					return null;
			}).filter(Boolean));

		if (cmd["no-web"])
			return '';

		const host = (cmd["web-server-addr"] || cmd["api-server-addr"] || '').replace(/^(0(\.\d+){3}|::)$/, '') || window.location.hostname;
		const port = cmd["web-server-port"] || cmd["api-server-port"] || 11211;

		return 'http://%s:%s/'.format(host, port);
	});
}

function getNetworkCIDR4(cidr) {
	const [addr, prefix] = cidr.split('/');
	const octets = validation.parseIPv4(addr);

	if (!octets || prefix == null)
		return null;

	const bits = +prefix;

	if (!Number.isInteger(bits) || bits < 0 || bits > 32)
		return null;

	const network = octets.map((octet, i) => {
		const n = Math.max(0, Math.min(8, bits - i * 8));
		const mask = n ? (0xff << (8 - n)) & 0xff : 0;

		return octet & mask;
	});

	return `${network.join('.')}/${bits}`;
}

function getLocalSubnets() {
	return network.getNetworks().then(networks => {
		const subnets = new Map();

		for (let net of networks) {
			for (let addr of net.getIPAddrs()) {
				const cidr = getNetworkCIDR4(addr);

				if (cidr && !subnets.has(cidr)) {
					subnets.set(cidr, {
						cidr,
						interface: net.getName(),
						device: net.getIfname()
					});
				}
			}
		}

		return Array.from(subnets.values());
	});
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

/* thanks to homeproxy */
function loadDefaultLabel(section_id) {
	const label = uci.get(this.config, section_id, 'label');
	if (label) {
		return label;
	} else {
		uci.set(this.config, section_id, 'label', section_id);
		return section_id;
	}
}

/* thanks to homeproxy */
function loadModalTitle(title, addtitle, section_id) {
	const label = uci.get(this.config, section_id, 'label');
	return label ? title + ' » ' + label : addtitle;
}

function loadChoices(preadds, section_id) {
	delete this.keylist;
	delete this.vallist;

	for (const arr of preadds || [])
		this.value(...arr);

	return this.super('load', section_id);
}

function loadChoicesGetMap(uciconfig, sectiontype, options = {}) {
	const values = [];

	switch (sectiontype) {
		case 'peer':
		case 'listener':
			uci.sections(uciconfig, sectiontype, (res) => {
				if (
					res.enabled !== '0' &&
					(!options.type ||
					  options.type === res.type)
				) {
					values.push([res['.name'], (res.peer_public_key ? _('🔒') : '') + res.label]);
				}
			});
			break;
		default:
			break;
	}

	return values;
}

function renderStatus(elemId, isRunning, instance, noGlobal) {
	const visible = isRunning && isRunning.url;

	return E([
		E('button', {
			class: 'cbi-button cbi-button-apply' + (noGlobal ? ' hidden' : ''),
			click: ui.createHandlerFn(this, handleReload, instance)
		}, [ _('Reload') ]),
		updateStatus(E('span', { id: elemId, style: 'border: unset; font-style: italic; font-weight: bold' }), isRunning ? true : false),
		E('a', {
			class: 'cbi-button cbi-button-apply %s'.format(visible ? '' : 'hidden'),
			href: visible ? isRunning.url : '',
			target: '_blank',
			rel: 'noreferrer noopener'
		}, [ _('Open Dashboard') ])
	]);
}
function updateStatus(node, isRunning, instance, noGlobal) {
	if (node) {
		node.style.color = isRunning ? 'green' : 'red';
		node.innerHTML = '&ensp;%s%s&ensp;'.format(noGlobal ? instance + ' ' : '', isRunning ? _('Running') : _('Not Running'));
		/* Dashboard button */
		if (node.nextSibling?.localName === 'a') {
			const visible = isRunning && isRunning.url;
			if (visible)
				node.nextSibling.classList.remove('hidden');
			else
				node.nextSibling.classList.add('hidden');

			node.nextSibling.href = visible ? isRunning.url : '';
		}
	}

	return node;
}

function handleGenKey(section_id, option) {
	const type = this.section.getOption('type')?.formvalue(section_id);
	const widget = L.bind(function(option) {
		return this.map.findElement('id', 'widget.' + this.cbid(section_id).replace(/\.[^\.]+$/, '.') + option);
	}, this);

	const callKeygen = rpc.declare({
		object: 'luci.ezet',
		method: 'keygen',
		params: ['type', 'params'],
		expect: { '': {} }
	});

	if (typeof option === 'object') {
		return callKeygen(option.type, option.params).then((res) => {
			if (res.result)
				option.callback.call(this, res.result).forEach(([k, v]) => {
					widget(k).value = v ?? '';
				});
			else
				ui.addNotification(null, E('p', _('Failed to generate %s, error: %s.').format(type, res.error)), 'error');
		});
	} else {
		let password, required_method;

		if (option === 'uuid' || option.match(/_uuid/))
			required_method = 'uuid';

		switch (required_method) {
			/* NONE */
			case 'none':
				password = '';
				break;
			/* UUID */
			case 'uuid':
				password = generateRand('uuid');
				break;
			/* DEFAULT */
			default:
				password = generateRand('hex', 32/2);
				break;
		}

		return widget(option).value = password;
	}
}

function handleReload(instance, ev, section_id) {
	instance = instance || '';
	return fs.exec('/etc/init.d/ezet', ['reload', instance])
		.then((res) => { /* return window.location = window.location.href.split('#')[0] */ })
		.catch((e) => {
			ui.addNotification(null, E('p', _('Failed to execute "/etc/init.d/ezet %s %s" reason: %s').format('reload', instance, e)), 'error')
		})
}

function handleRemoveIdles() {
	const section_type = this.sectiontype;

	let loaded = [];
	uci.sections(this.config, section_type, (section, sid) => loaded.push(sid));

	return lsDir(section_type).then((res) => {
		let sectionEl = E('div', { class: 'cbi-section' }, []);

		res.filter(e => !loaded.includes(e)).forEach((filename) => {
			sectionEl.appendChild(E('div', { class: 'cbi-value' }, [
				E('label', {
					class: 'cbi-value-title',
					id: 'rmidles.' + filename + '.label'
				}, [ filename ]),
				E('div', { class: 'cbi-value-field' }, [
					E('button', {
						class: 'cbi-button cbi-button-negative important',
						id: 'rmidles.' + filename + '.button',
						click: ui.createHandlerFn(this, (filename) => {
							return removeFile(section_type, filename).then((res) => {
								let node = document.getElementById('rmidles.' + filename + '.label');
								node.innerHTML = '<s>%s</s>'.format(node.innerHTML);
								node = document.getElementById('rmidles.' + filename + '.button');
								node.classList.add('hidden');
							});
						}, filename)
					}, [ _('Remove') ])
				])
			]));
		});

		ui.showModal(_('Remove idles'), [
			sectionEl,
			E('div', { class: 'right' }, [
				E('button', {
					class: 'btn cbi-button-action',
					click: ui.hideModal
				}, [ _('Complete') ])
			])
		]);
	});
}

function textvalue2Value(section_id) {
	let cval = this.cfgvalue(section_id);
	let i = this.keylist.indexOf(cval);

	return this.vallist[i] ?? cval;
}

function validateTimeDuration(section_id, value) {
	if (!value)
		return true;

	if (!value.match(/^(\d+)(s|m|h|d)?$/))
		return _('Expecting: %s').format('^(\\d+)(s|m|h|d)?$');

	return true;
}

function validateUUID(section_id, value) {
	if (!value)
		return true;
	else if (value.match('^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') === null)
		return _('Expecting: %s').format(_('valid uuid'));

	return true;
}

function validateUrl(section_id, value) {
	if (!value)
		return true;

	try {
		let url = new URL(value);
		if (!url.hostname)
			return _('Expecting: %s').format(_('valid URL'));
	}
	catch(e) {
		return _('Expecting: %s').format(_('valid URL'));
	}

	return true;
}

function validateBase64Key(length, section_id, value) {
	/* Thanks to luci-proto-wireguard */
	if (value) {
		if (value.length !== length || !value.match(/^(?:[A-Za-z0-9+\/]{4})*(?:[A-Za-z0-9+\/]{2}==|[A-Za-z0-9+\/]{3}=)?$/) || value[length-1] !== '=')
			return _('Expecting: %s').format(_('valid base64 key with %d characters').format(length));
	} else if (this.rmempty === false || (this.optional ?? true) !== false)
		return _('Expecting: %s').format(_('non-empty value'));

	return true;
}

function validateIPv4Privnet(section_id, value) {
	if (!value)
		return true;

	const result = stubValidator.apply('ipmask4', value);
	if (result !== true)
		return result;

	if (!value.match(/^(10|172\.(3[01]|2\d|1[6-9])|192\.168)\./))
		return _('Expecting: %s').format(_('valid IPv4 private network address'));

	return true;
}

function validateIPv6Guanet(section_id, value) {
	if (!value)
		return true;

	const result = stubValidator.apply('ipmask6', value);
	if (result !== true)
		return result;

	if (value.match(/^(::1?(\/|$)|(f[cd]|fe[89ab]|ff))/))
		return _('Expecting: %s').format(_('valid IPv6 global unicast address'));

	return true;
}

function validateUniqueValue(section_id, value) {
	if (!value)
		return _('Expecting: %s').format(_('non-empty value'));

	let duplicate = false;
	uci.sections(this.config, this.section.sectiontype, (res) => {
		if (res['.name'] !== section_id)
			if (res[this.option] === value)
				duplicate = true;
	});
	if (duplicate)
		return _('Expecting: %s').format(_('unique value'));

	return true;
}

function lsDir(type) {
	const callLsDir = rpc.declare({
		object: 'luci.ezet',
		method: 'dir_ls',
		params: ['type'],
		expect: { '': {} }
	});

	return L.resolveDefault(callLsDir(type), {}).then((res) => {
		if (res.result) {
			return res.result;
		} else
			throw res.error || 'unknown error';
	});
}

function readFile(type, filename, isbinary) {
	const callReadFile = rpc.declare({
		object: 'luci.ezet',
		method: 'file_read',
		params: ['type', 'filename', 'isbinary'],
		expect: { '': {} }
	});

	return L.resolveDefault(callReadFile(type, filename, isbinary), {}).then((res) => {
		if (res.content ?? true) {
			return res.content;
		} else
			throw res.error || 'unknown error';
	});
}

function writeFile(type, filename, content, isbinary) {
	const callWriteFile = rpc.declare({
		object: 'luci.ezet',
		method: 'file_write',
		params: ['type', 'filename', 'content', 'isbinary'],
		expect: { '': {} }
	});

	return L.resolveDefault(callWriteFile(type, filename, content, isbinary), {}).then((res) => {
		if (res.result) {
			return res.result;
		} else
			throw res.error || 'unknown error';
	});
}

function removeFile(type, filename) {
	const callRemoveFile = rpc.declare({
		object: 'luci.ezet',
		method: 'file_remove',
		params: ['type', 'filename'],
		expect: { '': {} }
	});

	return L.resolveDefault(callRemoveFile(type, filename), {}).then((res) => {
		if (res.result) {
			return res.result;
		} else
			throw res.error || 'unknown error';
	});
}

return baseclass.extend({
	/* Member */
	EZ_DIR,
	monospacefonts,
	log_levels,
	glossary,
	peers_type,

	/* Prototype */
	GridSection: CBIGridSection,
	GroupListValue: CBIGroupListValue,
	TextValue: CBITextValue,
	GenValue: CBIGenValue,
	GenText: CBIGenText,
	CopyValue: CBICopyValue,
	stubValidator,

	/* Method */
	generateRand,
	isEmpty,
	getFeatures,
	getServiceStatus,
	getDashURL,
	getNetworkCIDR4,
	getLocalSubnets,
	ipv6CidrToRange,
	ipv6RangeContains,
	// load
	loadDefaultLabel,
	loadModalTitle,
	loadChoices,
	loadChoicesGetMap,
	// render
	renderStatus,
	updateStatus,
	handleGenKey,
	handleReload,
	handleRemoveIdles,
	textvalue2Value,  // this
	// validate
	validateTimeDuration,
	validateUUID,
	validateUrl,
	validateBase64Key,  // this
	validateIPv4Privnet,  // this
	validateIPv6Guanet,  // this
	validateUniqueValue,  // this
	// file operations
	lsDir,
	readFile,
	writeFile,
	removeFile,
});
