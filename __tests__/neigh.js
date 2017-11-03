const EventEmitter = require('events');

jest.mock('tls');
const tls = require('tls');

jest.mock('../stream2block.js');

jest.mock('../fsm.js');
const FSM = require('../fsm.js');

const neigh = require('../neigh.js');

describe('outbound factory', () => {
	test('store host and port', () => {
		const remote = { host: 'peni$', port: 69 };
		neigh.outbound({}, remote);
		expect(FSM.__data.host).toEqual(remote.host);
		expect(FSM.__data.port).toEqual(remote.port);
	});

	test('connect to discovered host', (done) => {
		const local = {
			id: Buffer.alloc(64, 'z').toString('hex'),
			ca: Buffer.alloc(0),
			key: Buffer.alloc(0),
			cert: Buffer.alloc(0),
			knownIDs: []
		};
		const remote = {
			host: 'peni$',
			port: 69
		};
		neigh.outbound(local, remote);
		FSM.__config.states.connect(FSM.__data, (state) => {
			try {
				expect(state).toEqual('receiveRemoteID');
				expect(tls.connect.mock.calls[0][0]).toMatchObject({
					ca: [local.ca],
					key: local.key,
					cert: local.cert,
					host: remote.host,
					port: remote.port
				});
				done();
			} catch (e) { done(e); }
		});
		tls.__socket.emit('secureConnect');
	});

	test('reject if connection is not authorised', (done) => {
		neigh.outbound({}, {});
		const reason = 'Ohne Tasche keine Competition!';
		FSM.__config.states.connect(FSM.__data, () => {}, (err) => {
			try {
				expect(err.message).toEqual(reason);
				done();
			} catch (e) { done(e); }
		});
		tls.__socket.authorized = false;
		tls.__socket.authorizationError = reason;
		tls.__socket.emit('secureConnect');
	});

	test('reject if too short welcome message has been sent', (done) => {
		neigh.outbound({}, {});
		const i = new EventEmitter();
		const n = { interface: i };
		FSM.__config.states.receiveRemoteID(n, () => {}, (err) => {
			try {
				expect(err.message).toEqual('Incomplete welcome message');
				done();
			} catch (e) { done(e); }
		});
		i.emit('data', Buffer.alloc(0));
	});

	test('reject if no magic emoji has been sent', (done) => {
		neigh.outbound({}, {});
		const i = new EventEmitter();
		const n = { interface: i };
		FSM.__config.states.receiveRemoteID(n, () => {}, (err) => {
			try {
				expect(err.message).toEqual('Magic missing');
				done();
			} catch (e) { done(e); }
		});
		i.emit('data', Buffer.alloc(64 + 4));
	});

	test('reject if remote id is higher than ours', (done) => {
		neigh.outbound({ id: Buffer.alloc(64, 'a').toString('hex') }, {});
		const i = new EventEmitter();
		const n = { interface: i };
		FSM.__config.states.receiveRemoteID(n, () => {}, (err) => {
			try {
				expect(err.message).toEqual('Remote ID higher than ours');
				done();
			} catch (e) { done(e); }
		});
		i.emit('data', Buffer.concat([
			Buffer.from('🛰'),
			Buffer.alloc(64, 'b')
		]));
	});

	test('reject if remote id is equal', (done) => {
		neigh.outbound({ id: Buffer.alloc(64, 'a').toString('hex') }, {});
		const i = new EventEmitter();
		const n = { interface: i };
		FSM.__config.states.receiveRemoteID(n, () => {}, (err) => {
			try {
				expect(err.message).toEqual('We connected ourselfes');
				done();
			} catch (e) { done(e); }
		});
		i.emit('data', Buffer.concat([
			Buffer.from('🛰'),
			Buffer.alloc(64, 'a')
		]));
	});

	test('reject if remote id is known', (done) => {
		const id = Buffer.alloc(64, 'a');
		neigh.outbound({
			id: Buffer.alloc(64, 'b').toString('hex'),
			knownIDs: [ id.toString('hex') ]
		}, {});
		const i = new EventEmitter();
		const n = { interface: i };
		FSM.__config.states.receiveRemoteID(n, () => {}, (err) => {
			try {
				expect(err.message).toEqual('Remote ID is already connected');
				done();
			} catch (e) { done(e); }
		});
		i.emit('data', Buffer.concat([
			Buffer.from('🛰'),
			id
		]));
	});

	test('destroy socket if fsm is left', () => {
		const socket = {
			destroyed: false,
			destroy: jest.fn()
		};
		neigh.outbound({}, {});
		FSM.__config.onDestroy({ socket: socket });
		expect(socket.destroy.mock.calls.length).toEqual(1);
	});

	test('go to next state if we accepted the remote host', (done) => {
		const id = Buffer.alloc(64, 'a');
		neigh.outbound({
			id: Buffer.alloc(64, 'b').toString('hex'),
			knownIDs: []
		}, {});
		const i = new EventEmitter();
		const n = { interface: i };
		FSM.__config.states.receiveRemoteID(n, (state) => {
			try {
				expect(state).toEqual('sendLocalID');
				done();
			} catch (e) { done(e); }
		});
		i.emit('data', Buffer.concat([
			Buffer.from('🛰'),
			id
		]));
	});

	test('send local ID if we want to say hi to outbound neigh', (done) => {
		const EMJ = Buffer.from('🛰');
		const localID = Buffer.alloc(64, 'z');
		const localWelcome = Buffer.concat([ EMJ, localID ]);
		neigh.outbound({ id: localID.toString('hex') }, {});
		const i = { send: jest.fn((d, c) => c()) };
		FSM.__config.states.sendLocalID({ interface: i }, (state) => {
			try {
				expect(i.send.mock.calls[0][0].toString('hex')).toEqual(localWelcome.toString('hex'));
				expect(state).toEqual('connected');
				done();
			} catch (e) { done(e); }
		});
	});
});
