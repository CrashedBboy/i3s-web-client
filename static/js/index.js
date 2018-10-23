let viewer;

$(document).ready(function() {
    viewer = new Cesium.Viewer("cesium-container",{
        baseLayerPicker: false,
        terrainProvider : Cesium.createWorldTerrain(),
        fullscreenButton: false,
        scene3DOnly: true,
        timeline: false,
        animation: false,
        selectionIndicator: true,
        infoBox: true
    });
});