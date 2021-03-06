/**
 * Created by durupina on 9/6/16.
 */

var _ = require('underscore');

/***
 *
 * @param cyElements
 * @returns Object with elements grouped by their topologies {{nodes: Array, edges: Array}}
 */
function groupTopology(cyElements){

    //Don't change cyElements, get duplicates -- otherwise the global object may change
    var nodes =  [];
    var edges = [];


    for(var i = 0; i < cyElements.nodes.length; i++){
        var nodeClone = _.clone(cyElements.nodes[i]);
        nodes.push(nodeClone);

    }

    for(var i = 0; i < cyElements.edges.length; i++){
        var edgeClone = _.clone(cyElements.edges[i]);
        edges.push(edgeClone);
    }

    //store the edges associated with each node
    nodes.forEach(function(node){
        node.outgoing = [];
        node.incoming = [];
        edges.forEach(function(edge) {
            if (edge.data.source == node.data.id)
                node.outgoing.push(edge);
            if (edge.data.target == node.data.id)
                node.incoming.push(edge);
        });
    });

    //Comparison of nodes
    var parentId = 0;
    var newNodes = [];
    for(var i = 0; i < nodes.length; i++){
        for(var j = i+1; j < nodes.length; j++){
            if(areNodesAnalogous(nodes[i],nodes[j],edges)) { //combine analogous nodes under the same parent
                if(nodes[i].data.parent != null) { //first node already in the newNode list
                    nodes[j].data.parent = nodes[i].data.parent;
                    newNodes.forEach(function(newNode){
                        if(newNode.data.id == nodes[i].data.parent){
                            //  newNode.incoming = nodes[i].incoming;
                            // newNode.outgoing = nodes[i].outgoing;
                            newNode.data.children.push(nodes[j].data.id); //add node j as a child

                        }
                    })
                }
                else { //Create a new node and assign it as the parent of both nodes
                    nodes[i].data.parent = nodes[j].data.parent = "p" + parentId;
                    parentId++;
                    newNodes.push({data:{id:nodes[i].data.parent, children: [nodes[i].data.id, nodes[j].data.id], edgeType:findCliqueEdgeType(nodes[i].data.id, nodes[j].data.id,edges)},
                    incoming: nodes[i].incoming, outgoing: nodes[i].outgoing});

                }
            }
        }
    }


    //Add new nodes to the old list of nodes
    newNodes.forEach(function(newNode) {
        nodes.push(newNode);
    });

    var nodeHash ={}; //use this to access nodes by id in constant time
    nodes.forEach(function(node) {
        nodeHash[node.data.id] = node;
    });

    //Add connected edges
    var newEdges = [];
    edges.forEach(function (edge) {

        let newEdge;
        if(nodeHash[edge.data.source].data.parent != null) { //change the source
            var newSource = nodeHash[edge.data.source].data.parent;
            var target = edge.data.target;

            if(nodeHash[edge.data.target].data.parent != null) {
                var newTarget = nodeHash[edge.data.target].data.parent;

                if(newSource !== newTarget)
                    newEdge = {data:{id: (newSource+ "_" + newTarget), source: newSource, target:newTarget, edgeType: edge.data.edgeType}};

            }
            else{
                if(newSource !== target)
                    newEdge = {data:{id: (newSource+ "_" + edge.data.target), source: newSource, target:target, edgeType: edge.data.edgeType}};
            }
        }
        else{

            // don't change the source
            var source = edge.data.source;
            if(nodeHash[edge.data.target].data.parent != null) {
                var newTarget = nodeHash[edge.data.target].data.parent;
                if(source !== newTarget)
                    newEdge = {data:{id: (edge.data.source+ "_" + newTarget), source: source , target:newTarget, edgeType: edge.data.edgeType}};
            }
            else{
              var target = edge.data.target;

              if(source !== target)
                    newEdge = {data:{id: (edge.data.source+ "_" + edge.data.target), source: source, target:target, edgeType: edge.data.edgeType}};
            }
        }

        if(newEdge) {

            if (edge.data.pcLinks)
                newEdge.data.pcLinks = edge.data.pcLinks;
            else
                newEdge.data.pcLinks = [];

            if (edge.data.tooltipText)
            {
                newEdge.data.tooltipText = edge.data.tooltipText;
            }

            let exists = false;
            newEdges.forEach(function (e) {
                if (e.data.id === newEdge.data.id) { //already added
                    e.data.pcLinks.push.apply(e.data.pcLinks, newEdge.data.pcLinks);
                    if (newEdge.data.tooltipText) {
                        if (e.data.tooltipText)
                        {
                            if (!e.data.tooltipText.includes(newEdge.data.tooltipText)) {
                                e.data.tooltipText = e.data.tooltipText.concat('\n', newEdge.data.tooltipText);
                            }
                        }
                        else {
                            e.data.tooltipText = newEdge.tooltipText;
                        }
                    }
                    exists = true;
                }
            });
            if (!exists)
                newEdges.push(newEdge);
        }
    });

    return{nodes:nodes, edges:newEdges};
}

