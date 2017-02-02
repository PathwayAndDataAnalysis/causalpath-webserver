//TODO: change name from sbgn
(function ($$) {
    var sbgnShapes = $$.sbgnShapes = {

        'cgfNode': true,
        'cgfArrow': true
    };

    var totallyOverridenNodeShapes = $$.totallyOverridenNodeShapes = {

        // 'cgfNode': true

    };

    $$.sbgn = {
    };


    $$.sbgn.drawText = function (context, textProp, truncate) {
        var oldFont = context.font;
        context.font = textProp.font;
        context.textAlign = "center";
        context.textBaseline = "middle";
        var oldStyle = context.fillStyle;
        context.fillStyle = textProp.color;
        var oldOpacity = context.globalAlpha;
        context.globalAlpha = textProp.opacity;
        var text;

        textProp.label = textProp.label || '';

        if (truncate == false) {
            text = textProp.label;
        } else {
            text = truncateText(textProp, context.font);
        }

        context.fillText(text, textProp.centerX, textProp.centerY);
        context.fillStyle = oldStyle;
        context.font = oldFont;
        context.globalAlpha = oldOpacity;
        //context.stroke();
    };

    window.cyMath.calculateDistance = function (point1, point2) {
        var distance = Math.pow(point1[0] - point2[0], 2) + Math.pow(point1[1] - point2[1], 2);
        return Math.sqrt(distance);
    };

    $$.sbgn.colors = {
        clone: "#a9a9a9",
        association: "#6B6B6B",
        port: "#6B6B6B"
    };




    //we need to force opacity to 1 since we might have state and info boxes.
    //having opaque nodes which have state and info boxes gives unpleasent results.
    $$.sbgn.forceOpacityToOne = function (node, context) {
        var parentOpacity = node.effectiveOpacity();
        if (parentOpacity === 0) {
            return;
        }

        context.fillStyle = "rgba("
            + node._private.style["background-color"].value[0] + ","
            + node._private.style["background-color"].value[1] + ","
            + node._private.style["background-color"].value[2] + ","
            + (1 * node.css('opacity') * parentOpacity) + ")";
    };


    $$.sbgn.drawEllipsePath = function (context, x, y, width, height) {
        window.cyNodeShapes['ellipse'].drawPath(context, x, y, width, height);
    };





    window.cyStyfn.types.nodeShape.enums.push('cgfNode');

    window.cyStyfn.types.arrowShape.enums.push('cgfArrow');

    $$.sbgn.registerSbgnArrowShapes = function () {

        window.cyArrowShapes['cgfArrow'] = jQuery.extend({}, window.cyArrowShapes['triangle']);
        window.cyArrowShapes['cgfArrow'].points = [
            -0.08, -0.12,
            0, 0,
            0.08, -0.12

        ];
    };

    $$.sbgn.registerSbgnNodeShapes = function () {
        // window.cyArrowShapes['cgfArrow'] = window.cyArrowShapes['diamond'];

        window.cyNodeShapes['cgfNode'] = {
            draw: function (context, node) {

                var centerX = node._private.position.x;
                var centerY = node._private.position.y;
                var width = node.width() ;
                var height = node.height();



             //   context.fillStyle = node.css('background-color');
             //   context.strokeStyle = node.css('border-color');

                //      window.cyNodeShapes['roundrectangle'].draw(context, centerX, centerY, width, height);
                window.cyRenderer.drawRoundRectanglePath(context,  centerX, centerY, width, height);


                context.fill();
                 context.stroke();




                if(node._private.data.sites){



                    node._private.data.sites.forEach(function(site){

                        if(site.bbox) {
                            var siteWidth = site.bbox.w;
                            var siteHeight = site.bbox.h;

                            var siteCenterX = site.bbox.x;
                            var siteCenterY = site.bbox.y;


                            if (site.selected)
                                context.fillStyle = "#FFCC66";
                            else
                                context.fillStyle = site.siteBackgroundColor;

                            context.strokeStyle = site.siteBorderColor;
                            window.cyRenderer.drawEllipsePath(context, siteCenterX, siteCenterY, siteWidth, siteHeight);
                            context.fill();
                            context.stroke();


                            var textProp = {};
                            var fontSize = parseInt(siteHeight / 1.5);
                            textProp.font = fontSize + "px Arial";
                            textProp.color = site.siteTextColor;
                            if (!textProp.color)
                                textProp.color = 'black';
                            textProp.label = site.siteText;
                            textProp.centerX = siteCenterX;
                            textProp.centerY = siteCenterY;
                            textProp.opacity = 1;
                            $$.sbgn.drawText(context, textProp, false);


                            context.stroke();
                        }


                    });
                }



                //FIXME
                //This is a temporary workaround for drawing order
                $$.sbgn.drawEllipse(context, centerX, centerY, 0, 0);



            },

            intersectLine: window.cyNodeShapes["roundrectangle"].intersectLine,
            checkPoint: window.cyNodeShapes["roundrectangle"].checkPoint,
            // intersectLine:function (node, x, y){
            //     // //TODO: consider p sites
            //     //
            //     var nodeX = node._private.position.x;
            //     var nodeY = node._private.position.y;
            //
            //
            //     var width = node.width();
            //     var height = node.height();
            //     var padding = 1;
            //
            //     var cornerRadius = window.cyMath.getRoundRectangleRadius(width, height);
            //
            //
            //     var nodeIntersectLines = $$.sbgn.roundRectangleIntersectLine(
            //         x, y,
            //         nodeX, nodeY,
            //         nodeX, nodeY,
            //         width, height,
            //         cornerRadius, padding);
            //
            //
            //     var stateIntersectLines = $$.sbgn.intersectLineStateBoxes(
            //         node, x, y);
            //
            //     var intersections = stateIntersectLines.concat(nodeIntersectLines);
            //
            //     return $$.sbgn.closestIntersectionPoint([x, y], intersections);
            //
            //
            // },


            // checkPoint: function (x, y, node, threshold) {
            //
            //
            //
            //     var centerX = node._private.position.x;
            //     var centerY = node._private.position.y;
            //     var width = node.width() + threshold;
            //     var height = node.height() + threshold ;
            //     var padding = 1;
            //     var nodeCheckPoint = window.cyNodeShapes["roundrectangle"].checkPoint(x, y, padding, width, height, centerX, centerY);
            //
            //
            //     return nodeCheckPoint;
            // },
            points: window.cyNodeShapes["roundrectangle"].points

        };
    }
    $$.sbgn.isMultimer = function (node) {
        var sbgnClass = node._private.data.sbgnclass;
        if (sbgnClass && sbgnClass.indexOf("multimer") != -1)
            return true;
        return false;
    };
    $$.sbgn.addPortReplacementIfAny = function (node, edgePort) {
        var posX = node.position().x;
        var posY = node.position().y;
        if (typeof node._private.data.ports != 'undefined') {
            for (var i = 0; i < node._private.data.ports.length; i++) {
                var port = node._private.data.ports[i];
                if (port.id == edgePort) {
                    posX = posX + port.x * node.width() / 100;
                    posY = posY + port.y * node.height() / 100;
                    break;
                }
            }
        }
        return {'x': posX, 'y': posY};
    }
    $$.sbgn.drawEllipse = function (context, x, y, width, height) {
        //$$.sbgn.drawEllipsePath(context, x, y, width, height);
        //context.fill();
        window.cyNodeShapes['ellipse'].draw(context, x, y, width, height);
    };


    $$.sbgn.closestIntersectionPoint = function (point, intersections) {
        if (intersections.length <= 0)
            return [];

        var closestIntersection = [];
        var minDistance = Number.MAX_VALUE;

        for (var i = 0; i < intersections.length; i = i + 2) {
            var checkPoint = [intersections[i], intersections[i + 1]];
            var distance = window.cyMath.calculateDistance(point, checkPoint);

            if (distance < minDistance) {
                minDistance = distance;
                closestIntersection = checkPoint;
            }
        }

        return closestIntersection;
    };


    //this function gives the intersections of any line with a round rectangle
    $$.sbgn.roundRectangleIntersectLine = function (
        x1, y1, x2, y2, nodeX, nodeY, width, height, cornerRadius, padding) {

        var halfWidth = width / 2;
        var halfHeight = height / 2;

        // Check intersections with straight line segments
        var straightLineIntersections = [];

        // Top segment, left to right
        {
            var topStartX = nodeX - halfWidth + cornerRadius - padding;
            var topStartY = nodeY - halfHeight - padding;
            var topEndX = nodeX + halfWidth - cornerRadius + padding;
            var topEndY = topStartY;

            var intersection = window.cyMath.finiteLinesIntersect(
                x1, y1, x2, y2, topStartX, topStartY, topEndX, topEndY, false);

            if (intersection.length > 0) {
                straightLineIntersections = straightLineIntersections.concat(intersection);
            }
        }

        // Right segment, top to bottom
        {
            var rightStartX = nodeX + halfWidth + padding;
            var rightStartY = nodeY - halfHeight + cornerRadius - padding;
            var rightEndX = rightStartX;
            var rightEndY = nodeY + halfHeight - cornerRadius + padding;

            var intersection = window.cyMath.finiteLinesIntersect(
                x1, y1, x2, y2, rightStartX, rightStartY, rightEndX, rightEndY, false);

            if (intersection.length > 0) {
                straightLineIntersections = straightLineIntersections.concat(intersection);
            }
        }

        // Bottom segment, left to right
        {
            var bottomStartX = nodeX - halfWidth + cornerRadius - padding;
            var bottomStartY = nodeY + halfHeight + padding;
            var bottomEndX = nodeX + halfWidth - cornerRadius + padding;
            var bottomEndY = bottomStartY;

            var intersection = window.cyMath.finiteLinesIntersect(
                x1, y1, x2, y2, bottomStartX, bottomStartY, bottomEndX, bottomEndY, false);

            if (intersection.length > 0) {
                straightLineIntersections = straightLineIntersections.concat(intersection);
            }
        }

        // Left segment, top to bottom
        {
            var leftStartX = nodeX - halfWidth - padding;
            var leftStartY = nodeY - halfHeight + cornerRadius - padding;
            var leftEndX = leftStartX;
            var leftEndY = nodeY + halfHeight - cornerRadius + padding;

            var intersection = window.cyMath.finiteLinesIntersect(
                x1, y1, x2, y2, leftStartX, leftStartY, leftEndX, leftEndY, false);

            if (intersection.length > 0) {
                straightLineIntersections = straightLineIntersections.concat(intersection);
            }
        }

        // Check intersections with arc segments
        var arcIntersections;

        // Top Left
        {
            var topLeftCenterX = nodeX - halfWidth + cornerRadius;
            var topLeftCenterY = nodeY - halfHeight + cornerRadius
            arcIntersections = window.cyMath.intersectLineCircle(
                x1, y1, x2, y2,
                topLeftCenterX, topLeftCenterY, cornerRadius + padding);

            // Ensure the intersection is on the desired quarter of the circle
            if (arcIntersections.length > 0
                && arcIntersections[0] <= topLeftCenterX
                && arcIntersections[1] <= topLeftCenterY) {
                straightLineIntersections = straightLineIntersections.concat(arcIntersections);
            }
        }

        // Top Right
        {
            var topRightCenterX = nodeX + halfWidth - cornerRadius;
            var topRightCenterY = nodeY - halfHeight + cornerRadius
            arcIntersections = window.cyMath.intersectLineCircle(
                x1, y1, x2, y2,
                topRightCenterX, topRightCenterY, cornerRadius + padding);

            // Ensure the intersection is on the desired quarter of the circle
            if (arcIntersections.length > 0
                && arcIntersections[0] >= topRightCenterX
                && arcIntersections[1] <= topRightCenterY) {
                straightLineIntersections = straightLineIntersections.concat(arcIntersections);
            }
        }

        // Bottom Right
        {
            var bottomRightCenterX = nodeX + halfWidth - cornerRadius;
            var bottomRightCenterY = nodeY + halfHeight - cornerRadius
            arcIntersections = window.cyMath.intersectLineCircle(
                x1, y1, x2, y2,
                bottomRightCenterX, bottomRightCenterY, cornerRadius + padding);

            // Ensure the intersection is on the desired quarter of the circle
            if (arcIntersections.length > 0
                && arcIntersections[0] >= bottomRightCenterX
                && arcIntersections[1] >= bottomRightCenterY) {
                straightLineIntersections = straightLineIntersections.concat(arcIntersections);
            }
        }

        // Bottom Left
        {
            var bottomLeftCenterX = nodeX - halfWidth + cornerRadius;
            var bottomLeftCenterY = nodeY + halfHeight - cornerRadius
            arcIntersections = window.cyMath.intersectLineCircle(
                x1, y1, x2, y2,
                bottomLeftCenterX, bottomLeftCenterY, cornerRadius + padding);

            // Ensure the intersection is on the desired quarter of the circle
            if (arcIntersections.length > 0
                && arcIntersections[0] <= bottomLeftCenterX
                && arcIntersections[1] >= bottomLeftCenterY) {
                straightLineIntersections = straightLineIntersections.concat(arcIntersections);
            }
        }

        if (straightLineIntersections.length > 0)
            return straightLineIntersections;
        return []; // if nothing
    };

    $$.sbgn.intersectLineEllipse = function (
        x1, y1, x2, y2, centerX, centerY, width, height, padding) {

        var w = width / 2 + padding;
        var h = height / 2 + padding;
        var an = centerX;
        var bn = centerY;

        var d = [x2 - x1, y2 - y1];

        var m = d[1] / d[0];
        var n = -1 * m * x2 + y2;
        var a = h * h + w * w * m * m;
        var b = -2 * an * h * h + 2 * m * n * w * w - 2 * bn * m * w * w;
        var c = an * an * h * h + n * n * w * w - 2 * bn * w * w * n +
            bn * bn * w * w - h * h * w * w;

        var discriminant = b * b - 4 * a * c;

        if (discriminant < 0) {
            return [];
        }

        var t1 = (-b + Math.sqrt(discriminant)) / (2 * a);
        var t2 = (-b - Math.sqrt(discriminant)) / (2 * a);

        var xMin = Math.min(t1, t2);
        var xMax = Math.max(t1, t2);

        var yMin = m * xMin - m * x2 + y2;
        var yMax = m * xMax - m * x2 + y2;

        return [xMin, yMin, xMax, yMax];
    };

    $$.sbgn.intersectLineStateAndInfoBoxes = function (node, x, y) {
        var centerX = node._private.position.x;
        var centerY = node._private.position.y;
        var padding = parseInt(node.css('border-width')) / 2;

        var stateAndInfos = node._private.data.sbgnstatesandinfos;

        var stateCount = 0, infoCount = 0;

        var intersections = [];

        for (var i = 0; i < stateAndInfos.length; i++) {
            var state = stateAndInfos[i];
            var stateWidth = state.bbox.w;
            var stateHeight = state.bbox.h;
            var stateCenterX = state.bbox.x * node.width() / 100 + centerX;
            var stateCenterY = state.bbox.y * node.height() / 100 + centerY;

            if (state.clazz == "state variable" && stateCount < 2) {//draw ellipse
                var stateIntersectLines = $$.sbgn.intersectLineEllipse(x, y, centerX, centerY,
                    stateCenterX, stateCenterY, stateWidth, stateHeight, padding);

                if (stateIntersectLines.length > 0)
                    intersections = intersections.concat(stateIntersectLines);

                stateCount++;
            } else if (state.clazz == "unit of information" && infoCount < 2) {//draw rectangle
                var infoIntersectLines = $$.sbgn.roundRectangleIntersectLine(x, y, centerX, centerY,
                    stateCenterX, stateCenterY, stateWidth, stateHeight, 5, padding);

                if (infoIntersectLines.length > 0)
                    intersections = intersections.concat(infoIntersectLines);

                infoCount++;
            }

        }
        if (intersections.length > 0)
            return intersections;
        return [];
    };


    $$.sbgn.isNodeShapeTotallyOverriden = function (render, node) {
        if (totallyOverridenNodeShapes[render.getNodeShape(node)]) {
            return true;
        }

        return false;
    };
})(cytoscape);

//TODO: use CSS's "text-overflow:ellipsis" style instead of function below?
function truncateText(textProp, font) {
    var context = document.createElement('canvas').getContext("2d");
    context.font = font;

    var fitLabelsToNodes = sbgnStyleRules['fit-labels-to-nodes'];

    var text = (typeof textProp.label === 'undefined') ? "" : textProp.label;
    //If fit labels to nodes is false do not truncate
    if (fitLabelsToNodes == false) {
        return text;
    }
    var width;
    var len = text.length;
    var ellipsis = "..";

    //if(context.measureText(text).width < textProp.width)
    //	return text;
    var textWidth = (textProp.width > 30) ? textProp.width - 10 : textProp.width;

    while ((width = context.measureText(text).width) > textWidth) {
        --len;
        text = text.substring(0, len) + ellipsis;
    }
    return text;
}