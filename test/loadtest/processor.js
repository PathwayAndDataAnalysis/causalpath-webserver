let fs = require('fs');
let { v4: uuid } = require('uuid');
let fetch = require('node-fetch');
let findit = require('findit');
let LineReaderSync = require("line-reader-sync")

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

function getAnalysisZipInput() {
  let fileContent = fs.readFileSync( '../input/analysis.zip', 'binary' );
  return fileContent;
}

let causalityFilePath = '../../public/demo/PNLL-causality-formatted.txt';
let parametersFilePath = '../../public/demo/parameters.txt';

// To be able to make the download request tests we need to have the enough number of analysis results
// first. Since some analysis may end earlier then the others it may cause the some download requests start
// much later earlier then some others. This may make us load testing much smaller number of download requests
// then we would rather.
// Therefore, I want to make sure that we start the all download requests at the time when all of the
// analysis requests are ended. This file will be used to observe if all of the analysis requests are completed.
// I tried a few other ways but none of them was feasible. Therefore, I had to use this workaround.
// let countFileName = './download_request_count.txt';

let analyzedRoomsFilePrefix = './analyzed_rooms';
let getAnalyzedRoomsFileName = env => analyzedRoomsFilePrefix + '_' + env + '.txt';

// if ( !fs.existsSync(countFileName) ) {
//   fs.writeFileSync(countFileName, '');
// }

['local', 'staging', 'production'].forEach( env => {
  let fname = getAnalyzedRoomsFileName( env );
  if ( !fs.existsSync(fname) ) {
    fs.writeFileSync(fname, '');
  }
} );


function readFile(filePath){
    var fileContent = fs.readFileSync(filePath, 'utf-8');
    return fileContent;
};

function makeAnalysisDirVars(requestParams, ctx, ee, next) {
  let fileNames = [ 'PNLL-causality-formatted.txt', 'parameters.txt' ];
  let inputFiles = fileNames.map( name => {
    let content = readFile( '../../public/demo/' + name );
    return { content, name };
  } );
  ctx.vars["inputFiles"] = inputFiles;
  ctx.vars["room"] = uuid();

  return next();
}

function makeGetJsonAtPathVars(requestParams, ctx, ee, next) {
  if ( process.env.USE_ANALYSIS_OUT == 'true' ) {
      let finder = findit('../../analysisOut');
      let paths = [];
      finder.on('file', function (file, stat) {
          if ( file.endsWith('causative.json') ) {
            paths.push(file);
          }
      });

      finder.on('end', function () {
        // TODO: Handle no path case?
        let i = getRandomInt( paths.length - 1 );
        ctx.vars["path"] = paths[ i ].replace('../../', './');
        next();
      });
  }
  else {
      let analyzedRoomsFileName = getAnalyzedRoomsFileName( ctx.vars.$environment );
      let lrs = new LineReaderSync(analyzedRoomsFileName);
      let paths = lrs.toLines();
      let i = getRandomInt( paths.length - 1 );
      ctx.vars["path"] = './analysisOut/' + paths[ i ] + '/causative.json';
      next();
  }
}

function makeAnalysisZipVars(requestParams, ctx, ee, next) {
  let fileContent = getAnalysisZipInput();
  ctx.vars["fileContent"] = fileContent;
  ctx.vars["room"] = uuid();

  return next();
}

// function makeDownloadRequestVars(requestParams, ctx, ee, next){
//   let interval = 5000;
//   var intervalID = setInterval( () => {
//     var fileContent = fs.readFileSync(countFileName);
//     // the expected length may change based on the number of requests
//     // TODO: may take the number of requests from the yml file as a parameter?
//     if ( fileContent.length == 1 ) {
//       return new Promise(resolve => setTimeout(resolve, interval)).then( () => {
//         if ( fs.existsSync(countFileName) ) {
//           fs.unlinkSync(countFileName);
//         }
//         clearInterval(intervalID);
//         next();
//       } );
//     }
//   }, interval );
//   let room = uuid();
//   ctx.vars["room"] = room;
//
//   let fileContent = getAnalysisZipInput();
//   let q = {
//     fileContent,
//     room
//   };
//
//   console.log('preparing for download request, called analysisZip for room ', room);
//   let makeRequest = () => fetch( ctx.vars.target + '/api/analysisZip', {
//       method: 'POST',
//       headers: {
//         'content-type': 'application/json'
//       },
//       body: JSON.stringify(q)
//   });
//
//   makeRequest().then( () => {
//     console.log('analysis is done for room ', room);
//     fs.appendFileSync(countFileName, '1');
//   } );
// }

// TODO: when analysis request is handled if analyzedRoomsFile does not have enough (20) lines alredy
// and the status code is 200 then append the analysed room to the file
// Possibly use it in loadtests for download request and get json at path (if file has enough content use it
// else use the existing methods)
function analysisResponseHandler(requestParams, response, context, ee, next) {
  if ( response.statusCode != 200 ) {
    next();
  }
  else {
    let analyzedRoomsFileName = getAnalyzedRoomsFileName( context.vars.$environment );
    let lrs = new LineReaderSync(analyzedRoomsFileName);
    let numOfLines = lrs.toLines().length;
    if ( numOfLines >= 20 ) {
      next();
    }
    else {
      let path = response.body.replace('./analysisOut/', '').replace('/causative.json', '');
      fs.appendFileSync(analyzedRoomsFileName, path);

      next();
    }
  }
}

module.exports = {
  makeAnalysisDirVars,
  makeAnalysisZipVars,
  // makeDownloadRequestVars,
  makeGetJsonAtPathVars,
  analysisResponseHandler
};
