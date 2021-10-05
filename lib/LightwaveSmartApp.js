'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../lib/LightwaveSmartBridge' );

const POLL_INTERVAL = 30000;
class LightwaveSmartApp extends Homey.App
{
    async onInit()
    {
        this.updateLog( '************** LightwaveRF Smart app is initialising. ***************' );
        this.bridgeReady = false;
        this.gettingAccessToken = false;
        this.tokenNumber = 0;

        this.oldBearerID =this.homey.settings.get( 'bearerid' );
        this.homey.app.bearerid = this.oldBearerID;
        this.oldRefreshToken =this.homey.settings.get( 'refreshtoken' );
        this.homey.app.refreshtoken = this.oldRefreshToken;

        this.oldUsePolling =this.homey.settings.get( 'usePolling' );
        this.oldPollingInterval =this.homey.settings.get( 'pollInterval' );
        this.timerProcessing = false;

        // Make sure polling interval is set to something
        if ( !this.oldPollingInterval || ( this.oldPollingInterval < 1000 ) || ( this.oldPollingInterval > 60000 ) )
        {
           this.homey.settings.set( 'pollInterval', POLL_INTERVAL );
            this.oldPollingInterval =this.homey.settings.get( 'pollInterval' );
        }

       this.homey.settings.set( 'diagLog', "Starting LW app\r\n" );

       this.homeyId = await this.homey.cloud.getHomeyId();
       const webhookUrl = `https://webhooks.athom.com/webhook/${Homey.env.WEBHOOK_ID}?homey=${this.homeyId}`;

       const id = Homey.env.WEBHOOK_ID;
       const secret = Homey.env.WEBHOOK_SECRET;
       const myWebhook = await this.homey.cloud.createWebhook(id, secret, {});
   
       myWebhook.on('message', args => {
         this.log('Got a webhook message!');
         this.log('headers:', args.headers);
         this.log('query:', args.query);
         this.log('body:', args.body);
         this.addSomething( args.body );
       });
   
       this.lwBridge = new LightwaveSmartBridge(this.homey, webhookUrl);

       this.homey.settings.on( 'set', function( setting )
        {
            if ( ( setting === 'bearerid' ) || ( setting === 'refreshtoken' ) || ( setting === 'usePolling' ) || ( setting === 'pollInterval' ) )
            {
                if (this.homey.settings.get( 'bearerid' ) == "" )
                {
                    this.homey.app.updateLog( "No Bearer ID specified", false );
                    return;
                }
                if (this.homey.settings.get( 'refreshtoken' ) == "" )
                {
                    this.homey.app.updateLog( "No Refresh Token specified", false );
                    return;
                }

                if ( ( ( setting === 'bearerid' ) && (this.homey.settings.get( 'bearerid' ) != this.homey.app.oldBearerID ) ) ||
                    ( ( setting === 'usePolling' ) && (this.homey.settings.get( 'usePolling' ) != this.homey.app.oldUsePolling ) ) )
                {
                    this.homey.app.bearerid = this.homey.settings.get( 'bearerid' );
                    this.homey.app.refreshtoken = this.homey.settings.get( 'refreshtoken' );
            
                    // A new bearer id has been set or usePolling has been changed so re-initialise the bridge
                    this.homey.clearTimeout( this.homey.app.timerID );
                    this.homey.app.updateLog( "--------- Setting Changed InitBridge -------- " );
                    this.homey.app.oldBearerID = this.homey.settings.get( 'bearerid' );
                    this.homey.app.oldUsePolling = this.homey.settings.get( 'usePolling' );
                    this.homey.app.InitBridge( true );
                    this.homey.app.timerID = this.homey.setTimeout( this.homey.app.onPoll,this.homey.settings.get( 'pollInterval' ) );
                }

                if ( ( setting === 'pollInterval' ) && (this.homey.settings.get( 'pollInterval' ) != this.homey.app.oldPollingInterval ) )
                {
                    this.homey.clearTimeout( this.homey.app.timerID );
                    this.homey.app.oldPollingInterval =this.homey.settings.get( 'pollInterval' );
                    if ( !this.homey.app.timerProcessing )
                    {
                        this.homey.app.timerID = this.homey.setTimeout( this.homey.app.onPoll,this.homey.settings.get( 'pollInterval' ) );
                    }
                }
            }
        } );

        this.updateLog( "--------- App Start InitBridge -------- " );

        await this.InitBridge( false );

        this.onPoll = this.onPoll.bind( this );
        this.timerID = this.homey.setTimeout( this.onPoll,this.homey.settings.get( 'pollInterval' ) );

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

        try
        {
            this.initialisingBridge = true;

            const bridgeReady = await this.lwBridge.initialise();

            if ( !this.homey.settings.get( 'unsupportedDevices' ) )
            {
            this.homey.settings.set( 'unsupportedDevices', "Pairing not run yet" );
            }

            if ( bridgeReady )
            {
                this.bridgeReady = true;

                if ( SettingChanged )
                {
                    this.updateLog( "Initialising Devices" );

                    const drivers = this.homey.drivers.getDrivers();
                    for ( const driver in drivers )
                    {
                        this.homey.drivers.getDriver( driver ).getDevices().forEach( device =>
                        {
                            device.initDevice();
                        });
                    }
                }

                this.updateLog( "Bridge ready" );
            }
            else
            {
                this.updateLog( "!! Bridge not ready !!" );
            }
        }
        catch(err)
        {
            this.updateLog( `!! Bridge error: ${err.message} !!` );
        }

        this.initialisingBridge = false;
        return this.bridgeReady;
    }

