'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = class lwenergy extends Homey.Device
{

    async onInit()
    {
        try
        {
            this.log( 'Device init( Name:', this.getName(), ', Class:', this.getClass() + ")" );

            //this.lwBridge = this.getDriver().lwBridge // Get the LightwaveSmartBridge;
            this.lwBridge = new LightwaveSmartBridge();
            if ( await this.lwBridge.waitForBridgeReady() )
            {
                this.initDevice();
            }
        }
        catch ( err )
        {
            this.log( "lwenergy Device OnInit Error ", err );
        }
    }

    initDevice()
    {
        this.log( this.getName(), ': Getting Values' );
        this.getDeviceValues();
        this.registerWebhook();

    }

    async registerWebhook()
    {
        try
        {
            this.log( this.getName(), ': Registering LW WebHooks' );

            let driverId = this.getDriver().id;
            let data = this.getData();
            let id = driverId + "_" + data.id;

            this.log( 'registering WEBHook: ', data.power, id );
            this.log( 'registering WEBHook: ', data.energy, id );
            await Promise.all( [ this.lwBridge.registerWEBHooks( data.power, 'feature', id + '_power' ),
                this.lwBridge.registerWEBHooks( data.energy, 'feature', id + '_energy' )
            ] );
        }
        catch ( err )
        {
            this.log( "Failed to create webhooks", err );
        }
    }

    async setWebHookValue( capability, value )
    {
        try
        {
            if ( capability == "power" )
            {
                await this.setCapabilityValue( 'measure_power', value );
                this.setAvailable();
            }
            else if ( capability == "energy" )
            {
                await this.setCapabilityValue( 'meter_power', value / 1000 );
                this.setAvailable();
            }
        }
        catch ( err )
        {

        }
    }

    async getDeviceValues()
    {
        try
        {
            const devData = this.getData();
            //console.log( devData );

            // Get the current power Value from the device using the unique feature ID stored during pairing
            const power = await this.lwBridge.getFeatureValue( devData[ 'power' ] );
            if ( power >= 0 )
            {
                this.setAvailable();
                await this.setCapabilityValue( 'measure_power', power );
            }

            // Get the current power Value from the device using the unique feature ID stored during pairing
            const energy = await this.lwBridge.getFeatureValue( devData[ 'energy' ] );
            if ( energy >= 0 )
            {
                this.setAvailable();
                await this.setCapabilityValue( 'meter_power', energy / 1000 );
            }
        }
        catch ( err )
        {
            this.setUnavailable();
            this.log( "lwenergy Device getDeviceValues Error ", err );
        }
    }

    async onDeleted() {}
}

//module.exports = MyDevice;