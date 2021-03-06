let viewer;
let layerUrl;
let cameraChangedRegisterd = false;
let camerInfoShowed = false;
let nodeInfoShowed = false;
let displayTimestamp;

const DEBUG = false;
const SHOW_MBS = false;
const SHOW_BUILDING = true;
const MIN_ERROR = 1200;
const MAX_MEMORY_USED = 144;

let showingMBS = new Array();
let showingBuildings = new Array();
let i3sNodeTree = new Array();
let i3sNodePrimitiveAttributes = new Array();
let memoryUsed = 0;

$(document).ready(function () {
    viewer = new Cesium.Viewer("cesium-container", {
        baseLayerPicker: false,
        fullscreenButton: false,
        scene3DOnly: true,
        timeline: false,
        animation: false,
        selectionIndicator: false,
        infoBox: true,
        scene3DOnly: true
    });

    viewer.camera.percentageChanged = 0.5;
    viewer.scene.primitives.destroyPrimitives = true;

    viewer.screenSpaceEventHandler.setInputAction(function (movement) {
        var pickedFeature = viewer.scene.pick(movement.position);
        if (Cesium.defined(pickedFeature)) {
            pickNode(pickedFeature.primitive);
        }
   }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    if (DEBUG) {
        $('#get-node').show();
    }

    if (SHOW_MBS) {
        $('#legend-container').show();
    }

    $('#memory-max-text').text(MAX_MEMORY_USED);
    setInterval(function() {
        if (i3sNodeTree[0]) {
            getMemoryUsed();
        }
    }, 500);
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
        .done(function (layer) {
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
                destination: Cesium.Cartesian3.fromDegrees((layer.store.extent[0]+layer.store.extent[2])/2, (layer.store.extent[1]+layer.store.extent[3])/2, 400),
                orientation: {
                    heading: Cesium.Math.toRadians(45),
                    pitch: Cesium.Math.toRadians(-60),
                    roll: 0
                },
                complete: function () {
                    log('moved camera to layer "' + layer.name + '"');

                    // register camera change event
                    if (cameraChangedRegisterd == false) {
                        cameraChangedRegisterd = true;

                        viewer.camera.moveEnd.addEventListener(function (data) {
                            if (!DEBUG) {
                                retrieveNodesByFrustum();
                            }
                        });
                    }

                }
            });
        })
        .fail(function (jqXHR, textStatus) {
            log('failed to retrieve i3s layer data, please check url again')
        });
}

function retrieveNodesByFrustum() {

    displayTimestamp = new Date().valueOf();

    let localTimestamp = displayTimestamp;

    if (SHOW_MBS) {
        removeAllMBS();
    }

    if (!camerInfoShowed && DEBUG) {
        camerInfoShowed = true;
        $('#camera-info-container').show();
    }

    // get camera bounding
    log('compute camera infomation');
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

    if (DEBUG) {
        $('#camera-bounding-text').text('[' + floor2Digit(west) + ', ' + floor2Digit(south) + ', ' + floor2Digit(east) + ', ' + floor2Digit(north) + ']');
        $('#area-width-text').text(floor2Digit(viewAreaWidth) + 'm');
        $('#camera-height-text').text(floor2Digit(cameraHeight) + 'm');
        $('#screen-size-text').text('[' + viewer.scene.drawingBufferWidth + ', ' + viewer.scene.drawingBufferHeight + ']');
    }

    let rootNodeUrl = layerUrl + '/nodes/root';

    log('traversing node tree...');
    let retrieve = function (nodeUrl) {
        $.ajax({
            url: nodeUrl,
            type: "GET",
            dataType: "json"
        })
            .done(function (node) {
                if (localTimestamp != displayTimestamp) {
                    return;
                }

                if (node.error) {
                    return;
                }

                let nodeInTree = appendNode(node);

                if (node.lodSelection[0].metricType == "maxScreenThreshold") {
                    let lodStatus = lodJudge(nodeInTree, viewAreaHeight, viewAreaWidth, middleLatitude, middleLongitude, node);

                    switch (lodStatus) {
                        case 'OUT':
                            unloadSubTree(nodeInTree);
                            break;
                        case 'DIG':
                            setTimeout(function() {
                                unloadNodeByObject(nodeInTree);
                            }, 1000);
                            for (let i = 0; i < node.children.length; i++) {
                                retrieve(layerUrl + '/nodes/' + node.children[i].id);
                            }
                            break;
                        case 'DRAW':
                            processNode(node, nodeInTree);
                            setTimeout(function() {
                                for (let i = 0; i < nodeInTree.children.length; i++) {
                                    unloadSubTree(nodeInTree.children[i]);
                                }
                            }, 1000);
                            break;
                    }
                }
            });
    }
    
    retrieve(rootNodeUrl);
}

