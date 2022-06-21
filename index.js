/*
 *	Model initialization
 *  Event handlers of model updates
 *	Author: Funda Durupinar Babur<f.durupinar@gmail.com>
 */
const app = (module.exports = require('derby').createApp(
	'causalpath',
	__filename
));
// var $ = jQuery = require('jquery');
const dirTree = require('directory-tree');

const Noty = require('noty');
const saveAs = require('file-saver').saveAs;
const cytoscape = require('cytoscape');
const cyCoseBilkent = require('cytoscape-cose-bilkent');
const cyContextMenus = require('cytoscape-context-menus');
const cyPopper = require('cytoscape-popper');
const Tippy = require('tippy.js');
const causalityRenderer = require('./public/src/utilities/causality-cy-renderer');
const cgfCy = require('./public/src/cgf-visualizer/cgf-cy.js');

app.loadViews(__dirname + '/views');

let docReady = false;

app.modelManager = null;

const graphChoiceEnum = {
	JSON: 1,
	ANALYSIS: 2,
	DEMO: 3,
};

let graphChoice;

let handleResponse = (res, afterResolve, handleRequestError, getResData) => {
	let {statusText, status, ok} = res;

	if (!ok) {
		let errStr = status + ' - ' + statusText;
		return handleRequestError(errStr);
	}

	if (!getResData) {
		getResData = () => res.text();
	}
	return getResData(res).then(afterResolve);
};

app.get('/', function (page, model, params) {
	let docId;

	function getId() {
		return model.id();
	}

	function idIsReserved() {
		return model.get('documents.' + docId) !== undefined;
	}

	docId = getId();

	while (idIsReserved()) {
		docId = getId();
	}

	return page.redirect('/' + docId);
});

app.get('/:docId', function (page, model, arg, next) {
	let messagesQuery, room;
	room = arg.docId;

	const docPath = 'documents.' + arg.docId;

	if (arg.docId.includes('test') && model.get('documents.' + arg.docId))
		model.set('documents.' + arg.docId, null);

	model.ref('_page.doc', 'documents.' + arg.docId);

	model.subscribe(docPath, function (err) {
		if (err) return next(err);

		model.createNull(docPath, {
			// create the empty new doc if it doesn't already exist
			id: arg.docId,
		});

		const cgfTextPath = model.at(docPath + '.cgfText');
		const cyPath = model.at(docPath + '.cy');
		const parametersPath = model.at(docPath + '.parameters');
		const layoutPath = model.at(docPath + '.layout');
		const enumerationsPath = model.at(docPath + '.enumerations');
		const folderTree = model.at(docPath + '.folderTree');

		cgfTextPath.subscribe(function () {
			cyPath.subscribe(function () {
				parametersPath.subscribe(function () {
					enumerationsPath.subscribe(function () {
						layoutPath.subscribe(function () {
							model.set('_page.room', room);
							if (arg.docId.includes('test')) {
								//clear everything and start from scratch if this is test mode
								if (cgfTextPath.get())
									model.set(docPath + '.cgfText', null);
								if (cyPath.get())
									model.set(docPath + '.cy', null);
								if (parametersPath.get())
									model.set(docPath + '.parameters', null);
								if (layoutPath.get())
									model.set(docPath + '.layout', null);
								if (enumerationsPath.get())
									model.set(docPath + '.enumerations', null);
							}

							folderTree.subscribe(() => {
								page.render();
							});
						});
					});
				});
			});
		});
	});
});

app.proto.create = function (model) {
	Tippy.setDefaults({
		arrow: true,
		placement: 'bottom',
	});

	cytoscape.use(cyCoseBilkent);
	cytoscape.use(cyContextMenus, $);
	cytoscape.use(cyPopper);
	causalityRenderer();

	//
	// // make canvas tab area resizable and resize some other components as it is resized
	// $("#graph-container").resizable({
	//       // alsoResize: '#folder-tree',
	//       //   // maxHeight: 800,
	//       //   maxWidth: 1200,
	//       //   minWidth: 200
	//
	//   }
	// );

	// // make inspector-tab-area resizable
	// $("#folder-tree").resizable({
	//     alsoResize: '#graph-container',
	// });
};

/***
 * Called after document is loaded.
 * Listeners are called here.
 * @param model
 */
