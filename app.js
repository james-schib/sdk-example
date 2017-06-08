'use strict';

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { ServerApi } = require('schibsted-core-sdk-node');
const schIdentity = require('schibsted-identity-sdk');
const fetch = require('node-fetch');
const config = require('./config');
const pkgJson = require('./package');
const hbs = require('hbs');

const spidSrvApi = new ServerApi(fetch, config.spidBaseUrl, config.clientId, config.clientSecret);

const app = express();

const redirectUri = (uriPath) => {
    const port = (config.env === 'production') ? '' : `:${config.port}`;
    return `${config.protocol}://${config.hostname}${port}${uriPath}`;
};

app.set('views', './views');
// register path to partials. Please note that the partials are cached into memory so the server
// needs to re-run to consider the latest changes but this limitation doesn't exist for normal
// view files.
// @see https://www.npmjs.com/package/hbs#helpers-and-partials
hbs.registerPartials('./views/partials');
// @see https://github.com/pillarjs/hbs
app.set('view engine', 'hbs');

app.use(helmet());

app.use(session({
    name: `${pkgJson.name}_session_id`,
    secret: config.cookieSecret,
    resave: true,
    saveUninitialized: false
}));

app.use('/public', express.static('public'));

app.get('/', function (req, res) {
    res.render('index', { pkgJson, config, loggedIn: req.session.token });
});

app.get('/safepage', function (req, res) {
    // TODO remove this
    console.log('A request to safe page received!');
    const code = req.query.code;
    // TODO remove me: request.get('/oauth/ro', { code });
    if (!code) {
        throw new Error('The "code" parameter is not passed to the safe page');
    }
    console.log('Code:', code);
    /*
    Note about redirect_uri:
    It should be exactly the same as the redirect_uri in the original auth request
    TODO: don't hard code this
    */
    schIdentity.token.getFromAuthCode(spidSrvApi, code, redirectUri('/safepage'))
        .then(
            (response) => {
                console.log('-------------and here is our response:', response);
                schIdentity.token.introspect(spidSrvApi, response.access_token).then(console.log, console.error);
                req.session.token = response.access_token;
                // tokenIntrospection(response.access_token).then(console.log, console.error);
                res.render('safepage', { closeTimeout: 2000 });
            },
            err => {
                console.log('--------------------------------------01', err);
                res.render('error', { status: 500, err });
            }
        );
});

app.get('/tokenpage', function (req, res) {
    console.log('tokenpage', req.body);
    /* We use session middleware so no need to set the cookie like this
    // @see https://expressjs.com/sk/api.html#res.cookie
    res.cookie(config.cookieName, code, {
        // httpOnly: true,
        // secure: true,
        // sameSite: true,
        // signed: true,
        maxAge: 100000,
        // expires: 0 // session cookie
    });
    */
    res.render('tokenpage', { data: req });
});

app.delete('/session', (req, res) => {
    res.clearCookie(`${pkgJson.name}_session_id`);
    res.status(204).end();
});

// For any route not found
app.use((req, res, next) => {
    const error = new Error(`Invalid route: ${req.originalUrl}`);
    error.status = 404;
    next(error);
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error: ', err);
    res.render('error', {
        status: err.status || 500,
        error: err || 'no description'
    });
});

module.exports = app;
