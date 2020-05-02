let AirliteOverlay = L.Layer.extend({
    initialize: function(config) {
        this._data = [];
        let defaults = {
            threshold: 100,
            gradient: [
                {'threshold': 0, 'color': '#00BFFF'},
                {'threshold': 0.20, 'color': '#dcff00'},
                {'threshold': 0.50, 'color': '#ff0000'},
                {'threshold': 1, 'color': '#8500FF'},
            ],
            maxOpacity: 0.8,
            minOpacity: 0.05,
        };
        this._config = Object.assign(defaults, config);
        for (let i=0; i<this._config.gradient.length; i++) {
            if (this._config.gradient[i].color.indexOf("#")===0) {
                this._config.gradient[i].color = this.hexToRgb(this._config.gradient[i].color);
            }
        }
    },

    getAttribution: function() {
        return "Slavic Dragovtev"
    },

    onAdd: function(map) {
        this._map = map;

        let pane = map.getPane(this.options.pane);

        this._cont = L.DomUtil.create("canvas");
        //this._cont.style.position = 'absolute';
        //L.DomUtil.setOpacity(this._cont, 0.25);

        let size = map.getSize();
        this._width = size.x;
        this._height = size.y;
        //console.log("map size: ", this._width, this._height);
        this._cont.style.width = size.x + 'px';
        this._cont.style.height = size.y + 'px';
        this._cont.width = size.x;
        this._cont.height = size.y;

        pane.appendChild(this._cont);

        this._draw();

        map.on('zoomend viewreset moveend', this._update, this);
    },

    onRemove: function(map) {
        L.DomUtil.remove(this._cont);
        map.off('zoomend viewreset moveend', this._update, this);
    },

    _update: function() {
        // Recalculate position of container
        var mapPane = this._map.getPanes().mapPane;
        let mapPos = L.DomUtil.getPosition(mapPane);
        L.DomUtil.setPosition(this._cont, {x: -mapPos.x, y: -mapPos.y});

        let size = this._map.getSize();

        this._width = size.x;
        this._height = size.y;

        this._cont.style.width = size.x + 'px';
        this._cont.style.height = size.y + 'px';
        this._cont.width = size.x;
        this._cont.height = size.y;


        if (this._data.length == 0) {
            return;
        }

        this._draw();
    },

    setData: function(data) {
        this._data = data;
        this._draw();
    },

    _draw: function() {
        //console.log(this._map.getPixelOrigin());
        var ctx = this._cont.getContext("2d");
        ctx.clearRect(0, 0, this._width, this._height);

        let contPos = L.DomUtil.getPosition(this._cont);

        for (let i=0; i<this._data.length; i++) {
            let px = this._data[i];
            let center = this._map.latLngToLayerPoint(L.latLng(px.lat, px.lng));
            let northEast = this._map.latLngToLayerPoint(
                L.latLng(px.lat - px.deltaLat, px.lng - px.deltaLng)
            );
            //console.log(northEast);
            let rgb = this.valueToRgbColor(px.value);
            let opacity = this._config.maxOpacity - (1-px.proximity)*(this._config.maxOpacity-this._config.minOpacity);
            //console.log(opacity);
            ctx.fillStyle = "rgba(" + rgb[0] + ", " + rgb[1] + ", " + rgb[2] + ", " + opacity + ")";
            ctx.fillRect(northEast.x-contPos.x, northEast.y-contPos.y, 2*(center.x-northEast.x), 2*(center.y-northEast.y));

            // ctx.strokeText(Math.round(px.proximity*100)/100,
            //     northEast.x-contPos.x, northEast.y-contPos.y, 2*(center.x-northEast.x))
        }

        // Calculate initial position of container with
        // `L.Map.latLngToLayerPoint()`, `getPixelOrigin()` and/or `getPixelBounds()`
    },

    hexToRgb: function(hex) {
        if (hex.indexOf("#")===0) {
            hex = hex.substring(1);
        }

        const r = parseInt("0x" + hex.substring(0, 2));
        const g = parseInt("0x" + hex.substring(2, 4));
        const b = parseInt("0x" + hex.substring(4));
        return [r,g,b];
    },

    valueToRgbColor: function(val) {
        //console.log("Val: ", val);
        let r = Math.min(1, val/this._config.threshold);
        //console.log("r:", r);
        let idx = false;
        for (let i=0; i<this._config.gradient.length; i++) {
            if (r<this._config.gradient[i].threshold) {
                idx = i;
                break;
            }
        }

        if (idx===false) {
            return this._config.gradient[this._config.gradient.length-1];
        }

        const localDelta = this._config.gradient[idx].threshold - this._config.gradient[idx-1].threshold; // val interval corresponding to two consecutive colors
        r = (r - this._config.gradient[idx-1].threshold)/localDelta;
        //console.log("r local: ", r);
        const rgbStart = this._config.gradient[idx-1].color;
        const rgbEnd = this._config.gradient[idx].color;

        //console.log(rgbStart, rgbEnd);

        let red = (rgbEnd[0] - rgbStart[0]) ? rgbStart[0] + Math.round(r*(rgbEnd[0] - rgbStart[0])) : rgbStart[0];
        let green = (rgbEnd[1] - rgbStart[1]) ? rgbStart[1] + Math.round(r*(rgbEnd[1] - rgbStart[1])) : rgbStart[1];
        let blue = (rgbEnd[2] - rgbStart[2]) ? rgbStart[2] + Math.round(r*(rgbEnd[2] - rgbStart[2])) : rgbStart[2];

        //throw "halted";
        return [red, green, blue];
    }
});

export default AirliteOverlay;