'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = class lwcontact extends Homey.Device
{
    async onInit()
    {
        try
        {
            this.homey.app.updateLog( 'Device initialising( Name: ' + this.getName() + ', Class: ' + this.getClass() + ")" );

            if ( await this.homey.app.getBridge().waitForBridgeReady() )
            {
                this.initDevice();
            }
            this.homey.app.updateLog( 'Device initialised( Name: ' + this.getName() + ")" );
        }
        catch ( err )
        {
            this.homey.app.updateLog( this.getName() + " OnInit Error: " + err );
        }
    }

    initDevice()
    {
        this.getDeviceValues();
        this.registerWebhook();
    }

    async registerWebhook()
    {
        try
        {
            let driverId = this.driver.id;
            let data = this.getData();
            let id = driverId + "_" + data.id;

            await Promise.all( [ this.homey.app.getBridge().registerWEBHooks( data.windowPosition, 'feature', id + '_windowPosition' ),
            this.homey.app.getBridge().registerWEBHooks( data.buttonPress, 'feature', id + '_buttonPress' ),
            this.homey.app.getBridge().registerWEBHooks( data.batteryLevel, 'feature', id + '_batteryLevel' )
            ] );
        }
        catch ( err )
        {
            this.homey.app.updateLog( this.getName() + " Failed to create webhooks" + err );
        }
    }

    async setWebHookValue( capability, value )
    {
        try
        {
            if ( capability == "windowPosition" )
            {
                await this.setCapabilityValue( 'alarm_contact', ( value == 1 ) );
                //this.setAvailable();
            }
            else if ( capability == "buttonPress" )
            {
                await this.setCapabilityValue( 'alarm_generic', ( value == 1 ) );
                //this.setAvailable();
            }
            else if ( capability == "batteryLevel" )
            {
                await this.setCapabilityValue( 'measure_battery', value );
                //this.setAvailable();
            }
        }
        catch ( err )
        {

        }
    }

    async getDeviceValues( ValueList )
    {
        this.homey.app.updateLog( this.getName() + ': Getting Values', true );

        try
        {
            const devData = this.getData();

            // Get the current switch Value from the device using the unique feature ID stored during pairing
            const onoff = await this.homey.app.getBridge().getFeatureValue( devData.windowPosition, ValueList );
            if ( typeof onoff == 'number' )
            {
                switch ( onoff )
                {
                    case 0:
                        // Device returns 0 for off and 1 for on so convert o false and true
                        //this.setAvailable();
                        await this.setCapabilityValue( 'alarm_contact', false );
                        break;

                    case 1:
                        //this.setAvailable();
                        await this.setCapabilityValue( 'alarm_contact', true );
                        break;

                    default:
                        // Bad response so set as unavailable for now
                        //this.setUnavailable();
                        break;
                }
            }

            const battery = await this.homey.app.getBridge().getFeatureValue( devData.batteryLevel );
            if ( typeof battery == 'number' )
            {
                if ( battery >= 0 )
                {
                    //this.setAvailable();
                    await this.setCapabilityValue( 'measure_battery', battery );
                }
                else
                {
                    // Bad response so set as unavailable for now
                    //this.setUnavailable();
                }
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            this.homey.app.updateLog( "lwcontact Device getDeviceValues Error " + err );
        }
    }

    async onDeleted() {}
};

//module.exports = MyDevice;