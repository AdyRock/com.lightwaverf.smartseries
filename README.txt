
This app is for the LightwaveRF 'Smart Series' of devices and requires the 'Link Plus' hub. It does not work with the old Link hub.

HOW DOES IT WORK
It connects via the Lightwave API for the Link Plus and therefore requires an internet connection to operate.
The app uses a callback mechanism so it is generally very fast to respond to external events like dim level changes or contact state changes.

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
