/*
 *	Model initialization
 *  Event handlers of model updates
 *	Author: Funda Durupinar Babur<f.durupinar@gmail.com>
 */
var app = module.exports = require('derby').createApp('cwc', __filename);



app.loadViews(__dirname + '/views');
//app.loadStyles(__dirname + '/styles');
//app.serverUse(module, 'derby-stylus');


var testMode = false;

var docReady = false;

var socket;

app.modelManager = null;

var cgfCy;


var graphChoiceEnum = {
    JSON: 1, ANALYSIS: 2, DEMO: 3
};

var graphChoice;

let parameterList = [
    {id: "proteomicsPlatformFile", title:"Proteomics platform file", type:"text", defaultValue: "PNNL-causality-formatted.txt" },
    {id: "proteomicsValuesFile", title:"Proteomics values file", type:"text",  defaultValue: "PNNL-causality-formatted.txt" },
    {id: "idColumn", title:"ID Column", type:"text",  defaultValue: "ID" },
    {id: "symbolsColumn",  title:"Symbols column", type:"text",  defaultValue: "Symbols" },
    {id: "sitesColumn", title:"Sites column", type:"text",  defaultValue: "Sites" },
    {id: "effectColumn", title:"Effect column", type:"text",  defaultValue: "Effect" },
    {id: "doLogTransform", title:"Do Log transform", type:"checkbox",  defaultValue: "false" },
    {id: "thresholdForDataSignificance", title:"Threshold for data significance", type:"number", defaultValue: 0.05, step : 0.001 },
    {id: "fdrThresholdForDataSignificance", title:"FDR threshold for data significance", type:"number",  defaultValue: 0.05, step : 0.001 },
    {id: "poolProteomicsForFdrAdjustment", title:"Pool proteomics for Fdr adjustment", type:"checkbox",  defaultValue: "false" },
    {id: "fdrThresholdForNetworkSignificance", title:"FDR threshold for network significance", type:"number", defaultValue: 0.05, step : 0.001 },
    {id: "pValThresholdForCorrelation",  title:"P-value threshold for correlation", type:"number",  defaultValue: 0.05, step : 0.001 },
    {id: "valueTransformation", title:"Value transformation", type:"select",  defaultValue: 0, options: ["arithmetic-mean", "geometric-mean", "max", "difference-of-means", "fold-change-of-mean",
            "significant-change-of-mean", "correlation"]},
    {id: "customResourceDirectory", title:"Custom resource directory:", type:"text", defaultValue: "" },
    {id: "siteEffectProximityThreshold",  title:"Site effect proximity threshold", type:"number",  defaultValue: 0.05, step : 0.001 },
    {id: "siteMatchProximityThreshold",  title:"Site match proximity threshold", type:"number",  defaultValue: 0.05, step : 0.001 },
    {id: "defaultMissingValue",  title:"Default missing value", type:"number", defaultValue: 0 },
    {id: "relationFilterType", title:"Relation filter type", type:"select", defaultValue: 0, options: ["no-filter", "phospho-only", "expression-only", "phospho-primary-expression-secondary"]},
    {id: "geneFocus", title:"Gene focus", type:"text", defaultValue: "" },
    {id: "calculateNetworkSignificance", title:"Calculate network significance", type:"checkbox",  defaultValue: "false" },
    {id: "permutationsForSignificance",  title:"Permutations for significance", type:"integer",  defaultValue: 0 },
    {id: "tcgaDirectory", title:"TCGA directory", type:"text", defaultValue: "" },
    {id: "mutationEffectFile", title:"Mutation effect file", type:"text", defaultValue: "" },
    {id: "colorSaturationValue", title:"Color saturation value", type:"number", defaultValue: 5, min: 0.0 },
    {id: "doSiteMatching", title:"Do site matching", type:"checkbox", defaultValue: "false" },
    {id: "showUnexplainedProteomicData", title:"Show unexplained proteomic data", type:"checkbox", defaultValue: "false" },
    {id: "builtInNetworkResourceSelection", title:"Built-in network resources selection", type:"select", defaultValue: 0, options: ["PC", "REACH", "PhosphoNetworks", "IPTMNet", "TRRUST", "TFactS"]},
    {id: "generateDataCentricGraph", title:"Generate data-centric graph", type:"checkbox", defaultValue: "false" },
    {id: "correlationUpperThreshold", title:"Correlation upper threshold", type:"number", defaultValue: 1.0, max : 1.0, min : 0.0, step : 0.001 },
    {id: "minimumSampleSize", title:"Minimum sample size", type:"integer", defaultValue: 3 , min: 3},
    {id: "geneActivity", title:"Gene activity", type:"text", defaultValue: "" },
    {id: "tfActivityFile", title:"Tf activity file", type:"text", defaultValue: "" },
    {id: "useStrongestProteomicDataPerGene", title:"Use strongest proteomic data per gene", type:"check", defaultValue: "false" },
    {id: "useNetworkSignificanceForCausalReasoning", title:"Use network significance for causal reasoning", type:"check", defaultValue: "false" },
    {id: "minimumPotentialTargetsToConsiderForDownstreamSignificance", title:"Minimum potential targets to consider for downstream significance", type:"integer", defaultValue: 1, min: 1 },
    {id: "showInsignificantProteomicData", title:"Show insignificant proteomic data", type:"check", defaultValue: "false" },
    {id: "valueColumn", title:"Value column", type:"text", defaultValue: "" },
    {id: "controlValueColumn", title:"Control Value column", type:"text", defaultValue: "" },
    {id: "testValueColumn", title:"Test Value column", type:"text", defaultValue: "" }
    ];


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

     if( testMode ){ // use qunit testing doc if we're testing so we don't disrupt real docs
         docId = 'qunit';
     }

    return page.redirect('/' + docId);
});


