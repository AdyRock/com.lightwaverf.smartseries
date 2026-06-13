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
	{ id: 'L40', type: 'socket', multiGang: false },
	{ id: 'L41', type: 'socket', multiGang: false },
	{ id: 'L42', type: 'socket', multiGang: true },
	{ id: 'L81', type: 'relay', multiGang: false },
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
	{ id: 'L70', type: 'motion', multiGang: false },
	{ id: 'L92', type: 'thermostat', multiGang: false },
	{ id: 'DT92E', type: 'thermostat', multiGang: false },
	{ id: 'L51', type: 'scene', multiGang: false },
	{ id: 'L52', type: 'scene', multiGang: true },
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
	{ id: 'movement', type: 'alarm_motion' },
	{ id: 'lightLevel', type: 'measure_lightLevel' },
	{ id: 'batteryLevel', type: 'measure_battery' },
];

module.exports = class LightwaveSmartBridge extends SimpleClass
{

	constructor(homey, webhookUrl)
	{
		super();
		this.homey = homey;
		this.webhookUrl = webhookUrl;
		this.numberOfWebhooks = 0;
		this.failedWebhookRegistrations = new Map();
		this.webhookRetryTimer = null;
		this.webhookRetryIntervalMs = 5 * 60 * 1000;
		this.serverFailureCooldownUntil = 0;
		this.serverFailureCooldownScope = 'all';
		this.serverFailureBackoffMs = 15000;
		this.serverFailureBackoffMaxMs = 5 * 60 * 1000;
		this.lastServerFailureLog = 0;
		this.lastWebhookDeferralLog = 0;
		this.webhookDeferralLogPeriodMs = 10000;
		this.deferredWebhookCount = 0;
		return this;
	}

	_getErrorMessage(err)
	{
		if (!err)
		{
			return '';
		}

		if (typeof err === 'string')
		{
			return err;
		}

		if (typeof err.message === 'string')
		{
			return err.message;
		}

		return this.homey.app.varToString(err);
	}

	_getResponseBodyPreview(err, maxLength = 500)
	{
		if (!err || (typeof err.responseBody !== 'string'))
		{
			return '';
		}

		const bodyText = err.responseBody.replace(/\s+/g, ' ').trim();
		if (bodyText.length <= maxLength)
		{
			return bodyText;
		}

		return `${bodyText.substring(0, maxLength)}...`;
	}

	_getResponseRequestId(err)
	{
		if (!err || !err.responseHeaders)
		{
			return '';
		}

		const requestId = err.responseHeaders['x-request-id']
			|| err.responseHeaders['x-correlation-id']
			|| err.responseHeaders['request-id']
			|| err.responseHeaders['cf-ray'];

		if (!requestId)
		{
			return '';
		}

		return String(requestId);
	}

	_getHeaderValue(headers, key)
	{
		if (!headers || !key)
		{
			return '';
		}

		const targetKey = String(key).toLowerCase();
		const headerKeys = Object.keys(headers);
		for (let i = 0; i < headerKeys.length; i++)
		{
			const headerKey = headerKeys[i];
			if (String(headerKey).toLowerCase() === targetKey)
			{
				const headerValue = headers[headerKey];
				return (typeof headerValue === 'string') ? headerValue : this.homey.app.varToString(headerValue);
			}
		}

		return '';
	}

	_getHeaderSummary(err)
	{
		if (!err || !err.responseHeaders)
		{
			return 'none';
		}

		const headers = err.responseHeaders;
		const interestingKeys = ['content-type', 'date', 'server', 'x-request-id', 'x-correlation-id', 'cf-ray'];
		const parts = [];

		for (let i = 0; i < interestingKeys.length; i++)
		{
			const key = interestingKeys[i];
			const value = this._getHeaderValue(headers, key);
			if (value)
			{
				parts.push(`${key}=${value}`);
			}
		}

		if (parts.length > 0)
		{
			return parts.join(', ');
		}

		return `keys=${Object.keys(headers).join('|') || 'none'}`;
	}

	_getRequestBodyPreview(body, maxLength = 300)
	{
		if (typeof body !== 'string')
		{
			return 'n/a';
		}

		const oneLineBody = body.replace(/\s+/g, ' ').trim();
		if (!oneLineBody)
		{
			return 'empty';
		}

		if (oneLineBody.length <= maxLength)
		{
			return oneLineBody;
		}

		return `${oneLineBody.substring(0, maxLength)}...`;
	}

	_isServerFailure(errorText, errorCode)
	{
		if ((typeof errorCode === 'number') && (errorCode >= 500))
		{
			return true;
		}

		if (!errorText)
		{
			return false;
		}

		const failureText = errorText.toLowerCase();

		return (failureText.indexOf('cannot read properties of undefined (reading \'split\')') >= 0)
			|| (failureText.indexOf('http catch: timeout') >= 0)
			|| (failureText.indexOf('socket hang up') >= 0)
			|| (failureText.indexOf('econnreset') >= 0)
			|| (failureText.indexOf('econnrefused') >= 0)
			|| (failureText.indexOf('enotfound') >= 0)
			|| (failureText.indexOf('eai_again') >= 0)
			|| (failureText.indexOf('service unavailable') >= 0)
			|| (failureText.indexOf('bad gateway') >= 0)
			|| (failureText.indexOf('gateway timeout') >= 0)
			|| (failureText.indexOf('internal server error') >= 0);
	}

	_getCooldownScope(path, reason)
	{
		if ((typeof path === 'string') && (path.indexOf('/v1/events') === 0))
		{
			const reasonText = String(reason || '').toLowerCase();
			if (reasonText.indexOf('cannot read properties of undefined (reading \'split\')') >= 0)
			{
				return 'events';
			}
		}

		return 'all';
	}

	_isInServerCooldown(path = '')
	{
		if (!(Date.now() < this.serverFailureCooldownUntil))
		{
			return false;
		}

		if (this.serverFailureCooldownScope === 'all')
		{
			return true;
		}

		if (this.serverFailureCooldownScope === 'events')
		{
			return (typeof path === 'string') && (path.indexOf('/v1/events') === 0);
		}

		return true;
	}

	_setServerFailureCooldown(reason, path = '')
	{
		const now = Date.now();
		const cooldownScope = this._getCooldownScope(path, reason);
		this.serverFailureCooldownScope = cooldownScope;
		this.serverFailureCooldownUntil = now + this.serverFailureBackoffMs;

		if ((now - this.lastServerFailureLog) > 10000)
		{
			const retryAt = new Date(this.serverFailureCooldownUntil).toISOString();
			const scopeText = (cooldownScope === 'events') ? 'events endpoint only' : 'all endpoints';
			this.homey.app.updateLog(`Lightwave API unavailable. Pausing ${scopeText} until ${retryAt}. Reason: ${reason}`);
			this.lastServerFailureLog = now;
		}

		this.serverFailureBackoffMs = Math.min(this.serverFailureBackoffMs * 2, this.serverFailureBackoffMaxMs);
	}

	_onSuccessfulRequest(path = '')
	{
		if (this.serverFailureCooldownScope === 'events')
		{
			if (!((typeof path === 'string') && (path.indexOf('/v1/events') === 0)))
			{
				return;
			}
		}

		this.serverFailureCooldownUntil = 0;
		this.serverFailureCooldownScope = 'all';
		this.serverFailureBackoffMs = 15000;
	}

	_setTemporaryPolling(enabled, reason = '')
	{
		if (this.homey.settings.get('usePolling'))
		{
			return;
		}

		if ((this.homey.app) && (typeof this.homey.app.setTemporaryPolling === 'function'))
		{
			this.homey.app.setTemporaryPolling(enabled, reason);
		}
	}

	_logWebhookDeferral()
	{
		this.deferredWebhookCount++;
		const now = Date.now();
		if ((now - this.lastWebhookDeferralLog) < this.webhookDeferralLogPeriodMs)
		{
			return;
		}

		this.homey.app.updateLog(`Deferring webhook registrations while Lightwave API unavailable (queued/skipped: ${this.deferredWebhookCount})`);
		this.lastWebhookDeferralLog = now;
		this.deferredWebhookCount = 0;
	}

	_queueWebhookRegistration(featureID, feature, deviceID, reason)
	{
		if (this.homey.settings.get('usePolling'))
		{
			return;
		}

		const existing = this.failedWebhookRegistrations.get(deviceID);
		const attempt = existing ? (existing.attempt + 1) : 1;
		this.failedWebhookRegistrations.set(
			deviceID,
			{
				featureID,
				feature,
				deviceID,
				attempt,
				reason,
			},
		);

		if (!this.webhookRetryTimer)
		{
			this.homey.app.updateLog('Starting periodic webhook retry task');
			this.webhookRetryTimer = this.homey.setInterval(() =>
			{
				this.retryFailedWebhooks().catch((err) =>
				{
					this.homey.app.updateLog(`Webhook retry worker error: ${err}`);
				});
			}, this.webhookRetryIntervalMs);
		}
	}

	async retryFailedWebhooks()
	{
		if (this.failedWebhookRegistrations.size === 0)
		{
			if (this.webhookRetryTimer)
			{
				this.homey.clearInterval(this.webhookRetryTimer);
				this.webhookRetryTimer = null;
				this.homey.app.updateLog('Stopping periodic webhook retry task (queue empty)');
			}
			return;
		}

		if (this._isInServerCooldown('/v1/events'))
		{
			return;
		}

		this.homey.app.updateLog(`Retrying failed webhooks (${this.failedWebhookRegistrations.size})`);

		for (const [deviceID, webhookInfo] of this.failedWebhookRegistrations)
		{
			const webhookId = await this.registerWEBHooks(webhookInfo.featureID, webhookInfo.feature, webhookInfo.deviceID, true);
			if (webhookId)
			{
				this.failedWebhookRegistrations.delete(deviceID);
			}
		}
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
		await new Promise((resolve) => this.homey.setTimeout(resolve, period));
	}

	isBridgeReady()
	{
		return this.homey.app.bridgeReady;
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
		return TypeLookUp.find((x) => x.id === productCode);
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
						productCode = productCode.replace('MK3', '');
						productCode = productCode.replace('MK4', '');
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
								const capability = CapabilityMap.find((x) => x.id === lwfeature.type);
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
			this.homey.app.updateLog(`setFeatureValue: ${featureId}, ${typeof featureId}`);
			return '';
		}

		let result = '';
		const body = `{"value":"${state}"}`;
		this.homey.app.updateLog(`setFeature:  ${featureId}, ${this.homey.app.varToString(body)}`);

		result = await this.sendMessage('post', `/v1/feature/${featureId}`, body, false);
		return result;
	}

	async getFeatureValue(featureId, ValueList)
	{
		if (typeof featureId !== 'string')
		{
			this.homey.app.updateLog(`getFeatureValue: Invalid featureID ${featureId}, ${typeof featureId}`);
			return '';
		}

		let result = '';

		if (ValueList)
		{
			return ValueList[featureId];
		}

		if (this._isInServerCooldown(`/v1/feature/${featureId}`))
		{
			return -1;
		}

		result = await this.sendMessage('get', `/v1/feature/${featureId}`, '', false);
		if (result !== -1)
		{
			this.homey.app.updateLog(`getFeatureValue returns: ${this.homey.app.varToString(result)}`);
			return result.value;
		}

		return -1;
	}

	async registerWEBHooks(featureID, feature, deviceID, isRetry = false)
	{
		if (this.homey.settings.get('usePolling'))
		{
			return '';
		}

		if (typeof featureID !== 'string')
		{
			this.homey.app.updateLog(`registerWEBHooks: feature not available for ${feature}, ${deviceID}`);
			return '';
		}

		if (this._isInServerCooldown('/v1/events'))
		{
			this._queueWebhookRegistration(featureID, feature, deviceID, 'deferred during server cooldown');
			if (!isRetry)
			{
				this._logWebhookDeferral();
			}
			return '';
		}

		this.numberOfWebhooks++;
		const webhookNumber = this.numberOfWebhooks;

		// Delay to allow LW system to settle else creating the new webhooks fails
		//        await new Promise(resolve => this.homey.setTimeout(resolve, this.numberOfWebhooks * 1000));

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

			this.homey.app.updateLog(`Registering LW Webhook (${webhookNumber}): ${deviceID}`);

			result = await this.sendMessage('post', '/v1/events', body, false);
			if (result !== -1)
			{
				this.failedWebhookRegistrations.delete(deviceID);
				this._setTemporaryPolling(false);
				this.homey.app.updateLog(`Registered LW Webhook (${webhookNumber}): ${deviceID}`);
				return result.id;
			}

			this._queueWebhookRegistration(featureID, feature, deviceID, 'register returned -1');
			this.homey.app.updateLog(`Register LW Webhook failed (${webhookNumber}): ${deviceID}`);
		}
		catch (err)
		{
			const errText = this._getErrorMessage(err);
			this._queueWebhookRegistration(featureID, feature, deviceID, errText);

			if (result)
			{
				this.homey.app.updateLog(`Register WebHook Error (${webhookNumber}): ${err}: ${result}`);
			}
			else
			{
				this.homey.app.updateLog(`Register WebHook Error (${webhookNumber}): ${err}`);
			}
		}

		if (isRetry)
		{
			const retryInfo = this.failedWebhookRegistrations.get(deviceID);
			if (retryInfo)
			{
				this.homey.app.updateLog(`Webhook retry pending (${retryInfo.attempt}) for ${deviceID}`);
			}
		}

		return '';
	}

	async getLWHistory(Start)
	{
		const devices = [];
		const history = [];

		const lwstructures = await this.getLocations();
		if (!lwstructures || !Array.isArray(lwstructures.structures))
		{
			this.homey.app.updateLog(`getLWHistory: invalid structures response: ${this.homey.app.varToString(lwstructures)}`);
			return history;
		}

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

		this.homey.app.updateLog(`LW History: ${this.homey.app.varToString(history)}`);
		return history;
	}

	async getLWValues()
	{
		if (!this.featureList || this.featureList.length === 0)
		{
			this.featureList = [];

			const lwstructures = await this.getLocations();
			if (!lwstructures || !Array.isArray(lwstructures.structures))
			{
				this.homey.app.updateLog(`getLWValues: invalid structures response: ${this.homey.app.varToString(lwstructures)}`);
				return {};
			}

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
						this.homey.app.updateLog(`ForeEachFeatureSet: ${lwfeatureset}`);

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
								|| (lwfeature.type === 'valveLevel')
								|| (lwfeature.type === 'movement'))
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

		this.homey.app.updateLog(`LW Features: ${this.homey.app.varToString(this.featureList)}`);

		// batch read the features
		const body = `{"features":${JSON.stringify(this.featureList, null, 2)}}`;
		const valueList = await this.sendMessage('post', '/v1/features/read', body, true);
		if ((valueList === -1) || !valueList)
		{
			this.homey.app.updateLog(`getLWValues: features read failed: ${this.homey.app.varToString(valueList)}`);
			return {};
		}

		this.homey.app.updateLog(`LW History: ${this.homey.app.varToString(valueList)}`);
		return valueList;
	}

	async getLWWebhooks()
	{
		// Get the list of events (webhooks)
		const eventsList = await this.sendMessage('get', '/v1/events', '', true);

		// this.log( "LW events: ", JSON.stringify( eventsList, null, 2 ) )

		return eventsList;
	}

	async deleteLWWebhooks()
	{
		try
		{
			this.homey.app.updateLog('Deleting old LW WebHooks');

			// Get the list of events (webhooks)
			const eventsList = await this.getLWWebhooks();
			if (!Array.isArray(eventsList))
			{
				this.homey.app.updateLog(`Skipping delete old webhooks. Unexpected response: ${this.homey.app.varToString(eventsList)}`);
				return '';
			}

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
		if (this._isInServerCooldown(path))
		{
			return -1;
		}

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
						this._onSuccessfulRequest(path);
						return connectResult;
					}
				}
				catch (err)
				{
					this.homey.app.updateLog(`Connection Failed (${method.toUpperCase()} ${path}): ${err}`);
					const errText = this._getErrorMessage(err);
					errMsg = errText.toLowerCase();

					if (errMsg.indexOf('cannot read properties of undefined (reading \'split\')') >= 0)
					{
						const status = (typeof err.statusCode === 'number') ? err.statusCode : 'unknown';
						const requestId = this._getResponseRequestId(err);
						const bodyPreview = this._getResponseBodyPreview(err);
						const headers = this._getHeaderSummary(err);
						const requestBodyPreview = this._getRequestBodyPreview(body);
						this.homey.app.updateLog(`Split error details (${method.toUpperCase()} ${path}): status=${status}, requestId=${requestId || 'n/a'}, headers=${headers}, requestBody=${requestBodyPreview}, body=${bodyPreview || 'n/a'}`);
					}

					if (this._isServerFailure(errText, err.code))
					{
						if ((typeof path === 'string') && (path.indexOf('/v1/events') === 0))
						{
							this._setTemporaryPolling(true, `Webhook endpoint failure: ${errText}`);
						}

						this._setServerFailureCooldown(errText, path);
						return -1;
					}
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
					this.homey.app.updateLog('Communication Failed');
					return -1;
				}
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
			let responseMessage = bodyText;
			if ((typeof bodyText === 'string') && bodyText)
			{
				try
				{
					const parsedBody = JSON.parse(bodyText);
					responseMessage = (parsedBody && parsedBody.message) ? parsedBody.message : bodyText;
				}
				catch (parseErr)
				{
					responseMessage = bodyText;
				}
			}

			const err = new Error(responseMessage || 'Unknown Lightwave Smart Error');
			err.code = res.status;
			err.statusCode = res.status;
			err.responseBody = (typeof res.body === 'string') ? res.body : this.homey.app.varToString(res.body);
			err.responseHeaders = res.headers || {};
			err.requestMethod = method;
			err.requestPath = path;
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
				const req = https.request(url, opts, (res) =>
				{
					const body = [];
					res.on('data', (chunk) =>
					{
						body.push(chunk);
					});

					res.on('end', () =>
					{
						let returnData = Buffer.concat(body);
						returnData = returnData.toString();
						resolve({
							status: res.statusCode,
							body: returnData,
							headers: res.headers,
							ok: (res.statusCode === 200),
						});
					});
				});

				req.on('error', (err) =>
				{
					reject(new Error(`HTTPS Catch: ${err}`), 0);
				});

				req.setTimeout(15000, () =>
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
				this.homey.app.updateLog(`HTTPS Catch: ${this.homey.app.varToString(err)}`);
				reject(new Error(`HTTPS Catch: ${err.message}\n${this.homey.app.varToString(err.stack)}`));
			}
		});
	}

};