function lodJudge(nodeInTree, viewAreaHeight, viewAreaWidth, middleLatitude, middleLongitude, i3sNode) {

    let mbsLat = nodeInTree.mbs[1];
    let mbsLon = nodeInTree.mbs[0];
    let mbsH = nodeInTree.mbs[2];
    let mbsR = nodeInTree.mbs[3];

    let diagonal = Math.sqrt(viewAreaHeight * viewAreaHeight + viewAreaWidth * viewAreaWidth);
    let distance = getDistanceFromLatLon(middleLatitude, middleLongitude, mbsLat, mbsLon);

    if (distance > (diagonal + mbsR)) {
        return 'OUT';
    }
    if (getDistanceFromLatLon(middleLatitude, middleLongitude, mbsLat, middleLongitude) > (viewAreaHeight * 0.5 + mbsR)) {
        return 'OUT';
    }
    if (getDistanceFromLatLon(middleLatitude, middleLongitude, middleLatitude, mbsLon) > (viewAreaWidth * 0.5 + mbsR)) {
        return 'OUT';
    }

    if (nodeInTree.lodMaxError == 0) {
        return 'DIG';
    } else {

        // calcualte maxScreenThreshold and mbs

        let cameraHeading = viewer.camera.heading % Math.PI; // in radians
        let distanceScale = (1 / Math.cos(cameraHeading));

        let distancesPerDegree = getDistancePerDegree(mbsLat, mbsLon);
        let objWest = mbsLon - (mbsR / distancesPerDegree.longitude);
        let objWestPixelLocation = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, Cesium.Cartesian3.fromDegrees(objWest, mbsLat, mbsH));
        if (!objWestPixelLocation) {
            objWestPixelLocation = {x: 0, y: 0};
        }
        let objEast = mbsLon + (mbsR / distancesPerDegree.longitude);
        let objEastPixelLocation = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, Cesium.Cartesian3.fromDegrees(objEast, mbsLat, mbsH));
        if (!objEastPixelLocation) {
            objEastPixelLocation = {x: 0, y: 0};
        }

        let pixelDistance = Math.abs((objEastPixelLocation.x - objWestPixelLocation.x) * distanceScale);

        let maxError = nodeInTree.lodMaxError < MIN_ERROR? MIN_ERROR: nodeInTree.lodMaxError;

        if (pixelDistance > maxError) {
            if (!i3sNode && nodeInTree.children.length > 0) {
                return 'DIG';
            } else if (i3sNode && i3sNode.children) {
                return 'DIG';
            }
            return 'DRAW';
        }

        return 'DRAW';
    }
}

