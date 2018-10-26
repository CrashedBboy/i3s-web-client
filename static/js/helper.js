function log(text, rolldown = true) {
    $('#log').append('[' + new Date().toLocaleTimeString() + '] ' + text + '<br/>');
    
    if (rolldown) {
        $('#log').scrollTop($('#log').prop('scrollHeight'));
    }
}

function floor2Digit(num) {
    return Math.floor(num * 100) / 100;
}

function getDistanceFromLatLon(lat1, lon1, lat2, lon2) {
    var R = 6371000; // Radius of the earth
    var dLat = Cesium.Math.toRadians(lat2 - lat1);
    var dLon = Cesium.Math.toRadians(lon2 - lon1);
    var a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(Cesium.Math.toRadians(lat1)) * Math.cos(Cesium.Math.toRadians(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in 
    return d;
}