'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( './LightwaveSmartBridge' );
const nodemailer = require( 'nodemailer' );

const POLL_INTERVAL = 30000;
class LightwaveSmartApp extends Homey.App
{

    async onInit()
    {
        this.updateLog( '************** LightwaveRF Smart app is initialising. ***************' );
        this.bridgeReady = false;
        this.gettingAccessToken = false;
        this.tokenNumber = 0;
        this.deviceCount = 0;

        this.oldBearerID = this.homey.settings.get( 'bearerid' );
        this.homey.app.bearerid = this.oldBearerID;
        this.oldRefreshToken = this.homey.settings.get( 'refreshtoken' );
        this.homey.app.refreshtoken = this.oldRefreshToken;

        this.usePolling = this.homey.settings.get( 'usePolling' );
        this.oldPollingInterval = this.homey.settings.get( 'pollInterval' );
        this.timerProcessing = false;

        // Make sure polling interval is set to something
        if ( !this.oldPollingInterval || ( this.oldPollingInterval < 1000 ) || ( this.oldPollingInterval > 60000 ) )
        {
            this.homey.settings.set( 'pollInterval', POLL_INTERVAL );
            this.oldPollingInterval = this.homey.settings.get( 'pollInterval' );
        }

        this.homey.settings.set( 'diagLog', 'Starting LW app\r\n' );

        try
        {
            this.homeyId = await this.homey.cloud.getHomeyId();
        }
        catch ( err )
        {
            this.updateLog( 'Failed to get Homey ID: ' + this.varToString( err ) );
            this.homeyId = Math.random * 100000;
        }
        const webhookUrl = `https://webhooks.athom.com/webhook/${Homey.env.WEBHOOK_ID}?homey=${this.homeyId}`;

        const id = Homey.env.WEBHOOK_ID;
        const secret = Homey.env.WEBHOOK_SECRET;
        try
        {
            const myWebhook = await this.homey.cloud.createWebhook( id, secret, {} );

            myWebhook.on( 'message', args =>
            {
                this.log( 'Got a webhook message!' );
                this.log( 'headers:', args.headers );
                this.log( 'query:', args.query );
                this.log( 'body:', args.body );
                this.addSomething( args.body );
            } );
        }
        catch ( err )
        {
            this.updateLog( 'Failed to create webhook: ' + this.varToString( err ) );
            this.usePolling = true;
        }

        this.lwBridge = new LightwaveSmartBridge( this.homey, webhookUrl );

        this.homey.settings.on( 'set', async ( setting ) =>
        {
            if ( ( setting === 'bearerid' ) || ( setting === 'refreshtoken' ) || ( setting === 'usePolling' ) || ( setting === 'pollInterval' ) )
            {
                if ( this.settingDelayTimer )
                {
                    this.homey.clearTimeout( this.settingDelayTimer );
                }
                this.settingDelayTimer = this.homey.setTimeout( () =>
                {
                    this.doInit();
                }, 1000 );
            }
        } );

        this.updateLog( '--------- App Start InitBridge -------- ' );

        await this.InitBridge( false );

        this.onPoll = this.onPoll.bind( this );
        this.timerID = this.homey.setTimeout( this.onPoll, this.homey.settings.get( 'pollInterval' ) );

        this.updateLog( '************** LightwaveRF Smart app has initialised. ***************' );
    }

    doInit()
    {
        if ( this.homey.settings.get( 'bearerid' ) === '' )
        {
            this.homey.app.updateLog( 'No Bearer ID specified', false );
            return;
        }
        if ( this.homey.settings.get( 'refreshtoken' ) === '' )
        {
            this.homey.app.updateLog( 'No Refresh Token specified', false );
            return;
        }

        if ( ( this.homey.settings.get( 'bearerid' ) !== this.homey.app.oldBearerID ) ||
            ( this.homey.settings.get( 'refreshtoken' ) !== this.homey.app.refreshtoken ) ||
            ( this.homey.settings.get( 'usePolling' ) !== this.homey.app.usePolling ) )
        {
            this.homey.app.bearerid = this.homey.settings.get( 'bearerid' );
            this.homey.app.refreshtoken = this.homey.settings.get( 'refreshtoken' );

            // A new bearer id has been set or usePolling has been changed so re-initialise the bridge
            this.homey.clearTimeout( this.homey.app.timerID );
            this.homey.app.updateLog( '--------- Setting Changed InitBridge -------- ' );
            this.homey.app.oldBearerID = this.homey.settings.get( 'bearerid' );
            this.homey.app.usePolling = this.homey.settings.get( 'usePolling' );
            this.homey.app.oldPollingInterval = this.homey.settings.get( 'pollInterval' );
            this.homey.app.InitBridge( true );
            if ( this.homey.app.usePolling )
            {
                this.homey.app.timerID = this.homey.setTimeout( this.homey.app.onPoll, this.homey.app.oldPollingInterval );
            }
        }
        else if ( this.homey.settings.get( 'pollInterval' ) !== this.homey.app.oldPollingInterval )
        {
            this.homey.clearTimeout( this.homey.app.timerID );
            this.homey.app.oldPollingInterval = this.homey.settings.get( 'pollInterval' );
            if ( !this.homey.app.timerProcessing )
            {
                this.homey.app.timerID = this.homey.setTimeout( this.homey.app.onPoll, this.homey.app.oldPollingInterval );
            }
        }

    }
    getBridge()
    {
        return this.lwBridge;
    }

