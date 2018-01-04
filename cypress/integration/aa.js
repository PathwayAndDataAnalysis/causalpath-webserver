/***
 * This should be the first test as it opens a window
 * Tests are run alphabetically, hence the file name
 * TODO: look at order of runs
 */
describe('Window access', function () {

    it('Access global window object', function (done) {
        cy.visit('http://localhost:3001');
            cy.window().should(function (window) {
                expect(window.testApp).to.be.ok;
                expect(window.testApp.model).to.be.ok;
                expect(window.testApp.docId).to.be.ok;
                expect(window.$).to.be.ok;
                expect(window.location.hostname).to.eq('localhost');

                done();
            });
    });

});