app.proto.init = function (model) {
	const id = model.get('_session.userId');
	const name = model.get('users.' + id + '.name');
	this.room = model.get('_page.room');

	this.modelManager = require('./public/src/model/modelManager.js')(
		model,
		this.room,
		model.get('_session.userId'),
		name
	);

	docReady = true;
	// TODO: later remove this and other code parts that would become useless after removing option a?
	// model.on('all', '_page.doc.parameters.*.value.**', function(ind, op, val, prev, passed){
	//     if(docReady) {
	//         this.updateParameterVisibility();
	//         setTimeout(function(){
	//             this.initSelectBoxes();
	//             // this.initSelectBoxes();
	//         }, 100); //wait a little while so that dom elements are updated
	//
	//     }
	// });
};

app.proto.runUnitTests = function () {
	if (this.room === 'test1') require('./test/testsServerOperations.js')();
	else {
		require('./test/testsGraphCreation.js')();
		require('./test/testsParameters.js')();
	}
	require('./test/testOptions.js')(); //to print out results
};

/***
 * Loads parameters from the input json file and updates visibility
 * @param model
 * @param json
 */
app.proto.initParameters = function (model, json) {
	//Fill the model with json data
	this.modelManager.loadModelParameters(model, json);

	//update visibility in the model based on parameter conditions
	this.updateParameterVisibility();
};

/***
 * Initializes html select boxes
 * These cannot be updated directly by handlebars
 */
app.proto.initSelectBoxes = function () {
	let parameterList = this.modelManager.getModelParameters();

	if (parameterList) {
		parameterList.forEach(function (param) {
			if (param.isVisible) {
				//otherwise dom elements will not have been created yet
				this.initParamSelectBox(param);
			}
		});
	}
};

app.proto.initParamSelectBox = function (param) {
	param.cnt.forEach(function (cnt) {
		for (let j = 0; j < param.EntryType.length; j++) {
			let enumList = this.getEnum(param.EntryType[j]);

			if (enumList) {
				if (param.value && param.value[cnt] && param.value[cnt][j]) {
					this.getDomElement(param, cnt, j)[0].selectedIndex =
						enumList.indexOf(param.value[cnt][j]);
				} else {
					//no value assigned
					this.getDomElement(param, cnt, j)[0].selectedIndex = -1;
				}
			}
		}
	});
};

app.proto.unselectParameter = function (param, cnt, entryInd) {
	if (param.value) {
		// let currentValue = param.value[cnt][entryInd];
		let currentInd = this.getDomElement(param, cnt, entryInd)[0]
			.selectedIndex;

		let selectedInd = this.getEnum(param.EntryType[entryInd]).indexOf(
			param.value[cnt][entryInd]
		);

		if (currentInd === selectedInd && currentInd !== -1) {
			//double click
			this.getDomElement(param, cnt, entryInd)[0].selectedIndex = -1; //unselect
			//update the value too
			this.modelManager.setModelParameterValue(
				param.ind,
				cnt,
				entryInd,
				undefined
			);
		}
	}
};
/***
 * Initializes html check boxes
 * These cannot be updated directly by handlebars
 */
app.proto.initCheckBoxes = function () {
	let parameterList = this.modelManager.getModelParameters();

	if (parameterList) {
		parameterList.forEach(function (param) {
			if (param.isVisible) {
				this.initParamCheckBox(param);
			}
		});
	}
};

app.proto.initParamCheckBox = function (param) {

	param.cnt.forEach(function (cnt) {
		for (let j = 0; j < param.EntryType.length; j++) {
			if (param.EntryType[j] === 'Boolean') {
				let val = param.value[cnt][j];
				this.getDomElement(param, cnt, j).prop('checked', val);
			}
		}
	});
};

/***
 * Updates model when a new value is selected in the select box
 * @param param
 * @param cnt
 * @param entryInd
 */
app.proto.updateSelected = function (param, cnt, entryInd) {
	let e = this.getDomElement(param, cnt, entryInd)[0];
	let paramVal = e.options[e.selectedIndex].text;

	this.modelManager.setModelParameterValue(
		param.ind,
		cnt,
		entryInd,
		paramVal
	);
};

/***
 * Updates model when the check box is clicked
 * @param param
 * @param cnt
 * @param entryInd
 */
app.proto.updateChecked = function (param, cnt, entryInd) {
	let paramVal = this.getDomElement(param, cnt, entryInd).prop('checked');

	this.modelManager.setModelParameterValue(
		param.ind,
		cnt,
		entryInd,
		paramVal
	);
};

/***
 * Updates parameters when the submit button for batch values is clicked
 * This should also update the ui for multiple parameters
 * @param param
 * @param cnt : current parameter's count
 * @param ind: parameter's idnex
 */