app.get('/:docId', function (page, model, arg, next) {
    var messagesQuery, room;
    room = arg.docId;


    var docPath = 'documents.' + arg.docId;


    model.ref('_page.doc', ('documents.' + arg.docId));

    model.subscribe(docPath, function (err) {
        if (err) return next(err);

        model.createNull(docPath, { // create the empty new doc if it doesn't already exist
            id: arg.docId
        });

        var cgfTextPath =  model.at((docPath + '.cgfText'));
        var cyPath =  model.at((docPath + '.cy'));
        var parametersPath =  model.at((docPath + '.parameters'));

        cgfTextPath.subscribe(function() {

            cyPath.subscribe(function () {
                parametersPath.subscribe(function(){
                    model.set('_page.room', room);

                    page.render();
                })

            });
        });


    });


});



app.proto.create = function (model) {

    docReady = true;
    cgfCy = require('./public/src/cgf-visualizer/cgf-cy.js');


    socket = io();

    var id = model.get('_session.userId');
    var name = model.get('users.' + id +'.name');

    this.modelManager = require('./public/src/model/modelManager.js')(model, model.get('_page.room'), model.get('_session.userId'),name );


    this.loadParameters(model);
    if(testMode)
        this.runUnitTests();


};

const camelToDash = str => str
    .replace(/(^[A-Z])/, ([first]) => first.toLowerCase())
    .replace(/([A-Z])/g, ([letter]) => `-${letter.toLowerCase()}`)

app.proto.loadParameters = function(model){

    if(model.get('_page.doc.parameters') == null)
        model.set('_page.doc.parameters', parameterList);

    for(let i = 0; i < parameterList.length; i++){
        if(model.get('_page.doc.parameters.' + i + '.value') == null)
            model.set('_page.doc.parameters.' + i + '.value', parameterList[i].defaultValue);
    }
};

app.proto.resetToDefaultParameters= function(){
    let self = this;
    for(let i = 0; i < parameterList.length; i++){
        self.model.set('_page.doc.parameters.' + i + '.value', parameterList[i].defaultValue);
    }

}
//
// app.proto.formatParameter = function(parameter){
//     let paramStr = "";
//     if(parameter.type === "select") {
//         paramStr +=  parameter.title + ': <select id = ' + camelToDash(parameter.id) + '>';
//
//         for(let i = 0; i < parameter.options.length; i++){
//             paramStr += '<option value = ' + i + '>' + parameter.options[i] + '</option>';
//         }
//     }
//     else {
//         paramStr +=  parameter.title + ': <input class = "parameters-input" id = ' + camelToDash(parameter.id) + ' type = ' + parameter.type;
//         if(parameter.step)
//             paramStr += 'step = ' + parameter.step;
//         if(parameter.min)
//             paramStr += 'min = ' + parameter.min;
//         if(parameter.max)
//             paramStr+= 'max = ' + parameter.max;
//
//         paramStr+= ' value = ' + parameter.value + '>';
//
//     }
//
//
//     return paramStr;
// }


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

