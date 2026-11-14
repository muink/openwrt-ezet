
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

/**** // @less_26_?? START ****/
/**
 * IPv4 CIDR parser and prototype.
 */
export function parseIPv4CIDR(cidr) {
	const m = match(cidr, /^([\d.]+)\/(\d{1,2})$/);

	if (!m)
		return null;

	const ip = m[1];
	const bits = int(m[2], 10);

	if (bits < 0 || bits > 32)
		return null;

	let groups = split(ip, '.');

	if (length(groups) != 4)
		return null;

	const bytes = [];

	for (let i = 0; i < 4; i++) {
		const group = groups[i];

		if (!match(group, /^\d{1,3}$/))
			return null;

		const value = int(group, 10);

		bytes[i] = value & 0xff;
	}

	return {
		bytes,
		bits
	};
};

/**
 * IPv6 CIDR parser and prototype.
 */
export function parseIPv6CIDR(cidr) {
	const m = match(cidr, /^([[:xdigit:]:.]+)\/(\d{1,3})$/);

	if (!m)
		return null;

	const ip = m[1];
	const bits = int(m[2], 10);

	if (bits < 0 || bits > 128)
		return null;

	if (index(ip, '%') >= 0 || index(ip, '.') >= 0)
		return null;

	const dc = index(ip, '::');
	let groups = [];

	if (dc >= 0) {
		const leftPart = substr(ip, 0, dc);
		const rightPart = substr(ip, dc + 2);

		if (index(rightPart, '::') >= 0)
			return null;

		const left = leftPart ? split(leftPart, ':') : [];
		const right = rightPart ? split(rightPart, ':') : [];

		const zeros = 8 - length(left) - length(right);

		if (zeros < 1)
			return null;

		for (let group in left)
			push(groups, group);

		for (let i = 0; i < zeros; i++)
			push(groups, '0');

		for (let group in right)
			push(groups, group);
	} else {
		groups = split(ip, ':');
	}

	if (length(groups) != 8)
		return null;

	const bytes = [];

	for (let i = 0; i < 8; i++) {
		const group = groups[i];

		if (!match(group, /^[0-9a-fA-F]{1,4}$/))
			return null;

		const value = int(group, 16);

		bytes[i * 2] = (value >> 8) & 0xff;
		bytes[i * 2 + 1] = value & 0xff;
	}

	return {
		bytes,
		bits
	};
};

/**
 * Parse IPv4 prefix length or netmask.
 *
 * @param {number|string|null} mask
 * @param {number} fallback
 * @returns {number}
 */
export function parseIPv4Mask(mask, fallback) {
	if (mask == null)
		return fallback;

	if (type(mask) == 'int' || type(mask) == 'double') {
		const bits = int(mask);

		if (bits != mask || bits < 0 || bits > 32)
			die('Invalid netmask');

		return bits;
	}

	if (type(mask) != 'string')
		die('Invalid netmask');

	// Decimal prefix length
	if (match(mask, /^\d+$/)) {
		const bits = int(mask, 10);

		if (bits > 32)
			die('Invalid netmask');

		return bits;
	}

	// IPv6 netmask
	const parsed = parseIPv4CIDR(`${mask}/32`);

	if (parsed == null)
		die('Invalid netmask');

	// Count consecutive leading one bits.
	let bits = 0;
	let done = false;

	for (let byte in parsed.bytes) {
		for (let bit = 7; bit >= 0; bit--) {
			if (!(byte & (1 << bit))) {
				done = true;
				break;
			}

			bits++;
		}

		if (done)
			break;
	}

	return bits;
};

/**
 * Parse IPv6 prefix length or netmask.
 *
 * @param {number|string|null} mask
 * @param {number} fallback
 * @returns {number}
 */
export function parseIPv6Mask(mask, fallback) {
	if (mask == null)
		return fallback;

	if (type(mask) == 'int' || type(mask) == 'double') {
		const bits = int(mask);

		if (bits != mask || bits < 0 || bits > 128)
			die('Invalid netmask');

		return bits;
	}

	if (type(mask) != 'string')
		die('Invalid netmask');

	// Decimal prefix length
	if (match(mask, /^\d+$/)) {
		const bits = int(mask, 10);

		if (bits > 128)
			die('Invalid netmask');

		return bits;
	}

	// IPv6 netmask
	const parsed = parseIPv6CIDR(`${mask}/128`);

	if (parsed == null)
		die('Invalid netmask');

	// Count consecutive leading one bits.
	let bits = 0;
	let done = false;

	for (let byte in parsed.bytes) {
		for (let bit = 7; bit >= 0; bit--) {
			if (!(byte & (1 << bit))) {
				done = true;
				break;
			}

			bits++;
		}

		if (done)
			break;
	}

	return bits;
};

/**
 * IPv4CIDR prototype.
 */
