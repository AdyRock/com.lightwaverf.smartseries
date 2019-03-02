'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( './LightwaveSmartBridge' );

class LightwaveSmartApp extends Homey.App
{

    onInit()
    {
        this.log( 'LightwaveRF Smart app is running...' );

        this.bridge = new LightwaveSmartBridge();

        if ( !Homey.ManagerSettings.get( 'unsupportedDevices' ) )
        {
            Homey.ManagerSettings.set( 'unsupportedDevices', "Pairing not run yet" )
        }
        const access_token = Homey.ManagerSettings.get( 'accesstoken' );
        if ( !access_token )
        {
            this.bridge.getNewTokens();
        }
        else
        {
            this.log( 'Using Old Access Token' );
        }
    }
}

module.exports = LightwaveSmartApp;