/***
 * Tests for non-cy-related modelManager methods
 */



describe('Parameter Operations Test', function () {


    function initParameter( id) {



        it("app.initParameter", function () {
            cy.window().should(function (window) {

                let app =window.testApp;

                    expect(app).to.be.ok;


            });
        });
    }

            initParameter("node1");


});
