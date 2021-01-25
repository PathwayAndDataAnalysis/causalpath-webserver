/**
 * Created by durupina on 12/30/16.
 * Cytoscape functions for drawing causality graphs
 */

var cytoscape = require('cytoscape');
var _ = require('underscore');
var Tippy = require('tippy.js');
var groupTopology = require('../utilities/topology-grouping');
var elementUtilities = require('../utilities/element-utilities');
var convertToRenderedPosition = elementUtilities.convertToRenderedPosition;

var computeAbsSitePos = elementUtilities.computeAbsSitePos;
var getNodeBBox = elementUtilities.getNodeBBox;
var checkPointSites = elementUtilities.checkPointSites;

// LOCAL FUNCTIONS

/**
 * Codes edge types by color, line type etc.
 * @param edgeType
 * @returns {{color:'', linestyle:}}
 */

function attributeMap(edgeType){
    var attributes = {color: 'gray', lineStyle: 'solid'};

    switch(edgeType){
        case "controls-state-change-of":
            attributes["color"] = "coral";
            attributes["lineStyle"]= "dashed";
            break;
        case "controls-transport-of":
            attributes["color"] = "blue";
            break;
        case "controls-phosphorylation-of":
            attributes["color"] =  "teal";
            break;
        case "controls-expression-of":
            attributes["color"] =  "deeppink";
            break;
        case "catalysis-precedes":
            attributes["color"] =  "red";
            break;
        case "in-complex-with":
            attributes["color"] =  "steelblue";
            break;
        case "interacts-with":
            attributes["color"] =  "aquamarine";
            break;
        case "neighbor-of":
            attributes["color"] =  "lime";
            break;
        case "consumption-controled-by":
            attributes["color"] =  "yellow";
            break;
        case "controls-production-of":
            attributes["color"] =  "purple";
            break;
        case "controls-transport-of-chemical":
            attributes["color"] =  "cornflowerblue";
            break;
        case "chemical-affects":
            attributes["color"] =  "darkviolet";
            break;
        case "reacts-with":
            attributes["color"] =  "deepskyblue";
            break;
        case "used-to-produce":
            attributes["color"] =  "green";
            break;
        case "upregulates-expression":
            attributes["lineStyle"]= "dashed";
            attributes["color"] =  "green";
            break;
        case "downregulates-expression":
            attributes["lineStyle"]= "dashed";
            attributes["color"] =  "red";
            break;
        case "phosphorylates":
            attributes["color"] =  "green";
            break;
        case "dephosphorylates":
            attributes["color"] =  "red";
            break;
        default:
            attributes["color"] =  'gray';
            break;
    }

    return attributes;
}

/***
 * Find the site that the user clicked and set it as selected
 * @param pos : mouse position
 * @param node : selected node
 * @returns selected site
 */
function selectAndReturnSite(pos,  node){
    var site = checkPointSites(pos.x, pos.y, node);

    if (site) {
      site.selected = true;
    }

    return site;
}

/***
 * Unselect all sites of a node
 * @param node
 */
function unselectAllSites(node) {
    if (!node.data("sites"))
        return;

    node.data("sites").forEach(function(site){
        site.selected = false;
    });
}



function attachSiteBboxes(nodesData) {

  nodesData.forEach( function(nodeData) {
    var sites = nodeData.data.sites;
    if (!sites) {
      return;
    }

    var paddingCoef = 0.9;
    var w = 15;
    var h = 15;
    var l = ( 0 - paddingCoef ) / 2;
    var n = sites.length;
    var d = paddingCoef / n;

    sites.forEach( function(site, i) {
      if(i % 2 == 0){
          x = l + d * i;
          y = -0.5;
      }
      else{ //Draw sites at the bottom of the node
          x = l + d * (i - 1);
          y = 0.5;
      }

      site.bbox = { x, y, w, h };
    } );
  } );
}



module.exports.initLayoutOptions = function(modelManager){
  let layoutOptions = {
    nodeRepulsion: 2000, //4500,
    idealEdgeLength: 50,
    edgeElasticity: 0.45,
    nestingFactor: 0.1,
    gravity: 0.01,
    gravityRange: 0.8,
    gravityCompound: 0,
    gravityRangeCompound: 1.5,
    numIter: 2500,
    tileDisconnected: true,
    tilingPaddingVertical: 5,
    tilingPaddingHorizontal: 5,
    animate: false,
    incremental: false,
    improveFlow: true,
    initialEnergyOnIncremental: 0.3,
    name: 'cose-bilkent'
  }


  modelManager.setLayoutOptions(layoutOptions);

}

