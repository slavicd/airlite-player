import axios from "axios";
import Rasterizer from "./rasterizer";
import AirliteOverlay from "./airlite-leaflet-overlay";

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
        this.rasterized = [];

        this.range = [];
        if (cfg.from) {
            this.range[0] = cfg.from;
        }
        if (cfg.to) {
            this.range[1] = cfg.to;
        }
        let d = new Date();
        this.cfg.tzOffset = d.getTimezoneOffset();

        let tileServer = 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        //let tileServer = 'https://maps.wikimedia.org/osm-intl/${z}/${x}/${y}.png';

        var baseLayer = L.tileLayer(
            tileServer,{
                attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
            }
        );

        var cfg = {};
        this.airliteLayer = new AirliteOverlay(cfg);

        this.map = L.map(this.cfg.anchor, {
            layers: [baseLayer, this.airliteLayer],
            maxZoom: 17,
            minZoom: 7
        }).setView(this.cfg.mapCenter, 13);

        L.control.scale({imperial: false}).addTo(this.map);

        let that = this;
        this.map.on("moveend", function() {
            //console.log(that.map.getZoom());
            that.stop();
            that.load();
        });

        this.markers = [];
    }

    setConfig(key, val) {
        this.cfg[key] = val;
    }

    /**
     * Idea is to increase the inference radius as the distances span larger
     * @returns {number}
     */
    getInferenceFromZoom() {
        const minR = 150;
        const maxR = 4000;
        const minZoom = 7;
        const maxZoom  = 17;
        return Math.round(100 + (17 - this.map.getZoom())/(maxZoom-minZoom)*(maxR - minR));
    }

    /**
     *
     * @param range array with two values: from, to
     */
    setDateRange(range) {
        this.range = range;

        this.load();
    }

    /**
     * Computes average for given stations
     * @param {array} stations
     * @returns {boolean|number}
     */
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
                    bounds: that.map.getBounds().toBBoxString(),
                    timezone_delta: that.cfg.tzOffset,
                }
            }).then(function(resp){
                if (resp.data.length>600) {
                    alert("Response truncated. Select a narrower time range next time.");
                    resp.data.splice(600);
                }

                that.data = resp.data;

                //console.log(that.getInferenceFromZoom());
                let rasterized=[];
                for (let i=0; i<resp.data.length; i++) {
                    let frame = resp.data[i].values;
                    let bounds = that.map.getBounds();

                    let raster = new Rasterizer(
                        frame,
                        [
                            {lng: bounds.getSouthWest().lng, lat: bounds.getSouthWest().lat},
                            {lng: bounds.getNorthEast().lng, lat: bounds.getNorthEast().lat},
                        ],
                        {
                            viewport: that.map.getSize(),
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

                that.rasterized = rasterized;

                if (that.cfg.onLoad) {
                    that.cfg.onLoad(that, that.data, that.rasterized);
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
        this.setHmlData(this.rasterized[this.rasterized.length-1].values);
        this.showStations(this.data[this.rasterized.length-1].values);

        if (this.cfg.onAnimation) {
            this.cfg.onAnimation(1, this.rasterized[this.rasterized.length-1]);
        }

        return this.rasterized[this.rasterized.length-1];
    }

    /**
     * Display station markers on the map
     * @param {array} data
     */
    showStations(data) {
        //console.log("showing stations: ", data);
        if (this.markers.length) {
            this.markers.map(function(v){
                //console.log("removing", v);
                v.remove();
            });
            this.markers = [];
        }

        if (this.map.getZoom()>12) {
            for (let i=0; i<data.length; i++) {
                let marker = L.marker([data[i].lat, data[i].lng], {
                    title: data[i].label
                });
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
        //console.log(data); return ;
        this.airliteLayer.setData(data);
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

        that.playFrame(index);
    }

    playFrame(index) {
        this.setHmlData(this.rasterized[index].values);
        this.showStations(this.data[index].values);

        if (this.cfg.onAnimation) {
            this.cfg.onAnimation((index+1)/this.rasterized.length, this.rasterized[index]);
        }

        if (index==this.data.length-1) {
            this.stop();
        } else {
            const that = this;
            this.animationInterv = window.setTimeout(function() {
                that.playFrame(index+1);
            }, this.cfg.animationInterval);
        }
    }

    stop() {
        if (!this.animationInterv) {
            return ;
        }
        window.clearTimeout(this.animationInterv);
        this.animationInterv = null;
        this.biteIn();
    }
}

export default AirlitePlayer;