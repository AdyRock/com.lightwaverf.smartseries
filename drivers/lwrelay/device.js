'use strict';

const Homey = require('homey');
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );
const POLL_INTERVAL = 10000;

module.exports = class lwrelay extends Homey.Device {
	
	onInit() {
        try
        {
            this.log( 'Device init( Name:', this.getName(), ', Class:', this.getClass() + ")" );

            this.lwBridge = this.getDriver().lwBridge // Get the LightwaveSmartBridge;

            this.getDeviceValues();

            // register a capability listener
            this.registerCapabilityListener( 'onoff', this.onCapabilityOnoff.bind( this ) );

            // Use polling until Lightwave fix the webhooks bug
            this.onPoll = this.onPoll.bind( this );
            this.pollInterval = setInterval( this.onPoll, POLL_INTERVAL );
        }
        catch ( err )
        {
            this.log( "lwrelays Device OnInit Error ", err );
        }
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

            // this.log('Switching ', devData['switch'], " to ", data);

            // Set the switch Value on the device using the unique feature ID stored during pairing
            result = await this.lwBridge.setFeatureValue( devData[ 'switch' ], data );
            if ( result == -1 )
            {
                this.setUnavailable();
            }
            else
            {
                this.setAvailable();
            }
        }
        catch ( err )
        {
            this.setUnavailable();
            this.log( "lwrelays Device onCapabilityOnoff Error ", err );
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
            const onoff = await this.lwBridge.getFeatureValue( devData[ 'switch' ] );
            switch ( onoff )
            {
                case 0:
                    // Device returns 0 for off and 1 for on so convert o false and true
                    this.setAvailable();
                    await this.setCapabilityValue( 'onoff', false );
                    break;

                case 1:
                    await this.setCapabilityValue( 'onoff', true );
                    break;

                default:
                    // Bad response so set as unavailable for now
                    this.setUnavailable();
                    break;
            }
        }
        catch ( err )
        {
            this.setUnavailable();
            this.log( "lwrelays Device getDeviceValues Error ", err );
        }
    }

    async onDeleted()
    {
        // Disable the timer for ths device
        clearInterval( this.pollInterval );
        this.getDriver().unregisterWebhook();
    }
	
}

//module.exports = MyDevice;