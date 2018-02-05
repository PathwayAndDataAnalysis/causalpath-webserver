/*
 *	Shared model handling operations.
 *  Clients call these commands to update the model
 *	Author: Funda Durupinar Babur<f.durupinar@gmail.com>
 */


module.exports =  function(model, docId, userId, userName) {

    var user = model.at('users.' + userId);


    model.ref('_page.doc', 'documents.' + docId);

    return { //global reference for testing



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

            if(model.get('_page.doc.cy')) {
                if(model.get('_page.doc.cy.nodes'))
                    model.del('_page.doc.cy.nodes');
                if(model.get('_page.doc.cy.edges'))
                    model.del('_page.doc.cy.edges');
                model.del('_page.doc.cy');
            }

        },


        /***
         * Initialize the model from json
         * @param jsonObj
         */
        initModelFromJson: function(jsonObj){

            //Keep a hash of nodes by their ids as keys
            if(jsonObj.nodes) {
                for (var i = 0; i < jsonObj.nodes.length; i++) {

                    var node = jsonObj.nodes[i];

                    model.set('_page.doc.cy.nodes.' + node.data.id + '.id', node.data.id);
                    model.set('_page.doc.cy.nodes.' + node.data.id + '.data', node.data);
                    model.set('_page.doc.cy.nodes.' + node.data.id + '.css', node.css);

                }
            }



            if(jsonObj.edges) {
                //Keep a hash of edges by their ids as keys
                for (var i = 0; i < jsonObj.edges.length; i++) {

                    var edge = jsonObj.edges[i];

                    //Edge.data.id may not have been explicitly defined in the json file
                    var edgeId = edge.data.id;
                    if (!edgeId)
                        edgeId = edge.data.source + "-" + edge.data.target;

                    model.set('_page.doc.cy.edges.' + edgeId + '.id', edgeId);
                    model.set('_page.doc.cy.edges.' + edgeId + '.data', edge.data);
                    model.set('_page.doc.cy.edges.' + edgeId + '.css', edge.css);


                }
            }


        },

        initModelNodePositions:function(nodes){
                for(var i = 0; i < nodes.length; i++){
                    model.set('_page.doc.cy.nodes.' + nodes[i].id() +'.position', nodes[i].position());

                }
        },



        getModelCy: function(){
            return model.get('_page.doc.cy');
        },


        getModelParameters: function(){
            return model.get('_page.doc.parameters');
        },

        getModelEnumerations: function(){
            return model.get('_page.doc.enumerations');
        },

        getModelParameter: function(ind){
            let parameterList = this.getModelParameters();
            if(ind >=0 && ind < parameterList.length)
                return parameterList[ind];
            else {
                console.log("Parameter index out of bounds");
                return null;
            }
        },
        /***
         * parameters are stored in an array, so traverse the array for a matching id
         * @param id
         */

        findModelParameterFromId: function(id){

            let parameterList = this.getModelParameters();

            for(let i = 0; i < parameterList.length; i++){
                if(parameterList[i].ID === id)
                    return parameterList[i];
                }

            console.log("Parameter with ID " + id + "not found.")
        },

        setModelParameterValue: function(ind, cnt, entryInd, val){
            model.set('_page.doc.parameters.' + ind + '.value.' + cnt + '.' + entryInd , val);
        },

        /***
         * Returns an array or the value of a specific entry
         * @param ind
         * @param cnt
         * @param entryInd
         */
        getModelParameterValue: function(ind, cnt, entryInd){
            if(!entryInd)
                return model.get('_page.doc.parameters.' + ind + '.value.' + cnt);
            else
                return model.get('_page.doc.parameters.' + ind + '.value.' + cnt + '.' + entryInd);

        },

        getModelParameterCnt: function(ind){
            return this.getModelParameter(ind).cnt.length;

        },
        pushModelParameterCnt: function(ind, cnt){
            model.push('_page.doc.parameters.' + ind + '.cnt', cnt);
        },

        emptyModelParameterCntArr: function(ind){
            let cnt = this.getModelParameterCnt(ind);
            for(let i = 0; i < cnt ; i++) {
                model.pop('_page.doc.parameters.' + ind + '.cnt');
            }
        },

        /***
         * Loads parameters from the input json file
         * @param model
         * @param json
         */
        loadModelParameters: function(model, json){
            let parameterList = json.Parameters;
            let enumerationList = json.Enumerations;


            //call before parameters because we will set parameter types accordingly
            if(model.get('_page.doc.enumerations') == null)
                model.set('_page.doc.enumerations', enumerationList);

            if(model.get('_page.doc.parameters') == null)
                model.set('_page.doc.parameters', parameterList);


            for(let i = 0; i < parameterList.length; i++){
                let param = parameterList[i];
                model.set('_page.doc.parameters.' + i + '.ind', i);  //index of a certain parameter

                model.set('_page.doc.parameters.' + i + '.isVisible', true);  //visibility is on by default

                if(model.get('_page.doc.parameters.' + i + '.cnt') == null) {
                    model.push('_page.doc.parameters.' + i + '.cnt', 0);  //for multiple fields

                    for (let j = 0; j < param.EntryType.length; j++)
                        model.set('_page.doc.parameters.' + i + '.domId.0.' + j, (param.ID + "-0-" + j));  //for multiple fields

                    model.set('_page.doc.parameters.' + i + '.batchDomId', (param.ID + "-batch"));  //for batch values
                    model.set('_page.doc.parameters.' + i + '.batchModalDomId', (param.ID + "-batchModal"));  //for batch values

                }
                if(model.get('_page.doc.parameters.' + i + '.value') == null) {
                    if(param.Default) {
                        model.set('_page.doc.parameters.' + i + '.value', param.Default);
                    }
                }
            }

        },

        resetToDefaultModelParameters(){

            let parameterList = this.getModelParameters();
            for(let i = 0; i < parameterList.length; i++){
               model.set('_page.doc.parameters.' + i + '.value', parameterList[i].Default);
            }
        }

    }
}

