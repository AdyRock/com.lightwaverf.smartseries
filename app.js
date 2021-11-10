'use strict';

const LightwaveSmartApp = require('./lib/LightwaveSmartApp');

if (process.env.DEBUG === '1')
{
    // eslint-disable-next-line node/no-unsupported-features/node-builtins, global-require
    require('inspector').open(9222, '0.0.0.0', true);
}
module.exports = LightwaveSmartApp;
