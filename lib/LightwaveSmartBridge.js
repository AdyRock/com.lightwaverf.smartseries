'use strict';

const
{
    SimpleClass,
} = require('homey');

// const fetch = require('node-fetch');

const https = require('https');

// Table of device product codes to map to our driver type
const TypeLookUp = [
    { id: 'L21', type: 'dimmer', multiGang: false },
    { id: 'L22', type: 'dimmer', multiGang: true },
    { id: 'L23', type: 'dimmer', multiGang: true },
    { id: 'L24', type: 'dimmer', multiGang: true },
    { id: 'L41', type: 'socket', multiGang: false },
    { id: 'L42', type: 'socket', multiGang: true },
    { id: 'L82', type: 'relay', multiGang: false },
    { id: 'LW260', type: 'socket', multiGang: false },
    { id: 'LW380', type: 'relay', multiGang: false },
    { id: 'LW400', type: 'dimmer', multiGang: false },
    { id: 'LW560', type: 'dimmer', multiGang: false },
    { id: 'LW821', type: 'relay', multiGang: false },
    { id: 'LW831', type: 'dimmer', multiGang: false },
    { id: 'LW921', type: 'thermostat', multiGang: false },
    { id: 'LW922', type: 'thermostat', multiGang: false },
    { id: 'LW929', type: 'remote', multiGang: false },
    { id: 'LW931', type: 'contact', multiGang: false },
    { id: 'LW934', type: 'thermostat', multiGang: false },
    { id: 'LW600', type: 'energy', multiGang: false },
];

const CapabilityMap = [
    { id: 'switch', type: 'onoff' },
    { id: 'dimLevel', type: 'dim' },
    { id: 'temperature', type: 'measure_temperature' },
    { id: 'targetTemperature', type: 'target_temperature' },
    { id: 'valveLevel', type: 'alarm_contact' },
    { id: 'heatState', type: 'onoff' },
    { id: 'batteryLevel', type: 'measure_battery' },
    { id: 'power', type: 'measure_power' },
    { id: 'energy', type: 'meter_power' },
    { id: 'windowPosition', type: 'alarm_contact' },
    { id: 'buttonPress', type: 'alarm_generic' },
    { id: 'threeWayRelay', type: 'windowcoverings_state' },
];

