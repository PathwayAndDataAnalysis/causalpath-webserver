let fs = require('fs');
let junk = require('junk');
let express = require('express');
let http = express.Router();
let queue = require('queue');
let jobQueue = queue({ concurrency: 5, autostart: true });

const exec = require('child_process').exec;

let runCausalPathJar = function(dir){
   let cmd = "java -jar './jar/causalpath.jar' " + dir + " -ws";

   return new Promise((resolve, reject) => {
       let child = exec(cmd, (error, stdout, stderr) => {
           // console.log(stdout);
           // console.log("Causalpath.jar output");
           if(stderr)
               reject();
       });

       child.on('exit', function () {

           console.log("exited");

           resolve();
       });
   });

}

/***
 * Recursive function to run causalpath under all the directories containing parameters.txt
 * @param dirs: Array of paths containing parameters.txt . e.g.:[./users/durupina/causalpath/parameters.txt]
 * @param ind: index in the dirs array to run causalpath
 */
function runCausalPathForAll(dirs, ind){

   return new Promise((resolve, reject) => {
       if (ind < dirs.length) {
           let dir = dirs[ind].replace("parameters.txt", "");
           runCausalPathJar(dir).then(() => {
                 runCausalPathForAll(dirs, ind + 1);
                 resolve();
             }
           );
       }
       else
           resolve();
   });
}

/***
 * Calls cmdStr on console and runs callback function with parameter content
 * @param cmdStr
 * @param content
 * @param callback
 */
var executeCommandLineProcess = function (cmdStr, rejectEmpty){


    return new Promise( (resolve, reject) => {
        try {
            exec(cmdStr, function (error, stdout, stderr) {

                if (error !== null) {
                    let errorMsg =  error + "\n";
                    if(stderr)
                        errorMsg += stderr

                    reject(stdout);
                }
                else {
                    if ( rejectEmpty && !stdout ) {
                        reject();
                    }
                    resolve( stdout );
                }

            });
        }
        catch(error){
            console.log("Caught error " + error);
            reject(error);
        }
    } );
};


/***
 * Read the file to visualize and return its contents in callback
 * @param filePath : path+fileName
 */
 // TODO: anything specific to json?
var readJsonFile =  function(filePath){
    var fileContent = fs.readFileSync(filePath, 'utf-8');
    return fileContent;

};

var analyzeFiles = function(room) {

    let cmd2 = 'find ./analysisOut/' + room + '/ -name "parameters.txt"';
    let rejectEmpty = true;

    return executeCommandLineProcess( cmd2, rejectEmpty ).then( (data) => {
        let dirs = data.split("\n");
        console.log("Found parameters.txt as " + data);
        return runCausalPathForAll(dirs, 0).then(()=>{

            let cmd3 = 'find ./analysisOut/' + room + '/ -name "causative.json"'; //now find the analysis files
            return executeCommandLineProcess( cmd3, rejectEmpty ).then( (data2) => {
                console.log("Analysis is successful.");

                console.log(cmd3);
                console.log("In analysis zip found causative.json as " + data2);
                return data2;
            }, error => {
                console.log("Analysis error. No causative.json found.");
                throw "Analysis error. No causative.json found.";
            } );
        });
    }, error => {
        console.log("Analysis error. No parameters.txt found.");
        throw "Analysis error. No parameters.txt found.";
    } );
}

http.post('/calculateDemoFolderFilePaths', function ( req, res ) {
  let sendStatus500 = () => res.sendStatus( 500 );
  console.log("calculateDemoFolderFilePaths");
  var filePaths = [];
  var fillFilePaths = function(dirPath){
    fs.readdirSync( dirPath ).filter(junk.not).forEach( file => {
      var subPath = dirPath + '/' + file;
      if(fs.lstatSync(subPath).isDirectory()){
        fillFilePaths(subPath);
      } else {
        filePaths.push(subPath);
      }
    });
  }

  try {
      fillFilePaths( 'public/demo/samples' );
      res.status(200);
      res.send(filePaths);
  }
  catch(error){
      console.log(error);
      sendStatus500();
  }
});

