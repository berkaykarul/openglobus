goog.provide('og.layer.GmxVector');

goog.require('og.EntityCollection');
goog.require('og.Entity');
goog.require('og.LonLat');
goog.require('og.quadTree');
goog.require('og.quadTree.EntityCollectionQuadNode');
goog.require('og.math');
goog.require('og.inheritance');
goog.require('og.QueueArray');
goog.require('og.Geometry');
goog.require('og.GeometryHandler');
goog.require('og.ajax');


/**
 * Vector layer represents alternative entities store. Used for geospatial data rendering like
 * points, lines, polygons, geometry objects etc.
 * @class
 * @extends {og.layer.Layer}
 * @param {string} [name="noname"] - Layer name.
 * @param {Object} [options] - Layer options:
 * @param {number} [options.minZoom=0] - Minimal visible zoom. 0 is default
 * @param {number} [options.maxZoom=50] - Maximal visible zoom. 50 is default.
 * @param {string} [options.attribution] - Layer attribution.
 * @param {string} [options.zIndex=0] - Layer Z-order index. 0 is default.
 * @param {boolean} [options.visibility=true] - Layer visibility. True is default.
 * @param {boolean} [options.isBaseLayer=false] - Layer base layer. False is default.
 * @param {Array.<og.Entity>} [options.entities] - Entities array.
 * @param {Array.<number,number,number>} [options.scaleByDistance] - Scale by distance parameters.
 *      First index - near distance to the entity, after entity becomes full scale.
 *      Second index - far distance to the entity, when entity becomes zero scale.
 *      Third index - far distance to the entity, when entity becomes invisible.
 * @param {number} [options.nodeCapacity=30] - Maximum entities quantity in the tree node. Rendering optimization parameter. 30 is default.
 * @param {boolean} [options.async=true] - Asynchronous vector data handling before rendering. True for optimization huge data.
 * @param {boolean} [options.groundAlign = false] - Vector data align to the ground relief. Like points with zero altitude lay on the ground.
 *
 * @fires og.layer.GmxVector#entitymove
 * @fires og.layer.GmxVector#draw
 * @fires og.layer.GmxVector#add
 * @fires og.layer.GmxVector#remove
 * @fires og.layer.GmxVector#entityadd
 * @fires og.layer.GmxVector#entityremove
 * @fires og.layer.GmxVector#visibilitychange
 */
og.layer.GmxVector = function (name, options) {
    options = options || {};

    og.inheritance.base(this, name, options);

    this.hostUrl = options.hostUrl || "//maps.kosmosnimki.ru/";

    this._mapId = options.mapId;

    this._layerId = options.layerId;

    this._gmxProperties = null;

    this._checkVersionPath = "Layer/CheckVersion.ashx";

    this.events.registerNames(og.layer.GmxVector.EVENT_NAMES);
};

og.inheritance.extend(og.layer.GmxVector, og.layer.Layer);

og.layer.GmxVector.EVENT_NAMES = [
    /**
     * Triggered when entity has moved.
     * @event og.layer.GmxVector#draw
     */
    "entitymove",

    /**
     * Triggered when layer begin draw.
     * @event og.layer.GmxVector#draw
     */
    "draw",

    /**
     * Triggered when new entity added to the layer.
     * @event og.layer.GmxVector#entityadd
     */
    "entityadd",

    /**
     * Triggered when entity removes from the collection.
     * @event og.layer.GmxVector#entityremove
     */
    "entityremove"
];

/**
 * Vector layer {@link og.layer.GmxVector} object factory.
 * @static
 * @param {String} name - Layer name.
 * @param {Object} options - Layer options.
 * @returns {og.layer.GmxVector} Returns vector layer.
 */
og.layer.gmxVector = function (name, options) {
    return new og.layer.GmxVector(name, options);
};

/**
 * Adds layer to the planet.
 * @public
 * @param {og.scene.RenderNode} planet - Planet scene.
 * @return {og.layer.GmxVector} - Returns og.layer.GmxVector instance.
 */
og.layer.GmxVector.prototype.addTo = function (planet) {
    this._assignPlanet(planet);
    this._initialize();
    return this;
};

og.layer.GmxVector.getLayerInfo = function (hostUrl, layerId, proceedCallback, errorCallback) {
    og.ajax.request(hostUrl + "/rest/ver1/layers/" + layerId + "/info", {
        'type': "GET",
        'responseType': "json",
        'data': {
            'WrapStyle': "None"
        },
        'success': function (data) {
            proceedCallback && proceedCallback(data);
        },
        'error': function (err) {
            errorCallback && errorCallback(err);
        }
    });
};

