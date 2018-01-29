/*
 *	Model initialization
 *  Event handlers of model updates
 *	Author: Funda Durupinar Babur<f.durupinar@gmail.com>
 */
var app = module.exports = require('derby').createApp('cwc', __filename);



app.loadViews(__dirname + '/views');

var docReady = false;

var socket;

app.modelManager = null;

var cgfCy;


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

    if(arg.docId === 'test' && model.get('documents.test'))
        model.set('documents.test', null);

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


                        if(arg.docId === 'test') { //clear everything and start from scratch if this is test mode
;

                            // if(cgfTextPath.get())
                            //     model.set(docPath + '.cgfText', null);
                            // if(cyPath.get())
                            //     model.set(docPath + '.cy', null);
                            // if(parametersPath.get())
                            //     model.set(docPath + '.parameters', null);
                            // if(enumerationsPath.get())
                            //     model.set(docPath + '.enumerations', null);

                        };
                        // console.log(model.get('_page.doc.parameters'));
                        page.render();
                    });
                });

            });
        });
    });

});


app.proto.create = function (model) {


    cgfCy = require('./public/src/cgf-visualizer/cgf-cy.js');


    socket = io();



    var id = model.get('_session.userId');
    var name = model.get('users.' + id +'.name');
    let room = model.get('_page.room');
    //
    this.modelManager = require('./public/src/model/modelManager.js')(model, room, model.get('_session.userId'),name );
    //
    //
    let self = this;
    socket.on('parameterDescription', function(fileContent){

        let json = JSON.parse(fileContent);

        self.loadParameters(model, json);

        docReady = true;

        self.initSelectBoxes();
        self.initCheckBoxes();


        //it can only run after the parameters are run
        window.testApp = this;

        console.log("Parameters acquired from the server");

    });

    if(room === 'test')
        this.runUnitTests();

};

/***
 * Called after document is loaded.
 * Listeners are called here.
 * @param model
 */
app.proto.init = function (model) {

    let self = this;

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
    require("./test/testsGraphCreation.js")();
    require("./test/testOptions.js")(); //to print out results
}

/***
 * Loads parameters from the input json file
 * @param model
 * @param json
 */
app.proto.loadParameters = function(model, json){

    let parameterList = json.Parameters;
    let enumerationList = json.Enumerations;


    //call before parameters because we will set parameter types accordingly
    if(model.get('_page.doc.enumerations') == null)
        model.set('_page.doc.enumerations', enumerationList);

    if(model.get('_page.doc.parameters') == null)
        model.set('_page.doc.parameters', parameterList);


    for(let i = 0; i < parameterList.length; i++){
        let param = parameterList[i];
        model.set('_page.doc.parameters.' + i + '.ind', i);  //index of a certain parameter

        model.set('_page.doc.parameters.' + i + '.isVisible', true);  //visibility is on by default



        if(model.get('_page.doc.parameters.' + i + '.cnt') == null) {
            model.push('_page.doc.parameters.' + i + '.cnt', 0);  //for multiple fields

            for (let j = 0; j < param.EntryType.length; j++)
                model.set('_page.doc.parameters.' + i + '.domId.0.' + j, (param.ID + "-0-" + j));  //for multiple fields

            // if(param.CanBeMultiple === "true")
                model.set('_page.doc.parameters.' + i + '.batchDomId', (param.ID + "-batch"));  //for batch values
                model.set('_page.doc.parameters.' + i + '.batchModalDomId', (param.ID + "-batchModal"));  //for batch values

        }
        if(model.get('_page.doc.parameters.' + i + '.value') == null) {
            if(param.Default)
                model.set('_page.doc.parameters.' + i + '.value', param.Default);
        }
    }

    this.updateParameterVisibility();
};


/***
 * Initializes html select boxes
 * These cannot be updated directly by handlebars
 */
