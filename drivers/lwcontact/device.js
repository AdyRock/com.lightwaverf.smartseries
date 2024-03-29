'use strict';

const Homey = require('homey');

module.exports = class lwcontact extends Homey.Device
{

    async onInit()
    {
        this.setUnavailable('initialising').catch(this.error);
        this.initDelay = null;
        this.initDevice();
    }

    initDevice(extraTime = 0)
    {
        if (this.homey.app.getBridge().isBridgeReady() && this.initDelay == null)
        {
            this.initDelay = this.homey.app.getDeviceIntiDelay();
            this.homey.setTimeout(() => {
                this.doInit();
            }, this.initDelay * 1000 + extraTime);
        }
    }

    async doInit()
    {
        this.homey.app.updateLog(`Device initialising( Name: ${this.getName()}, Class: ${this.getClass()})`);
        if (await this.getDeviceValues())
        {
            if (await this.registerWebhook())
            {
                this.setAvailable().catch(this.error);
                this.initDelay = null;
                this.homey.app.updateLog(`Device initialised( Name: ${this.getName()})`);
                return;
            }
        }

        // Something failed so try again later
        this.homey.app.updateLog(`Device failed to initialise( Name: ${this.getName()}). Retry in 60 seconds.`);
        this.initDevice(60000);
    }

    async registerWebhook()
    {
        try
        {
            const driverId = this.driver.id;
            const data = this.getData();
            const id = `${driverId}_${data.id}`;

            await this.homey.app.getBridge().registerWEBHooks(data.windowPosition, 'feature', `${id}_windowPosition`);
            await this.homey.app.getBridge().registerWEBHooks(data.batteryLevel, 'feature', `${id}_batteryLevel`);
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} Failed to create webhooks${err}`);
            return false;
        }

        return true;
    }

    async setWebHookValue(capability, value)
    {
        if (capability === 'windowPosition')
        {
            this.setCapabilityValue('alarm_contact', (value === 1)).catch(this.error);
        }
        else if (capability === 'batteryLevel')
        {
            this.setCapabilityValue('measure_battery', value).catch(this.error);
        }
    }

    async getDeviceValues(ValueList)
    {
        this.homey.app.updateLog(`${this.getName()}: Getting Values`, true);

        try
        {
            const devData = this.getData();

            // Get the current switch Value from the device using the unique feature ID stored during pairing
            const onoff = await this.homey.app.getBridge().getFeatureValue(devData.windowPosition, ValueList);
            if (typeof onoff === 'number')
            {
                switch (onoff)
                {
                    case 0:
                        // Device returns 0 for off and 1 for on so convert o false and true
                        this.setCapabilityValue('alarm_contact', false).catch(this.error);
                        break;

                    case 1:
                        this.setCapabilityValue('alarm_contact', true).catch(this.error);
                        break;

                    default:
                        // Bad response so set as unavailable for now
                        // this.setUnavailable();
                        break;
                }
            }

            const battery = await this.homey.app.getBridge().getFeatureValue(devData.batteryLevel);
            if (typeof battery === 'number')
            {
                if (battery >= 0)
                {
                    this.setCapabilityValue('measure_battery', battery).catch(this.error);
                }
                else
                {
                    // Bad response so set as unavailable for now
                    // this.setUnavailable();
                }
            }
            return true;
        }
        catch (err)
        {
            // this.setUnavailable();
            this.homey.app.updateLog(`lwcontact Device getDeviceValues Error ${err}`);
        }

        return false;
    }

};

// module.exports = MyDevice;