app.proto.updateBatch = function (param) {
	// let this = this;

	let cnt = this.modelManager.getModelParameterCnt(param.ind);
	let valStr = $('#' + param.batchDomId)
		.val()
		.trim();

	let vals = valStr.split('\n');

	let newCnt = vals.length;

	//first clear cnt array
	this.modelManager.emptyModelParameterCntArr(param.ind);

	this.model.set('_page.doc.parameters.' + param.ind + '.domId', null);

	//then add the input boxes back
	for (let i = 0; i < newCnt; i++) {
		let valEntry = vals[i].split(' ');
		for (let entryInd = 0; entryInd < valEntry.length; entryInd++) {
			this.modelManager.setModelParameterValue(
				param.ind,
				i,
				entryInd,
				valEntry[entryInd]
			);
		}
		this.addParameterInput(param);
	}
};

/***
 * Resets all parameters to default values
 */
app.proto.resetToDefaultParameters = function () {
	this.modelManager.resetToDefaultModelParameters();
};

/***
 * Resets all layout parameters to default values
 */
app.proto.resetToDefaultLayoutParameters = function () {
	cgfCy.initLayoutOptions(this.modelManager);
};

app.proto.submitLayoutParameters = function () {
	document.getElementById('layout-properties-table').style.display = 'none';
};

/***
 * Make sure the mandatory parameters are not null
 * @returns {boolean}
 */
app.proto.checkParameters = function () {
	let parameterList = this.modelManager.getModelParameters();
	let isSuccessful = true;

	let missingValues = '';
	for (let i = 0; i < parameterList.length; i++) {
		if (
			parameterList[i].isVisible &&
			parameterList[i].Mandatory &&
			isValueMissing(parameterList[i].value, undefined)
		) {
			isSuccessful = false;
			missingValues += '-' + parameterList[i].Title + '\n';
		}
	}

	if (missingValues !== '') alert('Please enter:\n' + missingValues);

	return isSuccessful;
};

/***
 * Formats the content to write into parameters.txt
 * @param parameterList
 * @returns {string}
 */
var convertParameterListToFileContent = function (parameterList) {
	let content = '';
	parameterList.forEach(function (parameter) {
		if (parameter.isVisible && parameter.value) {
			parameter.value.forEach(function (val) {
				if (val) {
					let valContent = '';
					for (let i = 0; i < val.length; i++) {
						if (!val[i] || val[i] === '') {
							//don't write the file if a value is missing
							valContent = '';
							break;
						} else valContent += val[i] + ' ';
					}
					if (valContent !== '')
						content += parameter.ID + ' = ' + valContent + '\n';
				}
			});
		}
	});

	return content;
};

/***
 * Returns the values of the enum type
 * @param type
 */
app.proto.getEnum = function (type) {
	if (this.modelManager) {
		let enumList = this.modelManager.getModelEnumerations();

		for (let i = 0; i < enumList.length; i++) {
			if (enumList[i].name === type) {
				return enumList[i].values;
			}
		}
	}
};

/***
 * Adds new input boxes when a new parameter is added
 * @param param
 */
app.proto.addParameterInput = function (param) {
	// let this = this;

	if (isValueMissing(param.value, null)) {
		alert('First enter missing values for ' + param.Title);
		return;
	}

	let newCnt = this.modelManager.getModelParameterCnt(param.ind);

	this.modelManager.pushModelParameterCnt(param.ind, newCnt); //id of the html field

	for (let j = 0; j < param.EntryType.length; j++)
		this.model.set(
			'_page.doc.parameters.' + param.ind + '.domId.' + newCnt + '.' + j,
			param.ID + '-' + newCnt + '-' + j
		); //for multiple fields

	//assign values even if they are null

	for (let j = 0; j < param.EntryType.length; j++) {
		if (!param.value || !param.value[newCnt] || !param.value[newCnt][j])
			this.model.set(
				'_page.doc.parameters.' +
				param.ind +
				'.value.' +
				newCnt +
				'.' +
				j,
				null
			); //for multiple fields
	}

	//update ui elements accordingly
	this.initParamSelectBox(param);
	this.initParamCheckBox(param);
};

/**
 * Fills the batch text box with the already entered values when batch button is clicked
 * @param param
 */
