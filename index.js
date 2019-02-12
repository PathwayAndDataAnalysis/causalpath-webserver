/*
 *	Model initialization
 *  Event handlers of model updates
 *	Author: Funda Durupinar Babur<f.durupinar@gmail.com>
 */
var app = module.exports = require('derby').createApp('causalpath', __filename);
var $ = jQuery = require('jquery');
var io = require('socket.io-client');
var Noty = require('noty');
var saveAs = require('file-saver').saveAs;
var cytoscape = require('cytoscape');
var cyCoseBilkent = require('cytoscape-cose-bilkent');
var cyContextMenus = require('cytoscape-context-menus');
var cyPopper = require('cytoscape-popper');
var Tippy = require('tippy.js');
var causalityRenderer = require('./public/src/utilities/causality-cy-renderer');
var cgfCy = require('./public/src/cgf-visualizer/cgf-cy.js');

app.loadViews(__dirname + '/views');

var docReady = false;

var socket;

app.modelManager = null;


var graphChoiceEnum = {
    JSON: 1, ANALYSIS: 2, DEMO: 3
};

var graphChoice;

app.get('/', function (page, model, params) {
    function getId() {
        return model.id();
    }

    function idIsReserved() {
        var ret = model.get('documents.' + docId) != undefined;
        return ret;
    }

    var docId = getId();

    while (idIsReserved()) {
        docId = getId();
    }



    return page.redirect('/' + docId);
});


app.get('/:docId', function (page, model, arg, next) {
    var messagesQuery, room;
    room = arg.docId;


    var docPath = 'documents.' + arg.docId;

    if(arg.docId.includes('test') && model.get('documents.' + arg.docId))
        model.set('documents.' + arg.docId, null);

    model.ref('_page.doc', ('documents.' + arg.docId));

    model.subscribe(docPath, function (err) {
        if (err) return next(err);


        model.createNull(docPath, { // create the empty new doc if it doesn't already exist
            id: arg.docId
        });


        var cgfTextPath =  model.at((docPath + '.cgfText'));
        var cyPath =  model.at((docPath + '.cy'));
        var parametersPath =  model.at((docPath + '.parameters'));
        var enumerationsPath =  model.at((docPath + '.enumerations'));

        cgfTextPath.subscribe(function() {

            cyPath.subscribe(function () {
                parametersPath.subscribe(function(){
                    enumerationsPath.subscribe(function(){
                        model.set('_page.room', room);
                        if(arg.docId.includes('test')) { //clear everything and start from scratch if this is test mode
                            if(cgfTextPath.get())
                                model.set(docPath + '.cgfText', null);
                            if(cyPath.get())
                                model.set(docPath + '.cy', null);
                            if(parametersPath.get())
                                model.set(docPath + '.parameters', null);
                            if(enumerationsPath.get())
                                model.set(docPath + '.enumerations', null);

                        }
                        page.render();
                    });
                });

            });
        });
    });

});


app.proto.create = function (model) {

    let self = this;

    socket = this.socket = io();

    var id = model.get('_session.userId');
    var name = model.get('users.' + id +'.name');
    this.room = model.get('_page.room');
    //


    this.modelManager = require('./public/src/model/modelManager.js')(model, self.room, model.get('_session.userId'),name );
    //

    socket.on('parameterDescription', function(fileContent){

        self.parameterJson = JSON.parse(fileContent);

        self.initParameters(model, self.parameterJson);

        docReady = true;

        self.initSelectBoxes();
        self.initCheckBoxes();


        //it can only run after the parameters are run
        window.testApp = self;

        console.log("Parameters acquired from the server");

        //Run only after everything is ready
        if(self.room.includes('test'))
            self.runUnitTests();

    });

};

/***
 * Called after document is loaded.
 * Listeners are called here.
 * @param model
 */
app.proto.init = function (model) {

    let self = this;
    console.log('app inited');

    Tippy.setDefaults({
      arrow: true,
      placement: 'bottom'
    });

    cytoscape.use( cyCoseBilkent );
    cytoscape.use( cyContextMenus, $ );
    cytoscape.use( cyPopper );
    causalityRenderer();

    model.on('all', '_page.doc.parameters.*.value.**', function(ind, op, val, prev, passed){
        if(docReady) {
            self.updateParameterVisibility();
            setTimeout(function(){
                self.initSelectBoxes();
                self.initSelectBoxes();
            }, 100); //wait a little while so that dom elements are updated

        }
    });
}