module.exports = class LightwaveSmartBridge extends SimpleClass
{

    constructor(homey, webhookUrl)
    {
        super();
        this.homey = homey;
        this.webhookUrl = webhookUrl;
        return this;
    }

    async initialise()
    {
        try
        {
            this.homey.app.updateLog('Bridge Initialising', false);

            const accessToken = await this.initAccessToken();
            if (accessToken !== '')
            {
                await this.deleteLWWebhooks();

                this.homey.app.updateLog('Bridge Initialised', false);

                return true;
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`!!!! Bridge Initialisation Failed: ${err}`);
        }

        return false;
    }

    async asyncDelay(period)
    {
        await new Promise(resolve => this.homey.setTimeout(resolve, period));
    }

    async waitForBridgeReady()
    {
        if (this.homey.app.bearerid === '')
        {
            return false;
        }
        if (this.homey.app.refreshtoken === '')
        {
            return false;
        }

        if (!this.homey.app.bridgeReady)
        {
            const connectionNumber = this.homey.app.tokenNumber++;
            this.homey.app.updateLog(`Waiting for Bridge #${connectionNumber}`);

            let maxWait = 60;
            while (!this.homey.app.bridgeReady && (maxWait-- > 0))
            {
                await this.asyncDelay(1000);
            }

            if (!this.homey.app.bridgeReady)
            {
                this.homey.app.updateLog(`Bridge Timeout #${connectionNumber}`);
                return false;
            }

            this.homey.app.updateLog(`Bridge Ready #${connectionNumber}`);
        }

        return this.homey.app.bridgeReady;
    }

    async getAccessToken(ignoreReady)
    {
        try
        {
            if (!ignoreReady)
            {
                if (!this.waitForBridgeReady())
                {
                    return '';
                }
            }
            return await this.initAccessToken();
        }
        catch (err)
        {
            this.homey.app.updateLog(`LW Bridge getAccessToken Error ${err}`);
        }

        return '';
    }

    async initAccessToken()
    {
        if (!this.homey.app.bearerid)
        {
            this.homey.app.updateLog('No bearer ID specified');
            return '';
        }

        if (!this.homey.app.refreshtoken)
        {
            this.homey.app.updateLog('No refresh token specified');

            return '';
        }

        let accessToken = this.homey.settings.get('accesstoken');
        if (!accessToken)
        {
            accessToken = await this.getNewTokens();
        }

        return accessToken;
    }

    async getNewTokens()
    {
        if (this.homey.app.gettingAccessToken)
        {
            // A new token has already been requested so wait for that to complete
            this.homey.app.updateLog('Waiting for a new access token');
            let maxWait = 30;
            while ((this.homey.app.gettingAccessToken) && (maxWait-- > 0))
            {
                await this.asyncDelay(1000);
            }

            if (this.homey.app.gettingAccessToken)
            {
                this.homey.app.updateLog('Timeout while requesting a new access token');
                return '';
            }

            return this.homey.settings.get('accesstoken');
        }

        // signal that a new token is being requested so another process doesn't try at the same time
        this.homey.app.gettingAccessToken = true;
        this.homey.settings.set('accesstoken', '');

        this.homey.app.updateLog('Requesting a new access token');

        // Get the access token if a bearer token and refresh token are available
        const { bearerid } = this.homey.app;
        const { refreshtoken } = this.homey.app;

        if (!bearerid)
        {
            // Make sure the "requesting" is cleared so another attempt is made later
            this.homey.app.gettingAccessToken = false;
            return '';
        }

        if (!refreshtoken)
        {
            // Make sure the "requesting" is cleared so another attempt is made later
            this.homey.app.gettingAccessToken = false;
            return '';
        }

        const body = `{"grant_type":"refresh_token","refresh_token":"${refreshtoken}"}`;
        let accessToken;

        try
        {
            const connectResult = await this._call(
            {
                authText: `basic ${bearerid}`,
                method: 'post',
                address: 'auth.lightwaverf.com',
                path: '/token',
                body,
            },
);

            accessToken = connectResult.access_token;
            this.homey.settings.set('bearerid', this.homey.app.bearerid);
            this.homey.settings.set('refreshtoken', connectResult.refresh_token);
            this.homey.settings.set('accesstoken', accessToken);
            this.homey.app.refreshtoken = connectResult.refresh_token;
            this.homey.app.updateLog('New Access Token Obtained');
        }
        catch (err)
        {
            this.homey.settings.set('accesstoken', '');

            const errText = err.message;

            if (errText.indexOf('Unknown refresh token') > 0)
            {
                this.homey.settings.set('refreshtoken', '');
                this.homey.app.refreshtoken = '';
            }

            this.homey.app.updateLog(`Failed to get Access Token: ${errText}`);
            throw new Error(`Failed to get a new access token: ${errText}`);
        }
        finally
        {
            this.homey.app.gettingAccessToken = false;
        }

        return accessToken;
    }

    async getLocations()
    {
        let result = '';
        try
        {
            result = await this.sendMessage('get', '/v1/structures', '', false);
            if (result !== -1)
            {
                return result;
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`Failed to get Locations from Lightwave ${err}: ${result}`);
        }
        return '';
    }

    async getDevices(locationID)
    {
        let result = '';
        try
        {
            result = await this.sendMessage('get', `/v1/structure/${locationID}`, '', false);
            if (result !== -1)
            {
                this.log(result);
                return result;
            }
        }
        catch (err)
        {
            this.homey.app.updateLog('Failed to get Devices from Lightwave');
        }

        return '';
    }

    lookup(productCode)
    {
        return TypeLookUp.find(x => x.id === productCode);
    }

    async getDevicesOfType(deviceType)
    {
        this.homey.app.updateLog(`Searching for devices of type: ${deviceType}`);
        const devices = [];
        const unsupportedDevices = [];

        try
        {
            const lwstructures = await this.getLocations();

            if (!lwstructures)
            {
                this.homey.app.updateLog('Failed to get locations');

                return devices;
            }

            // Loop through each structure
            for (const location of lwstructures.structures)
            {
                this.homey.app.updateLog(`Found Location: ${location}`);

                // Get the list of devices
                const lwdevices = await this.getDevices(location);

                if (!lwdevices)
                {
                    this.homey.app.updateLog('Failed to get devices');

                    return devices;
                }

                // loop through each device and check if it is the required type
                for (const lwdevice of lwdevices.devices)
                {
                    // Look up the product code to get our type
                    let { productCode } = lwdevice;
                    this.homey.app.updateLog(`Found device: ${lwdevice.name} (${productCode})`);

                    if (typeof productCode === 'string')
                    {
                        // Remove the new EU part from the device name
                        productCode = productCode.replace('EU', '');
                        productCode = productCode.replace('MK2', '');
                    }
                    // Look up the product code in our supported devices table
                    const productInfo = this.lookup(productCode);

                    if (!productInfo)
                    {
                        // Not a supported device so record for our log
                        for (const lwfeatureset of lwdevice.featureSets)
                        {
                            let device = {};
                            device = {
                                productCode,
                                name: lwdevice.name,
                                device: lwdevice.device,
                                desc: lwdevice.desc,
                                type: lwdevice.type,
                                cat: lwdevice.cat,
                                gen: lwdevice.gen,
                            };

                            // Get each feature
                            for (const lwfeature of lwfeatureset.features)
                            {
                                device[lwfeature.type] = 'Yes';
                            }
                            unsupportedDevices.push(
                            {
                                device,
                            },
);
                        }

                        continue;
                    }

                    // Check if the type specified in our supported devices table matches the type we are looking for
                    if (productInfo.type === deviceType)
                    {
                        this.homey.app.updateLog('Correct Device Type.');

                        // loop through each feature set (one for each gang of a dimmer)
                        let index = 1;
                        for (const lwfeatureset of lwdevice.featureSets)
                        {
                            this.homey.app.updateLog(`Logging Feature Set: ${lwfeatureset.featureSetId}`);

                            let iconName = productCode;
                            if (productInfo.multiGang)
                            {
                                // This device has more than one gang so append sub item number to select correct icon
                                iconName += `_${index}`;
                                index++;
                            }

                            iconName += '.svg';
                            this.log('icon: ', iconName);

                            let data = {};
                            data = {
                                id: lwfeatureset.featureSetId,
                                productCode,
                            };

                            // Get the feature id for each feature
                            const capabilities = [];
                            for (const lwfeature of lwfeatureset.features)
                            {
                                data[lwfeature.type] = lwfeature.featureId;
                                const capability = CapabilityMap.find(x => x.id === lwfeature.type);
                                if (capability)
                                {
                                    capabilities.push(capability.type);
                                }
                            }
                            devices.push(
                            {
                                name: lwfeatureset.name,
                                icon: iconName, // relative to: /drivers/<driver_id>/assets/
                                capabilities,
                                data,
                            },
);
                            this.log(devices);
                        }
                    }
                    else
                    {
                        this.homey.app.updateLog('Not what we are looking for');
                    }
                }
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`Connection Failed: ${err}`);
        }

        this.log('Unsupported Devices: ', unsupportedDevices);
        this.homey.settings.set('unsupportedDevices', JSON.stringify(unsupportedDevices, null, 2));
        return devices;
    }

    async setFeatureValue(featureId, state)
    {
        if (typeof featureId !== 'string')
        {
            this.log('setFeatureValue', featureId, typeof featureId);
            return '';
        }

        let result = '';
        const body = `{"value":"${state}"}`;
        this.log('setFeature: ', featureId, ' ', body);

        result = await this.sendMessage('post', `/v1/feature/${featureId}`, body, false);
        return result;
    }

    async getFeatureValue(featureId, ValueList)
    {
        if (typeof featureId !== 'string')
        {
            this.log('getFeatureValue', featureId, typeof featureId);
            return '';
        }

        let result = '';

        if (ValueList)
        {
            return ValueList[featureId];
        }

        result = await this.sendMessage('get', `/v1/feature/${featureId}`, '', false);
        if (result !== -1)
        {
            return result.value;
        }

        return -1;
    }

    async registerWEBHooks(featureID, feature, deviceID)
    {
        if (this.homey.settings.get('usePolling'))
        {
            return '';
        }

        if (typeof featureID !== 'string')
        {
            this.log('registerWEBHooks: feature not available for', feature, deviceID);
            return '';
        }

        // Delay to allow LW system to settle else creating the new webhooks fails
        await new Promise(resolve => this.homey.setTimeout(resolve, Math.random() * 20000));

        let result = '';
        try
        {
            // const url = "https://" + this.homey.app.homeyId + ".connect.athom.com/api/app/com.lightwaverf.smartseries/?homey=" + this.homey.app.homeyId;
            const bodyObj = {
                events: [
                {
                    type: feature,
                    id: featureID,
                }],
                url: this.webhookUrl,
                ref: deviceID,
            };

            const body = JSON.stringify(bodyObj);

            // this.homey.app.updateLog( "Registering LW Webhook: " + deviceID );

            result = await this.sendMessage('post', '/v1/events', body, false);
            if (result !== -1)
            {
                this.homey.app.updateLog(`Registered LW Webhook: ${deviceID}`);
                return result.id;
            }
            this.homey.app.updateLog(`Register LW Webhook failed: ${deviceID}`);
        }
        catch (err)
        {
            if (result)
            {
                this.homey.app.updateLog(`Register WebHook Error: ${err}: ${result}`);
            }
            else
            {
                this.homey.app.updateLog(`Register WebHook Error: ${err}`);
            }
        }

        return '';
    }

    async getLWHistory(Start)
    {
        const devices = [];
        const history = [];

        const lwstructures = await this.getLocations();

        // Loop through each structure
        for (const location of lwstructures.structures)
        {
            // Get the list of devices
            const lwdevices = await this.getDevices(location);
            for (const lwdevice of lwdevices.devices)
            {
                devices.push(
                {
                    deviceId: lwdevice.deviceId,
                },
            );
            }
        }
        // Get the history data
        const body = `{"devices":${JSON.stringify(devices, null, 2)}}`;
        if (Start !== '')
        {
            Start = `?start=${Start}`;
            this.log('Start = ', Start);
        }
        const historyList = await this.sendMessage('post', `/v1/data${Start}`, body, true);

        for (const lwhistory of historyList)
        {
            if (Array.isArray(lwhistory.data) && (lwhistory.data.length > 0))
            {
                history.push(
                {
                    lwhistory,
                },
);
            }
        }

        this.log('LW History: ', JSON.stringify(history, null, 2));
        return history;
    }

    async getLWValues()
    {
        if (!this.featureList || this.featureList.length === 0)
        {
            this.featureList = [];

            const lwstructures = await this.getLocations();

            // Loop through each structure
            for (const location of lwstructures.structures)
            {
                // Get the list of devices
                const lwdevices = await this.getDevices(location);
                for (const lwdevice of lwdevices.devices)
                {
                    // loop through each feature set (one for each gang of a dimmer)
                    for (const lwfeatureset of lwdevice.featureSets)
                    {
                        this.log('ForeEachFeatureSet: ', lwfeatureset);

                        // Get the feature id for each feature
                        for (const lwfeature of lwfeatureset.features)
                        {
                            if ((lwfeature.type === 'switch')
                                || (lwfeature.type === 'dimLevel')
                                || (lwfeature.type === 'buttonPress')
                                || (lwfeature.type === 'power')
                                || (lwfeature.type === 'energy')
                                || (lwfeature.type === 'temperature')
                                || (lwfeature.type === 'targetTemperature')
                                || (lwfeature.type === 'rssi')
                                || (lwfeature.type === 'batteryLevel')
                                || (lwfeature.type === 'heatState')
                                || (lwfeature.type === 'valveLevel'))
                            {
                                this.featureList.push(
                                {
                                    featureId: lwfeature.featureId,
                                },
);
                            }
                        }
                    }
                }
            }
        }

        this.log('LW Features: ', JSON.stringify(this.featureList, null, 2));

        // batch read the features
        const body = `{"features":${JSON.stringify(this.featureList, null, 2)}}`;
        const valueList = await this.sendMessage('post', '/v1/features/read', body, true);

        this.log('LW History: ', JSON.stringify(valueList, null, 2));
        return valueList;
    }

    async getLWWebhooks()
    {
        // Get the list of events (webhooks)
        const eventsList = await this.sendMessage('get', '/v1/events', '', true);

        //        this.log( "LW events: ", JSON.stringify( eventsList, null, 2 ) )

        return eventsList;
    }

    async deleteLWWebhooks()
    {
        try
        {
            this.homey.app.updateLog('Deleting old LW WebHooks');

            // Get the list of events (webhooks)
            const eventsList = await this.getLWWebhooks();

            for (const eventItem of eventsList)
            {
                try
                {
                    await this.sendMessage('delete', `/v1/events/${eventItem.id}`, '', true);
                }
                catch (err)
                {
                    this.homey.app.updateLog(`!!!!! Error Deleting WebHook ${err}`);
                }
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`!!!!! Error Deleting WebHook ${err}`);
        }

        this.homey.app.updateLog('Old LW WEBHooks Deleted');
        return '';
    }

    async sendMessage(method, path, body, ignoreReady)
    {
        let errMsg = '';
        let accessToken = await this.getAccessToken(ignoreReady);

        if (accessToken === '')
        {
            accessToken = await this.getNewTokens();
        }

        if (accessToken)
        {
            // Try at least twice as the cached token may have expired
            for (let i = 0; i < 3; i++)
            {
                try
                {
                    const connectResult = await this._call(
                    {
                        authText: `bearer ${accessToken}`,
                        method,
                        address: 'publicapi.lightwaverf.com',
                        path,
                        body,
                    },
                    );

                    // this.log('sendMessage Result: ', connectResult);
                    if (connectResult)
                    {
                        return connectResult;
                    }
                }
                catch (err)
                {
                    this.homey.app.updateLog(`Connection Failed: ${err}`);

                    errMsg = err.message.toLowerCase();
                }

                if (errMsg.indexOf('request rate reached limit') >= 0)
                {
                    // Working it too hard so add a delay
                    this.homey.app.updateLog('Request delayed');
                    await this.asyncDelay(5000);
                    continue;
                }

                if (errMsg.indexOf('unauthorized') < 0)
                {
                    // Not an unauthorized error so try again
                    this.homey.app.updateLog('Request retry');
                    continue;
                }

                // Get a new token
                accessToken = await this.getNewTokens();
                if (accessToken === '')
                {
                    return -1;
                }

                this.homey.app.updateLog('Communication Failed');
            }
        }
        else
        {
            this.homey.app.updateLog('No access token');
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
    },
)
    {
        if (!authText)
        {
            throw new Error('Missing authText');
        }

        if (!address)
        {
            throw new Error('Missing URL');
        }

        const url = `https://${address}${path}`;
        const opts = {
            method,
            headers:
            {
                'content-type': 'application/json',
                Authorization: authText,
            },
            timeout: 15000,
        };

        // if (body && (body !== ''))
        // {
        //     opts.body = body;
        // }

        // this.log( "fetching: ", url, opts );
        const res = await this.fetch(url, opts, body);

        let bodyText;
        if (res.status === 200)
        {
            // Get the reply in JSON format
            bodyText = JSON.parse(res.body);
        }
        else
        {
            // Get the reply as text as it will possibly be an error message
            bodyText = res.body;
        }

        // Make sure there is something to return and the status was good
        if (bodyText && (res.status === 200))
        {
            return bodyText;
        }

        if (!res.ok)
        {
            // The result was bad so throw an error
            // this.log('status: ', res.status);
            const err = new Error((bodyText && bodyText.message) || (bodyText) || 'Unknown Lightwave Smart Error');
            err.code = res.status;
            throw err;
        }

        return bodyText;
    }

    async fetch(url, opts, body)
    {
        return new Promise((resolve, reject) =>
        {
            try
            {
                const req = https.request(url, opts, res =>
                {
                    const body = [];
                    res.on('data', chunk =>
                    {
                        body.push(chunk);
                    });

                    res.on('end', () =>
                    {
                        let returnData = Buffer.concat(body);
                        returnData = returnData.toString();
                        resolve({ status: res.statusCode, body: returnData, ok: (res.statusCode === 200) });
                    });
                });

                req.on('error', err =>
                {
                    reject(new Error(`HTTPS Catch: ${err}`), 0);
                });

                req.setTimeout(5000, () =>
                {
                    req.destroy();
                    reject(new Error('HTTP Catch: Timeout'));
                });

                if (body)
                {
                    req.write(body);
                }
                req.end();
            }
            catch (err)
            {
                this.log('HTTPS Catch: ', err);
                const stack = this.varToString(err.stack);
                reject(new Error(`HTTPS Catch: ${err.message}\n${stack}`));
            }
        });
    }

};
