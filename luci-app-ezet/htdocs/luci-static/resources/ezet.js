'use strict';
'require baseclass';
'require form';
'require fs';
'require rpc';
'require uci';
'require ui';

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

return baseclass.extend({
	/* Member */
	EZ_DIR,
	monospacefonts,
	log_levels,
	// validate
	validateUUID,
	validateUrl,
});
