const promisifyAll = require('util-promisifyall');
const fs = promisifyAll(require('fs'));
const exec = require('child_process').exec;
const path = require('path');
let junk = require('junk');

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

var analyzeFiles = function(roomPath) {
    let cmd2 = `find ${roomPath} -name "parameters.txt"`;
    let rejectEmpty = true;

    return executeCommandLineProcess( cmd2, rejectEmpty ).then( (data) => {
        let dirs = data.split("\n");
        console.log("Found parameters.txt as " + data);
        return runCausalPathForAll(dirs, 0).then(()=>{

            let cmd3 = `find ${roomPath} -name "causative.json"`; //now find the analysis files
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
  const zipCommand = `zip -r ${roomPath}`;
  const zipPath = `${roomPath}.zip`;
  const data = await executeCommandLineProcess(zipCommand);
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

  const unzipCmd = `unzip -o ${zipPath} -d ${roomPath}`;
  await executeCommandLineProcess(unzipCmd);
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
  runCausalPathJar,
  runCausalPathForAll,
  analyzeFiles,
  calculateDemoFolderFilePaths,
  downloadRequest,
  analysisZip,
  analysisDir
};
