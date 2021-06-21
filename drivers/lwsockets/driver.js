'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = class lwsockets extends Homey.Driver
{

    async onInit()
    {
        try
        {
            await Homey.app.getBridge().waitForBridgeReady();
        }
        catch ( err )
        {
            Homey.app.updateLog( "lwsockets Driver OnInit Error " + err );
        }
    }

    // this is the easiest method to overwrite, when only the template 'Drivers-Pairing-System-Views' is being used.
    onPairListDevices( data, callback )
    {
        // Required properties:
        //"data": { "id": "abcd" },

        // Optional properties, these overwrite those specified in app.json:
        // "name": "My Device",
        // "icon": "/my_icon.svg", // relative to: /drivers/<driver_id>/assets/
        // "capabilities": [ "onoff", "dim" ],
        // "capabilitiesOptions: { "onoff": {} },

        // Optional properties, device-specific:
        // "store": { "foo": "bar" },
        // "settings": { "my_setting": "my_value" },

        Homey.app.getBridge().getDevicesOfType( 'socket' ).then( function( devices )
        {
            callback( null, devices );

        } ).catch( function( err )
        {
            callback( new Error( "Connection Failed" + err ), [] );
        } );
    }

};

//module.exports = lwsockets;