http.post('/getJsonAtPath', function ( req, res ) {

    let { dir, room } = req.body;
    console.log("getJsonAtPath");

    let sendStatus500 = () => res.sendStatus( 500 );
    let sendStatus400 = () => res.sendStatus( 400 );

    try {
        if (!fs.existsSync(dir)){
            console.log("File does not exist " + dir);
            sendStatus400();
            res.send("File does not exist");
        }
        else{
            //Return the json file from the analysis directory to the client
            let fileContent = readJsonFile(dir);
            res.status(200);
            res.send(fileContent);
        }
    }
    catch (error) {
        sendStatus500();
    }
});

http.post('/downloadRequest', function( req, res ){
    let { room } = req.body;
    let sendStatus500 = () => res.sendStatus( 500 );
    let sendStatus400 = () => res.sendStatus( 400 );

    try {
        console.log("downloadRequest");
        executeCommandLineProcess("zip -r ./analysisOut/" + room + " ./analysisOut/" + room).then(function (data) {
            fs.readFile(('./analysisOut/' + room + '.zip'), function (err, fileContent) {
                  if (fileContent){
                      res.status(200);
                      res.send(fileContent.toString('base64'));
                  }
                  else{
                      sendStatus400();
                  }
            });
        }, sendStatus400);
    }
    catch(error){
        console.log(error);
        sendStatus500();
    }
});

//Client sends analysis files in a zip file
http.post('/analysisZip', function( req, res, next ){

    let { room, fileContent } = req.body;
    let sendStatus500 = () => res.sendStatus( 500 );
    try {
        console.log("analysisZip");
        console.log(room);

        new Promise(function (resolve, reject) {
            fs.writeFile(("./analysisOut/" + room + '.zip'), fileContent, 'binary', function (err) {
                if (err) {
                    console.log('File could not be saved.');
                    reject();
                } else {
                    console.log("File is saved.");
                    resolve("success");

                }
            });
        }).then((content) => {
            //Unzip file
            // let cmd1 = ("unzip -j ./analysisOut/" + room + '.zip ' + " -d ./analysisOut/" + room );
            let cmd = ("unzip -o ./analysisOut/" + room + '.zip ' + " -d ./analysisOut/" + room);
            return executeCommandLineProcess( cmd ).then( function (data) {
                console.log("Unzip is successful.");
                jobQueue.push(function(){
                  return analyzeFiles(room).then( dirStr => {
                      res.status(200);
                      res.send(dirStr);
                  } ).catch( sendStatus500 );
                });
            }, sendStatus500 );
        }).catch( sendStatus500 );
    }
    catch(error){
        sendStatus500( res );
    }

});

//Client sends analysis files in an array
http.post('/analysisDir', function( req, res, next ){
    // console.log('req body is: ', req.body);
    let { room, inputFiles } = req.body;
    let sendStatus500 = () => res.sendStatus( 500 );
    // console.log('length: ', req.body.inputFiles.length);

    console.log("analysisDir");
    console.log(room);

    try{
        //get file and send it to the client for visualization
        var dir = ('./analysisOut/' + room);
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }


        var written = 0;
        //Make sure all the files are transferred from the socket
        let p1 = new Promise(function (resolve, reject) {

            for (var i = 0; i < inputFiles.length; i++) {

                (function (file) {

                    fs.writeFile(("./analysisOut/" + room + "/" + file.name), file.content, function (err) {
                        if (err) {
                            console.log(err);
                            reject("Error while writing content of the file " + file.name);
                        }
                        written++;
                        if (written >= inputFiles.length)
                            resolve("success");
                    });
                })(inputFiles[i]);
            }
        });

        p1.then(function (content) {
            jobQueue.push(function(){
              return analyzeFiles(room).then( dirStr => {
                  res.status(200);
                  res.send(dirStr);
              } )
              .catch( sendStatus500 );
            });
        }).catch( sendStatus500 );
    }
    catch(error) {
        sendStatus500();
    }
});

module.exports = http;
