QUnit = require('qunitjs');
module.exports = function(){


    QUnit.module( "modelManager Tests" );

    // QUnit.test('modelManager.setName()', function(assert) {
    //     ModelManager.setName("abc");
    //       assert.equal(ModelManager.getName(), "abc", "User name is correctly set.");
    // });
    //

    function clearModel(){
        QUnit.test('modelManager.clearModel()', function(assert) {
            ModelManager.clearModel();
            assert.notOk(ModelManager.getModelCy(), "Model successfully deleted.");


        });
    }

    function initModelFromJsonTest(jsonObj){
        QUnit.test('modelManager.initModelFromJson()', function(assert) {


            ModelManager.initModelFromJson(jsonObj);

            for(var i = 0; i < jsonObj.nodes.length; i++){

                var modelNode = ModelManager.getModelNode(jsonObj.nodes[i].data.id);
                assert.ok(modelNode, "Node exists. Id: " + jsonObj.nodes[i].data.id);
                assert.propEqual(modelNode.data, jsonObj.nodes[i].data, "Node " + i + " data is correctly assigned.");
                assert.propEqual(modelNode.css, jsonObj.nodes[i].css, "Node" + i + " css is correctly assigned.");
            }

            for(var i = 0; i < jsonObj.edges.length; i++){

                //edgeId is not explicitly specified in jsonObj
                var edgeId =  jsonObj.edges[i].data.source + "-" + jsonObj.edges[i].data.target;
                var modelEdge = ModelManager.getModelEdge(edgeId);
                assert.ok(modelEdge, "Edge exists. Id: " + edgeId);
                assert.propEqual(modelEdge.data, jsonObj.edges[i].data, "Edge " + i + " data is correctly assigned.");
                assert.propEqual(modelEdge.css, jsonObj.edges[i].css, "Edge" + i + " css is correctly assigned.");
            }

        });
    }

    QUnit.module( "Cytoscape Tests" );
    function createCyTest(callback){
        QUnit.test('createCyContainer', function(assert){
            var cgfCy = require('../public/src/cgf-visualizer/cgf-cy.js');
            assert.ok(cgfCy,"Cytoscape visualizer accessed.");
            var cont = new cgfCy.createContainer($('#graph-container'),  false, ModelManager, function () {
                assert.ok(cy,"Cytoscape container created successfully.");
                if(callback) callback(); //call cy-related tests after container is created
            });


        })
    }

    f

    function selectNodeTest(){
        QUnit.test('modelManager.selectNode()', function(assert){

            var id = "CDK1";
            var color = ModelManager.getModelNodeAttribute(id, 'css.backgroundColor');
            assert.equal(color, "rgb(255,196,183)", "Node background color is initially correct.");

            var nodeCy = cy.getElementById(id);
            assert.ok(nodeCy, "Node " + id + " exists.");
            cy.getElementById(id).select();

            //
            color = cy.getElementById(id).css('background-color');
        //     console.log(color);
        //    assert.equal(color, "#FFCC66", "Node background color is correct when selected.");
            // cy.getElementById(id).unselect();
            // color = ModelManager.getModelNodeAttribute(id, 'css.backgroundColor');
            // assert.equal(color, "rgb(255,149,125)", "Node background color is correct when unselected.");
        });
    }


    function topologyGroupingTest() {
        QUnit.test('topologyGrouping', function (assert) {
            var modelCy = ModelManager.getModelCy();
            var cgfCy = require('../public/src/cgf-visualizer/cgf-cy.js');


            //Before grouping
            var edge1 = cy.getElementById("RBBP4-CCNB1");
            var edge2 = cy.getElementById("LIN9-CCNB1");
            var edge3 = cy.getElementById("KLF5-CCNB1");


     //       assert.equal(edge1._private.data.target, edge2._private.data.target, "edge1 and edge2 have the same target.");
     //       assert.equal(edge1._private.data.target, edge3._private.data.target, "edge1, edge2 and edge3 have the same target.");


            //After topology grouping
            var cyElements = cgfCy.convertModelJsonToCyElements(modelCy, true);

            var node1 = cy.getElementById("RBBP4");
            var node2 = cy.getElementById("LIN9");
            var node3 = cy.getElementById("KLF5");

            assert.equal(node1._private.data.parent, node2._private.data.parent, "node1 and node2 grouped correctly.");
            assert.equal(node1._private.data.parent, node3._private.data.parent, "node1, node2 and node3 are grouped correctly.");

            var parentId = node1._private.data.parent;


            var newEdge = cy.getElementById(parentId + "-" + "CCNB1");

            assert.ok(newEdge, "New edge between parent and CCNB1 exists");

        });
    }



    clearModel();
    initModelFromJsonTest(demoJson);

    createCyTest(function() {
        //call cy-related tests after container is created
        selectNodeTest();

        topologyGroupingTest();
    });




};