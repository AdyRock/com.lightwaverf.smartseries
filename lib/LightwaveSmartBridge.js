'use strict';

const Homey = require( 'homey' );
const { EventEmitter } = require( 'events' );
const fetch = require( 'node-fetch' );

// Table of device product codes to map to our driver type
const TypeLookUp = [
    { id: "L21", type: "dimmer", multiGang: false },
    { id: "L22", type: "dimmer", multiGang: true },
    { id: "L23", type: "dimmer", multiGang: true },
    { id: "L24", type: "dimmer", multiGang: true },
    { id: "L41", type: "socket", multiGang: false },
    { id: "L42", type: "socket", multiGang: true },
    { id: "L82", type: "relay", multiGang: false },
    { id: "LW260", type: "socket", multiGang: false },
    { id: "LW380", type: "relay", multiGang: false },
    { id: "LW400", type: "dimmer", multiGang: false },
    { id: "LW560", type: "dimmer", multiGang: false },
    { id: "LW821", type: "relay", multiGang: false },
    { id: "LW831", type: "dimmer", multiGang: false },
    { id: "LW921", type: "thermostat", multiGang: false },
    { id: "LW922", type: "thermostat", multiGang: false },
    { id: "LW929", type: "remote", multiGang: false },
    { id: "LW931", type: "contact", multiGang: false },
    { id: "LW934", type: "thermostat", multiGang: false },
    { id: "LW600", type: "energy", multiGang: false },
];

const CapabilityMap = [
    { id: "switch", type: "onoff" },
    { id: "dimLevel", type: "dim" },
    { id: "temperature", type: "measure_temperature" },
    { id: "targetTemperature", type: "target_temperature" },
    { id: "valveLevel", type: "alarm_contact" },
    { id: "heatState", type: "onoff" },
    { id: "batteryLevel", type: "measure_battery" },
    { id: "power", type: "measure_power" },
    { id: "energy", type: "meter_power" },
    { id: "windowPosition", type: "alarm_contact" },
    { id: "buttonPress", type: "alarm_generic" },
    { id: "threeWayRelay", type: "windowcoverings_state" },
];

