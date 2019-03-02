'use strict';

const Homey = require( 'homey' );
const { EventEmitter } = require( 'events' );
const fetch = require( 'node-fetch' );

// Table of device product codes to map to our driver type
const TypeLookUp = [
    { id: "L21", type: "dimmer", multiGang: false },
    { id: "L22", type: "dimmer", multiGang: true },
    { id: "L41", type: "socket", multiGang: false },
    { id: "L42", type: "socket", multiGang: true },
    { id: "LW380", type: "relay", multiGang: false },
];

module.exports = class LightwaveSmartBridge extends EventEmitter
{
    constructor()
    {
        super();
        return this;
    }

    async getAccessToken()
    {
        var access_token = Homey.ManagerSettings.get( 'accesstoken' );
        if ( !access_token )
        {
            access_token = await this.getNewTokens();
        }

        // Still no access token so throw an error
        if ( access_token == '' )
        {
            throw new Error( 'Failed to connect to Lightwave to retrieve a new access token' );
        }

        return access_token;
    }

    async getNewTokens()
    {
        if ( access_token == "requesting" )
        {
            var maxWait = 10;
            while ( ( access_token == "requesting" ) && ( maxWait-- > 0 ) )
            {
                // A new token has already been requested so wait for that to complete
                console.log( 'Wait for new access token' );
                await new Promise( resolve => setTimeout( resolve, 1000 ) );
                access_token = Homey.ManagerSettings.get( 'accesstoken' );
            }

            if ( access_token == "requesting" )
            {
                throw new Error( "Waiting too long for a new access token" );
            }

            return access_token;
        }

        // signal that a new token is being requested so another process doesn't try at the same time
        Homey.ManagerSettings.set( 'accesstoken', "requesting" );
        console.log( 'Requesting a new access token' );

        // Get the access token if a bearer token and refresh token are available
        const bearerid = Homey.ManagerSettings.get( 'bearerid' );
        const refreshtoken = Homey.ManagerSettings.get( 'refreshtoken' );

        if ( !bearerid )
        {
            // Make sure the "requesting" is cleared so another attempt is made later
            Homey.ManagerSettings.set( 'accesstoken', "" );

            throw new Error( 'Missing Bearer ID. Make sure you have entered this in the app Settings page.' )
        }

        if ( !refreshtoken )
        {
            // Make sure the "requesting" is cleared so another attempt is made later
            Homey.ManagerSettings.set( 'accesstoken', "" );

            throw new Error( 'Missing Refresh Token. Make sure you have entered this in the app Settings page.' )
        }

        const body = '{"grant_type":"refresh_token","refresh_token":"' + refreshtoken + '"}';
        console.log( 'Bearer = ', bearerid );
        console.log( 'Refresh Token = ', refreshtoken );
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

            access_token = connectResult[ 'access_token' ];
            Homey.ManagerSettings.set( 'refreshtoken', connectResult[ 'refresh_token' ] );
            Homey.ManagerSettings.set( 'accesstoken', access_token );

            console.log( 'New Refresh Token = ', connectResult[ 'refresh_token' ] );
            //console.log( 'New Access Token = ', access_token );
        }
        catch ( err )
        {
            // Make sure the "requesting" is cleared so another attempt is made later
            Homey.ManagerSettings.set( 'accesstoken', "" );
            throw new Error( "Failed to get a new access token " + err + ": " + access_token );
        }

        return access_token;
    }

    async getLocations()
    {
        var result = "";
        try
        {
            result = await this.sendMessage( 'get', '/v1/structures', "" );
            if ( result != -1 )
            {
                return result;
            }
        }
        catch ( err )
        {
            throw new Error( 'Failed to get Locations from Lightwave ' + err + ": " + result );
        }
        return null;
    }

    async getDevices( locationID )
    {
        var result = "";
        try
        {
            // console.log('getDevices from location: ', locationID);

            result = await this.sendMessage( 'get', '/v1/structure/' + locationID, "" );
            if ( result != -1 )
            {
                return result;
            }
        }
        catch ( err )
        {
            throw new Error( 'Failed to get Devices from Lightwave' );
        }

        return null;
    }

    async getDevicesOfType( deviceType )
    {
        const devices = [];
        const unsupportedDevices = [];

        try
        {
            const lwstructures = await this.getLocations();

            if ( !lwstructures )
            {
                throw new Error( 'Failed to get locations' );
            }

            // Loop through each structure
            for ( const location of lwstructures[ 'structures' ] )
            {
                // Get the list of devices
                const lwdevices = await this.getDevices( location )
                //console.log( 'devices: ', lwdevices );

                if ( !lwdevices )
                {
                    throw new Error( 'Failed to get devices' );
                }

                // loop through each device and check if it is the required type
                for ( const lwdevice of lwdevices[ 'devices' ] )
                {
                    //console.log( 'ForeEachDevice: ', lwdevice );

                    // Look up the product code to get our type
                    const productCode = lwdevice[ 'product' ];
                    //console.log( "TypeLookUp = ", TypeLookUp, "Product Code = ", productCode );
                    const productInfo = TypeLookUp.find( x => x.id === productCode );

                    console.log( "ProductInfo = ", productInfo );

                    if ( !productInfo )
                    {
                        // Not a supported device so record for our log
                        for ( const lwfeatureset of lwdevice[ 'featureSets' ] )
                        {
                            var device = {};
                            device = {
                                "productCode": productCode,
                                "device": lwdevice[ 'device' ],
                                "desc": lwdevice[ 'desc' ],
                                "type": lwdevice[ 'type' ],
                                "cat": lwdevice[ 'cat' ],
                                "gen": lwdevice[ 'gen' ],
                            };

                            // Get each feature
                            for ( const lwfeature of lwfeatureset[ 'features' ] )
                            {
                                device[ lwfeature[ 'type' ] ] = "Yes";
                            }
                            unsupportedDevices.push(
                            {
                                device
                            } )
                        }

                        continue;
                    }

                    if ( productInfo[ 'type' ] == deviceType)
                    {
                        // loop through each feature set (one for each gang of a dimmer)
                        var index = 1;
                        for ( const lwfeatureset of lwdevice[ 'featureSets' ] )
                        {
                            //console.log( 'ForeEachFeatureSet: ', lwfeatureset );
                            var iconName = productCode;
                            if ( productInfo[ 'multiGang' ] )
                            {
                                // This device has more than one gang so append sub item number to select correct icon
                                iconName += "_" + index;
                                index++;
                            }

                            iconName += ".svg";
                            console.log( 'icon: ', iconName );

                            var data = {};
                            data = {
                                "id": lwfeatureset[ 'featureSetId' ],
                                "productCode": productCode,
                            };

                            // Get the feature id for each feature
                            for ( const lwfeature of lwfeatureset[ 'features' ] )
                            {
                                data[ lwfeature[ 'type' ] ] = lwfeature[ 'featureId' ];
                            }
                            //console.log( data );
                            devices.push(
                            {
                                "name": lwfeatureset[ 'name' ],
                                "icon": iconName, // relative to: /drivers/<driver_id>/assets/
                                data
                            } )
                        }
                    }
                }
            }
        }
        catch ( err )
        {
            console.log( 'Connection Failed', err );
        }

        console.log( 'Unsupported Devices: ', unsupportedDevices );
        Homey.ManagerSettings.set( 'unsupportedDevices', JSON.stringify( unsupportedDevices, null, 2 ) )
        return devices;
    }

    async setFeatureValue( featureId, state )
    {
        var result = "";
        try
        {
            const body = '{"value":"' + state + '"}';
            // console.log('setFeature: ', featureId, " ", body);

            result = await this.sendMessage( 'post', '/v1/feature/' + featureId, body );
            return result;
        }
        catch ( err )
        {
            throw new Error( 'Failed to set feature ' + err + ": " + result );
        }
    }

    async getFeatureValue( featureId )
    {
        var result = "";
        try
        {
            // console.log('getFeature: ', featureId);

            result = await this.sendMessage( 'get', '/v1/feature/' + featureId, "" );
            if ( result != -1 )
            {
                return result[ 'value' ];
            }
        }
        catch ( err )
        {
            throw new Error( 'Failed to get feature ' + err + ": " + result );
        }

        return -1;
    }

    async registerWEBHooks( featureID, feature, deviceID )
    {
        try
        {
            console.log( 'registerWEBHooks: ', featureID, feature, deviceID );

            // Get the list of events (webhooks)
            const eventsList = await this.sendMessage( 'get', '/v1/events', "" );
            console.log( 'Current Events: ', eventsList );



            const body = '{"events":[{"type":"' + feature + '","id":"' + featureID + '"}],"url":"https://webhooks.athom.com/webhook/5c748773a3fca649fa937d6a","ref":"' + deviceID + '"}';
            console.log( 'WebHook Body = ', body );

            const result = await this.sendMessage( 'post', '/v1/events', body );
            if ( result != -1 )
            {
                return result[ 'id' ];
            }
        }
        catch ( err )
        {
            console.log( 'Register WebHook ', err );
            return "";
        }
    }

    async sendMessage( method, path, body )
    {
        //console.log('sendMessage ', method, path, body);

        var errMsg = "";
        var access_token = await this.getAccessToken();

        // Try twice as the cached token may have expired
        for ( var i = 0; i < 2; i++ )
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

                // console.log('sendMessage Result: ', connectResult);
                if ( connectResult )
                {
                    return connectResult;
                }
            }
            catch ( err )
            {
                console.log( 'Connection Failed', err );
                errMsg = err.message.toLowerCase();
            }

            if ( errMsg.indexOf( 'unauthorized' ) < 0 )
            {
                // Not an unauthorized error so return now
                return -1;
            }

            // Get a new token
            access_token = this.getNewTokens();
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
        }

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
}