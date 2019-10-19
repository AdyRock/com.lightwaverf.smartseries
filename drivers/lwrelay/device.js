'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );
module.exports = class lwrelay extends Homey.Device
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

        // register a capability listener
        this.registerCapabilityListener( 'onoff', this.onCapabilityOnoff.bind( this ) );
    }

    initDevice()
    {
        Homey.app.updateLog( this.getName() + ': Getting Values' );
        this.getDeviceValues();
        this.registerWebhook();
    }

    // this method is called when the Homey device has requested a state change (turned on or off)
    async onCapabilityOnoff( value, opts )
    {
        var result = "";

        try
        {
            // Get the device information stored during pairing
            const devData = this.getData();

            // The device requires '0' for off and '1' for on
            var data = '0';
            if ( value )
            {
                data = '1';
            }

            // Set the switch Value on the device using the unique feature ID stored during pairing
            result = await Homey.app.getBridge().setFeatureValue( devData[ 'switch' ], data );
            if ( result == -1 )
            {
                //this.setUnavailable();
            }
            else
            {
                this.setAvailable();
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            Homey.app.updateLog( this.getName() + " onCapabilityOnoff Error " + err );
        }
    }

    async registerWebhook()
    {
        try
        {
            let driverId = this.getDriver().id;
            let data = this.getData();
            let id = driverId + "_" + data.id;

            await Promise.all( [ Homey.app.getBridge().registerWEBHooks( data.switch, 'feature', id + '_switch' ) ] );
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
            if ( capability == "switch" )
            {
                await this.setCapabilityValue( 'onoff', ( value == 1 ) );
                this.setAvailable();
            }
        }
        catch ( err )
        {

        }
    }

    async getDeviceValues( ValueList )
    {
        Homey.app.updateLog( this.getName() + ': Getting Values', true );

        try
        {
            const devData = this.getData();
            //console.log( devData );

            // Get the current switch Value from the device using the unique feature ID stored during pairing
            const onoff = await Homey.app.getBridge().getFeatureValue( devData[ 'switch' ], ValueList );
            switch ( onoff )
            {
                case 0:
                    // Device returns 0 for off and 1 for on so convert o false and true
                    this.setAvailable();
                    await this.setCapabilityValue( 'onoff', false );
                    break;

                case 1:
                    this.setAvailable();
                    await this.setCapabilityValue( 'onoff', true );
                    break;

                default:
                    // Bad response so set as unavailable for now
                    //this.setUnavailable();
                    break;
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            Homey.app.updateLog( this.getName() + " getDeviceValues Error " + err );
        }
    }

    async onDeleted()
    {
    }
}

//module.exports = MyDevice;