/***
 * @param modelCy: Cy elements stored in the model as json objects
 * @param doTopologyGrouping
 * @returns model cy elements converted into cytoscape format with edge ids added
 */
module.exports.convertModelJsonToCyElements = function(modelCy, doTopologyGrouping){


    var nodes = [];
    var edges = [];

    if(!modelCy)
      return null;
    if(modelCy.nodes) {
      for (var obj in modelCy.nodes) {
        var node = modelCy.nodes[obj]
        var nodeClone = _.clone(node);
        nodes.push(nodeClone);
      }
      ;
    }


    if(modelCy.edges) {
      for(var obj in modelCy.edges){
          var edge = modelCy.edges[obj];
          var newEdge = _.clone(edge);
          //need to set this explicitly otherwise cytoscape gives a random id
          var id = edge.data.source + "-" + edge.data.target;
          newEdge.data.id = id;
          edges.push(newEdge);
      };
    }

    var cyElements = {nodes: nodes, edges: edges};

    attachSiteBboxes(cyElements.nodes);
    // attachStatesAndInfos(cyElements.nodes);

    if(doTopologyGrouping)
        return groupTopology(cyElements);
    else
        return cyElements;

}

module.exports.runLayout = function(layoutOptions){
    cy.layout(layoutOptions).run();
}

module.exports.createContainer = function(el, doTopologyGrouping, modelManager, callback) {


    var modelCy = modelManager.getModelCy();

    var cyElements = module.exports.convertModelJsonToCyElements(modelCy, doTopologyGrouping);

    let contextMenu;

    var cy;

    module.exports.initLayoutOptions(modelManager);

    cytoscape({
        container: el,

        boxSelectionEnabled: true,
        autounselectify: false,
          wheelSensitivity: 0.3,
          minZoom:0.1,
          maxZoom:5,

        layout: modelManager.getLayoutOptions(),

        style: CgfStyleSheet,

        elements: cyElements,

        ready: function () {

            var cy = window.cy = this;

            contextMenu = cy.contextMenus({
                // List of initial menu items
                menuItems: [
                    {
                        id: 'show-pc-query', // ID of menu item
                        content: 'Navigate to details', // Display content of menu item
                        tooltipText: 'Navigate to details', // Tooltip text for menu item
                        // If the selector is not truthy no elements will have this menu item on cxttap
                        selector: 'edge',
                        onClickFunction: function (event) { // The function to be executed on click
                            let edge = event.target;

                            if(!edge.data) {
                                alert("Edge does not have data.");
                                return;
                            }
                            let links = edge.data("pcLinks");
                            let uriStr = "";
                            if(links && links.length > 0) {
                                uriStr = links[0]
                                for (let i = 1; i < links.length; i++)
                                    uriStr += ',' + links[i];

                                var loc = "http://web.newteditor.org/?URI=";
                                if (loc[loc.length - 1] === "#") {
                                    loc = loc.slice(0, -1);
                                }
                                var w = window.open((loc + uriStr), function () {

                                });
                            }


                        },
                        disabled: false, // Whether the item will be created as disabled
                        hasTrailingDivider: true, // Whether the item will have a trailing divider
                        coreAsWell: false // Whether core instance have this item on cxttap
                    }
                ]
            });

            if(callback) callback();

            cy.on('select', 'node', function(e){
                this.css('background-color', '#FFCC66');

            });


            cy.on('unselect', 'node', function(e){
                //get original background color
                var backgroundColor = modelManager.getModelNodeAttribute(this.id(), 'css.backgroundColor');
                if(!backgroundColor)
                    backgroundColor = 'white';
                this.css('background-color', backgroundColor);
                unselectAllSites(this);
            });

            cy.on('tap', 'node, edge', function(event) {
      			  var ele = event.target || event.cyTarget;
              var pos = event.position || event.cyPosition;
              var isNode = ele.isNode();
              var site = isNode && selectAndReturnSite(pos, ele);

      				var ref; // used only for positioning
      				var pan = cy.pan();
      			  var zoom = cy.zoom();

      			  // var infobox = classes.AuxiliaryUnit.checkPoint(pos.x, pos.y, node, 0);
      			  var tooltipContent;
              var parentBbox = getNodeBBox(ele);

              if (!isNode) { // target is edge
                tooltipContent = ele.data("edgeType");

                if ( tooltipContent == undefined ) {
    				      return;
    				    }

                ref = ele.popperRef({
                  renderedPosition: function() {
    				        return event.renderedPosition || event.cyRenderedPosition;
    				      },
                  renderedDimensions: function() {
                    return { w: 0, h: 0 };
                  }
                });
              }
    					else if (!site) { // target is node itself
    				    tooltipContent = ele.data('tooltipText');

    				    if ( tooltipContent == undefined ) {
    				      return;
    				    }

    				    ref = ele.popperRef();
    				  }
    				  else { // target is a site of node
    				    tooltipContent = site['siteInfo'];

    				    if ( tooltipContent == undefined ) {
    				      return;
    				    }

    				    var modelPos = computeAbsSitePos({site, parentBbox});
    				    var modelW = site.bbox.w;
    				    var modelH = site.bbox.h;
    				    var renderedW = modelW * zoom;
    				    var renderedH = modelH * zoom;
    				    modelPos.x -= modelW / 2;
    				    modelPos.y -= modelH / 2;
    				    var renderedPos = convertToRenderedPosition(modelPos, pan, zoom);

    				    var renderedDims = { w: renderedW, h: renderedH };

    				    ref = ele.popperRef({
    				      renderedPosition: function() {
    				        return renderedPos;
    				      },
    				      renderedDimensions: function() {
    				        return renderedDims;
    				      }
    				    });
    				  }

      			  var placement = site && site.bbox.y < 0.5 ? 'top' : 'bottom';
      			  var destroyTippy;
              var relatedNodes = ele.isNode() ? ele : ele.source().union( ele.target() );

      			  var tippy = Tippy.one(ref, {
      			    content: (() => {
      			      var content = document.createElement('div');

      			      content.style['font-size'] = 12 * zoom + 'px';
      			      content.innerHTML = tooltipContent;

      			      return content;
      			    })(),
      			    trigger: 'manual',
      			    hideOnClick: true,
      			    arrow: true,
      			    placement,
      			    onHidden: function() {
      			      cy.off('pan zoom', destroyTippy);
      			      relatedNodes.off('position', destroyTippy);
      			    },
                maxWidth: 'none'
      			  });

      			  destroyTippy = function(){
      			    tippy.destroy();
      			  };

      			  cy.on('pan zoom', destroyTippy);
      			  relatedNodes.on('position', destroyTippy);

      			  setTimeout( () => tippy.show(), 0 );
      			});

        }

    });
}