    async InitBridge( SettingChanged )
    {
        if ( this.initialisingBridge )
        {
            this.updateLog( 'Bridge already being initialised ' );
            return false;
        }

        try
        {
            this.initialisingBridge = true;

            const bridgeReady = await this.lwBridge.initialise();

            if ( !this.homey.settings.get( 'unsupportedDevices' ) )
            {
                this.homey.settings.set( 'unsupportedDevices', 'Pairing not run yet' );
            }

            if ( bridgeReady )
            {
                this.bridgeReady = true;

                if ( SettingChanged )
                {
                    this.updateLog( 'Initialising Devices' );

                    const drivers = this.homey.drivers.getDrivers();
                    // eslint-disable-next-line no-restricted-syntax
                    for ( const driver in drivers )
                    {
                        if ( Object.prototype.hasOwnProperty.call( drivers, driver ) )
                        {
                            this.homey.drivers.getDriver( driver ).getDevices().forEach( device =>
                            {
                                try
                                {
                                    device.initDevice();
                                }
                                catch ( err )
                                {

                                }
                            } );
                        }
                    }
                }

                this.updateLog( 'Bridge ready' );
            }
            else
            {
                this.updateLog( '!! Bridge not ready !!' );
            }
        }
        catch ( err )
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
                this.updateLog( '!!! Webhook missing body or triggerEvent or Payload !!!' );
                return;
            }

            // Get the ID of the device
            const hookData = body.id;
            let driverId = '';
            let deviceId = '';
            let capability = '';
            const dimmerParts = hookData.split( '_' );
            if ( Array.isArray( dimmerParts ) )
            {
                driverId = dimmerParts[ 0 ];
                deviceId = dimmerParts[ 1 ];
                capability = dimmerParts[ 2 ];
            }

            this.updateLog( `Webhook Update: ${capability} = ${body.payload.value}`, true );

