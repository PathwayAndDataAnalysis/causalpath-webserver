var coffeeify = require('coffeeify');
var compression = require('compression');
var derby = require('derby');
var express = require('express');
var favicon = require('serve-favicon');
var session = require('express-session');
var MongoStore = require('connect-mongo/es5')(session);
var highway = require('racer-highway');
var ShareDbMongo = require('sharedb-mongo');
var bodyParser = require('body-parser');
var api = require('./api');
derby.use(require('racer-bundle'));

exports.setup = setup;

function setup(app, options, cb) {
	var mongoUrl =
		process.env.MONGO_URL ||
		process.env.MONGOHQ_URL ||
		'mongodb://' +
			(process.env.MONGO_HOST || 'localhost') +
			':' +
			(process.env.MONGO_PORT || 27017) +
			'/' +
			(process.env.MONGO_DB || 'derby-' + (app.name || 'app'));

	var backend = derby.createBackend({
		db: new ShareDbMongo(mongoUrl),
	});

	backend.on('bundle', function (browserify) {
		// Add support for directly requiring coffeescript in browserify bundles
		browserify.transform({ global: true }, coffeeify);
	});

	var publicDir = __dirname + '/../public';

	var handlers = highway(backend);

	var expressApp = express()
		.use(favicon(publicDir + '/favicon.ico'))
		// Gzip dynamically rendered content
		.use(compression())
		.use(express.static(publicDir));

	expressApp
		// Adds req.model
		.use(backend.modelMiddleware())
		.use(
			session({
				secret: process.env.SESSION_SECRET || 'YOUR SECRET HERE',
				store: new MongoStore({ url: mongoUrl }),
				resave: true,
				saveUninitialized: false,
			})
		)
		.use(handlers.middleware)
		.use(bodyParser.json({ limit: '50mb' }))
		.use(bodyParser.urlencoded({ limit: '50mb', extended: true }))
		.use('/api', api)
		.use(createUserId);

	if (options && options.static) {
		if (Array.isArray(options.static)) {
			for (var i = 0; i < options.static.length; i++) {
				var o = options.static[i];
				expressApp.use(o.route, express.static(o.dir));
			}
		} else {
			expressApp.use(express.static(options.static));
		}
	}

	expressApp
		// Creates an express middleware from the app's routes
		.use(app.router())
		.use(errorMiddleware);

	expressApp.all('*', function (req, res, next) {
		next('404: ' + req.url);
	});

	app.writeScripts(
		backend,
		publicDir,
		{ extensions: ['.coffee'] },
		function (err) {
			var model = backend.createModel();

			// model.subscribe('documents');
			//model.subscribe('messages');
			model.subscribe('documents', function () {
				// Here we got the data
				// Subscription for future updates is registered
				// We can call render
			});

			// model.subscribe('messages', function(){
			// });
			//
			//
			// model.subscribe('users', function(){
			// });
			// model.subscribe('chat', function(){
			//     model.createNull('chat', {userCount:0});
			// });
			//

			cb(err, expressApp, handlers.upgrade, model);
		}
	);
}

function createUserId(req, res, next) {
	var userId = req.session.userId;
	if (!userId) userId = req.session.userId = req.model.id();
	req.model.set('_session.userId', userId);

	console.log('Session id: ' + userId);
	next();
}

var errorApp = derby.createApp();
errorApp.loadViews(__dirname + '/../views/error');
errorApp.loadStyles(__dirname + '/../styles/reset');
errorApp.loadStyles(__dirname + '/../styles/error');

function errorMiddleware(err, req, res, next) {
	if (!err) return next();

	var message = err.message || err.toString();
	var status = parseInt(message);
	status = status >= 400 && status < 600 ? status : 500;

	if (status < 500) {
		console.log(err.message || err);
	} else {
		console.log(err.stack || err);
	}

	var page = errorApp.createPage(req, res, next);
	page.renderStatic(status, status.toString());
}