app.proto.updateBatchBox = function (param) {
	let cnt = this.modelManager.getModelParameterCnt(param.ind);
	//update the batch text box accordingly
	let batchTxt = '';
	for (let i = 0; i < cnt; i++) {
		let line = '';
		for (let j = 0; j < param.EntryType.length; j++) {
			if (param.value) {
				line += param.value[i][j];
				if (j < param.EntryType.length - 1) line += ' ';
				else line += '\n';
			}
		}

		batchTxt += line;
	}
	$('#' + param.batchDomId).val(batchTxt);
};

/***
 * Determines whether to show or hide DOM elements depending on parameter conditions
 */
app.proto.updateParameterVisibility = function () {
	let parameterList = this.modelManager.getModelParameters();
	// let this = this;

	parameterList.forEach(function (param) {
		if (param.Condition) {
			let condition = param.Condition;

			if (!condition.Operator) {
				//a single condition without an operator
				let condParam = this.modelManager.findModelParameterFromId(
					condition.Parameter
				);
				if (this.conditionResult(condParam.ind, condition.Value)) {
					this.model.set(
						'_page.doc.parameters.' + param.ind + '.isVisible',
						true
					);
				} else {
					this.model.set(
						'_page.doc.parameters.' + param.ind + '.isVisible',
						false
					);
				}
			} else {
				if (
					this.satisfiesConditions(
						condition.Operator,
						condition.Conditions
					)
				) {
					this.model.set(
						'_page.doc.parameters.' + param.ind + '.isVisible',
						true
					);
				} else {
					this.model.set(
						'_page.doc.parameters.' + param.ind + '.isVisible',
						false
					);
				}
			}
		}
	});
};

/***
 * Checks conditions for parameter
 * @param op
 * @param conditions
 * @returns {*}
 */
app.proto.satisfiesConditions = function (op, conditions) {
	// let this = this;
	let results = [];
	for (let i = 0; i < conditions.length; i++) {
		let condition = conditions[i];

		if (
			condition.Parameter !== undefined &&
			condition.Value !== undefined
		) {
			//if it is not composite
			let condParam = this.modelManager.findModelParameterFromId(
				condition.Parameter
			);

			let result = this.conditionResult(condParam.ind, condition.Value);
			results.push(result);

			if (condition.Parameter === 'fdr-threshold-for-network-significance')
				console.log(result);
		} else if (condition.Operator) {
			results.push(
				this.satisfiesConditions(
					condition.Operator,
					condition.Conditions
				)
			);
		}
	}

	if (op === 'AND') {
		for (let i = 0; i < results.length; i++) {
			if (!results[i]) return false;
		}
		return true;
	} else if (op === 'OR') {
		for (let i = 0; i < results.length; i++) {
			if (results[i]) return true;
		}
		return false;
	} else if (op === 'NOT') {
		return !results[0];
	} else if (!op) {
		return results[0];
	}
};

/***
 * Tests whether the condition holds, i.e. a parameter's value is equal to the given value
 * TODO: Assumes that conditions are specified only for the first element for parameters that can be multiple
 * @param index of the parameter
 * @param value
 * @returns {boolean}
 */
app.proto.conditionResult = function (ind, value) {
	let paramVal = this.modelManager.getModelParameterValue(ind, 0);

	if (paramVal) return paramVal[0] === value[0]; //TODO: look at this
	else if (value[0] == null) return true;
	return false;
};

/***
 * Returns the element given the parameter and its indices
 * @param param
 * @param cnt
 * @param entryInd
 * @returns {*|jQuery|HTMLElement}
 */
app.proto.getDomElement = function (param, cnt, entryInd) {
	return $('#' + param.domId[cnt][entryInd]);
};

app.proto.runLayout = function () {
	if (docReady) cgfCy.runLayout(this.modelManager.getLayoutOptions());
};

/***
 * Reload the graph
 * Called after changing topology grouping
 */
app.proto.reloadGraph = function () {
	cy.destroy();
	const cgfText = this.model.get('_page.doc.cgfText');
	this.createCyGraphFromCgf(JSON.parse(cgfText));
};

/***
 * Load demo graph from demoJson.js
 */
// TODO: remove or comment out?
app.proto.loadDemoGraph = function () {
	console.log("Display Demo Graphs Clicked");
	const demoJson = require('./public/demo/demoJson');
	graphChoice = graphChoiceEnum.DEMO;
	this.model.set('_page.doc.cgfText', JSON.stringify(demoJson));
	this.showGraphContainer();
	this.createCyGraphFromCgf(demoJson);

	// commenting out this line to support multiple demo graphs
	// $('#folder-tree').hide();

	$('#download-div').hide(); //this only appears after analysis is performed -- demo has no analysis result
};