app.proto.runUnitTests = function(){

    if(this.room === "test1")
        require("./test/testsServerOperations.js")();
    else {
        require("./test/testsGraphCreation.js")();
        require("./test/testsParameters.js")();
    }
    require("./test/testOptions.js")(); //to print out results

}

/***
 * Loads parameters from the input json file and updates visibility
 * @param model
 * @param json
 */
app.proto.initParameters = function(model, json){

    //Fill the model with json data
    this.modelManager.loadModelParameters(model,json);

    //update visibility in the model based on parameter conditions
    this.updateParameterVisibility();
};


/***
 * Initializes html select boxes
 * These cannot be updated directly by handlebars
 */
app.proto.initSelectBoxes = function(){
    let self = this;
    let parameterList = this.modelManager.getModelParameters();


    if(parameterList) {
        parameterList.forEach(function (param) {
            if(param.isVisible) { //otherwise dom elements will not have been created yet

                self.initParamSelectBox(param);
            }
        });
    }
}

app.proto.initParamSelectBox = function(param){
    let self  = this;
    param.cnt.forEach(function (cnt) {
        for (let j = 0; j < param.EntryType.length; j++) {

            let enumList = self.getEnum(param.EntryType[j]);


            if (enumList) {

                if (param.value && param.value[cnt] && param.value[cnt][j]) {
                    let selectedInd = enumList.indexOf(param.value[cnt][j])
                    self.getDomElement(param, cnt, j)[0].selectedIndex = selectedInd;



                }
                else { //no value assigned
                    self.getDomElement(param, cnt, j)[0].selectedIndex = -1;
                }
            }
        }
    });




}


app.proto.unselectParameter = function(param, cnt, entryInd){
    if(param.value) {
        // let currentValue = param.value[cnt][entryInd];

        let currentInd = this.getDomElement(param, cnt, entryInd)[0].selectedIndex;

        let selectedInd = this.getEnum(param.EntryType[entryInd]).indexOf(param.value[cnt][entryInd]);



        if (currentInd === selectedInd && currentInd!= -1) { //double click
            this.getDomElement(param, cnt, entryInd)[0].selectedIndex = -1; //unselect
            //update the value too
            this.modelManager.setModelParameterValue(param.ind, cnt, entryInd, undefined);
        }
    }
}
/***
 * Initializes html check boxes
 * These cannot be updated directly by handlebars
 */
app.proto.initCheckBoxes = function() {

    let self = this;
    let parameterList = this.modelManager.getModelParameters();


    if(parameterList) {
        parameterList.forEach(function (param) {
            if(param.isVisible) {

                self.initParamCheckBox(param);

            }
        });
    }
}

app.proto.initParamCheckBox = function(param){
    let self = this;

    param.cnt.forEach(function (cnt) {
        for (let j = 0; j < param.EntryType.length; j++) {
            if (param.EntryType[j] === "Boolean") {
                let val = param.value[cnt][j];
                self.getDomElement(param, cnt, j).prop('checked', val);

            }
        }
    });

}


/***
 * Updates model when a new value is selected in the select box
 * @param param
 * @param cnt
 * @param entryInd
 */
app.proto.updateSelected = function(param, cnt, entryInd){

    let e =  this.getDomElement(param, cnt, entryInd)[0];
    let paramVal = e.options[e.selectedIndex].text;

    this.modelManager.setModelParameterValue(param.ind, cnt, entryInd, paramVal );


}

/***
 * Updates model when the check box is clicked
 * @param param
 * @param cnt
 * @param entryInd
 */
app.proto.updateChecked = function(param, cnt, entryInd){

    let paramVal = this.getDomElement(param, cnt, entryInd).prop('checked');

    this.modelManager.setModelParameterValue(param.ind, cnt, entryInd, paramVal );

}


/***
 * Updates parameters when the submit button for batch values is clicked
 * This should also update the ui for multiple parameters
 * @param param
 * @param cnt : current parameter's count
 * @param ind: parameter's idnex
 */
