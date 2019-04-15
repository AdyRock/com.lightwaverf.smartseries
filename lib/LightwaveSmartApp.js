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
        this.lwBridge = new LightwaveSmartBridge();
        this.oldBearerID = Homey.ManagerSettings.get( 'bearerid' );
        this.oldRefreshToken = Homey.ManagerSettings.get( 'refreshtoken' );
        this.locationID = Homey.ManagerSettings.get( 'locationid' );

        Homey.ManagerSettings.set( 'diagLog', "Starting LW app\r\n" );

        Homey.ManagerSettings.on( 'set', function( setting )
        {
            if ( ( setting === 'bearerid' ) || ( setting === 'refreshtoken' ) )
            {
                if ( Homey.ManagerSettings.get( 'bearerid' ) == "" )
                {
                    this.updateLog( "No Bearer ID specified", false );
                    return;
                }
                if ( Homey.ManagerSettings.get( 'refreshtoken' ) == "" )
                {
                    this.updateLog( "No Refresh Token specified", false );
                    return;
                }

                if ( ( ( setting === 'bearerid' ) && ( Homey.ManagerSettings.get( 'bearerid' ) != Homey.app.oldBearerID ) ) ||
                    ( ( setting === 'locationid' ) && ( Homey.ManagerSettings.get( 'locationid' ) != Homey.app.locationID ) ) )
                {
                    // A new bearer id has been set so re-initialise the bridge
                    Homey.app.oldBearerID = Homey.ManagerSettings.get( 'bearerid' );
                    Homey.app.locationID = Homey.ManagerSettings.get( 'locationid' );
                    Homey.app.InitBridge( true );
                }
            }
        } );

        this.log( 'LightwaveRF Smart app is running...' );

        await this.InitBridge( false );

        this.log( '************** LightwaveRF Smart app has initialised. ***************' );
    }

    getBridge()
    {
        return this.lwBridge;
    }

    async InitBridge( SettingChanged )
    {
        if ( this.initialisingBridge )
        {
            this.updateLog( "Bridge already being initialised " );
            return false;
        }

        this.initialisingBridge = true;

        this.log( "--------- InitBridge -------- " );
        this.updateLog( "--------- App InitBridge -------- " );

        const bridgeReady = await this.lwBridge.initialise();

        if ( !Homey.ManagerSettings.get( 'unsupportedDevices' ) )
        {
            Homey.ManagerSettings.set( 'unsupportedDevices', "Pairing not run yet" );
        }

        if ( bridgeReady )
        {
            const lwstructures = await this.lwBridge.getLocations();
            if ( !lwstructures )
            {
                Homey.app.updateLog( "Failed to get locations" );

                return false;
            }

            this.locationID = lwstructures[ 'structures' ][ 0 ];

            if ( !this.locationID )
            {
                Homey.app.updateLog( "No Location ID found", false );
                return false;
            }

            // Get first section of location ID
            var n = this.locationID.indexOf( '-' );
            this.locationID = "_" + this.locationID.substring( 0, n != -1 ? n : this.locationID.length ) + "-";
            Homey.app.updateLog( "Location: " + this.locationID );

            this.bridgeReady = true;

            if ( !this.webHookReady )
            {
                await this.registerHomeyWebhook();
                if ( this.webHookReady && SettingChanged )
                {
                    this.log( 'initialising devices' );
                    this.updateLog( "Initialising Devices" );

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

            this.updateLog( "Bridge ready" );
        }
        else
        {
            this.log( 'Bridge not ready' );
            this.updateLog( "!! Bridge not ready !!" );
        }

        this.initialisingBridge = false;
        return this.bridgeReady;
    }

    async registerHomeyWebhook()
    {
        try
        {
            if ( await this.lwBridge.waitForBridgeReady() )
            {
                this.updateLog( "Registering Homey WEBHook" );

                var data = { id: this.locationID };
                this.updateLog( "WebHook data: " + JSON.stringify( data, null, 2 ) );

                this._webhook = new Homey.CloudWebhook( WEBHOOK_ID, WEBHOOK_SECRET, data );
                this._webhook.on( 'message', this._onWebhookMessage.bind( this ) );
                return this._webhook.register()
                    .then( () =>
                    {
                        this.updateLog( "Webhook registered" );

                        this.webHookReady = true;
                    } )
                    .catch( (err) =>
                    {
                        this.updateLog( "Register WEBHook Error: " + err );
                    })
            }
        }
        catch ( err )
        {
            this.updateLog( "Register WEBHook Error: " + err );
        }
    }

    _onWebhookMessage( args )
    {
        try
        {
            // this.log( "---------Webhook message: ", args );
            if ( !args.body || !args.body.triggerEvent || !args.body.payload )
            {
                this.updateLog( "!!! Webhook missing body or triggerEvent or Payload !!!" );
                return;
            }

            this.log( "\r\n\r\n***** Webhook callback: ", args.query, " body = ", args.body, " ******\r\n" );

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

            var foundMatch = false;
            const driver = Homey.ManagerDrivers.getDriver( driverId );
            if ( driver )
            {
                driver.getDevices().forEach( device =>
                {
                    if ( device.getData().id == deviceId )
                    {
                        this.updateLog( "Webhook found Device", true );

                        if ( args.body && args.body.payload )
                        {
                            device.setWebHookValue( capability, args.body.payload.value );
                        }

                        foundMatch = true;
                        return;
                    }
                } )
            }
            if ( !foundMatch )
            {
                this.updateLog( "!!! Webhook not matched: " + driverId + ", capability: " + capability + ", Value: " + args.body.payload.value, false );
            }
        }
        catch ( err )
        {
            this.updateLog( "Webhook Error: " + err );
        }
    }

    updateLog( newMessage, webHookMessage )
    {
        this.log( newMessage );

        if ( !Homey.ManagerSettings.get( 'logEnabled' ) )
        {
            return;
        }

        if ( webHookMessage )
        {
            if ( !Homey.ManagerSettings.get( 'logWebhooks' ) )
            {
                return;
            }
        }

        var oldText = Homey.ManagerSettings.get( 'diagLog' );
        oldText += newMessage;
        oldText += "\r\n";
        Homey.ManagerSettings.set( 'diagLog', oldText );
    }
}

module.exports = LightwaveSmartApp;