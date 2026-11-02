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

return baseclass.extend({
	/* Member */
	EZ_DIR,
	monospacefonts,
	log_levels,
});
