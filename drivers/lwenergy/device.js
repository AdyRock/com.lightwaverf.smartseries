'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

const POLL_INTERVAL = 30000;

module.exports = class lwenergy extends Homey.Device
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
        this.homey.app.updateLog( this.getName() + ': Getting Values' );
        this.getEnergyValues();
        this.registerWebhook();
    }

    async registerWebhook()
    {
        try
        {
            let driverId = this.driver.id;
            let data = this.getData();
            let id = driverId + "_" + data.id;

            await Promise.all( [ this.homey.app.getBridge().registerWEBHooks( data.power, 'feature', id + '_power' ),
                this.homey.app.getBridge().registerWEBHooks( data.energy, 'feature', id + '_energy' )
            ] );
        }
        catch ( err )
        {
            this.homey.app.updateLog( this.getName() + " Failed to create webhooks " + err );
        }
    }

    async setWebHookValue( capability, value )
    {
        try
        {
            if ( capability == "power" )
            {
                await this.setCapabilityValue( 'measure_power', value );
                //this.setAvailable();
            }
            else if ( capability == "energy" )
            {
                await this.setCapabilityValue( 'meter_power', value / 1000 );
                //this.setAvailable();
            }
        }
        catch ( err )
        {

        }
    }

    async getEnergyValues( ValueList )
    {
        this.homey.app.updateLog( this.getName() + ': Getting Energy', true );

        try
        {
            const devData = this.getData();
            //console.log( devData );

            // Get the current power Value from the device using the unique feature ID stored during pairing
            const power = await this.homey.app.getBridge().getFeatureValue( devData.power, ValueList );
            if ( power >= 0 )
            {
                //this.setAvailable();
                await this.setCapabilityValue( 'measure_power', power );
            }

            // Get the current power Value from the device using the unique feature ID stored during pairing
            const energy = await this.homey.app.getBridge().getFeatureValue( devData.energy );
            if ( energy >= 0 )
            {
                //this.setAvailable();
                await this.setCapabilityValue( 'meter_power', energy / 1000 );
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            this.homey.app.updateLog( this.getName() + " getDeviceValues Error " + err );
        }
    }

    async onDeleted()
    {}
};

//module.exports = MyDevice;