export let IPv4CIDRProto;
IPv4CIDRProto = {
	/**
	 * Return the original CIDR string.
	 *
	 * @returns {string}
	 */
	tostring: function() {
		const addr = arrtoip(this.bytes);

		return this.bits < 32
			? `${addr}/${this.bits}`
			: addr;
	},

	/**
	 * Derive the network address.
	 *
	 * @param {number|string|null} mask
	 * @returns {IPv4CIDR}
	 */
	network: function(mask) {
		const bits = parseIPv6Mask(mask, this.bits);
		const bytes = [];

		for (let i = 0; i < 4; i++) {
			const remaining = bits - i * 8;

			if (remaining >= 8)
				bytes[i] = this.bytes[i];
			else if (remaining <= 0)
				bytes[i] = 0;
			else {
				const mask = (0xff << (8 - remaining)) & 0xff;

				bytes[i] = this.bytes[i] & mask;
			}
		}

		// netaddr.range.network() returns a full-width address.
		return proto({
			bytes,
			bits: 32
		}, IPv4CIDRProto);
	},

	/**
	 * Check whether this CIDR contains another CIDR.
	 *
	 * @param {IPv4CIDR|string} other
	 * @returns {boolean}
	 */
	contains: function(other) {
		if (type(other) == 'string')
			other = IPv4CIDR(other);

		if (other == null || this.bits > other.bits)
			return false;

		const fullBytes = this.bits >> 3;
		const remainingBits = this.bits & 7;

		for (let i = 0; i < fullBytes; i++) {
			if (this.bytes[i] != other.bytes[i])
				return false;
		}

		if (remainingBits) {
			const mask = (0xff << (8 - remainingBits)) & 0xff;

			if ((this.bytes[fullBytes] & mask) !=
				(other.bytes[fullBytes] & mask))
				return false;
		}

		return true;
	},

	/**
	 * Check whether two CIDRs are exactly equal.
	 *
	 * @param {IPv4CIDR|string} other
	 * @returns {boolean}
	 */
	equals: function(other) {
		if (type(other) == 'string')
			other = IPv4CIDR(other);

		return other != null &&
			this.bits == other.bits &&
			this.contains(other);
	}
};

/**
 * IPv6CIDR prototype.
 */
export let IPv6CIDRProto;
IPv6CIDRProto = {
	/**
	 * Return the original CIDR string.
	 *
	 * @returns {string}
	 */
	tostring: function() {
		const addr = arrtoip(this.bytes);

		return this.bits < 128
			? `${addr}/${this.bits}`
			: addr;
	},

	/**
	 * Derive the network address.
	 *
	 * @param {number|string|null} mask
	 * @returns {IPv6CIDR}
	 */
	network: function(mask) {
		const bits = parseIPv6Mask(mask, this.bits);
		const bytes = [];

		for (let i = 0; i < 16; i++) {
			const remaining = bits - i * 8;

			if (remaining >= 8)
				bytes[i] = this.bytes[i];
			else if (remaining <= 0)
				bytes[i] = 0;
			else {
				const mask = (0xff << (8 - remaining)) & 0xff;

				bytes[i] = this.bytes[i] & mask;
			}
		}

		// netaddr.range.network() returns a full-width address.
		return proto({
			bytes,
			bits: 128
		}, IPv6CIDRProto);
	},

	/**
	 * Check whether this CIDR contains another CIDR.
	 *
	 * @param {IPv6CIDR|string} other
	 * @returns {boolean}
	 */
	contains: function(other) {
		if (type(other) == 'string')
			other = IPv6CIDR(other);

		if (other == null || this.bits > other.bits)
			return false;

		const fullBytes = this.bits >> 3;
		const remainingBits = this.bits & 7;

		for (let i = 0; i < fullBytes; i++) {
			if (this.bytes[i] != other.bytes[i])
				return false;
		}

		if (remainingBits) {
			const mask = (0xff << (8 - remainingBits)) & 0xff;

			if ((this.bytes[fullBytes] & mask) !=
				(other.bytes[fullBytes] & mask))
				return false;
		}

		return true;
	},

	/**
	 * Check whether two CIDRs are exactly equal.
	 *
	 * @param {IPv6CIDR|string} other
	 * @returns {boolean}
	 */
	equals: function(other) {
		if (type(other) == 'string')
			other = IPv6CIDR(other);

		return other != null &&
			this.bits == other.bits &&
			this.contains(other);
	}
};

/**
 * Create an IPv4 CIDR instance.
 *
 * @param {string} cidr
 * @returns {object|null}
 */
export function IPv4CIDR(cidr) {
	const parsed = parseIPv4CIDR(cidr);

	if (parsed == null)
		return null;

	return proto(parsed, IPv4CIDRProto);
};

/**
 * Create an IPv6 CIDR instance.
 *
 * @param {string} cidr
 * @returns {object|null}
 */
export function IPv6CIDR(cidr) {
	const parsed = parseIPv6CIDR(cidr);

	if (parsed == null)
		return null;

	return proto(parsed, IPv6CIDRProto);
};
/**** // @less_26_?? END ****/

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
