'use strict';

const Homey = require('homey');

module.exports = class lwrelay extends Homey.Device
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
        this.registerCapabilityListener('onoff', this.onCapabilityOnoff.bind(this));
        this.registerCapabilityListener('windowcoverings_state', this.onCapabilityOpenCloseStop.bind(this));
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
    async onCapabilityOnoff(value, opts)
    {
        try
        {
            // Get the device information stored during pairing
            const devData = this.getData();

            // The device requires '0' for off and '1' for on
            let data = '0';
            if (value)
            {
                data = '1';
            }

            // Set the switch Value on the device using the unique feature ID stored during pairing
            this.homey.app.getBridge().setFeatureValue(devData['switch'], data).catch(this.error);
        }
        catch (err)
        {
            // this.setUnavailable();
            this.homey.app.updateLog(`${this.getName()} onCapabilityOnoff Error ${err}`);
        }
    }

    // this method is called when the Homey device has requested a state change (Open / Close / Stop)
    async onCapabilityOpenCloseStop(value, opts)
    {
        // Get the device information stored during pairing
        const devData = this.getData();

        // The device requires '0' for off and '1' for on
        let data = '0';
        if (value === 'up')
        {
            data = '1';
        }
        else if (value === 'down')
        {
            data = '2';
        }

        // Set the switch Value on the device using the unique feature ID stored during pairing
        this.homey.app.getBridge().setFeatureValue(devData.threeWayRelay, data).catch(this.error);
    }

    async registerWebhook()
    {
        try
        {
            const driverId = this.driver.id;
            const data = this.getData();
            const id = `${driverId}_${data.id}`;

            if (data.switch)
            {
                await Promise.all([this.homey.app.getBridge().registerWEBHooks(data.switch, 'feature', `${id}_switch`)]);
            }
            else if (data.threeWayRelay)
            {
                await Promise.all([this.homey.app.getBridge().registerWEBHooks(data.threeWayRelay, 'feature', `${id}_threeWayRelay`)]);
            }
        }
        catch (err)
        {
            this.homey.app.updateLog(`${this.getName()} Failed to create webhooks ${err}`);
        }
    }

    async setWebHookValue(capability, value)
    {
        if (capability === 'switch')
        {
            this.setCapabilityValue('onoff', (value === 1)).catch(this.error);
        }
        else if (capability === 'threeWayRelay')
        {
            let data = 'idle';
            if (value === 1)
            {
                data = 'up';
            }
            else if (value === 2)
            {
                data = 'down';
            }
            this.setCapabilityValue('windowcoverings_state', data).catch(this.error);
        }
    }

    async getDeviceValues(ValueList)
    {
        this.homey.app.updateLog(`${this.getName()}: Getting Values`, true);

        try
        {
            const devData = this.getData();
            // console.log( devData );

            if (devData['switch'])
            {
                // Get the current switch Value from the device using the unique feature ID stored during pairing
                const onoff = await this.homey.app.getBridge().getFeatureValue(devData['switch'], ValueList);
                switch (onoff)
                {
                    case 0:
                        // Device returns 0 for off and 1 for on so convert o false and true
                        this.setCapabilityValue('onoff', false).catch(this.error);
                        break;

                    case 1:
                        this.setCapabilityValue('onoff', true).catch(this.error);
                        break;

                    default:
                        // Bad response so set as unavailable for now
                        // this.setUnavailable();
                        break;
                }
            }
            else if (devData.threeWayRelay)
            {
                const oci = await this.homey.app.getBridge().getFeatureValue(devData.threeWayRelay, ValueList);
                if (oci === '0')
                {
                    this.setCapabilityValue('windowcoverings_state', 'idle').catch(this.error);
                }
                else if (oci === '1')
                {
                    this.setCapabilityValue('windowcoverings_state', 'up').catch(this.error);
                }
                else
                {
                    this.setCapabilityValue('windowcoverings_state', 'down').catch(this.error);
                }
            }
        }
        catch (err)
        {
            // this.setUnavailable();
            this.homey.app.updateLog(`${this.getName()} getDeviceValues Error ${err}`);
        }
    }

};

// module.exports = MyDevice;
