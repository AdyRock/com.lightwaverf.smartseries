com.lightwaverf.smartseries

This app is for the LightwaveRF Smart Series of devices and the Link Plus hub.

HOW DOES IT WORK
It connects via the Lightwave API for the Link Plus and therefore requires an internet connection to operate.

NOTE: If you have a previous version for this app installed, then you need to remove the already added devices and add them again to enable additional or changed functionality.
You will also have to repair all related flows because of that. This only applies to new features for existing devices so should not be a problems yet.

CURRENTLY SUPPORTED:
* Dimmers: L21, L22. L23, L24, LW400, LW831.
* Sockets: L41, L42, LW260.
* Relays: LW380, LW821, L82.
* Contact Sensor: LW931.
* Energy Monitor: LW600.
* TRV: LW922.
* Electric Switch: LW934.
* Thermostat: LW921.
* Remote: LW929.
* Other categories will be added later.

CAPABILITIES SUPPORTED FOR DIMMERS:
* Switch (On / Off)
* Dim

FLOWS:
Triggers:
* Dim-level changed (with level tag)
* Turned on
* Turned off

Conditions:
* Is turned on

Then:
* Dim to
* Set relative dim-level
* Turn on
* Turn off
* Toggle on or off

CAPABILITIES SUPPORTED FOR SOCKETS:
* Switch (On / Off)
* Power usage.
* Energy Used.

FLOWS:
Triggers:
* Turn on
* Turn off
* The power changed
* The power meter changed

Conditions:
* Is turned on

Then:
* Turn on
* Turn off
* Toggle on or off

CAPABILITIES SUPPORTED FOR RELAY:
(Switch)
* On / Off
(Three way relay)
* Up / Idle / Down

FLOWS:
Triggers:
(Switch)
* Turn on
* Switch Turn off
(Three way relay)
* State Changed

Conditions:
(Switch)
* Is turned on
(Three way relay)
* The State is

Then:
(Switch)
* Turn on
* Turn off
* Toggle on or off#
(Three way relay)
* Set state

CAPABILITIES SUPPORTED FOR CONTACT SENSOR:
* Alarm
* Battery Level

FLOWS:
Triggers:
* The battery level changed
* The contact alarm turned on
* The contact alarm turned off

Conditions:
* Is contact alarm is on

CAPABILITIES SUPPORTED FOR ELECTRICITY MONITOR:
* Power usage
* Energy usage

FLOWS:
Triggers:
* The power changed
* The power meter changed

CAPABILITIES SUPPORTED FOR THERMOSTATS, TRV AND ELECTRIC SWITCH:
* Standby (On / Off)
* Dim
* Battery Level (TRV only)

FLOWS:
Triggers:
* Temperature changed (with Temperature tag)
* Target Temperature changed (with Target Temperature tag)
* Contact Turned on
* Contact Turned off
* Turned on
* Turned off
* The battery level changed (TRV only)

Conditions:
* Contact is turned on
* Is turned on

Then:
* Set Temperature
* Turn on
* Turn off
* Toggle on or off

CAPABILITIES SUPPORTED FOR REMOTE:
* Generic Alarm (Button Pressed)

FLOWS:
Triggers:
* Turned on (Button Pressed)

CONFIGURATION
* Be sure that your Lightwave devices are paired and working with the Link Plus bridge.

Lightwave provide a Bearer token and Refresh Token via their Link Plus phone app and their my.lightwave.com web interface.
These will have to be entered into the homey app settings page. Note the Refresh token is a one time use code that is updated every time it is used to obtain a new access token.
It appears the Lightwave account page is not updated automatically when a new refresh token is generated externally so you might need to hit the REFRESH TOKEN button to get a current refresh token.
Currently, Lightwave do not support oauth 2 so these parameters have to be obtained and entered in to homey manually.

So, to use the app you will need to install it then enter the codes into the app's settings page before you add new devices to homey.

When adding devices you will need to choose the category to include.
Then select the devices you want to include from the provided list and hit next on the screen to add them to homey.
The devices all appear in the Home section of homey, so the Lightwave zone / room is ignored, but you can move them to homey rooms as normal.

NOTES
If you have devices that are not supported, a log will appear in the settings page after you have run the pairing process. This log provides details of the devices that were found that are not supported.
If you post the log to https://github.com/AdyRock/com.lightwaverf.smartseries/issues I will try to add the devices to the next version.

