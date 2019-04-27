'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = class lwcontact extends Homey.Device
{
    async onInit()
    {
        try
        {
            Homey.app.updateLog( 'Device initialising( Name: ' + this.getName() + ', Class: ' +  this.getClass() + ")" );

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
        Homey.app.updateLog( this.getName() + ': Getting Values' );
        this.getDeviceValues();
        this.registerWebhook();
    }

    async registerWebhook()
    {
        try
        {
            let driverId = this.getDriver().id;
            let data = this.getData();
            let id = driverId + "_" + data.id;

            await Promise.all( [ Homey.app.getBridge().registerWEBHooks( data.windowPosition, 'feature', id + '_windowPosition' ),
            Homey.app.getBridge().registerWEBHooks( data.batteryLevel, 'feature', id + '_batteryLevel' )
            ] );
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
            if ( capability == "windowPosition" )
            {
                await this.setCapabilityValue( 'alarm_contact', ( value == 1 ) );
                this.setAvailable();
            }
            else if ( capability == "batteryLevel" )
            {
                await this.setCapabilityValue( 'measure_battery', value );
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

            // Get the current switch Value from the device using the unique feature ID stored during pairing
            const onoff = await Homey.app.getBridge().getFeatureValue( devData[ 'windowPosition' ] );
            switch ( onoff )
            {
                case 0:
                    // Device returns 0 for off and 1 for on so convert o false and true
                    this.setAvailable();
                    await this.setCapabilityValue( 'alarm_contact', false );
                    break;

                case 1:
                    this.setAvailable();
                    await this.setCapabilityValue( 'alarm_contact', true );
                    break;

                default:
                    // Bad response so set as unavailable for now
                    this.setUnavailable();
                    break;
            }

            const battery = await Homey.app.getBridge().getFeatureValue( devData[ 'batteryLevel' ] );
            if ( battery >= 0 )
            {
                this.setAvailable();
                await this.setCapabilityValue( 'measure_battery', battery );
            }
            else
            {
                // Bad response so set as unavailable for now
                this.setUnavailable();
            }
        }
        catch ( err )
        {
            this.setUnavailable();
            Homey.app.updateLog( "lwcontact Device getDeviceValues Error " + err );
        }
    }

    async onDeleted() {}

}

//module.exports = MyDevice;