app.proto.updateBatch = function(param){


    let self = this;

    let cnt = this.modelManager.getModelParameterCnt(param.ind);
    let valStr =  $('#' + param.batchDomId).val().trim();


    let vals = valStr.split("\n");

    let newCnt = vals.length;



    //first clear cnt array
    this.modelManager.emptyModelParameterCntArr(param.ind);

    self.model.set('_page.doc.parameters.' + param.ind + '.domId', null );


    //then add the input boxes back
    for(let i = 0; i < newCnt; i++ ) {

        let valEntry = vals[i].split(" ");
        for (let entryInd = 0; entryInd < valEntry.length; entryInd++) {
            self.modelManager.setModelParameterValue(param.ind, i, entryInd, valEntry[entryInd]);
        }
        self.addParameterInput(param);
    }

}


/***
 * Resets all parameters to default values
 */
app.proto.resetToDefaultParameters= function(){

    this.modelManager.resetToDefaultModelParameters();

}

/***
 * Sends the parameters to the server to write into a text file
 */
app.proto.submitParameters = function (callback) {
    let self = this;
    let parameterList = this.modelManager.getModelParameters();

    let isSuccessful = this.checkParameters();
    if(isSuccessful) { //means all the parameters are assigned proper values

        let fileContent = convertParameterListToFileContent(parameterList);

        //send files first

        var notyView = new Noty({type:"information", layout: "bottom",text: "Reading files...Please wait."});

        socket.emit("writeFileOnServerSide", self.room, fileContent, 'parameters.txt', true,function (data) {
            document.getElementById('parameters-table').style.display='none';

            if(data != undefined && data != null && data.indexOf("Error") == 0){
                notyView.close();
                notyView = new Noty({type:"error", layout: "bottom",timeout: 4500, text: ("Error in input files.")});
                alert("The error message is:\n" + data);
                if(callback) callback("error");
            }
            else{

                notyView.setText( "Analyzing results...Please wait.");

                self.createCyGraphFromCgf(JSON.parse(data), function () {
                    notyView.close();
                });

                self.model.set('_page.doc.cgfText', data);

                if(callback) callback(data);
            }

        });

    }

}
/***
 * Make sure the mandatory parameters are not null
 * @returns {boolean}
 */
app.proto.checkParameters = function(){
    let parameterList = this.modelManager.getModelParameters();
    let isSuccessful = true;



    let missingValues = "";
    for(let i = 0; i < parameterList.length; i++){
        if(parameterList[i].isVisible && parameterList[i].Mandatory && isValueMissing(parameterList[i].value, undefined)){
            isSuccessful = false;
            missingValues += "-" + parameterList[i].Title + "\n";
        }
    }


    if(missingValues !== "")
        alert("Please enter:\n" + missingValues);

    return isSuccessful;
}

/***
 * Formats the content to write into parameters.txt
 * @param parameterList
 * @returns {string}
 */
