let express = require('express');
let http = express.Router();
let queue = require('queue');
const promisifyAll = require('util-promisifyall');
const fs = promisifyAll(require('fs'));
const path = require('path');
const { calculateDemoFolderFilePaths, downloadRequest, analysisZip, analysisDir } = require('./analysis');
let jobQueue = queue({ concurrency: 5, autostart: true });

let sendStatus = ( statusCode, res, err ) => {
  if ( err ) {
    console.log( err );
  }

  res.sendStatus( statusCode );
};


/***
 * Read the file to visualize and return its contents in callback
 * @param filePath : path+fileName
 */
 // TODO: anything specific to json?
var readJsonFile =  async function(filePath){
    var fileContent = await fs.readFileAsync(filePath, 'utf-8');
    return fileContent;
};

http.post('/calculateDemoFolderFilePaths', async function ( req, res ) {
  let sendStatus500 = err => sendStatus( 500, res, err );

  try {
      let filePaths = await calculateDemoFolderFilePaths('public/demo/samples');
      res.status(200);
      res.send(filePaths);
  }
  catch(error){
      sendStatus500(error);
  }
});

http.post('/getJsonAtPath', async function ( req, res ) {
    // TODO: room is not used?
    let { dir, room } = req.body;
    console.log("getJsonAtPath");

    let sendStatus500 = err => sendStatus( 500, res, err );
    let sendStatus400 = err => sendStatus( 400, res, err );

    try {
        let exists = fs.existsAsync(dir);
        if (!exists){
            console.log("File does not exist " + dir);
            sendStatus400();
            res.send("File does not exist");
        }
        else{
            //Return the json file from the analysis directory to the client
            let fileContent = await readJsonFile(dir);
            res.status(200);
            res.send(fileContent);
        }
    }
    catch (error) {
        sendStatus500();
    }
});

http.post('/downloadRequest', async function( req, res ){

    // TODO: find out a more optimal timeout?
    res.setTimeout(500000);

    let { room } = req.body;
    let sendStatus500 = err => sendStatus( 500, res, err );
    let sendStatus400 = err => sendStatus( 400, res, err );

    const roomPath = path.join('analysisOut', room);
    const fileContent = await downloadRequest(roomPath);

    try {
        console.log("downloadRequest");
        if ( fileContent ) {
          res.status(200);
          res.send(fileContent.toString('base64'));
        }
        else {
          console.log('cannot read zip file content for: ', room);
          sendStatus400();
        }
    }
    catch(error){
        console.log(error);
        sendStatus500();
    }
});

//Client sends analysis files in a zip file
http.post('/analysisZip', function( req, res, next ){

    // TODO: find out a more optimal timeout?
    res.setTimeout(500000);

    let { room, fileContent } = req.body;
    let sendStatus500 = err => sendStatus( 500, res, err );
    try {
        console.log("analysisZip");
        console.log(room);

        const roomPath = path.join('analysisOut', `${room}`);
        jobQueue.push(function(){
          return analysisZip(roomPath, fileContent).then( dirStr => {
              res.status(200);
              res.send(dirStr);
          } ).catch( sendStatus500 );
        });
    }
    catch(error){
        sendStatus500( error );
    }

});

//Client sends analysis files in an array
http.post('/analysisDir', async function( req, res, next ){

    // TODO: find out a more optimal timeout?
    res.setTimeout(1000000);

    // console.log('req body is: ', req.body);
    let { room, inputFiles } = req.body;
    let sendStatus500 = err => sendStatus( 500, res, err );
    // console.log('length: ', req.body.inputFiles.length);

    console.log("analysisDir");
    console.log(room);

    try{
        //get file and send it to the client for visualization
        var roomPath = path.join('analysisOut', room);
        let exists = await fs.existsAsync(roomPath)
        if (!exists){
            await fs.mkdirAsync(roomPath);
        }

        jobQueue.push(function(){
          return analysisDir(roomPath, inputFiles).then( dirStr => {
              res.status(200);
              res.send(dirStr);
          } )
          .catch( sendStatus500 );
        });
    }
    catch(error) {
        sendStatus500(error);
    }
});

module.exports = http;
