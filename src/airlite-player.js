import axios from "axios";
import Rasterizer from "./rasterizer";

class AirlitePlayer {
    constructor(cfg) {
        const defaults = {
            mapCenter: [45.1, 25.3],
            animationInterval: 100,
            threshold: 60,
            temporalGrouping: 900,
        };
        this.cfg = Object.assign(defaults, cfg);
        this.data = [];
        this.range = [];
        if (cfg.from) {
            this.range[0] = cfg.from;
        }
        if (cfg.to) {
            this.range[1] = cfg.to;
        }

        let tileServer = 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        //let tileServer = 'https://maps.wikimedia.org/osm-intl/${z}/${x}/${y}.png';

        var baseLayer = L.tileLayer(
            tileServer,{
                attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors | Slavic Dragovtev',
            }
        );

        var cfg = {
            // radius should be small ONLY if scaleRadius is true (or small radius is intended)
            // if scaleRadius is false it will be the constant radius used in pixels
            "radius": 0.001,
            "minOpacity": .4,
            // scales the radius based on map zoom
            "scaleRadius": true,
            // if set to false the heatmap uses the global maximum for colorization
            // if activated: uses the data maximum within the current map boundaries
            //   (there will always be a red spot with useLocalExtremas true)
            useLocalExtrema: false,
            // which field name in your data represents the latitude - default "lat"
            latField: 'lat',
            lngField: 'lng',
            // which field name in your data represents the data value - default "value"
            valueField: 'value',
            blur: 0.85,
            gradient: {
                '0.0': '#1a8cff',
                '0.25': 'yellow',
                '0.5': 'red',
                '0.9': 'purple'
            },
            data: {
                data: []
            }
        };
        this.heatmapLayer = new HeatmapOverlay(cfg);

        this.map = L.map(this.cfg.anchor, {
            layers: [baseLayer, this.heatmapLayer],
            maxZoom: 17,
            minZoom: 7
        }).setView(this.cfg.mapCenter, 14);

        L.control.scale({imperial: false}).addTo(this.map);

        let that = this;
        this.map.on("moveend zoomend", function() {
            console.log(that.map.getZoom());
            that.stop();
            that.load();
        });

        this.markers = [];
    }

    setConfig(key, val) {
        this.cfg[key] = val;
    }

    getInferenceFromZoom() {
        if (this.map.getZoom()>=17) {
            return 200;
        }

        if (this.map.getZoom()>15) {
            return 500;
        }

        if (this.map.getZoom()>12) {
            return 1000;
        }

        if (this.map.getZoom()>10) {
            return 2000;
        }

        return 4000;
    }

    /**
     *
     * @param range array with two values: from, to
     */
    setDateRange(range) {
        this.range = range;

        this.load();
    }

    computeAverage(stations) {
        if (stations.length==0) {
            return false;
        }
        let sum = stations.reduce(function(total, current) { return total+current.value;}, 0);

        return sum/stations.length;
    }

    load() {
        if (this.cfg.onLoadStart) {
            this.cfg.onLoadStart();
        }

        this.stop();

        let that = this;
        return new Promise(function(resolve, reject){
            axios.get(that.cfg.dataUrl, {
                params: {
                    from: that.range[0],
                    to: that.range[1],
                    group: that.cfg.temporalGrouping,
                    bounds: that.map.getBounds().toBBoxString()
                }
            }).then(function(resp){
                if (resp.data.length>600) {
                    alert("Response truncated. Select a narrower time range next time.");
                    resp.data.splice(600);
                }

                var rasterized=[];
                for (let i=0; i<resp.data.length; i++) {
                    let frame = resp.data[i].values;
                    let bounds = that.map.getBounds();

                    that.showStations(frame);

                    let raster = new Rasterizer(
                        frame,
                        [
                            {lng: bounds.getSouthWest().lng, lat: bounds.getSouthWest().lat},
                            {lng: bounds.getNorthEast().lng, lat: bounds.getNorthEast().lat},
                        ],
                        {
                            viewport: that.map.getPixelBounds().getSize(),
                            inferenceRadius: that.getInferenceFromZoom()
                        }
                    );
                    //console.log(that.getInferenceFromZoom());
                    let rFrame = raster.rasterize();
                    rasterized.push({
                        values: rFrame,
                        timestamp: resp.data[i].timestamp,
                        average: that.computeAverage(frame)
                    });
                    //console.debug(rFrame);
                    //break;
                }

                that.data = rasterized;

                if (that.cfg.onLoad) {
                    that.cfg.onLoad(that, that.data);
                }

                resolve();
            });
        });
    }

    biteIn() {
        if (this.data.length==0) {
            return ;
        }
        //console.log(this.data[0]);
        this.setHmlData(this.data[this.data.length-1].values);

        if (this.cfg.onAnimation) {
            this.cfg.onAnimation(1, this.data[this.data.length-1]);
        }

        return this.data[this.data.length-1];
    }

    showStations(data) {
        if (this.markers.length) {
            this.markers.map(function(v){
                v.remove();
            });
        }

        if (this.map.getZoom()>12) {
            for (let i=0; i<data.length; i++) {
                let marker = L.marker([data[i].lat, data[i].lng]);
                this.markers.push(marker);
                marker.addTo(this.map);
            }
        }
    }

    /**
     * Set Heatmaplayer data
     *
     */
    setHmlData(data) {
        var hmlData = {
            max: this.cfg.threshold,
            data: data
        };

        this.heatmapLayer.setData(hmlData);
    }

    play() {
        if (this.data.length==0) {
            //console.log("not playing with you!");
            return ;
        }
        if (this.animationInterv) {
            this.stop();
            return;
        }

        var index = 0;
        var that = this;

        this.animationInterv = window.setInterval(function() {
            that.setHmlData(that.data[index].values);

            if (that.cfg.onAnimation) {
                that.cfg.onAnimation((index+1)/that.data.length, that.data[index]);
            }

            ++index;
            if (index>=that.data.length) {
                that.stop();
            }
        }, this.cfg.animationInterval);
    }

    stop() {
        if (!this.animationInterv) {
            return ;
        }
        window.clearInterval(this.animationInterv);
        this.animationInterv = null;
        this.biteIn();
    }
}

export default AirlitePlayer;