/*
 * Convert a frame consisting of station data to a raster
 * of computed "pixels" by running "in-pixel" averages
 * and "out-of-pixel" inferences by way of weighted averages
 */

/**
 * @see https://en.wikipedia.org/wiki/Geographic_coordinate_system
 * @type {number}
 */
const METERS_PER_LAT_DEGREE = 110600;
const EARTH_MERID_RADIUS = 6367449; // meters
const EARTH_MEAN_RADIUS = 6371000;  // meters

class Rasterizer {
    /**
     *
     * @param {{lat: number, lng: number, value: number}[]} input
     * @param {{lat, lng}[]} bounds rectangular geographical area
     * @param {?Object} config
     */
    constructor(input, bounds, config=null) {
        this.input = input;
        this.bounds = bounds;
        const defaults = {
            resolution: 100, // the result raster will contain this many vertical points
            inferenceRadius: 1000,  // meters
        };
        this.config = Object.assign({}, defaults, config);

        this.latStart = Math.min(bounds[0].lat, bounds[1].lat);
        this.latEnd = Math.max(bounds[0].lat, bounds[1].lat);
        this.lngStart = Math.min(bounds[0].lng, bounds[1].lng);
        this.lngEnd = Math.max(bounds[0].lng, bounds[1].lng);
        //console.debug("Bounds: ", this.latStart, this.lngStart, this.latEnd, this.lngEnd);

        // decrease resolution when it doesn't make sense to have it big (small areas)
        let dist = this._haversineDist({lat: this.latStart, lng: this.lngStart}, {lat: this.latEnd, lng: this.lngEnd})
        if (dist<6000) {
            this.config.resolution = Math.max(30, Math.round(dist/100));
        }

        var latRes = this.config.resolution;
        var lngRes = this.config.resolution;
        if (typeof this.config["viewport"] != "undefined") {
            // work out the effective resolution based on viewport dimensions, such that the pixels are approximately square
            let vpRatio = this.config.viewport.x / this.config.viewport.y;
            lngRes = Math.round(lngRes*vpRatio);
            //console.debug("resolution:", latRes, lngRes);
        }

        this.latPxWidth = (this.latEnd - this.latStart)/latRes;
        this.lngPxWidth = Math.abs((bounds[0].lng - bounds[1].lng)/lngRes);

        this.inferenceRadiusLat = this.config.inferenceRadius / METERS_PER_LAT_DEGREE;
    }

    _toRad(n) {
        return n*Math.PI/180;
    }

