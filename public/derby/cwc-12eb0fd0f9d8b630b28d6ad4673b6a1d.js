require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (__filename,__dirname){
/*
 *	Model initialization
 *  Event handlers of model updates
 *	Author: Funda Durupinar Babur<f.durupinar@gmail.com>
 */
var app = module.exports = require('derby').createApp('cwc', __filename);


app.loadViews(__dirname + '/views');
//app.loadStyles(__dirname + '/styles');
//app.serverUse(module, 'derby-stylus');


var testMode = false;

var docReady = false;

var socket;

app.modelManager = null;

var cgfCy;


var graphChoiceEnum = {
    JSON: 1, ANALYSIS: 2, DEMO: 3
};

var graphChoice;

app.get('/', function (page, model, params) {
    function getId() {
        return model.id();
    }

    function idIsReserved() {
        var ret = model.get('documents.' + docId) != undefined;
        return ret;
    }

    var docId = getId();

    while (idIsReserved()) {
        docId = getId();
    }

     if( testMode ){ // use qunit testing doc if we're testing so we don't disrupt real docs
         docId = 'qunit';
     }

    return page.redirect('/' + docId);
});


app.get('/:docId', function (page, model, arg, next) {
    var messagesQuery, room;
    room = arg.docId;


    var docPath = 'documents.' + arg.docId;

    model.subscribe(docPath, 'cgfText', function(err){
        if (err) {
            return next(err);
        }
        model.setNull(docPath, { // create the empty new doc if it doesn't already exist
            id: arg.docId

        });
        // create a reference to the document
        model.ref('_page.doc', 'documents.' + arg.docId);

    });

    model.subscribe(docPath, 'cy', function(err){
        if (err) {
            return next(err);
        }

    });


    model.set('_page.room', room);


    page.render();

});



app.proto.create = function (model) {

    docReady = true;
    cgfCy = require('./public/src/cgf-visualizer/cgf-cy.js');


    socket = io();

    var id = model.get('_session.userId');
    var name = model.get('users.' + id +'.name');

    this.modelManager = require('./public/src/model/modelManager.js')(model, model.get('_page.room'), model.get('_session.userId'),name );

    if(testMode)
        this.runUnitTests();


};


app.proto.runLayout = function(){
    if(docReady)
        cgfCy.runLayout();
}


/***
 * Reload the graph
 * Called after changing topology grouping
 */
app.proto.reloadGraph = function(){

    cy.destroy();
    var cgfText = this.model.get('_page.doc.cgfText');
    this.createCyGraphFromCgf(JSON.parse(cgfText));
}

/***
 * Load demo graph from demoJson.js
 */
app.proto.loadDemoGraph = function(){

    graphChoice = graphChoiceEnum.DEMO;
    this.model.set('_page.doc.cgfText', JSON.stringify(demoJson));
    this.createCyGraphFromCgf(demoJson);

}

/***
 * Load graph file in json format
 */
app.proto.loadGraphFile = function(){

    var self = this;

    graphChoice = graphChoiceEnum.JSON;

    var reader = new FileReader();

    var extension = $("#graph-file-input")[0].files[0].name.split('.').pop().toLowerCase();

    reader.onload = function (e) {

        self.model.set('_page.doc.cgfText', this.result);
        self.createCyGraphFromCgf(JSON.parse(this.result));

    };
    //TODO: move graph-file-input to an argument
    reader.readAsText($("#graph-file-input")[0].files[0]);
}


/***
 * Take the input files and transfer them to the server in analysisDir and run shell command
 * Produces graph from analysis results
 */
app.proto.loadAnalysisDir = function(){

    var self = this;
    graphChoice = graphChoiceEnum.ANALYSIS;
    var fileCnt = $('#analysis-directory-input')[0].files.length;
    var fileContents = [];
    var notyView = noty({type:"information", layout: "bottom",text: "Reading files...Please wait."});

    var room = this.model.get('_page.room');
    notyView.setText( "Reading files...Please wait.");


    //Sending a zip file
    if(fileCnt == 1 &&  $('#analysis-directory-input')[0].files[0].name.split('.').pop().toLowerCase() == "zip"){

        var file = $('#analysis-directory-input')[0].files[0];

        var reader = new FileReader();

        reader.onload = function (e) {
            fileContents.push({name: file.name, content: e.target.result});
            notyView.setText( "Analyzing results...Please wait.");
            socket.emit('analysisZip', e.target.result, room, function(json){
                self.createCyGraphFromCgf(JSON.parse(json), function(){
                    notyView.close();
                });

                self.model.set('_page.doc.cgfText', json);
                notyView.close();
            });
        }

        reader.readAsBinaryString(file);

    }
    else{


        var p1 = new Promise(function (resolve, reject) {
            for (var i = 0; i < fileCnt; i++) {
                (function (file) {

                    //Send these files to server
                    var reader = new FileReader();

                    reader.onload = function (e) {
                        fileContents.push({name: file.name, content: e.target.result});
                        if(fileContents.length >= fileCnt)
                            resolve("success");
                    }

                    reader.readAsText($("#analysis-directory-input")[0].files[i]);
                })($('#analysis-directory-input')[0].files[i]);
            }
        });

        p1.then(function (content) {

            notyView.setText( "Analyzing results...Please wait.");
            var room = self.model.get('_page.room'); //each room will have its own folder
            socket.emit('analysisDir', fileContents, room, function(data){

                if(data.indexOf("Error") == 0){
                    notyView.close();
                    notyView = noty({type:"error", layout: "bottom",timeout: 4500, text: ("Error in input files.")});

                }
                else {

                    self.createCyGraphFromCgf(JSON.parse(data), function () {
                        notyView.close();
                    });

                    self.model.set('_page.doc.cgfText', data);
                }
            });


        }), function (xhr, status, error) {
            api.set('content.text', "Error retrieving data: " + error);

        }
    }

}


/***
 * Create cytoscape graph from cgfJson
 * @param cgfJson
 */
app.proto.createCyGraphFromCgf = function(cgfJson, callback){

    var noTopologyGrouping = this.model.get('_page.doc.noTopologyGrouping');


    if(cgfJson == null){
        var cgfText = this.model.get('_page.doc.cgfText');
        cgfJson = JSON.parse(cgfText);
    }


    if(cgfJson) {
        this.modelManager.initModelFromJson(cgfJson);


        if (docReady){

            try{

                cy.destroy();

            }
            catch(error){
                //console.log(error + " Cytoscape not created yet.");
            }
        } //cytoscape is loaded



        this.showGraphContainer();


        var notyView = noty({type: "information", layout: "bottom",  text: "Drawing graph...Please wait."});


        var cgfContainer = new cgfCy.createContainer($('#graph-container'),  !noTopologyGrouping, this.modelManager, function () {


            if(graphChoice != graphChoiceEnum.JSON) //As json object is not associated with any analysis data
             $('#download-div').show();

            notyView.close();

            if (callback) callback();
        });
    }

}

/***
 * Hides input selection menu and opens graph container
 */
app.proto.showGraphContainer = function(){
    $('#info-div').hide();
    $('#input-container').hide();
    $('#download-div').hide(); //this only appears after analysis is performed
    $('#graph-options-container').show();
    $('#graph-container').show();
}

/***
 * Initialization of the input selection menu
 */
app.proto.showInputContainer = function(){
    $('#info-div').show();
    $('#input-container').show();
    $('#graph-options-container').hide();
    $('#graph-container').hide();
}



/***
 *Download and save results in <room>.zip
 */
app.proto.downloadResults = function(){

    var room = this.model.get('_page.room'); //each room will have its own folder

    if(graphChoice == graphChoiceEnum.DEMO)
        room = "demo"; //directly download

    var notyView = noty({type:"information", layout: "bottom",text: "Compressing files...Please wait."});

    socket.emit('downloadRequest', room, function(fileContent){
        console.log("Zip file received.");

        var blob = base64ToZipBlob(fileContent);

        saveAs(blob, (room + ".zip"));

        notyView.close();


    });

}
/***
 * Local function to convert binary-to-text encoded data into binary zip file
 * @param data
 * @returns {*}
 */
function base64ToZipBlob(data){

    var byteCharacters = atob(data);
    var byteNumbers = new Array(byteCharacters.length);
    for (var i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }

    var byteArray = new Uint8Array(byteNumbers);

    var blob = new Blob([byteArray], { type: "application/zip"});

    return blob;

}


/***
 * Run unit tests
 */
app.proto.runUnitTests = function(){

    require("./test/testsGraphCreation.js")();
    require("./test/testOptions.js")(); //to print out results

}

}).call(this,"/index.js","/")
},{"./public/src/cgf-visualizer/cgf-cy.js":88,"./public/src/model/modelManager.js":89,"./test/testOptions.js":90,"./test/testsGraphCreation.js":91,"derby":"4eZCmJ"}],2:[function(require,module,exports){
module.exports = arrayDiff;

// Based on some rough benchmarking, this algorithm is about O(2n) worst case,
// and it can compute diffs on random arrays of length 1024 in about 34ms,
// though just a few changes on an array of length 1024 takes about 0.5ms

arrayDiff.InsertDiff = InsertDiff;
arrayDiff.RemoveDiff = RemoveDiff;
arrayDiff.MoveDiff = MoveDiff;

function InsertDiff(index, values) {
  this.index = index;
  this.values = values;
}
InsertDiff.prototype.type = 'insert';
InsertDiff.prototype.toJSON = function() {
  return {
    type: this.type,
    index: this.index,
    values: this.values
  };
};

function RemoveDiff(index, howMany) {
  this.index = index;
  this.howMany = howMany;
}
RemoveDiff.prototype.type = 'remove';
RemoveDiff.prototype.toJSON = function() {
  return {
    type: this.type,
    index: this.index,
    howMany: this.howMany
  };
};

function MoveDiff(from, to, howMany) {
  this.from = from;
  this.to = to;
  this.howMany = howMany;
}
MoveDiff.prototype.type = 'move';
MoveDiff.prototype.toJSON = function() {
  return {
    type: this.type,
    from: this.from,
    to: this.to,
    howMany: this.howMany
  };
};

function strictEqual(a, b) {
  return a === b;
}

function arrayDiff(before, after, equalFn) {
  if (!equalFn) equalFn = strictEqual;

  // Find all items in both the before and after array, and represent them
  // as moves. Many of these "moves" may end up being discarded in the last
  // pass if they are from an index to the same index, but we don't know this
  // up front, since we haven't yet offset the indices.
  //
  // Also keep a map of all the indices accounted for in the before and after
  // arrays. These maps are used next to create insert and remove diffs.
  var beforeLength = before.length;
  var afterLength = after.length;
  var moves = [];
  var beforeMarked = {};
  var afterMarked = {};
  for (var beforeIndex = 0; beforeIndex < beforeLength; beforeIndex++) {
    var beforeItem = before[beforeIndex];
    for (var afterIndex = 0; afterIndex < afterLength; afterIndex++) {
      if (afterMarked[afterIndex]) continue;
      if (!equalFn(beforeItem, after[afterIndex])) continue;
      var from = beforeIndex;
      var to = afterIndex;
      var howMany = 0;
      do {
        beforeMarked[beforeIndex++] = afterMarked[afterIndex++] = true;
        howMany++;
      } while (
        beforeIndex < beforeLength &&
        afterIndex < afterLength &&
        equalFn(before[beforeIndex], after[afterIndex]) &&
        !afterMarked[afterIndex]
      );
      moves.push(new MoveDiff(from, to, howMany));
      beforeIndex--;
      break;
    }
  }

  // Create a remove for all of the items in the before array that were
  // not marked as being matched in the after array as well
  var removes = [];
  for (beforeIndex = 0; beforeIndex < beforeLength;) {
    if (beforeMarked[beforeIndex]) {
      beforeIndex++;
      continue;
    }
    var index = beforeIndex;
    var howMany = 0;
    while (beforeIndex < beforeLength && !beforeMarked[beforeIndex++]) {
      howMany++;
    }
    removes.push(new RemoveDiff(index, howMany));
  }

  // Create an insert for all of the items in the after array that were
  // not marked as being matched in the before array as well
  var inserts = [];
  for (var afterIndex = 0; afterIndex < afterLength;) {
    if (afterMarked[afterIndex]) {
      afterIndex++;
      continue;
    }
    var index = afterIndex;
    var howMany = 0;
    while (afterIndex < afterLength && !afterMarked[afterIndex++]) {
      howMany++;
    }
    var values = after.slice(index, index + howMany);
    inserts.push(new InsertDiff(index, values));
  }

  var insertsLength = inserts.length;
  var removesLength = removes.length;
  var movesLength = moves.length;
  var i, j;

  // Offset subsequent removes and moves by removes
  var count = 0;
  for (i = 0; i < removesLength; i++) {
    var remove = removes[i];
    remove.index -= count;
    count += remove.howMany;
    for (j = 0; j < movesLength; j++) {
      var move = moves[j];
      if (move.from >= remove.index) move.from -= remove.howMany;
    }
  }

  // Offset moves by inserts
  for (i = insertsLength; i--;) {
    var insert = inserts[i];
    var howMany = insert.values.length;
    for (j = movesLength; j--;) {
      var move = moves[j];
      if (move.to >= insert.index) move.to -= howMany;
    }
  }

  // Offset the to of moves by later moves
  for (i = movesLength; i-- > 1;) {
    var move = moves[i];
    if (move.to === move.from) continue;
    for (j = i; j--;) {
      var earlier = moves[j];
      if (earlier.to >= move.to) earlier.to -= move.howMany;
      if (earlier.to >= move.from) earlier.to += move.howMany;
    }
  }

  // Only output moves that end up having an effect after offsetting
  var outputMoves = [];

  // Offset the from of moves by earlier moves
  for (i = 0; i < movesLength; i++) {
    var move = moves[i];
    if (move.to === move.from) continue;
    outputMoves.push(move);
    for (j = i + 1; j < movesLength; j++) {
      var later = moves[j];
      if (later.from >= move.from) later.from -= move.howMany;
      if (later.from >= move.to) later.from += move.howMany;
    }
  }

  return removes.concat(outputMoves, inserts);
}

},{}],3:[function(require,module,exports){
(function(){
var f, aa = aa || {}, l = this;
function ba(a) {
  a = a.split(".");
  for (var b = l, c;c = a.shift();) {
    if (null != b[c]) {
      b = b[c];
    } else {
      return null;
    }
  }
  return b;
}
function ca() {
}
function da(a) {
  var b = typeof a;
  if ("object" == b) {
    if (a) {
      if (a instanceof Array) {
        return "array";
      }
      if (a instanceof Object) {
        return b;
      }
      var c = Object.prototype.toString.call(a);
      if ("[object Window]" == c) {
        return "object";
      }
      if ("[object Array]" == c || "number" == typeof a.length && "undefined" != typeof a.splice && "undefined" != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable("splice")) {
        return "array";
      }
      if ("[object Function]" == c || "undefined" != typeof a.call && "undefined" != typeof a.propertyIsEnumerable && !a.propertyIsEnumerable("call")) {
        return "function";
      }
    } else {
      return "null";
    }
  } else {
    if ("function" == b && "undefined" == typeof a.call) {
      return "object";
    }
  }
  return b;
}
function m(a) {
  return "array" == da(a);
}
function ea(a) {
  var b = da(a);
  return "array" == b || "object" == b && "number" == typeof a.length;
}
function n(a) {
  return "string" == typeof a;
}
function fa(a) {
  return "function" == da(a);
}
var ga = "closure_uid_" + (1E9 * Math.random() >>> 0), ha = 0;
function ia(a, b, c) {
  return a.call.apply(a.bind, arguments);
}
function ja(a, b, c) {
  if (!a) {
    throw Error();
  }
  if (2 < arguments.length) {
    var d = Array.prototype.slice.call(arguments, 2);
    return function() {
      var c = Array.prototype.slice.call(arguments);
      Array.prototype.unshift.apply(c, d);
      return a.apply(b, c);
    };
  }
  return function() {
    return a.apply(b, arguments);
  };
}
function p(a, b, c) {
  p = Function.prototype.bind && -1 != Function.prototype.bind.toString().indexOf("native code") ? ia : ja;
  return p.apply(null, arguments);
}
var q = Date.now || function() {
  return+new Date;
};
function s(a, b) {
  function c() {
  }
  c.prototype = b.prototype;
  a.pa = b.prototype;
  a.prototype = new c;
  a.Hc = function(a, c, g) {
    var h = Array.prototype.slice.call(arguments, 2);
    return b.prototype[c].apply(a, h);
  };
}
;function ka(a, b) {
  for (var c = a.split("%s"), d = "", e = Array.prototype.slice.call(arguments, 1);e.length && 1 < c.length;) {
    d += c.shift() + e.shift();
  }
  return d + c.join("%s");
}
function la(a) {
  if (!ma.test(a)) {
    return a;
  }
  -1 != a.indexOf("&") && (a = a.replace(na, "&amp;"));
  -1 != a.indexOf("<") && (a = a.replace(oa, "&lt;"));
  -1 != a.indexOf(">") && (a = a.replace(pa, "&gt;"));
  -1 != a.indexOf('"') && (a = a.replace(qa, "&quot;"));
  -1 != a.indexOf("'") && (a = a.replace(ra, "&#39;"));
  return a;
}
var na = /&/g, oa = /</g, pa = />/g, qa = /"/g, ra = /'/g, ma = /[&<>"']/;
function sa() {
  return Math.floor(2147483648 * Math.random()).toString(36) + Math.abs(Math.floor(2147483648 * Math.random()) ^ q()).toString(36);
}
function ta(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
;var x, ua, va, wa;
function xa() {
  return l.navigator ? l.navigator.userAgent : null;
}
wa = va = ua = x = !1;
var ya;
if (ya = xa()) {
  var za = l.navigator;
  x = 0 == ya.lastIndexOf("Opera", 0);
  ua = !x && (-1 != ya.indexOf("MSIE") || -1 != ya.indexOf("Trident"));
  va = !x && -1 != ya.indexOf("WebKit");
  wa = !x && !va && !ua && "Gecko" == za.product;
}
var Aa = x, y = ua, Ba = wa, z = va;
function Ca() {
  var a = l.document;
  return a ? a.documentMode : void 0;
}
var Da;
a: {
  var Ea = "", Fa;
  if (Aa && l.opera) {
    var Ga = l.opera.version, Ea = "function" == typeof Ga ? Ga() : Ga
  } else {
    if (Ba ? Fa = /rv\:([^\);]+)(\)|;)/ : y ? Fa = /\b(?:MSIE|rv)[: ]([^\);]+)(\)|;)/ : z && (Fa = /WebKit\/(\S+)/), Fa) {
      var Ha = Fa.exec(xa()), Ea = Ha ? Ha[1] : ""
    }
  }
  if (y) {
    var Ia = Ca();
    if (Ia > parseFloat(Ea)) {
      Da = String(Ia);
      break a;
    }
  }
  Da = Ea;
}
var Ja = {};
function A(a) {
  var b;
  if (!(b = Ja[a])) {
    b = 0;
    for (var c = String(Da).replace(/^[\s\xa0]+|[\s\xa0]+$/g, "").split("."), d = String(a).replace(/^[\s\xa0]+|[\s\xa0]+$/g, "").split("."), e = Math.max(c.length, d.length), g = 0;0 == b && g < e;g++) {
      var h = c[g] || "", k = d[g] || "", u = RegExp("(\\d*)(\\D*)", "g"), K = RegExp("(\\d*)(\\D*)", "g");
      do {
        var v = u.exec(h) || ["", "", ""], r = K.exec(k) || ["", "", ""];
        if (0 == v[0].length && 0 == r[0].length) {
          break;
        }
        b = ta(0 == v[1].length ? 0 : parseInt(v[1], 10), 0 == r[1].length ? 0 : parseInt(r[1], 10)) || ta(0 == v[2].length, 0 == r[2].length) || ta(v[2], r[2]);
      } while (0 == b);
    }
    b = Ja[a] = 0 <= b;
  }
  return b;
}
var La = l.document, Ma = La && y ? Ca() || ("CSS1Compat" == La.compatMode ? parseInt(Da, 10) : 5) : void 0;
function Na(a) {
  Error.captureStackTrace ? Error.captureStackTrace(this, Na) : this.stack = Error().stack || "";
  a && (this.message = String(a));
}
s(Na, Error);
Na.prototype.name = "CustomError";
function Oa(a, b) {
  b.unshift(a);
  Na.call(this, ka.apply(null, b));
  b.shift();
}
s(Oa, Na);
Oa.prototype.name = "AssertionError";
function Pa(a, b) {
  throw new Oa("Failure" + (a ? ": " + a : ""), Array.prototype.slice.call(arguments, 1));
}
;var Qa = RegExp("^(?:([^:/?#.]+):)?(?://(?:([^/?#]*)@)?([^/#?]*?)(?::([0-9]+))?(?=[/#?]|$))?([^?#]+)?(?:\\?([^#]*))?(?:#(.*))?$");
function Ra(a) {
  if (Sa) {
    Sa = !1;
    var b = l.location;
    if (b) {
      var c = b.href;
      if (c && (c = (c = Ra(c)[3] || null) && decodeURIComponent(c)) && c != b.hostname) {
        throw Sa = !0, Error();
      }
    }
  }
  return a.match(Qa);
}
var Sa = z;
function Ta(a) {
  var b = [], c = 0, d;
  for (d in a) {
    b[c++] = a[d];
  }
  return b;
}
function Ua(a) {
  var b = [], c = 0, d;
  for (d in a) {
    b[c++] = d;
  }
  return b;
}
var Va = "constructor hasOwnProperty isPrototypeOf propertyIsEnumerable toLocaleString toString valueOf".split(" ");
function Wa(a, b) {
  for (var c, d, e = 1;e < arguments.length;e++) {
    d = arguments[e];
    for (c in d) {
      a[c] = d[c];
    }
    for (var g = 0;g < Va.length;g++) {
      c = Va[g], Object.prototype.hasOwnProperty.call(d, c) && (a[c] = d[c]);
    }
  }
}
;var B = Array.prototype, Xa = B.indexOf ? function(a, b, c) {
  return B.indexOf.call(a, b, c);
} : function(a, b, c) {
  c = null == c ? 0 : 0 > c ? Math.max(0, a.length + c) : c;
  if (n(a)) {
    return n(b) && 1 == b.length ? a.indexOf(b, c) : -1;
  }
  for (;c < a.length;c++) {
    if (c in a && a[c] === b) {
      return c;
    }
  }
  return-1;
}, Ya = B.forEach ? function(a, b, c) {
  B.forEach.call(a, b, c);
} : function(a, b, c) {
  for (var d = a.length, e = n(a) ? a.split("") : a, g = 0;g < d;g++) {
    g in e && b.call(c, e[g], g, a);
  }
};
function Za(a) {
  var b;
  a: {
    b = $a;
    for (var c = a.length, d = n(a) ? a.split("") : a, e = 0;e < c;e++) {
      if (e in d && b.call(void 0, d[e], e, a)) {
        b = e;
        break a;
      }
    }
    b = -1;
  }
  return 0 > b ? null : n(a) ? a.charAt(b) : a[b];
}
function ab(a) {
  return B.concat.apply(B, arguments);
}
function bb(a) {
  var b = a.length;
  if (0 < b) {
    for (var c = Array(b), d = 0;d < b;d++) {
      c[d] = a[d];
    }
    return c;
  }
  return[];
}
;function cb(a, b) {
  this.O = {};
  this.j = [];
  this.o = 0;
  var c = arguments.length;
  if (1 < c) {
    if (c % 2) {
      throw Error("Uneven number of arguments");
    }
    for (var d = 0;d < c;d += 2) {
      this.set(arguments[d], arguments[d + 1]);
    }
  } else {
    if (a) {
      a instanceof cb ? (c = a.ca(), d = a.N()) : (c = Ua(a), d = Ta(a));
      for (var e = 0;e < c.length;e++) {
        this.set(c[e], d[e]);
      }
    }
  }
}
f = cb.prototype;
f.N = function() {
  db(this);
  for (var a = [], b = 0;b < this.j.length;b++) {
    a.push(this.O[this.j[b]]);
  }
  return a;
};
f.ca = function() {
  db(this);
  return this.j.concat();
};
f.wa = function(a) {
  return C(this.O, a);
};
f.remove = function(a) {
  return C(this.O, a) ? (delete this.O[a], this.o--, this.j.length > 2 * this.o && db(this), !0) : !1;
};
function db(a) {
  if (a.o != a.j.length) {
    for (var b = 0, c = 0;b < a.j.length;) {
      var d = a.j[b];
      C(a.O, d) && (a.j[c++] = d);
      b++;
    }
    a.j.length = c;
  }
  if (a.o != a.j.length) {
    for (var e = {}, c = b = 0;b < a.j.length;) {
      d = a.j[b], C(e, d) || (a.j[c++] = d, e[d] = 1), b++;
    }
    a.j.length = c;
  }
}
f.get = function(a, b) {
  return C(this.O, a) ? this.O[a] : b;
};
f.set = function(a, b) {
  C(this.O, a) || (this.o++, this.j.push(a));
  this.O[a] = b;
};
f.n = function() {
  return new cb(this);
};
function C(a, b) {
  return Object.prototype.hasOwnProperty.call(a, b);
}
;function eb(a) {
  if ("function" == typeof a.N) {
    return a.N();
  }
  if (n(a)) {
    return a.split("");
  }
  if (ea(a)) {
    for (var b = [], c = a.length, d = 0;d < c;d++) {
      b.push(a[d]);
    }
    return b;
  }
  return Ta(a);
}
function D(a, b, c) {
  if ("function" == typeof a.forEach) {
    a.forEach(b, c);
  } else {
    if (ea(a) || n(a)) {
      Ya(a, b, c);
    } else {
      var d;
      if ("function" == typeof a.ca) {
        d = a.ca();
      } else {
        if ("function" != typeof a.N) {
          if (ea(a) || n(a)) {
            d = [];
            for (var e = a.length, g = 0;g < e;g++) {
              d.push(g);
            }
          } else {
            d = Ua(a);
          }
        } else {
          d = void 0;
        }
      }
      for (var e = eb(a), g = e.length, h = 0;h < g;h++) {
        b.call(c, e[h], d && d[h], a);
      }
    }
  }
}
;function E(a, b) {
  var c;
  if (a instanceof E) {
    this.D = void 0 !== b ? b : a.D, fb(this, a.oa), c = a.eb, F(this), this.eb = c, gb(this, a.ja), hb(this, a.Ca), ib(this, a.I), jb(this, a.R.n()), c = a.Na, F(this), this.Na = c;
  } else {
    if (a && (c = Ra(String(a)))) {
      this.D = !!b;
      fb(this, c[1] || "", !0);
      var d = c[2] || "";
      F(this);
      this.eb = d ? decodeURIComponent(d) : "";
      gb(this, c[3] || "", !0);
      hb(this, c[4]);
      ib(this, c[5] || "", !0);
      jb(this, c[6] || "", !0);
      c = c[7] || "";
      F(this);
      this.Na = c ? decodeURIComponent(c) : "";
    } else {
      this.D = !!b, this.R = new kb(null, 0, this.D);
    }
  }
}
f = E.prototype;
f.oa = "";
f.eb = "";
f.ja = "";
f.Ca = null;
f.I = "";
f.Na = "";
f.oc = !1;
f.D = !1;
f.toString = function() {
  var a = [], b = this.oa;
  b && a.push(lb(b, mb), ":");
  if (b = this.ja) {
    a.push("//");
    var c = this.eb;
    c && a.push(lb(c, mb), "@");
    a.push(encodeURIComponent(String(b)));
    b = this.Ca;
    null != b && a.push(":", String(b));
  }
  if (b = this.I) {
    this.ja && "/" != b.charAt(0) && a.push("/"), a.push(lb(b, "/" == b.charAt(0) ? nb : ob));
  }
  (b = this.R.toString()) && a.push("?", b);
  (b = this.Na) && a.push("#", lb(b, pb));
  return a.join("");
};
f.n = function() {
  return new E(this);
};
function fb(a, b, c) {
  F(a);
  a.oa = c ? b ? decodeURIComponent(b) : "" : b;
  a.oa && (a.oa = a.oa.replace(/:$/, ""));
}
function gb(a, b, c) {
  F(a);
  a.ja = c ? b ? decodeURIComponent(b) : "" : b;
}
function hb(a, b) {
  F(a);
  if (b) {
    b = Number(b);
    if (isNaN(b) || 0 > b) {
      throw Error("Bad port number " + b);
    }
    a.Ca = b;
  } else {
    a.Ca = null;
  }
}
function ib(a, b, c) {
  F(a);
  a.I = c ? b ? decodeURIComponent(b) : "" : b;
}
function jb(a, b, c) {
  F(a);
  b instanceof kb ? (a.R = b, a.R.ub(a.D)) : (c || (b = lb(b, qb)), a.R = new kb(b, 0, a.D));
}
function G(a, b, c) {
  F(a);
  a.R.set(b, c);
}
function rb(a, b, c) {
  F(a);
  m(c) || (c = [String(c)]);
  sb(a.R, b, c);
}
function H(a) {
  F(a);
  G(a, "zx", sa());
  return a;
}
function F(a) {
  if (a.oc) {
    throw Error("Tried to modify a read-only Uri");
  }
}
f.ub = function(a) {
  this.D = a;
  this.R && this.R.ub(a);
  return this;
};
function tb(a) {
  return a instanceof E ? a.n() : new E(a, void 0);
}
function ub(a, b, c, d) {
  var e = new E(null, void 0);
  a && fb(e, a);
  b && gb(e, b);
  c && hb(e, c);
  d && ib(e, d);
  return e;
}
function lb(a, b) {
  return n(a) ? encodeURI(a).replace(b, vb) : null;
}
function vb(a) {
  a = a.charCodeAt(0);
  return "%" + (a >> 4 & 15).toString(16) + (a & 15).toString(16);
}
var mb = /[#\/\?@]/g, ob = /[\#\?:]/g, nb = /[\#\?]/g, qb = /[\#\?@]/g, pb = /#/g;
function kb(a, b, c) {
  this.C = a || null;
  this.D = !!c;
}
function I(a) {
  if (!a.h && (a.h = new cb, a.o = 0, a.C)) {
    for (var b = a.C.split("&"), c = 0;c < b.length;c++) {
      var d = b[c].indexOf("="), e = null, g = null;
      0 <= d ? (e = b[c].substring(0, d), g = b[c].substring(d + 1)) : e = b[c];
      e = decodeURIComponent(e.replace(/\+/g, " "));
      e = J(a, e);
      a.add(e, g ? decodeURIComponent(g.replace(/\+/g, " ")) : "");
    }
  }
}
f = kb.prototype;
f.h = null;
f.o = null;
f.add = function(a, b) {
  I(this);
  this.C = null;
  a = J(this, a);
  var c = this.h.get(a);
  c || this.h.set(a, c = []);
  c.push(b);
  this.o++;
  return this;
};
f.remove = function(a) {
  I(this);
  a = J(this, a);
  return this.h.wa(a) ? (this.C = null, this.o -= this.h.get(a).length, this.h.remove(a)) : !1;
};
f.wa = function(a) {
  I(this);
  a = J(this, a);
  return this.h.wa(a);
};
f.ca = function() {
  I(this);
  for (var a = this.h.N(), b = this.h.ca(), c = [], d = 0;d < b.length;d++) {
    for (var e = a[d], g = 0;g < e.length;g++) {
      c.push(b[d]);
    }
  }
  return c;
};
f.N = function(a) {
  I(this);
  var b = [];
  if (n(a)) {
    this.wa(a) && (b = ab(b, this.h.get(J(this, a))));
  } else {
    a = this.h.N();
    for (var c = 0;c < a.length;c++) {
      b = ab(b, a[c]);
    }
  }
  return b;
};
f.set = function(a, b) {
  I(this);
  this.C = null;
  a = J(this, a);
  this.wa(a) && (this.o -= this.h.get(a).length);
  this.h.set(a, [b]);
  this.o++;
  return this;
};
f.get = function(a, b) {
  var c = a ? this.N(a) : [];
  return 0 < c.length ? String(c[0]) : b;
};
function sb(a, b, c) {
  a.remove(b);
  0 < c.length && (a.C = null, a.h.set(J(a, b), bb(c)), a.o += c.length);
}
f.toString = function() {
  if (this.C) {
    return this.C;
  }
  if (!this.h) {
    return "";
  }
  for (var a = [], b = this.h.ca(), c = 0;c < b.length;c++) {
    for (var d = b[c], e = encodeURIComponent(String(d)), d = this.N(d), g = 0;g < d.length;g++) {
      var h = e;
      "" !== d[g] && (h += "=" + encodeURIComponent(String(d[g])));
      a.push(h);
    }
  }
  return this.C = a.join("&");
};
f.n = function() {
  var a = new kb;
  a.C = this.C;
  this.h && (a.h = this.h.n(), a.o = this.o);
  return a;
};
function J(a, b) {
  var c = String(b);
  a.D && (c = c.toLowerCase());
  return c;
}
f.ub = function(a) {
  a && !this.D && (I(this), this.C = null, D(this.h, function(a, c) {
    var d = c.toLowerCase();
    c != d && (this.remove(c), sb(this, d, a));
  }, this));
  this.D = a;
};
function wb(a) {
  a = String(a);
  if (/^\s*$/.test(a) ? 0 : /^[\],:{}\s\u2028\u2029]*$/.test(a.replace(/\\["\\\/bfnrtu]/g, "@").replace(/"[^"\\\n\r\u2028\u2029\x00-\x08\x0a-\x1f]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]").replace(/(?:^|:|,)(?:[\s\u2028\u2029]*\[)+/g, ""))) {
    try {
      return eval("(" + a + ")");
    } catch (b) {
    }
  }
  throw Error("Invalid JSON string: " + a);
}
function xb(a) {
  return eval("(" + a + ")");
}
function yb(a) {
  var b = [];
  zb(new Ab, a, b);
  return b.join("");
}
function Ab() {
  this.Ya = void 0;
}
function zb(a, b, c) {
  switch(typeof b) {
    case "string":
      Bb(b, c);
      break;
    case "number":
      c.push(isFinite(b) && !isNaN(b) ? b : "null");
      break;
    case "boolean":
      c.push(b);
      break;
    case "undefined":
      c.push("null");
      break;
    case "object":
      if (null == b) {
        c.push("null");
        break;
      }
      if (m(b)) {
        var d = b.length;
        c.push("[");
        for (var e = "", g = 0;g < d;g++) {
          c.push(e), e = b[g], zb(a, a.Ya ? a.Ya.call(b, String(g), e) : e, c), e = ",";
        }
        c.push("]");
        break;
      }
      c.push("{");
      d = "";
      for (g in b) {
        Object.prototype.hasOwnProperty.call(b, g) && (e = b[g], "function" != typeof e && (c.push(d), Bb(g, c), c.push(":"), zb(a, a.Ya ? a.Ya.call(b, g, e) : e, c), d = ","));
      }
      c.push("}");
      break;
    case "function":
      break;
    default:
      throw Error("Unknown type: " + typeof b);;
  }
}
var Cb = {'"':'\\"', "\\":"\\\\", "/":"\\/", "\b":"\\b", "\f":"\\f", "\n":"\\n", "\r":"\\r", "\t":"\\t", "\x0B":"\\u000b"}, Db = /\uffff/.test("\uffff") ? /[\\\"\x00-\x1f\x7f-\uffff]/g : /[\\\"\x00-\x1f\x7f-\xff]/g;
function Bb(a, b) {
  b.push('"', a.replace(Db, function(a) {
    if (a in Cb) {
      return Cb[a];
    }
    var b = a.charCodeAt(0), e = "\\u";
    16 > b ? e += "000" : 256 > b ? e += "00" : 4096 > b && (e += "0");
    return Cb[a] = e + b.toString(16);
  }), '"');
}
;function Eb(a) {
  return Fb(a || arguments.callee.caller, []);
}
function Fb(a, b) {
  var c = [];
  if (0 <= Xa(b, a)) {
    c.push("[...circular reference...]");
  } else {
    if (a && 50 > b.length) {
      c.push(Gb(a) + "(");
      for (var d = a.arguments, e = 0;e < d.length;e++) {
        0 < e && c.push(", ");
        var g;
        g = d[e];
        switch(typeof g) {
          case "object":
            g = g ? "object" : "null";
            break;
          case "string":
            break;
          case "number":
            g = String(g);
            break;
          case "boolean":
            g = g ? "true" : "false";
            break;
          case "function":
            g = (g = Gb(g)) ? g : "[fn]";
            break;
          default:
            g = typeof g;
        }
        40 < g.length && (g = g.substr(0, 40) + "...");
        c.push(g);
      }
      b.push(a);
      c.push(")\n");
      try {
        c.push(Fb(a.caller, b));
      } catch (h) {
        c.push("[exception trying to get caller]\n");
      }
    } else {
      a ? c.push("[...long stack...]") : c.push("[end]");
    }
  }
  return c.join("");
}
function Gb(a) {
  if (Hb[a]) {
    return Hb[a];
  }
  a = String(a);
  if (!Hb[a]) {
    var b = /function ([^\(]+)/.exec(a);
    Hb[a] = b ? b[1] : "[Anonymous]";
  }
  return Hb[a];
}
var Hb = {};
function Ib(a, b, c, d, e) {
  this.reset(a, b, c, d, e);
}
Ib.prototype.Fb = null;
Ib.prototype.Eb = null;
var Jb = 0;
Ib.prototype.reset = function(a, b, c, d, e) {
  "number" == typeof e || Jb++;
  d || q();
  this.Aa = a;
  this.qc = b;
  delete this.Fb;
  delete this.Eb;
};
Ib.prototype.$b = function(a) {
  this.Aa = a;
};
function L(a) {
  this.rc = a;
}
L.prototype.Sa = null;
L.prototype.Aa = null;
L.prototype.jb = null;
L.prototype.Jb = null;
function Kb(a, b) {
  this.name = a;
  this.value = b;
}
Kb.prototype.toString = function() {
  return this.name;
};
var Lb = new Kb("SEVERE", 1E3), Mb = new Kb("WARNING", 900), Nb = new Kb("INFO", 800), Ob = new Kb("CONFIG", 700), Pb = new Kb("FINE", 500);
f = L.prototype;
f.getParent = function() {
  return this.Sa;
};
f.$b = function(a) {
  this.Aa = a;
};
function Qb(a) {
  if (a.Aa) {
    return a.Aa;
  }
  if (a.Sa) {
    return Qb(a.Sa);
  }
  Pa("Root logger has no level set.");
  return null;
}
f.log = function(a, b, c) {
  if (a.value >= Qb(this).value) {
    for (fa(b) && (b = b()), a = this.mc(a, b, c), b = "log:" + a.qc, l.console && (l.console.timeStamp ? l.console.timeStamp(b) : l.console.markTimeline && l.console.markTimeline(b)), l.msWriteProfilerMark && l.msWriteProfilerMark(b), b = this;b;) {
      c = b;
      var d = a;
      if (c.Jb) {
        for (var e = 0, g = void 0;g = c.Jb[e];e++) {
          g(d);
        }
      }
      b = b.getParent();
    }
  }
};
f.mc = function(a, b, c) {
  var d = new Ib(a, String(b), this.rc);
  if (c) {
    d.Fb = c;
    var e;
    var g = arguments.callee.caller;
    try {
      var h;
      var k = ba("window.location.href");
      if (n(c)) {
        h = {message:c, name:"Unknown error", lineNumber:"Not available", fileName:k, stack:"Not available"};
      } else {
        var u, K, v = !1;
        try {
          u = c.lineNumber || c.Ic || "Not available";
        } catch (r) {
          u = "Not available", v = !0;
        }
        try {
          K = c.fileName || c.filename || c.sourceURL || l.$googDebugFname || k;
        } catch (Ka) {
          K = "Not available", v = !0;
        }
        h = !v && c.lineNumber && c.fileName && c.stack && c.message && c.name ? c : {message:c.message || "Not available", name:c.name || "UnknownError", lineNumber:u, fileName:K, stack:c.stack || "Not available"};
      }
      e = "Message: " + la(h.message) + '\nUrl: <a href="view-source:' + h.fileName + '" target="_new">' + h.fileName + "</a>\nLine: " + h.lineNumber + "\n\nBrowser stack:\n" + la(h.stack + "-> ") + "[end]\n\nJS stack traversal:\n" + la(Eb(g) + "-> ");
    } catch (w) {
      e = "Exception trying to expose exception! You win, we lose. " + w;
    }
    d.Eb = e;
  }
  return d;
};
f.J = function(a, b) {
  this.log(Lb, a, b);
};
f.Z = function(a, b) {
  this.log(Mb, a, b);
};
f.info = function(a, b) {
  this.log(Nb, a, b);
};
var Rb = {}, Sb = null;
function Tb(a) {
  Sb || (Sb = new L(""), Rb[""] = Sb, Sb.$b(Ob));
  var b;
  if (!(b = Rb[a])) {
    b = new L(a);
    var c = a.lastIndexOf("."), d = a.substr(c + 1), c = Tb(a.substr(0, c));
    c.jb || (c.jb = {});
    c.jb[d] = b;
    b.Sa = c;
    Rb[a] = b;
  }
  return b;
}
;function M(a, b) {
  a && a.log(Pb, b, void 0);
}
;function N() {
  this.r = Tb("goog.net.BrowserChannel");
}
function Ub(a, b, c, d) {
  a.info("XMLHTTP TEXT (" + b + "): " + Vb(a, c) + (d ? " " + d : ""));
}
N.prototype.debug = function(a) {
  this.info(a);
};
function Wb(a, b, c) {
  a.J((c || "Exception") + b);
}
N.prototype.info = function(a) {
  var b = this.r;
  b && b.info(a, void 0);
};
N.prototype.Z = function(a) {
  var b = this.r;
  b && b.Z(a, void 0);
};
N.prototype.J = function(a) {
  var b = this.r;
  b && b.J(a, void 0);
};
function Vb(a, b) {
  if (!b || b == Xb) {
    return b;
  }
  try {
    var c = xb(b);
    if (c) {
      for (var d = 0;d < c.length;d++) {
        if (m(c[d])) {
          var e = c[d];
          if (!(2 > e.length)) {
            var g = e[1];
            if (m(g) && !(1 > g.length)) {
              var h = g[0];
              if ("noop" != h && "stop" != h) {
                for (var k = 1;k < g.length;k++) {
                  g[k] = "";
                }
              }
            }
          }
        }
      }
    }
    return yb(c);
  } catch (u) {
    return a.debug("Exception parsing expected JS array - probably was not JS"), b;
  }
}
;function Yb(a, b) {
  this.P = b ? xb : wb;
}
Yb.prototype.parse = function(a) {
  return this.P(a);
};
function O() {
  0 != Zb && ($b[this[ga] || (this[ga] = ++ha)] = this);
}
var Zb = 0, $b = {};
O.prototype.mb = !1;
O.prototype.Ja = function() {
  if (!this.mb && (this.mb = !0, this.u(), 0 != Zb)) {
    var a = this[ga] || (this[ga] = ++ha);
    delete $b[a];
  }
};
O.prototype.u = function() {
  if (this.Pb) {
    for (;this.Pb.length;) {
      this.Pb.shift()();
    }
  }
};
var ac = "closure_listenable_" + (1E6 * Math.random() | 0);
function bc(a) {
  try {
    return!(!a || !a[ac]);
  } catch (b) {
    return!1;
  }
}
var cc = 0;
function dc(a, b, c, d, e) {
  this.fa = a;
  this.Ua = null;
  this.src = b;
  this.type = c;
  this.capture = !!d;
  this.Oa = e;
  this.key = ++cc;
  this.na = this.Ia = !1;
}
function ec(a) {
  a.na = !0;
  a.fa = null;
  a.Ua = null;
  a.src = null;
  a.Oa = null;
}
;function P(a) {
  this.src = a;
  this.s = {};
  this.Ga = 0;
}
P.prototype.add = function(a, b, c, d, e) {
  var g = this.s[a];
  g || (g = this.s[a] = [], this.Ga++);
  var h = fc(g, b, d, e);
  -1 < h ? (a = g[h], c || (a.Ia = !1)) : (a = new dc(b, this.src, a, !!d, e), a.Ia = c, g.push(a));
  return a;
};
P.prototype.remove = function(a, b, c, d) {
  if (!(a in this.s)) {
    return!1;
  }
  var e = this.s[a];
  b = fc(e, b, c, d);
  return-1 < b ? (ec(e[b]), B.splice.call(e, b, 1), 0 == e.length && (delete this.s[a], this.Ga--), !0) : !1;
};
function gc(a, b) {
  var c = b.type;
  if (!(c in a.s)) {
    return!1;
  }
  var d = a.s[c], e = Xa(d, b), g;
  (g = 0 <= e) && B.splice.call(d, e, 1);
  g && (ec(b), 0 == a.s[c].length && (delete a.s[c], a.Ga--));
  return g;
}
P.prototype.Xa = function(a) {
  var b = 0, c;
  for (c in this.s) {
    if (!a || c == a) {
      for (var d = this.s[c], e = 0;e < d.length;e++) {
        ++b, ec(d[e]);
      }
      delete this.s[c];
      this.Ga--;
    }
  }
  return b;
};
P.prototype.ya = function(a, b, c, d) {
  a = this.s[a];
  var e = -1;
  a && (e = fc(a, b, c, d));
  return-1 < e ? a[e] : null;
};
function fc(a, b, c, d) {
  for (var e = 0;e < a.length;++e) {
    var g = a[e];
    if (!g.na && g.fa == b && g.capture == !!c && g.Oa == d) {
      return e;
    }
  }
  return-1;
}
;var hc = !y || y && 9 <= Ma, ic = y && !A("9");
!z || A("528");
Ba && A("1.9b") || y && A("8") || Aa && A("9.5") || z && A("528");
Ba && !A("8") || y && A("9");
function Q(a, b) {
  this.type = a;
  this.currentTarget = this.target = b;
}
f = Q.prototype;
f.u = function() {
};
f.Ja = function() {
};
f.ga = !1;
f.defaultPrevented = !1;
f.Yb = !0;
f.preventDefault = function() {
  this.defaultPrevented = !0;
  this.Yb = !1;
};
function jc(a) {
  jc[" "](a);
  return a;
}
jc[" "] = ca;
function kc(a, b) {
  Q.call(this, a ? a.type : "");
  this.relatedTarget = this.currentTarget = this.target = null;
  this.charCode = this.keyCode = this.button = this.screenY = this.screenX = this.clientY = this.clientX = this.offsetY = this.offsetX = 0;
  this.metaKey = this.shiftKey = this.altKey = this.ctrlKey = !1;
  this.Db = this.state = null;
  if (a) {
    var c = this.type = a.type;
    this.target = a.target || a.srcElement;
    this.currentTarget = b;
    var d = a.relatedTarget;
    if (d) {
      if (Ba) {
        var e;
        a: {
          try {
            jc(d.nodeName);
            e = !0;
            break a;
          } catch (g) {
          }
          e = !1;
        }
        e || (d = null);
      }
    } else {
      "mouseover" == c ? d = a.fromElement : "mouseout" == c && (d = a.toElement);
    }
    this.relatedTarget = d;
    this.offsetX = z || void 0 !== a.offsetX ? a.offsetX : a.layerX;
    this.offsetY = z || void 0 !== a.offsetY ? a.offsetY : a.layerY;
    this.clientX = void 0 !== a.clientX ? a.clientX : a.pageX;
    this.clientY = void 0 !== a.clientY ? a.clientY : a.pageY;
    this.screenX = a.screenX || 0;
    this.screenY = a.screenY || 0;
    this.button = a.button;
    this.keyCode = a.keyCode || 0;
    this.charCode = a.charCode || ("keypress" == c ? a.keyCode : 0);
    this.ctrlKey = a.ctrlKey;
    this.altKey = a.altKey;
    this.shiftKey = a.shiftKey;
    this.metaKey = a.metaKey;
    this.state = a.state;
    this.Db = a;
    a.defaultPrevented && this.preventDefault();
    delete this.ga;
  }
}
s(kc, Q);
kc.prototype.preventDefault = function() {
  kc.pa.preventDefault.call(this);
  var a = this.Db;
  if (a.preventDefault) {
    a.preventDefault();
  } else {
    if (a.returnValue = !1, ic) {
      try {
        if (a.ctrlKey || 112 <= a.keyCode && 123 >= a.keyCode) {
          a.keyCode = -1;
        }
      } catch (b) {
      }
    }
  }
};
kc.prototype.u = function() {
};
var lc = "closure_lm_" + (1E6 * Math.random() | 0), mc = {}, nc = 0;
function oc(a, b, c, d, e) {
  if (m(b)) {
    for (var g = 0;g < b.length;g++) {
      oc(a, b[g], c, d, e);
    }
    return null;
  }
  c = pc(c);
  if (bc(a)) {
    a = a.Ra(b, c, d, e);
  } else {
    if (!b) {
      throw Error("Invalid event type");
    }
    var g = !!d, h = qc(a);
    h || (a[lc] = h = new P(a));
    c = h.add(b, c, !1, d, e);
    c.Ua || (d = rc(), c.Ua = d, d.src = a, d.fa = c, a.addEventListener ? a.addEventListener(b, d, g) : a.attachEvent(b in mc ? mc[b] : mc[b] = "on" + b, d), nc++);
    a = c;
  }
  return a;
}
function rc() {
  var a = sc, b = hc ? function(c) {
    return a.call(b.src, b.fa, c);
  } : function(c) {
    c = a.call(b.src, b.fa, c);
    if (!c) {
      return c;
    }
  };
  return b;
}
function tc(a, b, c, d, e) {
  if (m(b)) {
    for (var g = 0;g < b.length;g++) {
      tc(a, b[g], c, d, e);
    }
  } else {
    c = pc(c), bc(a) ? a.vb(b, c, d, e) : a && (a = qc(a)) && (b = a.ya(b, c, !!d, e)) && uc(b);
  }
}
function uc(a) {
  if ("number" == typeof a || !a || a.na) {
    return!1;
  }
  var b = a.src;
  if (bc(b)) {
    return gc(b.W, a);
  }
  var c = a.type, d = a.Ua;
  b.removeEventListener ? b.removeEventListener(c, d, a.capture) : b.detachEvent && b.detachEvent(c in mc ? mc[c] : mc[c] = "on" + c, d);
  nc--;
  (c = qc(b)) ? (gc(c, a), 0 == c.Ga && (c.src = null, b[lc] = null)) : ec(a);
  return!0;
}
function vc(a, b, c, d) {
  var e = 1;
  if (a = qc(a)) {
    if (b = a.s[b]) {
      for (b = bb(b), a = 0;a < b.length;a++) {
        var g = b[a];
        g && g.capture == c && !g.na && (e &= !1 !== wc(g, d));
      }
    }
  }
  return Boolean(e);
}
function wc(a, b) {
  var c = a.fa, d = a.Oa || a.src;
  a.Ia && uc(a);
  return c.call(d, b);
}
function sc(a, b) {
  if (a.na) {
    return!0;
  }
  if (!hc) {
    var c = b || ba("window.event"), d = new kc(c, this), e = !0;
    if (!(0 > c.keyCode || void 0 != c.returnValue)) {
      a: {
        var g = !1;
        if (0 == c.keyCode) {
          try {
            c.keyCode = -1;
            break a;
          } catch (h) {
            g = !0;
          }
        }
        if (g || void 0 == c.returnValue) {
          c.returnValue = !0;
        }
      }
      c = [];
      for (g = d.currentTarget;g;g = g.parentNode) {
        c.push(g);
      }
      for (var g = a.type, k = c.length - 1;!d.ga && 0 <= k;k--) {
        d.currentTarget = c[k], e &= vc(c[k], g, !0, d);
      }
      for (k = 0;!d.ga && k < c.length;k++) {
        d.currentTarget = c[k], e &= vc(c[k], g, !1, d);
      }
    }
    return e;
  }
  return wc(a, new kc(b, this));
}
function qc(a) {
  a = a[lc];
  return a instanceof P ? a : null;
}
var xc = "__closure_events_fn_" + (1E9 * Math.random() >>> 0);
function pc(a) {
  return fa(a) ? a : a[xc] || (a[xc] = function(b) {
    return a.handleEvent(b);
  });
}
;function R() {
  O.call(this);
  this.W = new P(this);
  this.fc = this;
}
s(R, O);
R.prototype[ac] = !0;
f = R.prototype;
f.tb = null;
f.addEventListener = function(a, b, c, d) {
  oc(this, a, b, c, d);
};
f.removeEventListener = function(a, b, c, d) {
  tc(this, a, b, c, d);
};
f.dispatchEvent = function(a) {
  var b, c = this.tb;
  if (c) {
    for (b = [];c;c = c.tb) {
      b.push(c);
    }
  }
  var c = this.fc, d = a.type || a;
  if (n(a)) {
    a = new Q(a, c);
  } else {
    if (a instanceof Q) {
      a.target = a.target || c;
    } else {
      var e = a;
      a = new Q(d, c);
      Wa(a, e);
    }
  }
  var e = !0, g;
  if (b) {
    for (var h = b.length - 1;!a.ga && 0 <= h;h--) {
      g = a.currentTarget = b[h], e = yc(g, d, !0, a) && e;
    }
  }
  a.ga || (g = a.currentTarget = c, e = yc(g, d, !0, a) && e, a.ga || (e = yc(g, d, !1, a) && e));
  if (b) {
    for (h = 0;!a.ga && h < b.length;h++) {
      g = a.currentTarget = b[h], e = yc(g, d, !1, a) && e;
    }
  }
  return e;
};
f.u = function() {
  R.pa.u.call(this);
  this.W && this.W.Xa(void 0);
  this.tb = null;
};
f.Ra = function(a, b, c, d) {
  return this.W.add(String(a), b, !1, c, d);
};
f.vb = function(a, b, c, d) {
  return this.W.remove(String(a), b, c, d);
};
function yc(a, b, c, d) {
  b = a.W.s[String(b)];
  if (!b) {
    return!0;
  }
  b = bb(b);
  for (var e = !0, g = 0;g < b.length;++g) {
    var h = b[g];
    if (h && !h.na && h.capture == c) {
      var k = h.fa, u = h.Oa || h.src;
      h.Ia && gc(a.W, h);
      e = !1 !== k.call(u, d) && e;
    }
  }
  return e && !1 != d.Yb;
}
f.ya = function(a, b, c, d) {
  return this.W.ya(String(a), b, c, d);
};
function zc(a, b) {
  R.call(this);
  this.ea = a || 1;
  this.ra = b || l;
  this.ib = p(this.Gc, this);
  this.sb = q();
}
s(zc, R);
f = zc.prototype;
f.enabled = !1;
f.l = null;
f.setInterval = function(a) {
  this.ea = a;
  this.l && this.enabled ? (this.stop(), this.start()) : this.l && this.stop();
};
f.Gc = function() {
  if (this.enabled) {
    var a = q() - this.sb;
    0 < a && a < 0.8 * this.ea ? this.l = this.ra.setTimeout(this.ib, this.ea - a) : (this.l && (this.ra.clearTimeout(this.l), this.l = null), this.dispatchEvent(Ac), this.enabled && (this.l = this.ra.setTimeout(this.ib, this.ea), this.sb = q()));
  }
};
f.start = function() {
  this.enabled = !0;
  this.l || (this.l = this.ra.setTimeout(this.ib, this.ea), this.sb = q());
};
f.stop = function() {
  this.enabled = !1;
  this.l && (this.ra.clearTimeout(this.l), this.l = null);
};
f.u = function() {
  zc.pa.u.call(this);
  this.stop();
  delete this.ra;
};
var Ac = "tick";
function Bc(a, b, c) {
  if (fa(a)) {
    c && (a = p(a, c));
  } else {
    if (a && "function" == typeof a.handleEvent) {
      a = p(a.handleEvent, a);
    } else {
      throw Error("Invalid listener argument");
    }
  }
  return 2147483647 < b ? -1 : l.setTimeout(a, b || 0);
}
;function Cc() {
}
Cc.prototype.Ab = null;
function Dc(a) {
  var b;
  (b = a.Ab) || (b = {}, Ec(a) && (b[0] = !0, b[1] = !0), b = a.Ab = b);
  return b;
}
;var Fc;
function Gc() {
}
s(Gc, Cc);
function Hc(a) {
  return(a = Ec(a)) ? new ActiveXObject(a) : new XMLHttpRequest;
}
function Ec(a) {
  if (!a.Kb && "undefined" == typeof XMLHttpRequest && "undefined" != typeof ActiveXObject) {
    for (var b = ["MSXML2.XMLHTTP.6.0", "MSXML2.XMLHTTP.3.0", "MSXML2.XMLHTTP", "Microsoft.XMLHTTP"], c = 0;c < b.length;c++) {
      var d = b[c];
      try {
        return new ActiveXObject(d), a.Kb = d;
      } catch (e) {
      }
    }
    throw Error("Could not create ActiveXObject. ActiveX might be disabled, or MSXML might not be installed");
  }
  return a.Kb;
}
Fc = new Gc;
function Ic(a) {
  R.call(this);
  this.headers = new cb;
  this.gb = a || null;
  this.T = !1;
  this.fb = this.f = null;
  this.Mb = this.Qa = "";
  this.ka = 0;
  this.q = "";
  this.da = this.qb = this.Pa = this.nb = !1;
  this.Fa = 0;
  this.bb = null;
  this.Xb = Jc;
  this.cb = this.dc = !1;
}
s(Ic, R);
var Jc = "";
Ic.prototype.r = Tb("goog.net.XhrIo");
var Kc = /^https?$/i, Lc = ["POST", "PUT"];
f = Ic.prototype;
f.send = function(a, b, c, d) {
  if (this.f) {
    throw Error("[goog.net.XhrIo] Object is active with another request=" + this.Qa + "; newUri=" + a);
  }
  b = b ? b.toUpperCase() : "GET";
  this.Qa = a;
  this.q = "";
  this.ka = 0;
  this.Mb = b;
  this.nb = !1;
  this.T = !0;
  this.f = this.gb ? Hc(this.gb) : Hc(Fc);
  this.fb = this.gb ? Dc(this.gb) : Dc(Fc);
  this.f.onreadystatechange = p(this.Qb, this);
  try {
    M(this.r, S(this, "Opening Xhr")), this.qb = !0, this.f.open(b, a, !0), this.qb = !1;
  } catch (e) {
    M(this.r, S(this, "Error opening Xhr: " + e.message));
    Mc(this, e);
    return;
  }
  a = c || "";
  var g = this.headers.n();
  d && D(d, function(a, b) {
    g.set(b, a);
  });
  d = Za(g.ca());
  c = l.FormData && a instanceof l.FormData;
  !(0 <= Xa(Lc, b)) || d || c || g.set("Content-Type", "application/x-www-form-urlencoded;charset=utf-8");
  D(g, function(a, b) {
    this.f.setRequestHeader(b, a);
  }, this);
  this.Xb && (this.f.responseType = this.Xb);
  "withCredentials" in this.f && (this.f.withCredentials = this.dc);
  try {
    Nc(this), 0 < this.Fa && (this.cb = Oc(this.f), M(this.r, S(this, "Will abort after " + this.Fa + "ms if incomplete, xhr2 " + this.cb)), this.cb ? (this.f.timeout = this.Fa, this.f.ontimeout = p(this.qa, this)) : this.bb = Bc(this.qa, this.Fa, this)), M(this.r, S(this, "Sending request")), this.Pa = !0, this.f.send(a), this.Pa = !1;
  } catch (h) {
    M(this.r, S(this, "Send error: " + h.message)), Mc(this, h);
  }
};
function Oc(a) {
  return y && A(9) && "number" == typeof a.timeout && void 0 !== a.ontimeout;
}
function $a(a) {
  return "content-type" == a.toLowerCase();
}
f.qa = function() {
  "undefined" != typeof aa && this.f && (this.q = "Timed out after " + this.Fa + "ms, aborting", this.ka = 8, M(this.r, S(this, this.q)), this.dispatchEvent("timeout"), this.abort(8));
};
function Mc(a, b) {
  a.T = !1;
  a.f && (a.da = !0, a.f.abort(), a.da = !1);
  a.q = b;
  a.ka = 5;
  Pc(a);
  Qc(a);
}
function Pc(a) {
  a.nb || (a.nb = !0, a.dispatchEvent("complete"), a.dispatchEvent("error"));
}
f.abort = function(a) {
  this.f && this.T && (M(this.r, S(this, "Aborting")), this.T = !1, this.da = !0, this.f.abort(), this.da = !1, this.ka = a || 7, this.dispatchEvent("complete"), this.dispatchEvent("abort"), Qc(this));
};
f.u = function() {
  this.f && (this.T && (this.T = !1, this.da = !0, this.f.abort(), this.da = !1), Qc(this, !0));
  Ic.pa.u.call(this);
};
f.Qb = function() {
  this.mb || (this.qb || this.Pa || this.da ? Rc(this) : this.uc());
};
f.uc = function() {
  Rc(this);
};
function Rc(a) {
  if (a.T && "undefined" != typeof aa) {
    if (a.fb[1] && 4 == T(a) && 2 == Sc(a)) {
      M(a.r, S(a, "Local request error detected and ignored"));
    } else {
      if (a.Pa && 4 == T(a)) {
        Bc(a.Qb, 0, a);
      } else {
        if (a.dispatchEvent("readystatechange"), 4 == T(a)) {
          M(a.r, S(a, "Request complete"));
          a.T = !1;
          try {
            var b = Sc(a), c, d;
            a: {
              switch(b) {
                case 200:
                ;
                case 201:
                ;
                case 202:
                ;
                case 204:
                ;
                case 206:
                ;
                case 304:
                ;
                case 1223:
                  d = !0;
                  break a;
                default:
                  d = !1;
              }
            }
            if (!(c = d)) {
              var e;
              if (e = 0 === b) {
                var g = Ra(String(a.Qa))[1] || null;
                if (!g && self.location) {
                  var h = self.location.protocol, g = h.substr(0, h.length - 1)
                }
                e = !Kc.test(g ? g.toLowerCase() : "");
              }
              c = e;
            }
            if (c) {
              a.dispatchEvent("complete"), a.dispatchEvent("success");
            } else {
              a.ka = 6;
              var k;
              try {
                k = 2 < T(a) ? a.f.statusText : "";
              } catch (u) {
                M(a.r, "Can not get status: " + u.message), k = "";
              }
              a.q = k + " [" + Sc(a) + "]";
              Pc(a);
            }
          } finally {
            Qc(a);
          }
        }
      }
    }
  }
}
function Qc(a, b) {
  if (a.f) {
    Nc(a);
    var c = a.f, d = a.fb[0] ? ca : null;
    a.f = null;
    a.fb = null;
    b || a.dispatchEvent("ready");
    try {
      c.onreadystatechange = d;
    } catch (e) {
      (c = a.r) && c.J("Problem encountered resetting onreadystatechange: " + e.message, void 0);
    }
  }
}
function Nc(a) {
  a.f && a.cb && (a.f.ontimeout = null);
  "number" == typeof a.bb && (l.clearTimeout(a.bb), a.bb = null);
}
f.isActive = function() {
  return!!this.f;
};
function T(a) {
  return a.f ? a.f.readyState : 0;
}
function Sc(a) {
  try {
    return 2 < T(a) ? a.f.status : -1;
  } catch (b) {
    return(a = a.r) && a.Z("Can not get status: " + b.message, void 0), -1;
  }
}
function Tc(a) {
  try {
    return a.f ? a.f.responseText : "";
  } catch (b) {
    return M(a.r, "Can not get responseText: " + b.message), "";
  }
}
f.Ib = function() {
  return n(this.q) ? this.q : String(this.q);
};
function S(a, b) {
  return b + " [" + a.Mb + " " + a.Qa + " " + Sc(a) + "]";
}
;function Uc() {
  this.Wb = q();
}
new Uc;
Uc.prototype.set = function(a) {
  this.Wb = a;
};
Uc.prototype.reset = function() {
  this.set(q());
};
Uc.prototype.get = function() {
  return this.Wb;
};
function Vc(a) {
  O.call(this);
  this.e = a;
  this.j = {};
}
s(Vc, O);
var Wc = [];
f = Vc.prototype;
f.Ra = function(a, b, c, d) {
  m(b) || (Wc[0] = b, b = Wc);
  for (var e = 0;e < b.length;e++) {
    var g = oc(a, b[e], c || this.handleEvent, d || !1, this.e || this);
    if (!g) {
      break;
    }
    this.j[g.key] = g;
  }
  return this;
};
f.vb = function(a, b, c, d, e) {
  if (m(b)) {
    for (var g = 0;g < b.length;g++) {
      this.vb(a, b[g], c, d, e);
    }
  } else {
    c = c || this.handleEvent, e = e || this.e || this, c = pc(c), d = !!d, b = bc(a) ? a.ya(b, c, d, e) : a ? (a = qc(a)) ? a.ya(b, c, d, e) : null : null, b && (uc(b), delete this.j[b.key]);
  }
  return this;
};
f.Xa = function() {
  var a = this.j, b = uc, c;
  for (c in a) {
    b.call(void 0, a[c], c, a);
  }
  this.j = {};
};
f.u = function() {
  Vc.pa.u.call(this);
  this.Xa();
};
f.handleEvent = function() {
  throw Error("EventHandler.handleEvent not implemented");
};
function Xc(a, b, c) {
  O.call(this);
  this.pc = a;
  this.ea = b;
  this.e = c;
  this.jc = p(this.vc, this);
}
s(Xc, O);
f = Xc.prototype;
f.Za = !1;
f.Vb = 0;
f.l = null;
f.stop = function() {
  this.l && (l.clearTimeout(this.l), this.l = null, this.Za = !1);
};
f.u = function() {
  Xc.pa.u.call(this);
  this.stop();
};
f.vc = function() {
  this.l = null;
  this.Za && !this.Vb && (this.Za = !1, Yc(this));
};
function Yc(a) {
  a.l = Bc(a.jc, a.ea);
  a.pc.call(a.e);
}
;function U(a, b, c, d, e) {
  this.b = a;
  this.a = b;
  this.Y = c;
  this.B = d;
  this.Ea = e || 1;
  this.qa = Zc;
  this.ob = new Vc(this);
  this.Ta = new zc;
  this.Ta.setInterval($c);
}
f = U.prototype;
f.v = null;
f.F = !1;
f.ua = null;
f.xb = null;
f.Da = null;
f.sa = null;
f.U = null;
f.w = null;
f.X = null;
f.k = null;
f.Ha = 0;
f.K = null;
f.ta = null;
f.q = null;
f.g = -1;
f.Zb = !0;
f.$ = !1;
f.ma = 0;
f.Va = null;
var Zc = 45E3, $c = 250;
function ad(a, b) {
  switch(a) {
    case 0:
      return "Non-200 return code (" + b + ")";
    case 1:
      return "XMLHTTP failure (no data)";
    case 2:
      return "HttpConnection timeout";
    default:
      return "Unknown error";
  }
}
var bd = {}, dd = {};
function ed() {
  return!y || y && 10 <= Ma;
}
f = U.prototype;
f.S = function(a) {
  this.v = a;
};
f.setTimeout = function(a) {
  this.qa = a;
};
f.bc = function(a) {
  this.ma = a;
};
function fd(a, b, c) {
  a.sa = 1;
  a.U = H(b.n());
  a.X = c;
  a.Cb = !0;
  gd(a, null);
}
function hd(a, b, c, d, e) {
  a.sa = 1;
  a.U = H(b.n());
  a.X = null;
  a.Cb = c;
  e && (a.Zb = !1);
  gd(a, d);
}
function gd(a, b) {
  a.Da = q();
  id(a);
  a.w = a.U.n();
  rb(a.w, "t", a.Ea);
  a.Ha = 0;
  a.k = a.b.lb(a.b.$a() ? b : null);
  0 < a.ma && (a.Va = new Xc(p(a.ec, a, a.k), a.ma));
  a.ob.Ra(a.k, "readystatechange", a.Bc);
  var c;
  if (a.v) {
    c = a.v;
    var d = {}, e;
    for (e in c) {
      d[e] = c[e];
    }
    c = d;
  } else {
    c = {};
  }
  a.X ? (a.ta = "POST", c["Content-Type"] = "application/x-www-form-urlencoded", a.k.send(a.w, a.ta, a.X, c)) : (a.ta = "GET", a.Zb && !z && (c.Connection = "close"), a.k.send(a.w, a.ta, null, c));
  a.b.H(jd);
  if (d = a.X) {
    for (c = "", d = d.split("&"), e = 0;e < d.length;e++) {
      var g = d[e].split("=");
      if (1 < g.length) {
        var h = g[0], g = g[1], k = h.split("_");
        c = 2 <= k.length && "type" == k[1] ? c + (h + "=" + g + "&") : c + (h + "=redacted&");
      }
    }
  } else {
    c = null;
  }
  a.a.info("XMLHTTP REQ (" + a.B + ") [attempt " + a.Ea + "]: " + a.ta + "\n" + a.w + "\n" + c);
}
f.Bc = function(a) {
  a = a.target;
  var b = this.Va;
  b && 3 == T(a) ? (this.a.debug("Throttling readystatechange."), b.l || b.Vb ? b.Za = !0 : Yc(b)) : this.ec(a);
};
f.ec = function(a) {
  try {
    if (a == this.k) {
      a: {
        var b = T(this.k), c = this.k.ka, d = Sc(this.k);
        if (!ed() || z && !A("420+")) {
          if (4 > b) {
            break a;
          }
        } else {
          if (3 > b || 3 == b && !Aa && !Tc(this.k)) {
            break a;
          }
        }
        this.$ || 4 != b || 7 == c || (8 == c || 0 >= d ? this.b.H(kd) : this.b.H(ld));
        md(this);
        var e = Sc(this.k);
        this.g = e;
        var g = Tc(this.k);
        g || this.a.debug("No response text for uri " + this.w + " status " + e);
        this.F = 200 == e;
        this.a.info("XMLHTTP RESP (" + this.B + ") [ attempt " + this.Ea + "]: " + this.ta + "\n" + this.w + "\n" + b + " " + e);
        this.F ? (4 == b && V(this), this.Cb ? (nd(this, b, g), Aa && this.F && 3 == b && (this.ob.Ra(this.Ta, Ac, this.Ac), this.Ta.start())) : (Ub(this.a, this.B, g, null), od(this, g)), this.F && !this.$ && (4 == b ? this.b.la(this) : (this.F = !1, id(this)))) : (400 == e && 0 < g.indexOf("Unknown SID") ? (this.q = 3, W(), this.a.Z("XMLHTTP Unknown SID (" + this.B + ")")) : (this.q = 0, W(), this.a.Z("XMLHTTP Bad status " + e + " (" + this.B + ")")), V(this), pd(this));
      }
    } else {
      this.a.Z("Called back with an unexpected xmlhttp");
    }
  } catch (h) {
    this.a.debug("Failed call to OnXmlHttpReadyStateChanged_"), this.k && Tc(this.k) ? Wb(this.a, h, "ResponseText: " + Tc(this.k)) : Wb(this.a, h, "No response text");
  } finally {
  }
};
function nd(a, b, c) {
  for (var d = !0;!a.$ && a.Ha < c.length;) {
    var e = qd(a, c);
    if (e == dd) {
      4 == b && (a.q = 4, W(), d = !1);
      Ub(a.a, a.B, null, "[Incomplete Response]");
      break;
    } else {
      if (e == bd) {
        a.q = 4;
        W();
        Ub(a.a, a.B, c, "[Invalid Chunk]");
        d = !1;
        break;
      } else {
        Ub(a.a, a.B, e, null), od(a, e);
      }
    }
  }
  4 == b && 0 == c.length && (a.q = 1, W(), d = !1);
  a.F = a.F && d;
  d || (Ub(a.a, a.B, c, "[Invalid Chunked Response]"), V(a), pd(a));
}
f.Ac = function() {
  var a = T(this.k), b = Tc(this.k);
  this.Ha < b.length && (md(this), nd(this, a, b), this.F && 4 != a && id(this));
};
function qd(a, b) {
  var c = a.Ha, d = b.indexOf("\n", c);
  if (-1 == d) {
    return dd;
  }
  c = Number(b.substring(c, d));
  if (isNaN(c)) {
    return bd;
  }
  d += 1;
  if (d + c > b.length) {
    return dd;
  }
  var e = b.substr(d, c);
  a.Ha = d + c;
  return e;
}
function rd(a, b) {
  a.Da = q();
  id(a);
  var c = b ? window.location.hostname : "";
  a.w = a.U.n();
  G(a.w, "DOMAIN", c);
  G(a.w, "t", a.Ea);
  try {
    a.K = new ActiveXObject("htmlfile");
  } catch (d) {
    a.a.J("ActiveX blocked");
    V(a);
    a.q = 7;
    W();
    pd(a);
    return;
  }
  var e = "<html><body>";
  b && (e += '<script>document.domain="' + c + '"\x3c/script>');
  e += "</body></html>";
  a.K.open();
  a.K.write(e);
  a.K.close();
  a.K.parentWindow.m = p(a.yc, a);
  a.K.parentWindow.d = p(a.Ub, a, !0);
  a.K.parentWindow.rpcClose = p(a.Ub, a, !1);
  c = a.K.createElement("div");
  a.K.parentWindow.document.body.appendChild(c);
  c.innerHTML = '<iframe src="' + a.w + '"></iframe>';
  a.a.info("TRIDENT REQ (" + a.B + ") [ attempt " + a.Ea + "]: GET\n" + a.w);
  a.b.H(jd);
}
f.yc = function(a) {
  Y(p(this.xc, this, a), 0);
};
f.xc = function(a) {
  if (!this.$) {
    var b = this.a;
    b.info("TRIDENT TEXT (" + this.B + "): " + Vb(b, a));
    md(this);
    od(this, a);
    id(this);
  }
};
f.Ub = function(a) {
  Y(p(this.wc, this, a), 0);
};
f.wc = function(a) {
  this.$ || (this.a.info("TRIDENT TEXT (" + this.B + "): " + a ? "success" : "failure"), V(this), this.F = a, this.b.la(this), this.b.H(sd));
};
f.nc = function() {
  md(this);
  this.b.la(this);
};
f.cancel = function() {
  this.$ = !0;
  V(this);
};
function id(a) {
  a.xb = q() + a.qa;
  td(a, a.qa);
}
function td(a, b) {
  if (null != a.ua) {
    throw Error("WatchDog timer not null");
  }
  a.ua = Y(p(a.zc, a), b);
}
function md(a) {
  a.ua && (l.clearTimeout(a.ua), a.ua = null);
}
f.zc = function() {
  this.ua = null;
  var a = q();
  0 <= a - this.xb ? (this.F && this.a.J("Received watchdog timeout even though request loaded successfully"), this.a.info("TIMEOUT: " + this.w), 2 != this.sa && this.b.H(kd), V(this), this.q = 2, W(), pd(this)) : (this.a.Z("WatchDog timer called too early"), td(this, this.xb - a));
};
function pd(a) {
  a.b.Lb() || a.$ || a.b.la(a);
}
function V(a) {
  md(a);
  var b = a.Va;
  b && "function" == typeof b.Ja && b.Ja();
  a.Va = null;
  a.Ta.stop();
  a.ob.Xa();
  a.k && (b = a.k, a.k = null, b.abort(), b.Ja());
  a.K && (a.K = null);
}
f.Ib = function() {
  return this.q;
};
function od(a, b) {
  try {
    a.b.Rb(a, b), a.b.H(sd);
  } catch (c) {
    Wb(a.a, c, "Error in httprequest callback");
  }
}
;function ud(a, b, c, d, e) {
  (new N).debug("TestLoadImageWithRetries: " + e);
  if (0 == d) {
    c(!1);
  } else {
    var g = e || 0;
    d--;
    vd(a, b, function(e) {
      e ? c(!0) : l.setTimeout(function() {
        ud(a, b, c, d, g);
      }, g);
    });
  }
}
function vd(a, b, c) {
  function d(a, b) {
    return function() {
      try {
        e.debug("TestLoadImage: " + b), g.onload = null, g.onerror = null, g.onabort = null, g.ontimeout = null, l.clearTimeout(h), c(a);
      } catch (d) {
        Wb(e, d);
      }
    };
  }
  var e = new N;
  e.debug("TestLoadImage: loading " + a);
  var g = new Image, h = null;
  g.onload = d(!0, "loaded");
  g.onerror = d(!1, "error");
  g.onabort = d(!1, "abort");
  g.ontimeout = d(!1, "timeout");
  h = l.setTimeout(function() {
    if (g.ontimeout) {
      g.ontimeout();
    }
  }, b);
  g.src = a;
}
;function wd(a, b) {
  this.b = a;
  this.a = b;
  this.P = new Yb(0, !0);
}
f = wd.prototype;
f.v = null;
f.A = null;
f.Wa = !1;
f.cc = null;
f.La = null;
f.rb = null;
f.I = null;
f.c = null;
f.g = -1;
f.L = null;
f.va = null;
f.S = function(a) {
  this.v = a;
};
f.ac = function(a) {
  this.P = a;
};
f.kb = function(a) {
  this.I = a;
  a = xd(this.b, this.I);
  W();
  this.cc = q();
  var b = this.b.Gb;
  null != b ? (this.L = this.b.correctHostPrefix(b[0]), (this.va = b[1]) ? (this.c = 1, yd(this)) : (this.c = 2, zd(this))) : (rb(a, "MODE", "init"), this.A = new U(this, this.a, void 0, void 0, void 0), this.A.S(this.v), hd(this.A, a, !1, null, !0), this.c = 0);
};
function yd(a) {
  var b = Ad(a.b, a.va, "/mail/images/cleardot.gif");
  H(b);
  ud(b.toString(), 5E3, p(a.kc, a), 3, 2E3);
  a.H(jd);
}
f.kc = function(a) {
  if (a) {
    this.c = 2, zd(this);
  } else {
    W();
    var b = this.b;
    b.a.debug("Test Connection Blocked");
    b.g = b.V.g;
    Z(b, 9);
  }
  a && this.H(ld);
};
function zd(a) {
  a.a.debug("TestConnection: starting stage 2");
  var b = a.b.Dc;
  if (null != b) {
    a.a.debug("TestConnection: skipping stage 2, precomputed result is " + b ? "Buffered" : "Unbuffered"), W(), b ? (W(), Bd(a.b, a, !1)) : (W(), Bd(a.b, a, !0));
  } else {
    if (a.A = new U(a, a.a, void 0, void 0, void 0), a.A.S(a.v), b = Cd(a.b, a.L, a.I), W(), ed()) {
      rb(b, "TYPE", "xmlhttp"), hd(a.A, b, !1, a.L, !1);
    } else {
      rb(b, "TYPE", "html");
      var c = a.A;
      a = Boolean(a.L);
      c.sa = 3;
      c.U = H(b.n());
      rd(c, a);
    }
  }
}
f.lb = function(a) {
  return this.b.lb(a);
};
f.abort = function() {
  this.A && (this.A.cancel(), this.A = null);
  this.g = -1;
};
f.Lb = function() {
  return!1;
};
f.Rb = function(a, b) {
  this.g = a.g;
  if (0 == this.c) {
    if (this.a.debug("TestConnection: Got data for stage 1"), b) {
      try {
        var c = this.P.parse(b);
      } catch (d) {
        Wb(this.a, d);
        Dd(this.b, this);
        return;
      }
      this.L = this.b.correctHostPrefix(c[0]);
      this.va = c[1];
    } else {
      this.a.debug("TestConnection: Null responseText"), Dd(this.b, this);
    }
  } else {
    if (2 == this.c) {
      if (this.Wa) {
        W(), this.rb = q();
      } else {
        if ("11111" == b) {
          if (W(), this.Wa = !0, this.La = q(), c = this.La - this.cc, ed() || 500 > c) {
            this.g = 200, this.A.cancel(), this.a.debug("Test connection succeeded; using streaming connection"), W(), Bd(this.b, this, !0);
          }
        } else {
          W(), this.La = this.rb = q(), this.Wa = !1;
        }
      }
    }
  }
};
f.la = function() {
  this.g = this.A.g;
  if (!this.A.F) {
    this.a.debug("TestConnection: request failed, in state " + this.c), 0 == this.c ? W() : 2 == this.c && W(), Dd(this.b, this);
  } else {
    if (0 == this.c) {
      this.a.debug("TestConnection: request complete for initial check"), this.va ? (this.c = 1, yd(this)) : (this.c = 2, zd(this));
    } else {
      if (2 == this.c) {
        this.a.debug("TestConnection: request complete for stage 2");
        var a = !1;
        (a = ed() ? this.Wa : 200 > this.rb - this.La ? !1 : !0) ? (this.a.debug("Test connection succeeded; using streaming connection"), W(), Bd(this.b, this, !0)) : (this.a.debug("Test connection failed; not using streaming"), W(), Bd(this.b, this, !1));
      }
    }
  }
};
f.$a = function() {
  return this.b.$a();
};
f.isActive = function() {
  return this.b.isActive();
};
f.H = function(a) {
  this.b.H(a);
};
function Ed(a, b, c) {
  this.Bb = a || null;
  this.c = Fd;
  this.t = [];
  this.Q = [];
  this.a = new N;
  this.P = new Yb(0, !0);
  this.Gb = b || null;
  this.Dc = null != c ? c : null;
}
function Gd(a, b) {
  this.Ob = a;
  this.map = b;
}
f = Ed.prototype;
f.v = null;
f.xa = null;
f.p = null;
f.i = null;
f.I = null;
f.Ma = null;
f.zb = null;
f.L = null;
f.hc = !0;
f.Ba = 0;
f.sc = 0;
f.Ka = !1;
f.e = null;
f.G = null;
f.M = null;
f.aa = null;
f.V = null;
f.wb = null;
f.gc = !0;
f.za = -1;
f.Nb = -1;
f.g = -1;
f.ba = 0;
f.ha = 0;
f.ic = 5E3;
f.Cc = 1E4;
f.pb = 2;
f.Hb = 2E4;
f.ma = 0;
f.ab = !1;
f.ia = 8;
var Fd = 1, Hd = new R;
function Id(a) {
  Q.call(this, "statevent", a);
}
s(Id, Q);
function Jd(a, b) {
  Q.call(this, "timingevent", a);
  this.size = b;
}
s(Jd, Q);
var jd = 1, ld = 2, kd = 3, sd = 4;
function Kd(a) {
  Q.call(this, "serverreachability", a);
}
s(Kd, Q);
var Xb = "y2f%";
f = Ed.prototype;
f.kb = function(a, b, c, d, e) {
  this.a.debug("connect()");
  W();
  this.I = b;
  this.xa = c || {};
  d && void 0 !== e && (this.xa.OSID = d, this.xa.OAID = e);
  this.a.debug("connectTest_()");
  Ld(this) && (this.V = new wd(this, this.a), this.V.S(this.v), this.V.ac(this.P), this.V.kb(a));
};
f.disconnect = function() {
  this.a.debug("disconnect()");
  Md(this);
  if (3 == this.c) {
    var a = this.Ba++, b = this.Ma.n();
    G(b, "SID", this.Y);
    G(b, "RID", a);
    G(b, "TYPE", "terminate");
    Nd(this, b);
    a = new U(this, this.a, this.Y, a, void 0);
    a.sa = 2;
    a.U = H(b.n());
    b = new Image;
    b.src = a.U;
    b.onload = b.onerror = p(a.nc, a);
    a.Da = q();
    id(a);
  }
  Od(this);
};
function Md(a) {
  a.V && (a.V.abort(), a.V = null);
  a.i && (a.i.cancel(), a.i = null);
  a.M && (l.clearTimeout(a.M), a.M = null);
  Pd(a);
  a.p && (a.p.cancel(), a.p = null);
  a.G && (l.clearTimeout(a.G), a.G = null);
}
f.S = function(a) {
  this.v = a;
};
f.bc = function(a) {
  this.ma = a;
};
f.Lb = function() {
  return 0 == this.c;
};
f.ac = function(a) {
  this.P = a;
};
function Qd(a) {
  a.p || a.G || (a.G = Y(p(a.Tb, a), 0), a.ba = 0);
}
f.Tb = function(a) {
  this.G = null;
  this.a.debug("startForwardChannel_");
  if (Ld(this)) {
    if (this.c == Fd) {
      if (a) {
        this.a.J("Not supposed to retry the open");
      } else {
        this.a.debug("open_()");
        this.Ba = Math.floor(1E5 * Math.random());
        a = this.Ba++;
        var b = new U(this, this.a, "", a, void 0);
        b.S(this.v);
        var c = Rd(this), d = this.Ma.n();
        G(d, "RID", a);
        this.Bb && G(d, "CVER", this.Bb);
        Nd(this, d);
        fd(b, d, c);
        this.p = b;
        this.c = 2;
      }
    } else {
      3 == this.c && (a ? Sd(this, a) : 0 == this.t.length ? this.a.debug("startForwardChannel_ returned: nothing to send") : this.p ? this.a.J("startForwardChannel_ returned: connection already in progress") : (Sd(this), this.a.debug("startForwardChannel_ finished, sent request")));
    }
  }
};
function Sd(a, b) {
  var c, d;
  b ? 6 < a.ia ? (a.t = a.Q.concat(a.t), a.Q.length = 0, c = a.Ba - 1, d = Rd(a)) : (c = b.B, d = b.X) : (c = a.Ba++, d = Rd(a));
  var e = a.Ma.n();
  G(e, "SID", a.Y);
  G(e, "RID", c);
  G(e, "AID", a.za);
  Nd(a, e);
  c = new U(a, a.a, a.Y, c, a.ba + 1);
  c.S(a.v);
  c.setTimeout(Math.round(0.5 * a.Hb) + Math.round(0.5 * a.Hb * Math.random()));
  a.p = c;
  fd(c, e, d);
}
function Nd(a, b) {
  if (a.e) {
    var c = a.e.getAdditionalParams(a);
    c && D(c, function(a, c) {
      G(b, c, a);
    });
  }
}
function Rd(a) {
  var b = Math.min(a.t.length, 1E3), c = ["count=" + b], d;
  6 < a.ia && 0 < b ? (d = a.t[0].Ob, c.push("ofs=" + d)) : d = 0;
  for (var e = 0;e < b;e++) {
    var g = a.t[e].Ob, h = a.t[e].map, g = 6 >= a.ia ? e : g - d;
    try {
      D(h, function(a, b) {
        c.push("req" + g + "_" + b + "=" + encodeURIComponent(a));
      });
    } catch (k) {
      c.push("req" + g + "_type=" + encodeURIComponent("_badmap")), a.e && a.e.badMapError(a, h);
    }
  }
  a.Q = a.Q.concat(a.t.splice(0, b));
  return c.join("&");
}
function Td(a) {
  a.i || a.M || (a.yb = 1, a.M = Y(p(a.Sb, a), 0), a.ha = 0);
}
function Ud(a) {
  if (a.i || a.M) {
    return a.a.J("Request already in progress"), !1;
  }
  if (3 <= a.ha) {
    return!1;
  }
  a.a.debug("Going to retry GET");
  a.yb++;
  a.M = Y(p(a.Sb, a), Vd(a, a.ha));
  a.ha++;
  return!0;
}
f.Sb = function() {
  this.M = null;
  if (Ld(this)) {
    this.a.debug("Creating new HttpRequest");
    this.i = new U(this, this.a, this.Y, "rpc", this.yb);
    this.i.S(this.v);
    this.i.bc(this.ma);
    var a = this.zb.n();
    G(a, "RID", "rpc");
    G(a, "SID", this.Y);
    G(a, "CI", this.wb ? "0" : "1");
    G(a, "AID", this.za);
    Nd(this, a);
    if (ed()) {
      G(a, "TYPE", "xmlhttp"), hd(this.i, a, !0, this.L, !1);
    } else {
      G(a, "TYPE", "html");
      var b = this.i, c = Boolean(this.L);
      b.sa = 3;
      b.U = H(a.n());
      rd(b, c);
    }
    this.a.debug("New Request created");
  }
};
function Ld(a) {
  if (a.e) {
    var b = a.e.okToMakeRequest(a);
    if (0 != b) {
      return a.a.debug("Handler returned error code from okToMakeRequest"), Z(a, b), !1;
    }
  }
  return!0;
}
function Bd(a, b, c) {
  a.a.debug("Test Connection Finished");
  a.wb = a.gc && c;
  a.g = b.g;
  a.a.debug("connectChannel_()");
  a.lc(Fd, 0);
  a.Ma = xd(a, a.I);
  Qd(a);
}
function Dd(a, b) {
  a.a.debug("Test Connection Failed");
  a.g = b.g;
  Z(a, 2);
}
f.Rb = function(a, b) {
  if (0 != this.c && (this.i == a || this.p == a)) {
    if (this.g = a.g, this.p == a && 3 == this.c) {
      if (7 < this.ia) {
        var c;
        try {
          c = this.P.parse(b);
        } catch (d) {
          c = null;
        }
        if (m(c) && 3 == c.length) {
          var e = c;
          if (0 == e[0]) {
            a: {
              if (this.a.debug("Server claims our backchannel is missing."), this.M) {
                this.a.debug("But we are currently starting the request.");
              } else {
                if (this.i) {
                  if (this.i.Da + 3E3 < this.p.Da) {
                    Pd(this), this.i.cancel(), this.i = null;
                  } else {
                    break a;
                  }
                } else {
                  this.a.Z("We do not have a BackChannel established");
                }
                Ud(this);
                W();
              }
            }
          } else {
            this.Nb = e[1], c = this.Nb - this.za, 0 < c && (e = e[2], this.a.debug(e + " bytes (in " + c + " arrays) are outstanding on the BackChannel"), 37500 > e && this.wb && 0 == this.ha && !this.aa && (this.aa = Y(p(this.tc, this), 6E3)));
          }
        } else {
          this.a.debug("Bad POST response data returned"), Z(this, 11);
        }
      } else {
        b != Xb && (this.a.debug("Bad data returned - missing/invald magic cookie"), Z(this, 11));
      }
    } else {
      if (this.i == a && Pd(this), !/^[\s\xa0]*$/.test(b)) {
        c = this.P.parse(b);
        for (var e = this.e && this.e.channelHandleMultipleArrays ? [] : null, g = 0;g < c.length;g++) {
          var h = c[g];
          this.za = h[0];
          h = h[1];
          2 == this.c ? "c" == h[0] ? (this.Y = h[1], this.L = this.correctHostPrefix(h[2]), h = h[3], this.ia = null != h ? h : 6, this.c = 3, this.e && this.e.channelOpened(this), this.zb = Cd(this, this.L, this.I), Td(this)) : "stop" == h[0] && Z(this, 7) : 3 == this.c && ("stop" == h[0] ? (e && 0 != e.length && (this.e.channelHandleMultipleArrays(this, e), e.length = 0), Z(this, 7)) : "noop" != h[0] && (e ? e.push(h) : this.e && this.e.channelHandleArray(this, h)), this.ha = 0);
        }
        e && 0 != e.length && this.e.channelHandleMultipleArrays(this, e);
      }
    }
  }
};
f.correctHostPrefix = function(a) {
  return this.hc ? this.e ? this.e.correctHostPrefix(a) : a : null;
};
f.tc = function() {
  null != this.aa && (this.aa = null, this.i.cancel(), this.i = null, Ud(this), W());
};
function Pd(a) {
  null != a.aa && (l.clearTimeout(a.aa), a.aa = null);
}
f.la = function(a) {
  this.a.debug("Request complete");
  var b;
  if (this.i == a) {
    Pd(this), this.i = null, b = 2;
  } else {
    if (this.p == a) {
      this.p = null, b = 1;
    } else {
      return;
    }
  }
  this.g = a.g;
  if (0 != this.c) {
    if (a.F) {
      1 == b ? (q(), Hd.dispatchEvent(new Jd(Hd, a.X ? a.X.length : 0)), Qd(this), this.Q.length = 0) : Td(this);
    } else {
      var c = a.Ib();
      if (3 == c || 7 == c || 0 == c && 0 < this.g) {
        this.a.debug("Not retrying due to error type");
      } else {
        this.a.debug("Maybe retrying, last error: " + ad(c, this.g));
        var d;
        if (d = 1 == b) {
          this.p || this.G ? (this.a.J("Request already in progress"), d = !1) : this.c == Fd || this.ba >= (this.Ka ? 0 : this.pb) ? d = !1 : (this.a.debug("Going to retry POST"), this.G = Y(p(this.Tb, this, a), Vd(this, this.ba)), this.ba++, d = !0);
        }
        if (d || 2 == b && Ud(this)) {
          return;
        }
        this.a.debug("Exceeded max number of retries");
      }
      this.a.debug("Error: HTTP request failed");
      switch(c) {
        case 1:
          Z(this, 5);
          break;
        case 4:
          Z(this, 10);
          break;
        case 3:
          Z(this, 6);
          break;
        case 7:
          Z(this, 12);
          break;
        default:
          Z(this, 2);
      }
    }
  }
};
function Vd(a, b) {
  var c = a.ic + Math.floor(Math.random() * a.Cc);
  a.isActive() || (a.a.debug("Inactive channel"), c *= 2);
  return c * b;
}
f.lc = function(a) {
  if (!(0 <= Xa(arguments, this.c))) {
    throw Error("Unexpected channel state: " + this.c);
  }
};
function Z(a, b) {
  a.a.info("Error code " + b);
  if (2 == b || 9 == b) {
    var c = null;
    a.e && (c = a.e.getNetworkTestImageUri(a));
    var d = p(a.Fc, a);
    c || (c = new E("//www.google.com/images/cleardot.gif"), H(c));
    vd(c.toString(), 1E4, d);
  } else {
    W();
  }
  Wd(a, b);
}
f.Fc = function(a) {
  a ? (this.a.info("Successfully pinged google.com"), W()) : (this.a.info("Failed to ping google.com"), W(), Wd(this, 8));
};
function Wd(a, b) {
  a.a.debug("HttpChannel: error - " + b);
  a.c = 0;
  a.e && a.e.channelError(a, b);
  Od(a);
  Md(a);
}
function Od(a) {
  a.c = 0;
  a.g = -1;
  if (a.e) {
    if (0 == a.Q.length && 0 == a.t.length) {
      a.e.channelClosed(a);
    } else {
      a.a.debug("Number of undelivered maps, pending: " + a.Q.length + ", outgoing: " + a.t.length);
      var b = bb(a.Q), c = bb(a.t);
      a.Q.length = 0;
      a.t.length = 0;
      a.e.channelClosed(a, b, c);
    }
  }
}
function xd(a, b) {
  var c = Ad(a, null, b);
  a.a.debug("GetForwardChannelUri: " + c);
  return c;
}
function Cd(a, b, c) {
  b = Ad(a, a.$a() ? b : null, c);
  a.a.debug("GetBackChannelUri: " + b);
  return b;
}
function Ad(a, b, c) {
  var d = tb(c);
  if ("" != d.ja) {
    b && gb(d, b + "." + d.ja), hb(d, d.Ca);
  } else {
    var e = window.location, d = ub(e.protocol, b ? b + "." + e.hostname : e.hostname, e.port, c)
  }
  a.xa && D(a.xa, function(a, b) {
    G(d, b, a);
  });
  G(d, "VER", a.ia);
  Nd(a, d);
  return d;
}
f.lb = function(a) {
  if (a && !this.ab) {
    throw Error("Can't create secondary domain capable XhrIo object.");
  }
  a = new Ic;
  a.dc = this.ab;
  return a;
};
f.isActive = function() {
  return!!this.e && this.e.isActive(this);
};
function Y(a, b) {
  if (!fa(a)) {
    throw Error("Fn must not be null and must be a function");
  }
  return l.setTimeout(function() {
    a();
  }, b);
}
f.H = function() {
  Hd.dispatchEvent(new Kd(Hd));
};
function W() {
  Hd.dispatchEvent(new Id(Hd));
}
f.$a = function() {
  return this.ab || !ed();
};
function Xd() {
}
f = Xd.prototype;
f.channelHandleMultipleArrays = null;
f.okToMakeRequest = function() {
  return 0;
};
f.channelOpened = function() {
};
f.channelHandleArray = function() {
};
f.channelError = function() {
};
f.channelClosed = function() {
};
f.getAdditionalParams = function() {
  return{};
};
f.getNetworkTestImageUri = function() {
  return null;
};
f.isActive = function() {
  return!0;
};
f.badMapError = function() {
};
f.correctHostPrefix = function(a) {
  return a;
};
var $, Yd;
Yd = {0:"Ok", 4:"User is logging out", 6:"Unknown session ID", 7:"Stopped by server", 8:"General network error", 2:"Request failed", 9:"Blocked by a network administrator", 5:"No data from server", 10:"Got bad data from the server", 11:"Got a bad response from the server"};
$ = function(a, b) {
  var c, d, e, g, h, k, u, K, v, r, Ka, w, X, cd;
  if (!(this instanceof $)) {
    return new $(a, b);
  }
  r = this;
  a || (a = "channel");
  a.match(/:\/\//) && a.replace(/^ws/, "http");
  b || (b = {});
  m(b || "string" === typeof b) && (b = {});
  K = b.reconnectTime || 3E3;
  c = b.extraHeaders || null;
  d = b.extraParams || null;
  null !== b.affinity && (d || (d = {}), b.affinityParam || (b.affinityParam = "a"), this.affinity = b.affinity || sa(), d[b.affinityParam] = this.affinity);
  X = function(a) {
    r.readyState = r.readyState = a;
  };
  X(this.CLOSED);
  w = null;
  k = null != (cd = b.prev) ? cd.Ec : void 0;
  e = function(a, b, c, d, e) {
    try {
      return "function" === typeof r[a] ? r[a](c, d, e) : void 0;
    } catch (g) {
      throw "undefined" !== typeof console && null !== console && console.error(g.stack), g;
    }
  };
  g = new Xd;
  g.channelOpened = function() {
    k = w;
    X($.OPEN);
    return e("onopen");
  };
  h = null;
  g.channelError = function(a, b) {
    var c;
    c = Yd[b];
    h = b;
    r.readyState !== $.CLOSED && X($.hb);
    return e("onerror", 0, c, b);
  };
  v = null;
  g.channelClosed = function(a, c, d) {
    var g;
    if (r.readyState !== $.CLOSED) {
      return w = null, a = h ? Yd[h] : "Closed", X($.CLOSED), b.reconnect && 7 !== h && 0 !== h && (g = 6 === h ? 0 : K, clearTimeout(v), v = setTimeout(u, g)), e("onclose", 0, a, c, d), h = null;
    }
  };
  g.channelHandleArray = function(a, b) {
    return e("onmessage", 0, {type:"message", data:b});
  };
  u = function() {
    if (w) {
      throw Error("Reconnect() called from invalid state");
    }
    X($.CONNECTING);
    e("onconnecting");
    clearTimeout(v);
    r.Ec = w = new Ed(b.appVersion, null != k ? k.Gb : void 0);
    b.crossDomainXhr && (w.ab = !0);
    w.e = g;
    c && w.S(c);
    h = null;
    if (b.failFast) {
      var t = w;
      t.Ka = !0;
      t.a.info("setFailFast: true");
      (t.p || t.G) && t.ba > (t.Ka ? 0 : t.pb) && (t.a.info("Retry count " + t.ba + " > new maxRetries " + (t.Ka ? 0 : t.pb) + ". Fail immediately!"), t.p ? (t.p.cancel(), t.la(t.p)) : (l.clearTimeout(t.G), t.G = null, Z(t, 2)));
    }
    return w.kb("" + a + "/test", "" + a + "/bind", d, null != k ? k.Y : void 0, null != k ? k.za : void 0);
  };
  this.open = function() {
    if (r.readyState !== r.CLOSED) {
      throw Error("Already open");
    }
    return u();
  };
  this.close = function() {
    clearTimeout(v);
    h = 0;
    if (r.readyState !== $.CLOSED) {
      return X($.hb), w.disconnect();
    }
  };
  this.sendMap = Ka = function(a) {
    var b;
    if ((b = r.readyState) !== $.hb && b !== $.CLOSED) {
      b = w;
      if (0 == b.c) {
        throw Error("Invalid operation: sending map when state is closed");
      }
      1E3 == b.t.length && b.a.J("Already have 1000 queued maps upon queueing " + yb(a));
      b.t.push(new Gd(b.sc++, a));
      2 != b.c && 3 != b.c || Qd(b);
    }
  };
  this.send = function(a) {
    return "string" === typeof a ? Ka({_S:a}) : Ka({JSON:yb(a)});
  };
  u();
};
$.prototype.canSendWhileConnecting = $.canSendWhileConnecting = !0;
$.prototype.canSendJSON = $.canSendJSON = !0;
$.prototype.CONNECTING = $.CONNECTING = $.CONNECTING = 0;
$.prototype.OPEN = $.OPEN = $.OPEN = 1;
$.prototype.CLOSING = $.CLOSING = $.hb = 2;
$.prototype.CLOSED = $.CLOSED = $.CLOSED = 3;
("undefined" !== typeof exports && null !== exports ? exports : window).BCSocket = $;

})();

},{}],4:[function(require,module,exports){
var pSlice = Array.prototype.slice;
var Object_keys = typeof Object.keys === 'function'
    ? Object.keys
    : function (obj) {
        var keys = [];
        for (var key in obj) keys.push(key);
        return keys;
    }
;

var deepEqual = module.exports = function (actual, expected) {
  // enforce Object.is +0 !== -0
  if (actual === 0 && expected === 0) {
    return areZerosEqual(actual, expected);

  // 7.1. All identical values are equivalent, as determined by ===.
  } else if (actual === expected) {
    return true;

  } else if (actual instanceof Date && expected instanceof Date) {
    return actual.getTime() === expected.getTime();

  } else if (isNumberNaN(actual)) {
    return isNumberNaN(expected);

  // 7.3. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (typeof actual != 'object' && typeof expected != 'object') {
    return actual == expected;

  // 7.4. For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
};

function isUndefinedOrNull(value) {
  return value === null || value === undefined;
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function isNumberNaN(value) {
  // NaN === NaN -> false
  return typeof value == 'number' && value !== value;
}

function areZerosEqual(zeroA, zeroB) {
  // (1 / +0|0) -> Infinity, but (1 / -0) -> -Infinity and (Infinity !== -Infinity)
  return (1 / zeroA) === (1 / zeroB);
}

function objEquiv(a, b) {
  if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
    return false;

  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return deepEqual(a, b);
  }
  try {
    var ka = Object_keys(a),
        kb = Object_keys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!deepEqual(a[key], b[key])) return false;
  }
  return true;
}

},{}],5:[function(require,module,exports){
exports.contexts = require('./lib/contexts');
exports.expressions = require('./lib/expressions');
exports.operatorFns = require('./lib/operatorFns');
exports.templates = require('./lib/templates');

},{"./lib/contexts":6,"./lib/expressions":7,"./lib/operatorFns":8,"./lib/templates":9}],6:[function(require,module,exports){
exports.ContextMeta = ContextMeta;
exports.Context = Context;

function noop() {}

// TODO:
// Implement removeItemContext

function ContextMeta() {
  this.addBinding = noop;
  this.removeBinding = noop;
  this.removeNode = noop;
  this.addItemContext = noop;
  this.removeItemContext = noop;
  this.views = null;
  this.idNamespace = '';
  this.idCount = 0;
  this.pending = [];
  this.pauseCount = 0;
}

function Context(meta, controller, parent, unbound, expression, item, view, attributes, hooks, initHooks) {
  // Required properties //

  // Properties which are globally inherited for the entire page
  this.meta = meta;
  // The page or component. Must have a `model` property with a `data` property
  this.controller = controller;

  // Optional properties //

  // Containing context
  this.parent = parent;
  // Boolean set to true when bindings should be ignored
  this.unbound = unbound;
  // The expression for a block
  this.expression = expression;
  // Alias name for the given expression
  this.alias = expression && expression.meta && expression.meta.as;
  // Alias name for the index or iterated key
  this.keyAlias = expression && expression.meta && expression.meta.keyAs;

  // For Context::eachChild
  // The index of the each at render time
  this.item = item;

  // For Context::viewChild
  // Reference to the current view
  this.view = view;
  // Attribute values passed to the view instance
  this.attributes = attributes;
  // MarkupHooks to be called after insert into DOM of component
  this.hooks = hooks;
  // MarkupHooks to be called immediately before init of component
  this.initHooks = initHooks;

  // Used in EventModel
  this._id = null;
}

Context.prototype.id = function() {
  var count = ++this.meta.idCount;
  return this.meta.idNamespace + '_' + count.toString(36);
};

Context.prototype.addBinding = function(binding) {
  // Don't add bindings that wrap list items. Only their outer range is needed
  if (binding.itemFor) return;
  var expression = binding.template.expression;
  // Don't rerender in unbound sections
  if (expression ? expression.isUnbound(this) : this.unbound) return;
  // Don't rerender to changes in a with expression
  if (expression && expression.meta && expression.meta.blockType === 'with') return;
  this.meta.addBinding(binding);
};
Context.prototype.removeBinding = function(binding) {
  this.meta.removeBinding(binding);
};
Context.prototype.removeNode = function(node) {
  this.meta.removeNode(node);
};

Context.prototype.child = function(expression) {
  // Set or inherit the binding mode
  var blockType = expression.meta && expression.meta.blockType;
  var unbound = (blockType === 'unbound') ? true :
    (blockType === 'bound') ? false :
    this.unbound;
  return new Context(this.meta, this.controller, this, unbound, expression);
};

Context.prototype.componentChild = function(component) {
  return new Context(this.meta, component, this, this.unbound);
};

// Make a context for an item in an each block
Context.prototype.eachChild = function(expression, index) {
  var context = new Context(this.meta, this.controller, this, this.unbound, expression, index);
  this.meta.addItemContext(context);
  return context;
};

Context.prototype.viewChild = function(view, attributes, hooks, initHooks) {
  return new Context(this.meta, this.controller, this, this.unbound, null, null, view, attributes, hooks, initHooks);
};

Context.prototype.forRelative = function(expression) {
  var context = this;
  while (context && context.expression === expression || context.view) {
    context = context.parent;
  }
  return context;
};

// Returns the closest context which defined the named alias
Context.prototype.forAlias = function(alias) {
  var context = this;
  while (context) {
    if (context.alias === alias || context.keyAlias === alias) return context;
    context = context.parent;
  }
};

// Returns the closest containing context for a view attribute name or nothing
Context.prototype.forAttribute = function(attribute) {
  var context = this;
  while (context) {
    // Find the closest context associated with a view
    if (context.view) {
      var attributes = context.attributes;
      if (!attributes) return;
      if (attributes.hasOwnProperty(attribute)) return context;
      // If the attribute isn't found, but the attributes inherit, continue
      // looking in the next closest view context
      if (!attributes.inherit && !attributes.extend) return;
    }
    context = context.parent;
  }
};

Context.prototype.forViewParent = function() {
  var context = this;
  while (context) {
    // Find the closest view
    if (context.view) return context.parent;
    context = context.parent;
  }
};

Context.prototype.getView = function() {
  var context = this;
  while (context) {
    // Find the closest view
    if (context.view) return context.view;
    context = context.parent;
  }
};

// Returns the `this` value for a context
Context.prototype.get = function() {
  return (this.expression) ? this.expression.get(this) : this.controller.model.data;
};

Context.prototype.pause = function() {
  this.meta.pauseCount++;
};

Context.prototype.unpause = function() {
  if (--this.meta.pauseCount) return;
  this.flush();
};

Context.prototype.flush = function() {
  var pending = this.meta.pending;
  var len = pending.length;
  if (!len) return;
  this.meta.pending = [];
  for (var i = 0; i < len; i++) {
    pending[i]();
  }
};

Context.prototype.queue = function(cb) {
  this.meta.pending.push(cb);
};

},{}],7:[function(require,module,exports){
(function (global){
var serializeObject = require('serialize-object');
var operatorFns = require('./operatorFns');
var templates = require('./templates');

exports.lookup = lookup;
exports.templateTruthy = templateTruthy;
exports.pathSegments = pathSegments;
exports.renderValue = renderValue;
exports._outerDependency = outerDependency;
exports.ExpressionMeta = ExpressionMeta;

exports.Expression = Expression;
exports.LiteralExpression = LiteralExpression;
exports.PathExpression = PathExpression;
exports.RelativePathExpression = RelativePathExpression;
exports.AliasPathExpression = AliasPathExpression;
exports.AttributePathExpression = AttributePathExpression;
exports.BracketsExpression = BracketsExpression;
exports.FnExpression = FnExpression;
exports.OperatorExpression = OperatorExpression;
exports.NewExpression = NewExpression;
exports.SequenceExpression = SequenceExpression;
exports.ScopedModelExpression = ScopedModelExpression;

function lookup(segments, value) {
  if (!segments) return value;

  for (var i = 0, len = segments.length; i < len; i++) {
    if (value == null) return value;
    value = value[segments[i]];
  }
  return value;
}

// Unlike JS, `[]` is falsey. Otherwise, truthiness is the same as JS
function templateTruthy(value) {
  return (Array.isArray(value)) ? value.length > 0 : !!value;
}

function pathSegments(segments) {
  var result = [];
  for (var i = 0; i < segments.length; i++) {
    var segment = segments[i];
    result[i] = (typeof segment === 'object') ? segment.item : segment;
  }
  return result;
}

function renderValue(value, context) {
  return (typeof value !== 'object') ? value :
    (value instanceof templates.Template) ? renderTemplate(value, context) :
    (Array.isArray(value)) ? renderArray(value, context) :
    renderObject(value, context);
}
function renderTemplate(value, context) {
  var i = 1000;
  while (value instanceof templates.Template) {
    if (--i < 0) throw new Error('Maximum template render passes exceeded');
    value = value.get(context, true);
  }
  return value;
}
function renderArray(array, context) {
  for (var i = 0, len = array.length; i < len; i++) {
    if (hasTemplateProperty(array[i])) {
      return renderArrayProperties(array, context);
    }
  }
  return array;
}
function renderObject(object, context) {
  return (hasTemplateProperty(object)) ?
    renderObjectProperties(object, context) : object;
}
function hasTemplateProperty(object) {
  if (!object) return false;
  if (global.Node && object instanceof global.Node) return false;
  for (var key in object) {
    if (object[key] instanceof templates.Template) return true;
  }
  return false;
}
function renderArrayProperties(array, context) {
  var out = [];
  for (var i = 0, len = array.length; i < len; i++) {
    var item = renderObject(array[i], context);
    out.push(item);
  }
  return out;
}
function renderObjectProperties(object, context) {
  var out = {};
  for (var key in object) {
    var value = object[key];
    out[key] = renderTemplate(value, context);
  }
  return out;
}

function ExpressionMeta(source, blockType, isEnd, as, keyAs, unescaped, bindType, valueType) {
  this.source = source;
  this.blockType = blockType;
  this.isEnd = isEnd;
  this.as = as;
  this.keyAs = keyAs;
  this.unescaped = unescaped;
  this.bindType = bindType;
  this.valueType = valueType;
}
ExpressionMeta.prototype.module = 'expressions';
ExpressionMeta.prototype.type = 'ExpressionMeta';
ExpressionMeta.prototype.serialize = function() {
  return serializeObject.instance(
    this
  , this.source
  , this.blockType
  , this.isEnd
  , this.as
  , this.keyAs
  , this.unescaped
  , this.bindType
  , this.valueType
  );
};

function Expression(meta) {
  this.meta = meta;
}
Expression.prototype.module = 'expressions';
Expression.prototype.type = 'Expression';
Expression.prototype.serialize = function() {
  return serializeObject.instance(this, this.meta);
};
Expression.prototype.toString = function() {
  return this.meta && this.meta.source;
};
Expression.prototype.truthy = function(context) {
  var blockType = this.meta.blockType;
  if (blockType === 'else') return true;
  var value = this.get(context, true);
  var truthy = templateTruthy(value);
  return (blockType === 'unless') ? !truthy : truthy;
};
Expression.prototype.get = function() {};
// Return the expression's segment list with context objects
Expression.prototype.resolve = function() {};
// Return a list of segment lists or null
Expression.prototype.dependencies = function() {};
// Return the pathSegments that the expression currently resolves to or null
Expression.prototype.pathSegments = function(context) {
  var segments = this.resolve(context);
  return segments && pathSegments(segments);
};
Expression.prototype.set = function(context, value) {
  var segments = this.pathSegments(context);
  if (!segments) throw new Error('Expression does not support setting');
  context.controller.model._set(segments, value);
};
Expression.prototype._getPatch = function(context, value) {
  if (this.meta && this.meta.blockType) {
    value = renderTemplate(value, context);
  }
  return (context && context.expression === this && context.item != null) ?
    value && value[context.item] : value;
};
Expression.prototype._resolvePatch = function(context, segments) {
  return (context && context.expression === this && context.item != null) ?
    segments.concat(context) : segments;
};
Expression.prototype.isUnbound = function(context) {
  // If the template being rendered has an explicit bindType keyword, such as:
  // {{unbound #item.text}}
  var bindType = this.meta && this.meta.bindType;
  if (bindType === 'unbound') return true;
  if (bindType === 'bound') return false;
  // Otherwise, inherit from the context
  return context.unbound;
};


function LiteralExpression(value, meta) {
  this.value = value;
  this.meta = meta;
}
LiteralExpression.prototype = new Expression();
LiteralExpression.prototype.type = 'LiteralExpression';
LiteralExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.value, this.meta);
};
LiteralExpression.prototype.get = function(context) {
  return this._getPatch(context, this.value);
};

function PathExpression(segments, meta) {
  this.segments = segments;
  this.meta = meta;
}
PathExpression.prototype = new Expression();
PathExpression.prototype.type = 'PathExpression';
PathExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.segments, this.meta);
};
PathExpression.prototype.get = function(context) {
  var value = lookup(this.segments, context.controller.model.data);
  return this._getPatch(context, value);
};
PathExpression.prototype.resolve = function(context) {
  var segments = concat(context.controller._scope, this.segments);
  return this._resolvePatch(context, segments);
};
PathExpression.prototype.dependencies = function(context, forInnerPath) {
  return outerDependency(this, context, forInnerPath);
};

function RelativePathExpression(segments, meta) {
  this.segments = segments;
  this.meta = meta;
}
RelativePathExpression.prototype = new Expression();
RelativePathExpression.prototype.type = 'RelativePathExpression';
RelativePathExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.segments, this.meta);
};
RelativePathExpression.prototype.get = function(context) {
  var relativeContext = context.forRelative(this);
  var value = relativeContext.get();
  if (this.segments.length) {
    value = renderTemplate(value, relativeContext);
    value = lookup(this.segments, value);
  }
  return this._getPatch(context, value);
};
RelativePathExpression.prototype.resolve = function(context) {
  var relativeContext = context.forRelative(this);
  var base = (relativeContext.expression) ?
    relativeContext.expression.resolve(relativeContext) :
    [];
  if (!base) return;
  var segments = base.concat(this.segments);
  return this._resolvePatch(context, segments);
};
RelativePathExpression.prototype.dependencies = function(context, forInnerPath) {
  // Return inner dependencies from our ancestor
  // (e.g., {{ with foo[bar] }} ... {{ this.x }} has 'bar' as a dependency.)
  var relativeContext = context.forRelative(this);
  var inner = relativeContext.expression &&
    relativeContext.expression.dependencies(relativeContext, true);
  var outer = outerDependency(this, context, forInnerPath);
  return concat(outer, inner);
};

function AliasPathExpression(alias, segments, meta) {
  this.alias = alias;
  this.segments = segments;
  this.meta = meta;
}
AliasPathExpression.prototype = new Expression();
AliasPathExpression.prototype.type = 'AliasPathExpression';
AliasPathExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.alias, this.segments, this.meta);
};
AliasPathExpression.prototype.get = function(context) {
  var aliasContext = context.forAlias(this.alias);
  if (!aliasContext) return;
  if (aliasContext.keyAlias === this.alias) {
    return aliasContext.item;
  }
  var value = aliasContext.get();
  if (this.segments.length) {
    value = renderTemplate(value, aliasContext);
    value = lookup(this.segments, value);
  }
  return this._getPatch(context, value);
};
AliasPathExpression.prototype.resolve = function(context) {
  var aliasContext = context.forAlias(this.alias);
  if (!aliasContext) return;
  if (aliasContext.keyAlias === this.alias) return;
  var base = aliasContext.expression.resolve(aliasContext);
  if (!base) return;
  var segments = base.concat(this.segments);
  return this._resolvePatch(context, segments);
};
AliasPathExpression.prototype.dependencies = function(context, forInnerPath) {
  var aliasContext = context.forAlias(this.alias);
  if (!aliasContext) return;
  if (aliasContext.keyAlias === this.alias) {
    // For keyAliases, use a dependency of the entire list, so that it will
    // always update when the list changes in any way. This is over-binding,
    // but would otherwise be much more complex
    var base = aliasContext.expression.resolve(aliasContext.parent);
    return [base];
  }
  var inner = aliasContext.expression.dependencies(aliasContext, true);
  var outer = outerDependency(this, context, forInnerPath);
  return concat(outer, inner);
};

function AttributePathExpression(attribute, segments, meta) {
  this.attribute = attribute;
  this.segments = segments;
  this.meta = meta;
}
AttributePathExpression.prototype = new Expression();
AttributePathExpression.prototype.type = 'AttributePathExpression';
AttributePathExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.attribute, this.segments, this.meta);
};
AttributePathExpression.prototype.get = function(context) {
  var attributeContext = context.forAttribute(this.attribute);
  if (!attributeContext) return;
  var value = attributeContext.attributes[this.attribute];
  if (this.segments.length) {
    value = renderTemplate(value, attributeContext);
    value = lookup(this.segments, value);
  }
  return this._getPatch(context, value);
};
AttributePathExpression.prototype.resolve = function(context) {
  var attributeContext = context.forAttribute(this.attribute);
  // Attributes are either a ParentWrapper or a literal value
  var value = attributeContext && attributeContext.attributes[this.attribute];
  var base = value && (typeof value.resolve === 'function') &&
    value.resolve(attributeContext);
  if (!base) return;
  var segments = base.concat(this.segments);
  return this._resolvePatch(context, segments);
};
AttributePathExpression.prototype.dependencies = function(context, forInnerPath) {
  var attributeContext = context.forAttribute(this.attribute);
  // Attributes are either a ParentWrapper or a literal value
  var value = attributeContext && attributeContext.attributes[this.attribute];
  var inner = value && (typeof value.dependencies === 'function') &&
    value.dependencies(attributeContext, true);
  var outer = outerDependency(this, context, forInnerPath);
  return concat(outer, inner);
};

function BracketsExpression(before, inside, afterSegments, meta) {
  this.before = before;
  this.inside = inside;
  this.afterSegments = afterSegments;
  this.meta = meta;
}
BracketsExpression.prototype = new Expression();
BracketsExpression.prototype.type = 'BracketsExpression';
BracketsExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.before, this.inside, this.afterSegments, this.meta);
};
BracketsExpression.prototype.get = function(context) {
  var inside = this.inside.get(context);
  if (inside == null) return;
  var before = this.before.get(context);
  if (!before) return;
  var base = before[inside];
  var value = (this.afterSegments) ? lookup(this.afterSegments, base) : base;
  return this._getPatch(context, value);
};
BracketsExpression.prototype.resolve = function(context) {
  // Get and split the current value of the expression inside the brackets
  var inside = this.inside.get(context);
  if (inside == null) return;

  // Concat the before, inside, and optional after segments
  var base = this.before.resolve(context);
  if (!base) return;
  var segments = (this.afterSegments) ?
    base.concat(inside, this.afterSegments) :
    base.concat(inside);
  return this._resolvePatch(context, segments);
};
BracketsExpression.prototype.dependencies = function(context, forInnerPath) {
  var before = this.before.dependencies(context, true);
  var inner = this.inside.dependencies(context);
  var outer = outerDependency(this, context, forInnerPath);
  return concat(concat(outer, inner), before);
};

function FnExpression(segments, args, afterSegments, meta) {
  this.segments = segments;
  this.args = args;
  this.afterSegments = afterSegments;
  this.meta = meta;
  var parentSegments = segments && segments.slice();
  this.lastSegment = parentSegments && parentSegments.pop();
  this.parentSegments = (parentSegments && parentSegments.length) ? parentSegments : null;
}
FnExpression.prototype = new Expression();
FnExpression.prototype.type = 'FnExpression';
FnExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.segments, this.args, this.afterSegments, this.meta);
};
FnExpression.prototype.get = function(context) {
  var value = this.apply(context);
  // Lookup property underneath computed value if needed
  if (this.afterSegments) {
    value = lookup(this.afterSegments, value);
  }
  return this._getPatch(context, value);
};
FnExpression.prototype.apply = function(context, extraInputs) {
  var parent = this._lookupParent(context);
  var fn = parent[this.lastSegment];
  var getFn = fn.get || fn;
  var out = this._applyFn(getFn, context, extraInputs, parent);
  return out;
};
FnExpression.prototype._lookupParent = function(context) {
  // Lookup function on current controller
  var controller = context.controller;
  var segments = this.parentSegments;
  var parent = (segments) ? lookup(segments, controller) : controller;
  if (parent && parent[this.lastSegment]) return parent;
  // Otherwise lookup function on page
  var page = controller.page;
  if (controller !== page) {
    parent = (segments) ? lookup(segments, page) : page;
    if (parent && parent[this.lastSegment]) return parent;
  }
  // Otherwise lookup function on global
  parent = (segments) ? lookup(segments, global) : global;
  if (parent && parent[this.lastSegment]) return parent;
  // Throw if not found
  throw new Error('Function not found for: ' + this.segments.join('.'));
};
FnExpression.prototype._getInputs = function(context) {
  var inputs = [];
  for (var i = 0, len = this.args.length; i < len; i++) {
    var value = this.args[i].get(context);
    inputs.push(renderValue(value, context));
  }
  return inputs;
};
FnExpression.prototype._applyFn = function(fn, context, extraInputs, thisArg) {
  // Apply if there are no path inputs
  if (!this.args) {
    return (extraInputs) ?
      fn.apply(thisArg, extraInputs) :
      fn.call(thisArg);
  }
  // Otherwise, get the current value for path inputs and apply
  var inputs = this._getInputs(context);
  if (extraInputs) {
    for (var i = 0, len = extraInputs.length; i < len; i++) {
      inputs.push(extraInputs[i]);
    }
  }
  return fn.apply(thisArg, inputs);
};
FnExpression.prototype.dependencies = function(context) {
  var dependencies = [];
  if (!this.args) return dependencies;
  for (var i = 0, len = this.args.length; i < len; i++) {
    var argDependencies = this.args[i].dependencies(context);
    var firstDependency = argDependencies && argDependencies[0];
    if (!firstDependency) continue;
    if (firstDependency[firstDependency.length - 1] !== '*') {
      argDependencies[0] = argDependencies[0].concat('*');
    }
    for (var j = 0, jLen = argDependencies.length; j < jLen; j++) {
      dependencies.push(argDependencies[j]);
    }
  }
  return dependencies;
};
FnExpression.prototype.set = function(context, value) {
  var controller = context.controller;
  var fn, parent;
  while (controller) {
    parent = (this.parentSegments) ?
      lookup(this.parentSegments, controller) :
      controller;
    fn = parent && parent[this.lastSegment];
    if (fn) break;
    controller = controller.parent;
  }
  var setFn = fn && fn.set;
  if (!setFn) throw new Error('No setter function for: ' + this.segments.join('.'));
  var inputs = this._getInputs(context);
  inputs.unshift(value);
  var out = setFn.apply(parent, inputs);
  for (var i in out) {
    this.args[i].set(context, out[i]);
  }
};

function NewExpression(segments, args, afterSegments, meta) {
  FnExpression.call(this, segments, args, afterSegments, meta);
}
NewExpression.prototype = new FnExpression();
NewExpression.prototype.type = 'NewExpression';
NewExpression.prototype._applyFn = function(Fn, context) {
  // Apply if there are no path inputs
  if (!this.args) return new Fn();
  // Otherwise, get the current value for path inputs and apply
  var inputs = this._getInputs(context);
  inputs.unshift(null);
  return new (Fn.bind.apply(Fn, inputs))();
};

function OperatorExpression(name, args, afterSegments, meta) {
  this.name = name;
  this.args = args;
  this.afterSegments = afterSegments;
  this.meta = meta;
  this.getFn = operatorFns.get[name];
  this.setFn = operatorFns.set[name];
}
OperatorExpression.prototype = new FnExpression();
OperatorExpression.prototype.type = 'OperatorExpression';
OperatorExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.name, this.args, this.afterSegments, this.meta);
};
OperatorExpression.prototype.apply = function(context) {
  var inputs = this._getInputs(context);
  return this.getFn.apply(null, inputs);
};
OperatorExpression.prototype.set = function(context, value) {
  var inputs = this._getInputs(context);
  inputs.unshift(value);
  var out = this.setFn.apply(null, inputs);
  for (var i in out) {
    this.args[i].set(context, out[i]);
  }
};

function SequenceExpression(args, afterSegments, meta) {
  this.args = args;
  this.afterSegments = afterSegments;
  this.meta = meta;
}
SequenceExpression.prototype = new OperatorExpression();
SequenceExpression.prototype.type = 'SequenceExpression';
SequenceExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.args, this.afterSegments, this.meta);
};
SequenceExpression.prototype.name = ',';
SequenceExpression.prototype.getFn = operatorFns.get[','];
SequenceExpression.prototype.resolve = function(context) {
  var last = this.args[this.args.length - 1];
  return last.resolve(context);
};
SequenceExpression.prototype.dependencies = function(context, forInnerPath) {
  var dependencies = [];
  for (var i = 0, len = this.args.length; i < len; i++) {
    var argDependencies = this.args[i].dependencies(context, forInnerPath);
    for (var j = 0, jLen = argDependencies.length; j < jLen; j++) {
      dependencies.push(argDependencies[j]);
    }
  }
  return dependencies;
};

function ScopedModelExpression(expression, meta) {
  this.expression = expression;
  this.meta = meta;
}
ScopedModelExpression.prototype = new Expression();
ScopedModelExpression.prototype.type = 'ScopedModelExpression';
ScopedModelExpression.prototype.serialize = function() {
  return serializeObject.instance(this, this.expression, this.meta);
};
// Return a scoped model instead of the value
ScopedModelExpression.prototype.get = function(context) {
  var segments = this.pathSegments(context);
  if (!segments) return;
  return context.controller.model.scope(segments.join('.'));
};
// Delegate other methods to the inner expression
ScopedModelExpression.prototype.resolve = function(context) {
  return this.expression.resolve(context);
};
ScopedModelExpression.prototype.dependencies = function(context, forInnerPath) {
  return this.expression.dependencies(context, forInnerPath);
};
ScopedModelExpression.prototype.pathSegments = function(context) {
  return this.expression.pathSegments(context);
};
ScopedModelExpression.prototype.set = function(context, value) {
  return this.expression.set(context, value);
};

function outerDependency(expression, context, forInnerPath) {
  if (forInnerPath) return;
  var val = expression.resolve(context);
  if (typeof val === 'undefined') return;
  return [val];
}

function concat(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a.concat(b);
}

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./operatorFns":8,"./templates":9,"serialize-object":71}],8:[function(require,module,exports){
// `-` and `+` can be either unary or binary, so all unary operators are
// postfixed with `U` to differentiate

exports.get = {
  // Unary operators
  '!U': function(value) {
    return !value;
  }
, '-U': function(value) {
    return -value;
  }
, '+U': function(value) {
    return +value;
  }
, '~U': function(value) {
    return ~value;
  }
, 'typeofU': function(value) {
    return typeof value;
  }
  // Binary operators
, '||': function(left, right) {
    return left || right;
  }
, '&&': function(left, right) {
    return left && right;
  }
, '|': function(left, right) {
    return left | right;
  }
, '^': function(left, right) {
    return left ^ right;
  }
, '&': function(left, right) {
    return left & right;
  }
, '==': function(left, right) {
    return left == right; // jshint ignore:line
  }
, '!=': function(left, right) {
    return left != right; // jshint ignore:line
  }
, '===': function(left, right) {
    return left === right;
  }
, '!==': function(left, right) {
    return left !== right;
  }
, '<': function(left, right) {
    return left < right;
  }
, '>': function(left, right) {
    return left > right;
  }
, '<=': function(left, right) {
    return left <= right;
  }
, '>=': function(left, right) {
    return left >= right;
  }
, 'instanceof': function(left, right) {
    return left instanceof right;
  }
, 'in': function(left, right) {
    return left in right;
  }
, '<<': function(left, right) {
    return left << right;
  }
, '>>': function(left, right) {
    return left >> right;
  }
, '>>>': function(left, right) {
    return left >>> right;
  }
, '+': function(left, right) {
    return left + right;
  }
, '-': function(left, right) {
    return left - right;
  }
, '*': function(left, right) {
    return left * right;
  }
, '/': function(left, right) {
    return left / right;
  }
, '%': function(left, right) {
    return left % right;
  }
  // Conditional operator
, '?': function(test, consequent, alternate) {
    return (test) ? consequent : alternate;
  }
, // Sequence
  ',': function() {
    return arguments[arguments.length - 1];
  }
  // Array literal
, '[]': function() {
    return Array.prototype.slice.call(arguments);
  }
  // Object literal
, '{}': function() {
    var value = {};
    for (var i = 0, len = arguments.length; i < len; i += 2) {
      var key = arguments[i];
      value[key] = arguments[i + 1];
    }
    return value;
  }
};

exports.set = {
  // Unary operators
  '!U': function(value) {
    return [!value];
  }
, '-U': function(value) {
    return [-value];
  }
  // Binary operators
, '==': function(value, left, right) {
    if (value) return [right];
  }
, '===': function(value, left, right) {
    if (value) return [right];
  }
, 'in': function(value, left, right) {
    right[left] = true;
    return {1: right};
  }
, '+': function(value, left, right) {
    return [value - right];
  }
, '-': function(value, left, right) {
    return [value + right];
  }
, '*': function(value, left, right) {
    return [value / right];
  }
, '/': function(value, left, right) {
    return [value * right];
  }
};

},{}],9:[function(require,module,exports){
var saddle = require('saddle');
var serializeObject = require('serialize-object');

(function() {
  for (var key in saddle) {
    exports[key] = saddle[key];
  }
})();

exports.View = View;
exports.ViewInstance = ViewInstance;
exports.DynamicViewInstance = DynamicViewInstance;
exports.ParentWrapper = ParentWrapper;

exports.Views = Views;

exports.MarkupHook = MarkupHook;
exports.ElementOn = ElementOn;
exports.ComponentOn = ComponentOn;
exports.ComponentMarker = ComponentMarker;
exports.AsProperty = AsProperty;
exports.AsObject = AsObject;
exports.AsObjectComponent = AsObjectComponent;
exports.AsArray = AsArray;
exports.AsArrayComponent = AsArrayComponent;

exports.emptyTemplate = new saddle.Template([]);

// Add ::isUnbound to Template && Binding
saddle.Template.prototype.isUnbound = function(context) {
  return context.unbound;
};
saddle.Binding.prototype.isUnbound = function() {
  return this.template.expression.isUnbound(this.context);
};

// Add Template::resolve
saddle.Template.prototype.resolve = function() {};

// The Template::dependencies method is specific to how Derby bindings work,
// so extend all of the Saddle Template types here
saddle.Template.prototype.dependencies = function(context) {
  return getArrayDependencies(this.content, context);
};
saddle.Doctype.prototype.dependencies = function() {};
saddle.Text.prototype.dependencies = function() {};
saddle.DynamicText.prototype.dependencies = function(context) {
  return getDependencies(this.expression, context);
};
saddle.Comment.prototype.dependencies = function() {};
saddle.DynamicComment.prototype.dependencies = function(context) {
  return getDependencies(this.expression, context);
};
saddle.Element.prototype.dependencies = function(context) {
  var items = getMapDependencies(this.attributes, context);
  return getArrayDependencies(this.content, context, items);
};
saddle.Block.prototype.dependencies = function(context) {
  var items = getDependencies(this.expression, context);
  return getArrayDependencies(this.content, context, items);
};
saddle.ConditionalBlock.prototype.dependencies = function(context) {
  var items = getArrayDependencies(this.expressions, context);
  return getArrayOfArrayDependencies(this.contents, context, items);
};
saddle.EachBlock.prototype.dependencies = function(context) {
  var items = getDependencies(this.expression, context);
  items = getArrayDependencies(this.content, context, items);
  return getArrayDependencies(this.elseContent, context, items);
};
saddle.Attribute.prototype.dependencies = function() {};
saddle.DynamicAttribute.prototype.dependencies = function(context) {
  return getDependencies(this.expression, context);
};

function getArrayOfArrayDependencies(expressions, context, items) {
  if (!expressions) return items;
  for (var i = 0, len = expressions.length; i < len; i++) {
    items = getArrayDependencies(expressions[i], context, items);
  }
  return items;
}
function getArrayDependencies(expressions, context, items) {
  if (!expressions) return items;
  for (var i = 0, len = expressions.length; i < len; i++) {
    items = getDependencies(expressions[i], context, items);
  }
  return items;
}
function getMapDependencies(expressions, context, items) {
  if (!expressions) return items;
  for (var key in expressions) {
    items = getDependencies(expressions[key], context, items);
  }
  return items;
}
function getDependencies(expression, context, items) {
  var dependencies = expression && expression.dependencies(context);
  if (!dependencies) return items;
  for (var i = 0, len = dependencies.length; i < len; i++) {
    items || (items = []);
    items.push(dependencies[i]);
  }
  return items;
}

function ViewAttributesMap(source) {
  var items = source.split(/\s+/);
  for (var i = 0, len = items.length; i < len; i++) {
    this[items[i]] = true;
  }
}
function ViewArraysMap(source) {
  var items = source.split(/\s+/);
  for (var i = 0, len = items.length; i < len; i++) {
    var item = items[i].split('/');
    this[item[0]] = item[1] || item[0];
  }
}
function View(views, name, source, options) {
  this.views = views;
  this.name = name;
  this.source = source;
  this.options = options;

  var nameSegments = (this.name || '').split(':');
  var lastSegment = nameSegments.pop();
  this.namespace = nameSegments.join(':');
  this.registeredName = (lastSegment === 'index') ? this.namespace : this.name;

  this.attributesMap = options && options.attributes &&
    new ViewAttributesMap(options.attributes);
  this.arraysMap = options && options.arrays &&
    new ViewArraysMap(options.arrays);
  // The empty string is considered true for easier HTML attribute parsing
  this.unminified = options && (options.unminified || options.unminified === '');
  this.string = options && (options.string || options.string === '');
  this.literal = options && (options.literal || options.literal === '');
  this.template = null;
  this.componentFactory = null;
}
View.prototype = Object.create(saddle.Template.prototype);
View.prototype.type = 'View';
View.prototype.serialize = function() {
  return null;
};
View.prototype._isComponent = function(context) {
  return this.componentFactory &&
    context.attributes && !context.attributes.extend;
};
View.prototype._initComponent = function(context) {
  return (this._isComponent(context)) ?
    this.componentFactory.init(context) : context;
};
View.prototype._queueCreate = function(context, viewContext) {
  if (this._isComponent(context)) {
    var componentFactory = this.componentFactory;
    context.queue(function queuedCreate() {
      componentFactory.create(viewContext);
    });

    if (!context.hooks) return;
    context.queue(function queuedComponentHooks() {
      // Kick off hooks if view instance specified `on` or `as` attributes
      for (var i = 0, len = context.hooks.length; i < len; i++) {
        context.hooks[i].emit(context, viewContext.controller);
      }
    });
  }
};
View.prototype.get = function(context, unescaped) {
  var viewContext = this._initComponent(context);
  var template = this.template || this.parse();
  return template.get(viewContext, unescaped);
};
View.prototype.getFragment = function(context, binding) {
  var viewContext = this._initComponent(context);
  var template = this.template || this.parse();
  var fragment = template.getFragment(viewContext, binding);
  this._queueCreate(context, viewContext);
  return fragment;
};
View.prototype.appendTo = function(parent, context) {
  var viewContext = this._initComponent(context);
  var template = this.template || this.parse();
  template.appendTo(parent, viewContext);
  this._queueCreate(context, viewContext);
};
View.prototype.attachTo = function(parent, node, context) {
  var viewContext = this._initComponent(context);
  var template = this.template || this.parse();
  var node = template.attachTo(parent, node, viewContext);
  this._queueCreate(context, viewContext);
  return node;
};
View.prototype.dependencies = function(context) {
  var template = this.template || this.parse();
  return template.dependencies(context);
};
View.prototype.parse = function() {
  this._parse();
  if (this.componentFactory) {
    var hooks = [new ComponentMarker()];
    var marker = new saddle.Comment(this.name, hooks);
    this.template.content.unshift(marker);
  }
  return this.template;
};
// View.prototype._parse is defined in parsing.js, so that it doesn't have to
// be included in the client if templates are all parsed server-side
View.prototype._parse = function() {
  throw new Error('View parsing not available');
};

function ViewInstance(name, attributes, hooks, initHooks) {
  this.name = name;
  this.attributes = attributes;
  this.hooks = hooks;
  this.initHooks = initHooks;
  this.view = null;
}
ViewInstance.prototype = Object.create(saddle.Template.prototype);
ViewInstance.prototype.type = 'ViewInstance';
ViewInstance.prototype.serialize = function() {
  return serializeObject.instance(this, this.name, this.attributes, this.hooks, this.initHooks);
};
ViewInstance.prototype.get = function(context, unescaped) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks, this.initHooks);
  return view.get(viewContext, unescaped);
};
ViewInstance.prototype.getFragment = function(context, binding) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks, this.initHooks);
  return view.getFragment(viewContext, binding);
};
ViewInstance.prototype.appendTo = function(parent, context) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks, this.initHooks);
  view.appendTo(parent, viewContext);
};
ViewInstance.prototype.attachTo = function(parent, node, context) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks, this.initHooks);
  return view.attachTo(parent, node, viewContext);
};
ViewInstance.prototype.dependencies = function(context) {
  var view = this._find(context);
  var viewContext = context.viewChild(view, this.attributes, this.hooks, this.initHooks);
  return view.dependencies(viewContext);
};
ViewInstance.prototype._find = function(context) {
  if (this.view) return this.view;
  var contextView = context.getView();
  var namespace = contextView && contextView.namespace;
  this.view = context.meta.views.find(this.name, namespace);
  if (!this.view) {
    var message = context.meta.views.findErrorMessage(this.name, contextView);
    throw new Error(message);
  }
  return this.view;
};

function DynamicViewInstance(nameExpression, attributes, hooks, initHooks) {
  this.nameExpression = nameExpression;
  this.attributes = attributes;
  this.hooks = hooks;
  this.initHooks = initHooks;
}
DynamicViewInstance.prototype = Object.create(ViewInstance.prototype);
DynamicViewInstance.prototype.type = 'DynamicViewInstance';
DynamicViewInstance.prototype.serialize = function() {
  return serializeObject.instance(this, this.nameExpression, this.attributes, this.hooks, this.initHooks);
};
DynamicViewInstance.prototype._find = function(context) {
  var name = this.nameExpression.get(context);
  var contextView = context.getView();
  var namespace = contextView && contextView.namespace;
  var view = name && context.meta.views.find(name, namespace);
  return view || exports.emptyTemplate;
};

function ParentWrapper(template, expression) {
  this.template = template;
  this.expression = expression;
}
ParentWrapper.prototype = Object.create(saddle.Template.prototype);
ParentWrapper.prototype.type = 'ParentWrapper';
ParentWrapper.prototype.serialize = function() {
  return serializeObject.instance(this, this.template, this.expression);
};
ParentWrapper.prototype.get = function(context, unescaped) {
  return (this.expression || this.template).get(context.forViewParent(), unescaped);
};
ParentWrapper.prototype.getFragment = function(context, binding) {
  return this.template.getFragment(context.forViewParent(), binding);
};
ParentWrapper.prototype.appendTo = function(parent, context) {
  this.template.appendTo(parent, context.forViewParent());
};
ParentWrapper.prototype.attachTo = function(parent, node, context) {
  return this.template.attachTo(parent, node, context.forViewParent());
};
ParentWrapper.prototype.resolve = function(context) {
  return this.expression && this.expression.resolve(context.forViewParent());
};
ParentWrapper.prototype.dependencies = function(context, forInnerPath) {
  return (this.expression || this.template).dependencies(context.forViewParent(), forInnerPath);
};

function ViewsMap() {}
function Views() {
  this.nameMap = new ViewsMap();
  this.tagMap = new ViewsMap();
  // TODO: elementMap is deprecated and should be removed with Derby 0.6.0
  this.elementMap = this.tagMap;
}
Views.prototype.find = function(name, namespace) {
  var map = this.nameMap;

  // Exact match lookup
  var exactName = (namespace) ? namespace + ':' + name : name;
  var match = map[exactName];
  if (match) return match;

  // Relative lookup
  var segments = name.split(':');
  var segmentsDepth = segments.length;
  if (namespace) segments = namespace.split(':').concat(segments);
  // Iterate through segments, leaving the `segmentsDepth` segments and
  // removing the second to `segmentsDepth` segment to traverse up the
  // namespaces. Decrease `segmentsDepth` if not found and repeat again.
  while (segmentsDepth > 0) {
    var testSegments = segments.slice();
    while (testSegments.length > segmentsDepth) {
      testSegments.splice(-1 - segmentsDepth, 1);
      var testName = testSegments.join(':');
      var match = map[testName];
      if (match) return match;
    }
    segmentsDepth--;
  }
};
Views.prototype.register = function(name, source, options) {
  var mapName = name.replace(/:index$/, '');
  var view = this.nameMap[mapName];
  if (view) {
    // Recreate the view if it already exists. We re-apply the constructor
    // instead of creating a new view object so that references to object
    // can be cached after finding the first time
    var componentFactory = view.componentFactory;
    View.call(view, this, name, source, options);
    view.componentFactory = componentFactory;
  } else {
    view = new View(this, name, source, options);
  }
  this.nameMap[mapName] = view;
  // TODO: element is deprecated and should be removed with Derby 0.6.0
  var tagName = options && (options.tag || options.element);
  if (tagName) this.tagMap[tagName] = view;
  return view;
};
Views.prototype.serialize = function(options) {
  var out = 'function(derbyTemplates, views) {' +
    'var expressions = derbyTemplates.expressions;' +
    'var templates = derbyTemplates.templates;';
  for (var name in this.nameMap) {
    var view = this.nameMap[name];
    if (options && !options.server && view.options && view.options.serverOnly) continue;
    var template = view.template || view.parse();
    out += 'views.register(' + serializeObject.args([
      view.name
    , (options && options.minify) ? null : view.source
    , (hasKeys(view.options)) ? view.options : null
    ]) + ').template = ' + template.serialize() + ';';
  }
  return out + '}';
};
Views.prototype.findErrorMessage = function(name, contextView) {
  var names = Object.keys(this.nameMap);
  var message = 'Cannot find view "' + name + '" in' +
    [''].concat(names).join('\n  ') + '\n';
  if (contextView) {
    message += '\nWithin template "' + contextView.name + '":\n' + contextView.source;
  }
  return message;
};


function MarkupHook() {}
MarkupHook.prototype.module = saddle.Template.prototype.module;

function ElementOn(name, expression) {
  this.name = name;
  this.expression = expression;
}
ElementOn.prototype = Object.create(MarkupHook.prototype);
ElementOn.prototype.type = 'ElementOn';
ElementOn.prototype.serialize = function() {
  return serializeObject.instance(this, this.name, this.expression);
};
ElementOn.prototype.emit = function(context, element) {
  var elementOn = this;
  if (this.name === 'create') {
    this.apply(context, element);

  } else if (this.name === 'destroy') {
    var destroyListeners = element.$destroyListeners || (element.$destroyListeners = []);
    destroyListeners.push(function elementOnDestroy() {
      elementOn.apply(context, element);
    });

  } else {
    element.addEventListener(this.name, function elementOnListener(event) {
      return elementOn.apply(context, element, event);
    }, false);
  }
};
ElementOn.prototype.apply = function(context, element, event) {
  var modelData = context.controller.model.data;
  modelData.$event = event;
  modelData.$element = element;
  var out = this.expression.apply(context);
  delete modelData.$event;
  delete modelData.$element;
  return out;
};

function ComponentOn(name, expression) {
  this.name = name;
  this.expression = expression;
}
ComponentOn.prototype = Object.create(MarkupHook.prototype);
ComponentOn.prototype.type = 'ComponentOn';
ComponentOn.prototype.serialize = function() {
  return serializeObject.instance(this, this.name, this.expression);
};
ComponentOn.prototype.emit = function(context, component) {
  var expression = this.expression;
  component.on(this.name, function componentOnListener() {
    var args = arguments.length && Array.prototype.slice.call(arguments);
    return expression.apply(context, args);
  });
};

function ComponentMarker() {}
ComponentMarker.prototype = Object.create(MarkupHook.prototype);
ComponentMarker.prototype.type = 'ComponentMarker';
ComponentMarker.prototype.serialize = function() {
  return serializeObject.instance(this);
};
ComponentMarker.prototype.emit = function(context, node) {
  node.$component = context.controller;
  context.controller.markerNode = node;
};

function AsProperty(segments) {
  this.segments = segments;
  this.lastSegment = segments.pop();
}
AsProperty.prototype = Object.create(MarkupHook.prototype);
AsProperty.prototype.type = 'AsProperty';
AsProperty.prototype.serialize = function() {
  var segments = this.segments.concat(this.lastSegment);
  return serializeObject.instance(this, segments);
};
AsProperty.prototype.emit = function(context, target) {
  var node = traverseAndCreate(context.controller, this.segments);
  node[this.lastSegment] = target;
};

function AsObject(segments, keyExpression) {
  AsProperty.call(this, segments);
  this.keyExpression = keyExpression;
}
AsObject.prototype = Object.create(AsProperty.prototype);
AsObject.prototype.type = 'AsObject';
AsObject.prototype.emit = function(context, target) {
  var node = traverseAndCreate(context.controller, this.segments);
  var object = node[this.lastSegment] || (node[this.lastSegment] = {});
  var key = this.keyExpression.get(context);
  object[key] = target;
  this.addListeners(target, object, key);
};
AsObject.prototype.addListeners = function(target, object, key) {
  this.addDestroyListener(target, function asObjectDestroy() {
    delete object[key];
  });
};
AsObject.prototype.addDestroyListener = function(target, listener) {
  var listeners = target.$destroyListeners || (target.$destroyListeners = []);
  listeners.push(listener);
};

function AsObjectComponent(segments, keyExpression) {
  AsObject.call(this, segments, keyExpression);
}
AsObjectComponent.prototype = Object.create(AsObject.prototype);
AsObjectComponent.prototype.type = 'AsObjectComponent';
AsObjectComponent.prototype.addDestroyListener = function(target, listener) {
  target.on('destroy', listener);
};

function AsArray(segments) {
  AsProperty.call(this, segments);
}
AsArray.prototype = Object.create(AsProperty.prototype);
AsArray.prototype.type = 'AsArray';
AsArray.prototype.emit = function(context, target) {
  var node = traverseAndCreate(context.controller, this.segments);
  var array = node[this.lastSegment] || (node[this.lastSegment] = []);

  // Iterate backwards, since rendering will usually append
  for (var i = array.length; i--;) {
    var item = array[i];
    // Don't add an item if already in the array
    if (item === target) return;
    var mask = this.comparePosition(target, item);
    // If the emitted target is after the current item in the document,
    // insert it next in the array
    // Node.DOCUMENT_POSITION_FOLLOWING = 4
    if (mask & 4) {
      array.splice(i + 1, 0, target);
      this.addListeners(target, array);
      return;
    }
  }
  // Add to the beginning if before all items
  array.unshift(target);
  this.addListeners(target, array);
};
AsArray.prototype.addListeners = function(target, array) {
  this.addDestroyListener(target, function asArrayDestroy() {
    var index = array.indexOf(target);
    if (index !== -1) array.splice(index, 1);
  });
};
AsArray.prototype.comparePosition = function(target, item) {
  return item.compareDocumentPosition(target);
};
AsArray.prototype.addDestroyListener = AsObject.prototype.addDestroyListener;

function AsArrayComponent(segments) {
  AsArray.call(this, segments);
}
AsArrayComponent.prototype = Object.create(AsArray.prototype);
AsArrayComponent.prototype.type = 'AsArrayComponent';
AsArrayComponent.prototype.comparePosition = function(target, item) {
  return item.markerNode.compareDocumentPosition(target.markerNode);
};
AsArrayComponent.prototype.addDestroyListener = AsObjectComponent.prototype.addDestroyListener;

function traverseAndCreate(node, segments) {
  var len = segments.length;
  if (!len) return node;
  for (var i = 0; i < len; i++) {
    var segment = segments[i];
    node = node[segment] || (node[segment] = {});
  }
  return node;
}

function hasKeys(value) {
  if (!value) return false;
  for (var key in value) {
    return true;
  }
  return false;
}

},{"saddle":70,"serialize-object":71}],"4eZCmJ":[function(require,module,exports){
var Derby = require('./lib/Derby');
module.exports = new Derby();

},{"./lib/Derby":14}],"derby":[function(require,module,exports){
module.exports=require('4eZCmJ');
},{}],12:[function(require,module,exports){
/*
 * App.js
 *
 * Provides the glue between views, controllers, and routes for an
 * application's functionality. Apps are responsible for creating pages.
 *
 */

var EventEmitter = require('events').EventEmitter;
var tracks = require('tracks');
var util = require('racer/lib/util');
var derbyTemplates = require('derby-templates');
var documentListeners = require('./documentListeners');
var Page = require('./Page');
var serializedViews = require('./_views');

module.exports = App;

function App(derby, name, filename) {
  EventEmitter.call(this);
  this.derby = derby;
  this.name = name;
  this.filename = filename;
  this.scriptHash = '12eb0fd0f9d8b630b28d6ad4673b6a1d';
  this.bundledAt = 1487982468754;
  this.Page = createAppPage();
  this.proto = this.Page.prototype;
  this.views = new derbyTemplates.templates.Views();
  this.tracksRoutes = tracks.setup(this);
  this.model = null;
  this.page = null;
  this._init();
}

function createAppPage() {
  // Inherit from Page so that we can add controller functions as prototype
  // methods on this app's pages
  function AppPage() {
    Page.apply(this, arguments);
  }
  AppPage.prototype = Object.create(Page.prototype);
  return AppPage;
}

util.mergeInto(App.prototype, EventEmitter.prototype);

// Overriden on server
App.prototype._init = function() {
  this._waitForAttach = true;
  this._cancelAttach = false;
  this.model = new this.derby.Model();
  this.model.createConnection();
  serializedViews(derbyTemplates, this.views);
  // Must init async so that app.on('model') listeners can be added.
  // Must also wait for content ready so that bundle is fully downloaded.
  this._contentReady();
};
App.prototype._finishInit = function() {
  this.emit('model', this.model);
  var script = this._getScript();
  var data = JSON.parse(script.nextSibling.innerHTML);
  util.isProduction = data.nodeEnv === 'production';
  if (!util.isProduction) this._autoRefresh();
  this.model.unbundle(data);
  var page = this.createPage();
  page.params = this.model.get('$render.params');
  this.emit('ready', page);
  this._waitForAttach = false;
  // Instead of attaching, do a route and render if a link was clicked before
  // the page finished attaching
  if (this._cancelAttach) {
    this.history.refresh();
    return;
  }
  // Since an attachment failure is *fatal* and could happen as a result of a
  // browser extension like AdBlock, an invalid template, or a small bug in
  // Derby or Saddle, re-render from scratch on production failures
  if (util.isProduction) {
    try {
      page.attach();
    } catch (err) {
      this.history.refresh();
      console.warn('attachment error', err.stack);
    }
  } else {
    page.attach();
  }
  this.emit('load', page);
};
// Modified from: https://github.com/addyosmani/jquery.parts/blob/master/jquery.documentReady.js
App.prototype._contentReady = function() {
  // Is the DOM ready to be used? Set to true once it occurs.
  var isReady = false;
  var app = this;

  // The ready event handler
  function onDOMContentLoaded() {
    if (document.addEventListener) {
      document.removeEventListener('DOMContentLoaded', onDOMContentLoaded, false);
    } else {
      // we're here because readyState !== 'loading' in oldIE
      // which is good enough for us to call the dom ready!
      document.detachEvent('onreadystatechange', onDOMContentLoaded);
    }
    onDOMReady();
  }

  // Handle when the DOM is ready
  function onDOMReady() {
    // Make sure that the DOM is not already loaded
    if (isReady) return;
    // Make sure body exists, at least, in case IE gets a little overzealous (ticket #5443).
    if (!document.body) return setTimeout(onDOMReady, 0);
    // Remember that the DOM is ready
    isReady = true;
    // Make sure this is always async and then finishin init
    setTimeout(function() {
      app._finishInit();
    }, 0);
  }

  // The DOM ready check for Internet Explorer
  function doScrollCheck() {
    if (isReady) return;
    try {
      // If IE is used, use the trick by Diego Perini
      // http://javascript.nwbox.com/IEContentLoaded/
      document.documentElement.doScroll('left');
    } catch (err) {
      setTimeout(doScrollCheck, 0);
      return;
    }
    // and execute any waiting functions
    onDOMReady();
  }

  // Catch cases where called after the browser event has already occurred.
  if (document.readyState !== 'loading') return onDOMReady();

  // Mozilla, Opera and webkit nightlies currently support this event
  if (document.addEventListener) {
    // Use the handy event callback
    document.addEventListener('DOMContentLoaded', onDOMContentLoaded, false);
    // A fallback to window.onload, that will always work
    window.addEventListener('load', onDOMContentLoaded, false);
    // If IE event model is used
  } else if (document.attachEvent) {
    // ensure firing before onload,
    // maybe late but safe also for iframes
    document.attachEvent('onreadystatechange', onDOMContentLoaded);
    // A fallback to window.onload, that will always work
    window.attachEvent('onload', onDOMContentLoaded);
    // If IE and not a frame
    // continually check to see if the document is ready
    var toplevel;
    try {
      toplevel = window.frameElement == null;
    } catch (err) {}
    if (document.documentElement.doScroll && toplevel) {
      doScrollCheck();
    }
  }
};

App.prototype._getScript = function() {
  return document.querySelector('script[src^="/derby/' + this.name + '"]');
};

App.prototype.use = util.use;
App.prototype.serverUse = util.serverUse;

App.prototype.loadViews = function() {};

App.prototype.loadStyles = function() {};

App.prototype.createPage = function() {
  if (this.page) {
    this.emit('destroyPage', this.page);
    this.page.destroy();
  }
  var page = new this.Page(this, this.model);
  this.page = page;
  return page;
};

App.prototype.onRoute = function(callback, page, next, done) {
  if (this._waitForAttach) {
    // Cancel any routing before the initial page attachment. Instead, do a
    // render once derby is ready
    this._cancelAttach = true;
    return;
  }
  this.emit('route', page);
  // HACK: To update render in transitional routes
  page.model.set('$render.params', page.params);
  page.model.set('$render.url', page.params.url);
  page.model.set('$render.query', page.params.query);
  // If transitional
  if (done) {
    var app = this;
    var _done = function() {
      app.emit('routeDone', page, 'transition');
      done();
    };
    callback.call(page, page, page.model, page.params, next, _done);
    return;
  }
  callback.call(page, page, page.model, page.params, next);
};

App.prototype._autoRefresh = function() {
  var app = this;
  this.model.on('change', '$connection.state', function(state) {
    if (state === 'connected') registerClient();
  });
  this.model.channel.on('derby:refreshViews', function(serializedViews) {
    var fn = new Function('return ' + serializedViews)(); // jshint ignore:line
    fn(derbyTemplates, app.views);
    var ns = app.model.get('$render.ns');
    app.page.render(ns);
  });
  this.model.channel.on('derby:refreshStyles', function(data) {
    var styleElement = document.querySelector('style[data-filename="' +
      data.filename + '"]');
    if (styleElement) styleElement.innerHTML = data.css;
  });
  function registerClient() {
    var data = {name: app.name, hash: app.scriptHash};
    app.model.channel.send('derby:app', data, function(err) {
      if (!err) return;
      // Reload in a timeout so that returning fetches have time to complete
      // in case an onbeforeunload handler is being used
      setTimeout(function() {
        window.location = window.location;
      }, 100);
    });
  }
  registerClient();
};

util.serverRequire(module, './App.server');

},{"./Page":16,"./_views":17,"./documentListeners":19,"derby-templates":5,"events":22,"racer/lib/util":69,"tracks":82}],13:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter;
var util = require('racer/lib/util');
var Dom = require('./Dom');

module.exports = Controller;

function Controller(app, page, model) {
  EventEmitter.call(this);
  this.dom = new Dom(this);
  this.app = app;
  this.page = page;
  this.model = model;
  model.data.$controller = this;
}

util.mergeInto(Controller.prototype, EventEmitter.prototype);

Controller.prototype.emitCancellable = function() {
  var cancelled = false;
  function cancel() {
    cancelled = true;
  }

  var args = Array.prototype.slice.call(arguments);
  args.push(cancel);
  this.emit.apply(this, args);

  return cancelled;
};

Controller.prototype.emitDelayable = function() {
  var args = Array.prototype.slice.call(arguments);
  var callback = args.pop();

  var delayed = false;
  function delay() {
    delayed = true;
    return callback;
  }

  args.push(delay);
  this.emit.apply(this, args);
  if (!delayed) callback();

  return delayed;
};

},{"./Dom":15,"events":22,"racer/lib/util":69}],14:[function(require,module,exports){
/*
 * Derby.js
 * Meant to be the entry point for the framework.
 *
 */

var EventEmitter = require('events').EventEmitter;
var racer = require('racer');
var App = require('./App');
var Page = require('./Page');
var components = require('./components');

module.exports = Derby;

function Derby() {}
Derby.prototype = racer;

Derby.prototype.App = App;
Derby.prototype.Page = Page;
Derby.prototype.Component = components.Component;

Derby.prototype.createApp = function(name, filename) {
  return new App(this, name, filename);
};

if (!racer.util.isServer) {
  require('./documentListeners').add(document);
}

racer.util.serverRequire(module, './Derby.server');

},{"./App":12,"./Page":16,"./components":18,"./documentListeners":19,"events":22,"racer":"1up47O"}],15:[function(require,module,exports){
module.exports = Dom;

function Dom(controller) {
  this.controller = controller;
  this._listeners = null;
}

Dom.prototype._initListeners = function() {
  var dom = this;
  this.controller.on('destroy', function domOnDestroy() {
    var listeners = dom._listeners;
    if (!listeners) return;
    for (var i = listeners.length; i--;) {
      listeners[i].remove();
    }
    dom._listeners = null;
  });
  return this._listeners = [];
};

Dom.prototype._listenerIndex = function(domListener) {
  var listeners = this._listeners;
  if (!listeners) return -1;
  for (var i = listeners.length; i--;) {
    if (listeners[i].equals(domListener)) return i;
  }
  return -1;
};

Dom.prototype.addListener = function(type, target, listener, useCapture) {
  if (typeof target === 'function') {
    useCapture = listener;
    listener = target;
    target = document;
  }
  var domListener =
    (type === 'destroy') ? new DestroyListener(target, listener) :
    new DomListener(type, target, listener, useCapture);
  if (-1 === this._listenerIndex(domListener)) {
    var listeners = this._listeners || this._initListeners();
    listeners.push(domListener);
  }
  domListener.add();
};
Dom.prototype.on = Dom.prototype.addListener;

Dom.prototype.once = function(type, target, listener, useCapture) {
  if (typeof target === 'function') {
    useCapture = listener;
    listener = target;
    target = document;
  }
  this.addListener(type, target, wrappedListener, useCapture);
  var dom = this;
  function wrappedListener() {
    dom.removeListener(type, target, wrappedListener, useCapture);
    return listener.apply(this, arguments);
  }
};

Dom.prototype.removeListener = function(type, target, listener, useCapture) {
  if (typeof target === 'function') {
    useCapture = listener;
    listener = target;
    target = document;
  }
  var domListener = new DomListener(type, target, listener, useCapture);
  domListener.remove();
  var i = this._listenerIndex(domListener);
  if (i > -1) this._listeners.splice(i, 1);
};

function DomListener(type, target, listener, useCapture) {
  this.type = type;
  this.target = target;
  this.listener = listener;
  this.useCapture = !!useCapture;
}
DomListener.prototype.equals = function(domListener) {
  return this.listener === domListener.listener &&
    this.target === domListener.target &&
    this.type === domListener.type &&
    this.useCapture === domListener.useCapture;
};
DomListener.prototype.add = function() {
  this.target.addEventListener(this.type, this.listener, this.useCapture);
};
DomListener.prototype.remove = function() {
  this.target.removeEventListener(this.type, this.listener, this.useCapture);
};

function DestroyListener(target, listener) {
  DomListener.call(this, 'destroy', target, listener);
}
DestroyListener.prototype = new DomListener();
DestroyListener.prototype.add = function() {
  var listeners = this.target.$destroyListeners || (this.target.$destroyListeners = []);
  if (listeners.indexOf(this.listener) === -1) {
    listeners.push(this.listener);
  }
};
DestroyListener.prototype.remove = function() {
  var listeners = this.target.$destroyListeners;
  if (!listeners) return;
  var index = listeners.indexOf(this.listener);
  if (index !== -1) {
    listeners.splice(index, 1);
  }
};

},{}],16:[function(require,module,exports){
var derbyTemplates = require('derby-templates');
var contexts = derbyTemplates.contexts;
var expressions = derbyTemplates.expressions;
var templates = derbyTemplates.templates;
var util = require('racer/lib/util');
var EventModel = require('./eventmodel');
var textDiff = require('./textDiff');
var Controller = require('./Controller');
var documentListeners = require('./documentListeners');

module.exports = Page;

function Page(app, model, req, res) {
  Controller.call(this, app, this, model);
  this.req = req;
  this.res = res;
  this.params = null;
  if (this.init) this.init(model);
  this.context = this._createContext();
  this._eventModel = null;
  this._removeModelListeners = null;
  this._components = {};
  this._addListeners();
}

util.mergeInto(Page.prototype, Controller.prototype);

Page.prototype.$bodyClass = function(ns) {
  if (!ns) return;
  var classNames = [];
  var segments = ns.split(':');
  for (var i = 0, len = segments.length; i < len; i++) {
    var className = segments.slice(0, i + 1).join('-');
    classNames.push(className);
  }
  return classNames.join(' ');
};

Page.prototype.$preventDefault = function(e) {
  e.preventDefault();
};

Page.prototype.$stopPropagation = function(e) {
  e.stopPropagation();
};

Page.prototype._setRenderParams = function(ns) {
  this.model.set('$render.ns', ns);
  this.model.set('$render.params', this.params);
  this.model.set('$render.url', this.params && this.params.url);
  this.model.set('$render.query', this.params && this.params.query);
};

Page.prototype._setRenderPrefix = function(ns) {
  var prefix = (ns) ? ns + ':' : '';
  this.model.set('$render.prefix', prefix);
};

Page.prototype.get = function(viewName, ns, unescaped) {
  this._setRenderPrefix(ns);
  var view = this.getView(viewName, ns);
  return view.get(this.context, unescaped);
};

Page.prototype.getFragment = function(viewName, ns) {
  this._setRenderPrefix(ns);
  var view = this.getView(viewName, ns);
  return view.getFragment(this.context);
};

Page.prototype.getView = function(viewName, ns) {
  return this.app.views.find(viewName, ns);
};

Page.prototype.render = function(ns) {
  this.app.emit('render', this);
  this.context.pause();
  this._setRenderParams(ns);
  var titleFragment = this.getFragment('TitleElement', ns);
  var bodyFragment = this.getFragment('BodyElement', ns);
  var titleElement = document.getElementsByTagName('title')[0];
  titleElement.parentNode.replaceChild(titleFragment, titleElement);
  document.body.parentNode.replaceChild(bodyFragment, document.body);
  this.context.unpause();
  if (this.create) this.create(this.model, this.dom);
  this.app.emit('routeDone', this, 'render');
};

Page.prototype.attach = function() {
  this.context.pause();
  var ns = this.model.get('$render.ns');
  var titleView = this.getView('TitleElement', ns);
  var bodyView = this.getView('BodyElement', ns);
  var titleElement = document.getElementsByTagName('title')[0];
  titleView.attachTo(titleElement.parentNode, titleElement, this.context);
  bodyView.attachTo(document.body.parentNode, document.body, this.context);
  this.context.unpause();
  if (this.create) this.create(this.model, this.dom);
};

Page.prototype._createContext = function() {
  var contextMeta = new contexts.ContextMeta();
  contextMeta.views = this.app && this.app.views;
  var context = new contexts.Context(contextMeta, this);
  context.expression = new expressions.PathExpression([]);
  context.alias = '#root';
  return context;
};

Page.prototype._addListeners = function() {
  var eventModel = this._eventModel = new EventModel();
  this._addModelListeners(eventModel);
  this._addContextListeners(eventModel);
};

Page.prototype.destroy = function() {
  this.emit('destroy');
  this._removeModelListeners();
  for (var id in this._components) {
    var component = this._components[id];
    component.destroy();
  }
  // Remove all data, refs, listeners, and reactive functions
  // for the previous page
  var silentModel = this.model.silent();
  silentModel.destroy('_page');
  silentModel.destroy('$components');
  // Unfetch and unsubscribe from all queries and documents
  silentModel.unloadAll && silentModel.unloadAll();
};

Page.prototype._addModelListeners = function(eventModel) {
  var model = this.model;
  if (!model) return;

  var context = this.context;
  var changeListener = model.on('change', '**', function onChange(path, value, previous, pass) {
    var segments = util.castSegments(path.split('.'));
    // The pass parameter is passed in for special handling of updates
    // resulting from stringInsert or stringRemove
    pass.$previous = previous;
    eventModel.set(segments, pass);
  });
  var loadListener = model.on('load', '**', function onLoad(path) {
    var segments = util.castSegments(path.split('.'));
    eventModel.set(segments);
  });
  var unloadListener = model.on('unload', '**', function onUnload(path) {
    var segments = util.castSegments(path.split('.'));
    eventModel.set(segments);
  });
  var insertListener = model.on('insert', '**', function onInsert(path, index, values) {
    var segments = util.castSegments(path.split('.'));
    eventModel.insert(segments, index, values.length);
  });
  var removeListener = model.on('remove', '**', function onRemove(path, index, values) {
    var segments = util.castSegments(path.split('.'));
    eventModel.remove(segments, index, values.length);
  });
  var moveListener = model.on('move', '**', function onMove(path, from, to, howMany) {
    var segments = util.castSegments(path.split('.'));
    eventModel.move(segments, from, to, howMany);
  });

  this._removeModelListeners = function() {
    model.removeListener('change', changeListener);
    model.removeListener('load', loadListener);
    model.removeListener('unload', unloadListener);
    model.removeListener('insert', insertListener);
    model.removeListener('remove', removeListener);
    model.removeListener('move', moveListener);
  };
};

Page.prototype._addContextListeners = function(eventModel) {
  this.context.meta.addBinding = addBinding;
  this.context.meta.removeBinding = removeBinding;
  this.context.meta.removeNode = removeNode;
  this.context.meta.addItemContext = addItemContext;
  this.context.meta.removeItemContext = removeItemContext;

  function addItemContext(context) {
    var segments = context.expression.resolve(context);
    eventModel.addItemContext(segments, context);
  }
  function removeItemContext(context) {
    // TODO
  }
  function addBinding(binding) {
    patchTextBinding(binding);
    var expressions = binding.template.expressions;
    if (expressions) {
      for (var i = 0, len = expressions.length; i < len; i++) {
        addDependencies(eventModel, expressions[i], binding);
      }
    } else {
      var expression = binding.template.expression;
      addDependencies(eventModel, expression, binding);
    }
  }
  function removeBinding(binding) {
    var bindingWrappers = binding.meta;
    if (!bindingWrappers) return;
    for (var i = bindingWrappers.length; i--;) {
      eventModel.removeBinding(bindingWrappers[i]);
    }
  }
  function removeNode(node) {
    var component = node.$component;
    if (component && !component.singleton) {
      component.destroy();
    }
    var destroyListeners = node.$destroyListeners;
    if (destroyListeners) {
      for (var i = 0; i < destroyListeners.length; i++) {
        destroyListeners[i]();
      }
    }
  }
};

function addDependencies(eventModel, expression, binding) {
  var bindingWrapper = new BindingWrapper(eventModel, expression, binding);
  bindingWrapper.updateDependencies();
}

// The code here uses object-based set pattern where objects are keyed using
// sequentially generated IDs.
var nextId = 1;
function BindingWrapper(eventModel, expression, binding) {
  this.eventModel = eventModel;
  this.expression = expression;
  this.binding = binding;
  this.id = nextId++;
  this.eventModels = null;
  this.dependencies = null;
  if (binding.meta) {
    binding.meta.push(this);
  } else {
    binding.meta = [this];
  }
}
BindingWrapper.prototype.updateDependencies = function() {
  var dependencies = this.expression.dependencies(this.binding.context);
  if (this.dependencies) {
    // Do nothing if dependencies haven't changed
    if (equalDependencies(this.dependencies, dependencies)) return;
    // Otherwise, remove current dependencies
    this.eventModel.removeBinding(this);
  }
  // Add new dependencies
  if (!dependencies) return;
  this.dependencies = dependencies;
  for (var i = 0, len = dependencies.length; i < len; i++) {
    var dependency = dependencies[i];
    if (dependency) this.eventModel.addBinding(dependency, this);
  }
};
BindingWrapper.prototype.update = function(pass) {
  this.binding.update(pass);
  this.updateDependencies();
};
BindingWrapper.prototype.insert = function(index, howMany) {
  this.binding.insert(index, howMany);
};
BindingWrapper.prototype.remove = function(index, howMany) {
  this.binding.remove(index, howMany);
};
BindingWrapper.prototype.move = function(from, to, howMany) {
  this.binding.move(from, to, howMany);
};

function equalDependencies(a, b) {
  var lenA = a ? a.length : -1;
  var lenB = b ? b.length : -1;
  if (lenA !== lenB) return false;
  for (var i = 0; i < lenA; i++) {
    var itemA = a[i];
    var itemB = b[i];
    var lenItemA = itemA ? itemA.length : -1;
    var lenItemB = itemB ? itemB.length : -1;
    if (lenItemA !== lenItemB) return false;
    for (var j = 0; j < lenItemB; j++) {
      if (itemA[j] !== itemB[j]) return false;
    }
  }
  return true;
}

function patchTextBinding(binding) {
  if (
    binding instanceof templates.AttributeBinding &&
    binding.name === 'value' &&
    binding.element.tagName === 'INPUT' &&
    documentListeners.inputSupportsSelection(binding.element) &&
    binding.template.expression.resolve(binding.context)
  ) {
    binding.update = textInputUpdate;

  } else if (
    binding instanceof templates.NodeBinding &&
    binding.node.parentNode.tagName === 'TEXTAREA' &&
    binding.template.expression.resolve(binding.context)
  ) {
    binding.update = textAreaUpdate;
  }
}

function textInputUpdate(pass) {
  textUpdate(this, this.element, pass);
}
function textAreaUpdate(pass) {
  var element = this.node.parentNode;
  if (element) textUpdate(this, element, pass);
}
function textUpdate(binding, element, pass) {
  if (pass) {
    if (pass.$event && pass.$event.target === element) {
      return;
    } else if (pass.$stringInsert) {
      return textDiff.onStringInsert(
        element,
        pass.$previous,
        pass.$stringInsert.index,
        pass.$stringInsert.text
      );
    } else if (pass.$stringRemove) {
      return textDiff.onStringRemove(
        element,
        pass.$previous,
        pass.$stringRemove.index,
        pass.$stringRemove.howMany
      );
    }
  }

  if (element.tagName === 'TEXTAREA') {
    var template = binding.template;
    var value = template.expression.get(binding.context);
    return element.value = template.stringify(value);
  }

  binding.template.update(binding.context, binding);
}

util.serverRequire(module, './Page.server');

},{"./Controller":13,"./documentListeners":19,"./eventmodel":20,"./textDiff":21,"derby-templates":5,"racer/lib/util":69}],17:[function(require,module,exports){
/*DERBY_SERIALIZED_VIEWS*/module.exports = function(derbyTemplates, views) {var expressions = derbyTemplates.expressions;var templates = derbyTemplates.templates;views.register('TitleElement', '<title><view name="{{$render.prefix}}Title"></view></title>').template = new templates.Template([new templates.Element('title', void 0, [new templates.Block(new templates.Template([new templates.DynamicText(new expressions.PathExpression(['$render', 'prefix'], new expressions.ExpressionMeta('$render.prefix'))), new templates.Text('Title')], '{{$render.prefix}}Title'), [new templates.DynamicViewInstance(new templates.Template([new templates.DynamicText(new expressions.PathExpression(['$render', 'prefix'], new expressions.ExpressionMeta('$render.prefix'))), new templates.Text('Title')], '{{$render.prefix}}Title'), {})])], void 0, false)]);views.register('BodyElement', '<body class="{{$bodyClass($render.ns)}}"><view name="{{$render.prefix}}Body"></view>').template = new templates.Template([new templates.Element('body', {'class': new templates.DynamicAttribute(new expressions.FnExpression(['$bodyClass'], [new expressions.PathExpression(['$render', 'ns'])], void 0, new expressions.ExpressionMeta('$bodyClass($render.ns)')))}, [new templates.Block(new templates.Template([new templates.DynamicText(new expressions.PathExpression(['$render', 'prefix'], new expressions.ExpressionMeta('$render.prefix'))), new templates.Text('Body')], '{{$render.prefix}}Body'), [new templates.DynamicViewInstance(new templates.Template([new templates.DynamicText(new expressions.PathExpression(['$render', 'prefix'], new expressions.ExpressionMeta('$render.prefix'))), new templates.Text('Body')], '{{$render.prefix}}Body'), {})])], void 0, false, true)]);views.register('Title', '\n\n    CausalPath\n\n\n').template = new templates.Template([new templates.Text('CausalPath')]);views.register('Head', '\n\n    <meta name="viewport" content="width=device-width">\n    <!--External style files-->\n        <link href="lib/css/font-awesome-4.0.3/css/font-awesome.css" rel="stylesheet">\n        <link href="./lib/css/bootstrap.css" rel="stylesheet">\n        <link href="lib/css/jquery.qtip.min.css" rel="stylesheet">\n        <link href="./lib/css/w3.css" rel="stylesheet">\n\n    <!--Style files-->\n        <link href="./css/main.css" rel="stylesheet">\n\n\n\n').template = new templates.Template([new templates.Element('meta', {'name': new templates.Attribute('viewport'), 'content': new templates.Attribute('width=device-width')}, null, void 0, false), new templates.Element('link', {'href': new templates.Attribute('lib/css/font-awesome-4.0.3/css/font-awesome.css'), 'rel': new templates.Attribute('stylesheet')}, null, void 0, false), new templates.Element('link', {'href': new templates.Attribute('./lib/css/bootstrap.css'), 'rel': new templates.Attribute('stylesheet')}, null, void 0, false), new templates.Element('link', {'href': new templates.Attribute('lib/css/jquery.qtip.min.css'), 'rel': new templates.Attribute('stylesheet')}, null, void 0, false), new templates.Element('link', {'href': new templates.Attribute('./lib/css/w3.css'), 'rel': new templates.Attribute('stylesheet')}, null, void 0, false), new templates.Element('link', {'href': new templates.Attribute('./css/main.css'), 'rel': new templates.Attribute('stylesheet')}, null, void 0, false)]);views.register('Body', '\n\n    <!--Cytoscape-related global variables-->\n    <script src="./src/utilities/global-variables-functions.js"></script>\n\n    <!--External libraries-->\n    <script src="lib/js/jquery-1.8.2.js"></script>\n    <script src="lib/js/jquery.fancybox-1.3.4.pack.js"></script>\n    <script src="lib/js/jquery.expander-min.js"></script>\n    <script src="lib/js/jquery.qtip.js"></script>\n    <script src="lib/js/jquery-ui-1.10.3.custom.min.js"></script>\n    <script src="lib/js/bootstrap.min.js"></script>\n    <script src="lib/js/underscore.js"></script>\n    <script src="lib/js/cytoscape.js"></script>\n    <script src="lib/js/cytoscape.js-qtip.js"></script>\n    <script src="lib/js/backbone-min.js"></script>\n    <script src="lib/js/jquery.highlighttextarea.js"></script>\n    <script src="lib/js/FileSaver.js"></script>\n    <script src="lib/js/jquery.noty.packaged.js"></script>\n    <script src="lib/js/socket.io.js"></script>\n    <script src="lib/js/cytoscape-cose-bilkent.js"></script>\n\n    <!--Source code-->\n    <script src="./src/utilities/topology-grouping.js"></script>\n    <script src="./src/utilities/causality-cy-renderer.js"></script>\n\n    <!--Demo json object-->\n    <script src="./demo/demoJson.js"></script>\n\n\n\n\n    <!--Causality-related-->\n\n    <div id = "banner">\n        CausalPath: Causality Analysis of Proteomic Profiles\n    </div>\n\n    <div id = "info-div">\n\n        This web service runs <a href="https://github.com/PathwayAndDataAnalysis/causalpath" >CausalPath</a> analysis on proteomics and phosphoproteomics datasets and/or renders analysis results. For a new analysis, please prepare your input files according to the <a href="https://github.com/PathwayAndDataAnalysis/causalpath/blob/master/wiki/InputFormat.md">guidelines</a>. If you already have results, please visualize the result network by uploading the related .json file. Source code of this web server resides at <a href="https://github.com/PathwayAndDataAnalysis/causalpath-webserver">its own project</a>.\n    </div>\n    <div id  = "graph-options-container">\n        <table align= "top" cellpadding="10px" >\n            <tbody>\n            <tr align = "center">\n                <td>\n\n                    <label for="back-button">\n                    <i class="fa fa-arrow-circle-left"></i> Back\n                    </label>\n\n\n\n                    <div> <input type="button" id = "back-button" display = "none" value = "Back" on-click = "showInputContainer()"> </div>\n\n                </td>\n            <td></td><td></td>\n                <td class = "graph-options-td"><input type="checkbox" id = "sif-topology-grouping" checked = "{{!_page.doc.noTopologyGrouping}}" on-change = "reloadGraph()" > Topology grouping</td>\n                <td></td><td></td>\n                <td class = "graph-options-td"><input type="button" id = "run-layout" value = "Run Layout" on-click = "runLayout()"> </td>\n                <td></td><td></td>\n\n\n                <td>\n                    <div id = "download-div">\n                        <label for="download-button">\n                            <i class="fa fa-download"></i> Download Input & Analysis Results\n                        </label>\n                        <div> <input type="button" id = "download-button"  value = "Download" on-click = "downloadResults()"> </div>\n                    </div>\n                </td>\n\n            </tr>\n            </tbody>\n        </table>\n    </div>\n\n    <div id= "input-container">\n\n            <table  border="0"  width="100%" align="center" >\n                <tbody>\n\n                <tr align="center">\n\n                    <td align="center">\n\n                        <div  class="input-td">\n                            A. Upload json file for visualization\n                            <label for="graph-file-input">\n                                <i class="fa fa-upload"></i> Select\n                            </label>\n\n                            <div><input type="file" id="graph-file-input" accept=".txt, .json" on-change = "loadGraphFile($event)" value ={_page.newFile} ></div>\n                        </div>\n                    </td>\n                    <td align = "center">\n                        OR\n                    </td>\n                    <td align = "center">\n\n                        <div  class="input-td" data-toggle="tooltip" data-placement="bottom" title="Enter multiple input files or a zip file of input files">\n                            B. Upload input files for analysis\n                            <label for="analysis-directory-input">\n                                <i class="fa fa-upload"></i> Select\n                            </label>\n\n                            <div><input type="file"  id="analysis-directory-input" accept=".txt, .zip"  on-change = "loadAnalysisDir()" value ={_page.analysisFiles} multiple ></div>\n                        </div>\n                    </td>\n\n                    <td align = "center">\n                        OR\n                    </td>\n\n                    <td align = "center">\n\n                        <div  class="input-td">\n                            C. Show demo graph\n\n                            <label for="demo-file-button">\n                                <i class="fa fa-play"></i> Display\n                            </label>\n                            <div><input type="button" id="demo-file-button"  value = "Display" on-click = "loadDemoGraph()"  ></div>\n                        </div>\n                    </td>\n\n\n                </tr>\n\n\n\n                </tbody>\n\n            </table>\n        </div>\n\n\n\n\n    <div id = "graph-container">\n\n\n    </div>\n\n    <script>\n\n            $(document).ready(function(){\n\n                $(\'[data-toggle="tooltip"]\').tooltip();\n        });\n    </script>\n\n\n\n').template = new templates.Template([new templates.Element('script', {'src': new templates.Attribute('./src/utilities/global-variables-functions.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/jquery-1.8.2.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/jquery.fancybox-1.3.4.pack.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/jquery.expander-min.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/jquery.qtip.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/jquery-ui-1.10.3.custom.min.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/bootstrap.min.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/underscore.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/cytoscape.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/cytoscape.js-qtip.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/backbone-min.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/jquery.highlighttextarea.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/FileSaver.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/jquery.noty.packaged.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/socket.io.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('lib/js/cytoscape-cose-bilkent.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('./src/utilities/topology-grouping.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('./src/utilities/causality-cy-renderer.js')}, [], void 0, false), new templates.Element('script', {'src': new templates.Attribute('./demo/demoJson.js')}, [], void 0, false), new templates.Element('div', {'id': new templates.Attribute('banner')}, [new templates.Text('CausalPath: Causality Analysis of Proteomic Profiles')], void 0, false), new templates.Element('div', {'id': new templates.Attribute('info-div')}, [new templates.Text('This web service runs '), new templates.Element('a', {'href': new templates.Attribute('https://github.com/PathwayAndDataAnalysis/causalpath')}, [new templates.Text('CausalPath')], void 0, false), new templates.Text(' analysis on proteomics and phosphoproteomics datasets and/or renders analysis results. For a new analysis, please prepare your input files according to the '), new templates.Element('a', {'href': new templates.Attribute('https://github.com/PathwayAndDataAnalysis/causalpath/blob/master/wiki/InputFormat.md')}, [new templates.Text('guidelines')], void 0, false), new templates.Text('. If you already have results, please visualize the result network by uploading the related .json file. Source code of this web server resides at '), new templates.Element('a', {'href': new templates.Attribute('https://github.com/PathwayAndDataAnalysis/causalpath-webserver')}, [new templates.Text('its own project')], void 0, false), new templates.Text('.')], void 0, false), new templates.Element('div', {'id': new templates.Attribute('graph-options-container')}, [new templates.Element('table', {'align': new templates.Attribute('top'), 'cellpadding': new templates.Attribute('10px')}, [new templates.Element('tbody', void 0, [new templates.Element('tr', {'align': new templates.Attribute('center')}, [new templates.Element('td', void 0, [new templates.Element('label', {'for': new templates.Attribute('back-button')}, [new templates.Element('i', {'class': new templates.Attribute('fa fa-arrow-circle-left')}, [], void 0, false), new templates.Text(' Back')], void 0, false), new templates.Element('div', void 0, [new templates.Text(' '), new templates.Element('input', {'type': new templates.Attribute('button'), 'id': new templates.Attribute('back-button'), 'display': new templates.Attribute('none'), 'value': new templates.Attribute('Back')}, null, [new templates.ElementOn('click', new expressions.FnExpression(['showInputContainer'], []))], false), new templates.Text(' ')], void 0, false)], void 0, false), new templates.Element('td', void 0, [], void 0, false), new templates.Element('td', void 0, [], void 0, false), new templates.Element('td', {'class': new templates.Attribute('graph-options-td')}, [new templates.Element('input', {'type': new templates.Attribute('checkbox'), 'id': new templates.Attribute('sif-topology-grouping'), 'checked': new templates.DynamicAttribute(new expressions.OperatorExpression('!U', [new expressions.PathExpression(['_page', 'doc', 'noTopologyGrouping'])], void 0, new expressions.ExpressionMeta('!_page.doc.noTopologyGrouping')))}, null, [new templates.ElementOn('change', new expressions.FnExpression(['reloadGraph'], []))], false), new templates.Text(' Topology grouping')], void 0, false), new templates.Element('td', void 0, [], void 0, false), new templates.Element('td', void 0, [], void 0, false), new templates.Element('td', {'class': new templates.Attribute('graph-options-td')}, [new templates.Element('input', {'type': new templates.Attribute('button'), 'id': new templates.Attribute('run-layout'), 'value': new templates.Attribute('Run Layout')}, null, [new templates.ElementOn('click', new expressions.FnExpression(['runLayout'], []))], false), new templates.Text(' ')], void 0, false), new templates.Element('td', void 0, [], void 0, false), new templates.Element('td', void 0, [], void 0, false), new templates.Element('td', void 0, [new templates.Element('div', {'id': new templates.Attribute('download-div')}, [new templates.Element('label', {'for': new templates.Attribute('download-button')}, [new templates.Element('i', {'class': new templates.Attribute('fa fa-download')}, [], void 0, false), new templates.Text(' Download Input & Analysis Results')], void 0, false), new templates.Element('div', void 0, [new templates.Text(' '), new templates.Element('input', {'type': new templates.Attribute('button'), 'id': new templates.Attribute('download-button'), 'value': new templates.Attribute('Download')}, null, [new templates.ElementOn('click', new expressions.FnExpression(['downloadResults'], []))], false), new templates.Text(' ')], void 0, false)], void 0, false)], void 0, false)], void 0, false)], void 0, false)], void 0, false)], void 0, false), new templates.Element('div', {'id': new templates.Attribute('input-container')}, [new templates.Element('table', {'border': new templates.Attribute('0'), 'width': new templates.Attribute('100%'), 'align': new templates.Attribute('center')}, [new templates.Element('tbody', void 0, [new templates.Element('tr', {'align': new templates.Attribute('center')}, [new templates.Element('td', {'align': new templates.Attribute('center')}, [new templates.Element('div', {'class': new templates.Attribute('input-td')}, [new templates.Text('A. Upload json file for visualization'), new templates.Element('label', {'for': new templates.Attribute('graph-file-input')}, [new templates.Element('i', {'class': new templates.Attribute('fa fa-upload')}, [], void 0, false), new templates.Text(' Select')], void 0, false), new templates.Element('div', void 0, [new templates.Element('input', {'type': new templates.Attribute('file'), 'id': new templates.Attribute('graph-file-input'), 'accept': new templates.Attribute('.txt, .json'), 'value': new templates.Attribute('{_page.newFile}')}, null, [new templates.ElementOn('change', new expressions.FnExpression(['loadGraphFile'], [new expressions.PathExpression(['$event'])]))], false)], void 0, false)], void 0, false)], void 0, false), new templates.Element('td', {'align': new templates.Attribute('center')}, [new templates.Text('OR')], void 0, false), new templates.Element('td', {'align': new templates.Attribute('center')}, [new templates.Element('div', {'class': new templates.Attribute('input-td'), 'data-toggle': new templates.Attribute('tooltip'), 'data-placement': new templates.Attribute('bottom'), 'title': new templates.Attribute('Enter multiple input files or a zip file of input files')}, [new templates.Text('B. Upload input files for analysis'), new templates.Element('label', {'for': new templates.Attribute('analysis-directory-input')}, [new templates.Element('i', {'class': new templates.Attribute('fa fa-upload')}, [], void 0, false), new templates.Text(' Select')], void 0, false), new templates.Element('div', void 0, [new templates.Element('input', {'type': new templates.Attribute('file'), 'id': new templates.Attribute('analysis-directory-input'), 'accept': new templates.Attribute('.txt, .zip'), 'value': new templates.Attribute('{_page.analysisFiles}'), 'multiple': new templates.Attribute(true)}, null, [new templates.ElementOn('change', new expressions.FnExpression(['loadAnalysisDir'], []))], false)], void 0, false)], void 0, false)], void 0, false), new templates.Element('td', {'align': new templates.Attribute('center')}, [new templates.Text('OR')], void 0, false), new templates.Element('td', {'align': new templates.Attribute('center')}, [new templates.Element('div', {'class': new templates.Attribute('input-td')}, [new templates.Text('C. Show demo graph'), new templates.Element('label', {'for': new templates.Attribute('demo-file-button')}, [new templates.Element('i', {'class': new templates.Attribute('fa fa-play')}, [], void 0, false), new templates.Text(' Display')], void 0, false), new templates.Element('div', void 0, [new templates.Element('input', {'type': new templates.Attribute('button'), 'id': new templates.Attribute('demo-file-button'), 'value': new templates.Attribute('Display')}, null, [new templates.ElementOn('click', new expressions.FnExpression(['loadDemoGraph'], []))], false)], void 0, false)], void 0, false)], void 0, false)], void 0, false)], void 0, false)], void 0, false)], void 0, false), new templates.Element('div', {'id': new templates.Attribute('graph-container')}, [], void 0, false), new templates.Element('script', void 0, [new templates.Text('$(document).ready(function(){$(\'[data-toggle="tooltip"]\').tooltip();});')], void 0, false)]);views.register('Tail', '').template = new templates.Template([]);};/*DERBY_SERIALIZED_VIEWS_END*/
},{}],18:[function(require,module,exports){
/*
 * components.js
 *
 * Components associate custom script functionality with a view. They can be
 * distributed as standalone modules containing templates, scripts, and styles.
 * They can also be used to modularize application functionality.
 *
 */

var path = require('path');
var util = require('racer/lib/util');
var derbyTemplates = require('derby-templates');
var templates = derbyTemplates.templates;
var expressions = derbyTemplates.expressions;
var App = require('./App');
var Controller = require('./Controller');

exports.Component = Component;
exports.ComponentFactory = ComponentFactory;
exports.SingletonComponentFactory = SingletonComponentFactory;
exports.createFactory = createFactory;

function Component(parent, context, id, scope) {
  this.parent = parent;
  this.context = context;
  this.id = id;
  this._scope = scope;
}

util.mergeInto(Component.prototype, Controller.prototype);

Component.prototype.destroy = function() {
  this.emit('destroy');
  this.model.removeContextListeners();
  this.model.destroy();
  delete this.page._components[this.id];
  var components = this.page._eventModel.object.$components;
  if (components) delete components.object[this.id];
};

Component.prototype.get = function(viewName, unescaped) {
  var view = this.getView(viewName);
  return view.get(this.context, unescaped);
};

Component.prototype.getFragment = function(viewName) {
  var view = this.getView(viewName);
  return view.getFragment(this.context);
};

Component.prototype.getView = function(viewName) {
  var contextView = this.context.getView();
  return (viewName) ?
    this.app.views.find(viewName, contextView.namespace) : contextView;
};

Component.prototype.getAttribute = function(key) {
  var attributeContext = this.context.forAttribute(key);
  if (!attributeContext) return;
  var value = attributeContext.attributes[key];
  return value && expressions.renderValue(value, attributeContext);
};

Component.prototype.setAttribute = function(key, value) {
  this.context.parent.attributes[key] = value;
};

Component.prototype.setNullAttribute = function(key, value) {
  var attributes = this.context.parent.attributes;
  if (attributes[key] == null) attributes[key] = value;
};

function initComponent(context, component, parent, model, id, scope) {
  // Do generic controller initialization
  var componentContext = context.componentChild(component);
  Controller.call(component, parent.app, parent.page, model);
  Component.call(component, parent, componentContext, id, scope);

  // Do the user-specific initialization. The component constructor should be
  // an empty function and the actual initialization code should be done in the
  // component's init method. This means that we don't have to rely on users
  // properly calling the Component constructor method and avoids having to
  // play nice with how CoffeeScript extends class constructors
  emitInitHooks(context, component);
  component.emit('init', component);
  if (component.init) component.init(model);

  return componentContext;
}

function emitInitHooks(context, component) {
  if (!context.initHooks) return;
  // Run initHooks for `on` listeners immediately before init
  for (var i = 0, len = context.initHooks.length; i < len; i++) {
    context.initHooks[i].emit(context, component);
  }
}

function setAttributes(context, model) {
  if (!context.attributes) return;
  // Set attribute values on component model
  for (var key in context.attributes) {
    var attribute = context.attributes[key];
    var segments = (
      attribute instanceof templates.ParentWrapper &&
      attribute.expression &&
      attribute.expression.pathSegments(context)
    );
    if (segments) {
      model.root.ref(model._at + '.' + key, segments.join('.'), {updateIndices: true});
    } else {
      model.set(key, attribute);
    }
  }
}

function createFactory(constructor) {
  return (constructor.prototype.singleton) ?
    new SingletonComponentFactory(constructor) :
    new ComponentFactory(constructor);
}

function ComponentFactory(constructor) {
  this.constructor = constructor;
}
ComponentFactory.prototype.init = function(context) {
  var component = new this.constructor();

  var parent = context.controller;
  var id = context.id();
  var scope = ['$components', id];
  var model = parent.model.root.eventContext(component);
  model._at = scope.join('.');
  model.set('id', id);
  setAttributes(context, model);
  // Store a reference to the component's scope such that the expression
  // getters are relative to the component
  model.data = model.get();
  parent.page._components[id] = component;

  return initComponent(context, component, parent, model, id, scope);
};
ComponentFactory.prototype.create = function(context) {
  var component = context.controller;
  component.emit('create', component);
  // Call the component's create function after its view is rendered
  if (component.create) {
    component.create(component.model, component.dom);
  }
};

function SingletonComponentFactory(constructor) {
  this.constructor = constructor;
  this.component = null;
}
SingletonComponentFactory.prototype.init = function(context) {
  if (!this.component) this.component = new this.constructor();
  return context.componentChild(this.component);
};
// Don't call the create method for singleton components
SingletonComponentFactory.prototype.create = function() {};

App.prototype.component = function(viewName, constructor) {
  if (typeof viewName === 'function') {
    constructor = viewName;
    viewName = null;
  }

  // Inherit from Component
  extendComponent(constructor);

  // Load template view from filename
  if (constructor.prototype.view) {
    var viewFilename = constructor.prototype.view;
    viewName = constructor.prototype.name || path.basename(viewFilename, '.html');
    this.loadViews(viewFilename, viewName);

  } else if (!viewName) {
    if (constructor.prototype.name) {
      viewName = constructor.prototype.name;
      var view = this.views.register(viewName);
      view.template = templates.emptyTemplate;
    } else {
      throw new Error('No view name specified for component');
    }
  }

  // Associate the appropriate view with the component type
  var view = this.views.find(viewName);
  if (!view) {
    var message = this.views.findErrorMessage(viewName);
    throw new Error(message);
  }
  view.componentFactory = createFactory(constructor);

  // Make chainable
  return this;
};

function extendComponent(constructor) {
  // Don't do anything if the constructor already extends Component
  if (constructor.prototype instanceof Component) return;
  // Otherwise, replace its prototype with an instance of Component
  var oldPrototype = constructor.prototype;
  constructor.prototype = new Component();
  util.mergeInto(constructor.prototype, oldPrototype);
}

},{"./App":12,"./Controller":13,"derby-templates":5,"path":32,"racer/lib/util":69}],19:[function(require,module,exports){
var textDiff = require('./textDiff');

exports.add = addDocumentListeners;
exports.inputSupportsSelection = inputSupportsSelection;

// http://www.whatwg.org/specs/web-apps/current-work/multipage/the-input-element.html#do-not-apply
// TODO: Date types support
function inputSupportsSelection(input) {
  var type = input.type;
  return (
    type === 'text' ||
    type === 'search' ||
    type === 'url' ||
    type === 'tel' ||
    type === 'password'
  );
}
function inputIsNumberValue(input) {
  var type = input.type;
  return (type === 'number' || (type === 'range' && !input.multiple));
}
function inputValue(input) {
  return inputIsNumberValue(input) ? input.valueAsNumber : input.value;
}

function addDocumentListeners(doc) {
  doc.addEventListener('input', documentInput, true);
  doc.addEventListener('change', documentChange, true);

  // Listen to more events for versions of IE with buggy input event implementations
  if (parseFloat(window.navigator.appVersion.split('MSIE ')[1]) <= 9) {
    // We're listening on selectionchange because there's no other event emitted when
    // the user clicks 'delete' from a context menu when right clicking on selected text.
    // So although this event fires overly aggressively, it's the only real way
    // to ensure that we can detect all changes to the input value in IE <= 9
    doc.addEventListener('selectionchange', function(e){
      if (document.activeElement) {
        documentInput({target: document.activeElement}); // selectionchange evts don't have the e.target we need
      }
    }, true);
  }

  // For some reason valueAsNumber returns NaN for number inputs in IE
  // until a new IE version that handles this is released, parse input.value as a fallback
  var input = document.createElement('input');
  input.type = 'number';
  input.value = '7';
  if (input.valueAsNumber !== input.valueAsNumber) {
    var oldInputValue = inputValue;
    inputValue = function(input) {
      if (input.type === 'number') {
        return inputIsNumberValue(input) ? parseFloat(input.value) : input.value;
      } else {
        return oldInputValue.apply(this, arguments);
      }
    };
  }
}

function documentInput(e) {
  var target = e.target;

  if (target.tagName === 'INPUT') {
    setInputValue(e, target);

  } else if (target.tagName === 'TEXTAREA' && target.childNodes.length === 1) {
    var binding = target.firstChild && target.firstChild.$bindNode;
    if (!binding || binding.isUnbound()) return;

    var pass = {$event: e};
    textDiffBinding(binding, target.value, pass);
  }
}

function documentChange(e) {
  var target = e.target;

  if (target.tagName === 'INPUT') {
    setBoundProperty(target, 'checked');
    setInputValue(e, target);

  } else if (target.tagName === 'SELECT') {
    setOptionBindings(target);
  }
}

function setBoundProperty(node, property) {
  var binding = node.$bindAttributes && node.$bindAttributes[property];
  if (!binding || binding.isUnbound()) return;

  var value = node[property];
  binding.template.expression.set(binding.context, value);
}

function setInputValue(e, target) {
  var binding = target.$bindAttributes && target.$bindAttributes.value;
  if (!binding || binding.isUnbound()) return;

  if (inputSupportsSelection(target)) {
    var pass = {$event: e};
    textDiffBinding(binding, target.value, pass);
  } else {
    var value = inputValue(target);
    binding.template.expression.set(binding.context, value);
  }
}

function textDiffBinding(binding, value, pass) {
  var expression = binding.template.expression;
  var segments = expression.pathSegments(binding.context);
  if (segments) {
    var model = binding.context.controller.model.pass(pass);
    textDiff.onTextInput(model, segments, value);
  } else if (expression.set) {
    expression.set(binding.context, value);
  }
}

function setOptionBindings(parent) {
  for (var node = parent.firstChild; node; node = node.nextSibling) {
    if (node.tagName === 'OPTION') {
      setBoundProperty(node, 'selected');
    } else if (node.hasChildNodes()) {
      setOptionBindings(node);
    }
  }
}

},{"./textDiff":21}],20:[function(require,module,exports){
var expressions = require('derby-templates').expressions;

// The many trees of bindings:
//
// - Model tree, containing your actual data. Eg:
//    {users:{fred:{age:40}, wilma:{age:37}}}
//
// - Event model tree, whose structure mirrors the model tree. The event model
//   tree lets us annotate the model tree with listeners which fire when events
//   change. I think there are three types of listeners:
//
//   1. Reference binding binds to whatever is referred to by the path. Eg,
//   {{each items as item}} binds item by reference as it goes through the
//   list.
//   2. Fixed path bindings explicitly bind to whatever is at that path
//   regardless of how the model changes underneath the event model
//   3. Listen on a subtree and fire when anything in the subtree changes. This
//   is used for custom functions.
//
// {{foo.id}} would listen on the fixed path ['foo', 'id'].
//
//
// - Context tree represents the changing (embedded) contexts of the templating
//   engine. This maps to the tree of templates and allows templates to reference
//   anything in any of their enclosing template scopes.
//

module.exports = EventModel;

// The code here uses object-based set pattern where objects are keyed using
// sequentially generated IDs.
var nextId = 1;

// A binding object is something with update(), insert()/move()/remove() defined.


// Given x[y] with model.get(y) == 5:
//  item = 5
//  segments = ['y']
//  outside = the EventModel for x.
//
// Note that item could be a Context or another ModelRef - eg:
//
// {{ each foo as bar }} ... {{ x[bar] }}  -or-  {{ x[y[z]] }}
function ModelRef(model, item, segments, outside) {
  this.id = nextId++;

  // We need a reference to the model & our segment list so we can update our
  // value.
  this.model = model;
  this.segments = segments;

  // Our current value.
  this.item = item;

  // outside is a reference to the EventModel of the thing on the lhs of the
  // brackets. For example, in x[y].z, outside is the EventModel of x.
  this.outside = outside;

  // result is the EventModel of the evaluated version of the brackets. In
  // x[y].z, its the EventModel of x[y].
  this.result = outside.child(item).refChild(this);
}

ModelRef.prototype.update = function() {
  var segments = expressions.pathSegments(this.segments);
  var newItem = expressions.lookup(segments, this.model.data);
  if (this.item === newItem) return;

  // First remove myself.
  delete this.outside.child(this.item).refChildren[this.id];

  this.item = newItem;

  var container = this.outside.child(this.item);
  // I want to just call refChild but that would create a new EM. Instead I
  // want to just implant my current EM there.
  if (!container.refChildren) container.refChildren = new RefChildrenMap();
  container.refChildren[this.id] = this.result;

  // Finally, update all the bindings in the tree.
  this.result.update();
};


function RefOutMap() {}
function RefChildrenMap() {}
function BindingsMap() {}
function ItemContextsMap() {}
function EventModelsMap() {}

function EventModel() {
  this.id = nextId++;

  // Most of these won't ever be filled in, so I'm just leaving them null.
  //
  // These contain our EventModel children.
  this.object = null;
  this.array = null;

  // This contains any EventModel children which have floating references.
  this.arrayByReference = null;

  // If the data stored here is ever used to lookup other values, this is an
  // object mapping remote child ID -> ref.
  //
  // Eg given x[y], y.refOut[x.id] = <Binding>
  this.refOut = null;

  // This is a map from ref id -> event model for events bound to this
  // EventModel but via a ref. We could just merge them into the main tree, but
  // this way they're easy to move.
  //
  // Eg, given x[y] (y=1), x.1.refChildren[ref id] is an EventModel.
  this.refChildren = null;

  this.bindings = null;

  // Item contexts are contexts which need their item number changed as this
  // EventModel object moves around its surrounding list.
  this.itemContexts = null;
}

EventModel.prototype.refChild = function(ref) {
  if (!this.refChildren) this.refChildren = new RefChildrenMap();
  var id = ref.id;

  if (!this.refChildren[id]) {
    this.refChildren[id] = new EventModel();
  }
  return this.refChildren[id];
};

EventModel.prototype.arrayLookup = function(model, segmentsBefore, segmentsInside) {
  var segments = expressions.pathSegments(segmentsInside);
  var item = expressions.lookup(segments, model.data);

  var source = this.at(segmentsInside);

  // What the array currently resolves to. Given x[y] with y=1, container is
  // the EM for x
  var container = this.at(segmentsBefore);

  if (!source.refOut) source.refOut = new RefOutMap();

  var ref = source.refOut[container.id];
  if (ref == null) {
    ref = new ModelRef(model, item, segmentsInside, container);
    source.refOut[container.id] = ref;
  }

  return ref;
};

// Returns the EventModel node of the named child.
EventModel.prototype.child = function(segment) {
  var container;
  if (typeof segment === 'string') {
    // Object
    if (!this.object) this.object = {};
    container = this.object;

  } else if (typeof segment === 'number') {
    // Array by value
    if (!this.array) this.array = [];
    container = this.array;

  } else if (segment instanceof ModelRef) {
    // Array reference. We'll need to lookup the child with the right
    // value, then look inside its ref children for the right EventModel
    // (so we can update it later). This is pretty janky, but should be
    // *correct* even in the face of recursive array accessors.
    //
    // This will calculate it based on the current segment values, but refs
    // cache the EM anyway.
    //return this.child(segment.item).refChild(segment);
    return segment.result;

  } else {
    // Array by reference
    if (!this.arrayByReference) this.arrayByReference = [];
    container = this.arrayByReference;
    segment = segment.item;
  }

  return container[segment] || (container[segment] = new EventModel());
};

// Returns the EventModel node at the given segments list. Note that although
// EventModel nodes are unique, its possible for multiple EventModel nodes to
// refer to the same section of the model because of references.
//
// If you want to update the bindings that refer to a specific path, use
// each().
//
// EventModel objects are created as needed.
EventModel.prototype.at = function(segments) {
  // For unbound dependancies.
  if (segments == null) return this;

  var eventModel = this;

  for (var i = 0; i < segments.length; i++) {
    eventModel = eventModel.child(segments[i]);
  }

  return eventModel;
};

EventModel.prototype.isEmpty = function() {
  if (hasKeys(this.dependancies)) return false;
  if (hasKeys(this.itemContexts)) return false;

  if (this.object) {
    if (hasKeys(this.object)) return false;
    this.object = null;
  }

  if (this.arrayByReference) {
    for (var i = 0; i < this.arrayByReference.length; i++) {
      if (this.arrayByReference[i] != null) return false;
    }
    this.arrayByReference = null;
  }

  if (this.array) {
    for (var i = 0; i < this.array.length; i++) {
      if (this.array[i] != null) return false;
    }
    this.array = null;
  }

  return true;
};

function hasKeys(object) {
  for (var key in object) {
    return true;
  }
  return false;
}


// **** Updating the EventModel

EventModel.prototype._addItemContext = function(context) {
  if (!context._id) context._id = nextId++;
  if (!this.itemContexts) this.itemContexts = new ItemContextsMap();
  this.itemContexts[context._id] = context;
};

EventModel.prototype._removeItemContext = function(context) {
  if (this.itemContexts) {
    delete this.itemContexts[context._id];
  }
};

EventModel.prototype._addBinding = function(binding) {
  var bindings = this.bindings || (this.bindings = new BindingsMap());
  binding.eventModels || (binding.eventModels = new EventModelsMap());
  bindings[binding.id] = binding;
  binding.eventModels[this.id] = this;
};

// This is the main hook to add bindings to the event model tree. It should
// only be called on the root EventModel object.
EventModel.prototype.addBinding = function(segments, binding) {
  this.at(segments)._addBinding(binding);
};

// This is used for objects (contexts in derby's case) that have a .item
// property which refers to an array index.
EventModel.prototype.addItemContext = function(segments, context) {
  this.at(segments)._addItemContext(context);
};

EventModel.prototype.removeBinding = function(binding) {
  for (var id in binding.eventModels) {
    var eventModel = binding.eventModels[id];
    if (eventModel.bindings) delete eventModel.bindings[binding.id];
  }
  binding.eventModels = null;
};

EventModel.prototype._each = function(segments, pos, fn) {
  // Our refChildren are effectively merged into this object.
  if (this.refChildren) {
    for (var id in this.refChildren) {
      this.refChildren[id]._each(segments, pos, fn);
    }
  }

  if (segments.length === pos) {
    fn(this);
    return;
  }

  var segment = segments[pos];
  var child;
  if (typeof segment === 'string') {
    // Object. Just recurse into our objects set. Its possible to rewrite this
    // function to simply loop in the case of object lookups, but I don't think
    // it'll buy us much.
    child = this.object && this.object[segment];
    if (child) child._each(segments, pos + 1, fn);

  } else {
    // Number. Recurse both into the fixed list and the reference list.
    child = this.array && this.array[segment];
    if (child) child._each(segments, pos + 1, fn);

    child = this.arrayByReference && this.arrayByReference[segment];
    if (child) child._each(segments, pos + 1, fn);
  }
};

// Called when the scalar value at the path changes. This only calls update()
// on this node. See update() below if you want to update entire
// subtrees.
EventModel.prototype.localUpdate = function(pass) {
  if (this.bindings) {
    for (var id in this.bindings) {
      var binding = this.bindings[id];
      binding.update(pass);
    }
  }

  // If our value changed, we also need to update anything that depends on it
  // via refOut.
  if (this.refOut) {
    for (var id in this.refOut) {
      var ref = this.refOut[id];
      ref.update();
    }
  }
};

// This is used when an object subtree is replaced / removed.
EventModel.prototype.update = function(pass) {
  this.localUpdate(pass);

  if (this.object) {
    for (var key in this.object) {
      var binding = this.object[key];
      if (binding) binding.update();
    }
  }

  if (this.array) {
    for (var i = 0; i < this.array.length; i++) {
      var binding = this.array[i];
      if (binding) binding.update();
    }
  }

  if (this.arrayByReference) {
    for (var i = 0; i < this.arrayByReference.length; i++) {
      var binding = this.arrayByReference[i];
      if (binding) binding.update();
    }
  }
};

// Updates the indexes in itemContexts of our children in the range of
// [from, to). from and to both optional.
EventModel.prototype._updateChildItemContexts = function(from, to) {
  if (!this.arrayByReference) return;

  if (from == null) from = 0;
  if (to == null) to = this.arrayByReference.length;

  for (var i = from; i < to; i++) {
    var contexts = this.arrayByReference[i] &&
      this.arrayByReference[i].itemContexts;
    if (contexts) {
      for (var key in contexts) {
        contexts[key].item = i;
      }
    }
  }
};

// Updates our array-by-value values. They have to recursively update every
// binding in their children. Sad.
EventModel.prototype._updateArray = function(from, to) {
  if (!this.array) return;

  if (from == null) from = 0;
  if (to == null) to = this.array.length;

  for (var i = from; i < to; i++) {
    var binding = this.array[i];
    if (binding) binding.update();
  }
};

EventModel.prototype._updateObject = function() {
  if (this.object) {
    for (var key in this.object) {
      var binding = this.object[key];
      if (binding) binding.update();
    }
  }
};

EventModel.prototype._set = function(pass) {
  // This just updates anything thats bound to the whole subtree. An alternate
  // implementation could be passed in the new value at this node (which we
  // cache), then compare with the old version and only update parts of the
  // subtree which are relevant. I don't know if thats an important
  // optimization - it really depends on your use case.
  this.update(pass);
};

// Insert into this EventModel node.
EventModel.prototype._insert = function(index, howMany) {
  // Update fixed paths
  this._updateArray(index);

  // Update relative paths
  if (this.arrayByReference && this.arrayByReference.length > index) {
    // Shift the actual items in the array references array.

    // This probably isn't the best way to implement insert. Other options are
    // using concat() on slices or though constructing a temporary array and
    // using splice.call. Hopefully if this method is slow it'll come up during
    // profiling.
    for (var i = 0; i < howMany; i++) {
      this.arrayByReference.splice(index, 0, null);
    }

    // Update the path in the contexts
    this._updateChildItemContexts(index + howMany);
  }

  // Finally call our bindings.
  if (this.bindings) {
    for (var id in this.bindings) {
      var binding = this.bindings[id];
      if (binding) binding.insert(index, howMany);
    }
  }
  this._updateObject();
};

// Remove howMany child elements from this EventModel at index.
EventModel.prototype._remove = function(index, howMany) {
  // Update fixed paths. Both the removed items and items after it may have changed.
  this._updateArray(index);

  if (this.arrayByReference) {
    // Update relative paths. First throw away all the children which have been removed.
    this.arrayByReference.splice(index, howMany);

    this._updateChildItemContexts(index);
  }

  // Call bindings.
  if (this.bindings) {
    for (var id in this.bindings) {
      var binding = this.bindings[id];
      if (binding) binding.remove(index, howMany);
    }
  }
  this._updateObject();
};

// Move howMany items from `from` to `to`.
EventModel.prototype._move = function(from, to, howMany) {
  // first points to the first element that was moved. end points to the list
  // element past the end of the changed region.
  var first, end;
  if (from < to) {
    first = from;
    end = to + howMany;
  } else {
    first = to;
    end = from + howMany;
  }

  // Update fixed paths.
  this._updateArray(first, end);

  // Update relative paths
  var arr = this.arrayByReference;
  if (arr && arr.length > first) {
    // Remove from the old location
    var values = arr.splice(from, howMany);

    // Insert at the new location
    arr.splice.apply(arr, [to, 0].concat(values));

    // Update the path in the contexts
    this._updateChildItemContexts(first, end);
  }

  // Finally call our bindings.
  if (this.bindings) {
    for (var id in this.bindings) {
      var binding = this.bindings[id];
      binding.move(from, to, howMany);
    }
  }
  this._updateObject();
};


// Helpers.

EventModel.prototype.mutate = function(segments, fn) {
  // This finds & returns a list of all event models which exist and could match
  // the specified path. The path cannot contain contexts like derby expression
  // segment lists (just because I don't think thats a useful feature and its not
  // implemented)
  this._each(segments, 0, fn);

  // Also emit all mutations as sets on star paths, which are how dependencies
  // for view helper functions are represented. They should react to a path
  // or any child path being modified
  for (var i = 0, len = segments.length; i++ < len;) {
    var wildcardSegments = segments.slice(0, i);
    wildcardSegments.push('*');
    this._each(wildcardSegments, 0, childSetWildcard);
  }
};

function childSetWildcard(child) {
  child._set();
}

EventModel.prototype.set = function(segments, pass) {
  this.mutate(segments, function childSet(child) {
    child._set(pass);
  });
};

EventModel.prototype.insert = function(segments, index, howMany) {
  this.mutate(segments, function childInsert(child) {
    child._insert(index, howMany);
  });
};

EventModel.prototype.remove = function(segments, index, howMany) {
  this.mutate(segments, function childRemove(child) {
    child._remove(index, howMany);
  });
};

EventModel.prototype.move = function(segments, from, to, howMany) {
  this.mutate(segments, function childMove(child) {
    child._move(from, to, howMany);
  });
};

},{"derby-templates":5}],21:[function(require,module,exports){
exports.onStringInsert = onStringInsert;
exports.onStringRemove = onStringRemove;
exports.onTextInput = onTextInput;

function onStringInsert(el, previous, index, text) {
  function transformCursor(cursor) {
    return (index < cursor) ? cursor + text.length : cursor;
  }
  previous || (previous = '');
  var newText = previous.slice(0, index) + text + previous.slice(index);
  replaceText(el, newText, transformCursor);
}

function onStringRemove(el, previous, index, howMany) {
  function transformCursor(cursor) {
    return (index < cursor) ? cursor - Math.min(howMany, cursor - index) : cursor;
  }
  previous || (previous = '');
  var newText = previous.slice(0, index) + previous.slice(index + howMany);
  replaceText(el, newText, transformCursor);
}

function replaceText(el, newText, transformCursor) {
  var selectionStart = transformCursor(el.selectionStart);
  var selectionEnd = transformCursor(el.selectionEnd);

  var scrollTop = el.scrollTop;
  el.value = newText;
  if (el.scrollTop !== scrollTop) {
    el.scrollTop = scrollTop;
  }
  if (document.activeElement === el) {
    el.selectionStart = selectionStart;
    el.selectionEnd = selectionEnd;
  }
}

function onTextInput(model, segments, value) {
  var previous = model._get(segments) || '';
  if (previous === value) return;
  var start = 0;
  while (previous.charAt(start) === value.charAt(start)) {
    start++;
  }
  var end = 0;
  while (
    previous.charAt(previous.length - 1 - end) === value.charAt(value.length - 1 - end) &&
    end + start < previous.length &&
    end + start < value.length
  ) {
    end++;
  }

  if (previous.length !== start + end) {
    var howMany = previous.length - start - end;
    model._stringRemove(segments, start, howMany);
  }
  if (value.length !== start + end) {
    var inserted = value.slice(start, value.length - end);
    model._stringInsert(segments, start, inserted);
  }
}

},{}],22:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],23:[function(require,module,exports){
// These methods let you build a transform function from a transformComponent
// function for OT types like JSON0 in which operations are lists of components
// and transforming them requires N^2 work. I find it kind of nasty that I need
// this, but I'm not really sure what a better solution is. Maybe I should do
// this automatically to types that don't have a compose function defined.

// Add transform and transformX functions for an OT type which has
// transformComponent defined.  transformComponent(destination array,
// component, other component, side)
module.exports = bootstrapTransform
function bootstrapTransform(type, transformComponent, checkValidOp, append) {
  var transformComponentX = function(left, right, destLeft, destRight) {
    transformComponent(destLeft, left, right, 'left');
    transformComponent(destRight, right, left, 'right');
  };

  var transformX = type.transformX = function(leftOp, rightOp) {
    checkValidOp(leftOp);
    checkValidOp(rightOp);
    var newRightOp = [];

    for (var i = 0; i < rightOp.length; i++) {
      var rightComponent = rightOp[i];

      // Generate newLeftOp by composing leftOp by rightComponent
      var newLeftOp = [];
      var k = 0;
      while (k < leftOp.length) {
        var nextC = [];
        transformComponentX(leftOp[k], rightComponent, newLeftOp, nextC);
        k++;

        if (nextC.length === 1) {
          rightComponent = nextC[0];
        } else if (nextC.length === 0) {
          for (var j = k; j < leftOp.length; j++) {
            append(newLeftOp, leftOp[j]);
          }
          rightComponent = null;
          break;
        } else {
          // Recurse.
          var pair = transformX(leftOp.slice(k), nextC);
          for (var l = 0; l < pair[0].length; l++) {
            append(newLeftOp, pair[0][l]);
          }
          for (var r = 0; r < pair[1].length; r++) {
            append(newRightOp, pair[1][r]);
          }
          rightComponent = null;
          break;
        }
      }

      if (rightComponent != null) {
        append(newRightOp, rightComponent);
      }
      leftOp = newLeftOp;
    }
    return [leftOp, newRightOp];
  };

  // Transforms op with specified type ('left' or 'right') by otherOp.
  type.transform = function(op, otherOp, type) {
    if (!(type === 'left' || type === 'right'))
      throw new Error("type must be 'left' or 'right'");

    if (otherOp.length === 0) return op;

    if (op.length === 1 && otherOp.length === 1)
      return transformComponent([], op[0], otherOp[0], type);

    if (type === 'left')
      return transformX(op, otherOp)[0];
    else
      return transformX(otherOp, op)[1];
  };
};

},{}],24:[function(require,module,exports){
// Only the JSON type is exported, because the text type is deprecated
// otherwise. (If you want to use it somewhere, you're welcome to pull it out
// into a separate module that json0 can depend on).

module.exports = {
  type: require('./json0')
};

},{"./json0":25}],25:[function(require,module,exports){
/*
 This is the implementation of the JSON OT type.

 Spec is here: https://github.com/josephg/ShareJS/wiki/JSON-Operations

 Note: This is being made obsolete. It will soon be replaced by the JSON2 type.
*/

/**
 * UTILITY FUNCTIONS
 */

/**
 * Checks if the passed object is an Array instance. Can't use Array.isArray
 * yet because its not supported on IE8.
 *
 * @param obj
 * @returns {boolean}
 */
var isArray = function(obj) {
  return Object.prototype.toString.call(obj) == '[object Array]';
};

/**
 * Checks if the passed object is an Object instance.
 * No function call (fast) version
 *
 * @param obj
 * @returns {boolean}
 */
var isObject = function(obj) {
  return (!!obj) && (obj.constructor === Object);
};

/**
 * Clones the passed object using JSON serialization (which is slow).
 *
 * hax, copied from test/types/json. Apparently this is still the fastest way
 * to deep clone an object, assuming we have browser support for JSON.  @see
 * http://jsperf.com/cloning-an-object/12
 */
var clone = function(o) {
  return JSON.parse(JSON.stringify(o));
};

/**
 * JSON OT Type
 * @type {*}
 */
var json = {
  name: 'json0',
  uri: 'http://sharejs.org/types/JSONv0'
};

// You can register another OT type as a subtype in a JSON document using
// the following function. This allows another type to handle certain
// operations instead of the builtin JSON type.
var subtypes = {};
json.registerSubtype = function(subtype) {
  subtypes[subtype.name] = subtype;
};

json.create = function(data) {
  // Null instead of undefined if you don't pass an argument.
  return data === undefined ? null : clone(data);
};

json.invertComponent = function(c) {
  var c_ = {p: c.p};

  // handle subtype ops
  if (c.t && subtypes[c.t]) {
    c_.t = c.t;
    c_.o = subtypes[c.t].invert(c.o);
  }

  if (c.si !== void 0) c_.sd = c.si;
  if (c.sd !== void 0) c_.si = c.sd;
  if (c.oi !== void 0) c_.od = c.oi;
  if (c.od !== void 0) c_.oi = c.od;
  if (c.li !== void 0) c_.ld = c.li;
  if (c.ld !== void 0) c_.li = c.ld;
  if (c.na !== void 0) c_.na = -c.na;

  if (c.lm !== void 0) {
    c_.lm = c.p[c.p.length-1];
    c_.p = c.p.slice(0,c.p.length-1).concat([c.lm]);
  }

  return c_;
};

json.invert = function(op) {
  var op_ = op.slice().reverse();
  var iop = [];
  for (var i = 0; i < op_.length; i++) {
    iop.push(json.invertComponent(op_[i]));
  }
  return iop;
};

json.checkValidOp = function(op) {
  for (var i = 0; i < op.length; i++) {
    if (!isArray(op[i].p)) throw new Error('Missing path');
  }
};

json.checkList = function(elem) {
  if (!isArray(elem))
    throw new Error('Referenced element not a list');
};

json.checkObj = function(elem) {
  if (!isObject(elem)) {
    throw new Error("Referenced element not an object (it was " + JSON.stringify(elem) + ")");
  }
};

// helper functions to convert old string ops to and from subtype ops
function convertFromText(c) {
  c.t = 'text0';
  var o = {p: c.p.pop()};
  if (c.si != null) o.i = c.si;
  if (c.sd != null) o.d = c.sd;
  c.o = [o];
}

function convertToText(c) {
  c.p.push(c.o[0].p);
  if (c.o[0].i != null) c.si = c.o[0].i;
  if (c.o[0].d != null) c.sd = c.o[0].d;
  delete c.t;
  delete c.o;
}

json.apply = function(snapshot, op) {
  json.checkValidOp(op);

  op = clone(op);

  var container = {
    data: snapshot
  };

  for (var i = 0; i < op.length; i++) {
    var c = op[i];

    // convert old string ops to use subtype for backwards compatibility
    if (c.si != null || c.sd != null)
      convertFromText(c);

    var parent = null;
    var parentKey = null;
    var elem = container;
    var key = 'data';

    for (var j = 0; j < c.p.length; j++) {
      var p = c.p[j];

      parent = elem;
      parentKey = key;
      elem = elem[key];
      key = p;

      if (parent == null)
        throw new Error('Path invalid');
    }

    // handle subtype ops
    if (c.t && c.o !== void 0 && subtypes[c.t]) {
      elem[key] = subtypes[c.t].apply(elem[key], c.o);

    // Number add
    } else if (c.na !== void 0) {
      if (typeof elem[key] != 'number')
        throw new Error('Referenced element not a number');

      elem[key] += c.na;
    }

    // List replace
    else if (c.li !== void 0 && c.ld !== void 0) {
      json.checkList(elem);
      // Should check the list element matches c.ld
      elem[key] = c.li;
    }

    // List insert
    else if (c.li !== void 0) {
      json.checkList(elem);
      elem.splice(key,0, c.li);
    }

    // List delete
    else if (c.ld !== void 0) {
      json.checkList(elem);
      // Should check the list element matches c.ld here too.
      elem.splice(key,1);
    }

    // List move
    else if (c.lm !== void 0) {
      json.checkList(elem);
      if (c.lm != key) {
        var e = elem[key];
        // Remove it...
        elem.splice(key,1);
        // And insert it back.
        elem.splice(c.lm,0,e);
      }
    }

    // Object insert / replace
    else if (c.oi !== void 0) {
      json.checkObj(elem);

      // Should check that elem[key] == c.od
      elem[key] = c.oi;
    }

    // Object delete
    else if (c.od !== void 0) {
      json.checkObj(elem);

      // Should check that elem[key] == c.od
      delete elem[key];
    }

    else {
      throw new Error('invalid / missing instruction in op');
    }
  }

  return container.data;
};

// Helper to break an operation up into a bunch of small ops.
json.shatter = function(op) {
  var results = [];
  for (var i = 0; i < op.length; i++) {
    results.push([op[i]]);
  }
  return results;
};

// Helper for incrementally applying an operation to a snapshot. Calls yield
// after each op component has been applied.
json.incrementalApply = function(snapshot, op, _yield) {
  for (var i = 0; i < op.length; i++) {
    var smallOp = [op[i]];
    snapshot = json.apply(snapshot, smallOp);
    // I'd just call this yield, but thats a reserved keyword. Bah!
    _yield(smallOp, snapshot);
  }

  return snapshot;
};

// Checks if two paths, p1 and p2 match.
var pathMatches = json.pathMatches = function(p1, p2, ignoreLast) {
  if (p1.length != p2.length)
    return false;

  for (var i = 0; i < p1.length; i++) {
    if (p1[i] !== p2[i] && (!ignoreLast || i !== p1.length - 1))
      return false;
  }

  return true;
};

json.append = function(dest,c) {
  c = clone(c);

  if (dest.length === 0) {
    dest.push(c);
    return;
  }

  var last = dest[dest.length - 1];

  // convert old string ops to use subtype for backwards compatibility
  if ((c.si != null || c.sd != null) && (last.si != null || last.sd != null)) {
    convertFromText(c);
    convertFromText(last);
  }

  if (pathMatches(c.p, last.p)) {
    // handle subtype ops
    if (c.t && last.t && c.t === last.t && subtypes[c.t]) {
      last.o = subtypes[c.t].compose(last.o, c.o);

      // convert back to old string ops
      if (c.si != null || c.sd != null) {
        var p = c.p;
        for (var i = 0; i < last.o.length - 1; i++) {
          c.o = [last.o.pop()];
          c.p = p.slice();
          convertToText(c);
          dest.push(c);
        }

        convertToText(last);
      }
    } else if (last.na != null && c.na != null) {
      dest[dest.length - 1] = {p: last.p, na: last.na + c.na};
    } else if (last.li !== undefined && c.li === undefined && c.ld === last.li) {
      // insert immediately followed by delete becomes a noop.
      if (last.ld !== undefined) {
        // leave the delete part of the replace
        delete last.li;
      } else {
        dest.pop();
      }
    } else if (last.od !== undefined && last.oi === undefined && c.oi !== undefined && c.od === undefined) {
      last.oi = c.oi;
    } else if (last.oi !== undefined && c.od !== undefined) {
      // The last path component inserted something that the new component deletes (or replaces).
      // Just merge them.
      if (c.oi !== undefined) {
        last.oi = c.oi;
      } else if (last.od !== undefined) {
        delete last.oi;
      } else {
        // An insert directly followed by a delete turns into a no-op and can be removed.
        dest.pop();
      }
    } else if (c.lm !== undefined && c.p[c.p.length - 1] === c.lm) {
      // don't do anything
    } else {
      dest.push(c);
    }
  } else {
    // convert string ops back
    if ((c.si != null || c.sd != null) && (last.si != null || last.sd != null)) {
      convertToText(c);
      convertToText(last);
    }

    dest.push(c);
  }
};

json.compose = function(op1,op2) {
  json.checkValidOp(op1);
  json.checkValidOp(op2);

  var newOp = clone(op1);

  for (var i = 0; i < op2.length; i++) {
    json.append(newOp,op2[i]);
  }

  return newOp;
};

json.normalize = function(op) {
  var newOp = [];

  op = isArray(op) ? op : [op];

  for (var i = 0; i < op.length; i++) {
    var c = op[i];
    if (c.p == null) c.p = [];

    json.append(newOp,c);
  }

  return newOp;
};

// Returns the common length of the paths of ops a and b
json.commonLengthForOps = function(a, b) {
  var alen = a.p.length;
  var blen = b.p.length;
  if (a.na != null || a.t)
    alen++;

  if (b.na != null || b.t)
    blen++;

  if (alen === 0) return -1;
  if (blen === 0) return null;

  alen--;
  blen--;

  for (var i = 0; i < alen; i++) {
    var p = a.p[i];
    if (i >= blen || p !== b.p[i])
      return null;
  }

  return alen;
};

// Returns true if an op can affect the given path
json.canOpAffectPath = function(op, path) {
  return json.commonLengthForOps({p:path}, op) != null;
};

// transform c so it applies to a document with otherC applied.
json.transformComponent = function(dest, c, otherC, type) {
  c = clone(c);

  var common = json.commonLengthForOps(otherC, c);
  var common2 = json.commonLengthForOps(c, otherC);
  var cplength = c.p.length;
  var otherCplength = otherC.p.length;

  if (c.na != null || c.t)
    cplength++;

  if (otherC.na != null || otherC.t)
    otherCplength++;

  // if c is deleting something, and that thing is changed by otherC, we need to
  // update c to reflect that change for invertibility.
  if (common2 != null && otherCplength > cplength && c.p[common2] == otherC.p[common2]) {
    if (c.ld !== void 0) {
      var oc = clone(otherC);
      oc.p = oc.p.slice(cplength);
      c.ld = json.apply(clone(c.ld),[oc]);
    } else if (c.od !== void 0) {
      var oc = clone(otherC);
      oc.p = oc.p.slice(cplength);
      c.od = json.apply(clone(c.od),[oc]);
    }
  }

  if (common != null) {
    var commonOperand = cplength == otherCplength;

    // backward compatibility for old string ops
    var oc = otherC;
    if ((c.si != null || c.sd != null) && (otherC.si != null || otherC.sd != null)) {
      convertFromText(c);
      oc = clone(otherC);
      convertFromText(oc);
    }

    // handle subtype ops
    if (oc.t && subtypes[oc.t]) {
      if (c.t && c.t === oc.t) {
        var res = subtypes[c.t].transform(c.o, oc.o, type);

        if (res.length > 0) {
          // convert back to old string ops
          if (c.si != null || c.sd != null) {
            var p = c.p;
            for (var i = 0; i < res.length; i++) {
              c.o = [res[i]];
              c.p = p.slice();
              convertToText(c);
              json.append(dest, c);
            }
          } else {
            c.o = res;
            json.append(dest, c);
          }
        }

        return dest;
      }
    }

    // transform based on otherC
    else if (otherC.na !== void 0) {
      // this case is handled below
    } else if (otherC.li !== void 0 && otherC.ld !== void 0) {
      if (otherC.p[common] === c.p[common]) {
        // noop

        if (!commonOperand) {
          return dest;
        } else if (c.ld !== void 0) {
          // we're trying to delete the same element, -> noop
          if (c.li !== void 0 && type === 'left') {
            // we're both replacing one element with another. only one can survive
            c.ld = clone(otherC.li);
          } else {
            return dest;
          }
        }
      }
    } else if (otherC.li !== void 0) {
      if (c.li !== void 0 && c.ld === undefined && commonOperand && c.p[common] === otherC.p[common]) {
        // in li vs. li, left wins.
        if (type === 'right')
          c.p[common]++;
      } else if (otherC.p[common] <= c.p[common]) {
        c.p[common]++;
      }

      if (c.lm !== void 0) {
        if (commonOperand) {
          // otherC edits the same list we edit
          if (otherC.p[common] <= c.lm)
            c.lm++;
          // changing c.from is handled above.
        }
      }
    } else if (otherC.ld !== void 0) {
      if (c.lm !== void 0) {
        if (commonOperand) {
          if (otherC.p[common] === c.p[common]) {
            // they deleted the thing we're trying to move
            return dest;
          }
          // otherC edits the same list we edit
          var p = otherC.p[common];
          var from = c.p[common];
          var to = c.lm;
          if (p < to || (p === to && from < to))
            c.lm--;

        }
      }

      if (otherC.p[common] < c.p[common]) {
        c.p[common]--;
      } else if (otherC.p[common] === c.p[common]) {
        if (otherCplength < cplength) {
          // we're below the deleted element, so -> noop
          return dest;
        } else if (c.ld !== void 0) {
          if (c.li !== void 0) {
            // we're replacing, they're deleting. we become an insert.
            delete c.ld;
          } else {
            // we're trying to delete the same element, -> noop
            return dest;
          }
        }
      }

    } else if (otherC.lm !== void 0) {
      if (c.lm !== void 0 && cplength === otherCplength) {
        // lm vs lm, here we go!
        var from = c.p[common];
        var to = c.lm;
        var otherFrom = otherC.p[common];
        var otherTo = otherC.lm;
        if (otherFrom !== otherTo) {
          // if otherFrom == otherTo, we don't need to change our op.

          // where did my thing go?
          if (from === otherFrom) {
            // they moved it! tie break.
            if (type === 'left') {
              c.p[common] = otherTo;
              if (from === to) // ugh
                c.lm = otherTo;
            } else {
              return dest;
            }
          } else {
            // they moved around it
            if (from > otherFrom) c.p[common]--;
            if (from > otherTo) c.p[common]++;
            else if (from === otherTo) {
              if (otherFrom > otherTo) {
                c.p[common]++;
                if (from === to) // ugh, again
                  c.lm++;
              }
            }

            // step 2: where am i going to put it?
            if (to > otherFrom) {
              c.lm--;
            } else if (to === otherFrom) {
              if (to > from)
                c.lm--;
            }
            if (to > otherTo) {
              c.lm++;
            } else if (to === otherTo) {
              // if we're both moving in the same direction, tie break
              if ((otherTo > otherFrom && to > from) ||
                  (otherTo < otherFrom && to < from)) {
                if (type === 'right') c.lm++;
              } else {
                if (to > from) c.lm++;
                else if (to === otherFrom) c.lm--;
              }
            }
          }
        }
      } else if (c.li !== void 0 && c.ld === undefined && commonOperand) {
        // li
        var from = otherC.p[common];
        var to = otherC.lm;
        p = c.p[common];
        if (p > from) c.p[common]--;
        if (p > to) c.p[common]++;
      } else {
        // ld, ld+li, si, sd, na, oi, od, oi+od, any li on an element beneath
        // the lm
        //
        // i.e. things care about where their item is after the move.
        var from = otherC.p[common];
        var to = otherC.lm;
        p = c.p[common];
        if (p === from) {
          c.p[common] = to;
        } else {
          if (p > from) c.p[common]--;
          if (p > to) c.p[common]++;
          else if (p === to && from > to) c.p[common]++;
        }
      }
    }
    else if (otherC.oi !== void 0 && otherC.od !== void 0) {
      if (c.p[common] === otherC.p[common]) {
        if (c.oi !== void 0 && commonOperand) {
          // we inserted where someone else replaced
          if (type === 'right') {
            // left wins
            return dest;
          } else {
            // we win, make our op replace what they inserted
            c.od = otherC.oi;
          }
        } else {
          // -> noop if the other component is deleting the same object (or any parent)
          return dest;
        }
      }
    } else if (otherC.oi !== void 0) {
      if (c.oi !== void 0 && c.p[common] === otherC.p[common]) {
        // left wins if we try to insert at the same place
        if (type === 'left') {
          json.append(dest,{p: c.p, od:otherC.oi});
        } else {
          return dest;
        }
      }
    } else if (otherC.od !== void 0) {
      if (c.p[common] == otherC.p[common]) {
        if (!commonOperand)
          return dest;
        if (c.oi !== void 0) {
          delete c.od;
        } else {
          return dest;
        }
      }
    }
  }

  json.append(dest,c);
  return dest;
};

require('./bootstrapTransform')(json, json.transformComponent, json.checkValidOp, json.append);

/**
 * Register a subtype for string operations, using the text0 type.
 */
var text = require('./text0');

json.registerSubtype(text);
module.exports = json;


},{"./bootstrapTransform":23,"./text0":26}],26:[function(require,module,exports){
// DEPRECATED!
//
// This type works, but is not exported. Its included here because the JSON0
// embedded string operations use this library.


// A simple text implementation
//
// Operations are lists of components. Each component either inserts or deletes
// at a specified position in the document.
//
// Components are either:
//  {i:'str', p:100}: Insert 'str' at position 100 in the document
//  {d:'str', p:100}: Delete 'str' at position 100 in the document
//
// Components in an operation are executed sequentially, so the position of components
// assumes previous components have already executed.
//
// Eg: This op:
//   [{i:'abc', p:0}]
// is equivalent to this op:
//   [{i:'a', p:0}, {i:'b', p:1}, {i:'c', p:2}]

var text = module.exports = {
  name: 'text0',
  uri: 'http://sharejs.org/types/textv0',
  create: function(initial) {
    if ((initial != null) && typeof initial !== 'string') {
      throw new Error('Initial data must be a string');
    }
    return initial || '';
  }
};

/** Insert s2 into s1 at pos. */
var strInject = function(s1, pos, s2) {
  return s1.slice(0, pos) + s2 + s1.slice(pos);
};

/** Check that an operation component is valid. Throws if its invalid. */
var checkValidComponent = function(c) {
  if (typeof c.p !== 'number')
    throw new Error('component missing position field');

  if ((typeof c.i === 'string') === (typeof c.d === 'string'))
    throw new Error('component needs an i or d field');

  if (c.p < 0)
    throw new Error('position cannot be negative');
};

/** Check that an operation is valid */
var checkValidOp = function(op) {
  for (var i = 0; i < op.length; i++) {
    checkValidComponent(op[i]);
  }
};

/** Apply op to snapshot */
text.apply = function(snapshot, op) {
  var deleted;

  checkValidOp(op);
  for (var i = 0; i < op.length; i++) {
    var component = op[i];
    if (component.i != null) {
      snapshot = strInject(snapshot, component.p, component.i);
    } else {
      deleted = snapshot.slice(component.p, component.p + component.d.length);
      if (component.d !== deleted)
        throw new Error("Delete component '" + component.d + "' does not match deleted text '" + deleted + "'");

      snapshot = snapshot.slice(0, component.p) + snapshot.slice(component.p + component.d.length);
    }
  }
  return snapshot;
};

/**
 * Append a component to the end of newOp. Exported for use by the random op
 * generator and the JSON0 type.
 */
var append = text._append = function(newOp, c) {
  if (c.i === '' || c.d === '') return;

  if (newOp.length === 0) {
    newOp.push(c);
  } else {
    var last = newOp[newOp.length - 1];

    if (last.i != null && c.i != null && last.p <= c.p && c.p <= last.p + last.i.length) {
      // Compose the insert into the previous insert
      newOp[newOp.length - 1] = {i:strInject(last.i, c.p - last.p, c.i), p:last.p};

    } else if (last.d != null && c.d != null && c.p <= last.p && last.p <= c.p + c.d.length) {
      // Compose the deletes together
      newOp[newOp.length - 1] = {d:strInject(c.d, last.p - c.p, last.d), p:c.p};

    } else {
      newOp.push(c);
    }
  }
};

/** Compose op1 and op2 together */
text.compose = function(op1, op2) {
  checkValidOp(op1);
  checkValidOp(op2);
  var newOp = op1.slice();
  for (var i = 0; i < op2.length; i++) {
    append(newOp, op2[i]);
  }
  return newOp;
};

/** Clean up an op */
text.normalize = function(op) {
  var newOp = [];

  // Normalize should allow ops which are a single (unwrapped) component:
  // {i:'asdf', p:23}.
  // There's no good way to test if something is an array:
  // http://perfectionkills.com/instanceof-considered-harmful-or-how-to-write-a-robust-isarray/
  // so this is probably the least bad solution.
  if (op.i != null || op.p != null) op = [op];

  for (var i = 0; i < op.length; i++) {
    var c = op[i];
    if (c.p == null) c.p = 0;

    append(newOp, c);
  }

  return newOp;
};

// This helper method transforms a position by an op component.
//
// If c is an insert, insertAfter specifies whether the transform
// is pushed after the insert (true) or before it (false).
//
// insertAfter is optional for deletes.
var transformPosition = function(pos, c, insertAfter) {
  // This will get collapsed into a giant ternary by uglify.
  if (c.i != null) {
    if (c.p < pos || (c.p === pos && insertAfter)) {
      return pos + c.i.length;
    } else {
      return pos;
    }
  } else {
    // I think this could also be written as: Math.min(c.p, Math.min(c.p -
    // otherC.p, otherC.d.length)) but I think its harder to read that way, and
    // it compiles using ternary operators anyway so its no slower written like
    // this.
    if (pos <= c.p) {
      return pos;
    } else if (pos <= c.p + c.d.length) {
      return c.p;
    } else {
      return pos - c.d.length;
    }
  }
};

// Helper method to transform a cursor position as a result of an op.
//
// Like transformPosition above, if c is an insert, insertAfter specifies
// whether the cursor position is pushed after an insert (true) or before it
// (false).
text.transformCursor = function(position, op, side) {
  var insertAfter = side === 'right';
  for (var i = 0; i < op.length; i++) {
    position = transformPosition(position, op[i], insertAfter);
  }

  return position;
};

// Transform an op component by another op component. Asymmetric.
// The result will be appended to destination.
//
// exported for use in JSON type
var transformComponent = text._tc = function(dest, c, otherC, side) {
  //var cIntersect, intersectEnd, intersectStart, newC, otherIntersect, s;

  checkValidComponent(c);
  checkValidComponent(otherC);

  if (c.i != null) {
    // Insert.
    append(dest, {i:c.i, p:transformPosition(c.p, otherC, side === 'right')});
  } else {
    // Delete
    if (otherC.i != null) {
      // Delete vs insert
      var s = c.d;
      if (c.p < otherC.p) {
        append(dest, {d:s.slice(0, otherC.p - c.p), p:c.p});
        s = s.slice(otherC.p - c.p);
      }
      if (s !== '')
        append(dest, {d: s, p: c.p + otherC.i.length});

    } else {
      // Delete vs delete
      if (c.p >= otherC.p + otherC.d.length)
        append(dest, {d: c.d, p: c.p - otherC.d.length});
      else if (c.p + c.d.length <= otherC.p)
        append(dest, c);
      else {
        // They overlap somewhere.
        var newC = {d: '', p: c.p};

        if (c.p < otherC.p)
          newC.d = c.d.slice(0, otherC.p - c.p);

        if (c.p + c.d.length > otherC.p + otherC.d.length)
          newC.d += c.d.slice(otherC.p + otherC.d.length - c.p);

        // This is entirely optional - I'm just checking the deleted text in
        // the two ops matches
        var intersectStart = Math.max(c.p, otherC.p);
        var intersectEnd = Math.min(c.p + c.d.length, otherC.p + otherC.d.length);
        var cIntersect = c.d.slice(intersectStart - c.p, intersectEnd - c.p);
        var otherIntersect = otherC.d.slice(intersectStart - otherC.p, intersectEnd - otherC.p);
        if (cIntersect !== otherIntersect)
          throw new Error('Delete ops delete different text in the same region of the document');

        if (newC.d !== '') {
          newC.p = transformPosition(newC.p, otherC);
          append(dest, newC);
        }
      }
    }
  }

  return dest;
};

var invertComponent = function(c) {
  return (c.i != null) ? {d:c.i, p:c.p} : {i:c.d, p:c.p};
};

// No need to use append for invert, because the components won't be able to
// cancel one another.
text.invert = function(op) {
  // Shallow copy & reverse that sucka.
  op = op.slice().reverse();
  for (var i = 0; i < op.length; i++) {
    op[i] = invertComponent(op[i]);
  }
  return op;
};

require('./bootstrapTransform')(text, transformComponent, checkValidOp, append);

},{"./bootstrapTransform":23}],27:[function(require,module,exports){
module.exports = {
  type: require('./text-tp2')
};

},{"./text-tp2":28}],28:[function(require,module,exports){
// A TP2 implementation of text, following this spec:
// http://code.google.com/p/lightwave/source/browse/trunk/experimental/ot/README
//
// A document is made up of a string and a set of tombstones inserted throughout
// the string. For example, 'some ', (2 tombstones), 'string'.
//
// This is encoded in a document as ['some ', (2 tombstones), 'string']
// (It should be encoded as {s:'some string', t:[5, -2, 6]} because thats
// faster in JS, but its not.)
//
// Ops are lists of components which iterate over the whole document. (I might
// change this at some point, but a version thats less strict is backwards
// compatible.)
//
// Components are either:
//   N:         Skip N characters in the original document
//   {i:'str'}: Insert 'str' at the current position in the document
//   {i:N}:     Insert N tombstones at the current position in the document
//   {d:N}:     Delete (tombstone) N characters at the current position in the document
//
// Eg: [3, {i:'hi'}, 5, {d:8}]
//
// Snapshots are lists with characters and tombstones. Characters are stored in strings
// and adjacent tombstones are flattened into numbers.
//
// Eg, the document: 'Hello .....world' ('.' denotes tombstoned (deleted) characters)
// would be represented by a document snapshot of ['Hello ', 5, 'world']

var type = module.exports = {
  name: 'text-tp2',
  tp2: true,
  uri: 'http://sharejs.org/types/text-tp2v1',
  create: function(initial) {
    if (initial == null) {
      initial = '';
    } else {
      if (typeof initial != 'string') throw new Error('Initial data must be a string');
    }

    return {
      charLength: initial.length,
      totalLength: initial.length,
      data: initial.length ? [initial] : []
    };
  },

  serialize: function(doc) {
    if (!doc.data) {
      throw new Error('invalid doc snapshot');
    }
    return doc.data;
  },

  deserialize: function(data) {
    var doc = type.create();
    doc.data = data;

    for (var i = 0; i < data.length; i++) {
      var component = data[i];

      if (typeof component === 'string') {
        doc.charLength += component.length;
        doc.totalLength += component.length;
      } else {
        doc.totalLength += component;
      }
    }

    return doc;
  }
};

var isArray = Array.isArray || function(obj) {
  return Object.prototype.toString.call(obj) == '[object Array]';
};

var checkOp = function(op) {
  if (!isArray(op)) throw new Error('Op must be an array of components');

  var last = null;
  for (var i = 0; i < op.length; i++) {
    var c = op[i];
    if (typeof c == 'object') {
      // The component is an insert or a delete.
      if (c.i !== undefined) { // Insert.
        if (!((typeof c.i === 'string' && c.i.length > 0) // String inserts
              || (typeof c.i === 'number' && c.i > 0))) // Tombstone inserts
          throw new Error('Inserts must insert a string or a +ive number');

      } else if (c.d !== undefined) { // Delete
        if (!(typeof c.d === 'number' && c.d > 0))
          throw new Error('Deletes must be a +ive number');

      } else throw new Error('Operation component must define .i or .d');

    } else {
      // The component must be a skip.
      if (typeof c != 'number') throw new Error('Op components must be objects or numbers');

      if (c <= 0) throw new Error('Skip components must be a positive number');
      if (typeof last === 'number') throw new Error('Adjacent skip components should be combined');
    }

    last = c;
  }
};

// Take the next part from the specified position in a document snapshot.
// position = {index, offset}. It will be updated.
var takeDoc = type._takeDoc = function(doc, position, maxlength, tombsIndivisible) {
  if (position.index >= doc.data.length)
    throw new Error('Operation goes past the end of the document');

  var part = doc.data[position.index];

  // This can be written as an ugly-arsed giant ternary statement, but its much
  // more readable like this. Uglify will convert it into said ternary anyway.
  var result;
  if (typeof part == 'string') {
    if (maxlength != null) {
      result = part.slice(position.offset, position.offset + maxlength);
    } else {
      result = part.slice(position.offset);
    }
  } else {
    if (maxlength == null || tombsIndivisible) {
      result = part - position.offset;
    } else {
      result = Math.min(maxlength, part - position.offset);
    }
  }

  var resultLen = result.length || result;

  if ((part.length || part) - position.offset > resultLen) {
    position.offset += resultLen;
  } else {
    position.index++;
    position.offset = 0;
  }

  return result;
};

// Append a part to the end of a document
var appendDoc = type._appendDoc = function(doc, p) {
  if (p === 0 || p === '') return;

  if (typeof p === 'string') {
    doc.charLength += p.length;
    doc.totalLength += p.length;
  } else {
    doc.totalLength += p;
  }

  var data = doc.data;
  if (data.length === 0) {
    data.push(p);
  } else if (typeof data[data.length - 1] === typeof p) {
    data[data.length - 1] += p;
  } else {
    data.push(p);
  }
};

// Apply the op to the document. The document is not modified in the process.
type.apply = function(doc, op) {
  if (doc.totalLength == null || doc.charLength == null || !isArray(doc.data)) {
    throw new Error('Snapshot is invalid');
  }
  checkOp(op);

  var newDoc = type.create();
  var position = {index: 0, offset: 0};

  for (var i = 0; i < op.length; i++) {
    var component = op[i];
    var remainder, part;

    if (typeof component == 'number') { // Skip
      remainder = component;
      while (remainder > 0) {
        part = takeDoc(doc, position, remainder);
        appendDoc(newDoc, part);
        remainder -= part.length || part;
      }

    } else if (component.i !== undefined) { // Insert
      appendDoc(newDoc, component.i);

    } else if (component.d !== undefined) { // Delete
      remainder = component.d;
      while (remainder > 0) {
        part = takeDoc(doc, position, remainder);
        remainder -= part.length || part;
      }
      appendDoc(newDoc, component.d);
    }
  }
  return newDoc;
};

// Append an op component to the end of the specified op.  Exported for the
// randomOpGenerator.
var append = type._append = function(op, component) {
  var last;

  if (component === 0 || component.i === '' || component.i === 0 || component.d === 0) {
    // Drop the new component.
  } else if (op.length === 0) {
    op.push(component);
  } else {
    last = op[op.length - 1];
    if (typeof component == 'number' && typeof last == 'number') {
      op[op.length - 1] += component;
    } else if (component.i != null && (last.i != null) && typeof last.i === typeof component.i) {
      last.i += component.i;
    } else if (component.d != null && (last.d != null)) {
      last.d += component.d;
    } else {
      op.push(component);
    }
  }
};

var take = function(op, cursor, maxlength, insertsIndivisible) {
  if (cursor.index === op.length) return null;
  var e = op[cursor.index];
  var current;
  var result;

  var offset = cursor.offset;

  // if the current element is a skip, an insert of a number or a delete
  if (typeof (current = e) == 'number' || typeof (current = e.i) == 'number' || (current = e.d) != null) {
    var c;
    if ((maxlength == null) || current - offset <= maxlength || (insertsIndivisible && e.i != null)) {
      // Return the rest of the current element.
      c = current - offset;
      ++cursor.index;
      cursor.offset = 0;
    } else {
      cursor.offset += maxlength;
      c = maxlength;
    }

    // Package the component back up.
    if (e.i != null) {
      return {i: c};
    } else if (e.d != null) {
      return {d: c};
    } else {
      return c;
    }
  } else { // Insert of a string.
    if ((maxlength == null) || e.i.length - offset <= maxlength || insertsIndivisible) {
      result = {i: e.i.slice(offset)};
      ++cursor.index;
      cursor.offset = 0;
    } else {
      result = {i: e.i.slice(offset, offset + maxlength)};
      cursor.offset += maxlength;
    }
    return result;
  }
};

// Find and return the length of an op component
var componentLength = function(component) {
  if (typeof component === 'number') {
    return component;
  } else if (typeof component.i === 'string') {
    return component.i.length;
  } else {
    return component.d || component.i;
  }
};

// Normalize an op, removing all empty skips and empty inserts / deletes.
// Concatenate adjacent inserts and deletes.
type.normalize = function(op) {
  var newOp = [];
  for (var i = 0; i < op.length; i++) {
    append(newOp, op[i]);
  }
  return newOp;
};

// This is a helper method to transform and prune. goForwards is true for transform, false for prune.
var transformer = function(op, otherOp, goForwards, side) {
  checkOp(op);
  checkOp(otherOp);

  var newOp = [];

  // Cursor moving over op. Used by take
  var cursor = {index:0, offset:0};

  for (var i = 0; i < otherOp.length; i++) {
    var component = otherOp[i];
    var len = componentLength(component);
    var chunk;

    if (component.i != null) { // Insert text or tombs
      if (goForwards) { // Transform - insert skips over deleted parts.
        if (side === 'left') {
          // The left side insert should go first.
          var next;
          while ((next = op[cursor.index]) && next.i != null) {
            append(newOp, take(op, cursor));
          }
        }
        // In any case, skip the inserted text.
        append(newOp, len);

      } else { // Prune. Remove skips for inserts.
        while (len > 0) {
          chunk = take(op, cursor, len, true);

          // The chunk will be null if we run out of components in the other op.
          if (chunk === null) throw new Error('The transformed op is invalid');
          if (chunk.d != null)
            throw new Error('The transformed op deletes locally inserted characters - it cannot be purged of the insert.');

          if (typeof chunk == 'number')
            len -= chunk;
          else
            append(newOp, chunk);
        }
      }
    } else { // Skips or deletes.
      while (len > 0) {
        chunk = take(op, cursor, len, true);
        if (chunk === null) throw new Error('The op traverses more elements than the document has');

        append(newOp, chunk);
        if (!chunk.i) len -= componentLength(chunk);
      }
    }
  }

  // Append extras from op1.
  var component;
  while ((component = take(op, cursor))) {
    if (component.i === undefined) {
      throw new Error("Remaining fragments in the op: " + component);
    }
    append(newOp, component);
  }
  return newOp;
};

// transform op1 by op2. Return transformed version of op1. op1 and op2 are
// unchanged by transform. Side should be 'left' or 'right', depending on if
// op1.id <> op2.id.
//
// 'left' == client op for ShareJS.
type.transform = function(op, otherOp, side) {
  if (side != 'left' && side != 'right')
    throw new Error("side (" + side + ") should be 'left' or 'right'");

  return transformer(op, otherOp, true, side);
};

type.prune = function(op, otherOp) {
  return transformer(op, otherOp, false);
};

type.compose = function(op1, op2) {
  //var chunk, chunkLength, component, length, result, take, _, _i, _len, _ref;
  if (op1 == null) return op2;

  checkOp(op1);
  checkOp(op2);

  var result = [];

  // Cursor over op1.
  var cursor = {index:0, offset:0};

  var component;

  for (var i = 0; i < op2.length; i++) {
    component = op2[i];
    var len, chunk;

    if (typeof component === 'number') { // Skip
      // Just copy from op1.
      len = component;
      while (len > 0) {
        chunk = take(op1, cursor, len);
        if (chunk === null)
          throw new Error('The op traverses more elements than the document has');

        append(result, chunk);
        len -= componentLength(chunk);
      }

    } else if (component.i !== undefined) { // Insert
      append(result, {i: component.i});

    } else { // Delete
      len = component.d;
      while (len > 0) {
        chunk = take(op1, cursor, len);
        if (chunk === null)
          throw new Error('The op traverses more elements than the document has');

        var chunkLength = componentLength(chunk);

        if (chunk.i !== undefined)
          append(result, {i: chunkLength});
        else
          append(result, {d: chunkLength});

        len -= chunkLength;
      }
    }
  }

  // Append extras from op1.
  while ((component = take(op1, cursor))) {
    if (component.i === undefined) {
      throw new Error("Remaining fragments in op1: " + component);
    }
    append(result, component);
  }
  return result;
};


},{}],29:[function(require,module,exports){
// Text document API for the 'text' type. This implements some standard API
// methods for any text-like type, so you can easily bind a textarea or
// something without being fussy about the underlying OT implementation.
//
// The API is desigend as a set of functions to be mixed in to some context
// object as part of its lifecycle. It expects that object to have getSnapshot
// and submitOp methods, and call _onOp when an operation is received.
//
// This API defines:
//
// - getLength() returns the length of the document in characters
// - getText() returns a string of the document
// - insert(pos, text, [callback]) inserts text at position pos in the document
// - remove(pos, length, [callback]) removes length characters at position pos
//
// A user can define:
// - onInsert(pos, text): Called when text is inserted.
// - onRemove(pos, length): Called when text is removed.

module.exports = api;
function api(getSnapshot, submitOp) {
  return {
    // Returns the text content of the document
    get: function() { return getSnapshot(); },

    // Returns the number of characters in the string
    getLength: function() { return getSnapshot().length; },

    // Insert the specified text at the given position in the document
    insert: function(pos, text, callback) {
      return submitOp([pos, text], callback);
    },

    remove: function(pos, length, callback) {
      return submitOp([pos, {d:length}], callback);
    },

    // When you use this API, you should implement these two methods
    // in your editing context.
    //onInsert: function(pos, text) {},
    //onRemove: function(pos, removedLength) {},

    _onOp: function(op) {
      var pos = 0;
      var spos = 0;
      for (var i = 0; i < op.length; i++) {
        var component = op[i];
        switch (typeof component) {
          case 'number':
            pos += component;
            spos += component;
            break;
          case 'string':
            if (this.onInsert) this.onInsert(pos, component);
            pos += component.length;
            break;
          case 'object':
            if (this.onRemove) this.onRemove(pos, component.d);
            spos += component.d;
        }
      }
    }
  };
};
api.provides = {text: true};

},{}],30:[function(require,module,exports){
var type = require('./text');
type.api = require('./api');

module.exports = {
  type: type
};

},{"./api":29,"./text":31}],31:[function(require,module,exports){
/* Text OT!
 *
 * This is an OT implementation for text. It is the standard implementation of
 * text used by ShareJS.
 *
 * This type is composable but non-invertable. Its similar to ShareJS's old
 * text-composable type, but its not invertable and its very similar to the
 * text-tp2 implementation but it doesn't support tombstones or purging.
 *
 * Ops are lists of components which iterate over the document.
 * Components are either:
 *   A number N: Skip N characters in the original document
 *   "str"     : Insert "str" at the current position in the document
 *   {d:N}     : Delete N characters at the current position in the document
 *
 * Eg: [3, 'hi', 5, {d:8}]
 *
 * The operation does not have to skip the last characters in the document.
 *
 * Snapshots are strings.
 *
 * Cursors are either a single number (which is the cursor position) or a pair of
 * [anchor, focus] (aka [start, end]). Be aware that end can be before start.
 */

/** @module text */

exports.name = 'text';
exports.uri = 'http://sharejs.org/types/textv1';

/** Create a new text snapshot.
 *
 * @param {string} initial - initial snapshot data. Optional. Defaults to ''.
 */
exports.create = function(initial) {
  if ((initial != null) && typeof initial !== 'string') {
    throw Error('Initial data must be a string');
  }
  return initial || '';
};

var isArray = Array.isArray || function(obj) {
  return Object.prototype.toString.call(obj) === "[object Array]";
};

/** Check the operation is valid. Throws if not valid. */
var checkOp = function(op) {
  if (!isArray(op)) throw Error('Op must be an array of components');

  var last = null;
  for (var i = 0; i < op.length; i++) {
    var c = op[i];
    switch (typeof c) {
      case 'object':
        // The only valid objects are {d:X} for +ive values of X.
        if (!(typeof c.d === 'number' && c.d > 0)) throw Error('Object components must be deletes of size > 0');
        break;
      case 'string':
        // Strings are inserts.
        if (!(c.length > 0)) throw Error('Inserts cannot be empty');
        break;
      case 'number':
        // Numbers must be skips. They have to be +ive numbers.
        if (!(c > 0)) throw Error('Skip components must be >0');
        if (typeof last === 'number') throw Error('Adjacent skip components should be combined');
        break;
    }
    last = c;
  }

  if (typeof last === 'number') throw Error('Op has a trailing skip');
};

/** Check that the given selection range is valid. */
var checkSelection = function(selection) {
  // This may throw from simply inspecting selection[0] / selection[1]. Thats
  // sort of ok, though it'll generate the wrong message.
  if (typeof selection !== 'number'
      && (typeof selection[0] !== 'number' || typeof selection[1] !== 'number'))
    throw Error('Invalid selection');
};

/** Make a function that appends to the given operation. */
var makeAppend = function(op) {
  return function(component) {
    if (!component || component.d === 0) {
      // The component is a no-op. Ignore!
 
    } else if (op.length === 0) {
      return op.push(component);

    } else if (typeof component === typeof op[op.length - 1]) {
      if (typeof component === 'object') {
        return op[op.length - 1].d += component.d;
      } else {
        return op[op.length - 1] += component;
      }
    } else {
      return op.push(component);
    }
  };
};

/** Makes and returns utility functions take and peek. */
var makeTake = function(op) {
  // The index of the next component to take
  var idx = 0;
  // The offset into the component
  var offset = 0;

  // Take up to length n from the front of op. If n is -1, take the entire next
  // op component. If indivisableField == 'd', delete components won't be separated.
  // If indivisableField == 'i', insert components won't be separated.
  var take = function(n, indivisableField) {
    // We're at the end of the operation. The op has skips, forever. Infinity
    // might make more sense than null here.
    if (idx === op.length)
      return n === -1 ? null : n;

    var part;
    var c = op[idx];
    if (typeof c === 'number') {
      // Skip
      if (n === -1 || c - offset <= n) {
        part = c - offset;
        ++idx;
        offset = 0;
        return part;
      } else {
        offset += n;
        return n;
      }
    } else if (typeof c === 'string') {
      // Insert
      if (n === -1 || indivisableField === 'i' || c.length - offset <= n) {
        part = c.slice(offset);
        ++idx;
        offset = 0;
        return part;
      } else {
        part = c.slice(offset, offset + n);
        offset += n;
        return part;
      }
    } else {
      // Delete
      if (n === -1 || indivisableField === 'd' || c.d - offset <= n) {
        part = {d: c.d - offset};
        ++idx;
        offset = 0;
        return part;
      } else {
        offset += n;
        return {d: n};
      }
    }
  };

  // Peek at the next op that will be returned.
  var peekType = function() { return op[idx]; };

  return [take, peekType];
};

/** Get the length of a component */
var componentLength = function(c) {
  // Uglify will compress this down into a ternary
  if (typeof c === 'number') {
    return c;
  } else {
    return c.length || c.d;
  }
};

/** Trim any excess skips from the end of an operation.
 *
 * There should only be at most one, because the operation was made with append.
 */
var trim = function(op) {
  if (op.length > 0 && typeof op[op.length - 1] === 'number') {
    op.pop();
  }
  return op;
};

exports.normalize = function(op) {
  var newOp = [];
  var append = makeAppend(newOp);
  for (var i = 0; i < op.length; i++) {
    append(op[i]);
  }
  return trim(newOp);
};

/** Apply an operation to a document snapshot */
exports.apply = function(str, op) {
  if (typeof str !== 'string') {
    throw Error('Snapshot should be a string');
  }
  checkOp(op);

  // We'll gather the new document here and join at the end.
  var newDoc = [];

  for (var i = 0; i < op.length; i++) {
    var component = op[i];
    switch (typeof component) {
      case 'number':
        if (component > str.length) throw Error('The op is too long for this document');

        newDoc.push(str.slice(0, component));
        // This might be slow for big strings. Consider storing the offset in
        // str instead of rewriting it each time.
        str = str.slice(component);
        break;
      case 'string':
        newDoc.push(component);
        break;
      case 'object':
        str = str.slice(component.d);
        break;
    }
  }

  return newDoc.join('') + str;
};

/** Transform op by otherOp.
 *
 * @param op - The operation to transform
 * @param otherOp - Operation to transform it by
 * @param side - Either 'left' or 'right'
 */
exports.transform = function(op, otherOp, side) {
  if (side != 'left' && side != 'right') throw Error("side (" + side + ") must be 'left' or 'right'");

  checkOp(op);
  checkOp(otherOp);

  var newOp = [];
  var append = makeAppend(newOp);

  var _fns = makeTake(op);
  var take = _fns[0],
      peek = _fns[1];

  for (var i = 0; i < otherOp.length; i++) {
    var component = otherOp[i];

    var length, chunk;
    switch (typeof component) {
      case 'number': // Skip
        length = component;
        while (length > 0) {
          chunk = take(length, 'i');
          append(chunk);
          if (typeof chunk !== 'string') {
            length -= componentLength(chunk);
          }
        }
        break;

      case 'string': // Insert
        if (side === 'left') {
          // The left insert should go first.
          if (typeof peek() === 'string') {
            append(take(-1));
          }
        }

        // Otherwise skip the inserted text.
        append(component.length);
        break;

      case 'object': // Delete
        length = component.d;
        while (length > 0) {
          chunk = take(length, 'i');
          switch (typeof chunk) {
            case 'number':
              length -= chunk;
              break;
            case 'string':
              append(chunk);
              break;
            case 'object':
              // The delete is unnecessary now - the text has already been deleted.
              length -= chunk.d;
          }
        }
        break;
    }
  }
  
  // Append any extra data in op1.
  while ((component = take(-1)))
    append(component);
  
  return trim(newOp);
};

/** Compose op1 and op2 together and return the result */
exports.compose = function(op1, op2) {
  checkOp(op1);
  checkOp(op2);

  var result = [];
  var append = makeAppend(result);
  var take = makeTake(op1)[0];

  for (var i = 0; i < op2.length; i++) {
    var component = op2[i];
    var length, chunk;
    switch (typeof component) {
      case 'number': // Skip
        length = component;
        while (length > 0) {
          chunk = take(length, 'd');
          append(chunk);
          if (typeof chunk !== 'object') {
            length -= componentLength(chunk);
          }
        }
        break;

      case 'string': // Insert
        append(component);
        break;

      case 'object': // Delete
        length = component.d;

        while (length > 0) {
          chunk = take(length, 'd');

          switch (typeof chunk) {
            case 'number':
              append({d: chunk});
              length -= chunk;
              break;
            case 'string':
              length -= chunk.length;
              break;
            case 'object':
              append(chunk);
          }
        }
        break;
    }
  }

  while ((component = take(-1)))
    append(component);

  return trim(result);
};


var transformPosition = function(cursor, op) {
  var pos = 0;
  for (var i = 0; i < op.length; i++) {
    var c = op[i];
    if (cursor <= pos) break;

    // I could actually use the op_iter stuff above - but I think its simpler
    // like this.
    switch (typeof c) {
      case 'number':
        if (cursor <= pos + c)
          return cursor;
        pos += c;
        break;

      case 'string':
        pos += c.length;
        cursor += c.length;
        break;

      case 'object':
        cursor -= Math.min(c.d, cursor - pos);
        break;
    }
  }
  return cursor;
};

exports.transformSelection = function(selection, op, isOwnOp) {
  var pos = 0;
  if (isOwnOp) {
    // Just track the position. We'll teleport the cursor to the end anyway.
    // This works because text ops don't have any trailing skips at the end - so the last
    // component is the last thing.
    for (var i = 0; i < op.length; i++) {
      var c = op[i];
      switch (typeof c) {
        case 'number':
          pos += c;
          break;
        case 'string':
          pos += c.length;
          break;
        // Just eat deletes.
      }
    }
    return pos;
  } else {
    return typeof selection === 'number' ?
      transformPosition(selection, op) : [transformPosition(selection[0], op), transformPosition(selection[1], op)];
  }
};

exports.selectionEq = function(c1, c2) {
  if (c1[0] != null && c1[0] === c1[1]) c1 = c1[0];
  if (c2[0] != null && c2[0] === c2[1]) c2 = c2[0];
  return c1 === c2 || (c1[0] != null && c2[0] != null && c1[0] === c2[0] && c1[1] == c2[1]);
};


},{}],32:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require("g5I+bs"))
},{"g5I+bs":33}],33:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],34:[function(require,module,exports){
(function (global){
/*! http://mths.be/punycode v1.2.4 by @mathias */
;(function(root) {

	/** Detect free variables */
	var freeExports = typeof exports == 'object' && exports;
	var freeModule = typeof module == 'object' && module &&
		module.exports == freeExports && module;
	var freeGlobal = typeof global == 'object' && global;
	if (freeGlobal.global === freeGlobal || freeGlobal.window === freeGlobal) {
		root = freeGlobal;
	}

	/**
	 * The `punycode` object.
	 * @name punycode
	 * @type Object
	 */
	var punycode,

	/** Highest positive signed 32-bit float value */
	maxInt = 2147483647, // aka. 0x7FFFFFFF or 2^31-1

	/** Bootstring parameters */
	base = 36,
	tMin = 1,
	tMax = 26,
	skew = 38,
	damp = 700,
	initialBias = 72,
	initialN = 128, // 0x80
	delimiter = '-', // '\x2D'

	/** Regular expressions */
	regexPunycode = /^xn--/,
	regexNonASCII = /[^ -~]/, // unprintable ASCII chars + non-ASCII chars
	regexSeparators = /\x2E|\u3002|\uFF0E|\uFF61/g, // RFC 3490 separators

	/** Error messages */
	errors = {
		'overflow': 'Overflow: input needs wider integers to process',
		'not-basic': 'Illegal input >= 0x80 (not a basic code point)',
		'invalid-input': 'Invalid input'
	},

	/** Convenience shortcuts */
	baseMinusTMin = base - tMin,
	floor = Math.floor,
	stringFromCharCode = String.fromCharCode,

	/** Temporary variable */
	key;

	/*--------------------------------------------------------------------------*/

	/**
	 * A generic error utility function.
	 * @private
	 * @param {String} type The error type.
	 * @returns {Error} Throws a `RangeError` with the applicable error message.
	 */
	function error(type) {
		throw RangeError(errors[type]);
	}

	/**
	 * A generic `Array#map` utility function.
	 * @private
	 * @param {Array} array The array to iterate over.
	 * @param {Function} callback The function that gets called for every array
	 * item.
	 * @returns {Array} A new array of values returned by the callback function.
	 */
	function map(array, fn) {
		var length = array.length;
		while (length--) {
			array[length] = fn(array[length]);
		}
		return array;
	}

	/**
	 * A simple `Array#map`-like wrapper to work with domain name strings.
	 * @private
	 * @param {String} domain The domain name.
	 * @param {Function} callback The function that gets called for every
	 * character.
	 * @returns {Array} A new string of characters returned by the callback
	 * function.
	 */
	function mapDomain(string, fn) {
		return map(string.split(regexSeparators), fn).join('.');
	}

	/**
	 * Creates an array containing the numeric code points of each Unicode
	 * character in the string. While JavaScript uses UCS-2 internally,
	 * this function will convert a pair of surrogate halves (each of which
	 * UCS-2 exposes as separate characters) into a single code point,
	 * matching UTF-16.
	 * @see `punycode.ucs2.encode`
	 * @see <http://mathiasbynens.be/notes/javascript-encoding>
	 * @memberOf punycode.ucs2
	 * @name decode
	 * @param {String} string The Unicode input string (UCS-2).
	 * @returns {Array} The new array of code points.
	 */
	function ucs2decode(string) {
		var output = [],
		    counter = 0,
		    length = string.length,
		    value,
		    extra;
		while (counter < length) {
			value = string.charCodeAt(counter++);
			if (value >= 0xD800 && value <= 0xDBFF && counter < length) {
				// high surrogate, and there is a next character
				extra = string.charCodeAt(counter++);
				if ((extra & 0xFC00) == 0xDC00) { // low surrogate
					output.push(((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000);
				} else {
					// unmatched surrogate; only append this code unit, in case the next
					// code unit is the high surrogate of a surrogate pair
					output.push(value);
					counter--;
				}
			} else {
				output.push(value);
			}
		}
		return output;
	}

	/**
	 * Creates a string based on an array of numeric code points.
	 * @see `punycode.ucs2.decode`
	 * @memberOf punycode.ucs2
	 * @name encode
	 * @param {Array} codePoints The array of numeric code points.
	 * @returns {String} The new Unicode string (UCS-2).
	 */
	function ucs2encode(array) {
		return map(array, function(value) {
			var output = '';
			if (value > 0xFFFF) {
				value -= 0x10000;
				output += stringFromCharCode(value >>> 10 & 0x3FF | 0xD800);
				value = 0xDC00 | value & 0x3FF;
			}
			output += stringFromCharCode(value);
			return output;
		}).join('');
	}

	/**
	 * Converts a basic code point into a digit/integer.
	 * @see `digitToBasic()`
	 * @private
	 * @param {Number} codePoint The basic numeric code point value.
	 * @returns {Number} The numeric value of a basic code point (for use in
	 * representing integers) in the range `0` to `base - 1`, or `base` if
	 * the code point does not represent a value.
	 */
	function basicToDigit(codePoint) {
		if (codePoint - 48 < 10) {
			return codePoint - 22;
		}
		if (codePoint - 65 < 26) {
			return codePoint - 65;
		}
		if (codePoint - 97 < 26) {
			return codePoint - 97;
		}
		return base;
	}

	/**
	 * Converts a digit/integer into a basic code point.
	 * @see `basicToDigit()`
	 * @private
	 * @param {Number} digit The numeric value of a basic code point.
	 * @returns {Number} The basic code point whose value (when used for
	 * representing integers) is `digit`, which needs to be in the range
	 * `0` to `base - 1`. If `flag` is non-zero, the uppercase form is
	 * used; else, the lowercase form is used. The behavior is undefined
	 * if `flag` is non-zero and `digit` has no uppercase form.
	 */
	function digitToBasic(digit, flag) {
		//  0..25 map to ASCII a..z or A..Z
		// 26..35 map to ASCII 0..9
		return digit + 22 + 75 * (digit < 26) - ((flag != 0) << 5);
	}

	/**
	 * Bias adaptation function as per section 3.4 of RFC 3492.
	 * http://tools.ietf.org/html/rfc3492#section-3.4
	 * @private
	 */
	function adapt(delta, numPoints, firstTime) {
		var k = 0;
		delta = firstTime ? floor(delta / damp) : delta >> 1;
		delta += floor(delta / numPoints);
		for (/* no initialization */; delta > baseMinusTMin * tMax >> 1; k += base) {
			delta = floor(delta / baseMinusTMin);
		}
		return floor(k + (baseMinusTMin + 1) * delta / (delta + skew));
	}

	/**
	 * Converts a Punycode string of ASCII-only symbols to a string of Unicode
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The Punycode string of ASCII-only symbols.
	 * @returns {String} The resulting string of Unicode symbols.
	 */
	function decode(input) {
		// Don't use UCS-2
		var output = [],
		    inputLength = input.length,
		    out,
		    i = 0,
		    n = initialN,
		    bias = initialBias,
		    basic,
		    j,
		    index,
		    oldi,
		    w,
		    k,
		    digit,
		    t,
		    /** Cached calculation results */
		    baseMinusT;

		// Handle the basic code points: let `basic` be the number of input code
		// points before the last delimiter, or `0` if there is none, then copy
		// the first basic code points to the output.

		basic = input.lastIndexOf(delimiter);
		if (basic < 0) {
			basic = 0;
		}

		for (j = 0; j < basic; ++j) {
			// if it's not a basic code point
			if (input.charCodeAt(j) >= 0x80) {
				error('not-basic');
			}
			output.push(input.charCodeAt(j));
		}

		// Main decoding loop: start just after the last delimiter if any basic code
		// points were copied; start at the beginning otherwise.

		for (index = basic > 0 ? basic + 1 : 0; index < inputLength; /* no final expression */) {

			// `index` is the index of the next character to be consumed.
			// Decode a generalized variable-length integer into `delta`,
			// which gets added to `i`. The overflow checking is easier
			// if we increase `i` as we go, then subtract off its starting
			// value at the end to obtain `delta`.
			for (oldi = i, w = 1, k = base; /* no condition */; k += base) {

				if (index >= inputLength) {
					error('invalid-input');
				}

				digit = basicToDigit(input.charCodeAt(index++));

				if (digit >= base || digit > floor((maxInt - i) / w)) {
					error('overflow');
				}

				i += digit * w;
				t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);

				if (digit < t) {
					break;
				}

				baseMinusT = base - t;
				if (w > floor(maxInt / baseMinusT)) {
					error('overflow');
				}

				w *= baseMinusT;

			}

			out = output.length + 1;
			bias = adapt(i - oldi, out, oldi == 0);

			// `i` was supposed to wrap around from `out` to `0`,
			// incrementing `n` each time, so we'll fix that now:
			if (floor(i / out) > maxInt - n) {
				error('overflow');
			}

			n += floor(i / out);
			i %= out;

			// Insert `n` at position `i` of the output
			output.splice(i++, 0, n);

		}

		return ucs2encode(output);
	}

	/**
	 * Converts a string of Unicode symbols to a Punycode string of ASCII-only
	 * symbols.
	 * @memberOf punycode
	 * @param {String} input The string of Unicode symbols.
	 * @returns {String} The resulting Punycode string of ASCII-only symbols.
	 */
	function encode(input) {
		var n,
		    delta,
		    handledCPCount,
		    basicLength,
		    bias,
		    j,
		    m,
		    q,
		    k,
		    t,
		    currentValue,
		    output = [],
		    /** `inputLength` will hold the number of code points in `input`. */
		    inputLength,
		    /** Cached calculation results */
		    handledCPCountPlusOne,
		    baseMinusT,
		    qMinusT;

		// Convert the input in UCS-2 to Unicode
		input = ucs2decode(input);

		// Cache the length
		inputLength = input.length;

		// Initialize the state
		n = initialN;
		delta = 0;
		bias = initialBias;

		// Handle the basic code points
		for (j = 0; j < inputLength; ++j) {
			currentValue = input[j];
			if (currentValue < 0x80) {
				output.push(stringFromCharCode(currentValue));
			}
		}

		handledCPCount = basicLength = output.length;

		// `handledCPCount` is the number of code points that have been handled;
		// `basicLength` is the number of basic code points.

		// Finish the basic string - if it is not empty - with a delimiter
		if (basicLength) {
			output.push(delimiter);
		}

		// Main encoding loop:
		while (handledCPCount < inputLength) {

			// All non-basic code points < n have been handled already. Find the next
			// larger one:
			for (m = maxInt, j = 0; j < inputLength; ++j) {
				currentValue = input[j];
				if (currentValue >= n && currentValue < m) {
					m = currentValue;
				}
			}

			// Increase `delta` enough to advance the decoder's <n,i> state to <m,0>,
			// but guard against overflow
			handledCPCountPlusOne = handledCPCount + 1;
			if (m - n > floor((maxInt - delta) / handledCPCountPlusOne)) {
				error('overflow');
			}

			delta += (m - n) * handledCPCountPlusOne;
			n = m;

			for (j = 0; j < inputLength; ++j) {
				currentValue = input[j];

				if (currentValue < n && ++delta > maxInt) {
					error('overflow');
				}

				if (currentValue == n) {
					// Represent delta as a generalized variable-length integer
					for (q = delta, k = base; /* no condition */; k += base) {
						t = k <= bias ? tMin : (k >= bias + tMax ? tMax : k - bias);
						if (q < t) {
							break;
						}
						qMinusT = q - t;
						baseMinusT = base - t;
						output.push(
							stringFromCharCode(digitToBasic(t + qMinusT % baseMinusT, 0))
						);
						q = floor(qMinusT / baseMinusT);
					}

					output.push(stringFromCharCode(digitToBasic(q, 0)));
					bias = adapt(delta, handledCPCountPlusOne, handledCPCount == basicLength);
					delta = 0;
					++handledCPCount;
				}
			}

			++delta;
			++n;

		}
		return output.join('');
	}

	/**
	 * Converts a Punycode string representing a domain name to Unicode. Only the
	 * Punycoded parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it on a string that has already been converted to
	 * Unicode.
	 * @memberOf punycode
	 * @param {String} domain The Punycode domain name to convert to Unicode.
	 * @returns {String} The Unicode representation of the given Punycode
	 * string.
	 */
	function toUnicode(domain) {
		return mapDomain(domain, function(string) {
			return regexPunycode.test(string)
				? decode(string.slice(4).toLowerCase())
				: string;
		});
	}

	/**
	 * Converts a Unicode string representing a domain name to Punycode. Only the
	 * non-ASCII parts of the domain name will be converted, i.e. it doesn't
	 * matter if you call it with a domain that's already in ASCII.
	 * @memberOf punycode
	 * @param {String} domain The domain name to convert, as a Unicode string.
	 * @returns {String} The Punycode representation of the given domain name.
	 */
	function toASCII(domain) {
		return mapDomain(domain, function(string) {
			return regexNonASCII.test(string)
				? 'xn--' + encode(string)
				: string;
		});
	}

	/*--------------------------------------------------------------------------*/

	/** Define the public API */
	punycode = {
		/**
		 * A string representing the current Punycode.js version number.
		 * @memberOf punycode
		 * @type String
		 */
		'version': '1.2.4',
		/**
		 * An object of methods to convert from JavaScript's internal character
		 * representation (UCS-2) to Unicode code points, and back.
		 * @see <http://mathiasbynens.be/notes/javascript-encoding>
		 * @memberOf punycode
		 * @type Object
		 */
		'ucs2': {
			'decode': ucs2decode,
			'encode': ucs2encode
		},
		'decode': decode,
		'encode': encode,
		'toASCII': toASCII,
		'toUnicode': toUnicode
	};

	/** Expose `punycode` */
	// Some AMD build optimizers, like r.js, check for specific condition patterns
	// like the following:
	if (
		typeof define == 'function' &&
		typeof define.amd == 'object' &&
		define.amd
	) {
		define('punycode', function() {
			return punycode;
		});
	} else if (freeExports && !freeExports.nodeType) {
		if (freeModule) { // in Node.js or RingoJS v0.8.0+
			freeModule.exports = punycode;
		} else { // in Narwhal or RingoJS v0.7.0-
			for (key in punycode) {
				punycode.hasOwnProperty(key) && (freeExports[key] = punycode[key]);
			}
		}
	} else { // in Rhino or a web browser
		root.punycode = punycode;
	}

}(this));

}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],35:[function(require,module,exports){
'use strict';

var Stringify = require('./stringify');
var Parse = require('./parse');

module.exports = {
    stringify: Stringify,
    parse: Parse
};

},{"./parse":36,"./stringify":37}],36:[function(require,module,exports){
'use strict';

var Utils = require('./utils');

var has = Object.prototype.hasOwnProperty;

var defaults = {
    delimiter: '&',
    depth: 5,
    arrayLimit: 20,
    parameterLimit: 1000,
    strictNullHandling: false,
    plainObjects: false,
    allowPrototypes: false,
    allowDots: false,
    decoder: Utils.decode
};

var parseValues = function parseValues(str, options) {
    var obj = {};
    var parts = str.split(options.delimiter, options.parameterLimit === Infinity ? undefined : options.parameterLimit);

    for (var i = 0; i < parts.length; ++i) {
        var part = parts[i];
        var pos = part.indexOf(']=') === -1 ? part.indexOf('=') : part.indexOf(']=') + 1;

        var key, val;
        if (pos === -1) {
            key = options.decoder(part);
            val = options.strictNullHandling ? null : '';
        } else {
            key = options.decoder(part.slice(0, pos));
            val = options.decoder(part.slice(pos + 1));
        }
        if (has.call(obj, key)) {
            obj[key] = [].concat(obj[key]).concat(val);
        } else {
            obj[key] = val;
        }
    }

    return obj;
};

var parseObject = function parseObject(chain, val, options) {
    if (!chain.length) {
        return val;
    }

    var root = chain.shift();

    var obj;
    if (root === '[]') {
        obj = [];
        obj = obj.concat(parseObject(chain, val, options));
    } else {
        obj = options.plainObjects ? Object.create(null) : {};
        var cleanRoot = root[0] === '[' && root[root.length - 1] === ']' ? root.slice(1, root.length - 1) : root;
        var index = parseInt(cleanRoot, 10);
        if (
            !isNaN(index) &&
            root !== cleanRoot &&
            String(index) === cleanRoot &&
            index >= 0 &&
            (options.parseArrays && index <= options.arrayLimit)
        ) {
            obj = [];
            obj[index] = parseObject(chain, val, options);
        } else {
            obj[cleanRoot] = parseObject(chain, val, options);
        }
    }

    return obj;
};

var parseKeys = function parseKeys(givenKey, val, options) {
    if (!givenKey) {
        return;
    }

    // Transform dot notation to bracket notation
    var key = options.allowDots ? givenKey.replace(/\.([^\.\[]+)/g, '[$1]') : givenKey;

    // The regex chunks

    var parent = /^([^\[\]]*)/;
    var child = /(\[[^\[\]]*\])/g;

    // Get the parent

    var segment = parent.exec(key);

    // Stash the parent if it exists

    var keys = [];
    if (segment[1]) {
        // If we aren't using plain objects, optionally prefix keys
        // that would overwrite object prototype properties
        if (!options.plainObjects && has.call(Object.prototype, segment[1])) {
            if (!options.allowPrototypes) {
                return;
            }
        }

        keys.push(segment[1]);
    }

    // Loop through children appending to the array until we hit depth

    var i = 0;
    while ((segment = child.exec(key)) !== null && i < options.depth) {
        i += 1;
        if (!options.plainObjects && has.call(Object.prototype, segment[1].replace(/\[|\]/g, ''))) {
            if (!options.allowPrototypes) {
                continue;
            }
        }
        keys.push(segment[1]);
    }

    // If there's a remainder, just add whatever is left

    if (segment) {
        keys.push('[' + key.slice(segment.index) + ']');
    }

    return parseObject(keys, val, options);
};

module.exports = function (str, opts) {
    var options = opts || {};

    if (options.decoder !== null && options.decoder !== undefined && typeof options.decoder !== 'function') {
        throw new TypeError('Decoder has to be a function.');
    }

    options.delimiter = typeof options.delimiter === 'string' || Utils.isRegExp(options.delimiter) ? options.delimiter : defaults.delimiter;
    options.depth = typeof options.depth === 'number' ? options.depth : defaults.depth;
    options.arrayLimit = typeof options.arrayLimit === 'number' ? options.arrayLimit : defaults.arrayLimit;
    options.parseArrays = options.parseArrays !== false;
    options.decoder = typeof options.decoder === 'function' ? options.decoder : defaults.decoder;
    options.allowDots = typeof options.allowDots === 'boolean' ? options.allowDots : defaults.allowDots;
    options.plainObjects = typeof options.plainObjects === 'boolean' ? options.plainObjects : defaults.plainObjects;
    options.allowPrototypes = typeof options.allowPrototypes === 'boolean' ? options.allowPrototypes : defaults.allowPrototypes;
    options.parameterLimit = typeof options.parameterLimit === 'number' ? options.parameterLimit : defaults.parameterLimit;
    options.strictNullHandling = typeof options.strictNullHandling === 'boolean' ? options.strictNullHandling : defaults.strictNullHandling;

    if (str === '' || str === null || typeof str === 'undefined') {
        return options.plainObjects ? Object.create(null) : {};
    }

    var tempObj = typeof str === 'string' ? parseValues(str, options) : str;
    var obj = options.plainObjects ? Object.create(null) : {};

    // Iterate over the keys and setup the new object

    var keys = Object.keys(tempObj);
    for (var i = 0; i < keys.length; ++i) {
        var key = keys[i];
        var newObj = parseKeys(key, tempObj[key], options);
        obj = Utils.merge(obj, newObj, options);
    }

    return Utils.compact(obj);
};

},{"./utils":38}],37:[function(require,module,exports){
'use strict';

var Utils = require('./utils');

var arrayPrefixGenerators = {
    brackets: function brackets(prefix) {
        return prefix + '[]';
    },
    indices: function indices(prefix, key) {
        return prefix + '[' + key + ']';
    },
    repeat: function repeat(prefix) {
        return prefix;
    }
};

var defaults = {
    delimiter: '&',
    strictNullHandling: false,
    skipNulls: false,
    encode: true,
    encoder: Utils.encode
};

var stringify = function stringify(object, prefix, generateArrayPrefix, strictNullHandling, skipNulls, encoder, filter, sort, allowDots) {
    var obj = object;
    if (typeof filter === 'function') {
        obj = filter(prefix, obj);
    } else if (obj instanceof Date) {
        obj = obj.toISOString();
    } else if (obj === null) {
        if (strictNullHandling) {
            return encoder ? encoder(prefix) : prefix;
        }

        obj = '';
    }

    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean' || Utils.isBuffer(obj)) {
        if (encoder) {
            return [encoder(prefix) + '=' + encoder(obj)];
        }
        return [prefix + '=' + String(obj)];
    }

    var values = [];

    if (typeof obj === 'undefined') {
        return values;
    }

    var objKeys;
    if (Array.isArray(filter)) {
        objKeys = filter;
    } else {
        var keys = Object.keys(obj);
        objKeys = sort ? keys.sort(sort) : keys;
    }

    for (var i = 0; i < objKeys.length; ++i) {
        var key = objKeys[i];

        if (skipNulls && obj[key] === null) {
            continue;
        }

        if (Array.isArray(obj)) {
            values = values.concat(stringify(obj[key], generateArrayPrefix(prefix, key), generateArrayPrefix, strictNullHandling, skipNulls, encoder, filter, sort, allowDots));
        } else {
            values = values.concat(stringify(obj[key], prefix + (allowDots ? '.' + key : '[' + key + ']'), generateArrayPrefix, strictNullHandling, skipNulls, encoder, filter, sort, allowDots));
        }
    }

    return values;
};

module.exports = function (object, opts) {
    var obj = object;
    var options = opts || {};
    var delimiter = typeof options.delimiter === 'undefined' ? defaults.delimiter : options.delimiter;
    var strictNullHandling = typeof options.strictNullHandling === 'boolean' ? options.strictNullHandling : defaults.strictNullHandling;
    var skipNulls = typeof options.skipNulls === 'boolean' ? options.skipNulls : defaults.skipNulls;
    var encode = typeof options.encode === 'boolean' ? options.encode : defaults.encode;
    var encoder = encode ? (typeof options.encoder === 'function' ? options.encoder : defaults.encoder) : null;
    var sort = typeof options.sort === 'function' ? options.sort : null;
    var allowDots = typeof options.allowDots === 'undefined' ? false : options.allowDots;
    var objKeys;
    var filter;

    if (options.encoder !== null && options.encoder !== undefined && typeof options.encoder !== 'function') {
        throw new TypeError('Encoder has to be a function.');
    }

    if (typeof options.filter === 'function') {
        filter = options.filter;
        obj = filter('', obj);
    } else if (Array.isArray(options.filter)) {
        objKeys = filter = options.filter;
    }

    var keys = [];

    if (typeof obj !== 'object' || obj === null) {
        return '';
    }

    var arrayFormat;
    if (options.arrayFormat in arrayPrefixGenerators) {
        arrayFormat = options.arrayFormat;
    } else if ('indices' in options) {
        arrayFormat = options.indices ? 'indices' : 'repeat';
    } else {
        arrayFormat = 'indices';
    }

    var generateArrayPrefix = arrayPrefixGenerators[arrayFormat];

    if (!objKeys) {
        objKeys = Object.keys(obj);
    }

    if (sort) {
        objKeys.sort(sort);
    }

    for (var i = 0; i < objKeys.length; ++i) {
        var key = objKeys[i];

        if (skipNulls && obj[key] === null) {
            continue;
        }

        keys = keys.concat(stringify(obj[key], key, generateArrayPrefix, strictNullHandling, skipNulls, encoder, filter, sort, allowDots));
    }

    return keys.join(delimiter);
};

},{"./utils":38}],38:[function(require,module,exports){
'use strict';

var hexTable = (function () {
    var array = new Array(256);
    for (var i = 0; i < 256; ++i) {
        array[i] = '%' + ((i < 16 ? '0' : '') + i.toString(16)).toUpperCase();
    }

    return array;
}());

exports.arrayToObject = function (source, options) {
    var obj = options.plainObjects ? Object.create(null) : {};
    for (var i = 0; i < source.length; ++i) {
        if (typeof source[i] !== 'undefined') {
            obj[i] = source[i];
        }
    }

    return obj;
};

exports.merge = function (target, source, options) {
    if (!source) {
        return target;
    }

    if (typeof source !== 'object') {
        if (Array.isArray(target)) {
            target.push(source);
        } else if (typeof target === 'object') {
            target[source] = true;
        } else {
            return [target, source];
        }

        return target;
    }

    if (typeof target !== 'object') {
        return [target].concat(source);
    }

    var mergeTarget = target;
    if (Array.isArray(target) && !Array.isArray(source)) {
        mergeTarget = exports.arrayToObject(target, options);
    }

    return Object.keys(source).reduce(function (acc, key) {
        var value = source[key];

        if (Object.prototype.hasOwnProperty.call(acc, key)) {
            acc[key] = exports.merge(acc[key], value, options);
        } else {
            acc[key] = value;
        }
        return acc;
    }, mergeTarget);
};

exports.decode = function (str) {
    try {
        return decodeURIComponent(str.replace(/\+/g, ' '));
    } catch (e) {
        return str;
    }
};

exports.encode = function (str) {
    // This code was originally written by Brian White (mscdex) for the io.js core querystring library.
    // It has been adapted here for stricter adherence to RFC 3986
    if (str.length === 0) {
        return str;
    }

    var string = typeof str === 'string' ? str : String(str);

    var out = '';
    for (var i = 0; i < string.length; ++i) {
        var c = string.charCodeAt(i);

        if (
            c === 0x2D || // -
            c === 0x2E || // .
            c === 0x5F || // _
            c === 0x7E || // ~
            (c >= 0x30 && c <= 0x39) || // 0-9
            (c >= 0x41 && c <= 0x5A) || // a-z
            (c >= 0x61 && c <= 0x7A) // A-Z
        ) {
            out += string.charAt(i);
            continue;
        }

        if (c < 0x80) {
            out = out + hexTable[c];
            continue;
        }

        if (c < 0x800) {
            out = out + (hexTable[0xC0 | (c >> 6)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        if (c < 0xD800 || c >= 0xE000) {
            out = out + (hexTable[0xE0 | (c >> 12)] + hexTable[0x80 | ((c >> 6) & 0x3F)] + hexTable[0x80 | (c & 0x3F)]);
            continue;
        }

        i += 1;
        c = 0x10000 + (((c & 0x3FF) << 10) | (string.charCodeAt(i) & 0x3FF));
        out += hexTable[0xF0 | (c >> 18)] + hexTable[0x80 | ((c >> 12) & 0x3F)] + hexTable[0x80 | ((c >> 6) & 0x3F)] + hexTable[0x80 | (c & 0x3F)];
    }

    return out;
};

exports.compact = function (obj, references) {
    if (typeof obj !== 'object' || obj === null) {
        return obj;
    }

    var refs = references || [];
    var lookup = refs.indexOf(obj);
    if (lookup !== -1) {
        return refs[lookup];
    }

    refs.push(obj);

    if (Array.isArray(obj)) {
        var compacted = [];

        for (var i = 0; i < obj.length; ++i) {
            if (obj[i] && typeof obj[i] === 'object') {
                compacted.push(exports.compact(obj[i], refs));
            } else if (typeof obj[i] !== 'undefined') {
                compacted.push(obj[i]);
            }
        }

        return compacted;
    }

    var keys = Object.keys(obj);
    for (var j = 0; j < keys.length; ++j) {
        var key = keys[j];
        obj[key] = exports.compact(obj[key], refs);
    }

    return obj;
};

exports.isRegExp = function (obj) {
    return Object.prototype.toString.call(obj) === '[object RegExp]';
};

exports.isBuffer = function (obj) {
    if (obj === null || typeof obj === 'undefined') {
        return false;
    }

    return !!(obj.constructor && obj.constructor.isBuffer && obj.constructor.isBuffer(obj));
};

},{}],39:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],40:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],41:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":39,"./encode":40}],42:[function(require,module,exports){
/*!
 * QUnit 2.0.1
 * https://qunitjs.com/
 *
 * Copyright jQuery Foundation and other contributors
 * Released under the MIT license
 * https://jquery.org/license
 *
 * Date: 2016-07-23T19:39Z
 */

( function( global ) {

var QUnit = {};

var Date = global.Date;
var now = Date.now || function() {
	return new Date().getTime();
};

var setTimeout = global.setTimeout;
var clearTimeout = global.clearTimeout;

// Store a local window from the global to allow direct references.
var window = global.window;

var defined = {
	document: window && window.document !== undefined,
	setTimeout: setTimeout !== undefined,
	sessionStorage: ( function() {
		var x = "qunit-test-string";
		try {
			sessionStorage.setItem( x, x );
			sessionStorage.removeItem( x );
			return true;
		} catch ( e ) {
			return false;
		}
	}() )
};

var fileName = ( sourceFromStacktrace( 0 ) || "" ).replace( /(:\d+)+\)?/, "" ).replace( /.+\//, "" );
var globalStartCalled = false;
var runStarted = false;

var autorun = false;

var toString = Object.prototype.toString,
	hasOwn = Object.prototype.hasOwnProperty;

// Returns a new Array with the elements that are in a but not in b
function diff( a, b ) {
	var i, j,
		result = a.slice();

	for ( i = 0; i < result.length; i++ ) {
		for ( j = 0; j < b.length; j++ ) {
			if ( result[ i ] === b[ j ] ) {
				result.splice( i, 1 );
				i--;
				break;
			}
		}
	}
	return result;
}

// From jquery.js
function inArray( elem, array ) {
	if ( array.indexOf ) {
		return array.indexOf( elem );
	}

	for ( var i = 0, length = array.length; i < length; i++ ) {
		if ( array[ i ] === elem ) {
			return i;
		}
	}

	return -1;
}

/**
 * Makes a clone of an object using only Array or Object as base,
 * and copies over the own enumerable properties.
 *
 * @param {Object} obj
 * @return {Object} New object with only the own properties (recursively).
 */
function objectValues ( obj ) {
	var key, val,
		vals = QUnit.is( "array", obj ) ? [] : {};
	for ( key in obj ) {
		if ( hasOwn.call( obj, key ) ) {
			val = obj[ key ];
			vals[ key ] = val === Object( val ) ? objectValues( val ) : val;
		}
	}
	return vals;
}

function extend( a, b, undefOnly ) {
	for ( var prop in b ) {
		if ( hasOwn.call( b, prop ) ) {
			if ( b[ prop ] === undefined ) {
				delete a[ prop ];
			} else if ( !( undefOnly && typeof a[ prop ] !== "undefined" ) ) {
				a[ prop ] = b[ prop ];
			}
		}
	}

	return a;
}

function objectType( obj ) {
	if ( typeof obj === "undefined" ) {
		return "undefined";
	}

	// Consider: typeof null === object
	if ( obj === null ) {
		return "null";
	}

	var match = toString.call( obj ).match( /^\[object\s(.*)\]$/ ),
		type = match && match[ 1 ];

	switch ( type ) {
		case "Number":
			if ( isNaN( obj ) ) {
				return "nan";
			}
			return "number";
		case "String":
		case "Boolean":
		case "Array":
		case "Set":
		case "Map":
		case "Date":
		case "RegExp":
		case "Function":
		case "Symbol":
			return type.toLowerCase();
	}
	if ( typeof obj === "object" ) {
		return "object";
	}
}

// Safe object type checking
function is( type, obj ) {
	return QUnit.objectType( obj ) === type;
}

// Doesn't support IE9, it will return undefined on these browsers
// See also https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Error/Stack
function extractStacktrace( e, offset ) {
	offset = offset === undefined ? 4 : offset;

	var stack, include, i;

	if ( e.stack ) {
		stack = e.stack.split( "\n" );
		if ( /^error$/i.test( stack[ 0 ] ) ) {
			stack.shift();
		}
		if ( fileName ) {
			include = [];
			for ( i = offset; i < stack.length; i++ ) {
				if ( stack[ i ].indexOf( fileName ) !== -1 ) {
					break;
				}
				include.push( stack[ i ] );
			}
			if ( include.length ) {
				return include.join( "\n" );
			}
		}
		return stack[ offset ];
	}
}

function sourceFromStacktrace( offset ) {
	var error = new Error();

	// Support: Safari <=7 only, IE <=10 - 11 only
	// Not all browsers generate the `stack` property for `new Error()`, see also #636
	if ( !error.stack ) {
		try {
			throw error;
		} catch ( err ) {
			error = err;
		}
	}

	return extractStacktrace( error, offset );
}

/**
 * Config object: Maintain internal state
 * Later exposed as QUnit.config
 * `config` initialized at top of scope
 */
var config = {

	// The queue of tests to run
	queue: [],

	// Block until document ready
	blocking: true,

	// By default, run previously failed tests first
	// very useful in combination with "Hide passed tests" checked
	reorder: true,

	// By default, modify document.title when suite is done
	altertitle: true,

	// HTML Reporter: collapse every test except the first failing test
	// If false, all failing tests will be expanded
	collapse: true,

	// By default, scroll to top of the page when suite is done
	scrolltop: true,

	// Depth up-to which object will be dumped
	maxDepth: 5,

	// When enabled, all tests must call expect()
	requireExpects: false,

	// Placeholder for user-configurable form-exposed URL parameters
	urlConfig: [],

	// Set of all modules.
	modules: [],

	// Stack of nested modules
	moduleStack: [],

	// The first unnamed module
	currentModule: {
		name: "",
		tests: []
	},

	callbacks: {}
};

// Push a loose unnamed module to the modules collection
config.modules.push( config.currentModule );

// Register logging callbacks
function registerLoggingCallbacks( obj ) {
	var i, l, key,
		callbackNames = [ "begin", "done", "log", "testStart", "testDone",
			"moduleStart", "moduleDone" ];

	function registerLoggingCallback( key ) {
		var loggingCallback = function( callback ) {
			if ( objectType( callback ) !== "function" ) {
				throw new Error(
					"QUnit logging methods require a callback function as their first parameters."
				);
			}

			config.callbacks[ key ].push( callback );
		};

		return loggingCallback;
	}

	for ( i = 0, l = callbackNames.length; i < l; i++ ) {
		key = callbackNames[ i ];

		// Initialize key collection of logging callback
		if ( objectType( config.callbacks[ key ] ) === "undefined" ) {
			config.callbacks[ key ] = [];
		}

		obj[ key ] = registerLoggingCallback( key );
	}
}

function runLoggingCallbacks( key, args ) {
	var i, l, callbacks;

	callbacks = config.callbacks[ key ];
	for ( i = 0, l = callbacks.length; i < l; i++ ) {
		callbacks[ i ]( args );
	}
}

( function() {
	if ( !defined.document ) {
		return;
	}

	// `onErrorFnPrev` initialized at top of scope
	// Preserve other handlers
	var onErrorFnPrev = window.onerror;

	// Cover uncaught exceptions
	// Returning true will suppress the default browser handler,
	// returning false will let it run.
	window.onerror = function( error, filePath, linerNr ) {
		var ret = false;
		if ( onErrorFnPrev ) {
			ret = onErrorFnPrev( error, filePath, linerNr );
		}

		// Treat return value as window.onerror itself does,
		// Only do our handling if not suppressed.
		if ( ret !== true ) {
			if ( QUnit.config.current ) {
				if ( QUnit.config.current.ignoreGlobalErrors ) {
					return true;
				}
				QUnit.pushFailure( error, filePath + ":" + linerNr );
			} else {
				QUnit.test( "global failure", extend( function() {
					QUnit.pushFailure( error, filePath + ":" + linerNr );
				}, { validTest: true } ) );
			}
			return false;
		}

		return ret;
	};
}() );

// Figure out if we're running the tests from a server or not
QUnit.isLocal = !( defined.document && window.location.protocol !== "file:" );

// Expose the current QUnit version
QUnit.version = "2.0.1";

extend( QUnit, {

	// Call on start of module test to prepend name to all tests
	module: function( name, testEnvironment, executeNow ) {
		var module, moduleFns;
		var currentModule = config.currentModule;

		if ( arguments.length === 2 ) {
			if ( objectType( testEnvironment ) === "function" ) {
				executeNow = testEnvironment;
				testEnvironment = undefined;
			}
		}

		module = createModule();

		if ( testEnvironment && ( testEnvironment.setup || testEnvironment.teardown ) ) {
			console.warn(
				"Module's `setup` and `teardown` are not hooks anymore on QUnit 2.0, use " +
				"`beforeEach` and `afterEach` instead\n" +
				"Details in our upgrade guide at https://qunitjs.com/upgrade-guide-2.x/"
			);
		}

		moduleFns = {
			before: setHook( module, "before" ),
			beforeEach: setHook( module, "beforeEach" ),
			afterEach: setHook( module, "afterEach" ),
			after: setHook( module, "after" )
		};

		if ( objectType( executeNow ) === "function" ) {
			config.moduleStack.push( module );
			setCurrentModule( module );
			executeNow.call( module.testEnvironment, moduleFns );
			config.moduleStack.pop();
			module = module.parentModule || currentModule;
		}

		setCurrentModule( module );

		function createModule() {
			var parentModule = config.moduleStack.length ?
				config.moduleStack.slice( -1 )[ 0 ] : null;
			var moduleName = parentModule !== null ?
				[ parentModule.name, name ].join( " > " ) : name;
			var module = {
				name: moduleName,
				parentModule: parentModule,
				tests: [],
				moduleId: generateHash( moduleName ),
				testsRun: 0
			};

			var env = {};
			if ( parentModule ) {
				parentModule.childModule = module;
				extend( env, parentModule.testEnvironment );
				delete env.beforeEach;
				delete env.afterEach;
			}
			extend( env, testEnvironment );
			module.testEnvironment = env;

			config.modules.push( module );
			return module;
		}

		function setCurrentModule( module ) {
			config.currentModule = module;
		}

	},

	test: test,

	skip: skip,

	only: only,

	start: function( count ) {
		var globalStartAlreadyCalled = globalStartCalled;

		if ( !config.current ) {
			globalStartCalled = true;

			if ( runStarted ) {
				throw new Error( "Called start() while test already started running" );
			} else if ( globalStartAlreadyCalled || count > 1 ) {
				throw new Error( "Called start() outside of a test context too many times" );
			} else if ( config.autostart ) {
				throw new Error( "Called start() outside of a test context when " +
					"QUnit.config.autostart was true" );
			} else if ( !config.pageLoaded ) {

				// The page isn't completely loaded yet, so bail out and let `QUnit.load` handle it
				config.autostart = true;
				return;
			}
		} else {
			throw new Error(
				"QUnit.start cannot be called inside a test context. This feature is removed in " +
				"QUnit 2.0. For async tests, use QUnit.test() with assert.async() instead.\n" +
				"Details in our upgrade guide at https://qunitjs.com/upgrade-guide-2.x/"
			);
		}

		scheduleBegin();
	},

	config: config,

	is: is,

	objectType: objectType,

	extend: extend,

	load: function() {
		config.pageLoaded = true;

		// Initialize the configuration options
		extend( config, {
			stats: { all: 0, bad: 0 },
			moduleStats: { all: 0, bad: 0 },
			started: 0,
			updateRate: 1000,
			autostart: true,
			filter: ""
		}, true );

		if ( !runStarted ) {
			config.blocking = false;

			if ( config.autostart ) {
				scheduleBegin();
			}
		}
	},

	stack: function( offset ) {
		offset = ( offset || 0 ) + 2;
		return sourceFromStacktrace( offset );
	}
} );

registerLoggingCallbacks( QUnit );

function scheduleBegin() {

	runStarted = true;

	// Add a slight delay to allow definition of more modules and tests.
	if ( defined.setTimeout ) {
		setTimeout( function() {
			begin();
		}, 13 );
	} else {
		begin();
	}
}

function begin() {
	var i, l,
		modulesLog = [];

	// If the test run hasn't officially begun yet
	if ( !config.started ) {

		// Record the time of the test run's beginning
		config.started = now();

		// Delete the loose unnamed module if unused.
		if ( config.modules[ 0 ].name === "" && config.modules[ 0 ].tests.length === 0 ) {
			config.modules.shift();
		}

		// Avoid unnecessary information by not logging modules' test environments
		for ( i = 0, l = config.modules.length; i < l; i++ ) {
			modulesLog.push( {
				name: config.modules[ i ].name,
				tests: config.modules[ i ].tests
			} );
		}

		// The test run is officially beginning now
		runLoggingCallbacks( "begin", {
			totalTests: Test.count,
			modules: modulesLog
		} );
	}

	config.blocking = false;
	process( true );
}

function process( last ) {
	function next() {
		process( last );
	}
	var start = now();
	config.depth = ( config.depth || 0 ) + 1;

	while ( config.queue.length && !config.blocking ) {
		if ( !defined.setTimeout || config.updateRate <= 0 ||
				( ( now() - start ) < config.updateRate ) ) {
			if ( config.current ) {

				// Reset async tracking for each phase of the Test lifecycle
				config.current.usedAsync = false;
			}
			config.queue.shift()();
		} else {
			setTimeout( next, 13 );
			break;
		}
	}
	config.depth--;
	if ( last && !config.blocking && !config.queue.length && config.depth === 0 ) {
		done();
	}
}

function done() {
	var runtime, passed;

	autorun = true;

	// Log the last module results
	if ( config.previousModule ) {
		runLoggingCallbacks( "moduleDone", {
			name: config.previousModule.name,
			tests: config.previousModule.tests,
			failed: config.moduleStats.bad,
			passed: config.moduleStats.all - config.moduleStats.bad,
			total: config.moduleStats.all,
			runtime: now() - config.moduleStats.started
		} );
	}
	delete config.previousModule;

	runtime = now() - config.started;
	passed = config.stats.all - config.stats.bad;

	runLoggingCallbacks( "done", {
		failed: config.stats.bad,
		passed: passed,
		total: config.stats.all,
		runtime: runtime
	} );
}

function setHook( module, hookName ) {
	if ( module.testEnvironment === undefined ) {
		module.testEnvironment = {};
	}

	return function( callback ) {
		module.testEnvironment[ hookName ] = callback;
	};
}

var unitSampler,
	focused = false,
	priorityCount = 0;

function Test( settings ) {
	var i, l;

	++Test.count;

	this.expected = null;
	extend( this, settings );
	this.assertions = [];
	this.semaphore = 0;
	this.usedAsync = false;
	this.module = config.currentModule;
	this.stack = sourceFromStacktrace( 3 );

	// Register unique strings
	for ( i = 0, l = this.module.tests; i < l.length; i++ ) {
		if ( this.module.tests[ i ].name === this.testName ) {
			this.testName += " ";
		}
	}

	this.testId = generateHash( this.module.name, this.testName );

	this.module.tests.push( {
		name: this.testName,
		testId: this.testId
	} );

	if ( settings.skip ) {

		// Skipped tests will fully ignore any sent callback
		this.callback = function() {};
		this.async = false;
		this.expected = 0;
	} else {
		this.assert = new Assert( this );
	}
}

Test.count = 0;

Test.prototype = {
	before: function() {
		if (

			// Emit moduleStart when we're switching from one module to another
			this.module !== config.previousModule ||

				// They could be equal (both undefined) but if the previousModule property doesn't
				// yet exist it means this is the first test in a suite that isn't wrapped in a
				// module, in which case we'll just emit a moduleStart event for 'undefined'.
				// Without this, reporters can get testStart before moduleStart  which is a problem.
				!hasOwn.call( config, "previousModule" )
		) {
			if ( hasOwn.call( config, "previousModule" ) ) {
				runLoggingCallbacks( "moduleDone", {
					name: config.previousModule.name,
					tests: config.previousModule.tests,
					failed: config.moduleStats.bad,
					passed: config.moduleStats.all - config.moduleStats.bad,
					total: config.moduleStats.all,
					runtime: now() - config.moduleStats.started
				} );
			}
			config.previousModule = this.module;
			config.moduleStats = { all: 0, bad: 0, started: now() };
			runLoggingCallbacks( "moduleStart", {
				name: this.module.name,
				tests: this.module.tests
			} );
		}

		config.current = this;

		if ( this.module.testEnvironment ) {
			delete this.module.testEnvironment.before;
			delete this.module.testEnvironment.beforeEach;
			delete this.module.testEnvironment.afterEach;
			delete this.module.testEnvironment.after;
		}
		this.testEnvironment = extend( {}, this.module.testEnvironment );

		this.started = now();
		runLoggingCallbacks( "testStart", {
			name: this.testName,
			module: this.module.name,
			testId: this.testId
		} );

		if ( !config.pollution ) {
			saveGlobal();
		}
	},

	run: function() {
		var promise;

		config.current = this;

		this.callbackStarted = now();

		if ( config.notrycatch ) {
			runTest( this );
			return;
		}

		try {
			runTest( this );
		} catch ( e ) {
			this.pushFailure( "Died on test #" + ( this.assertions.length + 1 ) + " " +
				this.stack + ": " + ( e.message || e ), extractStacktrace( e, 0 ) );

			// Else next test will carry the responsibility
			saveGlobal();

			// Restart the tests if they're blocking
			if ( config.blocking ) {
				internalRecover( this );
			}
		}

		function runTest( test ) {
			promise = test.callback.call( test.testEnvironment, test.assert );
			test.resolvePromise( promise );
		}
	},

	after: function() {
		checkPollution();
	},

	queueHook: function( hook, hookName, hookOwner ) {
		var promise,
			test = this;
		return function runHook() {
			if ( hookName === "before" ) {
				if ( hookOwner.testsRun !== 0 ) {
					return;
				}

				test.preserveEnvironment = true;
			}

			if ( hookName === "after" && hookOwner.testsRun !== numberOfTests( hookOwner ) - 1 ) {
				return;
			}

			config.current = test;
			if ( config.notrycatch ) {
				callHook();
				return;
			}
			try {
				callHook();
			} catch ( error ) {
				test.pushFailure( hookName + " failed on " + test.testName + ": " +
				( error.message || error ), extractStacktrace( error, 0 ) );
			}

			function callHook() {
				promise = hook.call( test.testEnvironment, test.assert );
				test.resolvePromise( promise, hookName );
			}
		};
	},

	// Currently only used for module level hooks, can be used to add global level ones
	hooks: function( handler ) {
		var hooks = [];

		function processHooks( test, module ) {
			if ( module.parentModule ) {
				processHooks( test, module.parentModule );
			}
			if ( module.testEnvironment &&
				QUnit.objectType( module.testEnvironment[ handler ] ) === "function" ) {
				hooks.push( test.queueHook( module.testEnvironment[ handler ], handler, module ) );
			}
		}

		// Hooks are ignored on skipped tests
		if ( !this.skip ) {
			processHooks( this, this.module );
		}
		return hooks;
	},

	finish: function() {
		config.current = this;
		if ( config.requireExpects && this.expected === null ) {
			this.pushFailure( "Expected number of assertions to be defined, but expect() was " +
				"not called.", this.stack );
		} else if ( this.expected !== null && this.expected !== this.assertions.length ) {
			this.pushFailure( "Expected " + this.expected + " assertions, but " +
				this.assertions.length + " were run", this.stack );
		} else if ( this.expected === null && !this.assertions.length ) {
			this.pushFailure( "Expected at least one assertion, but none were run - call " +
				"expect(0) to accept zero assertions.", this.stack );
		}

		var i,
			skipped = !!this.skip,
			bad = 0;

		this.runtime = now() - this.started;

		config.stats.all += this.assertions.length;
		config.moduleStats.all += this.assertions.length;

		for ( i = 0; i < this.assertions.length; i++ ) {
			if ( !this.assertions[ i ].result ) {
				bad++;
				config.stats.bad++;
				config.moduleStats.bad++;
			}
		}

		notifyTestsRan( this.module );
		runLoggingCallbacks( "testDone", {
			name: this.testName,
			module: this.module.name,
			skipped: skipped,
			failed: bad,
			passed: this.assertions.length - bad,
			total: this.assertions.length,
			runtime: skipped ? 0 : this.runtime,

			// HTML Reporter use
			assertions: this.assertions,
			testId: this.testId,

			// Source of Test
			source: this.stack
		} );

		config.current = undefined;
	},

	preserveTestEnvironment: function() {
		if ( this.preserveEnvironment ) {
			this.module.testEnvironment = this.testEnvironment;
			this.testEnvironment = extend( {}, this.module.testEnvironment );
		}
	},

	queue: function() {
		var priority,
			test = this;

		if ( !this.valid() ) {
			return;
		}

		function run() {

			// Each of these can by async
			synchronize( [
				function() {
					test.before();
				},

				test.hooks( "before" ),

				function() {
					test.preserveTestEnvironment();
				},

				test.hooks( "beforeEach" ),

				function() {
					test.run();
				},

				test.hooks( "afterEach" ).reverse(),
				test.hooks( "after" ).reverse(),

				function() {
					test.after();
				},

				function() {
					test.finish();
				}
			] );
		}

		// Prioritize previously failed tests, detected from sessionStorage
		priority = QUnit.config.reorder && defined.sessionStorage &&
				+sessionStorage.getItem( "qunit-test-" + this.module.name + "-" + this.testName );

		return synchronize( run, priority, config.seed );
	},

	pushResult: function( resultInfo ) {

		// Destructure of resultInfo = { result, actual, expected, message, negative }
		var source,
			details = {
				module: this.module.name,
				name: this.testName,
				result: resultInfo.result,
				message: resultInfo.message,
				actual: resultInfo.actual,
				expected: resultInfo.expected,
				testId: this.testId,
				negative: resultInfo.negative || false,
				runtime: now() - this.started
			};

		if ( !resultInfo.result ) {
			source = sourceFromStacktrace();

			if ( source ) {
				details.source = source;
			}
		}

		runLoggingCallbacks( "log", details );

		this.assertions.push( {
			result: !!resultInfo.result,
			message: resultInfo.message
		} );
	},

	pushFailure: function( message, source, actual ) {
		if ( !( this instanceof Test ) ) {
			throw new Error( "pushFailure() assertion outside test context, was " +
				sourceFromStacktrace( 2 ) );
		}

		var details = {
				module: this.module.name,
				name: this.testName,
				result: false,
				message: message || "error",
				actual: actual || null,
				testId: this.testId,
				runtime: now() - this.started
			};

		if ( source ) {
			details.source = source;
		}

		runLoggingCallbacks( "log", details );

		this.assertions.push( {
			result: false,
			message: message
		} );
	},

	resolvePromise: function( promise, phase ) {
		var then, resume, message,
			test = this;
		if ( promise != null ) {
			then = promise.then;
			if ( QUnit.objectType( then ) === "function" ) {
				resume = internalStop( test );
				then.call(
					promise,
					function() { resume(); },
					function( error ) {
						message = "Promise rejected " +
							( !phase ? "during" : phase.replace( /Each$/, "" ) ) +
							" " + test.testName + ": " + ( error.message || error );
						test.pushFailure( message, extractStacktrace( error, 0 ) );

						// Else next test will carry the responsibility
						saveGlobal();

						// Unblock
						resume();
					}
				);
			}
		}
	},

	valid: function() {
		var filter = config.filter,
			regexFilter = /^(!?)\/([\w\W]*)\/(i?$)/.exec( filter ),
			module = config.module && config.module.toLowerCase(),
			fullName = ( this.module.name + ": " + this.testName );

		function moduleChainNameMatch( testModule ) {
			var testModuleName = testModule.name ? testModule.name.toLowerCase() : null;
			if ( testModuleName === module ) {
				return true;
			} else if ( testModule.parentModule ) {
				return moduleChainNameMatch( testModule.parentModule );
			} else {
				return false;
			}
		}

		function moduleChainIdMatch( testModule ) {
			return inArray( testModule.moduleId, config.moduleId ) > -1 ||
				testModule.parentModule && moduleChainIdMatch( testModule.parentModule );
		}

		// Internally-generated tests are always valid
		if ( this.callback && this.callback.validTest ) {
			return true;
		}

		if ( config.moduleId && config.moduleId.length > 0 &&
			!moduleChainIdMatch( this.module ) ) {

			return false;
		}

		if ( config.testId && config.testId.length > 0 &&
			inArray( this.testId, config.testId ) < 0 ) {

			return false;
		}

		if ( module && !moduleChainNameMatch( this.module ) ) {
			return false;
		}

		if ( !filter ) {
			return true;
		}

		return regexFilter ?
			this.regexFilter( !!regexFilter[ 1 ], regexFilter[ 2 ], regexFilter[ 3 ], fullName ) :
			this.stringFilter( filter, fullName );
	},

	regexFilter: function( exclude, pattern, flags, fullName ) {
		var regex = new RegExp( pattern, flags );
		var match = regex.test( fullName );

		return match !== exclude;
	},

	stringFilter: function( filter, fullName ) {
		filter = filter.toLowerCase();
		fullName = fullName.toLowerCase();

		var include = filter.charAt( 0 ) !== "!";
		if ( !include ) {
			filter = filter.slice( 1 );
		}

		// If the filter matches, we need to honour include
		if ( fullName.indexOf( filter ) !== -1 ) {
			return include;
		}

		// Otherwise, do the opposite
		return !include;
	}
};

QUnit.pushFailure = function() {
	if ( !QUnit.config.current ) {
		throw new Error( "pushFailure() assertion outside test context, in " +
			sourceFromStacktrace( 2 ) );
	}

	// Gets current test obj
	var currentTest = QUnit.config.current;

	return currentTest.pushFailure.apply( currentTest, arguments );
};

// Based on Java's String.hashCode, a simple but not
// rigorously collision resistant hashing function
function generateHash( module, testName ) {
	var hex,
		i = 0,
		hash = 0,
		str = module + "\x1C" + testName,
		len = str.length;

	for ( ; i < len; i++ ) {
		hash  = ( ( hash << 5 ) - hash ) + str.charCodeAt( i );
		hash |= 0;
	}

	// Convert the possibly negative integer hash code into an 8 character hex string, which isn't
	// strictly necessary but increases user understanding that the id is a SHA-like hash
	hex = ( 0x100000000 + hash ).toString( 16 );
	if ( hex.length < 8 ) {
		hex = "0000000" + hex;
	}

	return hex.slice( -8 );
}

function synchronize( callback, priority, seed ) {
	var last = !priority,
		index;

	if ( QUnit.objectType( callback ) === "array" ) {
		while ( callback.length ) {
			synchronize( callback.shift() );
		}
		return;
	}

	if ( priority ) {
		config.queue.splice( priorityCount++, 0, callback );
	} else if ( seed ) {
		if ( !unitSampler ) {
			unitSampler = unitSamplerGenerator( seed );
		}

		// Insert into a random position after all priority items
		index = Math.floor( unitSampler() * ( config.queue.length - priorityCount + 1 ) );
		config.queue.splice( priorityCount + index, 0, callback );
	} else {
		config.queue.push( callback );
	}

	if ( autorun && !config.blocking ) {
		process( last );
	}
}

function unitSamplerGenerator( seed ) {

	// 32-bit xorshift, requires only a nonzero seed
	// http://excamera.com/sphinx/article-xorshift.html
	var sample = parseInt( generateHash( seed ), 16 ) || -1;
	return function() {
		sample ^= sample << 13;
		sample ^= sample >>> 17;
		sample ^= sample << 5;

		// ECMAScript has no unsigned number type
		if ( sample < 0 ) {
			sample += 0x100000000;
		}

		return sample / 0x100000000;
	};
}

function saveGlobal() {
	config.pollution = [];

	if ( config.noglobals ) {
		for ( var key in global ) {
			if ( hasOwn.call( global, key ) ) {

				// In Opera sometimes DOM element ids show up here, ignore them
				if ( /^qunit-test-output/.test( key ) ) {
					continue;
				}
				config.pollution.push( key );
			}
		}
	}
}

function checkPollution() {
	var newGlobals,
		deletedGlobals,
		old = config.pollution;

	saveGlobal();

	newGlobals = diff( config.pollution, old );
	if ( newGlobals.length > 0 ) {
		QUnit.pushFailure( "Introduced global variable(s): " + newGlobals.join( ", " ) );
	}

	deletedGlobals = diff( old, config.pollution );
	if ( deletedGlobals.length > 0 ) {
		QUnit.pushFailure( "Deleted global variable(s): " + deletedGlobals.join( ", " ) );
	}
}

// Will be exposed as QUnit.test
function test( testName, callback ) {
	if ( focused )  { return; }

	var newTest;

	newTest = new Test( {
		testName: testName,
		callback: callback
	} );

	newTest.queue();
}

// Will be exposed as QUnit.skip
function skip( testName ) {
	if ( focused )  { return; }

	var test = new Test( {
		testName: testName,
		skip: true
	} );

	test.queue();
}

// Will be exposed as QUnit.only
function only( testName, callback ) {
	var newTest;

	if ( focused )  { return; }

	QUnit.config.queue.length = 0;
	focused = true;

	newTest = new Test( {
		testName: testName,
		callback: callback
	} );

	newTest.queue();
}

// Put a hold on processing and return a function that will release it.
function internalStop( test ) {
	var released = false;

	test.semaphore += 1;
	config.blocking = true;

	// Set a recovery timeout, if so configured.
	if ( config.testTimeout && defined.setTimeout ) {
		clearTimeout( config.timeout );
		config.timeout = setTimeout( function() {
			QUnit.pushFailure( "Test timed out", sourceFromStacktrace( 2 ) );
			internalRecover( test );
		}, config.testTimeout );
	}

	return function resume() {
		if ( released ) {
			return;
		}

		released = true;
		test.semaphore -= 1;
		internalStart( test );
	};
}

// Forcefully release all processing holds.
function internalRecover( test ) {
	test.semaphore = 0;
	internalStart( test );
}

// Release a processing hold, scheduling a resumption attempt if no holds remain.
function internalStart( test ) {

	// If semaphore is non-numeric, throw error
	if ( isNaN( test.semaphore ) ) {
		test.semaphore = 0;

		QUnit.pushFailure(
			"Invalid value on test.semaphore",
			sourceFromStacktrace( 2 )
		);
		return;
	}

	// Don't start until equal number of stop-calls
	if ( test.semaphore > 0 ) {
		return;
	}

	// Throw an Error if start is called more often than stop
	if ( test.semaphore < 0 ) {
		test.semaphore = 0;

		QUnit.pushFailure(
			"Tried to restart test while already started (test's semaphore was 0 already)",
			sourceFromStacktrace( 2 )
		);
		return;
	}

	// Add a slight delay to allow more assertions etc.
	if ( defined.setTimeout ) {
		if ( config.timeout ) {
			clearTimeout( config.timeout );
		}
		config.timeout = setTimeout( function() {
			if ( test.semaphore > 0 ) {
				return;
			}

			if ( config.timeout ) {
				clearTimeout( config.timeout );
			}

			begin();
		}, 13 );
	} else {
		begin();
	}
}

function numberOfTests( module ) {
	var count = module.tests.length;
	while ( module = module.childModule ) {
		count += module.tests.length;
	}
	return count;
}

function notifyTestsRan( module ) {
	module.testsRun++;
	while ( module = module.parentModule ) {
		module.testsRun++;
	}
}

function Assert( testContext ) {
	this.test = testContext;
}

// Assert helpers
QUnit.assert = Assert.prototype = {

	// Specify the number of expected assertions to guarantee that failed test
	// (no assertions are run at all) don't slip through.
	expect: function( asserts ) {
		if ( arguments.length === 1 ) {
			this.test.expected = asserts;
		} else {
			return this.test.expected;
		}
	},

	// Put a hold on processing and return a function that will release it a maximum of once.
	async: function( count ) {
		var resume,
			test = this.test,
			popped = false,
			acceptCallCount = count;

		if ( typeof acceptCallCount === "undefined" ) {
			acceptCallCount = 1;
		}

		test.usedAsync = true;
		resume = internalStop( test );

		return function done() {

			if ( popped ) {
				test.pushFailure( "Too many calls to the `assert.async` callback",
					sourceFromStacktrace( 2 ) );
				return;
			}
			acceptCallCount -= 1;
			if ( acceptCallCount > 0 ) {
				return;
			}

			popped = true;
			resume();
		};
	},

	// Exports test.push() to the user API
	// Alias of pushResult.
	push: function( result, actual, expected, message, negative ) {
		var currentAssert = this instanceof Assert ? this : QUnit.config.current.assert;
		return currentAssert.pushResult( {
			result: result,
			actual: actual,
			expected: expected,
			message: message,
			negative: negative
		} );
	},

	pushResult: function( resultInfo ) {

		// Destructure of resultInfo = { result, actual, expected, message, negative }
		var assert = this,
			currentTest = ( assert instanceof Assert && assert.test ) || QUnit.config.current;

		// Backwards compatibility fix.
		// Allows the direct use of global exported assertions and QUnit.assert.*
		// Although, it's use is not recommended as it can leak assertions
		// to other tests from async tests, because we only get a reference to the current test,
		// not exactly the test where assertion were intended to be called.
		if ( !currentTest ) {
			throw new Error( "assertion outside test context, in " + sourceFromStacktrace( 2 ) );
		}

		if ( currentTest.usedAsync === true && currentTest.semaphore === 0 ) {
			currentTest.pushFailure( "Assertion after the final `assert.async` was resolved",
				sourceFromStacktrace( 2 ) );

			// Allow this assertion to continue running anyway...
		}

		if ( !( assert instanceof Assert ) ) {
			assert = currentTest.assert;
		}

		return assert.test.pushResult( resultInfo );
	},

	ok: function( result, message ) {
		message = message || ( result ? "okay" : "failed, expected argument to be truthy, was: " +
			QUnit.dump.parse( result ) );
		this.pushResult( {
			result: !!result,
			actual: result,
			expected: true,
			message: message
		} );
	},

	notOk: function( result, message ) {
		message = message || ( !result ? "okay" : "failed, expected argument to be falsy, was: " +
			QUnit.dump.parse( result ) );
		this.pushResult( {
			result: !result,
			actual: result,
			expected: false,
			message: message
		} );
	},

	equal: function( actual, expected, message ) {
		/*jshint eqeqeq:false */
		this.pushResult( {
			result: expected == actual,
			actual: actual,
			expected: expected,
			message: message
		} );
	},

	notEqual: function( actual, expected, message ) {
		/*jshint eqeqeq:false */
		this.pushResult( {
			result: expected != actual,
			actual: actual,
			expected: expected,
			message: message,
			negative: true
		} );
	},

	propEqual: function( actual, expected, message ) {
		actual = objectValues( actual );
		expected = objectValues( expected );
		this.pushResult( {
			result: QUnit.equiv( actual, expected ),
			actual: actual,
			expected: expected,
			message: message
		} );
	},

	notPropEqual: function( actual, expected, message ) {
		actual = objectValues( actual );
		expected = objectValues( expected );
		this.pushResult( {
			result: !QUnit.equiv( actual, expected ),
			actual: actual,
			expected: expected,
			message: message,
			negative: true
		} );
	},

	deepEqual: function( actual, expected, message ) {
		this.pushResult( {
			result: QUnit.equiv( actual, expected ),
			actual: actual,
			expected: expected,
			message: message
		} );
	},

	notDeepEqual: function( actual, expected, message ) {
		this.pushResult( {
			result: !QUnit.equiv( actual, expected ),
			actual: actual,
			expected: expected,
			message: message,
			negative: true
		} );
	},

	strictEqual: function( actual, expected, message ) {
		this.pushResult( {
			result: expected === actual,
			actual: actual,
			expected: expected,
			message: message
		} );
	},

	notStrictEqual: function( actual, expected, message ) {
		this.pushResult( {
			result: expected !== actual,
			actual: actual,
			expected: expected,
			message: message,
			negative: true
		} );
	},

	"throws": function( block, expected, message ) {
		var actual, expectedType,
			expectedOutput = expected,
			ok = false,
			currentTest = ( this instanceof Assert && this.test ) || QUnit.config.current;

		// 'expected' is optional unless doing string comparison
		if ( QUnit.objectType( expected ) === "string" ) {
			if ( message == null ) {
				message = expected;
				expected = null;
			} else {
				throw new Error(
					"throws/raises does not accept a string value for the expected argument.\n" +
					"Use a non-string object value (e.g. regExp) instead if it's necessary." +
					"Details in our upgrade guide at https://qunitjs.com/upgrade-guide-2.x/"
				);
			}
		}

		currentTest.ignoreGlobalErrors = true;
		try {
			block.call( currentTest.testEnvironment );
		} catch ( e ) {
			actual = e;
		}
		currentTest.ignoreGlobalErrors = false;

		if ( actual ) {
			expectedType = QUnit.objectType( expected );

			// We don't want to validate thrown error
			if ( !expected ) {
				ok = true;
				expectedOutput = null;

			// Expected is a regexp
			} else if ( expectedType === "regexp" ) {
				ok = expected.test( errorString( actual ) );

			// Expected is a constructor, maybe an Error constructor
			} else if ( expectedType === "function" && actual instanceof expected ) {
				ok = true;

			// Expected is an Error object
			} else if ( expectedType === "object" ) {
				ok = actual instanceof expected.constructor &&
					actual.name === expected.name &&
					actual.message === expected.message;

			// Expected is a validation function which returns true if validation passed
			} else if ( expectedType === "function" && expected.call( {}, actual ) === true ) {
				expectedOutput = null;
				ok = true;
			}
		}

		currentTest.assert.pushResult( {
			result: ok,
			actual: actual,
			expected: expectedOutput,
			message: message
		} );
	}
};

// Provide an alternative to assert.throws(), for environments that consider throws a reserved word
// Known to us are: Closure Compiler, Narwhal
( function() {
	/*jshint sub:true */
	Assert.prototype.raises = Assert.prototype [ "throws" ]; //jscs:ignore requireDotNotation
}() );

function errorString( error ) {
	var name, message,
		resultErrorString = error.toString();
	if ( resultErrorString.substring( 0, 7 ) === "[object" ) {
		name = error.name ? error.name.toString() : "Error";
		message = error.message ? error.message.toString() : "";
		if ( name && message ) {
			return name + ": " + message;
		} else if ( name ) {
			return name;
		} else if ( message ) {
			return message;
		} else {
			return "Error";
		}
	} else {
		return resultErrorString;
	}
}

// Test for equality any JavaScript type.
// Author: Philippe Rathé <prathe@gmail.com>
QUnit.equiv = ( function() {

	// Stack to decide between skip/abort functions
	var callers = [];

	// Stack to avoiding loops from circular referencing
	var parents = [];
	var parentsB = [];

	var getProto = Object.getPrototypeOf || function( obj ) {

		/*jshint proto: true */
		return obj.__proto__;
	};

	function useStrictEquality( b, a ) {

		// To catch short annotation VS 'new' annotation of a declaration. e.g.:
		// `var i = 1;`
		// `var j = new Number(1);`
		if ( typeof a === "object" ) {
			a = a.valueOf();
		}
		if ( typeof b === "object" ) {
			b = b.valueOf();
		}

		return a === b;
	}

	function compareConstructors( a, b ) {
		var protoA = getProto( a );
		var protoB = getProto( b );

		// Comparing constructors is more strict than using `instanceof`
		if ( a.constructor === b.constructor ) {
			return true;
		}

		// Ref #851
		// If the obj prototype descends from a null constructor, treat it
		// as a null prototype.
		if ( protoA && protoA.constructor === null ) {
			protoA = null;
		}
		if ( protoB && protoB.constructor === null ) {
			protoB = null;
		}

		// Allow objects with no prototype to be equivalent to
		// objects with Object as their constructor.
		if ( ( protoA === null && protoB === Object.prototype ) ||
				( protoB === null && protoA === Object.prototype ) ) {
			return true;
		}

		return false;
	}

	function getRegExpFlags( regexp ) {
		return "flags" in regexp ? regexp.flags : regexp.toString().match( /[gimuy]*$/ )[ 0 ];
	}

	var callbacks = {
		"string": useStrictEquality,
		"boolean": useStrictEquality,
		"number": useStrictEquality,
		"null": useStrictEquality,
		"undefined": useStrictEquality,
		"symbol": useStrictEquality,
		"date": useStrictEquality,

		"nan": function() {
			return true;
		},

		"regexp": function( b, a ) {
			return a.source === b.source &&

				// Include flags in the comparison
				getRegExpFlags( a ) === getRegExpFlags( b );
		},

		// - skip when the property is a method of an instance (OOP)
		// - abort otherwise,
		// initial === would have catch identical references anyway
		"function": function() {
			var caller = callers[ callers.length - 1 ];
			return caller !== Object && typeof caller !== "undefined";
		},

		"array": function( b, a ) {
			var i, j, len, loop, aCircular, bCircular;

			len = a.length;
			if ( len !== b.length ) {

				// Safe and faster
				return false;
			}

			// Track reference to avoid circular references
			parents.push( a );
			parentsB.push( b );
			for ( i = 0; i < len; i++ ) {
				loop = false;
				for ( j = 0; j < parents.length; j++ ) {
					aCircular = parents[ j ] === a[ i ];
					bCircular = parentsB[ j ] === b[ i ];
					if ( aCircular || bCircular ) {
						if ( a[ i ] === b[ i ] || aCircular && bCircular ) {
							loop = true;
						} else {
							parents.pop();
							parentsB.pop();
							return false;
						}
					}
				}
				if ( !loop && !innerEquiv( a[ i ], b[ i ] ) ) {
					parents.pop();
					parentsB.pop();
					return false;
				}
			}
			parents.pop();
			parentsB.pop();
			return true;
		},

		"set": function( b, a ) {
			var innerEq,
				outerEq = true;

			if ( a.size !== b.size ) {
				return false;
			}

			a.forEach( function( aVal ) {
				innerEq = false;

				b.forEach( function( bVal ) {
					if ( innerEquiv( bVal, aVal ) ) {
						innerEq = true;
					}
				} );

				if ( !innerEq ) {
					outerEq = false;
				}
			} );

			return outerEq;
		},

		"map": function( b, a ) {
			var innerEq,
				outerEq = true;

			if ( a.size !== b.size ) {
				return false;
			}

			a.forEach( function( aVal, aKey ) {
				innerEq = false;

				b.forEach( function( bVal, bKey ) {
					if ( innerEquiv( [ bVal, bKey ], [ aVal, aKey ] ) ) {
						innerEq = true;
					}
				} );

				if ( !innerEq ) {
					outerEq = false;
				}
			} );

			return outerEq;
		},

		"object": function( b, a ) {
			var i, j, loop, aCircular, bCircular;

			// Default to true
			var eq = true;
			var aProperties = [];
			var bProperties = [];

			if ( compareConstructors( a, b ) === false ) {
				return false;
			}

			// Stack constructor before traversing properties
			callers.push( a.constructor );

			// Track reference to avoid circular references
			parents.push( a );
			parentsB.push( b );

			// Be strict: don't ensure hasOwnProperty and go deep
			for ( i in a ) {
				loop = false;
				for ( j = 0; j < parents.length; j++ ) {
					aCircular = parents[ j ] === a[ i ];
					bCircular = parentsB[ j ] === b[ i ];
					if ( aCircular || bCircular ) {
						if ( a[ i ] === b[ i ] || aCircular && bCircular ) {
							loop = true;
						} else {
							eq = false;
							break;
						}
					}
				}
				aProperties.push( i );
				if ( !loop && !innerEquiv( a[ i ], b[ i ] ) ) {
					eq = false;
					break;
				}
			}

			parents.pop();
			parentsB.pop();

			// Unstack, we are done
			callers.pop();

			for ( i in b ) {

				// Collect b's properties
				bProperties.push( i );
			}

			// Ensures identical properties name
			return eq && innerEquiv( aProperties.sort(), bProperties.sort() );
		}
	};

	function typeEquiv( a, b ) {
		var type = QUnit.objectType( a );
		return QUnit.objectType( b ) === type && callbacks[ type ]( b, a );
	}

	// The real equiv function
	function innerEquiv( a, b ) {

		// We're done when there's nothing more to compare
		if ( arguments.length < 2 ) {
			return true;
		}

		// Require type-specific equality
		return ( a === b || typeEquiv( a, b ) ) &&

			// ...across all consecutive argument pairs
			( arguments.length === 2 || innerEquiv.apply( this, [].slice.call( arguments, 1 ) ) );
	}

	return innerEquiv;
}() );

// Based on jsDump by Ariel Flesler
// http://flesler.blogspot.com/2008/05/jsdump-pretty-dump-of-any-javascript.html
QUnit.dump = ( function() {
	function quote( str ) {
		return "\"" + str.toString().replace( /\\/g, "\\\\" ).replace( /"/g, "\\\"" ) + "\"";
	}
	function literal( o ) {
		return o + "";
	}
	function join( pre, arr, post ) {
		var s = dump.separator(),
			base = dump.indent(),
			inner = dump.indent( 1 );
		if ( arr.join ) {
			arr = arr.join( "," + s + inner );
		}
		if ( !arr ) {
			return pre + post;
		}
		return [ pre, inner + arr, base + post ].join( s );
	}
	function array( arr, stack ) {
		var i = arr.length,
			ret = new Array( i );

		if ( dump.maxDepth && dump.depth > dump.maxDepth ) {
			return "[object Array]";
		}

		this.up();
		while ( i-- ) {
			ret[ i ] = this.parse( arr[ i ], undefined, stack );
		}
		this.down();
		return join( "[", ret, "]" );
	}

	function isArray( obj ) {
		return (

			//Native Arrays
			toString.call( obj ) === "[object Array]" ||

			// NodeList objects
			( typeof obj.length === "number" && obj.item !== undefined ) &&
			( obj.length ?
				obj.item( 0 ) === obj[ 0 ] :
				( obj.item( 0 ) === null && obj[ 0 ] === undefined )
			)
		);
	}

	var reName = /^function (\w+)/,
		dump = {

			// The objType is used mostly internally, you can fix a (custom) type in advance
			parse: function( obj, objType, stack ) {
				stack = stack || [];
				var res, parser, parserType,
					inStack = inArray( obj, stack );

				if ( inStack !== -1 ) {
					return "recursion(" + ( inStack - stack.length ) + ")";
				}

				objType = objType || this.typeOf( obj  );
				parser = this.parsers[ objType ];
				parserType = typeof parser;

				if ( parserType === "function" ) {
					stack.push( obj );
					res = parser.call( this, obj, stack );
					stack.pop();
					return res;
				}
				return ( parserType === "string" ) ? parser : this.parsers.error;
			},
			typeOf: function( obj ) {
				var type;

				if ( obj === null ) {
					type = "null";
				} else if ( typeof obj === "undefined" ) {
					type = "undefined";
				} else if ( QUnit.is( "regexp", obj ) ) {
					type = "regexp";
				} else if ( QUnit.is( "date", obj ) ) {
					type = "date";
				} else if ( QUnit.is( "function", obj ) ) {
					type = "function";
				} else if ( obj.setInterval !== undefined &&
						obj.document !== undefined &&
						obj.nodeType === undefined ) {
					type = "window";
				} else if ( obj.nodeType === 9 ) {
					type = "document";
				} else if ( obj.nodeType ) {
					type = "node";
				} else if ( isArray( obj ) ) {
					type = "array";
				} else if ( obj.constructor === Error.prototype.constructor ) {
					type = "error";
				} else {
					type = typeof obj;
				}
				return type;
			},

			separator: function() {
				return this.multiline ? this.HTML ? "<br />" : "\n" : this.HTML ? "&#160;" : " ";
			},

			// Extra can be a number, shortcut for increasing-calling-decreasing
			indent: function( extra ) {
				if ( !this.multiline ) {
					return "";
				}
				var chr = this.indentChar;
				if ( this.HTML ) {
					chr = chr.replace( /\t/g, "   " ).replace( / /g, "&#160;" );
				}
				return new Array( this.depth + ( extra || 0 ) ).join( chr );
			},
			up: function( a ) {
				this.depth += a || 1;
			},
			down: function( a ) {
				this.depth -= a || 1;
			},
			setParser: function( name, parser ) {
				this.parsers[ name ] = parser;
			},

			// The next 3 are exposed so you can use them
			quote: quote,
			literal: literal,
			join: join,
			depth: 1,
			maxDepth: QUnit.config.maxDepth,

			// This is the list of parsers, to modify them, use dump.setParser
			parsers: {
				window: "[Window]",
				document: "[Document]",
				error: function( error ) {
					return "Error(\"" + error.message + "\")";
				},
				unknown: "[Unknown]",
				"null": "null",
				"undefined": "undefined",
				"function": function( fn ) {
					var ret = "function",

						// Functions never have name in IE
						name = "name" in fn ? fn.name : ( reName.exec( fn ) || [] )[ 1 ];

					if ( name ) {
						ret += " " + name;
					}
					ret += "(";

					ret = [ ret, dump.parse( fn, "functionArgs" ), "){" ].join( "" );
					return join( ret, dump.parse( fn, "functionCode" ), "}" );
				},
				array: array,
				nodelist: array,
				"arguments": array,
				object: function( map, stack ) {
					var keys, key, val, i, nonEnumerableProperties,
						ret = [];

					if ( dump.maxDepth && dump.depth > dump.maxDepth ) {
						return "[object Object]";
					}

					dump.up();
					keys = [];
					for ( key in map ) {
						keys.push( key );
					}

					// Some properties are not always enumerable on Error objects.
					nonEnumerableProperties = [ "message", "name" ];
					for ( i in nonEnumerableProperties ) {
						key = nonEnumerableProperties[ i ];
						if ( key in map && inArray( key, keys ) < 0 ) {
							keys.push( key );
						}
					}
					keys.sort();
					for ( i = 0; i < keys.length; i++ ) {
						key = keys[ i ];
						val = map[ key ];
						ret.push( dump.parse( key, "key" ) + ": " +
							dump.parse( val, undefined, stack ) );
					}
					dump.down();
					return join( "{", ret, "}" );
				},
				node: function( node ) {
					var len, i, val,
						open = dump.HTML ? "&lt;" : "<",
						close = dump.HTML ? "&gt;" : ">",
						tag = node.nodeName.toLowerCase(),
						ret = open + tag,
						attrs = node.attributes;

					if ( attrs ) {
						for ( i = 0, len = attrs.length; i < len; i++ ) {
							val = attrs[ i ].nodeValue;

							// IE6 includes all attributes in .attributes, even ones not explicitly
							// set. Those have values like undefined, null, 0, false, "" or
							// "inherit".
							if ( val && val !== "inherit" ) {
								ret += " " + attrs[ i ].nodeName + "=" +
									dump.parse( val, "attribute" );
							}
						}
					}
					ret += close;

					// Show content of TextNode or CDATASection
					if ( node.nodeType === 3 || node.nodeType === 4 ) {
						ret += node.nodeValue;
					}

					return ret + open + "/" + tag + close;
				},

				// Function calls it internally, it's the arguments part of the function
				functionArgs: function( fn ) {
					var args,
						l = fn.length;

					if ( !l ) {
						return "";
					}

					args = new Array( l );
					while ( l-- ) {

						// 97 is 'a'
						args[ l ] = String.fromCharCode( 97 + l );
					}
					return " " + args.join( ", " ) + " ";
				},

				// Object calls it internally, the key part of an item in a map
				key: quote,

				// Function calls it internally, it's the content of the function
				functionCode: "[code]",

				// Node calls it internally, it's a html attribute value
				attribute: quote,
				string: quote,
				date: quote,
				regexp: literal,
				number: literal,
				"boolean": literal,
				symbol: function( sym ) {
					return sym.toString();
				}
			},

			// If true, entities are escaped ( <, >, \t, space and \n )
			HTML: false,

			// Indentation unit
			indentChar: "  ",

			// If true, items in a collection, are separated by a \n, else just a space.
			multiline: true
		};

	return dump;
}() );

// Back compat
QUnit.jsDump = QUnit.dump;

function applyDeprecated( name ) {
	return function() {
		throw new Error(
			name + " is removed in QUnit 2.0.\n" +
			"Details in our upgrade guide at https://qunitjs.com/upgrade-guide-2.x/"
		);
	};
}

Object.keys( Assert.prototype ).forEach( function( key ) {
	QUnit[ key ] = applyDeprecated( "`QUnit." + key + "`" );
} );

QUnit.asyncTest = function() {
	throw new Error(
		"asyncTest is removed in QUnit 2.0, use QUnit.test() with assert.async() instead.\n" +
		"Details in our upgrade guide at https://qunitjs.com/upgrade-guide-2.x/"
	);
};

QUnit.stop = function() {
	throw new Error(
		"QUnit.stop is removed in QUnit 2.0, use QUnit.test() with assert.async() instead.\n" +
		"Details in our upgrade guide at https://qunitjs.com/upgrade-guide-2.x/"
	);
};

function resetThrower() {
	throw new Error(
		"QUnit.reset is removed in QUnit 2.0 without replacement.\n" +
		"Details in our upgrade guide at https://qunitjs.com/upgrade-guide-2.x/"
	);
}

Object.defineProperty( QUnit, "reset", {
	get: function() {
		return resetThrower;
	},
	set: resetThrower
} );

if ( defined.document ) {
	if ( window.QUnit ) {
		throw new Error( "QUnit has already been defined." );
	}

	[
		"test",
		"module",
		"expect",
		"start",
		"ok",
		"notOk",
		"equal",
		"notEqual",
		"propEqual",
		"notPropEqual",
		"deepEqual",
		"notDeepEqual",
		"strictEqual",
		"notStrictEqual",
		"throws",
		"raises"
	].forEach( function( key ) {
		window[ key ] = applyDeprecated( "The global `" + key + "`" );
	} );

	window.QUnit = QUnit;
}

// For nodejs
if ( typeof module !== "undefined" && module && module.exports ) {
	module.exports = QUnit;

	// For consistency with CommonJS environments' exports
	module.exports.QUnit = QUnit;
}

// For CommonJS with exports, but without module.exports, like Rhino
if ( typeof exports !== "undefined" && exports ) {
	exports.QUnit = QUnit;
}

if ( typeof define === "function" && define.amd ) {
	define( function() {
		return QUnit;
	} );
	QUnit.config.autostart = false;
}

// Get a reference to the global object, like window in browsers
}( ( function() {
	return this;
}() ) ) );

( function() {

if ( typeof window === "undefined" || !window.document ) {
	return;
}

var config = QUnit.config,
	hasOwn = Object.prototype.hasOwnProperty;

// Stores fixture HTML for resetting later
function storeFixture() {

	// Avoid overwriting user-defined values
	if ( hasOwn.call( config, "fixture" ) ) {
		return;
	}

	var fixture = document.getElementById( "qunit-fixture" );
	if ( fixture ) {
		config.fixture = fixture.innerHTML;
	}
}

QUnit.begin( storeFixture );

// Resets the fixture DOM element if available.
function resetFixture() {
	if ( config.fixture == null ) {
		return;
	}

	var fixture = document.getElementById( "qunit-fixture" );
	if ( fixture ) {
		fixture.innerHTML = config.fixture;
	}
}

QUnit.testStart( resetFixture );

}() );

( function() {

// Only interact with URLs via window.location
var location = typeof window !== "undefined" && window.location;
if ( !location ) {
	return;
}

var urlParams = getUrlParams();

QUnit.urlParams = urlParams;

// Match module/test by inclusion in an array
QUnit.config.moduleId = [].concat( urlParams.moduleId || [] );
QUnit.config.testId = [].concat( urlParams.testId || [] );

// Exact case-insensitive match of the module name
QUnit.config.module = urlParams.module;

// Regular expression or case-insenstive substring match against "moduleName: testName"
QUnit.config.filter = urlParams.filter;

// Test order randomization
if ( urlParams.seed === true ) {

	// Generate a random seed if the option is specified without a value
	QUnit.config.seed = Math.random().toString( 36 ).slice( 2 );
} else if ( urlParams.seed ) {
	QUnit.config.seed = urlParams.seed;
}

// Add URL-parameter-mapped config values with UI form rendering data
QUnit.config.urlConfig.push(
	{
		id: "hidepassed",
		label: "Hide passed tests",
		tooltip: "Only show tests and assertions that fail. Stored as query-strings."
	},
	{
		id: "noglobals",
		label: "Check for Globals",
		tooltip: "Enabling this will test if any test introduces new properties on the " +
			"global object (`window` in Browsers). Stored as query-strings."
	},
	{
		id: "notrycatch",
		label: "No try-catch",
		tooltip: "Enabling this will run tests outside of a try-catch block. Makes debugging " +
			"exceptions in IE reasonable. Stored as query-strings."
	}
);

QUnit.begin( function() {
	var i, option,
		urlConfig = QUnit.config.urlConfig;

	for ( i = 0; i < urlConfig.length; i++ ) {

		// Options can be either strings or objects with nonempty "id" properties
		option = QUnit.config.urlConfig[ i ];
		if ( typeof option !== "string" ) {
			option = option.id;
		}

		if ( QUnit.config[ option ] === undefined ) {
			QUnit.config[ option ] = urlParams[ option ];
		}
	}
} );

function getUrlParams() {
	var i, param, name, value;
	var urlParams = {};
	var params = location.search.slice( 1 ).split( "&" );
	var length = params.length;

	for ( i = 0; i < length; i++ ) {
		if ( params[ i ] ) {
			param = params[ i ].split( "=" );
			name = decodeQueryParam( param[ 0 ] );

			// Allow just a key to turn on a flag, e.g., test.html?noglobals
			value = param.length === 1 ||
				decodeQueryParam( param.slice( 1 ).join( "=" ) ) ;
			if ( urlParams[ name ] ) {
				urlParams[ name ] = [].concat( urlParams[ name ], value );
			} else {
				urlParams[ name ] = value;
			}
		}
	}

	return urlParams;
}

function decodeQueryParam( param ) {
	return decodeURIComponent( param.replace( /\+/g, "%20" ) );
}

// Don't load the HTML Reporter on non-browser environments
if ( typeof window === "undefined" || !window.document ) {
	return;
}

QUnit.init = function() {
	throw new Error(
		"QUnit.init is removed in QUnit 2.0, use QUnit.test() with assert.async() instead.\n" +
		"Details in our upgrade guide at https://qunitjs.com/upgrade-guide-2.x/"
	);
};

var config = QUnit.config,
	document = window.document,
	collapseNext = false,
	hasOwn = Object.prototype.hasOwnProperty,
	unfilteredUrl = setUrl( { filter: undefined, module: undefined,
		moduleId: undefined, testId: undefined } ),
	defined = {
		sessionStorage: ( function() {
			var x = "qunit-test-string";
			try {
				sessionStorage.setItem( x, x );
				sessionStorage.removeItem( x );
				return true;
			} catch ( e ) {
				return false;
			}
		}() )
	},
	modulesList = [];

// Escape text for attribute or text content.
function escapeText( s ) {
	if ( !s ) {
		return "";
	}
	s = s + "";

	// Both single quotes and double quotes (for attributes)
	return s.replace( /['"<>&]/g, function( s ) {
		switch ( s ) {
		case "'":
			return "&#039;";
		case "\"":
			return "&quot;";
		case "<":
			return "&lt;";
		case ">":
			return "&gt;";
		case "&":
			return "&amp;";
		}
	} );
}

function addEvent( elem, type, fn ) {
	elem.addEventListener( type, fn, false );
}

function removeEvent( elem, type, fn ) {
	elem.removeEventListener( type, fn, false );
}

function addEvents( elems, type, fn ) {
	var i = elems.length;
	while ( i-- ) {
		addEvent( elems[ i ], type, fn );
	}
}

function hasClass( elem, name ) {
	return ( " " + elem.className + " " ).indexOf( " " + name + " " ) >= 0;
}

function addClass( elem, name ) {
	if ( !hasClass( elem, name ) ) {
		elem.className += ( elem.className ? " " : "" ) + name;
	}
}

function toggleClass( elem, name, force ) {
	if ( force || typeof force === "undefined" && !hasClass( elem, name ) ) {
		addClass( elem, name );
	} else {
		removeClass( elem, name );
	}
}

function removeClass( elem, name ) {
	var set = " " + elem.className + " ";

	// Class name may appear multiple times
	while ( set.indexOf( " " + name + " " ) >= 0 ) {
		set = set.replace( " " + name + " ", " " );
	}

	// Trim for prettiness
	elem.className = typeof set.trim === "function" ? set.trim() : set.replace( /^\s+|\s+$/g, "" );
}

function id( name ) {
	return document.getElementById && document.getElementById( name );
}

function interceptNavigation( ev ) {
	applyUrlParams();

	if ( ev && ev.preventDefault ) {
		ev.preventDefault();
	}

	return false;
}

function getUrlConfigHtml() {
	var i, j, val,
		escaped, escapedTooltip,
		selection = false,
		urlConfig = config.urlConfig,
		urlConfigHtml = "";

	for ( i = 0; i < urlConfig.length; i++ ) {

		// Options can be either strings or objects with nonempty "id" properties
		val = config.urlConfig[ i ];
		if ( typeof val === "string" ) {
			val = {
				id: val,
				label: val
			};
		}

		escaped = escapeText( val.id );
		escapedTooltip = escapeText( val.tooltip );

		if ( !val.value || typeof val.value === "string" ) {
			urlConfigHtml += "<label for='qunit-urlconfig-" + escaped +
				"' title='" + escapedTooltip + "'><input id='qunit-urlconfig-" + escaped +
				"' name='" + escaped + "' type='checkbox'" +
				( val.value ? " value='" + escapeText( val.value ) + "'" : "" ) +
				( config[ val.id ] ? " checked='checked'" : "" ) +
				" title='" + escapedTooltip + "' />" + escapeText( val.label ) + "</label>";
		} else {
			urlConfigHtml += "<label for='qunit-urlconfig-" + escaped +
				"' title='" + escapedTooltip + "'>" + val.label +
				": </label><select id='qunit-urlconfig-" + escaped +
				"' name='" + escaped + "' title='" + escapedTooltip + "'><option></option>";

			if ( QUnit.is( "array", val.value ) ) {
				for ( j = 0; j < val.value.length; j++ ) {
					escaped = escapeText( val.value[ j ] );
					urlConfigHtml += "<option value='" + escaped + "'" +
						( config[ val.id ] === val.value[ j ] ?
							( selection = true ) && " selected='selected'" : "" ) +
						">" + escaped + "</option>";
				}
			} else {
				for ( j in val.value ) {
					if ( hasOwn.call( val.value, j ) ) {
						urlConfigHtml += "<option value='" + escapeText( j ) + "'" +
							( config[ val.id ] === j ?
								( selection = true ) && " selected='selected'" : "" ) +
							">" + escapeText( val.value[ j ] ) + "</option>";
					}
				}
			}
			if ( config[ val.id ] && !selection ) {
				escaped = escapeText( config[ val.id ] );
				urlConfigHtml += "<option value='" + escaped +
					"' selected='selected' disabled='disabled'>" + escaped + "</option>";
			}
			urlConfigHtml += "</select>";
		}
	}

	return urlConfigHtml;
}

// Handle "click" events on toolbar checkboxes and "change" for select menus.
// Updates the URL with the new state of `config.urlConfig` values.
function toolbarChanged() {
	var updatedUrl, value, tests,
		field = this,
		params = {};

	// Detect if field is a select menu or a checkbox
	if ( "selectedIndex" in field ) {
		value = field.options[ field.selectedIndex ].value || undefined;
	} else {
		value = field.checked ? ( field.defaultValue || true ) : undefined;
	}

	params[ field.name ] = value;
	updatedUrl = setUrl( params );

	// Check if we can apply the change without a page refresh
	if ( "hidepassed" === field.name && "replaceState" in window.history ) {
		QUnit.urlParams[ field.name ] = value;
		config[ field.name ] = value || false;
		tests = id( "qunit-tests" );
		if ( tests ) {
			toggleClass( tests, "hidepass", value || false );
		}
		window.history.replaceState( null, "", updatedUrl );
	} else {
		window.location = updatedUrl;
	}
}

function setUrl( params ) {
	var key, arrValue, i,
		querystring = "?",
		location = window.location;

	params = QUnit.extend( QUnit.extend( {}, QUnit.urlParams ), params );

	for ( key in params ) {

		// Skip inherited or undefined properties
		if ( hasOwn.call( params, key ) && params[ key ] !== undefined ) {

			// Output a parameter for each value of this key (but usually just one)
			arrValue = [].concat( params[ key ] );
			for ( i = 0; i < arrValue.length; i++ ) {
				querystring += encodeURIComponent( key );
				if ( arrValue[ i ] !== true ) {
					querystring += "=" + encodeURIComponent( arrValue[ i ] );
				}
				querystring += "&";
			}
		}
	}
	return location.protocol + "//" + location.host +
		location.pathname + querystring.slice( 0, -1 );
}

function applyUrlParams() {
	var i,
		selectedModules = [],
		modulesList = id( "qunit-modulefilter-dropdown-list" ).getElementsByTagName( "input" ),
		filter = id( "qunit-filter-input" ).value;

	for ( i = 0; i < modulesList.length; i++ )  {
		if ( modulesList[ i ].checked ) {
			selectedModules.push( modulesList[ i ].value );
		}
	}

	window.location = setUrl( {
		filter: ( filter === "" ) ? undefined : filter,
		moduleId: ( selectedModules.length === 0 ) ? undefined : selectedModules,

		// Remove module and testId filter
		module: undefined,
		testId: undefined
	} );
}

function toolbarUrlConfigContainer() {
	var urlConfigContainer = document.createElement( "span" );

	urlConfigContainer.innerHTML = getUrlConfigHtml();
	addClass( urlConfigContainer, "qunit-url-config" );

	addEvents( urlConfigContainer.getElementsByTagName( "input" ), "change", toolbarChanged );
	addEvents( urlConfigContainer.getElementsByTagName( "select" ), "change", toolbarChanged );

	return urlConfigContainer;
}

function toolbarLooseFilter() {
	var filter = document.createElement( "form" ),
		label = document.createElement( "label" ),
		input = document.createElement( "input" ),
		button = document.createElement( "button" );

	addClass( filter, "qunit-filter" );

	label.innerHTML = "Filter: ";

	input.type = "text";
	input.value = config.filter || "";
	input.name = "filter";
	input.id = "qunit-filter-input";

	button.innerHTML = "Go";

	label.appendChild( input );

	filter.appendChild( label );
	filter.appendChild( document.createTextNode( " " ) );
	filter.appendChild( button );
	addEvent( filter, "submit", interceptNavigation );

	return filter;
}

function moduleListHtml () {
	var i, checked,
		html = "";

	for ( i = 0; i < config.modules.length; i++ ) {
		if ( config.modules[ i ].name !== "" ) {
			checked = config.moduleId.indexOf( config.modules[ i ].moduleId ) > -1;
			html += "<li><label class='clickable" + ( checked ? " checked" : "" ) +
				"'><input type='checkbox' " + "value='" + config.modules[ i ].moduleId + "'" +
				( checked ? " checked='checked'" : "" ) + " />" +
				escapeText( config.modules[ i ].name ) + "</label></li>";
		}
	}

	return html;
}

function toolbarModuleFilter () {
	var allCheckbox, commit, reset,
		moduleFilter = document.createElement( "form" ),
		label = document.createElement( "label" ),
		moduleSearch = document.createElement( "input" ),
		dropDown = document.createElement( "div" ),
		actions = document.createElement( "span" ),
		dropDownList = document.createElement( "ul" ),
		dirty = false;

	moduleSearch.id = "qunit-modulefilter-search";
	addEvent( moduleSearch, "input", searchInput );
	addEvent( moduleSearch, "input", searchFocus );
	addEvent( moduleSearch, "focus", searchFocus );
	addEvent( moduleSearch, "click", searchFocus );

	label.id = "qunit-modulefilter-search-container";
	label.innerHTML = "Module: ";
	label.appendChild( moduleSearch );

	actions.id = "qunit-modulefilter-actions";
	actions.innerHTML =
		"<button style='display:none'>Apply</button>" +
		"<button type='reset' style='display:none'>Reset</button>" +
		"<label class='clickable" +
		( config.moduleId.length ? "" : " checked" ) +
		"'><input type='checkbox'" + ( config.moduleId.length ? "" : " checked='checked'" ) +
		">All modules</label>";
	allCheckbox = actions.lastChild.firstChild;
	commit = actions.firstChild;
	reset = commit.nextSibling;
	addEvent( commit, "click", applyUrlParams );

	dropDownList.id = "qunit-modulefilter-dropdown-list";
	dropDownList.innerHTML = moduleListHtml();

	dropDown.id = "qunit-modulefilter-dropdown";
	dropDown.style.display = "none";
	dropDown.appendChild( actions );
	dropDown.appendChild( dropDownList );
	addEvent( dropDown, "change", selectionChange );
	selectionChange();

	moduleFilter.id = "qunit-modulefilter";
	moduleFilter.appendChild( label );
	moduleFilter.appendChild( dropDown ) ;
	addEvent( moduleFilter, "submit", interceptNavigation );
	addEvent( moduleFilter, "reset", function() {

		// Let the reset happen, then update styles
		window.setTimeout( selectionChange );
	} );

	// Enables show/hide for the dropdown
	function searchFocus() {
		if ( dropDown.style.display !== "none" ) {
			return;
		}

		dropDown.style.display = "block";
		addEvent( document, "click", hideHandler );
		addEvent( document, "keydown", hideHandler );

		// Hide on Escape keydown or outside-container click
		function hideHandler( e )  {
			var inContainer = moduleFilter.contains( e.target );

			if ( e.keyCode === 27 || !inContainer ) {
				if ( e.keyCode === 27 && inContainer ) {
					moduleSearch.focus();
				}
				dropDown.style.display = "none";
				removeEvent( document, "click", hideHandler );
				removeEvent( document, "keydown", hideHandler );
				moduleSearch.value = "";
				searchInput();
			}
		}
	}

	// Processes module search box input
	function searchInput() {
		var i, item,
			searchText = moduleSearch.value.toLowerCase(),
			listItems = dropDownList.children;

		for ( i = 0; i < listItems.length; i++ ) {
			item = listItems[ i ];
			if ( !searchText || item.textContent.toLowerCase().indexOf( searchText ) > -1 ) {
				item.style.display = "";
			} else {
				item.style.display = "none";
			}
		}
	}

	// Processes selection changes
	function selectionChange( evt ) {
		var i, item,
			checkbox = evt && evt.target || allCheckbox,
			modulesList = dropDownList.getElementsByTagName( "input" ),
			selectedNames = [];

		toggleClass( checkbox.parentNode, "checked", checkbox.checked );

		dirty = false;
		if ( checkbox.checked && checkbox !== allCheckbox ) {
		   allCheckbox.checked = false;
		   removeClass( allCheckbox.parentNode, "checked" );
		}
		for ( i = 0; i < modulesList.length; i++ )  {
			item = modulesList[ i ];
			if ( !evt ) {
				toggleClass( item.parentNode, "checked", item.checked );
			} else if ( checkbox === allCheckbox && checkbox.checked ) {
				item.checked = false;
				removeClass( item.parentNode, "checked" );
			}
			dirty = dirty || ( item.checked !== item.defaultChecked );
			if ( item.checked ) {
				selectedNames.push( item.parentNode.textContent );
			}
		}

		commit.style.display = reset.style.display = dirty ? "" : "none";
		moduleSearch.placeholder = selectedNames.join( ", " ) || allCheckbox.parentNode.textContent;
		moduleSearch.title = "Type to filter list. Current selection:\n" +
			( selectedNames.join( "\n" ) || allCheckbox.parentNode.textContent );
	}

	return moduleFilter;
}

function appendToolbar() {
	var toolbar = id( "qunit-testrunner-toolbar" );

	if ( toolbar ) {
		toolbar.appendChild( toolbarUrlConfigContainer() );
		toolbar.appendChild( toolbarModuleFilter() );
		toolbar.appendChild( toolbarLooseFilter() );
		toolbar.appendChild( document.createElement( "div" ) ).className = "clearfix";
	}
}

function appendHeader() {
	var header = id( "qunit-header" );

	if ( header ) {
		header.innerHTML = "<a href='" + escapeText( unfilteredUrl ) + "'>" + header.innerHTML +
			"</a> ";
	}
}

function appendBanner() {
	var banner = id( "qunit-banner" );

	if ( banner ) {
		banner.className = "";
	}
}

function appendTestResults() {
	var tests = id( "qunit-tests" ),
		result = id( "qunit-testresult" );

	if ( result ) {
		result.parentNode.removeChild( result );
	}

	if ( tests ) {
		tests.innerHTML = "";
		result = document.createElement( "p" );
		result.id = "qunit-testresult";
		result.className = "result";
		tests.parentNode.insertBefore( result, tests );
		result.innerHTML = "Running...<br />&#160;";
	}
}

function appendFilteredTest() {
	var testId = QUnit.config.testId;
	if ( !testId || testId.length <= 0 ) {
		return "";
	}
	return "<div id='qunit-filteredTest'>Rerunning selected tests: " +
		escapeText( testId.join( ", " ) ) +
		" <a id='qunit-clearFilter' href='" +
		escapeText( unfilteredUrl ) +
		"'>Run all tests</a></div>";
}

function appendUserAgent() {
	var userAgent = id( "qunit-userAgent" );

	if ( userAgent ) {
		userAgent.innerHTML = "";
		userAgent.appendChild(
			document.createTextNode(
				"QUnit " + QUnit.version + "; " + navigator.userAgent
			)
		);
	}
}

function appendInterface() {
	var qunit = id( "qunit" );

	if ( qunit ) {
		qunit.innerHTML =
			"<h1 id='qunit-header'>" + escapeText( document.title ) + "</h1>" +
			"<h2 id='qunit-banner'></h2>" +
			"<div id='qunit-testrunner-toolbar'></div>" +
			appendFilteredTest() +
			"<h2 id='qunit-userAgent'></h2>" +
			"<ol id='qunit-tests'></ol>";
	}

	appendHeader();
	appendBanner();
	appendTestResults();
	appendUserAgent();
	appendToolbar();
}

function appendTestsList( modules ) {
	var i, l, x, z, test, moduleObj;

	for ( i = 0, l = modules.length; i < l; i++ ) {
		moduleObj = modules[ i ];

		for ( x = 0, z = moduleObj.tests.length; x < z; x++ ) {
			test = moduleObj.tests[ x ];

			appendTest( test.name, test.testId, moduleObj.name );
		}
	}
}

function appendTest( name, testId, moduleName ) {
	var title, rerunTrigger, testBlock, assertList,
		tests = id( "qunit-tests" );

	if ( !tests ) {
		return;
	}

	title = document.createElement( "strong" );
	title.innerHTML = getNameHtml( name, moduleName );

	rerunTrigger = document.createElement( "a" );
	rerunTrigger.innerHTML = "Rerun";
	rerunTrigger.href = setUrl( { testId: testId } );

	testBlock = document.createElement( "li" );
	testBlock.appendChild( title );
	testBlock.appendChild( rerunTrigger );
	testBlock.id = "qunit-test-output-" + testId;

	assertList = document.createElement( "ol" );
	assertList.className = "qunit-assert-list";

	testBlock.appendChild( assertList );

	tests.appendChild( testBlock );
}

// HTML Reporter initialization and load
QUnit.begin( function( details ) {
	var i, moduleObj, tests;

	// Sort modules by name for the picker
	for ( i = 0; i < details.modules.length; i++ ) {
		moduleObj = details.modules[ i ];
		if ( moduleObj.name ) {
			modulesList.push( moduleObj.name );
		}
	}
	modulesList.sort( function( a, b ) {
		return a.localeCompare( b );
	} );

	// Initialize QUnit elements
	appendInterface();
	appendTestsList( details.modules );
	tests = id( "qunit-tests" );
	if ( tests && config.hidepassed ) {
		addClass( tests, "hidepass" );
	}
} );

QUnit.done( function( details ) {
	var i, key,
		banner = id( "qunit-banner" ),
		tests = id( "qunit-tests" ),
		html = [
			"Tests completed in ",
			details.runtime,
			" milliseconds.<br />",
			"<span class='passed'>",
			details.passed,
			"</span> assertions of <span class='total'>",
			details.total,
			"</span> passed, <span class='failed'>",
			details.failed,
			"</span> failed."
		].join( "" );

	if ( banner ) {
		banner.className = details.failed ? "qunit-fail" : "qunit-pass";
	}

	if ( tests ) {
		id( "qunit-testresult" ).innerHTML = html;
	}

	if ( config.altertitle && document.title ) {

		// Show ✖ for good, ✔ for bad suite result in title
		// use escape sequences in case file gets loaded with non-utf-8-charset
		document.title = [
			( details.failed ? "\u2716" : "\u2714" ),
			document.title.replace( /^[\u2714\u2716] /i, "" )
		].join( " " );
	}

	// Clear own sessionStorage items if all tests passed
	if ( config.reorder && defined.sessionStorage && details.failed === 0 ) {
		for ( i = 0; i < sessionStorage.length; i++ ) {
			key = sessionStorage.key( i++ );
			if ( key.indexOf( "qunit-test-" ) === 0 ) {
				sessionStorage.removeItem( key );
			}
		}
	}

	// Scroll back to top to show results
	if ( config.scrolltop && window.scrollTo ) {
		window.scrollTo( 0, 0 );
	}
} );

function getNameHtml( name, module ) {
	var nameHtml = "";

	if ( module ) {
		nameHtml = "<span class='module-name'>" + escapeText( module ) + "</span>: ";
	}

	nameHtml += "<span class='test-name'>" + escapeText( name ) + "</span>";

	return nameHtml;
}

QUnit.testStart( function( details ) {
	var running, testBlock, bad;

	testBlock = id( "qunit-test-output-" + details.testId );
	if ( testBlock ) {
		testBlock.className = "running";
	} else {

		// Report later registered tests
		appendTest( details.name, details.testId, details.module );
	}

	running = id( "qunit-testresult" );
	if ( running ) {
		bad = QUnit.config.reorder && defined.sessionStorage &&
			+sessionStorage.getItem( "qunit-test-" + details.module + "-" + details.name );

		running.innerHTML = ( bad ?
			"Rerunning previously failed test: <br />" :
			"Running: <br />" ) +
			getNameHtml( details.name, details.module );
	}

} );

function stripHtml( string ) {

	// Strip tags, html entity and whitespaces
	return string.replace( /<\/?[^>]+(>|$)/g, "" ).replace( /\&quot;/g, "" ).replace( /\s+/g, "" );
}

QUnit.log( function( details ) {
	var assertList, assertLi,
		message, expected, actual, diff,
		showDiff = false,
		testItem = id( "qunit-test-output-" + details.testId );

	if ( !testItem ) {
		return;
	}

	message = escapeText( details.message ) || ( details.result ? "okay" : "failed" );
	message = "<span class='test-message'>" + message + "</span>";
	message += "<span class='runtime'>@ " + details.runtime + " ms</span>";

	// The pushFailure doesn't provide details.expected
	// when it calls, it's implicit to also not show expected and diff stuff
	// Also, we need to check details.expected existence, as it can exist and be undefined
	if ( !details.result && hasOwn.call( details, "expected" ) ) {
		if ( details.negative ) {
			expected = "NOT " + QUnit.dump.parse( details.expected );
		} else {
			expected = QUnit.dump.parse( details.expected );
		}

		actual = QUnit.dump.parse( details.actual );
		message += "<table><tr class='test-expected'><th>Expected: </th><td><pre>" +
			escapeText( expected ) +
			"</pre></td></tr>";

		if ( actual !== expected ) {

			message += "<tr class='test-actual'><th>Result: </th><td><pre>" +
				escapeText( actual ) + "</pre></td></tr>";

			// Don't show diff if actual or expected are booleans
			if ( !( /^(true|false)$/.test( actual ) ) &&
					!( /^(true|false)$/.test( expected ) ) ) {
				diff = QUnit.diff( expected, actual );
				showDiff = stripHtml( diff ).length !==
					stripHtml( expected ).length +
					stripHtml( actual ).length;
			}

			// Don't show diff if expected and actual are totally different
			if ( showDiff ) {
				message += "<tr class='test-diff'><th>Diff: </th><td><pre>" +
					diff + "</pre></td></tr>";
			}
		} else if ( expected.indexOf( "[object Array]" ) !== -1 ||
				expected.indexOf( "[object Object]" ) !== -1 ) {
			message += "<tr class='test-message'><th>Message: </th><td>" +
				"Diff suppressed as the depth of object is more than current max depth (" +
				QUnit.config.maxDepth + ").<p>Hint: Use <code>QUnit.dump.maxDepth</code> to " +
				" run with a higher max depth or <a href='" +
				escapeText( setUrl( { maxDepth: -1 } ) ) + "'>" +
				"Rerun</a> without max depth.</p></td></tr>";
		} else {
			message += "<tr class='test-message'><th>Message: </th><td>" +
				"Diff suppressed as the expected and actual results have an equivalent" +
				" serialization</td></tr>";
		}

		if ( details.source ) {
			message += "<tr class='test-source'><th>Source: </th><td><pre>" +
				escapeText( details.source ) + "</pre></td></tr>";
		}

		message += "</table>";

	// This occurs when pushFailure is set and we have an extracted stack trace
	} else if ( !details.result && details.source ) {
		message += "<table>" +
			"<tr class='test-source'><th>Source: </th><td><pre>" +
			escapeText( details.source ) + "</pre></td></tr>" +
			"</table>";
	}

	assertList = testItem.getElementsByTagName( "ol" )[ 0 ];

	assertLi = document.createElement( "li" );
	assertLi.className = details.result ? "pass" : "fail";
	assertLi.innerHTML = message;
	assertList.appendChild( assertLi );
} );

QUnit.testDone( function( details ) {
	var testTitle, time, testItem, assertList,
		good, bad, testCounts, skipped, sourceName,
		tests = id( "qunit-tests" );

	if ( !tests ) {
		return;
	}

	testItem = id( "qunit-test-output-" + details.testId );

	assertList = testItem.getElementsByTagName( "ol" )[ 0 ];

	good = details.passed;
	bad = details.failed;

	// Store result when possible
	if ( config.reorder && defined.sessionStorage ) {
		if ( bad ) {
			sessionStorage.setItem( "qunit-test-" + details.module + "-" + details.name, bad );
		} else {
			sessionStorage.removeItem( "qunit-test-" + details.module + "-" + details.name );
		}
	}

	if ( bad === 0 ) {

		// Collapse the passing tests
		addClass( assertList, "qunit-collapsed" );
	} else if ( bad && config.collapse && !collapseNext ) {

		// Skip collapsing the first failing test
		collapseNext = true;
	} else {

		// Collapse remaining tests
		addClass( assertList, "qunit-collapsed" );
	}

	// The testItem.firstChild is the test name
	testTitle = testItem.firstChild;

	testCounts = bad ?
		"<b class='failed'>" + bad + "</b>, " + "<b class='passed'>" + good + "</b>, " :
		"";

	testTitle.innerHTML += " <b class='counts'>(" + testCounts +
		details.assertions.length + ")</b>";

	if ( details.skipped ) {
		testItem.className = "skipped";
		skipped = document.createElement( "em" );
		skipped.className = "qunit-skipped-label";
		skipped.innerHTML = "skipped";
		testItem.insertBefore( skipped, testTitle );
	} else {
		addEvent( testTitle, "click", function() {
			toggleClass( assertList, "qunit-collapsed" );
		} );

		testItem.className = bad ? "fail" : "pass";

		time = document.createElement( "span" );
		time.className = "runtime";
		time.innerHTML = details.runtime + " ms";
		testItem.insertBefore( time, assertList );
	}

	// Show the source of the test when showing assertions
	if ( details.source ) {
		sourceName = document.createElement( "p" );
		sourceName.innerHTML = "<strong>Source: </strong>" + details.source;
		addClass( sourceName, "qunit-source" );
		if ( bad === 0 ) {
			addClass( sourceName, "qunit-collapsed" );
		}
		addEvent( testTitle, "click", function() {
			toggleClass( sourceName, "qunit-collapsed" );
		} );
		testItem.appendChild( sourceName );
	}
} );

// Avoid readyState issue with phantomjs
// Ref: #818
var notPhantom = ( function( p ) {
	return !( p && p.version && p.version.major > 0 );
} )( window.phantom );

if ( notPhantom && document.readyState === "complete" ) {
	QUnit.load();
} else {
	addEvent( window, "load", QUnit.load );
}

/*
 * This file is a modified version of google-diff-match-patch's JavaScript implementation
 * (https://code.google.com/p/google-diff-match-patch/source/browse/trunk/javascript/diff_match_patch_uncompressed.js),
 * modifications are licensed as more fully set forth in LICENSE.txt.
 *
 * The original source of google-diff-match-patch is attributable and licensed as follows:
 *
 * Copyright 2006 Google Inc.
 * https://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * More Info:
 *  https://code.google.com/p/google-diff-match-patch/
 *
 * Usage: QUnit.diff(expected, actual)
 *
 */
QUnit.diff = ( function() {
	function DiffMatchPatch() {
	}

	//  DIFF FUNCTIONS

	/**
	 * The data structure representing a diff is an array of tuples:
	 * [[DIFF_DELETE, 'Hello'], [DIFF_INSERT, 'Goodbye'], [DIFF_EQUAL, ' world.']]
	 * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
	 */
	var DIFF_DELETE = -1,
		DIFF_INSERT = 1,
		DIFF_EQUAL = 0;

	/**
	 * Find the differences between two texts.  Simplifies the problem by stripping
	 * any common prefix or suffix off the texts before diffing.
	 * @param {string} text1 Old string to be diffed.
	 * @param {string} text2 New string to be diffed.
	 * @param {boolean=} optChecklines Optional speedup flag. If present and false,
	 *     then don't run a line-level diff first to identify the changed areas.
	 *     Defaults to true, which does a faster, slightly less optimal diff.
	 * @return {!Array.<!DiffMatchPatch.Diff>} Array of diff tuples.
	 */
	DiffMatchPatch.prototype.DiffMain = function( text1, text2, optChecklines ) {
		var deadline, checklines, commonlength,
			commonprefix, commonsuffix, diffs;

		// The diff must be complete in up to 1 second.
		deadline = ( new Date() ).getTime() + 1000;

		// Check for null inputs.
		if ( text1 === null || text2 === null ) {
			throw new Error( "Null input. (DiffMain)" );
		}

		// Check for equality (speedup).
		if ( text1 === text2 ) {
			if ( text1 ) {
				return [
					[ DIFF_EQUAL, text1 ]
				];
			}
			return [];
		}

		if ( typeof optChecklines === "undefined" ) {
			optChecklines = true;
		}

		checklines = optChecklines;

		// Trim off common prefix (speedup).
		commonlength = this.diffCommonPrefix( text1, text2 );
		commonprefix = text1.substring( 0, commonlength );
		text1 = text1.substring( commonlength );
		text2 = text2.substring( commonlength );

		// Trim off common suffix (speedup).
		commonlength = this.diffCommonSuffix( text1, text2 );
		commonsuffix = text1.substring( text1.length - commonlength );
		text1 = text1.substring( 0, text1.length - commonlength );
		text2 = text2.substring( 0, text2.length - commonlength );

		// Compute the diff on the middle block.
		diffs = this.diffCompute( text1, text2, checklines, deadline );

		// Restore the prefix and suffix.
		if ( commonprefix ) {
			diffs.unshift( [ DIFF_EQUAL, commonprefix ] );
		}
		if ( commonsuffix ) {
			diffs.push( [ DIFF_EQUAL, commonsuffix ] );
		}
		this.diffCleanupMerge( diffs );
		return diffs;
	};

	/**
	 * Reduce the number of edits by eliminating operationally trivial equalities.
	 * @param {!Array.<!DiffMatchPatch.Diff>} diffs Array of diff tuples.
	 */
	DiffMatchPatch.prototype.diffCleanupEfficiency = function( diffs ) {
		var changes, equalities, equalitiesLength, lastequality,
			pointer, preIns, preDel, postIns, postDel;
		changes = false;
		equalities = []; // Stack of indices where equalities are found.
		equalitiesLength = 0; // Keeping our own length var is faster in JS.
		/** @type {?string} */
		lastequality = null;

		// Always equal to diffs[equalities[equalitiesLength - 1]][1]
		pointer = 0; // Index of current position.

		// Is there an insertion operation before the last equality.
		preIns = false;

		// Is there a deletion operation before the last equality.
		preDel = false;

		// Is there an insertion operation after the last equality.
		postIns = false;

		// Is there a deletion operation after the last equality.
		postDel = false;
		while ( pointer < diffs.length ) {

			// Equality found.
			if ( diffs[ pointer ][ 0 ] === DIFF_EQUAL ) {
				if ( diffs[ pointer ][ 1 ].length < 4 && ( postIns || postDel ) ) {

					// Candidate found.
					equalities[ equalitiesLength++ ] = pointer;
					preIns = postIns;
					preDel = postDel;
					lastequality = diffs[ pointer ][ 1 ];
				} else {

					// Not a candidate, and can never become one.
					equalitiesLength = 0;
					lastequality = null;
				}
				postIns = postDel = false;

			// An insertion or deletion.
			} else {

				if ( diffs[ pointer ][ 0 ] === DIFF_DELETE ) {
					postDel = true;
				} else {
					postIns = true;
				}

				/*
				 * Five types to be split:
				 * <ins>A</ins><del>B</del>XY<ins>C</ins><del>D</del>
				 * <ins>A</ins>X<ins>C</ins><del>D</del>
				 * <ins>A</ins><del>B</del>X<ins>C</ins>
				 * <ins>A</del>X<ins>C</ins><del>D</del>
				 * <ins>A</ins><del>B</del>X<del>C</del>
				 */
				if ( lastequality && ( ( preIns && preDel && postIns && postDel ) ||
						( ( lastequality.length < 2 ) &&
						( preIns + preDel + postIns + postDel ) === 3 ) ) ) {

					// Duplicate record.
					diffs.splice(
						equalities[ equalitiesLength - 1 ],
						0,
						[ DIFF_DELETE, lastequality ]
					);

					// Change second copy to insert.
					diffs[ equalities[ equalitiesLength - 1 ] + 1 ][ 0 ] = DIFF_INSERT;
					equalitiesLength--; // Throw away the equality we just deleted;
					lastequality = null;
					if ( preIns && preDel ) {

						// No changes made which could affect previous entry, keep going.
						postIns = postDel = true;
						equalitiesLength = 0;
					} else {
						equalitiesLength--; // Throw away the previous equality.
						pointer = equalitiesLength > 0 ? equalities[ equalitiesLength - 1 ] : -1;
						postIns = postDel = false;
					}
					changes = true;
				}
			}
			pointer++;
		}

		if ( changes ) {
			this.diffCleanupMerge( diffs );
		}
	};

	/**
	 * Convert a diff array into a pretty HTML report.
	 * @param {!Array.<!DiffMatchPatch.Diff>} diffs Array of diff tuples.
	 * @param {integer} string to be beautified.
	 * @return {string} HTML representation.
	 */
	DiffMatchPatch.prototype.diffPrettyHtml = function( diffs ) {
		var op, data, x,
			html = [];
		for ( x = 0; x < diffs.length; x++ ) {
			op = diffs[ x ][ 0 ]; // Operation (insert, delete, equal)
			data = diffs[ x ][ 1 ]; // Text of change.
			switch ( op ) {
			case DIFF_INSERT:
				html[ x ] = "<ins>" + escapeText( data ) + "</ins>";
				break;
			case DIFF_DELETE:
				html[ x ] = "<del>" + escapeText( data ) + "</del>";
				break;
			case DIFF_EQUAL:
				html[ x ] = "<span>" + escapeText( data ) + "</span>";
				break;
			}
		}
		return html.join( "" );
	};

	/**
	 * Determine the common prefix of two strings.
	 * @param {string} text1 First string.
	 * @param {string} text2 Second string.
	 * @return {number} The number of characters common to the start of each
	 *     string.
	 */
	DiffMatchPatch.prototype.diffCommonPrefix = function( text1, text2 ) {
		var pointermid, pointermax, pointermin, pointerstart;

		// Quick check for common null cases.
		if ( !text1 || !text2 || text1.charAt( 0 ) !== text2.charAt( 0 ) ) {
			return 0;
		}

		// Binary search.
		// Performance analysis: https://neil.fraser.name/news/2007/10/09/
		pointermin = 0;
		pointermax = Math.min( text1.length, text2.length );
		pointermid = pointermax;
		pointerstart = 0;
		while ( pointermin < pointermid ) {
			if ( text1.substring( pointerstart, pointermid ) ===
					text2.substring( pointerstart, pointermid ) ) {
				pointermin = pointermid;
				pointerstart = pointermin;
			} else {
				pointermax = pointermid;
			}
			pointermid = Math.floor( ( pointermax - pointermin ) / 2 + pointermin );
		}
		return pointermid;
	};

	/**
	 * Determine the common suffix of two strings.
	 * @param {string} text1 First string.
	 * @param {string} text2 Second string.
	 * @return {number} The number of characters common to the end of each string.
	 */
	DiffMatchPatch.prototype.diffCommonSuffix = function( text1, text2 ) {
		var pointermid, pointermax, pointermin, pointerend;

		// Quick check for common null cases.
		if ( !text1 ||
				!text2 ||
				text1.charAt( text1.length - 1 ) !== text2.charAt( text2.length - 1 ) ) {
			return 0;
		}

		// Binary search.
		// Performance analysis: https://neil.fraser.name/news/2007/10/09/
		pointermin = 0;
		pointermax = Math.min( text1.length, text2.length );
		pointermid = pointermax;
		pointerend = 0;
		while ( pointermin < pointermid ) {
			if ( text1.substring( text1.length - pointermid, text1.length - pointerend ) ===
					text2.substring( text2.length - pointermid, text2.length - pointerend ) ) {
				pointermin = pointermid;
				pointerend = pointermin;
			} else {
				pointermax = pointermid;
			}
			pointermid = Math.floor( ( pointermax - pointermin ) / 2 + pointermin );
		}
		return pointermid;
	};

	/**
	 * Find the differences between two texts.  Assumes that the texts do not
	 * have any common prefix or suffix.
	 * @param {string} text1 Old string to be diffed.
	 * @param {string} text2 New string to be diffed.
	 * @param {boolean} checklines Speedup flag.  If false, then don't run a
	 *     line-level diff first to identify the changed areas.
	 *     If true, then run a faster, slightly less optimal diff.
	 * @param {number} deadline Time when the diff should be complete by.
	 * @return {!Array.<!DiffMatchPatch.Diff>} Array of diff tuples.
	 * @private
	 */
	DiffMatchPatch.prototype.diffCompute = function( text1, text2, checklines, deadline ) {
		var diffs, longtext, shorttext, i, hm,
			text1A, text2A, text1B, text2B,
			midCommon, diffsA, diffsB;

		if ( !text1 ) {

			// Just add some text (speedup).
			return [
				[ DIFF_INSERT, text2 ]
			];
		}

		if ( !text2 ) {

			// Just delete some text (speedup).
			return [
				[ DIFF_DELETE, text1 ]
			];
		}

		longtext = text1.length > text2.length ? text1 : text2;
		shorttext = text1.length > text2.length ? text2 : text1;
		i = longtext.indexOf( shorttext );
		if ( i !== -1 ) {

			// Shorter text is inside the longer text (speedup).
			diffs = [
				[ DIFF_INSERT, longtext.substring( 0, i ) ],
				[ DIFF_EQUAL, shorttext ],
				[ DIFF_INSERT, longtext.substring( i + shorttext.length ) ]
			];

			// Swap insertions for deletions if diff is reversed.
			if ( text1.length > text2.length ) {
				diffs[ 0 ][ 0 ] = diffs[ 2 ][ 0 ] = DIFF_DELETE;
			}
			return diffs;
		}

		if ( shorttext.length === 1 ) {

			// Single character string.
			// After the previous speedup, the character can't be an equality.
			return [
				[ DIFF_DELETE, text1 ],
				[ DIFF_INSERT, text2 ]
			];
		}

		// Check to see if the problem can be split in two.
		hm = this.diffHalfMatch( text1, text2 );
		if ( hm ) {

			// A half-match was found, sort out the return data.
			text1A = hm[ 0 ];
			text1B = hm[ 1 ];
			text2A = hm[ 2 ];
			text2B = hm[ 3 ];
			midCommon = hm[ 4 ];

			// Send both pairs off for separate processing.
			diffsA = this.DiffMain( text1A, text2A, checklines, deadline );
			diffsB = this.DiffMain( text1B, text2B, checklines, deadline );

			// Merge the results.
			return diffsA.concat( [
				[ DIFF_EQUAL, midCommon ]
			], diffsB );
		}

		if ( checklines && text1.length > 100 && text2.length > 100 ) {
			return this.diffLineMode( text1, text2, deadline );
		}

		return this.diffBisect( text1, text2, deadline );
	};

	/**
	 * Do the two texts share a substring which is at least half the length of the
	 * longer text?
	 * This speedup can produce non-minimal diffs.
	 * @param {string} text1 First string.
	 * @param {string} text2 Second string.
	 * @return {Array.<string>} Five element Array, containing the prefix of
	 *     text1, the suffix of text1, the prefix of text2, the suffix of
	 *     text2 and the common middle.  Or null if there was no match.
	 * @private
	 */
	DiffMatchPatch.prototype.diffHalfMatch = function( text1, text2 ) {
		var longtext, shorttext, dmp,
			text1A, text2B, text2A, text1B, midCommon,
			hm1, hm2, hm;

		longtext = text1.length > text2.length ? text1 : text2;
		shorttext = text1.length > text2.length ? text2 : text1;
		if ( longtext.length < 4 || shorttext.length * 2 < longtext.length ) {
			return null; // Pointless.
		}
		dmp = this; // 'this' becomes 'window' in a closure.

		/**
		 * Does a substring of shorttext exist within longtext such that the substring
		 * is at least half the length of longtext?
		 * Closure, but does not reference any external variables.
		 * @param {string} longtext Longer string.
		 * @param {string} shorttext Shorter string.
		 * @param {number} i Start index of quarter length substring within longtext.
		 * @return {Array.<string>} Five element Array, containing the prefix of
		 *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
		 *     of shorttext and the common middle.  Or null if there was no match.
		 * @private
		 */
		function diffHalfMatchI( longtext, shorttext, i ) {
			var seed, j, bestCommon, prefixLength, suffixLength,
				bestLongtextA, bestLongtextB, bestShorttextA, bestShorttextB;

			// Start with a 1/4 length substring at position i as a seed.
			seed = longtext.substring( i, i + Math.floor( longtext.length / 4 ) );
			j = -1;
			bestCommon = "";
			while ( ( j = shorttext.indexOf( seed, j + 1 ) ) !== -1 ) {
				prefixLength = dmp.diffCommonPrefix( longtext.substring( i ),
					shorttext.substring( j ) );
				suffixLength = dmp.diffCommonSuffix( longtext.substring( 0, i ),
					shorttext.substring( 0, j ) );
				if ( bestCommon.length < suffixLength + prefixLength ) {
					bestCommon = shorttext.substring( j - suffixLength, j ) +
						shorttext.substring( j, j + prefixLength );
					bestLongtextA = longtext.substring( 0, i - suffixLength );
					bestLongtextB = longtext.substring( i + prefixLength );
					bestShorttextA = shorttext.substring( 0, j - suffixLength );
					bestShorttextB = shorttext.substring( j + prefixLength );
				}
			}
			if ( bestCommon.length * 2 >= longtext.length ) {
				return [ bestLongtextA, bestLongtextB,
					bestShorttextA, bestShorttextB, bestCommon
				];
			} else {
				return null;
			}
		}

		// First check if the second quarter is the seed for a half-match.
		hm1 = diffHalfMatchI( longtext, shorttext,
			Math.ceil( longtext.length / 4 ) );

		// Check again based on the third quarter.
		hm2 = diffHalfMatchI( longtext, shorttext,
			Math.ceil( longtext.length / 2 ) );
		if ( !hm1 && !hm2 ) {
			return null;
		} else if ( !hm2 ) {
			hm = hm1;
		} else if ( !hm1 ) {
			hm = hm2;
		} else {

			// Both matched.  Select the longest.
			hm = hm1[ 4 ].length > hm2[ 4 ].length ? hm1 : hm2;
		}

		// A half-match was found, sort out the return data.
		text1A, text1B, text2A, text2B;
		if ( text1.length > text2.length ) {
			text1A = hm[ 0 ];
			text1B = hm[ 1 ];
			text2A = hm[ 2 ];
			text2B = hm[ 3 ];
		} else {
			text2A = hm[ 0 ];
			text2B = hm[ 1 ];
			text1A = hm[ 2 ];
			text1B = hm[ 3 ];
		}
		midCommon = hm[ 4 ];
		return [ text1A, text1B, text2A, text2B, midCommon ];
	};

	/**
	 * Do a quick line-level diff on both strings, then rediff the parts for
	 * greater accuracy.
	 * This speedup can produce non-minimal diffs.
	 * @param {string} text1 Old string to be diffed.
	 * @param {string} text2 New string to be diffed.
	 * @param {number} deadline Time when the diff should be complete by.
	 * @return {!Array.<!DiffMatchPatch.Diff>} Array of diff tuples.
	 * @private
	 */
	DiffMatchPatch.prototype.diffLineMode = function( text1, text2, deadline ) {
		var a, diffs, linearray, pointer, countInsert,
			countDelete, textInsert, textDelete, j;

		// Scan the text on a line-by-line basis first.
		a = this.diffLinesToChars( text1, text2 );
		text1 = a.chars1;
		text2 = a.chars2;
		linearray = a.lineArray;

		diffs = this.DiffMain( text1, text2, false, deadline );

		// Convert the diff back to original text.
		this.diffCharsToLines( diffs, linearray );

		// Eliminate freak matches (e.g. blank lines)
		this.diffCleanupSemantic( diffs );

		// Rediff any replacement blocks, this time character-by-character.
		// Add a dummy entry at the end.
		diffs.push( [ DIFF_EQUAL, "" ] );
		pointer = 0;
		countDelete = 0;
		countInsert = 0;
		textDelete = "";
		textInsert = "";
		while ( pointer < diffs.length ) {
			switch ( diffs[ pointer ][ 0 ] ) {
			case DIFF_INSERT:
				countInsert++;
				textInsert += diffs[ pointer ][ 1 ];
				break;
			case DIFF_DELETE:
				countDelete++;
				textDelete += diffs[ pointer ][ 1 ];
				break;
			case DIFF_EQUAL:

				// Upon reaching an equality, check for prior redundancies.
				if ( countDelete >= 1 && countInsert >= 1 ) {

					// Delete the offending records and add the merged ones.
					diffs.splice( pointer - countDelete - countInsert,
						countDelete + countInsert );
					pointer = pointer - countDelete - countInsert;
					a = this.DiffMain( textDelete, textInsert, false, deadline );
					for ( j = a.length - 1; j >= 0; j-- ) {
						diffs.splice( pointer, 0, a[ j ] );
					}
					pointer = pointer + a.length;
				}
				countInsert = 0;
				countDelete = 0;
				textDelete = "";
				textInsert = "";
				break;
			}
			pointer++;
		}
		diffs.pop(); // Remove the dummy entry at the end.

		return diffs;
	};

	/**
	 * Find the 'middle snake' of a diff, split the problem in two
	 * and return the recursively constructed diff.
	 * See Myers 1986 paper: An O(ND) Difference Algorithm and Its Variations.
	 * @param {string} text1 Old string to be diffed.
	 * @param {string} text2 New string to be diffed.
	 * @param {number} deadline Time at which to bail if not yet complete.
	 * @return {!Array.<!DiffMatchPatch.Diff>} Array of diff tuples.
	 * @private
	 */
	DiffMatchPatch.prototype.diffBisect = function( text1, text2, deadline ) {
		var text1Length, text2Length, maxD, vOffset, vLength,
			v1, v2, x, delta, front, k1start, k1end, k2start,
			k2end, k2Offset, k1Offset, x1, x2, y1, y2, d, k1, k2;

		// Cache the text lengths to prevent multiple calls.
		text1Length = text1.length;
		text2Length = text2.length;
		maxD = Math.ceil( ( text1Length + text2Length ) / 2 );
		vOffset = maxD;
		vLength = 2 * maxD;
		v1 = new Array( vLength );
		v2 = new Array( vLength );

		// Setting all elements to -1 is faster in Chrome & Firefox than mixing
		// integers and undefined.
		for ( x = 0; x < vLength; x++ ) {
			v1[ x ] = -1;
			v2[ x ] = -1;
		}
		v1[ vOffset + 1 ] = 0;
		v2[ vOffset + 1 ] = 0;
		delta = text1Length - text2Length;

		// If the total number of characters is odd, then the front path will collide
		// with the reverse path.
		front = ( delta % 2 !== 0 );

		// Offsets for start and end of k loop.
		// Prevents mapping of space beyond the grid.
		k1start = 0;
		k1end = 0;
		k2start = 0;
		k2end = 0;
		for ( d = 0; d < maxD; d++ ) {

			// Bail out if deadline is reached.
			if ( ( new Date() ).getTime() > deadline ) {
				break;
			}

			// Walk the front path one step.
			for ( k1 = -d + k1start; k1 <= d - k1end; k1 += 2 ) {
				k1Offset = vOffset + k1;
				if ( k1 === -d || ( k1 !== d && v1[ k1Offset - 1 ] < v1[ k1Offset + 1 ] ) ) {
					x1 = v1[ k1Offset + 1 ];
				} else {
					x1 = v1[ k1Offset - 1 ] + 1;
				}
				y1 = x1 - k1;
				while ( x1 < text1Length && y1 < text2Length &&
					text1.charAt( x1 ) === text2.charAt( y1 ) ) {
					x1++;
					y1++;
				}
				v1[ k1Offset ] = x1;
				if ( x1 > text1Length ) {

					// Ran off the right of the graph.
					k1end += 2;
				} else if ( y1 > text2Length ) {

					// Ran off the bottom of the graph.
					k1start += 2;
				} else if ( front ) {
					k2Offset = vOffset + delta - k1;
					if ( k2Offset >= 0 && k2Offset < vLength && v2[ k2Offset ] !== -1 ) {

						// Mirror x2 onto top-left coordinate system.
						x2 = text1Length - v2[ k2Offset ];
						if ( x1 >= x2 ) {

							// Overlap detected.
							return this.diffBisectSplit( text1, text2, x1, y1, deadline );
						}
					}
				}
			}

			// Walk the reverse path one step.
			for ( k2 = -d + k2start; k2 <= d - k2end; k2 += 2 ) {
				k2Offset = vOffset + k2;
				if ( k2 === -d || ( k2 !== d && v2[ k2Offset - 1 ] < v2[ k2Offset + 1 ] ) ) {
					x2 = v2[ k2Offset + 1 ];
				} else {
					x2 = v2[ k2Offset - 1 ] + 1;
				}
				y2 = x2 - k2;
				while ( x2 < text1Length && y2 < text2Length &&
					text1.charAt( text1Length - x2 - 1 ) ===
					text2.charAt( text2Length - y2 - 1 ) ) {
					x2++;
					y2++;
				}
				v2[ k2Offset ] = x2;
				if ( x2 > text1Length ) {

					// Ran off the left of the graph.
					k2end += 2;
				} else if ( y2 > text2Length ) {

					// Ran off the top of the graph.
					k2start += 2;
				} else if ( !front ) {
					k1Offset = vOffset + delta - k2;
					if ( k1Offset >= 0 && k1Offset < vLength && v1[ k1Offset ] !== -1 ) {
						x1 = v1[ k1Offset ];
						y1 = vOffset + x1 - k1Offset;

						// Mirror x2 onto top-left coordinate system.
						x2 = text1Length - x2;
						if ( x1 >= x2 ) {

							// Overlap detected.
							return this.diffBisectSplit( text1, text2, x1, y1, deadline );
						}
					}
				}
			}
		}

		// Diff took too long and hit the deadline or
		// number of diffs equals number of characters, no commonality at all.
		return [
			[ DIFF_DELETE, text1 ],
			[ DIFF_INSERT, text2 ]
		];
	};

	/**
	 * Given the location of the 'middle snake', split the diff in two parts
	 * and recurse.
	 * @param {string} text1 Old string to be diffed.
	 * @param {string} text2 New string to be diffed.
	 * @param {number} x Index of split point in text1.
	 * @param {number} y Index of split point in text2.
	 * @param {number} deadline Time at which to bail if not yet complete.
	 * @return {!Array.<!DiffMatchPatch.Diff>} Array of diff tuples.
	 * @private
	 */
	DiffMatchPatch.prototype.diffBisectSplit = function( text1, text2, x, y, deadline ) {
		var text1a, text1b, text2a, text2b, diffs, diffsb;
		text1a = text1.substring( 0, x );
		text2a = text2.substring( 0, y );
		text1b = text1.substring( x );
		text2b = text2.substring( y );

		// Compute both diffs serially.
		diffs = this.DiffMain( text1a, text2a, false, deadline );
		diffsb = this.DiffMain( text1b, text2b, false, deadline );

		return diffs.concat( diffsb );
	};

	/**
	 * Reduce the number of edits by eliminating semantically trivial equalities.
	 * @param {!Array.<!DiffMatchPatch.Diff>} diffs Array of diff tuples.
	 */
	DiffMatchPatch.prototype.diffCleanupSemantic = function( diffs ) {
		var changes, equalities, equalitiesLength, lastequality,
			pointer, lengthInsertions2, lengthDeletions2, lengthInsertions1,
			lengthDeletions1, deletion, insertion, overlapLength1, overlapLength2;
		changes = false;
		equalities = []; // Stack of indices where equalities are found.
		equalitiesLength = 0; // Keeping our own length var is faster in JS.
		/** @type {?string} */
		lastequality = null;

		// Always equal to diffs[equalities[equalitiesLength - 1]][1]
		pointer = 0; // Index of current position.

		// Number of characters that changed prior to the equality.
		lengthInsertions1 = 0;
		lengthDeletions1 = 0;

		// Number of characters that changed after the equality.
		lengthInsertions2 = 0;
		lengthDeletions2 = 0;
		while ( pointer < diffs.length ) {
			if ( diffs[ pointer ][ 0 ] === DIFF_EQUAL ) { // Equality found.
				equalities[ equalitiesLength++ ] = pointer;
				lengthInsertions1 = lengthInsertions2;
				lengthDeletions1 = lengthDeletions2;
				lengthInsertions2 = 0;
				lengthDeletions2 = 0;
				lastequality = diffs[ pointer ][ 1 ];
			} else { // An insertion or deletion.
				if ( diffs[ pointer ][ 0 ] === DIFF_INSERT ) {
					lengthInsertions2 += diffs[ pointer ][ 1 ].length;
				} else {
					lengthDeletions2 += diffs[ pointer ][ 1 ].length;
				}

				// Eliminate an equality that is smaller or equal to the edits on both
				// sides of it.
				if ( lastequality && ( lastequality.length <=
						Math.max( lengthInsertions1, lengthDeletions1 ) ) &&
						( lastequality.length <= Math.max( lengthInsertions2,
							lengthDeletions2 ) ) ) {

					// Duplicate record.
					diffs.splice(
						equalities[ equalitiesLength - 1 ],
						0,
						[ DIFF_DELETE, lastequality ]
					);

					// Change second copy to insert.
					diffs[ equalities[ equalitiesLength - 1 ] + 1 ][ 0 ] = DIFF_INSERT;

					// Throw away the equality we just deleted.
					equalitiesLength--;

					// Throw away the previous equality (it needs to be reevaluated).
					equalitiesLength--;
					pointer = equalitiesLength > 0 ? equalities[ equalitiesLength - 1 ] : -1;

					// Reset the counters.
					lengthInsertions1 = 0;
					lengthDeletions1 = 0;
					lengthInsertions2 = 0;
					lengthDeletions2 = 0;
					lastequality = null;
					changes = true;
				}
			}
			pointer++;
		}

		// Normalize the diff.
		if ( changes ) {
			this.diffCleanupMerge( diffs );
		}

		// Find any overlaps between deletions and insertions.
		// e.g: <del>abcxxx</del><ins>xxxdef</ins>
		//   -> <del>abc</del>xxx<ins>def</ins>
		// e.g: <del>xxxabc</del><ins>defxxx</ins>
		//   -> <ins>def</ins>xxx<del>abc</del>
		// Only extract an overlap if it is as big as the edit ahead or behind it.
		pointer = 1;
		while ( pointer < diffs.length ) {
			if ( diffs[ pointer - 1 ][ 0 ] === DIFF_DELETE &&
					diffs[ pointer ][ 0 ] === DIFF_INSERT ) {
				deletion = diffs[ pointer - 1 ][ 1 ];
				insertion = diffs[ pointer ][ 1 ];
				overlapLength1 = this.diffCommonOverlap( deletion, insertion );
				overlapLength2 = this.diffCommonOverlap( insertion, deletion );
				if ( overlapLength1 >= overlapLength2 ) {
					if ( overlapLength1 >= deletion.length / 2 ||
							overlapLength1 >= insertion.length / 2 ) {

						// Overlap found.  Insert an equality and trim the surrounding edits.
						diffs.splice(
							pointer,
							0,
							[ DIFF_EQUAL, insertion.substring( 0, overlapLength1 ) ]
						);
						diffs[ pointer - 1 ][ 1 ] =
							deletion.substring( 0, deletion.length - overlapLength1 );
						diffs[ pointer + 1 ][ 1 ] = insertion.substring( overlapLength1 );
						pointer++;
					}
				} else {
					if ( overlapLength2 >= deletion.length / 2 ||
							overlapLength2 >= insertion.length / 2 ) {

						// Reverse overlap found.
						// Insert an equality and swap and trim the surrounding edits.
						diffs.splice(
							pointer,
							0,
							[ DIFF_EQUAL, deletion.substring( 0, overlapLength2 ) ]
						);

						diffs[ pointer - 1 ][ 0 ] = DIFF_INSERT;
						diffs[ pointer - 1 ][ 1 ] =
							insertion.substring( 0, insertion.length - overlapLength2 );
						diffs[ pointer + 1 ][ 0 ] = DIFF_DELETE;
						diffs[ pointer + 1 ][ 1 ] =
							deletion.substring( overlapLength2 );
						pointer++;
					}
				}
				pointer++;
			}
			pointer++;
		}
	};

	/**
	 * Determine if the suffix of one string is the prefix of another.
	 * @param {string} text1 First string.
	 * @param {string} text2 Second string.
	 * @return {number} The number of characters common to the end of the first
	 *     string and the start of the second string.
	 * @private
	 */
	DiffMatchPatch.prototype.diffCommonOverlap = function( text1, text2 ) {
		var text1Length, text2Length, textLength,
			best, length, pattern, found;

		// Cache the text lengths to prevent multiple calls.
		text1Length = text1.length;
		text2Length = text2.length;

		// Eliminate the null case.
		if ( text1Length === 0 || text2Length === 0 ) {
			return 0;
		}

		// Truncate the longer string.
		if ( text1Length > text2Length ) {
			text1 = text1.substring( text1Length - text2Length );
		} else if ( text1Length < text2Length ) {
			text2 = text2.substring( 0, text1Length );
		}
		textLength = Math.min( text1Length, text2Length );

		// Quick check for the worst case.
		if ( text1 === text2 ) {
			return textLength;
		}

		// Start by looking for a single character match
		// and increase length until no match is found.
		// Performance analysis: https://neil.fraser.name/news/2010/11/04/
		best = 0;
		length = 1;
		while ( true ) {
			pattern = text1.substring( textLength - length );
			found = text2.indexOf( pattern );
			if ( found === -1 ) {
				return best;
			}
			length += found;
			if ( found === 0 || text1.substring( textLength - length ) ===
					text2.substring( 0, length ) ) {
				best = length;
				length++;
			}
		}
	};

	/**
	 * Split two texts into an array of strings.  Reduce the texts to a string of
	 * hashes where each Unicode character represents one line.
	 * @param {string} text1 First string.
	 * @param {string} text2 Second string.
	 * @return {{chars1: string, chars2: string, lineArray: !Array.<string>}}
	 *     An object containing the encoded text1, the encoded text2 and
	 *     the array of unique strings.
	 *     The zeroth element of the array of unique strings is intentionally blank.
	 * @private
	 */
	DiffMatchPatch.prototype.diffLinesToChars = function( text1, text2 ) {
		var lineArray, lineHash, chars1, chars2;
		lineArray = []; // E.g. lineArray[4] === 'Hello\n'
		lineHash = {};  // E.g. lineHash['Hello\n'] === 4

		// '\x00' is a valid character, but various debuggers don't like it.
		// So we'll insert a junk entry to avoid generating a null character.
		lineArray[ 0 ] = "";

		/**
		 * Split a text into an array of strings.  Reduce the texts to a string of
		 * hashes where each Unicode character represents one line.
		 * Modifies linearray and linehash through being a closure.
		 * @param {string} text String to encode.
		 * @return {string} Encoded string.
		 * @private
		 */
		function diffLinesToCharsMunge( text ) {
			var chars, lineStart, lineEnd, lineArrayLength, line;
			chars = "";

			// Walk the text, pulling out a substring for each line.
			// text.split('\n') would would temporarily double our memory footprint.
			// Modifying text would create many large strings to garbage collect.
			lineStart = 0;
			lineEnd = -1;

			// Keeping our own length variable is faster than looking it up.
			lineArrayLength = lineArray.length;
			while ( lineEnd < text.length - 1 ) {
				lineEnd = text.indexOf( "\n", lineStart );
				if ( lineEnd === -1 ) {
					lineEnd = text.length - 1;
				}
				line = text.substring( lineStart, lineEnd + 1 );
				lineStart = lineEnd + 1;

				if ( lineHash.hasOwnProperty ? lineHash.hasOwnProperty( line ) :
							( lineHash[ line ] !== undefined ) ) {
					chars += String.fromCharCode( lineHash[ line ] );
				} else {
					chars += String.fromCharCode( lineArrayLength );
					lineHash[ line ] = lineArrayLength;
					lineArray[ lineArrayLength++ ] = line;
				}
			}
			return chars;
		}

		chars1 = diffLinesToCharsMunge( text1 );
		chars2 = diffLinesToCharsMunge( text2 );
		return {
			chars1: chars1,
			chars2: chars2,
			lineArray: lineArray
		};
	};

	/**
	 * Rehydrate the text in a diff from a string of line hashes to real lines of
	 * text.
	 * @param {!Array.<!DiffMatchPatch.Diff>} diffs Array of diff tuples.
	 * @param {!Array.<string>} lineArray Array of unique strings.
	 * @private
	 */
	DiffMatchPatch.prototype.diffCharsToLines = function( diffs, lineArray ) {
		var x, chars, text, y;
		for ( x = 0; x < diffs.length; x++ ) {
			chars = diffs[ x ][ 1 ];
			text = [];
			for ( y = 0; y < chars.length; y++ ) {
				text[ y ] = lineArray[ chars.charCodeAt( y ) ];
			}
			diffs[ x ][ 1 ] = text.join( "" );
		}
	};

	/**
	 * Reorder and merge like edit sections.  Merge equalities.
	 * Any edit section can move as long as it doesn't cross an equality.
	 * @param {!Array.<!DiffMatchPatch.Diff>} diffs Array of diff tuples.
	 */
	DiffMatchPatch.prototype.diffCleanupMerge = function( diffs ) {
		var pointer, countDelete, countInsert, textInsert, textDelete,
			commonlength, changes, diffPointer, position;
		diffs.push( [ DIFF_EQUAL, "" ] ); // Add a dummy entry at the end.
		pointer = 0;
		countDelete = 0;
		countInsert = 0;
		textDelete = "";
		textInsert = "";
		commonlength;
		while ( pointer < diffs.length ) {
			switch ( diffs[ pointer ][ 0 ] ) {
			case DIFF_INSERT:
				countInsert++;
				textInsert += diffs[ pointer ][ 1 ];
				pointer++;
				break;
			case DIFF_DELETE:
				countDelete++;
				textDelete += diffs[ pointer ][ 1 ];
				pointer++;
				break;
			case DIFF_EQUAL:

				// Upon reaching an equality, check for prior redundancies.
				if ( countDelete + countInsert > 1 ) {
					if ( countDelete !== 0 && countInsert !== 0 ) {

						// Factor out any common prefixes.
						commonlength = this.diffCommonPrefix( textInsert, textDelete );
						if ( commonlength !== 0 ) {
							if ( ( pointer - countDelete - countInsert ) > 0 &&
									diffs[ pointer - countDelete - countInsert - 1 ][ 0 ] ===
									DIFF_EQUAL ) {
								diffs[ pointer - countDelete - countInsert - 1 ][ 1 ] +=
									textInsert.substring( 0, commonlength );
							} else {
								diffs.splice( 0, 0, [ DIFF_EQUAL,
									textInsert.substring( 0, commonlength )
								] );
								pointer++;
							}
							textInsert = textInsert.substring( commonlength );
							textDelete = textDelete.substring( commonlength );
						}

						// Factor out any common suffixies.
						commonlength = this.diffCommonSuffix( textInsert, textDelete );
						if ( commonlength !== 0 ) {
							diffs[ pointer ][ 1 ] = textInsert.substring( textInsert.length -
									commonlength ) + diffs[ pointer ][ 1 ];
							textInsert = textInsert.substring( 0, textInsert.length -
								commonlength );
							textDelete = textDelete.substring( 0, textDelete.length -
								commonlength );
						}
					}

					// Delete the offending records and add the merged ones.
					if ( countDelete === 0 ) {
						diffs.splice( pointer - countInsert,
							countDelete + countInsert, [ DIFF_INSERT, textInsert ] );
					} else if ( countInsert === 0 ) {
						diffs.splice( pointer - countDelete,
							countDelete + countInsert, [ DIFF_DELETE, textDelete ] );
					} else {
						diffs.splice(
							pointer - countDelete - countInsert,
							countDelete + countInsert,
							[ DIFF_DELETE, textDelete ], [ DIFF_INSERT, textInsert ]
						);
					}
					pointer = pointer - countDelete - countInsert +
						( countDelete ? 1 : 0 ) + ( countInsert ? 1 : 0 ) + 1;
				} else if ( pointer !== 0 && diffs[ pointer - 1 ][ 0 ] === DIFF_EQUAL ) {

					// Merge this equality with the previous one.
					diffs[ pointer - 1 ][ 1 ] += diffs[ pointer ][ 1 ];
					diffs.splice( pointer, 1 );
				} else {
					pointer++;
				}
				countInsert = 0;
				countDelete = 0;
				textDelete = "";
				textInsert = "";
				break;
			}
		}
		if ( diffs[ diffs.length - 1 ][ 1 ] === "" ) {
			diffs.pop(); // Remove the dummy entry at the end.
		}

		// Second pass: look for single edits surrounded on both sides by equalities
		// which can be shifted sideways to eliminate an equality.
		// e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
		changes = false;
		pointer = 1;

		// Intentionally ignore the first and last element (don't need checking).
		while ( pointer < diffs.length - 1 ) {
			if ( diffs[ pointer - 1 ][ 0 ] === DIFF_EQUAL &&
					diffs[ pointer + 1 ][ 0 ] === DIFF_EQUAL ) {

				diffPointer = diffs[ pointer ][ 1 ];
				position = diffPointer.substring(
					diffPointer.length - diffs[ pointer - 1 ][ 1 ].length
				);

				// This is a single edit surrounded by equalities.
				if ( position === diffs[ pointer - 1 ][ 1 ] ) {

					// Shift the edit over the previous equality.
					diffs[ pointer ][ 1 ] = diffs[ pointer - 1 ][ 1 ] +
						diffs[ pointer ][ 1 ].substring( 0, diffs[ pointer ][ 1 ].length -
							diffs[ pointer - 1 ][ 1 ].length );
					diffs[ pointer + 1 ][ 1 ] =
						diffs[ pointer - 1 ][ 1 ] + diffs[ pointer + 1 ][ 1 ];
					diffs.splice( pointer - 1, 1 );
					changes = true;
				} else if ( diffPointer.substring( 0, diffs[ pointer + 1 ][ 1 ].length ) ===
						diffs[ pointer + 1 ][ 1 ] ) {

					// Shift the edit over the next equality.
					diffs[ pointer - 1 ][ 1 ] += diffs[ pointer + 1 ][ 1 ];
					diffs[ pointer ][ 1 ] =
						diffs[ pointer ][ 1 ].substring( diffs[ pointer + 1 ][ 1 ].length ) +
						diffs[ pointer + 1 ][ 1 ];
					diffs.splice( pointer + 1, 1 );
					changes = true;
				}
			}
			pointer++;
		}

		// If shifts were made, the diff needs reordering and another shift sweep.
		if ( changes ) {
			this.diffCleanupMerge( diffs );
		}
	};

	return function( o, n ) {
		var diff, output, text;
		diff = new DiffMatchPatch();
		output = diff.DiffMain( o, n );
		diff.diffCleanupEfficiency( output );
		text = diff.diffPrettyHtml( output );

		return text;
	};
}() );

}() );

},{}],43:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var punycode = require('punycode');

exports.parse = urlParse;
exports.resolve = urlResolve;
exports.resolveObject = urlResolveObject;
exports.format = urlFormat;

exports.Url = Url;

function Url() {
  this.protocol = null;
  this.slashes = null;
  this.auth = null;
  this.host = null;
  this.port = null;
  this.hostname = null;
  this.hash = null;
  this.search = null;
  this.query = null;
  this.pathname = null;
  this.path = null;
  this.href = null;
}

// Reference: RFC 3986, RFC 1808, RFC 2396

// define these here so at least they only have to be
// compiled once on the first module load.
var protocolPattern = /^([a-z0-9.+-]+:)/i,
    portPattern = /:[0-9]*$/,

    // RFC 2396: characters reserved for delimiting URLs.
    // We actually just auto-escape these.
    delims = ['<', '>', '"', '`', ' ', '\r', '\n', '\t'],

    // RFC 2396: characters not allowed for various reasons.
    unwise = ['{', '}', '|', '\\', '^', '`'].concat(delims),

    // Allowed by RFCs, but cause of XSS attacks.  Always escape these.
    autoEscape = ['\''].concat(unwise),
    // Characters that are never ever allowed in a hostname.
    // Note that any invalid chars are also handled, but these
    // are the ones that are *expected* to be seen, so we fast-path
    // them.
    nonHostChars = ['%', '/', '?', ';', '#'].concat(autoEscape),
    hostEndingChars = ['/', '?', '#'],
    hostnameMaxLen = 255,
    hostnamePartPattern = /^[a-z0-9A-Z_-]{0,63}$/,
    hostnamePartStart = /^([a-z0-9A-Z_-]{0,63})(.*)$/,
    // protocols that can allow "unsafe" and "unwise" chars.
    unsafeProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that never have a hostname.
    hostlessProtocol = {
      'javascript': true,
      'javascript:': true
    },
    // protocols that always contain a // bit.
    slashedProtocol = {
      'http': true,
      'https': true,
      'ftp': true,
      'gopher': true,
      'file': true,
      'http:': true,
      'https:': true,
      'ftp:': true,
      'gopher:': true,
      'file:': true
    },
    querystring = require('querystring');

function urlParse(url, parseQueryString, slashesDenoteHost) {
  if (url && isObject(url) && url instanceof Url) return url;

  var u = new Url;
  u.parse(url, parseQueryString, slashesDenoteHost);
  return u;
}

Url.prototype.parse = function(url, parseQueryString, slashesDenoteHost) {
  if (!isString(url)) {
    throw new TypeError("Parameter 'url' must be a string, not " + typeof url);
  }

  var rest = url;

  // trim before proceeding.
  // This is to support parse stuff like "  http://foo.com  \n"
  rest = rest.trim();

  var proto = protocolPattern.exec(rest);
  if (proto) {
    proto = proto[0];
    var lowerProto = proto.toLowerCase();
    this.protocol = lowerProto;
    rest = rest.substr(proto.length);
  }

  // figure out if it's got a host
  // user@server is *always* interpreted as a hostname, and url
  // resolution will treat //foo/bar as host=foo,path=bar because that's
  // how the browser resolves relative URLs.
  if (slashesDenoteHost || proto || rest.match(/^\/\/[^@\/]+@[^@\/]+/)) {
    var slashes = rest.substr(0, 2) === '//';
    if (slashes && !(proto && hostlessProtocol[proto])) {
      rest = rest.substr(2);
      this.slashes = true;
    }
  }

  if (!hostlessProtocol[proto] &&
      (slashes || (proto && !slashedProtocol[proto]))) {

    // there's a hostname.
    // the first instance of /, ?, ;, or # ends the host.
    //
    // If there is an @ in the hostname, then non-host chars *are* allowed
    // to the left of the last @ sign, unless some host-ending character
    // comes *before* the @-sign.
    // URLs are obnoxious.
    //
    // ex:
    // http://a@b@c/ => user:a@b host:c
    // http://a@b?@c => user:a host:c path:/?@c

    // v0.12 TODO(isaacs): This is not quite how Chrome does things.
    // Review our test case against browsers more comprehensively.

    // find the first instance of any hostEndingChars
    var hostEnd = -1;
    for (var i = 0; i < hostEndingChars.length; i++) {
      var hec = rest.indexOf(hostEndingChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }

    // at this point, either we have an explicit point where the
    // auth portion cannot go past, or the last @ char is the decider.
    var auth, atSign;
    if (hostEnd === -1) {
      // atSign can be anywhere.
      atSign = rest.lastIndexOf('@');
    } else {
      // atSign must be in auth portion.
      // http://a@b/c@d => host:b auth:a path:/c@d
      atSign = rest.lastIndexOf('@', hostEnd);
    }

    // Now we have a portion which is definitely the auth.
    // Pull that off.
    if (atSign !== -1) {
      auth = rest.slice(0, atSign);
      rest = rest.slice(atSign + 1);
      this.auth = decodeURIComponent(auth);
    }

    // the host is the remaining to the left of the first non-host char
    hostEnd = -1;
    for (var i = 0; i < nonHostChars.length; i++) {
      var hec = rest.indexOf(nonHostChars[i]);
      if (hec !== -1 && (hostEnd === -1 || hec < hostEnd))
        hostEnd = hec;
    }
    // if we still have not hit it, then the entire thing is a host.
    if (hostEnd === -1)
      hostEnd = rest.length;

    this.host = rest.slice(0, hostEnd);
    rest = rest.slice(hostEnd);

    // pull out port.
    this.parseHost();

    // we've indicated that there is a hostname,
    // so even if it's empty, it has to be present.
    this.hostname = this.hostname || '';

    // if hostname begins with [ and ends with ]
    // assume that it's an IPv6 address.
    var ipv6Hostname = this.hostname[0] === '[' &&
        this.hostname[this.hostname.length - 1] === ']';

    // validate a little.
    if (!ipv6Hostname) {
      var hostparts = this.hostname.split(/\./);
      for (var i = 0, l = hostparts.length; i < l; i++) {
        var part = hostparts[i];
        if (!part) continue;
        if (!part.match(hostnamePartPattern)) {
          var newpart = '';
          for (var j = 0, k = part.length; j < k; j++) {
            if (part.charCodeAt(j) > 127) {
              // we replace non-ASCII char with a temporary placeholder
              // we need this to make sure size of hostname is not
              // broken by replacing non-ASCII by nothing
              newpart += 'x';
            } else {
              newpart += part[j];
            }
          }
          // we test again with ASCII char only
          if (!newpart.match(hostnamePartPattern)) {
            var validParts = hostparts.slice(0, i);
            var notHost = hostparts.slice(i + 1);
            var bit = part.match(hostnamePartStart);
            if (bit) {
              validParts.push(bit[1]);
              notHost.unshift(bit[2]);
            }
            if (notHost.length) {
              rest = '/' + notHost.join('.') + rest;
            }
            this.hostname = validParts.join('.');
            break;
          }
        }
      }
    }

    if (this.hostname.length > hostnameMaxLen) {
      this.hostname = '';
    } else {
      // hostnames are always lower case.
      this.hostname = this.hostname.toLowerCase();
    }

    if (!ipv6Hostname) {
      // IDNA Support: Returns a puny coded representation of "domain".
      // It only converts the part of the domain name that
      // has non ASCII characters. I.e. it dosent matter if
      // you call it with a domain that already is in ASCII.
      var domainArray = this.hostname.split('.');
      var newOut = [];
      for (var i = 0; i < domainArray.length; ++i) {
        var s = domainArray[i];
        newOut.push(s.match(/[^A-Za-z0-9_-]/) ?
            'xn--' + punycode.encode(s) : s);
      }
      this.hostname = newOut.join('.');
    }

    var p = this.port ? ':' + this.port : '';
    var h = this.hostname || '';
    this.host = h + p;
    this.href += this.host;

    // strip [ and ] from the hostname
    // the host field still retains them, though
    if (ipv6Hostname) {
      this.hostname = this.hostname.substr(1, this.hostname.length - 2);
      if (rest[0] !== '/') {
        rest = '/' + rest;
      }
    }
  }

  // now rest is set to the post-host stuff.
  // chop off any delim chars.
  if (!unsafeProtocol[lowerProto]) {

    // First, make 100% sure that any "autoEscape" chars get
    // escaped, even if encodeURIComponent doesn't think they
    // need to be.
    for (var i = 0, l = autoEscape.length; i < l; i++) {
      var ae = autoEscape[i];
      var esc = encodeURIComponent(ae);
      if (esc === ae) {
        esc = escape(ae);
      }
      rest = rest.split(ae).join(esc);
    }
  }


  // chop off from the tail first.
  var hash = rest.indexOf('#');
  if (hash !== -1) {
    // got a fragment string.
    this.hash = rest.substr(hash);
    rest = rest.slice(0, hash);
  }
  var qm = rest.indexOf('?');
  if (qm !== -1) {
    this.search = rest.substr(qm);
    this.query = rest.substr(qm + 1);
    if (parseQueryString) {
      this.query = querystring.parse(this.query);
    }
    rest = rest.slice(0, qm);
  } else if (parseQueryString) {
    // no query string, but parseQueryString still requested
    this.search = '';
    this.query = {};
  }
  if (rest) this.pathname = rest;
  if (slashedProtocol[lowerProto] &&
      this.hostname && !this.pathname) {
    this.pathname = '/';
  }

  //to support http.request
  if (this.pathname || this.search) {
    var p = this.pathname || '';
    var s = this.search || '';
    this.path = p + s;
  }

  // finally, reconstruct the href based on what has been validated.
  this.href = this.format();
  return this;
};

// format a parsed object into a url string
function urlFormat(obj) {
  // ensure it's an object, and not a string url.
  // If it's an obj, this is a no-op.
  // this way, you can call url_format() on strings
  // to clean up potentially wonky urls.
  if (isString(obj)) obj = urlParse(obj);
  if (!(obj instanceof Url)) return Url.prototype.format.call(obj);
  return obj.format();
}

Url.prototype.format = function() {
  var auth = this.auth || '';
  if (auth) {
    auth = encodeURIComponent(auth);
    auth = auth.replace(/%3A/i, ':');
    auth += '@';
  }

  var protocol = this.protocol || '',
      pathname = this.pathname || '',
      hash = this.hash || '',
      host = false,
      query = '';

  if (this.host) {
    host = auth + this.host;
  } else if (this.hostname) {
    host = auth + (this.hostname.indexOf(':') === -1 ?
        this.hostname :
        '[' + this.hostname + ']');
    if (this.port) {
      host += ':' + this.port;
    }
  }

  if (this.query &&
      isObject(this.query) &&
      Object.keys(this.query).length) {
    query = querystring.stringify(this.query);
  }

  var search = this.search || (query && ('?' + query)) || '';

  if (protocol && protocol.substr(-1) !== ':') protocol += ':';

  // only the slashedProtocols get the //.  Not mailto:, xmpp:, etc.
  // unless they had them to begin with.
  if (this.slashes ||
      (!protocol || slashedProtocol[protocol]) && host !== false) {
    host = '//' + (host || '');
    if (pathname && pathname.charAt(0) !== '/') pathname = '/' + pathname;
  } else if (!host) {
    host = '';
  }

  if (hash && hash.charAt(0) !== '#') hash = '#' + hash;
  if (search && search.charAt(0) !== '?') search = '?' + search;

  pathname = pathname.replace(/[?#]/g, function(match) {
    return encodeURIComponent(match);
  });
  search = search.replace('#', '%23');

  return protocol + host + pathname + search + hash;
};

function urlResolve(source, relative) {
  return urlParse(source, false, true).resolve(relative);
}

Url.prototype.resolve = function(relative) {
  return this.resolveObject(urlParse(relative, false, true)).format();
};

function urlResolveObject(source, relative) {
  if (!source) return relative;
  return urlParse(source, false, true).resolveObject(relative);
}

Url.prototype.resolveObject = function(relative) {
  if (isString(relative)) {
    var rel = new Url();
    rel.parse(relative, false, true);
    relative = rel;
  }

  var result = new Url();
  Object.keys(this).forEach(function(k) {
    result[k] = this[k];
  }, this);

  // hash is always overridden, no matter what.
  // even href="" will remove it.
  result.hash = relative.hash;

  // if the relative url is empty, then there's nothing left to do here.
  if (relative.href === '') {
    result.href = result.format();
    return result;
  }

  // hrefs like //foo/bar always cut to the protocol.
  if (relative.slashes && !relative.protocol) {
    // take everything except the protocol from relative
    Object.keys(relative).forEach(function(k) {
      if (k !== 'protocol')
        result[k] = relative[k];
    });

    //urlParse appends trailing / to urls like http://www.example.com
    if (slashedProtocol[result.protocol] &&
        result.hostname && !result.pathname) {
      result.path = result.pathname = '/';
    }

    result.href = result.format();
    return result;
  }

  if (relative.protocol && relative.protocol !== result.protocol) {
    // if it's a known url protocol, then changing
    // the protocol does weird things
    // first, if it's not file:, then we MUST have a host,
    // and if there was a path
    // to begin with, then we MUST have a path.
    // if it is file:, then the host is dropped,
    // because that's known to be hostless.
    // anything else is assumed to be absolute.
    if (!slashedProtocol[relative.protocol]) {
      Object.keys(relative).forEach(function(k) {
        result[k] = relative[k];
      });
      result.href = result.format();
      return result;
    }

    result.protocol = relative.protocol;
    if (!relative.host && !hostlessProtocol[relative.protocol]) {
      var relPath = (relative.pathname || '').split('/');
      while (relPath.length && !(relative.host = relPath.shift()));
      if (!relative.host) relative.host = '';
      if (!relative.hostname) relative.hostname = '';
      if (relPath[0] !== '') relPath.unshift('');
      if (relPath.length < 2) relPath.unshift('');
      result.pathname = relPath.join('/');
    } else {
      result.pathname = relative.pathname;
    }
    result.search = relative.search;
    result.query = relative.query;
    result.host = relative.host || '';
    result.auth = relative.auth;
    result.hostname = relative.hostname || relative.host;
    result.port = relative.port;
    // to support http.request
    if (result.pathname || result.search) {
      var p = result.pathname || '';
      var s = result.search || '';
      result.path = p + s;
    }
    result.slashes = result.slashes || relative.slashes;
    result.href = result.format();
    return result;
  }

  var isSourceAbs = (result.pathname && result.pathname.charAt(0) === '/'),
      isRelAbs = (
          relative.host ||
          relative.pathname && relative.pathname.charAt(0) === '/'
      ),
      mustEndAbs = (isRelAbs || isSourceAbs ||
                    (result.host && relative.pathname)),
      removeAllDots = mustEndAbs,
      srcPath = result.pathname && result.pathname.split('/') || [],
      relPath = relative.pathname && relative.pathname.split('/') || [],
      psychotic = result.protocol && !slashedProtocol[result.protocol];

  // if the url is a non-slashed url, then relative
  // links like ../.. should be able
  // to crawl up to the hostname, as well.  This is strange.
  // result.protocol has already been set by now.
  // Later on, put the first path part into the host field.
  if (psychotic) {
    result.hostname = '';
    result.port = null;
    if (result.host) {
      if (srcPath[0] === '') srcPath[0] = result.host;
      else srcPath.unshift(result.host);
    }
    result.host = '';
    if (relative.protocol) {
      relative.hostname = null;
      relative.port = null;
      if (relative.host) {
        if (relPath[0] === '') relPath[0] = relative.host;
        else relPath.unshift(relative.host);
      }
      relative.host = null;
    }
    mustEndAbs = mustEndAbs && (relPath[0] === '' || srcPath[0] === '');
  }

  if (isRelAbs) {
    // it's absolute.
    result.host = (relative.host || relative.host === '') ?
                  relative.host : result.host;
    result.hostname = (relative.hostname || relative.hostname === '') ?
                      relative.hostname : result.hostname;
    result.search = relative.search;
    result.query = relative.query;
    srcPath = relPath;
    // fall through to the dot-handling below.
  } else if (relPath.length) {
    // it's relative
    // throw away the existing file, and take the new path instead.
    if (!srcPath) srcPath = [];
    srcPath.pop();
    srcPath = srcPath.concat(relPath);
    result.search = relative.search;
    result.query = relative.query;
  } else if (!isNullOrUndefined(relative.search)) {
    // just pull out the search.
    // like href='?foo'.
    // Put this after the other two cases because it simplifies the booleans
    if (psychotic) {
      result.hostname = result.host = srcPath.shift();
      //occationaly the auth can get stuck only in host
      //this especialy happens in cases like
      //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
      var authInHost = result.host && result.host.indexOf('@') > 0 ?
                       result.host.split('@') : false;
      if (authInHost) {
        result.auth = authInHost.shift();
        result.host = result.hostname = authInHost.shift();
      }
    }
    result.search = relative.search;
    result.query = relative.query;
    //to support http.request
    if (!isNull(result.pathname) || !isNull(result.search)) {
      result.path = (result.pathname ? result.pathname : '') +
                    (result.search ? result.search : '');
    }
    result.href = result.format();
    return result;
  }

  if (!srcPath.length) {
    // no path at all.  easy.
    // we've already handled the other stuff above.
    result.pathname = null;
    //to support http.request
    if (result.search) {
      result.path = '/' + result.search;
    } else {
      result.path = null;
    }
    result.href = result.format();
    return result;
  }

  // if a url ENDs in . or .., then it must get a trailing slash.
  // however, if it ends in anything else non-slashy,
  // then it must NOT get a trailing slash.
  var last = srcPath.slice(-1)[0];
  var hasTrailingSlash = (
      (result.host || relative.host) && (last === '.' || last === '..') ||
      last === '');

  // strip single dots, resolve double dots to parent dir
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = srcPath.length; i >= 0; i--) {
    last = srcPath[i];
    if (last == '.') {
      srcPath.splice(i, 1);
    } else if (last === '..') {
      srcPath.splice(i, 1);
      up++;
    } else if (up) {
      srcPath.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (!mustEndAbs && !removeAllDots) {
    for (; up--; up) {
      srcPath.unshift('..');
    }
  }

  if (mustEndAbs && srcPath[0] !== '' &&
      (!srcPath[0] || srcPath[0].charAt(0) !== '/')) {
    srcPath.unshift('');
  }

  if (hasTrailingSlash && (srcPath.join('/').substr(-1) !== '/')) {
    srcPath.push('');
  }

  var isAbsolute = srcPath[0] === '' ||
      (srcPath[0] && srcPath[0].charAt(0) === '/');

  // put the host back
  if (psychotic) {
    result.hostname = result.host = isAbsolute ? '' :
                                    srcPath.length ? srcPath.shift() : '';
    //occationaly the auth can get stuck only in host
    //this especialy happens in cases like
    //url.resolveObject('mailto:local1@domain1', 'local2@domain2')
    var authInHost = result.host && result.host.indexOf('@') > 0 ?
                     result.host.split('@') : false;
    if (authInHost) {
      result.auth = authInHost.shift();
      result.host = result.hostname = authInHost.shift();
    }
  }

  mustEndAbs = mustEndAbs || (result.host && srcPath.length);

  if (mustEndAbs && !isAbsolute) {
    srcPath.unshift('');
  }

  if (!srcPath.length) {
    result.pathname = null;
    result.path = null;
  } else {
    result.pathname = srcPath.join('/');
  }

  //to support request.http
  if (!isNull(result.pathname) || !isNull(result.search)) {
    result.path = (result.pathname ? result.pathname : '') +
                  (result.search ? result.search : '');
  }
  result.auth = relative.auth || result.auth;
  result.slashes = result.slashes || relative.slashes;
  result.href = result.format();
  return result;
};

Url.prototype.parseHost = function() {
  var host = this.host;
  var port = portPattern.exec(host);
  if (port) {
    port = port[0];
    if (port !== ':') {
      this.port = port.substr(1);
    }
    host = host.substr(0, host.length - port.length);
  }
  if (host) this.hostname = host;
};

function isString(arg) {
  return typeof arg === "string";
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isNull(arg) {
  return arg === null;
}
function isNullOrUndefined(arg) {
  return  arg == null;
}

},{"punycode":34,"querystring":41}],44:[function(require,module,exports){
var racer = require('racer');
var BCSocket = require('browserchannel/dist/bcsocket-uncompressed').BCSocket;

var CLIENT_OPTIONS = JSON.parse('{"base":"/channel","reconnect":true}');

racer.Model.prototype._createSocket = function(bundle) {
  return new Socket(CLIENT_OPTIONS);
};

// Options:

// base               - string  - base url part ('/channel' by default)
// browserChannelOnly - boolean - don't use websockets (false by default)
// srvPort            - number  - port for http (undefined by default)
// srvSecurePort      - number  - port for https (undefined by default)
// timeout            - number  - base timeout for reconnection (10000 ms by default)
// timeoutIncrement   - number  - additional part of timeout (add every
//                                new attempt - 10000 ms by default)

function Socket(options) {
  this._options = options;
  this._messageQueue = [];
  this._connectedOnce = false;
  this._attemptNum = 0;
  this._url = getWebSocketURL(options.base, options.srvPort, options.srvSecurePort);

  if (supportWebSockets() && !options.browserChannelOnly) {
    this._createWebSocket();
  } else {
    this._createBrowserChannel();
  }
}

Socket.prototype._createWebSocket = function() {

  this._type = 'websocket';
  this._socket = new WebSocket(this._url);

  this.open = this._createWebSocket.bind(this);
  this._syncState();

  this._socket.onmessage = this._ws_onmessage.bind(this);
  this._socket.onopen = this._ws_onopen.bind(this);
  this._socket.onclose = this._ws_onclose.bind(this);
  
};

Socket.prototype._createBrowserChannel = function() {
  this._type = 'browserchannel';
  this._socket = BCSocket(this._options.base, this._options);

  this.open = this._createBrowserChannel.bind(this);
  this._syncState();

  this._socket.onmessage = this._bc_onmessage.bind(this);
  this._socket.onopen = this._bc_onopen.bind(this);
  this._socket.onclose = this._bc_onclose.bind(this);
};

Socket.prototype._ws_onmessage = function(message) {
  this._syncState();
  message.data = JSON.parse(message.data);
  this.onmessage && this.onmessage(message);
};

Socket.prototype._ws_onopen = function(event) {
  this._attemptNum = 0;
  this._connectedOnce = true;

  this._syncState();
  this._flushQueue();

  this.onopen && this.onopen(event);
};

Socket.prototype._ws_onclose = function(event) {
  this._syncState();
  console.log('WebSocket: connection is broken', event);
  
  this.onclose && this.onclose(event);

  if (!this._connectedOnce) {
    return this._createBrowserChannel();
  }

  if (this._options.reconnect && !event.wasClean) {
    setTimeout(this._createWebSocket.bind(this), this._getTimeout());
  }
  this._attemptNum++;
};

Socket.prototype._getTimeout = function(){
  var base = (this._options.timeout || 10000);
  var increment = (this._options.timeoutIncrement || 10000) * this._attemptNum;
  return  base + increment;
};

Socket.prototype._bc_onmessage = function(data) {
  this._syncState();
  this.onmessage && this.onmessage(data);
};

Socket.prototype._bc_onopen = function(event) {
  this._syncState();
  this.onopen && this.onopen(event);
};

Socket.prototype._bc_onclose = function(event) {
  this._syncState();
  this.onclose && this.onclose(event);
};

Socket.prototype._flushQueue = function(){
  while (this._messageQueue.length !== 0) {
    var data = this._messageQueue.shift();
    this._send(data);
  }
};

Socket.prototype._send = function(data){
  if (this._type === 'websocket' && (typeof data !== 'string')) data = JSON.stringify(data);

  this._socket.send(data);
};

Socket.prototype.send = function(data){
  if (this._type === 'websocket') {
    if (this._socket.readyState === WebSocket.OPEN && this._messageQueue.length === 0) {
      this._send(data);
    } else {
      this._messageQueue.push(data);
    }
  } else {
    this._send(data);
  }
};

Socket.prototype.close = function(){
  this._socket.close();
};

Socket.prototype._syncState = function(){
  this.readyState = this._socket.readyState;
};

// ShareJS constants
Socket.prototype.canSendWhileConnecting = true;
Socket.prototype.canSendJSON = true;

// WebSocket constants
Socket.prototype.CONNECTING = 0;
Socket.prototype.OPEN = 1;
Socket.prototype.CLOSING = 2;
Socket.prototype.CLOSED = 3;

function supportWebSockets(){
  // The condition is from Modernizr
  // https://github.com/Modernizr/Modernizr/blob/master/feature-detects/websockets.js#L28
  return 'WebSocket' in window && window.WebSocket.CLOSING === 2;
}

function getWebSocketURL(base, srvPort, srvSecurePort){
  var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:', port;

  if (protocol === 'ws:' && srvPort) {
    port = ":" + srvPort;
  } else if (protocol === 'wss:' && srvSecurePort) {
    port = ":" + srvSecurePort;
  }
  return protocol + '//' + window.location.host + (port || "") + base;
}

// Maybe need to use reconnection timing algorithm from
// http://blog.johnryding.com/post/78544969349/how-to-reconnect-web-sockets-in-a-realtime-web-app



},{"browserchannel/dist/bcsocket-uncompressed":3,"racer":"1up47O"}],45:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter;
var util = require('./util');

module.exports = Channel;

function Channel(socket) {
  EventEmitter.call(this);

  this.socket = socket;
  this.messages = new Messages();

  var channel = this;
  var onmessage = socket.onmessage;
  socket.onmessage = function(message) {
    var data = message.data;
    try {
      if (typeof data === 'string') data = JSON.parse(data);
      if (data && data.racer) return channel._onMessage(data);
      onmessage && onmessage.call(socket, message);
    }
    catch(error) {
      console.log(error);
    }
    

  };
}

util.mergeInto(Channel.prototype, EventEmitter.prototype);

Channel.prototype.send = function(name, data, cb) {
  var message = this.messages.add(name, data, cb);
  // Proactively call the toJSON function, since the Google Closure JSON
  // serializer doesn't check for it
  this.socket.send(message.toJSON());
};

Channel.prototype._reply = function(id, name, data) {
  var message = new Message(id, true, name, data);
  this.socket.send(message.toJSON());
};

Channel.prototype._onMessage = function(data) {
  if (data.ack) {
    var message = this.messages.remove(data.id);
    if (message && message.cb) message.cb.apply(null, data.data);
    return;
  }
  var name = data.racer;
  if (data.cb) {
    var channel = this;
    var hasListeners = this.emit(name, data.data, function() {
      var args = Array.prototype.slice.call(arguments);
      channel._reply(data.id, name, args);
    });
    if (!hasListeners) this._reply(data.id, name);
  } else {
    this.emit(name, data.data);
    this._reply(data.id, name);
  }
};

function MessagesMap() {}

function Messages() {
  this.map = new MessagesMap();
  this.idCount = 0;
}
Messages.prototype.id = function() {
  return (++this.idCount).toString(36);
};
Messages.prototype.add = function(name, data, cb) {
  var message = new Message(this.id(), false, name, data, cb);
  this.map[message.id] = message;
  return message;
};
Messages.prototype.remove = function(id) {
  var message = this.map[id];
  delete this.map[id];
  return message;
};

function Message(id, ack, name, data, cb) {
  this.id = id;
  this.ack = ack;
  this.name = name;
  this.data = data;
  this.cb = cb;
}
Message.prototype.toJSON = function() {
  return {
    racer: this.name
  , id: this.id
  , data: this.data
  , ack: +this.ack
  , cb: (this.cb) ? 1 : 0
  };
};

},{"./util":69,"events":22}],46:[function(require,module,exports){
module.exports = Doc;

function Doc(model, collectionName, id) {
  this.collectionName = collectionName;
  this.id = id;
  this.collectionData = model && model.data[collectionName];
}

Doc.prototype.path = function(segments) {
  return this.collectionName + '.' + this.id + '.' + segments.join('.');
};

Doc.prototype._errorMessage = function(description, segments, value) {
  return description + ' at ' + this.path(segments) + ': ' +
    JSON.stringify(value, null, 2);
};

},{}],47:[function(require,module,exports){
var Doc = require('./Doc');
var util = require('../util');

module.exports = LocalDoc;

function LocalDoc(model, collectionName, id, snapshot) {
  Doc.call(this, model, collectionName, id);
  this.snapshot = snapshot;
  this._updateCollectionData();
}

LocalDoc.prototype = new Doc();

LocalDoc.prototype._updateCollectionData = function() {
  this.collectionData[this.id] = this.snapshot;
};

LocalDoc.prototype.set = function(segments, value, cb) {
  function set(node, key) {
    var previous = node[key];
    node[key] = value;
    return previous;
  }
  return this._apply(segments, set, cb);
};

LocalDoc.prototype.del = function(segments, cb) {
  // Don't do anything if the value is already undefined, since
  // apply creates objects as it traverses, and the del method
  // should not create anything
  var previous = this.get(segments);
  if (previous === void 0) {
    cb();
    return;
  }
  function del(node, key) {
    delete node[key];
    return previous;
  }
  return this._apply(segments, del, cb);
};

LocalDoc.prototype.increment = function(segments, byNumber, cb) {
  var self = this;
  function validate(value) {
    if (typeof value === 'number' || value == null) return;
    return new TypeError(self._errorMessage(
      'increment on non-number', segments, value
    ));
  }
  function increment(node, key) {
    var value = (node[key] || 0) + byNumber;
    node[key] = value;
    return value;
  }
  return this._validatedApply(segments, validate, increment, cb);
};

LocalDoc.prototype.push = function(segments, value, cb) {
  function push(arr) {
    return arr.push(value);
  }
  return this._arrayApply(segments, push, cb);
};

LocalDoc.prototype.unshift = function(segments, value, cb) {
  function unshift(arr) {
    return arr.unshift(value);
  }
  return this._arrayApply(segments, unshift, cb);
};

LocalDoc.prototype.insert = function(segments, index, values, cb) {
  function insert(arr) {
    arr.splice.apply(arr, [index, 0].concat(values));
    return arr.length;
  }
  return this._arrayApply(segments, insert, cb);
};

LocalDoc.prototype.pop = function(segments, cb) {
  function pop(arr) {
    return arr.pop();
  }
  return this._arrayApply(segments, pop, cb);
};

LocalDoc.prototype.shift = function(segments, cb) {
  function shift(arr) {
    return arr.shift();
  }
  return this._arrayApply(segments, shift, cb);
};

LocalDoc.prototype.remove = function(segments, index, howMany, cb) {
  function remove(arr) {
    return arr.splice(index, howMany);
  }
  return this._arrayApply(segments, remove, cb);
};

LocalDoc.prototype.move = function(segments, from, to, howMany, cb) {
  function move(arr) {
    // Remove from old location
    var values = arr.splice(from, howMany);
    // Insert in new location
    arr.splice.apply(arr, [to, 0].concat(values));
    return values;
  }
  return this._arrayApply(segments, move, cb);
};

LocalDoc.prototype.stringInsert = function(segments, index, value, cb) {
  var self = this;
  function validate(value) {
    if (typeof value === 'string' || value == null) return;
    return new TypeError(self._errorMessage(
      'stringInsert on non-string', segments, value
    ));
  }
  function stringInsert(node, key) {
    var previous = node[key];
    if (previous == null) {
      node[key] = value;
      return previous;
    }
    node[key] = previous.slice(0, index) + value + previous.slice(index);
    return previous;
  }
  return this._validatedApply(segments, validate, stringInsert, cb);
};

LocalDoc.prototype.stringRemove = function(segments, index, howMany, cb) {
  var self = this;
  function validate(value) {
    if (typeof value === 'string' || value == null) return;
    return new TypeError(self._errorMessage(
      'stringRemove on non-string', segments, value
    ));
  }
  function stringRemove(node, key) {
    var previous = node[key];
    if (previous == null) return previous;
    if (index < 0) index += previous.length;
    node[key] = previous.slice(0, index) + previous.slice(index + howMany);
    return previous;
  }
  return this._validatedApply(segments, validate, stringRemove, cb);
};

LocalDoc.prototype.get = function(segments) {
  return util.lookup(segments, this.snapshot);
};

/**
 * @param {Array} segments is the array representing a path
 * @param {Function} fn(node, key) applies a mutation on node[key]
 * @return {Object} returns the return value of fn(node, key)
 */
LocalDoc.prototype._createImplied = function(segments, fn) {
  var node = this;
  var key = 'snapshot';
  var i = 0;
  var nextKey = segments[i++];
  while (nextKey != null) {
    // Get or create implied object or array
    node = node[key] || (node[key] = /^\d+$/.test(nextKey) ? [] : {});
    key = nextKey;
    nextKey = segments[i++];
  }
  return fn(node, key);
};

LocalDoc.prototype._apply = function(segments, fn, cb) {
  var out = this._createImplied(segments, fn);
  this._updateCollectionData();
  cb();
  return out;
};

LocalDoc.prototype._validatedApply = function(segments, validate, fn, cb) {
  var out = this._createImplied(segments, function(node, key) {
    var err = validate(node[key]);
    if (err) return cb(err);
    return fn(node, key);
  });
  this._updateCollectionData();
  cb();
  return out;
};

LocalDoc.prototype._arrayApply = function(segments, fn, cb) {
  // Lookup a pointer to the property or nested property &
  // return the current value or create a new array
  var arr = this._createImplied(segments, nodeCreateArray);

  if (!Array.isArray(arr)) {
    var message = this._errorMessage(fn.name + ' on non-array', segments, arr);
    var err = new TypeError(message);
    return cb(err);
  }
  var out = fn(arr);
  this._updateCollectionData();
  cb();
  return out;
};

function nodeCreateArray(node, key) {
  return node[key] || (node[key] = []);
}

},{"../util":69,"./Doc":46}],48:[function(require,module,exports){
var uuid = require('uuid');

Model.INITS = [];

module.exports = Model;

function Model(options) {
  this.root = this;

  var inits = Model.INITS;
  options || (options = {});
  this.debug = options.debug || {};
  for (var i = 0; i < inits.length; i++) {
    inits[i](this, options);
  }
}

Model.prototype.id = function() {
  return uuid.v4();
};

Model.prototype._child = function() {
  return new ChildModel(this);
};

function ChildModel(model) {
  // Shared properties should be accessed via the root. This makes inheritance
  // cheap and easily extensible
  this.root = model.root;

  // EventEmitter methods access these properties directly, so they must be
  // inherited manually instead of via the root
  this._events = model._events;
  this._maxListeners = model._maxListeners;

  // Properties specific to a child instance
  this._context = model._context;
  this._at = model._at;
  this._pass = model._pass;
  this._silent = model._silent;
  this._eventContext = model._eventContext;
}
ChildModel.prototype = new Model();

},{"uuid":87}],49:[function(require,module,exports){
(function (process){
var util = require('../util');
var Model = require('./Model');
var arrayDiff = require('arraydiff');

module.exports = Query;

Model.INITS.push(function(model) {
  model.root._queries = new Queries();
  if (model.root.fetchOnly) return;
  model.on('all', function(segments) {
    var map = model.root._queries.map;
    for (var hash in map) {
      var query = map[hash];
      if (query.isPathQuery && query.shareQuery && util.mayImpact(query.expression, segments)) {
        var ids = pathIds(model, query.expression);
        var previousIds = model._get(query.idsSegments);
        query._onChange(ids, previousIds);
      }
    }
  });
});

/**
 * @param {String} collectionName
 * @param {Object} expression
 * @param {String} source
 * @return {Query}
 */
Model.prototype.query = function(collectionName, expression, source) {
  if (typeof expression.path === 'function' || typeof expression !== 'object') {
    expression = this._splitPath(expression);
  }
  var query = this.root._queries.get(collectionName, expression, source);
  if (query) return query;
  query = new Query(this, collectionName, expression, source);
  this.root._queries.add(query);
  return query;
};

/**
 * Called during initialization of the bundle on page load.
 */
Model.prototype._initQueries = function(items) {
  var queries = this.root._queries;
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var counts = item[0];
    var collectionName = item[1];
    var expression = item[2];
    var ids = item[3] || [];
    var snapshots = item[4] || [];
    var versions = item[5] || [];
    var source = item[6];
    var extra = item[7];
    var query = new Query(this, collectionName, expression, source);
    queries.add(query);

    this._set(query.idsSegments, ids);

    // This is a bit of a hack, but it should be correct. Given that queries
    // are initialized first, the ids path is probably not set yet, but it will
    // be used to generate the query. Therefore, we assume that the value of
    // path will be the ids that the query results were on the server. There
    // are probably some really odd edge cases where this doesn't work, and
    // a more correct thing to do would be to get the actual value for the
    // path before creating the query subscription. This feature should
    // probably be rethought.
    if (query.isPathQuery && expression.length > 0 && this._isLocal(expression[0])) {
      this._setNull(expression, ids.slice());
    }

    if (extra !== void 0) {
      this._set(query.extraSegments, extra);
    }

    for (var j = 0; j < snapshots.length; j++) {
      var snapshot = snapshots[j];
      if (!snapshot) continue;
      var id = ids[j];
      var version = versions[j];
      var data = {data: snapshot, v: version, type: 'json0'};
      this.getOrCreateDoc(collectionName, id, data);
      this._loadVersions[collectionName + '.' + id] = version;
    }

    for (var j = 0; j < counts.length; j++) {
      var count = counts[j];
      var subscribed = count[0] || 0;
      var fetched = count[1] || 0;
      var contextId = count[2];
      if (contextId) query.model.setContext(contextId);
      while (subscribed--) {
        query.subscribe();
      }
      query.fetchCount += fetched;
      while (fetched--) {
        query.fetchIds.push(ids);
        query.model._context.fetchQuery(query);
        var alreadyLoaded = true;
        for (var k = 0; k < ids.length; k++) {
          query.model.fetchDoc(collectionName, ids[k], null, alreadyLoaded);
        }
      }
    }
  }
};

function QueriesMap() {}

function Queries() {
  this.map = new QueriesMap();
}
Queries.prototype.add = function(query) {
  this.map[query.hash] = query;
};
Queries.prototype.remove = function(query) {
  delete this.map[query.hash];
};
Queries.prototype.get = function(collectionName, expression, source) {
  var hash = queryHash(collectionName, expression, source);
  return this.map[hash];
};
Queries.prototype.toJSON = function() {
  var out = [];
  for (var hash in this.map) {
    var query = this.map[hash];
    if (query.subscribeCount || query.fetchCount) {
      out.push(query.serialize());
    }
  }
  return out;
};

/**
 * @private
 * @constructor
 * @param {Model} model
 * @param {Object} collectionName
 * @param {Object} expression
 * @param {String} source (e.g., 'solr')
 * @param {Number} subscribeCount
 * @param {Number} fetchCount
 * @param {Array<Array<String>>} fetchIds
 */
function Query(model, collectionName, expression, source) {
  this.model = model.pass({$query: this});
  this.collectionName = collectionName;
  this.expression = expression;
  this.source = source;
  this.hash = queryHash(collectionName, expression, source);
  this.segments = ['$queries', this.hash];
  this.idsSegments = ['$queries', this.hash, 'ids'];
  this.extraSegments = ['$queries', this.hash, 'extra'];
  this.isPathQuery = Array.isArray(expression);

  this._pendingSubscribeCallbacks = [];

  // These are used to help cleanup appropriately when calling unsubscribe and
  // unfetch. A query won't be fully cleaned up until unfetch and unsubscribe
  // are called the same number of times that fetch and subscribe were called.
  this.subscribeCount = 0;
  this.fetchCount = 0;
  // The list of ids at the time of each fetch is pushed onto fetchIds, so
  // that unfetchDoc can be called the same number of times as fetchDoc
  this.fetchIds = [];

  this.created = false;
  this.shareQuery = null;
}

Query.prototype.create = function() {
  this.created = true;
  this.model.root._queries.add(this);
};

Query.prototype.destroy = function() {
  this.created = false;
  if (this.shareQuery) {
    this.shareQuery.destroy();
    this.shareQuery = null;
  }
  this.model.root._queries.remove(this);
  this.model._del(this.segments);
};

Query.prototype.sourceQuery = function() {
  if (this.isPathQuery) {
    var ids = pathIds(this.model, this.expression);
    return {_id: {$in: ids}};
  }
  return this.expression;
};

/**
 * @param {Function} [cb] cb(err)
 */
Query.prototype.fetch = function(cb) {
  cb = this.model.wrapCallback(cb);
  this.model._context.fetchQuery(this);

  this.fetchCount++;

  if (!this.created) this.create();
  var query = this;

  var model = this.model;
  var shareDocs = collectionShareDocs(this.model, this.collectionName);
  var options = {docMode: 'fetch', knownDocs: shareDocs};
  if (this.source) options.source = this.source;

  model.root.shareConnection.createFetchQuery(
    this.collectionName, this.sourceQuery(), options, fetchQueryCallback
  );
  function fetchQueryCallback(err, results, extra) {
    if (err) return cb(err);
    var ids = resultsIds(results);

    // Keep track of the ids at fetch time for use in unfetch
    query.fetchIds.push(ids.slice());
    // Update the results ids and extra
    model._setArrayDiff(query.idsSegments, ids);
    if (extra !== void 0) {
      model._setDiffDeep(query.extraSegments, extra);
    }

    // Call fetchDoc for each document returned so that the proper load events
    // and internal counts are maintained. However, specify that we already
    // loaded the documents as part of the query, since we don't want to
    // actually fetch the documents again
    var alreadyLoaded = true;
    for (var i = 0; i < ids.length; i++) {
      model.fetchDoc(query.collectionName, ids[i], null, alreadyLoaded);
    }
    cb();
  }
  return this;
};

/**
 * Sets up a subscription to `this` query.
 * @param {Function} cb(err)
 */
Query.prototype.subscribe = function(cb) {
  cb = this.model.wrapCallback(cb);
  this.model._context.subscribeQuery(this);

  var query = this;

  if (this.subscribeCount++) {
    process.nextTick(function() {
      var data = query.model._get(query.segments);
      if (data) {
        cb();
      } else {
        query._pendingSubscribeCallbacks.push(cb);
      }
    });
    return this;
  }

  if (!this.created) this.create();

  // When doing server-side rendering, we actually do a fetch the first time
  // that subscribe is called, but keep track of the state as if subscribe
  // were called for proper initialization in the client
  var shareDocs = collectionShareDocs(this.model, this.collectionName);
  var options = {docMode: 'sub', knownDocs: shareDocs};
  if (this.source) options.source = this.source;

  if (!this.model.root.fetchOnly) {
    this._shareSubscribe(options, cb);
    return this;
  }

  var model = this.model;
  options.docMode = 'fetch';
  model.root.shareConnection.createFetchQuery(
    this.collectionName, this.sourceQuery(), options, function(err, results, extra) {
      if (err) {
        cb(err);
        query._flushPendingCallbacks(err);
        return;
      }
      var ids = resultsIds(results);
      if (extra !== void 0) {
        model._setDiffDeep(query.extraSegments, extra);
      }
      query._onChange(ids, null, function(err) {
        cb(err);
        query._flushPendingCallbacks(err);
      });
    }
  );
  return this;
};

/**
 * @private
 * @param {Object} options
 * @param {String} [options.source]
 * @param {Boolean} [options.poll]
 * @param {Boolean} [options.docMode = fetch or subscribe]
 * @param {Function} cb(err, results)
 */
Query.prototype._shareSubscribe = function(options, cb) {
  var query = this;
  var model = this.model;
  this.shareQuery = this.model.root.shareConnection.createSubscribeQuery(
    this.collectionName, this.sourceQuery(), options, function(err, results, extra) {
      if (err) {
        cb(err);
        query._flushPendingCallbacks();
        return;
      }
      if (extra !== void 0) {
        model._setDiffDeep(query.extraSegments, extra);
      }
      // Results are not set in the callback, because the shareQuery should
      // emit a 'change' event before calling back
      cb();
      query._flushPendingCallbacks();
    }
  );
  var query = this;
  this.shareQuery.on('insert', function(shareDocs, index) {
    query._onInsert(shareDocs, index);
  });
  this.shareQuery.on('remove', function(shareDocs, index) {
    query._onRemove(shareDocs, index);
  });
  this.shareQuery.on('move', function(shareDocs, from, to) {
    query._onMove(shareDocs, from, to);
  });
  this.shareQuery.on('change', function(results, previous) {
    // Get the new and previous list of ids when the entire results set changes
    var ids = resultsIds(results);
    var previousIds = previous && resultsIds(previous);
    query._onChange(ids, previousIds);
  });
  this.shareQuery.on('extra', function(extra) {
    model._setDiffDeep(query.extraSegments, extra);
  });
};

/**
 * Flushes `_pendingSubscribeCallbacks`, calling each callback in the array,
 * with an optional error to pass into each. `_pendingSubscribeCallbacks` will
 * be empty after this runs.
 * @private
 */
Query.prototype._flushPendingCallbacks = function(err) {
  var pendingCallback;
  while (pendingCallback = this._pendingSubscribeCallbacks.shift()) {
    pendingCallback(err);
  }
};

/**
 * @public
 * @param {Function} cb(err, newFetchCount)
 */
Query.prototype.unfetch = function(cb) {
  cb = this.model.wrapCallback(cb);
  this.model._context.unfetchQuery(this);

  // No effect if the query is not currently fetched
  if (!this.fetchCount) {
    cb();
    return this;
  }

  var ids = this.fetchIds.shift() || [];
  for (var i = 0; i < ids.length; i++) {
    this.model.unfetchDoc(this.collectionName, ids[i]);
  }

  var query = this;
  if (this.model.root.unloadDelay) {
    setTimeout(finishUnfetchQuery, this.model.root.unloadDelay);
  } else {
    finishUnfetchQuery();
  }
  function finishUnfetchQuery() {
    var count = --query.fetchCount;
    if (count) return cb(null, count);
    // Cleanup when no fetches or subscribes remain
    if (!query.subscribeCount) query.destroy();
    cb(null, 0);
  }
  return this;
};

Query.prototype.unsubscribe = function(cb) {
  cb = this.model.wrapCallback(cb);
  this.model._context.unsubscribeQuery(this);

  // No effect if the query is not currently subscribed
  if (!this.subscribeCount) {
    cb();
    return this;
  }

  var query = this;
  if (this.model.root.unloadDelay) {
    setTimeout(finishUnsubscribeQuery, this.model.root.unloadDelay);
  } else {
    finishUnsubscribeQuery();
  }
  function finishUnsubscribeQuery() {
    var count = --query.subscribeCount;
    if (count) return cb(null, count);

    var ids;
    if (query.shareQuery) {
      ids = resultsIds(query.shareQuery.results);
      query.shareQuery.destroy();
      query.shareQuery = null;
    }

    if (!query.model.root.fetchOnly && ids && ids.length) {
      // Unsubscribe all documents that this query currently has in results
      var group = util.asyncGroup(unsubscribeQueryCallback);
      for (var i = 0; i < ids.length; i++) {
        query.model.unsubscribeDoc(query.collectionName, ids[i], group());
      }
    }
    unsubscribeQueryCallback();
  }
  function unsubscribeQueryCallback(err) {
    if (err) return cb(err);
    // Cleanup when no fetches or subscribes remain
    if (!query.fetchCount) query.destroy();
    cb(null, 0);
  }
  return this;
};

Query.prototype._onInsert = function(shareDocs, index) {
  var ids = [];
  for (var i = 0; i < shareDocs.length; i++) {
    var id = shareDocs[i].name;
    ids.push(id);
    this.model.subscribeDoc(this.collectionName, id);
  }
  this.model._insert(this.idsSegments, index, ids);
};
Query.prototype._onRemove = function(shareDocs, index) {
  this.model._remove(this.idsSegments, index, shareDocs.length);
  for (var i = 0; i < shareDocs.length; i++) {
    this.model.unsubscribeDoc(this.collectionName, shareDocs[i].name);
  }
};
Query.prototype._onMove = function(shareDocs, from, to) {
  this.model._move(this.idsSegments, from, to, shareDocs.length);
};

Query.prototype._onChange = function(ids, previousIds, cb) {
  // Diff the new and previous list of ids, subscribing to documents for
  // inserted ids and unsubscribing from documents for removed ids
  var diff = (previousIds) ?
    arrayDiff(previousIds, ids) :
    [new arrayDiff.InsertDiff(0, ids)];
  var previousCopy = previousIds && previousIds.slice();

  // The results are updated via a different diff, since they might already
  // have a value from a fetch or previous shareQuery instance
  this.model._setArrayDiff(this.idsSegments, ids);

  var group, finished;
  if (cb) {
    group = util.asyncGroup(cb);
    finished = group();
  }
  for (var i = 0; i < diff.length; i++) {
    var item = diff[i];
    if (item instanceof arrayDiff.InsertDiff) {
      // Subscribe to the document for each inserted id
      var values = item.values;
      for (var j = 0; j < values.length; j++) {
        this.model.subscribeDoc(this.collectionName, values[j], cb && group());
      }
    } else if (item instanceof arrayDiff.RemoveDiff) {
      var values = previousCopy.splice(item.index, item.howMany);
      // Unsubscribe from the document for each removed id
      for (var j = 0; j < values.length; j++) {
        this.model.unsubscribeDoc(this.collectionName, values[j], cb && group());
      }
    }
    // Moving doesn't change document subscriptions, so that is ignored.
  }
  // Make sure that the callback gets called if the diff is empty or it
  // contains no inserts or removes
  finished && finished();
};

Query.prototype.get = function() {
  var results = [];
  var data = this.model._get(this.segments);
  if (!data) {
    console.warn('You must fetch or subscribe to a query before getting its results.');
    return results;
  }
  var ids = data.ids;
  if (!ids) return results;

  var collection = this.model.getCollection(this.collectionName);
  for (var i = 0, l = ids.length; i < l; i++) {
    var id = ids[i];
    var doc = collection && collection.docs[id];
    results.push(doc && doc.get());
  }
  return results;
};

Query.prototype.getIds = function() {
  return this.model._get(this.idsSegments);
};

Query.prototype.getExtra = function() {
  return this.model._get(this.extraSegments);
};

Query.prototype.ref = function(from) {
  var idsPath = this.idsSegments.join('.');
  return this.model.refList(from, this.collectionName, idsPath);
};

Query.prototype.refIds = function(from) {
  var idsPath = this.idsSegments.join('.');
  return this.model.root.ref(from, idsPath);
};

Query.prototype.refExtra = function(from, relPath) {
  var extraPath = this.extraSegments.join('.');
  if (relPath) extraPath += '.' + relPath;
  return this.model.root.ref(from, extraPath);
};

Query.prototype.serialize = function() {
  var ids = this.getIds();
  var collection = this.model.getCollection(this.collectionName);
  var snapshots, versions;
  if (collection) {
    snapshots = [];
    versions = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      var doc = collection.docs[id];
      if (doc) {
        snapshots.push(doc.shareDoc.snapshot);
        versions.push(doc.shareDoc.version);
        collection.remove(id);
      } else {
        snapshots.push(0);
        versions.push(0);
      }
    }
  }
  var counts = [];
  var contexts = this.model.root._contexts;
  for (var key in contexts) {
    var context = contexts[key];
    var subscribed = context.subscribedQueries[this.hash] || 0;
    var fetched = context.fetchedQueries[this.hash] || 0;
    if (subscribed || fetched) {
      if (key !== 'root') {
        counts.push([subscribed, fetched, key]);
      } else if (fetched) {
        counts.push([subscribed, fetched]);
      } else {
        counts.push([subscribed]);
      }
    }
  }
  var serialized = [
    counts
  , this.collectionName
  , this.expression
  , ids
  , snapshots
  , versions
  , this.source
  , this.getExtra()
  ];
  while (serialized[serialized.length - 1] == null) {
    serialized.pop();
  }
  return serialized;
};

function queryHash(collectionName, expression, source) {
  var args = [collectionName, expression, source];
  return JSON.stringify(args).replace(/\./g, '|');
}

function resultsIds(results) {
  var ids = [];
  for (var i = 0; i < results.length; i++) {
    var shareDoc = results[i];
    ids.push(shareDoc.name);
  }
  return ids;
}

function pathIds(model, segments) {
  var value = model._get(segments);
  return (typeof value === 'string') ? [value] :
    (Array.isArray(value)) ? value.slice() : [];
}

function collectionShareDocs(model, collectionName) {
  var collection = model.getCollection(collectionName);
  if (!collection) return;

  var results = [];
  for (var name in collection.docs) {
    results.push(collection.docs[name].shareDoc);
  }

  return results;
}

}).call(this,require("g5I+bs"))
},{"../util":69,"./Model":48,"arraydiff":2,"g5I+bs":33}],50:[function(require,module,exports){
/**
 * RemoteDoc adapts the ShareJS operation protocol to Racer's mutator
 * interface.
 *
 * 1. It maps Racer's mutator methods to outgoing ShareJS operations.
 * 2. It maps incoming ShareJS operations to Racer events.
 */

var Doc = require('./Doc');
var util = require('../util');

module.exports = RemoteDoc;

function RemoteDoc(model, collectionName, id, data) {
  Doc.call(this, model, collectionName, id);
  var shareDoc = this.shareDoc = model._getOrCreateShareDoc(collectionName, id, data);
  if (model.root.debug.disableSubmit) {
    shareDoc.submitOp = function() {};
  }
  this.debugMutations = model.root.debug.remoteMutations;
  this.createdLocally = false;
  this.model = model = model.pass({$remote: true});
  this._updateCollectionData();

  var doc = this;
  shareDoc.on('op', function(op, isLocal) {
    // Don't emit on local operations, since they are emitted in the mutator
    if (isLocal) return;
    doc._updateCollectionData();
    doc._onOp(op);
  });
  shareDoc.on('del', function(isLocal, previous) {
    // Calling the shareDoc.del method does not emit an operation event,
    // so we create the appropriate event here.
    if (isLocal) return;
    delete doc.collectionData[id];
    model.emit('change', [collectionName, id], [void 0, previous, model._pass]);
  });
  shareDoc.on('create', function(isLocal) {
    // Local creates should not emit an event, since they only happen
    // implicitly as a result of another mutation, and that operation will
    // emit the appropriate event. Remote creates can set the snapshot data
    // without emitting an operation event, so an event needs to be emitted
    // for them.
    if (isLocal) {
      // Track when a document was created by this client, so that we don't
      // emit a load event when subsequently subscribed
      doc.createdLocally = true;
      return;
    }
    doc._updateCollectionData();
    var value = shareDoc.snapshot;
    model.emit('change', [collectionName, id], [value, void 0, model._pass]);
  });
}

RemoteDoc.prototype = new Doc();

RemoteDoc.prototype._updateCollectionData = function() {
  var snapshot = this.shareDoc.snapshot;
  if (typeof snapshot === 'object' && !Array.isArray(snapshot) && snapshot !== null) {
    snapshot.id = this.id;
  }
  this.collectionData[this.id] = snapshot;
};

RemoteDoc.prototype.set = function(segments, value, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc set', this.path(segments), value);
  }
  if (segments.length === 0 && !this.shareDoc.type) {
    // We copy the snapshot at time of create to prevent the id added outside
    // of ShareJS from getting stored in the data
    var snapshot = util.copy(value);
    if (snapshot) delete snapshot.id;
    this.shareDoc.create('json0', snapshot, cb);
    // The id value will get added to the snapshot that was passed in
    this.shareDoc.snapshot = value;
    this._updateCollectionData();
    return;
  }
  var previous = this._createImplied(segments);
  var lastSegment = segments[segments.length - 1];
  if (previous instanceof ImpliedOp) {
    previous.value[lastSegment] = value;
    this.shareDoc.submitOp(previous.op, cb);
    this._updateCollectionData();
    return;
  }
  var op = (util.isArrayIndex(lastSegment)) ?
    [new ListReplaceOp(segments.slice(0, -1), lastSegment, previous, value)] :
    [new ObjectReplaceOp(segments, previous, value)];
  this.shareDoc.submitOp(op, cb);
  this._updateCollectionData();
  return previous;
};

RemoteDoc.prototype.del = function(segments, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc del', this.path(segments));
  }
  if (segments.length === 0) {
    var previous = this.get();
    this.shareDoc.del(cb);
    delete this.collectionData[this.id];
    return previous;
  }
  // Don't do anything if the value is already undefined, since
  // the del method should not create anything
  var previous = this.get(segments);
  if (previous === void 0) {
    cb();
    return;
  }
  var op = [new ObjectDeleteOp(segments, previous)];
  this.shareDoc.submitOp(op, cb);
  this._updateCollectionData();
  return previous;
};

RemoteDoc.prototype.increment = function(segments, byNumber, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc increment', this.path(segments), byNumber);
  }
  var previous = this._createImplied(segments);
  if (previous instanceof ImpliedOp) {
    var lastSegment = segments[segments.length - 1];
    previous.value[lastSegment] = byNumber;
    this.shareDoc.submitOp(previous.op, cb);
    this._updateCollectionData();
    return byNumber;
  }
  if (previous == null) {
    var lastSegment = segments[segments.length - 1];
    var op = (util.isArrayIndex(lastSegment)) ?
      [new ListInsertOp(segments.slice(0, -1), lastSegment, byNumber)] :
      [new ObjectInsertOp(segments, byNumber)];
    this.shareDoc.submitOp(op, cb);
    this._updateCollectionData();
    return byNumber;
  }
  var op = [new IncrementOp(segments, byNumber)];
  this.shareDoc.submitOp(op, cb);
  this._updateCollectionData();
  return previous + byNumber;
};

RemoteDoc.prototype.push = function(segments, value, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc push', this.path(segments), value);
  }
  var shareDoc = this.shareDoc;
  function push(arr, fnCb) {
    var op = [new ListInsertOp(segments, arr.length, value)];
    shareDoc.submitOp(op, fnCb);
    return arr.length;
  }
  return this._arrayApply(segments, push, cb);
};

RemoteDoc.prototype.unshift = function(segments, value, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc unshift', this.path(segments), value);
  }
  var shareDoc = this.shareDoc;
  function unshift(arr, fnCb) {
    var op = [new ListInsertOp(segments, 0, value)];
    shareDoc.submitOp(op, fnCb);
    return arr.length;
  }
  return this._arrayApply(segments, unshift, cb);
};

RemoteDoc.prototype.insert = function(segments, index, values, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc insert', this.path(segments), index, values);
  }
  var shareDoc = this.shareDoc;
  function insert(arr, fnCb) {
    var op = createInsertOp(segments, index, values);
    shareDoc.submitOp(op, fnCb);
    return arr.length;
  }
  return this._arrayApply(segments, insert, cb);
};

function createInsertOp(segments, index, values) {
  if (!Array.isArray(values)) {
    return [new ListInsertOp(segments, index, values)];
  }
  var op = [];
  for (var i = 0, len = values.length; i < len; i++) {
    op.push(new ListInsertOp(segments, index++, values[i]));
  }
  return op;
}

RemoteDoc.prototype.pop = function(segments, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc pop', this.path(segments));
  }
  var shareDoc = this.shareDoc;
  function pop(arr, fnCb) {
    var index = arr.length - 1;
    var value = arr[index];
    var op = [new ListRemoveOp(segments, index, value)];
    shareDoc.submitOp(op, fnCb);
    return value;
  }
  return this._arrayApply(segments, pop, cb);
};

RemoteDoc.prototype.shift = function(segments, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc shift', this.path(segments));
  }
  var shareDoc = this.shareDoc;
  function shift(arr, fnCb) {
    var value = arr[0];
    var op = [new ListRemoveOp(segments, 0, value)];
    shareDoc.submitOp(op, fnCb);
    return value;
  }
  return this._arrayApply(segments, shift, cb);
};

RemoteDoc.prototype.remove = function(segments, index, howMany, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc remove', this.path(segments), index, howMany);
  }
  var shareDoc = this.shareDoc;
  function remove(arr, fnCb) {
    var values = arr.slice(index, index + howMany);
    var op = [];
    for (var i = 0, len = values.length; i < len; i++) {
      op.push(new ListRemoveOp(segments, index, values[i]));
    }
    shareDoc.submitOp(op, fnCb);
    return values;
  }
  return this._arrayApply(segments, remove, cb);
};

RemoteDoc.prototype.move = function(segments, from, to, howMany, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc move', this.path(segments), from, to, howMany);
  }
  var shareDoc = this.shareDoc;
  function move(arr, fnCb) {
    // Get the return value
    var values = arr.slice(from, from + howMany);

    // Build an op that moves each item individually
    var op = [];
    for (var i = 0; i < howMany; i++) {
      op.push(new ListMoveOp(segments, (from < to) ? from : from + howMany - 1, (from < to) ? to + howMany - 1 : to));
    }
    shareDoc.submitOp(op, fnCb);

    return values;
  }
  return this._arrayApply(segments, move, cb);
};

RemoteDoc.prototype.stringInsert = function(segments, index, value, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc stringInsert', this.path(segments), index, value);
  }
  var previous = this._createImplied(segments);
  if (previous instanceof ImpliedOp) {
    var lastSegment = segments[segments.length - 1];
    previous.value[lastSegment] = value;
    this.shareDoc.submitOp(previous.op, cb);
    this._updateCollectionData();
    return;
  }
  if (previous == null) {
    var lastSegment = segments[segments.length - 1];
    var op = (util.isArrayIndex(lastSegment)) ?
      [new ListInsertOp(segments.slice(0, -1), lastSegment, value)] :
      [new ObjectInsertOp(segments, value)];
    this.shareDoc.submitOp(op, cb);
    this._updateCollectionData();
    return previous;
  }
  var op = [new StringInsertOp(segments, index, value)];
  this.shareDoc.submitOp(op, cb);
  this._updateCollectionData();
  return previous;
};

RemoteDoc.prototype.stringRemove = function(segments, index, howMany, cb) {
  if (this.debugMutations) {
    console.log('RemoteDoc stringRemove', this.path(segments), index, howMany);
  }
  var previous = this._createImplied(segments);
  if (previous instanceof ImpliedOp) return;
  if (previous == null) return previous;
  var removed = previous.slice(index, index + howMany);
  var op = [new StringRemoveOp(segments, index, removed)];
  this.shareDoc.submitOp(op, cb);
  this._updateCollectionData();
  return previous;
};

RemoteDoc.prototype.get = function(segments) {
  return util.lookup(segments, this.shareDoc.snapshot);
};

RemoteDoc.prototype._createImplied = function(segments) {
  if (!this.shareDoc.type) {
    this.shareDoc.create('json0');
  }
  var parent = this.shareDoc;
  var key = 'snapshot';
  var node = parent[key];
  var i = 0;
  var nextKey = segments[i++];
  var op, value;
  while (nextKey != null) {
    if (!node) {
      if (op) {
        value = value[key] = util.isArrayIndex(nextKey) ? [] : {};
      } else {
        value = util.isArrayIndex(nextKey) ? [] : {};
        op = (Array.isArray(parent)) ?
          new ListInsertOp(segments.slice(0, i - 2), key, value) :
          new ObjectInsertOp(segments.slice(0, i - 1), value);
      }
      node = value;
    }
    parent = node;
    key = nextKey;
    node = parent[key];
    nextKey = segments[i++];
  }
  if (op) return new ImpliedOp(op, value);
  return node;
};

function ImpliedOp(op, value) {
  this.op = op;
  this.value = value;
}

RemoteDoc.prototype._arrayApply = function(segments, fn, cb) {
  var arr = this._createImplied(segments);
  if (arr instanceof ImpliedOp) {
    this.shareDoc.submitOp(arr.op);
    arr = this.get(segments);
  }
  if (arr == null) {
    var lastSegment = segments[segments.length - 1];
    var op = (util.isArrayIndex(lastSegment)) ?
      [new ListInsertOp(segments.slice(0, -1), lastSegment, [])] :
      [new ObjectInsertOp(segments, [])];
    this.shareDoc.submitOp(op);
    arr = this.get(segments);
  }

  if (!Array.isArray(arr)) {
    var message = this._errorMessage(fn.name + ' on non-array', segments, arr);
    var err = new TypeError(message);
    return cb(err);
  }
  var out = fn(arr, cb);
  this._updateCollectionData();
  return out;
};

RemoteDoc.prototype._onOp = function(op) {
  var item = op[0];
  var segments = [this.collectionName, this.id].concat(item.p);
  var model = this.model;

  // ObjectReplaceOp, ObjectInsertOp, or ObjectDeleteOp
  if (defined(item.oi) || defined(item.od)) {
    var value = item.oi;
    var previous = item.od;
    model.emit('change', segments, [value, previous, model._pass]);

  // ListReplaceOp
  } else if (defined(item.li) && defined(item.ld)) {
    var value = item.li;
    var previous = item.ld;
    model.emit('change', segments, [value, previous, model._pass]);

  // ListInsertOp
  } else if (defined(item.li)) {
    var index = segments[segments.length - 1];
    var values = [item.li];
    model.emit('insert', segments.slice(0, -1), [index, values, model._pass]);

  // ListRemoveOp
  } else if (defined(item.ld)) {
    var index = segments[segments.length - 1];
    var removed = [item.ld];
    model.emit('remove', segments.slice(0, -1), [index, removed, model._pass]);

  // ListMoveOp
  } else if (defined(item.lm)) {
    var from = segments[segments.length - 1];
    var to = item.lm;
    var howMany = 1;
    model.emit('move', segments.slice(0, -1), [from, to, howMany, model._pass]);

  // StringInsertOp
  } else if (defined(item.si)) {
    var index = segments[segments.length - 1];
    var text = item.si;
    segments = segments.slice(0, -1);
    var value = model._get(segments);
    var previous = value.slice(0, index) + value.slice(index + text.length);
    var pass = model.pass({$stringInsert: {index: index, text: text}})._pass;
    model.emit('change', segments, [value, previous, pass]);

  // StringRemoveOp
  } else if (defined(item.sd)) {
    var index = segments[segments.length - 1];
    var text = item.sd;
    var howMany = text.length;
    segments = segments.slice(0, -1);
    var value = model._get(segments);
    var previous = value.slice(0, index) + text + value.slice(index);
    var pass = model.pass({$stringRemove: {index: index, howMany: howMany}})._pass;
    model.emit('change', segments, [value, previous, pass]);

  // IncrementOp
  } else if (defined(item.na)) {
    var value = this.get(item.p);
    var previous = value - item.na;
    model.emit('change', segments, [value, previous, model._pass]);
  }
};

function ObjectReplaceOp(segments, before, after) {
  this.p = util.castSegments(segments);
  this.od = before;
  this.oi = (after === void 0) ? null : after;
}
function ObjectInsertOp(segments, value) {
  this.p = util.castSegments(segments);
  this.oi = (value === void 0) ? null : value;
}
function ObjectDeleteOp(segments, value) {
  this.p = util.castSegments(segments);
  this.od = (value === void 0) ? null : value;
}
function ListReplaceOp(segments, index, before, after) {
  this.p = util.castSegments(segments.concat(index));
  this.ld = before;
  this.li = (after === void 0) ? null : after;
}
function ListInsertOp(segments, index, value) {
  this.p = util.castSegments(segments.concat(index));
  this.li = (value === void 0) ? null : value;
}
function ListRemoveOp(segments, index, value) {
  this.p = util.castSegments(segments.concat(index));
  this.ld = (value === void 0) ? null : value;
}
function ListMoveOp(segments, from, to) {
  this.p = util.castSegments(segments.concat(from));
  this.lm = to;
}
function StringInsertOp(segments, index, value) {
  this.p = util.castSegments(segments.concat(index));
  this.si = value;
}
function StringRemoveOp(segments, index, value) {
  this.p = util.castSegments(segments.concat(index));
  this.sd = value;
}
function IncrementOp(segments, byNumber) {
  this.p = util.castSegments(segments);
  this.na = byNumber;
}

function defined(value) {
  return value !== void 0;
}

},{"../util":69,"./Doc":46}],51:[function(require,module,exports){
var Model = require('./Model');
var LocalDoc = require('./LocalDoc');
var util = require('../util');

function CollectionMap() {}
function ModelData() {}
function DocMap() {}
function CollectionData() {}

Model.INITS.push(function(model) {
  model.root.collections = new CollectionMap();
  model.root.data = new ModelData();
});

Model.prototype.getCollection = function(collectionName) {
  return this.root.collections[collectionName];
};
Model.prototype.getDoc = function(collectionName, id) {
  var collection = this.root.collections[collectionName];
  return collection && collection.docs[id];
};
Model.prototype.get = function(subpath) {
  var segments = this._splitPath(subpath);
  return this._get(segments);
};
Model.prototype._get = function(segments) {
  return util.lookup(segments, this.root.data);
};
Model.prototype.getCopy = function(subpath) {
  var segments = this._splitPath(subpath);
  return this._getCopy(segments);
};
Model.prototype._getCopy = function(segments) {
  var value = this._get(segments);
  return util.copy(value);
};
Model.prototype.getDeepCopy = function(subpath) {
  var segments = this._splitPath(subpath);
  return this._getDeepCopy(segments);
};
Model.prototype._getDeepCopy = function(segments) {
  var value = this._get(segments);
  return util.deepCopy(value);
};
Model.prototype.getOrCreateCollection = function(name) {
  var collection = this.root.collections[name];
  if (collection) return collection;
  var Doc = this._getDocConstructor(name);
  collection = new Collection(this.root, name, Doc);
  this.root.collections[name] = collection;
  return collection;
};
Model.prototype._getDocConstructor = function() {
  // Only create local documents. This is overriden in ./connection.js, so that
  // the RemoteDoc behavior can be selectively included
  return LocalDoc;
};

/**
 * Returns an existing document with id in a collection. If the document does
 * not exist, then creates the document with id in a collection and returns the
 * new document.
 * @param {String} collectionName
 * @param {String} id
 * @param {Object} [data] data to create if doc with id does not exist in collection
 */
Model.prototype.getOrCreateDoc = function(collectionName, id, data) {
  var collection = this.getOrCreateCollection(collectionName);
  return collection.docs[id] || collection.add(id, data);
};

/**
 * @param {String} subpath
 */
Model.prototype.destroy = function(subpath) {
  var segments = this._splitPath(subpath);
  // Silently remove all types of listeners within subpath
  var silentModel = this.silent();
  silentModel.removeAllListeners(null, subpath);
  silentModel._removeAllRefs(segments);
  silentModel._stopAll(segments);
  silentModel._removeAllFilters(segments);
  // Silently remove all model data within subpath
  if (segments.length === 0) {
    this.root.collections = new CollectionMap();
    // Delete each property of data instead of creating a new object so that
    // it is possible to continue using a reference to the original data object
    var data = this.root.data;
    for (var key in data) {
      delete data[key];
    }
  } else if (segments.length === 1) {
    var collection = this.getCollection(segments[0]);
    collection && collection.destroy();
  } else {
    silentModel._del(segments);
  }
};

function Collection(model, name, Doc) {
  this.model = model;
  this.name = name;
  this.Doc = Doc;
  this.docs = new DocMap();
  this.data = model.data[name] = new CollectionData();
}

/**
 * Adds a document with `id` and `data` to `this` Collection.
 * @param {String} id
 * @param {Object} data
 * @return {LocalDoc|RemoteDoc} doc
 */
Collection.prototype.add = function(id, data) {
  var doc = new this.Doc(this.model, this.name, id, data);
  this.docs[id] = doc;
  return doc;
};
Collection.prototype.destroy = function() {
  delete this.model.collections[this.name];
  delete this.model.data[this.name];
};

/**
 * Removes the document with `id` from `this` Collection. If there are no more
 * documents in the Collection after the given document is removed, then this
 * also destroys the Collection.
 * @param {String} id
 */
Collection.prototype.remove = function(id) {
  delete this.docs[id];
  delete this.data[id];
  if (noKeys(this.docs)) this.destroy();
};

/**
 * Returns an object that maps doc ids to fully resolved documents.
 * @return {Object}
 */
Collection.prototype.get = function() {
  return this.data;
};

function noKeys(object) {
  for (var key in object) {
    return false;
  }
  return true;
}

},{"../util":69,"./LocalDoc":47,"./Model":48}],52:[function(require,module,exports){
(function (process){
var share = require('share/lib/client');
var Channel = require('../Channel');
var Model = require('./Model');
var LocalDoc = require('./LocalDoc');
var RemoteDoc = require('./RemoteDoc');

Model.prototype.createConnection = function(bundle) {
  // Model::_createSocket should be defined by the socket plugin
  this.root.socket = this._createSocket(bundle);

  // The Share connection will bind to the socket by defining the onopen,
  // onmessage, etc. methods
  var shareConnection = this.root.shareConnection = new share.Connection(this.root.socket);
  var segments = ['$connection', 'state'];
  var states = ['connecting', 'connected', 'disconnected', 'stopped'];
  var model = this;
  states.forEach(function(state) {
    shareConnection.on(state, function() {
      model._setDiff(segments, state);
    });
  });
  this._set(segments, 'connected');

  // Wrap the socket methods on top of Share's methods
  this._createChannel();
};

Model.prototype.connect = function() {
  this.root.socket.open();
};
Model.prototype.disconnect = function() {
  this.root.socket.close();
};
Model.prototype.reconnect = function() {
  this.disconnect();
  this.connect();
};
// Clean delayed disconnect
Model.prototype.close = function(cb) {
  cb = this.wrapCallback(cb);
  var model = this;
  this.whenNothingPending(function() {
    model.root.socket.close();
    cb();
  });
};

Model.prototype._createChannel = function() {
  this.root.channel = new Channel(this.root.socket);
};

Model.prototype._getOrCreateShareDoc = function(collectionName, id, data) {
  var shareDoc = this.root.shareConnection.get(collectionName, id, data);
  shareDoc.incremental = true;
  return shareDoc;
};

Model.prototype._isLocal = function(name) {
  // Whether the collection is local or remote is determined by its name.
  // Collections starting with an underscore ('_') are for user-defined local
  // collections, those starting with a dollar sign ('$'') are for
  // framework-defined local collections, and all others are remote.
  var firstCharcter = name.charAt(0);
  return firstCharcter === '_' || firstCharcter === '$';
};

Model.prototype._getDocConstructor = function(name) {
  return (this._isLocal(name)) ? LocalDoc : RemoteDoc;
};

Model.prototype.hasPending = function() {
  return !!this._firstShareDoc(hasPending);
};

Model.prototype.hasWritePending = function() {
  return !!this._firstShareDoc(hasWritePending);
};

Model.prototype.whenNothingPending = function(cb) {
  var shareDoc = this._firstShareDoc(hasPending);
  if (shareDoc) {
    // If a document is found with a pending operation, wait for it to emit
    // that nothing is pending anymore, and then recheck all documents again.
    // We have to recheck all documents, just in case another mutation has
    // been made in the meantime as a result of an event callback
    var model = this;
    shareDoc.once('nothing pending', function retryNothingPending() {
      process.nextTick(function(){
        model.whenNothingPending(cb);
      });
    });
    return;
  }
  // Call back when no Share documents have pending operations
  process.nextTick(cb);
};

function hasPending(shareDoc) {
  return shareDoc.hasPending();
}
function hasWritePending(shareDoc) {
  return shareDoc.inflightData != null || !!shareDoc.pendingData.length;
}

Model.prototype._firstShareDoc = function(fn) {
  // Loop through all of the documents on the share connection, and return the
  // first document encountered with that matches the provided test function
  var collections = this.root.shareConnection.collections;
  for (var collectionName in collections) {
    var collection = collections[collectionName];
    for (var id in collection) {
      var shareDoc = collection[id];
      if (shareDoc && fn(shareDoc)) {
        return shareDoc;
      }
    }
  }
};

}).call(this,require("g5I+bs"))
},{"../Channel":45,"./LocalDoc":47,"./Model":48,"./RemoteDoc":50,"g5I+bs":33,"share/lib/client":75}],53:[function(require,module,exports){
/**
 * Contexts are useful for keeping track of the origin of subscribes.
 */

var Model = require('./Model');
var Query = require('./Query');

Model.INITS.push(function(model) {
  model.root._contexts = new Contexts();
  model.root.setContext('root');
});

Model.prototype.context = function(id) {
  var model = this._child();
  model.setContext(id);
  return model;
};

Model.prototype.setContext = function(id) {
  this._context = this.getOrCreateContext(id);
};

Model.prototype.getOrCreateContext = function(id) {
  return this.root._contexts[id] ||
    (this.root._contexts[id] = new Context(this, id));
};

Model.prototype.unload = function(id) {
  var context = (id) ? this.root._contexts[id] : this._context;
  context && context.unload();
};

Model.prototype.unloadAll = function() {
  var contexts = this.root._contexts;
  for (var key in contexts) {
    contexts[key].unload();
  }
};

function Contexts() {}

function FetchedDocs() {}
function SubscribedDocs() {}
function FetchedQueries() {}
function SubscribedQueries() {}

function Context(model, id) {
  this.model = model;
  this.id = id;
  this.fetchedDocs = new FetchedDocs();
  this.subscribedDocs = new SubscribedDocs();
  this.fetchedQueries = new FetchedQueries();
  this.subscribedQueries = new SubscribedQueries();
}

Context.prototype.toJSON = function() {
  return {
    fetchedDocs: this.fetchedDocs
  , subscribedDocs: this.subscribedDocs
  };
};

Context.prototype.fetchDoc = function(path, pass) {
  if (pass.$query) return;
  mapIncrement(this.fetchedDocs, path);
};
Context.prototype.subscribeDoc = function(path, pass) {
  if (pass.$query) return;
  mapIncrement(this.subscribedDocs, path);
};
Context.prototype.unfetchDoc = function(path, pass) {
  if (pass.$query) return;
  mapDecrement(this.fetchedDocs, path);
};
Context.prototype.unsubscribeDoc = function(path, pass) {
  if (pass.$query) return;
  mapDecrement(this.subscribedDocs, path);
};
Context.prototype.fetchQuery = function(query) {
  mapIncrement(this.fetchedQueries, query.hash);
};
Context.prototype.subscribeQuery = function(query) {
  mapIncrement(this.subscribedQueries, query.hash);
};
Context.prototype.unfetchQuery = function(query) {
  mapDecrement(this.fetchedQueries, query.hash);
};
Context.prototype.unsubscribeQuery = function(query) {
  mapDecrement(this.subscribedQueries, query.hash);
};
function mapIncrement(map, key) {
  map[key] = (map[key] || 0) + 1;
}
function mapDecrement(map, key) {
  map[key] && map[key]--;
  if (!map[key]) delete map[key];
}

Context.prototype.unload = function() {
  var model = this.model;
  for (var hash in this.fetchedQueries) {
    var query = model.root._queries.map[hash];
    if (!query) continue;
    var count = this.fetchedQueries[hash];
    while (count--) query.unfetch();
  }
  for (var hash in this.subscribedQueries) {
    var query = model.root._queries.map[hash];
    if (!query) continue;
    var count = this.subscribedQueries[hash];
    while (count--) query.unsubscribe();
  }
  for (var path in this.fetchedDocs) {
    var segments = path.split('.');
    var count = this.fetchedDocs[path];
    while (count--) model.unfetchDoc(segments[0], segments[1]);
  }
  for (var path in this.subscribedDocs) {
    var segments = path.split('.');
    var count = this.subscribedDocs[path];
    while (count--) model.unsubscribeDoc(segments[0], segments[1]);
  }
};

},{"./Model":48,"./Query":49}],54:[function(require,module,exports){
var defaultFns = module.exports = new DefaultFns();

defaultFns.reverse = new FnPair(getReverse, setReverse);
defaultFns.asc = asc;
defaultFns.desc = desc;

function DefaultFns() {}
function FnPair(get, set) {
  this.get = get;
  this.set = set;
}

function getReverse(array) {
  return array && array.slice().reverse();
}
function setReverse(values) {
  return {0: getReverse(values)};
}

function asc(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
function desc(a, b) {
  if (a > b) return -1;
  if (a < b) return 1;
  return 0;
}

},{}],55:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter;
var util = require('../util');
var Model = require('./Model');

// This map determines which events get re-emitted as an 'all' event
Model.MUTATOR_EVENTS = {
  change: true
, insert: true
, remove: true
, move: true
, load: true
, unload: true
};

Model.INITS.push(function(model) {
  EventEmitter.call(this);

  // Set max listeners to unlimited
  model.setMaxListeners(0);

  // Used in async methods to emit an error event if a callback is not supplied.
  // This will throw if there is no handler for model.on('error')
  model.root._defaultCallback = defaultCallback;
  function defaultCallback(err) {
    if (typeof err === 'string') err = new Error(err);
    if (err) model.emit('error', err);
  }

  model.root._mutatorEventQueue = null;
  model.root._pass = new Passed({}, {});
  model.root._silent = null;
  model.root._eventContext = null;
});

util.mergeInto(Model.prototype, EventEmitter.prototype);

Model.prototype.wrapCallback = function(cb) {
  if (!cb) return this.root._defaultCallback;
  var model = this;
  return function wrappedCallback() {
    try {
      return cb.apply(this, arguments);
    } catch (err) {
      model.emit('error', err);
    }
  };
};

// EventEmitter.prototype.on, EventEmitter.prototype.addListener, and
// EventEmitter.prototype.once return `this`. The Model equivalents return
// the listener instead, since it is made internally for method subscriptions
// and may need to be passed to removeListener.

Model.prototype._emit = EventEmitter.prototype.emit;
Model.prototype.emit = function(type) {
  if (type === 'error') {
    return this._emit.apply(this, arguments);
  }
  if (Model.MUTATOR_EVENTS[type]) {
    if (this._silent) return this;
    var segments = arguments[1];
    var eventArgs = arguments[2];
    if (this.root._mutatorEventQueue) {
      this.root._mutatorEventQueue.push([type, segments, eventArgs]);
      return this;
    }
    this.root._mutatorEventQueue = [];
    this._emit(type, segments, eventArgs);
    this._emit('all', segments, [type].concat(eventArgs));
    while (this.root._mutatorEventQueue.length) {
      var queued = this.root._mutatorEventQueue.shift();
      type = queued[0];
      segments = queued[1];
      eventArgs = queued[2];
      this._emit(type, segments, eventArgs);
      this._emit('all', segments, [type].concat(eventArgs));
    }
    this.root._mutatorEventQueue = null;
    return this;
  }
  return this._emit.apply(this, arguments);
};

Model.prototype._on = EventEmitter.prototype.on;
Model.prototype.addListener =
Model.prototype.on = function(type, pattern, cb) {
  var listener = eventListener(this, pattern, cb);
  this._on(type, listener);
  return listener;
};

Model.prototype.once = function(type, pattern, cb) {
  var listener = eventListener(this, pattern, cb);
  function g() {
    var matches = listener.apply(null, arguments);
    if (matches) this.removeListener(type, g);
  }
  this._on(type, g);
  return g;
};

Model.prototype._removeAllListeners = EventEmitter.prototype.removeAllListeners;
Model.prototype.removeAllListeners = function(type, subpattern) {
  // If a pattern is specified without an event type, remove all model event
  // listeners under that pattern for all events
  if (!type) {
    for (var key in this._events) {
      this.removeAllListeners(key, subpattern);
    }
    return this;
  }

  var pattern = this.path(subpattern);
  // If no pattern is specified, remove all listeners like normal
  if (!pattern) {
    if (arguments.length === 0) {
      return this._removeAllListeners();
    } else {
      return this._removeAllListeners(type);
    }
  }

  // Remove all listeners for an event under a pattern
  var listeners = this.listeners(type);
  var segments = pattern.split('.');
  // Make sure to iterate in reverse, since the array might be
  // mutated as listeners are removed
  for (var i = listeners.length; i--;) {
    var listener = listeners[i];
    if (patternContained(pattern, segments, listener)) {
      this.removeListener(type, listener);
    }
  }
  return this;
};

function patternContained(pattern, segments, listener) {
  var listenerSegments = listener.patternSegments;
  if (!listenerSegments) return false;
  if (pattern === listener.pattern || pattern === '**') return true;
  var len = segments.length;
  if (len > listenerSegments.length) return false;
  for (var i = 0; i < len; i++) {
    if (segments[i] !== listenerSegments[i]) return false;
  }
  return true;
}

Model.prototype.pass = function(object, invert) {
  var model = this._child();
  model._pass = (invert) ?
    new Passed(object, this._pass) :
    new Passed(this._pass, object);
  return model;
};

function Passed(previous, value) {
  for (var key in previous) {
    this[key] = previous[key];
  }
  for (var key in value) {
    this[key] = value[key];
  }
}

/**
 * The returned Model will or won't trigger event handlers when the model emits
 * events, depending on `value`
 * @param {Boolean|Null} value defaults to true
 * @return {Model}
 */
Model.prototype.silent = function(value) {
  var model = this._child();
  model._silent = (value == null) ? true : value;
  return model;
};

Model.prototype.eventContext = function(value) {
  var model = this._child();
  model._eventContext = value;
  return model;
};

Model.prototype.removeContextListeners = function(value) {
  if (arguments.length === 0) {
    value = this._eventContext;
  }
  // Remove all events created within a given context
  for (var type in this._events) {
    var listeners = this.listeners(type);
    // Make sure to iterate in reverse, since the array might be
    // mutated as listeners are removed
    for (var i = listeners.length; i--;) {
      var listener = listeners[i];
      if (listener.eventContext === value) {
        this.removeListener(type, listener);
      }
    }
  }
  return this;
};

function eventListener(model, subpattern, cb) {
  if (cb) {
    // For signatures:
    // model.on('change', 'example.subpath', callback)
    // model.at('example').on('change', 'subpath', callback)
    var pattern = model.path(subpattern);
    return modelEventListener(pattern, cb, model._eventContext);
  }
  var path = model.path();
  cb = arguments[1];
  // For signature:
  // model.at('example').on('change', callback)
  if (path) return modelEventListener(path, cb, model._eventContext);
  // For signature:
  // model.on('normalEvent', callback)
  return cb;
}

function modelEventListener(pattern, cb, eventContext) {
  var patternSegments = util.castSegments(pattern.split('.'));
  var testFn = testPatternFn(pattern, patternSegments);

  function modelListener(segments, eventArgs) {
    var captures = testFn(segments);
    if (!captures) return;

    var args = (captures.length) ? captures.concat(eventArgs) : eventArgs;
    cb.apply(null, args);
    return true;
  }

  // Used in Model#removeAllListeners
  modelListener.pattern = pattern;
  modelListener.patternSegments = patternSegments;
  modelListener.eventContext = eventContext;

  return modelListener;
}

function testPatternFn(pattern, patternSegments) {
  if (pattern === '**') {
    return function testPattern(segments) {
      return [segments.join('.')];
    };
  }

  var endingRest = stripRestWildcard(patternSegments);

  return function testPattern(segments) {
    // Any pattern with more segments does not match
    var patternLen = patternSegments.length;
    if (patternLen > segments.length) return;

    // A pattern with the same number of segments matches if each
    // of the segments are wildcards or equal. A shorter pattern matches
    // if it ends in a rest wildcard and each of the corresponding
    // segments are wildcards or equal.
    if (patternLen === segments.length || endingRest) {
      var captures = [];
      for (var i = 0; i < patternLen; i++) {
        var patternSegment = patternSegments[i];
        var segment = segments[i];
        if (patternSegment === '*' || patternSegment === '**') {
          captures.push(segment);
          continue;
        }
        if (patternSegment !== segment) return;
      }
      if (endingRest) {
        var remainder = segments.slice(i).join('.');
        captures.push(remainder);
      }
      return captures;
    }
  };
}

function stripRestWildcard(segments) {
  // ['example', '**'] -> ['example']; return true
  var lastIndex = segments.length - 1;
  if (segments[lastIndex] === '**') {
    segments.pop();
    return true;
  }
  // ['example', 'subpath**'] -> ['example', 'subpath']; return true
  var match = /^([^\*]+)\*\*$/.exec(segments[lastIndex]);
  if (!match) return false;
  segments[lastIndex] = match[1];
  return true;
}

},{"../util":69,"./Model":48,"events":22}],56:[function(require,module,exports){
var util = require('../util');
var Model = require('./Model');
var defaultFns = require('./defaultFns');

Model.INITS.push(function(model) {
  model.root._filters = new Filters(model);
  model.on('all', filterListener);
  function filterListener(segments, eventArgs) {
    var pass = eventArgs[eventArgs.length - 1];
    var map = model.root._filters.fromMap;
    for (var path in map) {
      var filter = map[path];
      if (pass.$filter === filter) continue;
      if (
        util.mayImpact(filter.segments, segments) ||
        (filter.inputsSegments && util.mayImpactAny(filter.inputsSegments, segments))
      ) {
        filter.update(pass);
      }
    }
  }
});

function parseFilterArguments(model, args) {
  var fn = args.pop();
  var options;
  if (!model.isPath(args[args.length - 1])) {
    options = args.pop();
  }
  var path = model.path(args.shift());
  var i = args.length;
  while (i--) {
    args[i] = model.path(args[i]);
  }
  return {
    path: path,
    inputPaths: (args.length) ? args : null,
    options: options,
    fn: fn
  };
}

Model.prototype.filter = function() {
  var args = Array.prototype.slice.call(arguments);
  var parsed = parseFilterArguments(this, args);
  return this.root._filters.add(
    parsed.path,
    parsed.fn,
    null,
    parsed.inputPaths,
    parsed.options
  );
};

Model.prototype.sort = function() {
  var args = Array.prototype.slice.call(arguments);
  var parsed = parseFilterArguments(this, args);
  return this.root._filters.add(
    parsed.path,
    null,
    parsed.fn || 'asc',
    parsed.inputPaths,
    parsed.options
  );
};

Model.prototype.removeAllFilters = function(subpath) {
  var segments = this._splitPath(subpath);
  this._removeAllFilters(segments);
};
Model.prototype._removeAllFilters = function(segments) {
  var filters = this.root._filters.fromMap;
  for (var from in filters) {
    if (util.contains(segments, filters[from].fromSegments)) {
      filters[from].destroy();
    }
  }
};

function FromMap() {}
function Filters(model) {
  this.model = model;
  this.fromMap = new FromMap();
}

Filters.prototype.add = function(path, filterFn, sortFn, inputPaths, options) {
  return new Filter(this, path, filterFn, sortFn, inputPaths, options);
};

Filters.prototype.toJSON = function() {
  var out = [];
  for (var from in this.fromMap) {
    var filter = this.fromMap[from];
    // Don't try to bundle if functions were passed directly instead of by name
    if (!filter.bundle) continue;
    var args = [from, filter.path, filter.filterName, filter.sortName, filter.inputPaths];
    if (filter.options) args.push(filter.options);
    out.push(args);
  }
  return out;
};

function Filter(filters, path, filterFn, sortFn, inputPaths, options) {
  this.filters = filters;
  this.model = filters.model.pass({$filter: this});
  this.path = path;
  this.segments = path.split('.');
  this.filterName = null;
  this.sortName = null;
  this.bundle = true;
  this.filterFn = null;
  this.sortFn = null;
  this.inputPaths = inputPaths;
  this.inputsSegments = null;
  if (inputPaths) {
    this.inputsSegments = [];
    for (var i = 0; i < this.inputPaths.length; i++) {
      var segments = this.inputPaths[i].split('.');
      this.inputsSegments.push(segments);
    }
  }
  this.options = options;
  this.skip = options && options.skip;
  this.limit = options && options.limit;
  if (filterFn) this.filter(filterFn);
  if (sortFn) this.sort(sortFn);
  this.idsSegments = null;
  this.from = null;
  this.fromSegments = null;
}

Filter.prototype.filter = function(fn) {
  if (typeof fn === 'function') {
    this.filterFn = fn;
    this.bundle = false;
    return this;
  } else if (typeof fn === 'string') {
    this.filterName = fn;
    this.filterFn = this.model.root._namedFns[fn] || defaultFns[fn];
    if (!this.filterFn) {
      throw new TypeError('Filter function not found: ' + fn);
    }
  }
  return this;
};

Filter.prototype.sort = function(fn) {
  if (!fn) fn = 'asc';
  if (typeof fn === 'function') {
    this.sortFn = fn;
    this.bundle = false;
    return this;
  } else if (typeof fn === 'string') {
    this.sortName = fn;
    this.sortFn = this.model.root._namedFns[fn] || defaultFns[fn];
    if (!this.sortFn) {
      throw new TypeError('Sort function not found: ' + fn);
    }
  }
  return this;
};

Filter.prototype._slice = function(results) {
  if (this.skip == null && this.limit == null) return results;
  var begin = this.skip || 0;
  // A limit of zero is equivalent to setting no limit
  var end;
  if (this.limit) end = begin + this.limit;
  return results.slice(begin, end);
};

Filter.prototype.getInputs = function() {
  if (!this.inputsSegments) return;
  var inputs = [];
  for (var i = 0, len = this.inputsSegments.length; i < len; i++) {
    var input = this.model._get(this.inputsSegments[i]);
    inputs.push(input);
  }
  return inputs;
};

Filter.prototype.callFilter = function(items, key, inputs) {
  var item = items[key];
  return (inputs) ?
    this.filterFn.apply(this.model, [item, key, items].concat(inputs)) :
    this.filterFn.call(this.model, item, key, items);
};

Filter.prototype.ids = function() {
  var items = this.model._get(this.segments);
  var ids = [];
  if (!items) return ids;
  if (Array.isArray(items)) {
    throw new Error('model.filter is not currently supported on arrays');
  }
  if (this.filterFn) {
    var inputs = this.getInputs();
    for (var key in items) {
      if (items.hasOwnProperty(key) && this.callFilter(items, key, inputs)) {
        ids.push(key);
      }
    }
  } else {
    ids = Object.keys(items);
  }
  var sortFn = this.sortFn;
  if (sortFn) {
    ids.sort(function(a, b) {
      return sortFn(items[a], items[b]);
    });
  }
  return this._slice(ids);
};

Filter.prototype.get = function() {
  var items = this.model._get(this.segments);
  var results = [];
  if (Array.isArray(items)) {
    throw new Error('model.filter is not currently supported on arrays');
  }
  if (this.filterFn) {
    var inputs = this.getInputs();
    for (var key in items) {
      if (items.hasOwnProperty(key) && this.callFilter(items, key, inputs)) {
        results.push(items[key]);
      }
    }
  } else {
    for (var key in items) {
      if (items.hasOwnProperty(key)) {
        results.push(items[key]);
      }
    }
  }
  if (this.sortFn) results.sort(this.sortFn);
  return this._slice(results);
};

Filter.prototype.update = function(pass) {
  var ids = this.ids();
  this.model.pass(pass, true)._setArrayDiff(this.idsSegments, ids);
};

Filter.prototype.ref = function(from) {
  from = this.model.path(from);
  this.from = from;
  this.fromSegments = from.split('.');
  this.filters.fromMap[from] = this;
  this.idsSegments = ['$filters', from.replace(/\./g, '|')];
  this.update();
  return this.model.refList(from, this.path, this.idsSegments.join('.'));
};

Filter.prototype.destroy = function() {
  delete this.filters.fromMap[this.from];
  this.model._removeRef(this.idsSegments);
  this.model._del(this.idsSegments);
};

},{"../util":69,"./Model":48,"./defaultFns":54}],57:[function(require,module,exports){
var util = require('../util');
var Model = require('./Model');
var defaultFns = require('./defaultFns');

function NamedFns() {}

Model.INITS.push(function(model) {
  model.root._namedFns = new NamedFns();
  model.root._fns = new Fns(model);
  model.on('all', fnListener);
  function fnListener(segments, eventArgs) {
    var pass = eventArgs[eventArgs.length - 1];
    var map = model.root._fns.fromMap;
    for (var path in map) {
      var fn = map[path];
      if (pass.$fn === fn) continue;
      if (util.mayImpactAny(fn.inputsSegments, segments)) {
        // Mutation affecting input path
        fn.onInput(pass);
      } else if (util.mayImpact(fn.fromSegments, segments)) {
        // Mutation affecting output path
        fn.onOutput(pass);
      }
    }
  }
});

Model.prototype.fn = function(name, fns) {
  this.root._namedFns[name] = fns;
};

function parseStartArguments(model, args, hasPath) {
  var last = args.pop();
  var fns, name;
  if (typeof last === 'string') {
    name = last;
  } else {
    fns = last;
  }
  var path;
  if (hasPath) {
    path = model.path(args.shift());
  }
  var options;
  if (!model.isPath(args[args.length - 1])) {
    options = args.pop();
  }
  var i = args.length;
  while (i--) {
    args[i] = model.path(args[i]);
  }
  return {
    name: name
  , path: path
  , inputPaths: args
  , fns: fns
  , options: options
  };
}

Model.prototype.evaluate = function() {
  var args = Array.prototype.slice.call(arguments);
  var parsed = parseStartArguments(this, args, false);
  return this.root._fns.get(parsed.name, parsed.inputPaths, parsed.fns, parsed.options);
};

Model.prototype.start = function() {
  var args = Array.prototype.slice.call(arguments);
  var parsed = parseStartArguments(this, args, true);
  return this.root._fns.start(parsed.name, parsed.path, parsed.inputPaths, parsed.fns, parsed.options);
};

Model.prototype.stop = function(subpath) {
  var path = this.path(subpath);
  this._stop(path);
};
Model.prototype._stop = function(fromPath) {
  this.root._fns.stop(fromPath);
};

Model.prototype.stopAll = function(subpath) {
  var segments = this._splitPath(subpath);
  this._stopAll(segments);
};
Model.prototype._stopAll = function(segments) {
  var fns = this.root._fns.fromMap;
  for (var from in fns) {
    var fromSegments = fns[from].fromSegments;
    if (util.contains(segments, fromSegments)) {
      this._stop(from);
    }
  }
};

function FromMap() {}
function Fns(model) {
  this.model = model;
  this.nameMap = model.root._namedFns;
  this.fromMap = new FromMap();
}

Fns.prototype.get = function(name, inputPaths, fns, options) {
  fns || (fns = this.nameMap[name] || defaultFns[name]);
  var fn = new Fn(this.model, name, null, inputPaths, fns, options);
  return fn.get();
};

Fns.prototype.start = function(name, path, inputPaths, fns, options) {
  fns || (fns = this.nameMap[name] || defaultFns[name]);
  var fn = new Fn(this.model, name, path, inputPaths, fns, options);
  this.fromMap[path] = fn;
  return fn.onInput();
};

Fns.prototype.stop = function(path) {
  var fn = this.fromMap[path];
  delete this.fromMap[path];
  return fn;
};

Fns.prototype.toJSON = function() {
  var out = [];
  for (var from in this.fromMap) {
    var fn = this.fromMap[from];
    // Don't try to bundle non-named functions that were started via
    // model.start directly instead of by name
    if (!fn.name) continue;
    var args = [fn.from].concat(fn.inputPaths);
    if (fn.options) args.push(fn.options);
    args.push(fn.name);
    out.push(args);
  }
  return out;
};

function Fn(model, name, from, inputPaths, fns, options) {
  this.model = model.pass({$fn: this});
  this.name = name;
  this.from = from;
  this.inputPaths = inputPaths;
  this.options = options;
  if (!fns) {
    throw new TypeError('Model function not found: ' + name);
  }
  this.getFn = fns.get || fns;
  this.setFn = fns.set;
  this.fromSegments = from && from.split('.');
  this.inputsSegments = [];
  for (var i = 0; i < this.inputPaths.length; i++) {
    var segments = this.inputPaths[i].split('.');
    this.inputsSegments.push(segments);
  }

  // Copy can be 'output', 'input', 'both', or 'none'
  var copy = (options && options.copy) || 'output';
  this.copyInput = (copy === 'input' || copy === 'both');
  this.copyOutput = (copy === 'output' || copy === 'both');

  // Mode can be 'diffDeep', 'diff', 'arrayDeep', or 'array'
  this.mode = (options && options.mode) || 'diffDeep';
}

Fn.prototype.apply = function(fn, inputs) {
  for (var i = 0, len = this.inputsSegments.length; i < len; i++) {
    var input = this.model._get(this.inputsSegments[i]);
    inputs.push(this.copyInput ? util.deepCopy(input) : input);
  }
  return fn.apply(this.model, inputs);
};

Fn.prototype.get = function() {
  return this.apply(this.getFn, []);
};

Fn.prototype.set = function(value, pass) {
  if (!this.setFn) return;
  var out = this.apply(this.setFn, [value]);
  if (!out) return;
  var inputsSegments = this.inputsSegments;
  var model = this.model.pass(pass, true);
  for (var key in out) {
    var value = (this.copyOutput) ? util.deepCopy(out[key]) : out[key];
    this._setValue(model, inputsSegments[key], value);
  }
};

Fn.prototype.onInput = function(pass) {
  var value = (this.copyOutput) ? util.deepCopy(this.get()) : this.get();
  this._setValue(this.model.pass(pass, true), this.fromSegments, value);
  return value;
};

Fn.prototype.onOutput = function(pass) {
  var value = this.model._get(this.fromSegments);
  return this.set(value, pass);
};

Fn.prototype._setValue = function(model, segments, value) {
  if (this.mode === 'diffDeep') {
    model._setDiffDeep(segments, value);
  } else if (this.mode === 'arrayDeep') {
    model._setArrayDiffDeep(segments, value);
  } else if (this.mode === 'array') {
    model._setArrayDiff(segments, value);
  } else {
    model._setDiff(segments, value);
  }
};

},{"../util":69,"./Model":48,"./defaultFns":54}],58:[function(require,module,exports){
module.exports = require('./Model');
var util = require('../util');

// Extend model on both server and client //
require('./unbundle');
require('./events');
require('./paths');
require('./collections');
require('./mutators');
require('./setDiff');

require('./connection');
require('./subscriptions');
require('./Query');
require('./contexts');

require('./fn');
require('./filter');
require('./refList');
require('./ref');

// Extend model for server //
util.serverRequire(module, './bundle');
util.serverRequire(module, './connection.server');

},{"../util":69,"./Model":48,"./Query":49,"./collections":51,"./connection":52,"./contexts":53,"./events":55,"./filter":56,"./fn":57,"./mutators":59,"./paths":60,"./ref":61,"./refList":62,"./setDiff":63,"./subscriptions":64,"./unbundle":65}],59:[function(require,module,exports){
var util = require('../util');
var Model = require('./Model');

Model.prototype._mutate = function(segments, fn, cb) {
  cb = this.wrapCallback(cb);
  var collectionName = segments[0];
  var id = segments[1];
  if (!collectionName || !id) {
    var message = fn.name + ' must be performed under a collection ' +
      'and document id. Invalid path: ' + segments.join('.');
    return cb(new Error(message));
  }
  var doc = this.getOrCreateDoc(collectionName, id);
  var docSegments = segments.slice(2);
  return fn(doc, docSegments, cb);
};

Model.prototype.set = function() {
  var subpath, value, cb;
  if (arguments.length === 1) {
    value = arguments[0];
  } else if (arguments.length === 2) {
    subpath = arguments[0];
    value = arguments[1];
  } else {
    subpath = arguments[0];
    value = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._set(segments, value, cb);
};
Model.prototype._set = function(segments, value, cb) {
  segments = this._dereference(segments);
  var model = this;
  function set(doc, docSegments, fnCb) {
    var previous = doc.set(docSegments, value, fnCb);
    // On setting the entire doc, remote docs sometimes do a copy to add the
    // id without it being stored in the database by ShareJS
    if (docSegments.length === 0) value = doc.get(docSegments);
    model.emit('change', segments, [value, previous, model._pass]);
    return previous;
  }
  return this._mutate(segments, set, cb);
};

Model.prototype.setEach = function() {
  var subpath, object, cb;
  if (arguments.length === 1) {
    object = arguments[0];
  } else if (arguments.length === 2) {
    subpath = arguments[0];
    object = arguments[1];
  } else {
    subpath = arguments[0];
    object = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._setEach(segments, object, cb);
};
Model.prototype._setEach = function(segments, object, cb) {
  segments = this._dereference(segments);
  var group = util.asyncGroup(this.wrapCallback(cb));
  for (var key in object) {
    var value = object[key];
    this._set(segments.concat(key), value, group());
  }
};

Model.prototype.add = function() {
  var subpath, value, cb;
  if (arguments.length === 1) {
    value = arguments[0];
  } else if (arguments.length === 2) {
    if (typeof arguments[1] === 'function') {
      value = arguments[0];
      cb = arguments[1];
    } else {
      subpath = arguments[0];
      value = arguments[1];
    }
  } else {
    subpath = arguments[0];
    value = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._add(segments, value, cb);
};
Model.prototype._add = function(segments, value, cb) {
  if (typeof value !== 'object') {
    var message = 'add requires an object value. Invalid value: ' + value;
    cb = this.wrapCallback(cb);
    return cb(new Error(message));
  }
  var id = value.id || this.id();
  value.id = id;
  this._set(segments.concat(id), value, cb);
  return id;
};

Model.prototype.setNull = function() {
  var subpath, value, cb;
  if (arguments.length === 1) {
    value = arguments[0];
  } else if (arguments.length === 2) {
    subpath = arguments[0];
    value = arguments[1];
  } else {
    subpath = arguments[0];
    value = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._setNull(segments, value, cb);
};
Model.prototype._setNull = function(segments, value, cb) {
  segments = this._dereference(segments);
  var model = this;
  function setNull(doc, docSegments, fnCb) {
    var previous = doc.get(docSegments);
    if (previous != null) {
      fnCb();
      return previous;
    }
    doc.set(docSegments, value, fnCb);
    model.emit('change', segments, [value, previous, model._pass]);
    return value;
  }
  return this._mutate(segments, setNull, cb);
};

Model.prototype.del = function() {
  var subpath, cb;
  if (arguments.length === 1) {
    if (typeof arguments[0] === 'function') {
      cb = arguments[0];
    } else {
      subpath = arguments[0];
    }
  } else {
    subpath = arguments[0];
    cb = arguments[1];
  }
  var segments = this._splitPath(subpath);
  return this._del(segments, cb);
};
Model.prototype._del = function(segments, cb) {
  segments = this._dereference(segments);
  var model = this;
  function del(doc, docSegments, fnCb) {
    var previous = doc.del(docSegments, fnCb);
    // When deleting an entire document, also remove the reference to the
    // document object from its collection
    if (segments.length === 2) {
      var collectionName = segments[0];
      var id = segments[1];
      model.root.collections[collectionName].remove(id);
    }
    model.emit('change', segments, [void 0, previous, model._pass]);
    return previous;
  }
  return this._mutate(segments, del, cb);
};

Model.prototype.increment = function() {
  var subpath, byNumber, cb;
  if (arguments.length === 1) {
    if (typeof arguments[0] === 'function') {
      cb = arguments[0];
    } else if (typeof arguments[0] === 'number') {
      byNumber = arguments[0];
    } else {
      subpath = arguments[0];
    }
  } else if (arguments.length === 2) {
    if (typeof arguments[1] === 'function') {
      cb = arguments[1];
      if (typeof arguments[0] === 'number') {
        byNumber = arguments[0];
      } else {
        subpath = arguments[0];
      }
    } else {
      subpath = arguments[0];
      byNumber = arguments[1];
    }
  } else {
    subpath = arguments[0];
    byNumber = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._increment(segments, byNumber, cb);
};
Model.prototype._increment = function(segments, byNumber, cb) {
  segments = this._dereference(segments);
  if (byNumber == null) byNumber = 1;
  var model = this;
  function increment(doc, docSegments, fnCb) {
    var value = doc.increment(docSegments, byNumber, fnCb);
    var previous = value - byNumber;
    model.emit('change', segments, [value, previous, model._pass]);
    return value;
  }
  return this._mutate(segments, increment, cb);
};

Model.prototype.push = function() {
  var subpath, value, cb;
  if (arguments.length === 1) {
    value = arguments[0];
  } else if (arguments.length === 2) {
    subpath = arguments[0];
    value = arguments[1];
  } else {
    subpath = arguments[0];
    value = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._push(segments, value, cb);
};
Model.prototype._push = function(segments, value, cb) {
  var forArrayMutator = true;
  segments = this._dereference(segments, forArrayMutator);
  var model = this;
  function push(doc, docSegments, fnCb) {
    var length = doc.push(docSegments, value, fnCb);
    model.emit('insert', segments, [length - 1, [value], model._pass]);
    return length;
  }
  return this._mutate(segments, push, cb);
};

Model.prototype.unshift = function() {
  var subpath, value, cb;
  if (arguments.length === 1) {
    value = arguments[0];
  } else if (arguments.length === 2) {
    subpath = arguments[0];
    value = arguments[1];
  } else {
    subpath = arguments[0];
    value = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._unshift(segments, value, cb);
};
Model.prototype._unshift = function(segments, value, cb) {
  var forArrayMutator = true;
  segments = this._dereference(segments, forArrayMutator);
  var model = this;
  function unshift(doc, docSegments, fnCb) {
    var length = doc.unshift(docSegments, value, fnCb);
    model.emit('insert', segments, [0, [value], model._pass]);
    return length;
  }
  return this._mutate(segments, unshift, cb);
};

Model.prototype.insert = function() {
  var subpath, index, values, cb;
  if (arguments.length === 1) {
    throw new Error('Not enough arguments for insert');
  } else if (arguments.length === 2) {
    index = arguments[0];
    values = arguments[1];
  } else if (arguments.length === 3) {
    subpath = arguments[0];
    index = arguments[1];
    values = arguments[2];
  } else {
    subpath = arguments[0];
    index = arguments[1];
    values = arguments[2];
    cb = arguments[3];
  }
  var segments = this._splitPath(subpath);
  return this._insert(segments, +index, values, cb);
};
Model.prototype._insert = function(segments, index, values, cb) {
  var forArrayMutator = true;
  segments = this._dereference(segments, forArrayMutator);
  var model = this;
  function insert(doc, docSegments, fnCb) {
    var inserted = (Array.isArray(values)) ? values : [values];
    var length = doc.insert(docSegments, index, inserted, fnCb);
    model.emit('insert', segments, [index, inserted, model._pass]);
    return length;
  }
  return this._mutate(segments, insert, cb);
};

Model.prototype.pop = function() {
  var subpath, cb;
  if (arguments.length === 1) {
    if (typeof arguments[0] === 'function') {
      cb = arguments[0];
    } else {
      subpath = arguments[0];
    }
  } else {
    subpath = arguments[0];
    cb = arguments[1];
  }
  var segments = this._splitPath(subpath);
  return this._pop(segments, cb);
};
Model.prototype._pop = function(segments, cb) {
  var forArrayMutator = true;
  segments = this._dereference(segments, forArrayMutator);
  var model = this;
  function pop(doc, docSegments, fnCb) {
    var arr = doc.get(docSegments);
    var length = arr && arr.length;
    if (!length) {
      fnCb();
      return;
    }
    var value = doc.pop(docSegments, fnCb);
    model.emit('remove', segments, [length - 1, [value], model._pass]);
    return value;
  }
  return this._mutate(segments, pop, cb);
};

Model.prototype.shift = function() {
  var subpath, cb;
  if (arguments.length === 1) {
    if (typeof arguments[0] === 'function') {
      cb = arguments[0];
    } else {
      subpath = arguments[0];
    }
  } else {
    subpath = arguments[0];
    cb = arguments[1];
  }
  var segments = this._splitPath(subpath);
  return this._shift(segments, cb);
};
Model.prototype._shift = function(segments, cb) {
  var forArrayMutator = true;
  segments = this._dereference(segments, forArrayMutator);
  var model = this;
  function shift(doc, docSegments, fnCb) {
    var arr = doc.get(docSegments);
    var length = arr && arr.length;
    if (!length) {
      fnCb();
      return;
    }
    var value = doc.shift(docSegments, fnCb);
    model.emit('remove', segments, [0, [value], model._pass]);
    return value;
  }
  return this._mutate(segments, shift, cb);
};

Model.prototype.remove = function() {
  var subpath, index, howMany, cb;
  if (arguments.length === 1) {
    index = arguments[0];
  } else if (arguments.length === 2) {
    if (typeof arguments[1] === 'function') {
      cb = arguments[1];
      if (typeof arguments[0] === 'number') {
        index = arguments[0];
      } else {
        subpath = arguments[0];
      }
    } else {
      if (typeof arguments[0] === 'number') {
        index = arguments[0];
        howMany = arguments[1];
      } else {
        subpath = arguments[0];
        index = arguments[1];
      }
    }
  } else if (arguments.length === 3) {
    if (typeof arguments[2] === 'function') {
      cb = arguments[2];
      if (typeof arguments[0] === 'number') {
        index = arguments[0];
        howMany = arguments[1];
      } else {
        subpath = arguments[0];
        index = arguments[1];
      }
    } else {
      subpath = arguments[0];
      index = arguments[1];
      howMany = arguments[2];
    }
  } else {
    subpath = arguments[0];
    index = arguments[1];
    howMany = arguments[2];
    cb = arguments[3];
  }
  var segments = this._splitPath(subpath);
  if (index == null) index = segments.pop();
  return this._remove(segments, +index, howMany, cb);
};
Model.prototype._remove = function(segments, index, howMany, cb) {
  var forArrayMutator = true;
  segments = this._dereference(segments, forArrayMutator);
  if (howMany == null) howMany = 1;
  var model = this;
  function remove(doc, docSegments, fnCb) {
    var removed = doc.remove(docSegments, index, howMany, fnCb);
    model.emit('remove', segments, [index, removed, model._pass]);
    return removed;
  }
  return this._mutate(segments, remove, cb);
};

Model.prototype.move = function() {
  var subpath, from, to, howMany, cb;
  if (arguments.length === 1) {
    throw new Error('Not enough arguments for move');
  } else if (arguments.length === 2) {
    from = arguments[0];
    to = arguments[1];
  } else if (arguments.length === 3) {
    if (typeof arguments[2] === 'function') {
      from = arguments[0];
      to = arguments[1];
      cb = arguments[2];
    } else if (typeof arguments[0] === 'number') {
      from = arguments[0];
      to = arguments[1];
      howMany = arguments[2];
    } else {
      subpath = arguments[0];
      from = arguments[1];
      to = arguments[2];
    }
  } else if (arguments.length === 4) {
    if (typeof arguments[3] === 'function') {
      cb = arguments[3];
      if (typeof arguments[0] === 'number') {
        from = arguments[0];
        to = arguments[1];
        howMany = arguments[2];
      } else {
        subpath = arguments[0];
        from = arguments[1];
        to = arguments[2];
      }
    } else {
      subpath = arguments[0];
      from = arguments[1];
      to = arguments[2];
      howMany = arguments[3];
    }
  } else {
    subpath = arguments[0];
    from = arguments[1];
    to = arguments[2];
    howMany = arguments[3];
    cb = arguments[4];
  }
  var segments = this._splitPath(subpath);
  return this._move(segments, from, to, howMany, cb);
};
Model.prototype._move = function(segments, from, to, howMany, cb) {
  var forArrayMutator = true;
  segments = this._dereference(segments, forArrayMutator);
  if (howMany == null) howMany = 1;
  var model = this;
  function move(doc, docSegments, fnCb) {
    // Cast to numbers
    from = +from;
    to = +to;
    // Convert negative indices into positive
    if (from < 0 || to < 0) {
      var len = doc.get(docSegments).length;
      if (from < 0) from += len;
      if (to < 0) to += len;
    }
    var moved = doc.move(docSegments, from, to, howMany, fnCb);
    model.emit('move', segments, [from, to, moved.length, model._pass]);
    return moved;
  }
  return this._mutate(segments, move, cb);
};

Model.prototype.stringInsert = function() {
  var subpath, index, text, cb;
  if (arguments.length === 1) {
    throw new Error('Not enough arguments for stringInsert');
  } else if (arguments.length === 2) {
    index = arguments[0];
    text = arguments[1];
  } else if (arguments.length === 3) {
    if (typeof arguments[2] === 'function') {
      index = arguments[0];
      text = arguments[1];
      cb = arguments[2];
    } else {
      subpath = arguments[0];
      index = arguments[1];
      text = arguments[2];
    }
  } else {
    subpath = arguments[0];
    index = arguments[1];
    text = arguments[2];
    cb = arguments[3];
  }
  var segments = this._splitPath(subpath);
  return this._stringInsert(segments, index, text, cb);
};
Model.prototype._stringInsert = function(segments, index, text, cb) {
  segments = this._dereference(segments);
  var model = this;
  function stringInsert(doc, docSegments, fnCb) {
    var previous = doc.stringInsert(docSegments, index, text, fnCb);
    var value = doc.get(docSegments);
    var pass = model.pass({$stringInsert: {index: index, text: text}})._pass;
    model.emit('change', segments, [value, previous, pass]);
    return;
  }
  return this._mutate(segments, stringInsert, cb);
};

Model.prototype.stringRemove = function() {
  var subpath, index, howMany, cb;
  if (arguments.length === 1) {
    throw new Error('Not enough arguments for stringRemove');
  } else if (arguments.length === 2) {
    index = arguments[0];
    howMany = arguments[1];
  } else if (arguments.length === 3) {
    if (typeof arguments[2] === 'function') {
      index = arguments[0];
      howMany = arguments[1];
      cb = arguments[2];
    } else {
      subpath = arguments[0];
      index = arguments[1];
      howMany = arguments[2];
    }
  } else {
    subpath = arguments[0];
    index = arguments[1];
    howMany = arguments[2];
    cb = arguments[3];
  }
  var segments = this._splitPath(subpath);
  return this._stringRemove(segments, index, howMany, cb);
};
Model.prototype._stringRemove = function(segments, index, howMany, cb) {
  segments = this._dereference(segments);
  var model = this;
  function stringRemove(doc, docSegments, fnCb) {
    var previous = doc.stringRemove(docSegments, index, howMany, fnCb);
    var value = doc.get(docSegments);
    var pass = model.pass({$stringRemove: {index: index, howMany: howMany}})._pass;
    model.emit('change', segments, [value, previous, pass]);
    return;
  }
  return this._mutate(segments, stringRemove, cb);
};

},{"../util":69,"./Model":48}],60:[function(require,module,exports){
var Model = require('./Model');

exports.mixin = {};

Model.prototype._splitPath = function(subpath) {
  var path = this.path(subpath);
  return (path && path.split('.')) || [];
};

/**
 * Returns the path equivalent to the path of the current scoped model plus
 * (optionally) a suffix subpath
 *
 * @optional @param {String} subpath
 * @return {String} absolute path
 * @api public
 */
Model.prototype.path = function(subpath) {
  if (subpath == null || subpath === '') return (this._at) ? this._at : '';
  if (typeof subpath === 'string' || typeof subpath === 'number') {
    return (this._at) ? this._at + '.' + subpath : '' + subpath;
  }
  if (typeof subpath.path === 'function') return subpath.path();
};

Model.prototype.isPath = function(subpath) {
  return this.path(subpath) != null;
};

Model.prototype.scope = function(path) {
  var model = this._child();
  model._at = path;
  return model;
};

/**
 * Create a model object scoped to a particular path.
 * Example:
 *     var user = model.at('users.1');
 *     user.set('username', 'brian');
 *     user.on('push', 'todos', function(todo) {
 *       // ...
 *     });
 *
 *  @param {String} segment
 *  @return {Model} a scoped model
 *  @api public
 */
Model.prototype.at = function(subpath) {
  var path = this.path(subpath);
  return this.scope(path);
};

/**
 * Returns a model scope that is a number of levels above the current scoped
 * path. Number of levels defaults to 1, so this method called without
 * arguments returns the model scope's parent model scope.
 *
 * @optional @param {Number} levels
 * @return {Model} a scoped model
 */
Model.prototype.parent = function(levels) {
  if (levels == null) levels = 1;
  var segments = this._splitPath();
  var len = Math.max(0, segments.length - levels);
  var path = segments.slice(0, len).join('.');
  return this.scope(path);
};

/**
 * Returns the last property segment of the current model scope path
 *
 * @optional @param {String} path
 * @return {String}
 */
Model.prototype.leaf = function(path) {
  if (!path) path = this.path();
  var i = path.lastIndexOf('.');
  return path.slice(i + 1);
};

},{"./Model":48}],61:[function(require,module,exports){
var util = require('../util');
var Model = require('./Model');

Model.INITS.push(function(model) {
  var root = model.root;
  root._refs = new Refs(root);
  addIndexListeners(root);
  addListener(root, 'change', refChange);
  addListener(root, 'load', refLoad);
  addListener(root, 'unload', refUnload);
  addListener(root, 'insert', refInsert);
  addListener(root, 'remove', refRemove);
  addListener(root, 'move', refMove);
});

function addIndexListeners(model) {
  model.on('insert', function refInsertIndex(segments, eventArgs) {
    var index = eventArgs[0];
    var howMany = eventArgs[1].length;
    function patchInsert(refIndex) {
      return (index <= refIndex) ? refIndex + howMany : refIndex;
    }
    onIndexChange(segments, patchInsert);
  });
  model.on('remove', function refRemoveIndex(segments, eventArgs) {
    var index = eventArgs[0];
    var howMany = eventArgs[1].length;
    function patchRemove(refIndex) {
      return (index <= refIndex) ? refIndex - howMany : refIndex;
    }
    onIndexChange(segments, patchRemove);
  });
  model.on('move', function refMoveIndex(segments, eventArgs) {
    var from = eventArgs[0];
    var to = eventArgs[1];
    var howMany = eventArgs[2];
    function patchMove(refIndex) {
      // If the index was moved itself
      if (from <= refIndex && refIndex < from + howMany) {
        return refIndex + to - from;
      }
      // Remove part of a move
      if (from <= refIndex) refIndex -= howMany;
      // Insert part of a move
      if (to <= refIndex) refIndex += howMany;
      return refIndex;
    }
    onIndexChange(segments, patchMove);
  });
  function onIndexChange(segments, patch) {
    var fromMap = model._refs.fromMap;
    for (var from in fromMap) {
      var ref = fromMap[from];
      if (!(ref.updateIndices &&
        util.contains(segments, ref.toSegments) &&
        ref.toSegments.length > segments.length)) continue;
      var index = +ref.toSegments[segments.length];
      var patched = patch(index);
      if (index === patched) continue;
      model._refs.remove(from);
      ref.toSegments[segments.length] = '' + patched;
      ref.to = ref.toSegments.join('.');
      model._refs._add(ref);
    }
  }
}

function refChange(model, dereferenced, eventArgs, segments) {
  var value = eventArgs[0];
  // Detect if we are deleting vs. setting to undefined
  if (value === void 0) {
    var parentSegments = segments.slice();
    var last = parentSegments.pop();
    var parent = model._get(parentSegments);
    if (!parent || !(last in parent)) {
      model._del(dereferenced);
      return;
    }
  }
  model._set(dereferenced, value);
}
function refLoad(model, dereferenced, eventArgs) {
  var value = eventArgs[0];
  model._set(dereferenced, value);
}
function refUnload(model, dereferenced, eventArgs) {
  model._del(dereferenced);
}
function refInsert(model, dereferenced, eventArgs) {
  var index = eventArgs[0];
  var values = eventArgs[1];
  model._insert(dereferenced, index, values);
}
function refRemove(model, dereferenced, eventArgs) {
  var index = eventArgs[0];
  var howMany = eventArgs[1].length;
  model._remove(dereferenced, index, howMany);
}
function refMove(model, dereferenced, eventArgs) {
  var from = eventArgs[0];
  var to = eventArgs[1];
  var howMany = eventArgs[2];
  model._move(dereferenced, from, to, howMany);
}

function addListener(model, type, fn) {
  model.on(type, refListener);
  function refListener(segments, eventArgs) {
    var pass = eventArgs[eventArgs.length - 1];
    // Find cases where an event is emitted on a path where a reference
    // is pointing. All original mutations happen on the fully dereferenced
    // location, so this detection only needs to happen in one direction
    var toMap = model._refs.toMap;
    var subpath;
    for (var i = 0, len = segments.length; i < len; i++) {
      subpath = (subpath) ? subpath + '.' + segments[i] : segments[i];
      // If a ref is found pointing to a matching subpath, re-emit on the
      // place where the reference is coming from as if the mutation also
      // occured at that path
      var refs = toMap[subpath];
      if (!refs) continue;
      var remaining = segments.slice(i + 1);
      for (var refIndex = 0, numRefs = refs.length; refIndex < numRefs; refIndex++) {
        var ref = refs[refIndex];
        var dereferenced = ref.fromSegments.concat(remaining);
        // The value may already be up to date via object reference. If so,
        // simply re-emit the event. Otherwise, perform the same mutation on
        // the ref's path
        if (model._get(dereferenced) === model._get(segments)) {
          model.emit(type, dereferenced, eventArgs);
        } else {
          var setterModel = ref.model.pass(pass, true);
          setterModel._dereference = noopDereference;
          fn(setterModel, dereferenced, eventArgs, segments);
        }
      }
    }
    // If a ref points to a child of a matching subpath, get the value in
    // case it has changed and set if different
    var parentToMap = model._refs.parentToMap;
    var refs = parentToMap[subpath];
    if (!refs) return;
    for (var refIndex = 0, numRefs = refs.length; refIndex < numRefs; refIndex++) {
      var ref = refs[refIndex];
      var value = model._get(ref.toSegments);
      var previous = model._get(ref.fromSegments);
      if (previous !== value) {
        var setterModel = ref.model.pass(pass, true);
        setterModel._dereference = noopDereference;
        setterModel._set(ref.fromSegments, value);
      }
    }
  }
}

Model.prototype._canRefTo = function(value) {
  return this.isPath(value) || (value && typeof value.ref === 'function');
};

Model.prototype.ref = function() {
  var from, to, options;
  if (arguments.length === 1) {
    to = arguments[0];
  } else if (arguments.length === 2) {
    if (this._canRefTo(arguments[1])) {
      from = arguments[0];
      to = arguments[1];
    } else {
      to = arguments[0];
      options = arguments[1];
    }
  } else {
    from = arguments[0];
    to = arguments[1];
    options = arguments[2];
  }
  var fromPath = this.path(from);
  var toPath = this.path(to);
  // Make ref to reffable object, such as query or filter
  if (!toPath) return to.ref(fromPath);
  var fromSegments = fromPath.split('.');
  if (fromSegments.length < 2) {
    throw new Error('ref must be performed under a collection ' +
      'and document id. Invalid path: ' + fromPath);
  }
  this.root._refs.remove(fromPath);
  var value = this.get(to);
  this._set(fromSegments, value);
  this.root._refs.add(fromPath, toPath, options);
  return this.scope(fromPath);
};

Model.prototype.removeRef = function(subpath) {
  var segments = this._splitPath(subpath);
  var fromPath = segments.join('.');
  this._removeRef(segments, fromPath);
};
Model.prototype._removeRef = function(segments, fromPath) {
  this.root._refs.remove(fromPath);
  this.root._refLists.remove(fromPath);
  this._del(segments);
};

Model.prototype.removeAllRefs = function(subpath) {
  var segments = this._splitPath(subpath);
  this._removeAllRefs(segments);
};
Model.prototype._removeAllRefs = function(segments) {
  this._removeMapRefs(segments, this.root._refs.fromMap);
  this._removeMapRefs(segments, this.root._refLists.fromMap);
};
Model.prototype._removeMapRefs = function(segments, map) {
  for (var from in map) {
    var fromSegments = map[from].fromSegments;
    if (util.contains(segments, fromSegments)) {
      this._removeRef(fromSegments, from);
    }
  }
};

Model.prototype.dereference = function(subpath) {
  var segments = this._splitPath(subpath);
  return this._dereference(segments).join('.');
};

Model.prototype._dereference = function(segments, forArrayMutator, ignore) {
  if (segments.length === 0) return segments;
  var refs = this.root._refs.fromMap;
  var refLists = this.root._refLists.fromMap;
  var doAgain;
  do {
    var subpath = '';
    doAgain = false;
    for (var i = 0, len = segments.length; i < len; i++) {
      subpath = (subpath) ? subpath + '.' + segments[i] : segments[i];

      var ref = refs[subpath];
      if (ref) {
        var remaining = segments.slice(i + 1);
        segments = ref.toSegments.concat(remaining);
        doAgain = true;
        break;
      }

      var refList = refLists[subpath];
      if (refList && refList !== ignore) {
        var belowDescendant = i + 2 < len;
        var belowChild = i + 1 < len;
        if (!(belowDescendant || forArrayMutator && belowChild)) continue;
        segments = refList.dereference(segments, i);
        doAgain = true;
        break;
      }
    }
  } while (doAgain);
  // If a dereference fails, return a path that will result in a null value
  // instead of a path to everything in the model
  if (segments.length === 0) return ['$null'];
  return segments;
};

function noopDereference(segments) {
  return segments;
}

function Ref(model, from, to, options) {
  this.model = model && model.pass({$ref: this});
  this.from = from;
  this.to = to;
  this.fromSegments = from.split('.');
  this.toSegments = to.split('.');
  this.parentTos = [];
  for (var i = 1, len = this.toSegments.length; i < len; i++) {
    var parentTo = this.toSegments.slice(0, i).join('.');
    this.parentTos.push(parentTo);
  }
  this.updateIndices = options && options.updateIndices;
}
function FromMap() {}
function ToMap() {}

function Refs(model) {
  this.model = model;
  this.fromMap = new FromMap();
  this.toMap = new ToMap();
  this.parentToMap = new ToMap();
}

Refs.prototype.add = function(from, to, options) {
  var ref = new Ref(this.model, from, to, options);
  return this._add(ref);
};

Refs.prototype._add = function(ref) {
  this.fromMap[ref.from] = ref;
  listMapAdd(this.toMap, ref.to, ref);
  for (var i = 0, len = ref.parentTos.length; i < len; i++) {
    listMapAdd(this.parentToMap, ref.parentTos[i], ref);
  }
  return ref;
};

Refs.prototype.remove = function(from) {
  var ref = this.fromMap[from];
  if (!ref) return;
  delete this.fromMap[from];
  listMapRemove(this.toMap, ref.to, ref);
  for (var i = 0, len = ref.parentTos.length; i < len; i++) {
    listMapRemove(this.parentToMap, ref.parentTos[i], ref);
  }
  return ref;
};

Refs.prototype.toJSON = function() {
  var out = [];
  for (var from in this.fromMap) {
    var ref = this.fromMap[from];
    out.push([ref.from, ref.to]);
  }
  return out;
};

function listMapAdd(map, name, item) {
  map[name] || (map[name] = []);
  map[name].push(item);
}

function listMapRemove(map, name, item) {
  var items = map[name];
  if (!items) return;
  var index = items.indexOf(item);
  if (index === -1) return;
  items.splice(index, 1);
  if (!items.length) delete map[name];
}

},{"../util":69,"./Model":48}],62:[function(require,module,exports){
var util = require('../util');
var Model = require('./Model');

Model.INITS.push(function(model) {
  var root = model.root;
  root._refLists = new RefLists(root);
  for (var type in Model.MUTATOR_EVENTS) {
    addListener(root, type);
  }
});

function addListener(model, type) {
  model.on(type, refListListener);
  function refListListener(segments, eventArgs) {
    var pass = eventArgs[eventArgs.length - 1];
    // Check for updates on or underneath paths
    var fromMap = model._refLists.fromMap;
    for (var from in fromMap) {
      var refList = fromMap[from];
      if (pass.$refList === refList) continue;
      refList.onMutation(type, segments, eventArgs);
    }
  }
}

/**
 * @param {String} type
 * @param {Array} segments
 * @param {Array} eventArgs
 * @param {RefList} refList
 */
function patchFromEvent(type, segments, eventArgs, refList) {
  var fromLength = refList.fromSegments.length;
  var segmentsLength = segments.length;
  var pass = eventArgs[eventArgs.length - 1];
  var model = refList.model.pass(pass, true);

  // Mutation on the `from` output itself
  if (segmentsLength === fromLength) {
    if (type === 'insert') {
      var index = eventArgs[0];
      var values = eventArgs[1];
      var ids = setNewToValues(model, refList, values);
      model._insert(refList.idsSegments, index, ids);
      return;
    }

    if (type === 'remove') {
      var index = eventArgs[0];
      var howMany = eventArgs[1].length;
      var ids = model._remove(refList.idsSegments, index, howMany);
      // Delete the appropriate items underneath `to` if the `deleteRemoved`
      // option was set true
      if (refList.deleteRemoved) {
        for (var i = 0; i < ids.length; i++) {
          var item = refList.itemById(ids[i]);
          model._del(refList.toSegmentsByItem(item));
        }
      }
      return;
    }

    if (type === 'move') {
      var from = eventArgs[0];
      var to = eventArgs[1];
      var howMany = eventArgs[2];
      model._move(refList.idsSegments, from, to, howMany);
      return;
    }

    // Change of the entire output
    var values = (type === 'change') ?
      eventArgs[0] : model._get(refList.fromSegments);
    // Set ids to empty list if output is set to null
    if (!values) {
      model._set(refList.idsSegments, []);
      return;
    }
    // If the entire output is set, create a list of ids based on the output,
    // and update the corresponding items
    var ids = setNewToValues(model, refList, values);
    model._set(refList.idsSegments, ids);
    return;
  }

  // If mutation is on a parent of `from`, we might need to re-create the
  // entire refList output
  if (segmentsLength < fromLength) {
    model._setArrayDiff(refList.fromSegments, refList.get());
    return;
  }

  var index = segments[fromLength];
  var value = model._get(refList.fromSegments.concat(index));
  var toSegments = refList.toSegmentsByItem(value);

  // Mutation underneath a child of the `from` object.
  if (segmentsLength > fromLength + 1) {
    throw new Error('Mutation on descendant of refList `from`' +
      ' should have been dereferenced: ' + segments.join('.'));
  }

  // Otherwise, mutation of a child of the `from` object

  // If changing the item itself, it will also have to be re-set on the
  // original object
  if (type === 'change') {
    model._set(toSegments, value);
    updateIdForValue(model, refList, index, value);
    return;
  }
  if (type === 'insert' || type === 'remove' || type === 'move') {
    throw new Error('Array mutation on child of refList `from`' +
      'should have been dereferenced: ' + segments.join('.'));
  }
}

/**
 * @private
 * @param {Model} model
 * @param {RefList} refList
 * @param {Array} values
 */
function setNewToValues(model, refList, values, fn) {
  var ids = [];
  for (var i = 0; i < values.length; i++) {
    var value = values[i];
    var id = refList.idByItem(value);
    if (id === void 0 && typeof value === 'object') {
      id = value.id = model.id();
    }
    var toSegments = refList.toSegmentsByItem(value);
    if (id === void 0 || toSegments === void 0) {
      throw new Error('Unable to add item to refList: ' + value);
    }
    if (model._get(toSegments) !== value) {
      model._set(toSegments, value);
    }
    ids.push(id);
  }
  return ids;
}
function updateIdForValue(model, refList, index, value) {
  var id = refList.idByItem(value);
  var outSegments = refList.idsSegments.concat(index);
  model._set(outSegments, id);
}

function patchToEvent(type, segments, eventArgs, refList) {
  var toLength = refList.toSegments.length;
  var segmentsLength = segments.length;
  var pass = eventArgs[eventArgs.length - 1];
  var model = refList.model.pass(pass, true);

  // Mutation on the `to` object itself
  if (segmentsLength === toLength) {
    if (type === 'insert') {
      var insertIndex = eventArgs[0];
      var values = eventArgs[1];
      for (var i = 0; i < values.length; i++) {
        var value = values[i];
        var indices = refList.indicesByItem(value);
        if (!indices) continue;
        for (var j = 0; j < indices.length; j++) {
          var outSegments = refList.fromSegments.concat(indices[j]);
          model._set(outSegments, value);
        }
      }
      return;
    }

    if (type === 'remove') {
      var removeIndex = eventArgs[0];
      var values = eventArgs[1];
      var howMany = values.length;
      for (var i = removeIndex, len = removeIndex + howMany; i < len; i++) {
        var indices = refList.indicesByItem(values[i]);
        if (!indices) continue;
        for (var j = 0, indicesLen = indices.length; j < indicesLen; j++) {
          var outSegments = refList.fromSegments.concat(indices[j]);
          model._set(outSegments, void 0);
        }
      }
      return;
    }

    if (type === 'move') {
      // Moving items in the `to` object should have no effect on the output
      return;
    }
  }

  // Mutation on or above the `to` object
  if (segmentsLength <= toLength) {
    // If the entire `to` object is updated, we need to re-create the
    // entire refList output and apply what is different
    model._setArrayDiff(refList.fromSegments, refList.get());
    return;
  }

  // Mutation underneath a child of the `to` object. The item will already
  // be up to date, since it is under an object reference. Just re-emit
  if (segmentsLength > toLength + 1) {
    var value = model._get(segments.slice(0, toLength + 1));
    var indices = refList.indicesByItem(value);
    if (!indices) return;
    var remaining = segments.slice(toLength + 1);
    for (var i = 0; i < indices.length; i++) {
      var index = indices[i];
      var dereferenced = refList.fromSegments.concat(index, remaining);
      dereferenced = model._dereference(dereferenced, null, refList);
      eventArgs = eventArgs.slice();
      eventArgs[eventArgs.length - 1] = model._pass;
      model.emit(type, dereferenced, eventArgs);
    }
    return;
  }

  // Otherwise, mutation of a child of the `to` object

  // If changing the item itself, it will also have to be re-set on the
  // array created by the refList
  if (type === 'change' || type === 'load' || type === 'unload') {
    var value, previous;
    if (type === 'change') {
      value = eventArgs[0];
      previous = eventArgs[1];
    } else if (type === 'load') {
      value = eventArgs[0];
      previous = void 0;
    } else if (type === 'unload') {
      value = void 0;
      previous = eventArgs[0];
    }
    var newIndices = refList.indicesByItem(value);
    var oldIndices = refList.indicesByItem(previous);
    if (!newIndices && !oldIndices) return;
    if (oldIndices && !equivalentArrays(oldIndices, newIndices)) {
      // The changed item used to refer to some indices, but no longer does
      for (var i = 0; i < oldIndices.length; i++) {
        var outSegments = refList.fromSegments.concat(oldIndices[i]);
        model._set(outSegments, void 0);
      }
    }
    if (newIndices) {
      for (var i = 0; i < newIndices.length; i++) {
        var outSegments = refList.fromSegments.concat(newIndices[i]);
        model._set(outSegments, value);
      }
    }
    return;
  }

  var value = model._get(segments.slice(0, toLength + 1));
  var indices = refList.indicesByItem(value);
  if (!indices) return;

  if (type === 'insert' || type === 'remove' || type === 'move') {
    // Array mutations will have already been updated via an object
    // reference, so only re-emit
    for (var i = 0; i < indices.length; i++) {
      var dereferenced = refList.fromSegments.concat(indices[i]);
      dereferenced = model._dereference(dereferenced, null, refList);
      eventArgs = eventArgs.slice();
      eventArgs[eventArgs.length - 1] = model._pass;
      model.emit(type, dereferenced, eventArgs);
    }
  }
}
function equivalentArrays(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function patchIdsEvent(type, segments, eventArgs, refList) {
  var idsLength = refList.idsSegments.length;
  var segmentsLength = segments.length;
  var pass = eventArgs[eventArgs.length - 1];
  var model = refList.model.pass(pass, true);

  // An array mutation of the ids should be mirrored with a like change in
  // the output array
  if (segmentsLength === idsLength) {
    if (type === 'insert') {
      var index = eventArgs[0];
      var inserted = eventArgs[1];
      var values = [];
      for (var i = 0; i < inserted.length; i++) {
        var value = refList.itemById(inserted[i]);
        values.push(value);
      }
      model._insert(refList.fromSegments, index, values);
      return;
    }

    if (type === 'remove') {
      var index = eventArgs[0];
      var howMany = eventArgs[1].length;
      model._remove(refList.fromSegments, index, howMany);
      return;
    }

    if (type === 'move') {
      var from = eventArgs[0];
      var to = eventArgs[1];
      var howMany = eventArgs[2];
      model._move(refList.fromSegments, from, to, howMany);
      return;
    }
  }

  // Mutation on the `ids` list itself
  if (segmentsLength <= idsLength) {
    // If the entire `ids` array is updated, we need to re-create the
    // entire refList output and apply what is different
    model._setArrayDiff(refList.fromSegments, refList.get());
    return;
  }

  // Otherwise, direct mutation of a child in the `ids` object or mutation
  // underneath an item in the `ids` list. Update the item for the appropriate
  // id if it has changed
  var index = segments[idsLength];
  var id = refList.idByIndex(index);
  var item = refList.itemById(id);
  var itemSegments = refList.fromSegments.concat(index);
  if (model._get(itemSegments) !== item) {
    model._set(itemSegments, item);
  }
}

Model.prototype.refList = function() {
  var from, to, ids, options;
  if (arguments.length === 2) {
    to = arguments[0];
    ids = arguments[1];
  } else if (arguments.length === 3) {
    if (this.isPath(arguments[2])) {
      from = arguments[0];
      to = arguments[1];
      ids = arguments[2];
    } else {
      to = arguments[0];
      ids = arguments[1];
      options = arguments[2];
    }
  } else {
    from = arguments[0];
    to = arguments[1];
    ids = arguments[2];
    options = arguments[3];
  }
  var fromPath = this.path(from);
  var toPath;
  if (Array.isArray(to)) {
    toPath = [];
    for (var i = 0; i < to.length; i++) {
      toPath.push(this.path(to[i]));
    }
  } else {
    toPath = this.path(to);
  }
  var idsPath = this.path(ids);
  var refList = this.root._refLists.add(fromPath, toPath, idsPath, options);
  this.pass({$refList: refList})._setArrayDiff(refList.fromSegments, refList.get());
  return this.scope(fromPath);
};

function RefList(model, from, to, ids, options) {
  this.model = model && model.pass({$refList: this});
  this.from = from;
  this.to = to;
  this.ids = ids;
  this.fromSegments = from && from.split('.');
  this.toSegments = to && to.split('.');
  this.idsSegments = ids && ids.split('.');
  this.options = options;
  this.deleteRemoved = options && options.deleteRemoved;
}

// The default implementation assumes that the ids array is a flat list of
// keys on the to object. Ideally, this mapping could be customized via
// inheriting from RefList and overriding these methods without having to
// modify the above event handling code.
//
// In the default refList implementation, `key` and `id` are equal.
//
// Terms in the below methods:
//   `item`  - Object on the `to` path, which gets mirrored on the `from` path
//   `key`   - The property under `to` at which an item is located
//   `id`    - String or object in the array at the `ids` path
//   `index` - The index of an id, which corresponds to an index on `from`
RefList.prototype.get = function() {
  var ids = this.model._get(this.idsSegments);
  if (!ids) return [];
  var items = this.model._get(this.toSegments);
  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var key = ids[i];
    out.push(items && items[key]);
  }
  return out;
};
RefList.prototype.dereference = function(segments, i) {
  var remaining = segments.slice(i + 1);
  var key = this.idByIndex(remaining[0]);
  if (key == null) return [];
  remaining[0] = key;
  return this.toSegments.concat(remaining);
};
RefList.prototype.toSegmentsByItem = function(item) {
  var key = this.idByItem(item);
  if (key === void 0) return;
  return this.toSegments.concat(key);
};
RefList.prototype.idByItem = function(item) {
  if (item && item.id) return item.id;
  var items = this.model._get(this.toSegments);
  for (var key in items) {
    if (item === items[key]) return key;
  }
};
RefList.prototype.indicesByItem = function(item) {
  var id = this.idByItem(item);
  var ids = this.model._get(this.idsSegments);
  if (!ids) return;
  var indices;
  var index = -1;
  while (true) {
    index = ids.indexOf(id, index + 1);
    if (index === -1) break;
    if (indices) {
      indices.push(index);
    } else {
      indices = [index];
    }
  }
  return indices;
};
RefList.prototype.itemById = function(id) {
  return this.model._get(this.toSegments.concat(id));
};
RefList.prototype.idByIndex = function(index) {
  return this.model._get(this.idsSegments.concat(index));
};
RefList.prototype.onMutation = function(type, segments, eventArgs) {
  if (util.mayImpact(this.toSegments, segments)) {
    patchToEvent(type, segments, eventArgs, this);
  } else if (util.mayImpact(this.idsSegments, segments)) {
    patchIdsEvent(type, segments, eventArgs, this);
  } else if (util.mayImpact(this.fromSegments, segments)) {
    patchFromEvent(type, segments, eventArgs, this);
  }
};

function FromMap() {}

function RefLists(model) {
  this.model = model;
  this.fromMap = new FromMap();
}

RefLists.prototype.add = function(from, to, ids, options) {
  var refList = new RefList(this.model, from, to, ids, options);
  this.fromMap[from] = refList;
  return refList;
};

RefLists.prototype.remove = function(from) {
  var refList = this.fromMap[from];
  delete this.fromMap[from];
  return refList;
};

RefLists.prototype.toJSON = function() {
  var out = [];
  for (var from in this.fromMap) {
    var refList = this.fromMap[from];
    out.push([refList.from, refList.to, refList.ids, refList.options]);
  }
  return out;
};

},{"../util":69,"./Model":48}],63:[function(require,module,exports){
var util = require('../util');
var Model = require('./Model');
var arrayDiff = require('arraydiff');

Model.prototype.setDiff = function() {
  var subpath, value, cb;
  if (arguments.length === 1) {
    value = arguments[0];
  } else if (arguments.length === 2) {
    subpath = arguments[0];
    value = arguments[1];
  } else {
    subpath = arguments[0];
    value = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._setDiff(segments, value, cb);
};
Model.prototype._setDiff = function(segments, value, cb) {
  segments = this._dereference(segments);
  var model = this;
  function setDiff(doc, docSegments, fnCb) {
    var previous = doc.get(docSegments);
    if (util.equal(previous, value)) {
      fnCb();
      return previous;
    }
    doc.set(docSegments, value, fnCb);
    model.emit('change', segments, [value, previous, model._pass]);
    return previous;
  }
  return this._mutate(segments, setDiff, cb);
};

Model.prototype.setDiffDeep = function() {
  var subpath, value, cb;
  if (arguments.length === 1) {
    value = arguments[0];
  } else if (arguments.length === 2) {
    subpath = arguments[0];
    value = arguments[1];
  } else {
    subpath = arguments[0];
    value = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._setDiffDeep(segments, value, cb);
};
Model.prototype._setDiffDeep = function(segments, value, cb) {
  var before = this._get(segments);
  cb = this.wrapCallback(cb);
  var group = util.asyncGroup(cb);
  var finished = group();
  diffDeep(this, segments, before, value, group);
  finished();
};
function diffDeep(model, segments, before, after, group) {
  if (typeof before !== 'object' || !before ||
      typeof after !== 'object' || !after) {
    // Set the entire value if not diffable
    model._set(segments, after, group());
    return;
  }
  if (Array.isArray(before) && Array.isArray(after)) {
    var diff = arrayDiff(before, after, util.deepEqual);
    if (!diff.length) return;
    // If the only change is a single item replacement, diff the item instead
    if (
      diff.length === 2 &&
      diff[0].index === diff[1].index &&
      diff[0] instanceof arrayDiff.RemoveDiff &&
      diff[0].howMany === 1 &&
      diff[1] instanceof arrayDiff.InsertDiff &&
      diff[1].values.length === 1
    ) {
      var index = diff[0].index;
      var itemSegments = segments.concat(index);
      diffDeep(model, itemSegments, before[index], after[index], group);
      return;
    }
    model._applyArrayDiff(segments, diff, group());
    return;
  }

  // Delete keys that were in before but not after
  for (var key in before) {
    if (key in after) continue;
    var itemSegments = segments.concat(key);
    model._del(itemSegments, group());
  }

  // Diff each property in after
  for (var key in after) {
    if (util.deepEqual(before[key], after[key])) continue;
    var itemSegments = segments.concat(key);
    diffDeep(model, itemSegments, before[key], after[key], group);
  }
}

Model.prototype.setArrayDiff = function() {
  var subpath, value, cb;
  if (arguments.length === 1) {
    value = arguments[0];
  } else if (arguments.length === 2) {
    subpath = arguments[0];
    value = arguments[1];
  } else {
    subpath = arguments[0];
    value = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._setArrayDiff(segments, value, cb);
};
Model.prototype.setArrayDiffDeep = function() {
  var subpath, value, cb;
  if (arguments.length === 1) {
    value = arguments[0];
  } else if (arguments.length === 2) {
    subpath = arguments[0];
    value = arguments[1];
  } else {
    subpath = arguments[0];
    value = arguments[1];
    cb = arguments[2];
  }
  var segments = this._splitPath(subpath);
  return this._setArrayDiffDeep(segments, value, cb);
};
Model.prototype._setArrayDiffDeep = function(segments, value, cb) {
  return this._setArrayDiff(segments, value, cb, util.deepEqual);
};
Model.prototype._setArrayDiff = function(segments, value, cb, _equalFn) {
  var before = this._get(segments);
  if (before === value) return this.wrapCallback(cb)();
  if (!Array.isArray(before) || !Array.isArray(value)) {
    this._set(segments, value, cb);
    return;
  }
  var diff = arrayDiff(before, value, _equalFn);
  this._applyArrayDiff(segments, diff, cb);
};
Model.prototype._applyArrayDiff = function(segments, diff, cb) {
  if (!diff.length) return this.wrapCallback(cb)();
  segments = this._dereference(segments);
  var model = this;
  function applyArrayDiff(doc, docSegments, fnCb) {
    var group = util.asyncGroup(fnCb);
    for (var i = 0, len = diff.length; i < len; i++) {
      var item = diff[i];
      if (item instanceof arrayDiff.InsertDiff) {
        // Insert
        doc.insert(docSegments, item.index, item.values, group());
        model.emit('insert', segments, [item.index, item.values, model._pass]);
      } else if (item instanceof arrayDiff.RemoveDiff) {
        // Remove
        var removed = doc.remove(docSegments, item.index, item.howMany, group());
        model.emit('remove', segments, [item.index, removed, model._pass]);
      } else if (item instanceof arrayDiff.MoveDiff) {
        // Move
        var moved = doc.move(docSegments, item.from, item.to, item.howMany, group());
        model.emit('move', segments, [item.from, item.to, moved.length, model._pass]);
      }
    }
  }
  return this._mutate(segments, applyArrayDiff, cb);
};

},{"../util":69,"./Model":48,"arraydiff":2}],64:[function(require,module,exports){
(function (process){
var util = require('../util');
var Model = require('./Model');
var Query = require('./Query');

Model.INITS.push(function(model, options) {
  model.root.fetchOnly = options.fetchOnly;
  model.root.unloadDelay = options.unloadDelay || (util.isServer) ? 0 : 1000;

  // Keeps track of the count of fetches (that haven't been undone by an
  // unfetch) per doc. Maps doc id to the fetch count.
  model.root._fetchedDocs = new FetchedDocs();

  // Keeps track of the count of subscribes (that haven't been undone by an
  // unsubscribe) per doc. Maps doc id to the subscribe count.
  model.root._subscribedDocs = new SubscribedDocs();

  // Maps doc path to doc version
  model.root._loadVersions = new LoadVersions();
});

function FetchedDocs() {}
function SubscribedDocs() {}
function LoadVersions() {}

Model.prototype.fetch = function() {
  this._forSubscribable(arguments, 'fetch');
  return this;
};
Model.prototype.unfetch = function() {
  this._forSubscribable(arguments, 'unfetch');
  return this;
};
Model.prototype.subscribe = function() {
  this._forSubscribable(arguments, 'subscribe');
  return this;
};
Model.prototype.unsubscribe = function() {
  this._forSubscribable(arguments, 'unsubscribe');
  return this;
};

Model.prototype._forSubscribable = function(argumentsObject, method) {
  var args, cb;
  if (!argumentsObject.length) {
    // Use this model's scope if no arguments
    args = [null];
  } else if (typeof argumentsObject[0] === 'function') {
    // Use this model's scope if the first argument is a callback
    args = [null];
    cb = argumentsObject[0];
  } else if (Array.isArray(argumentsObject[0])) {
    // Items can be passed in as an array
    args = argumentsObject[0];
    cb = argumentsObject[1];
  } else {
    // Or as multiple arguments
    args = Array.prototype.slice.call(argumentsObject);
    var last = args[args.length - 1];
    if (typeof last === 'function') cb = args.pop();
  }

  var group = util.asyncGroup(this.wrapCallback(cb));
  var finished = group();
  var docMethod = method + 'Doc';

  for (var i = 0; i < args.length; i++) {
    var item = args[i];
    if (item instanceof Query) {
      item[method](group());
    } else {
      var segments = this._dereference(this._splitPath(item));
      if (segments.length === 2) {
        // Do the appropriate method for a single document.
        this[docMethod](segments[0], segments[1], group());
      } else if (segments.length === 1) {
        // Make a query to an entire collection.
        var query = this.query(segments[0], {});
        query[method](group());
      } else if (segments.length === 0) {
        group()(new Error('No path specified for ' + method));
      } else {
        group()(new Error('Cannot ' + method + ' to a path within a document: ' +
          segments.join('.')));
      }
    }
  }
  process.nextTick(finished);
};

/**
 * @param {String}
 * @param {String} id
 * @param {Function} cb(err)
 * @param {Boolean} alreadyLoaded
 */
Model.prototype.fetchDoc = function(collectionName, id, cb, alreadyLoaded) {
  cb = this.wrapCallback(cb);

  // Maintain a count of fetches so that we can unload the document when
  // there are no remaining fetches or subscribes for that document
  var path = collectionName + '.' + id;
  this._context.fetchDoc(path, this._pass);
  this.root._fetchedDocs[path] = (this.root._fetchedDocs[path] || 0) + 1;

  var model = this;
  var doc = this.getOrCreateDoc(collectionName, id);
  if (alreadyLoaded) {
    fetchDocCallback();
  } else {
    doc.shareDoc.fetch(fetchDocCallback);
  }
  function fetchDocCallback(err) {
    if (err) return cb(err);
    if (doc.shareDoc.version !== model.root._loadVersions[path]) {
      model.root._loadVersions[path] = doc.shareDoc.version;
      doc._updateCollectionData();
      model.emit('load', [collectionName, id], [doc.get(), model._pass]);
    }
    cb();
  }
};

/**
 * @param {String} collectionName
 * @param {String} id of the document we want to subscribe to
 * @param {Function} cb(err)
 */
Model.prototype.subscribeDoc = function(collectionName, id, cb) {
  cb = this.wrapCallback(cb);

  var path = collectionName + '.' + id;
  this._context.subscribeDoc(path, this._pass);
  var count = this.root._subscribedDocs[path] = (this.root._subscribedDocs[path] || 0) + 1;
  // Already requested a subscribe, so just return
  if (count > 1) return cb();

  // Subscribe if currently unsubscribed
  var model = this;
  var doc = this.getOrCreateDoc(collectionName, id);
  if (this.root.fetchOnly) {
    // Only fetch if the document isn't already loaded
    if (doc.get() === void 0) {
      doc.shareDoc.fetch(subscribeDocCallback);
    } else {
      subscribeDocCallback();
    }
  } else {
    doc.shareDoc.subscribe(subscribeDocCallback);
  }
  function subscribeDocCallback(err) {
    if (err) return cb(err);
    if (!doc.createdLocally && doc.shareDoc.version !== model.root._loadVersions[path]) {
      model.root._loadVersions[path] = doc.shareDoc.version;
      doc._updateCollectionData();
      model.emit('load', [collectionName, id], [doc.get(), model._pass]);
    }
    cb();
  }
};

Model.prototype.unfetchDoc = function(collectionName, id, cb) {
  cb = this.wrapCallback(cb);
  var path = collectionName + '.' + id;
  this._context.unfetchDoc(path, this._pass);
  var fetchedDocs = this.root._fetchedDocs;

  // No effect if the document has no fetch count
  if (!fetchedDocs[path]) return cb();

  var model = this;
  if (this.root.unloadDelay && !this._pass.$query) {
    setTimeout(finishUnfetchDoc, this.root.unloadDelay);
  } else {
    finishUnfetchDoc();
  }
  function finishUnfetchDoc() {
    var count = --fetchedDocs[path];
    if (count) return cb(null, count);
    delete fetchedDocs[path];
    model._maybeUnloadDoc(collectionName, id, path);
    cb(null, 0);
  }
};

Model.prototype.unsubscribeDoc = function(collectionName, id, cb) {
  cb = this.wrapCallback(cb);
  var path = collectionName + '.' + id;
  this._context.unsubscribeDoc(path, this._pass);
  var subscribedDocs = this.root._subscribedDocs;

  // No effect if the document is not currently subscribed
  if (!subscribedDocs[path]) return cb();

  var model = this;
  if (this.root.unloadDelay && !this._pass.$query) {
    setTimeout(finishUnsubscribeDoc, this.root.unloadDelay);
  } else {
    finishUnsubscribeDoc();
  }
  function finishUnsubscribeDoc() {
    var count = --subscribedDocs[path];
    // If there are more remaining subscriptions, only decrement the count
    // and callback with how many subscriptions are remaining
    if (count) return cb(null, count);

    // If there is only one remaining subscription, actually unsubscribe
    delete subscribedDocs[path];
    if (model.root.fetchOnly) {
      unsubscribeDocCallback();
    } else {
      var shareDoc = model.root.shareConnection.get(collectionName, id);
      if (!shareDoc) {
        return cb(new Error('Share document not found for: ' + path));
      }
      shareDoc.unsubscribe(unsubscribeDocCallback);
    }
  }
  function unsubscribeDocCallback(err) {
    model._maybeUnloadDoc(collectionName, id, path);
    if (err) return cb(err);
    cb(null, 0);
  }
};

/**
 * Removes the document from the local model if the model no longer has any
 * remaining fetches or subscribes on path.
 * Called from Model.prototype.unfetchDoc and Model.prototype.unsubscribeDoc as
 * part of attempted cleanup.
 * @param {String} collectionName
 * @param {String} id
 * @param {String} path
 */
Model.prototype._maybeUnloadDoc = function(collectionName, id, path) {
  var doc = this.getDoc(collectionName, id);
  if (!doc) return;
  // Remove the document from the local model if it no longer has any
  // remaining fetches or subscribes
  if (this.root._fetchedDocs[path] || this.root._subscribedDocs[path]) return;
  var previous = doc.get();
  this.root.collections[collectionName].remove(id);

  // Remove doc from memory in Share as well
  if (doc.shareDoc) doc.shareDoc.destroy();

  delete this.root._loadVersions[path];
  this.emit('unload', [collectionName, id], [previous, this._pass]);
};

}).call(this,require("g5I+bs"))
},{"../util":69,"./Model":48,"./Query":49,"g5I+bs":33}],65:[function(require,module,exports){
var Model = require('./Model');

Model.prototype.unbundle = function(data) {
  // Re-create and subscribe queries; re-create documents associated with queries
  this._initQueries(data.queries);

  // Re-create other documents
  for (var collectionName in data.collections) {
    var collection = data.collections[collectionName];
    for (var id in collection) {
      var doc = this.getOrCreateDoc(collectionName, id, collection[id]);
      if (doc.shareDoc) {
        this._loadVersions[collectionName + '.' + id] = doc.shareDoc.version;
      }
    }
  }

  for (var contextId in data.contexts) {
    var contextData = data.contexts[contextId];
    var contextModel = this.context(contextId);
    // Re-init fetchedDocs counts
    for (var path in contextData.fetchedDocs) {
      contextModel._context.fetchDoc(path, contextModel._pass);
      this._fetchedDocs[path] = (this._fetchedDocs[path] || 0) +
        contextData.fetchedDocs[path];
    }
    // Subscribe to document subscriptions
    for (var path in contextData.subscribedDocs) {
      var subscribed = contextData.subscribedDocs[path];
      while (subscribed--) {
        contextModel.subscribe(path);
      }
    }
  }

  // Re-create refs
  for (var i = 0; i < data.refs.length; i++) {
    var item = data.refs[i];
    this.ref(item[0], item[1]);
  }
  // Re-create refLists
  for (var i = 0; i < data.refLists.length; i++) {
    var item = data.refLists[i];
    this.refList(item[0], item[1], item[2], item[3]);
  }
  // Re-create fns
  for (var i = 0; i < data.fns.length; i++) {
    var item = data.fns[i];
    this.start.apply(this, item);
  }
  // Re-create filters
  for (var i = 0; i < data.filters.length; i++) {
    var item = data.filters[i];
    var filter = this._filters.add(item[1], item[2], item[3], item[4], item[5]);
    filter.ref(item[0]);
  }
};

},{"./Model":48}],66:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter;
var Model = require('./Model');
var util = require('./util');

module.exports = Racer;

function Racer() {
  EventEmitter.call(this);
}

util.mergeInto(Racer.prototype, EventEmitter.prototype);

// Make classes accessible for use by plugins and tests
Racer.prototype.Model = Model;
Racer.prototype.util = util;

// Support plugins on racer instances
Racer.prototype.use = util.use;
Racer.prototype.serverUse = util.serverUse;

Racer.prototype.createModel = function(data) {
  var model = new Model();
  if (data) {
    model.createConnection(data);
    model.unbundle(data);
  }
  return model;
};

util.serverRequire(module, './Racer.server');

},{"./Model":58,"./util":69,"events":22}],"racer":[function(require,module,exports){
module.exports=require('1up47O');
},{}],"1up47O":[function(require,module,exports){
var Racer = require('./Racer');
module.exports = new Racer();

},{"./Racer":66}],69:[function(require,module,exports){
(function (process){
var deepIs = require('deep-is');

var isServer = process.title !== 'browser';
exports.isServer = isServer;

exports.asyncGroup = asyncGroup;
exports.castSegments = castSegments;
exports.contains = contains;
exports.copy = copy;
exports.copyObject = copyObject;
exports.deepCopy = deepCopy;
exports.deepEqual = deepIs;
exports.equal = equal;
exports.equalsNaN = equalsNaN;
exports.isArrayIndex = isArrayIndex;
exports.lookup = lookup;
exports.mergeInto = mergeInto;
exports.mayImpact = mayImpact;
exports.mayImpactAny = mayImpactAny;
exports.serverRequire = serverRequire;
exports.serverUse = serverUse;
exports.use = use;

function asyncGroup(cb) {
  var group = new AsyncGroup(cb);
  return function asyncGroupAdd() {
    return group.add();
  };
}

/**
 * @constructor
 * @param {Function} cb(err)
 */
function AsyncGroup(cb) {
  this.cb = cb;
  this.isDone = false;
  this.count = 0;
}
AsyncGroup.prototype.add = function() {
  this.count++;
  var self = this;
  return function(err) {
    self.count--;
    if (self.isDone) return;
    if (err) {
      self.isDone = true;
      self.cb(err);
      return;
    }
    if (self.count > 0) return;
    self.isDone = true;
    self.cb();
  };
};

function castSegments(segments) {
  // Cast number path segments from strings to numbers
  for (var i = segments.length; i--;) {
    var segment = segments[i];
    if (typeof segment === 'string' && isArrayIndex(segment)) {
      segments[i] = +segment;
    }
  }
  return segments;
}

function contains(segments, testSegments) {
  for (var i = 0; i < segments.length; i++) {
    if (segments[i] !== testSegments[i]) return false;
  }
  return true;
}

function copy(value) {
  if (value instanceof Date) return new Date(value);
  if (typeof value === 'object') {
    if (value === null) return null;
    if (Array.isArray(value)) return value.slice();
    return copyObject(value);
  }
  return value;
}

function copyObject(object) {
  var out = new object.constructor();
  for (var key in object) {
    if (object.hasOwnProperty(key)) {
      out[key] = object[key];
    }
  }
  return out;
}

function deepCopy(value) {
  if (value instanceof Date) return new Date(value);
  if (typeof value === 'object') {
    if (value === null) return null;
    if (Array.isArray(value)) {
      var array = [];
      for (var i = value.length; i--;) {
        array[i] = deepCopy(value[i]);
      }
      return array;
    }
    var object = new value.constructor();
    for (var key in value) {
      if (value.hasOwnProperty(key)) {
        object[key] = deepCopy(value[key]);
      }
    }
    return object;
  }
  return value;
}

function equal(a, b) {
  return (a === b) || (equalsNaN(a) && equalsNaN(b));
}

function equalsNaN(x) {
  return x !== x;
}

function isArrayIndex(segment) {
  return (/^[0-9]+$/).test(segment);
}

function lookup(segments, value) {
  if (!segments) return value;

  for (var i = 0, len = segments.length; i < len; i++) {
    if (value == null) return value;
    value = value[segments[i]];
  }
  return value;
}

function mayImpactAny(segmentsList, testSegments) {
  for (var i = 0, len = segmentsList.length; i < len; i++) {
    if (mayImpact(segmentsList[i], testSegments)) return true;
  }
  return false;
}

function mayImpact(segments, testSegments) {
  var len = Math.min(segments.length, testSegments.length);
  for (var i = 0; i < len; i++) {
    if (segments[i] !== testSegments[i]) return false;
  }
  return true;
}

function mergeInto(to, from) {
  for (var key in from) {
    to[key] = from[key];
  }
  return to;
}

function serverRequire(module, id) {
  if (!isServer) return;
  return module.require(id);
}

function serverUse(module, id, options) {
  if (!isServer) return this;
  var plugin = module.require(id);
  return this.use(plugin, options);
}

function use(plugin, options) {
  // Don't include a plugin more than once
  var plugins = this._plugins || (this._plugins = []);
  if (plugins.indexOf(plugin) === -1) {
    plugins.push(plugin);
    plugin(this, options);
  }
  return this;
}

}).call(this,require("g5I+bs"))
},{"deep-is":4,"g5I+bs":33}],70:[function(require,module,exports){
if (typeof require === 'function') {
  var serializeObject = require('serialize-object');
}

// UPDATE_PROPERTIES map HTML attribute names to an Element DOM property that
// should be used for setting on bindings updates instead of s'test'Attribute.
//
// https://github.com/jquery/jquery/blob/1.x-master/src/attributes/prop.js
// https://github.com/jquery/jquery/blob/master/src/attributes/prop.js
// http://webbugtrack.blogspot.com/2007/08/bug-242-setattribute-doesnt-always-work.html
var UPDATE_PROPERTIES = {
  checked: 'checked'
, disabled: 'disabled'
, selected: 'selected'
, type: 'type'
, value: 'value'
, 'class': 'className'
, 'for': 'htmlFor'
, tabindex: 'tabIndex'
, readonly: 'readOnly'
, maxlength: 'maxLength'
, cellspacing: 'cellSpacing'
, cellpadding: 'cellPadding'
, rowspan: 'rowSpan'
, colspan: 'colSpan'
, usemap: 'useMap'
, frameborder: 'frameBorder'
, contenteditable: 'contentEditable'
, enctype: 'encoding'
, id: 'id'
, title: 'title'
};
// CREATE_PROPERTIES map HTML attribute names to an Element DOM property that
// should be used for setting on Element rendering instead of setAttribute.
// input.defaultChecked and input.defaultValue affect the attribute, so we want
// to use these for initial dynamic rendering. For binding updates,
// input.checked and input.value are modified.
var CREATE_PROPERTIES = {};
mergeInto(UPDATE_PROPERTIES, CREATE_PROPERTIES);
CREATE_PROPERTIES.checked = 'defaultChecked';
CREATE_PROPERTIES.value = 'defaultValue';

// http://www.w3.org/html/wg/drafts/html/master/syntax.html#void-elements
var VOID_ELEMENTS = {
  area: true
, base: true
, br: true
, col: true
, embed: true
, hr: true
, img: true
, input: true
, keygen: true
, link: true
, menuitem: true
, meta: true
, param: true
, source: true
, track: true
, wbr: true
};

var NAMESPACE_URIS = {
  svg: 'http://www.w3.org/2000/svg'
, xlink: 'http://www.w3.org/1999/xlink'
, xmlns: 'http://www.w3.org/2000/xmlns/'
};

exports.CREATE_PROPERTIES = CREATE_PROPERTIES;
exports.UPDATE_PROPERTIES = UPDATE_PROPERTIES;
exports.VOID_ELEMENTS = VOID_ELEMENTS;
exports.NAMESPACE_URIS = NAMESPACE_URIS;

// Template Classes
exports.Template = Template;
exports.Doctype = Doctype;
exports.Text = Text;
exports.DynamicText = DynamicText;
exports.Comment = Comment;
exports.DynamicComment = DynamicComment;
exports.Html = Html;
exports.DynamicHtml = DynamicHtml;
exports.Element = Element;
exports.DynamicElement = DynamicElement;
exports.Block = Block;
exports.ConditionalBlock = ConditionalBlock;
exports.EachBlock = EachBlock;

exports.Attribute = Attribute;
exports.DynamicAttribute = DynamicAttribute;

// Binding Classes
exports.Binding = Binding;
exports.NodeBinding = NodeBinding;
exports.AttributeBinding = AttributeBinding;
exports.RangeBinding = RangeBinding;

function Template(content, source) {
  this.content = content;
  this.source = source;
}
Template.prototype.toString = function() {
  return this.source;
};
Template.prototype.get = function(context, unescaped) {
  return contentHtml(this.content, context, unescaped);
};
Template.prototype.getFragment = function(context, binding) {
  var fragment = document.createDocumentFragment();
  this.appendTo(fragment, context, binding);
  return fragment;
};
Template.prototype.appendTo = function(parent, context) {
  context.pause();
  appendContent(parent, this.content, context);
  context.unpause();
};
Template.prototype.attachTo = function(parent, node, context) {
  context.pause();
  var node = attachContent(parent, node, this.content, context);
  context.unpause();
  return node;
};
Template.prototype.update = function() {};
Template.prototype.stringify = function(value) {
  return (value == null) ? '' : value + '';
};
Template.prototype.module = 'templates';
Template.prototype.type = 'Template';
Template.prototype.serialize = function() {
  return serializeObject.instance(this, this.content, this.source);
};


function Doctype(name, publicId, systemId) {
  this.name = name;
  this.publicId = publicId;
  this.systemId = systemId;
}
Doctype.prototype = new Template();
Doctype.prototype.get = function() {
  var publicText = (this.publicId) ?
    ' PUBLIC "' + this.publicId  + '"' :
    '';
  var systemText = (this.systemId) ?
    (this.publicId) ?
      ' "' + this.systemId + '"' :
      ' SYSTEM "' + this.systemId + '"' :
    '';
  return '<!DOCTYPE ' + this.name + publicText + systemText + '>';
};
Doctype.prototype.appendTo = function() {
  // Doctype could be created via:
  //   document.implementation.createDocumentType(this.name, this.publicId, this.systemId)
  // However, it does not appear possible or useful to append it to the
  // document fragment. Therefore, just don't render it in the browser
};
Doctype.prototype.attachTo = function(parent, node) {
  if (!node || node.nodeType !== 10) {
    throw attachError(parent, node);
  }
  return node.nextSibling;
};
Doctype.prototype.type = 'Doctype';
Doctype.prototype.serialize = function() {
  return serializeObject.instance(this, this.name, this.publicId, this.systemId);
};

function Text(data) {
  this.data = data;
  this.escaped = escapeHtml(data);
}
Text.prototype = new Template();
Text.prototype.get = function(context, unescaped) {
  return (unescaped) ? this.data : this.escaped;
};
Text.prototype.appendTo = function(parent) {
  var node = document.createTextNode(this.data);
  parent.appendChild(node);
};
Text.prototype.attachTo = function(parent, node) {
  return attachText(parent, node, this.data, this);
};
Text.prototype.type = 'Text';
Text.prototype.serialize = function() {
  return serializeObject.instance(this, this.data);
};

function DynamicText(expression) {
  this.expression = expression;
}
DynamicText.prototype = new Template();
DynamicText.prototype.get = function(context, unescaped) {
  var value = this.expression.get(context);
  if (value instanceof Template) {
    do {
      value = value.get(context, unescaped);
    } while (value instanceof Template);
    return value;
  }
  var data = this.stringify(value);
  return (unescaped) ? data : escapeHtml(data);
};
DynamicText.prototype.appendTo = function(parent, context) {
  var value = this.expression.get(context);
  if (value instanceof Template) {
    value.appendTo(parent, context);
    return;
  }
  var data = this.stringify(value);
  var node = document.createTextNode(data);
  parent.appendChild(node);
  addNodeBinding(this, context, node);
};
DynamicText.prototype.attachTo = function(parent, node, context) {
  var value = this.expression.get(context);
  if (value instanceof Template) {
    return value.attachTo(parent, node, context);
  }
  var data = this.stringify(value);
  return attachText(parent, node, data, this, context);
};
DynamicText.prototype.update = function(context, binding) {
  binding.node.data = this.stringify(this.expression.get(context));
};
DynamicText.prototype.type = 'DynamicText';
DynamicText.prototype.serialize = function() {
  return serializeObject.instance(this, this.expression);
};

function attachText(parent, node, data, template, context) {
  if (!node) {
    var newNode = document.createTextNode(data);
    parent.appendChild(newNode);
    addNodeBinding(template, context, newNode);
    return;
  }
  if (node.nodeType === 3) {
    // Proceed if nodes already match
    if (node.data === data) {
      addNodeBinding(template, context, node);
      return node.nextSibling;
    }
    data = normalizeLineBreaks(data);
    // Split adjacent text nodes that would have been merged together in HTML
    var nextNode = splitData(node, data.length);
    if (node.data !== data) {
      throw attachError(parent, node);
    }
    addNodeBinding(template, context, node);
    return nextNode;
  }
  // An empty text node might not be created at the end of some text
  if (data === '') {
    var newNode = document.createTextNode('');
    parent.insertBefore(newNode, node || null);
    addNodeBinding(template, context, newNode);
    return node;
  }
  throw attachError(parent, node);
}

function Comment(data, hooks) {
  this.data = data;
  this.hooks = hooks;
}
Comment.prototype = new Template();
Comment.prototype.get = function() {
  return '<!--' + this.data + '-->';
};
Comment.prototype.appendTo = function(parent, context) {
  var node = document.createComment(this.data);
  parent.appendChild(node);
  emitHooks(this.hooks, context, node);
};
Comment.prototype.attachTo = function(parent, node, context) {
  return attachComment(parent, node, this.data, this, context);
};
Comment.prototype.type = 'Comment';
Comment.prototype.serialize = function() {
  return serializeObject.instance(this, this.data, this.hooks);
}

function DynamicComment(expression, hooks) {
  this.expression = expression;
  this.hooks = hooks;
}
DynamicComment.prototype = new Template();
DynamicComment.prototype.get = function(context) {
  var value = getUnescapedValue(this.expression, context);
  var data = this.stringify(value);
  return '<!--' + data + '-->';
};
DynamicComment.prototype.appendTo = function(parent, context) {
  var value = getUnescapedValue(this.expression, context);
  var data = this.stringify(value);
  var node = document.createComment(data);
  parent.appendChild(node);
  addNodeBinding(this, context, node);
};
DynamicComment.prototype.attachTo = function(parent, node, context) {
  var value = getUnescapedValue(this.expression, context);
  var data = this.stringify(value);
  return attachComment(parent, node, data, this, context);
};
DynamicComment.prototype.update = function(context, binding) {
  var value = getUnescapedValue(this.expression, context);
  binding.node.data = this.stringify(value);
};
DynamicComment.prototype.type = 'DynamicComment';
DynamicComment.prototype.serialize = function() {
  return serializeObject.instance(this, this.expression, this.hooks);
}

function attachComment(parent, node, data, template, context) {
  // Sometimes IE fails to create Comment nodes from HTML or innerHTML.
  // This is an issue inside of <select> elements, for example.
  if (!node || node.nodeType !== 8) {
    var newNode = document.createComment(data);
    parent.insertBefore(newNode, node || null);
    addNodeBinding(template, context, newNode);
    return node;
  }
  // Proceed if nodes already match
  if (node.data === data) {
    addNodeBinding(template, context, node);
    return node.nextSibling;
  }
  throw attachError(parent, node);
}

function addNodeBinding(template, context, node) {
  if (template.expression) {
    context.addBinding(new NodeBinding(template, context, node));
  }
  emitHooks(template.hooks, context, node);
}

function Html(data) {
  this.data = data;
}
Html.prototype = new Template();
Html.prototype.get = function() {
  return this.data;
};
Html.prototype.appendTo = function(parent) {
  var fragment = createHtmlFragment(parent, this.data);
  parent.appendChild(fragment);
};
Html.prototype.attachTo = function(parent, node) {
  return attachHtml(parent, node, this.data);
};
Html.prototype.type = "Html";
Html.prototype.serialize = function() {
  return serializeObject.instance(this, this.data);
};

function DynamicHtml(expression) {
  this.expression = expression;
  this.ending = '/' + expression;
}
DynamicHtml.prototype = new Template();
DynamicHtml.prototype.get = function(context) {
  var value = getUnescapedValue(this.expression, context);
  return this.stringify(value);
};
DynamicHtml.prototype.appendTo = function(parent, context, binding) {
  var start = document.createComment(this.expression);
  var end = document.createComment(this.ending);
  var value = getUnescapedValue(this.expression, context);
  var html = this.stringify(value);
  var fragment = createHtmlFragment(parent, html);
  parent.appendChild(start);
  parent.appendChild(fragment);
  parent.appendChild(end);
  updateRange(context, binding, this, start, end);
};
DynamicHtml.prototype.attachTo = function(parent, node, context) {
  var start = document.createComment(this.expression);
  var end = document.createComment(this.ending);
  var value = getUnescapedValue(this.expression, context);
  var html = this.stringify(value);
  parent.insertBefore(start, node || null);
  node = attachHtml(parent, node, html);
  parent.insertBefore(end, node || null);
  updateRange(context, null, this, start, end);
  return node;
};
DynamicHtml.prototype.update = function(context, binding) {
  var parent = binding.start.parentNode;
  if (!parent) return;
  // Get start and end in advance, since binding is mutated in getFragment
  var start = binding.start;
  var end = binding.end;
  var value = getUnescapedValue(this.expression, context);
  var html = this.stringify(value);
  var fragment = createHtmlFragment(parent, html);
  var innerOnly = true;
  replaceRange(context, start, end, fragment, binding, innerOnly);
};
DynamicHtml.prototype.type = 'DynamicHtml';
DynamicHtml.prototype.serialize = function() {
  return serializeObject.instance(this, this.expression);
};

function createHtmlFragment(parent, html) {
  if (parent && parent.nodeType === 1) {
    var range = document.createRange();
    range.selectNodeContents(parent);
    return range.createContextualFragment(html);
  }
  var div = document.createElement('div');
  var range = document.createRange();
  div.innerHTML = html;
  range.selectNodeContents(div);
  return range.extractContents();
}
function attachHtml(parent, node, html) {
  var fragment = createHtmlFragment(parent, html);
  for (var i = 0, len = fragment.childNodes.length; i < len; i++) {
    if (!node) throw attachError(parent, node);
    node = node.nextSibling;
  }
  return node;
}

function Attribute(data, ns) {
  this.data = data;
  this.ns = ns;
}
Attribute.prototype.get = Attribute.prototype.getBound = function(context) {
  return this.data;
};
Attribute.prototype.module = Template.prototype.module;
Attribute.prototype.type = 'Attribute';
Attribute.prototype.serialize = function() {
  return serializeObject.instance(this, this.data, this.ns);
};

function DynamicAttribute(expression, ns) {
  // In attributes, expression may be an instance of Template or Expression
  this.expression = expression;
  this.ns = ns;
  this.elementNs = null;
}
DynamicAttribute.prototype = new Attribute();
DynamicAttribute.prototype.get = function(context) {
  return getUnescapedValue(this.expression, context);
};
DynamicAttribute.prototype.getBound = function(context, element, name, elementNs) {
  this.elementNs = elementNs;
  context.addBinding(new AttributeBinding(this, context, element, name));
  return getUnescapedValue(this.expression, context);
};
DynamicAttribute.prototype.update = function(context, binding) {
  var value = getUnescapedValue(this.expression, context);
  var element = binding.element;
  var propertyName = !this.elementNs && UPDATE_PROPERTIES[binding.name];
  if (propertyName) {
    if (propertyName === 'value' && (element.value === value || element.valueAsNumber === value)) return;
    if (value === void 0) value = null;
    element[propertyName] = value;
    return;
  }
  if (value === false || value == null) {
    if (this.ns) {
      element.removeAttributeNS(this.ns, binding.name);
    } else {
      element.removeAttribute(binding.name);
    }
    return;
  }
  if (value === true) value = binding.name;
  if (this.ns) {
    element.setAttributeNS(this.ns, binding.name, value);
  } else {
    element.setAttribute(binding.name, value);
  }
};
DynamicAttribute.prototype.type = 'DynamicAttribute';
DynamicAttribute.prototype.serialize = function() {
  return serializeObject.instance(this, this.expression, this.ns);
};

function getUnescapedValue(expression, context) {
  var unescaped = true;
  var value = expression.get(context, unescaped);
  while (value instanceof Template) {
    value = value.get(context, unescaped);
  }
  return value;
}

function Element(tagName, attributes, content, hooks, selfClosing, notClosed, ns) {
  this.tagName = tagName;
  this.attributes = attributes;
  this.content = content;
  this.hooks = hooks;
  this.selfClosing = selfClosing;
  this.notClosed = notClosed;
  this.ns = ns;

  this.endTag = getEndTag(tagName, selfClosing, notClosed);
  this.startClose = getStartClose(selfClosing);
  var lowerTagName = tagName && tagName.toLowerCase();
  this.unescapedContent = (lowerTagName === 'script' || lowerTagName === 'style');
}
Element.prototype = new Template();
Element.prototype.getTagName = function() {
  return this.tagName;
};
Element.prototype.getEndTag = function() {
  return this.endTag;
};
Element.prototype.get = function(context) {
  var tagName = this.getTagName(context);
  var endTag = this.getEndTag(tagName);
  var tagItems = [tagName];
  for (var key in this.attributes) {
    var value = this.attributes[key].get(context);
    if (value === true) {
      tagItems.push(key);
    } else if (value !== false && value != null) {
      tagItems.push(key + '="' + escapeAttribute(value) + '"');
    }
  }
  var startTag = '<' + tagItems.join(' ') + this.startClose;
  if (this.content) {
    var inner = contentHtml(this.content, context, this.unescapedContent);
    return startTag + inner + endTag;
  }
  return startTag + endTag;
};
Element.prototype.appendTo = function(parent, context) {
  var tagName = this.getTagName(context);
  var element = (this.ns) ?
    document.createElementNS(this.ns, tagName) :
    document.createElement(tagName);
  for (var key in this.attributes) {
    var attribute = this.attributes[key];
    var value = attribute.getBound(context, element, key, this.ns);
    if (value === false || value == null) continue;
    var propertyName = !this.ns && CREATE_PROPERTIES[key];
    if (propertyName) {
      element[propertyName] = value;
      continue;
    }
    if (value === true) value = key;
    if (attribute.ns) {
      element.setAttributeNS(attribute.ns, key, value);
    } else {
      element.setAttribute(key, value);
    }
  }
  if (this.content) appendContent(element, this.content, context);
  parent.appendChild(element);
  emitHooks(this.hooks, context, element);
};
Element.prototype.attachTo = function(parent, node, context) {
  var tagName = this.getTagName(context);
  if (
    !node ||
    node.nodeType !== 1 ||
    node.tagName.toLowerCase() !== tagName.toLowerCase()
  ) {
    throw attachError(parent, node);
  }
  for (var key in this.attributes) {
    // Get each attribute to create bindings
    this.attributes[key].getBound(context, node, key, this.ns);
    // TODO: Ideally, this would also check that the node's current attributes
    // are equivalent, but there are some tricky edge cases
  }
  if (this.content) attachContent(node, node.firstChild, this.content, context);
  emitHooks(this.hooks, context, node);
  return node.nextSibling;
};
Element.prototype.type = 'Element';
Element.prototype.serialize = function() {
  return serializeObject.instance(
    this
  , this.tagName
  , this.attributes
  , this.content
  , this.hooks
  , this.selfClosing
  , this.notClosed
  , this.ns
  );
};

function DynamicElement(tagName, attributes, content, hooks, selfClosing, notClosed, ns) {
  this.tagName = tagName;
  this.attributes = attributes;
  this.content = content;
  this.hooks = hooks;
  this.selfClosing = selfClosing;
  this.notClosed = notClosed;
  this.ns = ns;

  this.startClose = getStartClose(selfClosing);
  this.unescapedContent = false;
}
DynamicElement.prototype = new Element();
DynamicElement.prototype.getTagName = function(context) {
  return getUnescapedValue(this.tagName, context);
};
DynamicElement.prototype.getEndTag = function(tagName) {
  return getEndTag(tagName, this.selfClosing, this.notClosed);
};
DynamicElement.prototype.type = 'DynamicElement';

function getStartClose(selfClosing) {
  return (selfClosing) ? ' />' : '>';
}

function getEndTag(tagName, selfClosing, notClosed) {
  var lowerTagName = tagName && tagName.toLowerCase();
  var isVoid = VOID_ELEMENTS[lowerTagName];
  return (isVoid || selfClosing || notClosed) ? '' : '</' + tagName + '>';
}

function getAttributeValue(element, name) {
  var propertyName = UPDATE_PROPERTIES[name];
  return (propertyName) ? element[propertyName] : element.getAttribute(name);
}

function emitHooks(hooks, context, value) {
  if (!hooks) return;
  context.queue(function queuedHooks() {
    for (var i = 0, len = hooks.length; i < len; i++) {
      hooks[i].emit(context, value);
    }
  });
}

function Block(expression, content) {
  this.expression = expression;
  this.ending = '/' + expression;
  this.content = content;
}
Block.prototype = new Template();
Block.prototype.get = function(context, unescaped) {
  var blockContext = context.child(this.expression);
  return contentHtml(this.content, blockContext, unescaped);
};
Block.prototype.appendTo = function(parent, context, binding) {
  var blockContext = context.child(this.expression);
  var start = document.createComment(this.expression);
  var end = document.createComment(this.ending);
  var condition = this.getCondition(context);
  parent.appendChild(start);
  appendContent(parent, this.content, blockContext);
  parent.appendChild(end);
  updateRange(context, binding, this, start, end, null, condition);
};
Block.prototype.attachTo = function(parent, node, context) {
  var blockContext = context.child(this.expression);
  var start = document.createComment(this.expression);
  var end = document.createComment(this.ending);
  var condition = this.getCondition(context);
  parent.insertBefore(start, node || null);
  node = attachContent(parent, node, this.content, blockContext);
  parent.insertBefore(end, node || null);
  updateRange(context, null, this, start, end, null, condition);
  return node;
};
Block.prototype.type = 'Block';
Block.prototype.serialize = function() {
  return serializeObject.instance(this, this.expression, this.content);
};
Block.prototype.update = function(context, binding) {
  if (!binding.start.parentNode) return;
  var condition = this.getCondition(context);
  if (condition === binding.condition) return;
  binding.condition = condition;
  // Get start and end in advance, since binding is mutated in getFragment
  var start = binding.start;
  var end = binding.end;
  var fragment = this.getFragment(context, binding);
  replaceRange(context, start, end, fragment, binding);
};
Block.prototype.getCondition = function(context) {
  // We do an identity check to see if the value has changed before updating.
  // With objects, the object would still be the same, so this identity check
  // would fail to update enough. Thus, return NaN, which never equals anything
  // including itself, so that we always update on objects.
  //
  // We could also JSON stringify or use some other hashing approach. However,
  // that could be really expensive on gets of things that never change, and
  // is probably not a good tradeoff. Perhaps there should be a separate block
  // type that is only used in the case of dynamic updates
  var value = this.expression.get(context);
  return (typeof value === 'object') ? NaN : value;
};

function ConditionalBlock(expressions, contents) {
  this.expressions = expressions;
  this.beginning = expressions.join('; ');
  this.ending = '/' + this.beginning;
  this.contents = contents;
}
ConditionalBlock.prototype = new Block();
ConditionalBlock.prototype.get = function(context, unescaped) {
  var condition = this.getCondition(context);
  if (condition == null) return '';
  var expression = this.expressions[condition];
  var blockContext = context.child(expression);
  return contentHtml(this.contents[condition], blockContext, unescaped);
};
ConditionalBlock.prototype.appendTo = function(parent, context, binding) {
  var start = document.createComment(this.beginning);
  var end = document.createComment(this.ending);
  parent.appendChild(start);
  var condition = this.getCondition(context);
  if (condition != null) {
    var expression = this.expressions[condition];
    var blockContext = context.child(expression);
    appendContent(parent, this.contents[condition], blockContext);
  }
  parent.appendChild(end);
  updateRange(context, binding, this, start, end, null, condition);
};
ConditionalBlock.prototype.attachTo = function(parent, node, context) {
  var start = document.createComment(this.beginning);
  var end = document.createComment(this.ending);
  parent.insertBefore(start, node || null);
  var condition = this.getCondition(context);
  if (condition != null) {
    var expression = this.expressions[condition];
    var blockContext = context.child(expression);
    node = attachContent(parent, node, this.contents[condition], blockContext);
  }
  parent.insertBefore(end, node || null);
  updateRange(context, null, this, start, end, null, condition);
  return node;
};
ConditionalBlock.prototype.type = 'ConditionalBlock';
ConditionalBlock.prototype.serialize = function() {
  return serializeObject.instance(this, this.expressions, this.contents);
};
ConditionalBlock.prototype.update = function(context, binding) {
  if (!binding.start.parentNode) return;
  var condition = this.getCondition(context);
  if (condition === binding.condition) return;
  binding.condition = condition;
  // Get start and end in advance, since binding is mutated in getFragment
  var start = binding.start;
  var end = binding.end;
  var fragment = this.getFragment(context, binding);
  replaceRange(context, start, end, fragment, binding);
};
ConditionalBlock.prototype.getCondition = function(context) {
  for (var i = 0, len = this.expressions.length; i < len; i++) {
    if (this.expressions[i].truthy(context)) {
      return i;
    }
  }
};

function EachBlock(expression, content, elseContent) {
  this.expression = expression;
  this.ending = '/' + expression;
  this.content = content;
  this.elseContent = elseContent;
}
EachBlock.prototype = new Block();
EachBlock.prototype.get = function(context, unescaped) {
  var items = this.expression.get(context);
  if (items && items.length) {
    var html = '';
    for (var i = 0, len = items.length; i < len; i++) {
      var itemContext = context.eachChild(this.expression, i);
      html += contentHtml(this.content, itemContext, unescaped);
    }
    return html;
  } else if (this.elseContent) {
    return contentHtml(this.elseContent, context, unescaped);
  }
  return '';
};
EachBlock.prototype.appendTo = function(parent, context, binding) {
  var items = this.expression.get(context);
  var start = document.createComment(this.expression);
  var end = document.createComment(this.ending);
  parent.appendChild(start);
  if (items && items.length) {
    for (var i = 0, len = items.length; i < len; i++) {
      var itemContext = context.eachChild(this.expression, i);
      this.appendItemTo(parent, itemContext, start);
    }
  } else if (this.elseContent) {
    appendContent(parent, this.elseContent, context);
  }
  parent.appendChild(end);
  updateRange(context, binding, this, start, end);
};
EachBlock.prototype.appendItemTo = function(parent, context, itemFor, binding) {
  var before = parent.lastChild;
  var start, end;
  appendContent(parent, this.content, context);
  if (before === parent.lastChild) {
    start = end = document.createComment('empty');
    parent.appendChild(start);
  } else {
    start = (before && before.nextSibling) || parent.firstChild;
    end = parent.lastChild;
  }
  updateRange(context, binding, this, start, end, itemFor);
};
EachBlock.prototype.attachTo = function(parent, node, context) {
  var items = this.expression.get(context);
  var start = document.createComment(this.expression);
  var end = document.createComment(this.ending);
  parent.insertBefore(start, node || null);
  if (items && items.length) {
    for (var i = 0, len = items.length; i < len; i++) {
      var itemContext = context.eachChild(this.expression, i);
      node = this.attachItemTo(parent, node, itemContext, start);
    }
  } else if (this.elseContent) {
    node = attachContent(parent, node, this.elseContent, context);
  }
  parent.insertBefore(end, node || null);
  updateRange(context, null, this, start, end);
  return node;
};
EachBlock.prototype.attachItemTo = function(parent, node, context, itemFor) {
  var start, end;
  var oldPrevious = node && node.previousSibling;
  var nextNode = attachContent(parent, node, this.content, context);
  if (nextNode === node) {
    start = end = document.createComment('empty');
    parent.insertBefore(start, node || null);
  } else {
    start = (oldPrevious && oldPrevious.nextSibling) || parent.firstChild;
    end = (nextNode && nextNode.previousSibling) || parent.lastChild;
  }
  updateRange(context, null, this, start, end, itemFor);
  return nextNode;
};
EachBlock.prototype.update = function(context, binding) {
  if (!binding.start.parentNode) return;
  var start = binding.start;
  var end = binding.end;
  if (binding.itemFor) {
    var fragment = document.createDocumentFragment();
    this.appendItemTo(fragment, context, binding.itemFor, binding);
  } else {
    var fragment = this.getFragment(context, binding);
  }
  replaceRange(context, start, end, fragment, binding);
};
EachBlock.prototype.insert = function(context, binding, index, howMany) {
  var parent = binding.start.parentNode;
  if (!parent) return;
  // In case we are inserting all of the items, update instead. This is needed
  // when we were previously rendering elseContent so that it is replaced
  if (index === 0 && this.expression.get(context).length === howMany) {
    return this.update(context, binding);
  }
  var node = indexStartNode(binding, index);
  var fragment = document.createDocumentFragment();
  for (var i = index, len = index + howMany; i < len; i++) {
    var itemContext = context.eachChild(this.expression, i);
    this.appendItemTo(fragment, itemContext, binding.start);
  }
  parent.insertBefore(fragment, node || null);
};
EachBlock.prototype.remove = function(context, binding, index, howMany) {
  var parent = binding.start.parentNode;
  if (!parent) return;
  // In case we are removing all of the items, update instead. This is needed
  // when elseContent should be rendered
  if (index === 0 && this.expression.get(context).length === 0) {
    return this.update(context, binding);
  }
  var node = indexStartNode(binding, index);
  var i = 0;
  while (node) {
    if (node === binding.end) return;
    if (node.$bindItemStart && node.$bindItemStart.itemFor === binding.start) {
      if (howMany === i++) return;
    }
    var nextNode = node.nextSibling;
    parent.removeChild(node);
    emitRemoved(context, node, binding);
    node = nextNode;
  }
};
EachBlock.prototype.move = function(context, binding, from, to, howMany) {
  var parent = binding.start.parentNode;
  if (!parent) return;
  var node = indexStartNode(binding, from);
  var fragment = document.createDocumentFragment();
  var i = 0;
  while (node) {
    if (node === binding.end) break;
    if (node.$bindItemStart && node.$bindItemStart.itemFor === binding.start) {
      if (howMany === i++) break;
    }
    var nextNode = node.nextSibling;
    fragment.appendChild(node);
    node = nextNode;
  }
  node = indexStartNode(binding, to);
  parent.insertBefore(fragment, node || null);
};
EachBlock.prototype.type = 'EachBlock';
EachBlock.prototype.serialize = function() {
  return serializeObject.instance(this, this.expression, this.content, this.elseContent);
};

function indexStartNode(binding, index) {
  var node = binding.start;
  var i = 0;
  while (node = node.nextSibling) {
    if (node === binding.end) return node;
    if (node.$bindItemStart && node.$bindItemStart.itemFor === binding.start) {
      if (index === i) return node;
      i++;
    }
  }
}

function updateRange(context, binding, template, start, end, itemFor, condition) {
  if (binding) {
    binding.start = start;
    binding.end = end;
    binding.condition = condition;
    setNodeBounds(binding, start, itemFor);
  } else {
    context.addBinding(new RangeBinding(template, context, start, end, itemFor, condition));
  }
}
function setNodeBounds(binding, start, itemFor) {
  if (itemFor) {
    setNodeProperty(start, '$bindItemStart', binding);
  } else {
    setNodeProperty(start, '$bindStart', binding);
  }
}

function appendContent(parent, content, context) {
  for (var i = 0, len = content.length; i < len; i++) {
    content[i].appendTo(parent, context);
  }
}
function attachContent(parent, node, content, context) {
  for (var i = 0, len = content.length; i < len; i++) {
    node = content[i].attachTo(parent, node, context);
  }
  return node;
}
function contentHtml(content, context, unescaped) {
  var html = '';
  for (var i = 0, len = content.length; i < len; i++) {
    html += content[i].get(context, unescaped);
  }
  return html;
}
function replaceRange(context, start, end, fragment, binding, innerOnly) {
  // Note: the calling function must make sure to check that there is a parent
  var parent = start.parentNode;
  // Copy item binding from old start to fragment being inserted
  if (start.$bindItemStart && fragment.firstChild) {
    setNodeProperty(fragment.firstChild, '$bindItemStart', start.$bindItemStart);
    start.$bindItemStart.start = fragment.firstChild;
  }
  // Fast path for single node replacements
  if (start === end) {
    parent.replaceChild(fragment, start);
    emitRemoved(context, start, binding);
    return;
  }
  // Remove all nodes from start to end
  var node = (innerOnly) ? start.nextSibling : start;
  var nextNode;
  while (node) {
    nextNode = node.nextSibling;
    emitRemoved(context, node, binding);
    if (innerOnly && node === end) {
      nextNode = end;
      break;
    }
    parent.removeChild(node);
    if (node === end) break;
    node = nextNode;
  }
  // This also works if nextNode is null, by doing an append
  parent.insertBefore(fragment, nextNode || null);
}
function emitRemoved(context, node, ignore) {
  context.removeNode(node);
  emitRemovedBinding(context, ignore, node.$bindNode);
  emitRemovedBinding(context, ignore, node.$bindStart);
  emitRemovedBinding(context, ignore, node.$bindItemStart);
  var attributes = node.$bindAttributes;
  if (attributes) {
    for (var key in attributes) {
      context.removeBinding(attributes[key]);
    }
  }
  for (node = node.firstChild; node; node = node.nextSibling) {
    emitRemoved(context, node, ignore);
  }
}
function emitRemovedBinding(context, ignore, binding) {
  if (binding && binding !== ignore) {
    context.removeBinding(binding);
  }
}

function attachError(parent, node) {
  if (typeof console !== 'undefined') {
    console.error('Attach failed for', node, 'within', parent);
  }
  return new Error('Attaching bindings failed, because HTML structure ' +
    'does not match client rendering.'
  );
}

function Binding() {
  this.meta = null;
}
Binding.prototype.type = 'Binding';
Binding.prototype.update = function() {
  this.context.pause();
  this.template.update(this.context, this);
  this.context.unpause();
};
Binding.prototype.insert = function() {
  this.update();
};
Binding.prototype.remove = function() {
  this.update();
};
Binding.prototype.move = function() {
  this.update();
};

function NodeBinding(template, context, node) {
  this.template = template;
  this.context = context;
  this.node = node;
  this.meta = null;
  setNodeProperty(node, '$bindNode', this);
}
NodeBinding.prototype = new Binding();
NodeBinding.prototype.type = 'NodeBinding';

function AttributeBindingsMap() {}
function AttributeBinding(template, context, element, name) {
  this.template = template;
  this.context = context;
  this.element = element;
  this.name = name;
  this.meta = null;
  var map = element.$bindAttributes ||
    (element.$bindAttributes = new AttributeBindingsMap());
  map[name] = this;
}
AttributeBinding.prototype = new Binding();
AttributeBinding.prototype.type = 'AttributeBinding';

function RangeBinding(template, context, start, end, itemFor, condition) {
  this.template = template;
  this.context = context;
  this.start = start;
  this.end = end;
  this.itemFor = itemFor;
  this.condition = condition;
  this.meta = null;
  setNodeBounds(this, start, itemFor);
}
RangeBinding.prototype = new Binding();
RangeBinding.prototype.type = 'RangeBinding';
RangeBinding.prototype.insert = function(index, howMany) {
  this.context.pause();
  if (this.template.insert) {
    this.template.insert(this.context, this, index, howMany);
  } else {
    this.template.update(this.context, this);
  }
  this.context.unpause();
};
RangeBinding.prototype.remove = function(index, howMany) {
  this.context.pause();
  if (this.template.remove) {
    this.template.remove(this.context, this, index, howMany);
  } else {
    this.template.update(this.context, this);
  }
  this.context.unpause();
};
RangeBinding.prototype.move = function(from, to, howMany) {
  this.context.pause();
  if (this.template.move) {
    this.template.move(this.context, this, from, to, howMany);
  } else {
    this.template.update(this.context, this);
  }
  this.context.unpause();
};


//// Utility functions ////

function noop() {}

function mergeInto(from, to) {
  for (var key in from) {
    to[key] = from[key];
  }
}

function escapeHtml(string) {
  string = string + '';
  return string.replace(/[&<]/g, function(match) {
    return (match === '&') ? '&amp;' : '&lt;';
  });
}

function escapeAttribute(string) {
  string = string + '';
  return string.replace(/[&"]/g, function(match) {
    return (match === '&') ? '&amp;' : '&quot;';
  });
}


//// Shims & workarounds ////

// General notes:
//
// In all cases, Node.insertBefore should have `|| null` after its second
// argument. IE works correctly when the argument is ommitted or equal
// to null, but it throws and error if it is equal to undefined.

if (!Array.isArray) {
  Array.isArray = function(value) {
    return Object.prototype.toString.call(value) === '[object Array]';
  };
}

// Equivalent to textNode.splitText, which is buggy in IE <=9
function splitData(node, index) {
  var newNode = node.cloneNode(false);
  newNode.deleteData(0, index);
  node.deleteData(index, node.length - index);
  node.parentNode.insertBefore(newNode, node.nextSibling || null);
  return newNode;
}

// Defined so that it can be overriden in IE <=8
function setNodeProperty(node, key, value) {
  return node[key] = value;
}

function normalizeLineBreaks(string) {
  return string;
}

(function() {
  // Don't try to shim in Node.js environment
  if (typeof document === 'undefined') return;

  var div = document.createElement('div');
  div.innerHTML = '\r\n<br>\n'
  var windowsLength = div.firstChild.data.length;
  var unixLength = div.lastChild.data.length;
  if (windowsLength === 1 && unixLength === 1) {
    normalizeLineBreaks = function(string) {
      return string.replace(/\r\n/g, '\n');
    };
  } else if (windowsLength === 2 && unixLength === 2) {
    normalizeLineBreaks = function(string) {
      return string.replace(/(^|[^\r])(\n+)/g, function(match, value, newLines) {
        for (var i = newLines.length; i--;) {
          value += '\r\n';
        }
        return value;
      });
    };
  }

  // TODO: Shim createHtmlFragment for old IE

  // TODO: Shim setAttribute('style'), which doesn't work in IE <=7
  // http://webbugtrack.blogspot.com/2007/10/bug-245-setattribute-style-does-not.html

  // TODO: Investigate whether input name attribute works in IE <=7. We could
  // override Element::appendTo to use IE's alternative createElement syntax:
  // document.createElement('<input name="xxx">')
  // http://webbugtrack.blogspot.com/2007/10/bug-235-createelement-is-broken-in-ie.html

  // In IE, input.defaultValue doesn't work correctly, so use input.value,
  // which mistakenly but conveniently sets both the value property and attribute.
  //
  // Surprisingly, in IE <=7, input.defaultChecked must be used instead of
  // input.checked before the input is in the document.
  // http://webbugtrack.blogspot.com/2007/11/bug-299-setattribute-checked-does-not.html
  var input = document.createElement('input');
  input.defaultValue = 'x';
  if (input.value !== 'x') {
    CREATE_PROPERTIES.value = 'value';
  }

  try {
    // TextNodes are not expando in IE <=8
    document.createTextNode('').$try = 0;
  } catch (err) {
    setNodeProperty = function(node, key, value) {
      // If trying to set a property on a TextNode, create a proxy CommentNode
      // and set the property on that node instead. Put the proxy after the
      // TextNode if marking the end of a range, and before otherwise.
      if (node.nodeType === 3) {
        var proxyNode = node.previousSibling;
        if (!proxyNode || proxyNode.$bindProxy !== node) {
          proxyNode = document.createComment('proxy');
          proxyNode.$bindProxy = node;
          node.parentNode.insertBefore(proxyNode, node || null);
        }
        return proxyNode[key] = value;
      }
      // Set the property directly on other node types
      return node[key] = value;
    };
  }
})();

},{"serialize-object":71}],71:[function(require,module,exports){
exports.instance = serializeInstance;
exports.args = serializeArgs;
exports.value = serializeValue;

function serializeInstance(instance) {
  var args = Array.prototype.slice.call(arguments, 1);
  return 'new ' + instance.module + '.' + instance.type +
    '(' + serializeArgs(args) + ')';
}

function serializeArgs(args) {
  // Map each argument into its string representation
  var items = [];
  for (var i = args.length; i--;) {
    var item = serializeValue(args[i]);
    items.unshift(item);
  }
  // Remove trailing null values, assuming they are optional
  for (var i = items.length; i--;) {
    var item = items[i];
    if (item !== 'void 0' && item !== 'null') break;
    items.pop();
  }
  return items.join(', ');
}

function serializeValue(input) {
  if (input && input.serialize) {
    return input.serialize();

  } else if (typeof input === 'undefined') {
    return 'void 0';

  } else if (input === null) {
    return 'null';

  } else if (typeof input === 'string') {
    return formatString(input);

  } else if (typeof input === 'number' || typeof input === 'boolean') {
    return input + '';

  } else if (Array.isArray(input)) {
    var items = [];
    for (var i = 0; i < input.length; i++) {
      var value = serializeValue(input[i]);
      items.push(value);
    }
    return '[' + items.join(', ') + ']';

  } else if (typeof input === 'object') {
    var items = [];
    for (var key in input) {
      var value = serializeValue(input[key]);
      items.push(formatString(key) + ': ' + value);
    }
    return '{' + items.join(', ') + '}';
  }
}
function formatString(value) {
  var escaped = value.replace(/['\r\n\\]/g, function(match) {
    return (match === '\'') ? '\\\'' :
      (match === '\r') ? '\\r' :
      (match === '\n') ? '\\n' :
      (match === '\\') ? '\\\\' :
      '';
  });
  return '\'' + escaped + '\'';
}

},{}],72:[function(require,module,exports){
var Doc = require('./doc').Doc;
var Query = require('./query').Query;
var emitter = require('./emitter');


/**
 * Handles communication with the sharejs server and provides queries and
 * documents.
 *
 * We create a connection with a socket object
 *   connection = new sharejs.Connection(sockset)
 * The socket may be any object handling the websocket protocol. See the
 * documentation of bindToSocket() for details. We then wait for the connection
 * to connect
 *   connection.on('connected', ...)
 * and are finally able to work with shared documents
 *   connection.get('food', 'steak') // Doc
 *
 * @param socket @see bindToSocket
 */
var Connection = exports.Connection = function (socket) {
  emitter.EventEmitter.call(this);

  // Map of collection -> docName -> doc object for created documents.
  // (created documents MUST BE UNIQUE)
  this.collections = {};

  // Each query is created with an id that the server uses when it sends us
  // info about the query (updates, etc).
  //this.nextQueryId = (Math.random() * 1000) |0;
  this.nextQueryId = 1;

  // Map from query ID -> query object.
  this.queries = {};

  // State of the connection. The correspoding events are emmited when this
  // changes. Available states are:
  // - 'connecting'   The connection has been established, but we don't have our
  //                  client ID yet
  // - 'connected'    We have connected and recieved our client ID. Ready for data.
  // - 'disconnected' The connection is closed, but it will reconnect automatically.
  // - 'stopped'      The connection is closed, and should not reconnect.
  this.state = 'disconnected';

  // This is a helper variable the document uses to see whether we're currently
  // in a 'live' state. It is true if we're connected, or if you're using
  // browserchannel and connecting.
  this.canSend = false;

  // Private variable to support clearing of op retry interval
  this._retryInterval = null;

  // Reset some more state variables.
  this.reset();

  this.debug = false;

  // I'll store the most recent 100 messages so when errors occur we can see
  // what happened.
  this.messageBuffer = [];

  this.bindToSocket(socket);
}
emitter.mixin(Connection);


/**
 * Use socket to communicate with server
 *
 * Socket is an object that can handle the websocket protocol. This method
 * installs the onopen, onclose, onmessage and onerror handlers on the socket to
 * handle communication and sends messages by calling socket.send(msg). The
 * sockets `readyState` property is used to determine the initaial state.
 *
 * @param socket Handles the websocket protocol
 * @param socket.readyState
 * @param socket.close
 * @param socket.send
 * @param socket.onopen
 * @param socket.onclose
 * @param socket.onmessage
 * @param socket.onerror
 */
Connection.prototype.bindToSocket = function(socket) {
  if (this.socket) {
    delete this.socket.onopen
    delete this.socket.onclose
    delete this.socket.onmessage
    delete this.socket.onerror
  }

  // TODO: Check that the socket is in the 'connecting' state.

  this.socket = socket;
  // This logic is replicated in setState - consider calling setState here
  // instead.
  this.state = (socket.readyState === 0 || socket.readyState === 1) ? 'connecting' : 'disconnected';
  this.canSend = this.state === 'connecting' && socket.canSendWhileConnecting;
  this._setupRetry();

  var connection = this

  socket.onmessage = function(msg) {
    var data = msg.data;

    // Fall back to supporting old browserchannel 1.x API which implemented the
    // websocket API incorrectly. This will be removed at some point
    if (!data) data = msg;

    // Some transports don't need parsing.
    if (typeof data === 'string') data = JSON.parse(data);

    if (connection.debug) console.log('RECV', JSON.stringify(data));

    connection.messageBuffer.push({
      t: (new Date()).toTimeString(),
      recv:JSON.stringify(data)
    });
    while (connection.messageBuffer.length > 100) {
      connection.messageBuffer.shift();
    }

    try {
      connection.handleMessage(data);
    } catch (err) {
      connection.emit('error', err, data);
      // We could also restart the connection here, although that might result
      // in infinite reconnection bugs.
    }
  }

  socket.onopen = function() {
    connection._setState('connecting');
  };

  socket.onerror = function(e) {
    // This isn't the same as a regular error, because it will happen normally
    // from time to time. Your connection should probably automatically
    // reconnect anyway, but that should be triggered off onclose not onerror.
    // (onclose happens when onerror gets called anyway).
    connection.emit('connection error', e);
  };

  socket.onclose = function(reason) {
    // reason values:
    //   'Closed' - The socket was manually closed by calling socket.close()
    //   'Stopped by server' - The server sent the stop message to tell the client not to try connecting
    //   'Request failed' - Server didn't respond to request (temporary, usually offline)
    //   'Unknown session ID' - Server session for client is missing (temporary, will immediately reestablish)
    connection._setState('disconnected', reason);
    if (reason === 'Closed' || reason === 'Stopped by server') {
      connection._setState('stopped', reason);
    }
  };
};


/**
 * @param {object} msg
 * @param {String} msg.a action
 */
Connection.prototype.handleMessage = function(msg) {
  // Switch on the message action. Most messages are for documents and are
  // handled in the doc class.
  switch (msg.a) {
    case 'init':
      // Client initialization packet. This bundle of joy contains our client
      // ID.
      if (msg.protocol !== 0) throw new Error('Invalid protocol version');
      if (typeof msg.id != 'string') throw new Error('Invalid client id');

      this.id = msg.id;
      this._setState('connected');
      break;

    case 'qfetch':
    case 'qsub':
    case 'q':
    case 'qunsub':
      // Query message. Pass this to the appropriate query object.
      var query = this.queries[msg.id];
      if (query) query._onMessage(msg);
      break;

    case 'bs':
      // Bulk subscribe response. The responses for each document are contained within.
      var result = msg.s;
      for (var cName in result) {
        for (var docName in result[cName]) {
          var doc = this.get(cName, docName);
          if (!doc) {
            console.warn('Message for unknown doc. Ignoring.', msg);
            break;
          }

          var msg = result[cName][docName];
          if (typeof msg === 'object') {
            doc._handleSubscribe(msg.error, msg);
          } else {
            // The msg will be true if we simply resubscribed.
            doc._handleSubscribe(null, null);
          }
        }
      }
      break;

    default:
      // Document message. Pull out the referenced document and forward the
      // message.
      var doc = this.getExisting(msg.c, msg.d);
      if (doc) doc._onMessage(msg);
  }
};


Connection.prototype.reset = function() {
  this.id = null;
  this.seq = 1;
};


Connection.prototype._setupRetry = function() {
  if (!this.canSend) {
    clearInterval(this._retryInterval);
    this._retryInterval = null;
    return;
  }
  if (this._retryInterval != null) return;

  var connection = this;
  this._retryInterval = setInterval(function() {
    for (var collectionName in connection.collections) {
      var collection = connection.collections[collectionName];
      for (var docName in collection) {
        collection[docName].retry();
      }
    }
  }, 1000);
};


// Set the connection's state. The connection is basically a state machine.
Connection.prototype._setState = function(newState, data) {
  if (this.state === newState) return;

  // I made a state diagram. The only invalid transitions are getting to
  // 'connecting' from anywhere other than 'disconnected' and getting to
  // 'connected' from anywhere other than 'connecting'.
  if (
    (newState === 'connecting' && this.state !== 'disconnected' && this.state !== 'stopped') ||
    (newState === 'connected' && this.state !== 'connecting')
  ) {
    throw new Error("Cannot transition directly from " + this.state + " to " + newState);
  }

  this.state = newState;
  this.canSend =
    (newState === 'connecting' && this.socket.canSendWhileConnecting) ||
    (newState === 'connected');
  this._setupRetry();

  if (newState === 'disconnected') this.reset();

  this.emit(newState, data);

  // Group all subscribes together to help server make more efficient calls
  this.bsStart();
  // Emit the event to all queries
  for (var id in this.queries) {
    var query = this.queries[id];
    query._onConnectionStateChanged(newState, data);
  }
  // Emit the event to all documents
  for (var c in this.collections) {
    var collection = this.collections[c];
    for (var docName in collection) {
      collection[docName]._onConnectionStateChanged(newState, data);
    }
  }
  this.bsEnd();
};

Connection.prototype.bsStart = function() {
  this.subscribeData = this.subscribeData || {};
};

Connection.prototype.bsEnd = function() {
  // Only send bulk subscribe if not empty
  if (hasKeys(this.subscribeData)) {
    this.send({a:'bs', s:this.subscribeData});
  }
  this.subscribeData = null;
};

Connection.prototype.sendSubscribe = function(doc, version) {
  // Ensure the doc is registered so that it receives the reply message
  this._addDoc(doc);
  if (this.subscribeData) {
    // Bulk subscribe
    var data = this.subscribeData;
    if (!data[doc.collection]) data[doc.collection] = {};
    data[doc.collection][doc.name] = version || null;
  } else {
    // Send single subscribe message
    var msg = {a: 'sub', c: doc.collection, d: doc.name};
    if (version != null) msg.v = version;
    this.send(msg);
  }
};

Connection.prototype.sendFetch = function(doc, version) {
  // Ensure the doc is registered so that it receives the reply message
  this._addDoc(doc);
  var msg = {a: 'fetch', c: doc.collection, d: doc.name};
  if (version != null) msg.v = version;
  this.send(msg);
};

Connection.prototype.sendUnsubscribe = function(doc) {
  // Ensure the doc is registered so that it receives the reply message
  this._addDoc(doc);
  var msg = {a: 'unsub', c: doc.collection, d: doc.name};
  this.send(msg);
};

Connection.prototype.sendOp = function(doc, data) {
  // Ensure the doc is registered so that it receives the reply message
  this._addDoc(doc);
  var msg = {
    a: 'op',
    c: doc.collection,
    d: doc.name,
    v: doc.version,
    src: data.src,
    seq: data.seq
  };
  if (data.op) msg.op = data.op;
  if (data.create) msg.create = data.create;
  if (data.del) msg.del = data.del;
  this.send(msg);
};


/**
 * Sends a message down the socket
 */
Connection.prototype.send = function(msg) {
  if (this.debug) console.log("SEND", JSON.stringify(msg));

  this.messageBuffer.push({t:Date.now(), send:JSON.stringify(msg)});
  while (this.messageBuffer.length > 100) {
    this.messageBuffer.shift();
  }

  if (!this.socket.canSendJSON) {
    msg = JSON.stringify(msg);
  }
  this.socket.send(msg);
};


/**
 * Closes the socket and emits 'disconnected'
 */
Connection.prototype.disconnect = function() {
  this.socket.close();
};

Connection.prototype.getExisting = function(collection, name) {
  if (this.collections[collection]) return this.collections[collection][name];
};


/**
 * @deprecated
 */
Connection.prototype.getOrCreate = function(collection, name, data) {
  console.trace('getOrCreate is deprecated. Use get() instead');
  return this.get(collection, name, data);
};


/**
 * Get or create a document.
 *
 * @param collection
 * @param name
 * @param [data] ingested into document if created
 * @return {Doc}
 */
Connection.prototype.get = function(collection, name, data) {
  var collectionObject = this.collections[collection];
  if (!collectionObject)
    collectionObject = this.collections[collection] = {};

  var doc = collectionObject[name];
  if (!doc) {
    doc = collectionObject[name] = new Doc(this, collection, name);
    this.emit('doc', doc);
  }

  // Even if the document isn't new, its possible the document was created
  // manually and then tried to be re-created with data (suppose a query
  // returns with data for the document). We should hydrate the document
  // immediately if we can because the query callback will expect the document
  // to have data.
  if (data && data.data !== undefined && !doc.state) {
    doc.ingestData(data);
  }

  return doc;
};


/**
 * Remove document from this.collections
 *
 * @private
 */
Connection.prototype._destroyDoc = function(doc) {
  var collectionObject = this.collections[doc.collection];
  if (!collectionObject) return;

  delete collectionObject[doc.name];

  // Delete the collection container if its empty. This could be a source of
  // memory leaks if you slowly make a billion collections, which you probably
  // won't do anyway, but whatever.
  if (!hasKeys(collectionObject))
    delete this.collections[doc.collection];
};

Connection.prototype._addDoc = function(doc) {
  var collectionObject = this.collections[doc.collection];
  if (!collectionObject) {
    collectionObject = this.collections[doc.collection] = {};
  }
  if (collectionObject[doc.name] !== doc) {
    collectionObject[doc.name] = doc;
  }
};


function hasKeys(object) {
  for (var key in object) return true;
  return false;
};


// Helper for createFetchQuery and createSubscribeQuery, below.
Connection.prototype._createQuery = function(type, collection, q, options, callback) {
  if (type !== 'fetch' && type !== 'sub')
    throw new Error('Invalid query type: ' + type);

  if (!options) options = {};
  var id = this.nextQueryId++;
  var query = new Query(type, this, id, collection, q, options, callback);
  this.queries[id] = query;
  query._execute();
  return query;
};

// Internal function. Use query.destroy() to remove queries.
Connection.prototype._destroyQuery = function(query) {
  delete this.queries[query.id];
};

// The query options object can contain the following fields:
//
// docMode: What to do with documents that are in the result set. Can be
//   null/undefined (default), 'fetch' or 'subscribe'. Fetch mode indicates
//   that the server should send document snapshots to the client for all query
//   results. These will be hydrated into the document objects before the query
//   result callbacks are returned. Subscribe mode gets document snapshots and
//   automatically subscribes the client to all results. Note that the
//   documents *WILL NOT* be automatically unsubscribed when the query is
//   destroyed. (ShareJS doesn't have enough information to do that safely).
//   Beware of memory leaks when using this option.
//
// poll: Forcably enable or disable polling mode. Polling mode will reissue the query
//   every time anything in the collection changes (!!) so, its quite
//   expensive.  It is automatically enabled for paginated and sorted queries.
//   By default queries run with polling mode disabled; which will only check
//   changed documents to test if they now match the specified query.
//   Set to false to disable polling mode, or true to enable it. If you don't
//   specify a poll option, polling mode is enabled or disabled automatically
//   by the query's backend.
//
// backend: Set the backend source for the query. You can attach different
//   query backends to livedb and pick which one the query should hit using
//   this parameter.
//
// results: (experimental) Initial list of resultant documents. This is
//   useful for rehydrating queries when you're using autoFetch / autoSubscribe
//   so the server doesn't have to send over snapshots for documents the client
//   already knows about. This is experimental - the API may change in upcoming
//   versions.

// Create a fetch query. Fetch queries are only issued once, returning the
// results directly into the callback.
//
// The index is specific to the source, but if you're using mongodb it'll be
// the collection to which the query is made.
// The callback should have the signature function(error, results, extraData)
// where results is a list of Doc objects.
Connection.prototype.createFetchQuery = function(index, q, options, callback) {
  return this._createQuery('fetch', index, q, options, callback);
};

// Create a subscribe query. Subscribe queries return with the initial data
// through the callback, then update themselves whenever the query result set
// changes via their own event emitter.
//
// If present, the callback should have the signature function(error, results, extraData)
// where results is a list of Doc objects.
Connection.prototype.createSubscribeQuery = function(index, q, options, callback) {
  return this._createQuery('sub', index, q, options, callback);
};

},{"./doc":73,"./emitter":74,"./query":76}],73:[function(require,module,exports){
var types = require('../types').ottypes;
var emitter = require('./emitter');

/**
 * A Doc is a client's view on a sharejs document.
 *
 * It is is uniquely identified by its `name` and `collection`.  Documents
 * should not be created directly. Create them with Connection.get()
 *
 *
 *
 * Subscriptions
 * -------------
 *
 * We can subscribe a document to stay in sync with the server.
 *   doc.subscribe(function(error) {
 *     doc.state // = 'ready'
 *     doc.subscribed // = true
 *   })
 * The server now sends us all changes concerning this document and these are
 * applied to our snapshot. If the subscription was successful the initial
 * snapshot and version sent by the server are loaded into the document.
 *
 * To stop listening to the changes we call `doc.unsubscribe()`.
 *
 * If we just want to load the data but not stay up-to-date, we call
 *   doc.fetch(function(error) {
 *     doc.snapshot // sent by server
 *   })
 *
 * TODO What happens when the document does not exist yet.
 *
 *
 *
 * Editing documents
 * ------------------
 *
 * To edit a document we have to create an editing context
 *   context = doc.context()
 * The context is an object exposing the type API of the documents OT type.
 *   doc.type = 'text'
 *   context.insert(0, 'In the beginning')
 *   doc.snapshot // 'In the beginning...'
 *
 * If a operation is applied on the snapshot the `_onOp` on the context is
 * called. The type implementation then usually triggers a corresponding event.
 *
 *
 *
 *
 * Events
 * ------
 *
 * You can use doc.on(eventName, callback) to subscribe to the following events:
 * - `before op (op, localContext)` Fired before an operation is applied to the
 *   snapshot. The document is already in locked state, so it is not allowed to
 *   submit further operations. It may be used to read the old snapshot just
 *   before applying an operation. The callback is passed the operation and the
 *   editing context if the operation originated locally and `false` otherwise
 * - `after op (op, localContext)` Fired after an operation has been applied to
 *   the snapshot. The arguments are the same as for `before op`
 * - `op (op, localContext)` The same as `after op` unless incremental updates
 *   are enabled. In this case it is fired after every partial operation with
 *   this operation as the first argument. When fired the document is in a
 *   locked state which only allows reading operations.
 * - `subscribed (error)` The document was subscribed
 * - `created (localContext)` The document was created. That means its type was
 *   set and it has some initial data.
 * - `del (localContext, snapshot)` Fired after the document is deleted, that is
 *   the snapshot is null. It is passed the snapshot before delteion as an
 *   arguments
 * - `error`
 *
 * TODO rename `op` to `after partial op`
 */
var Doc = exports.Doc = function(connection, collection, name) {
  emitter.EventEmitter.call(this);

  this.connection = connection;

  this.collection = collection;
  this.name = name;

  this.version = this.type = null;
  this.snapshot = undefined;

  // **** State in document:

  // The action the document tries to perform with the server
  //
  // - subscribe
  // - unsubscribe
  // - fetch
  // - submit: send an operation
  this.action = null;

  // The data the document object stores can be in one of the following three states:
  //   - No data. (null) We honestly don't know whats going on.
  //   - Floating ('floating'): we have a locally created document that hasn't
  //     been created on the server yet)
  //   - Live ('ready') (we have data thats current on the server at some version).
  this.state = null;

  // Our subscription status. Either we're subscribed on the server, or we aren't.
  this.subscribed = false;
  // Either we want to be subscribed (true), we want a new snapshot from the
  // server ('fetch'), or we don't care (false). This is also used when we
  // disconnect & reconnect to decide what to do.
  this.wantSubscribe = false;
  // This list is used for subscribe and unsubscribe, since we'll only want to
  // do one thing at a time.
  this._subscribeCallbacks = [];


  // *** end state stuff.

  // This doesn't provide any standard API access right now.
  this.provides = {};

  // The editing contexts. These are usually instances of the type API when the
  // document is ready for edits.
  this.editingContexts = [];

  // The op that is currently roundtripping to the server, or null.
  //
  // When the connection reconnects, the inflight op is resubmitted.
  //
  // This has the same format as an entry in pendingData, which is:
  // {[create:{...}], [del:true], [op:...], callbacks:[...], src:, seq:}
  this.inflightData = null;

  // All ops that are waiting for the server to acknowledge this.inflightData
  // This used to just be a single operation, but creates & deletes can't be
  // composed with regular operations.
  //
  // This is a list of {[create:{...}], [del:true], [op:...], callbacks:[...]}
  this.pendingData = [];

  // The OT type of this document.
  //
  // The document also responds to the api provided by the type
  this.type = null;

  // For debouncing getLatestOps calls
  this._getLatestTimeout = null;
};
emitter.mixin(Doc);

/**
 * Unsubscribe and remove all editing contexts
 */
Doc.prototype.destroy = function(callback) {
  var doc = this;
  this.unsubscribe(function() {
    // Don't care if there's an error unsubscribing.

    if (doc.hasPending()) {
      doc.once('nothing pending', function() {
        doc.connection._destroyDoc(doc);
      });
    } else {
      doc.connection._destroyDoc(doc);
    }
    doc.removeContexts();
    if (callback) callback();
  });
};


// ****** Manipulating the document snapshot, version and type.

// Set the document's type, and associated properties. Most of the logic in
// this function exists to update the document based on any added & removed API
// methods.
//
// @param newType OT type provided by the ottypes library or its name or uri
Doc.prototype._setType = function(newType) {
  if (typeof newType === 'string') {
    if (!types[newType]) throw new Error("Missing type " + newType + ' ' + this.collection + ' ' + this.name);
    newType = types[newType];
  }
  this.removeContexts();

  // Set the new type
  this.type = newType;

  // If we removed the type from the object, also remove its snapshot.
  if (!newType) {
    this.provides = {};
    this.snapshot = undefined;
  } else if (newType.api) {
    // Register the new type's API.
    this.provides = newType.api.provides;
  }
};

// Injest snapshot data. This data must include a version, snapshot and type.
// This is used both to ingest data that was exported with a webpage and data
// that was received from the server during a fetch.
//
// @param data.v    version
// @param data.data
// @param data.type
// @fires ready
Doc.prototype.ingestData = function(data) {
  if (typeof data.v !== 'number') {
    throw new Error('Missing version in ingested data ' + this.collection + ' ' + this.name);
  }
  if (this.state) {
    // Silently ignore if doc snapshot version is equal or newer
    // TODO: Investigate whether this should happen in practice or not
    if (this.version >= data.v) return;
    console.warn('Ignoring ingest data for', this.collection, this.name,
      '\n  in state:', this.state, '\n  version:', this.version,
      '\n  snapshot:\n', this.snapshot, '\n  incoming data:\n', data);
    return;
  }

  this.version = data.v;
  // data.data is what the server will actually send. data.snapshot is the old
  // field name - supported now for backwards compatibility.
  this.snapshot = data.data;
  this._setType(data.type);

  this.state = 'ready';
  this.emit('ready');
};

// Get and return the current document snapshot.
Doc.prototype.getSnapshot = function() {
  return this.snapshot;
};

// The callback will be called at a time when the document has a snapshot and
// you can start applying operations. This may be immediately.
Doc.prototype.whenReady = function(fn) {
  if (this.state === 'ready') {
    fn();
  } else {
    this.once('ready', fn);
  }
};

Doc.prototype.hasPending = function() {
  return this.action != null || this.inflightData != null || !!this.pendingData.length;
};

Doc.prototype._emitNothingPending = function() {
  if (this.hasPending()) return;
  this.emit('nothing pending');
};


// **** Helpers for network messages

// This function exists so connection can call it directly for bulk subscribes.
// It could just make a temporary object literal, thats pretty slow.
Doc.prototype._handleSubscribe = function(err, data) {
  if (err && err !== 'Already subscribed') {
    console.error('Could not subscribe:', err, this.collection, this.name);
    this.emit('error', err);
    // There's probably a reason we couldn't subscribe. Don't retry.
    this._setWantSubscribe(false, null, err);
    return;
  }
  if (data) this.ingestData(data);
  this.subscribed = true;
  this._clearAction();
  this.emit('subscribe');
  this._finishSub();
};

// This is called by the connection when it receives a message for the document.
Doc.prototype._onMessage = function(msg) {
  if (!(msg.c === this.collection && msg.d === this.name)) {
    // This should never happen - its a sanity check for bugs in the connection code.
    var err = 'Got message for wrong document.';
    console.error(err, this.collection, this.name, msg);
    throw new Error(err);
  }

  // msg.a = the action.
  switch (msg.a) {
    case 'fetch':
      // We're done fetching. This message has no other information.
      if (msg.data) this.ingestData(msg.data);
      if (this.wantSubscribe === 'fetch') this.wantSubscribe = false;
      this._clearAction();
      this._finishSub(msg.error);
      break;

    case 'sub':
      // Subscribe reply.
      this._handleSubscribe(msg.error, msg.data);
      break;

    case 'unsub':
      // Unsubscribe reply
      this.subscribed = false;
      this.emit('unsubscribe');

      this._clearAction();
      this._finishSub(msg.error);
      break;

    case 'ack':
      // Acknowledge a locally submitted operation.
      //
      // Usually we do nothing here - all the interesting logic happens when we
      // get sent our op back in the op stream (which happens even if we aren't
      // subscribed)
      if (msg.error && msg.error !== 'Op already submitted') {
        // The server has rejected an op from the client for an unexpected reason.
        // We'll send the error message to the user and try to roll back the change.
        if (this.inflightData) {
          console.warn('Operation was rejected (' + msg.error + '). Trying to rollback change locally.');
          this._tryRollback(this.inflightData);
          this._clearInflightOp(msg.error);
        } else {
          // I managed to get into this state once. I'm not sure how it happened.
          // The op was maybe double-acknowledged?
          console.warn('Second acknowledgement message (error) received', msg, this);
        }
      }
      break;

    case 'op':
      if (this.inflightData &&
          msg.src === this.inflightData.src &&
          msg.seq === this.inflightData.seq) {
        // This one is mine. Accept it as acknowledged.
        this._opAcknowledged(msg);
        break;
      }

      if (this.version == null || msg.v > this.version) {
        // This will happen in normal operation if we become subscribed to a
        // new document via a query. It can also happen if we get an op for
        // a future version beyond the version we are expecting next. This
        // could happen if the server doesn't publish an op for whatever reason
        // or because of a race condition. In any case, we can send a fetch
        // command to catch back up.
        this._getLatestOps();
        break;
      }

      if (msg.v < this.version) {
        // This will happen naturally in the following (or similar) cases:
        //
        // Client is not subscribed to document.
        // -> client submits an operation (v=10)
        // -> client subscribes to a query which matches this document. Says we
        //    have v=10 of the doc.
        //
        // <- server acknowledges the operation (v=11). Server acknowledges the
        //    operation because the doc isn't subscribed
        // <- server processes the query, which says the client only has v=10.
        //    Server subscribes at v=10 not v=11, so we get another copy of the
        //    v=10 operation.
        //
        // In this case, we can safely ignore the old (duplicate) operation.
        break;
      }

      if (this.inflightData) xf(this.inflightData, msg);

      for (var i = 0; i < this.pendingData.length; i++) {
        xf(this.pendingData[i], msg);
      }

      this.version++;
      this._otApply(msg, false);
      break;

    case 'meta':
      console.warn('Unhandled meta op:', msg);
      break;

    default:
      console.warn('Unhandled document message:', msg);
      break;
  }
};

Doc.prototype._getLatestOps = function() {
  var doc = this;
  var debounced = false;
  if (doc._getLatestTimeout) {
    debounced = true;
  } else {
    // Send a fetch command, which will get us the missing ops to catch back up
    // or the full doc if our version is currently null
    doc.connection.sendFetch(doc, doc.version);
  }
  // Debounce calls, since we are likely to get multiple future operations
  // in a rapid sequence
  clearTimeout(doc._getLatestTimeout);
  doc._getLatestTimeout = setTimeout(function() {
    doc._getLatestTimeout = null;
    // Send another fetch at the end of the final timeout interval if we were
    // debounced to make sure we didn't miss anything
    if (debounced) {
      doc.connection.sendFetch(doc, doc.version);
    }
  }, 5000);
  return;
};

// Called whenever (you guessed it!) the connection state changes. This will
// happen when we get disconnected & reconnect.
Doc.prototype._onConnectionStateChanged = function() {
  if (this.connection.canSend) {
    this.flush();
  } else {
    this.subscribed = false;
    this._clearAction();
  }
};

Doc.prototype._clearAction = function() {
  this.action = null;
  this.flush();
  this._emitNothingPending();
};

// Send the next pending op to the server, if we can.
//
// Only one operation can be in-flight at a time. If an operation is already on
// its way, or we're not currently connected, this method does nothing.
Doc.prototype.flush = function() {
  // Ignore if we can't send or we are already sending an op
  if (!this.connection.canSend || this.inflightData) return;

  // Pump and dump any no-ops from the front of the pending op list.
  var opData;
  while (this.pendingData.length && isNoOp(opData = this.pendingData[0])) {
    var callbacks = opData.callbacks;
    for (var i = 0; i < callbacks.length; i++) {
      callbacks[i](opData.error);
    }
    this.pendingData.shift();
  }

  // Send first pending op unless paused
  if (!this.paused && this.pendingData.length) {
    this._sendOpData();
    return;
  }

  // Ignore if an action is already in process
  if (this.action) return;
  // Once all ops are sent, perform subscriptions and fetches
  var version = (this.state === 'ready') ? this.version : null;

  if (this.subscribed && !this.wantSubscribe) {
    this.action = 'unsubscribe';
    this.connection.sendUnsubscribe(this);

  } else if (!this.subscribed && this.wantSubscribe === 'fetch') {
    this.action = 'fetch';
    this.connection.sendFetch(this, version);

  } else if (!this.subscribed && this.wantSubscribe) {
    this.action = 'subscribe';
    this.connection.sendSubscribe(this, version);
  }
};


// ****** Subscribing, unsubscribing and fetching

// Value is true, false or 'fetch'.
Doc.prototype._setWantSubscribe = function(value, callback, err) {
  if (this.subscribed === this.wantSubscribe &&
      (this.subscribed === value || value === 'fetch' && this.subscribed)) {
    if (callback) callback(err);
    return;
  }

  // If we want to subscribe, don't weaken it to a fetch.
  if (value !== 'fetch' || this.wantSubscribe !== true) {
    this.wantSubscribe = value;
  }

  if (callback) this._subscribeCallbacks.push(callback);
  this.flush();
};

// Open the document. There is no callback and no error handling if you're
// already connected.
//
// Only call this once per document.
Doc.prototype.subscribe = function(callback) {
  this._setWantSubscribe(true, callback);
};

// Unsubscribe. The data will stay around in local memory, but we'll stop
// receiving updates.
Doc.prototype.unsubscribe = function(callback) {
  this._setWantSubscribe(false, callback);
};

// Call to request fresh data from the server.
Doc.prototype.fetch = function(callback) {
  this._setWantSubscribe('fetch', callback);
};

// Called when our subscribe, fetch or unsubscribe messages are acknowledged.
Doc.prototype._finishSub = function(err) {
  if (!this._subscribeCallbacks.length) return;
  for (var i = 0; i < this._subscribeCallbacks.length; i++) {
    this._subscribeCallbacks[i](err);
  }
  this._subscribeCallbacks.length = 0;
};


// Operations


// ************ Dealing with operations.

// Helper function to set opData to contain a no-op.
var setNoOp = function(opData) {
  delete opData.op;
  delete opData.create;
  delete opData.del;
};

var isNoOp = function(opData) {
  return !opData.op && !opData.create && !opData.del;
}

// Try to compose data2 into data1. Returns truthy if it succeeds, otherwise falsy.
var tryCompose = function(type, data1, data2) {
  if (data1.create && data2.del) {
    setNoOp(data1);
  } else if (data1.create && data2.op) {
    // Compose the data into the create data.
    var data = (data1.create.data === undefined) ? type.create() : data1.create.data;
    data1.create.data = type.apply(data, data2.op);
  } else if (isNoOp(data1)) {
    data1.create = data2.create;
    data1.del = data2.del;
    data1.op = data2.op;
  } else if (data1.op && data2.op && type.compose) {
    data1.op = type.compose(data1.op, data2.op);
  } else {
    return false;
  }
  return true;
};

// Transform server op data by a client op, and vice versa. Ops are edited in place.
var xf = function(client, server) {
  // In this case, we're in for some fun. There are some local operations
  // which are totally invalid - either the client continued editing a
  // document that someone else deleted or a document was created both on the
  // client and on the server. In either case, the local document is way
  // invalid and the client's ops are useless.
  //
  // The client becomes a no-op, and we keep the server op entirely.
  if (server.create || server.del) return setNoOp(client);
  if (client.create) throw new Error('Invalid state. This is a bug. ' + this.collection + ' ' + this.name);

  // The client has deleted the document while the server edited it. Kill the
  // server's op.
  if (client.del) return setNoOp(server);

  // We only get here if either the server or client ops are no-op. Carry on,
  // nothing to see here.
  if (!server.op || !client.op) return;

  // They both edited the document. This is the normal case for this function -
  // as in, most of the time we'll end up down here.
  //
  // You should be wondering why I'm using client.type instead of this.type.
  // The reason is, if we get ops at an old version of the document, this.type
  // might be undefined or a totally different type. By pinning the type to the
  // op data, we make sure the right type has its transform function called.
  if (client.type.transformX) {
    var result = client.type.transformX(client.op, server.op);
    client.op = result[0];
    server.op = result[1];
  } else {
    var _c = client.type.transform(client.op, server.op, 'left');
    var _s = client.type.transform(server.op, client.op, 'right');
    client.op = _c; server.op = _s;
  }
};

/**
 * Applies the operation to the snapshot
 *
 * If the operation is create or delete it emits `create` or `del`.  Then the
 * operation is applied to the snapshot and `op` and `after op` are emitted.  If
 * the type supports incremental updates and `this.incremental` is true we fire
 * `op` after every small operation.
 *
 * This is the only function to fire the above mentioned events.
 *
 * @private
 */
Doc.prototype._otApply = function(opData, context) {
  this.locked = true;

  if (opData.create) {
    // If the type is currently set, it means we tried creating the document
    // and someone else won. client create x server create = server create.
    var create = opData.create;
    this._setType(create.type);
    this.snapshot = this.type.create(create.data);

    // This is a bit heavyweight, but I want the created event to fire outside of the lock.
    this.once('unlock', function() {
      this.emit('create', context);
    });
  } else if (opData.del) {
    // The type should always exist in this case. del x _ = del
    var oldSnapshot = this.snapshot;
    this._setType(null);
    this.once('unlock', function() {
      this.emit('del', context, oldSnapshot);
    });
  } else if (opData.op) {
    if (!this.type) throw new Error('Document does not exist. ' + this.collection + ' ' + this.name);

    var type = this.type;

    var op = opData.op;

    // The context needs to be told we're about to edit, just in case it needs
    // to store any extra data. (text-tp2 has this constraint.)
    for (var i = 0; i < this.editingContexts.length; i++) {
      var c = this.editingContexts[i];
      if (c != context && c._beforeOp) c._beforeOp(opData.op);
    }

    this.emit('before op', op, context);

    // This exists so clients can pull any necessary data out of the snapshot
    // before it gets changed.  Previously we kept the old snapshot object and
    // passed it to the op event handler. However, apply no longer guarantees
    // the old object is still valid.
    //
    // Because this could be totally unnecessary work, its behind a flag. set
    // doc.incremental to enable.
    if (this.incremental && type.incrementalApply) {
      var _this = this;
      type.incrementalApply(this.snapshot, op, function(o, snapshot) {
        _this.snapshot = snapshot;
        _this.emit('op', o, context);
      });
    } else {
      // This is the most common case, simply applying the operation to the local snapshot.
      this.snapshot = type.apply(this.snapshot, op);
      this.emit('op', op, context);
    }
  }
  // Its possible for none of the above cases to match, in which case the op is
  // a no-op. This will happen when a document has been deleted locally and
  // remote ops edit the document.


  this.locked = false;
  this.emit('unlock');

  if (opData.op) {
    var contexts = this.editingContexts;
    // Notify all the contexts about the op (well, all the contexts except
    // the one which initiated the submit in the first place).
    // NOTE Handle this with events?
    for (var i = 0; i < contexts.length; i++) {
      var c = contexts[i];
      if (c != context && c._onOp) c._onOp(opData.op);
    }
    for (var i = 0; i < contexts.length; i++) {
      if (contexts[i].shouldBeRemoved) contexts.splice(i--, 1);
    }

    return this.emit('after op', opData.op, context);
  }
};



// ***** Sending operations

Doc.prototype.retry = function() {
  if (!this.inflightData) return;
  var threshold = 5000 * Math.pow(2, this.inflightData.retries);
  if (this.inflightData.sentAt < Date.now() - threshold) {
    this.connection.emit('retry', this);
    this._sendOpData();
  }
};

// Actually send op data to the server.
Doc.prototype._sendOpData = function() {
  // Wait until we have a src id from the server
  var src = this.connection.id;
  if (!src) return;

  // When there is no inflightData, send the first item in pendingData. If
  // there is inflightData, try sending it again
  if (!this.inflightData) {
    // Send first pending op
    this.inflightData = this.pendingData.shift();
  }
  var data = this.inflightData;
  if (!data) {
    throw new Error('no data to send on call to _sendOpData');
  }

  // Track data for retrying ops
  data.sentAt = Date.now();
  data.retries = (data.retries == null) ? 0 : data.retries + 1;

  // The src + seq number is a unique ID representing this operation. This tuple
  // is used on the server to detect when ops have been sent multiple times and
  // on the client to match acknowledgement of an op back to the inflightData.
  // Note that the src could be different from this.connection.id after a
  // reconnect, since an op may still be pending after the reconnection and
  // this.connection.id will change. In case an op is sent multiple times, we
  // also need to be careful not to override the original seq value.
  if (data.seq == null) data.seq = this.connection.seq++;

  this.connection.sendOp(this, data);

  // src isn't needed on the first try, since the server session will have the
  // same id, but it must be set on the inflightData in case it is sent again
  // after a reconnect and the connection's id has changed by then
  if (data.src == null) data.src = src;
};


// Queues the operation for submission to the server and applies it locally.
//
// Internal method called to do the actual work for submitOp(), create() and del().
// @private
//
// @param opData
// @param [opData.op]
// @param [opData.del]
// @param [opData.create]
// @param [context] the editing context
// @param [callback] called when operation is submitted
Doc.prototype._submitOpData = function(opData, context, callback) {
  if (typeof context === 'function') {
    callback = context;
    context = true; // The default context is true.
  }
  if (context == null) context = true;

  if (this.locked) {
    var err = "Cannot call submitOp from inside an 'op' event handler. " + this.collection + ' ' + this.name;
    if (callback) return callback(err);
    throw new Error(err);
  }

  // The opData contains either op, create, delete, or none of the above (a no-op).
  if (opData.op) {
    if (!this.type) {
      var err = 'Document has not been created';
      if (callback) return callback(err);
      throw new Error(err);
    }
    // Try to normalize the op. This removes trailing skip:0's and things like that.
    if (this.type.normalize) opData.op = this.type.normalize(opData.op);
  }

  if (!this.state) {
    this.state = 'floating';
  }

  opData.type = this.type;
  opData.callbacks = [];

  // If the type supports composes, try to compose the operation onto the end
  // of the last pending operation.
  var operation;
  var previous = this.pendingData[this.pendingData.length - 1];

  if (previous && tryCompose(this.type, previous, opData)) {
    operation = previous;
  } else {
    operation = opData;
    this.pendingData.push(opData);
  }
  if (callback) operation.callbacks.push(callback);

  this._otApply(opData, context);

  // The call to flush is in a timeout so if submitOp() is called multiple
  // times in a closure all the ops are combined before being sent to the
  // server. It doesn't matter if flush is called a bunch of times.
  var _this = this;
  setTimeout((function() { _this.flush(); }), 0);
};


// *** Client OT entrypoints.

// Submit an operation to the document.
//
// @param operation handled by the OT type
// @param [context] editing context
// @param [callback] called after operation submitted
//
// @fires before op, op, after op
Doc.prototype.submitOp = function(op, context, callback) {
  this._submitOpData({op: op}, context, callback);
};

// Create the document, which in ShareJS semantics means to set its type. Every
// object implicitly exists in the database but has no data and no type. Create
// sets the type of the object and can optionally set some initial data on the
// object, depending on the type.
//
// @param type  OT type
// @param data  initial
// @param context  editing context
// @param callback  called when operation submitted
Doc.prototype.create = function(type, data, context, callback) {
  if (typeof data === 'function') {
    // Setting the context to be the callback function in this case so _submitOpData
    // can handle the default value thing.
    context = data;
    data = undefined;
  }

  if (this.type) {
    var err = 'Document already exists';
    if (callback) return callback(err);
    throw new Error(err);
  }

  var op = {create: {type:type, data:data}};
  this._submitOpData(op, context, callback);
};

// Delete the document. This creates and submits a delete operation to the
// server. Deleting resets the object's type to null and deletes its data. The
// document still exists, and still has the version it used to have before you
// deleted it (well, old version +1).
//
// @param context   editing context
// @param callback  called when operation submitted
Doc.prototype.del = function(context, callback) {
  if (!this.type) {
    var err = 'Document does not exist';
    if (callback) return callback(err);
    throw new Error(err);
  }

  this._submitOpData({del: true}, context, callback);
};


// Stops the document from sending any operations to the server.
Doc.prototype.pause = function() {
  this.paused = true;
};

// Continue sending operations to the server
Doc.prototype.resume = function() {
  this.paused = false;
  this.flush();
};


// *** Receiving operations


// This will be called when the server rejects our operations for some reason.
// There's not much we can do here if the OT type is noninvertable, but that
// shouldn't happen too much in real life because readonly documents should be
// flagged as such. (I should probably figure out a flag for that).
//
// This does NOT get called if our op fails to reach the server for some reason
// - we optimistically assume it'll make it there eventually.
Doc.prototype._tryRollback = function(opData) {
  // This is probably horribly broken.
  if (opData.create) {
    this._setType(null);

    // I don't think its possible to get here if we aren't in a floating state.
    if (this.state === 'floating')
      this.state = null;
    else
      console.warn('Rollback a create from state ' + this.state);

  } else if (opData.op && opData.type.invert) {
    opData.op = opData.type.invert(opData.op);

    // Transform the undo operation by any pending ops.
    for (var i = 0; i < this.pendingData.length; i++) {
      xf(this.pendingData[i], opData);
    }

    // ... and apply it locally, reverting the changes.
    //
    // This operation is applied to look like it comes from a remote context.
    // I'm still not 100% sure about this functionality, because its really a
    // local op. Basically, the problem is that if the client's op is rejected
    // by the server, the editor window should update to reflect the undo.
    this._otApply(opData, false);
  } else if (opData.op || opData.del) {
    // This is where an undo stack would come in handy.
    this._setType(null);
    this.version = null;
    this.state = null;
    this.subscribed = false;
    this.emit('error', "Op apply failed and the operation could not be reverted");

    // Trigger a fetch. In our invalid state, we can't really do anything.
    this.fetch();
    this.flush();
  }
};

Doc.prototype._clearInflightOp = function(error) {
  var callbacks = this.inflightData.callbacks;
  for (var i = 0; i < callbacks.length; i++) {
    callbacks[i](error || this.inflightData.error);
  }

  this.inflightData = null;
  this.flush();
  this._emitNothingPending();
};

// This is called when the server acknowledges an operation from the client.
Doc.prototype._opAcknowledged = function(msg) {
  // Our inflight op has been acknowledged, so we can throw away the inflight data.
  // (We were only holding on to it incase we needed to resend the op.)
  if (!this.state) {
    throw new Error('opAcknowledged called from a null state. This should never happen. ' + this.collection + ' ' + this.name);
  } else if (this.state === 'floating') {
    if (!this.inflightData.create) throw new Error('Cannot acknowledge an op. ' + this.collection + ' ' + this.name);

    // Our create has been acknowledged. This is the same as ingesting some data.
    this.version = msg.v;
    this.state = 'ready';
    var _this = this;
    setTimeout(function() { _this.emit('ready'); }, 0);
  } else {
    // We already have a snapshot. The snapshot should be at the acknowledged
    // version, because the server has sent us all the ops that have happened
    // before acknowledging our op.

    // This should never happen - something is out of order.
    if (msg.v !== this.version) {
      throw new Error('Invalid version from server. This can happen when you submit ops in a submitOp callback. Expected: ' + this.version + ' Message version: ' + msg.v + ' ' + this.collection + ' ' + this.name);
    }
  }

  // The op was committed successfully. Increment the version number
  this.version++;

  this._clearInflightOp();
};


// Creates an editing context
//
// The context is an object responding to getSnapshot(), submitOp() and
// destroy(). It also has all the methods from the OT type mixed in.
// If the document is destroyed, the detach() method is called on the context.
Doc.prototype.createContext = function() {
  var type = this.type;
  if (!type) throw new Error('Missing type ' + this.collection + ' ' + this.name);

  // I could use the prototype chain to do this instead, but Object.create
  // isn't defined on old browsers. This will be fine.
  var doc = this;
  var context = {
    getSnapshot: function() {
      return doc.snapshot;
    },
    submitOp: function(op, callback) {
      doc.submitOp(op, context, callback);
    },
    destroy: function() {
      if (this.detach) {
        this.detach();
        // Don't double-detach.
        delete this.detach;
      }
      // It will be removed from the actual editingContexts list next time
      // we receive an op on the document (and the list is iterated through).
      //
      // This is potentially dodgy, allowing a memory leak if you create &
      // destroy a whole bunch of contexts without receiving or sending any ops
      // to the document.
      //
      // NOTE Why can't we destroy contexts immediately?
      delete this._onOp;
      this.shouldBeRemoved = true;
    },

    // This is dangerous, but really really useful for debugging. I hope people
    // don't depend on it.
    _doc: this,
  };

  if (type.api) {
    // Copy everything else from the type's API into the editing context.
    for (var k in type.api) {
      context[k] = type.api[k];
    }
  } else {
    context.provides = {};
  }

  this.editingContexts.push(context);

  return context;
};


/**
 * Destroy all editing contexts
 */
Doc.prototype.removeContexts = function() {
  for (var i = 0; i < this.editingContexts.length; i++) {
    this.editingContexts[i].destroy();
  }
  this.editingContexts.length = 0;
};

},{"../types":78,"./emitter":74}],74:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter;

exports.EventEmitter = EventEmitter;
exports.mixin = mixin;

function mixin(Constructor) {
  for (var key in EventEmitter.prototype) {
    Constructor.prototype[key] = EventEmitter.prototype[key];
  }
}

},{"events":22}],75:[function(require,module,exports){
// Entry point for the client
//
// Usage:
//
//    <script src="dist/share.js"></script>

exports.Connection = require('./connection').Connection;
exports.Doc = require('./doc').Doc;
require('./textarea');

var types = require('../types');
exports.ottypes = types.ottypes;
exports.registerType = types.registerType;

},{"../types":78,"./connection":72,"./doc":73,"./textarea":77}],76:[function(require,module,exports){
var emitter = require('./emitter');

// Queries are live requests to the database for particular sets of fields.
//
// The server actively tells the client when there's new data that matches
// a set of conditions.
var Query = exports.Query = function(type, connection, id, collection, query, options, callback) {
  emitter.EventEmitter.call(this);

  // 'fetch' or 'sub'
  this.type = type;

  this.connection = connection;
  this.id = id;
  this.collection = collection;

  // The query itself. For mongo, this should look something like {"data.x":5}
  this.query = query;

  // Resultant document action for the server. Fetch mode will automatically
  // fetch all results. Subscribe mode will automatically subscribe all
  // results. Results are never unsubscribed.
  this.docMode = options.docMode; // undefined, 'fetch' or 'sub'.
  if (this.docMode === 'subscribe') this.docMode = 'sub';

  // Do we repoll the entire query whenever anything changes? (As opposed to
  // just polling the changed item). This needs to be enabled to be able to use
  // ordered queries (sortby:) and paginated queries. Set to undefined, it will
  // be enabled / disabled automatically based on the query's properties.
  this.poll = options.poll;

  // The backend we actually hit. If this isn't defined, it hits the snapshot
  // database. Otherwise this can be used to hit another configured query
  // index.
  this.backend = options.backend || options.source;

  // A list of resulting documents. These are actual documents, complete with
  // data and all the rest. If fetch is false, these documents will not
  // have any data. You should manually call fetch() or subscribe() on them.
  //
  // Calling subscribe() might be a good idea anyway, as you won't be
  // subscribed to the documents by default.
  this.knownDocs = options.knownDocs || [];
  this.results = [];

  // Do we have some initial data?
  this.ready = false;

  this.callback = callback;
};
emitter.mixin(Query);

Query.prototype.action = 'qsub';

// Helper for subscribe & fetch, since they share the same message format.
//
// This function actually issues the query.
Query.prototype._execute = function() {
  if (!this.connection.canSend) return;

  if (this.docMode) {
    var collectionVersions = {};
    // Collect the version of all the documents in the current result set so we
    // don't need to be sent their snapshots again.
    for (var i = 0; i < this.knownDocs.length; i++) {
      var doc = this.knownDocs[i];
      if (doc.version == null) continue;
      var c = collectionVersions[doc.collection] =
        (collectionVersions[doc.collection] || {});
      c[doc.name] = doc.version;
    }
  }

  var msg = {
    a: 'q' + this.type,
    id: this.id,
    c: this.collection,
    o: {},
    q: this.query,
  };

  if (this.docMode) {
    msg.o.m = this.docMode;
    // This should be omitted if empty, but whatever.
    msg.o.vs = collectionVersions;
  }
  if (this.backend != null) msg.o.b = this.backend;
  if (this.poll !== undefined) msg.o.p = this.poll;

  this.connection.send(msg);
};

// Make a list of documents from the list of server-returned data objects
Query.prototype._dataToDocs = function(data) {
  var results = [];
  var lastType;
  for (var i = 0; i < data.length; i++) {
    var docData = data[i];

    // Types are only put in for the first result in the set and every time the type changes in the list.
    if (docData.type) {
      lastType = docData.type;
    } else {
      docData.type = lastType;
    }

    // This will ultimately call doc.ingestData(), which is what populates
    // the doc snapshot and version with the data returned by the query
    var doc = this.connection.get(docData.c || this.collection, docData.d, docData);
    results.push(doc);
  }
  return results;
};

// Destroy the query object. Any subsequent messages for the query will be
// ignored by the connection. You should unsubscribe from the query before
// destroying it.
Query.prototype.destroy = function() {
  if (this.connection.canSend && this.type === 'sub') {
    this.connection.send({a:'qunsub', id:this.id});
  }

  this.connection._destroyQuery(this);
};

Query.prototype._onConnectionStateChanged = function(state, reason) {
  if (this.connection.state === 'connecting') {
    this._execute();
  }
};

// Internal method called from connection to pass server messages to the query.
Query.prototype._onMessage = function(msg) {
  if ((msg.a === 'qfetch') !== (this.type === 'fetch')) {
    console.warn('Invalid message sent to query', msg, this);
    return;
  }

  if (msg.error) this.emit('error', msg.error);

  switch (msg.a) {
    case 'qfetch':
      var results = msg.data ? this._dataToDocs(msg.data) : undefined;
      if (this.callback) this.callback(msg.error, results, msg.extra);
      // Once a fetch query gets its data, it is destroyed.
      this.connection._destroyQuery(this);
      break;

    case 'q':
      // Query diff data (inserts and removes)
      if (msg.diff) {
        // We need to go through the list twice. First, we'll ingest all the
        // new documents and set them as subscribed.  After that we'll emit
        // events and actually update our list. This avoids race conditions
        // around setting documents to be subscribed & unsubscribing documents
        // in event callbacks.
        for (var i = 0; i < msg.diff.length; i++) {
          var d = msg.diff[i];
          if (d.type === 'insert') d.values = this._dataToDocs(d.values);
        }

        for (var i = 0; i < msg.diff.length; i++) {
          var d = msg.diff[i];
          switch (d.type) {
            case 'insert':
              var newDocs = d.values;
              Array.prototype.splice.apply(this.results, [d.index, 0].concat(newDocs));
              this.emit('insert', newDocs, d.index);
              break;
            case 'remove':
              var howMany = d.howMany || 1;
              var removed = this.results.splice(d.index, howMany);
              this.emit('remove', removed, d.index);
              break;
            case 'move':
              var howMany = d.howMany || 1;
              var docs = this.results.splice(d.from, howMany);
              Array.prototype.splice.apply(this.results, [d.to, 0].concat(docs));
              this.emit('move', docs, d.from, d.to);
              break;
          }
        }
      }

      if (msg.extra !== void 0) {
        this.emit('extra', msg.extra);
      }
      break;
    case 'qsub':
      // This message replaces the entire result set with the set passed.
      if (!msg.error) {
        var previous = this.results;

        // Then add everything in the new result set.
        this.results = this.knownDocs = this._dataToDocs(msg.data);
        this.extra = msg.extra;

        this.ready = true;
        this.emit('change', this.results, previous);
      }
      if (this.callback) {
        this.callback(msg.error, this.results, this.extra);
        delete this.callback;
      }
      break;
  }
};

// Change the thing we're searching for. This isn't fully supported on the
// backend (it destroys the old query and makes a new one) - but its
// programatically useful and I might add backend support at some point.
Query.prototype.setQuery = function(q) {
  if (this.type !== 'sub') throw new Error('cannot change a fetch query');

  this.query = q;
  if (this.connection.canSend) {
    // There's no 'change' message to send to the server. Just resubscribe.
    this.connection.send({a:'qunsub', id:this.id});
    this._execute();
  }
};

},{"./emitter":74}],77:[function(require,module,exports){
/* This contains the textarea binding for ShareJS. This binding is really
 * simple, and a bit slow on big documents (Its O(N). However, it requires no
 * changes to the DOM and no heavy libraries like ace. It works for any kind of
 * text input field.
 *
 * You probably want to use this binding for small fields on forms and such.
 * For code editors or rich text editors or whatever, I recommend something
 * heavier.
 */

 var Doc = require('./doc').Doc;

/* applyChange creates the edits to convert oldval -> newval.
 *
 * This function should be called every time the text element is changed.
 * Because changes are always localised, the diffing is quite easy. We simply
 * scan in from the start and scan in from the end to isolate the edited range,
 * then delete everything that was removed & add everything that was added.
 * This wouldn't work for complex changes, but this function should be called
 * on keystroke - so the edits will mostly just be single character changes.
 * Sometimes they'll paste text over other text, but even then the diff
 * generated by this algorithm is correct.
 *
 * This algorithm is O(N). I suspect you could speed it up somehow using regular expressions.
 */
var applyChange = function(ctx, oldval, newval) {
  // Strings are immutable and have reference equality. I think this test is O(1), so its worth doing.
  if (oldval === newval) return;

  var commonStart = 0;
  while (oldval.charAt(commonStart) === newval.charAt(commonStart)) {
    commonStart++;
  }

  var commonEnd = 0;
  while (oldval.charAt(oldval.length - 1 - commonEnd) === newval.charAt(newval.length - 1 - commonEnd) &&
      commonEnd + commonStart < oldval.length && commonEnd + commonStart < newval.length) {
    commonEnd++;
  }

  if (oldval.length !== commonStart + commonEnd) {
    ctx.remove(commonStart, oldval.length - commonStart - commonEnd);
  }
  if (newval.length !== commonStart + commonEnd) {
    ctx.insert(commonStart, newval.slice(commonStart, newval.length - commonEnd));
  }
};

// Attach a textarea to a document's editing context.
//
// The context is optional, and will be created from the document if its not
// specified.
Doc.prototype.attachTextarea = function(elem, ctx) {
  if (!ctx) ctx = this.createContext();

  if (!ctx.provides.text) throw new Error('Cannot attach to non-text document');

  elem.value = ctx.get();

  // The current value of the element's text is stored so we can quickly check
  // if its been changed in the event handlers. This is mostly for browsers on
  // windows, where the content contains \r\n newlines. applyChange() is only
  // called after the \r\n newlines are converted, and that check is quite
  // slow. So we also cache the string before conversion so we can do a quick
  // check incase the conversion isn't needed.
  var prevvalue;

  // Replace the content of the text area with newText, and transform the
  // current cursor by the specified function.
  var replaceText = function(newText, transformCursor) {
    if (transformCursor) {
      var newSelection = [transformCursor(elem.selectionStart), transformCursor(elem.selectionEnd)];
    }

    // Fixate the window's scroll while we set the element's value. Otherwise
    // the browser scrolls to the element.
    var scrollTop = elem.scrollTop;
    elem.value = newText;
    prevvalue = elem.value; // Not done on one line so the browser can do newline conversion.
    if (elem.scrollTop !== scrollTop) elem.scrollTop = scrollTop;

    // Setting the selection moves the cursor. We'll just have to let your
    // cursor drift if the element isn't active, though usually users don't
    // care.
    if (newSelection && window.document.activeElement === elem) {
      elem.selectionStart = newSelection[0];
      elem.selectionEnd = newSelection[1];
    }
  };

  replaceText(ctx.get());


  // *** remote -> local changes

  ctx.onInsert = function(pos, text) {
    var transformCursor = function(cursor) {
      return pos < cursor ? cursor + text.length : cursor;
    };

    // Remove any window-style newline characters. Windows inserts these, and
    // they mess up the generated diff.
    var prev = elem.value.replace(/\r\n/g, '\n');
    replaceText(prev.slice(0, pos) + text + prev.slice(pos), transformCursor);
  };

  ctx.onRemove = function(pos, length) {
    var transformCursor = function(cursor) {
      // If the cursor is inside the deleted region, we only want to move back to the start
      // of the region. Hence the Math.min.
      return pos < cursor ? cursor - Math.min(length, cursor - pos) : cursor;
    };

    var prev = elem.value.replace(/\r\n/g, '\n');
    replaceText(prev.slice(0, pos) + prev.slice(pos + length), transformCursor);
  };


  // *** local -> remote changes

  // This function generates operations from the changed content in the textarea.
  var genOp = function(event) {
    // In a timeout so the browser has time to propogate the event's changes to the DOM.
    setTimeout(function() {
      if (elem.value !== prevvalue) {
        prevvalue = elem.value;
        applyChange(ctx, ctx.get(), elem.value.replace(/\r\n/g, '\n'));
      }
    }, 0);
  };

  var eventNames = ['textInput', 'keydown', 'keyup', 'select', 'cut', 'paste'];
  for (var i = 0; i < eventNames.length; i++) {
    var e = eventNames[i];
    if (elem.addEventListener) {
      elem.addEventListener(e, genOp, false);
    } else {
      elem.attachEvent('on' + e, genOp);
    }
  }

  ctx.detach = function() {
    for (var i = 0; i < eventNames.length; i++) {
      var e = eventNames[i];
      if (elem.removeEventListener) {
        elem.removeEventListener(e, genOp, false);
      } else {
        elem.detachEvent('on' + e, genOp);
      }
    }
  };

  return ctx;
};

},{"./doc":73}],78:[function(require,module,exports){

exports.ottypes = {};
exports.registerType = function(type) {
  if (type.name) exports.ottypes[type.name] = type;
  if (type.uri) exports.ottypes[type.uri] = type;
};

exports.registerType(require('ot-json0').type);
exports.registerType(require('ot-text').type);
exports.registerType(require('ot-text-tp2').type);

// The types register themselves on their respective types.
require('./text-api');
require('./text-tp2-api');

// The JSON API is buggy!! Please submit a pull request fixing it if you want to use it.
//require('./json-api');

},{"./text-api":79,"./text-tp2-api":80,"ot-json0":24,"ot-text":30,"ot-text-tp2":27}],79:[function(require,module,exports){
// Text document API for the 'text' type.

// The API implements the standard text API methods. In particular:
//
// - getLength() returns the length of the document in characters
// - getText() returns a string of the document
// - insert(pos, text, [callback]) inserts text at position pos in the document
// - remove(pos, length, [callback]) removes length characters at position pos
//
// Events are implemented by just adding the appropriate methods to your
// context object.
// onInsert(pos, text): Called when text is inserted.
// onRemove(pos, length): Called when text is removed.

var type = require('ot-text').type;

type.api = {
  provides: {text: true},

  // Returns the number of characters in the string
  getLength: function() { return this.getSnapshot().length; },


  // Returns the text content of the document
  get: function() { return this.getSnapshot(); },

  getText: function() {
    console.warn("`getText()` is deprecated; use `get()` instead.");
    return this.get();
  },

  // Insert the specified text at the given position in the document
  insert: function(pos, text, callback) {
    return this.submitOp([pos, text], callback);
  },

  remove: function(pos, length, callback) {
    return this.submitOp([pos, {d:length}], callback);
  },

  // When you use this API, you should implement these two methods
  // in your editing context.
  //onInsert: function(pos, text) {},
  //onRemove: function(pos, removedLength) {},

  _onOp: function(op) {
    var pos = 0;
    var spos = 0;
    for (var i = 0; i < op.length; i++) {
      var component = op[i];
      switch (typeof component) {
        case 'number':
          pos += component;
          spos += component;
          break;
        case 'string':
          if (this.onInsert) this.onInsert(pos, component);
          pos += component.length;
          break;
        case 'object':
          if (this.onRemove) this.onRemove(pos, component.d);
          spos += component.d;
      }
    }
  }
};

},{"ot-text":30}],80:[function(require,module,exports){
// Text document API for text-tp2

var type = require('ot-text-tp2').type;
var takeDoc = type._takeDoc;
var append = type._append;

var appendSkipChars = function(op, doc, pos, maxlength) {
  while ((maxlength == null || maxlength > 0) && pos.index < doc.data.length) {
    var part = takeDoc(doc, pos, maxlength, true);
    if (maxlength != null && typeof part === 'string') {
      maxlength -= part.length;
    }
    append(op, part.length || part);
  }
};

type.api = {
  provides: {text: true},

  // Number of characters in the string
  getLength: function() { return this.getSnapshot().charLength; },

  // Flatten the document into a string
  get: function() {
    var snapshot = this.getSnapshot();
    var strings = [];

    for (var i = 0; i < snapshot.data.length; i++) {
      var elem = snapshot.data[i];
      if (typeof elem == 'string') {
        strings.push(elem);
      }
    }

    return strings.join('');
  },

  getText: function() {
    console.warn("`getText()` is deprecated; use `get()` instead.");
    return this.get();
  },

  // Insert text at pos
  insert: function(pos, text, callback) {
    if (pos == null) pos = 0;

    var op = [];
    var docPos = {index: 0, offset: 0};
    var snapshot = this.getSnapshot();

    // Skip to the specified position
    appendSkipChars(op, snapshot, docPos, pos);

    // Append the text
    append(op, {i: text});
    appendSkipChars(op, snapshot, docPos);
    this.submitOp(op, callback);
    return op;
  },

  // Remove length of text at pos
  remove: function(pos, len, callback) {
    var op = [];
    var docPos = {index: 0, offset: 0};
    var snapshot = this.getSnapshot();

    // Skip to the position
    appendSkipChars(op, snapshot, docPos, pos);

    while (len > 0) {
      var part = takeDoc(snapshot, docPos, len, true);

      // We only need to delete actual characters. This should also be valid if
      // we deleted all the tombstones in the document here.
      if (typeof part === 'string') {
        append(op, {d: part.length});
        len -= part.length;
      } else {
        append(op, part);
      }
    }

    appendSkipChars(op, snapshot, docPos);
    this.submitOp(op, callback);
    return op;
  },

  _beforeOp: function() {
    // Its a shame we need this. This also currently relies on snapshots being
    // cloned during apply(). This is used in _onOp below to figure out what
    // text was _actually_ inserted and removed.
    //
    // Maybe instead we should do all the _onOp logic here and store the result
    // then play the events when _onOp is actually called or something.
    this.__prevSnapshot = this.getSnapshot();
  },

  _onOp: function(op) {
    var textPos = 0;
    var docPos = {index:0, offset:0};
    // The snapshot we get here is the document state _AFTER_ the specified op
    // has been applied. That means any deleted characters are now tombstones.
    var prevSnapshot = this.__prevSnapshot;

    for (var i = 0; i < op.length; i++) {
      var component = op[i];
      var part, remainder;

      if (typeof component == 'number') {
        // Skip
        for (remainder = component;
            remainder > 0;
            remainder -= part.length || part) {

          part = takeDoc(prevSnapshot, docPos, remainder);
          if (typeof part === 'string')
            textPos += part.length;
        }
      } else if (component.i != null) {
        // Insert
        if (typeof component.i == 'string') {
          // ... and its an insert of text, not insert of tombstones
          if (this.onInsert) this.onInsert(textPos, component.i);
          textPos += component.i.length;
        }
      } else {
        // Delete
        for (remainder = component.d;
            remainder > 0;
            remainder -= part.length || part) {

          part = takeDoc(prevSnapshot, docPos, remainder);
          if (typeof part == 'string' && this.onRemove)
            this.onRemove(textPos, part.length);
        }
      }
    }
  }
};

},{"ot-text-tp2":27}],81:[function(require,module,exports){
var qs = require('qs')
var parseUrl = require('url').parse
var resolveUrl = require('url').resolve
var router = require('./router')
var currentPath = window.location.pathname + window.location.search

// Replace the initial state with the current URL immediately,
// so that it will be rendered if the state is later popped
if (window.history.replaceState) {
  window.history.replaceState({
    $render: true,
    $method: 'get'
  }, null, window.location.href)
}

module.exports = History

function History(app, routes) {
  this.app = app
  this.routes = routes

  if (window.history.pushState) {
    addListeners(this)
    return
  }
  this.push = function(url) {
    window.location.assign(url)
  }
  this.replace = function(url) {
    window.location.replace(url)
  }
}

History.prototype.push = function(url, render, state, e) {
  this._update('pushState', url, render, state, e)
}

History.prototype.replace = function(url, render, state, e) {
  this._update('replaceState', url, render, state, e)
}

// Rerender the current url locally
History.prototype.refresh = function() {
  var path = routePath(window.location.href)
  // Note that we don't pass previous to avoid triggering transitions
  router.render(this, {url: path, method: 'get'})
}

History.prototype.back = function() {
  window.history.back()
}

History.prototype.forward = function() {
  window.history.forward()
}

History.prototype.go = function(i) {
  window.history.go(i)
}

History.prototype._update = function(historyMethod, relativeUrl, render, state, e) {
  var url = resolveUrl(window.location.href, relativeUrl)
  var path = routePath(url)

  // TODO: history.push should set the window.location with external urls
  if (!path) return
  if (render == null) render = true
  if (state == null) state = {}

  // Update the URL
  var options = renderOptions(e, path)
  state.$render = true
  state.$method = options.method
  window.history[historyMethod](state, null, options.url)
  currentPath = window.location.pathname + window.location.search
  if (render) router.render(this, options, e)
}

History.prototype.page = function() {
  var page = this.app.createPage()
  var history = this

  function redirect(url) {
    if (url === 'back') return history.back()
    // TODO: Add support for `basepath` option like Express
    if (url === 'home') url = '\\'
    history.replace(url, true)
  }

  page.redirect = redirect
  return page
}

// Get the pathname if it is on the same protocol and domain
function routePath(url) {
  var match = parseUrl(url)
  return match &&
    match.protocol === window.location.protocol &&
    match.host === window.location.host &&
    match.pathname + (match.search || '')
}

function renderOptions(e, path) {
  // If this is a form submission, extract the form data and
  // append it to the url for a get or params.body for a post
  if (e && e.type === 'submit') {
    var form = e.target
    var elements = form.elements
    var query = []
    for (var i = 0, len = elements.length, el; i < len; i++) {
      el = elements[i]
      var name = el.name
      if (!name) continue
      var value = el.value
      query.push(encodeURIComponent(name) + '=' + encodeURIComponent(value))
      if (name === '_method') {
        var override = value.toLowerCase()
        if (override === 'delete') override = 'del'
      }
    }
    query = query.join('&')
    if (form.method.toLowerCase() === 'post') {
      var method = override || 'post'
      var body = qs.parse(query)
    } else {
      method = 'get'
      path += '?' + query
    }
  } else {
    method = 'get'
  }
  return {
    method: method
  , url: path
  , previous: window.location.pathname + window.location.search
  , body: body
  , form: form
  , link: e && e._tracksLink
  }
}

function addListeners(history) {

  // Detect clicks on links
  function onClick(e) {
    var el = e.target

    // Ignore command click, control click, and non-left click
    if (e.metaKey || e.which !== 1) return

    // Ignore if already prevented
    if (e.defaultPrevented) return

    // Also look up for parent links (<a><img></a>)
    while (el) {
      var url = el.href
      if (url) {

        // Ignore if created by Tracks
        if (el.hasAttribute && el.hasAttribute('data-router-ignore')) return

        // Ignore links meant to open in a different window or frame
        if (el.target && el.target !== '_self') return

        // Ignore hash links to the same page
        var hashIndex = url.indexOf('#')
        if (~hashIndex && url.slice(0, hashIndex) === window.location.href.replace(/#.*/, '')) {
          return
        }

        e._tracksLink = el
        history.push(url, true, null, e)
        return
      }

      el = el.parentNode
    }
  }

  function onSubmit(e) {
    var target = e.target

    // Ignore if already prevented
    if (e.defaultPrevented) return

    // Only handle if emitted on a form element that isn't multipart
    if (target.tagName.toLowerCase() !== 'form') return
    if (target.enctype === 'multipart/form-data') return

    // Ignore if created by Tracks
    if (target.hasAttribute && target.hasAttribute('data-router-ignore')) return

    // Use the url from the form action, defaulting to the current url
    var url = target.action || window.location.href
    history.push(url, true, null, e)
  }

  function onPopState(e) {
    // HACK: Chrome sometimes does a pop state before the app is set up properly
    if (!history.app.page) return

    var previous = currentPath
    var state = e.state
    currentPath = window.location.pathname + window.location.search

    var options = {
      previous: previous
    , url: currentPath
    }

    if (state) {
      if (!state.$render) return
      options.method = state.$method
      // Note that the post body is only sent on the initial reqest
      // and it is empty if the state is later popped
      return router.render(history, options)
    }

    // The state object will be null for states created by jump links.
    // window.location.hash cannot be used, because it returns nothing
    // if the url ends in just a hash character
    var url = window.location.href
      , hashIndex = url.indexOf('#')
      , el, id
    if (~hashIndex && currentPath !== previous) {
      options.method = 'get'
      router.render(history, options)
      id = url.slice(hashIndex + 1)
      if (el = document.getElementById(id) || document.getElementsByName(id)[0]) {
        el.scrollIntoView()
      }
    }
  }

  document.addEventListener('click', onClick, true)
  document.addEventListener('submit', onSubmit, false)
  window.addEventListener('popstate', onPopState, true)
}

},{"./router":83,"qs":35,"url":43}],82:[function(require,module,exports){
var Route = require('../vendor/express/router/route')
var History = require('./History')
var router = module.exports = require('./router')

router.setup = setup

function setup(app) {
  var routes = {
    queue: {}
  , transitional: {}
  , app: app
  }
  app.history = new History(app, routes)

  ;['get', 'post', 'put', 'del', 'enter', 'exit'].forEach(function(method) {
    var queue = routes.queue[method] = []
    var transitional = routes.transitional[method] = []

    app[method] = function(pattern, callback) {
      if (Array.isArray(pattern)) {
        pattern.forEach(function(item) {
          app[method](item, callback)
        })
        return app
      }

      if (router.isTransitional(pattern)) {
        var from = pattern.from
        var to = pattern.to
        var forward = pattern.forward || (callback && callback.forward) || callback
        var back = pattern.back || (callback && callback.back)

        var fromRoute = new Route(method, from, back)
        var toRoute = new Route(method, to, forward)
        fromRoute.isTransitional = true
        toRoute.isTransitional = true
        transitional.push({
          from: fromRoute
        , to: toRoute
        })
        if (back) transitional.push({
          from: toRoute
        , to: fromRoute
        })

        return app
      }

      queue.push(new Route(method, pattern, callback))
      return app
    }
  })
}

},{"../vendor/express/router/route":84,"./History":81,"./router":83}],83:[function(require,module,exports){
var qs = require('qs')
var nodeUrl = require('url');

module.exports = {
  render: render
, isTransitional: isTransitional
, mapRoute: mapRoute
}

function isTransitional(pattern) {
  return pattern.hasOwnProperty('from') && pattern.hasOwnProperty('to')
}

function mapRoute(from, params) {
  var i = params.url.indexOf('?')
  var queryString = (~i) ? params.url.slice(i) : ''
  // If the route looks like /:a/:b?/:c/:d?
  // and :b and :d are missing, return /a/c
  // Thus, skip the / if the value is missing
  var i = 0
  var path = from.replace(/\/(?:(?:\:([^?\/:*(]+)(?:\([^)]+\))?)|\*)(\?)?/g, onMatch)
  function onMatch(match, key, optional) {
    var value = key ? params[key] : params[i++]
    return (optional && value == null) ? '' : '/' + encodeURIComponent(value)
  }
  return path + queryString
}

function render(history, options, e) {
  var req = new RenderReq(history.app.page, history.routes, options, e)
  req.routeTransitional(0, function() {
    req.page = history.page()
    req.routeQueue(0, function() {
      // Cancel rendering by this app if no routes match
      req.cancel()
    })
  })
}

function RenderReq(page, routes, options, e) {
  this.page = page
  this.options = options
  this.e = e
  this.setUrl(options.url.replace(/#.*/, ''))
  var queryString = nodeUrl.parse(this.url).query;
  this.query = queryString ? qs.parse(queryString) : {}
  this.method = options.method
  this.body = options.body || {}
  this.setPrevious(options.previous)
  this.transitional = routes.transitional[this.method]
  this.queue = routes.queue[this.method]
  this.app = routes.app
}

RenderReq.prototype.cancel = function() {
  var options = this.options
  // Don't do anything if this is the result of an event, since the
  // appropriate action will happen by default
  if (this.e || options.noNavigate) return
  // Otherwise, manually perform appropriate action
  if (options.form) {
    options.form.setAttribute('data-router-ignore', '')
    options.form.submit()
  } else {
    window.location.assign(options.url)
  }
}

RenderReq.prototype.setUrl = function(url) {
  this.url = url
  this.path = url.replace(/\?.*/, '')
}
RenderReq.prototype.setPrevious = function(previous) {
  this.previous = previous
  this.previousPath = previous && previous.replace(/\?.*/, '')
}

RenderReq.prototype.routeTransitional = function(i, next) {
  i || (i = 0)
  var item
  while (item = this.transitional[i++]) {
    if (!item.to.match(this.path) || !item.from.match(this.previousPath)) continue
    var req = this
    var params = this.routeParams(item.to)
    // Even though we don't need to do anything after a done, pass a
    // no op function, so that routes can expect it to be defined
    function done() {}
    this.onMatch(item.to, params, function(err) {
      if (err) return req.cancel()
      req.routeTransitional(i, next)
    }, done)
    return
  }
  next()
}

RenderReq.prototype.routeQueue = function(i, next) {
  i || (i = 0)
  var route
  while (route = this.queue[i++]) {
    if (!route.match(this.path)) continue
    var req = this
    var params = this.routeParams(route)
    this.onMatch(route, params, function(err) {
      if (err) return req.cancel()
      req.routeQueue(i, next)
    })
    return
  }
  next()
}

RenderReq.prototype.onMatch = function(route, params, next, done) {
  if (!this.page) return next()
  // Stop the default browser action, such as clicking a link or submitting a form
  if (this.e) {
    this.e.preventDefault()
    this.e = null
  }
  this.page.params = params
  if (route.isTransitional) {
    this.app.onRoute(route.callbacks, this.page, next, done)
  } else {
    this.app.onRoute(route.callbacks, this.page, next)
  }
}

RenderReq.prototype.routeParams = function(route) {
  var routeParams = route.params
  var params = routeParams.slice()

  for (var key in routeParams) {
    params[key] = routeParams[key]
  }
  params.previous = this.previous
  params.url = this.url
  params.body = this.body
  params.query = this.query
  params.method = this.method
  return params
}

},{"qs":35,"url":43}],84:[function(require,module,exports){

/**
 * Module dependencies.
 */

var utils = require('../utils');

/**
 * Expose `Route`.
 */

module.exports = Route;

/**
 * Initialize `Route` with the given HTTP `method`, `path`,
 * and an array of `callbacks` and `options`.
 *
 * Options:
 *
 *   - `sensitive`    enable case-sensitive routes
 *   - `strict`       enable strict matching for trailing slashes
 *
 * @param {String} method
 * @param {String} path
 * @param {Array} callbacks
 * @param {Object} options.
 * @api private
 */

function Route(method, path, callbacks, options) {
  options = options || {};
  this.path = path;
  this.method = method;
  this.callbacks = callbacks;
  this.regexp = utils.pathRegexp(path
    , this.keys = []
    , options.sensitive
    , options.strict);
}

/**
 * Check if this route matches `path`, if so
 * populate `.params`.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

Route.prototype.match = function(path){
  var keys = this.keys
    , params = this.params = []
    , m = this.regexp.exec(path);

  if (!m) return false;

  for (var i = 1, len = m.length; i < len; ++i) {
    var key = keys[i - 1];

    var val = 'string' == typeof m[i]
      ? decodeURIComponent(m[i])
      : m[i];

    if (key) {
      params[key.name] = val;
    } else {
      params.push(val);
    }
  }

  return true;
};

},{"../utils":85}],85:[function(require,module,exports){

/**
 * Module dependencies.
 */

/**
 * toString ref.
 */

var toString = {}.toString;

/**
 * Return ETag for `body`.
 *
 * @param {String|Buffer} body
 * @return {String}
 * @api private
 */

exports.etag = function(body){
  return '"' + crc32.signed(body) + '"';
};

/**
 * Make `locals()` bound to the given `obj`.
 *
 * This is used for `app.locals` and `res.locals`.
 *
 * @param {Object} obj
 * @return {Function}
 * @api private
 */

exports.locals = function(obj){
  function locals(obj){
    for (var key in obj) locals[key] = obj[key];
    return obj;
  };

  return locals;
};

/**
 * Check if `path` looks absolute.
 *
 * @param {String} path
 * @return {Boolean}
 * @api private
 */

exports.isAbsolute = function(path){
  if ('/' == path[0]) return true;
  if (':' == path[1] && '\\' == path[2]) return true;
};

/**
 * Flatten the given `arr`.
 *
 * @param {Array} arr
 * @return {Array}
 * @api private
 */

exports.flatten = function(arr, ret){
  var ret = ret || []
    , len = arr.length;
  for (var i = 0; i < len; ++i) {
    if (Array.isArray(arr[i])) {
      exports.flatten(arr[i], ret);
    } else {
      ret.push(arr[i]);
    }
  }
  return ret;
};

/**
 * Normalize the given `type`, for example "html" becomes "text/html".
 *
 * @param {String} type
 * @return {Object}
 * @api private
 */

exports.normalizeType = function(type){
  return ~type.indexOf('/')
    ? acceptParams(type)
    : { value: mime.lookup(type), params: {} };
};

/**
 * Normalize `types`, for example "html" becomes "text/html".
 *
 * @param {Array} types
 * @return {Array}
 * @api private
 */

exports.normalizeTypes = function(types){
  var ret = [];

  for (var i = 0; i < types.length; ++i) {
    ret.push(exports.normalizeType(types[i]));
  }

  return ret;
};

/**
 * Return the acceptable type in `types`, if any.
 *
 * @param {Array} types
 * @param {String} str
 * @return {String}
 * @api private
 */

exports.acceptsArray = function(types, str){
  // accept anything when Accept is not present
  if (!str) return types[0];

  // parse
  var accepted = exports.parseAccept(str)
    , normalized = exports.normalizeTypes(types)
    , len = accepted.length;

  for (var i = 0; i < len; ++i) {
    for (var j = 0, jlen = types.length; j < jlen; ++j) {
      if (exports.accept(normalized[j], accepted[i])) {
        return types[j];
      }
    }
  }
};

/**
 * Check if `type(s)` are acceptable based on
 * the given `str`.
 *
 * @param {String|Array} type(s)
 * @param {String} str
 * @return {Boolean|String}
 * @api private
 */

exports.accepts = function(type, str){
  if ('string' == typeof type) type = type.split(/ *, */);
  return exports.acceptsArray(type, str);
};

/**
 * Check if `type` array is acceptable for `other`.
 *
 * @param {Object} type
 * @param {Object} other
 * @return {Boolean}
 * @api private
 */

exports.accept = function(type, other){
  var t = type.value.split('/');
  return (t[0] == other.type || '*' == other.type)
    && (t[1] == other.subtype || '*' == other.subtype)
    && paramsEqual(type.params, other.params);
};

/**
 * Check if accept params are equal.
 *
 * @param {Object} a
 * @param {Object} b
 * @return {Boolean}
 * @api private
 */

function paramsEqual(a, b){
  return !Object.keys(a).some(function(k) {
    return a[k] != b[k];
  });
}

/**
 * Parse accept `str`, returning
 * an array objects containing
 * `.type` and `.subtype` along
 * with the values provided by
 * `parseQuality()`.
 *
 * @param {Type} name
 * @return {Type}
 * @api private
 */

exports.parseAccept = function(str){
  return exports
    .parseParams(str)
    .map(function(obj){
      var parts = obj.value.split('/');
      obj.type = parts[0];
      obj.subtype = parts[1];
      return obj;
    });
};

/**
 * Parse quality `str`, returning an
 * array of objects with `.value`,
 * `.quality` and optional `.params`
 *
 * @param {String} str
 * @return {Array}
 * @api private
 */

exports.parseParams = function(str){
  return str
    .split(/ *, */)
    .map(acceptParams)
    .filter(function(obj){
      return obj.quality;
    })
    .sort(function(a, b){
      if (a.quality === b.quality) {
        return a.originalIndex - b.originalIndex;
      } else {
        return b.quality - a.quality;
      }
    });
};

/**
 * Parse accept params `str` returning an
 * object with `.value`, `.quality` and `.params`.
 * also includes `.originalIndex` for stable sorting
 *
 * @param {String} str
 * @return {Object}
 * @api private
 */

function acceptParams(str, index) {
  var parts = str.split(/ *; */);
  var ret = { value: parts[0], quality: 1, params: {}, originalIndex: index };

  for (var i = 1; i < parts.length; ++i) {
    var pms = parts[i].split(/ *= */);
    if ('q' == pms[0]) {
      ret.quality = parseFloat(pms[1]);
    } else {
      ret.params[pms[0]] = pms[1];
    }
  }

  return ret;
}

/**
 * Escape special characters in the given string of html.
 *
 * @param  {String} html
 * @return {String}
 * @api private
 */

exports.escape = function(html) {
  return String(html)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Normalize the given path string,
 * returning a regular expression.
 *
 * An empty array should be passed,
 * which will contain the placeholder
 * key names. For example "/user/:id" will
 * then contain ["id"].
 *
 * @param  {String|RegExp|Array} path
 * @param  {Array} keys
 * @param  {Boolean} sensitive
 * @param  {Boolean} strict
 * @return {RegExp}
 * @api private
 */

exports.pathRegexp = function(path, keys, sensitive, strict) {
  if (toString.call(path) == '[object RegExp]') return path;
  if (Array.isArray(path)) path = '(' + path.join('|') + ')';
  path = path
    .concat(strict ? '' : '/?')
    .replace(/\/\(/g, '(?:/')
    .replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?(\*)?/g, function(_, slash, format, key, capture, optional, star){
      keys.push({ name: key, optional: !! optional });
      slash = slash || '';
      return ''
        + (optional ? '' : slash)
        + '(?:'
        + (optional ? slash : '')
        + (format || '') + (capture || (format && '([^/.]+?)' || '([^/]+?)')) + ')'
        + (optional || '')
        + (star ? '(/*)?' : '');
    })
    .replace(/([\/.])/g, '\\$1')
    .replace(/\*/g, '(.*)');
  return new RegExp('^' + path + '$', sensitive ? '' : 'i');
}

},{}],86:[function(require,module,exports){
(function (global){

var rng;

if (global.crypto && crypto.getRandomValues) {
  // WHATWG crypto-based RNG - http://wiki.whatwg.org/wiki/Crypto
  // Moderately fast, high quality
  var _rnds8 = new Uint8Array(16);
  rng = function whatwgRNG() {
    crypto.getRandomValues(_rnds8);
    return _rnds8;
  };
}

if (!rng) {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var  _rnds = new Array(16);
  rng = function() {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      _rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return _rnds;
  };
}

module.exports = rng;


}).call(this,typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],87:[function(require,module,exports){
//     uuid.js
//
//     Copyright (c) 2010-2012 Robert Kieffer
//     MIT License - http://opensource.org/licenses/mit-license.php

// Unique ID creation requires a high quality random # generator.  We feature
// detect to determine the best RNG source, normalizing to a function that
// returns 128-bits of randomness, since that's what's usually required
var _rng = require('./rng');

// Maps for number <-> hex string conversion
var _byteToHex = [];
var _hexToByte = {};
for (var i = 0; i < 256; i++) {
  _byteToHex[i] = (i + 0x100).toString(16).substr(1);
  _hexToByte[_byteToHex[i]] = i;
}

// **`parse()` - Parse a UUID into it's component bytes**
function parse(s, buf, offset) {
  var i = (buf && offset) || 0, ii = 0;

  buf = buf || [];
  s.toLowerCase().replace(/[0-9a-f]{2}/g, function(oct) {
    if (ii < 16) { // Don't overflow!
      buf[i + ii++] = _hexToByte[oct];
    }
  });

  // Zero out remaining bytes if string was short
  while (ii < 16) {
    buf[i + ii++] = 0;
  }

  return buf;
}

// **`unparse()` - Convert UUID byte array (ala parse()) into a string**
function unparse(buf, offset) {
  var i = offset || 0, bth = _byteToHex;
  return  bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]];
}

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html

// random #'s we need to init node and clockseq
var _seedBytes = _rng();

// Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
var _nodeId = [
  _seedBytes[0] | 0x01,
  _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]
];

// Per 4.2.2, randomize (14 bit) clockseq
var _clockseq = (_seedBytes[6] << 8 | _seedBytes[7]) & 0x3fff;

// Previous uuid creation time
var _lastMSecs = 0, _lastNSecs = 0;

// See https://github.com/broofa/node-uuid for API details
function v1(options, buf, offset) {
  var i = buf && offset || 0;
  var b = buf || [];

  options = options || {};

  var clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;

  // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
  var msecs = options.msecs !== undefined ? options.msecs : new Date().getTime();

  // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock
  var nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;

  // Time since last uuid creation (in msecs)
  var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

  // Per 4.2.1.2, Bump clockseq on clock regression
  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  }

  // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  }

  // Per 4.2.1.2 Throw error if too many uuids are requested
  if (nsecs >= 10000) {
    throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;

  // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
  msecs += 12219292800000;

  // `time_low`
  var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff;

  // `time_mid`
  var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff;

  // `time_high_and_version`
  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
  b[i++] = tmh >>> 16 & 0xff;

  // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
  b[i++] = clockseq >>> 8 | 0x80;

  // `clock_seq_low`
  b[i++] = clockseq & 0xff;

  // `node`
  var node = options.node || _nodeId;
  for (var n = 0; n < 6; n++) {
    b[i + n] = node[n];
  }

  return buf ? buf : unparse(b);
}

// **`v4()` - Generate random UUID**

// See https://github.com/broofa/node-uuid for API details
function v4(options, buf, offset) {
  // Deprecated - 'format' argument, as supported in v1.2
  var i = buf && offset || 0;

  if (typeof(options) == 'string') {
    buf = options == 'binary' ? new Array(16) : null;
    options = null;
  }
  options = options || {};

  var rnds = options.random || (options.rng || _rng)();

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    for (var ii = 0; ii < 16; ii++) {
      buf[i + ii] = rnds[ii];
    }
  }

  return buf || unparse(rnds);
}

// Export public API
var uuid = v4;
uuid.v1 = v1;
uuid.v4 = v4;
uuid.parse = parse;
uuid.unparse = unparse;

module.exports = uuid;

},{"./rng":86}],88:[function(require,module,exports){
/**
 * Created by durupina on 12/30/16.
 * Cytoscape functions for drawing causality graphs
 */

// LOCAL FUNCTIONS

/**
 * Codes edge types by color, line type etc.
 * @param edgeType
 * @returns {{color:'', linestyle:}}
 */
function attributeMap(edgeType){
    var attributes = {color: 'gray', lineStyle: 'solid'};

    switch(edgeType){
        case "controls-state-change-of":
            attributes["color"] = "coral";
            attributes["lineStyle"]= "dashed";
            break;
        case "controls-transport-of":
            attributes["color"] = "blue";
            break;
        case "controls-phosphorylation-of":
            attributes["color"] =  "teal";
            break;
        case "controls-expression-of":
            attributes["color"] =  "deeppink";
            break;
        case "catalysis-precedes":
            attributes["color"] =  "red";
            break;
        case "in-complex-with":
            attributes["color"] =  "steelblue";
            break;
        case "interacts-with":
            attributes["color"] =  "aquamarine";
            break;
        case "neighbor-of":
            attributes["color"] =  "lime";
            break;
        case "consumption-controled-by":
            attributes["color"] =  "yellow";
            break;
        case "controls-production-of":
            attributes["color"] =  "purple";
            break;
        case "controls-transport-of-chemical":
            attributes["color"] =  "cornflowerblue";
            break;
        case "chemical-affects":
            attributes["color"] =  "darkviolet";
            break;
        case "reacts-with":
            attributes["color"] =  "deepskyblue";
            break;
        case "used-to-produce":
            attributes["color"] =  "green";
            break;
        case "upregulates-expression":
            attributes["lineStyle"]= "dashed";
            attributes["color"] =  "green";
            break;
        case "downregulates-expression":
            attributes["lineStyle"]= "dashed";
            attributes["color"] =  "red";
            break;
        case "phosphorylates":
            attributes["color"] =  "green";
            break;
        case "dephosphorylates":
            attributes["color"] =  "red";
            break;
        default:
            attributes["color"] =  'gray';
            break;
    }

    return attributes;
}


/***
 * Distribute sites around the node evenly
 */
function computeSitePositions(node){

    if(node.data("sites")) {
        var siteLength = node.data("sites").length;

        for (var i = 0; i < siteLength; i++) {
            var site = node.data("sites")[i];
            var paddingCoef = 0.9 ;

            var centerX = node.position("x");
            var centerY = node.position("y");
            var width = node.width() * paddingCoef;
            var height = node.height();
            var siteCenterX;
            var siteCenterY;

            var siteWidth = 15;
            var siteHeight = 15;

            //Draw sites at the top of the node
            if(i % 2 == 0){
                siteCenterX = centerX - width / 2 + siteWidth / 2  + width * i /siteLength ;
                siteCenterY = centerY - height /  2;

            }
            else{ //Draw sites at the bottom of the node
                siteCenterX = centerX - width / 2 + siteWidth / 2  + width * (i - 1) /siteLength ;
                siteCenterY = centerY + height /  2;

            }

            //extend site information
            node.data("sites")[i].bbox = {'x': siteCenterX, 'y': siteCenterY, 'w': siteWidth, 'h': siteHeight};

            //hack to update the bounding boxes of sites in the viewport
            node.select();
            node.unselect();
        }

    }
}



/***
 * Find the site that the user clicked and set it as selected
 * @param pos : mouse position
 * @param node : selected node
 * @returns selected site
 */
function selectAndReturnSite(pos,  node){

    if(!node.data("sites"))
        return null;

    for(var i = 0; i < node.data("sites").length; i++){
        var site = node.data("sites")[i];
        if(pos.x >= (site.bbox.x - site.bbox.w/2) && pos.x <= (site.bbox.x + site.bbox.w/2) &&
            pos.y >= (site.bbox.y - site.bbox.h/2) && pos.y <= (site.bbox.y + site.bbox.h/2)){
            site.selected = true;
            return site;
        }
    }
    return null;
}

/***
 * Unselect all sites of a node
 * @param node
 */
function unselectAllSites(node) {
    if (!node.data("sites"))
        return;

    node.data("sites").forEach(function(site){
        site.selected = false;
    });
}




/***
 * @param modelCy: Cy elements stored in the model as json objects
 * @param doTopologyGrouping
 * @returns model cy elements converted into cytoscape format with edge ids added
 */
module.exports.convertModelJsonToCyElements = function(modelCy, doTopologyGrouping){


    var nodes = [];
    var edges = [];

    for(var obj in modelCy.nodes){
        var node = modelCy.nodes[obj]
            var nodeClone = _.clone(node);
            nodes.push(nodeClone);
    };



    for(var obj in modelCy.edges){
        var edge = modelCy.edges[obj];
        var newEdge = _.clone(edge);
        //need to set this explicitly otherwise cytoscape gives a random id
        var id = edge.data.source + "-" + edge.data.target;
        newEdge.data.id = id;
        edges.push(newEdge);
    };

    var cyElements = {nodes: nodes, edges: edges};


    if(doTopologyGrouping)
        return groupTopology(cyElements);
    else
        return cyElements;

}

module.exports.runLayout = function(){
    var options =  {
        animate: false,
        fit: true,
        randomize: false,
        nodeRepulsion: 4500,
        idealEdgeLength: 50,
        edgeElasticity: 0.45,
        nestingFactor: 0.1,
        gravity: 0.25,
        numIter: 5000,
        tile: true,
        tilingPaddingVertical: 5,
        tilingPaddingHorizontal: 5,
        name: 'cose-bilkent'

    };
    cy.layout(options);


}

module.exports.createContainer = function(el, doTopologyGrouping, modelManager, callback) {

    var modelCy = modelManager.getModelCy();

    var cyElements = module.exports.convertModelJsonToCyElements(modelCy, doTopologyGrouping);


    var cy = window.cy = cytoscape({
        container: el,

        boxSelectionEnabled: true,
        autounselectify: false,


        layout: {
            animate: false,
            fit: true,
            randomize: false,
            nodeRepulsion: 4500,
            idealEdgeLength: 50,
            edgeElasticity: 0.45,
            nestingFactor: 0.1,
            gravity: 0.25,
            numIter: 5000,
            tile: true,
            tilingPaddingVertical: 5,
            tilingPaddingHorizontal: 5,
            name: 'cose-bilkent'

        },

        style: CgfStyleSheet,

        elements: cyElements,

        ready: function () {


            cy.on('layoutstop', function() {
                cy.nodes().forEach(function (node) {
                    computeSitePositions(node);
                });
            });


            if(callback) callback();

            cy.on('drag', 'node', function (e) {
                computeSitePositions(this);
            });

            cy.on('select', 'node', function(e){
                this.css('background-color', '#FFCC66');

            });

            cy.on('unselect', 'node', function(e){
                //get original background color
                var backgroundColor = modelManager.getModelNodeAttribute(this.id(), 'css.backgroundColor');
                if(!backgroundColor)
                    backgroundColor = 'white';
                this.css('background-color', backgroundColor);
                unselectAllSites(this);
            });

            cy.on('tap', 'node', function(e) {

                var site = selectAndReturnSite(e.cyPosition, e.cyTarget);

                if(!site){ //node is clicked
                    if(this.data('tooltipText')) { //there is content to show
                        cy.$(('#' + this.id())).qtip({
                            content: {
                                text: function (event, api) {
                                    return this.data('tooltipText');
                                }
                            },
                            show: {
                                ready: true
                            },
                            position: {
                                my: 'center',
                                at: 'center',
                                adjust: {
                                    cyViewport: true

                                },
                                effect: false
                            },
                            style: {
                                classes: 'qtip-bootstrap',
                                tip: {
                                    corner: false,
                                    width: 20,
                                    height: 20
                                }
                            }
                        });
                    }
                }
                else if (site.siteInfo) { //site is clicked and it has information to display
                    //Adjust the positions of qtip boxes
                    var sitePosX = site.bbox.x - this.position("x");
                    var sitePosY = site.bbox.y - this.position("y");

                    var my;
                    var at;

                    if (sitePosX < 0 && sitePosY < 0) {
                        my = "bottom right";
                        at = "top left";
                    }
                    else if (sitePosX < 0 && sitePosY >= 0) {
                        my = "bottom right";
                        at = "bottom left";
                    }
                    else if (sitePosX >= 0 && sitePosY >= 0) {
                        my = "bottom left";
                        at = "bottom right";
                    }
                    else if (sitePosX >= 0 && sitePosY < 0) {
                        my = "bottom left";
                        at = "top right";
                    }

                    cy.$(('#' + this.id())).qtip({
                        content: {
                            text: function (event, api) {
                                return site.siteInfo;
                            }
                        },
                        show: {
                            ready: true
                        },
                        position: {
                            my: my,
                            at: at,
                            adjust: {
                                cyViewport: true

                            },
                            effect: false
                        },
                        style: {
                            classes: 'qtip-bootstrap',
                            tip: {
                                corner: false,
                                width: 20,
                                height: 20
                            }
                        }
                    });
                }

            });

            cy.on('tapend', 'node', function(e){
                $('.qtip').remove();
            });


            cy.on('tapend', 'edge', function (e) {

                var edge = this;

                edge.qtip({
                    content: function () {
                        return "<b style='text-align:center;font-size:16px;'>" + edge.data("edgeType") + "</b>";
                    },
                    show: {
                        ready: true
                    },
                    position: {
                        my: 'top center',
                        at: 'bottom center',
                        adjust: {
                            cyViewport: true
                        }
                    },
                    style: {
                        classes: 'qtip-bootstrap',
                        tip: {
                            width: 16,
                            height: 8
                        }
                    }
                });
            });
        }


    });


}

/***
 * Style sheet for causality graphs
 */
var CgfStyleSheet = cytoscape.stylesheet()
        .selector('node')
        .css({
            // 'border-width':'css(border-width)',
            // 'border-color': 'css(border-color)',
            //  'background-color':'white',
            'shape': 'cgfNode',
            'text-halign': 'center',
            'text-valign':'center',
            'background-color': 'white',

            'width': function(ele){
                var spacing =(ele.data('id').length +2) * 10;
                return  Math.min(200,spacing);
            },
            'height':30,
            'content': 'data(text)',

        })
        .selector('node:selected')
        .css({
            'overlay-color': 'FFCC66',
            'opacity': 1
        })
        .selector('edge')
        .css({
            'width': 'css(width)',
            'line-color': function(ele){
                return attributeMap(ele.data('edgeType')).color;

            },
            'line-style': function(ele){
                return attributeMap(ele.data('edgeType')).lineStyle;
            },
            'curve-style': 'bezier',

            'target-arrow-color': function(ele){
                return attributeMap(ele.data('edgeType')).color;
            },
            'target-arrow-shape':'triangle',
            //     function(ele) {
            //     if (ele.data('edgeType') == "in-complex-with" || ele.data('edgeType') == "interacts-with" || //nondirected
            //         ele.data('edgeType') == "neighbor-of" || ele.data('edgeType') == "reacts-with")
            //         return 'none';
            //     return 'cgfArrow';
            // },
            'arrow-size':5,
            'opacity': 0.8
        })
        .selector('edge:selected')
        .css({
            'line-color': 'black',
            'target-arrow-color': 'black',
            'source-arrow-color': 'black',
            'opacity': 1
        })

        .selector("node:parent")
        .css({
            'text-valign': 'bottom',
            'content': 'data(edgeType)', //there is a label when there's a clique among the nodes inside the compound
            'font-size': 8,


        })
        .selector("node:child")
        .css({

            'padding-top': '10px',
            'padding-bottom': '10px',
            'padding-left': '10px',
            'padding-right': '10px',


        })
    ;

},{}],89:[function(require,module,exports){
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


},{}],90:[function(require,module,exports){
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
},{"qunitjs":42}],91:[function(require,module,exports){
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


            assert.equal(edge1._private.data.target, edge2._private.data.target, "edge1 and edge2 have the same target.");
            assert.equal(edge1._private.data.target, edge3._private.data.target, "edge1, edge2 and edge3 have the same target.");


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
},{"../public/src/cgf-visualizer/cgf-cy.js":88,"qunitjs":42}]},{},[44,1])


//# sourceMappingURL=/derby/cwc-12eb0fd0f9d8b630b28d6ad4673b6a1d.map.json