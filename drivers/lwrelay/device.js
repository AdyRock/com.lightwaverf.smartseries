'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );
module.exports = class lwrelay extends Homey.Device
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
        this.registerCapabilityListener( 'onoff', this.onCapabilityOnoff.bind( this ) );
        this.registerCapabilityListener( 'windowcoverings_state', this.onCapabilityOpenCloseStop.bind( this ) );
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
                //this.setAvailable();
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            Homey.app.updateLog( this.getName() + " onCapabilityOnoff Error " + err );
        }
    }

    // this method is called when the Homey device has requested a state change (Open / Close / Stop)
    async onCapabilityOpenCloseStop( value, opts )
    {
        var result = "";
        //console.log( "onCapabilityOpenCloseStop: Value = ", value );

        try
        {
            // Get the device information stored during pairing
            const devData = this.getData();

            // The device requires '0' for off and '1' for on
            var data = '0';
            if ( value == "up" )
            {
                data = '1';
            }
            if ( value == "down" )
            {
                data = '2';
            }

            // Set the switch Value on the device using the unique feature ID stored during pairing
            result = await Homey.app.getBridge().setFeatureValue( devData.threeWayRelay, data );
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
            Homey.app.updateLog( this.getName() + " onCapabilityOpenCloseStop Error " + err );
        }
    }

    async registerWebhook()
    {
        try
        {
            let driverId = this.getDriver().id;
            let data = this.getData();
            let id = driverId + "_" + data.id;

            if ( data.switch )
            {
                await Promise.all( [ Homey.app.getBridge().registerWEBHooks( data.switch, 'feature', id + '_switch' ) ] );
            }
            else if ( data.threeWayRelay )
            {
                await Promise.all( [ Homey.app.getBridge().registerWEBHooks( data.threeWayRelay, 'feature', id + '_threeWayRelay' ) ] );
            }
        }
        catch ( err )
        {
            Homey.app.updateLog( this.getName() + " Failed to create webhooks " + err );
        }
    }

    async setWebHookValue( capability, value )
    {
        //console.log( "setWebHookValue: Capability = ", capability, " Value = ", value );
        try
        {
            if ( capability == "switch" )
            {
                await this.setCapabilityValue( 'onoff', ( value == 1 ) );
                //this.setAvailable();
            }
            else if ( capability == "threeWayRelay" )
            {
                var data = "idle";
                if ( value == 1 )
                {
                    data = "up";
                }
                else if ( value == 2 )
                {
                    data = "down";
                }
                await this.setCapabilityValue( 'windowcoverings_state', data );
                //this.setAvailable();
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

            if ( devData[ 'switch' ] )
            {
                // Get the current switch Value from the device using the unique feature ID stored during pairing
                const onoff = await Homey.app.getBridge().getFeatureValue( devData[ 'switch' ], ValueList );
                switch ( onoff )
                {
                    case 0:
                        // Device returns 0 for off and 1 for on so convert o false and true
                        //this.setAvailable();
                        await this.setCapabilityValue( 'onoff', false );
                        break;

                    case 1:
                        //this.setAvailable();
                        await this.setCapabilityValue( 'onoff', true );
                        break;

                    default:
                        // Bad response so set as unavailable for now
                        //this.setUnavailable();
                        break;
                }
            }
            else if ( devData.threeWayRelay )
            {
                const oci = await Homey.app.getBridge().getFeatureValue( devData.threeWayRelay, ValueList );
                if ( oci == "0" )
                {
                    //this.setAvailable();
                    await this.setCapabilityValue( 'windowcoverings_state', "idle" );
                }
                else if ( oci == "1" )
                {
                    //this.setAvailable();
                    await this.setCapabilityValue( 'windowcoverings_state', "up" );
                }
                else
                {
                    //this.setAvailable();
                    await this.setCapabilityValue( 'windowcoverings_state', "down" );
                }

            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            Homey.app.updateLog( this.getName() + " getDeviceValues Error " + err );
        }
    }

    async onDeleted()
    {}
};

//module.exports = MyDevice;