'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( './LightwaveSmartBridge' );

const WEBHOOK_ID = Homey.env.WEBHOOK_ID;
const WEBHOOK_SECRET = Homey.env.WEBHOOK_SECRET;

class LightwaveSmartApp extends Homey.App
{

    onInit()
    {
        this.bridgeReady = false;
        this.gettingAccessToken = false;
        this.tokenNumber = 0;

        this.log( 'LightwaveRF Smart app is running...' );

        this.bridge = new LightwaveSmartBridge();
        this.bridge.initialise();

        if ( !Homey.ManagerSettings.get( 'unsupportedDevices' ) )
        {
            Homey.ManagerSettings.set( 'unsupportedDevices', "Pairing not run yet" )
        }

        this.registerHomeyWebhook()

        this.log( '************** LightwaveRF Smart app has initialised. ***************' );
    }

    async registerHomeyWebhook()
    {
        try
        {
            await this.bridge.waitForBridgeReady();
            this.log( 'registering Homey WEBHook' );
            const bearerid = Homey.ManagerSettings.get( 'bearerid' );
            var data = {id: bearerid};

            this._webhook = new Homey.CloudWebhook( WEBHOOK_ID, WEBHOOK_SECRET, data );
            this._webhook.on( 'message', this._onWebhookMessage.bind( this ) );
            return this._webhook.register()
                .then( () =>
                {
                    this.log( 'Webhook registered' );
                } )
        }
        catch ( err )
        {
            this.log( 'registerHomeyWebhook error: ', err );
        }
    }

    _onWebhookMessage( args )
    {
        try
        {
            // this.log( "---------Webhook message: ", args );
            if ( !args.body || !args.body.triggerEvent || !args.body.payload )
            {
                this.log( "!!!!!!!!!!!!!!!!!!!!!!!!! Webhook missing body or triggerEvent or Payload !!!!!!!!!!!!!!!!!!!!!!!!!!!" );
                return;
            }

            // Get the ID of the device
            var hookData = args.body.id;
            var driverId = "";
            var deviceId = "";
            var capability = "";
            var dimmerParts = hookData.split( '_' );
            if ( Array.isArray( dimmerParts ) )
            {
                driverId = dimmerParts[ 0 ];
                deviceId = dimmerParts[ 1 ];
                capability = dimmerParts[ 2 ];
            }
            this.log( "Webhook driver id: ", driverId, " device id: ", deviceId, " capability: ", capability, " Value: ", args.body.payload.value );

            const driver = Homey.ManagerDrivers.getDriver( driverId );
            if ( driver )
            {
                driver.getDevices().forEach( device =>
                {
                    // this.log( "    Webhook trying Device: ", device.getData().id );
                    if ( device.getData().id === deviceId )
                    {
                        this.log( "Webhook found Device" );

                        if ( args.body && args.body.payload )
                        {
                            device.setWebHookValue( capability, args.body.payload.value );
                        }
                    }
                } )
            }
        }
        catch ( err )
        {
            this.log( "Webhook Error", err );
        }
    }
}

module.exports = LightwaveSmartApp;