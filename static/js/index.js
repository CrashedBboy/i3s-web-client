let viewer;
let cameraChangedRegisterd = false;

$(document).ready(function () {
    viewer = new Cesium.Viewer("cesium-container", {
        baseLayerPicker: false,
        //terrainProvider: Cesium.createWorldTerrain(),
        fullscreenButton: false,
        scene3DOnly: true,
        timeline: false,
        animation: false,
        selectionIndicator: false,
        infoBox: true
    });

    viewer.camera.percentageChanged = 0.2;
});

$('#i3s-button').click(retrieveI3SLayer);

function retrieveI3SLayer() {

    let url = $('#i3s-url').val();

    if (!url || url == '') {
        log('invalid i3s layer URL');
        return;
    }

    log('retrieving i3s layer...');

    $.ajax({
        url: url,
        type: "GET",
        dataType: "json"
    })
        .done(function(layer) {
            console.log(layer);

            log('loaded i3s layer infomation - ' + layer.name);

            let layerExtent = viewer.entities.add({
                name: "i3s Layer Bounding",
                rectangle: {
                    coordinates: Cesium.Rectangle.fromDegrees(layer.store.extent[0], layer.store.extent[1], layer.store.extent[2], layer.store.extent[3]),
                    extrudedHeight: 50,
                    fill: false,
                    outline: true,
                    outlineColor: Cesium.Color.RED,
                    outlineWidth: 5
                }
            });
            viewer.camera.flyTo({
                destination: Cesium.Rectangle.fromDegrees(layer.store.extent[0], layer.store.extent[1], layer.store.extent[2], layer.store.extent[3]),
                orientation: {
                    heading: 0,
                    pitch: Cesium.Math.toRadians(-85),
                    roll: 0
                },
                complete: function() {
                    log('moved camera to layer "' + layer.name + '"');

                    // register camera change event
                    if (cameraChangedRegisterd == false) {
                        cameraChangedRegisterd = true;

                        viewer.camera.changed.addEventListener(function (data) {
                            retrieveNodesByFrustum();
                        });
                    }
                    
                }
            });
        })
        .fail(function(jqXHR, textStatus) {
            log('failed to retrieve i3s layer data, please check url again')
        });
}

function retrieveNodesByFrustum() {

    // get camera bounding

    let cameraRectangle = viewer.camera.computeViewRectangle();
    let west = Cesium.Math.toDegrees(cameraRectangle.west);
    let south = Cesium.Math.toDegrees(cameraRectangle.south);
    let east = Cesium.Math.toDegrees(cameraRectangle.east);
    let north = Cesium.Math.toDegrees(cameraRectangle.north);

    let middleLatitude = (south + north) / 2;
    let viewAreaWidth = getDistanceFromLatLon(middleLatitude, west, middleLatitude, east);

    // get camera height
    let cameraHeight = viewer.camera.positionCartographic.height;

    log('camera changed: [W,S,E,N] => [' + floor2Digit(west) + ', ' + floor2Digit(south) + ', ' + floor2Digit(east) + ', ' + floor2Digit(north) 
        + '], view area width(m) => '+ floor2Digit(viewAreaWidth) +', camera height => ' + floor2Digit(cameraHeight)
        + ', viewer[width, height] => [' + viewer.scene.drawingBufferWidth + ', ' + viewer.scene.drawingBufferHeight + ']');

    
}