    async _onWebhookMessage( body )
    {
        try
        {
            if ( !body || !body.triggerEvent || !body.payload )
            {
                this.updateLog( "!!! Webhook missing body or triggerEvent or Payload !!!" );
                return;
            }

            // Get the ID of the device
            var hookData = body.id;
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

            this.updateLog( "Webhook Update: " + capability + " = " + body.payload.value, true );

            const driver = this.homey.drivers.getDriver( driverId );
            if ( driver )
            {
                let devices = driver.getDevices();
                for ( var i = 0; i < devices.length; i++ )
                {
                    var device = devices[ i ];
                    if ( device.getData().id == deviceId )
                    {
                        this.updateLog( "Webhook found Device (" + device.getName() + "): " + capability + " = " + body.payload.value, true );

                        device.setWebHookValue( capability, body.payload.value );
                        return;
                    }
                }
            }
            this.updateLog( "!!! Webhook not matched: " + driverId + ", capability: " + capability + ", Value: " + body.payload.value, false );
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
            if (this.homey.settings.get( 'usePolling' ) )
            {
                this.updateLog( "\r\n*** Polling Start ***", true );

                // Fetch all the values in one go
                const valueList = await this.lwBridge.getLWValues();

                // Fetch the list of drivers for this app
                const drivers = this.homey.drivers.getDrivers();
                for ( const driver in drivers )
                {
                    let devices = this.homey.drivers.getDriver( driver ).getDevices();
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

        if (this.homey.settings.get( 'usePolling' ) )
        {
            var nextInterval = Number(this.homey.settings.get( 'pollInterval' ) );
            if ( nextInterval < 5000 )
            {
                nextInterval = 5000;
            }
            this.updateLog( "Next Interval = " + nextInterval, true );
            this.timerID = this.homey.setTimeout( this.onPoll, nextInterval );
        }
        this.timerProcessing = false;
    }

    updateLog( newMessage, webHookMessage )
    {
        if ( !this.homey.settings.get( 'logEnabled' ) )
        {
            return;
        }

        if ( webHookMessage )
        {
            if ( !this.homey.settings.get( 'logWebhooks' ) )
            {
                return;
            }
        }

        this.log( newMessage );

        const nowTime = new Date(Date.now());

        var oldText =this.homey.settings.get( 'diagLog' );
        if (oldText.length > 30000)
        {
            // Remove the first 1000 characters.
            oldText = oldText.substring(1000);
            var n = oldText.indexOf("\n");
            if (n >= 0)
            {
                // Remove up to and including the first \n so the log starts on a whole line
                oldText = oldText.substring(n + 1);
            }
        }

        oldText += "* ";
        oldText += nowTime.toJSON();
        oldText += "\r\n";
        oldText += newMessage;
        oldText += "\r\n";
       this.homey.settings.set( 'diagLog', oldText );
    }

    async getSomething( query )
    {
        this.updateLog( "GET: " + JSON.stringify( query, null, 2 ) );

        if ( query && query.cmd )
        {
            if ( query.cmd == "listEvents" )
            {
                const eventsList = await this.lwBridge.getLWWebhooks();
                return JSON.stringify( eventsList, null, 2 );
            }
            else if ( query.cmd == "listHistory" )
            {
                var start = "";
                if ( query.start )
                {
                    start = query.start;
                }
                const historyList = await this.lwBridge.getLWHistory( start );
                return JSON.stringify( historyList, null, 2 );
            }
            else if ( query.cmd == "listValues" )
            {
                const valueList = await this.lwBridge.getLWValues();
                return valueList;
            }
        }
        return "OK";
    }

    async addSomething( body )
    {
        //this.updateLog( "POST: " + JSON.stringify( args, null, 2 ), true );
        this._onWebhookMessage( body );
        return "OK";
    }
}

module.exports = LightwaveSmartApp;