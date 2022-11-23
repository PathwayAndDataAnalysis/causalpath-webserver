const exec = require('child_process').exec;

class Util {
  // TODO: IMPORTANT - Do this without running a command line process!
  static async findFileRecursively(dirPath, fileName) {
    let cmd = `find ${dirPath} -name "${fileName}"`;
    let rejectEmpty = true;

    return Util.executeCommandLineProcess( cmd, rejectEmpty );
  }

  // TODO: IMPORTANT - Do this without running a command line process!
  static async zipContent(path) {
    const zipPath = `${roomPath}.zip`;
    const zipCommand = `zip -r ${path}`;
    await Util.executeCommandLineProcess(zipCommand);
    return zipPath;
  }

  static async unzip(zipPath, exdir) {
    console.log('orig unzip')
    const unzipCmd = `unzip -o ${zipPath} -d ${exdir}`;
    await Util.executeCommandLineProcess(unzipCmd);
  }

  static async runCausalPathJar(dirPath, fileName) {
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

  static executeCommandLineProcess(cmdStr, rejectEmpty){
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
  }
}

module.exports = Util;