var convertParameterListToFileContent = function(parameterList) {

    let content = "";
    parameterList.forEach(function(parameter){


        if(parameter.isVisible && parameter.value) {
            parameter.value.forEach(function (val) {
                if(val) {


                    let valContent = "";
                    for(let i = 0; i < val.length; i++) {
                        if (!val[i] || val[i]=="") {  //don't write the file if a value is missing
                            valContent = "";
                            break;
                        }
                        else
                            valContent += val[i] + " ";
                    }
                    if(valContent !== "")
                        content += parameter.ID + " = " + valContent + "\n";

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
app.proto.getEnum = function(type){

 if(this.modelManager) {
     let enumList = this.modelManager.getModelEnumerations();

     for (var i = 0; i < enumList.length; i++) {
         if (enumList[i].name === type) {
             return enumList[i].values;
         }
     }
 }
}

/***
 * Adds new input boxes when a new parameter is added
 * @param param
 */
app.proto.addParameterInput = function(param){

    let self = this;

    if(isValueMissing(param.value, null)){

        alert("First enter missing values for " + param.Title);
        return;

    }


    let newCnt = this.modelManager.getModelParameterCnt(param.ind);


    this.modelManager.pushModelParameterCnt(param.ind, newCnt); //id of the html field


    for(let j = 0 ; j < param.EntryType.length; j++)
        self.model.set('_page.doc.parameters.' +  param.ind  + '.domId.' + newCnt +'.' + j , (param.ID + "-"+ newCnt + "-" + j));  //for multiple fields

    //assign values even if they are null

    for(let j = 0 ; j < param.EntryType.length; j++) {
        if(!param.value || !param.value[newCnt] || !param.value[newCnt][j])
            self.model.set('_page.doc.parameters.' + param.ind + '.value.' + newCnt + '.' + j, null);  //for multiple fields
    }

    //update ui elements accordingly
    self.initParamSelectBox(param);
    self.initParamCheckBox(param);

}

/**
 * Fills the batch text box with the already entered values when batch button is clicked
 * @param param
 */
app.proto.updateBatchBox = function(param){
    let cnt = this.modelManager.getModelParameterCnt(param.ind);
    //update the batch text box accordingly
    let batchTxt = "";
    for(let i = 0; i < cnt; i++) {
        let line = "";
        for (let j = 0; j < param.EntryType.length; j++) {
            if(param.value) {
                line += param.value[i][j]
                if (j < param.EntryType.length - 1)
                    line += " ";
                else
                    line +='\n'
            }
        }

        batchTxt += line;

    }
    $('#' + param.batchDomId).val(batchTxt);
}



/***
 * Determines whether to show or hide DOM elements depending on parameter conditions
 */
app.proto.updateParameterVisibility = function(){
    let parameterList = this.modelManager.getModelParameters();
    let self = this;

    parameterList.forEach(function(param){
        if(param.Condition) {
            let condition = param.Condition;

            if(!condition.Operator) { //a single condition without an operator
                let condParam = self.modelManager.findModelParameterFromId(condition.Parameter);
                if (self.conditionResult(condParam.ind, condition.Value)){

                    self.model.set('_page.doc.parameters.' + param.ind + '.isVisible', true);
                }
                else{
                    self.model.set('_page.doc.parameters.' + param.ind + '.isVisible', false);
                }
            }
            else{
                if (self.satisfiesConditions(condition.Operator, condition.Conditions)) {
                    self.model.set('_page.doc.parameters.' + param.ind + '.isVisible', true);
                }
                else {
                    self.model.set('_page.doc.parameters.' + param.ind + '.isVisible', false);
                }
            }
        }
    });
}

/***
 * Checks conditions for parameter
 * @param op
 * @param conditions
 * @returns {*}
 */
app.proto.satisfiesConditions = function(op, conditions){

    let self = this;
    let results = [];
    for(let i = 0 ; i < conditions.length; i++){
        let condition = conditions[i];

        if(condition.Parameter !== undefined && condition.Value !== undefined){ //if it is not composite

            let condParam = self.modelManager.findModelParameterFromId(condition.Parameter);


            let result = self.conditionResult(condParam.ind, condition.Value);
            results.push(result);

            if(condition.Parameter == "fdr-threshold-for-network-significance")
                console.log(result);
        }
        else if(condition.Operator) {
            results.push(self.satisfiesConditions(condition.Operator, condition.Conditions));
        }
    }

    if(op === 'AND'){
        for(let i = 0 ; i < results.length; i++){
            if(!results[i])
                return false;
        }
        return true;
    }
    else if(op === 'OR'){
        for(let i = 0 ; i < results.length; i++){
            if(results[i])
                return true;
        }
        return false;
    }
    else if(op === 'NOT'){
        return !results[0];

    }
    else if(!op){
        return results[0];
    }

}

/***
 * Tests whether the condition holds, i.e. a parameter's value is equal to the given value
 * TODO: Assumes that conditions are specified only for the first element for parameters that can be multiple
 * @param index of the parameter
 * @param value
 * @returns {boolean}
 */
app.proto.conditionResult = function(ind, value){

    let paramVal =  this.modelManager.getModelParameterValue(ind, 0);


    if(paramVal)
        return (paramVal[0] === value[0]); //TODO: look at this
    else
        if (value[0] == null)
            return true;
        return false;
}

/***
 * Load file specified in the parameters
 */
app.proto.loadFile = function(e, param, cnt, entryInd){

    var self = this;
    let id = self.model.get('_page.doc.parameters.' + param.ind + '.domId.' + cnt + '.' + entryInd);

    var reader = new FileReader();


    let file = this.getDomElement(param, cnt, entryInd)[0].files[0];

    reader.onload = function (event) {
        self.model.set('_page.doc.parameters.' + param.ind + '.value', [[file.name]]);


        //also send to server
        socket.emit("writeFileOnServerSide", self.room, event.target.result, file.name, false, function (data) {
            if(data != undefined && data != null && data.indexOf("Error") == 0){
                notyView.close();
                notyView = new Noty({type:"error", layout: "bottom",timeout: 4500, text: ("Error in parameters file.")});
                alert("The error message is:\n" + data);


            }
            // console.log("success");
        });
    };
    reader.readAsText(file);

}

/***
 * Returns the element given the parameter and its indices
 * @param param
 * @param cnt
 * @param entryInd
 * @returns {*|jQuery|HTMLElement}
 */
app.proto.getDomElement = function(param, cnt, entryInd){

    return $('#' + param.domId[cnt][entryInd]);
}

app.proto.runLayout = function(){
    if(docReady)
        cgfCy.runLayout();
}


/***
 * Reload the graph
 * Called after changing topology grouping
 */
app.proto.reloadGraph = function(){

    cy.destroy();
    var cgfText = this.model.get('_page.doc.cgfText');
    this.createCyGraphFromCgf(JSON.parse(cgfText));
}

/***
 * Load demo graph from demoJson.js
 */
app.proto.loadDemoGraph = function(){
    var demoJson = require('./public/demo/demoJson');
    graphChoice = graphChoiceEnum.DEMO;
    this.model.set('_page.doc.cgfText', JSON.stringify(demoJson));
    this.createCyGraphFromCgf(demoJson);

}

/***
 * Load graph file in json format
 */
app.proto.loadGraphFile = function(){

    var self = this;

    graphChoice = graphChoiceEnum.JSON;

    var reader = new FileReader();

    var extension = $("#graph-file-input")[0].files[0].name.split('.').pop().toLowerCase();

    reader.onload = function (e) {

        self.model.set('_page.doc.cgfText', this.result);
        self.createCyGraphFromCgf(JSON.parse(this.result));

    };
    //TODO: move graph-file-input to an argument
    reader.readAsText($("#graph-file-input")[0].files[0]);
}


/***
 * Take the input files and transfer them to the server in analysisDir and run shell command
 * Produces graph from analysis results
 */
app.proto.loadAnalysisDir = function(){

    var self = this;
    graphChoice = graphChoiceEnum.ANALYSIS;
    var fileCnt = $('#analysis-directory-input')[0].files.length;
    var fileContents = [];
    var notyView = new Noty({type:"information", layout: "bottom",text: "Reading files...Please wait."});


    notyView.setText( "Reading files...Please wait.");


    //Sending a zip file
    if(fileCnt == 1 &&  $('#analysis-directory-input')[0].files[0].name.split('.').pop().toLowerCase() == "zip"){

        var file = $('#analysis-directory-input')[0].files[0];

        var reader = new FileReader();

        reader.onload = function (e) {
            fileContents.push({name: file.name, content: e.target.result});
            notyView.setText( "Analyzing results...Please wait.");
            socket.emit('analysisZip', e.target.result, self.room, function(json){


                if(json != undefined && json != null && json.indexOf("Error") == 0){
                    notyView.close();
                    notyView = new Noty({type:"error", layout: "bottom",timeout: 4500, text: ("Error in creating json file.")});
                    alert("The error message is:\n" + json);

                }
                else {

                    self.createCyGraphFromCgf(JSON.parse(json), function () {
                        notyView.close();
                    });

                    self.model.set('_page.doc.cgfText', json);
                    notyView.close();
                }


            });
        }

        reader.readAsBinaryString(file);

    }
    else{
        var p1 = new Promise(function (resolve, reject) {
            for (var i = 0; i < fileCnt; i++) {
                (function (file) {

                    //Send these files to server
                    var reader = new FileReader();

                    reader.onload = function (e) {
                        fileContents.push({name: file.name, content: e.target.result});
                        if(fileContents.length >= fileCnt)
                            resolve("success");
                    }

                    reader.readAsText($("#analysis-directory-input")[0].files[i]);
                })($('#analysis-directory-input')[0].files[i]);
            }
        });

        p1.then(function (content) {

            notyView.setText( "Analyzing results...Please wait.");

            socket.emit('analysisDir', fileContents, self.room, function(data){

                if(data != undefined && data != null && data.indexOf("Error") == 0){
                    notyView.close();
                    notyView = new Noty({type:"error", layout: "bottom",timeout: 4500, text: ("Error in input files." )});
                    alert("The error message is:\n" + data);


                }
                else {

                    self.createCyGraphFromCgf(JSON.parse(data), function () {
                        notyView.close();
                    });

                    self.model.set('_page.doc.cgfText', data);
                }
            });


        }), function (xhr, status, error) {
            api.set('content.text', "Error retrieving data: " + error);

        }
    }
}

/***
 * Create cytoscape graph from cgfJson
 * @param cgfJson
 */
app.proto.createCyGraphFromCgf = function(cgfJson, callback){

    var noTopologyGrouping = this.model.get('_page.doc.noTopologyGrouping');


    if(cgfJson == null){
        var cgfText = this.model.get('_page.doc.cgfText');
        cgfJson = JSON.parse(cgfText);
    }


    if(cgfJson) {
        this.modelManager.clearModel();
        this.modelManager.initModelFromJson(cgfJson);


        if (docReady){

            try{
               cy.destroy();
            }
            catch(error){
                //console.log(error + " Cytoscape not created yet.");
            }
        } //cytoscape is loaded

        this.showGraphContainer();

        var notyView = new Noty({type: "information", layout: "bottom",  text: "Drawing graph...Please wait."});


        var cgfContainer = new cgfCy.createContainer($('#graph-container'),  !noTopologyGrouping, this.modelManager, function () {


            if(graphChoice != graphChoiceEnum.JSON) //As json object is not associated with any analysis data
             $('#download-div').show();

            notyView.close();

            if (callback) callback();
        });
    }

}

/***
 * Hides input selection menu and opens graph container
 */
app.proto.showGraphContainer = function(){
    $('#info-div').hide();
    $('#input-container').hide();
    $('#download-div').hide(); //this only appears after analysis is performed
    $('#graph-options-container').show();
    $('#graph-container').show();
}

/***
 * Initialization of the input selection menu
 */
app.proto.showInputContainer = function(){
    $('#info-div').show();
    $('#input-container').show();
    $('#graph-options-container').hide();
    $('#graph-container').hide();
}



/***
 *Download and save results in <room>.zip
 */
app.proto.downloadResults = function(){

    let self = this;

    if(graphChoice == graphChoiceEnum.DEMO) {
        console.log("No analysis results");
        return;
    }

    var notyView = new Noty({type:"information", layout: "bottom",text: "Compressing files...Please wait."});

    socket.emit('downloadRequest', self.room, function(fileContent){
        if(fileContent != undefined && fileContent != null && fileContent.indexOf("Error") == 0){
            notyView.close();
            notyView = new Noty({type:"error", layout: "bottom",timeout: 4500, text: ("Error in downloading results\n.")});
            alert("The error message is:\n" + fileContent);


        }
        else{
            console.log("Zip file received.");

            var blob = base64ToZipBlob(fileContent);

            saveAs(blob, (self.room + ".zip"));

            notyView.close();
        }

    });

}


/***
 * Local function to convert binary-to-text encoded data into binary zip file
 * @param data
 * @returns {*}
 */
function base64ToZipBlob(data){

    var byteCharacters = atob(data);
    var byteNumbers = new Array(byteCharacters.length);
    for (var i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    var byteArray = new Uint8Array(byteNumbers);

    var blob = new Blob([byteArray], { type: "application/zip"});

    return blob;

}

/***
 *
 * @param arr
 * @param testAgainst : can be null or undefined
 * @returns {boolean}
 */
function isValueMissing(arr, testAgainst){

    if(arr === undefined)
        return true;
    for(let i = 0; i < arr.length; i++){
        if(arr[i] == testAgainst)
            return true;
        for(let j = 0; j < arr[i].length; j++){
            if(arr[i][j] == testAgainst)
                return true;
        }
    }
    return false;
}
