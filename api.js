const Homey = require( 'homey' );

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