og.layer.GmxVector.prototype._initialize = function () {
    var p = this._planet;
    var that = this;

    p.camera.events.on("moveend", function (e) {
        if (that._extent.overlaps(that._planet.getViewExtent())) {
            that._checkVersion();
        }
    });

    og.layer.GmxVector.getLayerInfo(this.hostUrl, this._layerId, function (data) {
        that._gmxProperties = data.properties;
        that.setExtent(og.Geometry.getExtent(data.geometry));
        that._checkVersion();
    });
};

og.layer.GmxVector.prototype._checkVersion = function () {
    var p = this._planet;
    var e = p._viewExtentMerc;
    var bbox = [e.southWest.lon, e.southWest.lat, e.northEast.lon, e.northEast.lat];
    var layers = [{ "Name": this._layerId, "Version": -1 }];
    var zoom = p.maxCurrZoom;
    var that = this;
    og.ajax.request(this.hostUrl + this._checkVersionPath, {
        'type': "POST",
        'responseType': "json",
        'data': {
            'WrapStyle': "None",
            'bbox': bbox,
            'srs': "3857",
            'layers': layers,
            'zoom': zoom
        },
        'success': function (data) {
            that._checkVersionSuccess(data);
        },
        'error': function (err) {
            console.log(err);
        }
    });
};

og.layer.GmxVector.prototype._checkVersionSuccess = function(data){

};


/**
 * Start to load tile material.
 * @public
 * @virtual
 * @param {og.planetSegment.Material} material - Current material.
 */
og.layer.GmxVector.prototype.loadMaterial = function (material) {

    var seg = material.segment;

    if (this._isBaseLayer) {
        material.texture = seg._isNorth ? seg.planet.solidTextureOne : seg.planet.solidTextureTwo;
    } else {
        material.texture = seg.planet.transparentTexture;
    }

    if (this._planet.layerLock.isFree()) {
        material.isReady = false;
        material.isLoading = true;

        //
        // TODO: Get to the observer or something like this._planet._vectorTileCreator.add(material);
        //
    }
};

/**
 * Abort exact material loading.
 * @public
 * @param {og.planetSegment.Material} material - Segment material.
 */
og.layer.GmxVector.prototype.abortMaterialLoading = function (material) {
    material.isLoading = false;
    material.isReady = false;
};

og.layer.GmxVector.prototype.applyMaterial = function (material) {
    if (material.isReady) {
        return [0, 0, 1, 1];
    } else {

        !material.isLoading && this.loadMaterial(material);

        var segment = material.segment;
        var pn = segment.node,
            notEmpty = false;

        var mId = this._id;
        var psegm = material;
        while (pn.parentNode) {
            if (psegm && psegm.isReady) {
                notEmpty = true;
                break;
            }
            pn = pn.parentNode;
            psegm = pn.planetSegment.materials[mId];
        }

        if (notEmpty) {
            material.appliedNodeId = pn.nodeId;
            material.texture = psegm.texture;
            material.pickingMask = psegm.pickingMask;
            var dZ2 = 1.0 / (2 << (segment.tileZoom - pn.planetSegment.tileZoom - 1));
            return [
                segment.tileX * dZ2 - pn.planetSegment.tileX,
                segment.tileY * dZ2 - pn.planetSegment.tileY,
                dZ2,
                dZ2
            ];
        } else {
            if (material.textureExists && material._updateTexture) {
                material.texture = material._updateTexture;
                material.pickingMask = material._updatePickingMask;
            } else {
                material.texture = segment.planet.transparentTexture;
                material.pickingMask = segment.planet.transparentTexture;
            }
            return [0, 0, 1, 1];
        }
    }
};

og.layer.GmxVector.prototype.clearMaterial = function (material) {
    if (material.isReady) {
        var gl = material.segment.handler.gl;

        material.isReady = false;
        material.pickingReady = false;

        var t = material.texture;
        material.texture = null;
        t && !t.default && gl.deleteTexture(t);

        t = material.pickingMask;
        material.pickingMask = null;
        t && !t.default && gl.deleteTexture(t);

        t = material._updateTexture;
        material._updateTexture = null;
        t && !t.default && gl.deleteTexture(t);

        t = material._updatePickingMask;
        material._updatePickingMask = null;
        t && !t.default && gl.deleteTexture(t);
    }

    this.abortMaterialLoading(material);

    material.isLoading = false;
    material.textureExists = false;
};

