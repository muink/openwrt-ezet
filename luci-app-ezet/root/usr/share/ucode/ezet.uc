
import { mkstemp, popen } from 'fs';

/* Global variables START */
export const EZ_DIR = '/etc/ezet';
export const EXE_DIR = '/usr/libexec/ezet';
export const SDL_DIR = '/usr/share/ezet';
export const RUN_DIR = '/var/run/ezet';
/* Global variables END */

/* Utilities start */
/* Kanged from luci-app-commands */
export function shellQuote(s) {
	return `'${replace(s, "'", "'\\''")}'`;
};

export function isBinary(str) {
	for (let off = 0, byte = ord(str); off < length(str); byte = ord(str, ++off))
		if (byte <= 8 || (byte >= 14 && byte <= 31))
			return true;

	return false;
};

export function executeCommand(infd, ...args) {
	let outfd = mkstemp();
	let errfd = mkstemp();

	if (infd)
		push(args, `<&${infd.fileno()}`);

	const exitcode = system(`${join(' ', args)} >&${outfd.fileno()} 2>&${errfd.fileno()}`);

	outfd.seek();
	errfd.seek();

	const stdout = outfd.read(1024 * 1024) ?? '';
	const stderr = errfd.read(1024 * 1024) ?? '';

	outfd.close();
	errfd.close();

	const binary = isBinary(stdout);

	return {
		command: join(' ', args),
		stdout: binary ? null : stdout,
		stderr,
		exitcode,
		binary
	};
};
/* Utilities end */

/* String helper start */
export function isEmpty(res) {                                            // no false, 0, NaN
	if (res == null || res in ['']) return true;                          // null, ''
	if (type(res) in ['array', 'object']) return length(res) === 0;       // empty Array/Object
	return false;
};

export function strToBool(str) {
	return (str === '1') || null;
};

export function strToInt(str) {
	if (isEmpty(str))
		return null;

	return !match(str, /^\d+$/) ? str : int(str) ?? null;
};

export function arrToObj(res) {
	if (isEmpty(res))
		return null;

	let object;
	if (type(res) === 'array') {
		object = {};
		map(res, (e) => {
			if (type(e) === 'array')
				object[e[0]] = e[1];
		});
	} else
		return res;

	return object;
};

export function removeBlankAttrs(res) {
	let content;

	if (type(res) === 'object') {
		content = {};
		map(keys(res), (k) => {
			if (type(res[k]) in ['array', 'object'])
				content[k] = removeBlankAttrs(res[k]);
			else if (res[k] !== null && res[k] !== '')
				content[k] = res[k];
		});
	} else if (type(res) === 'array') {
		content = [];
		map(res, (k, i) => {
			if (type(k) in ['array', 'object'])
				push(content, removeBlankAttrs(k));
			else if (k !== null && k !== '')
				push(content, k);
		});
	} else
		return res;

	return content;
};
/* String helper end */
