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


        updateLayoutProperties: function(layoutProperties, noHistUpdate){

            var currentLayoutProperties;
            var lp =  model.get('_page.doc.layoutProperties');

            if(lp == null)
                currentLayoutProperties = _.clone(layoutProperties);
            else
                currentLayoutProperties = _.clone(lp);


            model.set('_page.doc.layoutProperties', currentLayoutProperties); //synclayout

            if(!noHistUpdate)
                this.updateHistory({opName:'set',opTarget:'layout', opAttr: JSON.stringify(currentLayoutProperties)});
            return currentLayoutProperties;
        },
        setLayoutProperties: function(layoutProperties, noHistUpdate){
            model.set('_page.doc.layoutProperties', layoutProperties); //synclayout
            if(!noHistUpdate)
                this.updateHistory({opName:'set', opTarget:'layout', opAttr: JSON.stringify(layoutProperties)});
        },




        /***
         *
         * @param cmd  {opName, opTarget,  elType, elId, opAttr,param, prevParam}
         * opName: set, load, open, add, select, unselect
         * opTarget: element, element group,  model, sample,
         * elType: node, edge
         * opAttr: highlightColor, lineColor, borderColor etc.
         */

        updateHistory: function(cmd){
            var command = {userName: userName, date: new Date, opName: cmd.opName, opTarget: cmd.opTarget, elType: cmd.elType, opAttr: cmd.opAttr, elId: cmd.elId, param: cmd.param, prevParam: cmd.prevParam};


            if(cmd!=null) {

                var ind = model.push('_page.doc.history', command) - 1;

                model.set('_page.doc.undoIndex', ind);
            }

        },

        getHistory: function(){
            return model.get('_page.doc.history');
        },

        getUndoActionStr: function(){

            var undoIndex = model.get('_page.doc.undoIndex');
            var cmd =  model.get('_page.doc.history.' + undoIndex);


            var cmdStr = cmd.opName + " " + cmd.opTarget;

            if(cmd.opAttr != null)
                cmdStr += " " + cmd.opAttr;
            //    if(cmd.elId != null)
            //      cmdStr += " " + cmd.elId;

            return cmdStr;

        },

        getRedoActionStr: function(){
            var undoIndex = model.get('_page.doc.undoIndex');
            var cmd =  model.get('_page.doc.history.'+ (undoIndex+1));

            var cmdStr = cmd.opName + " " + cmd.opTarget;
            if(cmd.opAttr != null)
                cmdStr += " " + cmd.opAttr;
            //  if(cmd.elId != null)
            //    cmdStr += " " + cmd.elId;

            return cmdStr;
        },
        isUndoPossible: function(){
            return(model.get('_page.doc.undoIndex') > 0)
        },
        isRedoPossible: function(){
            return(model.get('_page.doc.undoIndex') + 1 < model.get('_page.doc.history').length)
        },

        undoCommand: function(){
            var undoInd = model.get('_page.doc.undoIndex');
            var cmd = model.get('_page.doc.history.' + undoInd); // cmd: opName, opTarget, opAttr, elId, param

            if(cmd.opName == "set"){
                if(cmd.opTarget == "element" && cmd.elType == "node")
                    this.changeModelNodeAttribute(cmd.opAttr,cmd.elId, cmd.prevParam, null); //user is null to enable updating in the editor

                else if(cmd.opTarget == "element" && cmd.elType == "edge")
                    this.changeModelEdgeAttribute(cmd.opAttr,cmd.elId, cmd.prevParam, null);
                else if(cmd.opTarget == "element group")
                    this.changeModelElementGroupAttribute(cmd.opAttr, cmd.elId, cmd.prevParam, null);

            }
            else if(cmd.opName == "add"){
                if(cmd.opTarget == "element" && cmd.elType == "node")
                    this.deleteModelNode(cmd.elId);
                else if(cmd.opTarget == "element" && cmd.elType == "edge")
                    this.deleteModelEdge(cmd.elId);
            }
            else if(cmd.opName == "delete"){
                if(cmd.opTarget == "element")
                    this.restoreModelElement(cmd.elType, cmd.elId, cmd.prevParam);
                else if(cmd.opTarget == "element group")
                    this.restoreModelElementGroup(cmd.elId, cmd.prevParam);

            }
            else if(cmd.opName == "init"){
                this.newModel();
            }
            else if(cmd.opName == "new"){ //delete all
                this.restoreModel(cmd.prevParam);

            }
            else if(cmd.opName == "merge"){
                this.newModel("me", true);
                this.restoreModel(cmd.prevParam);

            }


            undoInd = undoInd > 0 ? undoInd - 1 : 0;
            model.set('_page.doc.undoIndex', undoInd);

        },

        redoCommand: function(){
            var undoInd = model.get('_page.doc.undoIndex');
            var cmd = model.get('_page.doc.history.' + (undoInd+ 1)); // cmd: opName, opTarget, opAttr, elId, param

            if(cmd.opName == "set"){
                if(cmd.opTarget == "element" && cmd.elType == "node")
                    this.changeModelNodeAttribute(cmd.opAttr,cmd.elId, cmd.param, null); //user is null to enable updating in the editor
                else if(cmd.opTarget == "element" && cmd.elType == "edge")
                    this.changeModelEdgeAttribute(cmd.opAttr,cmd.elId, cmd.param, null);
                else if(cmd.opTarget == "element group") {
                    this.changeModelElementGroupAttribute(cmd.opAttr, cmd.elId, cmd.param);

                }


            }
            else if(cmd.opName == "add"){
                if(cmd.opTarget == "element")
                    this.restoreModelElement(cmd.elType, cmd.elId, cmd.param, null);


            }
            else if(cmd.opName == "delete"){
                if(cmd.opTarget == "element" && cmd.elType == "node")
                    this.deleteModelNode(cmd.elId);
                else if(cmd.opTarget == "element" && cmd.elType == "edge")
                    this.deleteModelEdge(cmd.elId);
                else if(cmd.opTarget == "element group")
                    this.deleteModelElementGroup(cmd.elId);

            }
            else if(cmd.opName == "init"){
                this.restoreModel(cmd.param);
            }
            else if(cmd.opName == "new"){ //delete all
                this.newModel();
            }



            undoInd = undoInd <  model.get('_page.doc.history').length -1 ? undoInd + 1  : model.get('_page.doc.history').length -1;

            model.set('_page.doc.undoIndex', undoInd);

        },


        getModelNodePath: function(id){
            var nodes = model.get('_page.doc.cy.nodes');
            for(var i = 0; i < nodes.length; i++){
                if(nodes[i].data.id == id){
                    return model.at('_page.doc.cy.nodes.' + i);

                }
            }


            return null;
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


        selectModelNode: function(node, noHistUpdate){

            var nodePath = model.at('_page.doc.cy.nodes.'  +node.id());
            if(nodePath.get() == null)
                return "Node id not found";
            if(user)
                nodePath.set('highlightColor' , user.get('colorCode'));


            return "success";

        },


        selectModelEdge: function(edge, noHistUpdate){
            var user = model.at('users.' + userId);
            var edgePath = model.at('_page.doc.cy.edges.'  +edge.id());
            if(edgePath.get() == null)
                return "Edge id not found";
            if( user) {
                edgePath.set('highlightColor', user.get('colorCode'));
            }

            return "success";

        },
        unselectModelNode: function(node, noHistUpdate){

            var nodePath = model.at('_page.doc.cy.nodes.'  +node.id());

            if(nodePath.get() == null)
                return "Node id not found";

            nodePath.set('highlightColor' , null);

            return "success";

        },




        unselectModelEdge: function(edge, noHistUpdate){

            var edgePath = model.at('_page.doc.cy.edges.'  +edge.id());
            if(edgePath.get() == null)
                return "Edge id not found";

            edgePath.set('highlightColor', null);

            return "success";


        },

        getSelectedModelNodes: function(){
            var nodes = model.get('_page.doc.cy.nodes');
            var selectedNodes = [];

            for(var att in nodes) {
                if (nodes.hasOwnProperty(att)) {
                    var node = nodes[att];
                    if (node.highlightColor != null) //could be selected by anyone
                        selectedNodes.push(node);
                }
            }

            return selectedNodes;
        },

        addModelNode: function(nodeId,  param, user, noHistUpdate){


            if(model.get("_page.doc.cy.nodes." + nodeId + '.id') != null)
                return "Node cannot be duplicated";

            model.pass({user:user}).set('_page.doc.cy.nodes.' +nodeId +'.id', nodeId);
            model.pass({user:user}).set('_page.doc.cy.nodes.' +nodeId +'.position', {x: param.x, y: param.y});
            //adding the node in cytoscape
            model.pass({user:user}).set('_page.doc.cy.nodes.' +nodeId+'.addedLater', true);



            if(!noHistUpdate)
            //We don't want all the attributes of the param to be printed
                this.updateHistory({opName:'add',opTarget:'element', elType:'node', elId: nodeId, param:{x: param.x, y: param.y}});



            return "success";

        },

        addModelEdge: function(edgeId, param, user, noHistUpdate){

            if(model.get("_page.doc.cy.edges." + edgeId + '.id') != null)
                return "Edge cannot be duplicated";

            model.pass({user:user}).set('_page.doc.cy.edges.' + edgeId +'.id', edgeId);

            model.pass({user:user}).set('_page.doc.cy.edges.' + edgeId +'.source', param.source);
            model.pass({user:user}).set('_page.doc.cy.edges.' + edgeId +'.target', param.target);

            //adding the edge...other operations should be called after this
            model.pass({user:user}).set('_page.doc.cy.edges.' +edgeId+'.addedLater', true);



            if(!noHistUpdate)
                this.updateHistory({opName:'add',opTarget:'element', elType:'edge', elId: edgeId, param:param});

            return "success";

        },


        //attStr: attribute namein the model
        //historyData is for  sbgnStatesAndInfos only
        changeModelElementGroupAttribute: function(attStr, elList, paramList,  user, noHistUpdate) { //historyData){

            var prevParamList = [];
            var self = this;

            if (!noHistUpdate) {

                elList.forEach(function (el) {
                    var prevAttVal;
                    if (el.isNode)
                        prevAttVal = model.get('_page.doc.cy.nodes.' + el.id + '.' + attStr);
                    else
                        prevAttVal = model.get('_page.doc.cy.edges.' + el.id + '.' + attStr);

                    prevParamList.push(prevAttVal);
                });


                this.updateHistory({
                    opName: 'set',
                    opTarget: 'element group',
                    elId: elList,
                    opAttr: attStr,
                    param: paramList,
                    prevParam: prevParamList
                });

            }

            var ind = 0;
            elList.forEach(function(el){
                var currAttVal = paramList[ind++];

                if(el.isNode)
                    self.changeModelNodeAttribute(attStr, el.id, currAttVal, null, true); //don't update individual histories
                else
                    self.changeModelEdgeAttribute(attStr, el.id, currAttVal, null, true);

            });

            return "success";

        },
        //attStr: attribute namein the model
        //historyData is for  sbgnStatesAndInfos only
        changeModelNodeAttribute: function(attStr, nodeId, attVal,  user, noHistUpdate){ //historyData){

            var status = "Node id not found";
            var nodePath = model.at('_page.doc.cy.nodes.'  + nodeId);


            var prevAttVal = nodePath.get(attStr);


            nodePath.pass({user:user}).set(attStr,attVal);




                if (!noHistUpdate) {

                    this.updateHistory({
                        opName: 'set',
                        opTarget: 'element',
                        elType: 'node',
                        elId: nodeId,
                        opAttr: attStr,
                        param: attVal,
                        prevParam: prevAttVal
                    });
                }
            status = "success";


            return status;

        },
        changeModelEdgeAttribute: function(attStr, edgeId, attVal,  user, noHistUpdate){
            var status = "Edge id not found";
            var edgePath = model.at('_page.doc.cy.edges.'  + edgeId);
            var prevAttVal = edgePath.get(attStr);
            edgePath.pass({user:user}).set(attStr, attVal);


            var sourceId = edgePath.get('source');
            var targetId = edgePath.get('target');


            if(!noHistUpdate) {

                this.updateHistory({
                    opName: 'set',
                    opTarget: 'element',
                    elType: 'edge',
                    elId: edgeId,
                    opAttr: attStr,
                    param: attVal,
                    prevParam: prevAttVal
                });

            }

            status = "success";



            return status;
        },

        //willUpdateHistory: Depending on the parent command, history will be updated or not
        deleteModelNode: function(nodeId, user, noHistUpdate){
            var nodePath = model.at('_page.doc.cy.nodes.'  + nodeId);

            if(nodePath.get() == null)
                return "Node id not found";

            if(!noHistUpdate){
                var pos = nodePath.get('position');
                var borderColor = nodePath.get('borderColor');
                var borderWidth = nodePath.get('borderWidth');
                var backgroundColor = nodePath.get('backgroundColor');
                var width = nodePath.get('width');
                var height = nodePath.get('height');
                var highlightColor = nodePath.get('highlightColor');


                prevParam = {x: pos.x , y: pos.y , sbgnclass:sbgnclass, width: width, height: height,
                    borderColor: borderColor, borderWidth: borderWidth, sbgnlabel: sbgnlabel,
                    sbgnStatesAndInfos:sbgnStatesAndInfos, parent:parent, isCloneMarker: isCloneMarker,
                    isMultimer: isMultimer, highlightColor: highlightColor, ports: ports};



                this.updateHistory({opName:'delete',opTarget:'element', elType:'node', elId: nodeId, prevParam: prevParam});

            }

            model.pass({user: user}).del(('_page.doc.cy.nodes.' + nodeId));



            return "success";

        },


        deleteModelEdge: function(edgeId, user, noHistUpdate){

            var edgePath = model.at('_page.doc.cy.edges.'  + edgeId);
            if(edgePath.get() == null)
                return "Edge id not found";


            if(!noHistUpdate) {
                var source = edgePath.get('source');
                var target = edgePath.get('target');
                var sbgnClass = edgePath.get('sbgnclass');
                var lineColor = edgePath.get('lineColor');
                var width = edgePath.get('width');
                var sbgncardinality = edgePath.get('sbgncardinality');
                var portsource = edgePath.get('portsource');
                var porttarget = edgePath.get('porttarget');
                var bendPointPositions= edgePath.get('bendPointPositions');
                var highlightColor = edgePath.get('highlightColor');

                prevParam = {source: source , target:target , sbgnclass:sbgnClass, lineColor: lineColor,
                    width: width, sbgncardinality: sbgncardinality, portsource: portsource, porttarget:porttarget, bendPointPositions: bendPointPositions, highlightColor:highlightColor};

                this.updateHistory({opName:'delete',opTarget:'element', elType:'edge', elId: edgeId, prevParam: prevParam});

            }

            model.pass({user:user}).del(('_page.doc.cy.edges.'  + edgeId));

            return "success";

        },


        deleteModelElementGroup: function(selectedEles, user, noHistUpdate){
            var prevParamsNodes = [];
            var prevParamsEdges = [];
            var self = this;

            selectedEles.edges.forEach(function(edge){
                var edgePath = model.at('_page.doc.cy.edges.' + edge.id);

                var source = edgePath.get('source');
                var target = edgePath.get('target');
                var sbgnclass = edgePath.get('sbgnclass');
                var lineColor = edgePath.get('lineColor');
                var width = edgePath.get('width');
                var sbgncardinality = edgePath.get('sbgncardinality');
                var portsource = edgePath.get('portsource');
                var porttarget = edgePath.get('porttarget');
                var bendPointPositions= edgePath.get('bendPointPositions');

                prevParamsEdges.push( {source: source , target:target , sbgnclass:sbgnclass, lineColor: lineColor,
                    width: width, sbgncardinality: sbgncardinality, portsource: portsource, porttarget:porttarget, bendPointPositions: bendPointPositions});
            });


            selectedEles.edges.forEach(function(edge){
                self.deleteModelEdge(edge.id, user, true); //will not update children history
            });

            selectedEles.nodes.forEach(function(node){
                var nodePath = model.at('_page.doc.cy.nodes.'  + node.id);

                var pos = nodePath.get('position');
                var sbgnclass = nodePath.get('sbgnclass');


                var borderColor = nodePath.get('borderColor');
                var borderWidth = nodePath.get('borderWidth');
                var backgroundColor = nodePath.get('backgroundColor');
                var width = nodePath.get('width');
                var height = nodePath.get('height');
                var parent = nodePath.get('parent');
                var sbgnlabel = nodePath.get('sbgnlabel');
                var isCloneMarker = nodePath.get('isCloneMarker');
                var isMultimer = nodePath.get('isMultimer');
                var sbgnStatesAndInfos = nodePath.get('sbgnStatesAndInfos');
                var highlightColor = nodePath.get('highlightColor');
                var ports = nodePath.get('ports');

                prevParamsNodes.push({x: pos.x , y: pos.y , sbgnclass:sbgnclass, width: width, height: height,
                    borderColor: borderColor, borderWidth: borderWidth, sbgnlabel: sbgnlabel,
                    sbgnStatesAndInfos:sbgnStatesAndInfos, parent:parent, isCloneMarker: isCloneMarker,
                    isMultimer: isMultimer,  highlightColor: highlightColor, backgroundColor: backgroundColor, ports:ports } );
            });


            selectedEles.nodes.forEach(function(node){
                self.deleteModelNode(node.id, user, true); //will not update children history
            });
            if(!noHistUpdate)
                this.updateHistory({opName:'delete',opTarget:'element group',  elId: selectedEles, prevParam: {nodes: prevParamsNodes, edges: prevParamsEdges}});


        },

        restoreModelElementGroup: function(elList, param, user, noHistUpdate){
            var self = this;
            //Restore nodes first

            for (var i = 0; i < elList.nodes.length; i++) {
                self.restoreModelNode(elList.nodes[i].id, param.nodes[i], user, true);
            }

            //restore edges later
            for (var i = 0; i < elList.edges.length; i++) {
                self.restoreModelEdge(elList.edges[i].id, param.edges[i], user, true);
            }

            //change parents after adding them all
            for (var i = 0; i < elList.nodes.length; i++) {

                self.changeModelNodeAttribute('parent', elList.nodes[i].id, param.nodes[i].parent, null, false);
            };


            if(!noHistUpdate)
                self.updateHistory({opName:'restore', opTarget:'element group', elId:elList});
        },
        /**
         * Restore operations for global undo/redo
         */
        restoreModelNode: function(nodeId, param, user, noHistUpdate){

            this.addModelNode(nodeId, param, user, noHistUpdate);


            this.changeModelNodeAttribute('ports', nodeId,param.ports,user, noHistUpdate );
            this.changeModelNodeAttribute('highlightColor', nodeId,param.highlightColor,user, noHistUpdate );
            this.changeModelNodeAttribute('sbgnclass', nodeId,param.sbgnclass,user, noHistUpdate );
            this.changeModelNodeAttribute('width', nodeId,param.width,user, noHistUpdate );
            this.changeModelNodeAttribute('height', nodeId,param.height,user , noHistUpdate);
            this.changeModelNodeAttribute('sbgnlabel', nodeId,param.sbgnlabel,user, noHistUpdate );
            this.changeModelNodeAttribute('backgroundColor', nodeId,param.backgroundColor,user, noHistUpdate );
            this.changeModelNodeAttribute('borderColor', nodeId,param.borderColor,user , noHistUpdate);
            this.changeModelNodeAttribute('borderWidth', nodeId,param.borderWidth,user , noHistUpdate);
            this.changeModelNodeAttribute('sbgnStatesAndInfos', nodeId, param.sbgnStatesAndInfos,user, noHistUpdate );
            this.changeModelNodeAttribute('parent', nodeId,param.parent,user, noHistUpdate );
            this.changeModelNodeAttribute('isCloneMarker', nodeId,param.isCloneMarker,user , noHistUpdate);
            this.changeModelNodeAttribute('isMultimer', nodeId, param.isMultimer,user, noHistUpdate );

            if(!noHistUpdate)
                this.updateHistory({opName:'restore', opTarget:'element', elType:'node',  elId:nodeId});
        },

        restoreModelEdge: function(edgeId, param, user, noHistUpdate){

            this.addModelEdge(edgeId, param, user, noHistUpdate);


            this.changeModelEdgeAttribute('lineColor', edgeId,param.lineColor,user, noHistUpdate );
            this.changeModelEdgeAttribute('width', edgeId,param.width,user, noHistUpdate );
            this.changeModelEdgeAttribute('sbgncardinality', edgeId,param.sbgncardinality,user , noHistUpdate);
            this.changeModelEdgeAttribute('portsource', edgeId,param.portsource,user , noHistUpdate);
            this.changeModelEdgeAttribute('porttarget', edgeId,param.porttarget,user , noHistUpdate);
            this.changeModelEdgeAttribute('bendPointPositions', edgeId,param.bendPointPositions,user , noHistUpdate);
            this.changeModelEdgeAttribute('highlightColor', edgeId,param.highlightColor,user, noHistUpdate );


            if(!noHistUpdate)
                this.updateHistory({opName:'restore', opTarget:'element', elType:'edge',  elId:edgeId});
        },


        restoreModelElement: function(elType, elId, param, user, noHistUpdate){

            if(elType == "node")
                this.restoreModelNode(elId, param, user, noHistUpdate);
            else
                this.restoreModelEdge(elId, param, user, noHistUpdate);



        },





        /**
         * This function is used to undo newModel and redo initModel
         * @param modelCy : nodes and edges to be restored
         * @param user
         * @param noHistUpdate
         */
        restoreModel: function(modelCy, user, noHistUpdate){
            var prevParam = model.get('_page.doc.cy');
            model.set('_page.doc.cy', modelCy);

            this.setSampleInd(-1,null, true); //to get a new container

            if(!noHistUpdate)
                this.updateHistory({opName:'restore', prevParam: prevParam, param: modelCy, opTarget:'model'});

        },

        //should be called before loading a new graph to prevent id confusion
        newModel: function(user, noHistUpdate){

            var self = this;
            var prevModelCy = model.get('_page.doc.cy');

            if(!noHistUpdate)
                this.updateHistory({opName:'new', prevParam: prevModelCy, opTarget:'model'});

            var edges = model.get('_page.doc.cy.edges');
            var nodes = model.get('_page.doc.cy.nodes');


            for(var att in edges) {
                if (edges.hasOwnProperty(att)) {
                    self.deleteModelEdge(edges[att].id, user, true);
                }
            }

            for(var att in nodes) {
                if (nodes.hasOwnProperty(att)) {
                    self.deleteModelNode(nodes[att].id, user, true);
                }
            }


        },



        /***
         * Initialize the model from json
         * @param jsonObj
         * @param user
         * @param noHistUpdate
         */
        initModelFromJson: function(jsonObj, user, noHistUpdate){

            var self = this;


     //       model.set('_page.doc.cy', jsonObj);


            //Keep a hash of nodes by their ids as keys
            for(var i = 0; i < jsonObj.nodes.length; i++){

            //    console.log(model.get('_page.doc.cy.nodes'));
                var node = jsonObj.nodes[i];

                //self.updateHistory({opName:'init', opTarget:'element', elType:'node', elId: node.data.id});
                model.set('_page.doc.cy.nodes.' + node.data.id + '.id', node.data.id);
                model.set('_page.doc.cy.nodes.' + node.data.id  + '.data' , node.data);
                model.set('_page.doc.cy.nodes.' + node.data.id  + '.css' , node.css);

            };


            //Keep a hash of edges by their ids as keys
            for(var i = 0; i < jsonObj.edges.length; i++){

                var edge = jsonObj.edges[i];

                //self.updateHistory({opName:'init', opTarget:'element', elType:'edge', elId: edge.data.id});

                model.set('_page.doc.cy.edges.' + edge.data.id + '.id', edge.data.id);
                model.set('_page.doc.cy.edges.' + edge.data.id  + '.data', edge.data);
                model.set('_page.doc.cy.edges.' + edge.data.id  + '.css', edge.css);


            };

            var self = this;


            var newModelCy = model.get('_page.doc.cy');

            // console.log(jsonObj);
            // console.log(newModelCy);

            if(!noHistUpdate){
                this.updateHistory({opName:'init',  param: newModelCy,  opTarget:'model'});
            }
        },

        initModelNodePositions:function(nodes){


                for(var i = 0; i < nodes.length; i++){
                    model.set('_page.doc.cy.nodes.' + nodes[i].id() +'.position', nodes[i]._private.position);

                }
        },



        setRollbackPoint: function(){
            var modelCy = this.getModelCy();
            model.set('_page.doc.prevCy',modelCy);
        },

        getModelCy: function(){
            return model.get('_page.doc.cy');
        },





    }
}

