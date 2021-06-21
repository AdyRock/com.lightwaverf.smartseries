'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = class lwremote extends Homey.Device
{
    async onInit()
    {
        try
        {
            Homey.app.updateLog( 'Device initialising( Name: ' + this.getName() + ', Class: ' + this.getClass() + ")" );

            if ( await Homey.app.getBridge().waitForBridgeReady() )
            {
                this.initDevice();
            }
            Homey.app.updateLog( 'Device initialised( Name: ' + this.getName() + ")" );
        }
        catch ( err )
        {
            Homey.app.updateLog( this.getName() + " OnInit Error: " + err );
        }
    }

    initDevice()
    {
        this.registerWebhook();
    }

    async registerWebhook()
    {
        try
        {
            let driverId = this.getDriver().id;
            let data = this.getData();
            let id = driverId + "_" + data.id;

            await Promise.all( [ Homey.app.getBridge().registerWEBHooks( data.buttonPress, 'feature', id + '_buttonPress' ) ] );
        }
        catch ( err )
        {
            Homey.app.updateLog( this.getName() + " Failed to create webhooks" + err );
        }
    }

    async setWebHookValue( capability, value )
    {
        try
        {
			Homey.app.updateLog( 'Button Pressed: ' + capability + ": " + this.getName(), true );
            if ( capability == "buttonPress" )
            {
				await this.setCapabilityValue( 'alarm_generic', true );
				this.setAvailable();
				await new Promise( resolve => setTimeout( resolve, 1000 ) );
                await this.setCapabilityValue( 'alarm_generic', false );
            }
        }
        catch ( err )
        {

		}
		this.triggered = false;
    }

    async onDeleted() {}
};

// module.exports = MyDevice;