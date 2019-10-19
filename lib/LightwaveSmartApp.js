'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( './LightwaveSmartBridge' );

const POLL_INTERVAL = 30000;
class LightwaveSmartApp extends Homey.App
{
    async onInit()
    {
        this.bridgeReady = false;
        this.gettingAccessToken = false;
        this.tokenNumber = 0;
        this.lwBridge = new LightwaveSmartBridge();
        this.oldBearerID = Homey.ManagerSettings.get( 'bearerid' );
        this.oldRefreshToken = Homey.ManagerSettings.get( 'refreshtoken' );
        this.oldUsePolling = Homey.ManagerSettings.get( 'usePolling' );
        this.oldPollingInterval = Homey.ManagerSettings.get( 'pollInterval' );
        this.timerProcessing = false;

        // Make sure polling interval is set to something
        if ( !this.oldPollingInterval || ( this.oldPollingInterval < 1000 ) || ( this.oldPollingInterval > 60000 ) )
        {
            Homey.ManagerSettings.set( 'pollInterval', POLL_INTERVAL );
            this.oldPollingInterval = Homey.ManagerSettings.get( 'pollInterval' );
        }

        Homey.ManagerSettings.set( 'diagLog', "Starting LW app\r\n" );

        if ( !this.homeyId ) this.homeyId = await Homey.ManagerCloud.getHomeyId();

        Homey.ManagerSettings.on( 'set', function( setting )
        {
            if ( ( setting === 'bearerid' ) || ( setting === 'refreshtoken' ) || ( setting === 'usePolling' ) || ( setting === 'pollInterval' ) )
            {
                if ( Homey.ManagerSettings.get( 'bearerid' ) == "" )
                {
                    Homey.app.updateLog( "No Bearer ID specified", false );
                    return;
                }
                if ( Homey.ManagerSettings.get( 'refreshtoken' ) == "" )
                {
                    Homey.app.updateLog( "No Refresh Token specified", false );
                    return;
                }

                if ( ( ( setting === 'bearerid' ) && ( Homey.ManagerSettings.get( 'bearerid' ) != Homey.app.oldBearerID ) ) ||
                    ( ( setting === 'usePolling' ) && ( Homey.ManagerSettings.get( 'usePolling' ) != Homey.app.oldUsePolling ) ) )
                {
                    // A new bearer id has been set or usePolling has been changed so re-initialise the bridge
                    clearTimeout( Homey.app.timerID );
                    Homey.app.updateLog( "--------- Setting Changed InitBridge -------- " );
                    Homey.app.oldBearerID = Homey.ManagerSettings.get( 'bearerid' );
                    Homey.app.oldUsePolling = Homey.ManagerSettings.get( 'usePolling' );
                    Homey.app.InitBridge( true );
                    Homey.app.timerID = setTimeout( Homey.app.onPoll, Homey.ManagerSettings.get( 'pollInterval' ) );
                }

                if ( ( setting === 'pollInterval' ) && ( Homey.ManagerSettings.get( 'pollInterval' ) != Homey.app.oldPollingInterval ) )
                {
                    clearTimeout( Homey.app.timerID );
                    Homey.app.oldPollingInterval = Homey.ManagerSettings.get( 'pollInterval' );
                    if ( !Homey.app.timerProcessing )
                    {
                        Homey.app.timerID = setTimeout( Homey.app.onPoll, Homey.ManagerSettings.get( 'pollInterval' ) );
                    }
                }
            }
        } );

        this.updateLog( "--------- App Start InitBridge -------- " );

        await this.InitBridge( false );

        this.onPoll = this.onPoll.bind( this );
        this.timerID = setTimeout( this.onPoll, Homey.ManagerSettings.get( 'pollInterval' ) );

        this.updateLog( '************** LightwaveRF Smart app has initialised. ***************' );
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

        const bridgeReady = await this.lwBridge.initialise();

        if ( !Homey.ManagerSettings.get( 'unsupportedDevices' ) )
        {
            Homey.ManagerSettings.set( 'unsupportedDevices', "Pairing not run yet" );
        }

        if ( bridgeReady )
        {
            this.bridgeReady = true;

            if ( SettingChanged )
            {
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

            this.updateLog( "Bridge ready" );
        }
        else
        {
            this.updateLog( "!! Bridge not ready !!" );
        }

        this.initialisingBridge = false;
        return this.bridgeReady;
    }

    async _onWebhookMessage( args )
    {
        try
        {
            if ( !args.body || !args.body.triggerEvent || !args.body.payload )
            {
                this.updateLog( "!!! Webhook missing body or triggerEvent or Payload !!!" );
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

            this.updateLog( "Webhook Update: " + capability + " = " + args.body.payload.value, true );

            const driver = Homey.ManagerDrivers.getDriver( driverId );
            if ( driver )
            {
                let devices = driver.getDevices();
                for ( var i = 0; i < devices.length; i++ )
                {
                    var device = devices[ i ];
                    if ( device.getData().id == deviceId )
                    {
                        this.updateLog( "Webhook found Device: " + capability + " = " + args.body.payload.value, true );

                        device.setWebHookValue( capability, args.body.payload.value );
                        return;
                    }
                }
            }
            this.updateLog( "!!! Webhook not matched: " + driverId + ", capability: " + capability + ", Value: " + args.body.payload.value, false );
        }
        catch ( err )
        {
            this.updateLog( "Webhook Error: " + err );
        }
    }

    async onPoll()
    {
        this.timerProcessing = true;
        const promises = [];
        try
        {
            if ( Homey.ManagerSettings.get( 'usePolling' ) )
            {
                this.updateLog( "\r\n*** Polling Start ***", true );

                // Fetch all the values in one go
                const valueList = await this.lwBridge.getLWValues();

                // Fetch the list of drivers for this app
                const drivers = Homey.ManagerDrivers.getDrivers();
                for ( const driver in drivers )
                {
                    let devices = Homey.ManagerDrivers.getDriver( driver ).getDevices();
                    for ( var i = 0; i < devices.length; i++ )
                    {
                        let device = devices[ i ];
                        if ( device.getDeviceValues )
                        {
                            promises.push( device.getDeviceValues( valueList ) );
                        }

                        if ( device.getEnergyValues )
                        {
                            promises.push( device.getEnergyValues( valueList ) );
                        }
                    }
                }

                await Promise.all( promises );
                this.updateLog( "*** Polling End ***\r\n", true );
            }
        }
        catch ( err )
        {
            this.updateLog( "Polling Error: " + err );
        }

        if ( Homey.ManagerSettings.get( 'usePolling' ) )
        {
            var nextInterval = Number( Homey.ManagerSettings.get( 'pollInterval' ) );
            if ( nextInterval < 5000 )
            {
                nextInterval = 5000;
            }
            this.updateLog( "Next Interval = " + nextInterval, true );
            this.timerID = setTimeout( this.onPoll, nextInterval );
        }
        this.timerProcessing = false;
    }

    updateLog( newMessage, webHookMessage )
    {
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

        this.log( newMessage );

        var oldText = Homey.ManagerSettings.get( 'diagLog' );
        oldText += "* ";
        oldText += newMessage;
        oldText += "\r\n";
        Homey.ManagerSettings.set( 'diagLog', oldText );
    }

    async getSomething( args )
    {
        this.updateLog( "GET: " + JSON.stringify( args, null, 2 ) );

        if ( args.query && args.query.cmd )
        {
            if ( args.query.cmd == "listEvents" )
            {
                const eventsList = await this.lwBridge.getLWWebhooks();
                return JSON.stringify( eventsList, null, 2 );
            }
            else if ( args.query.cmd == "listHistory" )
            {
                var start = "";
                if ( args.query.start )
                {
                    start = args.query.start;
                }
                const historyList = await this.lwBridge.getLWHistory( start );
                return JSON.stringify( historyList, null, 2 );
            }
            else if ( args.query.cmd == "listValues" )
            {
                const valueList = await this.lwBridge.getLWValues();
                return valueList;
            }
        }
        return "OK";
    }

    async addSomething( args )
    {
        //this.updateLog( "POST: " + JSON.stringify( args, null, 2 ), true );
        this._onWebhookMessage( args );
        return "OK";
    }

    async updateSomething( args )
    {
        this.updateLog( "PUT: " + JSON.stringify( args, null, 2 ) );
        return "OK";
    }

    async deleteSomething( args )
    {
        this.updateLog( "DELETE: " + JSON.stringify( args, null, 2 ) );
        return "OK";
    }
}

module.exports = LightwaveSmartApp;