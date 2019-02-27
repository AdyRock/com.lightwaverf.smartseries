'use strict';

const Homey = require('homey');
const LightwaveSmartBridge = require('../../lib/LightwaveSmartBridge');

const WEBHOOK_ID = Homey.env.WEBHOOK_ID;
const WEBHOOK_SECRET = Homey.env.WEBHOOK_SECRET;

module.exports = class lwdimmer extends Homey.Driver {
	
	async onInit()
	{
		this.log('lwdimmer has been inited');
		this.lwBridge = new LightwaveSmartBridge();

		//this.registerWebhook();
	}

	// this is the easiest method to overwrite, when only the template 'Drivers-Pairing-System-Views' is being used.
	onPairListDevices( data, callback )
	{
		// Required properties:
		//"data": { "id": "abcd" },

		// Optional properties, these overwrite those specified in app.json:
		// "name": "My Device",
		// "icon": "/my_icon.svg", // relative to: /drivers/<driver_id>/assets/
		// "capabilities": [ "onoff", "dim" ],
		// "capabilitiesOptions: { "onoff": {} },

		// Optional properties, device-specific:
		// "store": { "foo": "bar" },
		// "settings": { "my_setting": "my_value" },

		this.lwBridge.getDevicesOfType('dimmer').then(function(devices)
		{
			callback( null, devices );

		}).catch(function(err)
		{
			callback( new Error("Connection Failed" + err), [] );
		});
	}

	/*
		Webhook methods
	*/
    async registerWebhook()
    {
		try
		{
			this.log('registering WEBHooks');

			await this.unregisterWebhook();
			
			let ids = [];
			var devices = this.getDevices();
			for (const device of devices)
			{
				let data = device.getData();
				let id = data.id;
				ids.push(id);

				// Register a Lightwave webhook for the switch feature
				this.log('registering WEBHook: ', data.switch, id);
				await this.lwBridge.registerWEBHooks(data.switch, 'feature', id);

				// Register a Lightwave webhook for the dim feature
				this.log('registering WEBHook done');
				this.lwBridge.registerWEBHooks(data.dimLevel, 'feature', id);
			};
			
			this.log('registering Homey WEBHooks', ids);
			this._webhook = new Homey.CloudWebhook(WEBHOOK_ID, WEBHOOK_SECRET, { dimmer_id: ids });
			this._webhook.on('message', this._onWebhookMessage.bind(this));
			return this._webhook.register()
				.then(() => {
					this.log('Webhook registered for ids', ids);
				})
				

		}
		catch(err)
		{
			new Error("Failed to create webhooks" + err);
		}
	}
	
	unregisterWebhook() {
		
		if( this._webhook ) {
			return this._webhook.unregister()
			.then(() => {
				this.log('Webhook unregistered');
			})
		}			
		
		return Promise.resolve();
	}
	
	_onWebhookMessage( args ) {		
		if( !args.body || !args.body.dimmer ) return;
		
		let dimmerId = args.body.dimmer;
		let device;
		this.getDevices().forEach(device_ => {
			if( device_.getData().id === dimmerId ) device = device_;
		})
		
		if( !device ) return this.error('Got webhook for unknown device');
		
		if( args.body && args.body.switch ) {
			device.setCapabilityValue('onoff', args.body.switch);
		}
		
		if( args.body && args.body.dim ) {
			device.setCapabilityValue('dim', args.body.dim);
		}
		
		if( args.body && args.body.source ) {
			this.triggerPaused( device, args.body.source === 'pause' ).catch( this.error );
		}
	}
}

//module.exports = lwdimmer;