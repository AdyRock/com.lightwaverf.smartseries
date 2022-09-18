'use strict';

const Homey = require('homey');

module.exports = class lwthermostat extends Homey.Device
{

    async onInit()
    {
        this.setUnavailable('initialising').catch(this.error);
        try
        {
            this.homey.app.updateLog(`Device initialising( Name: ${this.getName()}, Class: ${this.getClass()})`);

            if (await this.homey.app.getBridge().waitForBridgeReady())
            {
                this.initDevice();
            }
            this.homey.app.updateLog(`Device initialised( Name: ${this.getName()})`);
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} OnInit Error: ${err}`);
        }

        // register a capability listener
        this.registerCapabilityListener('onoff', this.onCapabilityMode.bind(this));
        this.registerCapabilityListener('target_temperature', this.onCapabilityTargetTemperature.bind(this));
    }

    initDevice(extraTime = 0)
    {
        if (this.initDelay == null)
        {
            this.initDelay = this.homey.app.getDeviceIntiDelay();
            this.homey.setTimeout(() => {
                this.doInit();
            }, this.initDelay * 2000 + extraTime);
        }
    }

    async doInit()
    {
        this.homey.app.updateLog(`${this.getName()}: Getting Values`);
        if (await this.getDeviceValues())
        {
            if (await this.registerWebhook())
            {
                this.setAvailable().catch(this.error);
                this.initDelay = null;
                return;
            }
        }

        // Something failed so try again later
        this.initDevice(60000);
    }

    // this method is called when the Homey device has requested a state change (turned on or off)
    async onCapabilityMode(value, opts)
    {
        // Get the device information stored during pairing
        const devData = this.getData();

        // Set the switch Value on the device using the unique feature ID stored during pairing
        this.homey.app.getBridge().setFeatureValue(devData.heatState, value === true ? 1 : 0).catch(this.error);
    }

    // this method is called when the Homey device has requested a dim level change ( 0 to 1)
    async onCapabilityTargetTemperature(value, opts)
    {
        // Homey return a value of 0 to 1 but the real device requires a value of 0 to 100
        value *= 10;

        // Get the device information stored during pairing
        const devData = this.getData();

        // Set the dim Value on the device using the unique feature ID stored during pairing
        this.homey.app.getBridge().setFeatureValue(devData.targetTemperature, value).catch(this.error);
    }

    async registerWebhook()
    {
        try
        {
            const driverId = this.driver.id;
            const data = this.getData();
            const id = `${driverId}_${data.id}`;

            await Promise.all([this.homey.app.getBridge().registerWEBHooks(data.heatState, 'feature', `${id}_heatState`),
                this.homey.app.getBridge().registerWEBHooks(data.rssi, 'feature', `${id}_rssi`),
                this.homey.app.getBridge().registerWEBHooks(data.valveLevel, 'feature', `${id}_valveLevel`),
                this.homey.app.getBridge().registerWEBHooks(data.targetTemperature, 'feature', `${id}_targetTemperature`),
                this.homey.app.getBridge().registerWEBHooks(data.temperature, 'feature', `${id}_temperature`),
            ]);
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} Failed to create webhooks ${err}`);
        }
    }

    async setWebHookValue(capability, value)
    {
        try
        {
            if (capability === 'temperature')
            {
                this.setCapabilityValue('measure_temperature', value / 10).catch(this.error);
            }
            else if (capability === 'targetTemperature')
            {
                this.setCapabilityValue('target_temperature', value / 10).catch(this.error);
            }
            else if (capability === 'heatState')
            {
                this.setCapabilityValue('onoff', value !== 0).catch(this.error);
                if (value === 0)
                {
                    this.setCapabilityValue('target_temperature', null).catch(this.error);
                }
                else
                {
                    // Get the current target temperature Value from the device using the unique feature ID stored during pairing
                    const devData = this.getData();
                    const target = await this.homey.app.getBridge().getFeatureValue(devData.targetTemperature);
                    this.setCapabilityValue('target_temperature', target / 10).catch(this.error);
                }
            }
            else if (capability === 'valveLevel')
            {
                this.setCapabilityValue('alarm_contact', value !== 0).catch(this.error);
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`setWebHookValue error: ${err}`);
        }
    }

    async getDeviceValues()
    {
        this.homey.app.updateLog(`${this.getName()}: Getting Values`, true);
        try
        {
            const devData = this.getData();

            // Get the current mode Value from the device using the unique feature ID stored during pairing
            const mode = await this.homey.app.getBridge().getFeatureValue(devData.heatState);
            this.setCapabilityValue('onoff', mode !== 0).catch(this.error);

            // Get the current temperature Value from the device using the unique feature ID stored during pairing
            const temperature = await this.homey.app.getBridge().getFeatureValue(devData.temperature);
            this.setCapabilityValue('measure_temperature', temperature / 10).catch(this.error);

            if (mode === 0)
            {
                this.setCapabilityValue('target_temperature', null).catch(this.error);
            }
            else
            {
                // Get the current target temperature Value from the device using the unique feature ID stored during pairing
                const target = await this.homey.app.getBridge().getFeatureValue(devData.targetTemperature);
                this.setCapabilityValue('target_temperature', target / 10).catch(this.error);
            }

            // Get the current contact Value from the device using the unique feature ID stored during pairing
            const state = await this.homey.app.getBridge().getFeatureValue(devData.valveLevel);
            this.setCapabilityValue('alarm_contact', state !== 0).catch(this.error);
        }
        catch (err)
        {
            // this.setUnavailable();
            this.homey.app.updateLog(`${this.getName()} getDeviceValues Error ${err}`);
        }
    }

};
