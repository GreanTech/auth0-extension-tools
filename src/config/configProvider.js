const _ = require('lodash');
const ArgumentError = require('../errors').ArgumentError;

module.exports.fromWebtaskContext = function(webtaskContext, seed) {
  if (webtaskContext === null || webtaskContext === undefined) {
    throw new ArgumentError('Must provide a webtask context');
  }
  if (seed === null || typeof seed !== typeof {}) {
    seed = {};
  }

  const defaultConfig = {
    AUTH0_RTA: 'auth0.auth0.com'
  };

  const settings = _.assign(defaultConfig, seed, process.env, webtaskContext.params, webtaskContext.secrets, {
    NODE_ENV: 'production',
    HOSTING_ENV: 'webtask'
  });

  return function getSettings(key) {
    return settings[key];
  };
};