function processNode(node, nodeInTree) {

    let color = getLevelColor(node);

    if (SHOW_MBS) {
        let mbs = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(node.mbs[0], node.mbs[1], node.mbs[2]),
            ellipsoid: {
                radii: new Cesium.Cartesian3(node.mbs[3], node.mbs[3], node.mbs[3]),
                material: color
            }
        });

        showingMBS.push(mbs);
    }

    if (SHOW_BUILDING) {

        if (nodeInTree.processed) {
            if (!nodeInTree.show) {
                reloadNode(nodeInTree);
            }
            return;
        }
    
        $.ajax({
            url: layerUrl + '/nodes/' + node.id + '/' + node.featureData[0].href,
            type: 'GET',
            dataType: 'json'
        }).done(function (featureData) {
    
            $.ajax({
                url: layerUrl + '/nodes/' + node.id + '/' + node.geometryData[0].href,
                xhrFields: {
                    responseType: "arraybuffer"
                },
                processData: false
            }).done(function (geometryBuffer) {

                let features = featureData.featureData;
                let geometryData = featureData.geometryData[0];
                let vertexAttributes = geometryData.params.vertexAttributes;
                let textureUrl = layerUrl + '/nodes/' + node.id + '/' + node.textureData[0].href;
                let instances = new Array();
                let memory = 0;
    
                let vertexPerFeature = 3;
                if (geometryData.params.type == 'triangles') {
                    vertexPerFeature = 3;
                } else if (geometryData.params.type == 'lines') {
                    vertexPerFeature = 2;
                } else if (geometryData.params.type == 'points') {
                    vertexPerFeature = 1;
                }
    
                for (let i = 0; i < features.length; i++) {
                    let feature = features[i];
                    let faceRange = feature.geometries[0].params.faceRange; // faceRange is the index of faces(triangles): [first, last]
                    let featureVertices = new Float32Array(
                        geometryBuffer,
                        vertexAttributes.position.byteOffset + faceRange[0] * (vertexPerFeature * vertexAttributes.position.valuesPerElement) * Float32Array.BYTES_PER_ELEMENT, // offset
                        (faceRange[1] - faceRange[0] + 1) * (vertexPerFeature * vertexAttributes.position.valuesPerElement) // count
                    );
    
                    let minHeight = featureVertices.filter( function(coordinate, index) {
                        return (index + 1) % 3 == 0;
                    }).reduce( function(accumulator, currentValue) {
                        return Math.min(accumulator, currentValue);
                    });
    
                    offsetVertices(featureVertices, node.mbs[0], node.mbs[1], -minHeight); // move each vertices to right coordinates
    
                    let cartesianPositions = Cesium.Cartesian3.fromDegreesArrayHeights(featureVertices);
                    let positions = new Float64Array(featureVertices.length);
                    
                    cartesianToTypedArray(cartesianPositions, positions);
    
                    let normals = new Float32Array(
                        geometryBuffer,
                        vertexAttributes.normal.byteOffset + faceRange[0] * (vertexPerFeature * vertexAttributes.normal.valuesPerElement) * Float32Array.BYTES_PER_ELEMENT,
                        (faceRange[1] - faceRange[0] + 1) * (vertexPerFeature * vertexAttributes.normal.valuesPerElement)
                    );

                    let uv0s = new Float32Array(
                        geometryBuffer,
                        vertexAttributes.uv0.byteOffset + faceRange[0] * (vertexPerFeature * vertexAttributes.uv0.valuesPerElement) * Float32Array.BYTES_PER_ELEMENT,
                        (faceRange[1] - faceRange[0] + 1) * (vertexPerFeature * vertexAttributes.uv0.valuesPerElement)
                    );

                    // flip the v-coordinate (v = 1 - v), the v directions in i3s and cesium are reversed 
                    for (let j = 0; j < uv0s.length; j+=2) {
                        uv0s[j+1] = 1 - uv0s[j+1];
                    }

                    let geometry = new Cesium.Geometry({
                        attributes: {
                            position: new Cesium.GeometryAttribute({
                                componentDatatype: Cesium.ComponentDatatype.DOUBLE,
                                componentsPerAttribute: 3,
                                values: positions
                            }),
                            normal: new Cesium.GeometryAttribute({
                                componentDatatype: Cesium.ComponentDatatype.FLOAT,
                                componentsPerAttribute: 3,
                                values: normals
                            }),
                            st: new Cesium.GeometryAttribute({
                                componentDatatype: Cesium.ComponentDatatype.FLOAT,
                                componentsPerAttribute: 2,
                                values: uv0s
                            })
                        },
                        primitiveType: Cesium.PrimitiveType.TRIANGLES,
                        boundingSphere: Cesium.BoundingSphere.fromVertices(positions)
                    });
    
                    let instance = new Cesium.GeometryInstance({
                        geometry: geometry,
                        show: new Cesium.ShowGeometryInstanceAttribute(true),
                        id: feature.id
                    });
    
                    instances.push(instance);
                    memory += (positions.length*Float64Array.BYTES_PER_ELEMENT 
                        + normals.length*Float32Array.BYTES_PER_ELEMENT 
                        + uv0s.length*Float32Array.BYTES_PER_ELEMENT) / 1e6; // in MBs
                }

                $.ajax({
                    url: layerUrl + '/nodes/' + node.id + '/' + node.sharedResource.href,
                    type: 'GET',
                    dataType: 'json'
                }).done(function (sharedResource) {

                    memory += (sharedResource.textureDefinitions[Object.keys(sharedResource.textureDefinitions)[0]].images[0].length[0] / 1e6);

                    var primitive = new Cesium.Primitive({
                        geometryInstances: instances,
                        appearance: new Cesium.MaterialAppearance({
                            translucent: false,
                            closed: true,
                            material: new Cesium.Material({
                                fabric: {
                                    type: 'Image',
                                    uniforms: {
                                        image: textureUrl
                                    }
                                }
                            })
                        }),
                        interleave: false,
                        vertexCacheOptimize: true,
                        compressVertices: true,
                        releaseGeometryInstances: false,
                        allowPicking: true
                    });
                    primitive.id = node.id;
                    primitive.level = node.level;
                    primitive.mbs = node.mbs;

                    nodeInTree.processed = true;
                    nodeInTree.memory = memory;
                    nodeInTree.geometryInstances = instances;
                    nodeInTree.textureUrl = textureUrl;

                    if (memoryUsed + memory <= MAX_MEMORY_USED) {
                        viewer.scene.primitives.add(primitive);
                        nodeInTree.show = true;
                    } else {
                        nodeInTree.show = false;
                    }
                });
            });
        });
    }
}

