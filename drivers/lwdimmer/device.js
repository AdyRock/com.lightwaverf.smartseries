'use strict';

const Homey = require( 'homey' );
const LightwaveSmartBridge = require( '../../lib/LightwaveSmartBridge' );

module.exports = class lwdimmer extends Homey.Device
{
    // this method is called when the Device is inited
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
        this.registerCapabilityListener( 'dim', this.onCapabilityDim.bind( this ) );
    }

    initDevice()
    {
        this.getDeviceValues();
        this.getEnergyValues();
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
            Homey.app.updateLog( this.getName() + " onCapabilityOnoff Error ", err );
        }
    }

    // this method is called when the Homey device has requested a dim level change ( 0 to 1)
    async onCapabilityDim( value, opts )
    {
        var result = "";

        try
        {
            // Homey return a value of 0 to 1 but the real device requires a value of 0 to 100
            value *= 100;

            // Get the device information stored during pairing
            const devData = this.getData();

            // Set the dim Value on the device using the unique feature ID stored during pairing
            result = await Homey.app.getBridge().setFeatureValue( devData[ 'dimLevel' ], value );
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
            Homey.app.updateLog( this.getName() + " onCapabilityOnDimError ", err );
        }
    }

    async registerWebhook()
    {
        try
        {
            let driverId = this.getDriver().id;
            let data = this.getData();
            let id = driverId + "_" + data.id;

            await Promise.all( [ Homey.app.getBridge().registerWEBHooks( data.switch, 'feature', id + '_switch' ),
                Homey.app.getBridge().registerWEBHooks( data.dimLevel, 'feature', id + '_dimLevel' ),
                Homey.app.getBridge().registerWEBHooks( data.power, 'feature', id + '_power' ),
                Homey.app.getBridge().registerWEBHooks( data.energy, 'feature', id + '_energy' )
            ] );
        }
        catch ( err )
        {
            Homey.app.updateLog( this.getName() + " Failed to create webhooks ", err );
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

                // Get the dim value if the switch when it's switched on
                if ( value == 1 )
                {
                    // Get the current dim Value from the device using the unique feature ID stored during pairing
                    const dimLevel = await Homey.app.getBridge().getFeatureValue( devData[ 'dimLevel' ] );
                    if ( dimLevel >= 0 )
                    {
                        await this.setCapabilityValue( 'dim', dimLevel / 100 );
                    }
                }
            }
            else if ( capability == "dimLevel" )
            {
                await this.setCapabilityValue( 'dim', value / 100 );
                this.setAvailable();
            }
            else if ( capability == "power" )
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
        Homey.app.updateLog( this.getName() + ': Getting Values', true );
        try
        {
            const devData = this.getData();

            // Get the current switch Value from the device using the unique feature ID stored during pairing
            const onoff = await Homey.app.getBridge().getFeatureValue( devData[ 'switch' ] );
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

            // Only get the dim value if the switch is on or is currently unknown
            if ( ( onoff == 1 ) || ( this.getCapabilityValue( 'dimLevel' ) == null ) )
            {
                // Get the current dim Value from the device using the unique feature ID stored during pairing
                const dimLevel = await Homey.app.getBridge().getFeatureValue( devData[ 'dimLevel' ] );
                if ( dimLevel >= 0 )
                {
                    await this.setCapabilityValue( 'dim', dimLevel / 100 );
                }
            }
        }
        catch ( err )
        {
            //this.setUnavailable();
            Homey.app.updateLog( this.getName() + " getDeviceValues Error ", err );
        }
    }

    async getEnergyValues()
    {
        try
        {
            // If the device supports energy then fetch the current value
            if ( typeof devData.energy == 'string' )
            {
                const energy = await Homey.app.getBridge().getFeatureValue( devData[ 'energy' ] );
                await this.setCapabilityValue( 'meter_power', energy / 1000 );
            }

            // If the device supports power then fetch the current value
            if ( typeof devData.power == 'string' )
            {
                const power = await Homey.app.getBridge().getFeatureValue( devData[ 'power' ] );
                await this.setCapabilityValue( 'measure_power', power );
            }
        }
        catch ( err )
        {
            Homey.app.updateLog( this.getName() + " getDeviceValues Error ", err );
        }
    }

    async onDeleted() {}
}

//module.exports = MyDevice;