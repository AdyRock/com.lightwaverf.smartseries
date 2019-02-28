'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( './LightwaveSmartBridge' );

class LightwaveSmartApp extends Homey.App
{

    onInit()
    {
        this.log( 'LightwaveRF Smart app is running...' );

        this.bridge = new LightwaveSmartBridge();

        const access_token = Homey.ManagerSettings.get( 'accesstoken' );
        if ( !access_token )
        {
            this.bridge.getNewTokens();
        }
        else
        {
            this.log( 'Using Old Access Token = ', access_token );
        }
    }
}

module.exports = LightwaveSmartApp;