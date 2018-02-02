QUnit = require('qunitjs');
module.exports = function(){


    QUnit.module( "modelManager Tests" );


    function clearModel(){
        QUnit.test('modelManager.clearModel()', function(assert) {
            let app = window.testApp;
            let modelManager = app.modelManager;
            
            modelManager.clearModel();
            assert.notOk(modelManager.getModelCy(), "Model successfully deleted.");


        });
    }

    function initModelFromJsonTest(jsonObj){
        QUnit.test('modelManager.initModelFromJson()', function(assert) {
            let app = window.testApp;
            let modelManager = app.modelManager;

            modelManager.initModelFromJson(jsonObj);

            for(var i = 0; i < jsonObj.nodes.length; i++){

                var modelNode = modelManager.getModelNode(jsonObj.nodes[i].data.id);
                assert.ok(modelNode, "Node exists. Id: " + jsonObj.nodes[i].data.id);
                assert.propEqual(modelNode.data, jsonObj.nodes[i].data, "Node " + i + " data is correctly assigned.");
                assert.propEqual(modelNode.css, jsonObj.nodes[i].css, "Node" + i + " css is correctly assigned.");
            }

            for(var i = 0; i < jsonObj.edges.length; i++){

                //edgeId is not explicitly specified in jsonObj
                var edgeId =  jsonObj.edges[i].data.source + "-" + jsonObj.edges[i].data.target;
                var modelEdge = modelManager.getModelEdge(edgeId);
                assert.ok(modelEdge, "Edge exists. Id: " + edgeId);
                assert.propEqual(modelEdge.data, jsonObj.edges[i].data, "Edge " + i + " data is correctly assigned.");
                assert.propEqual(modelEdge.css, jsonObj.edges[i].css, "Edge" + i + " css is correctly assigned.");
            }

        });
    }

    QUnit.module( "Cytoscape Tests" );
    function createCyTest(callback){
        QUnit.test('createCyContainer', function(assert){
            let app = window.testApp;
            let modelManager = app.modelManager;
            var done = assert.async();
            var cgfCy = require('../public/src/cgf-visualizer/cgf-cy.js');
            assert.ok(cgfCy,"Cytoscape visualizer accessed.");
            var cont = new cgfCy.createContainer($('#graph-container'),  false, modelManager, function () {
                assert.ok(cy,"Cytoscape container created successfully.");
                done();
                if(callback) callback(); //call cy-related tests after container is created
            });


        })
    }

    function selectNodeTest(nodeId, colorStr){
        QUnit.test('modelManager.selectNode()', function(assert){

            let app = window.testApp;
            let modelManager = app.modelManager;

            var id = nodeId;
            var color = modelManager.getModelNodeAttribute(id, 'css.backgroundColor');
            assert.equal(color, colorStr, "Node background color is initially correct.");

            var nodeCy = cy.getElementById(id);
            assert.ok(nodeCy, "Node " + id + " exists.");
            cy.getElementById(id).select();

            color = cy.getElementById(id).css('background-color');
        });
    }


    function topologyGroupingTest(node1Id, node2Id, node3Id, targetId) {
        QUnit.test('topologyGrouping', function (assert) {
            let app = window.testApp;
            let modelManager = app.modelManager;

            var modelCy = modelManager.getModelCy();
            var cgfCy = require('../public/src/cgf-visualizer/cgf-cy.js');

            //After topology grouping
            var cyElements = cgfCy.convertModelJsonToCyElements(modelCy, true);

            var node1 = cy.getElementById(node1Id);
            var node2 = cy.getElementById(node2Id);
            var node3 = cy.getElementById(node3Id);



            assert.equal(node1._private.data.parent, node2._private.data.parent, "node1 and node2 grouped correctly.");
            assert.equal(node1._private.data.parent, node3._private.data.parent, "node1, node2 and node3 are grouped correctly.");

            var parentId = node1._private.data.parent;


            var newEdge = cy.getElementById(parentId + "-" + targetId);

            assert.ok(newEdge, "New edge between parent and " + targetId + " exists");

        });
    }



    initModelFromJsonTest(demoJson);

    createCyTest(function() {


        //call cy-related tests after container is created
        selectNodeTest("CD4", "rgb(255,189,173)");

        topologyGroupingTest("HLA-DQA1", "HLA-DPA1", "CD4", "CD247");
    });

};