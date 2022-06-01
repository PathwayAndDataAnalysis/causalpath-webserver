/*
 * Render specific shapes which are not supported by cytoscape.js core
 */

var cytoscape = require("cytoscape");
var elementUtilities = require("./element-utilities");
var computeAbsSitePos = elementUtilities.computeAbsSitePos;
var getNodeBBox = elementUtilities.getNodeBBox;
var checkPointSites = elementUtilities.checkPointSites;

var cyMath = (math = cytoscape.math);
var cyBaseNodeShapes = cytoscape.baseNodeShapes;
var cyStyleProperties = cytoscape.styleProperties;

module.exports = function () {
  var $$ = cytoscape;

  /*
   * Taken from cytoscape.js and modified so that it can be utilized from sbgnviz
   * in a flexable way. It is needed because the sbgnviz shapes would need to stroke
   * border more than once as they would have infoboxes, multimers etc.
   * Extends the style properties of node with the given ones then strokes the border.
   * Would needed to be slightly updated during cytoscape upgrades if related function in
   * Cytoscape.js is updated. Information about where is the related function is located
   * can be found in the file that list the changes done in ivis cytoscape fork.
   */
  $$.sbgn.drawBorder = function ({
    context,
    node,
    borderWidth,
    borderColor,
    borderStyle,
    borderOpacity,
  }) {
    borderWidth = borderWidth || (node && parseFloat(node.css("border-width")));

    if (borderWidth > 0) {
      var parentOpacity = (node && node.effectiveOpacity()) || 1;

      borderStyle = borderStyle || (node && node.css("border-style"));
      borderColor = borderColor || (node && node.css("border-color"));
      borderOpacity =
        (borderOpacity || (node && node.css("border-opacity"))) * parentOpacity;

      var propsToRestore = [
        "lineWidth",
        "lineCap",
        "strokeStyle",
        "globalAlpha",
      ];
      var initialProps = {};

      propsToRestore.forEach(function (propName) {
        initialProps[propName] = context[propName];
      });

      context.lineWidth = borderWidth;
      context.lineCap = "butt";
      context.strokeStyle = borderColor;
      context.globalAlpha = borderOpacity;

      if (context.setLineDash) {
        // for very outofdate browsers
        switch (borderStyle) {
          case "dotted":
            context.setLineDash([1, 1]);
            break;

          case "dashed":
            context.setLineDash([4, 2]);
            break;

          case "solid":
          case "double":
            context.setLineDash([]);
            break;
        }
      }

      context.stroke();

      if (borderStyle === "double") {
        context.lineWidth = borderWidth / 3;

        let gco = context.globalCompositeOperation;
        context.globalCompositeOperation = "destination-out";

        context.stroke();

        context.globalCompositeOperation = gco;
      }

      // reset in case we changed the border style
      if (context.setLineDash) {
        // for very outofdate browsers
        context.setLineDash([]);
      }

      propsToRestore.forEach(function (propName) {
        context[propName] = initialProps[propName];
      });
    }
  };

  // Taken from cytoscape.js and modified
  var drawRoundRectanglePath = function (context, x, y, width, height, radius) {
    var halfWidth = width / 2;
    var halfHeight = height / 2;
    var cornerRadius = radius || cyMath.getRoundRectangleRadius(width, height);

    if (context.beginPath) {
      context.beginPath();
    }

    // Start at top middle
    context.moveTo(x, y - halfHeight);
    // Arc from middle top to right side
    context.arcTo(
      x + halfWidth,
      y - halfHeight,
      x + halfWidth,
      y,
      cornerRadius
    );
    // Arc from right side to bottom
    context.arcTo(
      x + halfWidth,
      y + halfHeight,
      x,
      y + halfHeight,
      cornerRadius
    );
    // Arc from bottom to left side
    context.arcTo(
      x - halfWidth,
      y + halfHeight,
      x - halfWidth,
      y,
      cornerRadius
    );
    // Arc from left side to topBorder
    context.arcTo(
      x - halfWidth,
      y - halfHeight,
      x,
      y - halfHeight,
      cornerRadius
    );
    // Join line
    context.lineTo(x, y - halfHeight);

    context.closePath();
  };

  var sbgnShapes = ($$.sbgn.sbgnShapes = {
    cgfNode: true,
  });

  var totallyOverridenNodeShapes = ($$.sbgn.totallyOverridenNodeShapes = {
    cgfNode: true,
  });

  var canHaveInfoBoxShapes = ($$.sbgn.canHaveInfoBoxShapes = {
    cgfNode: true,
  });

  cyMath.calculateDistance = function (point1, point2) {
    var distance =
      Math.pow(point1[0] - point2[0], 2) + Math.pow(point1[1] - point2[1], 2);
    return Math.sqrt(distance);
  };

  $$.sbgn.drawText = function (context, textProp) {
    var text = textProp.text;
    if (!text) {
      return;
    }

    var toRestore = [
      "font",
      "fillStyle",
      "globalAlpha",
      "textAlign",
      "textBaseline",
    ];
    var initialPropMap = {};

    toRestore.forEach(function (propName) {
      initialPropMap[propName] = context[propName];
    });

    context.font = textProp.font;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = textProp.color;
    context.globalAlpha = textProp.opacity;

    context.fillText(text, textProp.centerX, textProp.centerY);

    toRestore.forEach(function (propName) {
      context[propName] = initialPropMap[propName];
    });
  };

  $$.sbgn.drawStateAndInfos = function (node, context) {
    var sites = node.data("sites");
    if (!sites) {
      return;
    }

    var toRestore = [
      "font",
      "fillStyle",
      "globalAlpha",
      "textAlign",
      "textBaseline",
    ];
    var initialPropMap = {};

    toRestore.forEach(function (propName) {
      initialPropMap[propName] = context[propName];
    });

    var parentBbox = getNodeBBox(node);
    var shapeName = node.css("shape");

    sites.forEach(function (site) {
      var sitePos = computeAbsSitePos({ site, parentBbox });
      var font = site.bbox.h / 1.5 + "px Arial";
      var color = site.siteTextColor || "black";
      var textProp = {
        centerX: sitePos.x,
        centerY: sitePos.y,
        font,
        text: site.siteText,
        color,
        opacity: 1,
      };

      context.strokeStyle = site.siteBorderColor;
      context.fillStyle = site.siteBackgroundColor;

      $$.sbgn.drawInfoBox(
        context,
        sitePos.x,
        sitePos.y,
        site.bbox.w,
        site.bbox.h,
        shapeName
      );
      $$.sbgn.drawText(context, textProp);
    });
    context.beginPath();
    context.closePath();

    toRestore.forEach(function (propName) {
      context[propName] = initialPropMap[propName];
    });
  };

  $$.sbgn.drawInfoBox = function (context, x, y, width, height, shapeName) {
    switch (shapeName) {
      case "cgfNode":
        cyBaseNodeShapes["ellipse"].draw(context, x, y, width, height);
        context.stroke();
        context.fill();
        break;
    }
  };

  //we need to force opacity to 1 since we might have state and info boxes.
  //having opaque nodes which have state and info boxes gives unpleasent results.
  $$.sbgn.forceOpacityToOne = function (node, context) {
    var parentOpacity = node.effectiveOpacity();
    if (parentOpacity === 0) {
      return;
    }

    context.fillStyle =
      "rgba(" +
      node._private.style["background-color"].value[0] +
      "," +
      node._private.style["background-color"].value[1] +
      "," +
      node._private.style["background-color"].value[2] +
      "," +
      1 * node.css("opacity") * parentOpacity +
      ")";
  };

  $$.sbgn.drawEllipsePath = function (context, x, y, width, height) {
    cyBaseNodeShapes["ellipse"].drawPath(context, x, y, width, height);
  };

  cyStyleProperties.types.nodeShape.enums.push("cgfNode");

  $$.sbgn.registerSbgnNodeShapes = function () {
    function generateDrawFcn({ plainDrawFcn, canHaveInfoBox }) {
      return function (context, node, imgObj) {
        var borderWidth = parseFloat(node.css("border-width"));
        var width = node.outerWidth() - borderWidth;
        var height = node.outerHeight() - borderWidth;
        var centerX = node._private.position.x;
        var centerY = node._private.position.y;
        var bgOpacity = node.css("background-opacity");

        plainDrawFcn(context, centerX, centerY, width, height);

        $$.sbgn.drawBorder({ context, node });
        // TODO: look back here
        // $$.sbgn.drawImage( context, imgObj );

        if (canHaveInfoBox) {
          var oldStyle = context.fillStyle;
          $$.sbgn.forceOpacityToOne(node, context);
          $$.sbgn.drawStateAndInfos(node, context);
          context.fillStyle = oldStyle;
        }
      };
    }

    function generateIntersectLineFcn({
      plainIntersectLineFcn,
      canHaveInfoBox,
    }) {
      return function (node, x, y) {
        var borderWidth = parseFloat(node.css("border-width"));
        var padding = borderWidth / 2;
        var width = node.outerWidth() - borderWidth;
        var height = node.outerHeight() - borderWidth;
        var centerX = node._private.position.x;
        var centerY = node._private.position.y;

        var intersections = [];

        if (canHaveInfoBox) {
          var stateAndInfoIntersectLines =
            $$.sbgn.intersectLineStateAndInfoBoxes(node, x, y);

          intersections = intersections.concat(stateAndInfoIntersectLines);
        }

        var nodeIntersectLines = plainIntersectLineFcn(
          centerX,
          centerY,
          width,
          height,
          x,
          y,
          padding
        );

        intersections = intersections.concat(nodeIntersectLines);

        return $$.sbgn.closestIntersectionPoint([x, y], intersections);
      };
    }

    function generateCheckPointFcn({ plainCheckPointFcn, canHaveInfoBox }) {
      return function (x, y, node, threshold) {
        threshold = threshold || 0;
        var borderWidth = parseFloat(node.css("border-width"));
        var width = node.outerWidth() - borderWidth + 2 * threshold;
        var height = node.outerHeight() - borderWidth + 2 * threshold;
        var centerX = node._private.position.x;
        var centerY = node._private.position.y;
        var padding = borderWidth / 2;

        var nodeCheck = function () {
          return plainCheckPointFcn(
            x,
            y,
            padding,
            width,
            height,
            centerX,
            centerY
          );
        };

        var stateAndInfoCheck = function () {
          return (
            canHaveInfoBox &&
            $$.sbgn.checkPointStateAndInfoBoxes(x, y, node, threshold)
          );
        };

        return nodeCheck() || stateAndInfoCheck();
      };
    }

    var shapeNames = ["cgfNode"];

    shapeNames.forEach(function (shapeName) {
      var plainDrawFcn = $$.sbgn.plainDraw[shapeName];
      var plainIntersectLineFcn = $$.sbgn.plainIntersectLine[shapeName];
      var plainCheckPointFcn = $$.sbgn.plainCheckPoint[shapeName];
      var canHaveInfoBox = $$.sbgn.canHaveInfoBoxShapes[shapeName];

      var draw = generateDrawFcn({ plainDrawFcn, canHaveInfoBox });

      var intersectLine = totallyOverridenNodeShapes[shapeName]
        ? generateIntersectLineFcn({ plainIntersectLineFcn, canHaveInfoBox })
        : plainIntersectLineFcn;

      var checkPoint = totallyOverridenNodeShapes[shapeName]
        ? generateCheckPointFcn({ plainCheckPointFcn, canHaveInfoBox })
        : plainCheckPointFcn;

      var shape = { draw, intersectLine, checkPoint };

      cyBaseNodeShapes[shapeName] = shape;
    });
  };

  $$.sbgn.drawEllipse = function (context, x, y, width, height) {
    //$$.sbgn.drawEllipsePath(context, x, y, width, height);
    //context.fill();
    cyBaseNodeShapes["ellipse"].draw(context, x, y, width, height);
  };

  $$.sbgn.drawRoundRectangle = function (context, x, y, width, height) {
    drawRoundRectanglePath(context, x, y, width, height);
    context.fill();
  };

  $$.sbgn.plainDraw = {
    cgfNode: $$.sbgn.drawRoundRectangle,
  };

  $$.sbgn.plainIntersectLine = {
    cgfNode: function (centerX, centerY, width, height, x, y, padding) {
      return cyMath.roundRectangleIntersectLine(
        x,
        y,
        centerX,
        centerY,
        width,
        height,
        padding
      );
    },
  };

  $$.sbgn.plainCheckPoint = {
    cgfNode: function (x, y, padding, width, height, centerX, centerY) {
      return cyBaseNodeShapes["roundrectangle"].checkPoint(
        x,
        y,
        padding,
        width,
        height,
        centerX,
        centerY
      );
    },
  };

  $$.sbgn.closestIntersectionPoint = function (point, intersections) {
    if (intersections.length <= 0) return [];

    var closestIntersection = [];
    var minDistance = Number.MAX_VALUE;

    for (var i = 0; i < intersections.length; i = i + 2) {
      var checkPoint = [intersections[i], intersections[i + 1]];
      var distance = cyMath.calculateDistance(point, checkPoint);

      if (distance < minDistance) {
        minDistance = distance;
        closestIntersection = checkPoint;
      }
    }

    return closestIntersection;
  };

  //this function gives the intersections of any line with a round rectangle
  $$.sbgn.roundRectangleIntersectLine = function (
    x1,
    y1,
    x2,
    y2,
    nodeX,
    nodeY,
    width,
    height,
    cornerRadius,
    padding
  ) {
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

      var intersection = cyMath.finiteLinesIntersect(
        x1,
        y1,
        x2,
        y2,
        topStartX,
        topStartY,
        topEndX,
        topEndY,
        false
      );

      if (intersection.length > 0) {
        straightLineIntersections =
          straightLineIntersections.concat(intersection);
      }
    }

    // Right segment, top to bottom
    {
      var rightStartX = nodeX + halfWidth + padding;
      var rightStartY = nodeY - halfHeight + cornerRadius - padding;
      var rightEndX = rightStartX;
      var rightEndY = nodeY + halfHeight - cornerRadius + padding;

      var intersection = cyMath.finiteLinesIntersect(
        x1,
        y1,
        x2,
        y2,
        rightStartX,
        rightStartY,
        rightEndX,
        rightEndY,
        false
      );

      if (intersection.length > 0) {
        straightLineIntersections =
          straightLineIntersections.concat(intersection);
      }
    }

    // Bottom segment, left to right
    {
      var bottomStartX = nodeX - halfWidth + cornerRadius - padding;
      var bottomStartY = nodeY + halfHeight + padding;
      var bottomEndX = nodeX + halfWidth - cornerRadius + padding;
      var bottomEndY = bottomStartY;

      var intersection = cyMath.finiteLinesIntersect(
        x1,
        y1,
        x2,
        y2,
        bottomStartX,
        bottomStartY,
        bottomEndX,
        bottomEndY,
        false
      );

      if (intersection.length > 0) {
        straightLineIntersections =
          straightLineIntersections.concat(intersection);
      }
    }

    // Left segment, top to bottom
    {
      var leftStartX = nodeX - halfWidth - padding;
      var leftStartY = nodeY - halfHeight + cornerRadius - padding;
      var leftEndX = leftStartX;
      var leftEndY = nodeY + halfHeight - cornerRadius + padding;

      var intersection = cyMath.finiteLinesIntersect(
        x1,
        y1,
        x2,
        y2,
        leftStartX,
        leftStartY,
        leftEndX,
        leftEndY,
        false
      );

      if (intersection.length > 0) {
        straightLineIntersections =
          straightLineIntersections.concat(intersection);
      }
    }

    // Check intersections with arc segments
    var arcIntersections;

    // Top Left
    {
      var topLeftCenterX = nodeX - halfWidth + cornerRadius;
      var topLeftCenterY = nodeY - halfHeight + cornerRadius;
      arcIntersections = cyMath.intersectLineCircle(
        x1,
        y1,
        x2,
        y2,
        topLeftCenterX,
        topLeftCenterY,
        cornerRadius + padding
      );

      // Ensure the intersection is on the desired quarter of the circle
      if (
        arcIntersections.length > 0 &&
        arcIntersections[0] <= topLeftCenterX &&
        arcIntersections[1] <= topLeftCenterY
      ) {
        straightLineIntersections =
          straightLineIntersections.concat(arcIntersections);
      }
    }

    // Top Right
    {
      var topRightCenterX = nodeX + halfWidth - cornerRadius;
      var topRightCenterY = nodeY - halfHeight + cornerRadius;
      arcIntersections = cyMath.intersectLineCircle(
        x1,
        y1,
        x2,
        y2,
        topRightCenterX,
        topRightCenterY,
        cornerRadius + padding
      );

      // Ensure the intersection is on the desired quarter of the circle
      if (
        arcIntersections.length > 0 &&
        arcIntersections[0] >= topRightCenterX &&
        arcIntersections[1] <= topRightCenterY
      ) {
        straightLineIntersections =
          straightLineIntersections.concat(arcIntersections);
      }
    }

    // Bottom Right
    {
      var bottomRightCenterX = nodeX + halfWidth - cornerRadius;
      var bottomRightCenterY = nodeY + halfHeight - cornerRadius;
      arcIntersections = cyMath.intersectLineCircle(
        x1,
        y1,
        x2,
        y2,
        bottomRightCenterX,
        bottomRightCenterY,
        cornerRadius + padding
      );

      // Ensure the intersection is on the desired quarter of the circle
      if (
        arcIntersections.length > 0 &&
        arcIntersections[0] >= bottomRightCenterX &&
        arcIntersections[1] >= bottomRightCenterY
      ) {
        straightLineIntersections =
          straightLineIntersections.concat(arcIntersections);
      }
    }

    // Bottom Left
    {
      var bottomLeftCenterX = nodeX - halfWidth + cornerRadius;
      var bottomLeftCenterY = nodeY + halfHeight - cornerRadius;
      arcIntersections = cyMath.intersectLineCircle(
        x1,
        y1,
        x2,
        y2,
        bottomLeftCenterX,
        bottomLeftCenterY,
        cornerRadius + padding
      );

      // Ensure the intersection is on the desired quarter of the circle
      if (
        arcIntersections.length > 0 &&
        arcIntersections[0] <= bottomLeftCenterX &&
        arcIntersections[1] >= bottomLeftCenterY
      ) {
        straightLineIntersections =
          straightLineIntersections.concat(arcIntersections);
      }
    }

    if (straightLineIntersections.length > 0) return straightLineIntersections;
    return []; // if nothing
  };

  $$.sbgn.intersectLineEllipse = function (
    x1,
    y1,
    x2,
    y2,
    centerX,
    centerY,
    width,
    height,
    padding
  ) {
    var w = width / 2 + padding;
    var h = height / 2 + padding;
    var an = centerX;
    var bn = centerY;

    var d = [x2 - x1, y2 - y1];

    var m = d[1] / d[0];
    var n = -1 * m * x2 + y2;
    var a = h * h + w * w * m * m;
    var b = -2 * an * h * h + 2 * m * n * w * w - 2 * bn * m * w * w;
    var c =
      an * an * h * h +
      n * n * w * w -
      2 * bn * w * w * n +
      bn * bn * w * w -
      h * h * w * w;

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
    var sites = node.data("sites");
    if (!sites) {
      return [];
    }

    var nodeX = node.position("x");
    var nodeY = node.position("y");
    var padding = parseInt(node.css("border-width")) / 2;
    var parentBbox = getNodeBBox(node);

    var intersections = [];

    for (var i = 0; i < sites.length; i++) {
      var site = sites[i];
      var sitePos = computeAbsSitePos({ site, parentBbox });

      var siteWidth = site.bbox.w;
      var siteHeight = site.bbox.h;
      var siteX = sitePos.x;
      var siteY = sitePos.y;

      var currIntersections = $$.sbgn.intersectLineEllipse(
        x,
        y,
        nodeX,
        nodeY,
        siteX,
        siteY,
        siteWidth,
        siteHeight,
        padding
      );

      intersections = intersections.concat(currIntersections);
    }

    return intersections;
  };

  $$.sbgn.checkPointStateAndInfoBoxes = function (x, y, node, threshold) {
    return checkPointSites(x, y, node, threshold);
  };

  $$.sbgn.isNodeShapeTotallyOverriden = function (render, node) {
    if (totallyOverridenNodeShapes[render.getNodeShape(node)]) {
      return true;
    }

    return false;
  };

  $$.sbgn.isMultimer = function () {
    return false;
  };
};
