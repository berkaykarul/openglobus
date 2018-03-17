'use strict';

import { Globe } from '../../src/og/Globe.js';
import { GlobusTerrain } from '../../src/og/terrain/GlobusTerrain.js';
import { XYZ } from '../../src/og/layer/XYZ.js';

function createGrid(center) {
    var grid = [];

    var size = 0.26;
    var cell = 0.005;

    var vert = [];
    for (var i = 0; i < size; i += cell) {
        var par = [],
            mer = [];
        for (var j = 0; j < size; j += cell) {
            par.push(new og.LonLat(center.lon + j - size / 2, center.lat + i - size / 2));
            mer.push(new og.LonLat(center.lon + i - size / 2, center.lat + j - size / 2));
        }
        grid.push(par);
        grid.push(mer);
    }
    return grid;
};

var center = og.lonLat(8.19, 46.73);

var polylineEntity = new og.Entity({
    'polyline': {
        'pathLonLat': createGrid(center),
        'thickness': 3,
        'color': "rgba(68, 157, 205, 0.92)",
        'isClosed': false
    }
});

var pointLayer = new og.layer.Vector("points", {
    'groundAlign': true,
    'entities': [
        polylineEntity
    ],
    'async': false
});


var osm = new og.layer.XYZ("OpenStreetMap", {
    specular: [0.0003, 0.00012, 0.00001],
    shininess: 20,
    diffuse: [0.89, 0.9, 0.83],
    isBaseLayer: true,
    url: "http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    visibility: true,
    attribution: 'Data @ OpenStreetMap contributors, ODbL'
});

globus = new og.Globus({
    "target": "globus",
    "name": "Earth",
    "terrain": new og.terrainProvider.TerrainProvider("OpenGlobus"),
    "layers": [osm, pointLayer]
});

var pickingObject = null;
var startPos, endPos;

pointLayer.events.on("mouseenter", function (e) {
    globus.planet.renderer.handler.gl.canvas.style.cursor = "pointer";
});

pointLayer.events.on("mouseleave", function (e) {
    globus.planet.renderer.handler.gl.canvas.style.cursor = "default";
});

pointLayer.events.on("ldown", function (e) {
    globus.planet.renderer.controls[0].deactivate();

    startPos = globus.planet.getLonLatFromPixelTerrain(e);
    pickingObject = e.pickingObject;
});

pointLayer.events.on("lup", function (e) {
    globus.planet.renderer.controls[0].activate();
    center.lon += endPos.lon - startPos.lon;
    center.lat += endPos.lat - startPos.lat;
    pickingObject = null;
});

globus.planet.renderer.events.on("mousemove", function (e) {
    if (pickingObject) {
        endPos = globus.planet.getLonLatFromPixelTerrain(e);
        if (endPos) {
            dlon = endPos.lon - startPos.lon;
            dlat = endPos.lat - startPos.lat;
            var grid = createGrid(new og.LonLat(center.lon + dlon, center.lat + dlat));
            polylineEntity.polyline.setPathLonLat(grid, true);
        }
    }
});

globus.planet.viewExtentArr([8.08, 46.72, 8.31, 46.75]);
