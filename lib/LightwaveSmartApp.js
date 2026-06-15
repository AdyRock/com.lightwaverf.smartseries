'use strict';

const Homey = require('homey');
const nodemailer = require('nodemailer');
const LightwaveSmartBridge = require('./LightwaveSmartBridge');

const POLL_INTERVAL = 30000;
class LightwaveSmartApp extends Homey.App
{

    parseSupportMessage(message)
    {
        const details = {
            rawMessage: message,
        };

        const parseJsonValue = (value) =>
        {
            if (typeof value !== 'string')
            {
                return value;
            }

            const trimmedValue = value.trim();
            if (!trimmedValue || (trimmedValue === 'n/a') || (trimmedValue === 'empty'))
            {
                return trimmedValue;
            }

            if ((trimmedValue[0] === '{') || (trimmedValue[0] === '['))
            {
                try
                {
                    return JSON.parse(trimmedValue);
                }
                catch (err)
                {
                    return trimmedValue;
                }
            }

            return trimmedValue;
        };

        const splitErrorMatch = message.match(/^Split error details \(([^)]+)\): status=([^,]+), requestId=([^,]+), headers=(.*?), requestBody=(.*?), body=(.*)$/);
        if (splitErrorMatch)
        {
            details.type = 'splitErrorDetails';
            details.endpoint = splitErrorMatch[1].trim();
            details.status = Number(splitErrorMatch[2].trim());
            details.requestId = splitErrorMatch[3].trim();
            details.responseHeaders = splitErrorMatch[4].trim();
            details.requestBody = parseJsonValue(splitErrorMatch[5]);
            details.responseBody = parseJsonValue(splitErrorMatch[6]);
            return details;
        }

