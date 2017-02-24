QUnit = require('qunitjs');
module.exports = function() {
    QUnit.testStart(function( details ) {
        console.log( "Now running: ", details.module, details.name );
    });

    QUnit.log(function( details ) {
        console.log( "Log: ", details.result, details.message );
    });


    QUnit.done(function( details ) {
        console.log( "Total: ", details.total, " Failed: ", details.failed, " Passed: ", details.passed, " Runtime: ", details.runtime );
    });

}