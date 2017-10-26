const EventEmitter = require('events');

module.exports.createServer = jest.fn(() => {
	module.exports.__server = new EventEmitter();
	module.exports.__server.listen = jest.fn((port, cb) => cb());
	return module.exports.__server;
});

module.exports.connect = jest.fn(() => {
	module.exports.__socket = new EventEmitter();
	module.exports.__socket.authorized = true;
	module.exports.__socket.destroy = jest.fn();
	return module.exports.__socket;
});
