'use strict';

const Homey = require('homey');

module.exports = class lwenergy extends Homey.Device
{

    async onInit()
    {
        this.setUnavailable('initialising').catch(this.error);
        this.initDelay = null;
        this.initDevice();
    }

    initDevice(extraTime = 0)
    {
        if (this.initDelay == null)
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
        this.homey.app.updateLog(`${this.getName()}: Getting Values`);
        if (await this.getEnergyValues())
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

            await this.homey.app.getBridge().registerWEBHooks(data.power, 'feature', `${id}_power`);
            await this.homey.app.getBridge().registerWEBHooks(data.energy, 'feature', `${id}_energy`);
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} Failed to create webhooks ${err}`);
            return false;
        }

        return true;
    }

    async setWebHookValue(capability, value)
    {
        try
        {
            if (capability === 'power')
            {
                this.setCapabilityValue('measure_power', value).catch(this.error);
            }
            else if (capability === 'energy')
            {
                this.setCapabilityValue('meter_power', value / 1000).catch(this.error);
            }
        }
        catch (err)
        {

        }
    }

    async getEnergyValues(ValueList)
    {
        this.homey.app.updateLog(`${this.getName()}: Getting Energy`, true);

        try
        {
            const devData = this.getData();
            // console.log( devData );

            // Get the current power Value from the device using the unique feature ID stored during pairing
            const power = await this.homey.app.getBridge().getFeatureValue(devData.power, ValueList);
            if (power >= 0)
            {
                this.setCapabilityValue('measure_power', power).catch(this.error);
            }

            // Get the current power Value from the device using the unique feature ID stored during pairing
            const energy = await this.homey.app.getBridge().getFeatureValue(devData.energy);
            if (energy >= 0)
            {
                this.setCapabilityValue('meter_power', energy / 1000).catch(this.error);
            }
        }
        catch (err)
        {
            // this.setUnavailable();
            this.homey.app.updateLog(`${this.getName()} getDeviceValues Error ${err}`);
            return false;
        }

        return true;
    }

};

// module.exports = MyDevice;
