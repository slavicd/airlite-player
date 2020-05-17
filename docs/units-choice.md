# Choosing the right unit

When designing a service that aims to inform the large public about the state 
of air quality at the local or national level (or, arguably, any level) the 
choice of the right reporting unit needs to be considered. Balancing the 
accuracy of a statement with ease of understading is important. 

While a greatly simplified reporting unit in the form of a unitless index
provides the most reach because of its simplicity of comprehension by the large
public, the actual choice of which index to use is not quite straightforward in 
the context of a guerilla project such as Airlite.


### The European Common Air Quality Index (CAQI)

The CAQI is a number on a scale from 1 to 100, low values meaning good air. The 
problem with CAQI lies in its calculation, and namely the mandatory components. 
In order for us to be able to name it "CAQI" and present it as such, we would 
need to be able to infer a minimum of 2 parameters for the "roadside" regions
(PM10 and NO2), and a minimum of 3 parameters for the "background" regions that
we wish to report on (PM10, NO2 and O3). Furthermore, we would need to define 
what "background" and "roadside" means and categorize all the stations 
to be included in the database as one or the other (with all the administration 
work that this entails). 

It is important to realize that while PM2.5 is, in prospect, the main parameter 
that the Airlite service will be able to infer upon, it is merely an optional 
component of the CAQI index.


### US AQI

Developed by The United States Environmental Protection Agency, this AQI is 
divided into six categories indicating increasing levels of health concern.
This index does not define any mandatory parameters and, thus, any of the 
"subindexes" (including our PM2.5) could be used to compute a valid US AQI
index.

To be noted that different parameters (pollutant concentrations) use different
averaging periods. For example, O3 averaging period in the index is defined as 
1 hour, CO2's period is defined as 8 hours, while PM2.5's averaging period is
24 hours. This is a limitation in case of CAQI too, but I reckon we can easily
circumvent it by declaring that the "live" values are estimated by 
extrapolating from 15-30 minutes to 1 hour, (or 8, or 24 hours, respectively).

### Custom index

A custom airlite-specific index could be developed to translate from parameters
like µg/m^3, ppb, ppm into a unitless value (such as a simple 1 to 10 scale), 
but this comes with its own can of worms.


### No index / Single parameter

Being the most scientifically accurate is also technically the easiest, in 
this particular context. We could show "raw" concentration values and, instead,
focus on conveying what those concentrations mean, approaching the level
of simplicity of a unitless scale/index.

One problem with this approach is that situations where different pollutants 
act on different parts of a focus region (map on screen) would be harder to 
visualize (think uradmonitor.com).


## References
https://en.wikipedia.org/wiki/Air_quality_index#CAQI