app.proto.initSelectBoxes = function(){
    let self = this;
    let parameterList = self.model.get('_page.doc.parameters');


    if(parameterList) {
        parameterList.forEach(function (param) {
            if(param.isVisible) { //otherwise dom elements will not have been created yet
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
        });
    }
}


/***
 * Initializes html check boxes
 * These cannot be updated directly by handlebars
 */
app.proto.initCheckBoxes = function() {

    let self = this;
    let parameterList = self.model.get('_page.doc.parameters');

    if(parameterList) {
        parameterList.forEach(function (param) {
            if(param.isVisible) {
                param.cnt.forEach(function (cnt) {
                    for (let j = 0; j < param.EntryType.length; j++) {
                        if (param.EntryType[j] === "Boolean") {
                            let val = param.value[cnt][j];
                            if (val === "true" || val === true)
                                self.getDomElement(param, cnt, j).prop('checked', true);
                            else
                                self.getDomElement(param, cnt, j).prop('checked', false);

                        }
                    }
                });
            }
        });
    }
}


app.proto.setParamValue = function(param, cnt, entryInd, val){
    this.model.set('_page.doc.parameters.' + param.ind + '.value.' + cnt + '.' + entryInd , val);
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

    this.setParamValue(param, cnt, entryInd, paramVal );


}

/***
 * Updates model when the check box is clicked
 * @param param
 * @param cnt
 * @param entryInd
 */
app.proto.updateChecked = function(param, cnt, entryInd){

    let paramVal = this.getDomElement(param, cnt, entryInd).prop('checked');

    this.setParamValue(param, cnt, entryInd, paramVal );

}


/***
 * Updates model when the submit button for batch values is clicked
 * @param param
 * @param cnt
 */
app.proto.updateBatch = function(param, cnt){


    let valStr =  $('#' + param.batchDomId).val();

    let vals = valStr.split("\n");

    for(let i = cnt; i < (vals.length + cnt); i++ ) {
        let valEntry = vals[i].split(" ");

        for(let entryInd  =0; entryInd < valEntry.length; entryInd++) {

            this.setParamValue(param, i, entryInd, valEntry[entryInd]);
        }
    }


}


/***
 * Resets all parameters to default values
 */
app.proto.resetToDefaultParameters= function(){
    let self = this;

    let parameterList = self.model.get('_page.doc.parameters');
    for(let i = 0; i < parameterList.length; i++){
        self.model.set('_page.doc.parameters.' + i + '.value', parameterList[i].Default);
    }
}

/***
 * Sends the parameters to the server to write into a text file
 */
app.proto.submitParameters = function () {
    let self = this;
    let parameterList = this.model.get('_page.doc.parameters');

    let isSuccessful = this.checkParameters();
    if(isSuccessful) { //means all the parameters are assigned proper values


        let room = self.model.get('_page.room');

        let fileContent = convertParameterListToFileContent(parameterList);

        //send files first

        var notyView = noty({type:"information", layout: "bottom",text: "Reading files...Please wait."});

        socket.emit("writeFileOnServerSide", room, fileContent, 'parameters.txt', true,function (data) {
            document.getElementById('parameters-table').style.display='none';

            if(data.indexOf("Error") == 0){
                notyView.close();
                notyView = noty({type:"error", layout: "bottom",timeout: 4500, text: ("Error in input files.")});
                console.log(data);

            }
            else{

                notyView.setText( "Analyzing results...Please wait.");

                self.createCyGraphFromCgf(JSON.parse(data), function () {
                    notyView.close();
                });

                self.model.set('_page.doc.cgfText', data);
            }

        });

    }

}
/***
 * Make sure the mandatory parameters are not null
 * @returns {boolean}
 */
app.proto.checkParameters = function(){
    let parameterList = this.model.get('_page.doc.parameters');
    let isSuccessful = true;

    function isValueMissing(arr){

        if(arr === undefined)
            return true;
        for(let i = 0; i < arr.length; i++){
            if(arr[i] === undefined)
                return true;
            for(let j = 0; j < arr[i].length; j++){
                if(arr[i][j] === undefined)
                    return true;
            }
        }
        return false;
    }


    let missingValues = "";
    for(let i = 0; i < parameterList.length; i++){
        if(parameterList[i].isVisible && parameterList[i].Mandatory === "true" && isValueMissing(parameterList[i].value)){
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
 * Can a parameter be multiple?
 * @param param
 * @returns {*}
 */
app.proto.getMultiple = function(param) {
    if(param.CanBeMultiple === "true")
        return true;
    else
        return undefined;
}

/***
 * Returns the values of the enum type
 * @param type
 */
app.proto.getEnum = function(type){
    let enumList = this.model.get('_page.doc.enumerations');

    // console.log("getting enumerations");
    // console.log(enumList);
    for(var i = 0; i < enumList.length; i++){
        if(enumList[i].name === type) {
            return enumList[i].values;
        }
    }
}

/***
 * Adds new input boxes when a new parameter is added
 * @param param
 */
app.proto.addParameter = function(param){

    let self = this;
    let newCnt = this.model.get('_page.doc.parameters.' + param.ind + '.cnt').length;

    this.model.push('_page.doc.parameters.' + param.ind + '.cnt', newCnt);  //id of the html field

    for(let j =0 ; j < param.EntryType.length; j++)
        self.model.set('_page.doc.parameters.' +  param.ind  + '.domId.' + newCnt +'.' + j , (param.ID + "-"+ newCnt + "-" + j));  //for multiple fields

}

/***
 * Determines whether to show or hide DOM elements depending on parameter conditions
 */
app.proto.updateParameterVisibility = function(){
    let parameterList = this.model.get('_page.doc.parameters');
    let self = this;

    parameterList.forEach(function(param){
        if(param.Condition) {
            let condition = param.Condition;

            if(!condition.Operator) { //a single condition without an operator
                if (self.conditionResult(condition.Parameter, condition.Value)){
                    self.model.set('_page.doc.parameters.' + param.ind + '.isVisible', true);

                        // param.cnt.forEach(function(cnt) {
                        //     for (let entryInd = 0; entryInd < param.EntryType.length; entryInd++) {
                        //         let enumList = self.getEnum(param.EntryType[entryInd]);
                        //         if(enumList){
                        //             if()
                        //             self.updateSelected(param, cnt, entryInd);
                        //             }
                        //
                        //         else if (param.EntryType[entryInd] === "Boolean")
                        //             self.updateChecked(param, cnt, entryInd);
                        //     }
                        // });
                }
                else{

                    self.model.set('_page.doc.parameters.' + param.ind + '.isVisible', false);

            }
            }
            else{
                if (self.satisfiesConditions(condition.Operator, condition.Conditions)) {

                    self.model.set('_page.doc.parameters.' + param.ind + '.isVisible', true);

                    // param.cnt.forEach(function(cnt) {
                    //     for (let entryInd = 0; entryInd < param.EntryType.length; entryInd++) {
                    //         let enumList = self.getEnum(param.EntryType[entryInd]);
                    //         if(enumList)
                    //             self.updateSelected(param, cnt, entryInd);
                    //         else if (param.EntryType[entryInd] === "Boolean")
                    //             self.updateChecked(param, cnt, entryInd);
                    //     }
                    // });
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

            let param = self.findParameterFromId(condition.Parameter);


            let result = self.conditionResult(param, condition.Value);
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
 * parameters are stored in an array, so traverse the array for a matching id
 * @param id
 */
app.proto.findParameterFromId = function(id){
    let parameterList = this.model.get('_page.doc.parameters');
    let self = this;

    for(let i = 0; i < parameterList.length; i++){
        if(parameterList[i].ID === id)
            return parameterList[i];
    }
}

/***
 * Tests whether the condition holds, i.e. a parameter's value is equal to the given value
 * TODO: Assumes that conditions are specified only for the first element for parameters that can be multiple
 * @param param
 * @param value
 * @returns {boolean}
 */
app.proto.conditionResult = function(param, value){

    let paramVal = this.model.get('_page.doc.parameters.' + param.ind + '.value.0');


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

        let room = self.model.get('_page.room');

        //also send to server
        socket.emit("writeFileOnServerSide", room, event.target.result, file.name, false, function () {
            console.log("success");
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
    var notyView = noty({type:"information", layout: "bottom",text: "Reading files...Please wait."});

    var room = this.model.get('_page.room');
    notyView.setText( "Reading files...Please wait.");


    //Sending a zip file
    if(fileCnt == 1 &&  $('#analysis-directory-input')[0].files[0].name.split('.').pop().toLowerCase() == "zip"){

        var file = $('#analysis-directory-input')[0].files[0];

        var reader = new FileReader();

        reader.onload = function (e) {
            fileContents.push({name: file.name, content: e.target.result});
            notyView.setText( "Analyzing results...Please wait.");
            socket.emit('analysisZip', e.target.result, room, function(json){
                self.createCyGraphFromCgf(JSON.parse(json), function(){
                    notyView.close();
                });

                self.model.set('_page.doc.cgfText', json);
                notyView.close();
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
            var room = self.model.get('_page.room'); //each room will have its own folder
            socket.emit('analysisDir', fileContents, room, function(data){

                if(data.indexOf("Error") == 0){
                    notyView.close();
                    notyView = noty({type:"error", layout: "bottom",timeout: 4500, text: ("Error in input files.")});
                    console.log(data);

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

        var notyView = noty({type: "information", layout: "bottom",  text: "Drawing graph...Please wait."});


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

    var room = this.model.get('_page.room'); //each room will have its own folder

    if(graphChoice == graphChoiceEnum.DEMO)
        room = "demo"; //directly download

    var notyView = noty({type:"information", layout: "bottom",text: "Compressing files...Please wait."});

    socket.emit('downloadRequest', room, function(fileContent){
        console.log("Zip file received.");

        var blob = base64ToZipBlob(fileContent);

        saveAs(blob, (room + ".zip"));

        notyView.close();


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

