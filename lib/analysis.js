const fs = require('./fs-promisified');
const path = require('path');
const Util = require('./util');
let junk = require('junk');

class Analysis {
  static analyzeFiles(roomPath) {
    return findFileRecursively( roomPath, "parameters.txt" ).then( (data) => {
        let dirs = data.split("\n");
        console.log("Found parameters.txt as " + data);
        return Util.runCausalPathForAll(dirs, 0).then(()=>{
            return Util.findFileRecursively( roomPath, "causative.json" ).then( (data2) => {
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

  static async calculateFilePaths(dirPath) {
    var filePaths = [];
    var fillFilePaths = async function(dirPath){
      let files = await fs.readdirAsync(dirPath);
      files = files.filter(junk.not);
      for ( const file of files ) {
        var subPath = path.join(dirPath, file);
        const stats = await fs.lstatAsync(subPath);
        if(stats.isDirectory()){
          await fillFilePaths(subPath);
        } else {
          filePaths.push(subPath);
        }
      }
    }

    await fillFilePaths(dirPath);
    return filePaths;
  }

  static async downloadRequest(roomPath) {
    await Util.zipContent(roomPath);
    const zipPath = `${roomPath}.zip`;
    const fileContent = await fs.readFileAsync(zipPath);
    return fileContent;
  }

  static async analysisZip(roomPath, fileContent) {
    const zipPath = `${roomPath}.zip`;
    try{
      await fs.writeFileAsync(zipPath, fileContent, 'binary');
    }
    catch(error) {
      console.log('File could not be saved.');
      return null;
    }
    console.log("File is saved.");

    await Util.unzip(zipPath, roomPath);
    console.log("Unzip is successful.");

    const dirStr = await this.analyzeFiles(roomPath);
    return dirStr;
  }

  static async analysisDir(roomPath, inputFiles) {
    for (const file of inputFiles) {
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

    const dirStr = await this.analyzeFiles(roomPath);
    return dirStr;
  }
}

module.exports = Analysis;
