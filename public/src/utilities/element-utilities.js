var cytoscape = require("cytoscape");

function computeAbsSitePos({ site, parentBbox, node }) {
  if (!parentBbox) {
    parentBbox = getNodeBBox(node);
  }

  // site.bbox represents center-left position of infoboxes
  // so it is needed to add site.bbox.w / 2 here while computing
  // 'x' coordinate of center of infobox here
  var x = parentBbox.x + parentBbox.w * site.bbox.x + site.bbox.w / 2;
  var y = parentBbox.y + parentBbox.h * site.bbox.y;

  return { x, y };
}

function getNodeBBox(node, useTopLeft) {
  var w = node.outerWidth();
  var h = node.outerHeight();
  var x = node.position("x");
  var y = node.position("y");

  if (useTopLeft) {
    x -= w / 2;
    y -= h / 2;
  }

  return { x, y, w, h };
}

function checkPointSites(x, y, node, threshold = 0) {
  var sites = node.data("sites");
  if (!sites) {
    return null;
  }

  var nodeX = node.position("x");
  var nodeY = node.position("y");
  var padding = parseInt(node.css("border-width")) / 2;
  var cyBaseNodeShapes = cytoscape.baseNodeShapes;
  var parentBbox = getNodeBBox(node);

  for (var i = 0; i < sites.length; i++) {
    var site = sites[i];
    var sitePos = computeAbsSitePos({ site, parentBbox });

    var siteWidth = parseFloat(site.bbox.w) + threshold;
    var siteHeight = parseFloat(site.bbox.h) + threshold;
    var siteX = sitePos.x;
    var siteY = sitePos.y;
    var checkPoint = cyBaseNodeShapes["ellipse"].checkPoint(
      x,
      y,
      padding,
      siteWidth,
      siteHeight,
      siteX,
      siteY
    );

    if (checkPoint == true) {
      return site;
    }
  }

  return null;
}

function convertToRenderedPosition(modelPos, pan, zoom) {
  pan = pan || cy.pan();
  zoom = zoom || cy.zoom();

  var res = {};

  ["x", "y"].forEach(function (dim) {
    res[dim] = modelPos[dim] * zoom + pan[dim];
  });

  return res;
}

module.exports = {
  computeAbsSitePos,
  getNodeBBox,
  checkPointSites,
  convertToRenderedPosition,
};