app.proto.loadSpecificDemoGraph = function (subId) {
	// const this = this;
	let choosenNodeId = '___samples___' + subId;
	this.loadDemoGraphs(choosenNodeId);
};

app.proto.getFileText = function (filePath) {
	let xhttp;
	if (window.XMLHttpRequest) {
		xhttp = new XMLHttpRequest();
	} else {
		xhttp = new ActiveXObject('Microsoft.XMLHTTP');
	}
	xhttp.open('GET', filePath, false);
	xhttp.send();
	return xhttp.response;
};

app.proto.getFileObject = function (filePath) {
	// const this = this;

	function getFileBlob(filePath) {
		const text = this.getFileText(filePath);
		return new Blob([text]);
	}

	// function getFileBlob(filePath) {
	//   if (window.XMLHttpRequest) {
	//     xhttp = new XMLHttpRequest();
	//   }
	//   else {
	//     xhttp = new ActiveXObject("Microsoft.XMLHTTP");
	//   }
	//   xhttp.open("GET", filePath, false);
	//   xhttp.send();
	//   var text = xhttp.response;
	//   return new Blob([text]);
	// }

	const blobToFile = function (blob, name) {
		blob.lastModifiedDate = new Date();
		blob.name = name;
		return blob;
	};

	const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);
	const blob = getFileBlob(filePath);
	return blobToFile(blob, fileName);
};

app.proto.loadDemoGraphs = function (choosenNodeId) {
	// const this = this;

	let notyView = new Noty({
		type: 'information',
		layout: 'bottom',
		text: 'Loading demo folders...Please wait.',
	});
	notyView.show();

	const extendFileObj = (fileObj, filePath) => {
		fileObj.webkitRelativePath = filePath.replace('demo/', '');
		return fileObj;
	};

	let makeRequest = () =>
		fetch('/api/calculateDemoFolderFilePaths', {
			method: 'POST',
		});

	let afterResolve = (filePaths) => {
		const fileObjs = filePaths.map((filePath) => {
			filePath = filePath.replace('public/', '');
			let fileObj = this.getFileObject(filePath);
			fileObj = extendFileObj(fileObj, filePath);
			return fileObj;
		});
		notyView.close();
		this.loadAnalysisFilesFromClient(fileObjs, choosenNodeId);
	};

	let handleRequestError = (err) => {
		notyView.close();
		notyView = new Noty({
			type: 'error',
			layout: 'bottom',
			timeout: 4500,
			text: 'Error in reading demo folder content.',
		});
		notyView.show();
		alert('The error message is:\n' + err);
		throw err;
	};

	makeRequest().then((res) =>
		handleResponse(res, afterResolve, handleRequestError, (res) =>
			res.json()
		)
	);
};

/***
 * Load graph file in json format
 */
app.proto.loadGraphFile = function (file) {
	// const this = this;
	graphChoice = graphChoiceEnum.JSON;

	const reader = new FileReader();

	reader.onload = function (e) {
		this.model.set('_page.doc.cgfText', this.result);
		this.createCyGraphFromCgf(JSON.parse(this.result));
	};

	reader.readAsText(file);
};

function buildTree(parts, treeNode, file, parentNodePath = '') {
	let idSeperator = '___';
	if (parts.length === 0) {
		return;
	}

	for (let i = 0; i < treeNode.length; i++) {
		let nodeText = treeNode[i].text;
		if (parts[0] === nodeText) {
			buildTree(
				parts.splice(1, parts.length),
				treeNode[i].children,
				file,
				parentNodePath + idSeperator + nodeText
			);
			return;
		}
	}

	let nodeId = parentNodePath + idSeperator + parts[0];
	let newNode = {
		id: nodeId,
		text: parts[0],
		children: [],
		state: {opened: true},
		data: file,
	};

	treeNode.push(newNode);
	buildTree(parts.splice(1, parts.length), newNode.children, file, nodeId);
}

app.proto.setGraphDescriptionText = function (text) {
	$('#graph-description-span').text(text);
};

/***
 * Organizes data as a tree and displays the jstree associated with it
 * @param fileList: List of files to display
 * @param isFromClient: file list structure is different depending on whether it is coming from the server or client
 */
