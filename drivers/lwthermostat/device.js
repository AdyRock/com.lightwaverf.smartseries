'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = class lwthermostat extends Homey.Device
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

        // register a capability listener
        this.registerCapabilityListener( 'onoff', this.onCapabilityMode.bind( this ) );
        this.registerCapabilityListener( 'target_temperature', this.onCapabilityTargetTemperature.bind( this ) );

    }

    initDevice()
    {
        this.getDeviceValues();
        this.registerWebhook();
    }

    // this method is called when the Homey device has requested a state change (turned on or off)
    async onCapabilityMode( value, opts )
    {
        var result = "";

        try
        {
            // Get the device information stored during pairing
            const devData = this.getData();

            // Set the switch Value on the device using the unique feature ID stored during pairing
            result = await Homey.app.getBridge().setFeatureValue( devData[ 'heatState' ], value == true ? 1 : 0 );
            if ( result == -1 )
            {
                //this.setUnavailable();
            }
            else
            {
                //this.setAvailable();
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            Homey.app.updateLog( this.getName() + " onCapabilityMode Error "+ err );
        }
    }

    // this method is called when the Homey device has requested a dim level change ( 0 to 1)
    async onCapabilityTargetTemperature( value, opts )
    {
        var result = "";

        try
        {
            // Homey return a value of 0 to 1 but the real device requires a value of 0 to 100
            value *= 10;

            // Get the device information stored during pairing
            const devData = this.getData();

            // Set the dim Value on the device using the unique feature ID stored during pairing
            result = await Homey.app.getBridge().setFeatureValue( devData[ 'targetTemperature' ], value );
            if ( result == -1 )
            {
                //this.setUnavailable();
            }
            else
            {
                //this.setAvailable();
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            Homey.app.updateLog( this.getName() + " onCapabilityTargetTemperature " + err );
        }
    }

    async registerWebhook()
    {
        try
        {
            let driverId = this.getDriver().id;
            let data = this.getData();
            let id = driverId + "_" + data.id;

            await Promise.all( [ Homey.app.getBridge().registerWEBHooks( data.heatState, 'feature', id + '_heatState' ),
                Homey.app.getBridge().registerWEBHooks( data.rssi, 'feature', id + '_rssi' ),
                Homey.app.getBridge().registerWEBHooks( data.valveLevel, 'feature', id + '_valveLevel' ),
                Homey.app.getBridge().registerWEBHooks( data.targetTemperature, 'feature', id + '_targetTemperature' ),
                Homey.app.getBridge().registerWEBHooks( data.temperature, 'feature', id + '_temperature' )
            ] );
        }
        catch ( err )
        {
            Homey.app.updateLog( this.getName() + " Failed to create webhooks " + err );
        }
    }

    async setWebHookValue( capability, value )
    {
        try
        {
            if ( capability == "temperature" )
            {
                await this.setCapabilityValue( 'measure_temperature', value / 10 );
                //this.setAvailable();
            }
            else if ( capability == "targetTemperature" )
            {
                await this.setCapabilityValue( 'target_temperature', value / 10 );
                //this.setAvailable();
            }
            else if ( capability == "heatState" )
            {
                await this.setCapabilityValue( 'onoff', value == 0 ? false : true );
                if ( value == 0 )
                {
                    await this.setCapabilityValue( 'target_temperature', null );
                }
                else
                {
                    // Get the current target temperature Value from the device using the unique feature ID stored during pairing
                    const devData = this.getData();
                    const target = await Homey.app.getBridge().getFeatureValue( devData[ 'targetTemperature' ] );
                    await this.setCapabilityValue( 'target_temperature', target / 10 );
                }
                //this.setAvailable();
            }
            else if ( capability == "valveLevel" )
            {
                await this.setCapabilityValue( 'alarm_contact', value == 0 ? false : true );
                //this.setAvailable();
            }
        }
        catch ( err )
        {
            Homey.app.updateLog( "setWebHookValue error: " + err );
        }
    }

    async getDeviceValues()
    {
        Homey.app.updateLog( this.getName() + ': Getting Values', true );
        try
        {
            const devData = this.getData();

            // Get the current mode Value from the device using the unique feature ID stored during pairing
            const mode = await Homey.app.getBridge().getFeatureValue( devData[ 'heatState' ] );
            await this.setCapabilityValue( 'onoff', mode == 0 ? false : true );

            // Get the current temperature Value from the device using the unique feature ID stored during pairing
            const temperature = await Homey.app.getBridge().getFeatureValue( devData[ 'temperature' ] );
            await this.setCapabilityValue( 'measure_temperature', temperature / 10 );

            if ( mode == 0 )
            {
                await this.setCapabilityValue( 'target_temperature', null );
            }
            else
            {
                // Get the current target temperature Value from the device using the unique feature ID stored during pairing
                const target = await Homey.app.getBridge().getFeatureValue( devData[ 'targetTemperature' ] );
                await this.setCapabilityValue( 'target_temperature', target / 10 );
            }

            // Get the current contact Value from the device using the unique feature ID stored during pairing
            const state = await Homey.app.getBridge().getFeatureValue( devData[ 'valveLevel' ] );
            await this.setCapabilityValue( 'alarm_contact', state == 0 ? false : true );
        }
        catch ( err )
        {
            //this.setUnavailable();
            Homey.app.updateLog( this.getName() + " getDeviceValues Error " + err );
        }
    }

    async onDeleted() {}
}