/***
 * Incoming and outgoing edges of n1 and n2 are the same
 * @param n1
 * @param n2
 * @param edges
 * @returns {boolean}
 */
function areNodesAnalogous(n1, n2,  edges){

    if(n1.incoming.length != n2.incoming.length  || n1.outgoing.length != n2.outgoing.length)
        return false;

    if(!noEdgeBetween(n1.data.id, n2.data.id, edges) && !isCliqueBetween(n1.data.id, n2.data.id, edges))
        return false;


    //check whether all incoming edges of n1 exist in n2 too
    for(var i = 0; i < n1.incoming.length; i++) {
        var edge1 = n1.incoming[i];
        if (isEdgeBetween(n1.data.id, n2.data.id, edge1))  //skip edges between n1 and n2
            continue;

        var exists = false;
        for (var j = 0; j < n2.incoming.length; j++) {
            var edge2 = n2.incoming[j];
            if (edge1.data.edgeType == edge2.data.edgeType && edge1.data.source == edge2.data.source) {
                exists = true;
                break;
            }
        }
        if (!exists)
            return false;
    }


    //check whether all outgoing edges of n1 exist in n2 too
    for(var i = 0; i < n1.outgoing.length; i++){
        var edge1 = n1.outgoing[i];
        if (isEdgeBetween(n1.data.id, n2.data.id, edge1))  //skip edges between n1 and n2
            continue;

        var exists = false;
        for(var j = 0; j < n2.outgoing.length; j++){
            var edge2 = n2.outgoing[j];
            if(edge1.data.edgeType == edge2.data.edgeType && edge1.data.target == edge2.data.target){
                exists = true;
                break;
            }

        }

        if(!exists)
            return false;
    }

    return true;

}

/***
 * Returns true if 'edge' is between nodes with ids id1 and id2
 * @param id1
 * @param id2
 * @param edge
 */
function isEdgeBetween(id1, id2, edge){
    if(edge.data.source == id1 && edge.data.target == id2 )
        return true;

    if(edge.data.source == id2 && edge.data.target == id1 )
        return true;

    return false;
}

/***
 * Returns true of there is no edge between nodes with ids id1 and id2
 * @param id1
 * @param id2
 * @param edges
 */
function noEdgeBetween(id1, id2, edges){
    edges.forEach(function(edge){
        if(edge.data.source == id1 && edge.data.target == id2)
            return false;
        if(edge.data.target == id1 && edge.data.source == id2)
            return false;
    });

    return true;

}

/***
 * Returns true if there are incoming and outgoing edges between id1 and id2
 * @param id1
 * @param id2
 * @param edges
 */
function isCliqueBetween(id1, id2, edges){
    var eId1 = null;
    var eId2 = null;
    edges.forEach(function(edge){
        if(edge.data.source == id1 && edge.data.target == id2)
            eId1 = edge.data.id;

        else if(edge.data.target == id1 && edge.data.source == id2)
            eId2 = edge.data.id;
    });

    if(eId1!=null && eId2!=null)
        return true;

    return false;

}
/***
 * Call this function only when we know there is a clique between nodes id1 and id2
 * Return any edge's type between nodes with ids id1 and id2
 * @param id1
 * @param id2
 * @param edges
 */

function findCliqueEdgeType(id1, id2, edges) {

   for(var i = 0; i < edges.length; i++){ //careful! does not work with iterators
       var edge = edges[i];
        if (edge.data.source == id1 && edge.data.target == id2)
            return edge.data.edgeType;

        if (edge.data.source == id2 && edge.data.target == id1)
            return edge.data.edgeType;
   }

    return null;
}

module.exports = groupTopology;
