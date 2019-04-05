'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( './LightwaveSmartBridge' );

const WEBHOOK_ID = Homey.env.WEBHOOK_ID;
const WEBHOOK_SECRET = Homey.env.WEBHOOK_SECRET;

class LightwaveSmartApp extends Homey.App
{

    async onInit()
    {
        this.bridgeReady = false;
        this.webHookReady - false;
        this.gettingAccessToken = false;
        this.tokenNumber = 0;

        Homey.ManagerSettings.on( 'set', function( setting )
        {
            if ( ( setting === 'bearerid' ) || ( setting === 'refreshtoken' ) )
            {
                if ( Homey.ManagerSettings.get( 'bearerid' ) == "" )
                {
                    return;
                }
                if ( Homey.ManagerSettings.get( 'refreshtoken' ) == "" )
                {
                    return;
                }
                Homey.app.InitBridge( true );
            }
        } );

        this.log( 'LightwaveRF Smart app is running...' );

        this.bridge = new LightwaveSmartBridge();

        await this.InitBridge( false );

        this.log( '************** LightwaveRF Smart app has initialised. ***************' );
    }

    async InitBridge( SettingChanged )
    {
        if ( this.initialisingBridge )
        {
            return false;
        }

        this.initialisingBridge = true;

        this.log( "--------- InitBridge -------- " );

        this.bridgeReady = await this.bridge.initialise();

        if ( !Homey.ManagerSettings.get( 'unsupportedDevices' ) )
        {
            Homey.ManagerSettings.set( 'unsupportedDevices', "Pairing not run yet" )
        }

        if ( this.bridgeReady && !this.webHookReady )
        {
            await this.registerHomeyWebhook();
            if ( this.webHookReady && SettingChanged )
            {
                this.log( 'initialising devices' );
                const drivers = Homey.ManagerDrivers.getDrivers();
                for ( const driver in drivers )
                {
                    Homey.ManagerDrivers.getDriver( driver ).getDevices().forEach( device =>
                    {
                        device.initDevice()
                    } )
                }
            }
        }
        else
        {
            this.log( 'Bridge not ready' );
        }

        this.initialisingBridge = false;
    }

    async registerHomeyWebhook()
    {
        try
        {
            if ( await this.bridge.waitForBridgeReady() )
            {
                this.log( 'registering Homey WEBHook' );
                const bearerid = Homey.ManagerSettings.get( 'bearerid' );
                var data = { id: bearerid };

                this._webhook = new Homey.CloudWebhook( WEBHOOK_ID, WEBHOOK_SECRET, data );
                this._webhook.on( 'message', this._onWebhookMessage.bind( this ) );
                return this._webhook.register()
                    .then( () =>
                    {
                        this.log( 'Webhook registered' );
                        this.webHookReady = true;
                    } )
            }
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