var derby = require('derby');

exports.run = run;
var model;
var server;
var zlib = require('zlib');



function run(app, options, cb) {
  options || (options = {});
  var port = options.port || process.env.PORT || 3001 ;//| process.env.OPENSHIFT_NODEJS_PORT ;

  function listenCallback(err) {

    console.log('%d listening. Go to: http://localhost:%d/', process.pid, port);
    cb && cb(err);
  }


    function createServer() {
        var userList = [];


        if (typeof app === 'string') app = require(app);

        require('./server').setup(app, options, function (err, expressApp, upgrade, refModel) {
            model = refModel;



            //To set the time for the messages

            model.on('all', ('messages.*'), function (id, op, msg ) {

            if(msg.date < 0) {
                msgPath = model.at('messages.' + id);
                msgPath.set('date', +(new Date));
            }

            });



            if (err) throw err;
            server = require('http').createServer(expressApp);






             var io = require('socket.io').listen(server);
            var dl  = require('delivery');
            var fs = require('fs');

            server.on('upgrade', upgrade);
            server.listen(port, listenCallback);


            io.sockets.on('connection', function (socket) {

                socket.on('error', function (error) {
                    console.log(error);
                    //  socket.destroy()
                });



                var delivery = dl.listen(socket);

                socket.on('downloadRequest', function(room){


                    //zip all the files
                    var exec = require('child_process').exec;

                    var child;

                    //Zip analysis directory
                    child = exec(("zip -r ./analysisOut/" + room + " ./analysisOut/" + room),
                        function (error, stdout, stderr) {
                            console.log('stdout: ' + stdout);
                            if (stderr) {
                                console.log('stderr: ' + stderr);
                            }
                            if (error !== null) {
                                console.log('exec error: ' + error);

                                return;
                            }

                          //  delivery.on('delivery.connect', function (delivery) {
                                console.log("here");
                                delivery.send({
                                    name: 'results.zip',
                                    path: './analysisOut/' + room + '.zip'
                                });

                                delivery.on('send.success', function (file) {
                                    console.log('File successfully sent to client!');
                                });
                        //    });


                        });
                    });



                delivery.on('receive.success',function(file){

                    try {
                        var p1 = new Promise(function (resolve, reject) {
                            fs.writeFile(("./analysisOut/" + file.name), file.buffer, function (err) {
                                if (err) {
                                    console.log('File could not be saved.');
                                    reject();
                                } else {
                                    console.log("File is saved.");
                                    resolve("success");

                                }
                            });
                        });
                        p1.then(function (content) {

                            var exec = require('child_process').exec;
                            var child;



                            var room = file.params.room;
                            //Unzip file


                            var cmd1 = ("unzip -j ./analysisOut/" + file.name + " -d ./analysisOut/" + room );

                           // var cmd2 = "sleep 5"; //wait 5 seconds for unzipping
                            var cmd2 = "java -jar './jar/causalpath.jar' ./analysisOut/" +  room;
                            child = exec((cmd1+"\n " + cmd2 ),
                                    function (error, stdout, stderr) {
                                        console.log('stdout: ' + stdout);
                                        if (stderr) {
                                            console.log('stderr: ' + stderr);
                                        }
                                        if (error !== null) {
                                            console.log('exec error: ' + error);
                                            return;
                                        }


                                        //get file and send it to the client for visualization
                                        var fs2 = require('fs');
                                        fs2.readFile(('./analysisOut/' + room + '/causative.json'), 'utf-8', function (err, fileContent) {
                                            if (err) {
                                                console.log('exec error: ' + err);
                                                return;
                                            }

                                          //  console.log("file contents")
                                            socket.emit('analyzedFile', fileContent);

                                          //  if(callback) callback(fileContent);


                                        });
                                    });

                                child();

                            }), function (xhr, status, error) {
                                    api.set('content.text', "Error retrieving data: " + error);
                                }
                    }
                    catch(error){
                        console.log(error);
                    }
                });



                socket.on('analysisDir', function (data, room, callback) { //from computer agent


                 try{

                     //get file and send it to the client for visualization
                     var fs = require('fs');
                     var dir = ('./analysisOut/' + room);
                     if (!fs.existsSync(dir)){
                         fs.mkdirSync(dir);
                     }


                     fs.readFile(('./analysisOut/' + room + '/causative.json'), 'utf-8', function(err, content) {
                         if (err) {
                             console.log('exec error: ' + err);
                             return;
                         }
                         callback(content);
                     });


                    var written = 0;
                    var p1 = new Promise(function (resolve, reject) {

                                for (var i = 0; i < data.length; i++) {

                                    (function (file) {
                                        var fs = require('fs');
                                        fs.writeFile(("./analysisOut/" + room + "/" + file.name), file.content, function (err) {
                                            if (err) console.log(err);
                                            written++;
                                            if (written >= data.length)
                                                resolve("success");
                                        });
                                    })(data[i]);
                                }


                    });

                    p1.then(function (content) {

                        var exec = require('child_process').exec, child;


                        child = exec(("java -jar './jar/causalpath.jar' ./analysisOut/" + room),
                            function (error, stdout, stderr) {
                                console.log('stdout: ' + stdout);
                                if(stderr)
                                    console.log('stderr: ' + stderr);
                                if (error !== null) {
                                    console.log('exec error: ' + error);
                                }
                                //get file and send it to the client for visualization
                                var fs = require('fs');
                                fs.readFile(('./analysisOut/' + room + '/causative.json'), 'utf-8', function(err, content) {
                                    if (err) {
                                        console.log('exec error: ' + err);
                                        return;
                                    }
                                    callback(content);
                                });



                                // //send files to the client
                                // expressApp.all('*', function(req, res, next) {
                                //     next('404: ' + req.url);
                                // });

                            });
                        child();


                    }), function (xhr, status, error) {
                        api.set('content.text', "Error retrieving data: " + error);

                    }
                 }
                 catch(error) {
                     console.log(error);
                 }

                });


            });





        });


      return server;


  }

    derby.run(createServer);







}