    /**
     * @param {lat: number, lng: number} p1
     * @param {lat: number, lng: number} p2
     * @private
     */
    _haversineDist(p1, p2) {
        let dLat = this._toRad(Math.abs(p1.lat - p2.lat));
        let dLng = this._toRad(Math.abs(p1.lng - p2.lng));

        let a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this._toRad(p1.lat)) * Math.cos(this._toRad(p2.lat)) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return EARTH_MEAN_RADIUS * c;
    }

    /**
     * computes a weighted average for a pixel using nearby cells with
     * data sources
     *
     * @param {number} forLatKey grid key, not geo coordinate
     * @param {number} forLngKey grid key
     * @param {number} infRadLng
     * @private
     */
    _getWghtAverave(forLatKey, forLngKey, infRadLng) {
        const infRadLat = this.inferenceRadiusLat;

        let waNumerator = 0;
        let waDenominator = 0;
        let average;

        let forLat = this.latStart + this.latPxWidth * forLatKey;
        let forLng = this.lngStart + this.lngPxWidth * forLngKey;

        for (
            let latKey=Math.max(0, Math.floor((forLat-infRadLat-this.latStart)/this.latPxWidth));
            latKey*this.latPxWidth+this.latStart<forLat+infRadLat;
            latKey++
        ) {
            if (
                typeof this.grid[latKey] == "undefined"
                || this.grid[latKey].length==0
            ) {
                continue;
            }

            let lat = this.latStart + this.latPxWidth * latKey;         // "this" point's lat

            for (
                let lngKey=Math.max(0, Math.floor((forLng-infRadLng-this.lngStart)/this.lngPxWidth));
                lngKey*this.lngPxWidth+this.lngStart<forLng+infRadLng;
                lngKey++
            ) {
                let lng = this.lngStart + this.lngPxWidth * lngKey;
                if (
                    (lngKey==forLngKey && latKey==forLatKey)
                    || typeof this.grid[latKey][lngKey] == "undefined"
                    || typeof this.grid[latKey][lngKey].sources == "undefined"
                ) {
                    continue;
                }
                let cell = this.grid[latKey][lngKey];
                let dist = this._haversineDist(
                    {lat: forLat+this.latPxWidth/2, lng: forLng+this.lngPxWidth/2},
                    {lat: lat+this.latPxWidth/2, lng: lng+this.lngPxWidth/2}
                );
                if (dist==0) {
                    console.warn("Distance is zero between ", latKey, lngKey, forLatKey, forLngKey);
                }

                if (dist>this.config.inferenceRadius) {
                    continue;
                }

                let weight = 1 / (1+Math.pow(dist/100, 2));
                waNumerator += weight*cell.average;
                waDenominator += weight;
                average = waNumerator / waDenominator;
            }
        }
        return average;
    }

    /**
     * Infer about values in pixels missing data using
     * weighted average from nearby stations
     * @private
     */
    _interpolateMissing(sourcePixels) {
        const infRadLat = this.inferenceRadiusLat;
        let interGrid = [];

        for (let i=0; i<sourcePixels.length; i++) {
            let lat = this.latStart + this.latPxWidth * sourcePixels[i][0];

            let infRadLng = this.config.inferenceRadius /
                (Math.PI/180 *  EARTH_MERID_RADIUS * Math.cos(this._toRad(lat)));    // in long degrees

            // grab all within "radius" given by infRadLat and infRadLng
            //console.debug("src pixel: ", sourcePixels[i]);
            for (
                let latKey=Math.max(0, Math.floor((lat-infRadLat-this.latStart)/this.latPxWidth));
                latKey*this.latPxWidth+this.latStart<lat+infRadLat;
                latKey++
            ) {
                let toCheckLat = latKey*this.latPxWidth+this.latStart;
                if (toCheckLat+this.latPxWidth/2>this.latEnd) {
                    continue;   // outside bounds
                }

                if (typeof interGrid[latKey] == "undefined") {
                    interGrid[latKey] = [];
                }

                let lng = this.lngStart + this.lngPxWidth * sourcePixels[i][1];
                //console.debug("interpolating at geo coord: ", lat, lng);
                for (
                    let lngKey=Math.max(0, Math.floor((lng-infRadLng-this.lngStart)/this.lngPxWidth));
                    lngKey*this.lngPxWidth+this.lngStart<lng+infRadLng;
                    lngKey++
                ) {
                    //console.debug("pixel:", latKey, lngKey);
                    let toCheckLng = lngKey*this.lngPxWidth+this.lngStart;
                    if (toCheckLng+this.lngPxWidth/2>this.lngEnd) {
                        continue;   // outside bounds
                    }

                    if (
                        typeof this.grid[latKey] != "undefined"
                        && typeof this.grid[latKey][lngKey]!="undefined"
                    ) {
                        continue; // this exists in the main grid
                    }

                    if (typeof interGrid[latKey][lngKey] == "undefined") {
                        interGrid[latKey][lngKey] = {
                            proximity: 0
                        };
                    }

                    let dist = this._haversineDist(
                        {lat: lat+this.latPxWidth/2, lng: lng+this.lngPxWidth/2},
                        {lat: toCheckLat+this.latPxWidth/2, lng: toCheckLng+this.lngPxWidth/2}
                    );
                    if (dist>this.config.inferenceRadius) {
                        continue;
                    }
                    let proximity = 1 - (dist / this.config.inferenceRadius);
                    interGrid[latKey][lngKey].proximity = Math.max(proximity, interGrid[latKey][lngKey].proximity);

                    if (typeof interGrid[latKey][lngKey].average != "undefined") {
                        continue; // this pixel has actual sources or has already been computed
                    }

                    // finally, now get an average form nearby "towers"
                    let aver = this._getWghtAverave(latKey, lngKey, infRadLng);

                    if (typeof aver != "undefined") {
                        //console.debug("getting aver for ", latKey, lngKey, aver);
                        interGrid[latKey][lngKey].average = aver;
                        // register ratio: distance to nearest source / inferenceRadius
                        interGrid[latKey][lngKey].average = aver;
                    } else {
                        //console.debug("undefined WA for: ", latKey, lngKey);
                    }
                }
            }
        }

        return interGrid;
    }

    rasterize() {
        let grid = [];
        var latStart = this.latStart;
        var lngStart = this.lngStart;
        var latPxWidth = this.latPxWidth;
        var lngPxWidth = this.lngPxWidth;


        // distribute the stations inside the grid (sort of a 3d histogram)
        // while also keeping running averages
        /**
         * A source pixel is a raster unit that contains actual sources (stations)
         * we'll end up needing this later
         */
        var sourcePixels = [];
        for (let i=0; i<this.input.length; i++) {
            let latKey=Math.floor((this.input[i].lat - latStart)/latPxWidth);
            if (typeof grid[latKey] == "undefined") {
                grid[latKey] = [];
            }
            let lngKey=Math.floor((this.input[i].lng - lngStart)/lngPxWidth);
            if (typeof grid[latKey][lngKey] == "undefined") {
                grid[latKey][lngKey] = {
                    sources: [],
                    proximity: 1,
                    average: null,
                    sum: 0,
                };
                sourcePixels.push([latKey, lngKey]);
            }
            grid[latKey][lngKey].sources.push(this.input[i]);
            grid[latKey][lngKey].sum+=this.input[i].value;
            grid[latKey][lngKey].average=
                grid[latKey][lngKey].sum/grid[latKey][lngKey].sources.length;
        }

        //console.debug(grid);
        // ... and generate some for nearby areas
        this.grid = grid;
        let flatGrid = this._flatten(grid);
        flatGrid = this._flatten(this._interpolateMissing(sourcePixels), flatGrid);

        return flatGrid;
    }

    _flatten(grid, append) {
        let res = append ? append : [];
        for (let i=0; i<grid.length; i++) {
            if (typeof grid[i]=="undefined") {
                continue;
            }
            for (let j=0; j<grid[i].length; j++) {
                if (typeof grid[i][j] == "undefined" || typeof grid[i][j].average == "undefined") {
                    continue;
                }
                let o = {
                    value: grid[i][j].average,
                    proximity: grid[i][j].proximity,
                    lat: i*this.latPxWidth+this.latStart + this.latPxWidth/2,
                    lng: j*this.lngPxWidth+this.lngStart + this.lngPxWidth/2,
                };
                o.deltaLat = this.latPxWidth/2;
                o.deltaLng = this.lngPxWidth/2;   // because one degree of latitude sometimes is more than the same degree in longitude

                if (grid[i][j].sources) {
                    o.sources = grid[i][j].sources;
                }

                res.push(o);
            }
        }
        return res;
    }
}

export default Rasterizer;