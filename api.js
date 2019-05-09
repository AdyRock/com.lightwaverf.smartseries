const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = [

    {
        method: 'GET',
        path: '/',
        public: true,
        fn: function( args, callback )
        {
            const result = Homey.app.getSomething( args );

            // callback follows ( err, result )
            callback( null, result );

            // access /?foo=bar as args.query.foo
        }
    },

    {
        method: 'POST',
        path: '/',
        public: true,
        fn: function( args, callback )
        {
            const result = Homey.app.addSomething( args );
            if ( result instanceof Error ) return callback( result );
            return callback( null, result );
        }
    },

    {
        method: 'PUT',
        path: '/',
        public: true,
        fn: function( args, callback )
        {
            const result = Homey.app.updateSomething( args );
            if ( result instanceof Error ) return callback( result );
            return callback( null, result );
        }
    },

    {
        method: 'DELETE',
        path: '/',
        public: true,
        fn: function( args, callback )
        {
            const result = Homey.app.deleteSomething( args );
            if ( result instanceof Error ) return callback( result );
            return callback( null, result );
        }
    }

]