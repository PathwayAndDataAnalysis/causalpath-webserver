var derby = require('derby');

exports.run = run;
var model;
var server;
var zlib = require('zlib');

function run(app, options, cb) {
	options || (options = {});
	var port = options.port || process.env.PORT || 3001; //| process.env.OPENSHIFT_NODEJS_PORT ;

	function listenCallback(err) {
		console.log(
			'%d listening. Go to: http://localhost:%d/',
			process.pid,
			port
		);
		cb && cb(err);
	}

	function createServer() {
		var userList = [];

		if (typeof app === 'string') app = require(app);

		require('./server').setup(
			app,
			options,
			function (err, expressApp, upgrade, refModel) {
				model = refModel;

				//To set the time for the messages

				model.on('all', 'messages.*', function (id, op, msg) {
					if (msg.date < 0) {
						msgPath = model.at('messages.' + id);
						msgPath.set('date', +new Date());
					}
				});

				if (err) {
					console.log(err);
					throw err;
				}

				server = require('http').createServer(expressApp);

				server.on('upgrade', upgrade);
				server.listen(port, listenCallback);
			}
		);

		return server;
	}

	derby.run(createServer);
}
