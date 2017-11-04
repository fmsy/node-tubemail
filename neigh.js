const EventEmitter = require('events');
const tls = require('tls');
const util = require('util');
const set = require('./set.js');
const FSM = require('./fsm.js').FSM;
const S2B = require('./stream2block.js');

const EMJ = Buffer.from('🛰');

function Neigh (socket) {
	EventEmitter.call(this);
	if (socket) set.hidden(this, 'socket', socket);
}
util.inherits(Neigh, EventEmitter);

const connect = (opts) => (n, state, destroy) => {
	set.hidden(n, 'socket', tls.connect({
		host: opts.remote.host,
		port: opts.remote.port,
		ca: [opts.local.ca],
		key: opts.local.key,
		cert: opts.local.cert,
		checkServerIdentity: () => undefined
	}).on('secureConnect', () => {
		state(opts.state);
	}).on('error', (err) => {
		destroy(err);
	}));
};

const checkAuth = (opts) => (n, state, destroy) => {
	if (n.socket.authorized) {
		set.hidden(n, 'interface', new S2B(n.socket));
		state(opts.state);
	} else {
		destroy(new Error(n.socket.authorizationError));
	}
};

const getSocketInfo = (opts) => (n, state, destroy) => {
	set.readonly(n, 'host', n.socket.remoteAddress);
	set.readonly(n, 'port', n.socket.remotePort);
	set.readonly(n, 'cert', n.socket.getPeerCertificate());
	state(opts.state);
};

const check = (cond, msg) => { if (!cond) throw new Error(msg); };
const receiveRemoteID = (opts) => (n, state, destroy) => {
	n.interface.on('data', (x) => {
		try {
			// Check if welcome message is complete
			check(x.length === EMJ.length + 64, 'Incomplete welcome message');
			check(Buffer.compare(EMJ, x.slice(0, EMJ.length)) === 0, 'Magic missing');

			// Extract ID
			set.hidden(n, '_id', x.slice(EMJ.length));
			set.readonly(n, 'id', n._id.toString('hex'));

			// Check it if we should keep the connection
			const cmp = Buffer.compare(opts.local._id, n._id);
			check(cmp !== 0, 'We connected ourselfes');
			if (opts.inbound) {
				check(cmp < 0, 'Remote ID lower than ours');
			} else {
				check(cmp > 0, 'Remote ID higher than ours');
			}

			// Check if we already know the other side
			check(opts.local.knownIDs.indexOf(n.id) === -1, 'Remote ID is already connected');

			state(opts.state);
		} catch (e) {
			destroy(e);
		}
	}).on('close', () => destroy(new Error('Remote host closed the connection')));
	setTimeout(() => destroy(new Error('Remote host has not sent its ID')), 5000);
};

const sendLocalID = (opts) => (n, state, destroy) => {
	n.interface.send(Buffer.concat([EMJ, opts.local._id]));
	state(opts.state);
};

const connected = (opts) => (n, state, destroy) => {
	n.interface.on('data', (data) => {
		n.emit('message', data);
	}).on('close', () => {
		destroy(new Error('Connection closed'));
	});
};

const onLeave = (n) => {
	if (n.socket) {
		n.socket.removeAllListeners('secureConnect');
		n.socket.removeAllListeners('error');
	}
	if (n.interface) {
		n.interface.removeAllListeners('data');
		n.interface.removeAllListeners('close');
	}
};

const onDestroy = (n) => {
	if (n.socket && !n.socket.destroyed) n.socket.destroy();
};

const outbound = (local, remote) => FSM({
	onLeave,
	onDestroy,
	firstState: 'connect',
	states: {
		connect: connect({state: 'checkAuth', remote, local}),
		checkAuth: checkAuth({state: 'getSocketInfo'}),
		getSocketInfo: getSocketInfo({state: 'receiveRemoteID'}),
		receiveRemoteID: receiveRemoteID({state: 'sendLocalID', local, inbound: false}),
		sendLocalID: sendLocalID({state: 'connected', local}),
		connected: connected({})
	}
})(new Neigh());

const inbound = (local, socket) => FSM({
	onLeave,
	onDestroy,
	firstState: 'checkAuth',
	states: {
		checkAuth: checkAuth({state: 'getSocketInfo'}),
		getSocketInfo: getSocketInfo({state: 'sendLocalID'}),
		sendLocalID: sendLocalID({state: 'receiveRemoteID', local}),
		receiveRemoteID: receiveRemoteID({state: 'connected', local, inbound: true}),
		connected: connected({})
	}
})(new Neigh(socket));

module.exports = {
	outbound,
	inbound
};