module.exports = class LightwaveSmartBridge extends EventEmitter
{
    constructor()
    {
        super();
        return this;
    }

    async initialise()
    {
        try
        {
            Homey.app.updateLog( "Bridge Initialising", false );

            const access_token = await this.initAccessToken();
            if ( access_token != "" )
            {
                await this.deleteLWWebhooks();

                Homey.app.updateLog( "Bridge Initialised", false );

                return true;
            }
        }
        catch ( err )
        {
            Homey.app.updateLog( "!!!! Bridge Initialisation Failed: " + err );
        }

        return false;
    }

    async asyncDelay(period)
    {
        await new Promise(resolve => setTimeout(resolve, period));
    }

    async waitForBridgeReady()
    {
        if ( Homey.ManagerSettings.get( 'bearerid' ) == "" )
        {
            return false;
        }
        if ( Homey.ManagerSettings.get( 'refreshtoken' ) == "" )
        {
            return false;
        }

        if ( !Homey.app.bridgeReady )
        {
            var connectionNumber = Homey.app.tokenNumber++;
            Homey.app.updateLog( "Waiting for Bridge #" + connectionNumber );

            var maxWait = 60;
            while ( !Homey.app.bridgeReady && ( maxWait-- > 0 ) )
            {
                await this.asyncDelay( 1000 );
            }

            if ( !Homey.app.bridgeReady )
            {
                Homey.app.updateLog( "Bridge Timeout #" + connectionNumber );
                return false;
            }
            else
            {
                Homey.app.updateLog( "Bridge Ready #" + connectionNumber );
            }
        }

        return Homey.app.bridgeReady;
    }

    async getAccessToken( ignoreReady )
    {
        try
        {
            if ( !ignoreReady )
            {
                if ( !this.waitForBridgeReady() )
                {
                    return "";
                }
            }
            return await this.initAccessToken();
        }
        catch ( err )
        {
            Homey.app.updateLog( "LW Bridge getAccessToken Error " + err );
        }

    }

    async initAccessToken()
    {
        if ( !Homey.ManagerSettings.get( 'bearerid' ) )
        {
            Homey.app.updateLog( "No bearer ID specified" );
            return "";
        }

        if ( !Homey.ManagerSettings.get( 'refreshtoken' ) )
        {
            Homey.app.updateLog( "No refresh token specified" );

            return "";
        }

        var access_token = Homey.ManagerSettings.get( 'accesstoken' );
        if ( !access_token )
        {
            access_token = await this.getNewTokens();
        }

        return access_token;
    }

    async getNewTokens()
    {
        if ( Homey.app.gettingAccessToken )
        {
            // A new token has already been requested so wait for that to complete
            Homey.app.updateLog( "Waiting for a new access token" );
            var maxWait = 30;
            while ( ( Homey.app.gettingAccessToken ) && ( maxWait-- > 0 ) )
            {
                await this.asyncDelay( 1000 );
            }

            if ( Homey.app.gettingAccessToken )
            {
                Homey.app.updateLog( "Timeout while requesting a new access token" );
                return "";
            }

            return Homey.ManagerSettings.get( 'accesstoken' );
        }

        // signal that a new token is being requested so another process doesn't try at the same time
        Homey.app.gettingAccessToken = true;
        Homey.ManagerSettings.set( 'accesstoken', "" );

        Homey.app.updateLog( "Requesting a new access token" );

        // Get the access token if a bearer token and refresh token are available
        const bearerid = Homey.ManagerSettings.get( 'bearerid' );
        const refreshtoken = Homey.ManagerSettings.get( 'refreshtoken' );

        if ( !bearerid )
        {
            // Make sure the "requesting" is cleared so another attempt is made later
            Homey.app.gettingAccessToken = false;
            return "";
        }

        if ( !refreshtoken )
        {
            // Make sure the "requesting" is cleared so another attempt is made later
            Homey.app.gettingAccessToken = false;
            return "";
        }

        const body = '{"grant_type":"refresh_token","refresh_token":"' + refreshtoken + '"}';
        var access_token;

        try
        {
            const connectResult = await this._call(
            {
                authText: 'basic ' + bearerid,
                method: 'post',
                address: 'auth.lightwaverf.com',
                path: '/token',
                body: body,
            } );

            access_token = connectResult.access_token;
            Homey.ManagerSettings.set( 'refreshtoken', connectResult.refresh_token );
            Homey.ManagerSettings.set( 'accesstoken', access_token );
            Homey.app.updateLog( "New Access Token Obtained" );

        }
        catch ( err )
        {
            Homey.ManagerSettings.set( 'accesstoken', "" );

            const errText = err.message;

            if ( errText.indexOf( "Unknown refresh token" ) > 0 )
            {
                Homey.ManagerSettings.set( 'refreshtoken', "" );
            }

            Homey.app.updateLog( "Failed to get Access Token: " + errText );
            throw new Error( "Failed to get a new access token: " + errText );
        }
        finally
        {
            Homey.app.gettingAccessToken = false;
        }

        return access_token;
    }

    async getLocations()
    {
        var result = "";
        try
        {
            result = await this.sendMessage( 'get', '/v1/structures', "", false );
            if ( result != -1 )
            {
                return result;
            }
        }
        catch ( err )
        {
            Homey.app.updateLog( "Failed to get Locations from Lightwave " + err + ": " + result );
        }
        return "";
    }

    async getDevices( locationID )
    {
        var result = "";
        try
        {
            result = await this.sendMessage( 'get', '/v1/structure/' + locationID, "", false );
            if ( result != -1 )
            {
                console.log( result );
                return result;
            }
        }
        catch ( err )
        {
            Homey.app.updateLog( "Failed to get Devices from Lightwave" );

        }

        return "";
    }

    lookup( productCode )
    {
        return TypeLookUp.find( x => x.id === productCode );
    }

    async getDevicesOfType( deviceType )
    {
        Homey.app.updateLog( "Searching for devices of type: " + deviceType );
        const devices = [];
        const unsupportedDevices = [];

        try
        {
            const lwstructures = await this.getLocations();

            if ( !lwstructures )
            {
                Homey.app.updateLog( "Failed to get locations" );

                return devices;
            }

            // Loop through each structure
            for ( const location of lwstructures.structures )
            {
                Homey.app.updateLog( "Found Location: " + location );

                // Get the list of devices
                const lwdevices = await this.getDevices( location );

                if ( !lwdevices )
                {
                    Homey.app.updateLog( "Failed to get devices" );

                    return devices;
                }

                // loop through each device and check if it is the required type
                for ( const lwdevice of lwdevices.devices )
                {
                    // Look up the product code to get our type
                    var productCode = lwdevice.productCode;
                    Homey.app.updateLog( "Found device: " + lwdevice.name + " (" + productCode + ")" );

                    if ( typeof productCode === 'string' )
                    {
                        // Remove the new EU part from the device name
                        productCode = productCode.replace( "EU", "" );
                        productCode = productCode.replace( "MK2", "" );
                    }
                    // Look up the product code in our supported devices table
                    const productInfo = this.lookup( productCode );

                    if ( !productInfo )
                    {
                        // Not a supported device so record for our log
                        for ( const lwfeatureset of lwdevice.featureSets)
                        {
                            var device = {};
                            device = {
                                "productCode": productCode,
                                "name": lwdevice.name,
                                "device": lwdevice.device,
                                "desc": lwdevice.desc,
                                "type": lwdevice.type,
                                "cat": lwdevice.cat,
                                "gen": lwdevice.gen
                            };

                            // Get each feature
                            for ( const lwfeature of lwfeatureset.features )
                            {
                                device[ lwfeature.type ] = "Yes";
                            }
                            unsupportedDevices.push(
                            {
                                device
                            } );
                        }

                        continue;
                    }

                    // Check if the type specified in our supported devices table matches the type we are looking for
                    if ( productInfo.type == deviceType )
                    {
                        Homey.app.updateLog( "Correct Device Type." );

                        // loop through each feature set (one for each gang of a dimmer)
                        var index = 1;
                        for ( const lwfeatureset of lwdevice.featureSets )
                        {
                            Homey.app.updateLog( "Logging Feature Set: " + lwfeatureset.featureSetId );

                            var iconName = productCode;
                            if ( productInfo.multiGang )
                            {
                                // This device has more than one gang so append sub item number to select correct icon
                                iconName += "_" + index;
                                index++;
                            }

                            iconName += ".svg";
                            console.log( 'icon: ', iconName );

                            var data = {};
                            data = {
                                "id": lwfeatureset.featureSetId,
                                "productCode": productCode
                            };

                            // Get the feature id for each feature
                            var capabilities = [];
                            for ( const lwfeature of lwfeatureset.features )
                            {
                                data[ lwfeature.type ] = lwfeature.featureId;
                                const capability = CapabilityMap.find( x => x.id === lwfeature.type );
                                if ( capability )
                                {
                                    capabilities.push( capability.type );
                                }
                            }
                            devices.push(
                            {
                                "name": lwfeatureset.name,
                                "icon": iconName, // relative to: /drivers/<driver_id>/assets/
                                "capabilities": capabilities,
                                data
                            } );
                            console.log( devices );
                        }
                    }
                    else
                    {
                        Homey.app.updateLog( "Not what we are looking for" );
                    }
                }
            }
        }
        catch ( err )
        {
            Homey.app.updateLog( "Connection Failed: " + err );

        }

        console.log( 'Unsupported Devices: ', unsupportedDevices );
        Homey.ManagerSettings.set( 'unsupportedDevices', JSON.stringify( unsupportedDevices, null, 2 ) );
        return devices;
    }

    async setFeatureValue( featureId, state )
    {
        if (typeof featureId != 'string')
        {
            console.log( "setFeatureValue", featureId, typeof featureId );
            return "";
        }

        var result = "";
        const body = '{"value":"' + state + '"}';
        console.log( 'setFeature: ', featureId, " ", body );

        result = await this.sendMessage( 'post', '/v1/feature/' + featureId, body, false );
        return result;
    }

    async getFeatureValue( featureId, ValueList )
    {
        if (typeof featureId != 'string')
        {
            console.log( "getFeatureValue", featureId, typeof featureId );
            return "";
        }

        var result = "";

        if ( ValueList )
        {
            return ValueList[ featureId ];
        }
        else
        {
            result = await this.sendMessage( 'get', '/v1/feature/' + featureId, "", false );
            if ( result != -1 )
            {
                return result.value;
            }
        }

        return -1;
    }

    async registerWEBHooks( featureID, feature, deviceID )
    {
        if ( Homey.ManagerSettings.get( 'usePolling' ) )
        {
            return "";
        }

        if (typeof featureID != 'string')
        {
            console.log( "registerWEBHooks: feature not available for", feature, deviceID );
            return "";
        }

        // Delay to allow LW system to settle else creating the new webhooks fails
        await new Promise( resolve => setTimeout( resolve, Math.random() * 20000 ) );

        let result = "";
        try
        {
            const url = "https://" + Homey.app.homeyId + ".connect.athom.com/api/app/com.lightwaverf.smartseries";

            const body = '{ "events" : [' +
                '{ "type":"' + feature + '","id":"' + featureID + '" } ],' +
                '"url":"' + url + '",' +
                '"ref":"' + deviceID + '" }';
            const bodyObj = JSON.parse( body );

            Homey.app.updateLog( "Registering LW Webhook: " + deviceID );

            result = await this.sendMessage( 'post', '/v1/events', body, false );
            if ( result != -1 )
            {
                Homey.app.updateLog( "Registered LW Webhook: " + deviceID );
                return result.id;
            }
            Homey.app.updateLog( "LW Webhook failed" );
        }
        catch ( err )
        {
            if ( result )
            {
                Homey.app.updateLog( "Register WebHook Error: " + err + ": " + result );
            }
            else
            {
                Homey.app.updateLog( "Register WebHook Error: " + err );
            }

            return "";
        }
    }

    async getLWHistory( Start )
    {
        const devices = [];
        const history = [];

        const lwstructures = await this.getLocations();

        // Loop through each structure
        for ( const location of lwstructures.structures )
        {
            // Get the list of devices
            const lwdevices = await this.getDevices( location );
            for ( const lwdevice of lwdevices.devices )
            {
                devices.push(
                {
                    "deviceId": lwdevice.deviceId
                } );
            }
        }
        // Get the history data
        const body = '{"devices":' + JSON.stringify( devices, null, 2 ) + '}';
        if ( Start != "" )
        {
            Start = "?start=" + Start;
            console.log( "Start = ", Start );
        }
        const historyList = await this.sendMessage( 'post', '/v1/data' + Start, body, true );

        for ( const lwhistory of historyList )
        {
            if ( Array.isArray( lwhistory.data ) && ( lwhistory.data.length > 0 ) )
            {
                history.push(
                {
                    lwhistory
                } );
            }
        }

        console.log( "LW History: ", JSON.stringify( history, null, 2 ) );
        return history;
    }


    async getLWValues()
    {
        if ( !this.featureList || this.featureList.length == 0 )
        {
            this.featureList = [];

            const lwstructures = await this.getLocations();

            // Loop through each structure
            for ( const location of lwstructures.structures )
            {
                // Get the list of devices
                const lwdevices = await this.getDevices( location );
                for ( const lwdevice of lwdevices.devices )
                {
                    // loop through each feature set (one for each gang of a dimmer)
                    var index = 1;
                    for ( const lwfeatureset of lwdevice.featureSets )
                    {
                        console.log( 'ForeEachFeatureSet: ', lwfeatureset );

                        // Get the feature id for each feature
                        for ( const lwfeature of lwfeatureset.features )
                        {
                            if ( ( lwfeature.type == 'switch' ) ||
                                ( lwfeature.type == 'dimLevel' ) ||
                                ( lwfeature.type == 'buttonPress' ) ||
                                ( lwfeature.type == 'power' ) ||
                                ( lwfeature.type == 'energy' ) ||
                                ( lwfeature.type == 'temperature' ) ||
                                ( lwfeature.type == 'targetTemperature' ) ||
                                ( lwfeature.type == 'rssi' ) ||
                                ( lwfeature.type == 'batteryLevel' ) ||
                                ( lwfeature.type == 'heatState' ) ||
                                ( lwfeature.type == 'valveLevel' ) )
                            {
                                this.featureList.push(
                                {
                                    "featureId": lwfeature.featureId
                                } );
                            }
                        }
                    }
                }
            }
        }

        console.log( "LW Features: ", JSON.stringify( this.featureList, null, 2 ) );

        // batch read the features
        const body = '{"features":' + JSON.stringify( this.featureList, null, 2 ) + '}';
        const valueList = await this.sendMessage( 'post', '/v1/features/read', body, true );

        console.log( "LW History: ", JSON.stringify( valueList, null, 2 ) );
        return valueList;
    }

    async getLWWebhooks()
    {
        // Get the list of events (webhooks)
        const eventsList = await this.sendMessage( 'get', '/v1/events', "", true );

        //        console.log( "LW events: ", JSON.stringify( eventsList, null, 2 ) )

        return eventsList;
    }

    async deleteLWWebhooks()
    {
        try
        {
            Homey.app.updateLog( "Deleting old LW WebHooks" );

            // Get the list of events (webhooks)
            const eventsList = await this.getLWWebhooks();

            for ( const eventItem of eventsList )
            {
                //                const eventData = await this.sendMessage( 'get', '/v1/events/' + eventItem.id, "", true );
                //                console.log( "Old event Info: ",  JSON.stringify( eventData, null, 2 ) )
                const result = await this.sendMessage( 'delete', '/v1/events/' + eventItem.id, "", true );
                //                console.log( "Delete Result: ", result );
            }
        }
        catch ( err )
        {
            Homey.app.updateLog( '!!!!! Error Deleting WebHook ' + err );
            return "";
        }
        Homey.app.updateLog( 'Old LW WEBHooks Deleted' );
    }

    async sendMessage( method, path, body, ignoreReady )
    {
        var errMsg = "";
        var access_token = await this.getAccessToken( ignoreReady );

        if ( access_token == "" )
        {
            access_token = await this.getNewTokens();
        }

        if ( access_token )
        {
            // Try at least twice as the cached token may have expired
            for ( var i = 0; i < 3; i++ )
            {
                try
                {
                    const connectResult = await this._call(
                    {
                        authText: 'bearer ' + access_token,
                        method: method,
                        address: 'publicapi.lightwaverf.com',
                        path: path,
                        body: body,
                    } );

                    //console.log('sendMessage Result: ', connectResult);
                    if ( connectResult )
                    {
                        return connectResult;
                    }
                }
                catch ( err )
                {
                    Homey.app.updateLog( "Connection Failed: " + err );

                    errMsg = err.message.toLowerCase();
                }

                if ( errMsg.indexOf( 'request rate reached limit' ) >= 0 )
                {
                    // Working it too hard so add a delay
                    Homey.app.updateLog( "Request delayed" );
                    await this.asyncDelay( 5000 );
                    continue;
                }

                if ( errMsg.indexOf( 'unauthorized' ) < 0 )
                {
                    // Not an unauthorized error so try again
                    Homey.app.updateLog( "Request retry" );
                    continue;
                }

                // Get a new token
                access_token = await this.getNewTokens();
                if ( access_token == "" )
                {
                    return -1;
                }

                Homey.app.updateLog( "Communication Failed" );
            }
        }
        else
        {
            Homey.app.updateLog( "No access token" );
        }
        return -1;

    }

    async _call(
    {
        authText,
        address,
        method = 'get',
        path = '/',
        body,
    } )
    {
        if ( !authText )
        {
            throw new Error( 'Missing authText' );
        }

        if ( !address )
        {
            throw new Error( 'Missing URL' );
        }

        const url = `https://${address}${path}`;
        const opts = {
            method,
            headers:
            {
                'content-type': 'application/json',
                'authorization': authText,
            },
            timeout: 15000
        };

        if ( body && ( body != "" ) )
        {
            opts.body = body;
        }

        //console.log( "fetching: ", url, opts );
        const res = await fetch( url, opts );

        var bodyText;
        if ( res.status === 200 )
        {
            // Get the reply in JSON format
            bodyText = await res.json();
        }
        else
        {
            // Get the reply as text as it will possibly be an error message
            bodyText = await res.text();
        }

        // Make sure there is something to return and the status was good
        if ( bodyText && ( res.status === 200 ) )
        {
            return bodyText;
        }

        if ( !res.ok )
        {
            // The result was bad so throw an error
            // console.log('status: ', res.status);
            const err = new Error( ( bodyText && bodyText.error && bodyText.error.message ) || ( bodyText ) || 'Unknown Lightwave Smart Error' );
            err.code = res.status;
            throw err;
        }

        return bodyText;
    }
};