app.proto.buildAndDisplayFolderTree = function (
	fileList,
	isFromClient,
	choosenNodeId
) {
	let notyView;
	// let this = this;
	let maxTextLength = 0;

	let data = [];
	const fontSize = parseInt($('#folder-tree').css('font-size'));
	const tabSize = parseInt($('#folder-tree').css('tab-size'));
	let paths;

	fileList.forEach((file) => {
		if (isFromClient && file.name.toLowerCase() === 'causative.json')
			paths = file.webkitRelativePath.split('/').slice(0, -1);
		else if (!isFromClient) paths = file.split('/').slice(0, -1);

		if (paths) {
			//update the div size for the folders
			for (let i = 0; i < paths.length; i++) {
				let path = paths[i];
				let lenPathStr = path.length * fontSize + (i + 1) * tabSize;
				let capitalCaseDifference = fontSize * 0.4;
				// TODO:
				// apperantly the calculation of 'lenPathStr' here is just an approximation
				// when there were plenty of capital letters in path strings
				// the folder tree the content was not fitting to the folder tree div
				// for now add an extra value for the capital letters
				// but for longer term may need to either update the css logic there
				// or calculate 'lenPathStr' more precisely
				path.split('').forEach((ch) => {
					if (ch >= 'A' && ch <= 'Z') {
						lenPathStr += capitalCaseDifference;
					}
				});
				if (lenPathStr > maxTextLength) maxTextLength = lenPathStr;
			}
			buildTree(paths, data, file);
		}
	});

	let sort = function (id1, id2) {
		var node1 = this.get_node(id1);
		var node2 = this.get_node(id2);

		var text1 = node1.text || '';
		var text2 = node2.text || '';

		return text1.localeCompare(text2, undefined, {numeric: 'true'});
	};
	let hierarchy = {core: {data: data}, sort, plugins: ['sort']};

	$('#folder-tree').jstree('destroy');

	$('#folder-tree').jstree(hierarchy);

	let ftWidth = Math.min(maxTextLength + 20, 400);

	$('#folder-tree').width(ftWidth);

	$('#graph-container').css({left: ftWidth + 5});

	this.showGraphContainerAndFolderTree();

	this.setGraphDescriptionText('');

	this.createCyGraphFromCgf();

	$('#folder-tree').on('dblclick.jstree', function (e) {
		const instance = $.jstree.reference(this);
		let node = instance.get_node(e.target);
		if (isFromClient) {
			//directly load graph
			let file = node.data;
			this.loadGraphFile(file);
		} else {
			// get data from the server
			console.log(node.data);
			let q = {
				dir: node.data,
				room: this.room,
			};

			let makeRequest = () =>
				fetch('/api/getJsonAtPath', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify(q),
				});

			let afterResolve = (fileContent) => {
				this.model.set('_page.doc.cgfText', fileContent);
				this.createCyGraphFromCgf(JSON.parse(fileContent));
			};

			let handleRequestError = (err) => {
				notyView.close();
				notyView = new Noty({
					type: 'error',
					layout: 'bottom',
					timeout: 4500,
					text: 'Error in reading json file content.',
				});
				notyView.show();
				alert('The error message is:\n' + err);
				throw err;
			};
			makeRequest().then((res) =>
				handleResponse(res, afterResolve, handleRequestError)
			);
		}
		notyView.close();
	});

	if (choosenNodeId) {
		$('#folder-tree').on('ready.jstree', function (e) {
			const instance = $.jstree.reference(this);
			let node = instance.get_node(choosenNodeId);
			const nodeDivId = node.a_attr.id;

			$('#' + nodeDivId).trigger('dblclick.jstree');
			instance.select_node(node);
		});
	}

	notyView = new Noty({
		type: 'information',
		layout: 'bottom',
		text: 'Double click on a folder to load the model in that folder.',
		timeout: 10000,
	});
	notyView.show();

	$('#back-button')
		.unbind('click.removeNoty')
		.bind('click.removeNoty', function () {
			notyView.close();
		});
};

/***
 * Load graph directories as a tree in json format
 * In visualize results from a previous analysis
 */
app.proto.loadAnalysisFilesFromClient = function (fileList, choosenNodeId) {
	// const this = this;

	graphChoice = graphChoiceEnum.JSON;

	this.buildAndDisplayFolderTree(fileList, true, choosenNodeId);
};

/***
 * Load graph directories as a tree in json format
 * In visualize results from a previous analysis
 */
app.proto.loadAnalysisDirFromClientInput = function (event) {
	let fileList = Array.from(event.target.files);
	this.loadAnalysisFilesFromClient(fileList);

	event.target.value = null; //to make sure the same files can be loaded again
};

