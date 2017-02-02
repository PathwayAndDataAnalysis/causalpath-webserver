/*
 *	Model initialization
 *  Event handlers of model updates
 *	Author: Funda Durupinar Babur<f.durupinar@gmail.com>
 */
var app = module.exports = require('derby').createApp('cwc', __filename);


app.loadViews(__dirname + '/views');
//app.loadStyles(__dirname + '/styles');
//app.serverUse(module, 'derby-stylus');


var docReady = false;

var useQunit = true;

var socket;

app.modelManager = null;

var cgfCy;

var isDemo = false;

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

    // if( useQunit ){ // use qunit testing doc if we're testing so we don't disrupt real docs
    //     docId = 'qunit';
    // }

    return page.redirect('/' + docId);
});


app.get('/:docId', function (page, model, arg, next) {
    var messagesQuery, room;
    room = arg.docId;


    var docPath = 'documents.' + arg.docId;

    model.subscribe(docPath, 'cgfText', function(err){
        if (err) {
            return next(err);
        }
        model.setNull(docPath, { // create the empty new doc if it doesn't already exist
            id: arg.docId

        });
        // create a reference to the document
        model.ref('_page.doc', 'documents.' + arg.docId);

    });

    model.subscribe(docPath, 'cy', function(err){
        if (err) {
            return next(err);
        }

    });

    //For sharing information with the server
    model.subscribe(docPath, 'analysisFiles', function(err){
        if (err) {
            return next(err);
        }

    });


    model.set('_page.room', room);


    page.render();



});



app.proto.create = function (model) {

    docReady = true;
    cgfCy = require('./public/src/cgf-visualizer/cgf-cy.js');


    socket = io();

    isDemo = false;




    var id = model.get('_session.userId');
    var name = model.get('users.' + id +'.name');

    this.modelManager = require('./public/src/model/modelManager.js')(model, model.get('_page.room'), model.get('_session.userId'),name );



};

app.proto.runLayout = function(){



    if(docReady)
        cgfCy.runLayout();


}
app.proto.clearCgfText = function(){
    this.model.set('_page.doc.cgfText','');
}

/***
 * Returns nodes and edges in an array
 * @param modelJson keeps nodes and edges as a hash table of objects
 */
function convertModelJsonToCgfJson(modelJson){
    var nodes = [];
    var edges = [];
    for(var att in modelJson.nodes){
        if(modelJson.nodes.hasOwnProperty(att)){
            nodes.push(modelJson.nodes[att]);
        }
    }
    for(var att in modelJson.edges){
        if(modelJson.edges.hasOwnProperty(att)){
            edges.push(modelJson.edges[att]);
        }
    }
    return {nodes:nodes, edges:edges};
}


app.proto.reloadGraph = function(){

    cy.destroy();
    var cgfText = this.model.get('_page.doc.cgfText');
    this.createCyGraphFromCgf(JSON.parse(cgfText));
}

app.proto.loadDemoGraph = function(){


    isDemo = true;
    this.model.set('_page.doc.cgfText', JSON.stringify(demoJson));
    this.createCyGraphFromCgf(demoJson);


}

app.proto.loadGraphFile = function(e){

    var self = this;

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
 * @param cgfJson
 * Create cytoscape graph from cgfJson
 */
app.proto.createCyGraphFromCgf = function(cgfJson, callback){

    var noTopologyGrouping = this.model.get('_page.doc.noTopologyGrouping');


    if(cgfJson == null){
        var cgfText = this.model.get('_page.doc.cgfText');
        cgfJson = JSON.parse(cgfText);
    }


    if(cgfJson) {
        this.modelManager.initModelFromJson(cgfJson);

        var notyView = noty({
            progressBar: true,
            type: "information",
            layout: "bottom",
            text: "Drawing graph...Please wait."
        });

        if (docReady){

            try{

                cy.destroy();

            }
            catch(error){
                //console.log(error + " Cytoscape not created yet.");
            }
        } //cytoscape is loaded



        this.openGraphContainer();


        var cgfContainer = new cgfCy.createContainer($('#graph-container'), cgfJson, !noTopologyGrouping, this.modelManager, function () {


            $('#download-div').show();
            notyView.close();

            if (callback) callback();
        });
    }

}

app.proto.openGraphContainer = function(){
    $('#input-container').hide();
    $('#download-div').hide(); //this only appears after analysis is performed
    $('#graph-options-container').show();
    $('#graph-container').show();
    // $('#graph-container').position.top = "100px";
}

app.proto.openInputContainer = function(){
    $('#input-container').show();
    $('#graph-options-container').hide();
    $('#graph-container').hide();
}
//Download and save results as room.zip
app.proto.downloadResults = function(){

    var room = this.model.get('_page.room'); //each room will have its own folder

    if(isDemo)
        room = "demo"; //directly download
    socket.emit('downloadRequest', room);

    var notyView = noty({progressBar:true, type:"information", layout: "bottom",text: "Compressing files...Please wait."});
    var dl = require('delivery');

    var delivery = dl.listen(socket);
    delivery.connect();


    delivery.on('receive.start',function(fileUID){
        notyView.setText( "Receiving the file...Please wait.");
    });
    delivery.on('receive.success',function(file){


        var blob = new Blob([file.buffer], {
            type: "application/zip"
        });

        saveAs(blob, file.name);


        notyView.close();
    });


}

app.proto.loadAnalysisDir = function(e){
    //Take the two ` and put them on the server side in analysisDir and run shell command

    var self = this;
    var fileCnt = $('#analysis-directory-input')[0].files.length;
    var fileContents = [];
    var notyView = noty({progressBar:true, type:"information", layout: "bottom",text: "Reading files...Please wait."});

    var room = this.model.get('_page.room');
    notyView.setText( "Reading files...Please wait.");
    //Sending a zip file
    if(fileCnt == 1 &&  $('#analysis-directory-input')[0].files[0].name.split('.').pop().toLowerCase() == "zip"){


        var delivery = new Delivery(socket); //for file transfer
        delivery.on('delivery.connect',function(delivery){

            var file = $('#analysis-directory-input')[0].files[0];
            var extraParams = {room: room};
            delivery.send(file, extraParams);



        });
        delivery.on('send.success',function(data){

            console.log(data);
            notyView.setText( "Analyzing results...Please wait.");


        });

        socket.on('analyzedFile', function(data){
            self.createCyGraphFromCgf(JSON.parse(data), function(){
                notyView.close();
            });

            self.model.set('_page.doc.cgfText', data);
            notyView.close();

        });


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

                self.createCyGraphFromCgf(JSON.parse(data), function(){
                    notyView.close();
                });

                self.model.set('_page.doc.cgfText', data);

            });


        }), function (xhr, status, error) {
            api.set('content.text', "Error retrieving data: " + error);

        }
    }

}


app.proto.formatTime = function (message) {
    var hours, minutes, seconds, period, time;
    time = message && message.date;
    if (!time) {
        return;
    }
    time = new Date(time);
    hours = time.getHours();

    minutes = time.getMinutes();

    seconds = time.getSeconds();

    if (minutes < 10) {
        minutes = '0' + minutes;
    }
    if (seconds < 10) {
        seconds = '0' + seconds;
    }
    return hours + ':' + minutes + ':' + seconds;
};

app.proto.formatObj = function(obj){

    return JSON.stringify(obj, null, '\t');
};


