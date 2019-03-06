'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );
const POLL_INTERVAL = 5000;

module.exports = class lwenergy extends Homey.Device
{

    onInit()
    {
        this.log( 'lwenergy has been inited' );
        try
        {
            this.log( 'Device init( Name:', this.getName(), ', Class:', this.getClass() + ")" );

            this.lwBridge = this.getDriver().lwBridge // Get the LightwaveSmartBridge;

            this.getDeviceValues();

            // Use polling until Lightwave fix the webhooks bug
            this.onPoll = this.onPoll.bind( this );
            this.pollInterval = setInterval( this.onPoll, POLL_INTERVAL );
        }
        catch ( err )
        {
            this.log( "lwenergy Device OnInit Error ", err );
        }
    }

    // Use polling until Lightwave fixe the webhook bug
    async onPoll()
    {
        // Bad response so set as unavailable for now
        this.getDeviceValues();
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
                await this.setCapabilityValue( 'measure_power', power / 1000 );
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

    async onDeleted()
    {
        // Disable the timer for ths device
        clearInterval( this.pollInterval );
        this.getDriver().unregisterWebhook().catch( function( err )
        {
            callback( new Error( "Unregister callback Failed" + err ), [] );
        } );
    }
}

//module.exports = MyDevice;