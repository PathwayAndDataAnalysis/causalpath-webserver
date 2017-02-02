

module.exports.start = function(io, model, cancerDataOrganizer){
    var modelManagerList = [];
    var menuList = [];
    var userList = [];

    var request = require('request'); //REST call over http/https

    var responseHeaders = {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        "access-control-allow-headers": "content-type, accept",
        "access-control-max-age": 10,
        "Content-Type": "application/json"
    };



    // io.sockets.on('connection', function (socket) {
    //
    //     socket.on('error', function (error) {
    //         console.log(error);
    //         //  socket.destroy()
    //     });
    //
    //
    //
    //
    //
    //
    //     socket.on('subscribeHuman', function (data, callback) {
    //         socket.userId = data.userId;
    //         socket.room = data.room;
    //         socket.userName = data.userName;
    //         socket.subscribed = true;
    //
    //
    //         socket.join(data.room);
    //
    //         data.socketId = socket.id;
    //
    //         //do not subscribe human for now modelManagerList[data.userId] = (require('../public/sample-app/js/modelManager.js')(model, data.room, data.userId, data.userName));
    //
    //
    //         //if (userList.indexOf(data) < 0) //unique users only
    //         userList.push(data);
    //
    //
    //         callback(userList.filter(function (obj) {
    //             return(obj.room == socket.room);
    //         }));
    //
    //
    //
    //
    //
    //     });
    //
    //
    //
    //
    //     socket.on('disconnect', function() {
    //
    //
    //         socket.subscribed = false; //why isn't the socket removed
    //
    //
    //         for(var i =  userList.length -1 ; i >=0; i--){
    //             if(userList[i].userId == socket.userId && userList[i].room == socket.room){
    //                 userList.splice(i,1);
    //                 break;
    //             }
    //         }
    //
    //
    //         io.in(socket.room).emit('userList',  userList.filter(function (obj) {
    //             return(obj.room === socket.room);
    //         }));
    //     });
    //
    //
    //
    //     socket.on('HTTPRequest',  function( link, callback){
    //
    //         request({
    //             url: link, //URL to hit
    //             method: 'GET',
    //             headers: responseHeaders
    //             // form: params
    //
    //         }, function (error, response, body) {
    //
    //             if (error) {
    //
    //                 console.log(error);
    //             } else {
    //
    //
    //                 if(response.statusCode == 200) {
    //
    //                     if(callback) callback(body);
    //
    //                 }
    //             }
    //         });
    //     });
    //
    //
    //
    //
    //
    //
    //
    // });

}