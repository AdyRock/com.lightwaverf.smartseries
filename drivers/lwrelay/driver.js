'use strict';

const Homey = require('homey');

module.exports = class lwrelay extends Homey.Driver
{

    async onInit()
    {
        try
        {
            await this.homey.app.getBridge().waitForBridgeReady();
        }
        catch (err)
        {
            this.homey.app.updateLog(`lwrelay Driver OnInit Error ${err}`);
        }
    }

    // this is the easiest method to overwrite, when only the template 'Drivers-Pairing-System-Views' is being used.
    async onPairListDevices()
    {
        return this.homey.app.getBridge().getDevicesOfType('relay');
    }

    async onPair(session)
    {
        const oldbearerid = this.homey.app.bearerid;
        const oldrefreshtoken = this.homey.app.refreshtoken;
        session.setHandler('list_devices', async () =>
        {
            try
            {
                const devices = await this.onPairListDevices();
                return devices;
            }
            catch (err)
            {
                this.homey.app.bearerid = oldbearerid;
                this.homey.app.refreshtoken = oldrefreshtoken;
                this.homey.app.InitBridge(false);
                throw new Error(err.message);
            }
        });

        session.setHandler('bearerid_setup', async () =>
        {
            return { bearerid: this.homey.app.bearerid, refreshtoken: this.homey.app.refreshtoken };
        });

        session.setHandler('api_connection', async data =>
        {
            if (data.bearerid && data.refreshtoken)
            {
                if ((data.bearerid !== oldbearerid) || (data.refreshtoken !== oldrefreshtoken))
                {
                    this.homey.app.bearerid = data.bearerid;
                    this.homey.app.refreshtoken = data.refreshtoken;
                    if (await this.homey.app.InitBridge(false))
                    {
                        return {ok:true};
                    }

                    return {ok:false, err:'Failed'};
                }

                return {ok:true};
            }

            return {ok:false, err:'Missing Token'};
        });
    }

    async onRepair(session, device)
    {
        const oldbearerid = this.homey.app.bearerid;
        const oldrefreshtoken = this.homey.app.refreshtoken;

        session.setHandler('bearerid_setup', async () =>
        {
            return { bearerid: this.homey.app.bearerid, refreshtoken: this.homey.app.refreshtoken };
        });

        session.setHandler('api_connection', async data =>
        {
            if (data.bearerid && data.refreshtoken)
            {
                if ((data.bearerid !== oldbearerid) || (data.refreshtoken !== oldrefreshtoken))
                {
                    this.homey.app.bearerid = data.bearerid;
                    this.homey.app.refreshtoken = data.refreshtoken;
                    if (await this.homey.app.InitBridge(false))
                    {
                        return {ok:true};
                    }

                    return {ok:false, err:'Failed'};
                }

                return {ok:true};
            }

            return {ok:false, err:'Missing Token'};
        });
    }
};

// module.exports = MyDriver;
