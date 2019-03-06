# com.lightwaverf.smartseries

This app is for the LightwaveRF Smart Series of devices and the Link Plus hub.

# How does it work
It connects via the Lightwave API for the Link Plus and therefore requires an internet connection to operate.

> Note: If you have a previous version for this app installed, then you need to remove the already added devices and add them again to enable additional or changed functionality.
You will also have to repair all related flows because of that.

# Currently supported:
* Dimmers: L21, L22. L23, L24.
* Sockets: L41, L42.
* Relays: LW380.
* Other categories will be added later.

## Capabilities supported for dimmers:
* Switch (On / Off)
* Dim

# Flows:
## Triggers:
* Dim-level changed (with level tag)
* Turned on
* Turned off

## Conditions:
* Is turned on

## Then:
* Dim to
* Set relative dim-level
* Turn on
* Turn off
* Toggle on or off

## Capabilities supported for sockets:
* Switch (On / Off)
* Power usage.
* Energy Used.

# Flows:
## Triggers:
* Turn on
* Turn off
* The power changed
* The power meter changed

## Conditions:
* Is turned on

## Then:
* Turn on
* Turn off
* Toggle on or off

## Capabilities supported for relay:
* Switch (On / Off)

# Flows:
## Triggers:
* Turn on
* Turn off

## Conditions:
* Is turned on

## Then:
* Turn on
* Turn off
* Toggle on or off

# Configuration
* Be sure that your Lightwave devices are paired and working with the Link Plus bridge.

Lightwave provide a Bearer token and Refresh Token via their Link Plus phone app and their my.lightwave.com web interface.
These will have to be entered into the homey app settings page. Note the Refresh token is a one time use code that is updated every time it is used to obtain a new access token.
It appears the Lightwave account page is not updated automatically when a new refresh token is generated externally so you might need to hit the REFRESH TOKEN button to get a current refresh token.
Currently, Lightwave do not support oauth 2 so these parameters have to be obtained and entered in to homey manually.

So, to use the app you will need to install it then enter the codes into the app's settings page before you add new devices to homey.

When adding devices you will need to choose the category to include.
Then select the devices you want to include from the provided list and hit next on the screen to add them to homey.
The devices all appear in the Home section of homey, so the Lightwave zone / room is ignored, but you can move them to homey rooms as normal.

# Limitations
Lightwave have an issue with their web hooks feature that is preventing me from registering a web hook so I have implemented a polling system to refresh the status of the homey tiles. The system polls every 10 seconds so there could be a slight delay between pressing a physical button and the homey tile updating. I will move to using the web hooks as soon as it is working, which should reduce the latency and network traffic.
This does not affect the sending of updates from homey so changing the state of a device from a tile or flow should be quick.

# Notes
If you have devices that are not supported, a log will appear in the settings page after you have run the pairing process. This log provides details of the devices that were found that are not supported.
If you post the log to https://github.com/AdyRock/com.lightwaverf.smartseries/issues I will try to add the devices to the next version.

# Version Log
0.2.0
Divided power and energy values by 1000 to convert from integer to real number.

0.1.0
First beta
