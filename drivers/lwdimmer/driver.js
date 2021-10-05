'use strict';

const Homey = require( 'homey' );

class lwdimmer extends Homey.Driver
{
    async onInit()
    {
        try
        {
            await this.homey.app.getBridge().waitForBridgeReady();
        }
        catch ( err )
        {
            this.homey.app.updateLog( "lwdimmer Driver OnInit Error " + err );
        }
    }

    // this is the easiest method to overwrite, when only the template 'Drivers-Pairing-System-Views' is being used.
    async onPairListDevices()
    {
        return this.homey.app.getBridge().getDevicesOfType( 'dimmer' );
    }

    async onPair( session )
    {
        let oldbearerid = this.homey.app.bearerid;
        let oldrefreshtoken = this.homey.app.refreshtoken;
        session.setHandler( "list_devices", async () =>
        {
            try
            {
                let devices = await this.onPairListDevices();
                return devices;
            }
            catch ( err )
            {
                this.homey.app.bearerid = oldbearerid;
                this.homey.app.refreshtoken = oldrefreshtoken;
                this.homey.app.InitBridge( false );
                throw new Error( err.message );
            }
        } );

        session.setHandler( 'bearerid_setup', async () =>
        {
            return {bearerid: this.homey.app.bearerid, refreshtoken: this.homey.app.refreshtoken};
        } );

        session.setHandler( 'api_connection', async ( data ) =>
        {
            if ( data.bearerid && data.refreshtoken )
            {
                if ((data.bearerid != oldbearerid) || (data.refreshtoken != oldrefreshtoken))
                {
                    this.homey.app.bearerid = data.bearerid;
                    this.homey.app.refreshtoken = data.refreshtoken;
                    return await this.homey.app.InitBridge( false );
                }

                return true;
            }

            return false;
        } );
    }

    async onRepair( session, device )
    {
        let oldbearerid = this.homey.app.bearerid;
        let oldrefreshtoken = this.homey.app.refreshtoken;

        session.setHandler( 'bearerid_setup', async () =>
        {
            return {bearerid: this.homey.app.bearerid, refreshtoken: this.homey.app.refreshtoken};
        } );

        session.setHandler( 'api_connection', async ( data ) =>
        {
            if ( data.bearerid && data.refreshtoken )
            {
                if ((data.bearerid != oldbearerid) || (data.refreshtoken != oldrefreshtoken))
                {
                    this.homey.app.bearerid = data.bearerid;
                    this.homey.app.refreshtoken = data.refreshtoken;
                    return await this.homey.app.InitBridge( false );
                }
            }

            return false;
        } );

    }
}
module.exports = lwdimmer;