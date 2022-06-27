const chise = require('chise');
const sbgnviz = require('sbgnviz');
const filesaver = require('file-saver');
const konva = require('konva');
const tippy = require('tippy.js');
window.jQuery = window.jquery = window.$ = require('jquery'); // jquery should be global because jquery.qtip extension is not compatible with commonjs
const cytoscape = require('cytoscape');

require('jquery-expander')($);
require('bootstrap');

// const appUtilities = require("./js/app-utilities");
// const appMenu = require("./js/app-menu");
const appUtilities = require('./app-utilities');
const appMenu = require('./app-menu');

// Get cy extension instances
const cyPanzoom = require('cytoscape-panzoom');
//const cyQtip = require('cytoscape-qtip');
const cyFcose = require('cytoscape-fcose');
const cyUndoRedo = require('cytoscape-undo-redo');
const cyClipboard = require('cytoscape-clipboard');
const cyContextMenus = require('cytoscape-context-menus');
const cyExpandCollapse = require('cytoscape-expand-collapse');
const cyEdgeEditing = require('cytoscape-edge-editing');
const cyViewUtilities = require('cytoscape-view-utilities');
const cyEdgehandles = require('cytoscape-edgehandles');
const cyGridGuide = require('cytoscape-grid-guide');
const cyAutopanOnDrag = require('cytoscape-autopan-on-drag');
const cyNodeResize = require('cytoscape-node-resize');
const cyPopper = require('cytoscape-popper');
const cyLayoutUtilities = require('cytoscape-layout-utilities');

// Register cy extensions
cyPanzoom(cytoscape, $);
//cyQtip( cytoscape, $ );
cyFcose(cytoscape);
cyUndoRedo(cytoscape);
cyClipboard(cytoscape, $);
cyContextMenus(cytoscape, $);
cyExpandCollapse(cytoscape, $);
cyEdgeEditing(cytoscape, $);
cyViewUtilities(cytoscape, $);
cyEdgehandles(cytoscape);
cyGridGuide(cytoscape, $);
cyAutopanOnDrag(cytoscape);
cyNodeResize(cytoscape, $, konva);
cyPopper(cytoscape);
cyLayoutUtilities(cytoscape);

// Libraries to pass sbgnviz
const libs = {};

libs.filesaver = filesaver;
libs.jquery = jquery;
libs.cytoscape = cytoscape;
libs.sbgnviz = sbgnviz;
libs.tippy = tippy;

$(document).ready(function () {
	// Register chise with libs
	chise.register(libs);

	appMenu();

	// create a new network and access the related chise.js instance
	appUtilities.createNewNetwork();

	// launch with model file if exists
	appUtilities.launchWithModelFile();
});
