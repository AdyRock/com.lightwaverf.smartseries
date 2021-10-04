'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = class lwrelay extends Homey.Driver
{

    async onInit()
    {
        try
        {
            await this.homey.app.getBridge().waitForBridgeReady();
        }
        catch ( err )
        {
            this.homey.app.updateLog( "lwrelay Driver OnInit Error " + err );
        }
    }

    // this is the easiest method to overwrite, when only the template 'Drivers-Pairing-System-Views' is being used.
    async onPairListDevices()
    {
        return this.homey.app.getBridge().getDevicesOfType( 'relay' );
    }
};

//module.exports = MyDriver;