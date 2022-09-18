'use strict';

const Homey = require('homey');

module.exports = class lwremote extends Homey.Device
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
        if (await this.registerWebhook())
        {
            this.setAvailable().catch(this.error);
            this.initDelay = null;
            return;
        }

        // Something failed so try again later
        this.initDevice(60000);
    }

    async registerWebhook()
    {
        try
        {
            const driverId = this.driver.id;
            const data = this.getData();
            const id = `${driverId}_${data.id}`;

            await Promise.all([this.homey.app.getBridge().registerWEBHooks(data.buttonPress, 'feature', `${id}_buttonPress`)]);
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} Failed to create webhooks${err}`);
        }
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
