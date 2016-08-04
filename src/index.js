const _ = require('lodash');
const Webtask = require('webtask-tools');

const tools = module.exports = { };

/*
 * Helper to turn the current webtaskContext which contains params/secrets into a config provider.
 * A config provider is just a method which returns a setting for a given key.
 */
tools.toConfigProvider = function(webtaskContext) {
  const settings = _.assign({ }, process.env, webtaskContext.params, webtaskContext.secrets, {
    NODE_ENV: 'production',
    HOSTING_ENV: 'webtask'
  });

  return function(key) {
    return settings[key];
  };
};

/*
 * Bootstrap function to run initialize a server (connect, express, ...).
 */
tools.createServer = function(cb) {
  let server = null;

  return (req, res) => {
    if (!server) {
      const configProvider = tools.toConfigProvider(req.webtaskContext);
      server = cb(req, configProvider, req.webtaskContext.storage);
    }

    return server(req, res);
  };
};

/*
 * Bootstrap function to run initialize an Express server.
 */
tools.createExpressServer = function(cb) {
  return Webtask.fromExpress(tools.createServer(cb));
};

/*
 * Bootstrap function to run initialize a Hapi server.
 */
tools.createHapiServer = function(cb) {
  return Webtask.fromHapi(tools.createServer(cb));
}