/***
 * Take the input files and transfer them to the server in analysisDir and run shell command
 * Produces graph from analysis results
 */
app.proto.loadAnalysisDirFromServer = function (event) {
	graphChoice = graphChoiceEnum.ANALYSIS;
	const fileCnt = $('#analysis-directory-input')[0].files.length;
	const fileContents = [];
	let notyView = new Noty({
		type: 'information',
		layout: 'bottom',
		text: 'Reading files...Please wait.',
	});
	notyView.show();

	notyView.setText('Reading files...Please wait.');

	console.log($('#analysis-directory-input')[0].files);
	//Sending a zip file
	if (
		fileCnt === 1 &&
		$('#analysis-directory-input')[0]
			.files[0].name.split('.')
			.pop()
			.toLowerCase() === 'zip'
	) {
		const file = $('#analysis-directory-input')[0].files[0];

		const reader = new FileReader();

		reader.onload = function (e) {
			fileContents.push({name: file.name, content: e.target.result});
			notyView.setText('Analyzing results...Please wait.');
			let q = {
				fileContent: e.target.result,
				room: this.room,
			};

			let makeRequest = () =>
				fetch('/api/analysisZip', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify(q),
				});

			let afterResolve = (dirStr) => {
				let fileStrList = dirStr.split('\n');
				this.buildAndDisplayFolderTree(fileStrList, false);
				notyView.close();
			};

			let handleRequestError = (err) => {
				notyView.close();
				notyView = new Noty({
					type: 'error',
					layout: 'bottom',
					timeout: 4500,
					text: 'Error in creating json file.',
				});
				notyView.show();
				alert('The error message is:\n' + err);
			};

			makeRequest().then((res) =>
				handleResponse(res, afterResolve, handleRequestError)
			);
		};

		reader.readAsBinaryString(file);
	} else {
		const p1 = new Promise(function (resolve, reject) {
			for (let i = 0; i < fileCnt; i++) {
				(function (file) {
					//Send these files to server
					const reader = new FileReader();
					reader.onload = function (e) {
						fileContents.push({
							name: file.name,
							content: e.target.result,
						});
						if (fileContents.length >= fileCnt) resolve('success');
					};

					reader.readAsText(
						$('#analysis-directory-input')[0].files[i]
					);
				})($('#analysis-directory-input')[0].files[i]);
			}
		});

		p1.then(function (content) {
			notyView.setText('Analyzing results...Please wait.');

			let q = {
				inputFiles: fileContents,
				room: this.room,
			};

			let makeRequest = () =>
				fetch('/api/analysisDir', {
					method: 'POST',
					headers: {
						'content-type': 'application/json',
					},
					body: JSON.stringify(q),
				});

			let afterResolve = (dirStr) => {
				console.log('Output of analysisdir:');
				console.log(dirStr);

				let fileStrList = dirStr.split('\n');
				this.buildAndDisplayFolderTree(fileStrList, false);
				notyView.close();
			};

			let handleRequestError = (err) => {
				notyView.close();
				notyView = new Noty({
					type: 'error',
					layout: 'bottom',
					timeout: 4500,
					text: 'Error in input files.',
				});
				notyView.show();
				alert('The error message is:\n' + err);
			};

			makeRequest().then((res) =>
				handleResponse(res, afterResolve, handleRequestError)
			);
		});
	}
	event.target.value = null; //to make sure the same files can be loaded again
};

/***
 * Create cytoscape graph from cgfJson
 * @param cgfJson
 */
app.proto.createCyGraphFromCgf = function (cgfJson, callback) {
	let cgfContainer;
	const noTopologyGrouping = this.model.get('_page.doc.noTopologyGrouping');

	if (cgfJson == null) {
		// var cgfText = this.model.get('_page.doc.cgfText');
		// if(cgfText)
		//     cgfJson = JSON.parse(cgfText);
		// else {
		// display an empty graph -- don't show the previous model
		this.modelManager.clearModel();
		// this.showGraphContainer();
		cgfContainer = new cgfCy.createContainer(
			$('#graph-container'),
			!noTopologyGrouping,
			this.modelManager,
			function () {
				if (graphChoice !== graphChoiceEnum.JSON)
					//As json object is not associated with any analysis data
					$('#download-div').show();

				if (callback) callback();
			}
		);
	}

	if (cgfJson) {
		this.modelManager.clearModel();
		this.modelManager.initModelFromJson(cgfJson);

		if (docReady) {
			try {
				cy.destroy();
			} catch (error) {
				//console.log(error + " Cytoscape not created yet.");
			}
		} //cytoscape is loaded

		// this.showGraphContainer();
		const notyView = new Noty({
			type: 'information',
			layout: 'bottom',
			text: 'Drawing graph...Please wait.',
		});
		notyView.show();

		cgfContainer = new cgfCy.createContainer(
			$('#graph-container'),
			!noTopologyGrouping,
			this.modelManager,
			function () {
				if (graphChoice !== graphChoiceEnum.JSON)
					//As json object is not associated with any analysis data
					$('#download-div').show();
				notyView.close();
				if (callback) callback();
			}
		);

		const graphDescription = cgfJson.description;
		if (graphDescription) {
			this.setGraphDescriptionText(graphDescription);
		} else {
			this.setGraphDescriptionText('');
		}
	}
};

