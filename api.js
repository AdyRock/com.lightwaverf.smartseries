const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = {

    async getSomething( { homey, query } )
    {
        return await homey.app.getSomething( query );
    },
    async postSomething( { homey, query, body } )
    {
        const result = homey.app.addSomething( body );
        return result;
    },
};