'use strict';

const Homey = require('homey');

module.exports = class lwmotion extends Homey.Device
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

            await this.homey.app.getBridge().registerWEBHooks(data.movement, 'feature', `${id}_movement`);
            await this.homey.app.getBridge().registerWEBHooks(data.lightLevel, 'feature', `${id}_lightLevel`);
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
        if (capability === 'movement')
        {
            this.setCapabilityValue('alarm_motion', (value === 1)).catch(this.error);
        }
        else if (capability === 'lightLevel')
        {
            this.setCapabilityValue('measure_lightLevel', value).catch(this.error);
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
            const onoff = await this.homey.app.getBridge().getFeatureValue(devData.movement, ValueList);
            if (typeof onoff === 'number')
            {
                switch (onoff)
                {
                    case 0:
                        // Device returns 0 for off and 1 for on so convert o false and true
                        this.setCapabilityValue('alarm_motion', false).catch(this.error);
                        break;

                    case 1:
                        this.setCapabilityValue('alarm_motion', true).catch(this.error);
                        break;

                    default:
                        // Bad response so set as unavailable for now
                        // this.setUnavailable();
                        break;
                }
            }

            const light = await this.homey.app.getBridge().getFeatureValue(devData.lightLevel);
            if (typeof light === 'number')
            {
                if (light >= 0)
                {
                    this.setCapabilityValue('measure_lightLevel', light).catch(this.error);
                }
                else
                {
                    // Bad response so set as unavailable for now
                    // this.setUnavailable();
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
            this.homey.app.updateLog(`lwmotion Device getDeviceValues Error ${err}`);
        }

        return false;
    }

};

// module.exports = MyDevice;
