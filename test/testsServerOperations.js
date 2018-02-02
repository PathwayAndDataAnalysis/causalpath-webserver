QUnit = require('qunitjs');
module.exports = function(){


    let app = window.testApp;
    let modelManager = app.modelManager;

    QUnit.module( "Server operations tests" );


    function sendFilesTest() {

        QUnit.test("app.createGraphFromParameters", function(assert){

            let done1 = assert.async();
            let done2 = assert.async();
            //Set the parameters as follows and then wait for server response

            let param = modelManager.findParameterFromId("value-column");
            modelManager.setParameterValue(param.ind, 0,0, "Value");

            param = modelManager.findParameterFromId("value-transformation");
            modelManager.setParameterValue(param.ind, 0,0, "arithmetic-mean");


            param = modelManager.findParameterFromId("threshold-for-data-significance");
            modelManager.setParameterValue(param.ind, 0,0, "1");
            modelManager.setParameterValue(param.ind, 0,1, "phosphoprotein");

            param = modelManager.findParameterFromId("do-site-matching");
            modelManager.setParameterValue(param.ind, 0,0, false);

            param = modelManager.findParameterFromId("proteomics-values-file");
            modelManager.setParameterValue(param.ind, 0,0, "dataMinimal.txt");

            //because we can't call loadFile programatically, let's write its contents

            let fileContent  = "ID\tSymbols\tSites\tEffect\tValue\n" +
                "AKT1-T308\tAKT1\tT308\ta\t100\n" +
                "AKT1S1-T246\tAKT1S1\tT246\ti\t100";

            app.socket.emit("writeFileOnServerSide", app.room, fileContent, "dataMinimal.txt", false, function () {
                // console.log("sent file");
                assert.ok(true, "File written on the server.");
                done1();

                app.submitParameters(function(data){
                    assert.notEqual(data, "error", "cgfText returned correctly");
                    let cy = modelManager.getModelCy();
                    assert.ok(cy.nodes["AKT1"] &&  cy.nodes["AKT1S1"] , "graph nodes are correct");
                    assert.ok(cy.edges["AKT1-AKT1S1"], "graph edges are correct");


                    //test dom elements
                    assert.notEqual($('#graph-container')[0].style.display, "none", "Graph container shown correctly")
                    done2();
                });




            });






        });


    }

    setTimeout(function(){ //it takes a while before gui is updated
        sendFilesTest();
    }, 200);


};