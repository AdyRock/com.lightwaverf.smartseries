'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );
const POLL_INTERVAL = 1000;

var batteryDelay = 0;

module.exports = class lwcontact extends Homey.Device
{
    onInit()
    {
        this.log( 'lwcontact has been inited' );
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
            this.log( "lwcontact Device OnInit Error ", err );
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

            // Get the current switch Value from the device using the unique feature ID stored during pairing
            const onoff = await this.lwBridge.getFeatureValue( devData[ 'windowPosition' ] );
            switch ( onoff )
            {
                case 0:
                    // Device returns 0 for off and 1 for on so convert o false and true
                    this.setAvailable();
                    await this.setCapabilityValue( 'alarm_contact', false );
                    break;

                case 1:
                    await this.setCapabilityValue( 'alarm_contact', true );
                    break;

                default:
                    // Bad response so set as unavailable for now
                    this.setUnavailable();
                    break;
            }

            if ( batteryDelay <= 0 )
            { // Get the battery Value from the device using the unique feature ID stored during pairing
                const battery = await this.lwBridge.getFeatureValue( devData[ 'batteryLevel' ] );
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
				
				// Only get the battery status once per minute
				batteryDelay = 60 / POLL_INTERVAL;
			}
			else
			{
				batteryDelay--;
			}
        }
        catch ( err )
        {
            this.setUnavailable();
            this.log( "lwcontact Device getDeviceValues Error ", err );
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