        const connectionFailedMatch = message.match(/^Connection Failed \(([^)]+)\): Error: (.*)$/);
        if (connectionFailedMatch)
        {
            details.type = 'connectionFailed';
            details.endpoint = connectionFailedMatch[1].trim();
            details.error = connectionFailedMatch[2].trim();
            return details;
        }

        const apiUnavailableMatch = message.match(/^Lightwave API unavailable\. Pausing (.*?) until ([^.]+)\. Reason: (.*)$/);
        if (apiUnavailableMatch)
        {
            details.type = 'apiUnavailable';
            details.scope = apiUnavailableMatch[1].trim();
            details.pausedUntil = apiUnavailableMatch[2].trim();
            details.reason = apiUnavailableMatch[3].trim();
            return details;
        }

        const pollingEnabledMatch = message.match(/^Temporary polling enabled: (.*)$/);
        if (pollingEnabledMatch)
        {
            details.type = 'temporaryPollingEnabled';
            details.reason = pollingEnabledMatch[1].trim();
            return details;
        }

        const pollingDisabledMatch = message.match(/^Temporary polling disabled: (.*)$/);
        if (pollingDisabledMatch)
        {
            details.type = 'temporaryPollingDisabled';
            details.reason = pollingDisabledMatch[1].trim();
            return details;
        }

        const deferredMatch = message.match(/^Deferring webhook registrations while Lightwave API unavailable \(queued\/skipped: (\d+)\)$/);
        if (deferredMatch)
        {
            details.type = 'webhookDeferral';
            details.queuedOrSkipped = Number(deferredMatch[1]);
            return details;
        }

        details.type = 'message';
        return details;
    }

    getSupportBundle(limit = 25)
    {
        const diagLog = this.homey.settings.get('diagLog') || '';
        const lines = diagLog.split(/\r?\n/);
        const diagnostics = [];

        const isSupportMessage = (message) =>
        {
            return message.includes('Split error details')
                || message.includes('Connection Failed (')
                || message.includes('Lightwave API unavailable.')
                || message.includes('Temporary polling enabled:')
                || message.includes('Temporary polling disabled:')
                || message.includes('Deferring webhook registrations while Lightwave API unavailable');
        };

        for (let i = 0; i < lines.length; i++)
        {
            const line = lines[i];
            if (!line || !line.startsWith('* '))
            {
                continue;
            }

            const timestamp = line.substring(2).trim();
            const message = (lines[i + 1] || '').trim();
            if (!message)
            {
                continue;
            }

            if (isSupportMessage(message))
            {
                diagnostics.push({
                    timestamp,
                    message,
                    details: this.parseSupportMessage(message),
                });
            }
        }

        const splitErrorEntries = diagnostics.filter((entry) => entry.details.type === 'splitErrorDetails');
        const latestSplitError = splitErrorEntries[splitErrorEntries.length - 1];

        const timeoutEntries = diagnostics.filter((entry) =>
        {
            if (entry.details.type !== 'connectionFailed')
            {
                return false;
            }

            const errorText = String(entry.details.error || '').toLowerCase();
            return (errorText.indexOf('timed out') >= 0) || (errorText.indexOf('timeout') >= 0);
        });
        const latestTimeout = timeoutEntries[timeoutEntries.length - 1];

        const pickLatest = (...entries) =>
        {
            const validEntries = entries.filter((entry) => !!entry);
            if (validEntries.length === 0)
            {
                return null;
            }

            validEntries.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
            return validEntries[validEntries.length - 1];
        };

        const latestIncident = pickLatest(latestSplitError, latestTimeout);

        if (!latestIncident)
        {
            return {
                generatedAt: new Date(Date.now()).toISOString(),
                appVersion: this.homey.manifest.version,
                reportType: 'lightwave-support-bundle',
                incidentFound: false,
                message: 'No split-error or timeout incident found in the diagnostic log.',
            };
        }

        const { details } = latestIncident;

        if (details.type === 'connectionFailed')
        {
            return {
                generatedAt: new Date(Date.now()).toISOString(),
                appVersion: this.homey.manifest.version,
                reportType: 'lightwave-support-bundle',
                incidentFound: true,
                incidentType: 'api-timeout',
                summary: 'Homey polling request failed because the Lightwave API request timed out.',
                incident: {
                    timestamp: latestIncident.timestamp,
                    endpoint: details.endpoint,
                    homeySent: {
                        description: 'This is the exact request sent by the Homey app to the Lightwave API.',
                        requestBody: 'GET request (no body)',
                    },
                    lightwaveReturned: {
                        description: 'No HTTP response body was returned because the request timed out.',
                        status: 'timeout',
                        requestId: 'n/a',
                        responseHeaders: 'n/a',
                        responseBody: {
                            error: details.error,
                        },
                    },
                },
            };
        }

        return {
            generatedAt: new Date(Date.now()).toISOString(),
            appVersion: this.homey.manifest.version,
            reportType: 'lightwave-support-bundle',
            incidentFound: true,
            incidentType: 'webhook-split-error',
            summary: 'Homey webhook registration request failed because the Lightwave events API returned an error response.',
            incident: {
                timestamp: latestIncident.timestamp,
                endpoint: details.endpoint,
                homeySent: {
                    description: 'This is the exact request payload sent by the Homey app to the Lightwave API.',
                    requestBody: details.requestBody,
                },
                lightwaveReturned: {
                    description: 'This is the exact HTTP response returned by the Lightwave API.',
                    status: details.status,
                    requestId: details.requestId,
                    responseHeaders: details.responseHeaders,
                    responseBody: details.responseBody,
                },
            },
        };
    }

    async onInit()
    {
        this.homey.settings.set('diagLog', 'Starting LW app\r\n');
        this.updateLog('************** LightwaveRF Smart app is initialising. ***************');
        this.startupCompleteLogged = false;
        this.startupCompletionTimer = null;
        this.bridgeReady = false;
        this.gettingAccessToken = false;
        this.tokenNumber = 0;
        this.deviceInitSeconds = (Date.now() / 1000);

        this.oldBearerID = this.homey.settings.get('bearerid');
        this.homey.app.bearerid = this.oldBearerID;
        this.oldRefreshToken = this.homey.settings.get('refreshtoken');
        this.homey.app.refreshtoken = this.oldRefreshToken;

        this.usePolling = this.homey.settings.get('usePolling');
        this.temporaryPolling = false;
        this.temporaryPollingReason = '';
        this.oldPollingInterval = this.homey.settings.get('pollInterval');
        this.timerProcessing = false;
        this.onPoll = this.onPoll.bind(this);

        // Make sure polling interval is set to something
        if (!this.oldPollingInterval || (this.oldPollingInterval < 1000) || (this.oldPollingInterval > 60000))
        {
            this.homey.settings.set('pollInterval', POLL_INTERVAL);
            this.oldPollingInterval = this.homey.settings.get('pollInterval');
        }

        try
        {
            this.homeyId = await this.homey.cloud.getHomeyId();
        }
        catch (err)
        {
            this.updateLog(`Failed to get Homey ID: ${this.varToString(err)}`);
            this.homeyId = Math.random * 100000;
        }
        const webhookUrl = `https://webhooks.athom.com/webhook/${Homey.env.WEBHOOK_ID}?homey=${this.homeyId}`;

        const id = Homey.env.WEBHOOK_ID;
        const secret = Homey.env.WEBHOOK_SECRET;
        try
        {
            const myWebhook = await this.homey.cloud.createWebhook(id, secret, {});

            myWebhook.on('message', (args) =>
            {
                this.log('Got a webhook message!');
                this.log('headers:', args.headers);
                this.log('query:', args.query);
                this.log('body:', args.body);
                this.addSomething(args.body);
            });
        }
        catch (err)
        {
            this.updateLog(`Failed to create webhook: ${this.varToString(err)}`);
            this.usePolling = true;
        }

        this.lwBridge = new LightwaveSmartBridge(this.homey, webhookUrl);

        this.homey.settings.on('set', async (setting) =>
        {
            if ((setting === 'bearerid') || (setting === 'refreshtoken') || (setting === 'usePolling') || (setting === 'pollInterval'))
            {
                if (this.settingDelayTimer)
                {
                    this.homey.clearTimeout(this.settingDelayTimer);
                }
                this.settingDelayTimer = this.homey.setTimeout(() =>
                {
                    this.doInit();
                }, 1000);
            }
        });

        this.updateLog('--------- App Start InitBridge -------- ');

        await this.InitBridge(false);

        this.timerID = this.homey.setTimeout(this.onPoll, this.homey.settings.get('pollInterval'));

        this.updateLog('************** LightwaveRF Smart app has initialised. ***************');
        this.startStartupCompletionMonitor();
    }

    startStartupCompletionMonitor()
    {
        if (this.startupCompletionTimer)
        {
            this.homey.clearInterval(this.startupCompletionTimer);
            this.startupCompletionTimer = null;
        }

        this.startupCompletionTimer = this.homey.setInterval(() =>
        {
            try
            {
                if (this.checkStartupCompletion())
                {
                    this.homey.clearInterval(this.startupCompletionTimer);
                    this.startupCompletionTimer = null;
                }
            }
            catch (err)
            {
                this.updateLog(`Startup completion monitor error: ${this.varToString(err)}`);
            }
        }, 2000);
    }

    checkStartupCompletion()
    {
        if (this.startupCompleteLogged || !this.bridgeReady)
        {
            return false;
        }

        const drivers = this.homey.drivers.getDrivers();
        let totalDevices = 0;
        let availableDevices = 0;

        // eslint-disable-next-line no-restricted-syntax
        for (const driver in drivers)
        {
            if (Object.prototype.hasOwnProperty.call(drivers, driver))
            {
                const devices = this.homey.drivers.getDriver(driver).getDevices();
                for (let i = 0; i < devices.length; i++)
                {
                    totalDevices++;

                    try
                    {
                        const device = devices[i];
                        if (device && (typeof device.getAvailable === 'function') && device.getAvailable())
                        {
                            availableDevices++;
                        }
                    }
                    catch (err)
                    {
                        // Keep waiting until all devices report available
                    }
                }
            }
        }

        if ((totalDevices > 0) && (availableDevices === totalDevices))
        {
            this.startupCompleteLogged = true;
            this.updateLog(`************** Startup complete (${availableDevices}/${totalDevices} devices initialised). ***************`);
            return true;
        }

        return false;
    }

    doInit()
    {
        if (this.homey.settings.get('bearerid') === '')
        {
            this.homey.app.updateLog('No Bearer ID specified', false);
            return;
        }
        if (this.homey.settings.get('refreshtoken') === '')
        {
            this.homey.app.updateLog('No Refresh Token specified', false);
            return;
        }

        if ((this.homey.settings.get('bearerid') !== this.homey.app.oldBearerID)
            || (this.homey.settings.get('refreshtoken') !== this.homey.app.refreshtoken)
            || (this.homey.settings.get('usePolling') !== this.homey.app.usePolling))
        {
            this.homey.app.bearerid = this.homey.settings.get('bearerid');
            this.homey.app.refreshtoken = this.homey.settings.get('refreshtoken');

            // A new bearer id has been set or usePolling has been changed so re-initialise the bridge
            this.homey.clearTimeout(this.homey.app.timerID);
            this.homey.app.updateLog('--------- Setting Changed InitBridge -------- ');
            this.homey.app.oldBearerID = this.homey.settings.get('bearerid');
            this.homey.app.usePolling = this.homey.settings.get('usePolling');
            this.homey.app.oldPollingInterval = this.homey.settings.get('pollInterval');

            // User changed polling mode explicitly, so clear temporary fallback.
            this.homey.app.temporaryPolling = false;
            this.homey.app.temporaryPollingReason = '';

            this.homey.app.InitBridge(true);
            if (this.homey.app.isPollingActive())
            {
                this.homey.app.timerID = this.homey.setTimeout(this.homey.app.onPoll, this.homey.app.oldPollingInterval);
            }
        }
        else if (this.homey.settings.get('pollInterval') !== this.homey.app.oldPollingInterval)
        {
            this.homey.clearTimeout(this.homey.app.timerID);
            this.homey.app.oldPollingInterval = this.homey.settings.get('pollInterval');
            if (!this.homey.app.timerProcessing)
            {
                this.homey.app.timerID = this.homey.setTimeout(this.homey.app.onPoll, this.homey.app.oldPollingInterval);
            }
        }
    }

    isPollingActive()
    {
        return this.homey.settings.get('usePolling') || this.temporaryPolling;
    }

    ensurePollingTimer(delayMs)
    {
        if (!this.isPollingActive())
        {
            return;
        }

        if (this.timerProcessing)
        {
            return;
        }

        this.homey.clearTimeout(this.timerID);

        let nextInterval = Number(delayMs);
        if (!nextInterval || Number.isNaN(nextInterval) || (nextInterval < 1000))
        {
            nextInterval = Number(this.homey.settings.get('pollInterval'));
        }
        if (nextInterval < 5000)
        {
            nextInterval = 5000;
        }

        this.timerID = this.homey.setTimeout(this.onPoll, nextInterval);
    }

    setTemporaryPolling(enabled, reason = '')
    {
        if (enabled)
        {
            const alreadyEnabled = this.temporaryPolling;
            this.temporaryPolling = true;
            this.temporaryPollingReason = reason || this.temporaryPollingReason;

            if (!alreadyEnabled)
            {
                this.updateLog(`Temporary polling enabled: ${this.temporaryPollingReason || 'Webhook API unavailable'}`);
            }

            this.ensurePollingTimer(1000);
            return;
        }

        if (this.temporaryPolling)
        {
            this.temporaryPolling = false;
            this.temporaryPollingReason = '';
            this.updateLog('Temporary polling disabled: webhook registrations recovered');

            if (!this.homey.settings.get('usePolling'))
            {
                this.homey.clearTimeout(this.timerID);
            }
        }
    }

    getBridge()
    {
        return this.lwBridge;
    }

    async InitBridge(SettingChanged)
    {
        if (this.initialisingBridge)
        {
            this.updateLog('Bridge already being initialised ');
            return false;
        }

        try
        {
            this.initialisingBridge = true;

            const bridgeReady = await this.lwBridge.initialise();

            if (!this.homey.settings.get('unsupportedDevices'))
            {
                this.homey.settings.set('unsupportedDevices', 'Pairing not run yet');
            }

            if (bridgeReady)
            {
                this.bridgeReady = true;

                if (SettingChanged)
                {
                    this.updateLog('Initialising Devices');

                    const drivers = this.homey.drivers.getDrivers();
                    // eslint-disable-next-line no-restricted-syntax
                    for (const driver in drivers)
                    {
                        if (Object.prototype.hasOwnProperty.call(drivers, driver))
                        {
                            this.homey.drivers.getDriver(driver).getDevices().forEach((device) =>
                            {
                                try
                                {
                                    device.initDevice();
                                }
                                catch (err)
                                {

                                }
                            });
                        }
                    }
                }

                this.updateLog('Bridge ready');
            }
            else
            {
                this.updateLog('!! Bridge not ready !!');
            }
        }
        catch (err)
        {
            this.updateLog(`!! Bridge error: ${err.message} !!`);
        }

        this.initialisingBridge = false;
        return this.bridgeReady;
    }

    async _onWebhookMessage(body)
    {
        try
        {
            if (!body || !body.triggerEvent || !body.payload)
            {
                this.updateLog('!!! Webhook missing body or triggerEvent or Payload !!!');
                return;
            }

            // Get the ID of the device
            const hookData = body.id;
            let driverId = '';
            let deviceId = '';
            let capability = '';
            const dimmerParts = hookData.split('_');
            if (Array.isArray(dimmerParts))
            {
                driverId = dimmerParts[0];
                deviceId = dimmerParts[1];
                capability = dimmerParts[2];
            }

            this.updateLog(`Webhook Update: ${capability} = ${body.payload.value}`, true);

            const driver = this.homey.drivers.getDriver(driverId);
            if (driver)
            {
                const devices = driver.getDevices();
                for (let i = 0; i < devices.length; i++)
                {
                    try
                    {
                        const device = devices[i];
                        if (device.getData().id === deviceId)
                        {
                            this.updateLog(`Webhook found Device (${device.getName()}): ${capability} = ${body.payload.value}`, true);

                            device.setWebHookValue(capability, body.payload.value);
                            return;
                        }
                    }
                    catch (err)
                    {
                        this.log(err);
                    }
                }
            }
            this.updateLog(`!!! Webhook not matched: ${driverId}, capability: ${capability}, Value: ${body.payload.value}`, false);
        }
        catch (err)
        {
            this.updateLog(`Webhook Error: ${err}`);
        }
    }

    async onPoll()
    {
        this.timerProcessing = true;
        const promises = [];
        try
        {
            if (this.homey.app.isPollingActive())
            {
                this.updateLog('\r\n*** Polling Start ***', true);

                // Fetch all the values in one go
                const valueList = await this.lwBridge.getLWValues();

                if (!valueList || (typeof valueList !== 'object') || (Object.keys(valueList).length === 0))
                {
                    this.updateLog('Polling skipped: batch value read unavailable', true);
                    this.updateLog('*** Polling End ***\r\n', true);

                    if (this.homey.app.isPollingActive())
                    {
                        let failedPollInterval = Number(this.homey.settings.get('pollInterval'));
                        if (failedPollInterval < 5000)
                        {
                            failedPollInterval = 5000;
                        }

                        if (this.lwBridge && (typeof this.lwBridge.isBatchReadInCooldown === 'function') && this.lwBridge.isBatchReadInCooldown())
                        {
                            const cooldownRemainingMs = this.lwBridge.getServerCooldownRemainingMs('/v1/features/read');
                            if (cooldownRemainingMs > failedPollInterval)
                            {
                                failedPollInterval = cooldownRemainingMs;
                            }
                            this.updateLog(`Polling deferred while Lightwave API is unavailable (${failedPollInterval} ms)`, true);
                        }

                        this.timerID = this.homey.setTimeout(this.onPoll, failedPollInterval);
                    }

                    this.timerProcessing = false;
                    return;
                }

                // Fetch the list of drivers for this app
                const drivers = this.homey.drivers.getDrivers();
                // eslint-disable-next-line no-restricted-syntax
                for (const driver in drivers)
                {
                    if (Object.prototype.hasOwnProperty.call(drivers, driver))
                    {
                        const devices = this.homey.drivers.getDriver(driver).getDevices();
                        for (let i = 0; i < devices.length; i++)
                        {
                            try
                            {
                                const device = devices[i];
                                if (device.getDeviceValues)
                                {
                                    promises.push(device.getDeviceValues(valueList));
                                }

                                if (device.getEnergyValues)
                                {
                                    promises.push(device.getEnergyValues(valueList));
                                }
                            }
                            catch (err)
                            {
                                this.log(err);
                            }
                        }
                    }
                }

                await Promise.all(promises);
                this.updateLog('*** Polling End ***\r\n', true);
            }
        }
        catch (err)
        {
			this.updateLog(`Polling Error: ${err}`, true);
        }

        if (this.homey.app.isPollingActive())
        {
            let nextInterval = Number(this.homey.settings.get('pollInterval'));
            if (nextInterval < 5000)
            {
                nextInterval = 5000;
            }
            this.updateLog(`Next Interval = ${nextInterval}`, true);
            this.timerID = this.homey.setTimeout(this.onPoll, nextInterval);
        }
        this.timerProcessing = false;
    }

    updateLog(newMessage, webHookMessage = false)
    {
        const messageText = (typeof newMessage === 'string') ? newMessage : String(newMessage);
        const isBannerMessage = messageText.startsWith('**************');
        const alwaysLog = isBannerMessage || /error|failed|failure|timeout|unavailable/i.test(messageText);

        if (!alwaysLog && !this.homey.settings.get('logEnabled'))
        {
            return;
        }

        if (!alwaysLog && webHookMessage)
        {
            if (!this.homey.settings.get('logWebhooks'))
            {
                return;
            }
        }

        this.log(messageText);

        const nowTime = new Date(Date.now());

        let oldText = this.homey.settings.get('diagLog');
        if (typeof oldText !== 'string')
        {
            oldText = '';
        }
        if (oldText.length > 60000)
        {
            // Remove the first 1000 characters.
            oldText = oldText.substring(1000);
            const n = oldText.indexOf('\n');
            if (n >= 0)
            {
                // Remove up to and including the first \n so the log starts on a whole line
                oldText = oldText.substring(n + 1);
            }
        }

        oldText += '* ';
        oldText += nowTime.toJSON();
        oldText += '\r\n';
        oldText += messageText;
        oldText += '\r\n';
        this.homey.settings.set('diagLog', oldText);
    }

    async getSomething(query)
    {
        this.updateLog(`GET: ${JSON.stringify(query, null, 2)}`);

        if (query && query.cmd)
        {
            if (query.cmd === 'listEvents')
            {
                const eventsList = await this.lwBridge.getLWWebhooks();
                return JSON.stringify(eventsList, null, 2);
            }
            if (query.cmd === 'listHistory')
            {
                let start = '';
                if (query.start)
                {
                    start = query.start;
                }
                const historyList = await this.lwBridge.getLWHistory(start);
                return JSON.stringify(historyList, null, 2);
            }
            if (query.cmd === 'listValues')
            {
                const valueList = await this.lwBridge.getLWValues();
                return valueList;
            }
            if (query.cmd === 'supportBundle')
            {
                const limit = query.limit || 25;
                const supportBundle = this.getSupportBundle(limit);
                return JSON.stringify(supportBundle, null, 2);
            }
        }
        return 'OK';
    }

    async addSomething(body)
    {
        // this.updateLog( "POST: " + JSON.stringify( args, null, 2 ), true );
        this._onWebhookMessage(body);
        return 'OK';
    }

    getDeviceIntiDelay()
    {
        // Limit device initialisation to 1 per second so the API call limit is not reached.
        const secondsNow = (Date.now() / 1000);

        this.deviceInitSeconds++;
        if (this.deviceInitSeconds < secondsNow)
        {
            this.deviceInitSeconds = secondsNow + 1;
            return 1;
        }

        return this.deviceInitSeconds - secondsNow;
    }

    // Send the log to the developer (not applicable to Homey cloud)
    async sendLog(body)
    {
        let tries = 5;

        let logData;
        if (body.logType === 'diag')
        {
            logData = this.homey.settings.get('diagLog');
            if (typeof logData !== 'string')
            {
                logData = '';
            }
        }
        else
        {
            logData = this.homey.settings.get('unsupportedDevices');
            if (!logData)
            {
                throw (new Error('No data to send'));
            }

            logData = this.varToString(logData);
        }

        while (tries-- > 0)
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
                },
);

                // send mail with defined transport object
                const info = await transporter.sendMail(
                {
                    from: `"Homey User" <${Homey.env.MAIL_USER}>`, // sender address
                    to: Homey.env.MAIL_RECIPIENT, // list of receivers
                    subject: `LightWave ${body.logType} log (${Homey.manifest.version})`, // Subject line
                    text: logData, // plain text body
                },
);

                this.updateLog(`Message sent: ${info.messageId}`);
                // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

                // Preview only available when sending through an Ethereal account
                this.log('Preview URL: ', nodemailer.getTestMessageUrl(info));
                return this.homey.__('settings.logSent');
            }
            catch (err)
            {
                this.updateLog(`Send log error: ${err.message}`, 0);
            }
        }

        return (this.homey.__('settings.logSendFailed'));
    }

    varToString(source)
    {
        try
        {
            if (source === null)
            {
                return 'null';
            }
            if (source === undefined)
            {
                return 'undefined';
            }
            if (source instanceof Error)
            {
                const stack = source.stack.replace('/\\n/g', '\n');
                return `${source.message}\n${stack}`;
            }
            if (typeof (source) === 'object')
            {
                const getCircularReplacer = () =>
                {
                    const seen = new WeakSet();
                    return (key, value) =>
                    {
                        if (typeof value === 'object' && value !== null)
                        {
                            if (seen.has(value))
                            {
                                return '';
                            }
                            seen.add(value);
                        }
                        return value;
                    };
                };

                return JSON.stringify(source, getCircularReplacer(), 2);
            }
            if (typeof (source) === 'string')
            {
                return source;
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`VarToString Error: ${err}`, 0);
        }

        return source.toString();
    }

}

module.exports = LightwaveSmartApp;