function removeAllMBS() {
    for (let i = 0; i < showingMBS.length; i++) {
        viewer.entities.remove(showingMBS[i]);
    }
    showingMBS = new Array();
}

function offsetVertices(vertices, xOffset, yOffset, zOffset) {
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i] += xOffset;
        vertices[i + 1] += yOffset;
        vertices[i + 2] += zOffset
    }
}

function cartesianToTypedArray(cartesianArray, typedArray) {
    for (let i = 0; i < cartesianArray.length; i++) {
        typedArray[i * 3] = cartesianArray[i].x;
        typedArray[i * 3 + 1] = cartesianArray[i].y;
        typedArray[i * 3 + 2] = cartesianArray[i].z
    }
}

function searchNode(id) {
    let target = null;
    let ids = id.split('-');

    let dig = function (node) {

        if (target) {
            return;
        }

        let keepGoing = false;
        if (node.id == id) {
            target = node;
            return;
        } else if (node.id == 'root') {
            keepGoing = true;
        } else {
            let partId = ids[0];
            for (let i = 1; i < node.level - 1; i++) {
                partId = partId + '-' + ids[i];
            }

            if (node.id == partId) {
                keepGoing = true;
            }
        }

        if (keepGoing) {
            for (let i = 0; i < node.children.length; i++) {
                dig(node.children[i]);
            }
        }
    }

    for (let j = 0; j < i3sNodeTree.length; j++) {
        dig(i3sNodeTree[j]);
    }

    return target;
}

