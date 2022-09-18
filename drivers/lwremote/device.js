'use strict';

const Homey = require('homey');

module.exports = class lwremote extends Homey.Device
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
        if (await this.registerWebhook())
        {
            this.setAvailable().catch(this.error);
            this.initDelay = null;
            this.homey.app.updateLog(`Device initialised( Name: ${this.getName()})`);
            return;
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

            await this.homey.app.getBridge().registerWEBHooks(data.buttonPress, 'feature', `${id}_buttonPress`);
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
        try
        {
            this.homey.app.updateLog(`Button Pressed: ${capability}: ${this.getName()}`, true);
            if (capability === 'buttonPress')
            {
                this.setCapabilityValue('alarm_generic', true).catch(this.error);
                this.setAvailable();
                await new Promise(resolve => this.homey.setTimeout(resolve, 1000));
                this.setCapabilityValue('alarm_generic', false).catch(this.error);
            }
        }
        catch (err)
        {

        }
        this.triggered = false;
    }

};

// module.exports = MyDevice;
