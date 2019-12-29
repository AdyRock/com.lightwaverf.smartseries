# com.lightwaverf.smartseries

This app is for the LightwaveRF Smart Series of devices and the Link Plus hub.

# How does it work
It connects via the Lightwave API for the Link Plus and therefore requires an internet connection to operate.

> Note: If you have a previous version for this app installed, then you need to remove the already added devices and add them again to enable additional or changed functionality.
You will also have to repair all related flows because of that. This only applies to new features for existing devices so should not be a problems yet.

# Currently supported:
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
(Switch)
* On / Off
(Three way relay)
* Up / Idle / Down

# Flows:
## Triggers:
(Switch)
* Turn on
* Switch Turn off
(Three way relay)
* State Changed

## Conditions:
(Switch)
* Is turned on
(Three way relay)
* The State is

## Then:
(Switch)
* Turn on
* Turn off
* Toggle on or off#
(Three way relay)
* Set state

## Capabilities supported for contact sensor:
* Alarm
* Battery Level

# Flows:
## Triggers:
* The battery level changed
* The contact alarm turned on
* The contact alarm turned off

## Conditions:
* Is contact alarm is on

## Then:

## Capabilities supported for electricity monitor:
* Power usage
* Energy usage

# Flows:
## Triggers:
* The power changed
* The power meter changed

## Conditions:

## Then:

## Capabilities supported for Thermostats, TRV and Electric Switch:
* Standby (On / Off)
* Dim
* Battery Level (TRV only)

# Flows:
## Triggers:
* Temperature changed (with Temperature tag)
* Target Temperature changed (with Target Temperature tag)
* Contact Turned on
* Contact Turned off
* Turned on
* Turned off
* The battery level changed (TRV only)

## Conditions:
* Contact is turned on
* Is turned on

## Then:
* Set Temperature
* Turn on
* Turn off
* Toggle on or off

## Capabilities supported for remote:
* Generic Alarm (Button Pressed)

# Flows:
## Triggers:
* Turned on (Button Pressed)

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

# Notes
If you have devices that are not supported, a log will appear in the settings page after you have run the pairing process. This log provides details of the devices that were found that are not supported.
If you post the log to https://github.com/AdyRock/com.lightwaverf.smartseries/issues I will try to add the devices to the next version.

# Version Log
## 2.0.3
* Added support for LW821 and L82.
* Changed identifer to use productCode instead of product.

## 2.0.1
* Added support for LW929.

## 2.0.0
* Added 'cumulative' energy settings to the Energy Monitor for compatibility with the new Energy information in Homey V3
* Now fetches the dim level when a light is switched on to ensure it is in sync. The energy can then be calculated correctly on devices that do not support power reporting.

## 1.1.4
* Added hooks for power readings so they are updated in real time.
* Fix for MK2 version products.

## 1.1.3
* Removed remnants of old, now unused, WebHook.
* Added new batteries array that is required for upcoming energy object for contact (LW931).
* Removed code to make device unavailable when an error occurs so a temporary issue does not render a device unusable.
* Removed unsupported "button_pressed" registration from contact driver.

## 1.1.2
* Added support for LW400, LW831, LW921, LW922, LW934.

## 1.1.1
* Added support for LW260 gen 1 socket.

## 1.1.0
* LW webhooks working again so updated to new format.

## 1.0.11
* Changed the webhook to and end-point.

## 1.0.10
* Fix possible double timer after settings changed.

## 1.0.9
* Added option to select Polling instead of Webhooks in case LW stops sending notifications.
* Added option to specify polling interval.
* Updated the settings page so the Unsupported Devices panel is on a separate tab.
* Added the Homey ID as a parameter to the webhook URI so the address looks different for each Homey.
* Changed WebHook function to filter on the Homey ID instead of the LW Location ID.

## 1.0.8
* Updated bridge methods for better queuing of transactions.
* Updated the settings page so the log is on a separate tab.
* Added an option to switch logging off.
* Log data panel is now refreshed when new data arrives.
* Changed WebHook function to filter on a different parameter.

## 1.0.7
* Added type check on product code to ensure a string has been returned.

## 1.0.6
* Rewritten some sections so the connections and webhooks are renewed after changing settings. This means you no longer have to restart the app after making changes.
* Added a confirmation message when saving settings.
* Added a diagnostics log to settings page to help trouble shoot connection issues.

## 1.0.5
* Added energy monitors to dimmers. (requires existing dimmers to be removed and added back in. Flows will then need to be repaired.)

## 1.0.4
* Added new EU version devices.

## 1.0.3
* Fixed Socket power value as this does not need to be divided by 1000 which was change in 0.2.0

## 1.0.2
* Fixed issue with the webhook identifying the target homey.

## 1.0.1
* Implemented webhooks and removed polling.
* Changed method of synchronising async functions when fetching new tokens.

## 1.0.0
* Changed to release

## 0.2.1
* Added support for LW600 electricity monitor and LW931 contact sensor.

## 0.2.0
* Divided power and energy values by 1000 to convert from integer to real number.

## 0.1.0
* First beta
