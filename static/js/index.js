let viewer;
let layerUrl;
let cameraChangedRegisterd = false;
let showingEntities = new Array();
let camerInfoShowed = false;
let displayTimestamp;

let DEBUG = false;

$(document).ready(function () {
    viewer = new Cesium.Viewer("cesium-container", {
        baseLayerPicker: false,
        fullscreenButton: false,
        scene3DOnly: true,
        timeline: false,
        animation: false,
        selectionIndicator: false,
        infoBox: false
    });

    viewer.camera.percentageChanged = 0.2;

    if (DEBUG) {
        $('#get-node').show();
    }
});

$('#i3s-button').click(retrieveI3SLayer);

$('#get-node').click(retrieveNodesByFrustum);

function retrieveI3SLayer() {

    let url = $('#i3s-url').val();

    if (!url || url == '') {
        log('invalid i3s layer URL');
        return;
    }

    layerUrl = url;

    log('retrieving i3s layer...');

    $.ajax({
        url: url,
        type: "GET",
        dataType: "json"
    })
        .done(function(layer) {
            console.log(layer);

            log('loaded i3s layer infomation - ' + layer.name);

            viewer.entities.add({
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
                            if (!DEBUG) {
                                retrieveNodesByFrustum();
                            }
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

    displayTimestamp = new Date().valueOf();

    let localTimestamp = displayTimestamp;

    removeAllEntities();

    if (!camerInfoShowed) {
        camerInfoShowed = true;
        $('#camera-info-container').show();
    }

    // get camera bounding
    let cameraRectangle = viewer.camera.computeViewRectangle();
    let west = Cesium.Math.toDegrees(cameraRectangle.west);
    let south = Cesium.Math.toDegrees(cameraRectangle.south);
    let east = Cesium.Math.toDegrees(cameraRectangle.east);
    let north = Cesium.Math.toDegrees(cameraRectangle.north);

    let middleLatitude = (south + north) / 2;
    let viewAreaWidth = getDistanceFromLatLon(middleLatitude, west, middleLatitude, east);
    let middleLongitude = (west + east) / 2;
    let viewAreaHeight = getDistanceFromLatLon(south, middleLongitude, north, middleLongitude);

    // get camera height
    let cameraHeight = viewer.camera.positionCartographic.height;

    $('#camera-bounding-text').text('[' + floor2Digit(west) + ', ' + floor2Digit(south) + ', ' + floor2Digit(east) + ', ' + floor2Digit(north) + ']');
    $('#area-width-text').text(floor2Digit(viewAreaWidth) + 'm');
    $('#camera-height-text').text(floor2Digit(cameraHeight) + 'm');
    $('#screen-size-text').text('[' + viewer.scene.drawingBufferWidth + ', ' + viewer.scene.drawingBufferHeight + ']');

    let rootNodeUrl = layerUrl + '/nodes/root';

    let retrieve = function(nodeUrl) {
        $.ajax({
            url: nodeUrl,
            type: "GET",
            dataType: "json"
        })
            .done(function (node) {
                console.log('globalTimestamp: ' + displayTimestamp + ', localTimestamp: ' + localTimestamp);
                if (localTimestamp != displayTimestamp) {
                    console.log('data has been expired, aborted');
                    return;
                }

                if (node.error) {
                    console.log('wrong node url, break');
                    return;
                }

                let mbsLat = node.mbs[1];
                let mbsLon = node.mbs[0];
                let mbsH = node.mbs[2];
                let mbsR = node.mbs[3];

                let diagonal = Math.sqrt(viewAreaHeight*viewAreaHeight + viewAreaWidth*viewAreaWidth);
                let distance = getDistanceFromLatLon(middleLatitude, middleLongitude, mbsLat, mbsLon);

                if (distance > (diagonal + mbsR) ) {
                    console.log('node is out of range, break');
                    return;
                }
                if (getDistanceFromLatLon(middleLatitude, middleLongitude, mbsLat, middleLongitude) > (viewAreaHeight*0.5 + mbsR)) {
                    console.log('node is out of range, break');
                    return;
                }
                if (getDistanceFromLatLon(middleLatitude, middleLongitude, middleLatitude, mbsLon) > (viewAreaWidth*0.5 + mbsR)) {
                    console.log('node is out of range, break');
                    return;
                }
                
                if (node.lodSelection[0].metricType == "maxScreenThreshold") {

                    let goFurther = false;
                    if (node.lodSelection[0].maxError == 0) {
                        goFurther = true;
                    } else {
                        
                        // calcualte maxScreenThreshold and mbs
                        let objScreenSize;
                        let objWidth;
                        let objHeight;
                        if (mbsH != 0 && Math.abs(mbsH) < mbsR) {
                            objWidth = Math.sqrt(mbsR*mbsR - mbsH*mbsH) * 2;
                            objHeight = 0;
                        } else {
                            objWidth = mbsR * 2;
                            objHeight = mbsH;
                        }

                        objScreenSize = viewer.scene.drawingBufferWidth * (objWidth * cameraHeight) / (viewAreaWidth * (cameraHeight - objHeight));
    
                        if (objScreenSize > node.lodSelection[0].maxError && node.children) {
                            goFurther = true;
                        }
                    }
                
                    if (goFurther) {
                        for (let i = 0; i < node.children.length; i++) {
                            retrieve(layerUrl + '/nodes/' + node.children[i].id);
                        }
                    } else {
                        processNode(node);
                    }
                }
            })
            .fail(function (jqXHR, textStatus) {
                console.error(jqXHR);
                console.error(textStatus);
            });
    }

    retrieve(rootNodeUrl);
}

function processNode(node) {
    console.log(node);

    let entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(node.mbs[0], node.mbs[1], node.mbs[2]),
        ellipsoid : {
            radii : new Cesium.Cartesian3(node.mbs[3], node.mbs[3], node.mbs[3]),
            material : getLevelColor(node)
        }
    });

    showingEntities.push(entity);
}

function removeAllEntities() {
    for (let i = 0; i < showingEntities.length; i++) {
        viewer.entities.remove(showingEntities[i]);
    }
    showingEntities = new Array();
}