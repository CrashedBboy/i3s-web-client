function UrlBuilder(protocol, host) {
    var base = {
        protocol: protocol,
        host: host,
        port: null,
        path: null
    };
    var params = [];
    var methods = {
        port: function(port) {
            base.port = port;
            return this
        },
        path: function(path) {
            base.path = path;
            return this
        },
        param: function(name, value) {
            params.push(name + "=" + value + "&");
            return this
        },
        build: function() {
            var result = base.protocol + "://";
            result += base.host;
            if (base.port) {
                result += ":" + base.port
            }
            if (base.path) {
                result += "/" + base.path
            }
            if (params) {
                result += "?" + params.join("")
            }
            return result.substring(0, result.length - 1)
        }
    };
    return methods
}
function StatusBar() {
    this.beginProcess = function(message) {
        if ($("#statusBarLoader").is(":hidden")) {
            $("#statusBarLoader").show()
        }
        $("#statusBarMessage").text(message + "...")
    }
    ;
    this.endProcess = function() {
        $("#statusBarLoader").hide();
        $("#statusBarMessage").empty()
    }
    ;
    this.display = function(message) {
        $("#statusBarMessage").text(message)
    }
}
function Logger(div) {
    this.logLevel = {
        i: "info",
        e: "error"
    };
    this.style = {
        i: "bg-info",
        e: "bg-danger"
    };
    this.binding = div;
    this.log = function(level, message) {
        var time = (new Date).toString().split(" ")[4];
        this.binding.append('<p class="' + this.style[level] + '">[' + this.logLevel[level] + "] " + "[" + time + "] " + message);
        this.binding.scrollTop(this.binding[0].scrollHeight)
    }
}
function CSVParser(url) {
    var csvUrl = url;
    var dict;
    this.fetch = function() {
        return $.ajax({
            type: "GET",
            url: csvUrl,
            dataType: "text"
        })
    }
    ;
    this.parse = function(csvData) {
        return new Promise(function(resolve, reject) {
            var lines = csvData.split(/\r\n|\n/);
            var headings = lines[0].split(",");
            var line, id, parentId, heatDemand;
            dict = {};
            for (let i = 1, len = lines.length; i < len; i++) {
                line = lines[i].split(",");
                id = line[0].trim();
                parentId = line[1].trim();
                heatDemand = line[2].trim();
                if (id) {
                    dict[id] = parseFloat(heatDemand)
                }
            }
            resolve()
        }
        )
    }
    ;
    this.query = function(key) {
        return dict[key]
    }
}
function HeatDemandClassifier() {
    this.less50 = rgbNormalizer(100, 149, 237);
    this.less100 = rgbNormalizer(0, 255, 0);
    this.less150 = rgbNormalizer(255, 255, 0);
    this.less200 = rgbNormalizer(255, 128, 0);
    this.more200 = rgbNormalizer(255, 0, 0);
    this.default = rgbNormalizer(169, 169, 169);
    this.classify = function(demand) {
        var result;
        switch (true) {
        case demand <= 50:
            result = this.less50;
            break;
        case demand <= 100:
            result = this.less100;
            break;
        case demand <= 150:
            result = this.less150;
            break;
        case demand <= 200:
            result = this.less200;
            break;
        case demand > 200:
            result = this.more200;
            break;
        default:
            result = this.default
        }
        return result
    }
}
function rgbNormalizer(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    return {
        red: r,
        green: g,
        blue: b
    }
}
function HftServices() {
    this.getFeatureInfo = function(id, successCallback, errorCallback) {
        var url = new UrlBuilder("http","81.169.187.7").path("api/v2/endpoint").param("service", "3DPS").param("version", "1.0").param("request", "GetFeatureInfoByObjectId").param("objectid", id).param("dataset", "es_dataset").build();
        $.ajax({
            url: url,
            type: "GET",
            success: function(data) {
                successCallback(data)
            },
            error: function(error) {
                errorCallback(error)
            }
        })
    }
    ;
    this.simulate = function(attributes, successCallback, errorCallback) {
        var url = new UrlBuilder("http","81.169.187.7").port("9000").path("soap").param("gmlid", attributes["gml_id"]).param("ah", attributes["attic_heating"]).param("b", attributes["basement"]).param("bh", attributes["basement_heating"]).param("bt", attributes["buildingtype"]).param("fr", attributes["flat_roof"]).param("f", attributes["alkis_code"]).param("hv", attributes["heated_volume"]).param("r", "no").param("sc", attributes["storey_number"]).param("wr", "0.2").param("wt", "0").param("yoc", attributes["yearofconstruction"]).build();
        $.ajax({
            url: url,
            type: "GET",
            dataType: "text",
            success: function(data) {
                successCallback(data)
            },
            error: function(error) {
                errorCallback(error)
            }
        })
    }
}
function Legend(anchor, id) {
    var anchor = anchor;
    var id = id;
    var topGroupId = id + "-top-group";
    var bottomGroupId = id + "-bottom-group";
    var isTopGroupUsed = false;
    var isBottomGroupUsed = false;
    var title;
    var subtitle;
    var endnote;
    var entries = [];
    var location = {
        top: "initial",
        bottom: "initial",
        left: "initial",
        right: "initial"
    };
    var visible = "initial";
    var applyStyle = function() {
        $("#" + id).addClass("legend");
        $("#" + id).css({
            top: location.top,
            bottom: location.bottom,
            left: location.left,
            right: location.right,
            display: visible
        })
    };
    this.setTop = function(value) {
        location.top = value
    }
    ;
    this.setBottom = function(value) {
        location.bottom = value
    }
    ;
    this.setLeft = function(value) {
        location.left = value
    }
    ;
    this.setRight = function(value) {
        location.right = value
    }
    ;
    this.setTitle = function(text) {
        title = text;
        isTopGroupUsed = true
    }
    ;
    this.setSubtitle = function(text) {
        subtitle = text;
        isTopGroupUsed = true
    }
    ;
    this.setEndnote = function(text) {
        endnote = text;
        isBottomGroupUsed = true
    }
    ;
    this.setVisible = function(value) {
        if (!value) {
            visible = "none"
        }
    }
    ;
    this.show = function() {
        $("#" + id).css({
            display: "initial"
        })
    }
    ;
    this.hide = function() {
        $("#" + id).css({
            display: "none"
        })
    }
    ;
    this.addEntry = function(rgb, label) {
        entries.push({
            rgb: rgb,
            label: label
        })
    }
    ;
    this.render = function() {
        $("#" + anchor).append('<div id="' + id + '"></div>');
        if (isTopGroupUsed) {
            $("#" + id).append('<div id="' + topGroupId + '" class="legend-top-group"></div>');
            if (title) {
                $("#" + topGroupId).append('<div class="legend-title">' + title + "</div>")
            }
            if (subtitle) {
                $("#" + topGroupId).append('<div class="legend-subtitle">' + subtitle + "</div>")
            }
        }
        for (var i = 0, len = entries.length; i < len; i++) {
            var symbolHtml = '<div class="legend-symbol" style="background-color:rgb(' + entries[i].rgb.join(",") + ')"></div>';
            var labelHtml = '<div class="legend-label">' + entries[i].label + "</div>";
            $("#" + id).append('<div class="legend-entry">' + symbolHtml + labelHtml + "</div>")
        }
        if (isBottomGroupUsed) {
            $("#" + id).append('<div id="' + bottomGroupId + '" class="legend-bottom-group"></div>');
            $("#" + bottomGroupId).append('<div class="legend-endnote">' + endnote + "</div>")
        }
        applyStyle()
    }
}
function int2ip(ipInt) {
    return (ipInt >>> 24) + "." + (ipInt >> 16 & 255) + "." + (ipInt >> 8 & 255) + "." + (ipInt & 255)
}
