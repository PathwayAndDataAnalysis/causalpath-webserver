'use strict';

module.exports.start = function(io,  model){

    const exec = require('child_process').exec;

   let runCausalPathJar = function(dir){
       let cmd = "java -jar './jar/causalpath.jar' " + dir;

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
    var executeCommandLineProcess = function (cmdStr, callback){

        try {

            exec(cmdStr, function (error, stdout, stderr) {
                console.log('stdout: ' + stdout);

                if (error !== null) {
                    let errorMsg =  error + "\n";
                    if(stderr)
                        errorMsg += stderr

                    if (callback) callback(errorMsg);

                    console.log('exec error: ' + errorMsg);
                }
                else {

                        if (callback) callback(stdout);

                }

            });
        }
        catch(error){
            console.log("Caught error " + error);

        }

    };


    /***
     * Read the file to visualize and return its contents in callback
     * @param filePath : path+fileName
     * @param callback
     */
    var readJsonFile =  function(filePath, callback ){

        try {
            var fs = require('fs');
            fs.readFile(filePath, 'utf-8', function (error, fileContent) {
                if (error) {
                    if (callback) callback("Error " + error)
                    console.log('exec error: ' + error);
                    return;
                }

                if (callback) {
                    callback(fileContent);
                }


            });
        }
        catch(error){
            if (callback) callback("Error " + error);
        }

    };

    var analyzeFiles = function(room, callback) {


        let cmd2 = 'find ./analysisOut/' + room + '/ -name "parameters.txt"';

        executeCommandLineProcess((cmd2),  (data) => {

            if (data && JSON.stringify(data).indexOf("Error") >= 0) { //data is only for error
                console.log("Cannot find");
                if (callback) callback("error");
            }
            else {

                let dirs = data.split("\n");
                console.log("Found parameters.txt as " + data);
                runCausalPathForAll(dirs, 0).then(()=>{

                    let cmd3 = 'find ./analysisOut/' + room + '/ -name "causative.json"'; //now find the analysis files
                    executeCommandLineProcess((cmd3), (data2) => {
                        if (data2 && JSON.stringify(data2).indexOf("Error") >= 0) { //data is only for error
                            console.log("Analysis error. No causative.json found.");
                            if (callback) callback("error");
                        } else {
                            console.log("Analysis is successful.");

                            console.log(cmd3);
                            console.log("In analysis zip found causative.json as " + data2);

                            if (callback)
                                callback(data2);

                        }
                    });


                });
            }
        });

    }





    //Listening to socket events
    io.sockets.on('connection', function (socket) {
        socket.on('error', function (error) {
            console.log(error);
            //  socket.destroy()
        });


        var fs =  require('fs');

        readJsonFile('./jar/parameter-info.json', function(content){
            socket.emit('parameterDescription', content);
        })


        socket.on('writeFileOnServerSide', function(room, fileContent, fileName, willExecute, callback){
            try {
                let fs = require('fs');

                console.log("writeFileOnServerSide");
                var dir = ('./analysisOut/' + room);
                if (!fs.existsSync(dir)){
                    fs.mkdirSync(dir);
                }

                fs.writeFile(("./analysisOut/" + room + '/' + fileName), fileContent, function (err) {
                    if (err) {
                        console.log('File could not be saved.');
                    }
                    else {
                        console.log("File is saved.");

                        if(willExecute) {
                            //Run java analysis command after all the input files are transferred
                            executeCommandLineProcess(("java -jar './jar/causalpath.jar' ./analysisOut/" + room), function (data) {

                                if(data && JSON.stringify(data).indexOf("Error")>=0){ //data is only for error
                                    if(callback) callback(data);
                                }
                                else {
                                    //Return the json file from the analysis directory to the client
                                    readJsonFile(('./analysisOut/' + room + '/causative.json'), callback);
                                }
                            });

                        }
                        else
                            if (callback) callback();
                    }
                });
            }
            catch(error){
                // if (callback) callback("Error " + error);
            }

        });


        //Client requests to download output files
        socket.on('downloadRequest', function(room, callback){
            try {
                console.log("downloadRequest");
                executeCommandLineProcess(("zip -r ./analysisOut/" + room + " ./analysisOut/" + room), function (data) {

                    if(data && JSON.stringify(data).indexOf("Error")>=0){ //data is only for error
                        if(callback) callback(data);
                    }
                    else {
                        fs.readFile(('./analysisOut/' + room + '.zip'), function (err, fileContent) {
                            if (callback) {
                                if (fileContent)
                                    callback(fileContent.toString('base64'));
                                else
                                    console.log("filecontent is empty");
                            }

                        });
                    }

                });
            }
            catch(error){
                // if(callback) callback("Error " + error);
            }
        });



        //Client sends analysis files in a zip file
        socket.on('analysisZip', function(fileContent, room, callback){
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

                    return new Promise((resolve, reject) => {
                        //Unzip file
                        // let cmd1 = ("unzip -j ./analysisOut/" + room + '.zip ' + " -d ./analysisOut/" + room );
                        let cmd = ("unzip -o ./analysisOut/" + room + '.zip ' + " -d ./analysisOut/" + room);


                        executeCommandLineProcess((cmd), function (data) {

                            if (data && JSON.stringify(data).indexOf("Error") >= 0) { //data is only for error
                                console.log("Cannot unzip");
                                reject();
                            } else {
                                console.log("Unzip is successful.");
                                resolve("success");
                            }
                        });
                    }).then((content) => {

                        analyzeFiles(room, callback);

                    });
                }), function (xhr, status, error) {

                    api.set('content.text', "Error retrieving data: " + error);
                    if(callback) callback("Error " + error);

                };
            }
            catch(error){
                // if(callback) callback("Error " + error);
            }

        });

        //Client sends analysis files in an array
        socket.on('analysisDir', function (inputFiles, room, callback) { //from computer agent

            console.log("analysisDir");
            console.log(room);


            try{
                //get file and send it to the client for visualization
                var fs = require('fs');
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
                                    reject("Error")
                                }
                                written++;
                                if (written >= inputFiles.length)
                                    resolve("success");
                            });
                        })(inputFiles[i]);
                    }
                });

                p1.then(function (content) {
                    analyzeFiles(room, callback);

                }), function (xhr, status, error) {

                    api.set('content.text', "Error retrieving data: " + error);
                    if(callback) callback("Error " + error);

                }
            }
            catch(error) {
                // if(callback) callback("Error " + error);
            }

        });

        socket.on('getJsonAtPath', function (dir, room, callback) {
            var fs = require('fs');

            console.log("getJsonAtPath");
            if (!fs.existsSync(dir)){
                console.log("File does not exist " + dir);
                callback("error");
                return;
            }
            else{
            //Return the json file from the analysis directory to the client
                readJsonFile((dir), callback);
            }
        });

    });

}