/***
 * Style sheet for causality graphs
 */
var CgfStyleSheet = cytoscape.stylesheet()
        .selector('node')
        .css({
            'border-width':'1.25',
            // 'border-color': 'css(border-color)',
            //  'background-color':'white',
            'shape': 'cgfNode',
            'text-halign': 'center',
            'text-valign':'center',
            'background-color': 'white',

            'width': function(ele){
                var spacing =(ele.data('id').length +2) * 10;
                return  Math.min(200,spacing);
            },
            'height':30,
            'content': 'data(text)',

        })
        .selector('node:selected')
        .css({
            'overlay-color': '#FFCC66',
            'opacity': 1
        })
        .selector('edge')
        .css({
            'line-color': function(ele){
                return attributeMap(ele.data('edgeType')).color;

            },
            'line-style': function(ele){
                return attributeMap(ele.data('edgeType')).lineStyle;
            },
            'curve-style': 'bezier',

            'target-arrow-color': function(ele){
                return attributeMap(ele.data('edgeType')).color;
            },
            'target-arrow-shape':'triangle',
            //     function(ele) {
            //     if (ele.data('edgeType') == "in-complex-with" || ele.data('edgeType') == "interacts-with" || //nondirected
            //         ele.data('edgeType') == "neighbor-of" || ele.data('edgeType') == "reacts-with")
            //         return 'none';
            //     return 'cgfArrow';
            // },
            'arrow-size':5,
            'opacity': 0.8
        })
        .selector('edge:selected')
        .css({
            'line-color': '#FFCC66',
            'target-arrow-color': '#FFCC66',
            'source-arrow-color': '#FFCC66',
            'opacity': 1
        })

        .selector("node:parent")
        .css({
            'text-valign': 'bottom',
            'content': 'data(edgeType)', //there is a label when there's a clique among the nodes inside the compound
            'font-size': 8,


        })
        .selector("node:child")
        .css({

            // 'padding-top': '10px',
            // 'padding-bottom': '10px',
            // 'padding-left': '10px',
            // 'padding-right': '10px',


        });
