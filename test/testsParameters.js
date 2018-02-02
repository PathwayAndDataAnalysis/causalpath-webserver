QUnit = require('qunitjs');
module.exports = function(){


    let app = window.testApp;
    let modelManager = app.modelManager;
    let json = app.parameterJson;
    let modelParam = modelManager.getModelParameters();
    let modelEnum = modelManager.getModelEnumerations();

    QUnit.module( "Parameter tests" );


    function loadParametersTest() {

        QUnit.test("app.getEnum", function(assert){
            let enumVals = app.getEnum("ValueTransformation");
            assert.equal(enumVals.length, 7, "getEnum works correctly");
            assert.equal(enumVals.indexOf("max"), 2, "getEnum works correctly");

            enumVals = app.getEnum("String");
            assert.notOk(enumVals, "getEnum works correctly for non-enum types");

        });


        QUnit.test('Enumeration equality', function (assert) {

            assert.equal(modelEnum.length, json.Enumerations.length, "Enumeration lists are the same size for model and json.");
            //test if enumerations are equal in the model and in the json
            for(let i = 0; i < modelEnum.length; i++){
                assert.deepEqual(modelEnum[i], json.Enumerations[i], "Enumeration " + modelEnum[i].name + " are the same for model and json.")
            }

        });

        QUnit.test('Parameter equality', function (assert) {
            assert.equal(modelParam.length, json.Parameters.length, "Parameter lists are the same size for model and json.");

            //test if parameters are equal in the model and in the json
            for(let i = 0; i < modelParam.length; i++){
                assert.equal(modelParam[i].ID, json.Parameters[i].ID, "Parameter " + modelParam[i].ID + " IDs are the same for model and json.")
                assert.equal(modelParam[i].Title, json.Parameters[i].Title, "Parameter " + modelParam[i].ID + " Titles are the same for model and json.")
                assert.equal(modelParam[i].Description, json.Parameters[i].Description, "Parameter " + modelParam[i].ID + " Descriptions are the same for model and json.")
                assert.deepEqual(modelParam[i].EntryType, json.Parameters[i].EntryType, "Parameter " + modelParam[i].ID + " EntryTypes are the same for model and json.")
                assert.equal(modelParam[i].Mandatory, json.Parameters[i].Mandatory, "Parameter " + modelParam[i].ID + " Mandatorys are the same for model and json.")
                assert.equal(modelParam[i].CanBeMultiple, json.Parameters[i].CanBeMultiple, "Parameter " + modelParam[i].ID + " CanBeMultiples are the same for model and json.")
                if(modelParam[i].Condition)
                    assert.deepEqual(modelParam[i].Condition, json.Parameters[i].Condition, "Parameter " + modelParam[i].ID + " Conditions are the same for model and json.")
            }
        });

        QUnit.test('Other parameter values', function (assert) {
            for(let i = 0; i < modelParam.length; i++){
                assert.equal(modelParam[i].ind, i, "Parameter indices are correct in the model.");

                for (let j = 0; j < modelParam[i].EntryType.length; j++) {

                    assert.equal(modelParam[i].domId[0][j], (modelParam[i].ID + "-0-" + j), "Parameter " + modelParam[i].ID + " domId is correct in the model.");
                }

                assert.equal(modelParam[i].batchDomId,(modelParam[i].ID + "-batch") , "Parameter " + modelParam[i].ID + " batchDomId is correct in the model.");
                assert.equal(modelParam[i].batchModalDomId,(modelParam[i].ID + "-batchModal") , "Parameter " + modelParam[i].ID  + " batchModalDomId is correct in the model.");

                if(modelParam[i].Default)
                    assert.deepEqual(modelParam[i].value, modelParam[i].Default , "Parameter "+ modelParam[i].ID + " initial value is correctly set to default.");

            }
        });

    }

    function parameterVisibilityTest(){
        QUnit.test('modelManager.findParameterFromId', function (assert) {
            let paramInd = modelManager.findParameterFromId("id-column").ind;
            assert.equal(paramInd, 2 , "Finding parameter from id returns correct index.");

        });


        QUnit.test('app.conditionResult', function (assert) {
            //set value of a parameter
            modelManager.setParameterValue(2, 0, 0, "abc"); //id-column field
            let condInd = modelManager.findParameterFromId("id-column").ind;
            assert.ok(app.conditionResult(condInd, ["abc"]), "conditionResult for parameter id-column is correctly updated");

            modelManager.setParameterValue(2, 0, 0, null); //id-column field

            assert.ok(app.conditionResult(condInd, [null]), "conditionResult for parameter id-column is correctly updated");

        });


        QUnit.test('app.satisfiesConditions', function (assert) {
            let conditionOR = {
                "Operator" : "OR",
                 "Conditions" : [ {
                    "Parameter" : "value-transformation",
                    "Value" : [ "arithmetic-mean" ]
                }, {
                    "Parameter" : "value-transformation",
                    "Value" : [ "geometric-mean" ]
                }, {
                    "Parameter" : "value-transformation",
                    "Value" : [ "max" ]
                }, {
                    "Parameter" : "value-transformation",
                    "Value" : [ "correlation" ]
                } ]
            };

            let conditionAND = {
                "Operator" : "AND",
                    "Conditions" : [ {
                    "Parameter" : "value-transformation",
                    "Value" : [ "max" ]
                }, {
                    "Parameter" : "threshold-for-data-significance",
                    "Value" : [null]
                } ]
            };

            let conditionNOT = {
                "Operator" : "NOT",
                "Conditions" : [ {
                    "Parameter" : "value-transformation",
                    "Value" : [ "correlation" ]
                } ]
            };

            let ind1 = modelManager.findParameterFromId("value-transformation").ind;
            modelManager.setParameterValue(ind1, 0, 0, "max");

            let ind2 = modelManager.findParameterFromId("threshold-for-data-significance").ind;
            modelManager.setParameterValue(ind2, 0, 0, null);

            assert.ok(app.satisfiesConditions("OR", conditionOR.Conditions), "satisfiesConditions for parameter value-transformation is correct for OR");
            assert.ok(app.satisfiesConditions("AND", conditionAND.Conditions), "satisfiesConditions for parameter value-transformation is correct for AND");
            assert.ok(app.satisfiesConditions("NOT", conditionNOT.Conditions), "satisfiesConditions for parameter value-transformation is correct for NOT");


        });

        QUnit.test('app.visibility', function (assert) {
            /*"Condition" : {
                "Operator" : "AND",
                    "Conditions" : [ {
                    "Operator" : "NOT",
                    "Conditions" : [ {
                        "Parameter" : "value-transformation",
                        "Value" : [ "correlation" ]
                    } ]
                }, {
                    "Parameter" : "fdr-threshold-for-data-significance",
                    "Value" : [null]
                } ]
            }*/


            let ind1 = modelManager.findParameterFromId("value-transformation").ind;
            modelManager.setParameterValue(ind1, 0, 0, "significant-change-of-mean");

            let ind2 = modelManager.findParameterFromId("fdr-threshold-for-data-significance").ind;
            modelManager.setParameterValue(ind2, 0, 0, null);

            let param = modelManager.findParameterFromId("threshold-for-data-significance");

            assert.ok(param.isVisible, "Parameter threshold-for-data-significance visibility correctly set to visible.");


            modelManager.setParameterValue(ind1, 0, 0, "correlation");
            assert.notOk(param.isVisible, "Parameter threshold-for-data-significance visibility correctly set to invisible.");

        });

    }
    function guiTest(){
        QUnit.test('app.getDomElement', function (assert) {

            let param = modelManager.findParameterFromId("stdev-threshold-for-data");

            assert.ok(app.getDomElement(param, 0,0), "stdev-threshold-for-data domElement 0 is correctly achieved.");
            assert.ok(app.getDomElement(param, 0,1), "stdev-threshold-for-data domElement 1 is correctly achieved.");


            let param2 = modelManager.findParameterFromId("pool-proteomics-for-fdr-adjustment");
            assert.notOk(app.getDomElement(param2, 0, 0).prop("checked"), "pool-proteomics-for-fdr-adjustment DOM is not created yet");
        });



        QUnit.test('updateParamSelectBox', function (assert) {

            let param = modelManager.findParameterFromId("relation-filter-type");


            assert.equal(app.getDomElement(param, 0,0)[0].selectedIndex, 0 , "selected index for relation-filter-type is correct");


            let param2 = modelManager.findParameterFromId("gene-activity");
            assert.equal(app.getDomElement(param2, 0,1)[0].selectedIndex, -1 , "selected index for gene-activity is correct");

        });



        QUnit.test('updateParamCheckBox', function (assert) {

            let param = modelManager.findParameterFromId("do-site-matching");
            assert.ok(app.getDomElement(param, 0, 0).prop("checked"), "check value for do-site-matching is correct");

            let param2 = modelManager.findParameterFromId("do-log-transform");
            assert.notOk(app.getDomElement(param2, 0, 0).prop("checked"), "check value for do-log-transform is correct");


        });



    }


    setTimeout(function(){ //it takes a while before gui is updated
        guiTest();
        loadParametersTest();
        parameterVisibilityTest();

    }, 200);


};