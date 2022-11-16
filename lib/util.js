const exec = require('child_process').exec;

// TODO: IMPORTANT - Do this without running a command line process!
const findFileRecursively = async function(dirPath, fileName) {
  let cmd = `find ${dirPath} -name "${fileName}"`;
  let rejectEmpty = true;

  return executeCommandLineProcess( cmd, rejectEmpty );
};

// TODO: IMPORTANT - Do this without running a command line process!
const zipContent = async function(path) {
  const zipPath = `${roomPath}.zip`;
  const zipCommand = `zip -r ${path}`;
  await executeCommandLineProcess(zipCommand);
  return zipPath;
};

// TODO: IMPORTANT - Do this without running a command line process!
const unzip = async function(zipPath, exdir) {
  const unzipCmd = `unzip -o ${zipPath} -d ${exdir}`;
  await executeCommandLineProcess(unzipCmd);
}

const runCausalPathJar = function(dir){
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
const runCausalPathForAll = function(dirs, ind){

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
const executeCommandLineProcess = function (cmdStr, rejectEmpty){


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

module.exports = {
  findFileRecursively,
  zipContent,
  unzip,
  runCausalPathJar,
  runCausalPathForAll,
  executeCommandLineProcess
};
