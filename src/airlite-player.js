import axios from "axios";

class AirlitePlayer {
    constructor(cfg) {
        const defaults = {
            mapCenter: [45.1, 25.3],
            animationInterval: 100
        };
        this.cfg = Object.assign(defaults, cfg);
        this.data = [];
        this.range = [];

        var baseLayer = L.tileLayer(
            'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
                attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors | Slavic Dragovtev',
                maxZoom: 18
            }
        );

        var cfg = {
            // radius should be small ONLY if scaleRadius is true (or small radius is intended)
            // if scaleRadius is false it will be the constant radius used in pixels
            "radius": 0.01,
            "maxOpacity": .8,
            // scales the radius based on map zoom
            "scaleRadius": true,
            // if set to false the heatmap uses the global maximum for colorization
            // if activated: uses the data maximum within the current map boundaries
            //   (there will always be a red spot with useLocalExtremas true)
            useLocalExtrema: false,
            // which field name in your data represents the latitude - default "lat"
            latField: 'lat',
            // which field name in your data represents the longitude - default "lng"
            lngField: 'lng',
            // which field name in your data represents the data value - default "value"
            valueField: 'value',
            blur: 0.8,
            data: {
                data: []
            }
        };
        this.heatmapLayer = new HeatmapOverlay(cfg);

        this.map = L.map(this.cfg.anchor, {
            layers: [baseLayer, this.heatmapLayer]
        }).setView(this.cfg.mapCenter, 14);
    }

    /**
     *
     * @param range array with two values: from, to
     */
    setDateRange(range) {
        this.range = range;

        this.load();
    }

    load() {
        var that = this;
        return new Promise(function(resolve, reject){
            axios.get(that.cfg.dataUrl, {
                params: {
                    period_from: that.range[0],
                    period_to: that.range[1]
                }
            }).then(function(resp){
                that.data = resp.data;
                //console.log(resp.data);

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
        this.setHmlData(this.data[0]);
    }

    setHmlData(data) {
        var hmlData = {
            max: 100,
            data: data
        };

        this.heatmapLayer.setData(hmlData);
    }

    play() {
        if (
            this.data.length==0
            || this.animationInterv
        ) {
            console.log("not playing with you!");
            return ;
        }

        var index = 0;
        var that = this;

        this.animationInterv = window.setInterval(function() {
            that.setHmlData(that.data[index])
            ++index;
            //console.log("frame:", index);
            if (index>=that.data.length) {
                that.stop();
            }

            if (that.cfg.onAnimation) {
                that.cfg.onAnimation(index/that.data.length);
            }
        }, this.cfg.animationInterval);
    }

    stop() {
        if (!this.animationInterv) {
            return ;
        }
        window.clearInterval(this.animationInterv);
        this.animationInterv = null;
    }
}

export default AirlitePlayer;