/*
 *	Shared model handling operations.
 *  Clients call these commands to update the model
 *	Author: Funda Durupinar Babur<f.durupinar@gmail.com>
 */


module.exports =  function(model, docId, userId, userName) {

    var user = model.at('users.' + userId);


    model.ref('_page.doc', 'documents.' + docId);

    return ModelManager = { //global reference for testing



        getModel: function(){
            return model;
        },


        setName: function(userName){

            model.fetch('users', userId, function(err){
                user.set('name', userName);
            });
        },

        getName: function(){
            return model.get('users.' + userId +'.name');
        },

        getModelNode: function(id){

            var nodePath = model.at('_page.doc.cy.nodes.'  + id);

            return nodePath.get();
        },


        /***
         * Attributes are in the form of attr1.attr2.attr3
         * @param id
         * @param attributeName
         * @returns {*}
         */
        getModelNodeAttribute: function(id, attributeName){
            return model.get('_page.doc.cy.nodes.' + id + '.' + attributeName);

        },


        getModelEdge: function(id){

            var edgePath = model.at('_page.doc.cy.edges.'  + id);

            return edgePath.get();
        },

        getModelEdgeAttribute: function(id, attributeName){
            return model.get('_page.doc.cy.edges.'  + id + '.' + attributeName);
        },



        /***
         * Delete everything in the model
         */
        clearModel: function(){

            model.del('_page.doc.cy.nodes');
            model.del('_page.doc.cy.edges');
            model.del('_page.doc.cy');

        },


        /***
         * Initialize the model from json
         * @param jsonObj
         */
        initModelFromJson: function(jsonObj){

            //Keep a hash of nodes by their ids as keys
            for(var i = 0; i < jsonObj.nodes.length; i++){

                var node = jsonObj.nodes[i];

                model.set('_page.doc.cy.nodes.' + node.data.id + '.id', node.data.id);
                model.set('_page.doc.cy.nodes.' + node.data.id  + '.data' , node.data);
                model.set('_page.doc.cy.nodes.' + node.data.id  + '.css' , node.css);

            };



            //Keep a hash of edges by their ids as keys
            for(var i = 0; i < jsonObj.edges.length; i++){

                var edge = jsonObj.edges[i];

                //Edge.data.id may not have been explicitly defined in the json file
                var edgeId = edge.data.id;
                if(!edgeId)
                    edgeId = edge.data.source + "-" + edge.data.target;

                model.set('_page.doc.cy.edges.' + edgeId + '.id', edgeId);
                model.set('_page.doc.cy.edges.' + edgeId + '.data', edge.data);
                model.set('_page.doc.cy.edges.' + edgeId + '.css', edge.css);


            };


        },

        initModelNodePositions:function(nodes){
                for(var i = 0; i < nodes.length; i++){
                    model.set('_page.doc.cy.nodes.' + nodes[i].id() +'.position', nodes[i].position());

                }
        },



        getModelCy: function(){
            return model.get('_page.doc.cy');
        },



    }
}

