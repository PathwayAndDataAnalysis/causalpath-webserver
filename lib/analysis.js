const fs = require('./fs-promisified');
const path = require('path');
const { findFileRecursively, zipContent, unzip, runCausalPathForAll } = require('./util');
let junk = require('junk');

var analyzeFiles = function(roomPath) {
    return findFileRecursively( roomPath, "parameters.txt" ).then( (data) => {
        let dirs = data.split("\n");
        console.log("Found parameters.txt as " + data);
        return runCausalPathForAll(dirs, 0).then(()=>{
            return findFileRecursively( roomPath, "causative.json" ).then( (data2) => {
                console.log("Analysis is successful.");

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

const calculateDemoFolderFilePaths = async (dirPath) => {
  var filePaths = [];
  var fillFilePaths = async function(dirPath){
    let files = await fs.readdirAsync(dirPath);
    files = files.filter(junk.not);
    for ( file of files ) {
      var subPath = dirPath + '/' + file;
      const stats = await fs.lstatAsync(subPath);
      if(stats.isDirectory()){
        await fillFilePaths(subPath);
      } else {
        filePaths.push(subPath);
      }
    }
  }

  await fillFilePaths( 'public/demo/samples' );
  return filePaths;
};

const downloadRequest = async (roomPath) => {
  await zipContent(roomPath);
  const fileContent = await fs.readFileAsync(zipPath);
  return fileContent;
};

const analysisZip = async (roomPath, fileContent) => {
  const zipPath = `${roomPath}.zip`;
  try{
    await fs.writeFileAsync(zipPath, fileContent, 'binary');
  }
  catch(error) {
    console.log('File could not be saved.');
    return null;
  }
  console.log("File is saved.");

  await unzip(zipPath, roomPath);
  console.log("Unzip is successful.");

  const dirStr = await analyzeFiles(roomPath);
  return dirStr;
};

const analysisDir = async (roomPath, inputFiles) => {
  for (file of inputFiles) {
    try {
      const filePath = path.join(roomPath, file.name);
      await fs.writeFileAsync(filePath, file.content);
    }
    catch(error) {
      console.log("Error while writing content of the file " + file.name);
      console.log(error);
      return null;
    }
  }

  const dirStr = await analyzeFiles(roomPath);
  return dirStr;
};

module.exports = {
  analyzeFiles,
  calculateDemoFolderFilePaths,
  downloadRequest,
  analysisZip,
  analysisDir
};