app.proto.hideMoreInfo = function () {
	$('#more-info-legend').hide();
	$('#example-graph-indicators').removeClass('z-index-0');
};

app.proto.showMoreInfo = function () {
	$('#more-info-legend').show();
	$('#example-graph-indicators').addClass('z-index-0');
};

/***
 * Hides input selection menu, folder tree and opens graph container
 */
app.proto.showGraphContainer = function () {
	$('#info-div').hide();
	$('#input-container').hide();
	$('#download-div').hide(); //this only appears after analysis is performed
	$('#graph-options-container').addClass('display-flex');
	$('#graph-container').show();
	$('#folder-tree').hide();
	$('#example-graphs-container').hide();

	$('#graph-container').css({left: 0});
};

/***
 * Initialization of the input selection menu
 */
app.proto.showInputContainer = function () {
	$('#info-div').show();
	$('#input-container').show();
	$('#example-graphs-container').show();
	$('#graph-options-container').removeClass('display-flex');
	$('#graph-container').hide();
	$('#folder-tree').hide();
};

/***
 * Hides input selection menu and opens graph container and folder tree
 */
app.proto.showGraphContainerAndFolderTree = function () {
	$('#info-div').hide();
	$('#input-container').hide();
	$('#download-div').hide(); //this only appears after analysis is performed
	$('#example-graphs-container').hide();
	$('#graph-options-container').addClass('display-flex');
	$('#graph-options-container').show();
	$('#graph-container').show();
	$('#folder-tree').show();
};

/***
 *Download and save results in <room>.zip
 */
app.proto.downloadResults = function () {
	if (graphChoice === graphChoiceEnum.DEMO) {
		console.log('No analysis results');
		return;
	}

	let notyView = new Noty({
		type: 'information',
		layout: 'bottom',
		text: 'Compressing files...Please wait.',
	});
	notyView.show();

	let q = {
		room: this.room,
	};

	let makeRequest = () =>
		fetch('/api/downloadRequest', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
			},
			body: JSON.stringify(q),
		});

	let afterResolve = (fileContent) => {
		console.log('Zip file received.');

		const blob = base64ToZipBlob(fileContent);
		saveAs(blob, this.room + '.zip');

		notyView.close();
	};

	let handleRequestError = (err) => {
		notyView.close();
		notyView = new Noty({
			type: 'error',
			layout: 'bottom',
			timeout: 4500,
			text: 'Error in downloading results\n.',
		});
		notyView.show();
		alert('The error message is:\n' + err);
	};

	makeRequest().then((res) =>
		handleResponse(res, afterResolve, handleRequestError)
	);
};

/***
 * Local function to convert binary-to-text encoded data into binary zip file
 * @param data
 * @returns {*}
 */
function base64ToZipBlob(data) {
	const byteCharacters = atob(data);
	const byteNumbers = new Array(byteCharacters.length);
	for (let i = 0; i < byteCharacters.length; i++) {
		byteNumbers[i] = byteCharacters.charCodeAt(i);
	}
	const byteArray = new Uint8Array(byteNumbers);
	return new Blob([byteArray], {type: 'application/zip'});
}

/***
 * @param arr
 * @param testAgainst : can be null or undefined
 * @returns {boolean}
 */
function isValueMissing(arr, testAgainst) {
	if (arr === undefined) return true;
	for (let i = 0; i < arr.length; i++) {
		if (arr[i] === testAgainst) return true;
		for (let j = 0; j < arr[i].length; j++) {
			if (arr[i][j] === testAgainst) return true;
		}
	}
	return false;
}