            const driver = this.homey.drivers.getDriver( driverId );
            if ( driver )
            {
                const devices = driver.getDevices();
                for ( let i = 0; i < devices.length; i++ )
                {
                    try
                    {
                        const device = devices[ i ];
                        if ( device.getData().id === deviceId )
                        {
                            this.updateLog( `Webhook found Device (${device.getName()}): ${capability} = ${body.payload.value}`, true );

                            device.setWebHookValue( capability, body.payload.value );
                            return;
                        }
                    }
                    catch ( err )
                    {
                        this.log( err );
                    }
                }
            }
            this.updateLog( `!!! Webhook not matched: ${driverId}, capability: ${capability}, Value: ${body.payload.value}`, false );
        }
        catch ( err )
        {
            this.updateLog( `Webhook Error: ${err}` );
        }
    }

    async onPoll()
    {
        this.timerProcessing = true;
        const promises = [];
        try
        {
            if ( this.homey.app.usePolling )
            {
                this.updateLog( '\r\n*** Polling Start ***', true );

                // Fetch all the values in one go
                const valueList = await this.lwBridge.getLWValues();

                // Fetch the list of drivers for this app
                const drivers = this.homey.drivers.getDrivers();
                // eslint-disable-next-line no-restricted-syntax
                for ( const driver in drivers )
                {
                    if ( Object.prototype.hasOwnProperty.call( drivers, driver ) )
                    {
                        const devices = this.homey.drivers.getDriver( driver ).getDevices();
                        for ( let i = 0; i < devices.length; i++ )
                        {
                            try
                            {
                                const device = devices[ i ];
                                if ( device.getDeviceValues )
                                {
                                    promises.push( device.getDeviceValues( valueList ) );
                                }

                                if ( device.getEnergyValues )
                                {
                                    promises.push( device.getEnergyValues( valueList ) );
                                }
                            }
                            catch ( err )
                            {
                                this.log( err );
                            }
                        }
                    }
                }

                await Promise.all( promises );
                this.updateLog( '*** Polling End ***\r\n', true );
            }
        }
        catch ( err )
        {
            this.updateLog( `Polling Error: ${err}` );
        }

        if ( this.homey.app.usePolling )
        {
            let nextInterval = Number( this.homey.settings.get( 'pollInterval' ) );
            if ( nextInterval < 5000 )
            {
                nextInterval = 5000;
            }
            this.updateLog( `Next Interval = ${nextInterval}`, true );
            this.timerID = this.homey.setTimeout( this.onPoll, nextInterval );
        }
        this.timerProcessing = false;
    }

    updateLog( newMessage, webHookMessage = false )
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

        const nowTime = new Date( Date.now() );

        let oldText = this.homey.settings.get( 'diagLog' );
        if ( oldText.length > 30000 )
        {
            // Remove the first 1000 characters.
            oldText = oldText.substring( 1000 );
            const n = oldText.indexOf( '\n' );
            if ( n >= 0 )
            {
                // Remove up to and including the first \n so the log starts on a whole line
                oldText = oldText.substring( n + 1 );
            }
        }

        oldText += '* ';
        oldText += nowTime.toJSON();
        oldText += '\r\n';
        oldText += newMessage;
        oldText += '\r\n';
        this.homey.settings.set( 'diagLog', oldText );
    }

    async getSomething( query )
    {
        this.updateLog( `GET: ${JSON.stringify(query, null, 2)}` );

        if ( query && query.cmd )
        {
            if ( query.cmd === 'listEvents' )
            {
                const eventsList = await this.lwBridge.getLWWebhooks();
                return JSON.stringify( eventsList, null, 2 );
            }
            if ( query.cmd === 'listHistory' )
            {
                let start = '';
                if ( query.start )
                {
                    start = query.start;
                }
                const historyList = await this.lwBridge.getLWHistory( start );
                return JSON.stringify( historyList, null, 2 );
            }
            if ( query.cmd === 'listValues' )
            {
                const valueList = await this.lwBridge.getLWValues();
                return valueList;
            }
        }
        return 'OK';
    }

    async addSomething( body )
    {
        // this.updateLog( "POST: " + JSON.stringify( args, null, 2 ), true );
        this._onWebhookMessage( body );
        return 'OK';
    }

    getDeviceIntiDelay()
    {
        this.deviceCount++;
        return this.deviceCount;
    }


    // Send the log to the developer (not applicable to Homey cloud)
    async sendLog( body )
    {
        let tries = 5;

        let logData;
        if ( body.logType === 'diag' )
        {
            logData = this.homey.settings.get( 'diagLog' );
        }
        else
        {
            logData = this.homey.settings.get( 'unsupportedDevices' );
            if ( !logData )
            {
                throw ( new Error( 'No data to send' ) );
            }

            logData = this.varToString( logData );
        }

        while ( tries-- > 0 )
        {
            try
            {
                // create reusable transporter object using the default SMTP transport
                const transporter = nodemailer.createTransport(
                {
                    host: Homey.env.MAIL_HOST, // Homey.env.MAIL_HOST,
                    port: 465,
                    ignoreTLS: false,
                    secure: true, // true for 465, false for other ports
                    auth:
                    {
                        user: Homey.env.MAIL_USER, // generated ethereal user
                        pass: Homey.env.MAIL_SECRET, // generated ethereal password
                    },
                    tls:
                    {
                        // do not fail on invalid certs
                        rejectUnauthorized: false,
                    },
                }, );

                // send mail with defined transport object
                const info = await transporter.sendMail(
                {
                    from: `"Homey User" <${Homey.env.MAIL_USER}>`, // sender address
                    to: Homey.env.MAIL_RECIPIENT, // list of receivers
                    subject: `LightWave ${body.logType} log (${Homey.manifest.version})`, // Subject line
                    text: logData, // plain text body
                }, );

                this.updateLog( `Message sent: ${info.messageId}` );
                // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

                // Preview only available when sending through an Ethereal account
                this.log( 'Preview URL: ', nodemailer.getTestMessageUrl( info ) );
                return this.homey.__( 'settings.logSent' );
            }
            catch ( err )
            {
                this.updateLog( `Send log error: ${err.message}`, 0 );
            }
        }

        return ( this.homey.__( 'settings.logSendFailed' ) );
    }

    varToString( source )
    {
        try
        {
            if ( source === null )
            {
                return 'null';
            }
            if ( source === undefined )
            {
                return 'undefined';
            }
            if ( source instanceof Error )
            {
                const stack = source.stack.replace( '/\\n/g', '\n' );
                return `${source.message}\n${stack}`;
            }
            if ( typeof( source ) === 'object' )
            {
                const getCircularReplacer = () =>
                {
                    const seen = new WeakSet();
                    return ( key, value ) =>
                    {
                        if ( typeof value === 'object' && value !== null )
                        {
                            if ( seen.has( value ) )
                            {
                                return '';
                            }
                            seen.add( value );
                        }
                        return value;
                    };
                };

                return JSON.stringify( source, getCircularReplacer(), 2 );
            }
            if ( typeof( source ) === 'string' )
            {
                return source;
            }
        }
        catch ( err )
        {
            this.homey.app.updateLog( `VarToString Error: ${err}`, 0 );
        }

        return source.toString();
    }
}

module.exports = LightwaveSmartApp;