function appendNode(node) {

    let searched = searchNode(node.id);
    if (searched) {
        return searched;
    }

    let newNode = {
        id: node.id,
        level: node.level,
        mbs: node.mbs,
        lodMaxError: node.lodSelection[0].maxError,
        children: [],
        processed: false,
        show: false,
        memory: false
    };

    if (node.parentNode == null) {
        i3sNodeTree.push(newNode);
        return i3sNodeTree[i3sNodeTree.length - 1];
    } else {
        let parentNode = searchNode(node.parentNode.id);
        if (parentNode) {
            parentNode.children.push(newNode);
            return parentNode.children[parentNode.children.length - 1];
        } else {
            i3sNodeTree.push(newNode);
            return i3sNodeTree[i3sNodeTree.length - 1];
        }
        
    }
}

function unloadNodeById(id) {
    let treeNode = searchNode(id);

    if (treeNode) {
        treeNode.show = false;
    }

    for (let i = 0; i < viewer.scene.primitives._primitives.length; i++) {
        if (viewer.scene.primitives._primitives[i].id == id) {
            viewer.scene.primitives.remove(viewer.scene.primitives._primitives[i]);
            break;
        }
    }
}

function unloadNodeByObject(nodeInTree) {

    if (nodeInTree) {
        nodeInTree.show = false;
    }

    for (let i = 0; i < viewer.scene.primitives._primitives.length; i++) {
        if (viewer.scene.primitives._primitives[i].id == nodeInTree.id) {
            viewer.scene.primitives.remove(viewer.scene.primitives._primitives[i]);
            break;
        }
    }
}

function reloadNode(treeNode) {

    let primitive = new Cesium.Primitive({
        geometryInstances: treeNode.geometryInstances,
        appearance: new Cesium.MaterialAppearance({
            translucent: false,
            closed: true,
            material: new Cesium.Material({
                fabric: {
                    type: 'Image',
                    uniforms: {
                        image: treeNode.textureUrl
                    }
                }
            })
        }),
        interleave: false,
        vertexCacheOptimize: true,
        compressVertices: true,
        releaseGeometryInstances: false,
        allowPicking: false
    });
    primitive.id = treeNode.id;
    primitive.level = treeNode.level;
    primitive.mbs = treeNode.mbs;
    viewer.scene.primitives.add(primitive);

    treeNode.show = true;
}

function unloadSubTree(nodeInTree) {
    if (nodeInTree.show) {
        unloadNodeByObject(nodeInTree);
    }

    for (let i = 0; i < nodeInTree.children.length; i++) {
        unloadSubTree(nodeInTree.children[i]);
    }
}

function getMemoryUsed() {
    let memoryTotal = 0;
    let dig = function(node) {
        if (node.show && node.memory) {
            memoryTotal += node.memory;
        }
        for (let i = 0; i < node.children.length; i++) {
            dig(node.children[i]);
        }
    }
    dig(i3sNodeTree[0]);
    memoryUsed = memoryTotal;

    let percent = memoryTotal / MAX_MEMORY_USED;

    let colorString = 'rgb(' + 192*percent + ',64,' + 192*(1-percent) + ')';

    $('#memory-mb-text').text(Math.floor(memoryTotal));
    $('#memory-percent-text').text(Math.floor( percent * 100 ));
    $('#memory-bar').css('width', percent * 100 + '%').css('background-color', colorString);;
    return memoryTotal;
}

function pickNode(pickedPrimitive) {

    if (!nodeInfoShowed) {
        $('#node-info-container').fadeIn();
        nodeInfoShowed = true;
    }

    let node = searchNode(pickedPrimitive.id);
    $('#node-info-id, #node-info-level, #node-info-position, #node-info-size').fadeOut();

    setTimeout(() => {
        $('#node-info-id').fadeIn().text(pickedPrimitive.id);
        $('#node-info-level').fadeIn().text(pickedPrimitive.level);
        $('#node-info-position').fadeIn().text(Math.floor(pickedPrimitive.mbs[1]*100)/100 + ', ' + Math.floor(pickedPrimitive.mbs[0]*100)/100);
        $('#node-info-size').fadeIn().text( (Math.floor(node.memory*1000)/1000) + 'MB');
        
    }, 300);
}